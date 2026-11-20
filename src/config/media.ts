/**
 * Konfigurasi Media Terpusat — Madzhair Barber & Co
 * ---------------------------------------------------------------------------
 * Seluruh aset brand, hero, Open Graph, dan sampel galeri dipusatkan di sini
 * agar pemilik toko dapat mengganti foto atau link video TikTok / IG Reels
 * setelah sesi demo tanpa mengubah struktur tata letak komponen.
 */

export type GalleryMediaType = "image" | "tiktok" | "instagram";

export type GalleryAspectRatio = "aspect-[4/5]" | "aspect-[9/16]";

export type GalleryCategory = "Haircut" | "Hair Chemicals" | "Studio";

export interface BrandMediaConfig {
  readonly name: string;
  readonly legalName: string;
  readonly tagline: string;
  readonly logoPath: string;
  readonly icon512Path: string;
  readonly appleTouchIconPath: string;
  readonly heroImage: string;
  readonly heroAlt: string;
  readonly heroAspectRatio: GalleryAspectRatio;
  readonly ogImage: string;
}

export interface GalleryItemConfig {
  readonly id: string;
  readonly type: GalleryMediaType;
  readonly aspectRatio: GalleryAspectRatio;
  readonly category: GalleryCategory;
  readonly title: string;
  readonly caption: string;
  readonly mediaUrl: string;
  readonly thumbnailUrl: string;
  /** Menandai entri demo yang perlu diganti URL aslinya pasca-peluncuran */
  readonly isPlaceholder?: boolean;
}

/**
 * Whitelist domain resmi untuk embed video sosial media (Zero-Trust Policy).
 * Hanya protokol https:// dari host di bawah ini yang diizinkan.
 */
export const ALLOWED_EMBED_HOSTS = [
  "www.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "www.instagram.com",
] as const;

export const brand: BrandMediaConfig = {
  name: "Madzhair.co",
  legalName: "Madzhair Barber & Co",
  tagline: "Presisi Satu Kursi. Tanpa Antre di Tempat.",
  logoPath: "/icons/icon-192.png",
  icon512Path: "/icons/icon-512.png",
  appleTouchIconPath: "/icons/apple-touch-icon.png",
  heroImage: "/images/hero-barber.webp",
  heroAlt: "Interior dan kursi barber Madzhair Barber & Co dengan pencahayaan editorial",
  heroAspectRatio: "aspect-[4/5]",
  ogImage: "/images/og-image.jpg",
} as const;

export const defaultGalleryItems: readonly GalleryItemConfig[] = [
  {
    id: "gal-fade-01",
    type: "image",
    aspectRatio: "aspect-[4/5]",
    category: "Haircut",
    title: "Skin Fade & Line-Up Presisi",
    caption: "Gradasi transisi bersih dengan kontur tengkuk dan hairline tajam.",
    mediaUrl: "/images/style-fade.webp",
    thumbnailUrl: "/images/style-fade.webp",
  },
  {
    id: "gal-perm-02",
    type: "image",
    aspectRatio: "aspect-[4/5]",
    category: "Hair Chemicals",
    title: "Natural Wavy & Downperm",
    caption: "Tekstur ikal terkontrol yang rapi dan mudah ditata setiap hari.",
    mediaUrl: "/images/style-perm.webp",
    thumbnailUrl: "/images/style-perm.webp",
  },
  {
    id: "gal-studio-03",
    type: "image",
    aspectRatio: "aspect-[4/5]",
    category: "Studio",
    title: "Sesi Privat Satu Kursi",
    caption: "Konsultasi gaya langsung bersama barber tanpa suasana antrean padat.",
    mediaUrl: "/images/hero-barber.webp",
    thumbnailUrl: "/images/hero-barber.webp",
  },
  {
    id: "gal-reel-tiktok-04",
    type: "tiktok",
    aspectRatio: "aspect-[9/16]",
    category: "Haircut",
    title: "Detail Taper Fade — Reel 01",
    caption: "Contoh embed TikTok (lazy-loaded). Ganti URL dengan video resmi toko.",
    mediaUrl: "https://www.tiktok.com/@madzhair.co/video/7400000000000000001",
    thumbnailUrl: "/images/style-fade.webp",
    isPlaceholder: true,
  },
  {
    id: "gal-reel-ig-05",
    type: "instagram",
    aspectRatio: "aspect-[9/16]",
    category: "Hair Chemicals",
    title: "Before & After Downperm — Reel 02",
    caption: "Contoh embed Instagram Reels (lazy-loaded). Ganti URL dengan reel resmi toko.",
    mediaUrl: "https://www.instagram.com/reel/DMadzhair01/",
    thumbnailUrl: "/images/style-perm.webp",
    isPlaceholder: true,
  },
] as const;

export function isWhitelistedEmbedUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    return (ALLOWED_EMBED_HOSTS as readonly string[]).includes(parsed.hostname);
  } catch {
    return false;
  }
}

export const MEDIA_CONFIG = {
  brand,
  defaultGalleryItems,
  allowedEmbedHosts: ALLOWED_EMBED_HOSTS,
} as const;
