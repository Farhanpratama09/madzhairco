"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  Scissors,
  Sparkles,
  Ticket,
} from "lucide-react";
import { EditorialSectionHeader } from "@/components/ui/EditorialSectionHeader";
import { LiveStatusTag } from "@/components/ui/LiveStatusTag";
import {
  calculateAvailableSlots,
  formatTimeHHMM,
  getDayOfWeekFromDateStr,
  getStoreNowParts,
  getTodayAndUpcomingDates,
  isStoreOpenLive,
} from "@/lib/slots";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import type {
  Booking,
  ClosedDate,
  PublicBookingSlot,
  Service,
  SlotItem,
  StoreNowParts,
  StoreSettings,
  WeeklySchedule,
} from "@/types/database";

export interface BookingExperienceProps {
  initialSettings: StoreSettings;
  initialSchedules: WeeklySchedule[];
  initialClosedDates: ClosedDate[];
  initialServices: Service[];
  initialBookings: PublicBookingSlot[];
  initialDateStr: string;
  gallerySection?: ReactNode;
}

const DAY_NAMES_FULL = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

const MONTH_NAMES_FULL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

function formatIndonesianDateFull(dateStr: string): string {
  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = Number.parseInt(yStr ?? "", 10);
  const month = Number.parseInt(mStr ?? "", 10);
  const day = Number.parseInt(dStr ?? "", 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return dateStr;
  }

  const dow = getDayOfWeekFromDateStr(dateStr);
  const dayName = DAY_NAMES_FULL[dow] ?? "Hari";
  const monthName = MONTH_NAMES_FULL[month - 1] ?? "";
  return `${dayName}, ${day} ${monthName} ${year}`;
}

function formatServiceDuration(displayMinutes: number): string {
  if (displayMinutes >= 120 && displayMinutes % 60 === 0) {
    return `~${displayMinutes / 60} Jam`;
  }
  return `~${displayMinutes} Menit`;
}

function readDemoSessionBookings(): Booking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem("madzhair_demo_bookings");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Booking[]) : [];
  } catch {
    return [];
  }
}

function saveDemoSessionBooking(booking: Booking): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `madzhair_ticket_${booking.ticket_code}`,
      JSON.stringify(booking)
    );
    const existing = readDemoSessionBookings().filter(
      (b) => b.ticket_code !== booking.ticket_code
    );
    window.sessionStorage.setItem(
      "madzhair_demo_bookings",
      JSON.stringify([booking, ...existing].slice(0, 20))
    );
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

