import { NextRequest, NextResponse } from "next/server";

export interface VerifySameOriginOptions {
  /**
   * When true (default), enforces `Content-Type: application/json`.
   * When false (bodyless POST triggers), still enforces `Content-Type: application/json`
   * if a non-empty request body (`content-length > 0`) is sent.
   */
  requireJsonBody?: boolean;
}

function getExpectedOrigins(request: NextRequest): Set<string> {
  const allowed = new Set<string>();
  if (request.nextUrl.origin && request.nextUrl.origin !== "null") {
    allowed.add(request.nextUrl.origin.toLowerCase());
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim() || "";
  if (host) {
    const forwardedProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    const proto =
      forwardedProto ||
      request.nextUrl.protocol.replace(/:$/, "") ||
      "https";
    allowed.add(`${proto}://${host}`.toLowerCase());
  }

  return allowed;
}

/**
 * Protects authenticated mutation endpoints (`/api/admin/**`) against CSRF:
 * 1. Rejects cross-site Fetch Metadata (`Sec-Fetch-Site` !== `same-origin`).
 * 2. Requires a valid `Origin` header matching the server's own origin.
 * 3. Enforces `Content-Type: application/json` when a JSON payload is expected or present.
 *
 * Returns `null` when valid, or a `NextResponse` (403 / 415) when blocked.
 */
export function verifySameOriginMutation(
  request: NextRequest,
  options?: VerifySameOriginOptions
): NextResponse | null {
  const requireJsonBody = options?.requireJsonBody ?? true;

  const secFetchSite = request.headers
    .get("sec-fetch-site")
    ?.trim()
    .toLowerCase();
  if (secFetchSite && secFetchSite !== "same-origin") {
    return NextResponse.json(
      { error: "Permintaan lintas situs (CSRF) ditolak." },
      { status: 403 }
    );
  }

  const rawOrigin = request.headers.get("origin")?.trim() ?? "";
  if (!rawOrigin || rawOrigin === "null") {
    return NextResponse.json(
      { error: "Header Origin wajib disertakan untuk aksi perubahan data." },
      { status: 403 }
    );
  }

  let parsedOrigin: string;
  try {
    parsedOrigin = new URL(rawOrigin).origin.toLowerCase();
  } catch {
    return NextResponse.json(
      { error: "Header Origin tidak valid." },
      { status: 403 }
    );
  }

  const expectedOrigins = getExpectedOrigins(request);
  if (!expectedOrigins.has(parsedOrigin)) {
    return NextResponse.json(
      { error: "Origin permintaan tidak diizinkan." },
      { status: 403 }
    );
  }

  const contentType =
    request.headers.get("content-type")?.toLowerCase() ?? "";
  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10
  );
  const hasBodyBytes = Number.isFinite(contentLength) && contentLength > 0;

  if ((requireJsonBody || hasBodyBytes) && !contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type wajib application/json." },
      { status: 415 }
    );
  }

  return null;
}
