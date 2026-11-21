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

  const todayHoursLabel = settings.is_force_closed
    ? "Tutup sementara"
    : liveStatus.openTime && liveStatus.closeTime
      ? `${liveStatus.openTime} – ${liveStatus.closeTime} WIB`
      : liveStatus.closedReason ?? "Jadwal khusus";

  return (
    <div className="min-h-[100dvh] bg-alabaster text-ink">
      <HairSalonJsonLd schedules={schedules} storeSettings={settings} />

      {/* =====================================================================
          WRAPPER HERO & NAVBAR TRANSPARAN (TRAVORRA FULL-BLEED TOP-RIGHT)
      ===================================================================== */}
      <div className="relative w-full overflow-hidden">
        {/* Top Navbar: Ringkas di mobile (< lg), menyatu transparan di atas hero desktop (lg:) */}
        <header className="relative z-30 bg-transparent pt-safe lg:absolute lg:inset-x-0 lg:top-0">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-safe py-3.5 sm:gap-4 lg:py-5">
            {/* Kiri: BrandMark + Nav Links tetap di atas sisi Alabaster kiri */}
            <div className="flex items-center gap-7 xl:gap-9">
              <div className="shrink-0">
                <div className="sm:hidden">
                  <BrandMark variant="compact" size="sm" href="/" />
                </div>
                <div className="hidden sm:block">
                  <BrandMark variant="full" size="sm" href="/" />
                </div>
              </div>

              <nav
                aria-label="Navigasi utama"
                className="hidden items-center gap-5 md:flex xl:gap-7"
              >
                {NAV_LINKS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="inline-flex min-h-[44px] items-center font-sans text-sm font-medium text-ink transition-colors hover:text-terracotta"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>

            {/* Kanan: LiveStatusTag (kontras terang di lg: saat menindih sisi foto top-right) */}
            <div className="min-w-0">
              <div className="sm:hidden">
                <LiveStatusTag
                  isOpen={liveStatus.isOpen}
                  isForceClosed={settings.is_force_closed}
                  reason={liveStatus.reason}
                  surfaceTone="overlayDesktop"
                  compact
                />
              </div>
              <div className="hidden sm:block">
                <LiveStatusTag
                  isOpen={liveStatus.isOpen}
                  isForceClosed={settings.is_force_closed}
                  reason={liveStatus.reason}
                  scheduleNote={scheduleNote}
                  surfaceTone="overlayDesktop"
                  compact
                />
              </div>
            </div>
          </div>
        </header>

        {/* Split Hero Full-Bleed Top-Right */}
        <section
          aria-labelledby="hero-heading"
          className="relative w-full lg:min-h-[620px]"
        >
          {/* Kolom Kiri (Tipografi Berani + Tombol Kapsul) */}
          <div className="relative z-10 mx-auto max-w-6xl px-safe pt-3 pb-6 lg:flex lg:min-h-[620px] lg:items-center lg:pt-24 lg:pb-20">
            <div className="lg:w-[46%] lg:pr-14 xl:pr-16">
              <p className="font-sans text-xs font-medium text-terracotta sm:text-sm">
                Studio cukur satu kursi · {settings.short_address}
              </p>

              <h1
                id="hero-heading"
                className="mt-3 font-serif text-4xl leading-[1.06] font-normal tracking-tight text-ink sm:text-5xl lg:text-[62px]"
              >
                Presisi Satu Kursi,{" "}
                <span className="block italic text-terracotta">
                  Tanpa Antre di Tempat.
                </span>
              </h1>

              <p className="mt-4 max-w-md font-sans text-sm leading-relaxed text-muted sm:text-base">
                Sesi cukur privat satu barber di {settings.brand_tagline}. Pilih
                layanan, kunci slot jam bulat secara real-time, dan konfirmasi
                langsung via WhatsApp tanpa daftar akun.
              </p>

              {/* CTA Kapsul Penuh Terracotta dengan Ikon Panah Melingkar */}
              <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-7 sm:gap-4">
                <a
                  href="#reservasi"
                  className="inline-flex min-h-[52px] items-center justify-center gap-3 rounded-full bg-terracotta px-7 py-3.5 font-sans text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90"
                >
                  <span>Pilih Jadwal</span>
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface text-terracotta"
                  >
                    <ArrowDownRight className="h-4 w-4" />
                  </span>
                </a>

                <a
                  href={settings.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-3 py-2 font-sans text-sm font-medium text-ink transition-colors hover:text-terracotta"
                >
                  <MapPin className="h-4 w-4 text-terracotta" />
                  <span>Lihat Lokasi</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted" />
                </a>
              </div>
            </div>
          </div>

          {/* Kanan / Mobile Bawah CTA: Full-Bleed Top-Right Visual + Organic Curve Mask */}
          <div className="relative mx-4 sm:mx-6 lg:absolute lg:top-0 lg:right-0 lg:mx-0 lg:h-full lg:min-h-[620px] lg:w-[54%]">
            {/* Bingkai lengkungan organik (full edge kanan & atas desktop) */}
            <div className="relative h-[280px] w-full overflow-hidden rounded-3xl rounded-b-[40px] bg-ink shadow-xl sm:h-[340px] lg:h-full lg:min-h-[620px] lg:rounded-none lg:rounded-bl-[180px] lg:rounded-br-none">
              <Image
                src={heroImageUrl}
                alt={brand.heroAlt}
                fill
                priority
                sizes="(max-width: 1023px) 100vw, 54vw"
                className="object-cover"
              />

              {/* Scrim atas halus khusus desktop agar status LiveStatusTag di kanan atas selalu terbaca */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 hidden h-28 bg-gradient-to-b from-[#1E2329]/75 via-[#1E2329]/25 to-transparent lg:block"
              />
            </div>

            {/* Kartu Mengambang Kecil Menembus Batas Kiri Foto (Desktop) */}
            <div className="hidden rounded-2xl bg-[#F7F3EC] px-4 py-3 shadow-xl lg:absolute lg:top-28 lg:-left-10 lg:z-20 lg:block">
              <p className="font-sans text-xs font-medium text-muted">
                Jam operasional hari ini
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-ink tabular-nums">
                {todayHoursLabel}
              </p>
              <p className="mt-0.5 font-sans text-xs font-medium text-terracotta">
                1 kursi privat · Tanpa antre
              </p>
            </div>
          </div>
        </section>
      </div>

      <main>
        {/* ===================================================================
            FLOATING HORIZONTAL CAPSULE DOCK + GALERI + RESERVASI
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

              <p className="max-w-sm font-sans text-sm leading-relaxed text-surface/80">
                Barbershop berkapasitas 1 kursi di Sungai Kunyit. Fokus pada
                detail potongan dan kenyamanan sesi konsultasi tanpa antre.
              </p>

              <div className="border-l-2 border-terracotta pl-4">
                <p className="font-sans text-xs font-medium text-surface/70">
                  Alamat studio
                </p>
                <p className="mt-1 font-sans text-sm font-medium text-surface">
                  {settings.short_address}
                </p>
              </div>

              <a
                href={settings.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 font-sans text-xs font-semibold text-surface transition-colors hover:bg-terracotta/90 sm:text-sm"
              >
                <MapPin className="h-4 w-4" />
                <span>Buka Rute Google Maps</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Jadwal Operasional Mingguan */}
            <div className="lg:col-span-7">
              <p className="font-sans text-sm font-semibold text-surface">
                Jam operasional studio ({settings.timezone})
              </p>
              <dl className="mt-4 divide-y divide-surface/15 border-y border-surface/15">
                {schedules.map((item) => (
                  <div
                    key={item.day_of_week}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <dt className="font-sans font-medium text-surface">
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
            <p className="font-sans text-xs text-surface/75">
              © {new Date().getFullYear()} {settings.store_name} ·{" "}
              {settings.brand_tagline}
            </p>

            {/* Tautan Halus ke Dashboard Kasir /admin */}
            <Link
              href="/admin"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-surface/20 px-4 py-2 font-sans text-xs font-medium text-surface/85 transition-colors hover:border-terracotta hover:bg-terracotta hover:text-surface"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Akses Kasir</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
