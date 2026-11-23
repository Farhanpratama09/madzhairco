import Image from "next/image";
import Link from "next/link";

export interface BrandMarkProps {
  /** 'full' | 'compact': logo resmi MADZ HAIR.CO; 'monogram': ikon inisial M */
  variant?: "full" | "compact" | "monogram";
  size?: "sm" | "md" | "lg";
  /** 'onDark': varian #F7F7F7 untuk latar gelap #2B2B2B */
  tone?: "default" | "onDark";
  /** Ukuran ringkas untuk navbar admin */
  shortWordmark?: boolean;
  href?: string;
  className?: string;
}

const LOGO_SIZE_CLASSES = {
  sm: "h-10 w-auto sm:h-11",
  compact: "h-8 w-auto sm:h-9",
  md: "h-14 w-auto sm:h-16",
  lg: "h-16 w-auto sm:h-20",
} as const;

const MONOGRAM_SIZE_CLASSES = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-14 w-14",
} as const;

export function BrandMark({
  variant = "full",
  size = "md",
  tone = "default",
  shortWordmark = false,
  href,
  className = "",
}: BrandMarkProps) {
  const isOnDark = tone === "onDark";
  const logoSrc = isOnDark
    ? "/images/brand/madzhair-logo-light.png"
    : "/images/brand/madzhair-logo-dark.png";

  const logoClass =
    shortWordmark && size === "sm"
      ? LOGO_SIZE_CLASSES.compact
      : LOGO_SIZE_CLASSES[size];

  const content = (
    <span className={`inline-flex items-center select-none ${className}`}>
      {variant === "monogram" ? (
        <Image
          src="/icons/icon-192.png"
          alt="Madzhair Barber & Co"
          width={192}
          height={192}
          className={`shrink-0 rounded-xl border border-[#B3B3B3]/40 object-cover ${MONOGRAM_SIZE_CLASSES[size]}`}
        />
      ) : (
        <Image
          src={logoSrc}
          alt="MADZ HAIR.CO"
          width={2874}
          height={1445}
          priority
          sizes="(max-width: 640px) 180px, 240px"
          className={`shrink-0 object-contain ${logoClass}`}
        />
      )}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label="MADZ HAIR.CO — Beranda"
        className="inline-flex min-h-[44px] min-w-[44px] items-center rounded-xl transition-opacity hover:opacity-85"
      >
        {content}
      </Link>
    );
  }

  return content;
}
