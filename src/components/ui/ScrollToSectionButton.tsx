"use client";

import { useEffect, type ReactNode } from "react";

export interface ScrollToSectionButtonProps {
  targetId: string;
  className?: string;
  children: ReactNode;
}

export function ScrollToSectionButton({
  targetId,
  className = "",
  children,
}: ScrollToSectionButtonProps) {
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
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
