# 🤖 Deskmate AI

**Your workplace assistant — free-tier build.**

A Next.js app with five AI-powered tools (📧 email generator, 📝 meeting
summarizer, ✅ task planner, 🔍 research assistant, 💬 chatbot), a clean
dashboard UI, and a secure backend — running entirely on free tiers:
Google's Gemini API for the AI, Vercel's Hobby plan for hosting. No credit
card required for either.

---

## 🚀 Day 1 — get it running locally

_(aim: 2–3 hours)_

1. **Install Node.js 18+** if you don't have it → https://nodejs.org
2. **Install dependencies**
   ```bash
   cd deskmate-ai
   npm install
   ```
3. **Get a free Gemini API key** → https://aistudio.google.com/app/apikey
   (sign in with any Google account, no billing setup needed)
4. **Add your key locally**
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and paste your real key after `GEMINI_API_KEY=`.
   This file is gitignored — it will never be committed. 🔒
5. **Run it**
   ```bash
   npm run dev
   ```
   Open **http://localhost:3000** 🎉
6. **Test every tool end-to-end**: generate an email, summarize some fake
   meeting notes, plan a task, ask a research question, chat back and forth.
   Refresh the page — your drafts and chat history should still be there
   (saved to your browser via localStorage).

> 💡 If step 6 fails, the error returned by `/api/ai` will tell you what's
> wrong — usually a missing key, or a `429` meaning you've hit the free
> rate limit for the moment (wait a bit and retry).

---

## 🌐 Day 2 — deploy it live, still free

_(aim: half a day)_

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
   Create a new repo on GitHub and push to it.
2. **Deploy on Vercel**
   - Go to https://vercel.com → New Project → import your GitHub repo
   - When picking a plan, choose **Hobby** — free for personal/
     non-commercial projects, and enough for this build
   - Vercel auto-detects Next.js — no config needed
   - Before deploying, go to **Settings → Environment Variables** and add:
     `GEMINI_API_KEY` = your real key
   - Click **Deploy**
3. **Smoke test the live URL** exactly like Day 1, step 6
4. Share the URL with your first few test users 🚢

---

## ⚠️ The free-tier tradeoffs — read this before sharing widely

Nothing here costs money, but "free" comes with real limits:

- **⏱️ Rate limits.** Gemini's free tier caps requests per minute and per
  day, shared across everyone using your one API key. Fine for you and
  a handful of testers; a whole team hammering it at once will start
  seeing errors. If that happens, the fix is either waiting for the
  daily reset or moving to Gemini's paid tier (still pay-as-you-go, no
  subscription).
- **🔓 Data usage.** On the free tier, Google may use the prompts and
  outputs sent through the API to improve their models. Don't put real
  confidential company information through this until you've moved to
  a paid tier, which turns that off. _(There is currently no in-app
  warning about this — it was intentionally removed. If this goes
  anywhere beyond a personal/assignment context, put one back or move
  to the paid tier first.)_
- **🔁 Model churn.** Google retires free-tier models fairly often (several
  models were deprecated in 2026 alone). If `/api/ai` starts erroring
  with a "model not found"-style message, check
  https://ai.google.dev/gemini-api/docs/changelog for the current
  recommended free model and update the `MODEL` constant in
  `app/api/ai/route.js`.
- **📉 No uptime guarantee.** Free tiers can be deprioritized under load.
  Don't build anything time-critical on this without a paid plan.

---

## 📦 What this version does and doesn't include

### ✅ Included

- All 5 tools working against a real, free AI model
- Responsive dashboard + sidebar, editable AI outputs
- Per-browser draft/chat persistence
- A secure server-side API key (never exposed to the browser)
- Server-side input validation and request timeouts
- A basic per-IP rate limit as a courtesy backstop on `/api/ai`
- Security response headers (`next.config.js`)
- Distinct error vs. success UI states with one-click retry
- Accessible form labels, page metadata/favicon
- A lightweight local sign-in that personalizes the dashboard greeting
- 📎 PDF/text/Markdown document upload in the Research Assistant — parsed
  entirely client-side with pdf.js; the file itself is never uploaded
  anywhere, only its extracted text is sent to the AI along with your
  question
- 🕓 A per-tool generation history (plus a combined "Recent" feed in the
  sidebar), so past drafts are never lost to a regenerate — click any
  past entry to reopen it
- 🎙️ In-browser meeting recording in the Meeting Summarizer
  (**Record a meeting**): records locally via `MediaRecorder`, uploads
  the audio to `/api/transcribe`, and Gemini transcribes it straight
  into the notes field. The recording itself is never stored — only
  the transcript text is kept. Capped at 20 minutes per recording to
  stay under typical serverless request-body limits.

### ❌ Not included yet

- **👤 Real accounts / authentication** — the "Create your workspace"
  screen collects a name (plus optional email/company) to personalize
  the greeting and sidebar; it's stored in that browser's localStorage,
  has no password, and proves nothing about identity. Anyone with the
  link can still use the app and register as anyone.
- **🗄️ Shared database** — drafts (and the sign-in name) live in each
  visitor's own browser, not centrally. A Supabase schema is staged and
  ready to run in [`supabase/schema.sql`](./supabase/schema.sql) (see
  [`supabase/README.md`](./supabase/README.md)) — it isn't wired into
  the app yet, just prepared for when the project is live.
- **🚦 Durable, cross-instance rate limiting** — the built-in limiter is
  in-memory and per server instance, so it resets on restart and won't
  coordinate across multiple serverless instances. It stops one visitor
  from accidentally hammering the API, not a determined abuser. The
  staged `usage_daily` table above is meant to replace it once Supabase
  is connected.
- **📄 Word document (.docx) upload** — the Research Assistant accepts
  PDF, `.txt`, and `.md`; for `.docx`, paste the text in directly.
- **💳 Billing / SSO** — not relevant yet at zero cost, but the natural
  next steps once you outgrow the free tier.

---

## 🔧 Changing the AI model

The model is set in `app/api/ai/route.js` (`const MODEL = "gemini-3.1-flash-lite"`).
It's the current free-tier-friendly choice as of this writing. For
higher-quality output at the cost of lower free-tier throughput, try
`gemini-3.5-flash` — check current options and limits at
https://ai.google.dev/gemini-api/docs/models before switching.

---

## 🧪 CI

Every push and pull request to `main` runs five automated checks
(`.github/workflows/ci.yml`): **build**, **lint**, **format**, a
dependency **security audit**, and a **secret-leak scan**. See the
Actions tab on GitHub once this is pushed.
