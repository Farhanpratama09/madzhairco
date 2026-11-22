import { NextRequest, NextResponse } from "next/server";
import {
  MAX_CUSTOMER_NAME_CHARS,
  MAX_PAYLOAD_CHARS,
  validateHttpsMediaUrl,
  validateOptionalTextNote,
  validateSocialEmbedUrl,
} from "@/lib/security/sanitize";
import { createClient } from "@/lib/supabase/server";

interface CreateGalleryItemBody {
  title?: unknown;
  mediaType?: unknown;
  mediaUrl?: unknown;
  thumbnailUrl?: unknown;
  caption?: unknown;
  sortOrder?: unknown;
}

const IG_FETCH_TIMEOUT_MS = 4000;

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
      // Ignore generic Instagram static brand icon placeholders
      if (
        candidate.includes("static.cdninstagram.com/rsrc.php") ||
        candidate.includes("instagram.com/static/images/")
      ) {
        continue;
      }
      const validated = validateHttpsMediaUrl(candidate);
      if (validated.valid && validated.url) {
        return validated.url;
      }
    }
  }

  return null;
}

async function fetchInstagramOgImage(socialUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IG_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(socialUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (response.ok) {
      const html = await response.text();
      const extracted = extractOgImageFromHtml(html);
      if (extracted) {
        return extracted;
      }
    }

    // Fallback attempt via public /embed/ page within the same 4s timeout window
    const parsed = new URL(socialUrl);
    const match = parsed.pathname.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
    if (match?.[1] && match?.[2] && !controller.signal.aborted) {
      const embedUrl = `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
      const embedRes = await fetch(embedUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (embedRes.ok) {
        const embedHtml = await embedRes.text();
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
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      { error: "Tipe media tidak valid (gunakan photo atau instagram)." },
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
            "URL Instagram Reels wajib menggunakan protokol https:// resmi.",
        },
        { status: 400 }
      );
    }
    validatedMediaUrl = socialCheck.url;
  } else {
    const httpsCheck = validateHttpsMediaUrl(body.mediaUrl);
    if (!httpsCheck.valid || !httpsCheck.url) {
      return NextResponse.json(
        {
          error:
            httpsCheck.error ??
            "URL foto galeri wajib menggunakan protokol https://.",
        },
        { status: 400 }
      );
    }
    validatedMediaUrl = httpsCheck.url;
  }

  let validatedThumbUrl: string | null = null;
  if (
    body.thumbnailUrl !== undefined &&
    body.thumbnailUrl !== null &&
    body.thumbnailUrl !== ""
  ) {
    const thumbCheck = validateHttpsMediaUrl(body.thumbnailUrl);
    if (!thumbCheck.valid || !thumbCheck.url) {
      return NextResponse.json(
        {
          error:
            thumbCheck.error ??
            "URL thumbnail wajib menggunakan protokol https://.",
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
    return NextResponse.json(
      { error: error?.message ?? "Gagal menyimpan item galeri." },
      { status: 400 }
    );
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
