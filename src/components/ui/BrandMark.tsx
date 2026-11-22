import Link from "next/link";

export interface BrandMarkProps {
  /** 'full': monogram + Madzhair / Barber & Co; 'compact': monogram + Madzhair Barber & Co (atau Madzhair bila shortWordmark); 'monogram': monogram saja */
  variant?: "full" | "compact" | "monogram";
  size?: "sm" | "md" | "lg";
  /** 'onDark': warna terang #FFFFFF untuk footer gelap #2B2B2B */
  tone?: "default" | "onDark";
  /** Gunakan teks ringkas "Madzhair" (untuk navbar /admin: "Madzhair · Kasir") */
  shortWordmark?: boolean;
  href?: string;
  className?: string;
}

const SIZE_STYLES = {
  sm: {
    box: "h-9 w-9",
    svg: "h-5 w-5",
    gap: "gap-2.5",
  },
  md: {
    box: "h-11 w-11",
    svg: "h-6 w-6",
    gap: "gap-3",
  },
  lg: {
    box: "h-13 w-13",
    svg: "h-7 w-7",
    gap: "gap-3.5",
  },
} as const;

export function BrandMark({
  variant = "full",
  size = "md",
  tone = "default",
  shortWordmark = false,
  href,
  className = "",
}: BrandMarkProps) {
  const styles = SIZE_STYLES[size];
  const isOnDark = tone === "onDark";

  const content = (
    <span
      className={`inline-flex items-center ${styles.gap} select-none ${className}`}
    >
      {/* Monogram Charcoal Noir rounded-xl */}
      <span
        aria-hidden="true"
        className={`relative inline-flex shrink-0 items-center justify-center rounded-xl border ${
          isOnDark
            ? "border-[#FFFFFF]/25 bg-[#FFFFFF]/10"
            : "border-[#2B2B2B] bg-[#2B2B2B]"
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
            stroke="#FFFFFF"
            strokeWidth="1.75"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          {/* Garis presisi Moonlit Silver di dasar monogram */}
          <path
            d="M9.5 21.5H18.5"
            stroke="#B3B3B3"
            strokeWidth="1.75"
            strokeLinecap="square"
          />
        </svg>
      </span>

      {variant !== "monogram" && (
        <span className="flex min-w-0 flex-col leading-none">
          {shortWordmark ? (
            <span
              className={`font-sans font-bold tracking-tight ${
                isOnDark ? "text-[#FFFFFF]" : "text-[#2B2B2B]"
              } ${
                size === "lg"
                  ? "text-xl"
                  : size === "md"
                    ? "text-base"
                    : "text-sm"
              }`}
            >
              Madzhair
            </span>
          ) : variant === "compact" ? (
            <span
              className={`font-sans font-bold tracking-tight leading-tight ${
                isOnDark ? "text-[#FFFFFF]" : "text-[#2B2B2B]"
              } ${
                size === "lg"
                  ? "text-lg"
                  : size === "md"
                    ? "text-sm"
                    : "text-[13px] sm:text-sm"
              }`}
            >
              Madzhair{" "}
              <span
                className={`font-medium ${
                  isOnDark ? "text-[#E0E0E0]" : "text-[#565656]"
                }`}
              >
                Barber &amp; Co
              </span>
            </span>
          ) : (
            <>
              <span
                className={`font-sans font-bold tracking-tight ${
                  isOnDark ? "text-[#FFFFFF]" : "text-[#2B2B2B]"
                } ${
                  size === "lg"
                    ? "text-xl"
                    : size === "md"
                      ? "text-base"
                      : "text-sm"
                }`}
              >
                Madzhair
              </span>
              <span
                className={`mt-1 font-sans text-[11px] font-medium ${
                  isOnDark ? "text-[#E0E0E0]" : "text-[#565656]"
                }`}
              >
                Barber &amp; Co
              </span>
            </>
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
