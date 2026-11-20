import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Lock, MapPin } from "lucide-react";
import { BookingExperience } from "@/components/customer/BookingExperience";
import { SocialGalleryFacade } from "@/components/customer/SocialGalleryFacade";
import { HairSalonJsonLd } from "@/components/seo/HairSalonJsonLd";
import { BrandMark } from "@/components/ui/BrandMark";
import { LiveStatusTag } from "@/components/ui/LiveStatusTag";
import { brand, defaultGalleryItems } from "@/config/media";
import {
  DEFAULT_CLOSED_DATES,
  DEFAULT_SERVICES,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_WEEKLY_SCHEDULES,
} from "@/lib/seed";
import {
  formatTimeHHMM,
  getStoreNowParts,
  isStoreOpenLive,
} from "@/lib/slots";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type {
  ClosedDate,
  GalleryItem,
  PublicBookingSlot,
  Service,
  StoreSettings,
  WeeklySchedule,
} from "@/types/database";

export const dynamic = "force-dynamic";

const DAY_LABELS = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

function mapConfigGalleryFallback(): GalleryItem[] {
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

async function loadLandingData(): Promise<{
  settings: StoreSettings;
  schedules: WeeklySchedule[];
  closedDates: ClosedDate[];
  services: Service[];
  galleryItems: GalleryItem[];
  todayBookings: PublicBookingSlot[];
  todayDateStr: string;
}> {
  let settings: StoreSettings = DEFAULT_STORE_SETTINGS;
  let schedules: WeeklySchedule[] = DEFAULT_WEEKLY_SCHEDULES;
  let closedDates: ClosedDate[] = DEFAULT_CLOSED_DATES;
  let services: Service[] = DEFAULT_SERVICES;
  let galleryItems: GalleryItem[] = mapConfigGalleryFallback();
  let todayBookings: PublicBookingSlot[] = [];

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      const [
        settingsRes,
        schedulesRes,
        closedRes,
        servicesRes,
        galleryRes,
      ] = await Promise.all([
        supabase
          .from("store_settings")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("weekly_schedules")
          .select("*")
          .order("day_of_week", { ascending: true }),
        supabase
          .from("closed_dates")
          .select("*")
          .order("closed_date", { ascending: true }),
        supabase
          .from("services")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("gallery_items")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);

      if (settingsRes.data) {
        settings = settingsRes.data;
      }
      if (schedulesRes.data && schedulesRes.data.length > 0) {
        schedules = schedulesRes.data;
      }
      if (closedRes.data) {
        closedDates = closedRes.data;
      }
      if (servicesRes.data && servicesRes.data.length > 0) {
        services = servicesRes.data;
      }
      if (galleryRes.data && galleryRes.data.length > 0) {
        galleryItems = galleryRes.data;
      }

      const nowInStoreTz = getStoreNowParts(settings.timezone);
      const { data: bookingsData } = await supabase.rpc(
        "get_public_bookings_for_date",
        {
          p_date: nowInStoreTz.dateStr,
        }
      );

      if (Array.isArray(bookingsData)) {
        todayBookings = bookingsData;
      }

      return {
        settings,
        schedules,
        closedDates,
        services,
        galleryItems,
        todayBookings,
        todayDateStr: nowInStoreTz.dateStr,
      };
    }
  }

  const fallbackNow = getStoreNowParts(settings.timezone);

  return {
    settings,
    schedules,
    closedDates,
    services,
    galleryItems,
    todayBookings,
    todayDateStr: fallbackNow.dateStr,
  };
}

