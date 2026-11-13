import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig, getSupabasePublicConfigState } from "@/lib/supabase/config";

export class SupabaseCookieAccessError extends Error {
  constructor() {
    super("Supabase cookie access failed.");
    this.name = "SupabaseCookieAccessError";
  }
}

export class SupabaseCookieWriteError extends Error {
  constructor() {
    super("Supabase cookie write failed.");
    this.name = "SupabaseCookieWriteError";
  }
}

export function isSupabaseConfigured() {
  return getSupabasePublicConfig() !== null;
}

async function createClient(config: NonNullable<ReturnType<typeof getSupabasePublicConfig>>, options: { requireCookieWrites?: boolean }) {
  let cookieStore;
  try {
    cookieStore = await cookies();
  } catch {
    throw new SupabaseCookieAccessError();
  }
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (options.requireCookieWrites) {
          try {
            cookiesToSet.forEach(({ name, value, options: cookieOptions }) => cookieStore.set(name, value, cookieOptions));
          } catch {
            throw new SupabaseCookieWriteError();
          }
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

export async function createSupabaseServerClient(options: { requireCookieWrites?: boolean } = {}) {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  return createClient(config, options);
}

export async function createSupabaseServerClientWithDiagnostic(options: { requireCookieWrites?: boolean } = {}) {
  const { config, diagnostic } = getSupabasePublicConfigState();
  const client = config ? await createClient(config, options) : null;
  return { client, diagnostic };
}