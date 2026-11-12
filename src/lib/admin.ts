import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminSessionOptions = { requireCookieWrites?: boolean };

export class AdminAuthUnavailableError extends Error {
  constructor() {
    super("Admin session verification is temporarily unavailable.");
    this.name = "AdminAuthUnavailableError";
  }
}

export function safeAuthErrorDetails(error: unknown) {
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

export function isRetryableSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return true;
  const details = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  if (details.name === "AuthRetryableFetchError" || details.code === "refresh_token_already_used") return true;
  if (typeof details.status === "number") return details.status === 429 || details.status >= 500;
  return details.code === "request_timeout" ||
    (typeof details.message === "string" && /network|fetch|timeout|temporar/i.test(details.message));
}

function isMissingSessionError(error: { name?: string; status?: number; code?: string }) {
  if (isRetryableSupabaseError(error)) return false;
  const invalidSessionCodes = new Set([
    "bad_jwt",
    "invalid_refresh_token",
    "invalid_token",
    "refresh_token_not_found",
    "session_expired",
    "session_not_found",
    "user_not_found",
  ]);
  return error.name === "AuthSessionMissingError" ||
    (typeof error.code === "string" && invalidSessionCodes.has(error.code)) ||
    (error.name === "AuthApiError" && error.status === 401);
}

export async function requireAuthenticatedUser(options: AdminSessionOptions = {}) {
  let supabase;
  try {
    supabase = await createSupabaseServerClient(options);
  } catch (error) {
    console.warn("[auth] Admin Supabase client setup failed", safeAuthErrorDetails(error));
    throw new AdminAuthUnavailableError();
  }
  if (!supabase) redirect("/admin/login?setup=required");

  let result;
  try {
    result = await supabase.auth.getUser();
  } catch (error) {
    console.warn("[auth] Admin user lookup threw", safeAuthErrorDetails(error));
    throw new AdminAuthUnavailableError();
  }
  const { data: { user }, error } = result;
  if (error) {
    console.warn("[auth] Admin user lookup failed", safeAuthErrorDetails(error));
    if (isMissingSessionError(error)) redirect("/admin/login");
    throw new AdminAuthUnavailableError();
  }
  if (!user) {
    console.warn("[auth] Admin request has no authenticated user");
    redirect("/admin/login");
  }

  return { supabase, user };
}

export async function requireAdmin(options: AdminSessionOptions = {}) {
  const { supabase, user } = await requireAuthenticatedUser(options);

  const metadata = user.app_metadata as Record<string, unknown>;
  if (metadata.role !== "admin" && metadata.is_admin !== true) {
    console.warn("[auth] Admin access denied", {
      roleClaimPresent: metadata.role === "admin",
      booleanAdminClaimPresent: metadata.is_admin === true,
    });
    redirect("/admin/login?unauthorized=1");
  }
  return { supabase, user };
}

export async function requireAdminForAction(returnPath: "/admin" | "/admin/articles") {
  try {
    return await requireAdmin({ requireCookieWrites: true });
  } catch (error) {
    if (error instanceof AdminAuthUnavailableError) redirect(`${returnPath}?status=auth-unavailable`);
    throw error;
  }
}
