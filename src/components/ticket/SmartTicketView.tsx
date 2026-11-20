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
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
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

function getStatusDisplay(status: Booking["status"]) {
  if (status === "BOOKED") {
    return {
      label: "TERJADWAL",
      barClass: "bg-emerald-live",
      textClass: "text-emerald-live",
      borderClass: "border-emerald-live/40",
    };
  }
  if (status === "COMPLETED") {
    return {
      label: "SELESAI",
      barClass: "bg-brass",
      textClass: "text-brass",
      borderClass: "border-brass/40",
    };
  }
  return {
    label: "DIBATALKAN",
    barClass: "bg-crimson-alert",
    textClass: "text-crimson-alert",
    borderClass: "border-crimson-alert/40",
  };
}

export function SmartTicketView({
  ticketCode,
  isValidCodeFormat,
  isSupabaseMode,
  isAdminAuthenticated,
  initialBooking,
  settings,
  schedules,
  closedDates,
  services,
  dateBookings,
}: SmartTicketViewProps) {
  const router = useRouter();
  const [mutatedBooking, setMutatedBooking] = useState<Booking | null>(null);
  const [demoBooking, setDemoBooking] = useState<Booking | null>(null);
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

      setSelectedNewStartTime("");
      setConfirmCancelArmed(false);

      if (payload.action === "reschedule") {
        setActionMessage(
          `Jadwal berhasil digeser ke pukul ${payload.newStartTime} WIB.`
        );
      } else if (payload.action === "cancel") {
        setActionMessage("Booking dibatalkan dan slot telah dibebaskan.");
      } else {
        setActionMessage("Booking ditandai selesai.");
      }

      router.refresh();
    } catch {
      setActionError("Koneksi gagal saat mengirim perubahan ke server.");
    } finally {
      setIsMutating(false);
    }
  };

  const statusMeta = booking ? getStatusDisplay(booking.status) : null;

  return (
    <div className="min-h-[100dvh] bg-obsidian text-ivory">
      {/* Header Top Bar */}
      <header className="border-b border-hairline bg-obsidian pt-safe">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-safe py-3.5">
          <BrandMark variant="compact" size="sm" href="/" />

          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 border border-hairline bg-surface px-4 py-2 font-mono text-xs tracking-[0.14em] uppercase text-ivory transition-colors hover:border-brass hover:text-brass"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Beranda
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-safe py-8 pb-safe sm:py-12">
        {/* Invalid Code Format */}
        {!isValidCodeFormat ? (
          <section className="border border-crimson-alert/50 bg-surface p-6 sm:p-8">
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-crimson-alert">
              KODE TIDAK VALID
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold text-ivory">
              Format Kode Tiket Tidak Dikenali
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-stone">
              Kode reservasi resmi Madzhair.co menggunakan format{" "}
              <span className="font-mono text-ivory">MDZ-XXXX</span>. Periksa
              kembali tautan dari WhatsApp Anda.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 border border-brass bg-brass px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-obsidian"
            >
              Kembali ke Halaman Utama
            </Link>
          </section>
        ) : isCheckingDemoStorage ? (
          <section className="border border-hairline bg-surface p-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-brass" />
            <p className="mt-3 font-mono text-xs tracking-[0.16em] uppercase text-stone">
              Memuat Tiket {ticketCode}...
            </p>
          </section>
        ) : !booking ? (
          <section className="border border-hairline bg-surface p-6 sm:p-8">
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-stone">
              SMART TICKET // {ticketCode}
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold text-ivory">
              Tiket Tidak Ditemukan
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-stone">
              {isSupabaseMode
                ? `Kami tidak menemukan reservasi dengan kode ${ticketCode}. Pastikan tautan tidak terpotong.`
                : `Mode Demo Lokal aktif: kode ${ticketCode} tidak ditemukan di penyimpanan sesi browser ini.`}
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-[48px] items-center gap-2 border border-brass bg-brass px-5 py-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-obsidian transition-colors hover:bg-brass/90"
            >
              Buat Booking Baru
            </Link>
          </section>
        ) : (
          <div className="space-y-6">
            {/* =================================================================
                KARTU BUKTI TIKET RESMI (MODE PUBLIK)
            ================================================================= */}
            <article className="relative border border-hairline bg-surface">
              {/* Aksen Sudut Kuningan */}
              <span
                aria-hidden="true"
                className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-brass"
              />
              <span
                aria-hidden="true"
                className="absolute right-0 bottom-0 h-3 w-3 border-r-2 border-b-2 border-brass"
              />

              {/* Header Kartu Tiket */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-7">
                <div>
                  <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-stone">
                    SMART TICKET // {settings.store_name}
                  </p>
                  <p className="mt-0.5 text-xs text-stone">
                    {settings.brand_tagline}
                  </p>
                </div>

                {statusMeta ? (
                  <div
                    className={`inline-flex items-stretch border bg-obsidian ${statusMeta.borderClass}`}
                  >
                    <span className={`w-1 ${statusMeta.barClass}`} />
                    <span
                      className={`px-3 py-1.5 font-mono text-xs font-semibold tracking-[0.16em] uppercase ${statusMeta.textClass}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Kode Tiket Besar */}
              <div className="border-b border-hairline bg-obsidian/50 px-5 py-6 sm:px-7">
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-stone">
                  Kode Reservasi Resmi
                </p>
                <h1 className="mt-1.5 font-mono text-4xl font-bold tracking-[0.16em] text-brass tabular-nums sm:text-5xl">
                  {booking.ticket_code}
                </h1>
                {isDemoTicket ? (
                  <p className="mt-2 font-mono text-[11px] text-stone">
                    Mode Demo Lokal — tersimpan di sesi browser Anda.
                  </p>
                ) : null}
              </div>

              {/* Rincian Data Booking */}
              <dl className="divide-y divide-hairline px-5 sm:px-7">
                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="font-mono text-xs tracking-[0.14em] uppercase text-stone">
                    Nama Pelanggan
                  </dt>
                  <dd className="text-base font-semibold text-ivory">
                    {booking.customer_name}
                  </dd>
                </div>

                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="font-mono text-xs tracking-[0.14em] uppercase text-stone">
                    Layanan
                  </dt>
                  <dd className="text-base font-semibold text-ivory">
                    {booking.service_name}
                  </dd>
                </div>

                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="font-mono text-xs tracking-[0.14em] uppercase text-stone">
                    Hari &amp; Tanggal
                  </dt>
                  <dd className="font-mono text-sm font-medium text-ivory tabular-nums">
                    {formatIndonesianDateFull(booking.booking_date)}
                  </dd>
                </div>

                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="font-mono text-xs tracking-[0.14em] uppercase text-stone">
                    Jam Kursi
                  </dt>
                  <dd className="font-mono text-base font-bold text-brass tabular-nums">
                    {formatTimeHHMM(booking.start_time)} –{" "}
                    {formatTimeHHMM(booking.end_time)} WIB
                  </dd>
                </div>

                <div className="flex flex-col justify-between gap-1 py-4 sm:flex-row sm:items-center">
                  <dt className="font-mono text-xs tracking-[0.14em] uppercase text-stone">
                    Tipe Antrean
                  </dt>
                  <dd className="font-mono text-xs tracking-[0.14em] uppercase text-stone">
                    {booking.source === "WALKIN"
                      ? "Walk-in Studio"
                      : "Booking Online"}
                  </dd>
                </div>
              </dl>

              {/* Aturan Keterlambatan 15 Menit & Google Maps */}
              <div className="space-y-4 border-t border-hairline p-5 sm:p-7">
                <div className="flex items-start gap-3 border-l-2 border-brass bg-obsidian p-4">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brass" />
                  <div className="text-xs leading-relaxed text-stone">
                    <p className="font-mono font-semibold uppercase tracking-[0.14em] text-ivory">
                      Aturan Keterlambatan 15 Menit
                    </p>
                    <p className="mt-1">
                      Harap tiba di studio sebelum jam reservasi dimulai. Toleransi
                      keterlambatan maksimal{" "}
                      <strong className="text-ivory">15 menit</strong>; lewat dari
                      batas tersebut tanpa konfirmasi, slot dapat dialihkan ke
                      pelanggan lain.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <a
                    href={settings.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 border border-brass bg-brass px-5 py-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-obsidian transition-colors hover:bg-brass/90"
                  >
                    <MapPin className="h-4 w-4" />
                    Buka Google Maps ({settings.short_address})
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>

                  <Link
                    href="/"
                    className="inline-flex min-h-[48px] items-center justify-center border border-hairline bg-obsidian px-5 py-3 font-mono text-xs tracking-[0.14em] uppercase text-ivory transition-colors hover:border-brass hover:text-brass"
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
                className="border border-brass bg-surface p-5 sm:p-7"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-5 w-5 text-brass" />
                    <div>
                      <p className="font-mono text-xs font-semibold tracking-[0.18em] uppercase text-brass">
                        Panel Kontrol Cepat Kasir
                      </p>
                      <p className="text-xs text-stone">
                        Sesi admin terverifikasi server. Perubahan langsung
                        memperbarui jadwal live.
                      </p>
                    </div>
                  </div>

                  <Link
                    href="/admin"
                    className="inline-flex min-h-[44px] items-center gap-1.5 border border-hairline bg-obsidian px-3.5 py-2 font-mono text-[11px] tracking-[0.14em] uppercase text-ivory transition-colors hover:border-brass hover:text-brass"
                  >
                    Buka Dashboard
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {actionMessage ? (
                  <div
                    role="status"
                    className="mt-4 flex items-center gap-2.5 border border-emerald-live/50 bg-obsidian p-3.5 text-xs text-emerald-live"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{actionMessage}</span>
                  </div>
                ) : null}

                {actionError ? (
                  <div
                    role="alert"
                    className="mt-4 flex items-center gap-2.5 border border-crimson-alert/50 bg-obsidian p-3.5 text-xs text-crimson-alert"
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
                        <CalendarClock className="h-4 w-4 text-brass" />
                        <h2 className="font-mono text-xs font-semibold tracking-[0.16em] uppercase text-ivory">
                          Geser Jadwal (2-Tap Reschedule)
                        </h2>
                      </div>
                      <p className="mt-1 text-xs text-stone">
                        Tap 1: pilih jam pengganti yang kosong hari ini. Tap 2:
                        konfirmasi geser jadwal.
                      </p>

                      {rescheduleSlots.length === 0 ? (
                        <p className="mt-3 border border-hairline bg-obsidian p-3.5 text-xs text-stone">
                          Tidak ada jam lain yang tersedia di tanggal ini.
                        </p>
                      ) : (
                        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
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
                                className={`flex min-h-[48px] flex-col items-center justify-center border px-2 py-2 font-mono transition-colors ${
                                  isPicked
                                    ? "border-brass bg-brass text-obsidian"
                                    : !slot.available
                                      ? "cursor-not-allowed border-hairline bg-obsidian/40 text-stone/40"
                                      : "border-hairline bg-obsidian text-ivory hover:border-brass hover:text-brass"
                                }`}
                              >
                                <span className="text-xs font-semibold tabular-nums">
                                  {slot.time}
                                </span>
                                <span className="text-[10px] uppercase">
                                  {slot.available
                                    ? isPicked
                                      ? "Tap 2"
                                      : "Kosong"
                                    : slot.status === "BOOKED"
                                      ? "Terisi"
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
                          className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 border border-brass bg-brass px-5 py-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-obsidian transition-colors hover:bg-brass/90 disabled:opacity-60"
                        >
                          {isMutating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Konfirmasi Geser ke {selectedNewStartTime} WIB
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
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 border border-emerald-live/60 bg-obsidian px-4 py-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-emerald-live transition-colors hover:bg-emerald-live hover:text-obsidian disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Tandai Selesai
                      </button>

                      {!confirmCancelArmed ? (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => setConfirmCancelArmed(true)}
                          className="inline-flex min-h-[48px] items-center justify-center gap-2 border border-crimson-alert/60 bg-obsidian px-4 py-3 font-mono text-xs font-semibold tracking-[0.14em] uppercase text-crimson-alert transition-colors hover:bg-crimson-alert hover:text-ivory disabled:opacity-60"
                        >
                          <XCircle className="h-4 w-4" />
                          Batalkan Booking
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() =>
                              void handleAdminAction({ action: "cancel" })
                            }
                            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 border border-crimson-alert bg-crimson-alert px-3 py-3 font-mono text-xs font-semibold tracking-[0.12em] uppercase text-ivory transition-colors hover:bg-crimson-alert/90 disabled:opacity-60"
                          >
                            Ya, Batalkan
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setConfirmCancelArmed(false)}
                            className="inline-flex min-h-[48px] items-center justify-center border border-hairline bg-obsidian px-4 py-3 font-mono text-xs uppercase text-stone hover:text-ivory"
                          >
                            Batal
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 border border-hairline bg-obsidian p-4 text-xs text-stone">
                    Tiket ini berstatus{" "}
                    <strong className="font-mono text-ivory">
                      {booking.status}
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
