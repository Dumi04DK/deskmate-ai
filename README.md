# 🤖 Deskmate AI

**Your workplace assistant.**

A Next.js app with five AI-powered tools (📧 email generator, 📝 meeting
summarizer, ✅ task planner, 🔍 research assistant, 💬 chatbot), real
accounts, a shared database, and a secure backend — running on free
tiers: Google's Gemini API for the AI, Supabase for auth/database/
storage, Vercel's Hobby plan for hosting. No credit card required for
any of the three.

---

## 🚀 Day 1 — get it running locally

_(aim: half a day — most of it is the Supabase setup)_

1. **Install Node.js 18+** if you don't have it → https://nodejs.org
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Create a free Supabase project** → https://supabase.com → New
   project (free tier: 500MB database, 1GB storage, 50k monthly active
   users, no credit card)
4. **Run the schema** — Dashboard → **SQL Editor** → New query → paste
   the entire contents of [`supabase/schema.sql`](./supabase/schema.sql)
   → **Run**. This creates every table, the private storage bucket for
   recorded meeting audio, and the Row Level Security policies that
   keep each user's data private to them.
5. **Turn on email/password sign-in** — Dashboard → **Authentication →
   Providers** → Email is on by default.
6. **Get a free Gemini API key** → https://aistudio.google.com/app/apikey
   (sign in with any Google account, no billing setup needed)
7. **Add your keys locally**
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and fill in all four values — your Gemini key,
   and the three Supabase values from **Project Settings → API**. This
   file is gitignored — it will never be committed. 🔒
8. **Run it**
   ```bash
   npm run dev
   ```
   Open **http://localhost:3000** 🎉
9. **Test end-to-end**: sign up with a real email, confirm it (check
   your inbox), sign in, then generate in each tool, record a short
   meeting clip, and try downloading a result as PDF/Word.

> 💡 If sign-up fails, double check the three `NEXT_PUBLIC_SUPABASE_*`
> values and that step 4's schema actually ran without errors. If a
> tool's generation fails, the error returned by `/api/ai` will tell
> you what's wrong — usually a missing `GEMINI_API_KEY`, or a `429`
> meaning you've hit the free rate limit for the moment.

---

## 🌐 Day 2 — deploy it live, still free

_(aim: half a day)_

1. **Push to GitHub** and create a repo if you haven't already.
2. **Add your production redirect URL in Supabase** — Dashboard →
   **Authentication → URL Configuration** → add your future Vercel
   URL to **Redirect URLs** (needed for email confirmation and
   password-reset links to work once deployed).
3. **Deploy on Vercel**
   - Go to https://vercel.com → New Project → import your GitHub repo
   - Choose the **Hobby** plan — free for personal/non-commercial
     projects, and enough for this build
   - Vercel auto-detects Next.js — no config needed
   - Before deploying, go to **Settings → Environment Variables** and
     add all four values from your `.env.local`
   - Click **Deploy**
4. **Smoke test the live URL** exactly like Day 1, step 9.
5. Share the URL with your first few test users 🚢

---

## ⚠️ The free-tier tradeoffs — read this before sharing widely

Nothing here costs money, but "free" comes with real limits:

- **⏱️ Gemini rate limits.** The free tier caps requests per minute and
  per day, shared across everyone using your one API key. Fine for you
  and a handful of testers; a whole team hammering it at once will
  start seeing errors.
- **🔓 Gemini data usage.** On the free tier, Google may use prompts
  and outputs sent through the API to improve their models. Don't put
  real confidential company information through this until you've
  moved to a paid tier, which turns that off.
- **🔁 Model churn.** Google retires free-tier models fairly often. If
  `/api/ai` or `/api/transcribe` starts erroring with a "model not
  found"-style message, check
  https://ai.google.dev/gemini-api/docs/changelog and update the
  `MODEL` constant in the relevant route file.
- **🗄️ Supabase free-tier caps.** 500MB database and 1GB of file
  storage total — recorded meeting audio counts against that storage
  cap, so it's worth keeping an eye on if recording sees heavy use.
  A project also auto-pauses after ~7 days with no API activity
  (one click to un-pause, but worth knowing about).
