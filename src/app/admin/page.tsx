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

  const [
    settingsRes,
    schedulesRes,
    closedDatesRes,
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
      .order("sort_order", { ascending: true }),
    supabase
      .from("gallery_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
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

  const upcomingDates = getTodayAndUpcomingDates(initialSettings.timezone, 8);
  const startDate = upcomingDates[0]?.dateStr ?? "";
  const endDate = upcomingDates[upcomingDates.length - 1]?.dateStr ?? startDate;

  const bookingsRes = startDate
    ? await supabase
        .from("bookings")
        .select("*")
        .gte("booking_date", startDate)
        .lte("booking_date", endDate)
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true })
    : { data: [] as Booking[] };

  const initialBookings: Booking[] =
    (bookingsRes.data as Booking[] | null) ?? [];

  return (
    <AdminCashierDashboard
      userEmail={user.email ?? "Admin"}
      initialSettings={initialSettings}
      initialSchedules={initialSchedules}
      initialClosedDates={initialClosedDates}
      initialServices={initialServices}
      initialGalleryItems={initialGalleryItems}
      initialBookings={initialBookings}
    />
  );
}
