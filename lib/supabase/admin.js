import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses Row Level Security entirely. Only
// ever import this from server-side code (Route Handlers), and only
// for the specific writes RLS deliberately blocks from the browser
// (usage_daily). SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix,
// so it's never bundled to the client.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
