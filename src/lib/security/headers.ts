/**
 * HTTP Security Headers and Content-Security-Policy (CSP) builder
 * for Madzhair.co.
 */

export function buildCspHeader(): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.tiktok.com https://*.tiktok.com https://www.instagram.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https://*.tiktok.com https://*.cdninstagram.com https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.tiktok.com https://*.tiktok.com https://www.instagram.com https://www.google.com https://maps.google.com https://maps.app.goo.gl",
    "frame-src 'self' https://*.supabase.co https://www.tiktok.com https://*.tiktok.com https://www.instagram.com https://www.google.com https://maps.google.com https://maps.app.goo.gl",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  return directives.join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": buildCspHeader(),
};

export function applySecurityHeaders(headers: Headers): Headers {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return headers;
}
