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
  Armchair,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import { normalizeWhatsappPhone } from "@/lib/security/sanitize";
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
    return `~${displayMinutes / 60} jam`;
  }
  return `~${displayMinutes} menit`;
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

  // Jendela otomatis 21 hari ke depan (dalam batas aman 14–30 hari anti booking iseng jangka panjang)
  const upcomingDates = useMemo(
    () => getTodayAndUpcomingDates(settings.timezone, 21),
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
  const [selectedVariantNote, setSelectedVariantNote] = useState<{
    serviceId: string;
    label: string;
    display: string;
  } | null>(null);
  const [isPricelistOpen, setIsPricelistOpen] = useState<boolean>(false);

  const [selectedDate, setSelectedDate] = useState<string>(
    () => initialDateStr || upcomingDates[0]?.dateStr || ""
  );
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
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

  const [dateScrollState, setDateScrollState] = useState<{
    canLeft: boolean;
    canRight: boolean;
  }>({ canLeft: false, canRight: true });

  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const formSectionRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const pricelistMenuRef = useRef<HTMLDivElement | null>(null);
  const dateStripRef = useRef<HTMLDivElement | null>(null);

  const supabase = useMemo(() => createBrowserSupabase(), []);

  // Tutup dropdown pricelist saat klik di luar atau tekan Escape
  useEffect(() => {
    if (!isPricelistOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        pricelistMenuRef.current &&
        !pricelistMenuRef.current.contains(event.target as Node)
      ) {
        setIsPricelistOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPricelistOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPricelistOpen]);

  const updateDateScrollState = useCallback(() => {
    const el = dateStripRef.current;
    if (!el) return;
    const canLeft = el.scrollLeft > 4;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setDateScrollState((prev) =>
      prev.canLeft === canLeft && prev.canRight === canRight
        ? prev
        : { canLeft, canRight }
    );
  }, []);

  useEffect(() => {
    updateDateScrollState();
    window.addEventListener("resize", updateDateScrollState);
    return () => window.removeEventListener("resize", updateDateScrollState);
  }, [updateDateScrollState, upcomingDates.length]);

  const handleSlideDates = useCallback((direction: -1 | 1) => {
    const el = dateStripRef.current;
    if (!el) return;
    const step = Math.max(220, Math.round(el.clientWidth * 0.72));
    el.scrollBy({
      left: direction * step,
      behavior: "smooth",
    });
  }, []);

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
    if (todayClosedEntry && !todayClosedEntry.close_from_time) {
      return todayClosedEntry.reason?.trim() || "Tutup seharian ini";
    }
    if (!todaySchedule || !todaySchedule.is_open) {
      return "Hari ini libur";
    }
    if (todayClosedEntry?.close_from_time) {
      return `${formatTimeHHMM(todaySchedule.open_time)} – ${
        liveStatus.closeTime ?? formatTimeHHMM(todayClosedEntry.close_from_time)
      } WIB (Tutup lebih awal)`;
    }
    return `${formatTimeHHMM(todaySchedule.open_time)} – ${formatTimeHHMM(
      todaySchedule.close_time
    )} WIB`;
  }, [
    settings.is_force_closed,
    todayClosedEntry,
    todaySchedule,
    liveStatus.closeTime,
  ]);

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
      if (matchedHoliday && !matchedHoliday.close_from_time) {
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

  // Cari tanggal buka terdekat setelah selectedDate untuk tombol pintas saat 0 slot tersedia
  const nextAvailableOpenDate = useMemo(() => {
    if (!selectedDate) return null;
    const currentIdx = upcomingDates.findIndex(
      (d) => d.dateStr === selectedDate
    );
    const startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;

    for (let i = startIdx; i < upcomingDates.length; i += 1) {
      const candidate = upcomingDates[i];
      if (!candidate) continue;
      if (isDateClosed(candidate.dateStr).closed) continue;

      if (selectedService) {
        const candidateSlots = calculateAvailableSlots({
          date: candidate.dateStr,
          service: selectedService,
          schedules,
          closedDates,
          bookings: [],
          settings,
          nowParts,
        });
        if (!candidateSlots.some((s) => s.available)) continue;
      }

      return candidate;
    }
    return null;
  }, [
    selectedDate,
    upcomingDates,
    isDateClosed,
    selectedService,
    schedules,
    closedDates,
    settings,
    nowParts,
  ]);

  // Cek apakah layanan 1 jam (Haircut) masih punya slot ketika layanan 2 jam (Hair Chemicals) 0 slot
  const haircutAlternativeSlotCount = useMemo(() => {
    if (
      !selectedDate ||
      !selectedService ||
      selectedService.slot_duration_minutes <= 60
    ) {
      return 0;
    }
    const oneHourService = activeServices.find(
      (s) => s.slot_duration_minutes <= 60
    );
    if (!oneHourService) return 0;

    return calculateAvailableSlots({
      date: selectedDate,
      service: oneHourService,
      schedules,
      closedDates,
      bookings,
      settings,
      nowParts,
    }).filter((s) => s.available).length;
  }, [
    selectedDate,
    selectedService,
    activeServices,
    schedules,
    closedDates,
    bookings,
    settings,
    nowParts,
  ]);

  const handleSelectService = (serviceId: string) => {
    if (serviceId !== selectedService?.id) {
      setSelectedServiceId(serviceId);
      setSelectedTime("");
    }
    if (selectedVariantNote && selectedVariantNote.serviceId !== serviceId) {
      setSelectedVariantNote(null);
    }
    setErrorMessage(null);
    setConfirmedResult(null);
  };

  const handleSelectPricelistItem = (
    service: Service,
    variant?: { label: string; display: string }
  ) => {
    if (service.id !== selectedService?.id) {
      setSelectedServiceId(service.id);
      setSelectedTime("");
    }
    if (variant) {
      setSelectedVariantNote({
        serviceId: service.id,
        label: variant.label,
        display: variant.display,
      });
    } else {
      setSelectedVariantNote(null);
    }
    setErrorMessage(null);
    setConfirmedResult(null);
    setIsPricelistOpen(false);
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

  const phoneValidation = useMemo(
    () => normalizeWhatsappPhone(customerPhone),
    [customerPhone]
  );

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

    const checkedPhone = normalizeWhatsappPhone(customerPhone);
    if (!checkedPhone.valid) {
      setErrorMessage(
        checkedPhone.error ??
          "Nomor WhatsApp wajib diisi dengan format valid (contoh: 081234567890)."
      );
      phoneInputRef.current?.focus();
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

    const checkedPhone = normalizeWhatsappPhone(customerPhone);
    if (!checkedPhone.valid) {
      setShowConfirmModal(false);
      setErrorMessage(
        checkedPhone.error ?? "Nomor WhatsApp tidak valid."
      );
      phoneInputRef.current?.focus();
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
          customerPhone: checkedPhone.value,
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
    setCustomerPhone("");
    setErrorMessage(null);
    void fetchBookingsForDate(selectedDate);
  };

  const availableSlotCount = slots.filter((s) => s.available).length;
  const trimmedCustomerName = customerName.trim();
  const isNameValid =
    trimmedCustomerName.length >= 2 && trimmedCustomerName.length <= 40;
  const isPhoneValid = phoneValidation.valid;

  const zeroSlotCardMeta = useMemo(() => {
    const closedInfo = isDateClosed(selectedDate);
    const isTodaySelected = selectedDate === nowParts.dateStr;
    const matchedPartialClose = closedDates.find(
      (c) => c.closed_date === selectedDate && Boolean(c.close_from_time)
    );

    if (closedInfo.closed) {
      return {
        title: isTodaySelected
          ? "Studio tutup hari ini"
          : "Studio tutup pada tanggal ini",
        description:
          closedInfo.label || "Silakan pilih jadwal pada hari buka berikutnya.",
      };
    }

    if (
      isTodaySelected &&
      (matchedPartialClose ||
        liveStatus.reason === "AFTER_CLOSE" ||
        (slots.length > 0 && slots.every((s) => s.status === "EXPIRED")))
    ) {
      return {
        title: "Jam operasional hari ini sudah selesai",
        description: matchedPartialClose?.close_from_time
          ? `Studio tutup lebih awal mulai ${formatTimeHHMM(
              matchedPartialClose.close_from_time
            )} WIB hari ini.`
          : "Seluruh slot hari ini sudah melewati batas pemesanan. Pilih jadwal berikutnya.",
      };
    }

    if (
      selectedService &&
      selectedService.slot_duration_minutes >= 120 &&
      haircutAlternativeSlotCount > 0
    ) {
      return {
        title: isTodaySelected
          ? "Slot 2 jam hari ini tidak tersisa"
          : "Slot 2 jam pada tanggal ini tidak tersisa",
        description: `Durasi 2 jam untuk ${selectedService.name} tidak mencukupi di sisa jadwal (masih tersedia ${haircutAlternativeSlotCount} slot untuk Haircut 1 jam).`,
      };
    }

    return {
      title: isTodaySelected
        ? "Jadwal hari ini sudah penuh"
        : "Jadwal pada tanggal ini sudah penuh",
      description:
        "Seluruh kursi sudah terisi. Silakan pilih hari buka berikutnya.",
    };
  }, [
    isDateClosed,
    selectedDate,
    nowParts.dateStr,
    closedDates,
    liveStatus.reason,
    slots,
    selectedService,
    haircutAlternativeSlotCount,
  ]);

  const formattedShortAddress = settings.short_address
    .replace(/^Jalan\b/i, "Jl.")
    .replace(/\bGang\b/i, "Gg.");

  const activePricelistDisplay = useMemo(() => {
    if (!selectedService) return "Pilih layanan";
    if (
      selectedVariantNote &&
      selectedVariantNote.serviceId === selectedService.id
    ) {
      if (selectedService.price_variants.length > 1) {
        return `${selectedVariantNote.label} · Rp ${selectedVariantNote.display}`;
      }
      return `${selectedService.name} · Rp ${selectedVariantNote.display}`;
    }
    return `${selectedService.name} · ${selectedService.price_display}`;
  }, [selectedService, selectedVariantNote]);

  const previewSteps = [
    {
      stepNumber: 1,
      label: "Layanan & tarif",
      done: Boolean(selectedService),
      value: selectedService
        ? `${selectedService.name} · ${selectedService.price_display}`
        : "Belum dipilih",
    },
    {
      stepNumber: 2,
      label: "Tanggal",
      done: Boolean(selectedDate),
      value: selectedDate
        ? formatIndonesianDateFull(selectedDate)
        : "Belum dipilih",
    },
    {
      stepNumber: 3,
      label: "Jam kursi",
      done: Boolean(selectedSlotObj),
      value: selectedSlotObj
        ? `${selectedSlotObj.time} – ${selectedSlotObj.endTime} WIB`
        : "Pilih jam di grid",
    },
    {
      stepNumber: 4,
      label: "Nama & WhatsApp",
      done: isNameValid && isPhoneValid,
      value:
        isNameValid && isPhoneValid
          ? `${trimmedCustomerName} · +${phoneValidation.value}`
          : isNameValid
            ? `${trimmedCustomerName} · isi nomor WA`
            : "Isi nama & nomor WA di bawah",
    },
  ] as const;

  const completedStepsCount = previewSteps.filter((step) => step.done).length;

  return (
    <div className="bg-alabaster text-ink">
      {/* =====================================================================
          FLOATING PILL DOCK 3 SEGMEN + DROPDOWN PRICELIST INTERAKTIF
      ===================================================================== */}
      <section
        id="layanan"
        aria-label="Layanan, Tarif, Jam Operasional, dan Lokasi Studio"
        className="relative z-30 mt-8 mx-4 scroll-mt-24 pb-10 sm:mx-6 sm:pb-12 lg:mx-auto lg:-mt-12 lg:max-w-5xl lg:pb-14"
      >
        <div className="relative rounded-3xl bg-[#F7F3EC] px-6 py-4 shadow-[0_20px_50px_-14px_rgba(48,56,65,0.13)] sm:px-8 sm:py-5 lg:rounded-full">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_auto_0.9fr_auto_1.45fr] md:items-center md:gap-5 lg:gap-7">
            {/* 1) Segmen Layanan & Tarif (Dropdown Interaktif) */}
            <div
              ref={pricelistMenuRef}
              className="relative min-w-0 border-b border-hairline pb-4 md:border-b-0 md:pb-0"
            >
              <button
                type="button"
                aria-expanded={isPricelistOpen}
                aria-haspopup="menu"
                onClick={() => setIsPricelistOpen((prev) => !prev)}
                className="group flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-xs font-medium text-muted">
                    Layanan &amp; tarif
                  </span>
                  <span className="mt-0.5 block truncate font-sans text-sm font-semibold text-ink tabular-nums transition-colors group-hover:text-terracotta">
                    {activePricelistDisplay}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                    isPricelistOpen
                      ? "rotate-180 text-terracotta"
                      : "text-muted group-hover:text-terracotta"
                  }`}
                />
              </button>

              {/* Kartu Dropdown Daftar Harga Lengkap */}
              {isPricelistOpen ? (
                <div
                  role="menu"
                  aria-label="Daftar harga layanan Madzhair Barber & Co"
                  className="absolute top-full left-0 z-40 mt-4 w-full min-w-[260px] rounded-2xl border border-hairline bg-[#F7F3EC] p-4 shadow-[0_24px_60px_-16px_rgba(48,56,65,0.22)] sm:w-[380px] sm:p-5"
                >
                  <div className="flex items-center justify-between border-b border-hairline pb-3">
                    <p className="font-sans text-xs font-semibold text-terracotta">
                      Daftar harga layanan
                    </p>
                    <p className="font-sans text-xs text-muted">
                      Pilih untuk sinkron ke reservasi
                    </p>
                  </div>

                  <div className="mt-3.5 space-y-4">
                    {activeServices.map((service) => {
                      const isServiceSelected =
                        selectedService?.id === service.id;
                      const isSingleBlock = service.slot_duration_minutes <= 60;
                      const variants =
                        service.price_variants.length > 0
                          ? service.price_variants
                          : [
                              {
                                label: service.name,
                                price: service.price_min,
                                display: service.price_display.replace(
                                  /^Rp\s*/i,
                                  ""
                                ),
                              },
                            ];

                      return (
                        <div key={service.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 px-2">
                            <span className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-ink">
                              {isSingleBlock ? (
                                <Scissors
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 text-terracotta"
                                />
                              ) : (
                                <Sparkles
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 text-terracotta"
                                />
                              )}
                              <span>{service.name}</span>
                            </span>
                            <span className="font-sans text-xs text-muted tabular-nums">
                              {formatServiceDuration(
                                service.display_duration_minutes
                              )}
                            </span>
                          </div>

                          <div className="space-y-1">
                            {variants.map((variant) => {
                              const isVariantActive =
                                isServiceSelected &&
                                (selectedVariantNote
                                  ? selectedVariantNote.serviceId ===
                                      service.id &&
                                    selectedVariantNote.label === variant.label
                                  : variants.length === 1);

                              return (
                                <button
                                  key={`${service.id}-${variant.label}`}
                                  type="button"
                                  role="menuitem"
                                  onClick={() =>
                                    handleSelectPricelistItem(service, variant)
                                  }
                                  className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                                    isVariantActive
                                      ? "bg-surface-elevated/85 text-ink"
                                      : "text-ink hover:bg-alabaster/80"
                                  }`}
                                >
                                  <span className="inline-flex min-w-0 items-center gap-2 font-sans text-sm font-medium">
                                    <span
                                      aria-hidden="true"
                                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                                        isVariantActive
                                          ? "bg-terracotta text-surface"
                                          : "border border-hairline bg-alabaster"
                                      }`}
                                    >
                                      {isVariantActive ? (
                                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                                      ) : null}
                                    </span>
                                    <span className="truncate">
                                      {variant.label}
                                    </span>
                                  </span>

                                  <span className="shrink-0 font-sans text-sm font-semibold whitespace-nowrap text-terracotta tabular-nums">
                                    Rp {variant.display}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <span
              aria-hidden="true"
              className="hidden h-10 w-px shrink-0 bg-hairline md:block"
            />

            {/* 2) Segmen Jam Operasional (Satu-satunya tempat menampilkan jam operasional hari ini) */}
            <div className="min-w-0 border-b border-hairline pb-4 md:border-b-0 md:pb-0">
              <p className="font-sans text-xs font-medium text-muted">
                Jam operasional
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 font-sans text-sm font-semibold whitespace-nowrap text-ink tabular-nums">
                <Clock
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-terracotta"
                />
                <span>{todayHoursLabel}</span>
              </p>
            </div>

            <span
              aria-hidden="true"
              className="hidden h-10 w-px shrink-0 bg-hairline md:block"
            />

            {/* 3) Segmen Location (Langsung membuka Google Maps) */}
            <a
              href={settings.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              title={settings.short_address}
              className="group flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-xl transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-xs font-medium text-muted">
                  Location
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 font-sans text-sm font-semibold text-ink transition-colors group-hover:text-terracotta">
                  <MapPin
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-terracotta"
                  />
                  <span className="truncate">{formattedShortAddress}</span>
                </span>
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-terracotta"
              />
            </a>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SESI MEDIA KIRI-KANAN (VIDEO EMBED + CAROUSEL FOTO DOT SLIDER)
      ===================================================================== */}
      {gallerySection}

      {/* =====================================================================
          AREA RESERVASI + LIVE BOOKING PREVIEW (VERTICAL STEPPER)
      ===================================================================== */}
      <section
        id="reservasi"
        ref={formSectionRef}
        aria-label="Reservasi Kursi Madzhair.co"
        className="scroll-mt-24 border-t border-hairline bg-surface-elevated/45 px-safe py-10 sm:py-16"
      >
        <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
          <EditorialSectionHeader
            title="Pilih Jadwal"
            description="Pilih tanggal, layanan, dan jam yang tersedia."
            action={
              <LiveStatusTag
                isOpen={liveStatus.isOpen}
                isForceClosed={settings.is_force_closed}
                reason={liveStatus.reason}
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
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-live text-surface">
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
                    <p className="mt-1 font-sans text-3xl font-bold tracking-[0.08em] text-terracotta tabular-nums sm:text-4xl">
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
                      <dd className="mt-1 font-semibold text-ink tabular-nums">
                        {formatIndonesianDateFull(
                          confirmedResult.booking.booking_date
                        )}{" "}
                        · {formatTimeHHMM(confirmedResult.booking.start_time)}{" "}
                        WIB
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
                {/* 1. Header Tanggal Lengkap + Strip Tanggal Horizontal dengan Tombol Panah < > */}
                <fieldset className="min-w-0 rounded-2xl border border-hairline bg-surface p-4 shadow-xs sm:p-5">
                  <legend className="sr-only">Pilih tanggal</legend>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-sans text-xs font-semibold text-terracotta sm:text-sm">
                      Pilih tanggal
                    </span>
                    <span className="font-sans text-xs font-semibold text-ink tabular-nums sm:text-sm">
                      {selectedDate
                        ? formatIndonesianDateFull(selectedDate)
                        : "Pilih tanggal"}
                    </span>
                  </div>

                  <div className="mt-3.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSlideDates(-1)}
                      disabled={!dateScrollState.canLeft}
                      aria-label="Geser tanggal sebelumnya"
                      className="inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-alabaster/70 text-ink transition-colors hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-35 sm:w-11"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <div
                      ref={dateStripRef}
                      onScroll={updateDateScrollState}
                      className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth py-0.5 no-scrollbar"
                    >
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
                            className={`flex min-h-[62px] min-w-[78px] shrink-0 snap-start flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors ${
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
                              {dateItem.isToday
                                ? "Hari ini"
                                : dateItem.dayNameShort}
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

                    <button
                      type="button"
                      onClick={() => handleSlideDates(1)}
                      disabled={!dateScrollState.canRight}
                      aria-label="Geser tanggal berikutnya"
                      className="inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-alabaster/70 text-ink transition-colors hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-35 sm:w-11"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </fieldset>

                {/* 2. Pilihan Layanan dengan Durasi Ringkas (~45 menit / ~2 jam) */}
                <fieldset className="min-w-0 rounded-2xl border border-hairline bg-surface p-4 shadow-xs sm:p-5">
                  <legend className="sr-only">Pilih layanan</legend>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-sans text-xs font-semibold text-terracotta sm:text-sm">
                      Pilih layanan
                    </span>
                  </div>

                  <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activeServices.map((service) => {
                      const active = selectedService?.id === service.id;
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => handleSelectService(service.id)}
                          className={`flex min-h-[78px] w-full min-w-0 flex-col justify-between gap-2 rounded-2xl border p-4 text-left transition-colors sm:p-5 ${
                            active
                              ? "border-terracotta bg-surface-elevated shadow-xs"
                              : "border-hairline bg-alabaster/55 hover:border-terracotta/70"
                          }`}
                        >
                          <div className="flex w-full min-w-0 items-baseline justify-between gap-3">
                            <span className="font-sans text-sm font-semibold leading-snug text-ink sm:text-[15px]">
                              {service.name}
                            </span>
                            <span
                              className={`shrink-0 font-sans text-xs font-semibold whitespace-nowrap tabular-nums sm:text-sm ${
                                active ? "text-terracotta" : "text-ink/80"
                              }`}
                            >
                              {service.price_display}
                            </span>
                          </div>
                          <span className="block w-full font-sans text-xs leading-relaxed text-muted tabular-nums">
                            {formatServiceDuration(
                              service.display_duration_minutes
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* 3. Grid Slot Jam Minimalis + Legenda Ikon Kursi */}
                <fieldset className="min-w-0 rounded-2xl border border-hairline bg-surface p-4 shadow-xs sm:p-5">
                  <legend className="sr-only">
                    Pilih jam · Sungai Kunyit, Kalimantan Barat (WIB)
                  </legend>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-sans text-xs font-semibold text-terracotta sm:text-sm">
                      Pilih jam · Sungai Kunyit, Kalimantan Barat (WIB)
                    </span>
                    <span className="font-sans text-xs text-muted tabular-nums">
                      {isLoadingSlots
                        ? "Menyinkronkan..."
                        : `${availableSlotCount} slot tersedia`}
                    </span>
                  </div>

                  {availableSlotCount === 0 ? (
                    <div className="mt-3.5 rounded-2xl border border-hairline bg-alabaster/65 p-5 text-center font-sans sm:p-6">
                      <Calendar className="mx-auto h-5 w-5 text-terracotta" />
                      <p className="mt-2.5 text-sm font-semibold text-ink sm:text-base">
                        {zeroSlotCardMeta.title}
                      </p>
                      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted sm:text-sm">
                        {zeroSlotCardMeta.description}
                      </p>

                      {nextAvailableOpenDate ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(nextAvailableOpenDate.dateStr);
                            setSelectedTime("");
                            setErrorMessage(null);
                          }}
                          className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-2.5 font-sans text-xs font-semibold text-surface shadow-xs transition-colors hover:bg-terracotta/90 sm:text-sm"
                        >
                          <span>
                            Pilih Jadwal Berikutnya (
                            {nextAvailableOpenDate.labelShort})
                          </span>
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <div className="mt-3.5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                        {slots.map((slot) => {
                          const isSelected =
                            selectedTime === slot.time && slot.available;
                          const isDisabled = !slot.available;

                          let subLabel = "Tersedia";
                          if (slot.status === "BOOKED") subLabel = "Terisi";
                          else if (slot.status === "BREAK") subLabel = "Istirahat";
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
                              <span className="font-sans text-sm font-semibold tabular-nums">
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
                          <Armchair
                            aria-hidden="true"
                            className="h-4 w-4 text-ink/70"
                          />
                          <span>Tersedia</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Armchair
                            aria-hidden="true"
                            className="h-4 w-4 text-crimson-alert"
                          />
                          <span>Terisi</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Armchair
                            aria-hidden="true"
                            className="h-4 w-4 text-terracotta"
                          />
                          <span>Dipilih</span>
                        </span>
                      </div>
                    </>
                  )}
                </fieldset>
              </div>

              {/* Kolom Kanan (360px Sticky Live Booking Preview — Vertical Stepper Tanpa Tombol Lokasi) */}
              <div className="min-w-0">
                <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm sm:p-6 lg:sticky lg:top-24">
                  <div className="flex items-center justify-between gap-2 pb-3.5">
                    <div>
                      <p className="font-sans text-sm font-semibold text-terracotta">
                        Live booking preview
                      </p>
                      <p className="mt-0.5 font-sans text-xs text-muted">
                        Ringkasan jadwal &amp; kontak Anda
                      </p>
                    </div>
                    <span className="rounded-full bg-surface-elevated px-2.5 py-1 font-sans text-xs font-semibold text-ink tabular-nums">
                      {completedStepsCount}/4
                    </span>
                  </div>

                  {/* Vertical Stepper: Titik Bulat Bercentang Terhubung Garis Vertikal */}
                  <ol
                    aria-label="Langkah reservasi Anda"
                    className="border-y border-hairline py-4"
                  >
                    {previewSteps.map((step, index) => {
                      const isLast = index === previewSteps.length - 1;
                      return (
                        <li
                          key={step.stepNumber}
                          className={`relative flex items-start gap-3.5 ${
                            isLast ? "" : "pb-4"
                          }`}
                        >
                          {/* Garis Vertikal Penghubung Antar-Titik */}
                          {!isLast ? (
                            <span
                              aria-hidden="true"
                              className={`absolute top-6 bottom-0 left-[11px] w-px transition-colors ${
                                step.done ? "bg-terracotta/55" : "bg-hairline"
                              }`}
                            />
                          ) : null}

                          {/* Titik Bulat Bercentang (✓) atau Nomor Langkah */}
                          <span
                            aria-hidden="true"
                            className={`relative z-10 mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-sans text-xs font-semibold tabular-nums transition-colors ${
                              step.done
                                ? "bg-terracotta text-surface shadow-xs"
                                : "border border-hairline bg-alabaster text-muted"
                            }`}
                          >
                            {step.done ? (
                              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                            ) : (
                              step.stepNumber
                            )}
                          </span>

                          {/* Detail Langkah */}
                          <div className="min-w-0 flex-1">
                            <p className="font-sans text-xs font-medium text-muted">
                              {step.label}
                            </p>
                            <p
                              className={`mt-0.5 truncate font-sans text-sm tabular-nums ${
                                step.done
                                  ? "font-semibold text-ink"
                                  : "font-normal text-muted"
                              }`}
                            >
                              {step.value}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  {/* Input Nama & Nomor WhatsApp Pelanggan (min 16px text-base anti-zoom iOS) */}
                  <div className="mt-4 space-y-3.5">
                    <div>
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
                    </div>

                    <div>
                      <label
                        htmlFor="customer-phone-input"
                        className="block font-sans text-xs font-semibold text-ink"
                      >
                        Nomor WhatsApp
                      </label>
                      <input
                        ref={phoneInputRef}
                        id="customer-phone-input"
                        name="customerPhone"
                        type="tel"
                        inputMode="tel"
                        required
                        autoComplete="tel"
                        value={customerPhone}
                        onChange={(e) => {
                          setCustomerPhone(e.target.value);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        placeholder="Contoh: 081234567890"
                        className="mt-1.5 min-h-[48px] w-full rounded-xl border border-hairline bg-alabaster/60 px-4 py-2.5 font-sans text-base text-ink tabular-nums placeholder:text-muted/60 transition-colors focus:border-terracotta focus:bg-surface focus:outline-none"
                      />
                      <p className="mt-1.5 font-sans text-xs text-muted">
                        Tanpa daftar akun · Khusus info perubahan jadwal &amp;
                        dijaga privat.
                      </p>
                    </div>
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
                      <strong className="text-ink">15 menit</strong>. Konfirmasi
                      dikirim langsung ke WhatsApp.
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
                    className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-3 font-sans text-sm font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
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
              className="mt-4 font-sans text-xl font-semibold tracking-tight text-ink"
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
                <dt className="text-muted">WhatsApp</dt>
                <dd className="text-right font-medium text-ink tabular-nums">
                  +{phoneValidation.value}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Layanan</dt>
                <dd className="text-right font-semibold text-ink tabular-nums">
                  {selectedService.name} ({selectedService.price_display})
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Tanggal</dt>
                <dd className="text-right font-medium text-ink tabular-nums">
                  {formatIndonesianDateFull(selectedDate)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Jam kursi</dt>
                <dd className="text-right font-sans font-bold text-terracotta tabular-nums">
                  {selectedSlotObj.time} – {selectedSlotObj.endTime} WIB
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleConfirmBookingAndOpenWa()}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-terracotta px-4 py-3 font-sans text-xs font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90 disabled:opacity-50 sm:text-sm"
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
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-hairline bg-alabaster/70 px-4 py-2.5 font-sans text-xs font-medium text-ink transition-colors hover:border-ink disabled:opacity-50 sm:text-sm"
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
