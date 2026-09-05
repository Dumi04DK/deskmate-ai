"use client";

import { useId, useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Mail,
  FileText,
  ListChecks,
  Search,
  MessageSquare,
  Copy,
  Download,
  ChevronDown,
  RefreshCw,
  Send,
  Menu,
  Loader2,
  Check,
  AlertTriangle,
  X,
  Paperclip,
  LogOut,
  Mic,
  Square,
  History,
  Clock,
  Sparkles,
} from "lucide-react";
import SignIn, { ResetPasswordForm } from "./SignIn";
import LogoMark from "./LogoMark";
import { createClient } from "@/lib/supabase/client";

/* ---------- Design tokens (reused Tailwind class strings) ---------- */

const FIELD_CLASS =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 transition focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15";
const BTN_PRIMARY =
  "flex items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-300";
const BTN_SECONDARY =
  "flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50";
const PANEL_CLASS = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";

/* ---------- API + persistence helpers ---------- */

// Returns { text } on success or { error } on failure — callers decide
// how to render each case instead of the two being mashed into one
// string, which used to make errors look like generated content.
async function callAI(messages, systemPrompt) {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system: systemPrompt }),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      return { error: "The server returned an unreadable response." };
    }
    if (!res.ok) return { error: data.error || "Something went wrong." };
    return { text: data.text || "The AI returned an empty response. Please try again." };
  } catch (err) {
    return { error: "Network error — check your connection and try again." };
  }
}

// Persists a piece of state to the browser's localStorage so drafts
// survive a page refresh. Scoped per-browser, not shared across devices
// or team members — that requires a real database (see README). Also
// reports whether it has finished reading from storage yet, so callers
// gating UI on the stored value (like the sign-in screen) can wait for
// that instead of flashing the "empty" state first.
function usePersistentState(key, initialValue) {
  const [state, setState] = useState(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setState(JSON.parse(stored));
    } catch (e) {
      /* ignore corrupt storage */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      /* storage full or unavailable — fail silently */
    }
  }, [key, state, hydrated]);

  return [state, setState, hydrated];
}

/* ---------- Generation history (shared across all tools) ---------- */

// Every successful generation across every tool is one row in Supabase's
// `generations` table (RLS-scoped to the signed-in user), keyed by which
// tool produced it — this is what lets the sidebar show a combined
// "Recent" feed grouped by tool, and each tool show its own past
// results, from any device. A custom event triggers a refetch in
// already-mounted views (every tool stays mounted, just hidden, for
// instant tab switching) the moment a new entry is added elsewhere.
const HISTORY_EVENT = "aiw:history-updated";
const RESTORE_EVENT = "aiw:restore-entry";
const MAX_HISTORY = 50;

async function fetchGenerations(tool) {
  const supabase = createClient();
  let query = supabase
    .from("generations")
    .select("id, tool, label, inputs, output, source, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);
  if (tool) query = query.eq("tool", tool);
  const { data, error } = await query;
  if (error) return [];
  // The rest of this file works with entries shaped like the old
  // localStorage ones (a millisecond `timestamp`), so adapt here rather
  // than touching every call site.
  return data.map((row) => ({ ...row, timestamp: new Date(row.created_at).getTime() }));
}

async function addHistoryEntry(tool, label, inputs, output, source = "typed") {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("generations").insert({
    user_id: user.id,
    tool,
    label: (label || "Untitled").trim().slice(0, 80),
    inputs,
    output,
    source,
  });
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

async function removeHistoryEntry(id) {
  const supabase = createClient();
  await supabase.from("generations").delete().eq("id", id);
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

// Loads this tool's (or, with no argument, every tool's) history from
// Supabase and stays in sync with it via the custom event addHistoryEntry
// / removeHistoryEntry fire.
function useHistory(tool) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let active = true;
    const load = () => fetchGenerations(tool).then((rows) => active && setItems(rows));
    load();
    window.addEventListener(HISTORY_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(HISTORY_EVENT, load);
    };
  }, [tool]);
  return items;
}

// Tells whichever tool view owns this entry to load it back into its
// form — used when "opening" a past result from the sidebar, which
// isn't the tool's own component and has no direct access to its state.
function broadcastRestore(entry) {
  window.dispatchEvent(new CustomEvent(RESTORE_EVENT, { detail: entry }));
}

// A tool view calls this once to listen for restores addressed to it.
function useRestoreListener(tool, onRestore) {
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.tool === tool) onRestore(e.detail);
    };
    window.addEventListener(RESTORE_EVENT, handler);
    return () => window.removeEventListener(RESTORE_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
}

function relativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TOOL_META = {
  email: { label: "Email Generator", icon: Mail },
  meetings: { label: "Meeting Summarizer", icon: FileText },
  tasks: { label: "Task Planner", icon: ListChecks },
  research: { label: "Research Assistant", icon: Search },
};

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ---------- Meeting recording (meeting summarizer) ---------- */

// Kept in sync with MAX_AUDIO_BYTES in app/api/transcribe/route.js.
// 20kbps used to be the bitrate here, but it's too low for Opus to
// keep speech intelligible — that's what was causing wildly wrong
// transcriptions, not the AI model. 32kbps is a real quality step up
// for voice. At this bitrate a full 15-minute recording is ~3.4MB,
// leaving ~14% headroom under the 4MB server cap for container/encoder
// overhead — this is a genuine tradeoff against the old 20-minute cap,
// traded away on purpose since accurate transcription matters more than
// a few extra minutes.
const MAX_RECORD_SECONDS = 15 * 60;
const RECORD_BITS_PER_SECOND = 32000;

function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

/* ---------- File upload (research assistant) ---------- */

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_EXTRACTED_CHARS = 8000;

async function extractPdfText(file) {
  const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  const maxPages = Math.min(pdf.numPages, 30); // a hard ceiling so a huge PDF can't hang the tab
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n\n";
    if (text.length > MAX_EXTRACTED_CHARS * 2) break; // plenty — gets trimmed below anyway
  }
  return text;
}

// Extracts plain text from an uploaded PDF or text/markdown file, all
// in the browser — the file itself is never sent anywhere. Returns the
// text (capped, so it fits the server's per-message limit alongside
// the rest of the prompt) and whether it was truncated.
async function extractFileText(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File is too large (max 15MB).");
  }
  const name = file.name.toLowerCase();
  let text;
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    text = await extractPdfText(file);
  } else if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    text = await file.text();
  } else {
    throw new Error(
      "Unsupported file type — upload a PDF, .txt, or .md file, or paste the text directly.",
    );
  }
  text = text.replace(/[ \t]+\n/g, "\n").trim();
  if (!text) {
    throw new Error("Couldn't find any readable text in that file.");
  }
  const truncated = text.length > MAX_EXTRACTED_CHARS;
  return { text: text.slice(0, MAX_EXTRACTED_CHARS), truncated };
}

