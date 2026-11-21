import Link from "next/link";

export interface BrandMarkProps {
  /** 'full': monogram + wordmark + subtitle; 'compact': monogram + wordmark; 'monogram': monogram saja */
  variant?: "full" | "compact" | "monogram";
  size?: "sm" | "md" | "lg";
  /** 'onDark': warna terang #F7F3EC untuk footer gelap #303841 */
  tone?: "default" | "onDark";
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
  tone = "default",
  href,
  className = "",
}: BrandMarkProps) {
  const styles = SIZE_STYLES[size];
  const isOnDark = tone === "onDark";

  const content = (
    <span className={`inline-flex items-center ${styles.gap} select-none ${className}`}>
      {/* Monogram Soft-Editorial rounded-xl — tanpa pill rounded-full */}
      <span
        aria-hidden="true"
        className={`relative inline-flex shrink-0 items-center justify-center rounded-xl border ${
          isOnDark
            ? "border-[#F7F3EC]/25 bg-[#F7F3EC]/10"
            : "border-ink bg-ink"
        } ${styles.box}`}
      >
        <svg
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={styles.svg}
        >
          {/* Garis monogram M arsitektural */}
          <path
            d="M5.5 21.5V6.5L14 15.5L22.5 6.5V21.5"
            stroke="#F7F3EC"
            strokeWidth="1.75"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          {/* Garis presisi Burnt Terracotta di dasar monogram */}
          <path
            d="M9.5 21.5H18.5"
            stroke="#C25934"
            strokeWidth="1.75"
            strokeLinecap="square"
          />
        </svg>
      </span>

      {variant !== "monogram" && (
        <span className="flex flex-col leading-none">
          <span
            className={`font-display font-bold tracking-tight ${
              isOnDark ? "text-[#F7F3EC]" : "text-ink"
            } ${
              size === "lg"
                ? "text-xl"
                : size === "md"
                  ? "text-base"
                  : "text-sm"
            }`}
          >
            Madzhair<span className="text-terracotta">.co</span>
          </span>

          {variant === "full" && (
            <span
              className={`mt-1 font-sans text-[11px] font-medium ${
                isOnDark ? "text-[#F7F3EC]/70" : "text-muted"
              }`}
            >
              Barber &amp; Co
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
        className="inline-flex min-h-[44px] min-w-[44px] items-center rounded-xl transition-opacity hover:opacity-85"
      >
        {content}
      </Link>
    );
  }

  return content;
}
