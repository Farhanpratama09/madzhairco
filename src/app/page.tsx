import Image from "next/image";
import {
  ArrowDownRight,
  Calendar,
  CalendarCheck,
  MapPin,
  MessageCircle,
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
  const nowParts = getStoreNowParts(settings.timezone);
  const liveStatus = isStoreOpenLive({
    schedules,
    closedDates,
    settings,
    nowParts,
  });
  const isClosedToday =
    settings.is_force_closed ||
    liveStatus.reason === "CLOSED_DATE" ||
    liveStatus.reason === "DAY_OFF";
  const navbarStatusLabel = isClosedToday
    ? "Tutup hari ini"
    : liveStatus.isOpen
      ? "Sedang buka"
      : "Booking tersedia";

  const todaySchedule =
    schedules.find((s) => s.day_of_week === nowParts.dayOfWeek) ?? null;
  const todayClosedEntry =
    closedDates.find((c) => c.closed_date === nowParts.dateStr) ?? null;

  const footerHoursLabel = settings.is_force_closed
    ? "Tutup sementara"
    : todayClosedEntry
      ? todayClosedEntry.reason?.trim() || "Libur khusus"
      : todaySchedule && todaySchedule.is_open
        ? `${formatTimeHHMM(todaySchedule.open_time)} – ${formatTimeHHMM(
            todaySchedule.close_time
          )} WIB`
        : "Hari ini libur";

  const footerAddress = settings.short_address.replace(/^Jalan\b/i, "Jl.");
  const cleanWhatsappNumber = (
    settings.whatsapp_number || "62895701807228"
  ).replace(/\D/g, "");
  const whatsappDirectUrl = `https://wa.me/${cleanWhatsappNumber}`;

  return (
    <div className="min-h-[100dvh] bg-alabaster text-ink">
      <HairSalonJsonLd schedules={schedules} storeSettings={settings} />

      {/* =====================================================================
          WRAPPER HERO & NAVBAR TRANSPARAN (OPSI B MOBILE + S-CURVE DESKTOP)
      ===================================================================== */}
      <div className="relative w-full overflow-hidden">
        {/* Top Navbar: Logo kiri, tautan navigasi di tengah, status berlatar lembut di kanan */}
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

            {/* Kanan: Ikon kalender + status dinamis Asia/Pontianak */}
            <div className="justify-self-end">
              <div
                role="status"
                aria-live="polite"
                className={`inline-flex items-center gap-2 rounded-full bg-[#F7F3EC]/90 px-3.5 py-1.5 font-sans text-xs font-medium whitespace-nowrap shadow-xs backdrop-blur-sm sm:text-sm ${
                  isClosedToday ? "text-crimson-alert" : "text-ink"
                }`}
              >
                {isClosedToday ? (
                  <Calendar
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-crimson-alert"
                  />
                ) : (
                  <CalendarCheck
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-terracotta"
                  />
                )}
                <span>{navbarStatusLabel}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Split Hero: Mobile ringkas tanpa foto (Opsi B), Desktop S-Curve Full-Bleed */}
        <section
          aria-labelledby="hero-heading"
          className="relative w-full lg:min-h-[620px]"
        >
          {/* Kolom Kiri: Judul Instrument Serif, Subjudul lugas, 1 CTA utama (tanpa eyebrow duplikat) */}
          <div className="relative z-10 mx-auto max-w-6xl px-safe pt-6 pb-2 lg:flex lg:min-h-[620px] lg:items-center lg:pt-24 lg:pb-24">
            <div className="lg:w-[46%] lg:pr-12 xl:pr-16">
              <h1
                id="hero-heading"
                className="font-serif text-4xl leading-[1.06] font-normal tracking-tight text-ink sm:text-5xl lg:text-[62px]"
              >
                Atur Jadwal Cukur,{" "}
                <span className="block italic text-terracotta">
                  Datang Tanpa Antre.
                </span>
              </h1>

              <p className="mt-4 max-w-md font-sans text-sm leading-relaxed text-muted sm:text-base">
                Pilih layanan dan jam yang tersedia, kunci jadwalmu, lalu
                konfirmasi lewat WhatsApp.
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

          {/* Kanan (Desktop lg: saja): Foto Barbershop + S-Curve Tajam Tanpa Kabut */}
          <div className="hidden lg:block lg:absolute lg:top-0 lg:right-0 lg:h-full lg:min-h-[620px] lg:w-[56%]">
            <div className="relative h-full min-h-[620px] w-full overflow-hidden bg-ink">
              <Image
                src={heroImageUrl}
                alt={brand.heroAlt}
                fill
                priority
                sizes="(max-width: 1023px) 0px, 56vw"
                className="object-cover object-center"
              />

              {/* Lengkungan S-Curve Bersih & Tajam menyatu langsung dengan Warm Alabaster (#EFE8DD) */}
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-y-0 left-0 h-full w-full"
              >
                <path
                  d="M -1 -1 L 41 -1 C 36 20, 6 32, 6 56 C 6 79, 21 91, 34 101 L -1 101 Z"
                  fill="#EFE8DD"
                />
              </svg>
            </div>
          </div>
        </section>
      </div>

      <main>
        {/* ===================================================================
            FLOATING PILL DOCK 3 SEGMEN + GALERI & REELS + RESERVASI
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
          FOOTER MINIMALIS 3 KOLOM — DEEP SLATE CHARCOAL (#303841)
      ===================================================================== */}
      <footer
        id="lokasi"
        className="scroll-mt-24 rounded-t-[32px] bg-[#303841] px-safe pt-12 pb-safe text-[#F7F3EC] sm:pt-14"
      >
        <div className="mx-auto max-w-6xl space-y-10 pb-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:items-start lg:gap-12">
            {/* Kolom Kiri: HANYA Logo Madzhair.co */}
            <div>
              <BrandMark variant="full" size="md" tone="onDark" href="/" />
            </div>

            {/* Kolom Tengah: Jam Operasional & Wilayah */}
            <div className="space-y-1.5">
              <h2 className="font-sans text-sm font-semibold text-[#F7F3EC]">
                Jam operasional
              </h2>
              <p className="font-sans text-sm text-[#F7F3EC]/75">
                Sungai Kunyit, Kalimantan Barat
              </p>
              <p className="pt-1 font-sans text-sm font-semibold text-[#F7F3EC] tabular-nums">
                {footerHoursLabel}
              </p>
            </div>

            {/* Kolom Kanan: Alamat + 3 Tautan Pintas Bersih (Google Maps, WhatsApp, Instagram) */}
            <div className="space-y-3.5">
              <div>
                <p className="font-sans text-sm font-semibold text-[#F7F3EC]">
                  {footerAddress}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href={settings.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#F7F3EC]/10 px-4 py-2 font-sans text-xs font-medium text-[#F7F3EC] transition-colors hover:bg-terracotta"
                >
                  <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>Google Maps</span>
                </a>

                <a
                  href={whatsappDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#F7F3EC]/10 px-4 py-2 font-sans text-xs font-medium text-[#F7F3EC] transition-colors hover:bg-terracotta"
                >
                  <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </a>

                <a
                  href={brand.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#F7F3EC]/10 px-4 py-2 font-sans text-xs font-medium text-[#F7F3EC] transition-colors hover:bg-terracotta"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                  >
                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                  </svg>
                  <span>Instagram</span>
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-[#F7F3EC]/12 pt-5">
            <p className="font-sans text-xs text-[#F7F3EC]/65">
              © {new Date().getFullYear()} {settings.store_name} ·{" "}
              {settings.brand_tagline}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
