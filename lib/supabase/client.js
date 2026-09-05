"use client";

import { createBrowserClient } from "@supabase/ssr";

// The browser-side Supabase client. Session is stored in cookies (not
// localStorage) so the same session is readable server-side in Route
// Handlers via lib/supabase/server.js — needed for per-user rate
// limiting and any server-side RLS-scoped query.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
