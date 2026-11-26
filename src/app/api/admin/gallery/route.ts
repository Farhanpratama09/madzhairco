import { NextRequest, NextResponse } from "next/server";
import { verifySameOriginMutation } from "@/lib/security/origin";
import {
  MAX_CUSTOMER_NAME_CHARS,
  MAX_PAYLOAD_CHARS,
  validateAllowedGalleryImageUrl,
  validateOptionalTextNote,
  validateSocialEmbedUrl,
} from "@/lib/security/sanitize";
import { requireAdminSession } from "@/lib/supabase/admin-auth";

interface CreateGalleryItemBody {
  title?: unknown;
  mediaType?: unknown;
  mediaUrl?: unknown;
  thumbnailUrl?: unknown;
  caption?: unknown;
  sortOrder?: unknown;
}

const IG_FETCH_TIMEOUT_MS = 4000;
const MAX_IG_HTML_BYTES = 512 * 1024; // 512 KB cap against memory exhaustion
const MAX_IG_REDIRECTS = 3;

function isStrictInstagramPageUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password || parsed.port) return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === "www.instagram.com" ||
      host === "instagram.com" ||
      host === "m.instagram.com"
    );
  } catch {
    return false;
  }
}

async function readBoundedHtml(
  response: Response,
  maxBytes: number
): Promise<string | null> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml")
  ) {
    return null;
  }

  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = maxBytes - totalBytes;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        totalBytes += remaining;
        await reader.cancel();
        break;
      }

      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } catch {
    return totalBytes > 0 ? new TextDecoder("utf-8").decode(concatChunks(chunks, totalBytes)) : null;
  }

  return new TextDecoder("utf-8").decode(concatChunks(chunks, totalBytes));
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function fetchSafeInstagramHtml(
  targetUrl: string,
  signal: AbortSignal,
  userAgent: string
): Promise<string | null> {
  let currentUrl = targetUrl;

  for (let hop = 0; hop <= MAX_IG_REDIRECTS; hop += 1) {
    if (!isStrictInstagramPageUrl(currentUrl) || signal.aborted) {
      return null;
    }

    const res = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return null;
      }
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return null;
      }
      continue;
    }

    if (!res.ok) {
      return null;
    }

    return readBoundedHtml(res, MAX_IG_HTML_BYTES);
  }

  return null;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&#38;/gi, "&")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .trim();
}

function extractOgImageFromHtml(html: string): string | null {
  const patterns: RegExp[] = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<img[^>]+class=["'][^"']*EmbeddedMediaImage[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /"display_url"\s*:\s*"(https:[^"]+)"/i,
  ];

  for (const regex of patterns) {
    const match = html.match(regex);
    if (match?.[1]) {
      const candidate = decodeHtmlEntities(match[1]);
      if (
        candidate.includes("static.cdninstagram.com/rsrc.php") ||
        candidate.includes("instagram.com/static/images/")
      ) {
        continue;
      }
      const validated = validateAllowedGalleryImageUrl(candidate);
      if (validated.valid && validated.url) {
        return validated.url;
      }
    }
  }

  return null;
}

