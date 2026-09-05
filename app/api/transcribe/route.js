export const runtime = "nodejs";

// Turns a recorded meeting into text. The browser records audio locally
// (MediaRecorder) and uploads the file here as multipart form data —
// never as base64/JSON, which would inflate the payload ~33% for no
// reason on this leg. We only base64-encode it once, server-side, to
// satisfy Gemini's inline-audio request format.
//
// Same model and API key as app/api/ai/route.js. Gemini's Flash-tier
// models support audio input as of this writing — if that ever stops
// being true for this MODEL, Google's own error message comes back to
// the caller unchanged (see the !geminiRes.ok branch below), so this
// degrades to a clear error rather than a silent failure.

const MODEL = "gemini-3.1-flash-lite";

// Kept well under common serverless request-body ceilings (e.g.
// Vercel's Hobby-plan ~4.5MB limit) since the client sends raw bytes,
// not base64 — this cap IS effectively the audio size budget.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 45000; // transcription is slower than a text turn

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 6; // audio requests are heavier than text ones — a tighter budget
const rateLimitBuckets = new Map();

function checkRateLimit(key) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { windowStart: now, count: 1 });
    return { limited: false };
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart);
    return { limited: true, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }
  return { limited: false };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS).unref?.();

function getClientKey(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req) {
  try {
    const clientKey = getClientKey(req);
    const rateLimit = checkRateLimit(clientKey);
    if (rateLimit.limited) {
      return Response.json(
        {
          error: `You're sending requests too quickly. Please wait ${rateLimit.retryAfterSeconds}s and try again.`,
        },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    let formData;
    try {
      formData = await req.formData();
    } catch {
      return Response.json(
        { error: "Request must be multipart form data with an 'audio' field." },
        { status: 400 },
      );
    }

    const file = formData.get("audio");
    if (!file || typeof file === "string") {
      return Response.json({ error: "No audio file provided." }, { status: 400 });
    }
    if (file.size === 0) {
      return Response.json({ error: "That recording is empty." }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return Response.json(
        {
          error: `Recording is too large (max ${(MAX_AUDIO_BYTES / (1024 * 1024)).toFixed(1)}MB) — try a shorter recording.`,
        },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error:
            "Server is missing GEMINI_API_KEY. Add it to .env.local (local) or your host's environment variables (production).",
        },
        { status: 500 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "audio/webm";

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Transcribe this audio recording of a workplace meeting as plain text, as accurately as possible. Break it into paragraphs at natural pauses or speaker changes. Don't guess or invent speaker names unless one is clearly stated aloud — use 'Speaker 1', 'Speaker 2', etc. if you can distinguish voices but not names. Output only the transcript, no commentary or summary.",
            },
            { inline_data: { mime_type: mimeType, data: base64Audio } },
          ],
        },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let geminiRes;
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        },
      );
    } catch (err) {
      if (err.name === "AbortError") {
        return Response.json(
          { error: "Transcription took too long. Try a shorter recording." },
          { status: 504 },
        );
      }
      return Response.json(
        { error: "Could not reach the AI provider. Check your connection and try again." },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeout);
    }

    let data;
    try {
      data = await geminiRes.json();
    } catch {
      return Response.json(
        { error: "The AI provider returned an unreadable response." },
        { status: 502 },
      );
    }

    if (!geminiRes.ok) {
      const message = data?.error?.message || "The AI provider returned an error.";
      const friendly =
        geminiRes.status === 429
          ? "The free-tier rate limit was hit. Wait a minute and try again."
          : message;
      return Response.json({ error: friendly }, { status: geminiRes.status });
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .map((p) => p.text || "")
      .join("\n")
      .trim();

    return Response.json({
      text:
        text ||
        "Couldn't make out any speech in that recording — try again closer to the microphone.",
    });
  } catch (err) {
    return Response.json(
      { error: "Unexpected server error while transcribing audio." },
      { status: 500 },
    );
  }
}
