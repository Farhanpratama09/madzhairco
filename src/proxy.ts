import { createServerClient } from "@supabase/ssr";
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

function createRedirectResponse(
  targetUrl: URL,
  sourceResponse: NextResponse
): NextResponse {
  const redirectResponse = NextResponse.redirect(targetUrl);

  // Preserve any refreshed or cleared auth cookies on redirect
  for (const cookie of sourceResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }

  applySecurityHeaders(redirectResponse.headers);
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const { pathname } = request.nextUrl;

  if (isAdminRoute(pathname)) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const onLoginPage = isAdminLoginRoute(pathname);

    if (!supabaseUrl || !supabaseAnonKey) {
      if (!onLoginPage) {
        return createRedirectResponse(
          new URL(ADMIN_LOGIN_PATH, request.url),
          response
        );
      }

      applySecurityHeaders(response.headers);
      return response;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    let user = null;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error) {
        user = data.user;
      }
    } catch {
      user = null;
    }

    if (!user && !onLoginPage) {
      return createRedirectResponse(
        new URL(ADMIN_LOGIN_PATH, request.url),
        response
      );
    }

    if (user && onLoginPage) {
      return createRedirectResponse(
        new URL(ADMIN_HOME_PATH, request.url),
        response
      );
    }
  }

  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
