import Link from "next/link";

export interface BrandMarkProps {
  /** 'full': monogram + wordmark + subtitle; 'compact': monogram + wordmark; 'monogram': monogram saja */
  variant?: "full" | "compact" | "monogram";
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
}

const SIZE_STYLES = {
  sm: {
    box: "h-9 w-9",
    svg: "h-5 w-5",
    wordmark: "text-sm tracking-[0.14em]",
    subtitle: "text-[9px] tracking-[0.22em]",
    gap: "gap-2.5",
  },
  md: {
    box: "h-11 w-11",
    svg: "h-6 w-6",
    wordmark: "text-base tracking-[0.15em]",
    subtitle: "text-[10px] tracking-[0.24em]",
    gap: "gap-3",
  },
  lg: {
    box: "h-13 w-13",
    svg: "h-7 w-7",
    wordmark: "text-xl tracking-[0.16em]",
    subtitle: "text-[11px] tracking-[0.26em]",
    gap: "gap-3.5",
  },
} as const;

export function BrandMark({
  variant = "full",
  size = "md",
  href,
  className = "",
}: BrandMarkProps) {
  const styles = SIZE_STYLES[size];

  const content = (
    <span className={`inline-flex items-center ${styles.gap} select-none ${className}`}>
      {/* Monogram Arsitektural Persegi — tanpa pill rounded-full */}
      <span
        aria-hidden="true"
        className={`relative inline-flex shrink-0 items-center justify-center border border-hairline bg-surface ${styles.box}`}
      >
        {/* Aksen sudut kuningan tipis */}
        <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-brass" />
        <span className="absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b border-brass" />

        <svg
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={styles.svg}
        >
          {/* Garis monogram M arsitektural */}
          <path
            d="M5.5 21.5V6.5L14 15.5L22.5 6.5V21.5"
            stroke="#F4F3EF"
            strokeWidth="1.6"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          {/* Garis presisi kuningan di dasar monogram */}
          <path
            d="M9.5 21.5H18.5"
            stroke="#D49B4B"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
        </svg>
      </span>

      {variant !== "monogram" && (
        <span className="flex flex-col leading-none">
          <span
            className={`font-display font-bold uppercase text-ivory ${styles.wordmark}`}
          >
            MADZHAIR<span className="text-brass">.CO</span>
          </span>

          {variant === "full" && (
            <span className="mt-1.5 flex items-center gap-2">
              <span aria-hidden="true" className="h-px w-4 bg-brass/80" />
              <span
                className={`font-mono uppercase text-stone ${styles.subtitle}`}
              >
                BARBER &amp; CO
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label="Madzhair Barber & Co — Beranda"
        className="inline-flex min-h-[44px] min-w-[44px] items-center transition-opacity hover:opacity-90"
      >
        {content}
      </Link>
    );
  }

  return content;
}