export function BookingExperience({
  initialSettings,
  initialSchedules,
  initialClosedDates,
  initialServices,
  initialBookings,
  initialDateStr,
  gallerySection,
}: BookingExperienceProps) {
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [schedules, setSchedules] = useState<WeeklySchedule[]>(initialSchedules);
  const [closedDates, setClosedDates] = useState<ClosedDate[]>(initialClosedDates);
  const [services, setServices] = useState<Service[]>(initialServices);
  const [bookings, setBookings] = useState<PublicBookingSlot[]>(initialBookings);

  const [nowParts, setNowParts] = useState<StoreNowParts>(() =>
    getStoreNowParts(initialSettings.timezone)
  );

  const upcomingDates = useMemo(
    () => getTodayAndUpcomingDates(settings.timezone, 14),
    [settings.timezone]
  );

  const activeServices = useMemo(
    () =>
      services
        .filter((item) => item.is_active)
        .sort((a, b) => a.sort_order - b.sort_order),
    [services]
  );

  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    () => activeServices[0]?.id ?? ""
  );
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const defaultService = activeServices[0];
    if (defaultService && !initialSettings.is_force_closed) {
      const initialNow = getStoreNowParts(initialSettings.timezone);
      const firstOpenDate = upcomingDates.find((item) => {
        const daySlots = calculateAvailableSlots({
          date: item.dateStr,
          service: defaultService,
          schedules: initialSchedules,
          closedDates: initialClosedDates,
          bookings: item.dateStr === initialDateStr ? initialBookings : [],
          settings: initialSettings,
          nowParts: initialNow,
        });
        return daySlots.some((s) => s.available);
      });
      if (firstOpenDate) {
        return firstOpenDate.dateStr;
      }
    }
    return initialDateStr || upcomingDates[0]?.dateStr || "";
  });
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [honeypotWebsite, setHoneypotWebsite] = useState<string>("");

  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedResult, setConfirmedResult] = useState<{
    booking: Booking;
    waUrl: string;
    mode: "supabase" | "demo";
  } | null>(null);

  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const formSectionRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const supabase = useMemo(() => createBrowserSupabase(), []);

  // Keep clock fresh every 30 seconds for live status and lead-time expiration
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowParts(getStoreNowParts(settings.timezone));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [settings.timezone]);

  const fetchBookingsForDate = useCallback(
    async (dateStr: string) => {
      if (!dateStr) return;

      if (!supabase) {
        const localDemo = readDemoSessionBookings().filter(
          (b) => b.booking_date === dateStr && b.status !== "CANCELLED"
        );
        setBookings(localDemo);
        return;
      }

      setIsLoadingSlots(true);
      try {
        const { data, error } = await supabase.rpc(
          "get_public_bookings_for_date",
          {
            p_date: dateStr,
          }
        );

        if (!error && Array.isArray(data)) {
          setBookings(data);
        }
      } finally {
        setIsLoadingSlots(false);
      }
    },
    [supabase]
  );

  // Sync bookings asynchronously when selectedDate changes
  useEffect(() => {
    let cancelled = false;

    async function syncBookings() {
      if (!selectedDate) return;

      if (!supabase) {
        await Promise.resolve();
        if (cancelled) return;
        const localDemo = readDemoSessionBookings().filter(
          (b) => b.booking_date === selectedDate && b.status !== "CANCELLED"
        );
        setBookings(localDemo);
        return;
      }

      const { data, error } = await supabase.rpc(
        "get_public_bookings_for_date",
        {
          p_date: selectedDate,
        }
      );

      if (!cancelled && !error && Array.isArray(data)) {
        setBookings(data);
      }
    }

    void syncBookings();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, supabase]);

  // Supabase Realtime subscription for bookings, store_settings, weekly_schedules, closed_dates, services
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("madzhair-customer-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          void fetchBookingsForDate(selectedDateRef.current);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_settings" },
        async () => {
          const { data } = await supabase
            .from("store_settings")
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            setSettings(data);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_schedules" },
        async () => {
          const { data } = await supabase
            .from("weekly_schedules")
            .select("*")
            .order("day_of_week", { ascending: true });
          if (data && data.length > 0) {
            setSchedules(data);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "closed_dates" },
        async () => {
          const { data } = await supabase
            .from("closed_dates")
            .select("*")
            .order("closed_date", { ascending: true });
          if (data) {
            setClosedDates(data);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services" },
        async () => {
          const { data } = await supabase
            .from("services")
            .select("*")
            .eq("is_active", true)
            .order("sort_order", { ascending: true });
          if (data && data.length > 0) {
            setServices(data);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, fetchBookingsForDate]);

  const selectedService = useMemo(
    () =>
      activeServices.find((item) => item.id === selectedServiceId) ??
      activeServices[0] ??
      null,
    [activeServices, selectedServiceId]
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

  const scheduleNote = useMemo(() => {
    if (settings.is_force_closed) {
      return "Reservasi dijeda sementara";
    }
    if (
      liveStatus.reason === "BEFORE_OPEN" &&
      liveStatus.openTime &&
      liveStatus.closeTime
    ) {
      return `Buka ${liveStatus.openTime}–${liveStatus.closeTime} WIB`;
    }
    if (liveStatus.openTime && liveStatus.closeTime) {
      return `${liveStatus.openTime} – ${liveStatus.closeTime} WIB`;
    }
    return liveStatus.closedReason ?? undefined;
  }, [settings.is_force_closed, liveStatus]);

  const todaySchedule = useMemo(
    () => schedules.find((s) => s.day_of_week === nowParts.dayOfWeek) ?? null,
    [schedules, nowParts.dayOfWeek]
  );

  const todayClosedEntry = useMemo(
    () => closedDates.find((c) => c.closed_date === nowParts.dateStr) ?? null,
    [closedDates, nowParts.dateStr]
  );

  const todayHoursLabel = useMemo(() => {
    if (settings.is_force_closed) {
      return "Tutup sementara";
    }
    if (todayClosedEntry) {
      return todayClosedEntry.reason?.trim() || "Libur khusus";
    }
    if (!todaySchedule || !todaySchedule.is_open) {
      return "Hari ini libur";
    }
    return `${formatTimeHHMM(todaySchedule.open_time)} – ${formatTimeHHMM(
      todaySchedule.close_time
    )} WIB`;
  }, [settings.is_force_closed, todayClosedEntry, todaySchedule]);

  const liveBadgeSummary = useMemo(() => {
    if (settings.is_force_closed) {
      return {
        label: "Tutup darurat",
        dotClass: "bg-crimson-alert",
        textClass: "text-crimson-alert",
      };
    }
    if (liveStatus.isOpen) {
      return {
        label: "Sedang buka",
        dotClass: "bg-emerald-live",
        textClass: "text-emerald-live",
      };
    }
    if (liveStatus.reason === "BEFORE_OPEN") {
      return {
        label: "Booking aktif",
        dotClass: "bg-terracotta",
        textClass: "text-terracotta",
      };
    }
    if (liveStatus.reason === "AFTER_CLOSE") {
      return {
        label: "Booking besok aktif",
        dotClass: "bg-terracotta",
        textClass: "text-terracotta",
      };
    }
    return {
      label: "Hari ini libur",
      dotClass: "bg-crimson-alert",
      textClass: "text-crimson-alert",
    };
  }, [settings.is_force_closed, liveStatus.isOpen, liveStatus.reason]);

  const slots: SlotItem[] = useMemo(() => {
    if (!selectedService || !selectedDate) {
      return [];
    }

    return calculateAvailableSlots({
      date: selectedDate,
      service: selectedService,
      schedules,
      closedDates,
      bookings,
      settings,
      nowParts,
    });
  }, [
    selectedService,
    selectedDate,
    schedules,
    closedDates,
    bookings,
    settings,
    nowParts,
  ]);

  const selectedSlotObj = useMemo(
    () => slots.find((slot) => slot.time === selectedTime && slot.available) ?? null,
    [slots, selectedTime]
  );

  const isDateClosed = useCallback(
    (dateStr: string): { closed: boolean; label?: string } => {
      if (settings.is_force_closed) {
        return { closed: true, label: "Tutup Darurat" };
      }
      const matchedHoliday = closedDates.find((c) => c.closed_date === dateStr);
      if (matchedHoliday) {
        return { closed: true, label: matchedHoliday.reason || "Libur" };
      }
      const dow = getDayOfWeekFromDateStr(dateStr);
      const sch = schedules.find((s) => s.day_of_week === dow);
      if (!sch || !sch.is_open) {
        return { closed: true, label: "Libur" };
      }
      return { closed: false };
    },
    [settings.is_force_closed, closedDates, schedules]
  );

  const handleSelectService = (serviceId: string) => {
    if (serviceId !== selectedService?.id) {
      setSelectedServiceId(serviceId);
      setSelectedTime("");
    }
    setErrorMessage(null);
    setConfirmedResult(null);
  };

  const handleScrollToBooking = () => {
    formSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleSelectSlot = (slotTime: string) => {
    setSelectedTime(slotTime);
    setErrorMessage(null);
  };

  const buildWhatsAppUrl = (booking: Booking): string => {
    const cleanPhone = (settings.whatsapp_number || "62895701807228").replace(
      /\D/g,
      ""
    );
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://madzhair.vercel.app";
    const formattedDate = formatIndonesianDateFull(booking.booking_date);
    const formattedTime = formatTimeHHMM(booking.start_time);

    const text = [
      "Halo Madzhair Barber & Co, saya konfirmasi booking:",
      `• Kode: ${booking.ticket_code}`,
      `• Nama: ${booking.customer_name}`,
      `• Layanan: ${booking.service_name}`,
      `• Jadwal: ${formattedDate} pukul ${formattedTime}`,
      "",
      `Detail tiket: ${origin}/tiket/${booking.ticket_code}`,
    ].join("\n");

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!selectedService) {
      setErrorMessage("Silakan pilih layanan terlebih dahulu.");
      return;
    }

    if (!selectedDate) {
      setErrorMessage("Silakan pilih tanggal reservasi.");
      return;
    }

    if (!selectedSlotObj) {
      setErrorMessage("Silakan pilih jam yang tersedia.");
      return;
    }

    const trimmedName = customerName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setErrorMessage("Nama pelanggan wajib diisi (2–40 karakter).");
      nameInputRef.current?.focus();
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmBookingAndOpenWa = async () => {
    if (!selectedService || !selectedDate || !selectedSlotObj) {
      setShowConfirmModal(false);
      return;
    }

    const trimmedName = customerName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setShowConfirmModal(false);
      setErrorMessage("Nama pelanggan wajib diisi (2–40 karakter).");
      nameInputRef.current?.focus();
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceId: selectedService.id,
          customerName: trimmedName,
          bookingDate: selectedDate,
          startTime: selectedSlotObj.time,
          website: honeypotWebsite,
        }),
      });

      const payload = (await response.json()) as {
        booking?: Booking;
        mode?: "supabase" | "demo";
        error?: string;
      };

      if (!response.ok || !payload.booking) {
        setShowConfirmModal(false);
        setErrorMessage(
          payload.error ?? "Gagal memproses booking. Silakan coba jam lain."
        );
        void fetchBookingsForDate(selectedDate);
        return;
      }

      const createdBooking = payload.booking;
      const mode = payload.mode ?? "supabase";

      saveDemoSessionBooking(createdBooking);
      void fetchBookingsForDate(selectedDate);

      const waUrl = buildWhatsAppUrl(createdBooking);
      setShowConfirmModal(false);
      setConfirmedResult({
        booking: createdBooking,
        waUrl,
        mode,
      });

      // Immediate WhatsApp redirect without artificial delay
      window.location.assign(waUrl);
    } catch {
      setShowConfirmModal(false);
      setErrorMessage(
        "Koneksi terputus saat mengunci jadwal. Silakan periksa internet Anda dan coba lagi."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForNewBooking = () => {
    setConfirmedResult(null);
    setSelectedTime("");
    setCustomerName("");
    setErrorMessage(null);
    void fetchBookingsForDate(selectedDate);
  };

  const availableSlotCount = slots.filter((s) => s.available).length;
  const trimmedCustomerName = customerName.trim();
  const isNameValid =
    trimmedCustomerName.length >= 2 && trimmedCustomerName.length <= 40;

  const completedStepsCount = [
    Boolean(selectedService),
    Boolean(selectedDate),
    Boolean(selectedSlotObj),
    isNameValid,
  ].filter(Boolean).length;

  const activeServiceBlocks = selectedService
    ? Math.max(1, Math.round(selectedService.slot_duration_minutes / 60))
    : 1;

  return (
    <div className="bg-alabaster text-ink">
      {/* =====================================================================
          FLOATING HORIZONTAL DOCK (MENINDIH BATAS BAWAH FOTO HERO)
      ===================================================================== */}
      <section
        id="layanan"
        aria-label="Layanan, Tarif, Jam Buka, dan Lokasi Studio"
        className="relative z-20 -mt-8 mx-4 scroll-mt-24 pb-8 sm:mx-6 sm:pb-10 lg:mx-auto lg:-mt-12 lg:max-w-5xl lg:pb-12"
      >
        <div className="grid grid-cols-1 gap-4 rounded-3xl bg-[#F7F3EC] p-4 shadow-[0_20px_50px_-12px_rgba(48,56,65,0.14)] sm:grid-cols-2 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-3 lg:rounded-full lg:px-5 lg:py-3">
          {/* 1) Segmen Layanan & Tarif Toggle Cepat */}
          <div className="min-w-0 sm:col-span-2 lg:shrink-0">
            <p className="mb-1.5 font-sans text-[11px] font-medium text-muted lg:pl-2">
              Layanan &amp; tarif
            </p>
            <div
              role="tablist"
              aria-label="Pilih kategori layanan"
              className="grid grid-cols-2 gap-1.5 rounded-2xl bg-alabaster/70 p-1 lg:flex lg:items-center lg:rounded-full"
            >
              {activeServices.map((service) => {
                const isTabActive = selectedService?.id === service.id;
                return (
                  <button
                    key={service.id}
                    type="button"
                    role="tab"
                    aria-selected={isTabActive}
                    onClick={() => handleSelectService(service.id)}
                    className={`flex min-h-[44px] flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left transition-colors lg:flex-row lg:items-center lg:gap-1.5 lg:rounded-full lg:px-3 lg:whitespace-nowrap ${
                      isTabActive
                        ? "bg-ink text-surface shadow-xs"
                        : "text-ink hover:text-terracotta"
                    }`}
                  >
                    <span className="font-sans text-xs font-semibold">
                      {service.name}
                    </span>
                    <span
                      className={`font-mono text-[11px] font-semibold tabular-nums ${
                        isTabActive ? "text-surface/85" : "text-terracotta"
                      }`}
                    >
                      ({service.price_display})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <span
            aria-hidden="true"
            className="hidden h-10 w-px shrink-0 bg-hairline lg:block"
          />

          {/* 2) Segmen Jam Buka Hari Ini */}
          <div className="min-w-0 rounded-2xl bg-alabaster/60 px-3.5 py-2.5 lg:shrink-0 lg:bg-transparent lg:px-1 lg:py-0">
            <p className="font-sans text-[11px] font-medium text-muted">
              Jam buka
            </p>
            <p className="mt-0.5 font-mono text-xs font-semibold whitespace-nowrap text-ink tabular-nums sm:text-[13px]">
              {todayHoursLabel}
            </p>
            <span
              className={`mt-1 inline-flex items-center gap-1.5 font-sans text-[11px] font-medium ${liveBadgeSummary.textClass}`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${liveBadgeSummary.dotClass}`}
              />
              <span>{liveBadgeSummary.label}</span>
            </span>
          </div>

          <span
            aria-hidden="true"
            className="hidden h-10 w-px shrink-0 bg-hairline lg:block"
          />

          {/* 3) Segmen Location (Klikabel ke Google Maps) */}
          <a
            href={settings.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            title={settings.short_address}
            className="group flex min-h-[44px] min-w-0 flex-col justify-center rounded-2xl bg-alabaster/60 px-3.5 py-2.5 transition-colors hover:bg-surface-elevated/80 lg:flex-1 lg:bg-transparent lg:px-1 lg:py-0 lg:hover:bg-transparent"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="font-sans text-[11px] font-medium text-muted">
                Location
              </span>
              <ArrowUpRight className="h-3 w-3 shrink-0 text-muted transition-colors group-hover:text-terracotta lg:hidden" />
            </div>
            <span className="mt-0.5 inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-ink group-hover:text-terracotta sm:text-[13px]">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-terracotta" />
              <span className="truncate">
                {settings.short_address
                  .replace(/^Jalan\b/i, "Jl.")
                  .replace(/\bGang\b/i, "Gg.")}
              </span>
            </span>
          </a>

          {/* 4) Tombol Aksi Kapsul Terracotta */}
          <div className="sm:col-span-2 lg:shrink-0">
            <button
              type="button"
              onClick={handleScrollToBooking}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-terracotta px-6 py-3 font-sans text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90 lg:w-auto"
            >
              <span>Pilih Jadwal</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
          </div>
        </div>

        {/* Rincian Varian Layanan Aktif (Ringkas di bawah Capsule Dock) */}
        {selectedService ? (
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2 font-sans text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              {activeServiceBlocks === 1 ? (
                <Scissors className="h-3.5 w-3.5 text-terracotta" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-terracotta" />
              )}
              <span>
                {selectedService.name} ·{" "}
                {formatServiceDuration(
                  selectedService.display_duration_minutes
                )}
              </span>
            </span>
            {selectedService.price_variants.map((variant) => (
              <span
                key={variant.label}
                className="inline-flex items-center gap-1"
              >
                <span>{variant.label}</span>
                <span className="font-mono font-semibold text-ink tabular-nums">
                  Rp {variant.display}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {/* =====================================================================
          SAMPLE MEDIA & VIDEO REELS (DISISIPKAN TEPAT SETELAH DOCK)
      ===================================================================== */}
      {gallerySection}

      {/* =====================================================================
          AREA RESERVASI + LIVE BOOKING PREVIEW
      ===================================================================== */}
      <section
        id="reservasi"
        ref={formSectionRef}
        aria-label="Reservasi Kursi Madzhair.co"
        className="scroll-mt-24 border-t border-hairline bg-surface-elevated/45 px-safe py-10 sm:py-16"
      >
        <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
          <EditorialSectionHeader
            label="Reservasi kursi"
            title="Pilih Jadwal"
            accentTitle="Satu Kursi"
            description="Pilih tanggal, layanan, dan jam bulat yang tersedia. Slot langsung terkunci permanen setelah Anda konfirmasi."
            action={
              <LiveStatusTag
                isOpen={liveStatus.isOpen}
                isForceClosed={settings.is_force_closed}
                reason={liveStatus.reason}
                scheduleNote={scheduleNote}
                compact
              />
            }
          />

          {/* Banner Peringatan Tutup Darurat jika aktif */}
          {settings.is_force_closed ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-crimson-alert/45 bg-surface p-4 font-sans text-sm text-ink shadow-xs"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-crimson-alert" />
              <div>
                <p className="font-semibold text-crimson-alert">
                  Toko sedang tutup sementara (mode darurat)
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Reservasi online sementara dinonaktifkan oleh barber. Silakan
                  cek kembali beberapa saat lagi atau hubungi via WhatsApp.
                </p>
              </div>
            </div>
          ) : null}

          {/* Kartu Konfirmasi Berhasil + Auto Redirect WhatsApp */}
          {confirmedResult ? (
            <div className="rounded-2xl border border-terracotta/50 bg-surface p-5 shadow-md sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-live text-surface">
                      <Check className="h-4 w-4" />
                    </span>
                    <span className="font-sans text-xs font-semibold text-emerald-live sm:text-sm">
                      Slot berhasil dikunci ({confirmedResult.booking.status})
                    </span>
                  </div>

                  <div>
                    <p className="font-sans text-xs font-medium text-muted">
                      Kode tiket resmi
                    </p>
                    <p className="mt-1 font-mono text-3xl font-bold tracking-[0.14em] text-terracotta tabular-nums sm:text-4xl">
                      {confirmedResult.booking.ticket_code}
                    </p>
                  </div>

                  <dl className="grid grid-cols-1 gap-3 border-t border-hairline pt-4 font-sans text-sm sm:grid-cols-3 sm:gap-6">
                    <div>
                      <dt className="text-xs text-muted">Pelanggan</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {confirmedResult.booking.customer_name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Layanan</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {confirmedResult.booking.service_name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Jadwal</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {formatIndonesianDateFull(
                          confirmedResult.booking.booking_date
                        )}{" "}
                        ·{" "}
                        <span className="font-mono tabular-nums">
                          {formatTimeHHMM(confirmedResult.booking.start_time)} WIB
                        </span>
                      </dd>
                    </div>
                  </dl>

                  {confirmedResult.mode === "demo" ? (
                    <p className="font-sans text-xs text-muted">
                      Mode demo lokal aktif: tiket tersimpan di sesi browser ini.
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 sm:min-w-[280px]">
                  <p className="font-sans text-xs font-medium text-terracotta">
                    Mengalihkan otomatis ke WhatsApp...
                  </p>
                  <a
                    href={confirmedResult.waUrl}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-xl bg-terracotta px-5 py-3 font-sans text-xs font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90 sm:text-sm"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Konfirmasi via WhatsApp</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>

                  <Link
                    href={`/tiket/${confirmedResult.booking.ticket_code}`}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-hairline bg-alabaster/70 px-5 py-2.5 font-sans text-xs font-medium text-ink transition-colors hover:border-terracotta hover:text-terracotta sm:text-sm"
                  >
                    <Ticket className="h-4 w-4" />
                    <span>Buka Smart Ticket</span>
                  </Link>

                  <button
                    type="button"
                    onClick={resetForNewBooking}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-transparent px-4 py-2 font-sans text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-ink sm:text-sm"
                  >
                    Buat Booking Baru
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8"
            >
              {/* Kolom Kiri (min-w-0 cegah overflow scrubber tabrak kolom kanan) */}
              <div className="min-w-0 space-y-4 sm:space-y-5">
                {/* 1. Strip Tanggal Horizontal (snap-x) */}
                <fieldset className="min-w-0 rounded-2xl border border-hairline bg-surface p-4 shadow-xs sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="font-sans text-xs font-semibold text-terracotta sm:text-sm">
                      Pilih tanggal
                    </legend>
                    <span className="font-sans text-xs text-muted">Geser →</span>
                  </div>

                  <div className="mt-3 flex gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1">
                    {upcomingDates.map((dateItem) => {
                      const active = selectedDate === dateItem.dateStr;
                      const dateClosedInfo = isDateClosed(dateItem.dateStr);

                      return (
                        <button
                          key={dateItem.dateStr}
                          type="button"
                          onClick={() => {
                            setSelectedDate(dateItem.dateStr);
                            setSelectedTime("");
                            setErrorMessage(null);
                          }}
                          className={`flex min-h-[60px] min-w-[78px] shrink-0 snap-start flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors ${
                            active
                              ? "border-terracotta bg-terracotta text-surface shadow-sm"
                              : dateClosedInfo.closed
                                ? "border-hairline bg-surface-elevated/60 text-muted opacity-75 hover:border-muted"
                                : "border-hairline bg-alabaster/55 text-ink hover:border-terracotta"
                          }`}
                        >
                          <span
                            className={`font-sans text-xs font-medium ${
                              active ? "text-surface/85" : "text-muted"
                            }`}
                          >
                            {dateItem.isToday ? "Hari ini" : dateItem.dayNameShort}
                          </span>
                          <span className="mt-0.5 font-sans text-sm font-semibold tabular-nums">
                            {dateItem.labelShort.split(", ")[1] ??
                              dateItem.dateStr}
                          </span>
                          {dateClosedInfo.closed ? (
                            <span
                              className={`mt-0.5 font-sans text-[11px] font-medium ${
                                active ? "text-surface" : "text-crimson-alert"
                              }`}
                            >
                              Tutup
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* 2. Pilihan Layanan Ringkas (Haircut / Hair Chemicals) */}
                <fieldset className="min-w-0 rounded-2xl border border-hairline bg-surface p-4 shadow-xs sm:p-5">
                  <legend className="font-sans text-xs font-semibold text-terracotta sm:text-sm">
                    Pilih layanan
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {activeServices.map((service) => {
                      const active = selectedService?.id === service.id;
                      const blocks = Math.max(
                        1,
                        Math.round(service.slot_duration_minutes / 60)
                      );
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => handleSelectService(service.id)}
                          className={`flex min-h-[52px] flex-col items-start justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                            active
                              ? "border-terracotta bg-surface-elevated shadow-xs"
                              : "border-hairline bg-alabaster/55 hover:border-terracotta/70"
                          }`}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="font-sans text-sm font-semibold text-ink sm:text-base">
                              {service.name}
                            </span>
                            <span
                              className={`font-mono text-xs font-semibold tabular-nums ${
                                active ? "text-terracotta" : "text-muted"
                              }`}
                            >
                              {service.price_display}
                            </span>
                          </div>
                          <span className="mt-1 font-sans text-xs text-muted">
                            {formatServiceDuration(
                              service.display_duration_minutes
                            )}{" "}
                            · {blocks} blok ({blocks * 60} menit)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* 3. Grid Slot Jam Minimalis */}
                <fieldset className="min-w-0 rounded-2xl border border-hairline bg-surface p-4 shadow-xs sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <legend className="font-sans text-xs font-semibold text-terracotta sm:text-sm">
                      Pilih jam ({settings.timezone})
                    </legend>
                    <span className="font-sans text-xs text-muted">
                      {isLoadingSlots
                        ? "Menyinkronkan..."
                        : `${availableSlotCount} slot tersedia`}
                    </span>
                  </div>

                  {slots.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-hairline bg-alabaster/60 p-5 text-center font-sans">
                      <Calendar className="mx-auto h-5 w-5 text-muted" />
                      <p className="mt-2 text-sm font-semibold text-ink">
                        Tidak ada slot buka pada tanggal ini.
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {isDateClosed(selectedDate).label ||
                          "Silakan pilih tanggal lain di strip atas."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                        {slots.map((slot) => {
                          const isSelected =
                            selectedTime === slot.time && slot.available;
                          const isDisabled = !slot.available;

                          let subLabel = "Tersedia";
                          if (slot.status === "BOOKED") subLabel = "Terisi";
                          else if (slot.status === "EXPIRED") subLabel = "Lewat";
                          else if (slot.status === "INSUFFICIENT_TIME")
                            subLabel = "< 2 jam";

                          return (
                            <button
                              key={slot.time}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => handleSelectSlot(slot.time)}
                              title={slot.reason}
                              className={`flex min-h-[54px] flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors ${
                                isSelected
                                  ? "border-terracotta bg-terracotta text-surface shadow-sm"
                                  : isDisabled
                                    ? "cursor-not-allowed border-hairline bg-surface-elevated/60 text-muted/60"
                                    : "border-hairline bg-alabaster/60 text-ink hover:border-terracotta hover:text-terracotta"
                              }`}
                            >
                              <span className="font-mono text-sm font-semibold tabular-nums">
                                {slot.time}
                              </span>
                              <span
                                className={`mt-0.5 font-sans text-[11px] font-medium ${
                                  isSelected
                                    ? "text-surface/90"
                                    : slot.status === "BOOKED"
                                      ? "text-crimson-alert/80"
                                      : "text-muted"
                                }`}
                              >
                                {isSelected ? "Dipilih" : subLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-3 font-sans text-xs text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full border border-hairline bg-alabaster" />
                          <span>Tersedia</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-crimson-alert/70" />
                          <span>Terisi</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-terracotta" />
                          <span>Dipilih</span>
                        </span>
                      </div>
                    </>
                  )}
                </fieldset>
              </div>

              {/* Kolom Kanan (360px Sticky Preview — Bebas Tabrakan Desktop) */}
              <div className="min-w-0">
                <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm sm:p-6 lg:sticky lg:top-24">
                  <div className="flex items-center justify-between gap-2 pb-3.5">
                    <div>
                      <p className="font-sans text-sm font-semibold text-terracotta">
                        Live booking preview
                      </p>
                      <p className="mt-0.5 font-sans text-xs text-muted">
                        Ringkasan jadwal &amp; nama Anda
                      </p>
                    </div>
                    <span className="rounded-xl border border-hairline bg-surface-elevated px-2.5 py-1 font-mono text-xs font-semibold text-ink tabular-nums">
                      {completedStepsCount}/4
                    </span>
                  </div>

                  {/* Ringkasan Live Booking Preview */}
                  <dl className="divide-y divide-hairline border-y border-hairline font-sans text-sm">
                    <div className="flex items-start justify-between gap-3 py-2.5">
                      <dt className="text-muted">Layanan</dt>
                      <dd className="text-right font-semibold text-ink">
                        {selectedService ? (
                          <span>
                            {selectedService.name}{" "}
                            <span className="font-mono text-terracotta tabular-nums">
                              ({selectedService.price_display})
                            </span>
                          </span>
                        ) : (
                          <span className="font-normal text-muted">
                            Belum dipilih
                          </span>
                        )}
                      </dd>
                    </div>

                    <div className="flex items-start justify-between gap-3 py-2.5">
                      <dt className="text-muted">Tanggal</dt>
                      <dd className="text-right font-medium text-ink">
                        {selectedDate ? (
                          formatIndonesianDateFull(selectedDate)
                        ) : (
                          <span className="font-normal text-muted">
                            Belum dipilih
                          </span>
                        )}
                      </dd>
                    </div>

                    <div className="flex items-start justify-between gap-3 py-2.5">
                      <dt className="text-muted">Jam kursi</dt>
                      <dd className="text-right">
                        {selectedSlotObj ? (
                          <span className="font-mono font-semibold text-emerald-live tabular-nums">
                            {selectedSlotObj.time} – {selectedSlotObj.endTime}{" "}
                            WIB
                          </span>
                        ) : (
                          <span className="font-sans text-muted">
                            Pilih jam di grid
                          </span>
                        )}
                      </dd>
                    </div>

                    <div className="flex items-start justify-between gap-3 py-2.5">
                      <dt className="text-muted">Nama</dt>
                      <dd className="max-w-[60%] truncate text-right font-semibold text-ink">
                        {isNameValid ? (
                          trimmedCustomerName
                        ) : (
                          <span className="font-normal text-muted">
                            {trimmedCustomerName
                              ? `${trimmedCustomerName} (min. 2)`
                              : "Isi di bawah"}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {/* Input Nama Pelanggan (min 16px text-base anti-zoom iOS) */}
                  <div className="mt-4">
                    <label
                      htmlFor="customer-name-input"
                      className="block font-sans text-xs font-semibold text-ink"
                    >
                      Nama Anda
                    </label>
                    <input
                      ref={nameInputRef}
                      id="customer-name-input"
                      name="customerName"
                      type="text"
                      required
                      minLength={2}
                      maxLength={40}
                      autoComplete="name"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Contoh: Farhan Pratama"
                      className="mt-1.5 min-h-[48px] w-full rounded-xl border border-hairline bg-alabaster/60 px-4 py-2.5 font-sans text-base text-ink placeholder:text-muted/60 transition-colors focus:border-terracotta focus:bg-surface focus:outline-none"
                    />
                    <p className="mt-1.5 font-sans text-xs text-muted">
                      2–40 karakter · Tanpa login / tanpa no. HP
                    </p>
                  </div>

                  {/* Honeypot field tersembunyi anti-bot */}
                  <div className="sr-only" aria-hidden="true">
                    <label htmlFor="booking-website-field">Website</label>
                    <input
                      id="booking-website-field"
                      name="website"
                      type="text"
                      value={honeypotWebsite}
                      onChange={(e) => setHoneypotWebsite(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>

                  {/* Pesan Error Validasi / Konflik */}
                  {errorMessage ? (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-2.5 rounded-xl border border-crimson-alert/50 bg-crimson-alert/10 p-3.5 font-sans text-xs text-crimson-alert"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  ) : null}

                  {/* Catatan Aturan Keterlambatan */}
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border-l-2 border-terracotta bg-surface-elevated/70 p-3 font-sans text-xs leading-relaxed text-muted">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-terracotta" />
                    <span>
                      Toleransi keterlambatan maksimal{" "}
                      <strong className="text-ink">15 menit</strong> dari jam
                      reservasi. Konfirmasi dikirim langsung ke WhatsApp kasir.
                    </span>
                  </div>

                  {/* Tombol Submit */}
                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      settings.is_force_closed ||
                      !selectedService ||
                      !selectedSlotObj
                    }
                    className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-5 py-3 font-sans text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Mengunci slot...</span>
                      </>
                    ) : (
                      <>
                        <span>Review &amp; Konfirmasi Booking</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {/* Link Arah Google Maps */}
                  <a
                    href={settings.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-alabaster/60 px-4 py-2.5 font-sans text-xs font-medium text-muted transition-colors hover:border-terracotta hover:text-ink"
                  >
                    <MapPin className="h-3.5 w-3.5 text-terracotta" />
                    <span>{settings.short_address}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Modal Konfirmasi Pra-Booking (Belum mengunci slot sampai user menyetujui) */}
      {showConfirmModal && selectedService && selectedSlotObj ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="prebooking-confirm-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/75 p-4 pb-safe backdrop-blur-sm sm:items-center"
        >
          <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <span className="font-sans text-xs font-semibold text-terracotta">
                Konfirmasi akhir
              </span>
              <span className="font-sans text-xs text-muted">
                Belum terkunci
              </span>
            </div>

            <h3
              id="prebooking-confirm-title"
              className="mt-4 font-serif text-2xl font-normal text-ink"
            >
              Pastikan Jadwal Sudah Sesuai
            </h3>
            <p className="mt-1.5 font-sans text-xs leading-relaxed text-muted">
              Jika Anda memilih batal sekarang, slot tidak akan dikunci. Setelah
              konfirmasi, kursi langsung terkunci dan pesan WhatsApp otomatis
              terbuka.
            </p>

            <dl className="mt-4 space-y-2.5 border-y border-hairline py-4 font-sans text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Nama</dt>
                <dd className="text-right font-semibold text-ink">
                  {customerName.trim()}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Layanan</dt>
                <dd className="text-right font-semibold text-ink">
                  {selectedService.name} (
                  <span className="font-mono tabular-nums">
                    {selectedService.price_display}
                  </span>
                  )
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Tanggal</dt>
                <dd className="text-right font-medium text-ink">
                  {formatIndonesianDateFull(selectedDate)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Jam kursi</dt>
                <dd className="text-right font-mono font-bold text-terracotta tabular-nums">
                  {selectedSlotObj.time} – {selectedSlotObj.endTime} WIB
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleConfirmBookingAndOpenWa()}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-3 font-sans text-xs font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90 disabled:opacity-50 sm:text-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Mengunci slot...</span>
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-4 w-4" />
                    <span>Ya, Kunci &amp; Buka WA</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmModal(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-hairline bg-alabaster/70 px-4 py-2.5 font-sans text-xs font-medium text-ink transition-colors hover:border-ink disabled:opacity-50 sm:text-sm"
              >
                Batal / Ubah
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BookingExperience;
