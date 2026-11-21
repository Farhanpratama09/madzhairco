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

function buildDefaultFallbackItems(): GalleryItem[] {
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

function resolveGalleryGroups(items: GalleryItem[]): {
  photoItems: GalleryItem[];
  videoItems: GalleryItem[];
} {
  const activeDbItems = items.filter((item) => item.is_active);
  const fallbackAll = buildDefaultFallbackItems();

  const dbPhotos = activeDbItems.filter((item) => item.media_type === "photo");
  const dbVideos = activeDbItems.filter(
    (item) => item.media_type === "tiktok" || item.media_type === "instagram"
  );

  const fallbackPhotos = fallbackAll.filter((item) => item.media_type === "photo");
  const fallbackVideos = fallbackAll.filter(
    (item) => item.media_type === "tiktok" || item.media_type === "instagram"
  );

  const photoItems: GalleryItem[] = [...dbPhotos];
  const seenPhotoUrls = new Set(
    photoItems.map((item) => item.media_url.trim())
  );

  for (const fallbackPhoto of fallbackPhotos) {
    if (photoItems.length >= 4) break;
    const urlKey = fallbackPhoto.media_url.trim();
    if (!seenPhotoUrls.has(urlKey)) {
      seenPhotoUrls.add(urlKey);
      photoItems.push(fallbackPhoto);
    }
  }

  const videoItems: GalleryItem[] = [...dbVideos];
  const seenVideoUrls = new Set(
    videoItems.map((item) => item.media_url.trim())
  );

  for (const fallbackVideo of fallbackVideos) {
    if (videoItems.length >= 2) break;
    const urlKey = fallbackVideo.media_url.trim();
    if (!seenVideoUrls.has(urlKey)) {
      seenVideoUrls.add(urlKey);
      videoItems.push(fallbackVideo);
    }
  }

  return { photoItems, videoItems };
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

function VideoReelCard({ item }: { item: GalleryItem }) {
  const [isLoaded, setIsLoaded] = useState(false);

  const validation = validateSocialEmbedUrl(item.media_url);
  const platformLabel =
    item.media_type === "tiktok" ? "TikTok Reel" : "Instagram Reels";
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
    <article className="group relative aspect-[9/16] w-[62vw] max-w-[240px] shrink-0 snap-start overflow-hidden rounded-2xl bg-ink shadow-md md:w-full md:max-w-none md:shrink">
      {!isLoaded ? (
        <>
          <Image
            src={thumbnailSrc}
            alt={item.title}
            fill
            sizes="(max-width: 767px) 240px, (max-width: 1023px) 46vw, 420px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#1E2329]/90 via-[#303841]/55 to-transparent"
          />

          <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 sm:p-5">
            <div className="space-y-1">
              <p className="font-sans text-xs font-medium text-[#F7F3EC]/85">
                {platformLabel}
              </p>
              <h3 className="font-serif text-lg font-normal leading-snug text-[#F7F3EC] sm:text-xl">
                {item.title}
              </h3>
              {item.caption ? (
                <p className="line-clamp-2 font-sans text-sm leading-relaxed text-[#F7F3EC]/85">
                  {item.caption}
                </p>
              ) : null}
            </div>

            {validation.valid ? (
              <button
                type="button"
                onClick={() => setIsLoaded(true)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-2.5 font-sans text-xs font-semibold text-[#F7F3EC] shadow-sm transition-colors hover:bg-terracotta/90 sm:text-sm"
              >
                <Play className="h-4 w-4 fill-[#F7F3EC]" />
                <span>Putar Video</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-crimson-alert/60 bg-[#1E2329]/90 px-3 py-2.5 font-sans text-xs text-[#F7F3EC]">
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
            <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center">
              <ShieldAlert className="h-7 w-7 text-crimson-alert" />
              <p className="font-sans text-sm font-semibold text-[#F7F3EC]">
                Tautan video diblokir
              </p>
              <p className="font-sans text-xs text-[#F7F3EC]/80">
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
                className="inline-flex min-h-[44px] items-center justify-center gap-2 border-t border-hairline bg-surface px-4 py-2 font-sans text-xs font-semibold text-ink transition-colors hover:bg-surface-elevated hover:text-terracotta"
              >
                <span>
                  Buka di {item.media_type === "tiktok" ? "TikTok" : "Instagram"}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center">
              <p className="font-sans text-xs font-medium text-terracotta">
                {platformLabel}
              </p>
              <h3 className="font-serif text-lg font-normal text-[#F7F3EC] sm:text-xl">
                {item.title}
              </h3>
              <p className="font-sans text-sm leading-relaxed text-[#F7F3EC]/80">
                Tautan pendek terdeteksi. Buka langsung di aplikasi resmi untuk
                pemutaran penuh.
              </p>
              <a
                href={validation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 font-sans text-xs font-semibold text-[#F7F3EC] transition-colors hover:bg-terracotta/90 sm:text-sm"
              >
                <span>Tonton Sekarang</span>
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
  const { photoItems, videoItems } = resolveGalleryGroups(items);

  return (
    <section
      id="galeri"
      aria-labelledby="galeri-heading"
      className="scroll-mt-24 border-t border-hairline bg-alabaster px-safe py-10 sm:py-16"
    >
      <div className="mx-auto max-w-6xl space-y-8 sm:space-y-10">
        <EditorialSectionHeader
          label="Galeri & lookbook"
          title="Hasil Cukur"
          accentTitle="& Transformasi"
          description="Arsip gaya rambut dari satu kursi Madzhair.co. Video TikTok & Reels dimuat hanya saat Anda tekan agar hemat kuota seluler."
        />

        {/* 4 Sample Foto Full-Bleed (4:5): Swipe horizontal di mobile (< md), grid 4 kolom di desktop */}
        {photoItems.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-sans text-sm font-semibold text-ink">
                Koleksi gaya rambut
              </p>
              <span className="font-sans text-xs text-muted md:hidden">
                Geser →
              </span>
            </div>

            <div className="flex gap-3.5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-2 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:pb-0 lg:grid-cols-4">
              {photoItems.map((item, index) => {
                const photoSrc =
                  item.media_url?.trim() || "/images/style-fade.webp";

                return (
                  <article
                    key={`${item.id}-${index}`}
                    className="group relative aspect-[4/5] w-[66vw] max-w-[260px] shrink-0 snap-start overflow-hidden rounded-2xl bg-ink shadow-md md:w-full md:max-w-none md:shrink"
                  >
                    <Image
                      src={photoSrc}
                      alt={item.title}
                      fill
                      sizes="(max-width: 767px) 260px, (max-width: 1023px) 48vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-[#1E2329]/90 via-[#303841]/55 to-transparent"
                    />

                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                      <p className="font-sans text-xs font-medium text-[#F7F3EC]/80">
                        Gaya studio
                      </p>

                      <h3 className="mt-1 font-serif text-lg font-normal leading-snug text-[#F7F3EC] sm:text-xl">
                        {item.title}
                      </h3>
                      {item.caption ? (
                        <p className="mt-1 line-clamp-2 font-sans text-sm leading-relaxed text-[#F7F3EC]/85">
                          {item.caption}
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 2 Sample Video Embed Reels Full-Bleed (9:16 Lazy Facade) */}
        {videoItems.length > 0 ? (
          <div className="space-y-4 border-t border-hairline pt-7 sm:pt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-sans text-sm font-semibold text-ink">
                Video transformasi &amp; reels
              </p>
              <span className="font-sans text-xs text-muted md:hidden">
                Geser →
              </span>
              <p className="hidden font-sans text-xs text-muted md:block">
                Ketuk video untuk memuat pemutar resmi
              </p>
            </div>

            <div className="flex max-w-4xl gap-3.5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-2 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:pb-0">
              {videoItems.map((item, idx) => (
                <VideoReelCard key={`${item.id}-${idx}`} item={item} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default SocialGalleryFacade;
