"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  CalendarOff,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  ImagePlus,
  Link2,
  LogOut,
  Plus,
  Power,
  RefreshCw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { InstallPwaBanner } from "@/components/admin/InstallPwaBanner";
import { BrandMark } from "@/components/ui/BrandMark";
import { EditorialSectionHeader } from "@/components/ui/EditorialSectionHeader";
import { LiveStatusTag } from "@/components/ui/LiveStatusTag";
import { validateSocialEmbedUrl } from "@/lib/security/sanitize";
import {
  calculateAvailableSlots,
  findWalkinTargetSlot,
  formatTimeHHMM,
  getDayOfWeekFromDateStr,
  getStoreNowParts,
  getTodayAndUpcomingDates,
  isStoreOpenLive,
  minutesToTime,
  parseTimeToMinutes,
} from "@/lib/slots";
import { createClient } from "@/lib/supabase/client";
import type {
  Booking,
  ClosedDate,
  GalleryItem,
  PriceVariant,
  Service,
  SlotItem,
  StoreSettings,
  WeeklySchedule,
} from "@/types/database";

export interface AdminCashierDashboardProps {
  userEmail: string;
  initialSettings: StoreSettings;
  initialSchedules: WeeklySchedule[];
  initialClosedDates: ClosedDate[];
  initialServices: Service[];
  initialGalleryItems: GalleryItem[];
  initialBookings: Booking[];
}

type DashboardTab = "queue" | "cms";

type ToastMessage = {
  type: "success" | "error";
  text: string;
};

const DAY_LABELS = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1200;
/** Tinggi track 60 menit (88px/jam: 1x Haircut ~80px, 2x Hair Chemicals ~168px proporsional) */
const HOUR_ROW_HEIGHT_PX = 88;

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

