export interface LiveStatusTagProps {
  /** True jika toko sedang beroperasi menerima booking/walk-in */
  isOpen: boolean;
  /** True jika saklar Tutup Darurat aktif dari dashboard admin */
  isForceClosed?: boolean;
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
  statusText,
  scheduleNote,
  compact = false,
  className = "",
}: LiveStatusTagProps) {
  const isLiveOpen = isOpen && !isForceClosed;

  const resolvedLabel =
    statusText ??
    (isForceClosed
      ? "Tutup Darurat"
      : isLiveOpen
        ? "Buka Live"
        : "Sedang Tutup");

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-stretch border border-hairline bg-surface ${className}`}
    >
      {/* Garis aksen semantik vertikal 2px di sisi kiri — tajam & non-pill */}
      <span
        aria-hidden="true"
        className={`w-0.5 shrink-0 ${
          isLiveOpen ? "bg-emerald-live" : "bg-crimson-alert"
        }`}
      />

      <div
        className={`flex items-center gap-2.5 ${
          compact ? "px-2.5 py-1.5" : "px-3 py-2"
        }`}
      >
        {/* Titik status persegi tajam (#34D399 atau #EF4444) */}
        <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
          {isLiveOpen ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-ping bg-emerald-live/50"
            />
          ) : null}
          <span
            aria-hidden="true"
            className={`relative block h-2 w-2 ${
              isLiveOpen ? "bg-emerald-live" : "bg-crimson-alert"
            }`}
          />
        </span>

        <span
          className={`font-mono text-xs font-medium tracking-[0.14em] uppercase ${
            isLiveOpen ? "text-emerald-live" : "text-crimson-alert"
          }`}
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
