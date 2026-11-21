"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Play,
  ShieldAlert,
  X,
} from "lucide-react";
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
    <article className="group relative h-[430px] w-full overflow-hidden rounded-3xl bg-ink shadow-md sm:h-[490px] lg:h-[520px]">
      {!isLoaded ? (
        <>
          <Image
            src={thumbnailSrc}
            alt={item.title}
            fill
            loading="eager"
            sizes="(max-width: 1023px) 100vw, 42vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#1E2329]/90 via-[#303841]/50 to-transparent"
          />

          <div className="absolute inset-x-0 bottom-0 space-y-3.5 p-5 sm:p-6">
            <div className="space-y-1">
              <p className="font-sans text-xs font-medium text-[#F7F3EC]/85">
                {platformLabel}
              </p>
              <h3 className="font-serif text-xl font-normal leading-snug text-[#F7F3EC] sm:text-2xl">
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
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-2.5 font-sans text-xs font-semibold text-[#F7F3EC] shadow-sm transition-colors hover:bg-terracotta/90 sm:text-sm"
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
            className="absolute top-3 right-3 z-20 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[#1E2329]/85 text-[#F7F3EC] backdrop-blur-sm transition-colors hover:bg-terracotta"
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
              <h3 className="font-serif text-xl font-normal text-[#F7F3EC] sm:text-2xl">
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
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-2.5 font-sans text-xs font-semibold text-[#F7F3EC] transition-colors hover:bg-terracotta/90 sm:text-sm"
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
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number>(0);
  const photoTrackRef = useRef<HTMLDivElement | null>(null);

  const safePhotoIndex =
    photoItems.length > 0 ? activePhotoIndex % photoItems.length : 0;
  const safeVideoIndex =
    videoItems.length > 0 ? activeVideoIndex % videoItems.length : 0;

  const photoCount = photoItems.length;

  const scrollToPhoto = (targetIndex: number) => {
    if (photoCount === 0) return;
    const normalized = ((targetIndex % photoCount) + photoCount) % photoCount;
    setActivePhotoIndex(normalized);

    const track = photoTrackRef.current;
    if (track) {
      track.scrollTo({
        left: normalized * track.clientWidth,
        behavior: "smooth",
      });
    }
  };

  const handlePhotoScroll = () => {
    const track = photoTrackRef.current;
    if (!track || track.clientWidth <= 0) return;
    const nextIdx = Math.round(track.scrollLeft / track.clientWidth);
    if (nextIdx >= 0 && nextIdx < photoCount && nextIdx !== activePhotoIndex) {
      setActivePhotoIndex(nextIdx);
    }
  };

  const activeVideo = videoItems[safeVideoIndex] ?? null;

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

        {/* Sesi Media Kiri-Kanan (Desktop berdampingan, Mobile bertumpuk rapi) */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start lg:gap-8">
          {/* KIRI: Wadah Video Embed (Lazy-load Facade TikTok / IG Reels) */}
          {activeVideo ? (
            <div className="min-w-0 lg:col-span-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-sans text-sm font-semibold text-ink">
                  Video transformasi &amp; reels
                </p>
                {videoItems.length > 1 ? (
                  <span className="font-sans text-xs font-medium text-muted tabular-nums">
                    {safeVideoIndex + 1} / {videoItems.length}
                  </span>
                ) : null}
              </div>

              <VideoReelCard key={activeVideo.id} item={activeVideo} />

              {videoItems.length > 1 ? (
                <div className="mt-4 flex items-center justify-center gap-2">
                  {videoItems.map((video, idx) => {
                    const isActive = idx === safeVideoIndex;
                    const shortPlatform =
                      video.media_type === "tiktok" ? "TikTok" : "IG Reels";
                    return (
                      <button
                        key={`${video.id}-${idx}`}
                        type="button"
                        onClick={() => setActiveVideoIndex(idx)}
                        aria-label={`Tampilkan video ${idx + 1}: ${video.title}`}
                        aria-pressed={isActive}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-ink text-surface shadow-xs"
                            : "bg-surface text-muted hover:text-ink"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            isActive ? "bg-terracotta" : "bg-ink/30"
                          }`}
                        />
                        <span>{shortPlatform}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* KANAN: Carousel Foto 4 Sample Gaya Rambut (< > + Swipe + Dot Pagination) */}
          {photoItems.length > 0 ? (
            <div
              className={`min-w-0 ${
                activeVideo ? "lg:col-span-7" : "lg:col-span-12"
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-sans text-sm font-semibold text-ink">
                  Koleksi gaya rambut
                </p>
                <span className="font-sans text-xs font-medium text-muted tabular-nums">
                  {safePhotoIndex + 1} / {photoItems.length}
                </span>
              </div>

              <div className="relative h-[430px] w-full overflow-hidden rounded-3xl bg-ink shadow-md sm:h-[490px] lg:h-[520px]">
                <div
                  ref={photoTrackRef}
                  onScroll={handlePhotoScroll}
                  aria-label="Carousel sampel gaya rambut"
                  className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth no-scrollbar"
                >
                  {photoItems.map((item, index) => {
                    const photoSrc =
                      item.media_url?.trim() || "/images/style-fade.webp";

                    return (
                      <article
                        key={`${item.id}-${index}`}
                        className="relative h-full w-full shrink-0 snap-center"
                      >
                        <Image
                          src={photoSrc}
                          alt={item.title}
                          fill
                          loading={index === 0 ? "eager" : "lazy"}
                          sizes="(max-width: 1023px) 100vw, 58vw"
                          className="object-cover"
                        />
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-gradient-to-t from-[#1E2329]/90 via-[#303841]/40 to-transparent"
                        />

                        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                          <p className="font-sans text-xs font-medium text-[#F7F3EC]/80">
                            Gaya studio
                          </p>
                          <h3 className="mt-1 font-serif text-2xl font-normal leading-snug text-[#F7F3EC] sm:text-3xl">
                            {item.title}
                          </h3>
                          {item.caption ? (
                            <p className="mt-1.5 max-w-lg font-sans text-sm leading-relaxed text-[#F7F3EC]/85">
                              {item.caption}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Tombol Geser < > (Desktop & Mobile Tap) */}
                {photoItems.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => scrollToPhoto(safePhotoIndex - 1)}
                      aria-label="Foto sebelumnya"
                      className="absolute top-1/2 left-3 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#F7F3EC]/90 text-ink shadow-md backdrop-blur-xs transition-colors hover:bg-terracotta hover:text-[#F7F3EC] sm:left-4"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => scrollToPhoto(safePhotoIndex + 1)}
                      aria-label="Foto berikutnya"
                      className="absolute top-1/2 right-3 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#F7F3EC]/90 text-ink shadow-md backdrop-blur-xs transition-colors hover:bg-terracotta hover:text-[#F7F3EC] sm:right-4"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}
              </div>

              {/* Indikator Titik (Dot Pagination) */}
              {photoItems.length > 1 ? (
                <div
                  role="tablist"
                  aria-label="Navigasi slide foto"
                  className="mt-4 flex items-center justify-center gap-1.5"
                >
                  {photoItems.map((item, idx) => {
                    const isActive = idx === safePhotoIndex;
                    return (
                      <button
                        key={`dot-${item.id}-${idx}`}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={`Lihat foto ${idx + 1}: ${item.title}`}
                        onClick={() => scrollToPhoto(idx)}
                        className="inline-flex h-9 items-center justify-center px-1"
                      >
                        <span
                          className={`block h-2 rounded-full transition-all duration-200 ${
                            isActive
                              ? "w-7 bg-terracotta"
                              : "w-2 bg-ink/25 hover:bg-ink/50"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default SocialGalleryFacade;
