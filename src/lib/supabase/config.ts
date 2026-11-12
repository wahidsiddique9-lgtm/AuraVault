export type SupabasePublicConfig = { url: string; anonKey: string };

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey || !isValidAnonKey(anonKey)) return null;

  try {
    const parsedUrl = new URL(url);
    const isLocalDevelopment = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    if (parsedUrl.protocol !== "https:" && !(isLocalDevelopment && parsedUrl.protocol === "http:")) return null;
  } catch {
    return null;
  }

  return { url, anonKey };
}

function isValidAnonKey(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return true;
  const segments = key.split(".");
  return key.length >= 100 && segments.length === 3 && segments.every((segment) => /^[A-Za-z0-9_-]+$/.test(segment));
}