/* ---------- Shared UI primitives ---------- */

function FieldLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-stone-700">
      {children}
    </label>
  );
}

function TextArea({ id, value, onChange, placeholder, rows = 4, maxLength }) {
  return (
    <div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={`${FIELD_CLASS} resize-none`}
      />
      {maxLength && (
        // Fixed "en-US" locale, not toLocaleString()'s implicit locale —
        // the browser's locale can differ from the server's, and that
        // mismatch between SSR markup and the client's first render
        // triggers a React hydration error.
        <div className="mt-1 text-right text-xs text-stone-400">
          {value.length.toLocaleString("en-US")} / {maxLength.toLocaleString("en-US")}
        </div>
      )}
    </div>
  );
}

// A dedicated error state, distinct from generated output, with a
// one-click retry so a failed request never gets mistaken for content.
function ErrorBanner({ message, onRetry, onDismiss }) {
  if (!message) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 shrink-0 text-red-500" size={15} />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 text-red-400 hover:text-red-600"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function ViewHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
        <Icon size={18} className="text-emerald-800" />
      </div>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-stone-900">{title}</h1>
        <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>
      </div>
    </div>
  );
}

// Turns a panel title into a safe filename fragment, e.g. "Generated
// email" -> "generated-email". Downloaded files are named
// "<slug>-<yyyy-mm-dd>.<ext>" so re-downloading later doesn't silently
// overwrite an earlier one from the same day at a glance.
function slugify(title) {
  return (title || "output")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// jsPDF and docx are both sizeable — loaded on demand (same pattern as
// pdfjs-dist in extractFileText below) rather than in the main bundle,
// since most sessions never click either download option.
async function downloadAsPdf(text, title, filename) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, margin, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let y = margin + 28;
  for (const paragraph of (text || "").split("\n")) {
    const lines = paragraph ? doc.splitTextToSize(paragraph, maxWidth) : [""];
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
  }
  doc.save(filename);
}

async function downloadAsWord(text, title, filename) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(title)] }),
          ...(text || "")
            .split("\n")
            .map((line) => new Paragraph({ children: [new TextRun(line)] })),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  triggerBlobDownload(blob, filename);
}