function formatIndonesianDateShort(dateStr: string): string {
  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = Number.parseInt(yStr ?? "", 10);
  const month = Number.parseInt(mStr ?? "", 10);
  const day = Number.parseInt(dStr ?? "", 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return dateStr;
  }
  const dayName = DAY_LABELS[getDayOfWeekFromDateStr(dateStr)] ?? "Hari";
  const monthName = MONTH_NAMES_SHORT[month - 1] ?? "";
  return `${dayName}, ${day} ${monthName} ${year}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sortBookings(items: Booking[]): Booking[] {
  return [...items].sort((a, b) => {
    if (a.booking_date !== b.booking_date) {
      return a.booking_date.localeCompare(b.booking_date);
    }
    return a.start_time.localeCompare(b.start_time);
  });
}

function upsertBooking(list: Booking[], item: Booking): Booking[] {
  const index = list.findIndex((b) => b.id === item.id);
  if (index === -1) {
    return sortBookings([...list, item]);
  }
  const next = [...list];
  next[index] = item;
  return sortBookings(next);
}

function extractStoragePathFromUrl(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/gallery/";
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  const path = publicUrl.slice(idx + marker.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

async function compressImageToWebP(
  file: File
): Promise<{ blob: Blob; width: number; height: number; previewUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error("Gagal membaca file gambar. Gunakan JPG, PNG, atau WebP."));
      image.src = objectUrl;
    });

    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
    );
    const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas tidak didukung di perangkat ini.");
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const encodeAtQuality = (quality: number) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (!result) {
              reject(new Error("Gagal mengonversi gambar ke format WebP."));
              return;
            }
            resolve(result);
          },
          "image/webp",
          quality
        );
      });

    let webpBlob = await encodeAtQuality(0.84);
    if (webpBlob.size > MAX_UPLOAD_BYTES) {
      webpBlob = await encodeAtQuality(0.72);
    }

    if (webpBlob.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `Ukuran gambar setelah kompresi WebP (${formatBytes(
          webpBlob.size
        )}) masih melebihi batas 3 MB.`
      );
    }

    const previewUrl = URL.createObjectURL(webpBlob);
    return {
      blob: webpBlob,
      width: targetWidth,
      height: targetHeight,
      previewUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function AdminCashierDashboard({
  userEmail,
  initialSettings,
  initialSchedules,
  initialClosedDates,
  initialServices,
  initialGalleryItems,
  initialBookings,
}: AdminCashierDashboardProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const db = useMemo(
    () => supabase as unknown as SupabaseClient | null,
    [supabase]
  );

  const [activeTab, setActiveTab] = useState<DashboardTab>("queue");
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [schedules, setSchedules] = useState<WeeklySchedule[]>(initialSchedules);
  const [closedDates, setClosedDates] =
    useState<ClosedDate[]>(initialClosedDates);
  const [services, setServices] = useState<Service[]>(initialServices);
  const [galleryItems, setGalleryItems] =
    useState<GalleryItem[]>(initialGalleryItems);
  const [bookings, setBookings] = useState<Booking[]>(() =>
    sortBookings(initialBookings)
  );

  // Clock tick every 30 seconds so live status & walk-in target slots stay fresh
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const nowParts = useMemo(
    () => getStoreNowParts(settings.timezone, new Date(nowTick)),
    [settings.timezone, nowTick]
  );

  const upcomingDates = useMemo(
    () => getTodayAndUpcomingDates(settings.timezone, 8, new Date(nowTick)),
    [settings.timezone, nowTick]
  );

  const [selectedDate, setSelectedDate] = useState<string>(
    () => getStoreNowParts(initialSettings.timezone).dateStr
  );

  const liveStatus = useMemo(
    () =>
      isStoreOpenLive({
        schedules,
        closedDates,
        settings,
        nowParts,
      }),
    [schedules, closedDates, settings, nowParts]
  );

  // Feedback toast
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = useCallback((type: "success" | "error", text: string) => {
    setToast({ type, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // Emergency Force Close confirmation state (1-tap arm -> 1-tap confirm)
  const [forceCloseConfirmOpen, setForceCloseConfirmOpen] = useState(false);
  const [updatingForceClose, setUpdatingForceClose] = useState(false);

  // Walk-in Thumb-Zone state (2-tap max, zero typing)
  const [pendingWalkin, setPendingWalkin] = useState<{
    service: Service;
    slot: SlotItem;
  } | null>(null);
  const [submittingWalkin, setSubmittingWalkin] = useState(false);

  // Queue item action & Bottom Sheet Detail states
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null
  );
  const [detailSheetMode, setDetailSheetMode] = useState<
    "detail" | "reschedule" | "cancel"
  >("detail");
  const [refreshing, setRefreshing] = useState(false);

  const openBookingDetail = useCallback((bookingId: string) => {
    setPendingWalkin(null);
    setSelectedBookingId(bookingId);
    setDetailSheetMode("detail");
  }, []);

  const closeBookingDetail = useCallback(() => {
    setSelectedBookingId(null);
    setDetailSheetMode("detail");
  }, []);

  useEffect(() => {
    if (!selectedBookingId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyBookingId) {
        closeBookingDetail();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBookingId, busyBookingId, closeBookingDetail]);

  // CMS States: Weekly Schedules
  const [scheduleDrafts, setScheduleDrafts] =
    useState<WeeklySchedule[]>(initialSchedules);
  const [savingSchedules, setSavingSchedules] = useState(false);

  // CMS States: Closed Dates
  const [newClosedDate, setNewClosedDate] = useState("");
  const [newClosedReason, setNewClosedReason] = useState("");
  const [savingClosedDate, setSavingClosedDate] = useState(false);
  const [deletingClosedId, setDeletingClosedId] = useState<string | null>(null);

  // CMS States: Services Pricing
  const [serviceDrafts, setServiceDrafts] = useState<Service[]>(initialServices);
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);

  // CMS States: Gallery Social Embed
  const [socialTitle, setSocialTitle] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [socialCaption, setSocialCaption] = useState("");
  const [savingSocial, setSavingSocial] = useState(false);

  // CMS States: Gallery Photo Upload (Client-side WebP Compression)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoTitle, setPhotoTitle] = useState("");
  const [photoCaption, setPhotoCaption] = useState("");
  const [compressedPhoto, setCompressedPhoto] = useState<{
    blob: Blob;
    originalSize: number;
    width: number;
    height: number;
    previewUrl: string;
    originalName: string;
  } | null>(null);
  const [compressingPhoto, setCompressingPhoto] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [busyGalleryId, setBusyGalleryId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (compressedPhoto?.previewUrl) {
        URL.revokeObjectURL(compressedPhoto.previewUrl);
      }
    };
  }, [compressedPhoto]);

  // Refresh data manually or after reconnect
  const refreshAllData = useCallback(async () => {
    if (!supabase) return;
    setRefreshing(true);
    try {
      const startDate = upcomingDates[0]?.dateStr ?? nowParts.dateStr;
      const endDate =
        upcomingDates[upcomingDates.length - 1]?.dateStr ?? startDate;

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
        supabase
          .from("bookings")
          .select("*")
          .gte("booking_date", startDate)
          .lte("booking_date", endDate)
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true }),
      ]);

      if (settingsRes.data) {
        setSettings(settingsRes.data as StoreSettings);
      }
      if (schedulesRes.data) {
        const nextSchedules = schedulesRes.data as WeeklySchedule[];
        setSchedules(nextSchedules);
        setScheduleDrafts(nextSchedules);
      }
      if (closedDatesRes.data) {
        setClosedDates(closedDatesRes.data as ClosedDate[]);
      }
      if (servicesRes.data) {
        const nextServices = (servicesRes.data as Service[]).map((s) => ({
          ...s,
          price_variants: Array.isArray(s.price_variants)
            ? s.price_variants
            : [],
        }));
        setServices(nextServices);
        setServiceDrafts(nextServices);
      }
      if (galleryRes.data) {
        setGalleryItems(galleryRes.data as GalleryItem[]);
      }
      if (bookingsRes.data) {
        setBookings(sortBookings(bookingsRes.data as Booking[]));
      }
      setNowTick(Date.now());
    } catch {
      showToast("error", "Gagal menyinkronkan data terbaru.");
    } finally {
      setRefreshing(false);
    }
  }, [supabase, upcomingDates, nowParts.dateStr, showToast]);

  // Realtime subscription to bookings, store_settings, weekly_schedules, closed_dates
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("admin-cashier-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              setBookings((prev) => prev.filter((b) => b.id !== deletedId));
            }
            return;
          }
          const incoming = payload.new as Booking | null;
          if (incoming?.id) {
            setBookings((prev) => upsertBooking(prev, incoming));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_settings" },
        (payload) => {
          const updated = payload.new as StoreSettings | null;
          if (updated?.id) {
            setSettings(updated);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_schedules" },
        (payload) => {
          const updated = payload.new as WeeklySchedule | null;
          if (updated && typeof updated.day_of_week === "number") {
            setSchedules((prev) => {
              const next = prev.map((row) =>
                row.day_of_week === updated.day_of_week ? updated : row
              );
              return next.sort((a, b) => a.day_of_week - b.day_of_week);
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "closed_dates" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              setClosedDates((prev) => prev.filter((d) => d.id !== deletedId));
            }
            return;
          }
          const row = payload.new as ClosedDate | null;
          if (row?.id) {
            setClosedDates((prev) => {
              const filtered = prev.filter((d) => d.id !== row.id);
              return [...filtered, row].sort((a, b) =>
                a.closed_date.localeCompare(b.closed_date)
              );
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Identify Haircut & Hair Chemicals services for 1-Tap Walk-in buttons
  const haircutService = useMemo(
    () =>
      services.find((s) => s.is_active && s.slug === "haircut") ??
      services.find((s) => s.is_active && s.slot_duration_minutes <= 60) ??
      services[0] ??
      null,
    [services]
  );

  const chemicalsService = useMemo(
    () =>
      services.find((s) => s.is_active && s.slug === "hair-chemicals") ??
      services.find((s) => s.is_active && s.slot_duration_minutes >= 120) ??
      services[1] ??
      null,
    [services]
  );

  const haircutWalkinSlot = useMemo(
    () =>
      haircutService
        ? findWalkinTargetSlot(
            haircutService,
            schedules,
            closedDates,
            bookings,
            settings,
            nowParts
          )
        : null,
    [haircutService, schedules, closedDates, bookings, settings, nowParts]
  );

  const chemicalsWalkinSlot = useMemo(
    () =>
      chemicalsService
        ? findWalkinTargetSlot(
            chemicalsService,
            schedules,
            closedDates,
            bookings,
            settings,
            nowParts
          )
        : null,
    [chemicalsService, schedules, closedDates, bookings, settings, nowParts]
  );

  // Filtered bookings for selectedDate
  const dayBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.booking_date === selectedDate)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [bookings, selectedDate]
  );

  const dayCounts = useMemo(() => {
    let booked = 0;
    let completed = 0;
    let cancelled = 0;
    for (const b of dayBookings) {
      if (b.status === "BOOKED") booked += 1;
      else if (b.status === "COMPLETED") completed += 1;
      else if (b.status === "CANCELLED") cancelled += 1;
    }
    return { booked, completed, cancelled };
  }, [dayBookings]);

  const activeCountByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bookings) {
      if (b.status === "BOOKED") {
        counts.set(b.booking_date, (counts.get(b.booking_date) ?? 0) + 1);
      }
    }
    return counts;
  }, [bookings]);

  // Pisahkan antrean timeline aktif (BOOKED saja — COMPLETED langsung membebaskan slot kursi)
  const timelineBookings = useMemo(
    () => dayBookings.filter((b) => b.status === "BOOKED"),
    [dayBookings]
  );

  const completedBookings = useMemo(
    () => dayBookings.filter((b) => b.status === "COMPLETED"),
    [dayBookings]
  );

  const cancelledBookings = useMemo(
    () => dayBookings.filter((b) => b.status === "CANCELLED"),
    [dayBookings]
  );

  const selectedDateMeta = useMemo(() => {
    const dayOfWeek = getDayOfWeekFromDateStr(selectedDate);
    const schedule =
      schedules.find((item) => item.day_of_week === dayOfWeek) ?? null;
    const closedDate =
      closedDates.find((item) => item.closed_date === selectedDate) ?? null;
    return { dayOfWeek, schedule, closedDate };
  }, [selectedDate, schedules, closedDates]);

  const timelineRange = useMemo(() => {
    const { schedule, closedDate } = selectedDateMeta;
    const hasOpenSchedule = Boolean(
      schedule && schedule.is_open && !closedDate
    );

    let minMinutes = Number.POSITIVE_INFINITY;
    let maxMinutes = Number.NEGATIVE_INFINITY;

    if (hasOpenSchedule && schedule) {
      const openMin = parseTimeToMinutes(schedule.open_time);
      const closeMin = parseTimeToMinutes(schedule.close_time);
      if (closeMin > openMin) {
        minMinutes = Math.min(minMinutes, openMin);
        maxMinutes = Math.max(maxMinutes, closeMin);
      }
    }

    for (const b of timelineBookings) {
      const bStart = parseTimeToMinutes(b.start_time);
      const bEnd = parseTimeToMinutes(b.end_time);
      if (bEnd > bStart) {
        minMinutes = Math.min(minMinutes, bStart);
        maxMinutes = Math.max(maxMinutes, bEnd);
      }
    }

    if (
      !Number.isFinite(minMinutes) ||
      !Number.isFinite(maxMinutes) ||
      maxMinutes <= minMinutes
    ) {
      return null;
    }

    const startMinutes = Math.floor(minMinutes / 60) * 60;
    const endMinutes = Math.max(
      startMinutes + 60,
      Math.ceil(maxMinutes / 60) * 60
    );

    const hours: number[] = [];
    for (let m = startMinutes; m < endMinutes; m += 60) {
      hours.push(m);
    }

    return {
      startMinutes,
      endMinutes,
      hours,
      totalHeightPx: hours.length * HOUR_ROW_HEIGHT_PX,
    };
  }, [selectedDateMeta, timelineBookings]);

  const showCurrentTimeLine = Boolean(
    timelineRange &&
      selectedDate === nowParts.dateStr &&
      nowParts.minutesFromMidnight >= timelineRange.startMinutes &&
      nowParts.minutesFromMidnight <= timelineRange.endMinutes
  );

  const currentTimeTopPx = timelineRange
    ? ((nowParts.minutesFromMidnight - timelineRange.startMinutes) / 60) *
      HOUR_ROW_HEIGHT_PX
    : 0;

  // Turunkan selectedBooking langsung dari bookings agar selalu sinkron live dengan Realtime
  const selectedBooking = useMemo(
    () =>
      selectedBookingId
        ? bookings.find((b) => b.id === selectedBookingId) ?? null
        : null,
    [bookings, selectedBookingId]
  );

  const selectedBookingRescheduleSlots = useMemo(() => {
    if (!selectedBooking || selectedBooking.status !== "BOOKED") return [];

    const fallbackDuration = Math.max(
      60,
      parseTimeToMinutes(selectedBooking.end_time) -
        parseTimeToMinutes(selectedBooking.start_time)
    );

    const matchedService =
      services.find((s) => s.id === selectedBooking.service_id) ??
      services.find(
        (s) =>
          s.name.toLowerCase() === selectedBooking.service_name.toLowerCase()
      ) ?? { slot_duration_minutes: fallbackDuration };

    return calculateAvailableSlots({
      date: selectedBooking.booking_date,
      service: matchedService,
      schedules,
      closedDates,
      bookings,
      settings,
      nowParts,
      ignoreLeadTime: true,
      excludeBookingId: selectedBooking.id,
    }).filter(
      (slot) =>
        slot.available &&
        slot.time !== formatTimeHHMM(selectedBooking.start_time)
    );
  }, [
    selectedBooking,
    services,
    schedules,
    closedDates,
    bookings,
    settings,
    nowParts,
  ]);

  // Handlers: Auth Sign Out
  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  // Handlers: Emergency Force Close Toggle
  const handleToggleForceClose = async () => {
    if (!db) return;
    const nextState = !settings.is_force_closed;
    setUpdatingForceClose(true);
    try {
      const { data, error } = await db
        .from("store_settings")
        .update({ is_force_closed: nextState })
        .eq("id", settings.id)
        .select("*")
        .single();

      if (error || !data) {
        showToast("error", error?.message || "Gagal memperbarui status toko.");
        return;
      }

      setSettings(data as StoreSettings);
      setForceCloseConfirmOpen(false);
      setPendingWalkin(null);
      showToast(
        "success",
        nextState
          ? "Mode Tutup Darurat AKTIF. Booking publik ditutup."
          : "Toko kembali BUKA menerima reservasi & walk-in."
      );
    } finally {
      setUpdatingForceClose(false);
    }
  };

  // Handlers: Confirm 2-Tap Walk-in
  const handleConfirmWalkin = async () => {
    if (!pendingWalkin) return;
    setSubmittingWalkin(true);
    try {
      const res = await fetch("/api/admin/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: pendingWalkin.service.id,
          bookingDate: nowParts.dateStr,
          startTime: pendingWalkin.slot.time,
        }),
      });

      const data = (await res.json()) as {
        booking?: Booking;
        error?: string;
      };

      if (!res.ok || !data.booking) {
        showToast("error", data.error || "Gagal mencatat walk-in.");
        setPendingWalkin(null);
        void refreshAllData();
        return;
      }

      setBookings((prev) => upsertBooking(prev, data.booking!));
      setSelectedDate(data.booking.booking_date);
      showToast(
        "success",
        `Walk-in ${data.booking.service_name} terkunci: ${data.booking.ticket_code} (${formatTimeHHMM(
          data.booking.start_time
        )})`
      );
      setPendingWalkin(null);
    } catch {
      showToast("error", "Gangguan jaringan saat menyimpan walk-in.");
    } finally {
      setSubmittingWalkin(false);
    }
  };

  // Handlers: Queue Booking Actions (Complete / Reschedule / Cancel)
  const handleBookingMutation = async (
    bookingId: string,
    payload:
      | { action: "complete" }
      | { action: "cancel" }
      | { action: "reschedule"; newStartTime: string }
  ) => {
    setBusyBookingId(bookingId);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        booking?: Booking;
        error?: string;
      };

      if (!res.ok || !data.booking) {
        showToast("error", data.error || "Gagal memperbarui jadwal.");
        return;
      }

      setBookings((prev) => upsertBooking(prev, data.booking!));
      closeBookingDetail();

      if (payload.action === "complete") {
        showToast("success", `Sesi ${data.booking.ticket_code} ditandai selesai.`);
      } else if (payload.action === "cancel") {
        showToast(
          "success",
          `Jadwal ${data.booking.ticket_code} dibatalkan. Slot kini bebas.`
        );
      } else {
        showToast(
          "success",
          `Jadwal ${data.booking.ticket_code} digeser ke ${formatTimeHHMM(
            data.booking.start_time
          )}.`
        );
      }
    } catch {
      showToast("error", "Gagal terhubung ke server.");
    } finally {
      setBusyBookingId(null);
    }
  };

  // CMS Handlers: Weekly Schedules
  const handleSaveSchedules = async () => {
    if (!db) return;
    for (const row of scheduleDrafts) {
      if (row.is_open && row.close_time <= row.open_time) {
        showToast(
          "error",
          `Jam tutup hari ${DAY_LABELS[row.day_of_week]} harus lebih akhir dari jam buka.`
        );
        return;
      }
    }

    setSavingSchedules(true);
    try {
      const normalized = scheduleDrafts.map((row) => ({
        day_of_week: row.day_of_week,
        is_open: row.is_open,
        open_time:
          row.open_time.length === 5 ? `${row.open_time}:00` : row.open_time,
        close_time:
          row.close_time.length === 5 ? `${row.close_time}:00` : row.close_time,
      }));

      const { data, error } = await db
        .from("weekly_schedules")
        .upsert(normalized, { onConflict: "day_of_week" })
        .select("*");

      if (error || !data) {
        showToast("error", error?.message || "Gagal menyimpan jam buka.");
        return;
      }

      const sorted = (data as WeeklySchedule[]).sort(
        (a, b) => a.day_of_week - b.day_of_week
      );
      setSchedules(sorted);
      setScheduleDrafts(sorted);
      showToast("success", "Jam operasional mingguan berhasil disimpan.");
    } finally {
      setSavingSchedules(false);
    }
  };

  // CMS Handlers: Closed Dates
  const handleAddClosedDate = async (event: FormEvent) => {
    event.preventDefault();
    if (!db) return;
    if (!newClosedDate) {
      showToast("error", "Pilih tanggal libur terlebih dahulu.");
      return;
    }

    setSavingClosedDate(true);
    try {
      const { data, error } = await db
        .from("closed_dates")
        .insert({
          closed_date: newClosedDate,
          reason: newClosedReason.trim() || null,
        })
        .select("*")
        .single();

      if (error || !data) {
        showToast(
          "error",
          error?.message?.includes("duplicate")
            ? "Tanggal libur tersebut sudah terdaftar."
            : error?.message || "Gagal menambah tanggal libur."
        );
        return;
      }

      const created = data as ClosedDate;
      setClosedDates((prev) =>
        [...prev, created].sort((a, b) =>
          a.closed_date.localeCompare(b.closed_date)
        )
      );
      setNewClosedDate("");
      setNewClosedReason("");
      showToast("success", `Tanggal libur ${created.closed_date} ditambahkan.`);
    } finally {
      setSavingClosedDate(false);
    }
  };

  const handleDeleteClosedDate = async (id: string) => {
    if (!supabase) return;
    setDeletingClosedId(id);
    try {
      const { error } = await supabase.from("closed_dates").delete().eq("id", id);
      if (error) {
        showToast("error", error.message || "Gagal menghapus tanggal libur.");
        return;
      }
      setClosedDates((prev) => prev.filter((item) => item.id !== id));
      showToast("success", "Tanggal libur dihapus.");
    } finally {
      setDeletingClosedId(null);
    }
  };

  // CMS Handlers: Services Pricing
  const updateServiceDraft = (
    serviceId: string,
    updater: (service: Service) => Service
  ) => {
    setServiceDrafts((prev) =>
      prev.map((s) => (s.id === serviceId ? updater(s) : s))
    );
  };

  const handleSaveService = async (service: Service) => {
    if (!db) return;
    if (service.price_max < service.price_min) {
      showToast(
        "error",
        `Harga maksimal ${service.name} tidak boleh lebih kecil dari harga minimal.`
      );
      return;
    }

    setSavingServiceId(service.id);
    try {
      const cleanedVariants = service.price_variants
        .filter((v) => v.label.trim().length > 0)
        .map((v) => ({
          label: v.label.trim(),
          price: Math.max(0, Number(v.price) || 0),
          display: v.display.trim() || `${Math.round((v.price || 0) / 1000)}k`,
        }));

      const { data, error } = await db
        .from("services")
        .update({
          price_display: service.price_display.trim(),
          price_min: Math.max(0, Number(service.price_min) || 0),
          price_max: Math.max(0, Number(service.price_max) || 0),
          price_variants: cleanedVariants,
        })
        .eq("id", service.id)
        .select("*")
        .single();

      if (error || !data) {
        showToast("error", error?.message || "Gagal menyimpan harga layanan.");
        return;
      }

      const updated: Service = {
        ...(data as Service),
        price_variants: Array.isArray((data as Service).price_variants)
          ? (data as Service).price_variants
          : cleanedVariants,
      };
      setServices((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setServiceDrafts((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      showToast("success", `Tarif ${updated.name} diperbarui.`);
    } finally {
      setSavingServiceId(null);
    }
  };

  // CMS Handlers: Gallery Social Embed (Strict Whitelist)
  const socialValidation = useMemo(() => {
    if (!socialUrl.trim()) return null;
    return validateSocialEmbedUrl(socialUrl);
  }, [socialUrl]);

  const handleAddSocialEmbed = async (event: FormEvent) => {
    event.preventDefault();
    if (!db) return;

    const validation = validateSocialEmbedUrl(socialUrl);
    if (!validation.valid || !validation.platform || !validation.url) {
      showToast("error", validation.error || "URL video tidak valid.");
      return;
    }

    const title =
      socialTitle.trim() ||
      (validation.platform === "tiktok"
        ? "Reel TikTok Madzhair"
        : "Instagram Reel Madzhair");

    setSavingSocial(true);
    try {
      const nextOrder =
        galleryItems.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1;

      const { data, error } = await db
        .from("gallery_items")
        .insert({
          title,
          media_type: validation.platform,
          media_url: validation.url,
          thumbnail_url: null,
          caption: socialCaption.trim() || null,
          sort_order: nextOrder,
          is_active: true,
        })
        .select("*")
        .single();

      if (error || !data) {
        showToast("error", error?.message || "Gagal menyimpan embed video.");
        return;
      }

      setGalleryItems((prev) => [data as GalleryItem, ...prev]);
      setSocialTitle("");
      setSocialUrl("");
      setSocialCaption("");
      showToast("success", `Embed ${validation.platform} ditambahkan ke galeri.`);
    } finally {
      setSavingSocial(false);
    }
  };

  // CMS Handlers: Photo Select & Client-side WebP Compression
  const handlePhotoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedInputTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedInputTypes.includes(file.type)) {
      showToast(
        "error",
        "Format foto harus JPG, PNG, atau WebP."
      );
      event.target.value = "";
      return;
    }

    setCompressingPhoto(true);
    try {
      const result = await compressImageToWebP(file);
      setCompressedPhoto((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return {
          blob: result.blob,
          originalSize: file.size,
          width: result.width,
          height: result.height,
          previewUrl: result.previewUrl,
          originalName: file.name,
        };
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal mengompres foto.";
      showToast("error", message);
    } finally {
      setCompressingPhoto(false);
      event.target.value = "";
    }
  };

  const handleUploadCompressedPhoto = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !db || !compressedPhoto) return;

    const title = photoTitle.trim() || "Karya Madzhair Barber & Co";
    setUploadingPhoto(true);
    try {
      const uniqueSuffix = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const filePath = `styles/${uniqueSuffix}.webp`;

      const { error: uploadError } = await supabase.storage
        .from("gallery")
        .upload(filePath, compressedPhoto.blob, {
          contentType: "image/webp",
          upsert: false,
        });

      if (uploadError) {
        showToast(
          "error",
          uploadError.message || "Gagal mengunggah foto ke bucket gallery."
        );
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("gallery").getPublicUrl(filePath);

      const nextOrder =
        galleryItems.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1;

      const { data: inserted, error: insertError } = await db
        .from("gallery_items")
        .insert({
          title,
          media_type: "photo",
          media_url: publicUrl,
          thumbnail_url: publicUrl,
          caption: photoCaption.trim() || null,
          sort_order: nextOrder,
          is_active: true,
        })
        .select("*")
        .single();

      if (insertError || !inserted) {
        showToast(
          "error",
          insertError?.message || "Foto terunggah tetapi gagal dicatat ke galeri."
        );
        return;
      }

      setGalleryItems((prev) => [inserted as GalleryItem, ...prev]);
      setPhotoTitle("");
      setPhotoCaption("");
      setCompressedPhoto((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      showToast("success", "Foto WebP berhasil diunggah ke galeri.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleToggleGalleryActive = async (item: GalleryItem) => {
    if (!db) return;
    setBusyGalleryId(item.id);
    try {
      const { data, error } = await db
        .from("gallery_items")
        .update({ is_active: !item.is_active })
        .eq("id", item.id)
        .select("*")
        .single();

      if (error || !data) {
        showToast("error", error?.message || "Gagal mengubah visibilitas galeri.");
        return;
      }

      setGalleryItems((prev) =>
        prev.map((row) => (row.id === item.id ? (data as GalleryItem) : row))
      );
    } finally {
      setBusyGalleryId(null);
    }
  };

  const handleDeleteGalleryItem = async (item: GalleryItem) => {
    if (!supabase) return;
    setBusyGalleryId(item.id);
    try {
      const { error } = await supabase
        .from("gallery_items")
        .delete()
        .eq("id", item.id);

      if (error) {
        showToast("error", error.message || "Gagal menghapus item galeri.");
        return;
      }

      if (item.media_type === "photo") {
        const storagePath = extractStoragePathFromUrl(item.media_url);
        if (storagePath) {
          await supabase.storage.from("gallery").remove([storagePath]);
        }
      }

      setGalleryItems((prev) => prev.filter((row) => row.id !== item.id));
      showToast("success", "Item galeri dihapus.");
    } finally {
      setBusyGalleryId(null);
    }
  };

  const isQueueTab = activeTab === "queue";
  const hasActiveBottomDrawer = Boolean(pendingWalkin);

  return (
    <div
      className={`min-h-[100dvh] bg-alabaster text-ink pt-safe ${
        isQueueTab
          ? hasActiveBottomDrawer
            ? "pb-60 sm:pb-52"
            : "pb-36 sm:pb-32"
          : "pb-safe"
      }`}
    >
      {/* Top Bar Kasir */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-alabaster/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark variant="compact" size="sm" href="/" />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void refreshAllData()}
              disabled={refreshing}
              aria-label="Muat ulang data antrean"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-hairline bg-surface text-muted transition-colors hover:border-terracotta hover:text-terracotta disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${refreshing ? "animate-spin text-terracotta" : ""}`}
              />
            </button>

            <Link
              href="/"
              className="hidden min-h-[44px] items-center gap-1.5 rounded-xl border border-hairline bg-surface px-3 font-sans text-xs font-medium text-muted transition-colors hover:border-terracotta hover:text-terracotta sm:inline-flex"
            >
              <span>Web</span>
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              aria-label="Keluar dari akun admin"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-hairline bg-surface px-3 font-sans text-xs font-medium text-muted transition-colors hover:border-crimson-alert hover:text-crimson-alert"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>

        {/* Status Strip + Saklar Tutup Darurat (1-Tap Arm -> 1-Tap Confirm) */}
        <div className="border-t border-hairline bg-surface/80">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-2.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-start">
              <LiveStatusTag
                isOpen={liveStatus.isOpen}
                isForceClosed={settings.is_force_closed}
                reason={liveStatus.reason}
                scheduleNote={
                  liveStatus.reason === "BEFORE_OPEN" &&
                  liveStatus.openTime &&
                  liveStatus.closeTime
                    ? `Buka ${liveStatus.openTime}–${liveStatus.closeTime} WIB`
                    : liveStatus.openTime && liveStatus.closeTime
                      ? `${liveStatus.openTime}–${liveStatus.closeTime} WIB`
                      : liveStatus.closedReason ?? undefined
                }
                compact
              />
              <span className="truncate font-sans text-xs text-muted">
                {userEmail}
              </span>
            </div>

            {forceCloseConfirmOpen ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-hairline bg-surface px-3 py-1.5">
                <span className="font-sans text-xs font-medium text-ink">
                  {settings.is_force_closed
                    ? "Buka kembali toko?"
                    : "Aktifkan Tutup Darurat?"}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleToggleForceClose()}
                    disabled={updatingForceClose}
                    className={`inline-flex min-h-[44px] items-center rounded-xl px-3 font-sans text-xs font-semibold transition-opacity disabled:opacity-50 ${
                      settings.is_force_closed
                        ? "bg-emerald-live text-surface"
                        : "bg-crimson-alert text-surface"
                    }`}
                  >
                    {updatingForceClose
                      ? "Menyimpan..."
                      : settings.is_force_closed
                        ? "Ya, Buka"
                        : "Ya, Tutup"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForceCloseConfirmOpen(false)}
                    disabled={updatingForceClose}
                    className="inline-flex min-h-[44px] items-center rounded-xl border border-hairline bg-alabaster px-3 font-sans text-xs font-medium text-muted hover:text-ink"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setForceCloseConfirmOpen(true)}
                className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3.5 font-sans text-xs font-semibold transition-colors ${
                  settings.is_force_closed
                    ? "border-emerald-live/60 bg-emerald-live/12 text-emerald-live hover:bg-emerald-live/20"
                    : "border-crimson-alert/60 bg-crimson-alert/10 text-crimson-alert hover:bg-crimson-alert/20"
                }`}
              >
                <Power aria-hidden="true" className="h-3.5 w-3.5" />
                <span>
                  {settings.is_force_closed
                    ? "Buka Toko Kembali"
                    : "Tutup Darurat"}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pt-4 font-sans sm:px-6">
        <InstallPwaBanner className="mb-4" />

        {/* Toast Notifikasi Aksi */}
        {toast ? (
          <div
            role="status"
            aria-live="polite"
            className={`mb-4 flex items-center justify-between gap-3 rounded-xl border bg-surface px-3.5 py-3 text-sm text-ink ${
              toast.type === "success"
                ? "border-emerald-live/50 bg-emerald-live/10"
                : "border-crimson-alert/50 bg-crimson-alert/10"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  toast.type === "success"
                    ? "bg-emerald-live"
                    : "bg-crimson-alert"
                }`}
              />
              <span>{toast.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Tutup notifikasi"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted hover:text-ink"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* Navigasi Mode Utama */}
        <nav
          aria-label="Navigasi Dashboard Kasir"
          className="mb-5 grid grid-cols-2 gap-1.5 rounded-2xl border border-hairline bg-surface p-1.5"
        >
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-3 font-sans text-xs font-semibold transition-colors sm:text-sm ${
              activeTab === "queue"
                ? "bg-terracotta text-surface"
                : "text-muted hover:bg-surface-elevated hover:text-ink"
            }`}
          >
            <Scissors aria-hidden="true" className="h-4 w-4" />
            <span>Kasir &amp; Antrean</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cms")}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-3 font-sans text-xs font-semibold transition-colors sm:text-sm ${
              activeTab === "cms"
                ? "bg-terracotta text-surface"
                : "text-muted hover:bg-surface-elevated hover:text-ink"
            }`}
          >
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            <span>Operasional &amp; CMS</span>
          </button>
        </nav>

        {/* ================================================================ */}
        {/* TAB 1: ANTREAN & KASIR REAL-TIME (VISUAL TIME-BLOCK TIMELINE)    */}
        {/* ================================================================ */}
        {activeTab === "queue" ? (
          <section aria-label="Antrean Real-time">
            {/* Peringatan jika Tutup Darurat aktif */}
            {settings.is_force_closed ? (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-crimson-alert/50 bg-crimson-alert/10 p-3.5 text-sm text-ink">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-crimson-alert"
                />
                <p>
                  <strong className="font-semibold">
                    Tutup darurat sedang aktif.
                  </strong>{" "}
                  Walk-in maupun booking online dinonaktifkan sementara hingga
                  saklar dibuka kembali.
                </p>
              </div>
            ) : null}

            {/* Horizontal Date Scrubber (Hari Ini + 7 Hari ke Depan) */}
            <div className="mb-4 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 no-scrollbar">
              {upcomingDates.map((d) => {
                const isSelected = d.dateStr === selectedDate;
                const count = activeCountByDate.get(d.dateStr) ?? 0;
                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    onClick={() => {
                      setSelectedDate(d.dateStr);
                      closeBookingDetail();
                    }}
                    className={`flex min-h-[48px] shrink-0 snap-start items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left transition-colors ${
                      isSelected
                        ? "border-terracotta bg-terracotta text-surface"
                        : "border-hairline bg-surface text-ink hover:border-terracotta/60 hover:bg-surface-elevated"
                    }`}
                  >
                    <div className="flex flex-col leading-tight">
                      <span
                        className={`font-sans text-[11px] font-medium ${
                          isSelected ? "text-surface/85" : "text-terracotta"
                        }`}
                      >
                        {d.isToday ? "Hari ini" : d.dayNameShort}
                      </span>
                      <span className="font-sans text-xs font-semibold tabular-nums">
                        {d.labelShort.split(", ")[1] ?? d.dateStr}
                      </span>
                    </div>
                    {count > 0 ? (
                      <span
                        className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-bold tabular-nums ${
                          isSelected
                            ? "bg-surface text-terracotta"
                            : "bg-surface-elevated text-ink"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Ringkasan Statistik Hari Terpilih */}
            <div className="mb-4 grid grid-cols-3 divide-x divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
              <div className="px-3 py-2.5 sm:px-4">
                <p className="font-sans text-xs text-muted">Menunggu</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-terracotta tabular-nums sm:text-base">
                  {dayCounts.booked}
                </p>
              </div>
              <div className="px-3 py-2.5 sm:px-4">
                <p className="font-sans text-xs text-muted">Selesai</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-emerald-live tabular-nums sm:text-base">
                  {dayCounts.completed}
                </p>
              </div>
              <div className="px-3 py-2.5 sm:px-4">
                <p className="font-sans text-xs text-muted">Batal</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-muted tabular-nums sm:text-base">
                  {dayCounts.cancelled}
                </p>
              </div>
            </div>

            {/* Header & Legenda Visual Time-Block Timeline */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
              <p className="font-sans text-xs font-semibold text-ink sm:text-sm">
                Timeline kursi{" "}
                {timelineRange ? (
                  <span className="font-mono font-medium text-muted tabular-nums">
                    · {minutesToTime(timelineRange.startMinutes)}–
                    {minutesToTime(timelineRange.endMinutes)} WIB
                  </span>
                ) : (
                  <span className="font-medium text-muted">· Libur</span>
                )}
              </p>

              <div className="flex flex-wrap items-center gap-3 font-sans text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full bg-terracotta"
                  />
                  <span>Online</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full bg-ink"
                  />
                  <span>Walk-in</span>
                </span>
              </div>
            </div>

            {/* Peringatan bila tanggal terpilih libur tetapi masih ada jadwal aktif */}
            {(selectedDateMeta.closedDate ||
              !selectedDateMeta.schedule?.is_open) &&
            timelineBookings.length > 0 ? (
              <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-crimson-alert/45 bg-crimson-alert/10 p-3.5 text-xs text-ink">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-crimson-alert"
                />
                <p>
                  Tanggal ini berstatus{" "}
                  <strong className="font-semibold">
                    {selectedDateMeta.closedDate
                      ? `Libur khusus (${selectedDateMeta.closedDate.reason || "Tutup"})`
                      : "Hari libur rutin"}
                  </strong>
                  , namun masih memiliki jadwal aktif yang tampil di timeline.
                </p>
              </div>
            ) : null}

            {/* Visual Time-Block Timeline Utama */}
            {!timelineRange ? (
              <div className="rounded-2xl border border-hairline bg-surface px-5 py-10 text-center">
                <p className="font-sans text-xs font-semibold text-crimson-alert">
                  {selectedDateMeta.closedDate
                    ? "Libur khusus"
                    : "Hari libur rutin"}
                </p>
                <p className="mt-1.5 font-serif text-xl font-normal text-ink">
                  Toko Tidak Beroperasi
                </p>
                <p className="mt-1.5 text-sm text-muted">
                  {selectedDateMeta.closedDate?.reason ||
                    "Tanggal ini ditandai libur pada jadwal operasional."}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-hairline bg-surface p-2.5 sm:p-4">
                {timelineBookings.length === 0 ? (
                  <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-hairline bg-alabaster/70 px-3.5 py-2.5 text-xs text-muted">
                    <span>
                      {selectedDate === nowParts.dateStr
                        ? "Belum ada antrean aktif hari ini — gunakan tombol + Walk-in di bawah untuk mengunci kursi."
                        : "Belum ada reservasi aktif pada tanggal ini."}
                    </span>
                  </div>
                ) : null}

                <div className="relative flex gap-2 sm:gap-3">
                  {/* Kolom Penanda Jam (Left Time Axis) */}
                  <div
                    aria-hidden="true"
                    style={{ height: `${timelineRange.totalHeightPx}px` }}
                    className="relative w-12 shrink-0 select-none sm:w-16"
                  >
                    {timelineRange.hours.map((hourStart, idx) => (
                      <span
                        key={hourStart}
                        style={{
                          top:
                            idx === 0
                              ? "4px"
                              : `${idx * HOUR_ROW_HEIGHT_PX}px`,
                        }}
                        className={`absolute right-1 font-mono text-[11px] font-medium text-muted tabular-nums sm:right-2 sm:text-xs ${
                          idx === 0 ? "translate-y-0" : "-translate-y-1/2"
                        }`}
                      >
                        {minutesToTime(hourStart)}
                      </span>
                    ))}

                    <span className="absolute right-1 bottom-0 font-mono text-[11px] font-medium text-muted/75 tabular-nums sm:right-2 sm:text-xs">
                      {minutesToTime(timelineRange.endMinutes)}
                    </span>

                    {/* Tag Waktu Aktif Live */}
                    {showCurrentTimeLine ? (
                      <div
                        style={{ top: `${currentTimeTopPx}px` }}
                        className="pointer-events-none absolute right-0.5 z-30 -translate-y-1/2 rounded-md bg-terracotta px-1.5 py-0.5 font-mono text-[10px] font-bold text-surface tabular-nums shadow-xs sm:right-1"
                      >
                        {nowParts.timeStr}
                      </div>
                    ) : null}
                  </div>

                  {/* Kolom Track Timeline (Slot Kosong + Blok Booking + Live Line) */}
                  <div
                    style={{ height: `${timelineRange.totalHeightPx}px` }}
                    className="relative min-w-0 flex-1"
                  >
                    {/* Layer 1: Track Grid 60 Menit & Slot Kosong */}
                    {timelineRange.hours.map((hourStart) => {
                      const isHourOccupied = timelineBookings.some((b) => {
                        const bStart = parseTimeToMinutes(b.start_time);
                        const bEnd = parseTimeToMinutes(b.end_time);
                        return bStart < hourStart + 60 && bEnd > hourStart;
                      });

                      const isPastHour =
                        selectedDate < nowParts.dateStr ||
                        (selectedDate === nowParts.dateStr &&
                          hourStart + 60 <= nowParts.minutesFromMidnight);

                      return (
                        <div
                          key={hourStart}
                          style={{ height: `${HOUR_ROW_HEIGHT_PX}px` }}
                          className="border-t border-hairline py-1"
                        >
                          {!isHourOccupied ? (
                            <div className="flex h-full items-center justify-between gap-2 rounded-xl border border-dashed border-hairline bg-alabaster/50 px-3 py-2">
                              <span className="font-mono text-xs font-medium text-muted tabular-nums">
                                {minutesToTime(hourStart)} –{" "}
                                {minutesToTime(hourStart + 60)}
                              </span>
                              <span className="font-sans text-xs text-muted/85">
                                {settings.is_force_closed
                                  ? "Tutup"
                                  : selectedDateMeta.closedDate ||
                                      !selectedDateMeta.schedule?.is_open
                                    ? "Libur"
                                    : isPastHour
                                      ? "Berlalu"
                                      : "Kursi kosong"}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    {/* Garis Penutup Bawah Grid */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-hairline"
                    />

                    {/* Layer 2: Blok Booking Aktif Proporsional (60m ~80px, 120m ~168px) */}
                    {timelineBookings.map((booking) => {
                      const startMin = parseTimeToMinutes(booking.start_time);
                      const endMin = parseTimeToMinutes(booking.end_time);
                      const durationMin = Math.max(60, endMin - startMin);
                      const blockCount = Math.max(
                        1,
                        Math.round(durationMin / 60)
                      );
                      const topPx =
                        ((startMin - timelineRange.startMinutes) / 60) *
                        HOUR_ROW_HEIGHT_PX;
                      const heightPx = (durationMin / 60) * HOUR_ROW_HEIGHT_PX;
                      const isMultiBlock = durationMin >= 120;

                      const isWalkin = booking.source === "WALKIN";
                      const isSelected = selectedBookingId === booking.id;

                      return (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={() => openBookingDetail(booking.id)}
                          aria-label={`Detail jadwal ${booking.customer_name}, ${booking.service_name}, ${formatTimeHHMM(
                            booking.start_time
                          )} sampai ${formatTimeHHMM(booking.end_time)}`}
                          style={{
                            top: `${topPx + 4}px`,
                            height: `${Math.max(76, heightPx - 8)}px`,
                          }}
                          className={`group absolute inset-x-0 z-10 overflow-hidden rounded-xl border text-left transition-all ${
                            isSelected
                              ? "border-terracotta bg-surface ring-2 ring-terracotta/25"
                              : "border-hairline bg-surface shadow-xs hover:border-terracotta/70"
                          }`}
                        >
                          {/* Bar aksen vertikal kiri */}
                          <span
                            aria-hidden="true"
                            className={`absolute top-0 bottom-0 left-0 w-1 ${
                              isWalkin ? "bg-ink" : "bg-terracotta"
                            }`}
                          />

                          <div className="flex h-full flex-col justify-between px-3 py-2 pl-3.5 sm:px-3.5 sm:py-2.5 sm:pl-4">
                            {/* Baris Atas: Jam + Tag Online/Walk-in + Detail */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-semibold tracking-tight text-ink tabular-nums">
                                {formatTimeHHMM(booking.start_time)}–
                                {formatTimeHHMM(booking.end_time)}
                              </span>

                              <div className="flex shrink-0 items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-sans text-[11px] font-semibold ${
                                    isWalkin
                                      ? "border-ink bg-ink text-surface"
                                      : "border-terracotta/40 bg-terracotta/12 text-terracotta"
                                  }`}
                                >
                                  {isWalkin ? "Walk-in" : "Online"}
                                </span>

                                <span className="inline-flex items-center gap-0.5 font-sans text-[11px] font-medium text-muted group-hover:text-terracotta">
                                  <span>Detail</span>
                                  <ChevronRight
                                    aria-hidden="true"
                                    className="h-3 w-3"
                                  />
                                </span>
                              </div>
                            </div>

                            {/* Tengah: Nama Pelanggan & Layanan */}
                            <div className="min-w-0">
                              <p className="truncate font-sans text-sm font-semibold leading-tight text-ink sm:text-[15px]">
                                {booking.customer_name}
                              </p>
                              <p className="mt-0.5 truncate font-sans text-xs leading-tight text-muted">
                                {booking.service_name}
                              </p>
                            </div>

                            {/* Indikator Blok 2 Jam (Hair Chemicals 120 Menit) */}
                            {isMultiBlock ? (
                              <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-hairline/80 bg-alabaster/70 px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1.5 font-sans text-[11px] font-medium text-ink">
                                  <Sparkles
                                    aria-hidden="true"
                                    className="h-3 w-3 shrink-0 text-terracotta"
                                  />
                                  <span>
                                    {blockCount} blok · {durationMin} menit
                                  </span>
                                </span>
                                <span className="font-sans text-[11px] text-muted">
                                  {blockCount}x durasi
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}

                    {/* Layer 3: Live Current-Time Line (Burnt Terracotta #C25934) */}
                    {showCurrentTimeLine ? (
                      <div
                        aria-label={`Waktu saat ini ${nowParts.timeStr} WIB`}
                        style={{ top: `${currentTimeTopPx}px` }}
                        className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
                      >
                        <span className="-ml-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-terracotta" />
                        <span className="h-[2px] w-full bg-terracotta" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Daftar Ringkas Riwayat Selesai (Terpisah agar slot timeline bisa terisi ulang bersih) */}
            {completedBookings.length > 0 ? (
              <div className="mt-6 rounded-2xl border border-hairline bg-surface p-4">
                <div className="mb-3 flex items-center justify-between border-b border-hairline pb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full bg-emerald-live"
                    />
                    <h3 className="font-sans text-sm font-semibold text-ink">
                      Riwayat selesai
                    </h3>
                  </div>
                  <span className="font-sans text-xs font-medium text-muted">
                    {completedBookings.length} jadwal · slot dibuka
                  </span>
                </div>

                <div className="divide-y divide-hairline">
                  {completedBookings.map((booking) => (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => openBookingDetail(booking.id)}
                      className="flex min-h-[48px] w-full items-center justify-between gap-2.5 py-2.5 text-left transition-colors first:pt-0 last:pb-0 hover:text-terracotta"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-ink tabular-nums">
                            {formatTimeHHMM(booking.start_time)}–
                            {formatTimeHHMM(booking.end_time)}
                          </span>
                          <span className="truncate font-sans text-sm font-semibold text-ink">
                            {booking.customer_name}
                          </span>
                          <span className="rounded-md border border-emerald-live/35 bg-emerald-live/10 px-1.5 py-0.5 font-sans text-[11px] font-medium text-emerald-live">
                            Selesai
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {booking.service_name} ·{" "}
                          {booking.source === "WALKIN" ? "Walk-in" : "Online"}
                        </p>
                      </div>

                      <span className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-hairline bg-alabaster/70 px-2.5 py-1.5 font-mono text-xs font-medium text-muted tabular-nums">
                        <span>{booking.ticket_code}</span>
                        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Daftar Ringkas Riwayat Dibatalkan (Terpisah dari Timeline Aktif) */}
            {cancelledBookings.length > 0 ? (
              <div className="mt-6 rounded-2xl border border-hairline bg-surface p-4">
                <div className="mb-3 flex items-center justify-between border-b border-hairline pb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full bg-crimson-alert"
                    />
                    <h3 className="font-sans text-sm font-semibold text-ink">
                      Riwayat dibatalkan
                    </h3>
                  </div>
                  <span className="font-sans text-xs font-medium text-muted">
                    {cancelledBookings.length} jadwal
                  </span>
                </div>

                <div className="divide-y divide-hairline">
                  {cancelledBookings.map((booking) => (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => openBookingDetail(booking.id)}
                      className="flex min-h-[48px] w-full items-center justify-between gap-2.5 py-2.5 text-left transition-colors first:pt-0 last:pb-0 hover:text-terracotta"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-ink tabular-nums">
                            {formatTimeHHMM(booking.start_time)}–
                            {formatTimeHHMM(booking.end_time)}
                          </span>
                          <span className="truncate font-sans text-sm font-semibold text-ink">
                            {booking.customer_name}
                          </span>
                          <span className="rounded-md border border-hairline bg-surface-elevated px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted">
                            {booking.source === "WALKIN" ? "Walk-in" : "Online"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {booking.service_name} · Slot telah dibebaskan
                        </p>
                      </div>

                      <span className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-hairline bg-alabaster/70 px-2.5 py-1.5 font-mono text-xs font-medium text-muted tabular-nums">
                        <span>{booking.ticket_code}</span>
                        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          /* ================================================================ */
          /* TAB 2: OPERASIONAL & CMS RINGAN                                  */
          /* ================================================================ */
          <div className="space-y-10 pb-10">
            {/* JAM BUKA MINGGUAN */}
            <section aria-label="Editor Jam Buka Mingguan">
              <EditorialSectionHeader
                label="Operasional"
                title="Jam Buka"
                accentTitle="Mingguan"
                description="Atur jam buka dan tutup rutin harian. Perubahan langsung memengaruhi slot publik."
                className="mb-4"
              />

              <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
                <div className="divide-y divide-hairline">
                  {scheduleDrafts.map((row) => (
                    <div
                      key={row.day_of_week}
                      className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center justify-between gap-3 sm:w-44">
                        <span className="font-sans text-sm font-semibold text-ink">
                          {DAY_LABELS[row.day_of_week]}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setScheduleDrafts((prev) =>
                              prev.map((item) =>
                                item.day_of_week === row.day_of_week
                                  ? { ...item, is_open: !item.is_open }
                                  : item
                              )
                            )
                          }
                          className={`inline-flex min-h-[44px] min-w-[84px] items-center justify-center rounded-xl border px-3 font-sans text-xs font-semibold transition-colors ${
                            row.is_open
                              ? "border-emerald-live/50 bg-emerald-live/10 text-emerald-live"
                              : "border-hairline bg-surface-elevated text-muted"
                          }`}
                        >
                          {row.is_open ? "Buka" : "Libur"}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-center">
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`open-${row.day_of_week}`}
                            className="font-sans text-xs text-muted"
                          >
                            Buka
                          </label>
                          <input
                            id={`open-${row.day_of_week}`}
                            type="time"
                            disabled={!row.is_open}
                            value={formatTimeHHMM(row.open_time)}
                            onChange={(e) =>
                              setScheduleDrafts((prev) =>
                                prev.map((item) =>
                                  item.day_of_week === row.day_of_week
                                    ? { ...item, open_time: e.target.value }
                                    : item
                                )
                              )
                            }
                            className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 font-mono text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none disabled:opacity-40"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`close-${row.day_of_week}`}
                            className="font-sans text-xs text-muted"
                          >
                            Tutup
                          </label>
                          <input
                            id={`close-${row.day_of_week}`}
                            type="time"
                            disabled={!row.is_open}
                            value={formatTimeHHMM(row.close_time)}
                            onChange={(e) =>
                              setScheduleDrafts((prev) =>
                                prev.map((item) =>
                                  item.day_of_week === row.day_of_week
                                    ? { ...item, close_time: e.target.value }
                                    : item
                                )
                              )
                            }
                            className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 font-mono text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none disabled:opacity-40"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-hairline p-4">
                  <button
                    type="button"
                    disabled={savingSchedules}
                    onClick={() => void handleSaveSchedules()}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-5 font-sans text-sm font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
                  >
                    <Check aria-hidden="true" className="h-4 w-4" />
                    <span>
                      {savingSchedules
                        ? "Menyimpan..."
                        : "Simpan Jam Operasional"}
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {/* TANGGAL LIBUR KHUSUS */}
            <section aria-label="Pengelola Tanggal Libur">
              <EditorialSectionHeader
                label="Kalender"
                title="Tanggal Libur"
                accentTitle="Khusus"
                description="Blokir tanggal tertentu (hari raya, acara pribadi, atau renovasi)."
                className="mb-4"
              />

              <div className="rounded-2xl border border-hairline bg-surface p-4">
                <form
                  onSubmit={handleAddClosedDate}
                  className="grid gap-3 sm:grid-cols-[180px_1fr_auto]"
                >
                  <input
                    type="date"
                    required
                    aria-label="Pilih tanggal libur"
                    value={newClosedDate}
                    onChange={(e) => setNewClosedDate(e.target.value)}
                    className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 font-mono text-base text-ink focus:border-terracotta focus:bg-surface focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Keterangan (mis. Libur Idul Fitri)"
                    aria-label="Alasan libur"
                    value={newClosedReason}
                    onChange={(e) => setNewClosedReason(e.target.value)}
                    className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:bg-surface focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={savingClosedDate}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:text-sm"
                  >
                    <CalendarOff aria-hidden="true" className="h-4 w-4" />
                    <span>
                      {savingClosedDate ? "Menyimpan..." : "Tambah Libur"}
                    </span>
                  </button>
                </form>

                <div className="mt-4 divide-y divide-hairline border-t border-hairline">
                  {closedDates.length === 0 ? (
                    <p className="py-4 text-sm text-muted">
                      Tidak ada tanggal libur khusus yang terdaftar.
                    </p>
                  ) : (
                    closedDates.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div>
                          <p className="font-mono text-sm font-semibold text-ink tabular-nums">
                            {item.closed_date}
                          </p>
                          <p className="text-xs text-muted">
                            {item.reason || "Libur khusus"}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={deletingClosedId === item.id}
                          onClick={() => void handleDeleteClosedDate(item.id)}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-hairline bg-alabaster/70 px-3 font-sans text-xs font-medium text-crimson-alert transition-colors hover:border-crimson-alert hover:bg-crimson-alert/10 disabled:opacity-50"
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* EDITOR HARGA LAYANAN */}
            <section aria-label="Editor Harga Layanan">
              <EditorialSectionHeader
                label="Tarif"
                title="Harga"
                accentTitle="Layanan"
                description="Perbarui label tarif utama dan rincian varian layanan yang tampil di halaman publik."
                className="mb-4"
              />

              <div className="space-y-4">
                {serviceDrafts.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-2xl border border-hairline bg-surface p-4"
                  >
                    <div className="mb-4 flex items-center justify-between border-b border-hairline pb-3">
                      <div>
                        <h3 className="font-serif text-xl font-normal text-ink">
                          {service.name}
                        </h3>
                        <p className="font-sans text-xs text-muted">
                          Blok sistem:{" "}
                          <span className="font-mono tabular-nums">
                            {service.slot_duration_minutes}
                          </span>{" "}
                          menit
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label
                          htmlFor={`price-display-${service.id}`}
                          className="mb-1 block font-sans text-xs font-medium text-muted"
                        >
                          Teks harga tampil
                        </label>
                        <input
                          id={`price-display-${service.id}`}
                          type="text"
                          value={service.price_display}
                          onChange={(e) =>
                            updateServiceDraft(service.id, (prev) => ({
                              ...prev,
                              price_display: e.target.value,
                            }))
                          }
                          className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink focus:border-terracotta focus:bg-surface focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`price-min-${service.id}`}
                          className="mb-1 block font-sans text-xs font-medium text-muted"
                        >
                          Minimal (Rp)
                        </label>
                        <input
                          id={`price-min-${service.id}`}
                          type="number"
                          min={0}
                          step={1000}
                          value={service.price_min}
                          onChange={(e) =>
                            updateServiceDraft(service.id, (prev) => ({
                              ...prev,
                              price_min: Number.parseInt(
                                e.target.value || "0",
                                10
                              ),
                            }))
                          }
                          className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 font-mono text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`price-max-${service.id}`}
                          className="mb-1 block font-sans text-xs font-medium text-muted"
                        >
                          Maksimal (Rp)
                        </label>
                        <input
                          id={`price-max-${service.id}`}
                          type="number"
                          min={0}
                          step={1000}
                          value={service.price_max}
                          onChange={(e) =>
                            updateServiceDraft(service.id, (prev) => ({
                              ...prev,
                              price_max: Number.parseInt(
                                e.target.value || "0",
                                10
                              ),
                            }))
                          }
                          className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 font-mono text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Rincian Varian Harga */}
                    <div className="mt-4 border-t border-hairline pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-sans text-xs font-medium text-muted">
                          Rincian varian tarif
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateServiceDraft(service.id, (prev) => ({
                              ...prev,
                              price_variants: [
                                ...prev.price_variants,
                                { label: "", price: 0, display: "0k" },
                              ],
                            }))
                          }
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-hairline bg-alabaster/70 px-3 font-sans text-xs font-semibold text-terracotta transition-colors hover:border-terracotta"
                        >
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                          <span>Varian</span>
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {service.price_variants.map((variant, idx) => (
                          <div
                            key={`${service.id}-var-${idx}`}
                            className="grid grid-cols-[1fr_84px_44px] gap-2 rounded-xl border border-hairline/70 bg-alabaster/40 p-2 sm:grid-cols-[1fr_110px_88px_44px] sm:border-0 sm:bg-transparent sm:p-0"
                          >
                            <input
                              type="text"
                              placeholder="Nama varian"
                              value={variant.label}
                              onChange={(e) =>
                                updateServiceDraft(service.id, (prev) => {
                                  const nextVariants: PriceVariant[] =
                                    prev.price_variants.map((v, vIdx) =>
                                      vIdx === idx
                                        ? { ...v, label: e.target.value }
                                        : v
                                    );
                                  return {
                                    ...prev,
                                    price_variants: nextVariants,
                                  };
                                })
                              }
                              className="col-span-3 min-h-[44px] rounded-xl border border-hairline bg-surface px-2.5 font-sans text-base text-ink focus:border-terracotta focus:outline-none sm:col-span-1 sm:bg-alabaster/60 sm:focus:bg-surface"
                            />
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              placeholder="Harga"
                              value={variant.price}
                              onChange={(e) =>
                                updateServiceDraft(service.id, (prev) => {
                                  const nextVariants: PriceVariant[] =
                                    prev.price_variants.map((v, vIdx) =>
                                      vIdx === idx
                                        ? {
                                            ...v,
                                            price: Number.parseInt(
                                              e.target.value || "0",
                                              10
                                            ),
                                          }
                                        : v
                                    );
                                  return {
                                    ...prev,
                                    price_variants: nextVariants,
                                  };
                                })
                              }
                              className="min-h-[44px] rounded-xl border border-hairline bg-surface px-2 font-mono text-base text-ink tabular-nums focus:border-terracotta focus:outline-none sm:bg-alabaster/60 sm:focus:bg-surface"
                            />
                            <input
                              type="text"
                              placeholder="35k"
                              value={variant.display}
                              onChange={(e) =>
                                updateServiceDraft(service.id, (prev) => {
                                  const nextVariants: PriceVariant[] =
                                    prev.price_variants.map((v, vIdx) =>
                                      vIdx === idx
                                        ? { ...v, display: e.target.value }
                                        : v
                                    );
                                  return {
                                    ...prev,
                                    price_variants: nextVariants,
                                  };
                                })
                              }
                              className="min-h-[44px] rounded-xl border border-hairline bg-surface px-2 font-mono text-base text-ink focus:border-terracotta focus:outline-none sm:bg-alabaster/60 sm:focus:bg-surface"
                            />
                            <button
                              type="button"
                              aria-label="Hapus varian"
                              onClick={() =>
                                updateServiceDraft(service.id, (prev) => ({
                                  ...prev,
                                  price_variants: prev.price_variants.filter(
                                    (_, vIdx) => vIdx !== idx
                                  ),
                                }))
                              }
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-hairline bg-surface text-muted transition-colors hover:border-crimson-alert hover:text-crimson-alert"
                            >
                              <Trash2
                                aria-hidden="true"
                                className="h-4 w-4"
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        disabled={savingServiceId === service.id}
                        onClick={() => void handleSaveService(service)}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:text-sm"
                      >
                        <Check aria-hidden="true" className="h-4 w-4" />
                        <span>
                          {savingServiceId === service.id
                            ? "Menyimpan..."
                            : `Simpan Tarif ${service.name}`}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* PENGELOLA GALERI (EMBED WHITELIST + UPLOAD WEBP CLIENT-SIDE) */}
            <section aria-label="Pengelola Galeri">
              <EditorialSectionHeader
                label="Media"
                title="Galeri"
                accentTitle="Karya"
                description="Tempel link video TikTok / Instagram Reels atau unggah foto (dikompresi otomatis ke WebP <= 3 MB)."
                className="mb-4"
              />

              <div className="grid gap-4 md:grid-cols-2">
                {/* Form A: Embed Video TikTok / Instagram Reels */}
                <form
                  onSubmit={handleAddSocialEmbed}
                  className="rounded-2xl border border-hairline bg-surface p-4"
                >
                  <div className="mb-3 flex items-center gap-2 border-b border-hairline pb-2.5">
                    <Link2
                      aria-hidden="true"
                      className="h-4 w-4 text-terracotta"
                    />
                    <h3 className="font-sans text-sm font-semibold text-ink">
                      Tambah embed TikTok / IG Reels
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Judul video (mis. Fade & Taper Clean)"
                      value={socialTitle}
                      onChange={(e) => setSocialTitle(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:bg-surface focus:outline-none"
                    />

                    <div>
                      <input
                        type="url"
                        required
                        placeholder="https://www.tiktok.com/@... atau https://www.instagram.com/reel/..."
                        value={socialUrl}
                        onChange={(e) => setSocialUrl(e.target.value)}
                        className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:bg-surface focus:outline-none"
                      />
                      {socialValidation ? (
                        <p
                          className={`mt-1.5 font-sans text-xs ${
                            socialValidation.valid
                              ? "text-emerald-live"
                              : "text-crimson-alert"
                          }`}
                        >
                          {socialValidation.valid
                            ? `Domain terverifikasi: ${
                                socialValidation.platform === "tiktok"
                                  ? "TikTok"
                                  : "Instagram"
                              }`
                            : socialValidation.error}
                        </p>
                      ) : (
                        <p className="mt-1.5 font-sans text-xs text-muted">
                          Domain resmi: www.tiktok.com, vm/vt.tiktok.com,
                          www.instagram.com
                        </p>
                      )}
                    </div>

                    <input
                      type="text"
                      placeholder="Keterangan singkat (opsional)"
                      value={socialCaption}
                      onChange={(e) => setSocialCaption(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:bg-surface focus:outline-none"
                    />

                    <button
                      type="submit"
                      disabled={
                        savingSocial ||
                        (socialValidation ? !socialValidation.valid : false)
                      }
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:text-sm"
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      <span>
                        {savingSocial ? "Menyimpan..." : "Simpan Link Video"}
                      </span>
                    </button>
                  </div>
                </form>

                {/* Form B: Upload Foto WebP Client-Side */}
                <form
                  onSubmit={handleUploadCompressedPhoto}
                  className="rounded-2xl border border-hairline bg-surface p-4"
                >
                  <div className="mb-3 flex items-center gap-2 border-b border-hairline pb-2.5">
                    <ImagePlus
                      aria-hidden="true"
                      className="h-4 w-4 text-terracotta"
                    />
                    <h3 className="font-sans text-sm font-semibold text-ink">
                      Upload foto (kompresi WebP)
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void handlePhotoFileChange(e)}
                      className="hidden"
                    />

                    <button
                      type="button"
                      disabled={compressingPhoto}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-alabaster/60 px-3 font-sans text-xs font-medium text-ink transition-colors hover:border-terracotta sm:text-sm"
                    >
                      <Upload
                        aria-hidden="true"
                        className="h-4 w-4 text-terracotta"
                      />
                      <span>
                        {compressingPhoto
                          ? "Mengompresi ke WebP..."
                          : compressedPhoto
                            ? "Ganti Foto Terpilih"
                            : "Pilih Foto (JPG / PNG / WebP)"}
                      </span>
                    </button>

                    {compressedPhoto ? (
                      <div className="flex items-center gap-3 rounded-xl border border-hairline bg-alabaster/70 p-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={compressedPhoto.previewUrl}
                          alt="Preview foto terkompresi WebP"
                          className="h-16 w-14 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1 font-sans text-xs text-muted">
                          <p className="truncate font-semibold text-ink">
                            {compressedPhoto.originalName}
                          </p>
                          <p>
                            {compressedPhoto.width}×{compressedPhoto.height}px ·{" "}
                            <span className="font-semibold text-emerald-live">
                              {formatBytes(compressedPhoto.blob.size)} WebP
                            </span>
                          </p>
                          <p>
                            Asli: {formatBytes(compressedPhoto.originalSize)}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <input
                      type="text"
                      placeholder="Judul foto (mis. Skin Fade Mid)"
                      value={photoTitle}
                      onChange={(e) => setPhotoTitle(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:bg-surface focus:outline-none"
                    />

                    <input
                      type="text"
                      placeholder="Keterangan singkat (opsional)"
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:bg-surface focus:outline-none"
                    />

                    <button
                      type="submit"
                      disabled={!compressedPhoto || uploadingPhoto}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:text-sm"
                    >
                      <Upload aria-hidden="true" className="h-4 w-4" />
                      <span>
                        {uploadingPhoto ? "Mengunggah..." : "Unggah Foto WebP"}
                      </span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Daftar Item Galeri */}
              <div className="mt-4 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface">
                {galleryItems.length === 0 ? (
                  <p className="p-4 text-sm text-muted">
                    Belum ada item di galeri database.
                  </p>
                ) : (
                  galleryItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {item.media_type === "photo" ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={item.media_url}
                            alt={item.title}
                            loading="lazy"
                            className="h-16 w-14 shrink-0 rounded-xl border border-hairline object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-14 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-elevated font-sans text-xs font-semibold text-terracotta">
                            {item.media_type === "tiktok" ? "TikTok" : "IG"}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="truncate font-sans text-sm font-semibold text-ink">
                            {item.title}
                          </p>
                          <p className="truncate font-sans text-xs text-muted">
                            {item.media_url}
                          </p>
                          {item.caption ? (
                            <p className="mt-0.5 truncate text-xs text-muted">
                              {item.caption}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={busyGalleryId === item.id}
                          onClick={() => void handleToggleGalleryActive(item)}
                          className={`inline-flex min-h-[44px] items-center rounded-xl border px-3 font-sans text-xs font-medium transition-colors ${
                            item.is_active
                              ? "border-emerald-live/50 bg-emerald-live/10 text-emerald-live"
                              : "border-hairline bg-surface-elevated text-muted"
                          }`}
                        >
                          {item.is_active ? "Tampil" : "Sembunyi"}
                        </button>

                        <button
                          type="button"
                          disabled={busyGalleryId === item.id}
                          onClick={() => void handleDeleteGalleryItem(item)}
                          aria-label={`Hapus ${item.title}`}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-hairline bg-alabaster/70 text-crimson-alert transition-colors hover:border-crimson-alert hover:bg-crimson-alert/10"
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ================================================================ */}
      {/* THUMB-ZONE BAR AKSI INSTAN (+ WALK-IN 1-TAP / 2-TAP MAX)          */}
      {/* ================================================================ */}
      {isQueueTab ? (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-hairline bg-surface/95 px-4 pt-3 pb-safe font-sans backdrop-blur-md">
          <div className="mx-auto w-full max-w-4xl space-y-2.5">
            {/* Sub-Drawer: Konfirmasi Tap ke-2 Walk-in */}
            {pendingWalkin ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-terracotta bg-alabaster/90 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full bg-terracotta"
                  />
                  <p className="font-sans text-sm font-medium text-ink">
                    Kunci{" "}
                    <span className="font-semibold text-terracotta">
                      Walk-in {pendingWalkin.service.name}
                    </span>{" "}
                    jam{" "}
                    <span className="font-mono font-bold tabular-nums">
                      {pendingWalkin.slot.time} – {pendingWalkin.slot.endTime}
                    </span>
                    ?
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button
                    type="button"
                    disabled={submittingWalkin}
                    onClick={() => void handleConfirmWalkin()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:text-sm"
                  >
                    <Check aria-hidden="true" className="h-4 w-4" />
                    <span>
                      {submittingWalkin ? "Mengunci..." : "Konfirmasi"}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={submittingWalkin}
                    onClick={() => setPendingWalkin(null)}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-hairline bg-surface px-4 font-sans text-xs font-medium text-muted hover:text-ink sm:text-sm"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : null}

            {/* Dua Tombol Walk-in Utama di Thumb Zone */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={!haircutService || !haircutWalkinSlot || submittingWalkin}
                onClick={() => {
                  if (haircutService && haircutWalkinSlot) {
                    closeBookingDetail();
                    setPendingWalkin({
                      service: haircutService,
                      slot: haircutWalkinSlot,
                    });
                  }
                }}
                className="flex min-h-[52px] items-center justify-between gap-2 rounded-xl border border-terracotta bg-terracotta px-3.5 py-2 text-left text-surface transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-elevated disabled:text-muted"
              >
                <div className="min-w-0">
                  <p className="truncate font-sans text-xs font-semibold sm:text-sm">
                    + Walk-in Haircut
                  </p>
                  <p className="font-mono text-[11px] font-medium opacity-90 tabular-nums">
                    {haircutWalkinSlot
                      ? `${haircutWalkinSlot.time} – ${haircutWalkinSlot.endTime}`
                      : "Slot penuh / tutup"}
                  </p>
                </div>
                <Scissors
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 opacity-90"
                />
              </button>

              <button
                type="button"
                disabled={
                  !chemicalsService || !chemicalsWalkinSlot || submittingWalkin
                }
                onClick={() => {
                  if (chemicalsService && chemicalsWalkinSlot) {
                    closeBookingDetail();
                    setPendingWalkin({
                      service: chemicalsService,
                      slot: chemicalsWalkinSlot,
                    });
                  }
                }}
                className="flex min-h-[52px] items-center justify-between gap-2 rounded-xl border border-ink bg-ink px-3.5 py-2 text-left text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-elevated disabled:text-muted"
              >
                <div className="min-w-0">
                  <p className="truncate font-sans text-xs font-semibold sm:text-sm">
                    + Walk-in Chemicals
                  </p>
                  <p className="font-mono text-[11px] opacity-90 tabular-nums">
                    {chemicalsWalkinSlot
                      ? `${chemicalsWalkinSlot.time} – ${chemicalsWalkinSlot.endTime}`
                      : "Slot < 2 jam / tutup"}
                  </p>
                </div>
                <Sparkles
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-terracotta"
                />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ================================================================ */}
      {/* BOTTOM SHEET / MODAL DETAIL BLOK JADWAL                          */}
      {/* ================================================================ */}
      {selectedBooking
        ? (() => {
            const startMin = parseTimeToMinutes(selectedBooking.start_time);
            const endMin = parseTimeToMinutes(selectedBooking.end_time);
            const durationMin = Math.max(60, endMin - startMin);
            const blockCount = Math.max(1, Math.round(durationMin / 60));
            const isBooked = selectedBooking.status === "BOOKED";
            const isCompleted = selectedBooking.status === "COMPLETED";
            const isWalkin = selectedBooking.source === "WALKIN";
            const isBusy = busyBookingId === selectedBooking.id;

            return (
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-detail-sheet-title"
                onClick={() => {
                  if (!isBusy) closeBookingDetail();
                }}
                className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 backdrop-blur-xs sm:items-center sm:p-4"
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-hairline bg-surface px-4 pt-3 pb-safe font-sans shadow-2xl sm:rounded-2xl sm:p-6"
                >
                  {/* Grab bar mobile */}
                  <div
                    aria-hidden="true"
                    className="mx-auto mb-3 h-1 w-10 rounded-full bg-hairline sm:hidden"
                  />

                  {/* Header Sheet: Jam, Layanan, Badge Online/Walk-in, Status & Tombol Tutup */}
                  <div className="flex items-start justify-between gap-3 border-b border-hairline pb-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 font-sans text-xs font-semibold ${
                            isWalkin
                              ? "border-ink bg-ink text-surface"
                              : "border-terracotta/40 bg-terracotta/12 text-terracotta"
                          }`}
                        >
                          {isWalkin ? "Walk-in" : "Online"}
                        </span>

                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 font-sans text-xs font-semibold ${
                            isBooked
                              ? "border-terracotta/40 bg-terracotta/12 text-terracotta"
                              : isCompleted
                                ? "border-emerald-live/40 bg-emerald-live/12 text-emerald-live"
                                : "border-crimson-alert/40 bg-crimson-alert/12 text-crimson-alert"
                          }`}
                        >
                          {isBooked
                            ? "Terjadwal"
                            : isCompleted
                              ? "Selesai"
                              : "Dibatalkan"}
                        </span>
                      </div>

                      <p className="mt-2 font-sans text-xs font-semibold text-terracotta">
                        <span className="font-mono tabular-nums">
                          {formatTimeHHMM(selectedBooking.start_time)}–
                          {formatTimeHHMM(selectedBooking.end_time)} WIB
                        </span>{" "}
                        · {selectedBooking.service_name}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={closeBookingDetail}
                      aria-label="Tutup detail jadwal"
                      className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-hairline bg-alabaster/75 text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Detail Pelanggan, Kode Tiket, Durasi Kursi & Tanggal */}
                  <div className="py-4">
                    <h3
                      id="booking-detail-sheet-title"
                      className="font-serif text-xl font-normal leading-snug text-ink"
                    >
                      {selectedBooking.customer_name}
                    </h3>

                    <dl className="mt-3 grid grid-cols-2 gap-2.5 rounded-xl border border-hairline bg-alabaster/65 p-3">
                      <div>
                        <dt className="font-sans text-xs text-muted">
                          Kode tiket
                        </dt>
                        <dd className="mt-0.5 font-mono text-sm font-bold text-terracotta tabular-nums">
                          {selectedBooking.ticket_code}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-sans text-xs text-muted">
                          Durasi kursi
                        </dt>
                        <dd className="mt-0.5 font-sans text-sm font-semibold text-ink">
                          <span className="font-mono tabular-nums">
                            {durationMin}
                          </span>{" "}
                          menit
                          {blockCount > 1 ? ` (${blockCount} blok)` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-sans text-xs text-muted">
                          Tanggal
                        </dt>
                        <dd className="mt-0.5 font-sans text-sm font-medium text-ink">
                          {formatIndonesianDateShort(
                            selectedBooking.booking_date
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-sans text-xs text-muted">Sumber</dt>
                        <dd className="mt-0.5 font-sans text-sm font-medium text-ink">
                          {isWalkin ? "Walk-in Studio" : "Booking Online"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Aksi Booking (BOOKED: Selesai, Geser Jadwal, Batalkan) */}
                  <div className="space-y-2.5">
                    {isBooked ? (
                      detailSheetMode === "reschedule" ? (
                        <div className="rounded-xl border border-terracotta/50 bg-alabaster/75 p-3.5">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                              <p className="font-sans text-xs font-semibold text-terracotta">
                                Pilih jam pengganti
                              </p>
                              <p className="text-xs text-muted">
                                Tap slot kosong di bawah untuk menggeser langsung.
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDetailSheetMode("detail")}
                              className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl border border-hairline bg-surface px-3 font-sans text-xs font-semibold text-muted hover:text-ink disabled:opacity-50"
                            >
                              Kembali
                            </button>
                          </div>

                          {selectedBookingRescheduleSlots.length === 0 ? (
                            <p className="rounded-xl border border-hairline bg-surface px-3 py-3 text-sm text-muted">
                              Tidak ada slot kosong lain pada tanggal ini.
                            </p>
                          ) : (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {selectedBookingRescheduleSlots.map((slot) => (
                                <button
                                  key={slot.time}
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleBookingMutation(
                                      selectedBooking.id,
                                      {
                                        action: "reschedule",
                                        newStartTime: slot.time,
                                      }
                                    )
                                  }
                                  className="flex min-h-[48px] items-center justify-center rounded-xl border border-hairline bg-surface font-mono text-sm font-semibold text-ink tabular-nums transition-colors hover:border-terracotta hover:bg-terracotta hover:text-surface disabled:opacity-50"
                                >
                                  {slot.time}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : detailSheetMode === "cancel" ? (
                        <div className="rounded-xl border border-crimson-alert/50 bg-crimson-alert/10 p-3.5">
                          <p className="font-sans text-xs font-semibold text-crimson-alert">
                            Konfirmasi pembatalan
                          </p>
                          <p className="mt-1 text-sm text-ink">
                            Batalkan{" "}
                            <span className="font-mono font-bold">
                              {selectedBooking.ticket_code}
                            </span>{" "}
                            dan bebaskan slot jam{" "}
                            <span className="font-mono font-semibold tabular-nums">
                              {formatTimeHHMM(selectedBooking.start_time)}
                            </span>
                            ?
                          </p>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleBookingMutation(selectedBooking.id, {
                                  action: "cancel",
                                })
                              }
                              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-crimson-alert px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:text-sm"
                            >
                              {isBusy ? "Memproses..." : "Ya, Batalkan"}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDetailSheetMode("detail")}
                              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-hairline bg-surface px-4 font-sans text-xs font-semibold text-ink hover:border-ink disabled:opacity-50 sm:text-sm"
                            >
                              Kembali
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleBookingMutation(selectedBooking.id, {
                                action: "complete",
                              })
                            }
                            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-live px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-95 disabled:opacity-50 sm:text-sm"
                          >
                            <Check aria-hidden="true" className="h-4 w-4" />
                            <span>
                              {isBusy ? "Menyimpan..." : "Tandai Selesai"}
                            </span>
                          </button>

                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDetailSheetMode("reschedule")}
                              className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-hairline bg-alabaster/80 px-3 font-sans text-xs font-semibold text-ink transition-colors hover:border-terracotta hover:text-terracotta disabled:opacity-50 sm:text-sm"
                            >
                              <Clock aria-hidden="true" className="h-4 w-4" />
                              <span>Geser Jadwal</span>
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDetailSheetMode("cancel")}
                              className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-crimson-alert/45 bg-crimson-alert/10 px-3 font-sans text-xs font-semibold text-crimson-alert transition-colors hover:bg-crimson-alert hover:text-surface disabled:opacity-50 sm:text-sm"
                            >
                              <X aria-hidden="true" className="h-4 w-4" />
                              <span>Batalkan Booking</span>
                            </button>
                          </div>
                        </>
                      )
                    ) : null}

                    {/* Tautan Smart Ticket (Selalu tersedia untuk semua status) */}
                    <Link
                      href={`/tiket/${selectedBooking.ticket_code}`}
                      className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-elevated/70 px-4 font-sans text-xs font-semibold text-ink transition-colors hover:border-terracotta hover:text-terracotta sm:text-sm"
                    >
                      <span>Lihat Smart Ticket</span>
                      <ExternalLink
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                      />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })()
        : null}
    </div>
  );
}
