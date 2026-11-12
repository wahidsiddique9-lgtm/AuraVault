export type SupabasePublicConfig = { url: string; anonKey: string };
export type SupabasePublicConfigDiagnostic = {
  urlPresent: boolean;
  keyPresent: boolean;
  urlValid: boolean;
  keyFormatValid: boolean;
  reasonCodes: string[];
};

export function getSupabasePublicConfigState() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const urlPresent = Boolean(url);
  const keyPresent = Boolean(anonKey);
  const urlValid = Boolean(url && isValidUrl(url));
  const keyFormatValid = Boolean(anonKey && isValidAnonKey(anonKey));
  const reasonCodes: string[] = [];

  if (!urlPresent) reasonCodes.push("URL_MISSING");
  else if (!urlValid) reasonCodes.push("URL_INVALID");
  if (!keyPresent) reasonCodes.push("KEY_MISSING");
  else if (!keyFormatValid) reasonCodes.push("KEY_FORMAT_INVALID");
  if (urlValid && keyFormatValid) reasonCodes.push("CONFIG_VALID");

  return {
    config: url && anonKey && urlValid && keyFormatValid ? { url, anonKey } : null,
    diagnostic: { urlPresent, keyPresent, urlValid, keyFormatValid, reasonCodes },
  };
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  return getSupabasePublicConfigState().config;
}

function isValidUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const isLocalDevelopment = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    return parsedUrl.protocol === "https:" || (isLocalDevelopment && parsedUrl.protocol === "http:");
  } catch {
    return false;
  }
}

function isValidAnonKey(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return true;
  const segments = key.split(".");
  return key.length >= 100 && segments.length === 3 && segments.every((segment) => /^[A-Za-z0-9_-]+$/.test(segment));
}