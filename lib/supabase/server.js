import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// A Supabase client for use inside Route Handlers (app/api/*/route.js
// only — this app has no Server Components that need it yet). Reads
// the caller's session from cookies, so RLS applies exactly as it
// would for a direct client-side query, and auth.getUser() reflects
// who's actually signed in.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Route Handlers can write cookies — this only fails if called
            // somewhere without response-writing context. Safe to ignore.
          }
        },
      },
    },
  );
}
