-- Deskmate AI — Supabase schema
--
-- Run this once in your Supabase project's SQL Editor (Dashboard →
-- SQL Editor → New query → paste this whole file → Run). It's
-- idempotent-ish (uses "if not exists" / "or replace" where it can),
-- but it's meant to be run once against a fresh project, not repeatedly
-- against one that already has data.
--
-- What this replaces, from the current localStorage-only build:
--   - aiw_user            -> auth.users + public.profiles
--   - aiw_email/meetings/  -> public.generations (one row per tool,
--     tasks/research         look up by user_id + tool)
--   - aiw_history          -> public.generations (same table — the
--                             "current draft" and "history" were
--                             always the same data, just duplicated)
--   - aiw_chat             -> public.chat_threads + public.chat_messages
--   - in-memory rate limit -> public.usage_daily (see note near the
--                             bottom — this table alone doesn't do
--                             rate limiting, the API route has to use it)
--
-- Covers both AI endpoints the app calls: /api/ai (text — email,
-- meeting, task, research, chat) and /api/transcribe (audio — the
-- Meeting Summarizer's "Record a meeting" button). The transcript text
-- always lands in `generations` like everything else; the original
-- recording itself is kept too, in the private `meeting-recordings`
-- storage bucket (see the "Storage" section below), referenced by
-- `generations.audio_path`.
--
-- Auth itself is NOT a table you create — Supabase Auth already
-- manages `auth.users` (email/password, magic link, OAuth, etc. — pick
-- whichever sign-in methods you want in Dashboard → Authentication →
-- Providers). Everything below just extends it.

create extension if not exists "pgcrypto"; -- gives us gen_random_uuid()

-- ---------------------------------------------------------------
-- profiles — the "name / company" fields the current sign-in screen
-- collects. One row per user, created automatically on signup.
-- ---------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-creates a profile row the moment someone signs up, pulling
-- name/company out of the metadata your sign-up call passes in
-- (e.g. supabase.auth.signUp({ ..., options: { data: { name, company } } })).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, company)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'company'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- generations — one row per successful AI generation, across every
-- tool. This is the "History" feature: the sidebar's Recent feed and
-- each tool's own history list are both just filtered views of this
-- one table (tool = 'email'/'meetings'/'tasks'/'research').
-- ---------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tool_name') then
    create type public.tool_name as enum ('email', 'meetings', 'tasks', 'research');
  end if;
end $$;

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tool public.tool_name not null,
  label text not null,          -- short title shown in history lists
  inputs jsonb not null default '{}'::jsonb, -- the form fields, so "restore" can refill them
  output text not null,
  -- How the input content originated. Only meaningful for 'meetings'
  -- (typed vs. recorded-then-transcribed) and 'research' (typed vs. a
  -- question about an uploaded file) today, but kept generic so it
  -- doesn't need a migration if another tool grows an alternate input
  -- path later.
  source text not null default 'typed' check (source in ('typed', 'recording', 'upload')),
  -- Path of the original recording in the meeting-recordings storage
  -- bucket below (see "Storage" section) — only set for 'meetings' rows
  -- where source = 'recording'. Every other row leaves this null: audio
  -- is never stored for typed input or the other three tools.
  audio_path text,
  created_at timestamptz not null default now()
);

-- Powers "give me this user's most recent N across all tools" (sidebar)
-- and "this user's history for tool X" (each tool's own page).
create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);
create index if not exists generations_user_tool_created_idx
  on public.generations (user_id, tool, created_at desc);

-- ---------------------------------------------------------------
-- Storage — a private bucket for the Meeting Summarizer's recorded
-- audio. Previously recordings were transcribed and immediately
-- discarded; this keeps the original file so it can be played back
-- later. Objects are keyed "<user_id>/<filename>", and the RLS
-- policies below use that first path segment to scope every read/
-- write/delete to the owning user — the same pattern as every other
-- table in this file, just expressed via storage.foldername() instead
-- of a user_id column.
-- ---------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('meeting-recordings', 'meeting-recordings', false)
on conflict (id) do nothing;

