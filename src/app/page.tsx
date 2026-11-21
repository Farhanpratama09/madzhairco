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

const NAV_LINKS = [
  { label: "Layanan", href: "#layanan" },
  { label: "Galeri", href: "#galeri" },
  { label: "Reservasi", href: "#reservasi" },
  { label: "Lokasi", href: "#lokasi" },
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
      const defaultNow = getStoreNowParts(DEFAULT_STORE_SETTINGS.timezone);

      const [
        settingsRes,
        schedulesRes,
        closedRes,
        servicesRes,
        galleryRes,
        bookingsRes,
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
        supabase.rpc("get_public_bookings_for_date", {
          p_date: defaultNow.dateStr,
        }),
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
      if (nowInStoreTz.dateStr !== defaultNow.dateStr) {
        const { data: tzBookingsData } = await supabase.rpc(
          "get_public_bookings_for_date",
          {
            p_date: nowInStoreTz.dateStr,
          }
        );
        if (Array.isArray(tzBookingsData)) {
          todayBookings = tzBookingsData;
        }
      } else if (Array.isArray(bookingsRes.data)) {
        todayBookings = bookingsRes.data;
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
    : liveStatus.reason === "BEFORE_OPEN" &&
        liveStatus.openTime &&
        liveStatus.closeTime
      ? `Buka ${liveStatus.openTime}–${liveStatus.closeTime} WIB`
      : liveStatus.openTime && liveStatus.closeTime
        ? `${liveStatus.openTime} – ${liveStatus.closeTime} WIB`
        : liveStatus.closedReason ?? undefined;

  const heroImageUrl = settings.hero_image_url?.trim() || brand.heroImage;

  const activeServices = services.filter((s) => s.is_active);
  const minPriceK =
    activeServices.length > 0
      ? Math.round(Math.min(...activeServices.map((s) => s.price_min)) / 1000)
      : 30;
  const maxPriceK =
    activeServices.length > 0
      ? Math.round(Math.max(...activeServices.map((s) => s.price_max)) / 1000)
      : 250;

  return (
    <div className="min-h-[100dvh] bg-alabaster text-ink">
      <HairSalonJsonLd schedules={schedules} storeSettings={settings} />

      {/* =====================================================================
          NAVBAR ATAS MINIMALIS + MOBILE SUB-NAV (v1.3)
      ===================================================================== */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-alabaster/95 pt-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-safe py-2.5 sm:gap-4">
          {/* Kiri: BrandMark (compact < sm, full >= sm) */}
          <div className="shrink-0">
            <div className="sm:hidden">
              <BrandMark variant="compact" size="sm" href="/" />
            </div>
            <div className="hidden sm:block">
              <BrandMark variant="full" size="sm" href="/" />
            </div>
          </div>

          {/* Tengah: Tautan Navigasi Desktop */}
          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-6 md:flex"
          >
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="inline-flex min-h-[44px] items-center font-mono text-xs font-medium tracking-[0.14em] uppercase text-ink transition-colors hover:text-terracotta"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Kanan: LiveStatusTag compact */}
          <div className="min-w-0">
            <div className="sm:hidden">
              <LiveStatusTag
                isOpen={liveStatus.isOpen}
                isForceClosed={settings.is_force_closed}
                reason={liveStatus.reason}
                compact
              />
            </div>
            <div className="hidden sm:block">
              <LiveStatusTag
                isOpen={liveStatus.isOpen}
                isForceClosed={settings.is_force_closed}
                reason={liveStatus.reason}
                scheduleNote={scheduleNote}
                compact
              />
            </div>
          </div>
        </div>

        {/* Sub-Nav Mobile: Strip 4 Tautan Ringkas */}
        <nav
          aria-label="Navigasi mobile"
          className="grid grid-cols-4 border-t border-hairline/70 px-safe md:hidden"
        >
          {NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-[44px] items-center justify-center font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-ink transition-colors hover:text-terracotta"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        {/* ===================================================================
            HERO MINIMALIS SOFT-EDITORIAL (v1.3)
        =================================================================== */}
        <section
          aria-labelledby="hero-heading"
          className="px-safe pt-6 pb-14 sm:pt-12 sm:pb-18 lg:pt-14 lg:pb-24"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-7 sm:gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Kolom Teks Editorial (7 Col) */}
            <div className="lg:col-span-7">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-[2px] bg-terracotta"
                />
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted tabular-nums sm:text-xs">
                  <span className="font-semibold text-terracotta">00</span>
                  <span className="mx-2 text-muted/50">/</span>
                  <span>STUDIO SATU KURSI · SUNGAI KUNYIT</span>
                </p>
                <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
              </div>

              <h1
                id="hero-heading"
                className="mt-4 font-display text-[28px] leading-[1.15] font-extrabold tracking-tight text-ink sm:mt-5 sm:text-4xl lg:text-5xl"
              >
                Presisi Satu Kursi.{" "}
                <span className="block font-serif font-normal italic text-terracotta">
                  Tanpa Antre di Tempat.
                </span>
              </h1>

              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
                Sesi cukur privat satu barber di {settings.brand_tagline}. Pilih
                layanan, kunci slot jam bulat secara real-time, dan konfirmasi
                langsung via WhatsApp tanpa daftar akun.
              </p>

              {/* CTA Utama + Google Maps Ringkas */}
              <div className="mt-6 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:items-center sm:gap-3">
                <a
                  href="#reservasi"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-xl bg-terracotta px-6 py-3 font-display text-sm font-bold tracking-wide uppercase text-surface shadow-sm transition-colors hover:bg-terracotta/90"
                >
                  Kunci Jadwal Sekarang
                  <ArrowDownRight className="h-4 w-4" />
                </a>

                <a
                  href={settings.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-2.5 font-mono text-xs font-medium tracking-[0.14em] uppercase text-ink transition-colors hover:border-terracotta hover:text-terracotta sm:min-h-[48px]"
                >
                  <MapPin className="h-4 w-4 text-terracotta" />
                  Google Maps
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Metadata Studio Ringkas */}
              <dl className="mt-7 grid grid-cols-2 gap-4 border-t border-hairline pt-5 sm:mt-8 sm:grid-cols-3">
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted">
                    Lokasi Studio
                  </dt>
                  <dd className="mt-1 text-xs font-semibold leading-snug text-ink sm:text-sm">
                    {settings.short_address}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted">
                    Kapasitas &amp; Grid
                  </dt>
                  <dd className="mt-1 font-mono text-xs font-semibold text-ink tabular-nums sm:text-sm">
                    1 Kursi · Slot 60 Mnt
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted">
                    Tarif Mulai
                  </dt>
                  <dd className="mt-1 font-mono text-xs font-bold text-terracotta tabular-nums sm:text-sm">
                    Rp {minPriceK}k – {maxPriceK}k
                  </dd>
                </div>
              </dl>
            </div>

            {/* Kolom Foto Hero Borderless (5 Col, Aspect 4:5 Terkunci) */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl bg-ink shadow-lg lg:max-w-none">
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
                  className="absolute inset-0 bg-gradient-to-t from-[#1E2329]/90 via-[#303841]/55 to-transparent"
                />
                <div className="absolute right-5 bottom-5 left-5 flex items-end justify-between gap-3 border-t border-[#F7F3EC]/25 pt-3.5">
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#F7F3EC]/80">
                      MADZHAIR CHAIR
                    </p>
                    <p className="mt-0.5 font-serif text-lg italic text-[#F7F3EC]">
                      Private Grooming Session
                    </p>
                  </div>
                  <span className="rounded-xl bg-terracotta px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.14em] text-[#F7F3EC] tabular-nums">
                    WIB
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            FLOATING INFO & PRICELIST DOCK + GALERI (4 FOTO + 2 REELS) + RESERVASI
        =================================================================== */}
        <BookingExperience
          initialSettings={settings}
          initialSchedules={schedules}
          initialClosedDates={closedDates}
          initialServices={services}
          initialBookings={todayBookings}
          initialDateStr={todayDateStr}
          gallerySection={<SocialGalleryFacade items={galleryItems} />}
        />
      </main>

      {/* =====================================================================
          FOOTER ARSITEKTURAL — DEEP SLATE CHARCOAL (#303841)
      ===================================================================== */}
      <footer
        id="lokasi"
        className="scroll-mt-24 border-t border-hairline bg-ink px-safe pt-12 pb-safe text-surface sm:pt-14"
      >
        <div className="mx-auto max-w-6xl space-y-10 pb-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Identitas & Alamat */}
            <div className="space-y-5 lg:col-span-5">
              <div className="inline-flex rounded-2xl bg-surface px-4 py-2.5 shadow-sm">
                <BrandMark variant="full" size="md" href="/" />
              </div>

              <p className="max-w-sm text-sm leading-relaxed text-surface/80">
                Barbershop berkapasitas 1 kursi di Sungai Kunyit. Fokus pada detail
                potongan dan kenyamanan sesi konsultasi tanpa antre.
              </p>

              <div className="border-l-2 border-terracotta pl-4">
                <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-surface/70">
                  Alamat Studio
                </p>
                <p className="mt-1 text-sm font-medium text-surface">
                  {settings.short_address}
                </p>
              </div>

              <a
                href={settings.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-surface transition-colors hover:bg-terracotta/90"
              >
                <MapPin className="h-4 w-4" />
                Buka Rute Google Maps
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Jadwal Operasional Mingguan */}
            <div className="lg:col-span-7">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-[2px] bg-terracotta"
                />
                <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-surface">
                  Jam Operasional ({settings.timezone})
                </p>
              </div>
              <dl className="mt-4 divide-y divide-surface/15 border-y border-surface/15">
                {schedules.map((item) => (
                  <div
                    key={item.day_of_week}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <dt className="font-medium text-surface">
                      {DAY_LABELS[item.day_of_week] ?? `Hari ${item.day_of_week}`}
                    </dt>
                    <dd className="font-mono text-xs text-surface/80 tabular-nums sm:text-sm">
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

          <div className="flex flex-col items-start justify-between gap-3 border-t border-surface/15 pt-6 sm:flex-row sm:items-center">
            <p className="font-mono text-xs text-surface/75">
              © {new Date().getFullYear()} {settings.store_name} ·{" "}
              {settings.brand_tagline}
            </p>

            {/* Tautan Halus ke Dashboard Kasir /admin */}
            <Link
              href="/admin"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-surface/20 px-4 py-2 font-mono text-xs tracking-[0.14em] uppercase text-surface/85 transition-colors hover:border-terracotta hover:bg-terracotta hover:text-surface"
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
