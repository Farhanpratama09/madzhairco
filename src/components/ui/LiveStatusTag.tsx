import { Calendar, CalendarCheck } from "lucide-react";
import type { StoreLiveClosedReason } from "@/types/database";

export interface LiveStatusTagProps {
  /** True jika toko sedang beroperasi di jam buka saat ini */
  isOpen: boolean;
  /** True jika saklar Tutup Darurat aktif dari dashboard admin */
  isForceClosed?: boolean;
  /** Detail status dari isStoreOpenLive berdasarkan waktu Asia/Pontianak */
  reason?: StoreLiveClosedReason;
  /** Override teks status utama (Sentence Case) */
  statusText?: string;
  /** Informasi jam buka opsional */
  scheduleNote?: string;
  /** Tampilan ringkas */
  compact?: boolean;
  /** Deprecated: dipertahankan opsional untuk kompatibilitas */
  surfaceTone?: "default" | "overlayDesktop";
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
  const isClosedToday =
    isForceClosed || reason === "CLOSED_DATE" || reason === "DAY_OFF";

  const resolvedLabel =
    statusText ??
    (isClosedToday
      ? "Tutup hari ini"
      : isLiveOpen
        ? "Sedang buka"
        : "Booking tersedia");

  const iconColor = isClosedToday ? "text-crimson-alert" : "text-terracotta";
  const labelColor = isClosedToday ? "text-crimson-alert" : "text-ink";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 font-sans ${
        compact ? "text-xs" : "text-xs sm:text-sm"
      } ${className}`}
    >
      {isClosedToday ? (
        <Calendar
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 ${iconColor}`}
        />
      ) : (
        <CalendarCheck
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 ${iconColor}`}
        />
      )}

      <span className={`font-medium whitespace-nowrap ${labelColor}`}>
        {resolvedLabel}
      </span>

      {scheduleNote ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">
          <span aria-hidden="true" className="text-muted/60">
            ·
          </span>
          <span className="font-sans text-xs tabular-nums">{scheduleNote}</span>
        </span>
      ) : null}
    </div>
  );
}
