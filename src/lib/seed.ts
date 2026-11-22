import type {
  ClosedDate,
  GalleryItem,
  Service,
  StoreSettings,
  WeeklySchedule,
} from "@/types/database";

const SEED_TIMESTAMP = "2026-11-20T00:00:00.000Z";

/**
 * Non-ambiguous 32-character alphabet (omits O, I, 0, 1).
 * Matches generate_madzhair_ticket_code() in 001_initial_schema.sql.
 */
export const TICKET_CODE_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  id: "00000000-0000-4000-8000-000000000001",
  store_name: "Madzhair Barber & Co",
  brand_tagline: "Madzhair Barber & Co",
  whatsapp_number: "62895701807228",
  short_address: "Jalan Raya Sungai Kunyit, Gang Tani",
  google_maps_url: "https://maps.app.goo.gl/sWp9PBaNSmE4zqYTA",
  timezone: "Asia/Pontianak",
  lead_time_minutes: 30,
  is_force_closed: false,
  break_enabled: false,
  break_start: "17:15:00",
  break_end: "18:30:00",
  break_reminder_sent_date: null,
  logo_url: "/icons/icon-192.png",
  hero_image_url: "/images/hero-barber.webp",
  updated_at: SEED_TIMESTAMP,
};

/**
 * Default operating hours per PRD Section 3.4:
 * - Minggu (0) – Kamis (4): 12:00 – 21:00
 * - Jumat (5): 13:00 – 21:00
 * - Sabtu (6): 10:00 – 20:00
 */
export const DEFAULT_WEEKLY_SCHEDULES: WeeklySchedule[] = [
  { day_of_week: 0, is_open: true, open_time: "12:00:00", close_time: "21:00:00" },
  { day_of_week: 1, is_open: true, open_time: "12:00:00", close_time: "21:00:00" },
  { day_of_week: 2, is_open: true, open_time: "12:00:00", close_time: "21:00:00" },
  { day_of_week: 3, is_open: true, open_time: "12:00:00", close_time: "21:00:00" },
  { day_of_week: 4, is_open: true, open_time: "12:00:00", close_time: "21:00:00" },
  { day_of_week: 5, is_open: true, open_time: "13:00:00", close_time: "21:00:00" },
  { day_of_week: 6, is_open: true, open_time: "10:00:00", close_time: "20:00:00" },
];

export const DEFAULT_CLOSED_DATES: ClosedDate[] = [];

export const DEFAULT_SERVICES: Service[] = [
  {
    id: "11111111-1111-4111-8111-111111111101",
    slug: "haircut",
    name: "Haircut",
    subtitle: "Fade, Taper, Longtrim, Kids (konsultasi di lokasi)",
    price_display: "Rp 30k – 40k",
    price_min: 30000,
    price_max: 40000,
    price_variants: [
      { label: "Kids", price: 30000, display: "30k" },
      { label: "Longtrim & Regular", price: 35000, display: "35k" },
      { label: "Fade & Taper", price: 40000, display: "40k" },
    ],
    display_duration_minutes: 45,
    slot_duration_minutes: 60,
    sort_order: 1,
    is_active: true,
    updated_at: SEED_TIMESTAMP,
  },
  {
    id: "11111111-1111-4111-8111-111111111102",
    slug: "hair-chemicals",
    name: "Hair Chemicals",
    subtitle: "Downperm, Wavyperm, Designperm (konsultasi di lokasi)",
    price_display: "Rp 250k",
    price_min: 250000,
    price_max: 250000,
    price_variants: [
      {
        label: "Downperm / Wavyperm / Designperm",
        price: 250000,
        display: "250k",
      },
    ],
    display_duration_minutes: 120,
    slot_duration_minutes: 120,
    sort_order: 2,
    is_active: true,
    updated_at: SEED_TIMESTAMP,
  },
];

export const DEFAULT_GALLERY_ITEMS: GalleryItem[] = [
  {
    id: "22222222-2222-4222-8222-222222222201",
    title: "Fade & Taper Signature",
    media_type: "photo",
    media_url: "/images/style-fade.webp",
    thumbnail_url: "/images/style-fade.webp",
    caption: "Gradasi halus dan garis tepi presisi sesuai bentuk kepala.",
    sort_order: 1,
    is_active: true,
    created_at: SEED_TIMESTAMP,
  },
  {
    id: "22222222-2222-4222-8222-222222222202",
    title: "Wavy Perm & Downperm",
    media_type: "photo",
    media_url: "/images/style-perm.webp",
    thumbnail_url: "/images/style-perm.webp",
    caption: "Tekstur ikal natural dengan sisi samping rapi tahan lama.",
    sort_order: 2,
    is_active: true,
    created_at: SEED_TIMESTAMP,
  },
  {
    id: "22222222-2222-4222-8222-222222222203",
    title: "Madzhair Chair — Sungai Kunyit",
    media_type: "photo",
    media_url: "/images/hero-barber.webp",
    thumbnail_url: "/images/hero-barber.webp",
    caption: "Satu kursi privat, fokus penuh untuk satu pelanggan tiap sesi.",
    sort_order: 3,
    is_active: true,
    created_at: SEED_TIMESTAMP,
  },
  {
    id: "22222222-2222-4222-8222-222222222204",
    title: "Reel Proses Fade & Styling",
    media_type: "tiktok",
    media_url: "https://www.tiktok.com/@madzhair.co/video/7000000000000000001",
    thumbnail_url: "/images/style-fade.webp",
    caption: "Cuplikan detail fade dan finishing sebelum sesi selesai.",
    sort_order: 4,
    is_active: true,
    created_at: SEED_TIMESTAMP,
  },
  {
    id: "22222222-2222-4222-8222-222222222205",
    title: "Reels Transformasi Perm",
    media_type: "instagram",
    media_url: "https://www.instagram.com/reel/C0000000001/",
    thumbnail_url: "/images/style-perm.webp",
    caption: "Hasil konsultasi dan proses wavyperm ~2 jam di Madzhair Barber & Co.",
    sort_order: 5,
    is_active: true,
    created_at: SEED_TIMESTAMP,
  },
];

/**
 * Generates a random non-ambiguous ticket code (MDZ-XXXX) for demo/fallback mode.
 */
export function generateDemoTicketCode(
  existingCodes?: Set<string> | string[]
): string {
  const existing =
    existingCodes instanceof Set
      ? existingCodes
      : new Set(existingCodes ?? []);

  const charsetLen = TICKET_CODE_CHARSET.length;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    let suffix = "";

    if (
      typeof globalThis.crypto !== "undefined" &&
      typeof globalThis.crypto.getRandomValues === "function"
    ) {
      const bytes = new Uint8Array(4);
      globalThis.crypto.getRandomValues(bytes);
      for (let i = 0; i < 4; i += 1) {
        suffix += TICKET_CODE_CHARSET[bytes[i] % charsetLen];
      }
    } else {
      for (let i = 0; i < 4; i += 1) {
        const idx = Math.floor(Math.random() * charsetLen);
        suffix += TICKET_CODE_CHARSET[idx];
      }
    }

    const code = `MDZ-${suffix}`;
    if (!existing.has(code)) {
      return code;
    }
  }

  // Fallback with guaranteed uniqueness if 50 random attempts somehow collided
  const fallbackIdx = Math.floor(Math.random() * charsetLen);
  return `MDZ-${TICKET_CODE_CHARSET[fallbackIdx]}9Z7`;
}
