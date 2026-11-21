import Image from "next/image";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  Clock,
  MapPin,
} from "lucide-react";
import { BookingExperience } from "@/components/customer/BookingExperience";
import { SocialGalleryFacade } from "@/components/customer/SocialGalleryFacade";
import { HairSalonJsonLd } from "@/components/seo/HairSalonJsonLd";
import { BrandMark } from "@/components/ui/BrandMark";
import { brand, defaultGalleryItems } from "@/config/media";
import {
  DEFAULT_CLOSED_DATES,
  DEFAULT_SERVICES,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_WEEKLY_SCHEDULES,
} from "@/lib/seed";
import { formatTimeHHMM, getStoreNowParts } from "@/lib/slots";
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

  const heroImageUrl = settings.hero_image_url?.trim() || brand.heroImage;

  return (
    <div className="min-h-[100dvh] bg-alabaster text-ink">
      <HairSalonJsonLd schedules={schedules} storeSettings={settings} />

      {/* =====================================================================
          WRAPPER HERO & NAVBAR TRANSPARAN (S-CURVE + GRADIENT EDGE FEATHERING)
      ===================================================================== */}
      <div className="relative w-full overflow-hidden">
        {/* Top Navbar: Logo kiri, tautan navigasi di tengah, status bersih di kanan */}
        <header className="relative z-30 bg-transparent pt-safe lg:absolute lg:inset-x-0 lg:top-0">
          <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-3 px-safe py-3.5 md:grid-cols-[1fr_auto_1fr] lg:py-5">
            {/* Kiri: BrandMark */}
            <div className="shrink-0 justify-self-start">
              <div className="sm:hidden">
                <BrandMark variant="compact" size="sm" href="/" />
              </div>
              <div className="hidden sm:block">
                <BrandMark variant="full" size="sm" href="/" />
              </div>
            </div>

            {/* Tengah: Navigasi Utama Bersih */}
            <nav
              aria-label="Navigasi utama"
              className="hidden items-center justify-self-center gap-6 md:flex lg:gap-7"
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

            {/* Kanan: Ikon kalender/jam kecil + teks bersih tanpa border/titik kotak/jam */}
            <div className="justify-self-end">
              <div
                role="status"
                aria-live="polite"
                className={`inline-flex items-center gap-2 font-sans text-xs font-medium whitespace-nowrap sm:text-sm ${
                  settings.is_force_closed
                    ? "text-crimson-alert lg:text-[#FECACA]"
                    : "text-ink lg:text-[#F7F3EC]"
                }`}
              >
                {settings.is_force_closed ? (
                  <Clock
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-crimson-alert lg:text-[#FECACA]"
                  />
                ) : (
                  <CalendarCheck
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-terracotta lg:text-[#F7F3EC]"
                  />
                )}
                <span>
                  {settings.is_force_closed
                    ? "Tutup sementara"
                    : "Booking tersedia"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Split Hero Full-Bleed Top-Right dengan Organic S-Curve & Edge Feathering */}
        <section
          aria-labelledby="hero-heading"
          className="relative w-full lg:min-h-[630px]"
        >
          {/* Kolom Kiri: Eyebrow singkat, Judul Instrument Serif, Subjudul, 1 CTA utama */}
          <div className="relative z-10 mx-auto max-w-6xl px-safe pt-3 pb-6 lg:flex lg:min-h-[630px] lg:items-center lg:pt-24 lg:pb-24">
            <div className="lg:w-[46%] lg:pr-12 xl:pr-16">
              <p className="font-sans text-xs font-medium text-terracotta sm:text-sm">
                Studio cukur satu kursi
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

              {/* 1 Tombol CTA Utama Kapsul Terracotta */}
              <div className="mt-6 sm:mt-8">
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
              </div>
            </div>
          </div>

          {/* Kanan (Desktop) / Bawah CTA (Mobile): Visual Barbershop + Deep S-Curve + Edge Feathering */}
          <div className="relative mx-4 sm:mx-6 lg:absolute lg:top-0 lg:right-0 lg:mx-0 lg:h-full lg:min-h-[630px] lg:w-[56%]">
            <div className="relative h-[290px] w-full overflow-hidden rounded-3xl bg-ink sm:h-[360px] lg:h-full lg:min-h-[630px] lg:rounded-none">
              <Image
                src={heroImageUrl}
                alt={brand.heroAlt}
                fill
                priority
                sizes="(max-width: 1023px) 100vw, 56vw"
                className="object-cover object-center"
              />

              {/* Scrim atas-kanan halus khusus desktop agar 'Booking tersedia' tetap tajam terbaca */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-0 hidden h-28 w-72 bg-gradient-to-bl from-[#1E2329]/75 via-[#1E2329]/30 to-transparent lg:block"
              />

              {/* Deep Organic S-Curve + Soft Left Edge Feathering (Desktop lg:) */}
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-y-0 left-0 hidden h-full w-full lg:block"
              >
                <defs>
                  <filter
                    id="hero-scurve-feather"
                    x="-20%"
                    y="-20%"
                    width="150%"
                    height="140%"
                  >
                    <feGaussianBlur stdDeviation="4.5" />
                  </filter>
                  <linearGradient
                    id="hero-left-feather-grad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#EFE8DD" stopOpacity="1" />
                    <stop offset="55%" stopColor="#EFE8DD" stopOpacity="0.82" />
                    <stop offset="100%" stopColor="#EFE8DD" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Lapisan feather halus mengikuti kontur S-curve agar foto memudar ke #EFE8DD */}
                <path
                  d="M -10 -10 L 48 -10 C 44 14, 14 26, 12 52 C 10 76, 26 89, 38 110 L -10 110 Z"
                  fill="#EFE8DD"
                  filter="url(#hero-scurve-feather)"
                />

                {/* Lapisan S-curve solid Warm Alabaster menjaga sisi kiri & tengah navbar 100% bersih */}
                <path
                  d="M -2 -2 L 42 -2 C 38 16, 7 28, 6 53 C 5 76, 19 89, 31 102 L -2 102 Z"
                  fill="#EFE8DD"
                />

                {/* Gradasi tipis ekstra sepanjang tepi kiri paling ujung */}
                <rect
                  x="0"
                  y="0"
                  width="12"
                  height="100"
                  fill="url(#hero-left-feather-grad)"
                />
              </svg>

              {/* Edge Feathering Tepi Bawah: memudar menyatu ke Warm Alabaster #EFE8DD */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#EFE8DD] via-[#EFE8DD]/60 to-transparent sm:h-32 lg:h-44"
              />
            </div>
          </div>
        </section>
      </div>

      <main>
        {/* ===================================================================
            FLOATING PILL DOCK 3 SEGMEN + GALERI + RESERVASI
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
                    <dd className="font-sans text-xs text-surface/80 tabular-nums sm:text-sm">
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

          <div className="border-t border-surface/15 pt-6">
            <p className="font-sans text-xs text-surface/75">
              © {new Date().getFullYear()} {settings.store_name} ·{" "}
              {settings.brand_tagline}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
