"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Play, ShieldAlert, X } from "lucide-react";
import { EditorialSectionHeader } from "@/components/ui/EditorialSectionHeader";
import { defaultGalleryItems } from "@/config/media";
import { validateSocialEmbedUrl } from "@/lib/security/sanitize";
import type { GalleryItem } from "@/types/database";

export interface SocialGalleryFacadeProps {
  items: GalleryItem[];
}

function normalizeGalleryItems(items: GalleryItem[]): GalleryItem[] {
  const active = items.filter((item) => item.is_active);
  if (active.length > 0) {
    return active;
  }

  return defaultGalleryItems.map((item, idx) => ({
    id: item.id,
    title: item.title,
    media_type: item.type === "image" ? "photo" : item.type,
    media_url: item.mediaUrl,
    thumbnail_url: item.thumbnailUrl,
    caption: item.caption,
    sort_order: idx + 1,
    is_active: true,
    created_at: "2026-11-20T00:00:00.000Z",
  }));
}

function buildSafeEmbedIframeUrl(
  platform: "tiktok" | "instagram",
  validatedUrl: string
): string | null {
  try {
    const parsed = new URL(validatedUrl);
    if (platform === "tiktok") {
      const match = parsed.pathname.match(/\/video\/(\d+)/);
      if (match?.[1]) {
        return `https://www.tiktok.com/embed/v2/${match[1]}`;
      }
      return null;
    }

    if (platform === "instagram") {
      const match = parsed.pathname.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
      if (match?.[1] && match?.[2]) {
        return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

function VideoReelCard({
  item,
  indexNumber,
}: {
  item: GalleryItem;
  indexNumber: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  const validation = validateSocialEmbedUrl(item.media_url);
  const platformLabel = item.media_type === "tiktok" ? "TIKTOK REEL" : "IG REELS";
  const thumbnailSrc =
    item.thumbnail_url?.trim() ||
    (item.media_type === "tiktok"
      ? "/images/style-fade.webp"
      : "/images/style-perm.webp");

  const embedIframeUrl =
    validation.valid && validation.platform && validation.url
      ? buildSafeEmbedIframeUrl(validation.platform, validation.url)
      : null;

  return (
    <article className="group relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-ink shadow-md">
      {!isLoaded ? (
        <>
          <Image
            src={thumbnailSrc}
            alt={item.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#1E2329]/90 via-[#303841]/55 to-transparent"
          />

          <div className="absolute inset-x-0 bottom-0 space-y-3.5 p-5 sm:p-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-[2px] bg-terracotta"
                />
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[#F7F3EC]/85 tabular-nums">
                  {indexNumber} {"//"} {platformLabel}
                </p>
              </div>
              <h3 className="font-display text-lg font-bold leading-snug text-[#F7F3EC]">
                {item.title}
              </h3>
              {item.caption ? (
                <p className="line-clamp-2 text-xs leading-relaxed text-[#F7F3EC]/85">
                  {item.caption}
                </p>
              ) : null}
            </div>

            {validation.valid ? (
              <button
                type="button"
                onClick={() => setIsLoaded(true)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl bg-terracotta px-4 py-2.5 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-[#F7F3EC] shadow-sm transition-colors hover:bg-terracotta/90"
              >
                <Play className="h-4 w-4 fill-[#F7F3EC]" />
                Putar Video
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-crimson-alert/60 bg-[#1E2329]/90 px-3 py-2.5 text-xs text-[#F7F3EC]">
                <ShieldAlert className="h-4 w-4 shrink-0 text-crimson-alert" />
                <span>URL embed tidak lolos validasi keamanan.</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="relative h-full w-full">
          <button
            type="button"
            onClick={() => setIsLoaded(false)}
            aria-label={`Tutup pemutar ${item.title}`}
            className="absolute top-3 right-3 z-20 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-[#1E2329]/85 text-[#F7F3EC] backdrop-blur-sm transition-colors hover:bg-terracotta"
          >
            <X className="h-4 w-4" />
          </button>

          {!validation.valid || !validation.url ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <ShieldAlert className="h-7 w-7 text-crimson-alert" />
              <p className="text-sm font-semibold text-[#F7F3EC]">
                Tautan video diblokir
              </p>
              <p className="text-xs text-[#F7F3EC]/80">
                Hanya URL HTTPS resmi TikTok dan Instagram Reels yang diizinkan.
              </p>
            </div>
          ) : embedIframeUrl ? (
            <div className="flex h-full flex-col">
              <iframe
                src={embedIframeUrl}
                title={item.title}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="encrypted-media; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                className="h-full w-full flex-1 border-0 bg-ink"
              />
              <a
                href={validation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 border-t border-hairline bg-surface px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-ink transition-colors hover:bg-surface-elevated hover:text-terracotta"
              >
                Buka di {item.media_type === "tiktok" ? "TikTok" : "Instagram"}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="font-mono text-xs font-semibold tracking-[0.16em] uppercase text-terracotta">
                {platformLabel}
              </p>
              <h3 className="font-display text-lg font-bold text-[#F7F3EC]">
                {item.title}
              </h3>
              <p className="text-xs leading-relaxed text-[#F7F3EC]/80">
                Tautan pendek terdeteksi. Buka langsung di aplikasi resmi untuk pemutaran penuh.
              </p>
              <a
                href={validation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-[#F7F3EC] transition-colors hover:bg-terracotta/90"
              >
                Tonton Sekarang
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function SocialGalleryFacade({ items }: SocialGalleryFacadeProps) {
  const normalizedItems = normalizeGalleryItems(items);
  const photoItems = normalizedItems.filter((item) => item.media_type === "photo");
  const videoItems = normalizedItems.filter(
    (item) => item.media_type === "tiktok" || item.media_type === "instagram"
  );

  return (
    <section
      id="galeri"
      aria-labelledby="galeri-heading"
      className="border-t border-hairline bg-alabaster px-safe py-14 sm:py-20"
    >
      <div className="mx-auto max-w-6xl space-y-10">
        <EditorialSectionHeader
          index="03"
          label="GALERI & REELS"
          title="Hasil Cukur"
          accentTitle="& Transformasi"
          description="Arsip gaya rambut dari satu kursi Madzhair.co. Video TikTok & Reels dimuat hanya saat Anda tekan agar hemat kuota seluler."
        />

        {/* Komposisi Asimetris Foto Full-Bleed (4:5) */}
        {photoItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-5">
            {photoItems.map((item, index) => {
              const mod = index % 3;
              const isLead = mod === 0;
              const colSpan = isLead
                ? "md:col-span-6 lg:col-span-5"
                : mod === 1
                  ? "md:col-span-6 lg:col-span-4 md:mt-8"
                  : "md:col-span-12 lg:col-span-3 lg:mt-16";

              const indexNumber = String(index + 1).padStart(2, "0");
              const photoSrc = item.media_url?.trim() || "/images/style-fade.webp";

              return (
                <article
                  key={item.id}
                  className={`group relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-ink shadow-md ${colSpan}`}
                >
                  <Image
                    src={photoSrc}
                    alt={item.title}
                    fill
                    sizes={
                      isLead
                        ? "(max-width: 768px) 100vw, 45vw"
                        : "(max-width: 768px) 100vw, 33vw"
                    }
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-[#1E2329]/90 via-[#303841]/55 to-transparent"
                  />

                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-[2px] bg-terracotta"
                      />
                      <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[#F7F3EC]/85 tabular-nums">
                        {indexNumber} {"//"} FOTO STUDIO
                      </span>
                    </div>

                    <h3 className="mt-2 font-display text-lg font-bold leading-snug text-[#F7F3EC] sm:text-xl">
                      {item.title}
                    </h3>
                    {item.caption ? (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#F7F3EC]/85 sm:text-sm">
                        {item.caption}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        {/* Baris Editorial Reels Full-Bleed (9:16 Lazy Facade) */}
        {videoItems.length > 0 ? (
          <div className="border-t border-hairline pt-8">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-ink">
                VIDEO REELS // KLIK UNTUK MEMUAT
              </p>
              <p className="font-mono text-[11px] text-muted">
                Zero-script initial load · HTTPS verified
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-12 lg:gap-6">
              {videoItems.map((item, idx) => {
                const indexNumber = String(photoItems.length + idx + 1).padStart(
                  2,
                  "0"
                );
                const spanClass =
                  idx % 2 === 0 ? "lg:col-span-5" : "lg:col-span-5 lg:mt-10";

                return (
                  <div key={item.id} className={spanClass}>
                    <VideoReelCard item={item} indexNumber={indexNumber} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default SocialGalleryFacade;