async function fetchInstagramOgImage(socialUrl: string): Promise<string | null> {
  if (!isStrictInstagramPageUrl(socialUrl)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IG_FETCH_TIMEOUT_MS);

  try {
    const html = await fetchSafeInstagramHtml(
      socialUrl,
      controller.signal,
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
    );
    if (html) {
      const extracted = extractOgImageFromHtml(html);
      if (extracted) {
        return extracted;
      }
    }

    const parsed = new URL(socialUrl);
    const match = parsed.pathname.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
    if (match?.[1] && match?.[2] && !controller.signal.aborted) {
      const embedUrl = `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
      const embedHtml = await fetchSafeInstagramHtml(
        embedUrl,
        controller.signal,
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
      );
      if (embedHtml) {
        const extractedFromEmbed = extractOgImageFromHtml(embedHtml);
        if (extractedFromEmbed) {
          return extractedFromEmbed;
        }
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const originError = verifySameOriginMutation(request);
  if (originError) {
    return originError;
  }

  const adminSession = await requireAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json(
      { error: adminSession.error },
      { status: adminSession.status }
    );
  }
  const { supabase } = adminSession;

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Payload request tidak dapat dibaca." },
      { status: 400 }
    );
  }

  if (rawText.length > MAX_PAYLOAD_CHARS) {
    return NextResponse.json(
      {
        error: `Ukuran payload melebihi batas maksimum (${MAX_PAYLOAD_CHARS} karakter).`,
      },
      { status: 400 }
    );
  }

  let body: CreateGalleryItemBody;
  try {
    body = JSON.parse(rawText) as CreateGalleryItemBody;
  } catch {
    return NextResponse.json(
      { error: "Format payload JSON tidak valid." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Data item galeri wajib diisi." },
      { status: 400 }
    );
  }

  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  if (rawTitle.length > MAX_CUSTOMER_NAME_CHARS) {
    return NextResponse.json(
      { error: `Judul galeri maksimal ${MAX_CUSTOMER_NAME_CHARS} karakter.` },
      { status: 400 }
    );
  }
  const cleanTitle =
    rawTitle
      .replace(/[<>]/g, " ")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
      .replace(/[\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "Karya Madzhair Barber & Co";

  const mediaType =
    typeof body.mediaType === "string" ? body.mediaType.trim() : "";
  if (
    mediaType !== "photo" &&
    mediaType !== "instagram" &&
    mediaType !== "tiktok"
  ) {
    return NextResponse.json(
      { error: "Tipe media tidak valid (gunakan photo, instagram, atau tiktok)." },
      { status: 400 }
    );
  }

  let validatedMediaUrl = "";
  if (mediaType === "instagram" || mediaType === "tiktok") {
    const socialCheck = validateSocialEmbedUrl(body.mediaUrl);
    if (!socialCheck.valid || !socialCheck.url) {
      return NextResponse.json(
        {
          error:
            socialCheck.error ??
            "URL media sosial wajib menggunakan protokol https:// resmi.",
        },
        { status: 400 }
      );
    }
    validatedMediaUrl = socialCheck.url;
  } else {
    const photoCheck = validateAllowedGalleryImageUrl(body.mediaUrl);
    if (!photoCheck.valid || !photoCheck.url) {
      return NextResponse.json(
        {
          error:
            photoCheck.error ??
            "URL foto galeri wajib berasal dari penyimpanan resmi studio.",
        },
        { status: 400 }
      );
    }
    validatedMediaUrl = photoCheck.url;
  }

  let validatedThumbUrl: string | null = null;
  if (
    body.thumbnailUrl !== undefined &&
    body.thumbnailUrl !== null &&
    body.thumbnailUrl !== ""
  ) {
    const thumbCheck = validateAllowedGalleryImageUrl(body.thumbnailUrl);
    if (!thumbCheck.valid || !thumbCheck.url) {
      return NextResponse.json(
        {
          error:
            thumbCheck.error ??
            "URL thumbnail wajib berasal dari domain gambar resmi.",
        },
        { status: 400 }
      );
    }
    validatedThumbUrl = thumbCheck.url;
  } else if (mediaType === "instagram") {
    validatedThumbUrl = await fetchInstagramOgImage(validatedMediaUrl);
  }

  const captionCheck = validateOptionalTextNote(
    body.caption,
    "Keterangan galeri"
  );
  if (!captionCheck.valid) {
    return NextResponse.json(
      { error: captionCheck.error ?? "Keterangan galeri maksimal 200 karakter." },
      { status: 400 }
    );
  }

  const sortOrder =
    typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
      ? Math.max(0, Math.round(body.sortOrder))
      : 1;

  const { data, error } = await supabase
    .from("gallery_items")
    .insert({
      title: cleanTitle,
      media_type: mediaType,
      media_url: validatedMediaUrl,
      thumbnail_url: validatedThumbUrl,
      caption: captionCheck.value,
      sort_order: sortOrder,
      is_active: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[admin/gallery] Insert error:", error?.code, error?.message);
    return NextResponse.json(
      { error: "Gagal menyimpan item galeri. Periksa kembali format data." },
      { status: 400 }
    );
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
