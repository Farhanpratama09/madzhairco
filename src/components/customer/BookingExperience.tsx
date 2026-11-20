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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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
      setConfirmedResult({
        booking: createdBooking,
        waUrl,
        mode,
      });

      // Automatic redirect to WhatsApp (with brief moment so ticket code renders & saves)
      window.setTimeout(() => {
        window.location.assign(waUrl);
      }, 950);
    } catch {
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
  const activeStep = !selectedService
    ? 1
    : !selectedDate
      ? 2
      : !selectedSlotObj
        ? 3
        : 4;

  return (
    <div className="bg-obsidian">
      {/* =====================================================================
          01 // KATALOG LAYANAN EDITORIAL ASIMETRIS
      ===================================================================== */}
      <section
        id="layanan"
        aria-labelledby="layanan-heading"
        className="border-t border-hairline px-safe py-14 sm:py-20"
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
          <div className="grid grid-cols-1 border border-hairline bg-surface lg:grid-cols-12">
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
                    {/* Indeks Layanan & Badge Blok Sistem (Persegi Tajam) */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs tracking-[0.2em] text-brass tabular-nums">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="text-hairline">/</span>
                        <span className="font-mono text-xs tracking-[0.16em] uppercase text-stone">
                          {formatServiceDuration(service.display_duration_minutes)} ·{" "}
                          {blockCount} Blok
                        </span>
                      </div>

                      <span className="inline-flex items-center gap-1.5 border border-hairline bg-obsidian px-2.5 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-ivory tabular-nums">
                        {blockCount === 1 ? (
                          <Scissors className="h-3 w-3 text-brass" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-brass" />
                        )}
                        {blockCount * 60} Mnt Sistem
                      </span>
                    </div>

                    {/* Nama Layanan & Subjudul */}
                    <div className="mt-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
                      <h3 className="font-display text-2xl font-bold tracking-tight text-ivory sm:text-3xl">
                        {service.name}
                      </h3>
                      <p className="font-mono text-lg font-semibold text-brass tabular-nums">
                        {service.price_display}
                      </p>
                    </div>

                    {service.subtitle ? (
                      <p className="mt-2 text-sm leading-relaxed text-stone">
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
                          <span className="text-sm font-medium text-ivory sm:text-base">
                            {variant.label}
                          </span>
                          <span className="shrink-0 font-mono text-sm font-semibold text-ivory tabular-nums sm:text-base">
                            Rp {variant.display}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {blockCount >= 2 ? (
                      <p className="mt-4 border-l-2 border-brass pl-3 text-xs leading-relaxed text-stone">
                        Layanan 2 jam otomatis mengunci 2 blok waktu berurutan agar
                        pengerjaan kimia rambut tidak terburu-buru.
                      </p>
                    ) : (
                      <p className="mt-4 border-l-2 border-hairline pl-3 text-xs leading-relaxed text-stone">
                        Sisa 15 menit dari blok 1 jam digunakan otomatis untuk sanitasi
                        peralatan &amp; jeda barber.
                      </p>
                    )}
                  </div>

                  <div className="mt-8 pt-2">
                    <button
                      type="button"
                      onClick={() => handleSelectServiceFromCatalog(service.id)}
                      className={`inline-flex min-h-[48px] w-full items-center justify-between border px-5 py-3 font-mono text-xs font-semibold tracking-[0.16em] uppercase transition-colors ${
                        isSelected
                          ? "border-brass bg-brass text-obsidian"
                          : "border-hairline bg-obsidian text-ivory hover:border-brass hover:text-brass"
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
        className="border-t border-hairline bg-surface/40 px-safe py-14 sm:py-20"
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
                scheduleNote={scheduleNote}
                compact
              />
            }
          />

          {/* Banner Peringatan Tutup Darurat jika aktif */}
          {settings.is_force_closed ? (
            <div
              role="alert"
              className="flex items-start gap-3 border border-crimson-alert/50 bg-surface p-4 text-sm text-ivory"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-crimson-alert" />
              <div>
                <p className="font-display font-bold text-crimson-alert">
                  Toko Sedang Tutup Sementara (Mode Darurat)
                </p>
                <p className="mt-1 text-xs leading-relaxed text-stone">
                  Reservasi online sementara dinonaktifkan oleh barber. Silakan cek
                  kembali beberapa saat lagi atau hubungi via WhatsApp.
                </p>
              </div>
            </div>
          ) : null}

          {/* Bar Progres 4 Langkah Arsitektural */}
          <ol className="grid grid-cols-2 border border-hairline bg-surface sm:grid-cols-4">
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
                value: customerName.trim() || "Isi nama",
              },
            ].map((item, idx) => {
              const isDone =
                item.step === 1
                  ? Boolean(selectedService)
                  : item.step === 2
                    ? Boolean(selectedDate)
                    : item.step === 3
                      ? Boolean(selectedSlotObj)
                      : customerName.trim().length >= 2;
              const isCurrent = activeStep === item.step;

              return (
                <li
                  key={item.step}
                  className={`flex flex-col justify-between p-3.5 sm:p-4 ${
                    idx > 0 ? "border-t border-hairline sm:border-t-0 sm:border-l" : ""
                  } ${isCurrent ? "bg-surface-elevated" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-stone tabular-nums">
                      0{item.step} {"//"} {item.title}
                    </span>
                    <span
                      className={`h-2 w-2 ${
                        isDone ? "bg-brass" : "bg-hairline"
                      }`}
                    />
                  </div>
                  <p className="mt-2 truncate font-mono text-xs font-medium text-ivory tabular-nums">
                    {item.value}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* Kartu Konfirmasi Berhasil + Auto Redirect WhatsApp */}
          {confirmedResult ? (
            <div className="border border-brass bg-surface p-6 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center bg-emerald-live text-obsidian">
                      <Check className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-xs tracking-[0.2em] uppercase text-emerald-live">
                      SLOT BERHASIL DIKUNCI ({confirmedResult.booking.status})
                    </span>
                  </div>

                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-stone">
                      Kode Tiket Resmi
                    </p>
                    <p className="mt-1 font-mono text-3xl font-bold tracking-[0.16em] text-brass tabular-nums sm:text-4xl">
                      {confirmedResult.booking.ticket_code}
                    </p>
                  </div>

                  <dl className="grid grid-cols-1 gap-3 border-t border-hairline pt-4 text-sm sm:grid-cols-3 sm:gap-6">
                    <div>
                      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone">
                        Pelanggan
                      </dt>
                      <dd className="mt-1 font-medium text-ivory">
                        {confirmedResult.booking.customer_name}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone">
                        Layanan
                      </dt>
                      <dd className="mt-1 font-medium text-ivory">
                        {confirmedResult.booking.service_name}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone">
                        Jadwal
                      </dt>
                      <dd className="mt-1 font-mono font-medium text-ivory tabular-nums">
                        {formatIndonesianDateFull(
                          confirmedResult.booking.booking_date
                        )}{" "}
                        · {formatTimeHHMM(confirmedResult.booking.start_time)} WIB
                      </dd>
                    </div>
                  </dl>

                  {confirmedResult.mode === "demo" ? (
                    <p className="font-mono text-[11px] text-stone">
                      * Mode Demo Lokal aktif: tiket tersimpan di sesi browser ini.
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 sm:min-w-[280px]">
                  <p className="font-mono text-xs text-brass">
                    Mengalihkan otomatis ke WhatsApp...
                  </p>
                  <a
                    href={confirmedResult.waUrl}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2.5 border border-brass bg-brass px-5 py-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-obsidian transition-colors hover:bg-brass/90"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Konfirmasi via WhatsApp
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>

                  <Link
                    href={`/tiket/${confirmedResult.booking.ticket_code}`}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 border border-hairline bg-obsidian px-5 py-2.5 font-mono text-xs tracking-[0.14em] uppercase text-ivory transition-colors hover:border-brass hover:text-brass"
                  >
                    <Ticket className="h-4 w-4" />
                    Buka Smart Ticket
                  </Link>

                  <button
                    type="button"
                    onClick={resetForNewBooking}
                    className="inline-flex min-h-[44px] items-center justify-center border border-transparent px-4 py-2 font-mono text-xs tracking-[0.14em] uppercase text-stone transition-colors hover:text-ivory"
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
                <fieldset className="border border-hairline bg-surface p-5 sm:p-6">
                  <legend className="px-1 font-mono text-xs tracking-[0.2em] uppercase text-brass">
                    Langkah 01 — Pilih Layanan
                  </legend>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                          className={`flex min-h-[56px] flex-col items-start justify-between border p-4 text-left transition-colors ${
                            active
                              ? "border-brass bg-surface-elevated"
                              : "border-hairline bg-obsidian hover:border-stone"
                          }`}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="font-display text-base font-bold text-ivory">
                              {service.name}
                            </span>
                            <span
                              className={`font-mono text-xs font-semibold tabular-nums ${
                                active ? "text-brass" : "text-stone"
                              }`}
                            >
                              {service.price_display}
                            </span>
                          </div>
                          <span className="mt-1.5 font-mono text-[11px] tracking-[0.12em] uppercase text-stone tabular-nums">
                            {formatServiceDuration(service.display_duration_minutes)} ·{" "}
                            {blocks} Blok ({blocks * 60}m)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* LANGKAH 2: PILIH TANGGAL */}
                <fieldset className="border border-hairline bg-surface p-5 sm:p-6">
                  <legend className="px-1 font-mono text-xs tracking-[0.2em] uppercase text-brass">
                    Langkah 02 — Pilih Tanggal
                  </legend>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
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
                          className={`flex min-h-[54px] flex-col items-start justify-center border px-3 py-2 text-left transition-colors ${
                            active
                              ? "border-brass bg-brass text-obsidian"
                              : dateClosedInfo.closed
                                ? "border-hairline bg-obsidian/50 text-stone opacity-70 hover:border-stone"
                                : "border-hairline bg-obsidian text-ivory hover:border-brass"
                          }`}
                        >
                          <span
                            className={`font-mono text-[10px] tracking-[0.16em] uppercase ${
                              active ? "text-obsidian/80" : "text-stone"
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
                                active ? "text-obsidian" : "text-crimson-alert"
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
                <fieldset className="border border-hairline bg-surface p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <legend className="px-1 font-mono text-xs tracking-[0.2em] uppercase text-brass">
                      Langkah 03 — Pilih Jam ({settings.timezone})
                    </legend>
                    <span className="font-mono text-[11px] text-stone tabular-nums">
                      {isLoadingSlots
                        ? "Menyinkronkan slot..."
                        : `${availableSlotCount} slot tersedia`}
                    </span>
                  </div>

                  {slots.length === 0 ? (
                    <div className="mt-4 border border-hairline bg-obsidian p-5 text-center">
                      <Calendar className="mx-auto h-5 w-5 text-stone" />
                      <p className="mt-2 text-sm font-medium text-ivory">
                        Tidak ada slot buka pada tanggal ini.
                      </p>
                      <p className="mt-1 text-xs text-stone">
                        {isDateClosed(selectedDate).label ||
                          "Silakan pilih tanggal lain di Langkah 02."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
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
                              className={`flex min-h-[54px] flex-col items-center justify-center border px-2 py-2 font-mono transition-colors ${
                                isSelected
                                  ? "border-brass bg-brass text-obsidian"
                                  : isDisabled
                                    ? "cursor-not-allowed border-hairline bg-obsidian/40 text-stone/50"
                                    : "border-hairline bg-obsidian text-ivory hover:border-brass hover:text-brass"
                              }`}
                            >
                              <span className="text-sm font-semibold tabular-nums">
                                {slot.time}
                              </span>
                              <span
                                className={`mt-0.5 text-[10px] uppercase tracking-wider ${
                                  isSelected
                                    ? "text-obsidian/80"
                                    : slot.status === "BOOKED"
                                      ? "text-crimson-alert/75"
                                      : "text-stone/75"
                                }`}
                              >
                                {isSelected ? "Dipilih" : subLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-3 font-mono text-[11px] text-stone">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 border border-hairline bg-obsidian" />
                          Tersedia
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 bg-brass" />
                          Dipilih
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 bg-crimson-alert/60" />
                          Terisi / Lewat
                        </span>
                      </div>
                    </>
                  )}
                </fieldset>
              </div>

              {/* Kolom Kanan (5 Col): Langkah 4 & Ringkasan */}
              <div className="lg:col-span-5">
                <div className="sticky top-6 border border-hairline bg-surface p-5 sm:p-6">
                  <p className="font-mono text-xs tracking-[0.2em] uppercase text-brass">
                    Langkah 04 — Nama &amp; Kunci Jadwal
                  </p>

                  {/* Ringkasan Pilihan */}
                  <dl className="mt-4 space-y-3 border-y border-hairline py-4 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-stone">Layanan</dt>
                      <dd className="text-right font-medium text-ivory">
                        {selectedService?.name ?? "-"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-stone">Tanggal</dt>
                      <dd className="text-right font-mono text-xs text-ivory tabular-nums sm:text-sm">
                        {selectedDate ? formatIndonesianDateFull(selectedDate) : "-"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-stone">Jam Kursi</dt>
                      <dd className="text-right font-mono font-semibold text-brass tabular-nums">
                        {selectedSlotObj
                          ? `${selectedSlotObj.time} – ${selectedSlotObj.endTime} WIB`
                          : "Belum dipilih"}
                      </dd>
                    </div>
                  </dl>

                  {/* Input Nama Pelanggan (min 16px text-base anti-zoom iOS) */}
                  <div className="mt-5">
                    <label
                      htmlFor="customer-name-input"
                      className="block font-mono text-xs tracking-[0.14em] uppercase text-ivory"
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
                      className="mt-2 min-h-[48px] w-full border border-hairline bg-obsidian px-4 py-3 text-base text-ivory placeholder:text-stone/60 focus:border-brass focus:outline-none"
                    />
                    <p className="mt-1.5 font-mono text-[11px] text-stone">
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
                      className="mt-4 flex items-start gap-2.5 border border-crimson-alert/60 bg-obsidian p-3.5 text-xs text-crimson-alert"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  ) : null}

                  {/* Catatan Aturan Keterlambatan */}
                  <div className="mt-5 flex items-start gap-2.5 border-l-2 border-brass bg-obsidian/70 p-3 text-xs leading-relaxed text-stone">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brass" />
                    <span>
                      Toleransi keterlambatan maksimal{" "}
                      <strong className="text-ivory">15 menit</strong> dari jam
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
                    className="mt-6 inline-flex min-h-[50px] w-full items-center justify-center gap-2.5 border border-brass bg-brass px-5 py-3.5 font-display text-sm font-bold tracking-wide uppercase text-obsidian transition-colors hover:bg-brass/90 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-elevated disabled:text-stone"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Mengunci Slot...
                      </>
                    ) : (
                      <>
                        Konfirmasi &amp; Buka WhatsApp
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {/* Link Arah Google Maps */}
                  <a
                    href={settings.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 border border-hairline bg-obsidian px-4 py-2.5 font-mono text-xs tracking-[0.12em] uppercase text-stone transition-colors hover:border-brass hover:text-ivory"
                  >
                    <MapPin className="h-3.5 w-3.5 text-brass" />
                    {settings.short_address}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

export default BookingExperience;
