import { cache } from "react";
import type { Metadata } from "next";
import { SmartTicketView } from "@/components/ticket/SmartTicketView";
import { validateTicketCode } from "@/lib/security/sanitize";
import {
  DEFAULT_CLOSED_DATES,
  DEFAULT_SERVICES,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_WEEKLY_SCHEDULES,
} from "@/lib/seed";
import { formatTimeHHMM } from "@/lib/slots";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  ClosedDate,
  PublicBookingSlot,
  Service,
  StoreSettings,
  WeeklySchedule,
} from "@/types/database";

export const dynamic = "force-dynamic";

type TicketPageProps = {
  params: Promise<{ code: string }>;
};

function normalizeTicketCode(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toUpperCase();
  } catch {
    return raw.trim().toUpperCase();
  }
}

const loadTicketBooking = cache(
  async (normalizedCode: string): Promise<Booking | null> => {
    if (!validateTicketCode(normalizedCode) || !isSupabaseConfigured()) {
      return null;
    }

    const supabase = await createClient();
    if (!supabase) {
      return null;
    }

    const { data } = await supabase.rpc("get_booking_by_ticket_code", {
      p_ticket_code: normalizedCode,
    });

    return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  }
);

export async function generateMetadata({
  params,
}: TicketPageProps): Promise<Metadata> {
  const { code } = await params;
  const normalizedCode = normalizeTicketCode(code);
  const title = `Tiket Reservasi ${normalizedCode} — Madzhair Barber & Co`;
  let description =
    "Bukti tiket reservasi kursi resmi Madzhair Barber & Co — Jalan Raya Sungai Kunyit, Gang Tani.";

  const booking = await loadTicketBooking(normalizedCode);
  if (booking) {
    description = `Reservasi ${booking.service_name} a.n. ${booking.customer_name} pada ${booking.booking_date} pukul ${formatTimeHHMM(
      booking.start_time
    )} WIB (${booking.status}) — Madzhair Barber & Co.`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/tiket/${encodeURIComponent(normalizedCode)}`,
      siteName: "Madzhair.co",
      locale: "id_ID",
      type: "website",
      images: [
        {
          url: "/images/og-image.jpg",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/images/og-image.jpg"],
    },
  };
}

export default async function TicketPage({ params }: TicketPageProps) {
  const { code } = await params;
  const normalizedCode = normalizeTicketCode(code);
  const isValidCodeFormat = validateTicketCode(normalizedCode);
  const supabaseConfigured = isSupabaseConfigured();

  let isAdminAuthenticated = false;
  let booking: Booking | null = null;
  let settings: StoreSettings = DEFAULT_STORE_SETTINGS;
  let schedules: WeeklySchedule[] = DEFAULT_WEEKLY_SCHEDULES;
  let closedDates: ClosedDate[] = DEFAULT_CLOSED_DATES;
  let services: Service[] = DEFAULT_SERVICES;
  let dateBookings: PublicBookingSlot[] = [];

  if (supabaseConfigured) {
    const supabase = await createClient();
    if (supabase) {
      const [{ data: authData }, settingsRes, resolvedBooking] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from("store_settings")
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          loadTicketBooking(normalizedCode),
        ]);

      isAdminAuthenticated = Boolean(authData.user);
      if (settingsRes.data) {
        settings = settingsRes.data;
      }
      booking = resolvedBooking;

      if (booking && isAdminAuthenticated) {
        const [schedulesRes, closedRes, servicesRes, bookingsRes] =
          await Promise.all([
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
            supabase.rpc("get_public_bookings_for_date", {
              p_date: booking.booking_date,
            }),
          ]);

        if (schedulesRes.data && schedulesRes.data.length > 0) {
          schedules = schedulesRes.data;
        }
        if (closedRes.data) {
          closedDates = closedRes.data;
        }
        if (servicesRes.data && servicesRes.data.length > 0) {
          services = servicesRes.data;
        }
        if (Array.isArray(bookingsRes.data)) {
          dateBookings = bookingsRes.data;
        }
      }
    }
  }

  return (
    <SmartTicketView
      ticketCode={normalizedCode}
      isValidCodeFormat={isValidCodeFormat}
      isSupabaseMode={supabaseConfigured}
      isAdminAuthenticated={isAdminAuthenticated}
      initialBooking={booking}
      settings={settings}
      schedules={schedules}
      closedDates={closedDates}
      services={services}
      dateBookings={dateBookings}
    />
  );
}
