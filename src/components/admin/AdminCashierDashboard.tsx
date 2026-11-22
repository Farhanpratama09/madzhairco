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
  Bell,
  Calendar,
  CalendarOff,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Coffee,
  ExternalLink,
  ImagePlus,
  Link2,
  LogOut,
  MessageCircle,
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
import { PushNotificationCard } from "@/components/admin/PushNotificationCard";
import { StudioQrCodeCard } from "@/components/admin/StudioQrCodeCard";
import { BrandMark } from "@/components/ui/BrandMark";
import { validateSocialEmbedUrl } from "@/lib/security/sanitize";
import {
  calculateAvailableSlots,
  findWalkinTargetSlot,
  formatTimeHHMM,
  getAdminTodayOperationalState,
  getDayOfWeekFromDateStr,
  getStoreNowParts,
  getTodayAndUpcomingDates,
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
  initialBookingPhones?: Record<string, string>;
}

type DashboardTab = "queue" | "cms";
type CmsSubTab = "operational" | "catalog" | "notify_qr";

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
/** Tinggi track 60 menit (76px/jam: 1x Haircut ~68px, 2x Hair Chemicals ~144px ringkas & proporsional) */
const HOUR_ROW_HEIGHT_PX = 76;

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

function formatThousandsId(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return Math.trunc(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseRupiahDigits(raw: string): number {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (!digits) return 0;
  return Number.parseInt(digits, 10);
}

/**
 * Format angka ke label ringkas:
 * - Kelipatan 1.000 (>= 1.000) -> `${n / 1000}k` (misal 30000 -> "30k")
 * - Selainnya -> format ribuan bertitik (misal 35500 -> "35.500", untuk "Rp 35.500")
 */
function formatShortPrice(amount: number): string {
  const normalized = Math.max(0, Math.trunc(Number(amount) || 0));
  if (normalized >= 1000 && normalized % 1000 === 0) {
    return `${normalized / 1000}k`;
  }
  if (normalized === 0) return "0";
  return formatThousandsId(normalized);
}

function computeServicePricingSummary(variants: PriceVariant[]): {
  cleanedVariants: PriceVariant[];
  priceMin: number;
  priceMax: number;
  priceDisplay: string;
} {
  const cleanedVariants: PriceVariant[] = variants
    .map((v) => {
      const price = Math.max(0, Math.trunc(Number(v.price) || 0));
      return {
        label: v.label.trim(),
        price,
        display: formatShortPrice(price),
      };
    })
    .filter((v) => v.label.length > 0 && v.price > 0);

  const pricedValues =
    cleanedVariants.length > 0
      ? cleanedVariants.map((v) => v.price)
      : variants
          .map((v) => Math.max(0, Math.trunc(Number(v.price) || 0)))
          .filter((price) => price > 0);

  if (pricedValues.length === 0) {
    return {
      cleanedVariants,
      priceMin: 0,
      priceMax: 0,
      priceDisplay: "Rp 0",
    };
  }

  const priceMin = Math.min(...pricedValues);
  const priceMax = Math.max(...pricedValues);
  const priceDisplay =
    priceMin === priceMax
      ? `Rp ${formatShortPrice(priceMin)}`
      : `Rp ${formatShortPrice(priceMin)} – ${formatShortPrice(priceMax)}`;

  return {
    cleanedVariants,
    priceMin,
    priceMax,
    priceDisplay,
  };
}

function buildAdminWaNotifyUrl(
  phone: string,
  booking: Booking,
  action: "reschedule" | "cancel" | "early_close"
): string {
  const cleanPhone = phone.replace(/\D/g, "");
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://madzhair.vercel.app";
  const ticketUrl = `${origin}/tiket/${booking.ticket_code}`;
  const dateLabel = formatIndonesianDateShort(booking.booking_date);
  const timeRange = `${formatTimeHHMM(booking.start_time)} – ${formatTimeHHMM(
    booking.end_time
  )} WIB`;

  if (action === "reschedule") {
    const prevRange =
      booking.previous_start_time && booking.previous_end_time
        ? `${formatTimeHHMM(booking.previous_start_time)} – ${formatTimeHHMM(
            booking.previous_end_time
          )} WIB`
        : null;
    const lines = [
      `Halo Kak ${booking.customer_name}, info perubahan jadwal Madzhair.co (Sungai Kunyit, Kalimantan Barat):`,
      `• Kode Tiket: ${booking.ticket_code}`,
      `• Layanan: ${booking.service_name}`,
      ...(prevRange ? [`• Jadwal Lama: ${prevRange}`] : []),
      `• Jadwal Baru: ${dateLabel}, ${timeRange}`,
      "",
      `Cek e-tiket terbaru: ${ticketUrl}`,
    ];
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
      lines.join("\n")
    )}`;
  }

  if (action === "early_close") {
    const lines = [
      `Halo Kak ${booking.customer_name}, info dari Madzhair.co (Sungai Kunyit, Kalimantan Barat):`,
      `Studio kami perlu tutup lebih awal hari ini. Mohon konfirmasi untuk penyesuaian jadwal reservasi Anda:`,
      `• Kode Tiket: ${booking.ticket_code}`,
      `• Layanan: ${booking.service_name}`,
      `• Jadwal: ${dateLabel}, ${timeRange}`,
      "",
      `Detail e-tiket: ${ticketUrl}`,
    ];
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
      lines.join("\n")
    )}`;
  }

  const lines = [
    `Halo Kak ${booking.customer_name}, mohon maaf reservasi Anda di Madzhair.co telah dibatalkan:`,
    `• Kode Tiket: ${booking.ticket_code}`,
    `• Layanan: ${booking.service_name}`,
    `• Jadwal: ${dateLabel}, ${timeRange}`,
    "",
    `Detail status e-tiket: ${ticketUrl}`,
    `Buat jadwal baru di: ${origin}/#reservasi`,
  ];
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    lines.join("\n")
  )}`;
}

export function AdminCashierDashboard({
  initialSettings,
  initialSchedules,
  initialClosedDates,
  initialServices,
  initialGalleryItems,
  initialBookings,
  initialBookingPhones = {},
}: AdminCashierDashboardProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const db = useMemo(
    () => supabase as unknown as SupabaseClient | null,
    [supabase]
  );

  const [activeTab, setActiveTab] = useState<DashboardTab>("queue");
  const [cmsSubTab, setCmsSubTab] = useState<CmsSubTab>("operational");
  const [openOpsSection, setOpenOpsSection] = useState<
    "break" | "weekly" | "closed" | null
  >(null);
  const [openCatalogSection, setOpenCatalogSection] = useState<string | null>(
    () => initialServices[0]?.id ?? null
  );
  const [showCompletedHistory, setShowCompletedHistory] = useState(false);
  const [showCancelledHistory, setShowCancelledHistory] = useState(false);

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
  const [bookingPhones, setBookingPhones] =
    useState<Record<string, string>>(initialBookingPhones);

  // Clock tick every 30 seconds so live status & walk-in target slots stay fresh
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Register minimal Web Push Service Worker (/sw.js)
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Ignore SW registration failure on unsupported environments
    });
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

  const todayOpState = useMemo(
    () =>
      getAdminTodayOperationalState({
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

  // Emergency & Today Quick Close state
  const [updatingQuickClose, setUpdatingQuickClose] = useState(false);

  // 1-Tap WhatsApp notification banner right after reschedule/cancel
  const [recentWaPrompt, setRecentWaPrompt] = useState<{
    booking: Booking;
    phone: string;
    action: "reschedule" | "cancel";
  } | null>(null);

  // Daily Break Time Draft state (default 17:15 - 18:30 WIB)
  const [breakEnabledDraft, setBreakEnabledDraft] = useState<boolean>(
    Boolean(initialSettings.break_enabled)
  );
  const [breakStartDraft, setBreakStartDraft] = useState<string>(
    formatTimeHHMM(initialSettings.break_start || "17:15:00")
  );
  const [breakEndDraft, setBreakEndDraft] = useState<string>(
    formatTimeHHMM(initialSettings.break_end || "18:30:00")
  );
  const [savingBreak, setSavingBreak] = useState(false);

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

  // CMS States: Gallery Instagram Reels Embed
  const [socialTitle, setSocialTitle] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [savingSocial, setSavingSocial] = useState(false);

  // CMS States: Gallery Photo Upload (Client-side WebP Compression)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoTitle, setPhotoTitle] = useState("");
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
      // Jalankan auto-complete berurutan sebelum mengambil ulang booking
      try {
        await fetch("/api/admin/auto-complete", { method: "POST" });
      } catch {
        // Fallback aman
      }

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
        const nextSettings = settingsRes.data as StoreSettings;
        setSettings(nextSettings);
        setBreakEnabledDraft(Boolean(nextSettings.break_enabled));
        setBreakStartDraft(formatTimeHHMM(nextSettings.break_start || "17:15:00"));
        setBreakEndDraft(formatTimeHHMM(nextSettings.break_end || "18:30:00"));
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
        const nextBookings = sortBookings(bookingsRes.data as Booking[]);
        setBookings(nextBookings);

        if (nextBookings.length > 0) {
          try {
            const { data: contactRows } = await supabase
              .from("booking_contacts")
              .select("booking_id, phone")
              .in(
                "booking_id",
                nextBookings.map((b) => b.id)
              );
            if (Array.isArray(contactRows)) {
              const phoneMap: Record<string, string> = {};
              for (const row of contactRows) {
                if (
                  row &&
                  typeof row.booking_id === "string" &&
                  typeof row.phone === "string"
                ) {
                  phoneMap[row.booking_id] = row.phone;
                }
              }
              setBookingPhones((prev) => ({ ...prev, ...phoneMap }));
            }
          } catch {
            // Abaikan bila booking_contacts belum tersedia
          }
        }
      }
      setNowTick(Date.now());
    } catch {
      showToast("error", "Gagal menyinkronkan data terbaru.");
    } finally {
      setRefreshing(false);
    }
  }, [supabase, upcomingDates, nowParts.dateStr, showToast]);

  // Auto-complete real-time saat ada booking BOOKED melewati end_time + 15 menit (Asia/Pontianak)
  const autoCompletingRef = useRef(false);
  useEffect(() => {
    const hasOverdueBooked = bookings.some((b) => {
      if (b.status !== "BOOKED") return false;
      if (b.booking_date < nowParts.dateStr) return true;
      if (b.booking_date === nowParts.dateStr) {
        return parseTimeToMinutes(b.end_time) + 15 <= nowParts.minutesFromMidnight;
      }
      return false;
    });

    if (!hasOverdueBooked || autoCompletingRef.current) return;

    autoCompletingRef.current = true;
    void fetch("/api/admin/auto-complete", { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { updatedCount?: number } | null) => {
        if (data && (data.updatedCount ?? 0) > 0) {
          void refreshAllData();
        }
      })
      .catch(() => {
        // Ignore transient network errors
      })
      .finally(() => {
        autoCompletingRef.current = false;
      });
  }, [bookings, nowParts.dateStr, nowParts.minutesFromMidnight, refreshAllData]);

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
    const isFullDayClosed = Boolean(closedDate && !closedDate.close_from_time);
    const hasOpenSchedule = Boolean(
      schedule && schedule.is_open && !isFullDayClosed
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

  const timelineBreakBand = useMemo(() => {
    if (!timelineRange || !settings.break_enabled) return null;
    const bStart = parseTimeToMinutes(settings.break_start || "17:15:00");
    const bEnd = parseTimeToMinutes(settings.break_end || "18:30:00");
    if (bEnd <= bStart) return null;

    const clampedStart = Math.max(bStart, timelineRange.startMinutes);
    const clampedEnd = Math.min(bEnd, timelineRange.endMinutes);
    if (clampedEnd <= clampedStart) return null;

    const topPx =
      ((clampedStart - timelineRange.startMinutes) / 60) * HOUR_ROW_HEIGHT_PX;
    const heightPx = ((clampedEnd - clampedStart) / 60) * HOUR_ROW_HEIGHT_PX;

    return {
      topPx,
      heightPx: Math.max(44, heightPx),
      label: `${formatTimeHHMM(settings.break_start || "17:15:00")} – ${formatTimeHHMM(
        settings.break_end || "18:30:00"
      )} WIB`,
    };
  }, [timelineRange, settings.break_enabled, settings.break_start, settings.break_end]);

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

  // Active bookings hari ini (Asia/Pontianak) untuk peringatan jika studio ditutup mendadak
  const todayActiveBookings = useMemo(
    () =>
      bookings
        .filter(
          (b) => b.booking_date === nowParts.dateStr && b.status === "BOOKED"
        )
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [bookings, nowParts.dateStr]
  );

  // Handlers: Tutup Mulai Jam Sekarang (khusus tanggal hari ini, tanpa ubah weekly_schedules)
  const handleCloseFromNowToday = async () => {
    if (!db) return;
    setUpdatingQuickClose(true);
    try {
      const freshNow = getStoreNowParts(settings.timezone);
      const cutoffTimeSql = `${freshNow.timeStr}:00`;
      const { data, error } = await db
        .from("closed_dates")
        .upsert(
          {
            closed_date: freshNow.dateStr,
            close_from_time: cutoffTimeSql,
            reason: `Tutup mulai ${freshNow.timeStr} WIB`,
          },
          { onConflict: "closed_date" }
        )
        .select("*")
        .single();

      if (error || !data) {
        showToast(
          "error",
          error?.message || "Gagal mengaktifkan tutup mulai jam sekarang."
        );
        return;
      }

      const saved = data as ClosedDate;
      setClosedDates((prev) => {
        const filtered = prev.filter((item) => item.closed_date !== saved.closed_date);
        return [...filtered, saved].sort((a, b) =>
          a.closed_date.localeCompare(b.closed_date)
        );
      });
      setPendingWalkin(null);
      showToast(
        "success",
        `Studio ditutup mulai ${freshNow.timeStr} WIB khusus hari ini. Jadwal besok tetap normal.`
      );
    } finally {
      setUpdatingQuickClose(false);
    }
  };

  // Handlers: Tutup Seharian Ini (khusus tanggal hari ini, close_from_time = NULL)
  const handleCloseAllDayToday = async () => {
    if (!db) return;
    setUpdatingQuickClose(true);
    try {
      const freshNow = getStoreNowParts(settings.timezone);
      const { data, error } = await db
        .from("closed_dates")
        .upsert(
          {
            closed_date: freshNow.dateStr,
            close_from_time: null,
            reason: "Tutup seharian ini",
          },
          { onConflict: "closed_date" }
        )
        .select("*")
        .single();

      if (error || !data) {
        showToast(
          "error",
          error?.message || "Gagal mengaktifkan tutup seharian ini."
        );
        return;
      }

      const saved = data as ClosedDate;
      setClosedDates((prev) => {
        const filtered = prev.filter((item) => item.closed_date !== saved.closed_date);
        return [...filtered, saved].sort((a, b) =>
          a.closed_date.localeCompare(b.closed_date)
        );
      });
      setPendingWalkin(null);
      showToast(
        "success",
        "Studio ditutup seharian khusus hari ini. Jadwal besok tetap normal."
      );
    } finally {
      setUpdatingQuickClose(false);
    }
  };

  // Handlers: Buka Kembali Studio (hapus closed_dates hari ini & pastikan is_force_closed = false)
  const handleReopenStudio = async () => {
    if (!db) return;
    setUpdatingQuickClose(true);
    try {
      const freshNow = getStoreNowParts(settings.timezone);
      const { error: deleteErr } = await db
        .from("closed_dates")
        .delete()
        .eq("closed_date", freshNow.dateStr);

      if (deleteErr) {
        showToast("error", deleteErr.message || "Gagal membuka kembali studio.");
        return;
      }

      if (settings.is_force_closed) {
        const { data: updatedSettings, error: settingsErr } = await db
          .from("store_settings")
          .update({ is_force_closed: false })
          .eq("id", settings.id)
          .select("*")
          .single();

        if (settingsErr || !updatedSettings) {
          showToast(
            "error",
            settingsErr?.message || "Gagal mematikan mode tutup darurat."
          );
          return;
        }
        setSettings(updatedSettings as StoreSettings);
      }

      setClosedDates((prev) =>
        prev.filter((item) => item.closed_date !== freshNow.dateStr)
      );
      setPendingWalkin(null);
      showToast(
        "success",
        "Studio kembali BUKA mengikuti jadwal operasional hari ini."
      );
    } finally {
      setUpdatingQuickClose(false);
    }
  };

  // Handlers: Simpan Jam Istirahat Harian (default 17:15 - 18:30 WIB)
  const handleSaveBreakSettings = async () => {
    if (!db) return;
    if (breakEndDraft <= breakStartDraft) {
      showToast(
        "error",
        "Jam selesai istirahat harus lebih akhir dari jam mulai istirahat."
      );
      return;
    }

    setSavingBreak(true);
    try {
      const breakStartSql =
        breakStartDraft.length === 5 ? `${breakStartDraft}:00` : breakStartDraft;
      const breakEndSql =
        breakEndDraft.length === 5 ? `${breakEndDraft}:00` : breakEndDraft;

      const { data, error } = await db
        .from("store_settings")
        .update({
          break_enabled: breakEnabledDraft,
          break_start: breakStartSql,
          break_end: breakEndSql,
        })
        .eq("id", settings.id)
        .select("*")
        .single();

      if (error || !data) {
        showToast(
          "error",
          error?.message || "Gagal menyimpan pengaturan jam istirahat."
        );
        return;
      }

      const updated = data as StoreSettings;
      setSettings(updated);
      setBreakEnabledDraft(Boolean(updated.break_enabled));
      setBreakStartDraft(formatTimeHHMM(updated.break_start || "17:15:00"));
      setBreakEndDraft(formatTimeHHMM(updated.break_end || "18:30:00"));
      showToast(
        "success",
        updated.break_enabled
          ? `Jam istirahat aktif (${formatTimeHHMM(updated.break_start)} – ${formatTimeHHMM(
              updated.break_end
            )} WIB).`
          : "Jam istirahat harian dinonaktifkan."
      );
    } finally {
      setSavingBreak(false);
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
        customerPhone?: string | null;
        error?: string;
      };

      if (!res.ok || !data.booking) {
        showToast("error", data.error || "Gagal memperbarui jadwal.");
        return;
      }

      const updatedBooking = data.booking;
      const resolvedPhone =
        (typeof data.customerPhone === "string" && data.customerPhone) ||
        bookingPhones[updatedBooking.id] ||
        null;

      if (resolvedPhone) {
        setBookingPhones((prev) => ({
          ...prev,
          [updatedBooking.id]: resolvedPhone,
        }));
      }

      setBookings((prev) => upsertBooking(prev, updatedBooking));
      closeBookingDetail();

      if (payload.action === "complete") {
        setRecentWaPrompt(null);
        showToast(
          "success",
          `Sesi ${updatedBooking.ticket_code} ditandai selesai.`
        );
      } else if (payload.action === "cancel") {
        if (resolvedPhone) {
          setRecentWaPrompt({
            booking: updatedBooking,
            phone: resolvedPhone,
            action: "cancel",
          });
        }
        showToast(
          "success",
          `Jadwal ${updatedBooking.ticket_code} dibatalkan. Slot kini bebas.`
        );
      } else {
        if (resolvedPhone) {
          setRecentWaPrompt({
            booking: updatedBooking,
            phone: resolvedPhone,
            action: "reschedule",
          });
        }
        showToast(
          "success",
          `Jadwal ${updatedBooking.ticket_code} digeser ke ${formatTimeHHMM(
            updatedBooking.start_time
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

    const { cleanedVariants, priceMin, priceMax, priceDisplay } =
      computeServicePricingSummary(service.price_variants);

    if (cleanedVariants.length === 0) {
      showToast(
        "error",
        `Isi minimal 1 varian ${service.name} dengan nama dan harga lebih dari Rp 0.`
      );
      return;
    }

    setSavingServiceId(service.id);
    try {
      const { data, error } = await db
        .from("services")
        .update({
          price_display: priceDisplay,
          price_min: priceMin,
          price_max: priceMax,
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
      showToast("success", `Tarif ${updated.name} diperbarui (${priceDisplay}).`);
    } finally {
      setSavingServiceId(null);
    }
  };

  // CMS Handlers: Instagram Reels Embed (Strict Instagram Whitelist)
  const socialValidation = useMemo(() => {
    const trimmed = socialUrl.trim();
    if (!trimmed) return null;
    const base = validateSocialEmbedUrl(trimmed);
    if (!base.valid || !base.url) {
      return {
        valid: false,
        error: "Masukkan tautan resmi https://www.instagram.com/reel/...",
      };
    }
    if (base.platform !== "instagram") {
      return {
        valid: false,
        error: "Hanya tautan Instagram Reels (instagram.com/reel/...) yang didukung.",
      };
    }
    return {
      valid: true,
      url: base.url,
    };
  }, [socialUrl]);

  const handleAddSocialEmbed = async (event: FormEvent) => {
    event.preventDefault();
    if (!db) return;

    if (!socialValidation?.valid || !socialValidation.url) {
      showToast(
        "error",
        socialValidation?.error ||
          "Masukkan tautan resmi https://www.instagram.com/reel/..."
      );
      return;
    }

    const title = socialTitle.trim() || "Instagram Reel Madzhair";

    setSavingSocial(true);
    try {
      const nextOrder =
        galleryItems.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1;

      const { data, error } = await db
        .from("gallery_items")
        .insert({
          title,
          media_type: "instagram",
          media_url: socialValidation.url,
          thumbnail_url: null,
          caption: null,
          sort_order: nextOrder,
          is_active: true,
        })
        .select("*")
        .single();

      if (error || !data) {
        showToast(
          "error",
          error?.message || "Gagal menyimpan link Instagram Reels."
        );
        return;
      }

      setGalleryItems((prev) => [data as GalleryItem, ...prev]);
      setSocialTitle("");
      setSocialUrl("");
      showToast("success", "Link Instagram Reels ditambahkan ke galeri.");
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
          caption: null,
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

  const openDaysCount = useMemo(
    () => schedules.filter((row) => row.is_open).length,
    [schedules]
  );

  const galleryPhotoCount = useMemo(
    () => galleryItems.filter((item) => item.media_type === "photo").length,
    [galleryItems]
  );

  const galleryReelsCount = useMemo(
    () => galleryItems.filter((item) => item.media_type !== "photo").length,
    [galleryItems]
  );

  const handleResetToTodayQueue = () => {
    setActiveTab("queue");
    setSelectedDate(nowParts.dateStr);
    closeBookingDetail();
    setPendingWalkin(null);
  };

  const statusToneClasses =
    todayOpState.tone === "open"
      ? "border-terracotta/35 bg-terracotta/10 text-terracotta"
      : todayOpState.tone === "closed"
        ? "border-crimson-alert/40 bg-crimson-alert/10 text-crimson-alert"
        : "border-hairline bg-surface-elevated text-ink";

  return (
    <div
      className={`min-h-[100dvh] bg-alabaster font-sans text-ink pt-safe ${
        isQueueTab
          ? hasActiveBottomDrawer
            ? "pb-56 sm:pb-48"
            : "pb-32 sm:pb-28"
          : "pb-safe"
      }`}
    >
      {/* Sterilized Navbar /admin: Tanpa link Beranda (anti salah klik PWA) */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-alabaster/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={handleResetToTodayQueue}
            aria-label="Madzhair.co Kasir — Kembali ke jadwal hari ini"
            className="inline-flex min-h-[44px] min-w-0 items-center gap-2 rounded-xl pr-2 text-left transition-opacity hover:opacity-85"
          >
            <BrandMark variant="compact" size="sm" />
            <span aria-hidden="true" className="text-hairline">
              ·
            </span>
            <span className="truncate font-sans text-xs font-semibold text-terracotta sm:text-sm">
              Kasir
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleSignOut()}
            aria-label="Keluar dari akun admin"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-hairline bg-surface px-3 font-sans text-xs font-semibold text-muted transition-colors hover:border-crimson-alert hover:text-crimson-alert"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pt-2.5 font-sans sm:px-6">
        {/* Bar Status Operasional Hari Ini Ringkas (1 baris + tombol Refresh) */}
        <div className="mb-2.5 flex items-center justify-between gap-2 rounded-xl border border-hairline bg-surface px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Calendar
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 ${
                todayOpState.tone === "closed"
                  ? "text-crimson-alert"
                  : todayOpState.tone === "open"
                    ? "text-terracotta"
                    : "text-muted"
              }`}
            />
            <span className="font-sans text-[11px] font-semibold leading-snug text-ink tabular-nums sm:text-xs">
              {todayOpState.badgeText}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void refreshAllData()}
            disabled={refreshing}
            aria-label="Muat ulang data antrean"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-alabaster/70 text-muted transition-colors hover:border-terracotta hover:text-terracotta disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-terracotta" : ""}`}
            />
          </button>
        </div>

        <InstallPwaBanner className="mb-2.5" />

        {/* Toast Notifikasi Aksi */}
        {toast ? (
          <div
            role="status"
            aria-live="polite"
            className={`mb-2.5 flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-xs text-ink sm:text-sm ${
              toast.type === "success"
                ? "border-ink/25 bg-surface"
                : "border-crimson-alert/50 bg-crimson-alert/10"
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === "success" ? (
                <Check
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-terracotta"
                />
              ) : (
                <AlertTriangle
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-crimson-alert"
                />
              )}
              <span>{toast.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Tutup notifikasi"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* Navigasi Mode Utama (2 Tab Bersih) */}
        <nav
          aria-label="Navigasi Dashboard Kasir"
          className="mb-3 grid grid-cols-2 gap-1.5 rounded-2xl border border-hairline bg-surface p-1"
        >
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 font-sans text-[11px] font-semibold transition-colors sm:px-3 sm:text-sm ${
              activeTab === "queue"
                ? "bg-terracotta text-surface"
                : "text-muted hover:bg-surface-elevated hover:text-ink"
            }`}
          >
            <Scissors aria-hidden="true" className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span>Jadwal &amp; Kasir</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cms")}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 font-sans text-[11px] font-semibold transition-colors sm:px-3 sm:text-sm ${
              activeTab === "cms"
                ? "bg-terracotta text-surface"
                : "text-muted hover:bg-surface-elevated hover:text-ink"
            }`}
          >
            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span>Operasional &amp; CMS</span>
          </button>
        </nav>

        {/* ================================================================ */}
        {/* TAB 1: JADWAL & KASIR (FOKUS PENUH ANTREAN HARIAN, ZERO CMS)     */}
        {/* ================================================================ */}
        {activeTab === "queue" ? (
          <section aria-label="Antrean Real-time">
            {/* Aksi Cepat 1-Tap Kirim Info Perubahan ke WA Pelanggan (sesudah Geser Jadwal / Batalkan) */}
            {recentWaPrompt ? (
              <div className="mb-3 rounded-2xl border border-terracotta/50 bg-surface p-3.5 shadow-xs">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <p className="font-sans text-xs font-semibold text-terracotta">
                      {recentWaPrompt.action === "reschedule"
                        ? "Jadwal berhasil digeser"
                        : "Jadwal berhasil dibatalkan"}
                    </p>
                    <p className="mt-0.5 font-sans text-xs text-ink">
                      Kirim info perubahan ke{" "}
                      <strong className="font-semibold">
                        {recentWaPrompt.booking.customer_name}
                      </strong>{" "}
                      ({recentWaPrompt.booking.ticket_code}) via WhatsApp.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Tutup tombol WA"
                    onClick={() => setRecentWaPrompt(null)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-elevated hover:text-ink"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>

                <a
                  href={buildAdminWaNotifyUrl(
                    recentWaPrompt.phone,
                    recentWaPrompt.booking,
                    recentWaPrompt.action
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 sm:w-auto"
                >
                  <MessageCircle aria-hidden="true" className="h-4 w-4" />
                  <span>Kirim Info ke WA Pelanggan</span>
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : null}

            {/* Horizontal Date Scrubber (Hari Ini + 7 Hari ke Depan) */}
            <div className="mb-2.5 flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
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
                    className={`flex min-h-[44px] shrink-0 snap-start items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors ${
                      isSelected
                        ? "border-terracotta bg-terracotta text-surface"
                        : "border-hairline bg-surface text-ink hover:border-terracotta/60 hover:bg-surface-elevated"
                    }`}
                  >
                    <div className="flex flex-col leading-tight">
                      <span
                        className={`font-sans text-[10px] font-medium ${
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
                        className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1 font-sans text-[11px] font-semibold tabular-nums ${
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

            {/* Ringkasan 1 Baris Sesi Hari Ini + Legenda */}
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="inline-flex items-center gap-1 text-muted">
                  <span>Menunggu</span>
                  <strong className="font-semibold text-terracotta tabular-nums">
                    {dayCounts.booked}
                  </strong>
                </span>
                <span aria-hidden="true" className="text-hairline">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 text-muted">
                  <span>Selesai</span>
                  <strong className="font-semibold text-ink tabular-nums">
                    {dayCounts.completed}
                  </strong>
                </span>
                <span aria-hidden="true" className="text-hairline">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 text-muted">
                  <span>Batal</span>
                  <strong className="font-semibold text-muted tabular-nums">
                    {dayCounts.cancelled}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-1.5 font-sans text-[11px] font-semibold">
                <span className="rounded-md border border-terracotta/35 bg-terracotta/12 px-1.5 py-0.5 text-terracotta">
                  Online
                </span>
                <span className="rounded-md bg-ink px-1.5 py-0.5 text-surface">
                  Walk-in
                </span>
              </div>
            </div>

            {/* Visual Time-Block Timeline Utama */}
            {!timelineRange ? (
              <div className="rounded-2xl border border-hairline bg-surface px-4 py-8 text-center">
                <p className="font-sans text-xs font-semibold text-crimson-alert">
                  {selectedDateMeta.closedDate
                    ? "Libur khusus"
                    : "Hari libur rutin"}
                </p>
                <p className="mt-1 font-sans text-base font-semibold text-ink">
                  Studio Tidak Beroperasi
                </p>
                <p className="mt-1 text-xs text-muted">
                  {selectedDateMeta.closedDate?.reason ||
                    "Tanggal ini ditandai libur pada jadwal operasional."}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-hairline bg-surface p-2.5 sm:p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2 px-0.5 text-xs">
                  <span className="font-semibold text-ink tabular-nums">
                    {formatIndonesianDateShort(selectedDate)}
                  </span>
                  <span className="font-medium text-muted tabular-nums">
                    {minutesToTime(timelineRange.startMinutes)}–
                    {minutesToTime(timelineRange.endMinutes)} WIB
                  </span>
                </div>

                <div className="relative flex gap-2 sm:gap-3">
                  {/* Kolom Penanda Jam (Left Time Axis) */}
                  <div
                    aria-hidden="true"
                    style={{ height: `${timelineRange.totalHeightPx}px` }}
                    className="relative w-11 shrink-0 select-none sm:w-14"
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
                        className={`absolute right-1 font-sans text-[11px] font-medium text-muted tabular-nums sm:right-2 ${
                          idx === 0 ? "translate-y-0" : "-translate-y-1/2"
                        }`}
                      >
                        {minutesToTime(hourStart)}
                      </span>
                    ))}

                    <span className="absolute right-1 bottom-0 font-sans text-[11px] font-medium text-muted/75 tabular-nums sm:right-2">
                      {minutesToTime(timelineRange.endMinutes)}
                    </span>

                    {/* Tag Waktu Aktif Live */}
                    {showCurrentTimeLine ? (
                      <div
                        style={{ top: `${currentTimeTopPx}px` }}
                        className="pointer-events-none absolute right-0.5 z-30 -translate-y-1/2 rounded-md bg-terracotta px-1.5 py-0.5 font-sans text-[10px] font-semibold text-surface tabular-nums shadow-xs sm:right-1"
                      >
                        {nowParts.timeStr}
                      </div>
                    ) : null}
                  </div>

                  {/* Kolom Track Timeline (Slot Kosong + Blok Istirahat + Blok Booking + Live Line) */}
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

                      const isAfterEarlyClose = Boolean(
                        selectedDateMeta.closedDate?.close_from_time &&
                          hourStart >=
                            parseTimeToMinutes(
                              selectedDateMeta.closedDate.close_from_time
                            )
                      );

                      return (
                        <div
                          key={hourStart}
                          style={{ height: `${HOUR_ROW_HEIGHT_PX}px` }}
                          className="border-t border-hairline py-1"
                        >
                          {!isHourOccupied ? (
                            <div className="flex h-full items-center justify-between gap-2 rounded-xl border border-dashed border-hairline bg-alabaster/50 px-3 py-1.5">
                              <span className="font-sans text-xs font-medium text-muted tabular-nums">
                                {minutesToTime(hourStart)} –{" "}
                                {minutesToTime(hourStart + 60)}
                              </span>
                              <span className="font-sans text-xs text-muted/85">
                                {settings.is_force_closed || isAfterEarlyClose
                                  ? "Tutup"
                                  : (selectedDateMeta.closedDate &&
                                        !selectedDateMeta.closedDate
                                          .close_from_time) ||
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

                    {/* Layer 1.5: Blok Jam Istirahat (z-[5] di bawah blok BOOKED z-10) */}
                    {timelineBreakBand ? (
                      <div
                        aria-label={`Jam istirahat ${timelineBreakBand.label}`}
                        style={{
                          top: `${timelineBreakBand.topPx + 2}px`,
                          height: `${Math.max(38, timelineBreakBand.heightPx - 4)}px`,
                        }}
                        className="pointer-events-none absolute inset-x-0 z-[5] flex items-center justify-between gap-2 rounded-xl border border-ink/20 bg-surface-elevated/90 px-3 py-1.5"
                      >
                        <div className="flex items-center gap-1.5 font-sans text-xs font-semibold text-ink">
                          <Coffee
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0 text-terracotta"
                          />
                          <span>Istirahat</span>
                        </div>
                        <span className="font-sans text-xs font-medium text-muted tabular-nums">
                          {timelineBreakBand.label}
                        </span>
                      </div>
                    ) : null}

                    {/* Layer 2: Blok Booking Aktif Bersih (z-10, Tap -> Bottom Sheet Detail) */}
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
                            top: `${topPx + 3}px`,
                            height: `${Math.max(68, heightPx - 6)}px`,
                          }}
                          className={`group absolute inset-x-0 z-10 overflow-hidden rounded-xl border text-left transition-all ${
                            isSelected
                              ? "border-terracotta bg-surface ring-2 ring-terracotta/25"
                              : "border-hairline bg-surface shadow-xs hover:border-terracotta/70"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`absolute top-0 bottom-0 left-0 w-1 ${
                              isWalkin ? "bg-ink" : "bg-terracotta"
                            }`}
                          />

                          <div className="flex h-full flex-col justify-between px-3 py-1.5 pl-3.5 sm:px-3.5 sm:py-2 sm:pl-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-sans text-xs font-semibold text-ink tabular-nums">
                                {formatTimeHHMM(booking.start_time)}–
                                {formatTimeHHMM(booking.end_time)}
                              </span>

                              <div className="flex shrink-0 items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-sans text-[10px] font-semibold ${
                                    isWalkin
                                      ? "border-ink bg-ink text-surface"
                                      : "border-terracotta/40 bg-terracotta/12 text-terracotta"
                                  }`}
                                >
                                  {isWalkin ? "Walk-in" : "Online"}
                                </span>

                                <ChevronRight
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 text-muted transition-colors group-hover:text-terracotta"
                                />
                              </div>
                            </div>

                            <div className="min-w-0">
                              <p className="truncate font-sans text-sm font-semibold leading-tight text-ink">
                                {booking.customer_name}
                              </p>
                              <p className="truncate font-sans text-[11px] leading-tight text-muted">
                                {booking.service_name}
                              </p>
                            </div>

                            {isMultiBlock ? (
                              <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-hairline/80 bg-alabaster/70 px-2.5 py-1">
                                <span className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-ink tabular-nums">
                                  <Sparkles
                                    aria-hidden="true"
                                    className="h-3 w-3 shrink-0 text-terracotta"
                                  />
                                  <span>{durationMin} menit</span>
                                </span>
                                <span className="font-sans text-[11px] text-muted tabular-nums">
                                  {blockCount} jam
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
                        <span className="h-[2px] w-full bg-terracotta" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Riwayat Selesai (Collapsible Ringkas) */}
            {completedBookings.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-hairline bg-surface">
                <button
                  type="button"
                  onClick={() => setShowCompletedHistory((prev) => !prev)}
                  aria-expanded={showCompletedHistory}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-alabaster/45"
                >
                  <span className="font-sans text-xs font-semibold text-ink sm:text-sm">
                    Riwayat selesai ({completedBookings.length})
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 text-muted transition-transform ${
                      showCompletedHistory ? "rotate-180 text-terracotta" : ""
                    }`}
                  />
                </button>

                {showCompletedHistory ? (
                  <div className="divide-y divide-hairline border-t border-hairline px-3.5">
                    {completedBookings.map((booking) => (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => openBookingDetail(booking.id)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 py-2.5 text-left transition-colors hover:text-terracotta"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-sans text-xs font-semibold text-ink tabular-nums">
                              {formatTimeHHMM(booking.start_time)}–
                              {formatTimeHHMM(booking.end_time)}
                            </span>
                            <span className="truncate font-sans text-xs font-semibold text-ink sm:text-sm">
                              {booking.customer_name}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted">
                            {booking.service_name} ·{" "}
                            {booking.source === "WALKIN" ? "Walk-in" : "Online"}
                          </p>
                        </div>

                        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-hairline bg-alabaster/70 px-2 py-1 font-sans text-[11px] font-medium text-muted tabular-nums">
                          <span>{booking.ticket_code}</span>
                          <ChevronRight aria-hidden="true" className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Riwayat Dibatalkan (Collapsible Ringkas) */}
            {cancelledBookings.length > 0 ? (
              <div className="mt-2.5 overflow-hidden rounded-2xl border border-hairline bg-surface">
                <button
                  type="button"
                  onClick={() => setShowCancelledHistory((prev) => !prev)}
                  aria-expanded={showCancelledHistory}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-alabaster/45"
                >
                  <span className="font-sans text-xs font-semibold text-muted sm:text-sm">
                    Riwayat dibatalkan ({cancelledBookings.length})
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 text-muted transition-transform ${
                      showCancelledHistory ? "rotate-180 text-terracotta" : ""
                    }`}
                  />
                </button>

                {showCancelledHistory ? (
                  <div className="divide-y divide-hairline border-t border-hairline px-3.5">
                    {cancelledBookings.map((booking) => (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => openBookingDetail(booking.id)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 py-2.5 text-left transition-colors hover:text-terracotta"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-sans text-xs font-semibold text-ink tabular-nums">
                              {formatTimeHHMM(booking.start_time)}–
                              {formatTimeHHMM(booking.end_time)}
                            </span>
                            <span className="truncate font-sans text-xs font-semibold text-ink sm:text-sm">
                              {booking.customer_name}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted">
                            {booking.service_name} · Slot dibebaskan
                          </p>
                        </div>

                        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-hairline bg-alabaster/70 px-2 py-1 font-sans text-[11px] font-medium text-muted tabular-nums">
                          <span>{booking.ticket_code}</span>
                          <ChevronRight aria-hidden="true" className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : (
          /* ================================================================ */
          /* TAB 2: OPERASIONAL & CMS (SUB-PILL + COLLAPSIBLE ACCORDION)      */
          /* ================================================================ */
          <div className="space-y-3 pb-8">
            {/* Sub-Tab Pill Bersih (Operasional · Layanan & Galeri · Notifikasi & QR) */}
            <div
              role="tablist"
              aria-label="Sub-menu Operasional dan CMS"
              className="grid grid-cols-3 gap-1.5 rounded-2xl border border-hairline bg-surface p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={cmsSubTab === "operational"}
                onClick={() => setCmsSubTab("operational")}
                className={`min-h-[40px] rounded-xl px-2 font-sans text-xs font-semibold transition-colors ${
                  cmsSubTab === "operational"
                    ? "bg-ink text-surface"
                    : "text-muted hover:bg-surface-elevated hover:text-ink"
                }`}
              >
                Operasional
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cmsSubTab === "catalog"}
                onClick={() => setCmsSubTab("catalog")}
                className={`min-h-[40px] rounded-xl px-2 font-sans text-xs font-semibold transition-colors ${
                  cmsSubTab === "catalog"
                    ? "bg-ink text-surface"
                    : "text-muted hover:bg-surface-elevated hover:text-ink"
                }`}
              >
                Layanan &amp; Galeri
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cmsSubTab === "notify_qr"}
                onClick={() => setCmsSubTab("notify_qr")}
                className={`min-h-[40px] rounded-xl px-2 font-sans text-xs font-semibold transition-colors ${
                  cmsSubTab === "notify_qr"
                    ? "bg-ink text-surface"
                    : "text-muted hover:bg-surface-elevated hover:text-ink"
                }`}
              >
                Notifikasi &amp; QR
              </button>
            </div>

            {/* SUB-TAB A: OPERASIONAL (Status Hari Ini + 3 Accordion Ringkas) */}
            {cmsSubTab === "operational" ? (
              <div className="space-y-3">
                {/* Kartu Status Studio Hari Ini (State-Machine 5 Kondisi Asia/Pontianak) */}
                <section
                  aria-label="Status Studio Hari Ini"
                  className="rounded-2xl border border-hairline bg-surface p-3.5 sm:p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-sans text-sm font-semibold text-ink">
                        Status Studio Hari Ini
                      </p>
                      <p className="mt-0.5 font-sans text-[11px] text-muted">
                        {formatIndonesianDateShort(nowParts.dateStr)} · Sungai
                        Kunyit, Kalimantan Barat (WIB)
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-lg border px-2.5 py-1 font-sans text-xs font-semibold tabular-nums ${statusToneClasses}`}
                    >
                      {todayOpState.badgeText}
                    </span>
                  </div>

                  <p className="mt-2 font-sans text-xs leading-relaxed text-muted">
                    {todayOpState.description}
                  </p>

                  {/* Tombol Aksi Kondisional sesuai State-Machine Waktu WIB */}
                  {todayOpState.canCloseFromNow ||
                  todayOpState.canCloseAllDay ||
                  todayOpState.canReopen ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {todayOpState.canCloseFromNow ? (
                        <button
                          type="button"
                          disabled={updatingQuickClose}
                          onClick={() => void handleCloseFromNowToday()}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-terracotta/50 bg-terracotta/10 px-3 font-sans text-xs font-semibold text-terracotta transition-colors hover:bg-terracotta hover:text-surface disabled:opacity-50 sm:flex-none"
                        >
                          <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                          <span>
                            Tutup Mulai Jam Sekarang ({nowParts.timeStr} WIB)
                          </span>
                        </button>
                      ) : null}

                      {todayOpState.canCloseAllDay ? (
                        <button
                          type="button"
                          disabled={updatingQuickClose}
                          onClick={() => void handleCloseAllDayToday()}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-crimson-alert/50 bg-crimson-alert/10 px-3 font-sans text-xs font-semibold text-crimson-alert transition-colors hover:bg-crimson-alert hover:text-surface disabled:opacity-50 sm:flex-none"
                        >
                          <Power aria-hidden="true" className="h-3.5 w-3.5" />
                          <span>Tutup Seharian Ini</span>
                        </button>
                      ) : null}

                      {todayOpState.canReopen ? (
                        <button
                          type="button"
                          disabled={updatingQuickClose}
                          onClick={() => void handleReopenStudio()}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:flex-none"
                        >
                          <Check aria-hidden="true" className="h-3.5 w-3.5" />
                          <span>Buka Kembali Studio</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Peringatan Booking Aktif jika Studio Ditutup Mendadak / Seharian */}
                  {todayOpState.isOverrideClosed &&
                  todayActiveBookings.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-crimson-alert/35 bg-crimson-alert/8 p-3">
                      <div className="flex items-start gap-2 text-xs text-ink">
                        <AlertTriangle
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-crimson-alert"
                        />
                        <p>
                          Masih ada{" "}
                          <strong className="font-semibold tabular-nums">
                            {todayActiveBookings.length} jadwal BOOKED
                          </strong>{" "}
                          hari ini. Booking lama tidak dibatalkan otomatis —
                          hubungi pelanggan via WA atau kelola di timeline.
                        </p>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        {todayActiveBookings.map((b) => {
                          const phone = bookingPhones[b.id];
                          return (
                            <div
                              key={b.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface px-3 py-2"
                            >
                              <div className="min-w-0 font-sans text-xs">
                                <p className="font-semibold text-ink tabular-nums">
                                  {formatTimeHHMM(b.start_time)}–
                                  {formatTimeHHMM(b.end_time)} WIB ·{" "}
                                  {b.customer_name}
                                </p>
                                <p className="text-[11px] text-muted">
                                  {b.service_name} · {b.ticket_code}
                                </p>
                              </div>
                              {phone ? (
                                <a
                                  href={buildAdminWaNotifyUrl(
                                    phone,
                                    b,
                                    "early_close"
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-terracotta px-3 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90"
                                >
                                  <MessageCircle
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                  />
                                  <span>Info WA</span>
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTab("queue");
                                    setSelectedDate(b.booking_date);
                                    openBookingDetail(b.id);
                                  }}
                                  className="inline-flex min-h-[40px] items-center rounded-xl border border-hairline bg-alabaster/70 px-3 font-sans text-xs font-medium text-ink hover:border-terracotta"
                                >
                                  Kelola
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* Accordion 1: Jam Istirahat Harian */}
                <section
                  aria-label="Jam Istirahat Harian"
                  className="overflow-hidden rounded-2xl border border-hairline bg-surface"
                >
                  <button
                    type="button"
                    aria-expanded={openOpsSection === "break"}
                    onClick={() =>
                      setOpenOpsSection((prev) =>
                        prev === "break" ? null : "break"
                      )
                    }
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-alabaster/45 sm:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Coffee
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-terracotta"
                      />
                      <div className="min-w-0">
                        <p className="font-sans text-sm font-semibold text-ink">
                          Jam Istirahat Harian
                        </p>
                        <p className="truncate font-sans text-xs text-muted tabular-nums">
                          {settings.break_enabled
                            ? `Aktif ${formatTimeHHMM(
                                settings.break_start || "17:15:00"
                              )}–${formatTimeHHMM(
                                settings.break_end || "18:30:00"
                              )} WIB`
                            : `Nonaktif (${formatTimeHHMM(
                                settings.break_start || "17:15:00"
                              )}–${formatTimeHHMM(
                                settings.break_end || "18:30:00"
                              )} WIB)`}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                        openOpsSection === "break"
                          ? "rotate-180 text-terracotta"
                          : ""
                      }`}
                    />
                  </button>

                  {openOpsSection === "break" ? (
                    <div className="border-t border-hairline p-3.5 sm:p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-sans text-xs text-muted">
                          Kunci otomatis slot 1 jam &amp; 2 jam yang beririsan
                          dengan jam istirahat.
                        </p>
                        <button
                          type="button"
                          onClick={() => setBreakEnabledDraft((prev) => !prev)}
                          className={`inline-flex min-h-[40px] min-w-[88px] shrink-0 items-center justify-center rounded-xl border px-3 font-sans text-xs font-semibold transition-colors ${
                            breakEnabledDraft
                              ? "border-terracotta bg-terracotta text-surface"
                              : "border-hairline bg-surface-elevated text-muted"
                          }`}
                        >
                          {breakEnabledDraft ? "Aktif" : "Nonaktif"}
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:max-w-sm">
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="break-start-time"
                            className="font-sans text-xs font-medium text-muted"
                          >
                            Mulai (WIB)
                          </label>
                          <input
                            id="break-start-time"
                            type="time"
                            value={breakStartDraft}
                            onChange={(e) => setBreakStartDraft(e.target.value)}
                            className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="break-end-time"
                            className="font-sans text-xs font-medium text-muted"
                          >
                            Selesai (WIB)
                          </label>
                          <input
                            id="break-end-time"
                            type="time"
                            value={breakEndDraft}
                            onChange={(e) => setBreakEndDraft(e.target.value)}
                            className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <button
                          type="button"
                          disabled={savingBreak}
                          onClick={() => void handleSaveBreakSettings()}
                          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
                        >
                          <Check aria-hidden="true" className="h-4 w-4" />
                          <span>
                            {savingBreak
                              ? "Menyimpan..."
                              : "Simpan Jam Istirahat"}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* Accordion 2: Jadwal Mingguan */}
                <section
                  aria-label="Jadwal Mingguan"
                  className="overflow-hidden rounded-2xl border border-hairline bg-surface"
                >
                  <button
                    type="button"
                    aria-expanded={openOpsSection === "weekly"}
                    onClick={() =>
                      setOpenOpsSection((prev) =>
                        prev === "weekly" ? null : "weekly"
                      )
                    }
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-alabaster/45 sm:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Clock
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-terracotta"
                      />
                      <div className="min-w-0">
                        <p className="font-sans text-sm font-semibold text-ink">
                          Jadwal Operasional Mingguan
                        </p>
                        <p className="truncate font-sans text-xs text-muted tabular-nums">
                          {openDaysCount} hari buka
                          {7 - openDaysCount > 0
                            ? ` · ${7 - openDaysCount} hari libur`
                            : " · Setiap hari"}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                        openOpsSection === "weekly"
                          ? "rotate-180 text-terracotta"
                          : ""
                      }`}
                    />
                  </button>

                  {openOpsSection === "weekly" ? (
                    <div className="border-t border-hairline">
                      <div className="divide-y divide-hairline">
                        {scheduleDrafts.map((row) => (
                          <div
                            key={row.day_of_week}
                            className="flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-center justify-between gap-3 sm:w-40">
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
                                className={`inline-flex min-h-[40px] min-w-[76px] items-center justify-center rounded-xl border px-3 font-sans text-xs font-semibold transition-colors ${
                                  row.is_open
                                    ? "border-ink bg-ink text-surface"
                                    : "border-hairline bg-surface-elevated text-muted"
                                }`}
                              >
                                {row.is_open ? "Buka" : "Libur"}
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                              <input
                                id={`open-${row.day_of_week}`}
                                aria-label={`Jam buka ${DAY_LABELS[row.day_of_week]}`}
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
                                className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none disabled:opacity-40"
                              />
                              <input
                                id={`close-${row.day_of_week}`}
                                aria-label={`Jam tutup ${DAY_LABELS[row.day_of_week]}`}
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
                                className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none disabled:opacity-40"
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-hairline p-3.5">
                        <button
                          type="button"
                          disabled={savingSchedules}
                          onClick={() => void handleSaveSchedules()}
                          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto sm:text-sm"
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
                  ) : null}
                </section>

                {/* Accordion 3: Tanggal Libur Khusus */}
                <section
                  aria-label="Tanggal Libur Khusus"
                  className="overflow-hidden rounded-2xl border border-hairline bg-surface"
                >
                  <button
                    type="button"
                    aria-expanded={openOpsSection === "closed"}
                    onClick={() =>
                      setOpenOpsSection((prev) =>
                        prev === "closed" ? null : "closed"
                      )
                    }
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-alabaster/45 sm:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <CalendarOff
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-terracotta"
                      />
                      <div className="min-w-0">
                        <p className="font-sans text-sm font-semibold text-ink">
                          Tanggal Libur Khusus
                        </p>
                        <p className="truncate font-sans text-xs text-muted tabular-nums">
                          {closedDates.length > 0
                            ? `${closedDates.length} tanggal terdaftar`
                            : "Tidak ada tanggal libur khusus"}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                        openOpsSection === "closed"
                          ? "rotate-180 text-terracotta"
                          : ""
                      }`}
                    />
                  </button>

                  {openOpsSection === "closed" ? (
                    <div className="border-t border-hairline p-3.5 sm:p-4">
                      <form
                        onSubmit={handleAddClosedDate}
                        className="grid gap-2.5 sm:grid-cols-[170px_1fr_auto]"
                      >
                        <input
                          type="date"
                          required
                          aria-label="Pilih tanggal libur"
                          value={newClosedDate}
                          onChange={(e) => setNewClosedDate(e.target.value)}
                          className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none"
                        />
                        <input
                          type="text"
                          placeholder="Keterangan (mis. Libur Idul Fitri)"
                          aria-label="Alasan libur"
                          value={newClosedReason}
                          onChange={(e) => setNewClosedReason(e.target.value)}
                          className="min-h-[44px] rounded-xl border border-hairline bg-alabaster/60 px-3 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:bg-surface focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={savingClosedDate}
                          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          <Plus aria-hidden="true" className="h-4 w-4" />
                          <span>
                            {savingClosedDate ? "Menyimpan..." : "Tambah"}
                          </span>
                        </button>
                      </form>

                      <div className="mt-3 divide-y divide-hairline border-t border-hairline">
                        {closedDates.length === 0 ? (
                          <p className="pt-3 text-xs text-muted">
                            Belum ada tanggal libur khusus yang terdaftar.
                          </p>
                        ) : (
                          closedDates.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-2.5 py-2.5 last:pb-0"
                            >
                              <div className="min-w-0">
                                <p className="font-sans text-sm font-semibold text-ink tabular-nums">
                                  {item.closed_date}
                                </p>
                                <p className="truncate text-xs text-muted">
                                  {item.close_from_time
                                    ? `Tutup mulai ${formatTimeHHMM(item.close_from_time)} WIB`
                                    : item.reason || "Libur khusus seharian"}
                                </p>
                              </div>

                              <button
                                type="button"
                                disabled={deletingClosedId === item.id}
                                onClick={() =>
                                  void handleDeleteClosedDate(item.id)
                                }
                                aria-label={`Hapus libur ${item.closed_date}`}
                                className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-hairline bg-alabaster/70 px-2.5 font-sans text-xs font-medium text-crimson-alert transition-colors hover:border-crimson-alert hover:bg-crimson-alert/10 disabled:opacity-50"
                              >
                                <Trash2
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                <span>Hapus</span>
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}

            {/* SUB-TAB B: LAYANAN & GALERI (Accordion Ringkas Per Layanan + Galeri) */}
            {cmsSubTab === "catalog" ? (
              <div className="space-y-2.5">
                {serviceDrafts.map((service) => {
                  const pricingSummary = computeServicePricingSummary(
                    service.price_variants
                  );
                  const previewPriceLabel =
                    pricingSummary.priceMax > 0
                      ? pricingSummary.priceDisplay
                      : service.price_display || "Rp 0";
                  const isOpen = openCatalogSection === service.id;

                  return (
                    <section
                      key={service.id}
                      aria-label={`Tarif ${service.name}`}
                      className="overflow-hidden rounded-2xl border border-hairline bg-surface"
                    >
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenCatalogSection((prev) =>
                            prev === service.id ? null : service.id
                          )
                        }
                        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-alabaster/45 sm:px-4"
                      >
                        <div className="min-w-0">
                          <p className="font-sans text-sm font-semibold text-ink">
                            Tarif {service.name}
                          </p>
                          <p className="truncate font-sans text-xs text-muted tabular-nums">
                            <span className="font-semibold text-terracotta">
                              {previewPriceLabel}
                            </span>{" "}
                            · {service.slot_duration_minutes} mnt ·{" "}
                            {service.price_variants.length} varian
                          </p>
                        </div>
                        <ChevronDown
                          aria-hidden="true"
                          className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                            isOpen ? "rotate-180 text-terracotta" : ""
                          }`}
                        />
                      </button>

                      {isOpen ? (
                        <div className="border-t border-hairline p-3.5 sm:p-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="font-sans text-xs font-medium text-muted">
                              Varian tarif · tampil:{" "}
                              <strong className="font-semibold text-terracotta tabular-nums">
                                {previewPriceLabel}
                              </strong>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateServiceDraft(service.id, (prev) => ({
                                  ...prev,
                                  price_variants: [
                                    ...prev.price_variants,
                                    { label: "", price: 0, display: "0" },
                                  ],
                                }))
                              }
                              className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-hairline bg-alabaster/70 px-2.5 font-sans text-xs font-semibold text-terracotta transition-colors hover:border-terracotta"
                            >
                              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                              <span>Varian</span>
                            </button>
                          </div>

                          {service.price_variants.length > 0 ? (
                            <div className="mb-1.5 flex items-center gap-1.5 px-0.5 font-sans text-[11px] font-medium text-muted sm:gap-2">
                              <span className="min-w-0 flex-1">Nama varian</span>
                              <span className="w-36 shrink-0">Harga (Rp)</span>
                              <span className="w-[44px] shrink-0 text-center">
                                Hapus
                              </span>
                            </div>
                          ) : (
                            <p className="rounded-xl border border-dashed border-hairline bg-alabaster/40 px-3 py-2.5 font-sans text-xs text-muted">
                              Belum ada varian tarif. Tekan{" "}
                              <strong className="font-semibold text-ink">
                                + Varian
                              </strong>
                              .
                            </p>
                          )}

                          <div className="space-y-2">
                            {service.price_variants.map((variant, idx) => (
                              <div
                                key={`${service.id}-var-${idx}`}
                                className="flex items-center gap-1.5 sm:gap-2"
                              >
                                <input
                                  type="text"
                                  aria-label={`Nama varian ${service.name} ${idx + 1}`}
                                  placeholder="Nama varian"
                                  value={variant.label}
                                  onChange={(e) =>
                                    updateServiceDraft(service.id, (prev) => ({
                                      ...prev,
                                      price_variants: prev.price_variants.map(
                                        (v, vIdx) =>
                                          vIdx === idx
                                            ? { ...v, label: e.target.value }
                                            : v
                                      ),
                                    }))
                                  }
                                  className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-hairline bg-alabaster/60 px-2.5 font-sans text-base text-ink focus:border-terracotta focus:bg-surface focus:outline-none sm:px-3"
                                />

                                <div className="relative w-36 shrink-0">
                                  <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-sans text-xs font-medium text-muted"
                                  >
                                    Rp
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    aria-label={`Harga varian ${service.name} ${idx + 1} dalam Rupiah`}
                                    placeholder="30.000"
                                    value={formatThousandsId(variant.price)}
                                    onChange={(e) => {
                                      const parsedPrice = parseRupiahDigits(
                                        e.target.value
                                      );
                                      updateServiceDraft(
                                        service.id,
                                        (prev) => ({
                                          ...prev,
                                          price_variants:
                                            prev.price_variants.map((v, vIdx) =>
                                              vIdx === idx
                                                ? {
                                                    ...v,
                                                    price: parsedPrice,
                                                    display:
                                                      formatShortPrice(
                                                        parsedPrice
                                                      ),
                                                  }
                                                : v
                                            ),
                                        })
                                      );
                                    }}
                                    className="min-h-[44px] w-full rounded-xl border border-hairline bg-alabaster/60 pr-3 pl-9 text-right font-sans text-base text-ink tabular-nums focus:border-terracotta focus:bg-surface focus:outline-none"
                                  />
                                </div>

                                <button
                                  type="button"
                                  aria-label={`Hapus varian ${variant.label || idx + 1}`}
                                  onClick={() =>
                                    updateServiceDraft(service.id, (prev) => ({
                                      ...prev,
                                      price_variants:
                                        prev.price_variants.filter(
                                          (_, vIdx) => vIdx !== idx
                                        ),
                                    }))
                                  }
                                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface text-muted transition-colors hover:border-crimson-alert hover:text-crimson-alert"
                                >
                                  <Trash2
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                  />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="mt-3">
                            <button
                              type="button"
                              disabled={savingServiceId === service.id}
                              onClick={() => void handleSaveService(service)}
                              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
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
                      ) : null}
                    </section>
                  );
                })}

                {/* Accordion Galeri & Reels */}
                <section
                  aria-label="Pengelola Galeri"
                  className="overflow-hidden rounded-2xl border border-hairline bg-surface"
                >
                  <button
                    type="button"
                    aria-expanded={openCatalogSection === "gallery"}
                    onClick={() =>
                      setOpenCatalogSection((prev) =>
                        prev === "gallery" ? null : "gallery"
                      )
                    }
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-alabaster/45 sm:px-4"
                  >
                    <div className="min-w-0">
                      <p className="font-sans text-sm font-semibold text-ink">
                        Galeri Foto &amp; Instagram Reels
                      </p>
                      <p className="truncate font-sans text-xs text-muted tabular-nums">
                        {galleryPhotoCount} foto · {galleryReelsCount} reels
                      </p>
                    </div>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                        openCatalogSection === "gallery"
                          ? "rotate-180 text-terracotta"
                          : ""
                      }`}
                    />
                  </button>

                  {openCatalogSection === "gallery" ? (
                    <div className="space-y-3 border-t border-hairline p-3.5 sm:p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        {/* Form A: Instagram Reels */}
                        <form
                          onSubmit={handleAddSocialEmbed}
                          className="rounded-xl border border-hairline bg-alabaster/50 p-3.5"
                        >
                          <div className="mb-2.5 flex items-center gap-1.5">
                            <Link2
                              aria-hidden="true"
                              className="h-4 w-4 text-terracotta"
                            />
                            <h3 className="font-sans text-xs font-semibold text-ink">
                              Tambah Instagram Reels
                            </h3>
                          </div>

                          <div className="space-y-2.5">
                            <input
                              type="text"
                              placeholder="Judul reels (mis. Taper Fade)"
                              value={socialTitle}
                              onChange={(e) => setSocialTitle(e.target.value)}
                              className="min-h-[44px] w-full rounded-xl border border-hairline bg-surface px-3 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:outline-none"
                            />

                            <div>
                              <input
                                type="url"
                                required
                                placeholder="https://www.instagram.com/reel/..."
                                value={socialUrl}
                                onChange={(e) => setSocialUrl(e.target.value)}
                                className="min-h-[44px] w-full rounded-xl border border-hairline bg-surface px-3 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:outline-none"
                              />
                              {socialValidation ? (
                                <p
                                  className={`mt-1 font-sans text-xs ${
                                    socialValidation.valid
                                      ? "text-ink"
                                      : "text-crimson-alert"
                                  }`}
                                >
                                  {socialValidation.valid
                                    ? "Link Instagram Reels siap disimpan."
                                    : socialValidation.error}
                                </p>
                              ) : null}
                            </div>

                            <button
                              type="submit"
                              disabled={
                                savingSocial ||
                                (socialValidation
                                  ? !socialValidation.valid
                                  : false)
                              }
                              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-terracotta px-3 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              <Plus aria-hidden="true" className="h-4 w-4" />
                              <span>
                                {savingSocial
                                  ? "Menyimpan..."
                                  : "Simpan Reels"}
                              </span>
                            </button>
                          </div>
                        </form>

                        {/* Form B: Upload Foto WebP */}
                        <form
                          onSubmit={handleUploadCompressedPhoto}
                          className="rounded-xl border border-hairline bg-alabaster/50 p-3.5"
                        >
                          <div className="mb-2.5 flex items-center gap-1.5">
                            <ImagePlus
                              aria-hidden="true"
                              className="h-4 w-4 text-terracotta"
                            />
                            <h3 className="font-sans text-xs font-semibold text-ink">
                              Upload Foto (Otomatis WebP)
                            </h3>
                          </div>

                          <div className="space-y-2.5">
                            <input
                              type="text"
                              placeholder="Judul foto (mis. Skin Fade Mid)"
                              value={photoTitle}
                              onChange={(e) => setPhotoTitle(e.target.value)}
                              className="min-h-[44px] w-full rounded-xl border border-hairline bg-surface px-3 font-sans text-base text-ink placeholder:text-muted/60 focus:border-terracotta focus:outline-none"
                            />

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
                              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline bg-surface px-3 font-sans text-xs font-medium text-ink transition-colors hover:border-terracotta"
                            >
                              <Upload
                                aria-hidden="true"
                                className="h-4 w-4 text-terracotta"
                              />
                              <span>
                                {compressingPhoto
                                  ? "Mengompresi WebP..."
                                  : compressedPhoto
                                    ? "Ganti Foto Terpilih"
                                    : "Pilih Foto (JPG / PNG / WebP)"}
                              </span>
                            </button>

                            {compressedPhoto ? (
                              <div className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface p-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={compressedPhoto.previewUrl}
                                  alt="Preview foto terkompresi WebP"
                                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                                />
                                <div className="min-w-0 flex-1 font-sans text-xs text-muted">
                                  <p className="truncate font-semibold text-ink">
                                    {compressedPhoto.originalName}
                                  </p>
                                  <p className="tabular-nums">
                                    {compressedPhoto.width}×
                                    {compressedPhoto.height}px ·{" "}
                                    {formatBytes(compressedPhoto.blob.size)}
                                  </p>
                                </div>
                              </div>
                            ) : null}

                            <button
                              type="submit"
                              disabled={!compressedPhoto || uploadingPhoto}
                              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-terracotta px-3 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              <Upload aria-hidden="true" className="h-4 w-4" />
                              <span>
                                {uploadingPhoto
                                  ? "Mengunggah..."
                                  : "Unggah Foto"}
                              </span>
                            </button>
                          </div>
                        </form>
                      </div>

                      {/* Daftar Media Padat */}
                      <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-alabaster/35">
                        {galleryItems.length === 0 ? (
                          <p className="p-3.5 text-xs text-muted">
                            Belum ada media tersimpan di galeri.
                          </p>
                        ) : (
                          galleryItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-2.5 p-3"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                {item.media_type === "photo" ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={item.media_url}
                                    alt={item.title}
                                    loading="lazy"
                                    className="h-10 w-10 shrink-0 rounded-lg border border-hairline object-cover"
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-elevated font-sans text-[11px] font-semibold text-terracotta">
                                    Reels
                                  </div>
                                )}

                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-sans text-xs font-semibold text-ink sm:text-sm">
                                    {item.title}
                                  </p>
                                  <p className="font-sans text-[11px] text-muted">
                                    {item.media_type === "photo"
                                      ? "Foto"
                                      : "Instagram Reels"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busyGalleryId === item.id}
                                  onClick={() =>
                                    void handleToggleGalleryActive(item)
                                  }
                                  className={`inline-flex min-h-[40px] items-center rounded-xl border px-2.5 font-sans text-xs font-semibold transition-colors ${
                                    item.is_active
                                      ? "border-ink bg-ink text-surface"
                                      : "border-hairline bg-surface-elevated text-muted"
                                  }`}
                                >
                                  {item.is_active ? "Tampil" : "Sembunyi"}
                                </button>

                                <button
                                  type="button"
                                  disabled={busyGalleryId === item.id}
                                  onClick={() =>
                                    void handleDeleteGalleryItem(item)
                                  }
                                  aria-label={`Hapus ${item.title}`}
                                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-hairline bg-surface text-crimson-alert transition-colors hover:border-crimson-alert hover:bg-crimson-alert/10"
                                >
                                  <Trash2
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                  />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}

            {/* SUB-TAB C: NOTIFIKASI & QR (Ringkas + Modal Preview QR) */}
            {cmsSubTab === "notify_qr" ? (
              <div className="space-y-3">
                <PushNotificationCard onNotify={showToast} />
                <StudioQrCodeCard
                  storeName={settings.store_name}
                  onNotify={showToast}
                />
                <div className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3.5 py-2.5 text-xs text-muted">
                  <Bell
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-terracotta"
                  />
                  <span>
                    Zona waktu pengingat istirahat: Sungai Kunyit, Kalimantan
                    Barat (WIB).
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* ================================================================ */}
      {/* THUMB-ZONE BAR AKSI INSTAN (+ WALK-IN 1-TAP / 2-TAP MAX)          */}
      {/* ================================================================ */}
      {isQueueTab ? (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-hairline bg-surface/95 px-4 pt-3 pb-safe font-sans backdrop-blur-md">
          <div className="mx-auto w-full max-w-4xl space-y-2.5">
            {/* Sub-Drawer: Konfirmasi Tap ke-2 Walk-in (Tanpa titik bulat) */}
            {pendingWalkin ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-terracotta bg-alabaster/90 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-sans text-sm font-medium text-ink">
                  Kunci{" "}
                  <span className="font-semibold text-terracotta">
                    Walk-in {pendingWalkin.service.name}
                  </span>{" "}
                  jam{" "}
                  <span className="font-sans font-bold tabular-nums">
                    {pendingWalkin.slot.time} – {pendingWalkin.slot.endTime}
                  </span>
                  ?
                </p>

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
                  <p className="font-sans text-[11px] font-medium opacity-90 tabular-nums">
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
                  <p className="font-sans text-[11px] opacity-90 tabular-nums">
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
                                ? "border-ink/25 bg-surface-elevated text-ink"
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

                      <p className="mt-2 font-sans text-xs font-semibold text-terracotta tabular-nums">
                        {formatTimeHHMM(selectedBooking.start_time)}–
                        {formatTimeHHMM(selectedBooking.end_time)} WIB ·{" "}
                        {selectedBooking.service_name}
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
                      className="font-sans text-xl font-semibold leading-snug text-ink"
                    >
                      {selectedBooking.customer_name}
                    </h3>

                    <dl className="mt-3 grid grid-cols-2 gap-2.5 rounded-xl border border-hairline bg-alabaster/65 p-3">
                      <div>
                        <dt className="font-sans text-xs text-muted">
                          Kode tiket
                        </dt>
                        <dd className="mt-0.5 font-sans text-sm font-bold text-terracotta tabular-nums">
                          {selectedBooking.ticket_code}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-sans text-xs text-muted">
                          Durasi kursi
                        </dt>
                        <dd className="mt-0.5 font-sans text-sm font-semibold text-ink tabular-nums">
                          {durationMin} menit
                        </dd>
                      </div>
                      <div>
                        <dt className="font-sans text-xs text-muted">
                          Tanggal
                        </dt>
                        <dd className="mt-0.5 font-sans text-sm font-medium text-ink tabular-nums">
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

                  {/* Aksi Booking (BOOKED: Tandai Selesai, Geser Jadwal, Batalkan) */}
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
                                  className="flex min-h-[48px] items-center justify-center rounded-xl border border-hairline bg-surface font-sans text-sm font-semibold text-ink tabular-nums transition-colors hover:border-terracotta hover:bg-terracotta hover:text-surface disabled:opacity-50"
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
                          <p className="mt-1 text-sm text-ink tabular-nums">
                            Batalkan{" "}
                            <span className="font-bold">
                              {selectedBooking.ticket_code}
                            </span>{" "}
                            dan bebaskan slot jam{" "}
                            <span className="font-semibold">
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
                            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:text-sm"
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
                              <span>Batalkan</span>
                            </button>
                          </div>
                        </>
                      )
                    ) : null}

                    {/* 1-Tap Kirim Info ke WA Pelanggan bila jadwal pernah digeser/dibatalkan & punya nomor WA */}
                    {(() => {
                      const sheetPhone = bookingPhones[selectedBooking.id];
                      const waAction: "reschedule" | "cancel" | null =
                        selectedBooking.status === "CANCELLED"
                          ? "cancel"
                          : selectedBooking.rescheduled_at
                            ? "reschedule"
                            : null;
                      if (!sheetPhone || !waAction) return null;
                      return (
                        <a
                          href={buildAdminWaNotifyUrl(
                            sheetPhone,
                            selectedBooking,
                            waAction
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 sm:text-sm"
                        >
                          <MessageCircle
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                          <span>Kirim Info ke WA Pelanggan</span>
                          <ExternalLink
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        </a>
                      );
                    })()}

                    {/* Tautan Smart Ticket (Selalu tersedia untuk semua status) */}
                    <Link
                      href={`/tiket/${selectedBooking.ticket_code}`}
                      className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-elevated/70 px-4 font-sans text-xs font-semibold text-ink transition-colors hover:border-terracotta hover:text-terracotta sm:text-sm"
                    >
                      <span>Buka Smart Ticket</span>
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