- **📉 No uptime guarantee.** Free tiers can be deprioritized under
  load. Don't build anything time-critical on this without paid plans.

---

## 📦 What this version does and doesn't include

### ✅ Included

- All 5 tools working against a real, free AI model
- Responsive dashboard + sidebar, editable AI outputs
- **Real accounts** — Supabase Auth email/password sign-up and
  sign-in, with email confirmation and a full forgot/reset-password
  flow (including a show/hide toggle on password fields)
- **A shared database** — every generated draft (email, meeting
  summary, task plan, research brief) is saved server-side per user
  via Supabase, with Row Level Security so each user only ever sees
  their own data. Works across devices and browsers, not just one
  browser's storage.
- **Categorized history** — the sidebar's "Recent" feed and each
  tool's own history list are grouped by tool (Email / Meetings /
  Tasks / Research), not one mixed-together list
- **Download as PDF or Word (.docx)**, or copy to clipboard, for any
  generated result
- A secure server-side API key (never exposed to the browser)
- Server-side input validation and request timeouts
- A basic per-IP rate limit as a courtesy backstop on `/api/ai` and
  `/api/transcribe`
- Security response headers (`next.config.js`)
- Distinct error vs. success UI states with one-click retry
- Accessible form labels, page metadata/favicon
- 📎 PDF/text/Markdown document upload in the Research Assistant —
  parsed entirely client-side with pdf.js; the file itself is never
  uploaded anywhere, only its extracted text is sent to the AI
- 🎙️ In-browser meeting recording in the Meeting Summarizer: records
  locally via `MediaRecorder`, uploads the audio to `/api/transcribe`
  for Gemini to transcribe into the notes field, **and saves the
  original recording** to a private Supabase Storage bucket so it can
  be played back later from History. Capped at 15 minutes per
  recording (32kbps — a deliberate tradeoff for clearer, more accurate
  transcription over a longer cap; see the comment above
  `RECORD_BITS_PER_SECOND` in `components/Workspace.jsx` for the exact
  numbers).

### ❌ Not included yet

- **💬 Multiple chat conversations** — the chatbot is currently one
  ongoing thread per user (saved only in that browser's localStorage,
  not yet synced to Supabase). A `chat_threads` / `chat_messages`
  schema for multiple named conversations with a "New chat" button is
  staged in [`supabase/schema.sql`](./supabase/schema.sql) but not
  wired into the app yet.
- **✍️ Cross-device drafts-in-progress** — once you click Generate, the
  result is saved centrally (see above). The _unsent_ text you're
  actively typing into a tool's form, before generating, still lives
  only in that browser's localStorage.
- **🚦 Durable, cross-instance rate limiting** — the built-in limiter is
  in-memory and per server instance, so it resets on restart and won't
  coordinate across multiple serverless instances. The `usage_daily`
  table in the schema is staged to replace it (via
  `lib/supabase/admin.js`'s service-role client) but isn't wired into
  the API routes yet.
- **📄 Word document (.docx) upload** — the Research Assistant accepts
  PDF, `.txt`, and `.md` as reference documents; for `.docx`, paste the
  text in directly. (This is separate from _downloading_ a result as
  `.docx`, which is supported.)
- **💳 Billing / SSO** — not relevant yet at zero cost, but the natural
  next steps once you outgrow the free tier.

---

## 🔧 Changing the AI model

The model is set in `app/api/ai/route.js` and `app/api/transcribe/route.js`
(`const MODEL = "gemini-3.1-flash-lite"`). It's the current free-tier-
friendly choice as of this writing. For higher-quality output at the
cost of lower free-tier throughput, try `gemini-3.5-flash` — check
current options and limits at
https://ai.google.dev/gemini-api/docs/models before switching.

---

## 🧪 CI

Every push and pull request to `main` runs five automated checks
(`.github/workflows/ci.yml`): **build**, **lint**, **format**, a
dependency **security audit**, and a **secret-leak scan**. See the
Actions tab on GitHub.
