import type { StoreLiveClosedReason } from "@/types/database";

export interface LiveStatusTagProps {
  /** True jika toko sedang beroperasi di jam buka saat ini */
  isOpen: boolean;
  /** True jika saklar Tutup Darurat aktif dari dashboard admin */
  isForceClosed?: boolean;
  /** Detail status dari isStoreOpenLive agar web tetap menandakan Booking Aktif sebelum jam buka */
  reason?: StoreLiveClosedReason;
  /** Override teks status utama (Sentence Case) */
  statusText?: string;
  /** Informasi jam buka hari ini, mis. "12:00 – 21:00 WIB" */
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
      ? "Tutup darurat"
      : isLiveOpen
        ? "Sedang buka"
        : reason === "BEFORE_OPEN"
          ? "Booking aktif"
          : reason === "AFTER_CLOSE"
            ? "Booking besok aktif"
            : reason === "CLOSED_DATE" || reason === "DAY_OFF"
              ? "Hari ini libur"
              : "Sedang tutup");

  const accentBg = isLiveOpen
    ? "bg-emerald-live"
    : isPreOpenOrAfterHours
      ? "bg-terracotta"
      : "bg-crimson-alert";

  const accentPing = isLiveOpen
    ? "bg-emerald-live/45"
    : isPreOpenOrAfterHours
      ? "bg-terracotta/40"
      : "";

  const accentText = isLiveOpen
    ? "text-emerald-live"
    : isPreOpenOrAfterHours
      ? "text-terracotta"
      : "text-crimson-alert";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 font-sans ${
        compact ? "text-xs" : "text-xs sm:text-sm"
      } ${className}`}
    >
      {/* Indikator lingkaran halus (non-box, non-pill) */}
      <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
        {isLiveOpen || isPreOpenOrAfterHours ? (
          <span
            aria-hidden="true"
            className={`absolute inset-0 animate-ping rounded-full ${accentPing}`}
          />
        ) : null}
        <span
          aria-hidden="true"
          className={`relative block h-2 w-2 rounded-full ${accentBg}`}
        />
      </span>

      <span className={`font-medium whitespace-nowrap ${accentText}`}>
        {resolvedLabel}
      </span>

      {scheduleNote ? (
        <span className="inline-flex items-center gap-2 text-muted whitespace-nowrap">
          <span aria-hidden="true" className="text-muted/60">
            ·
          </span>
          <span className="font-mono text-xs tabular-nums">{scheduleNote}</span>
        </span>
      ) : null}
    </div>
  );
}
