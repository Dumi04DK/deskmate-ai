# Supabase setup

This schema isn't wired into the app yet — it's staged so you can run it
the moment your Supabase project exists, without blocking on that to
keep building. The app still runs entirely on localStorage until we do
the follow-up integration step described below.

## 1. Create the project

[supabase.com](https://supabase.com) → New project (free tier: 500MB
database, 50k monthly active users, no credit card). Note your project
URL and the two API keys (Settings → API) — you'll need them for step 3.

## 2. Run the schema

Dashboard → **SQL Editor** → New query → paste the entire contents of
[`schema.sql`](./schema.sql) → **Run**. It creates:

| Table | Replaces (localStorage key) | Purpose |
|---|---|---|
| `profiles` | `aiw_user` | Name/company shown in the sidebar |
| `generations` | `aiw_email`, `aiw_meetings`, `aiw_tasks`, `aiw_research`, `aiw_history` | Every AI generation — powers both the current-draft view and the History lists |
| `chat_messages` | `aiw_chat` | The chatbot's conversation |
| `usage_daily` | *(new)* | Per-user daily request counter, for real rate limiting |

Row Level Security is enabled on all four — each signed-in user can
only ever read/write their own rows.

## 3. Turn on email/password sign-in

Dashboard → **Authentication → Providers** → Email is on by default.
(Add Google/GitHub OAuth here too if you want those later — no schema
change needed, `profiles` picks up any provider automatically via the
`on_auth_user_created` trigger.)

## 4. What the code-side integration will involve (not done yet)

When you're ready to actually connect the app:

1. `npm install @supabase/supabase-js @supabase/ssr`
2. Add three env vars (`.env.local` + your host's env settings):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe to
   expose to the browser — RLS is what actually protects the data),
   and `SUPABASE_SERVICE_ROLE_KEY` (server-only, never sent to the
   browser — needed for `usage_daily` writes).
3. Replace `SignIn.jsx`'s local name-only form with real
   `supabase.auth.signUp()` / `signInWithPassword()` calls.
4. Replace every `usePersistentState("aiw_*", …)` call and the
   `aiw_history` read/write helpers in `Workspace.jsx` with Supabase
   queries against `generations` / `chat_messages`.
5. In `app/api/ai/route.js`, swap the in-memory `rateLimitBuckets` Map
   for a read-then-increment against `usage_daily` using the
   service-role client.

That's a separate, focused piece of work — happy to do it as soon as
the project is live and you've shared the URL/keys (as env vars, not
pasted in chat).
