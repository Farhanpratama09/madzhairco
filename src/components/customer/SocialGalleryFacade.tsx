"use client";

import { useRef, useState, type TouchEvent } from "react";
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
  instagramReels: GalleryItem[];
} {
  const activeDbItems = items.filter((item) => item.is_active);
  const fallbackAll = buildDefaultFallbackItems();

  const dbPhotos = activeDbItems.filter((item) => item.media_type === "photo");
  const dbInstagram = activeDbItems.filter(
    (item) => item.media_type === "instagram"
  );

  const fallbackPhotos = fallbackAll.filter(
    (item) => item.media_type === "photo"
  );
  const fallbackInstagram = fallbackAll.filter(
    (item) => item.media_type === "instagram"
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

  const instagramReels: GalleryItem[] = [...dbInstagram];
  const seenReelUrls = new Set(
    instagramReels.map((item) => item.media_url.trim())
  );

  for (const fallbackReel of fallbackInstagram) {
    if (instagramReels.length >= 2) break;
    const urlKey = fallbackReel.media_url.trim();
    if (!seenReelUrls.has(urlKey)) {
      seenReelUrls.add(urlKey);
      instagramReels.push(fallbackReel);
    }
  }

  return { photoItems, instagramReels };
}

function buildSafeInstagramEmbedUrl(validatedUrl: string): string | null {
  try {
    const parsed = new URL(validatedUrl);
    const match = parsed.pathname.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
    if (match?.[1] && match?.[2]) {
      return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
    }
    return null;
  } catch {
    return null;
  }
}

function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function SocialGalleryFacade({ items }: SocialGalleryFacadeProps) {
  const { photoItems, instagramReels } = resolveGalleryGroups(items);

  const [activeReelIndex, setActiveReelIndex] = useState<number>(0);
  const [playingReelId, setPlayingReelId] = useState<string | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);

  const reelTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const photoTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const reelCount = instagramReels.length;
  const photoCount = photoItems.length;

  const safeReelIndex = reelCount > 0 ? activeReelIndex % reelCount : 0;
  const safePhotoIndex = photoCount > 0 ? activePhotoIndex % photoCount : 0;

  const goToReel = (targetIndex: number) => {
    if (reelCount === 0) return;
    const normalized = ((targetIndex % reelCount) + reelCount) % reelCount;
    setActiveReelIndex(normalized);
    setPlayingReelId(null);
  };

  const goToPhoto = (targetIndex: number) => {
    if (photoCount === 0) return;
    const normalized = ((targetIndex % photoCount) + photoCount) % photoCount;
    setActivePhotoIndex(normalized);
  };

  const handleReelTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    reelTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleReelTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = reelTouchStartRef.current;
    const touch = event.changedTouches[0];
    reelTouchStartRef.current = null;
    if (!start || !touch || reelCount <= 1 || playingReelId) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      goToReel(deltaX < 0 ? safeReelIndex + 1 : safeReelIndex - 1);
    }
  };

  const handlePhotoTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    photoTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handlePhotoTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = photoTouchStartRef.current;
    const touch = event.changedTouches[0];
    photoTouchStartRef.current = null;
    if (!start || !touch || photoCount <= 1) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      goToPhoto(deltaX < 0 ? safePhotoIndex + 1 : safePhotoIndex - 1);
    }
  };

  return (
    <section
      id="galeri"
      aria-labelledby="galeri-heading"
      className="scroll-mt-24 border-t border-hairline bg-alabaster px-safe py-10 sm:py-16"
    >
      <div className="mx-auto max-w-6xl space-y-8 sm:space-y-10">
        <EditorialSectionHeader title="Galeri & Reels" />

        {/* Dua Panel Proporsional Seimbang (aspect-[4/5] di Kiri & Kanan) */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-10">
          {/* PANEL KIRI: Khusus Instagram Reels (Murni Visual + < > + Dot Pagination) */}
          {reelCount > 0 ? (
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-sans text-sm font-semibold text-ink">
                  <InstagramIcon className="h-4 w-4 text-terracotta" />
                  <span>Instagram Reels</span>
                </span>
                <span className="font-sans text-xs font-medium text-muted tabular-nums">
                  {safeReelIndex + 1} / {reelCount}
                </span>
              </div>

              <div
                onTouchStart={handleReelTouchStart}
                onTouchEnd={handleReelTouchEnd}
                className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-ink shadow-md select-none"
              >
                <div
                  style={{
                    transform: `translate3d(-${safeReelIndex * 100}%, 0, 0)`,
                  }}
                  className="flex h-full w-full transition-transform duration-500 ease-out will-change-transform"
                >
                  {instagramReels.map((item, idx) => {
                    const isPlaying = playingReelId === item.id;
                    const validation = validateSocialEmbedUrl(item.media_url);
                    const embedIframeUrl =
                      validation.valid &&
                      validation.platform === "instagram" &&
                      validation.url
                        ? buildSafeInstagramEmbedUrl(validation.url)
                        : null;
                    const thumbnailSrc =
                      item.thumbnail_url?.trim() || "/images/style-perm.webp";

                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        className="relative h-full w-full shrink-0"
                      >
                        {!isPlaying ? (
                          <>
                            <Image
                              src={thumbnailSrc}
                              alt={item.title}
                              fill
                              loading={idx === 0 ? "eager" : "lazy"}
                              sizes="(max-width: 767px) 100vw, 50vw"
                              className="object-cover"
                            />

                            {/* Tombol Putar Murni di Tengah Tanpa Teks Overlay */}
                            {validation.valid ? (
                              <button
                                type="button"
                                onClick={() => setPlayingReelId(item.id)}
                                aria-label={`Putar Instagram Reel ${idx + 1}`}
                                className="absolute top-1/2 left-1/2 z-10 inline-flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#F7F3EC]/92 text-terracotta shadow-xl backdrop-blur-xs transition-all hover:scale-105 hover:bg-terracotta hover:text-[#F7F3EC]"
                              >
                                <Play className="ml-0.5 h-6 w-6 fill-current" />
                              </button>
                            ) : (
                              <div className="absolute inset-x-4 bottom-4 flex items-center justify-center gap-2 rounded-2xl bg-[#1E2329]/85 px-3 py-2.5 font-sans text-xs text-[#F7F3EC]">
                                <ShieldAlert className="h-4 w-4 shrink-0 text-crimson-alert" />
                                <span>URL Instagram tidak valid.</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="relative flex h-full w-full flex-col bg-ink">
                            <button
                              type="button"
                              onClick={() => setPlayingReelId(null)}
                              aria-label="Tutup pemutar Instagram Reels"
                              className="absolute top-3 right-3 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#1E2329]/85 text-[#F7F3EC] backdrop-blur-sm transition-colors hover:bg-terracotta"
                            >
                              <X className="h-4 w-4" />
                            </button>

                            {embedIframeUrl && validation.url ? (
                              <>
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
                                  <span>Buka di Instagram</span>
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </a>
                              </>
                            ) : validation.url ? (
                              <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                                <InstagramIcon className="h-8 w-8 text-[#F7F3EC]" />
                                <a
                                  href={validation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-2.5 font-sans text-xs font-semibold text-[#F7F3EC] transition-colors hover:bg-terracotta/90"
                                >
                                  <span>Buka di Instagram</span>
                                  <ArrowUpRight className="h-4 w-4" />
                                </a>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Tombol Geser < > Instagram Reels */}
                {reelCount > 1 && !playingReelId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => goToReel(safeReelIndex - 1)}
                      aria-label="Reel sebelumnya"
                      className="absolute top-1/2 left-3 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#F7F3EC]/90 text-ink shadow-md backdrop-blur-xs transition-colors hover:bg-terracotta hover:text-[#F7F3EC] sm:left-4"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => goToReel(safeReelIndex + 1)}
                      aria-label="Reel berikutnya"
                      className="absolute top-1/2 right-3 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#F7F3EC]/90 text-ink shadow-md backdrop-blur-xs transition-colors hover:bg-terracotta hover:text-[#F7F3EC] sm:right-4"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}
              </div>

              {/* Indikator Titik (Dot Pagination) Instagram Reels */}
              {reelCount > 1 ? (
                <div
                  role="tablist"
                  aria-label="Navigasi slide Instagram Reels"
                  className="mt-4 flex items-center justify-center gap-1.5"
                >
                  {instagramReels.map((item, idx) => {
                    const isActive = idx === safeReelIndex;
                    return (
                      <button
                        key={`reel-dot-${item.id}-${idx}`}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={`Lihat Instagram Reel ${idx + 1}`}
                        onClick={() => goToReel(idx)}
                        className="inline-flex h-9 items-center justify-center px-1"
                      >
                        <span
                          className={`block h-2 rounded-full transition-all duration-300 ${
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

          {/* PANEL KANAN: Carousel 4 Foto Murni Visual (Transisi CSS translateX Mulus) */}
          {photoCount > 0 ? (
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="font-sans text-sm font-semibold text-ink">
                  Galeri Foto
                </span>
                <span className="font-sans text-xs font-medium text-muted tabular-nums">
                  {safePhotoIndex + 1} / {photoCount}
                </span>
              </div>

              <div
                onTouchStart={handlePhotoTouchStart}
                onTouchEnd={handlePhotoTouchEnd}
                aria-label="Carousel foto gaya rambut"
                className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-ink shadow-md select-none"
              >
                <div
                  style={{
                    transform: `translate3d(-${safePhotoIndex * 100}%, 0, 0)`,
                  }}
                  className="flex h-full w-full transition-transform duration-500 ease-out will-change-transform"
                >
                  {photoItems.map((item, index) => {
                    const photoSrc =
                      item.media_url?.trim() || "/images/style-fade.webp";

                    return (
                      <div
                        key={`${item.id}-${index}`}
                        className="relative h-full w-full shrink-0"
                      >
                        <Image
                          src={photoSrc}
                          alt={item.title}
                          fill
                          loading={index <= 1 ? "eager" : "lazy"}
                          sizes="(max-width: 767px) 100vw, 50vw"
                          className="object-cover"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Tombol Geser < > Foto */}
                {photoCount > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => goToPhoto(safePhotoIndex - 1)}
                      aria-label="Foto sebelumnya"
                      className="absolute top-1/2 left-3 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#F7F3EC]/90 text-ink shadow-md backdrop-blur-xs transition-colors hover:bg-terracotta hover:text-[#F7F3EC] sm:left-4"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => goToPhoto(safePhotoIndex + 1)}
                      aria-label="Foto berikutnya"
                      className="absolute top-1/2 right-3 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#F7F3EC]/90 text-ink shadow-md backdrop-blur-xs transition-colors hover:bg-terracotta hover:text-[#F7F3EC] sm:right-4"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}
              </div>

              {/* Indikator Titik (Dot Pagination) Foto */}
              {photoCount > 1 ? (
                <div
                  role="tablist"
                  aria-label="Navigasi slide foto"
                  className="mt-4 flex items-center justify-center gap-1.5"
                >
                  {photoItems.map((item, idx) => {
                    const isActive = idx === safePhotoIndex;
                    return (
                      <button
                        key={`photo-dot-${item.id}-${idx}`}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={`Lihat foto ${idx + 1}`}
                        onClick={() => goToPhoto(idx)}
                        className="inline-flex h-9 items-center justify-center px-1"
                      >
                        <span
                          className={`block h-2 rounded-full transition-all duration-300 ${
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
