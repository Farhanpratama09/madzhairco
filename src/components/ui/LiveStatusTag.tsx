import type { StoreLiveClosedReason } from "@/types/database";

export interface LiveStatusTagProps {
  /** True jika toko sedang beroperasi di jam buka saat ini */
  isOpen: boolean;
  /** True jika saklar Tutup Darurat aktif dari dashboard admin */
  isForceClosed?: boolean;
  /** Detail status dari isStoreOpenLive agar web tetap menandakan Booking Aktif sebelum jam buka */
  reason?: StoreLiveClosedReason;
  /** Override teks status utama */
  statusText?: string;
  /** Informasi jam buka hari ini atau keterangan singkat, mis. "12:00 – 21:00 WIB" */
  scheduleNote?: string;
  /** Tampilan lebih ringkas untuk header mobile */
  compact?: boolean;
  className?: string;
}

export function LiveStatusTag({
  isOpen,
  isForceClosed = false,
  reason,
  statusText,
  scheduleNote,
  compact = false,
  className = "",
}: LiveStatusTagProps) {
  const isLiveOpen = isOpen && !isForceClosed;
  const isPreOpenOrAfterHours =
    !isForceClosed && (reason === "BEFORE_OPEN" || reason === "AFTER_CLOSE");

  const resolvedLabel =
    statusText ??
    (isForceClosed
      ? "Tutup Darurat"
      : isLiveOpen
        ? "Buka Live"
        : reason === "BEFORE_OPEN"
          ? "Booking Aktif"
          : reason === "AFTER_CLOSE"
            ? "Booking Besok Aktif"
            : reason === "CLOSED_DATE" || reason === "DAY_OFF"
              ? "Hari Ini Libur"
              : "Sedang Tutup");

  const accentBg = isLiveOpen
    ? "bg-emerald-live"
    : isPreOpenOrAfterHours
      ? "bg-brass"
      : "bg-crimson-alert";

  const accentPing = isLiveOpen
    ? "bg-emerald-live/50"
    : isPreOpenOrAfterHours
      ? "bg-brass/40"
      : "";

  const accentText = isLiveOpen
    ? "text-emerald-live"
    : isPreOpenOrAfterHours
      ? "text-brass"
      : "text-crimson-alert";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-stretch border border-hairline bg-surface ${className}`}
    >
      {/* Garis aksen semantik vertikal 2px di sisi kiri — tajam & non-pill */}
      <span aria-hidden="true" className={`w-0.5 shrink-0 ${accentBg}`} />

      <div
        className={`flex items-center gap-2.5 ${
          compact ? "px-2.5 py-1.5" : "px-3 py-2"
        }`}
      >
        {/* Titik status persegi tajam (#34D399, #D49B4B, atau #EF4444) */}
        <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
          {isLiveOpen || isPreOpenOrAfterHours ? (
            <span
              aria-hidden="true"
              className={`absolute inset-0 animate-ping ${accentPing}`}
            />
          ) : null}
          <span
            aria-hidden="true"
            className={`relative block h-2 w-2 ${accentBg}`}
          />
        </span>

        <span
          className={`font-mono text-xs font-medium tracking-[0.14em] uppercase ${accentText}`}
        >
          {resolvedLabel}
        </span>

        {scheduleNote ? (
          <>
            <span aria-hidden="true" className="h-3 w-px bg-hairline" />
            <span className="font-mono text-xs tracking-wide text-stone tabular-nums">
              {scheduleNote}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
