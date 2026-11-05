import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export function isSupabaseConfigured() {
  return getSupabasePublicConfig() !== null;
}

export async function createSupabaseServerClient(options: { requireCookieWrites?: boolean } = {}) {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (options.requireCookieWrites) {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => cookieStore.set(name, value, cookieOptions));
          return;
        }
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; Server Actions can refresh them.
        }
      },
    },
  });
}