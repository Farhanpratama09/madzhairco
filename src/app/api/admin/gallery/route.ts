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
