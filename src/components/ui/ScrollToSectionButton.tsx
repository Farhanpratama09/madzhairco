"use client";

import { useEffect, type ReactNode } from "react";

export interface ScrollToSectionButtonProps {
  targetId: string;
  className?: string;
  children: ReactNode;
}

const ALLOWED_SCROLL_TARGETS = new Set([
  "reservasi",
  "layanan",
  "galeri",
  "lokasi",
]);

export function ScrollToSectionButton({
  targetId,
  className = "",
  children,
}: ScrollToSectionButtonProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const toTarget = params.get("to")?.trim().toLowerCase() ?? "";

    if (toTarget && ALLOWED_SCROLL_TARGETS.has(toTarget)) {
      params.delete("to");
      const remainingQuery = params.toString();
      const cleanUrl =
        window.location.pathname + (remainingQuery ? `?${remainingQuery}` : "");
      window.history.replaceState(null, "", cleanUrl);

      window.setTimeout(() => {
        const el = document.getElementById(toTarget);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 60);
      return;
    }

    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }, []);

  const handleClick = () => {
    if (typeof document === "undefined") return;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  };

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