function OutputPanel({
  icon: Icon,
  title,
  value,
  onChange,
  loading,
  onRegenerate,
  placeholder,
  tips,
}) {
  const [copied, setCopied] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadMenuRef = useRef(null);
  const handleCopy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(value || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Closes the download menu on any click outside it — a plain toggle
  // button with no other way to dismiss would otherwise stay open when
  // the user clicks elsewhere in the panel.
  useEffect(() => {
    if (!downloadOpen) return;
    const onClickAway = (e) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target)) {
        setDownloadOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [downloadOpen]);

  const runDownload = async (format) => {
    setDownloadOpen(false);
    setDownloading(true);
    const date = new Date().toISOString().slice(0, 10);
    const base = `${slugify(title)}-${date}`;
    try {
      if (format === "pdf") await downloadAsPdf(value || "", title, `${base}.pdf`);
      else await downloadAsWord(value || "", title, `${base}.docx`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={15} className="text-emerald-700" />}
          <span className="text-sm font-semibold text-stone-900">{title}</span>
        </div>
        {value && !loading && (
          <div className="flex items-center gap-2">
            <button onClick={onRegenerate} className={BTN_SECONDARY}>
              <RefreshCw size={13} /> Regenerate
            </button>
            <div className="relative" ref={downloadMenuRef}>
              <button
                onClick={() => setDownloadOpen((o) => !o)}
                disabled={downloading}
                aria-haspopup="menu"
                aria-expanded={downloadOpen}
                className={BTN_SECONDARY}
              >
                {downloading ? (
                  <Loader2 className="animate-spin" size={13} />
                ) : (
                  <Download size={13} />
                )}
                Download <ChevronDown size={12} />
              </button>
              {downloadOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-md"
                >
                  <button
                    role="menuitem"
                    onClick={() => runDownload("pdf")}
                    className="block w-full px-3 py-1.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-50"
                  >
                    PDF (.pdf)
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => runDownload("word")}
                    className="block w-full px-3 py-1.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-50"
                  >
                    Word (.docx)
                  </button>
                </div>
              )}
            </div>
            <button onClick={handleCopy} className={BTN_SECONDARY}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-stone-500">
            <Loader2 className="animate-spin" size={18} />
            Generating...
          </div>
        ) : value ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={title}
            className={`${FIELD_CLASS} h-full min-h-[280px] leading-relaxed resize-y`}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50 px-6 py-10 text-center">
            {Icon && (
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                <Icon size={18} className="text-emerald-800" />
              </div>
            )}
            <p className="text-sm font-medium text-stone-700">Nothing generated yet</p>
            <p className="mt-1 max-w-xs text-sm text-stone-400">
              {placeholder || "Your generated content will appear here — editable once created."}
            </p>
            {tips && tips.length > 0 && (
              <ul className="mt-4 w-full max-w-xs space-y-1.5 text-left text-xs text-stone-500">
                {tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-700" />
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Past generations for one tool, shown beneath its two-column layout so
// nothing generated is ever lost to a "Regenerate" click — click any
// entry to load it back into the form and output panel.
function HistoryList({ tool, onRestore }) {
  const items = useHistory(tool);
  if (items.length === 0) return null;
  return (
    <div className={`${PANEL_CLASS} space-y-3`}>
      <div className="flex items-center gap-2">
        <History size={14} className="text-emerald-700" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          History ({items.length})
        </h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="group relative flex items-start gap-2 rounded-lg border border-stone-200 p-2.5 text-left transition hover:border-stone-300 hover:bg-stone-50"
          >
            <button onClick={() => onRestore(item)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-stone-900">{item.label}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-400">
                <Clock size={11} /> {relativeTime(item.timestamp)}
                {item.inputs?.fileName && (
                  <span className="flex items-center gap-0.5 truncate">
                    <Paperclip size={11} /> {item.inputs.fileName}
                  </span>
                )}
              </p>
            </button>
            <button
              onClick={() => removeHistoryEntry(item.id)}
              aria-label="Delete from history"
              className="shrink-0 rounded p-0.5 text-stone-300 opacity-0 transition hover:text-stone-600 group-hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Tool views ---------- */

// Rotating feature-highlight banners on the dashboard — real feature
// callouts (not filler), so they double as feature discovery for
// things a new user might otherwise never find (the recorder, file
// upload, history). Auto-advances, pauses on hover, and the dots are
// directly clickable. One slide per tool — each with its own alternating
// background/icon treatment so the set reads as a designed sequence
// rather than five copies of the same card. Every color reference here
// is one of the app's own tokens (emerald/stone), just recombined —
// no new palette introduced.
const DASHBOARD_BANNERS = [
  {
    icon: FileText,
    title: "Meeting Summarizer",
    body: "Turn long meetings into clear, actionable notes.",
    cta: "Try it now",
    tool: "meetings",
    bg: "bg-[#1B221D]",
    text: "text-white",
    body_: "text-stone-300",
    wordmark: "text-emerald-400",
    plate: "bg-white",
    plateIcon: "text-emerald-800",
    badge: "bg-emerald-400",
    badgeIcon: "text-emerald-950",
    blob1: "bg-white/5",
    blob2: "bg-emerald-800/40",
    cta_: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300",
  },
  {
    icon: MessageSquare,
    title: "AI Chatbot",
    body: "Your always-on assistant, ready for any question.",
    cta: "Try it now",
    tool: "chatbot",
    bg: "bg-[#1B221D]",
    text: "text-white",
    body_: "text-stone-300",
    wordmark: "text-emerald-400",
    plate: "bg-emerald-800",
    plateIcon: "text-white",
    badge: "bg-emerald-400",
    badgeIcon: "text-emerald-950",
    blob1: "bg-white/5",
    blob2: "bg-emerald-800/40",
    cta_: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300",
  },
  {
    icon: Mail,
    title: "Email Generator",
    body: "Draft clear, on-brand emails in seconds with AI.",
    cta: "Try it now",
    tool: "email",
    bg: "bg-[#1B221D]",
    text: "text-white",
    body_: "text-stone-300",
    wordmark: "text-emerald-400",
    plate: "bg-emerald-900",
    plateIcon: "text-white",
    badge: "bg-emerald-400",
    badgeIcon: "text-emerald-950",
    blob1: "bg-white/5",
    blob2: "bg-emerald-800/40",
    cta_: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300",
  },
  {
    icon: ListChecks,
    title: "Task Planner",
    body: "Organize your day and let AI prioritize for you.",
    cta: "Try it now",
    tool: "tasks",
    bg: "bg-[#1B221D]",
    text: "text-white",
    body_: "text-stone-300",
    wordmark: "text-emerald-400",
    plate: "bg-white",
    plateIcon: "text-emerald-800",
    badge: "bg-emerald-400",
    badgeIcon: "text-emerald-950",
    blob1: "bg-white/5",
    blob2: "bg-emerald-800/40",
    cta_: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300",
  },
  {
    icon: Search,
    title: "Research Assistant",
    body: "Find, digest, and cite sources in a fraction of the time.",
    cta: "Try it now",
    tool: "research",
    bg: "bg-[#1B221D]",
    text: "text-white",
    body_: "text-stone-300",
    wordmark: "text-emerald-400",
    plate: "bg-stone-300",
    plateIcon: "text-stone-800",
    badge: "bg-emerald-400",
    badgeIcon: "text-emerald-950",
    blob1: "bg-white/5",
    blob2: "bg-emerald-800/40",
    cta_: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300",
  },
];
const BANNER_INTERVAL_MS = 6000;

function DashboardBannerCarousel({ onNavigate }) {
  const [index, setIndex] = useState(0);

  // Always rotating, no pause-on-hover — a stalled interval (e.g. a
  // mouseleave that never fires after a touch tap) would otherwise
  // look like the carousel silently stopped working.
  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % DASHBOARD_BANNERS.length),
      BANNER_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, []);

  const banner = DASHBOARD_BANNERS[index];
  const Icon = banner.icon;

  return (
    <div
      className={`relative min-h-[220px] overflow-hidden rounded-2xl shadow-sm transition-colors duration-500 sm:min-h-[240px] ${banner.bg} ${banner.text}`}
    >
      {/* Decorative background blobs — purely aesthetic, clipped to the card. One drifts slowly for ambient life. */}
      <div
        className={`pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full ${banner.blob1}`}
      />
      <div
        className={`aiw-blob-drift pointer-events-none absolute -right-6 bottom-[-4.5rem] h-48 w-48 rounded-full ${banner.blob2}`}
      />

      <div
        key={index}
        className="aiw-banner-content relative flex h-full flex-col justify-center gap-5 p-6 sm:p-10"
      >
        <p className={`text-xs font-bold uppercase tracking-widest ${banner.wordmark}`}>
          Deskmate AI
        </p>

        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-2xl shadow-sm sm:h-24 sm:w-24 ${banner.plate}`}
            >
              <Icon size={36} className={banner.plateIcon} />
            </div>
            <div
              className={`aiw-sparkle-badge absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full shadow-sm ${banner.badge}`}
            >
              <Sparkles size={13} className={banner.badgeIcon} />
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              {banner.title}
            </h3>
            <p className={`mt-1 max-w-md text-sm sm:text-base ${banner.body_}`}>{banner.body}</p>
          </div>
        </div>

        <button
          onClick={() => onNavigate(banner.tool)}
          className={`w-fit rounded-full px-5 py-2.5 text-sm font-semibold transition hover:scale-105 ${banner.cta_}`}
        >
          {banner.cta}
        </button>
      </div>

      <div className="absolute bottom-5 left-6 flex items-center gap-1.5 sm:left-10">
        {DASHBOARD_BANNERS.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Show banner ${i + 1} of ${DASHBOARD_BANNERS.length}`}
            aria-current={i === index ? "true" : undefined}
            className={`h-1.5 rounded-full transition-all ${
              i === index
                ? `w-6 ${banner.text === "text-white" ? "bg-white" : "bg-stone-900"}`
                : "bg-current opacity-25 hover:opacity-50 w-1.5"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function DashboardView({ onNavigate, userName }) {
  const tools = [
    {
      id: "email",
      title: "Smart Email Generator",
      desc: "Draft polished emails in seconds",
      icon: Mail,
    },
    {
      id: "meetings",
      title: "Meeting Notes Summarizer",
      desc: "Turn messy notes into clear summaries",
      icon: FileText,
    },
    {
      id: "tasks",
      title: "AI Task Planner",
      desc: "Break goals into actionable plans",
      icon: ListChecks,
    },
    {
      id: "research",
      title: "AI Research Assistant",
      desc: "Upload a document or ask a question",
      icon: Search,
    },
    {
      id: "chatbot",
      title: "AI Chatbot",
      desc: "A general assistant for quick help",
      icon: MessageSquare,
    },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900">
        {userName ? `Good to see you, ${userName}` : "Good to see you"}
      </h1>
      <DashboardBannerCarousel onNavigate={onNavigate} />
      <p className="text-sm text-stone-500">Pick a tool below to get started.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => onNavigate(t.id)}
            className="flex flex-col items-start gap-3 rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <t.icon size={18} className="text-emerald-800" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-stone-900">{t.title}</h3>
              <p className="mt-0.5 text-xs text-stone-500">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const EMAIL_DEFAULT = {
  recipient: "",
  purpose: "",
  points: "",
  tone: "Professional",
  length: "Medium",
  output: "",
  error: "",
};

function EmailGeneratorView() {
  const [s, setS] = usePersistentState("aiw_email", EMAIL_DEFAULT);
  const [loading, setLoading] = useState(false);
  const patch = (p) => setS((prev) => ({ ...prev, ...p }));
  const uid = useId();

  useRestoreListener("email", (entry) =>
    setS((prev) => ({ ...prev, ...entry.inputs, output: entry.output, error: "" })),
  );

  const generate = async () => {
    if (!s.purpose.trim()) return;
    setLoading(true);
    patch({ error: "" });
    const systemPrompt =
      "You are a professional workplace email-writing assistant embedded in an enterprise productivity tool. Write clear, well-structured emails with a subject line and body. Match the requested tone and length exactly. Do not include placeholder brackets unless the user provided that info. Output only the email (subject line, then body), no commentary.";
    const userMsg = `Write an email with the following details:\nRecipient: ${s.recipient || "Not specified"}\nPurpose/context: ${s.purpose}\nKey points to include: ${s.points || "None specified"}\nTone: ${s.tone}\nLength: ${s.length}`;
    const result = await callAI([{ role: "user", content: userMsg }], systemPrompt);
    if (result.error) {
      patch({ error: result.error });
    } else {
      patch({ output: result.text, error: "" });
      await addHistoryEntry(
        "email",
        s.recipient ? `To ${s.recipient}` : s.purpose,
        {
          recipient: s.recipient,
          purpose: s.purpose,
          points: s.points,
          tone: s.tone,
          length: s.length,
        },
        result.text,
      );
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <ViewHeader
        icon={Mail}
        title="Smart Email Generator"
        subtitle="Describe what you need to say — get a polished, ready-to-send draft."
      />
      <HistoryList
        tool="email"
        onRestore={(entry) => patch({ ...entry.inputs, output: entry.output, error: "" })}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={`${PANEL_CLASS} space-y-4`}>
          <div>
            <FieldLabel htmlFor={`${uid}-recipient`}>Recipient</FieldLabel>
            <input
              id={`${uid}-recipient`}
              value={s.recipient}
              onChange={(e) => patch({ recipient: e.target.value })}
              placeholder="e.g. Sarah, VP of Sales"
              maxLength={200}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${uid}-purpose`}>Purpose / context</FieldLabel>
            <TextArea
              id={`${uid}-purpose`}
              value={s.purpose}
              onChange={(v) => patch({ purpose: v })}
              rows={4}
              maxLength={2000}
              placeholder="e.g. Follow up after our product demo call, address pricing concerns"
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${uid}-points`}>Key points to include (optional)</FieldLabel>
            <TextArea
              id={`${uid}-points`}
              value={s.points}
              onChange={(v) => patch({ points: v })}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Offer 10% discount for annual billing, propose a call next Tuesday"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor={`${uid}-tone`}>Tone</FieldLabel>
              <select
                id={`${uid}-tone`}
                value={s.tone}
                onChange={(e) => patch({ tone: e.target.value })}
                className={FIELD_CLASS}
              >
                {["Professional", "Friendly", "Formal", "Persuasive", "Apologetic"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor={`${uid}-length`}>Length</FieldLabel>
              <select
                id={`${uid}-length`}
                value={s.length}
                onChange={(e) => patch({ length: e.target.value })}
                className={FIELD_CLASS}
              >
                {["Short", "Medium", "Long"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={loading || !s.purpose.trim()}
              className={`${BTN_PRIMARY} flex-1`}
            >
              {loading ? <Loader2 className="animate-spin" size={15} /> : <Mail size={15} />}
              {loading ? "Generating..." : "Generate email"}
            </button>
            {(s.recipient || s.purpose || s.points || s.output) && !loading && (
              <button onClick={() => setS(EMAIL_DEFAULT)} className={BTN_SECONDARY}>
                Clear
              </button>
            )}
          </div>
          <ErrorBanner
            message={s.error}
            onRetry={generate}
            onDismiss={() => patch({ error: "" })}
          />
        </div>
        <OutputPanel
          icon={Mail}
          title="Generated email"
          value={s.output}
          onChange={(v) => patch({ output: v })}
          loading={loading}
          onRegenerate={generate}
          placeholder="Fill in the details and generate to see your draft here."
        />
      </div>
    </div>
  );
}

const MEETING_DEFAULT = { notes: "", style: "Action items focus", output: "", error: "" };

function MeetingSummarizerView() {
  const [s, setS] = usePersistentState("aiw_meetings", MEETING_DEFAULT);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [recordError, setRecordError] = useState("");
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const patch = (p) => setS((prev) => ({ ...prev, ...p }));
  const uid = useId();
  const recordingSupported =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  useRestoreListener("meetings", (entry) =>
    setS((prev) => ({ ...prev, ...entry.inputs, output: entry.output, error: "" })),
  );

  // Stop the mic and timer if the user navigates away mid-recording —
  // every tool view stays mounted (just hidden) for instant tab
  // switching, but this still guards against an unmount some other way.
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const transcribeRecording = async (blob) => {
    setTranscribing(true);
    setRecordError("");
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("The server returned an unreadable response.");
      }
      if (!res.ok) throw new Error(data.error || "Couldn't transcribe that recording.");
      setS((prev) => ({
        ...prev,
        notes: prev.notes ? `${prev.notes}\n\n${data.text}` : data.text,
      }));
    } catch (err) {
      setRecordError(err.message || "Couldn't transcribe that recording.");
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    setRecordError("");
    try {
      // Explicit constraints rather than bare `audio: true` — most
      // browsers default these on already, but voice-optimized capture
      // (vs. whatever a given device's raw default is) matters more now
      // that the recording itself is compressed harder (see
      // RECORD_BITS_PER_SECOND below) to fit the upload size cap.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: RECORD_BITS_PER_SECOND } : undefined,
      );
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        transcribeRecording(
          new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }),
        );
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev + 1 >= MAX_RECORD_SECONDS) stopRecording();
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setRecordError(
        err?.name === "NotAllowedError"
          ? "Microphone access was denied — allow microphone access in your browser to record."
          : "Couldn't access your microphone. Check your device settings and try again.",
      );
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    setRecording(false);
    recorderRef.current?.stop();
  };

  const generate = async () => {
    if (!s.notes.trim()) return;
    setLoading(true);
    patch({ error: "" });
    const systemPrompt =
      "You are a meeting-notes summarization assistant. Given raw, messy meeting notes or a transcript, produce a clean, structured summary with sections such as Summary, Key Decisions, Action Items (with an owner and due date if mentioned or inferable, otherwise 'Unassigned'), and Open Questions, adjusting emphasis based on the requested style. Only include information present in the notes — never invent details.";
    const userMsg = `Summarize these meeting notes.\nStyle requested: ${s.style}\n\nNotes:\n${s.notes}`;
    const result = await callAI([{ role: "user", content: userMsg }], systemPrompt);
    if (result.error) {
      patch({ error: result.error });
    } else {
      patch({ output: result.text, error: "" });
      await addHistoryEntry(
        "meetings",
        s.notes.split("\n")[0] || s.style,
        { notes: s.notes, style: s.style },
        result.text,
      );
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <ViewHeader
        icon={FileText}
        title="Meeting Notes Summarizer"
        subtitle="Paste raw notes or a transcript — get a clean summary with action items."
      />
      <HistoryList
        tool="meetings"
        onRestore={(entry) => patch({ ...entry.inputs, output: entry.output, error: "" })}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={`${PANEL_CLASS} space-y-4`}>
          {recordingSupported && (
            <div>
              <FieldLabel>Record a meeting (optional)</FieldLabel>
              {recording ? (
                <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                    Recording... {formatDuration(recordSeconds)}
                  </div>
                  <button
                    onClick={stopRecording}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                  >
                    <Square size={12} /> Stop
                  </button>
                </div>
              ) : transcribing ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-500">
                  <Loader2 className="animate-spin" size={15} /> Transcribing your recording...
                </div>
              ) : (
                <button
                  onClick={startRecording}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-3 text-sm text-stone-600 transition hover:border-emerald-600 hover:bg-emerald-50/40"
                >
                  <Mic size={15} /> Start recording
                </button>
              )}
              {recordError && <p className="mt-1 text-xs text-red-600">{recordError}</p>}
              <p className="mt-1 text-xs text-stone-400">
                The recording is sent to the AI to transcribe and isn't stored anywhere — only the
                resulting text below is kept. Max {MAX_RECORD_SECONDS / 60} minutes.
              </p>
            </div>
          )}
          <div>
            <FieldLabel htmlFor={`${uid}-notes`}>Raw notes or transcript</FieldLabel>
            <TextArea
              id={`${uid}-notes`}
              value={s.notes}
              onChange={(v) => patch({ notes: v })}
              rows={12}
              maxLength={8000}
              placeholder="Paste your meeting notes, transcript, or rough bullet points here — or record above."
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${uid}-style`}>Summary style</FieldLabel>
            <select
              id={`${uid}-style`}
              value={s.style}
              onChange={(e) => patch({ style: e.target.value })}
              className={FIELD_CLASS}
            >
              {["Action items focus", "Executive summary", "Detailed bullet points"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={loading || !s.notes.trim()}
              className={`${BTN_PRIMARY} flex-1`}
            >
              {loading ? <Loader2 className="animate-spin" size={15} /> : <FileText size={15} />}
              {loading ? "Summarizing..." : "Summarize notes"}
            </button>
            {(s.notes || s.output) && !loading && (
              <button onClick={() => setS(MEETING_DEFAULT)} className={BTN_SECONDARY}>
                Clear
              </button>
            )}
          </div>
          <ErrorBanner
            message={s.error}
            onRetry={generate}
            onDismiss={() => patch({ error: "" })}
          />
        </div>
        <OutputPanel
          icon={FileText}
          title="Summary"
          value={s.output}
          onChange={(v) => patch({ output: v })}
          loading={loading}
          onRegenerate={generate}
          placeholder="Paste your notes and summarize to see structured output here."
        />
      </div>
    </div>
  );
}

const TASK_DEFAULT = { goal: "", deadline: "", constraints: "", output: "", error: "" };

function TaskPlannerView() {
  const [s, setS] = usePersistentState("aiw_tasks", TASK_DEFAULT);
  const [loading, setLoading] = useState(false);
  const patch = (p) => setS((prev) => ({ ...prev, ...p }));
  const uid = useId();

  useRestoreListener("tasks", (entry) =>
    setS((prev) => ({ ...prev, ...entry.inputs, output: entry.output, error: "" })),
  );

  const generate = async () => {
    if (!s.goal.trim()) return;
    setLoading(true);
    patch({ error: "" });
    const systemPrompt =
      "You are an AI task planning assistant. Given a goal or project, break it down into a clear, prioritized, actionable plan: numbered milestones, each with concrete sub-tasks and rough time estimates. Respect any deadline or constraints given. Keep it practical and specific to the goal, not generic. Output only the plan.";
    const userMsg = `Goal/project: ${s.goal}\nDeadline: ${s.deadline || "Not specified"}\nConstraints/resources: ${s.constraints || "None specified"}`;
    const result = await callAI([{ role: "user", content: userMsg }], systemPrompt);
    if (result.error) {
      patch({ error: result.error });
    } else {
      patch({ output: result.text, error: "" });
      await addHistoryEntry(
        "tasks",
        s.goal,
        { goal: s.goal, deadline: s.deadline, constraints: s.constraints },
        result.text,
      );
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <ViewHeader
        icon={ListChecks}
        title="AI Task Planner"
        subtitle="Turn a goal into a prioritized, actionable plan."
      />
      <HistoryList
        tool="tasks"
        onRestore={(entry) => patch({ ...entry.inputs, output: entry.output, error: "" })}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={`${PANEL_CLASS} space-y-4`}>
          <div>
            <FieldLabel htmlFor={`${uid}-goal`}>Goal or project</FieldLabel>
            <TextArea
              id={`${uid}-goal`}
              value={s.goal}
              onChange={(v) => patch({ goal: v })}
              rows={4}
              maxLength={2000}
              placeholder="e.g. Launch our new customer onboarding flow"
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${uid}-deadline`}>Deadline (optional)</FieldLabel>
            <input
              id={`${uid}-deadline`}
              type="date"
              value={s.deadline}
              onChange={(e) => patch({ deadline: e.target.value })}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${uid}-constraints`}>
              Constraints or resources (optional)
            </FieldLabel>
            <TextArea
              id={`${uid}-constraints`}
              value={s.constraints}
              onChange={(v) => patch({ constraints: v })}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Team of 3, no budget for new tools, must integrate with existing CRM"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={loading || !s.goal.trim()}
              className={`${BTN_PRIMARY} flex-1`}
            >
              {loading ? <Loader2 className="animate-spin" size={15} /> : <ListChecks size={15} />}
              {loading ? "Planning..." : "Generate plan"}
            </button>
            {(s.goal || s.deadline || s.constraints || s.output) && !loading && (
              <button onClick={() => setS(TASK_DEFAULT)} className={BTN_SECONDARY}>
                Clear
              </button>
            )}
          </div>
          <ErrorBanner
            message={s.error}
            onRetry={generate}
            onDismiss={() => patch({ error: "" })}
          />
        </div>
        <OutputPanel
          icon={ListChecks}
          title="Task plan"
          value={s.output}
          onChange={(v) => patch({ output: v })}
          loading={loading}
          onRegenerate={generate}
          placeholder="Describe your goal and generate to see a plan here."
        />
      </div>
    </div>
  );
}

const RESEARCH_DEFAULT = {
  topic: "",
  depth: "Quick overview",
  output: "",
  error: "",
  fileName: "",
  fileText: "",
  fileTruncated: false,
};

function ResearchAssistantView() {
  const [s, setS] = usePersistentState("aiw_research", RESEARCH_DEFAULT);
  const [loading, setLoading] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const patch = (p) => setS((prev) => ({ ...prev, ...p }));
  const uid = useId();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setFileError("");
    setFileBusy(true);
    try {
      const { text, truncated } = await extractFileText(file);
      patch({ fileName: file.name, fileText: text, fileTruncated: truncated });
    } catch (err) {
      setFileError(err.message || "Couldn't read that file.");
    } finally {
      setFileBusy(false);
    }
  };

  const removeFile = () => {
    patch({ fileName: "", fileText: "", fileTruncated: false });
    setFileError("");
  };

  // Restoring doesn't refill the uploaded file itself — its extracted
  // text isn't kept in history, to keep entries small — so the file
  // slot is explicitly cleared rather than showing a filename with no
  // text behind it. Which file (if any) was used is still visible in
  // the history entry itself.
  useRestoreListener("research", (entry) =>
    setS((prev) => ({
      ...prev,
      topic: entry.inputs.topic,
      depth: entry.inputs.depth,
      fileName: "",
      fileText: "",
      fileTruncated: false,
      output: entry.output,
      error: "",
    })),
  );

  const generate = async () => {
    if (!s.topic.trim()) return;
    setLoading(true);
    patch({ error: "" });
    const systemPrompt =
      "You are a workplace research assistant. Answer the user's question using clear organization (headers where useful). Be balanced and note where a topic is contested or uncertain. This assistant has no live web access, so avoid asserting very recent or time-sensitive facts with high confidence — flag when the user should verify against a current source. When a reference document is provided, ground your answer in it and say so explicitly where you draw on it.";
    const userMsg = `${
      s.fileText
        ? `Reference document uploaded by the user (may be truncated):\n"""\n${s.fileText}\n"""\n\n`
        : ""
    }Research topic/question: ${s.topic}\nDepth requested: ${s.depth}`;
    const result = await callAI([{ role: "user", content: userMsg }], systemPrompt);
    if (result.error) {
      patch({ error: result.error });
    } else {
      patch({ output: result.text, error: "" });
      await addHistoryEntry(
        "research",
        s.topic,
        { topic: s.topic, depth: s.depth, fileName: s.fileName },
        result.text,
      );
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <ViewHeader
        icon={Search}
        title="AI Research Assistant"
        subtitle="Ask a question, optionally grounded in an uploaded document — get a structured brief."
      />
      <HistoryList
        tool="research"
        onRestore={(entry) =>
          patch({
            topic: entry.inputs.topic,
            depth: entry.inputs.depth,
            fileName: "",
            fileText: "",
            fileTruncated: false,
            output: entry.output,
            error: "",
          })
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={`${PANEL_CLASS} space-y-4`}>
          <div>
            <FieldLabel htmlFor={`${uid}-file`}>Reference document (optional)</FieldLabel>
            {!s.fileName ? (
              <label
                htmlFor={`${uid}-file`}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-4 text-sm text-stone-500 transition hover:border-stone-400 hover:bg-stone-50"
              >
                {fileBusy ? (
                  <Loader2 className="animate-spin" size={15} />
                ) : (
                  <Paperclip size={15} />
                )}
                {fileBusy ? "Reading file..." : "Upload a PDF, .txt, or .md file"}
                <input
                  id={`${uid}-file`}
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  className="sr-only"
                  onChange={handleFileChange}
                  disabled={fileBusy}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2.5 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText size={15} className="text-stone-700" />
                  <span className="truncate text-stone-900">{s.fileName}</span>
                </div>
                <button
                  onClick={removeFile}
                  aria-label="Remove file"
                  className="shrink-0 text-stone-400 hover:text-stone-600"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {s.fileTruncated && (
              <p className="mt-1 text-xs text-stone-400">
                Only the first {MAX_EXTRACTED_CHARS.toLocaleString("en-US")} characters were used.
              </p>
            )}
            {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
          </div>
          <div>
            <FieldLabel htmlFor={`${uid}-topic`}>Research question or topic</FieldLabel>
            <TextArea
              id={`${uid}-topic`}
              value={s.topic}
              onChange={(v) => patch({ topic: v })}
              rows={5}
              maxLength={2000}
              placeholder="e.g. Summarize the key risks in this document, or: What are the main pricing models for B2B SaaS?"
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${uid}-depth`}>Depth</FieldLabel>
            <select
              id={`${uid}-depth`}
              value={s.depth}
              onChange={(e) => patch({ depth: e.target.value })}
              className={FIELD_CLASS}
            >
              {["Quick overview", "Detailed analysis"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={loading || !s.topic.trim()}
              className={`${BTN_PRIMARY} flex-1`}
            >
              {loading ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
              {loading ? "Researching..." : "Research this"}
            </button>
            {(s.topic || s.fileName || s.output) && !loading && (
              <button
                onClick={() => {
                  setS(RESEARCH_DEFAULT);
                  setFileError("");
                }}
                className={BTN_SECONDARY}
              >
                Clear
              </button>
            )}
          </div>
          <ErrorBanner
            message={s.error}
            onRetry={generate}
            onDismiss={() => patch({ error: "" })}
          />
        </div>
        <OutputPanel
          icon={Search}
          title="Research brief"
          value={s.output}
          onChange={(v) => patch({ output: v })}
          loading={loading}
          onRegenerate={generate}
          placeholder="Ask a question (optionally with an uploaded document) to see a brief here."
        />
      </div>
    </div>
  );
}

const CHAT_DEFAULT = [
  {
    role: "assistant",
    content:
      "Hi! I'm your workplace AI assistant. Ask me anything — from drafting a quick reply to thinking through a decision.",
  },
];

const CHAT_STARTERS = [
  "Draft a polite follow-up email to a client who hasn't replied in a week",
  "Give me 5 ways to make our team's weekly standup more efficient",
  "Explain the tradeoffs between a flat fee and usage-based pricing model",
];

function ChatbotView() {
  const [messages, setMessages] = usePersistentState("aiw_chat", CHAT_DEFAULT);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const uid = useId();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  // Shared by both a fresh send and a retry after a failed request — a
  // retry re-asks with the existing message list rather than re-adding
  // the user's turn a second time, which would duplicate their bubble.
  const requestReply = async (allMessages) => {
    setError("");
    setLoading(true);
    const systemPrompt =
      "You are a helpful, concise AI assistant embedded in an enterprise workplace productivity tool. Help with everyday work tasks — drafting, brainstorming, quick research, planning. Keep responses focused and practical.";
    const apiMessages = allMessages.map((m) => ({ role: m.role, content: m.content }));
    const result = await callAI(apiMessages, systemPrompt);
    if (result.error) setError(result.error);
    else setMessages((prev) => [...prev, { role: "assistant", content: result.text }]);
    setLoading(false);
  };
  const sendMessage = (text) => {
    if (!text.trim() || loading) return;
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    requestReply(newMessages);
  };
  const send = () => sendMessage(input);
  const retry = () => requestReply(messages);

  return (
    <div className="space-y-5">
      <ViewHeader
        icon={MessageSquare}
        title="AI Chatbot"
        subtitle="A general assistant for quick questions and everyday work."
      />
      <div className="flex flex-col rounded-xl border border-stone-200 bg-white shadow-sm">
        <div
          ref={scrollRef}
          className="aiw-scroll space-y-4 overflow-y-auto p-5"
          style={{ maxHeight: "480px", minHeight: "360px" }}
        >
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-lg whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-emerald-800 text-white" : "bg-stone-100 text-stone-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {messages.length === 1 && !loading && (
            <div className="flex flex-col items-start gap-2 pt-1">
              <p className="text-xs font-medium text-stone-400">Try asking:</p>
              {CHAT_STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="max-w-lg rounded-lg border border-stone-200 bg-white px-3 py-2 text-left text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-stone-100 px-4 py-2.5 text-sm text-stone-500">
                <Loader2 className="animate-spin" size={14} /> Thinking...
              </div>
            </div>
          )}
        </div>
        {error && (
          <div className="px-4 pb-2">
            <ErrorBanner message={error} onRetry={retry} onDismiss={() => setError("")} />
          </div>
        )}
        <div className="border-t border-stone-200 p-4">
          <div className="flex items-end gap-2">
            <label htmlFor={`${uid}-chat-input`} className="sr-only">
              Message
            </label>
            <textarea
              id={`${uid}-chat-input`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask anything..."
              rows={2}
              maxLength={4000}
              className={`${FIELD_CLASS} flex-1 resize-none`}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-800 text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- App shell ---------- */

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "email", label: "Email Generator", icon: Mail },
  { id: "meetings", label: "Meeting Summarizer", icon: FileText },
  { id: "tasks", label: "Task Planner", icon: ListChecks },
  { id: "research", label: "Research Assistant", icon: Search },
  { id: "chatbot", label: "AI Chatbot", icon: MessageSquare },
];

function initialsOf(name) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

function navItemClass(active) {
  return active
    ? "flex w-full items-center gap-3 rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm"
    : "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-300 transition hover:bg-white/5 hover:text-white";
}

// The only styling that can't be expressed as plain Tailwind utilities —
// a themed scrollbar for the thin content-scrolling areas.
function GlobalStyles() {
  return (
    <style>{`
      .aiw-scroll::-webkit-scrollbar { width: 6px; }
      .aiw-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }

      @keyframes bannerFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .aiw-banner-content { animation: bannerFadeIn 0.5s ease-out; }

      @keyframes sparklePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
      .aiw-sparkle-badge { animation: sparklePulse 2.2s ease-in-out infinite; }

      @keyframes blobDrift { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-6px, 10px) scale(1.06); } }
      .aiw-blob-drift { animation: blobDrift 9s ease-in-out infinite; }
    `}</style>
  );
}

function AppShell({ authUser, profile, onSignOut }) {
  const [view, setView] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const currentNavItem = NAV_ITEMS.find((n) => n.id === view) || NAV_ITEMS[0];
  const displayName = profile?.name || authUser.email;
  const firstName = displayName.trim().split(/\s+/)[0];
  // Grouped by tool (Email / Meetings / Tasks / Research) rather than one
  // flat mixed list, so "Recent" reads as clear categories instead of an
  // interleaved feed where it's easy to lose track of which item is which.
  const allRecent = useHistory();
  const recentByTool = ["email", "meetings", "tasks", "research"]
    .map((tool) => ({ tool, items: allRecent.filter((e) => e.tool === tool).slice(0, 3) }))
    .filter((group) => group.items.length > 0);

  const handleNavigate = (id) => {
    setView(id);
    setMobileNavOpen(false);
  };

  const openRecent = (entry) => {
    handleNavigate(entry.tool);
    broadcastRestore(entry);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-stone-100">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/30 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col overflow-y-auto bg-[#1B221D] transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <LogoMark size={32} />
          <div>
            <p className="text-sm font-semibold leading-tight text-white">Deskmate AI</p>
            <p className="text-xs leading-tight text-stone-400">Your workplace assistant</p>
          </div>
        </div>
        <nav className="space-y-0.5 px-3 pt-2">
          <button
            onClick={() => handleNavigate("dashboard")}
            aria-current={view === "dashboard" ? "page" : undefined}
            className={navItemClass(view === "dashboard")}
          >
            <LayoutDashboard size={16} />
            Dashboard
          </button>
          <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Tools
          </p>
          {NAV_ITEMS.slice(1).map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className={navItemClass(view === item.id)}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mx-3 mt-5 flex flex-1 flex-col rounded-lg bg-white p-3 shadow-md">
          <div className="mb-2 flex items-center gap-2">
            <History size={13} className="text-emerald-700" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              Recent
            </p>
          </div>
          {recentByTool.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
                <Clock size={16} className="text-emerald-700" />
              </div>
              <p className="text-xs text-stone-400">
                Drafts you generate across every tool will show up here for quick access.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentByTool.map(({ tool, items }) => {
                const meta = TOOL_META[tool];
                const Icon = meta.icon;
                return (
                  <div key={tool}>
                    <p className="mb-1 flex items-center gap-1.5 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                      <Icon size={11} /> {meta.label}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => openRecent(item)}
                          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition hover:bg-stone-50"
                        >
                          <span className="min-w-0 flex-1 truncate text-xs text-stone-700">
                            {item.label}
                          </span>
                          <span className="shrink-0 text-[10px] text-stone-300">
                            {relativeTime(item.timestamp)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-white/10 p-3">
          <div
            className="flex items-center gap-2.5 rounded-lg px-2 py-2"
            title={[profile?.company, authUser.email].filter(Boolean).join(" · ") || undefined}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-emerald-800">
              {initialsOf(displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white" title={displayName}>
                {displayName}
              </p>
              <p className="truncate text-xs text-stone-400">
                {profile?.company || authUser.email}
              </p>
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-stone-400 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex h-full flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            className="text-stone-700"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-stone-900">Deskmate AI</span>
        </header>
        <header className="hidden items-center border-b border-stone-200 bg-white px-8 py-3.5 lg:flex">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <currentNavItem.icon size={15} className="text-stone-700" />
            {currentNavItem.label}
          </div>
        </header>
        <main className="aiw-scroll flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col">
            <div className="flex-1">
              <div className={view === "dashboard" ? "" : "hidden"}>
                <DashboardView onNavigate={handleNavigate} userName={firstName} />
              </div>
              <div className={view === "email" ? "" : "hidden"}>
                <EmailGeneratorView />
              </div>
              <div className={view === "meetings" ? "" : "hidden"}>
                <MeetingSummarizerView />
              </div>
              <div className={view === "tasks" ? "" : "hidden"}>
                <TaskPlannerView />
              </div>
              <div className={view === "research" ? "" : "hidden"}>
                <ResearchAssistantView />
              </div>
              <div className={view === "chatbot" ? "" : "hidden"}>
                <ChatbotView />
              </div>
            </div>
            <footer className="mt-10 border-t border-stone-200 pt-4 text-xs text-stone-400">
              <span>Deskmate AI</span>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}

// Tracks the real Supabase auth session (not localStorage) plus the
// matching profiles row (name/company — see supabase/schema.sql's
// on_auth_user_created trigger, which creates that row automatically
// on sign-up). Re-runs whenever auth state changes, so sign-in,
// sign-out, and the email-confirmation redirect all just work without
// a page reload.
function useSupabaseSession() {
  const [state, setState] = useState({
    loading: true,
    authUser: null,
    profile: null,
    recovering: false,
    justConfirmed: false,
  });

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // The confirmation email's redirect carries ?confirmed=1 (see
    // SignIn.jsx's signUp call) — that's the only reliable way to tell
    // "just confirmed via email" apart from any other sign-in, since
    // Supabase auto-establishes a real session on confirmation and
    // fires the same SIGNED_IN event either way. Read it once up front
    // (`let`, not `const`) so handling it can clear the flag — otherwise
    // a normal sign-in right afterward, in the same page load, would
    // hit this branch again and get signed straight back out.
    let cameFromConfirmation =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("confirmed") === "1";

    async function load(authUser, recovering) {
      if (cameFromConfirmation && authUser) {
        cameFromConfirmation = false;
        const url = new URL(window.location.href);
        url.searchParams.delete("confirmed");
        window.history.replaceState({}, "", url.toString());
        await supabase.auth.signOut();
        if (active)
          setState({
            loading: false,
            authUser: null,
            profile: null,
            recovering: false,
            justConfirmed: true,
          });
        return;
      }
      if (!authUser) {
        if (active)
          setState((s) => ({
            loading: false,
            authUser: null,
            profile: null,
            recovering: false,
            justConfirmed: s.justConfirmed,
          }));
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, company")
        .eq("id", authUser.id)
        .single();
      if (active)
        setState({
          loading: false,
          authUser,
          profile: profile || null,
          recovering,
          justConfirmed: false,
        });
    }

    supabase.auth.getUser().then(({ data }) => load(data.user, false));

    // PASSWORD_RECOVERY fires the moment a password-reset link's URL is
    // loaded — it carries a real (temporary) session, but the user
    // should set a new password before landing in the app, not skip
    // straight past it. Any later event (e.g. the USER_UPDATED that
    // follows a successful auth.updateUser() call) clears the flag.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) =>
      load(session?.user ?? null, event === "PASSWORD_RECOVERY"),
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

export default function Workspace() {
  const { loading, authUser, profile, recovering, justConfirmed } = useSupabaseSession();

  return (
    <>
      <GlobalStyles />
      {loading ? null : recovering ? (
        <ResetPasswordForm />
      ) : !authUser ? (
        <SignIn justConfirmed={justConfirmed} />
      ) : (
        <AppShell
          authUser={authUser}
          profile={profile}
          onSignOut={() => createClient().auth.signOut()}
        />
      )}
    </>
  );
}