drop policy if exists "meeting_recordings_select_own" on storage.objects;
create policy "meeting_recordings_select_own" on storage.objects
  for select using (
    bucket_id = 'meeting-recordings' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "meeting_recordings_insert_own" on storage.objects;
create policy "meeting_recordings_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'meeting-recordings' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "meeting_recordings_delete_own" on storage.objects;
create policy "meeting_recordings_delete_own" on storage.objects
  for delete using (
    bucket_id = 'meeting-recordings' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------
-- chat_threads / chat_messages — the AI Chatbot's conversations.
-- Each user can have any number of named threads (the "New chat"
-- button creates one; the sidebar's chat history lists them by most
-- recently active). chat_messages.thread_id scopes every message to
-- one thread instead of one flat per-user log.
-- ---------------------------------------------------------------

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_threads_user_updated_idx
  on public.chat_threads (user_id, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at asc);

-- Keeps chat_threads.updated_at current every time a message is added,
-- so "most recently active" ordering in the sidebar is just an
-- ORDER BY on chat_threads — no need to join chat_messages for it.
create or replace function public.touch_chat_thread()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.chat_threads set updated_at = now() where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_touch_thread on public.chat_messages;
create trigger chat_messages_touch_thread
  after insert on public.chat_messages
  for each row execute function public.touch_chat_thread();

-- ---------------------------------------------------------------
-- usage_daily — per-user, per-day, per-endpoint request counter. This
-- is what lets rate limiting survive a server restart and work across
-- multiple serverless instances, unlike the current in-memory Maps in
-- app/api/ai/route.js and app/api/transcribe/route.js. The table alone
-- does nothing by itself — each route needs to read+increment its own
-- row (via the service-role key, server-side only) and reject once
-- over its limit. Not wired up yet; this just reserves the shape.
--
-- request_type is split ('text' vs 'audio') because the two routes
-- already enforce different limits in code (10/min vs 6/min — audio
-- requests are heavier) — one shared counter couldn't express that.
-- ---------------------------------------------------------------

create table if not exists public.usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default current_date,
  request_type text not null default 'text' check (request_type in ('text', 'audio')),
  request_count int not null default 0,
  primary key (user_id, usage_date, request_type)
);

-- ---------------------------------------------------------------
-- Row Level Security — every table above holds per-user data, so
-- each user should only ever see their own rows. Without this,
-- Supabase's client-side SDK (using the public "anon" key) would let
-- any signed-in user read everyone's drafts and chat history.
-- ---------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.generations enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.usage_daily enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "generations_select_own" on public.generations;
create policy "generations_select_own" on public.generations
  for select using (auth.uid() = user_id);

drop policy if exists "generations_insert_own" on public.generations;
create policy "generations_insert_own" on public.generations
  for insert with check (auth.uid() = user_id);

drop policy if exists "generations_delete_own" on public.generations;
create policy "generations_delete_own" on public.generations
  for delete using (auth.uid() = user_id);

drop policy if exists "chat_threads_select_own" on public.chat_threads;
create policy "chat_threads_select_own" on public.chat_threads
  for select using (auth.uid() = user_id);

drop policy if exists "chat_threads_insert_own" on public.chat_threads;
create policy "chat_threads_insert_own" on public.chat_threads
  for insert with check (auth.uid() = user_id);

drop policy if exists "chat_threads_update_own" on public.chat_threads;
create policy "chat_threads_update_own" on public.chat_threads
  for update using (auth.uid() = user_id);

drop policy if exists "chat_threads_delete_own" on public.chat_threads;
create policy "chat_threads_delete_own" on public.chat_threads
  for delete using (auth.uid() = user_id);

drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own" on public.chat_messages
  for select using (auth.uid() = user_id);

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own" on public.chat_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own" on public.chat_messages
  for delete using (auth.uid() = user_id);

-- usage_daily has NO client-facing insert/update policy on purpose —
-- only a user's own row can be read (e.g. to show "X of 50 requests
-- used today" in the UI); writes must go through the server-side
-- service-role client in the API route, never the browser.
drop policy if exists "usage_daily_select_own" on public.usage_daily;
create policy "usage_daily_select_own" on public.usage_daily
  for select using (auth.uid() = user_id);
