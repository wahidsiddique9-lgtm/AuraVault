import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

function safeAuthErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { name: error instanceof Error ? error.name : "UnknownError", status: null, code: null };
  }
  const details = error as { name?: unknown; status?: unknown; code?: unknown };
  return {
    name: typeof details.name === "string" ? details.name : "UnknownError",
    status: typeof details.status === "number" ? details.status : null,
    code: typeof details.code === "string" ? details.code : null,
  };
}

export async function proxy(request: NextRequest) {
  const config = getSupabasePublicConfig();
  if (!config) return NextResponse.next({ request });

  const hasAuthCookie = request.cookies.getAll().some(({ name }) => name.includes("-auth-token"));
  let response = NextResponse.next({ request });
  const pendingCookies = new Map<string, { name: string; value: string; options: Record<string, unknown> }>();
  const pendingHeaders = new Map<string, string>();
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          const cookieKey = `${name}:${options.path ?? "/"}:${options.domain ?? ""}`;
          pendingCookies.set(cookieKey, { name, value, options });
        });
        Object.entries(headersToSet).forEach(([name, value]) => pendingHeaders.set(name, value));
        response = NextResponse.next({ request });
        pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        pendingHeaders.forEach((value, name) => response.headers.set(name, value));
      },
    },
  });

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (request.nextUrl.pathname !== "/admin/login" && (error || !user)) {
      console.warn("[auth] Admin proxy did not resolve a user", {
        authCookiePresent: hasAuthCookie,
        ...safeAuthErrorDetails(error),
      });
    }
  } catch (error) {
    console.warn("[auth] Admin proxy session refresh failed", {
      authCookiePresent: hasAuthCookie,
      ...safeAuthErrorDetails(error),
    });
  }
  return response;
}

export const config = { matcher: ["/admin/:path*"] };