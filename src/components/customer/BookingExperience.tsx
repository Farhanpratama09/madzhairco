"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
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

function formatServiceDurationCompact(displayMinutes: number): string {
  if (displayMinutes >= 60 && displayMinutes % 60 === 0) {
    return `~${displayMinutes / 60}j`;
  }
  return `~${displayMinutes}m`;
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

  const formSectionRef = useRef<HTMLDivElement | null>(null);
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

  // Supabase Realtime subscription for bookings, store_settings, weekly_schedules, closed_dates
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
    if (liveStatus.reason === "BEFORE_OPEN" && liveStatus.openTime && liveStatus.closeTime) {
      return `Buka ${liveStatus.openTime}–${liveStatus.closeTime} WIB`;
    }
    if (liveStatus.openTime && liveStatus.closeTime) {
      return `${liveStatus.openTime} – ${liveStatus.closeTime} WIB`;
    }
    return liveStatus.closedReason ?? undefined;
  }, [settings.is_force_closed, liveStatus]);

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

  const handleSelectServiceFromCatalog = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setSelectedTime("");
    setErrorMessage(null);
    setConfirmedResult(null);
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSelectSlot = (slotTime: string) => {
    setSelectedTime(slotTime);
    setErrorMessage(null);
    // Subtle focus helper only on desktop; avoid aggressive keyboard pop on mobile if unwanted
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
  const isDockReady =
    !settings.is_force_closed &&
    Boolean(selectedService) &&
    Boolean(selectedDate) &&
    Boolean(selectedSlotObj) &&
    isNameValid;

  const activeStep = !selectedService
    ? 1
    : !selectedDate
      ? 2
      : !selectedSlotObj
        ? 3
        : 4;

  const completedStepsCount = [
    Boolean(selectedService),
    Boolean(selectedDate),
    Boolean(selectedSlotObj),
    isNameValid,
  ].filter(Boolean).length;

  const handleDockAction = () => {
    setErrorMessage(null);
    setConfirmedResult(null);

    if (isDockReady) {
      setShowConfirmModal(true);
      return;
    }

    formSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="bg-alabaster text-ink">
      {/* =====================================================================
          FLOATING SEGMENTED BOOKING BAR (HERO OVERLAP DOCK)
      ===================================================================== */}
      <div className="relative z-20 -mt-8 px-safe lg:-mt-12">
        <div className="mx-auto max-w-6xl rounded-2xl border border-hairline bg-surface/95 p-4 shadow-xl backdrop-blur-md sm:p-5">
          {/* Baris Atas: Tab Pilihan Cepat Layanan + Info Slot Real-Time */}
          <div className="flex flex-col gap-3 border-b border-hairline pb-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {activeServices.map((service) => {
                const isTabActive = selectedService?.id === service.id;
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => {
                      setSelectedServiceId(service.id);
                      setSelectedTime("");
                      setErrorMessage(null);
                      setConfirmedResult(null);
                    }}
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3.5 py-2 font-mono text-xs font-semibold tracking-wide transition-colors ${
                      isTabActive
                        ? "border-terracotta bg-terracotta text-surface shadow-xs"
                        : "border-hairline bg-alabaster/70 text-ink hover:border-terracotta hover:text-terracotta"
                    }`}
                  >
                    <span>{service.name}</span>
                    <span
                      className={`tabular-nums ${
                        isTabActive ? "text-surface/90" : "text-muted"
                      }`}
                    >
                      {formatServiceDurationCompact(
                        service.display_duration_minutes
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted tabular-nums">
              {settings.is_force_closed
                ? "Reservasi sedang dijeda"
                : isLoadingSlots
                  ? "Menyinkronkan jadwal..."
                  : `${availableSlotCount} slot tersedia`}
            </p>
          </div>

          {/* Segmen Input Adaptif: Mobile max 2 kolom/baris | Desktop sejajar */}
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-12 lg:items-end lg:gap-3">
            {/* Segmen 1: Layanan */}
            <div className="col-span-1 lg:col-span-2">
              <label
                htmlFor="dock-service-select"
                className="block font-mono text-[10px] tracking-[0.16em] uppercase text-muted"
              >
                Layanan
              </label>
              <select
                id="dock-service-select"
                value={selectedService?.id ?? ""}
                onChange={(e) => {
                  setSelectedServiceId(e.target.value);
                  setSelectedTime("");
                  setErrorMessage(null);
                  setConfirmedResult(null);
                }}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 py-2 text-base font-medium text-ink transition-colors focus:border-terracotta focus:bg-surface focus:outline-none"
              >
                {activeServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} (
                    {formatServiceDurationCompact(
                      service.display_duration_minutes
                    )}
                    )
                  </option>
                ))}
              </select>
            </div>

            {/* Segmen 2: Tanggal */}
            <div className="col-span-1 lg:col-span-3">
              <label
                htmlFor="dock-date-select"
                className="block font-mono text-[10px] tracking-[0.16em] uppercase text-muted"
              >
                Tanggal
              </label>
              <select
                id="dock-date-select"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedTime("");
                  setErrorMessage(null);
                  setConfirmedResult(null);
                }}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 py-2 text-base font-medium text-ink transition-colors focus:border-terracotta focus:bg-surface focus:outline-none"
              >
                {upcomingDates.map((dateItem) => {
                  const closedInfo = isDateClosed(dateItem.dateStr);
                  const datePart =
                    dateItem.labelShort.split(", ")[1] ?? dateItem.dateStr;
                  const label = dateItem.isToday
                    ? `Hari Ini (${datePart})`
                    : dateItem.labelShort;
                  return (
                    <option key={dateItem.dateStr} value={dateItem.dateStr}>
                      {closedInfo.closed ? `${label} — Tutup` : label}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Segmen 3: Jam */}
            <div className="col-span-1 lg:col-span-2">
              <label
                htmlFor="dock-time-select"
                className="block font-mono text-[10px] tracking-[0.16em] uppercase text-muted"
              >
                Jam
              </label>
              <select
                id="dock-time-select"
                value={selectedSlotObj ? selectedSlotObj.time : ""}
                onChange={(e) => {
                  handleSelectSlot(e.target.value);
                  setConfirmedResult(null);
                }}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3 py-2 font-mono text-base font-medium text-ink tabular-nums transition-colors focus:border-terracotta focus:bg-surface focus:outline-none"
              >
                <option value="">
                  {slots.length === 0 ? "Tutup" : "Pilih jam"}
                </option>
                {slots.map((slot) => (
                  <option
                    key={slot.time}
                    value={slot.time}
                    disabled={!slot.available}
                  >
                    {slot.available
                      ? `${slot.time} WIB`
                      : `${slot.time} (${
                          slot.status === "BOOKED"
                            ? "Terisi"
                            : slot.status === "EXPIRED"
                              ? "Lewat"
                              : "< 2j"
                        })`}
                  </option>
                ))}
              </select>
            </div>

            {/* Segmen 4: Input Nama (>= 16px text-base) */}
            <div className="col-span-1 lg:col-span-3">
              <label
                htmlFor="dock-name-input"
                className="block font-mono text-[10px] tracking-[0.16em] uppercase text-muted"
              >
                Nama Anda
              </label>
              <input
                id="dock-name-input"
                type="text"
                minLength={2}
                maxLength={40}
                autoComplete="name"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Nama pelanggan"
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-hairline bg-alabaster/60 px-3.5 py-2 text-base text-ink placeholder:text-muted/65 transition-colors focus:border-terracotta focus:bg-surface focus:outline-none"
              />
            </div>

            {/* Segmen 5: Tombol CTA Terracotta */}
            <div className="col-span-2 lg:col-span-2">
              <button
                type="button"
                disabled={settings.is_force_closed}
                onClick={handleDockAction}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-3 font-display text-xs font-bold tracking-wide uppercase text-surface shadow-sm transition-colors hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
              >
                <span>
                  {settings.is_force_closed
                    ? "Tutup"
                    : isDockReady
                      ? "Review Booking"
                      : "Pilih Jadwal"}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          01 // KATALOG LAYANAN SOFT-EDITORIAL ASIMETRIS
      ===================================================================== */}
      <section
        id="layanan"
        aria-labelledby="layanan-heading"
        className="px-safe py-14 sm:py-20"
      >
        <div className="mx-auto max-w-6xl space-y-10">
          <EditorialSectionHeader
            index="01"
            label="KATALOG LAYANAN"
            title="Daftar Tarif"
            accentTitle="& Durasi Kursi"
            description="Konsultasi gaya rambut dilakukan langsung di kursi sebelum sesi dimulai. Harga transparan tanpa biaya tersembunyi."
            action={
              <LiveStatusTag
                isOpen={liveStatus.isOpen}
                isForceClosed={settings.is_force_closed}
                reason={liveStatus.reason}
                scheduleNote={scheduleNote}
              />
            }
          />

          {/* Grid Asimetris 12-Kolom dengan Hairline Dividers */}
          <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm lg:grid-cols-12">
            {activeServices.map((service, index) => {
              const isPrimary = index === 0;
              const blockCount = Math.max(
                1,
                Math.round(service.slot_duration_minutes / 60)
              );
              const isSelected = selectedService?.id === service.id;

              return (
                <article
                  key={service.id}
                  className={`flex flex-col justify-between p-6 sm:p-8 ${
                    isPrimary
                      ? "lg:col-span-7 lg:border-r lg:border-hairline"
                      : "border-t border-hairline lg:col-span-5 lg:border-t-0"
                  }`}
                >
                  <div>
                    {/* Indeks Layanan & Tag Blok Sistem (rounded-xl) */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold tracking-[0.2em] text-terracotta tabular-nums">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="text-muted/50">/</span>
                        <span className="font-mono text-xs tracking-[0.16em] uppercase text-muted">
                          {formatServiceDuration(service.display_duration_minutes)} ·{" "}
                          {blockCount} Blok
                        </span>
                      </div>

                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-surface-elevated px-3 py-1.5 font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-ink tabular-nums">
                        {blockCount === 1 ? (
                          <Scissors className="h-3.5 w-3.5 text-terracotta" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-terracotta" />
                        )}
                        {blockCount * 60} Mnt Sistem
                      </span>
                    </div>

                    {/* Nama Layanan & Subjudul */}
                    <div className="mt-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
                      <h3 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                        {service.name}
                      </h3>
                      <p className="font-mono text-lg font-bold text-terracotta tabular-nums">
                        {service.price_display}
                      </p>
                    </div>

                    {service.subtitle ? (
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {service.subtitle}
                      </p>
                    ) : null}

                    {/* Daftar Varian Harga dengan Hairline Rows */}
                    <ul className="mt-6 divide-y divide-hairline border-y border-hairline">
                      {service.price_variants.map((variant) => (
                        <li
                          key={variant.label}
                          className="flex items-center justify-between gap-4 py-3.5"
                        >
                          <span className="text-sm font-medium text-ink sm:text-base">
                            {variant.label}
                          </span>
                          <span className="shrink-0 font-mono text-sm font-semibold text-ink tabular-nums sm:text-base">
                            Rp {variant.display}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {blockCount >= 2 ? (
                      <p className="mt-4 border-l-2 border-terracotta pl-3 text-xs leading-relaxed text-muted">
                        Layanan 2 jam otomatis mengunci 2 blok waktu berurutan agar
                        pengerjaan kimia rambut tidak terburu-buru.
                      </p>
                    ) : (
                      <p className="mt-4 border-l-2 border-hairline pl-3 text-xs leading-relaxed text-muted">
                        Sisa 15 menit dari blok 1 jam digunakan otomatis untuk sanitasi
                        peralatan &amp; jeda barber.
                      </p>
                    )}
                  </div>

                  <div className="mt-8 pt-2">
                    <button
                      type="button"
                      onClick={() => handleSelectServiceFromCatalog(service.id)}
                      className={`inline-flex min-h-[48px] w-full items-center justify-between rounded-xl border px-5 py-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase transition-colors ${
                        isSelected
                          ? "border-terracotta bg-terracotta text-surface shadow-xs"
                          : "border-hairline bg-alabaster/70 text-ink hover:border-terracotta hover:bg-terracotta hover:text-surface"
                      }`}
                    >
                      <span>
                        {isSelected ? "Dipilih untuk Reservasi" : `Pilih ${service.name}`}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* =====================================================================
          02 // ALUR BOOKING 4 LANGKAH REAL-TIME
      ===================================================================== */}
      <section
        id="reservasi"
        ref={formSectionRef}
        aria-labelledby="reservasi-heading"
        className="border-t border-hairline bg-surface-elevated/45 px-safe py-14 sm:py-20"
      >
        <div className="mx-auto max-w-6xl space-y-8">
          <EditorialSectionHeader
            index="02"
            label="RESERVASI KURSI"
            title="Booking 4 Langkah"
            accentTitle="Tanpa Antre"
            description="Pilih layanan, tanggal, dan jam bulat yang tersedia. Slot langsung terkunci permanen begitu Anda konfirmasi."
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
              className="flex items-start gap-3 rounded-2xl border border-crimson-alert/45 bg-surface p-4 text-sm text-ink shadow-xs"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-crimson-alert" />
              <div>
                <p className="font-display font-bold text-crimson-alert">
                  Toko Sedang Tutup Sementara (Mode Darurat)
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Reservasi online sementara dinonaktifkan oleh barber. Silakan cek
                  kembali beberapa saat lagi atau hubungi via WhatsApp.
                </p>
              </div>
            </div>
          ) : null}

          {/* Bar Progres 4 Langkah Soft-Editorial */}
          <ol className="grid grid-cols-2 overflow-hidden rounded-2xl border border-hairline bg-surface sm:grid-cols-4">
            {[
              { step: 1, title: "Layanan", value: selectedService?.name ?? "-" },
              {
                step: 2,
                title: "Tanggal",
                value:
                  upcomingDates.find((d) => d.dateStr === selectedDate)
                    ?.labelShort ?? selectedDate,
              },
              {
                step: 3,
                title: "Jam",
                value: selectedSlotObj
                  ? `${selectedSlotObj.time} WIB`
                  : "Pilih jam",
              },
              {
                step: 4,
                title: "Nama",
                value: trimmedCustomerName || "Isi nama",
              },
            ].map((item, idx) => {
              const isDone =
                item.step === 1
                  ? Boolean(selectedService)
                  : item.step === 2
                    ? Boolean(selectedDate)
                    : item.step === 3
                      ? Boolean(selectedSlotObj)
                      : isNameValid;
              const isCurrent = activeStep === item.step;

              return (
                <li
                  key={item.step}
                  className={`flex flex-col justify-between p-3.5 sm:p-4 ${
                    idx > 0
                      ? "border-t border-hairline sm:border-t-0 sm:border-l"
                      : ""
                  } ${isCurrent ? "bg-surface-elevated/70" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted tabular-nums">
                      0{item.step} {"//"} {item.title}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-[2px] ${
                        isDone ? "bg-terracotta" : "bg-hairline"
                      }`}
                    />
                  </div>
                  <p className="mt-2 truncate font-mono text-xs font-semibold text-ink tabular-nums">
                    {item.value}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* Kartu Konfirmasi Berhasil + Auto Redirect WhatsApp */}
          {confirmedResult ? (
            <div className="rounded-2xl border border-terracotta/50 bg-surface p-6 shadow-md sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-live text-surface">
                      <Check className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-emerald-live">
                      SLOT BERHASIL DIKUNCI ({confirmedResult.booking.status})
                    </span>
                  </div>

                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
                      Kode Tiket Resmi
                    </p>
                    <p className="mt-1 font-mono text-3xl font-bold tracking-[0.16em] text-terracotta tabular-nums sm:text-4xl">
                      {confirmedResult.booking.ticket_code}
                    </p>
                  </div>

                  <dl className="grid grid-cols-1 gap-3 border-t border-hairline pt-4 text-sm sm:grid-cols-3 sm:gap-6">
                    <div>
                      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                        Pelanggan
                      </dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {confirmedResult.booking.customer_name}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                        Layanan
                      </dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {confirmedResult.booking.service_name}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                        Jadwal
                      </dt>
                      <dd className="mt-1 font-mono font-semibold text-ink tabular-nums">
                        {formatIndonesianDateFull(
                          confirmedResult.booking.booking_date
                        )}{" "}
                        · {formatTimeHHMM(confirmedResult.booking.start_time)} WIB
                      </dd>
                    </div>
                  </dl>

                  {confirmedResult.mode === "demo" ? (
                    <p className="font-mono text-[11px] text-muted">
                      * Mode Demo Lokal aktif: tiket tersimpan di sesi browser ini.
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 sm:min-w-[280px]">
                  <p className="font-mono text-xs font-medium text-terracotta">
                    Mengalihkan otomatis ke WhatsApp...
                  </p>
                  <a
                    href={confirmedResult.waUrl}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-xl bg-terracotta px-5 py-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-surface shadow-sm transition-colors hover:bg-terracotta/90"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Konfirmasi via WhatsApp
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>

                  <Link
                    href={`/tiket/${confirmedResult.booking.ticket_code}`}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-hairline bg-alabaster/70 px-5 py-2.5 font-mono text-xs font-medium tracking-[0.14em] uppercase text-ink transition-colors hover:border-terracotta hover:text-terracotta"
                  >
                    <Ticket className="h-4 w-4" />
                    Buka Smart Ticket
                  </Link>

                  <button
                    type="button"
                    onClick={resetForNewBooking}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-transparent px-4 py-2 font-mono text-xs tracking-[0.14em] uppercase text-muted transition-colors hover:bg-surface-elevated hover:text-ink"
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
              className="grid grid-cols-1 gap-6 lg:grid-cols-12"
            >
              {/* Kolom Kiri (7 Col): Langkah 1, 2, 3 */}
              <div className="space-y-6 lg:col-span-7">
                {/* LANGKAH 1: PILIH LAYANAN */}
                <fieldset className="rounded-2xl border border-hairline bg-surface p-5 shadow-xs sm:p-6">
                  <legend className="px-1 font-mono text-xs font-semibold tracking-[0.2em] uppercase text-terracotta">
                    Langkah 01 — Pilih Layanan
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
                          onClick={() => {
                            setSelectedServiceId(service.id);
                            setSelectedTime("");
                            setErrorMessage(null);
                          }}
                          className={`flex min-h-[56px] flex-col items-start justify-between rounded-xl border p-4 text-left transition-colors ${
                            active
                              ? "border-terracotta bg-surface-elevated shadow-xs"
                              : "border-hairline bg-alabaster/55 hover:border-terracotta/70"
                          }`}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="font-display text-base font-bold text-ink">
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
                          <span className="mt-1.5 font-mono text-[11px] tracking-[0.12em] uppercase text-muted tabular-nums">
                            {formatServiceDuration(service.display_duration_minutes)} ·{" "}
                            {blocks} Blok ({blocks * 60}m)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* LANGKAH 2: HORIZONTAL DATE SCRUBBER */}
                <fieldset className="rounded-2xl border border-hairline bg-surface p-5 shadow-xs sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <legend className="px-1 font-mono text-xs font-semibold tracking-[0.2em] uppercase text-terracotta">
                      Langkah 02 — Pilih Tanggal
                    </legend>
                    <span className="font-mono text-[11px] text-muted">
                      Geser horizontal →
                    </span>
                  </div>

                  <div className="mt-3 flex gap-2.5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1">
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
                            className={`font-mono text-[10px] tracking-[0.14em] uppercase ${
                              active ? "text-surface/85" : "text-muted"
                            }`}
                          >
                            {dateItem.isToday ? "Hari Ini" : dateItem.dayNameShort}
                          </span>
                          <span className="mt-0.5 font-mono text-xs font-semibold tabular-nums">
                            {dateItem.labelShort.split(", ")[1] ?? dateItem.dateStr}
                          </span>
                          {dateClosedInfo.closed ? (
                            <span
                              className={`mt-0.5 font-mono text-[10px] uppercase ${
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

                {/* LANGKAH 3: PILIH JAM (GRID 1 JAM) */}
                <fieldset className="rounded-2xl border border-hairline bg-surface p-5 shadow-xs sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <legend className="px-1 font-mono text-xs font-semibold tracking-[0.2em] uppercase text-terracotta">
                      Langkah 03 — Pilih Jam ({settings.timezone})
                    </legend>
                    <span className="font-mono text-[11px] text-muted tabular-nums">
                      {isLoadingSlots
                        ? "Menyinkronkan slot..."
                        : `${availableSlotCount} slot tersedia`}
                    </span>
                  </div>

                  {slots.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-hairline bg-alabaster/60 p-5 text-center">
                      <Calendar className="mx-auto h-5 w-5 text-muted" />
                      <p className="mt-2 text-sm font-semibold text-ink">
                        Tidak ada slot buka pada tanggal ini.
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {isDateClosed(selectedDate).label ||
                          "Silakan pilih tanggal lain di Langkah 02."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
                        {slots.map((slot) => {
                          const isSelected =
                            selectedTime === slot.time && slot.available;
                          const isDisabled = !slot.available;

                          let subLabel = "Kosong";
                          if (slot.status === "BOOKED") subLabel = "Terisi";
                          else if (slot.status === "EXPIRED") subLabel = "Lewat";
                          else if (slot.status === "INSUFFICIENT_TIME")
                            subLabel = "< 2 Jam";

                          return (
                            <button
                              key={slot.time}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => handleSelectSlot(slot.time)}
                              title={slot.reason}
                              className={`flex min-h-[54px] flex-col items-center justify-center rounded-xl border px-2 py-2 font-mono transition-colors ${
                                isSelected
                                  ? "border-terracotta bg-terracotta text-surface shadow-sm"
                                  : isDisabled
                                    ? "cursor-not-allowed border-hairline bg-surface-elevated/55 text-muted/60"
                                    : "border-hairline bg-alabaster/55 text-ink hover:border-terracotta hover:text-terracotta"
                              }`}
                            >
                              <span className="text-sm font-semibold tabular-nums">
                                {slot.time}
                              </span>
                              <span
                                className={`mt-0.5 text-[10px] uppercase tracking-wider ${
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

                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-3 font-mono text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-[2px] border border-hairline bg-alabaster" />
                          Tersedia
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-[2px] bg-terracotta" />
                          Dipilih
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-[2px] bg-crimson-alert/60" />
                          Terisi / Lewat
                        </span>
                      </div>
                    </>
                  )}
                </fieldset>
              </div>

              {/* Kolom Kanan (5 Col): LIVE BOOKING PREVIEW STICKY PANEL */}
              <div className="lg:col-span-5">
                <div className="sticky top-20 rounded-2xl border border-hairline bg-surface p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-hairline pb-4">
                    <div>
                      <p className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-terracotta">
                        Live Booking Preview
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Langkah 04 — Ringkasan &amp; Nama Pelanggan
                      </p>
                    </div>
                    <span className="rounded-xl border border-hairline bg-surface-elevated px-2.5 py-1 font-mono text-[11px] font-semibold text-ink tabular-nums">
                      {completedStepsCount}/4
                    </span>
                  </div>

                  {/* Checklist Progres Vertikal 4 Titik Real-Time */}
                  <ol className="mt-5 space-y-0">
                    {[
                      {
                        step: 1,
                        label: "Layanan",
                        done: Boolean(selectedService),
                        value: selectedService
                          ? `${selectedService.name} · ${
                              Math.max(
                                1,
                                Math.round(
                                  selectedService.slot_duration_minutes / 60
                                )
                              ) * 60
                            }m (${formatServiceDuration(
                              selectedService.display_duration_minutes
                            )})`
                          : "Belum dipilih",
                        badge: selectedService?.price_display ?? null,
                      },
                      {
                        step: 2,
                        label: "Tanggal",
                        done: Boolean(selectedDate),
                        value: selectedDate
                          ? formatIndonesianDateFull(selectedDate)
                          : "Belum dipilih",
                        badge: null,
                      },
                      {
                        step: 3,
                        label: "Jam Kursi",
                        done: Boolean(selectedSlotObj),
                        value: selectedSlotObj
                          ? `${selectedSlotObj.time} – ${selectedSlotObj.endTime} WIB`
                          : "Belum dipilih",
                        badge: selectedSlotObj ? "Tersedia" : null,
                      },
                      {
                        step: 4,
                        label: "Nama Pelanggan",
                        done: isNameValid,
                        value: isNameValid
                          ? trimmedCustomerName
                          : trimmedCustomerName
                            ? `${trimmedCustomerName} (min. 2 huruf)`
                            : "Isi nama Anda di bawah",
                        badge: null,
                      },
                    ].map((node, index, arr) => {
                      const isLast = index === arr.length - 1;
                      const isCurrentNode = activeStep === node.step;

                      return (
                        <li key={node.step} className="flex items-stretch gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-semibold tabular-nums transition-colors ${
                                node.done
                                  ? "bg-terracotta text-surface"
                                  : isCurrentNode
                                    ? "border border-terracotta bg-surface-elevated text-terracotta"
                                    : "border border-hairline bg-alabaster text-muted"
                              }`}
                            >
                              {node.done ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                node.step
                              )}
                            </span>
                            {!isLast ? (
                              <span
                                aria-hidden="true"
                                className={`my-1 w-px flex-1 ${
                                  node.done ? "bg-terracotta/50" : "bg-hairline"
                                }`}
                              />
                            ) : null}
                          </div>

                          <div className={`min-w-0 flex-1 ${isLast ? "pb-1" : "pb-4"}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted">
                                {node.label}
                              </span>
                              {node.badge ? (
                                <span
                                  className={`font-mono text-[11px] font-semibold tabular-nums ${
                                    node.step === 3
                                      ? "text-emerald-live"
                                      : "text-terracotta"
                                  }`}
                                >
                                  {node.badge}
                                </span>
                              ) : null}
                            </div>
                            <p
                              className={`mt-0.5 truncate text-sm ${
                                node.done
                                  ? "font-semibold text-ink"
                                  : "text-muted"
                              }`}
                            >
                              {node.value}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  {/* Input Nama Pelanggan (min 16px text-base anti-zoom iOS) */}
                  <div className="mt-5 border-t border-hairline pt-5">
                    <label
                      htmlFor="customer-name-input"
                      className="block font-mono text-xs font-semibold tracking-[0.14em] uppercase text-ink"
                    >
                      Nama Anda (Tanpa No. HP / Login)
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
                      className="mt-2 min-h-[48px] w-full rounded-xl border border-hairline bg-alabaster/60 px-4 py-3 text-base text-ink placeholder:text-muted/60 transition-colors focus:border-terracotta focus:bg-surface focus:outline-none"
                    />
                    <p className="mt-1.5 font-mono text-[11px] text-muted">
                      2–40 karakter. Akan tercantum di tiket &amp; pesan WhatsApp.
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
                      className="mt-4 flex items-start gap-2.5 rounded-xl border border-crimson-alert/50 bg-crimson-alert/10 p-3.5 text-xs text-crimson-alert"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  ) : null}

                  {/* Catatan Aturan Keterlambatan */}
                  <div className="mt-5 flex items-start gap-2.5 rounded-xl border-l-2 border-terracotta bg-surface-elevated/70 p-3 text-xs leading-relaxed text-muted">
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
                    className="mt-6 inline-flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-xl bg-terracotta px-5 py-3.5 font-display text-sm font-bold tracking-wide uppercase text-surface shadow-sm transition-colors hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Mengunci Slot...
                      </>
                    ) : (
                      <>
                        Review &amp; Konfirmasi Booking
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {/* Link Arah Google Maps */}
                  <a
                    href={settings.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-alabaster/60 px-4 py-2.5 font-mono text-xs tracking-[0.12em] uppercase text-muted transition-colors hover:border-terracotta hover:text-ink"
                  >
                    <MapPin className="h-3.5 w-3.5 text-terracotta" />
                    {settings.short_address}
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
              <span className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-terracotta">
                Konfirmasi Akhir
              </span>
              <span className="font-mono text-[11px] uppercase text-muted">
                Belum Terkunci
              </span>
            </div>

            <h3
              id="prebooking-confirm-title"
              className="mt-4 font-display text-xl font-bold text-ink"
            >
              Pastikan Jadwal Sudah Sesuai
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Jika Anda memilih batal sekarang, slot tidak akan dikunci. Setelah
              konfirmasi, kursi langsung terkunci dan pesan WhatsApp otomatis
              terbuka.
            </p>

            <dl className="mt-4 space-y-2.5 border-y border-hairline py-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Nama</dt>
                <dd className="text-right font-semibold text-ink">
                  {customerName.trim()}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Layanan</dt>
                <dd className="text-right font-semibold text-ink">
                  {selectedService.name} ({selectedService.price_display})
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Tanggal</dt>
                <dd className="text-right font-mono text-xs font-medium text-ink tabular-nums sm:text-sm">
                  {formatIndonesianDateFull(selectedDate)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Jam Kursi</dt>
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
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-3 font-mono text-xs font-bold tracking-[0.12em] uppercase text-surface shadow-sm transition-colors hover:bg-terracotta/90 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Mengunci Slot...
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-4 w-4" />
                    Ya, Kunci &amp; Buka WA
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmModal(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-hairline bg-alabaster/70 px-4 py-2.5 font-mono text-xs font-medium tracking-[0.12em] uppercase text-ink transition-colors hover:border-ink disabled:opacity-50"
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
