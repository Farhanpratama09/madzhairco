"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  MessageCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  calculateAvailableSlots,
  formatTimeHHMM,
  getDayOfWeekFromDateStr,
} from "@/lib/slots";
import type {
  Booking,
  ClosedDate,
  PublicBookingSlot,
  Service,
  StoreSettings,
  WeeklySchedule,
} from "@/types/database";

export interface SmartTicketViewProps {
  ticketCode: string;
  isValidCodeFormat: boolean;
  isSupabaseMode: boolean;
  isAdminAuthenticated: boolean;
  initialBooking: Booking | null;
  /** Exclusively populated server-side when isAdminAuthenticated === true */
  adminContactPhone?: string | null;
  settings: StoreSettings;
  schedules: WeeklySchedule[];
  closedDates: ClosedDate[];
  services: Service[];
  dateBookings: PublicBookingSlot[];
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

function getStatusDisplay(booking: Booking) {
  if (booking.status === "BOOKED" && booking.rescheduled_at) {
    return {
      label: "Jadwal Diperbarui",
      badgeClass:
        "border-terracotta/45 bg-terracotta/12 text-terracotta",
    };
  }
  if (booking.status === "BOOKED") {
    return {
      label: "Terjadwal",
      badgeClass: "border-ink/25 bg-surface-elevated text-ink",
    };
  }
  if (booking.status === "COMPLETED") {
    return {
      label: "Sesi Selesai",
      badgeClass: "border-ink/25 bg-ink text-surface",
    };
  }
  return {
    label: "Jadwal Dibatalkan",
    badgeClass:
      "border-crimson-alert/45 bg-crimson-alert/12 text-crimson-alert",
  };
}

function buildAdminWhatsAppUpdateUrl(
  phone: string,
  booking: Booking,
  action: "reschedule" | "cancel"
): string {
  const cleanPhone = phone.replace(/\D/g, "");
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://madzhairco.vercel.app";
  const ticketUrl = `${origin}/tiket/${booking.ticket_code}`;
  const formattedDate = formatIndonesianDateFull(booking.booking_date);
  const newTimeRange = `${formatTimeHHMM(booking.start_time)} – ${formatTimeHHMM(
    booking.end_time
  )} WIB`;

  if (action === "reschedule") {
    const prevTimeRange =
      booking.previous_start_time && booking.previous_end_time
        ? `${formatTimeHHMM(booking.previous_start_time)} – ${formatTimeHHMM(
            booking.previous_end_time
          )} WIB`
        : null;
    const lines = [
      `Halo Kak ${booking.customer_name}, info pembaruan jadwal Madzhair Barber & Co (Sungai Kunyit, Kalimantan Barat):`,
      `• Kode Tiket: ${booking.ticket_code}`,
      `• Layanan: ${booking.service_name}`,
      ...(prevTimeRange ? [`• Jadwal Lama: ${prevTimeRange}`] : []),
      `• Jadwal Baru: ${formattedDate}, ${newTimeRange}`,
      "",
      "Cek e-tiket terbaru:",
      ticketUrl,
    ];
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
      lines.join("\n")
    )}`;
  }

  const lines = [
    `Halo Kak ${booking.customer_name}, mohon maaf jadwal reservasi Anda di Madzhair Barber & Co telah dibatalkan:`,
    `• Kode Tiket: ${booking.ticket_code}`,
    `• Layanan: ${booking.service_name}`,
    `• Jadwal: ${formattedDate}, ${newTimeRange}`,
    `• Pilih jadwal baru: ${origin}/#reservasi`,
    "",
    "Detail status e-tiket:",
    ticketUrl,
  ];
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    lines.join("\n")
  )}`;
}

function buildCustomerConfirmWhatsAppUrl(
  storeWhatsappNumber: string,
  booking: Booking
): string {
  const cleanPhone = (storeWhatsappNumber || "62895701807228").replace(
    /\D/g,
    ""
  );
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://madzhairco.vercel.app";
  const formattedDate = formatIndonesianDateFull(booking.booking_date);
  const formattedTime = formatTimeHHMM(booking.start_time);

  const lines = [
    "Halo Madzhair Barber & Co, saya konfirmasi booking:",
    `• Kode: ${booking.ticket_code}`,
    `• Nama: ${booking.customer_name}`,
    `• Layanan: ${booking.service_name}`,
    `• Jadwal: ${formattedDate} pukul ${formattedTime} WIB`,
    "",
    "Detail e-tiket:",
    `${origin}/tiket/${booking.ticket_code}`,
  ];

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
    lines.join("\n")
  )}`;
}

