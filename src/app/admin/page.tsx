import { redirect } from "next/navigation";
import { AdminCashierDashboard } from "@/components/admin/AdminCashierDashboard";
import {
  DEFAULT_CLOSED_DATES,
  DEFAULT_GALLERY_ITEMS,
  DEFAULT_SERVICES,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_WEEKLY_SCHEDULES,
} from "@/lib/seed";
import { getTodayAndUpcomingDates } from "@/lib/slots";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  ClosedDate,
  GalleryItem,
  PriceVariant,
  Service,
  StoreSettings,
  WeeklySchedule,
} from "@/types/database";

export const dynamic = "force-dynamic";

function normalizePriceVariants(raw: unknown): PriceVariant[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is PriceVariant =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as PriceVariant).label === "string" &&
      typeof (item as PriceVariant).price === "number" &&
      typeof (item as PriceVariant).display === "string"
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  if (!supabase) {
    redirect("/admin/login");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/admin/login");
  }

  // Jalankan auto-complete secara berurutan SEBELUM memuat daftar booking
  try {
    await supabase.rpc("auto_complete_overdue_bookings");
  } catch {
    // Fallback aman bila migrasi belum diterapkan
  }

  const defaultUpcoming = getTodayAndUpcomingDates(
    DEFAULT_STORE_SETTINGS.timezone,
    8
  );
  const defaultStart = defaultUpcoming[0]?.dateStr ?? "";
  const defaultEnd =
    defaultUpcoming[defaultUpcoming.length - 1]?.dateStr ?? defaultStart;

  const [
    settingsRes,
    schedulesRes,
    closedDatesRes,
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
      .order("sort_order", { ascending: true }),
    supabase
      .from("gallery_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    defaultStart
      ? supabase
          .from("bookings")
          .select("*")
          .gte("booking_date", defaultStart)
          .lte("booking_date", defaultEnd)
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true })
      : Promise.resolve({ data: [] as Booking[] }),
  ]);

  const initialSettings: StoreSettings =
    (settingsRes.data as StoreSettings | null) ?? DEFAULT_STORE_SETTINGS;

  const initialSchedules: WeeklySchedule[] =
    schedulesRes.data && schedulesRes.data.length > 0
      ? (schedulesRes.data as WeeklySchedule[])
      : DEFAULT_WEEKLY_SCHEDULES;

  const initialClosedDates: ClosedDate[] =
    (closedDatesRes.data as ClosedDate[] | null) ?? DEFAULT_CLOSED_DATES;

  const initialServices: Service[] =
    servicesRes.data && servicesRes.data.length > 0
      ? (servicesRes.data as Service[]).map((service) => ({
          ...service,
          price_variants: normalizePriceVariants(service.price_variants),
        }))
      : DEFAULT_SERVICES;

  const initialGalleryItems: GalleryItem[] = galleryRes.error
    ? DEFAULT_GALLERY_ITEMS
    : ((galleryRes.data as GalleryItem[] | null) ?? []);

  let initialBookings: Booking[] =
    (bookingsRes.data as Booking[] | null) ?? [];

  if (initialSettings.timezone !== DEFAULT_STORE_SETTINGS.timezone) {
    const upcomingDates = getTodayAndUpcomingDates(initialSettings.timezone, 8);
    const startDate = upcomingDates[0]?.dateStr ?? "";
    const endDate =
      upcomingDates[upcomingDates.length - 1]?.dateStr ?? startDate;
    if (startDate && (startDate !== defaultStart || endDate !== defaultEnd)) {
      const tzBookingsRes = await supabase
        .from("bookings")
        .select("*")
        .gte("booking_date", startDate)
        .lte("booking_date", endDate)
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true });
      initialBookings = (tzBookingsRes.data as Booking[] | null) ?? [];
    }
  }

  // Muat nomor WA privat dari booking_contacts khusus sesi admin terautentikasi
  const initialBookingPhones: Record<string, string> = {};
  if (initialBookings.length > 0) {
    try {
      const { data: contactRows } = await supabase
        .from("booking_contacts")
        .select("booking_id, phone")
        .in(
          "booking_id",
          initialBookings.map((b) => b.id)
        );
      if (Array.isArray(contactRows)) {
        for (const row of contactRows) {
          if (row && typeof row.booking_id === "string" && typeof row.phone === "string") {
            initialBookingPhones[row.booking_id] = row.phone;
          }
        }
      }
    } catch {
      // Fallback aman bila tabel booking_contacts belum dimigrasi
    }
  }

  const userUsername =
    typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username
      : "";

  return (
    <AdminCashierDashboard
      userEmail={user.email ?? "Admin"}
      userUsername={userUsername}
      initialSettings={initialSettings}
      initialSchedules={initialSchedules}
      initialClosedDates={initialClosedDates}
      initialServices={initialServices}
      initialGalleryItems={initialGalleryItems}
      initialBookings={initialBookings}
      initialBookingPhones={initialBookingPhones}
    />
  );
}
