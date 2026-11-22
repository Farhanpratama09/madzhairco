import { DEFAULT_STORE_SETTINGS, DEFAULT_WEEKLY_SCHEDULES } from "@/lib/seed";
import { formatTimeHHMM } from "@/lib/slots";
import type { StoreSettings, WeeklySchedule } from "@/types/database";

const SCHEMA_DAY_NAMES: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export interface HairSalonJsonLdProps {
  schedules?: WeeklySchedule[];
  storeSettings?: Partial<StoreSettings> | null;
  siteUrl?: string;
}

function normalizeTelephone(rawPhone?: string | null): string {
  const digits = (rawPhone ?? DEFAULT_STORE_SETTINGS.whatsapp_number).replace(
    /\D/g,
    ""
  );
  if (!digits) {
    return "+62895701807228";
  }
  if (digits.startsWith("0")) {
    return `+62${digits.slice(1)}`;
  }
  return `+${digits}`;
}

function buildOpeningHoursSpecification(schedules: WeeklySchedule[]) {
  const activeSchedules = schedules.filter((item) => item.is_open);

  const grouped = new Map<
    string,
    { dayOfWeek: string[]; opens: string; closes: string }
  >();

  for (const schedule of activeSchedules) {
    const dayName = SCHEMA_DAY_NAMES[schedule.day_of_week];
    if (!dayName) continue;

    const opens = formatTimeHHMM(schedule.open_time);
    const closes = formatTimeHHMM(schedule.close_time);
    const groupKey = `${opens}-${closes}`;

    const existing = grouped.get(groupKey);
    if (existing) {
      if (!existing.dayOfWeek.includes(dayName)) {
        existing.dayOfWeek.push(dayName);
      }
    } else {
      grouped.set(groupKey, {
        dayOfWeek: [dayName],
        opens,
        closes,
      });
    }
  }

  return Array.from(grouped.values()).map((entry) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: entry.dayOfWeek,
    opens: entry.opens,
    closes: entry.closes,
  }));
}

export function HairSalonJsonLd({
  schedules,
  storeSettings,
  siteUrl,
}: HairSalonJsonLdProps) {
  const resolvedSiteUrl = (
    siteUrl ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://madzhair.vercel.app"
  ).replace(/\/+$/, "");

  const resolvedSchedules =
    schedules && schedules.length > 0 ? schedules : DEFAULT_WEEKLY_SCHEDULES;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["HairSalon", "LocalBusiness"],
    "@id": `${resolvedSiteUrl}/hairsalon`,
    name: storeSettings?.brand_tagline?.trim() || "Madzhair Barber & Co",
    alternateName: storeSettings?.store_name?.trim() || "Madzhair.co",
    description:
      "Barbershop satu kursi di Jalan Raya Sungai Kunyit, Gang Tani. Layanan Haircut dan Hair Chemicals dengan reservasi jadwal real-time tanpa antre.",
    url: resolvedSiteUrl,
    image: [
      `${resolvedSiteUrl}/images/og-image.jpg`,
      `${resolvedSiteUrl}/images/hero-barber.webp`,
    ],
    telephone: normalizeTelephone(storeSettings?.whatsapp_number),
    priceRange: "Rp 30.000 - Rp 250.000",
    currenciesAccepted: "IDR",
    address: {
      "@type": "PostalAddress",
      streetAddress:
        storeSettings?.short_address?.trim() ||
        DEFAULT_STORE_SETTINGS.short_address,
      addressCountry: "ID",
    },
    hasMap:
      storeSettings?.google_maps_url?.trim() ||
      DEFAULT_STORE_SETTINGS.google_maps_url,
    openingHoursSpecification: buildOpeningHoursSpecification(resolvedSchedules),
  };

  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd }}
    />
  );
}

export default HairSalonJsonLd;
