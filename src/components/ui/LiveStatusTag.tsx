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
  /** 'overlayDesktop': teks terang kontras di lg: saat menindih foto gelap top-right hero */
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
  surfaceTone = "default",
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
    ? surfaceTone === "overlayDesktop"
      ? "bg-emerald-live lg:bg-[#6EE7B7]"
      : "bg-emerald-live"
    : isPreOpenOrAfterHours
      ? surfaceTone === "overlayDesktop"
        ? "bg-terracotta lg:bg-[#F59E79]"
        : "bg-terracotta"
      : surfaceTone === "overlayDesktop"
        ? "bg-crimson-alert lg:bg-[#FCA5A5]"
        : "bg-crimson-alert";

  const accentPing = isLiveOpen
    ? surfaceTone === "overlayDesktop"
      ? "bg-emerald-live/45 lg:bg-[#6EE7B7]/45"
      : "bg-emerald-live/45"
    : isPreOpenOrAfterHours
      ? surfaceTone === "overlayDesktop"
        ? "bg-terracotta/40 lg:bg-[#F59E79]/45"
        : "bg-terracotta/40"
      : "";

  const accentText = isLiveOpen
    ? surfaceTone === "overlayDesktop"
      ? "text-emerald-live lg:text-[#A7F3D0]"
      : "text-emerald-live"
    : isPreOpenOrAfterHours
      ? surfaceTone === "overlayDesktop"
        ? "text-terracotta lg:text-[#FDBA74]"
        : "text-terracotta"
      : surfaceTone === "overlayDesktop"
        ? "text-crimson-alert lg:text-[#FECACA]"
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
        <span
          className={`inline-flex items-center gap-2 whitespace-nowrap ${
            surfaceTone === "overlayDesktop"
              ? "text-muted lg:text-[#F7F3EC]/90"
              : "text-muted"
          }`}
        >
          <span
            aria-hidden="true"
            className={
              surfaceTone === "overlayDesktop"
                ? "text-muted/60 lg:text-[#F7F3EC]/55"
                : "text-muted/60"
            }
          >
            ·
          </span>
          <span className="font-mono text-xs tabular-nums">{scheduleNote}</span>
        </span>
      ) : null}
    </div>
  );
}
