export const runtime = "nodejs";

// This route is the ONLY place the API key ever touches. The browser
// calls /api/ai; this function calls Google's Gemini API using a key
// that lives only in server-side environment variables. Never move
// this fetch call into client-side code.
//
// Using Gemini here (not Anthropic) specifically because Google
// currently offers a genuinely free tier with no credit card required.
// Two tradeoffs worth knowing:
//  1. Rate limits are real — a handful of requests/minute, capped per
//     day. Fine for you + a small pilot group, not for a full team.
//  2. On the free tier, Google may use your prompts/outputs to improve
//     their models. Don't put real confidential company data through
//     this until you're on a paid tier with those protections off.

const MODEL = "gemini-3.1-flash-lite";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 12000;
const MAX_SYSTEM_CHARS = 4000;
const REQUEST_TIMEOUT_MS = 25000;

// Simple in-memory per-IP rate limit. This resets whenever the server
// process restarts and is per-instance (not shared across serverless
// invocations), so treat it as a courtesy backstop, not a guarantee —
// its job is to stop one visitor from silently burning the whole
// team's free daily quota, not to withstand abuse. For real multi-
// instance rate limiting, move this state to Redis/Upstash or similar.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
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

// Occasionally sweep old buckets so the map doesn't grow unbounded on
// a long-lived server.
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

function validatePayload(body) {
  const { messages, system } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return "No messages provided.";
  }
  if (messages.length > MAX_MESSAGES) {
    return `Too many messages in one request (max ${MAX_MESSAGES}).`;
  }
  for (const m of messages) {
    if (!m || typeof m.content !== "string" || !m.content.trim()) {
      return "Every message must have non-empty text content.";
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return `A message is too long (max ${MAX_MESSAGE_CHARS.toLocaleString()} characters).`;
    }
    if (m.role !== "user" && m.role !== "assistant") {
      return "Message role must be 'user' or 'assistant'.";
    }
  }
  if (system && (typeof system !== "string" || system.length > MAX_SYSTEM_CHARS)) {
    return `System prompt is invalid or too long (max ${MAX_SYSTEM_CHARS.toLocaleString()} characters).`;
  }
  return null;
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

    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const validationError = validatePayload(body);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }
    const { messages, system } = body;

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

    // Gemini uses "model" instead of "assistant" for the AI's turns.
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const requestBody = { contents };
    if (system) {
      requestBody.system_instruction = { parts: [{ text: system }] };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let geminiRes;
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        },
      );
    } catch (err) {
      if (err.name === "AbortError") {
        return Response.json(
          { error: "The AI provider took too long to respond. Please try again." },
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
      // Normalize the common "you're out of free quota" case so the UI
      // can show a clear, actionable message instead of a raw API error.
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
      text: text || "The AI returned an empty response. Try rephrasing your request.",
    });
  } catch (err) {
    return Response.json(
      { error: "Unexpected server error while calling the AI." },
      { status: 500 },
    );
  }
}