export default async function HomePage() {
  const {
    settings,
    schedules,
    closedDates,
    services,
    galleryItems,
    todayBookings,
    todayDateStr,
  } = await loadLandingData();

  const nowParts = getStoreNowParts(settings.timezone);
  const liveStatus = isStoreOpenLive({
    schedules,
    closedDates,
    settings,
    nowParts,
  });

  const scheduleNote = settings.is_force_closed
    ? "Tutup Sementara"
    : liveStatus.reason === "BEFORE_OPEN" && liveStatus.openTime && liveStatus.closeTime
      ? `Buka ${liveStatus.openTime}–${liveStatus.closeTime} WIB`
      : liveStatus.openTime && liveStatus.closeTime
        ? `${liveStatus.openTime} – ${liveStatus.closeTime} WIB`
        : liveStatus.closedReason ?? undefined;

  const heroImageUrl = settings.hero_image_url?.trim() || brand.heroImage;

  return (
    <div className="min-h-[100dvh] bg-obsidian text-ivory">
      <HairSalonJsonLd schedules={schedules} storeSettings={settings} />

      {/* =====================================================================
          HEADER BAR ARSITEKTURAL
      ===================================================================== */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-obsidian/95 pt-safe backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-safe py-3">
          <BrandMark variant="full" size="sm" href="/" />

          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="hidden sm:block">
              <LiveStatusTag
                isOpen={liveStatus.isOpen}
                isForceClosed={settings.is_force_closed}
                reason={liveStatus.reason}
                scheduleNote={scheduleNote}
                compact
              />
            </div>

            <a
              href="#reservasi"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 border border-brass bg-brass px-4 py-2 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-obsidian transition-colors hover:bg-brass/90"
            >
              Reservasi
              <ArrowDownRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* ===================================================================
            HERO EDITORIAL MASKULIN (NO PILL BADGES)
        =================================================================== */}
        <section
          aria-labelledby="hero-heading"
          className="px-safe py-10 sm:py-16 lg:py-20"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Kolom Teks Editorial (7 Col) */}
            <div className="lg:col-span-7">
              {/* Baris Indeks Bernomor + Garis Hairline (Anti-AI-Slop: NO rounded-full pill) */}
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-brass" />
                <p className="font-mono text-xs tracking-[0.22em] uppercase text-stone tabular-nums">
                  <span className="text-ivory">00</span>
                  <span className="mx-2 text-hairline">/</span>
                  <span>STUDIO SATU KURSI · SUNGAI KUNYIT</span>
                </p>
                <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
              </div>

              <div className="mt-4 sm:hidden">
                <LiveStatusTag
                  isOpen={liveStatus.isOpen}
                  isForceClosed={settings.is_force_closed}
                  reason={liveStatus.reason}
                  scheduleNote={scheduleNote}
                  compact
                />
              </div>

              <h1
                id="hero-heading"
                className="mt-6 font-display text-4xl leading-[1.02] font-extrabold tracking-tight text-ivory sm:text-5xl lg:text-6xl"
              >
                Presisi Satu Kursi.{" "}
                <span className="block font-serif font-normal italic text-brass">
                  Tanpa Antre di Tempat.
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-stone sm:text-lg">
                {settings.brand_tagline} menghadirkan sesi cukur privat satu barber,
                satu pelanggan. Pilih layanan, kunci slot jam bulat secara real-time,
                dan konfirmasi instan via WhatsApp tanpa perlu daftar akun.
              </p>

              {/* CTA & Google Maps */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="#reservasi"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2.5 border border-brass bg-brass px-6 py-3 font-display text-sm font-bold tracking-wide uppercase text-obsidian transition-colors hover:bg-brass/90"
                >
                  Kunci Jadwal Sekarang
                  <ArrowDownRight className="h-4 w-4" />
                </a>

                <a
                  href={settings.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 border border-hairline bg-surface px-5 py-3 font-mono text-xs tracking-[0.14em] uppercase text-ivory transition-colors hover:border-brass hover:text-brass"
                >
                  <MapPin className="h-4 w-4 text-brass" />
                  Arah Google Maps
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Metadata Bar Arsitektural */}
              <dl className="mt-10 grid grid-cols-2 gap-4 border-t border-hairline pt-6 sm:grid-cols-3">
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-stone">
                    Lokasi Studio
                  </dt>
                  <dd className="mt-1.5 text-xs font-medium leading-snug text-ivory sm:text-sm">
                    {settings.short_address}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-stone">
                    Kapasitas &amp; Grid
                  </dt>
                  <dd className="mt-1.5 font-mono text-xs font-medium text-ivory tabular-nums sm:text-sm">
                    1 Kursi · Slot 60 Mnt
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-stone">
                    Tarif Mulai
                  </dt>
                  <dd className="mt-1.5 font-mono text-xs font-medium text-brass tabular-nums sm:text-sm">
                    Rp 30k – 250k
                  </dd>
                </div>
              </dl>
            </div>

            {/* Kolom Foto Hero WebP (5 Col, Aspect 4:5 Terkunci) */}
            <div className="lg:col-span-5">
              <div className="relative border border-hairline bg-surface p-2 sm:p-3">
                {/* Aksen Sudut Kuningan */}
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-brass"
                />
                <span
                  aria-hidden="true"
                  className="absolute right-0 bottom-0 h-3 w-3 border-r-2 border-b-2 border-brass"
                />

                <div className="relative aspect-[4/5] w-full overflow-hidden bg-obsidian">
                  <Image
                    src={heroImageUrl}
                    alt={brand.heroAlt}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 42vw"
                    className="object-cover"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-obsidian/80 via-transparent to-transparent"
                  />
                  <div className="absolute right-4 bottom-4 left-4 flex items-end justify-between gap-2 border-t border-hairline/80 pt-3">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-brass">
                        MADZHAIR CHAIR
                      </p>
                      <p className="mt-0.5 font-serif text-base italic text-ivory">
                        Private Grooming Session
                      </p>
                    </div>
                    <span className="font-mono text-xs text-stone tabular-nums">
                      WIB
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            KATALOG LAYANAN + BOOKING 4 LANGKAH + LIVE REALTIME
        =================================================================== */}
        <BookingExperience
          initialSettings={settings}
          initialSchedules={schedules}
          initialClosedDates={closedDates}
          initialServices={services}
          initialBookings={todayBookings}
          initialDateStr={todayDateStr}
        />

        {/* ===================================================================
            GALERI FOTO & LAZY-LOAD REELS
        =================================================================== */}
        <SocialGalleryFacade items={galleryItems} />
      </main>

      {/* =====================================================================
          FOOTER LOKASI & JAM OPERASIONAL
      ===================================================================== */}
      <footer className="border-t border-hairline bg-surface px-safe pt-12 pb-safe">
        <div className="mx-auto max-w-6xl space-y-10 pb-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Identitas & Alamat */}
            <div className="space-y-4 lg:col-span-5">
              <BrandMark variant="full" size="md" href="/" />
              <p className="max-w-sm text-sm leading-relaxed text-stone">
                Barbershop berkapasitas 1 kursi di Sungai Kunyit. Fokus pada detail
                potongan dan kenyamanan sesi konsultasi tanpa antre.
              </p>

              <div className="border-l-2 border-brass pl-4">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-stone">
                  Alamat Studio
                </p>
                <p className="mt-1 text-sm font-medium text-ivory">
                  {settings.short_address}
                </p>
              </div>

              <a
                href={settings.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 border border-brass bg-obsidian px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-brass transition-colors hover:bg-brass hover:text-obsidian"
              >
                <MapPin className="h-4 w-4" />
                Buka Rute Google Maps
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Jadwal Operasional Mingguan */}
            <div className="lg:col-span-7">
              <p className="font-mono text-xs tracking-[0.2em] uppercase text-brass">
                Jam Operasional ({settings.timezone})
              </p>
              <dl className="mt-4 divide-y divide-hairline border-y border-hairline">
                {schedules.map((item) => (
                  <div
                    key={item.day_of_week}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <dt className="text-ivory">
                      {DAY_LABELS[item.day_of_week] ?? `Hari ${item.day_of_week}`}
                    </dt>
                    <dd className="font-mono text-xs text-stone tabular-nums sm:text-sm">
                      {item.is_open
                        ? `${formatTimeHHMM(item.open_time)} – ${formatTimeHHMM(
                            item.close_time
                          )} WIB`
                        : "Tutup"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center">
            <p className="font-mono text-xs text-stone">
              © {new Date().getFullYear()} {settings.store_name} ·{" "}
              {settings.brand_tagline}
            </p>

            {/* Tautan Halus ke Dashboard Kasir /admin */}
            <Link
              href="/admin"
              className="inline-flex min-h-[44px] items-center gap-2 font-mono text-xs tracking-[0.14em] uppercase text-stone/80 transition-colors hover:text-brass"
            >
              <Lock className="h-3.5 w-3.5" />
              Akses Kasir
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
