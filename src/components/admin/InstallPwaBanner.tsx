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
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
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
    <>
      <aside
        aria-label="Panduan instalasi aplikasi kasir"
        className={`relative flex items-stretch overflow-hidden rounded-xl border border-hairline bg-surface ${className}`}
      >
        {/* Garis aksen Burnt Terracotta di sisi kiri — Soft-Editorial */}
        <span aria-hidden="true" className="w-[3px] shrink-0 bg-terracotta" />

        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2">
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
              <p className="truncate font-sans text-xs text-ink sm:text-sm">
                <span className="font-semibold text-terracotta">
                  PWA iPhone
                </span>{" "}
                <span className="text-muted">·</span> Pasang di Home Screen
                untuk notifikasi HP
              </p>
            ) : deferredPrompt ? (
              <p className="truncate font-sans text-xs text-ink sm:text-sm">
                <span className="font-semibold text-terracotta">
                  PWA Kasir
                </span>{" "}
                <span className="text-muted">·</span> Pasang di Home Screen
                untuk layar penuh
              </p>
            ) : (
              <p className="truncate font-sans text-xs text-ink sm:text-sm">
                <span className="font-semibold text-terracotta">
                  {env.isAndroid ? "Android PWA" : "Aplikasi kasir"}
                </span>{" "}
                <span className="text-muted">·</span> Menu Chrome{" "}
                <span className="font-sans font-semibold text-ink">⋮</span>{" "}
                <span aria-hidden="true" className="text-muted">
                  →
                </span>{" "}
                <span className="font-semibold text-ink">Install App</span>
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {env.isIos ? (
              <button
                type="button"
                onClick={() => setIosGuideOpen(true)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-terracotta bg-terracotta/10 px-3 font-sans text-xs font-semibold text-terracotta transition-colors hover:bg-terracotta hover:text-surface"
              >
                <Share aria-hidden="true" className="h-3.5 w-3.5" />
                <span>Cara Pasang di iPhone</span>
              </button>
            ) : deferredPrompt ? (
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={installing}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-terracotta bg-terracotta/10 px-3 font-sans text-xs font-semibold text-terracotta transition-colors hover:bg-terracotta hover:text-surface disabled:opacity-50"
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

      {/* Modal Panduan Visual 2 Langkah Khusus iOS Safari */}
      {iosGuideOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-pwa-guide-title"
          onClick={() => setIosGuideOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-4 pb-safe backdrop-blur-xs sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-5 font-sans shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3 border-b border-hairline pb-3.5">
              <div>
                <p className="text-xs font-semibold text-terracotta">
                  Panduan iPhone &amp; iPad (Safari)
                </p>
                <h2
                  id="ios-pwa-guide-title"
                  className="mt-1 text-lg font-semibold text-ink"
                >
                  Pasang Madzhair.co di Home Screen
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIosGuideOpen(false)}
                aria-label="Tutup panduan iPhone"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-hairline bg-alabaster/70 text-muted hover:border-ink hover:text-ink"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <ol className="mt-4 space-y-3">
              <li className="flex items-start gap-3 rounded-xl border border-hairline bg-alabaster/65 p-3.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-terracotta text-xs font-bold text-surface tabular-nums">
                  1
                </span>
                <div className="min-w-0 text-xs leading-relaxed text-muted">
                  <p className="text-sm font-semibold text-ink">
                    Ketuk ikon Share di Safari
                  </p>
                  <p className="mt-0.5">
                    Ketuk tombol{" "}
                    <span className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface px-1.5 py-0.5 font-semibold text-ink">
                      <Share aria-hidden="true" className="h-3 w-3 text-terracotta" />
                      Share
                    </span>{" "}
                    di bar bawah layar Safari iPhone Anda.
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-3 rounded-xl border border-hairline bg-alabaster/65 p-3.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ink text-xs font-bold text-surface tabular-nums">
                  2
                </span>
                <div className="min-w-0 text-xs leading-relaxed text-muted">
                  <p className="text-sm font-semibold text-ink">
                    Pilih &ldquo;Add to Home Screen&rdquo;
                  </p>
                  <p className="mt-0.5">
                    Gulir menu ke bawah, ketuk{" "}
                    <strong className="font-semibold text-ink">
                      Add to Home Screen
                    </strong>
                    , lalu ketuk <strong className="font-semibold text-ink">Add</strong>. Buka kembali aplikasi dari ikon layar utama untuk mengaktifkan Notifikasi HP Kasir.
                  </p>
                </div>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setIosGuideOpen(false)}
              className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-terracotta px-4 font-sans text-sm font-semibold text-surface transition-opacity hover:opacity-90"
            >
              Mengerti
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
