export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
    "";

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();

  if (!url || !anonKey) {
    return false;
  }

  const hasValidProtocol =
    url.startsWith("https://") || url.startsWith("http://");
  if (!hasValidProtocol) {
    return false;
  }

  const normalizedUrl = url.toLowerCase();
  const normalizedKey = anonKey.toLowerCase();

  if (
    normalizedUrl.includes("your-project") ||
    normalizedUrl.includes("placeholder") ||
    normalizedKey.includes("your-anon-key") ||
    normalizedKey.includes("placeholder")
  ) {
    return false;
  }

  return anonKey.length > 10;
}
