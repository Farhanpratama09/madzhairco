import { NextResponse, type NextRequest } from "next/server";
import { applySecurityHeaders } from "@/lib/security/headers";

const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_HOME_PATH = "/admin";

function isAdminLoginRoute(pathname: string): boolean {
  return (
    pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`)
  );
}

function isAdminRoute(pathname: string): boolean {
  return pathname === ADMIN_HOME_PATH || pathname.startsWith(`${ADMIN_HOME_PATH}/`);
}

function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") &&
        cookie.name.includes("-auth-token") &&
        cookie.value.length > 0
    );
}

function createRedirectResponse(targetUrl: URL): NextResponse {
  const redirectResponse = NextResponse.redirect(targetUrl);
  applySecurityHeaders(redirectResponse.headers);
  return redirectResponse;
}

/**
 * Fast edge proxy:
 * - Injects HTTP security headers & CSP on all matched routes.
 * - Performs fast fail-closed cookie gate for /admin/* without redundant auth network roundtrips
 *   (full authoritative `supabase.auth.getUser()` runs once inside Server Components & API routes).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAdminRoute(pathname)) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const onLoginPage = isAdminLoginRoute(pathname);

    if (!supabaseUrl || !supabaseAnonKey) {
      if (!onLoginPage) {
        return createRedirectResponse(new URL(ADMIN_LOGIN_PATH, request.url));
      }
    } else if (!onLoginPage && !hasSupabaseSessionCookie(request)) {
      return createRedirectResponse(new URL(ADMIN_LOGIN_PATH, request.url));
    }
  }

  const response = NextResponse.next({
    request,
  });
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