export function SmartTicketView({
  ticketCode,
  isValidCodeFormat,
  isSupabaseMode,
  isAdminAuthenticated,
  initialBooking,
  adminContactPhone = null,
  settings,
  schedules,
  closedDates,
  services,
  dateBookings,
}: SmartTicketViewProps) {
  const router = useRouter();
  const [mutatedBooking, setMutatedBooking] = useState<Booking | null>(null);
  const [demoBooking, setDemoBooking] = useState<Booking | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null>(
    isAdminAuthenticated ? adminContactPhone : null
  );
  const [lastAdminMutationAction, setLastAdminMutationAction] = useState<
    "reschedule" | "cancel" | null
  >(null);
  const [isCheckingDemoStorage, setIsCheckingDemoStorage] = useState<boolean>(
    !initialBooking && isValidCodeFormat
  );

  const booking = mutatedBooking ?? initialBooking ?? demoBooking;
  const isDemoTicket = !mutatedBooking && !initialBooking && Boolean(demoBooking);

  // Admin Quick Control states
  const [selectedNewStartTime, setSelectedNewStartTime] = useState<string>("");
  const [confirmCancelArmed, setConfirmCancelArmed] = useState<boolean>(false);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Realtime status sync for this ticket (so admin cancel/reschedule reflects live)
  const bookingId = booking?.id ?? null;
  useEffect(() => {
    if (!isSupabaseMode || !bookingId) return;
    const supabase = createBrowserSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`madzhair-ticket-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookingId}`,
        },
        (payload) => {
          const updated = payload.new as Booking | null;
          if (updated?.id === bookingId) {
            setMutatedBooking(updated);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isSupabaseMode, bookingId]);

  // Fallback check in sessionStorage for local demo mode without DB
  useEffect(() => {
    if (initialBooking || !isValidCodeFormat) {
      return;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const raw = window.sessionStorage.getItem(
          `madzhair_ticket_${ticketCode}`
        );
        if (raw) {
          const parsed = JSON.parse(raw) as Booking;
          if (parsed && parsed.ticket_code === ticketCode) {
            setDemoBooking(parsed);
          }
        }
      } catch {
        // Ignore storage access failures
      } finally {
        if (!cancelled) {
          setIsCheckingDemoStorage(false);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialBooking, isValidCodeFormat, ticketCode]);

  const matchedService = useMemo(() => {
    if (!booking) return null;
    const byId = services.find((item) => item.id === booking.service_id);
    if (byId) return byId;

    const byName = services.find(
      (item) => item.name.toLowerCase() === booking.service_name.toLowerCase()
    );
    if (byName) return byName;

    // Infer slot duration from booking start & end time
    const [sh, sm] = formatTimeHHMM(booking.start_time).split(":").map(Number);
    const [eh, em] = formatTimeHHMM(booking.end_time).split(":").map(Number);
    const diff = Math.max(60, (eh * 60 + em) - (sh * 60 + sm));
    return { slot_duration_minutes: diff };
  }, [booking, services]);

  const rescheduleSlots = useMemo(() => {
    if (!booking || !isAdminAuthenticated || !matchedService) {
      return [];
    }

    const currentStart = formatTimeHHMM(booking.start_time);

    return calculateAvailableSlots({
      date: booking.booking_date,
      service: matchedService,
      schedules,
      closedDates,
      bookings: dateBookings,
      settings,
      ignoreLeadTime: true,
      excludeBookingId: booking.id,
    }).filter((slot) => slot.time !== currentStart);
  }, [
    booking,
    isAdminAuthenticated,
    matchedService,
    schedules,
    closedDates,
    dateBookings,
    settings,
  ]);

  const handleAdminAction = async (
    payload:
      | { action: "reschedule"; newStartTime: string }
      | { action: "cancel" }
      | { action: "complete" }
  ) => {
    if (!booking) return;

    setIsMutating(true);
    setActionMessage(null);
    setActionError(null);

    try {
      const response = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        booking?: Booking;
        customerPhone?: string | null;
        error?: string;
      };

      if (!response.ok) {
        setActionError(
          result.error ?? "Gagal memperbarui booking. Pastikan sesi admin aktif."
        );
        return;
      }

      if (result.booking) {
        setMutatedBooking(result.booking);
      }
      if (isAdminAuthenticated && typeof result.customerPhone === "string") {
        setContactPhone(result.customerPhone);
      }

      setSelectedNewStartTime("");
      setConfirmCancelArmed(false);

      if (payload.action === "reschedule") {
        setLastAdminMutationAction("reschedule");
        setActionMessage(
          `Jadwal berhasil digeser ke pukul ${payload.newStartTime} WIB.`
        );
      } else if (payload.action === "cancel") {
        setLastAdminMutationAction("cancel");
        setActionMessage("Booking dibatalkan dan slot telah dibebaskan.");
      } else {
        setLastAdminMutationAction(null);
        setActionMessage("Booking ditandai selesai.");
      }

      router.refresh();
    } catch {
      setActionError("Koneksi gagal saat mengirim perubahan ke server.");
    } finally {
      setIsMutating(false);
    }
  };

  const statusMeta = booking ? getStatusDisplay(booking) : null;
  const hasRescheduleHistory = Boolean(
    booking &&
      booking.rescheduled_at &&
      booking.previous_start_time &&
      booking.previous_end_time
  );
  const adminWaUpdateAction: "reschedule" | "cancel" | null =
    isAdminAuthenticated && booking && contactPhone
      ? lastAdminMutationAction ??
        (booking.status === "CANCELLED"
          ? "cancel"
          : booking.rescheduled_at
            ? "reschedule"
            : null)
      : null;

  return (
    <div className="min-h-[100dvh] bg-alabaster text-ink">
      {/* Header Top Bar */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-alabaster/95 pt-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-safe py-3.5">
          <BrandMark variant="full" size="sm" href="/" />

          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-2 font-sans text-xs font-medium text-ink transition-colors hover:border-terracotta hover:text-terracotta sm:text-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Beranda</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-safe py-8 pb-safe sm:py-12">
        {/* Invalid Code Format */}
        {!isValidCodeFormat ? (
          <section className="rounded-2xl border border-crimson-alert/45 bg-surface p-6 shadow-sm sm:p-8">
            <p className="font-sans text-xs font-semibold text-crimson-alert">
              Kode tidak valid
            </p>
            <h1 className="mt-2 font-sans text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Format Kode Tiket Tidak Dikenali
            </h1>
            <p className="mt-2 font-sans text-sm leading-relaxed text-muted">
              Kode reservasi resmi Madzhair Barber &amp; Co menggunakan format{" "}
              <span className="font-sans font-semibold tracking-[0.04em] text-ink tabular-nums">
                MDZ-XXXX
              </span>
              . Periksa kembali tautan dari WhatsApp Anda.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 font-sans text-xs font-semibold text-surface transition-colors hover:bg-terracotta/90 sm:text-sm"
            >
              Kembali ke Halaman Utama
            </Link>
          </section>
        ) : isCheckingDemoStorage ? (
          <section className="rounded-2xl border border-hairline bg-surface p-8 text-center shadow-sm">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-terracotta" />
            <p className="mt-3 font-sans text-xs font-medium text-muted">
              Memuat tiket{" "}
              <span className="font-sans font-semibold text-ink tabular-nums">
                {ticketCode}
              </span>
              ...
            </p>
          </section>
        ) : !booking ? (
          <section className="rounded-2xl border border-hairline bg-surface p-6 shadow-sm sm:p-8">
            <p className="font-sans text-xs font-medium text-muted">
              Smart Ticket ·{" "}
              <span className="font-sans font-semibold text-ink tabular-nums">
                {ticketCode}
              </span>
            </p>
            <h1 className="mt-2 font-sans text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Tiket Tidak Ditemukan
            </h1>
            <p className="mt-2 font-sans text-sm leading-relaxed text-muted">
              {isSupabaseMode
                ? `Kami tidak menemukan reservasi dengan kode ${ticketCode}. Pastikan tautan tidak terpotong.`
                : `Mode Demo Lokal aktif: kode ${ticketCode} tidak ditemukan di penyimpanan sesi browser ini.`}
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-terracotta px-5 py-3 font-sans text-xs font-semibold text-surface transition-colors hover:bg-terracotta/90 sm:text-sm"
            >
              Buat Booking Baru
            </Link>
          </section>
        ) : (
          <div className="space-y-6">
            {/* =================================================================
                KARTU BUKTI TIKET RESMI (MODE PUBLIK — ZERO PHONE LEAK)
            ================================================================= */}
            <article className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
              {/* Header Kartu Tiket */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-7">
                <div>
                  <p className="font-sans text-xs font-semibold text-ink">
                    Smart Ticket · {settings.store_name}
                  </p>
                  <p className="mt-0.5 font-sans text-xs text-muted">
                    Sungai Kunyit, Kalimantan Barat (WIB)
                  </p>
                </div>

                {statusMeta ? (
                  <span
                    className={`inline-flex items-center rounded-lg border px-2.5 py-1 font-sans text-xs font-semibold ${statusMeta.badgeClass}`}
                  >
                    {statusMeta.label}
                  </span>
                ) : null}
              </div>

              {/* Kode Tiket Besar */}
              <div className="border-b border-hairline bg-surface-elevated/60 px-5 py-6 sm:px-7">
                <p className="font-sans text-xs font-medium text-muted">
                  Kode reservasi resmi
                </p>
                <h1 className="mt-1.5 font-sans text-4xl font-bold tracking-[0.08em] text-terracotta tabular-nums sm:text-5xl">
                  {booking.ticket_code}
                </h1>
                {isDemoTicket ? (
                  <p className="mt-2 font-sans text-xs text-muted">
                    Mode Demo Lokal — tersimpan di sesi browser Anda.
                  </p>
                ) : null}
              </div>

              {/* Deteksi Perubahan Jadwal Otomatis (Tanpa Login) */}
              {booking.status === "BOOKED" && hasRescheduleHistory ? (
                <div className="border-b border-hairline bg-terracotta/8 px-5 py-4 font-sans sm:px-7">
                  <div className="flex items-center gap-2 text-terracotta">
                    <CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <p className="text-xs font-semibold sm:text-sm">
                      Jadwal Anda telah diperbarui oleh studio
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div className="rounded-xl border border-hairline bg-surface/85 p-3">
                      <p className="text-[11px] font-medium text-muted">
                        Jadwal sebelumnya
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted line-through tabular-nums sm:text-sm">
                        {formatIndonesianDateFull(
                          booking.previous_date ?? booking.booking_date
                        )}
                      </p>
                      <p className="text-xs font-semibold text-muted line-through tabular-nums sm:text-sm">
                        {formatTimeHHMM(booking.previous_start_time!)} –{" "}
                        {formatTimeHHMM(booking.previous_end_time!)} WIB
                      </p>
                    </div>
                    <div className="rounded-xl border border-terracotta/45 bg-surface p-3">
                      <p className="text-[11px] font-semibold text-terracotta">
                        Jadwal baru aktif
                      </p>
                      <p className="mt-1 text-xs font-semibold text-ink tabular-nums sm:text-sm">
                        {formatIndonesianDateFull(booking.booking_date)}
                      </p>
                      <p className="text-xs font-bold text-terracotta tabular-nums sm:text-sm">
                        {formatTimeHHMM(booking.start_time)} –{" "}
                        {formatTimeHHMM(booking.end_time)} WIB
                      </p>
                    </div>
                  </div>
                </div>
              ) : booking.status === "CANCELLED" ? (
                <div className="border-b border-hairline bg-crimson-alert/10 px-5 py-4 font-sans sm:px-7">
                  <div className="flex items-start gap-2.5 text-crimson-alert">
                    <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="text-xs leading-relaxed sm:text-sm">
                      <p className="font-semibold">Jadwal Dibatalkan</p>
                      <p className="mt-0.5 text-ink/85">
                        Reservasi ini telah dibatalkan dan slot kursi kembali
                        dibuka. Silakan buat reservasi baru kapan saja.
                      </p>
                    </div>
                  </div>
                </div>
              ) : booking.status === "COMPLETED" ? (
                <div className="border-b border-hairline bg-surface-elevated/75 px-5 py-4 font-sans sm:px-7">
                  <div className="flex items-start gap-2.5 text-ink">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-terracotta" />
                    <div className="text-xs leading-relaxed sm:text-sm">
                      <p className="font-semibold">Sesi Selesai</p>
                      <p className="mt-0.5 text-muted">
                        Terima kasih telah berkunjung ke Madzhair Barber &amp; Co
                        Sungai Kunyit, Kalimantan Barat.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Rincian Data Booking */}
              <dl className="divide-y divide-hairline px-5 font-sans sm:px-7">
                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="text-xs font-medium text-muted">
                    Nama pelanggan
                  </dt>
                  <dd className="text-base font-semibold text-ink">
                    {booking.customer_name}
                  </dd>
                </div>

                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="text-xs font-medium text-muted">Layanan</dt>
                  <dd className="text-base font-semibold text-ink">
                    {booking.service_name}
                  </dd>
                </div>

                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="text-xs font-medium text-muted">
                    Hari &amp; tanggal
                  </dt>
                  <dd className="text-sm font-medium text-ink tabular-nums">
                    {formatIndonesianDateFull(booking.booking_date)}
                  </dd>
                </div>

                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="text-xs font-medium text-muted">Jam kursi</dt>
                  <dd className="font-sans text-base font-bold text-terracotta tabular-nums">
                    {formatTimeHHMM(booking.start_time)} –{" "}
                    {formatTimeHHMM(booking.end_time)} WIB
                  </dd>
                </div>

                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="text-xs font-medium text-muted">
                    Tipe antrean
                  </dt>
                  <dd className="text-sm font-medium text-ink">
                    {booking.source === "WALKIN"
                      ? "Walk-in Studio"
                      : "Booking Online"}
                  </dd>
                </div>
              </dl>

              {/* Aturan Keterlambatan 15 Menit & Google Maps */}
              <div className="space-y-4 border-t border-hairline p-5 font-sans sm:p-7">
                <div className="flex items-start gap-3 rounded-xl border-l-2 border-terracotta bg-surface-elevated/70 p-4">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-terracotta" />
                  <div className="text-xs leading-relaxed text-muted">
                    <p className="font-semibold text-ink">
                      Aturan keterlambatan 15 menit
                    </p>
                    <p className="mt-1">
                      Harap tiba di studio sebelum jam reservasi dimulai.
                      Toleransi keterlambatan maksimal{" "}
                      <strong className="text-ink">15 menit</strong>; lewat dari
                      batas tersebut tanpa konfirmasi, slot dapat dialihkan ke
                      pelanggan lain.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {booking.status === "BOOKED" ? (
                    <a
                      href={buildCustomerConfirmWhatsAppUrl(
                        settings.whatsapp_number,
                        booking
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-terracotta px-5 py-3 font-sans text-xs font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90 sm:text-sm"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Konfirmasi via WhatsApp</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  ) : null}

                  <a
                    href={settings.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 font-sans text-xs font-semibold transition-colors sm:text-sm ${
                      booking.status === "BOOKED"
                        ? "border border-hairline bg-alabaster/70 text-ink hover:border-terracotta hover:text-terracotta"
                        : "bg-terracotta text-surface shadow-sm hover:bg-terracotta/90"
                    }`}
                  >
                    <MapPin className="h-4 w-4" />
                    <span>Buka Google Maps ({settings.short_address})</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>

                  <Link
                    href="/"
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-hairline bg-alabaster/70 px-5 py-3 font-sans text-xs font-medium text-ink transition-colors hover:border-terracotta hover:text-terracotta sm:text-sm"
                  >
                    Booking Jadwal Lain
                  </Link>
                </div>
              </div>
            </article>

            {/* =================================================================
                MODE ADMIN TERAUTENTIKASI (HANYA RENDER JIKA SERVER VERIFIED)
            ================================================================= */}
            {isAdminAuthenticated ? (
              <section
                aria-label="Panel Kontrol Cepat Admin"
                className="rounded-2xl border border-terracotta/45 bg-surface p-5 font-sans shadow-sm sm:p-7"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-5 w-5 text-terracotta" />
                    <div>
                      <p className="text-sm font-semibold text-terracotta">
                        Panel kontrol cepat kasir
                      </p>
                      <p className="text-xs text-muted">
                        Sesi admin terverifikasi server. Perubahan langsung
                        memperbarui jadwal live.
                      </p>
                    </div>
                  </div>

                  <Link
                    href="/admin"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-hairline bg-alabaster/70 px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-terracotta hover:text-terracotta"
                  >
                    <span>Buka Dashboard</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {actionMessage ? (
                  <div
                    role="status"
                    className="mt-4 flex items-center gap-2.5 rounded-xl border border-ink/25 bg-surface-elevated/80 p-3.5 text-xs font-medium text-ink"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-terracotta" />
                    <span>{actionMessage}</span>
                  </div>
                ) : null}

                {adminWaUpdateAction && contactPhone ? (
                  <a
                    href={buildAdminWhatsAppUpdateUrl(
                      contactPhone,
                      booking,
                      adminWaUpdateAction
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-3 font-sans text-xs font-semibold text-surface shadow-xs transition-opacity hover:opacity-90 sm:text-sm"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Kirim Info ke WA Pelanggan</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : null}

                {actionError ? (
                  <div
                    role="alert"
                    className="mt-4 flex items-center gap-2.5 rounded-xl border border-crimson-alert/45 bg-crimson-alert/10 p-3.5 text-xs text-crimson-alert"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{actionError}</span>
                  </div>
                ) : null}

                {booking.status === "BOOKED" ? (
                  <div className="mt-5 space-y-6">
                    {/* Reschedule 2-Tap */}
                    <div>
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-terracotta" />
                        <h2 className="text-sm font-semibold text-ink">
                          Geser jadwal (2-Tap reschedule)
                        </h2>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Tap 1: pilih jam pengganti yang kosong hari ini. Tap 2:
                        konfirmasi geser jadwal.
                      </p>

                      {rescheduleSlots.length === 0 ? (
                        <p className="mt-3 rounded-xl border border-hairline bg-surface-elevated/60 p-3.5 text-xs text-muted">
                          Tidak ada jam lain yang tersedia di tanggal ini.
                        </p>
                      ) : (
                        <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                          {rescheduleSlots.map((slot) => {
                            const isPicked = selectedNewStartTime === slot.time;
                            return (
                              <button
                                key={slot.time}
                                type="button"
                                disabled={!slot.available || isMutating}
                                onClick={() =>
                                  setSelectedNewStartTime((prev) =>
                                    prev === slot.time ? "" : slot.time
                                  )
                                }
                                title={slot.reason}
                                className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors ${
                                  isPicked
                                    ? "border-terracotta bg-terracotta text-surface shadow-sm"
                                    : !slot.available
                                      ? "cursor-not-allowed border-hairline bg-surface-elevated/55 text-muted/50"
                                      : "border-hairline bg-alabaster/60 text-ink hover:border-terracotta hover:text-terracotta"
                                }`}
                              >
                                <span className="font-sans text-xs font-semibold tabular-nums">
                                  {slot.time}
                                </span>
                                <span
                                  className={`font-sans text-[11px] font-medium ${
                                    isPicked ? "text-surface/90" : ""
                                  }`}
                                >
                                  {slot.available
                                    ? isPicked
                                      ? "Tap 2"
                                      : "Kosong"
                                    : slot.status === "BOOKED"
                                      ? "Terisi"
                                      : slot.status === "BREAK"
                                        ? "Istirahat"
                                        : "Lewat"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {selectedNewStartTime ? (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() =>
                            void handleAdminAction({
                              action: "reschedule",
                              newStartTime: selectedNewStartTime,
                            })
                          }
                          className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-5 py-3 text-xs font-semibold text-surface shadow-sm transition-colors hover:bg-terracotta/90 disabled:opacity-60 sm:text-sm"
                        >
                          {isMutating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          <span>
                            Konfirmasi Geser ke {selectedNewStartTime} WIB
                          </span>
                        </button>
                      ) : null}
                    </div>

                    {/* Aksi Selesai & Batalkan */}
                    <div className="grid grid-cols-1 gap-3 border-t border-hairline pt-5 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() =>
                          void handleAdminAction({ action: "complete" })
                        }
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-60 sm:text-sm"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Tandai Selesai</span>
                      </button>

                      {!confirmCancelArmed ? (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => setConfirmCancelArmed(true)}
                          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-crimson-alert/50 bg-crimson-alert/10 px-4 py-3 text-xs font-semibold text-crimson-alert transition-colors hover:bg-crimson-alert hover:text-surface disabled:opacity-60 sm:text-sm"
                        >
                          <XCircle className="h-4 w-4" />
                          <span>Batalkan Booking</span>
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() =>
                              void handleAdminAction({ action: "cancel" })
                            }
                            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-crimson-alert px-3 py-3 text-xs font-semibold text-surface transition-colors hover:bg-crimson-alert/90 disabled:opacity-60 sm:text-sm"
                          >
                            Ya, Batalkan
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setConfirmCancelArmed(false)}
                            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-hairline bg-alabaster/70 px-4 py-3 text-xs font-medium text-muted transition-colors hover:text-ink sm:text-sm"
                          >
                            Batal
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl border border-hairline bg-surface-elevated/60 p-4 text-xs text-muted">
                    Tiket ini berstatus{" "}
                    <strong className="font-semibold text-ink">
                      {statusMeta?.label ?? booking.status}
                    </strong>
                    . Tidak ada aksi perubahan jadwal lebih lanjut.
                  </p>
                )}
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

export default SmartTicketView;
