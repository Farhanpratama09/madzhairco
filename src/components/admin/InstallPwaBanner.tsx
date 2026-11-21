"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type ClientEnvironment = {
  mounted: boolean;
  isStandalone: boolean;
  isIos: boolean;
  isAndroid: boolean;
};

const SERVER_SNAPSHOT: ClientEnvironment = {
  mounted: false,
  isStandalone: true,
  isIos: false,
  isAndroid: false,
};

let cachedClientSnapshot: ClientEnvironment | null = null;

function getClientSnapshot(): ClientEnvironment {
  if (typeof window === "undefined") {
    return SERVER_SNAPSHOT;
  }

  const standaloneMedia = window.matchMedia?.("(display-mode: standalone)").matches;
  const navigatorStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isStandalone = Boolean(standaloneMedia || navigatorStandalone);

  const ua = window.navigator.userAgent || "";
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);

  if (
    cachedClientSnapshot &&
    cachedClientSnapshot.isStandalone === isStandalone &&
    cachedClientSnapshot.isIos === isIos &&
    cachedClientSnapshot.isAndroid === isAndroid
  ) {
    return cachedClientSnapshot;
  }

  cachedClientSnapshot = {
    mounted: true,
    isStandalone,
    isIos,
    isAndroid,
  };

  return cachedClientSnapshot;
}

function subscribeStandaloneChange(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  const handler = () => {
    cachedClientSnapshot = null;
    callback();
  };

  mediaQuery.addEventListener("change", handler);
  return () => mediaQuery.removeEventListener("change", handler);
}

export function InstallPwaBanner({ className = "" }: { className?: string }) {
  const env = useSyncExternalStore(
    subscribeStandaloneChange,
    getClientSnapshot,
    () => SERVER_SNAPSHOT
  );

  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!env.mounted || env.isStandalone || dismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDismissed(true);
      }
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <aside
      aria-label="Panduan instalasi aplikasi kasir"
      className={`relative flex items-stretch overflow-hidden rounded-xl border border-hairline bg-surface ${className}`}
    >
      {/* Garis aksen Burnt Terracotta di sisi kiri — Soft-Editorial */}
      <span aria-hidden="true" className="w-[3px] shrink-0 bg-terracotta" />

      <div className="flex flex-1 items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {env.isIos ? (
            <Share
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-terracotta"
            />
          ) : (
            <Smartphone
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-terracotta"
            />
          )}

          {env.isIos ? (
            <p className="truncate text-xs text-ink sm:text-sm">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">
                iOS PWA
              </span>{" "}
              <span className="text-muted">•</span> Tap{" "}
              <span className="font-semibold text-ink">Share</span>{" "}
              <span aria-hidden="true" className="text-muted">
                →
              </span>{" "}
              <span className="font-semibold text-ink">
                Add to Home Screen
              </span>
            </p>
          ) : deferredPrompt ? (
            <p className="truncate text-xs text-ink sm:text-sm">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">
                PWA Kasir
              </span>{" "}
              <span className="text-muted">•</span> Pasang di Home Screen untuk
              layar penuh
            </p>
          ) : (
            <p className="truncate text-xs text-ink sm:text-sm">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">
                {env.isAndroid ? "Android PWA" : "Aplikasi Kasir"}
              </span>{" "}
              <span className="text-muted">•</span> Menu Chrome{" "}
              <span className="font-mono font-semibold text-ink">⋮</span>{" "}
              <span aria-hidden="true" className="text-muted">
                →
              </span>{" "}
              <span className="font-semibold text-ink">Install App</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {deferredPrompt ? (
            <button
              type="button"
              onClick={handleInstallClick}
              disabled={installing}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-terracotta bg-terracotta/10 px-3 text-xs font-semibold tracking-wider uppercase text-terracotta transition-colors hover:bg-terracotta hover:text-surface disabled:opacity-50"
            >
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{installing ? "Memasang..." : "Install App"}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Tutup banner instalasi"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-elevated hover:text-ink"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
