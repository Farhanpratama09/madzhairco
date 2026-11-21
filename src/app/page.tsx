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

  const todayHoursLabel = settings.is_force_closed
    ? "Tutup sementara"
    : liveStatus.openTime && liveStatus.closeTime
      ? `${liveStatus.openTime} – ${liveStatus.closeTime} WIB`
      : liveStatus.closedReason ?? "Jadwal khusus";

  return (
    <div className="min-h-[100dvh] bg-alabaster text-ink">
      <HairSalonJsonLd schedules={schedules} storeSettings={settings} />

      {/* =====================================================================
          NAVBAR ATAS MINIMALIS SATU BARIS (TANPA KOTAK PEMBUNGKUS)
      ===================================================================== */}
      <header className="sticky top-0 z-40 bg-alabaster/95 pt-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-safe py-3 sm:gap-4 sm:py-3.5">
          {/* Kiri: BrandMark */}
          <div className="shrink-0">
            <div className="sm:hidden">
              <BrandMark variant="compact" size="sm" href="/" />
            </div>
            <div className="hidden sm:block">
              <BrandMark variant="full" size="sm" href="/" />
            </div>
          </div>

          {/* Tengah: Tautan Navigasi Bersih (Sentence Case, Desktop) */}
          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-7 md:flex"
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

          {/* Kanan: Indikator Status Teks Ringan */}
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
      </header>

      <main>
        {/* ===================================================================
            SPLIT HERO ASIMETRIS (TRAVORRA-INSPIRED SOFT EDITORIAL)
        =================================================================== */}
        <section
          aria-labelledby="hero-heading"
          className="px-safe pt-5 pb-14 sm:pt-10 sm:pb-18 lg:pt-12 lg:pb-24"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
            {/* Kolom Kiri: Eyebrow Bersih, Instrument Serif Headline, Subtitle, CTA */}
            <div className="lg:col-span-7">
              <p className="font-sans text-xs font-medium text-terracotta sm:text-sm">
                Studio cukur satu kursi · {settings.short_address}
              </p>

              <h1
                id="hero-heading"
                className="mt-3 font-serif text-3xl leading-[1.12] font-normal tracking-tight text-ink sm:text-4xl lg:text-5xl"
              >
                Presisi Satu Kursi,{" "}
                <span className="block italic text-terracotta">
                  Tanpa Antre di Tempat.
                </span>
              </h1>

              <p className="mt-4 max-w-lg font-sans text-sm leading-relaxed text-muted sm:text-base">
                Sesi cukur privat satu barber di {settings.brand_tagline}. Pilih
                layanan, kunci slot jam bulat secara real-time, dan konfirmasi
                via WhatsApp tanpa daftar akun.
              </p>

              {/* CTA Terracotta + Tautan Peta Ringkas */}
              <div className="mt-6 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:items-center sm:gap-4">
                <a
                  href="#reservasi"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-terracotta px-6 py-3 font-sans text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90"
                >
                  Pilih Jadwal
                  <ArrowDownRight className="h-4 w-4" />
                </a>

                <a
                  href={settings.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-sans text-sm font-medium text-ink transition-colors hover:text-terracotta sm:min-h-[48px]"
                >
                  <MapPin className="h-4 w-4 text-terracotta" />
                  <span>Lihat Lokasi</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted" />
                </a>
              </div>

              {/* Ringkasan Studio Clean Sentence Case */}
              <dl className="mt-7 grid grid-cols-2 gap-4 border-t border-hairline pt-5 sm:mt-8 sm:grid-cols-3">
                <div>
                  <dt className="font-sans text-xs text-muted">Lokasi studio</dt>
                  <dd className="mt-1 font-sans text-xs font-semibold leading-snug text-ink sm:text-sm">
                    {settings.short_address}
                  </dd>
                </div>
                <div>
                  <dt className="font-sans text-xs text-muted">
                    Kapasitas kursi
                  </dt>
                  <dd className="mt-1 font-sans text-xs font-semibold text-ink sm:text-sm">
                    <span className="font-mono tabular-nums">1</span> kursi ·
                    Slot <span className="font-mono tabular-nums">60</span> mnt
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="font-sans text-xs text-muted">Tarif mulai</dt>
                  <dd className="mt-1 font-mono text-xs font-bold text-terracotta tabular-nums sm:text-sm">
                    Rp {minPriceK}k – {maxPriceK}k
                  </dd>
                </div>
              </dl>
            </div>

            {/* Kolom Kanan: Foto Asimetris Organik Tanpa Border + 1 Kartu Kecil Sudut Kanan Atas */}
            <div className="relative mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-tl-[72px] rounded-br-[72px] rounded-tr-3xl rounded-bl-3xl bg-ink shadow-xl">
                <Image
                  src={heroImageUrl}
                  alt={brand.heroAlt}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 42vw"
                  className="object-cover"
                />
              </div>

              {/* 1 Kartu Mengambang Kecil di Sudut Kanan Atas Foto */}
              <div className="absolute top-4 right-4 z-10 rounded-2xl bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-md sm:-right-3 sm:top-6">
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
          </div>
        </section>

        {/* ===================================================================
            FLOATING DOCK + GALERI (4 FOTO + 2 REELS) + RESERVASI
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
