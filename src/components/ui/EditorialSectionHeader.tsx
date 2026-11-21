import type { ReactNode } from "react";

export interface EditorialSectionHeaderProps {
  /** Deprecated: dipertahankan opsional agar kompatibel, tidak lagi ditampilkan sebagai kode nomor */
  index?: string;
  /** Label kategori singkat opsional dalam Sentence Case */
  label?: string;
  /** Judul utama section (Poppins semi-bold) */
  title: string;
  /** Kata/frasa aksen opsional berwarna Terracotta */
  accentTitle?: string;
  /** Keterangan singkat opsional di bawah judul (Poppins Sentence Case) */
  description?: string;
  /** Slot aksi opsional di sisi kanan pada layar lebar */
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}

export function EditorialSectionHeader({
  label,
  title,
  accentTitle,
  description,
  action,
  as: Heading = "h2",
  className = "",
}: EditorialSectionHeaderProps) {
  return (
    <header className={`border-b border-hairline pb-4 sm:pb-5 ${className}`}>
      {label ? (
        <p className="mb-1.5 font-sans text-xs font-medium text-terracotta sm:text-sm">
          {label}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Heading className="font-sans text-2xl leading-[1.2] font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
            {accentTitle ? (
              <>
                {" "}
                <span className="text-terracotta">{accentTitle}</span>
              </>
            ) : null}
          </Heading>

          {description ? (
            <p className="mt-2 font-sans text-sm leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
