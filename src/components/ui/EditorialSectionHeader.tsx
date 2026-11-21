import type { ReactNode } from "react";

export interface EditorialSectionHeaderProps {
  /** Nomor indeks section, contoh: "01", "02", "03" */
  index: string;
  /** Label kategori singkat di samping indeks, contoh: "LAYANAN", "RESERVASI" */
  label: string;
  /** Judul utama section (Syne display) */
  title: string;
  /** Kata/frasa aksen opsional dengan tipografi Instrument Serif italic */
  accentTitle?: string;
  /** Keterangan singkat opsional di bawah judul */
  description?: string;
  /** Slot aksi opsional di sisi kanan pada layar lebar */
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}

export function EditorialSectionHeader({
  index,
  label,
  title,
  accentTitle,
  description,
  action,
  as: Heading = "h2",
  className = "",
}: EditorialSectionHeaderProps) {
  return (
    <header className={`border-b border-hairline pb-5 ${className}`}>
      {/* Baris Indeks Bernomor + Garis Hairline Editorial (Anti-Pill-Badge) */}
      <div className="mb-3.5 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-[2px] bg-terracotta"
        />
        <p className="font-mono text-xs tracking-[0.22em] uppercase text-muted tabular-nums">
          <span className="font-semibold text-terracotta">{index}</span>
          <span className="mx-2 text-muted/50">/</span>
          <span>{label}</span>
        </p>
        <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      </div>

      {/* Baris Judul Editorial & Aksi Opsional */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Heading className="font-display text-2xl leading-[1.08] font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
            {title}
            {accentTitle ? (
              <>
                {" "}
                <span className="font-serif font-normal italic text-terracotta">
                  {accentTitle}
                </span>
              </>
            ) : null}
          </Heading>

          {description ? (
            <p className="mt-2.5 text-sm leading-relaxed text-muted sm:text-base">
              {description}
            </p>
          ) : null}
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
