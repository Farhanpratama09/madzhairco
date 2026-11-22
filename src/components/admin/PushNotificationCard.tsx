"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, Send, Share, Smartphone } from "lucide-react";

interface PushNotificationCardProps {
  onNotify?: (type: "success" | "error", message: string) => void;
}

interface PushClientEnv {
  mounted: boolean;
  isIos: boolean;
  isStandalone: boolean;
  supportsPush: boolean;
}

const SERVER_ENV: PushClientEnv = {
  mounted: false,
  isIos: false,
  isStandalone: false,
  supportsPush: false,
};

let cachedPushEnv: PushClientEnv | null = null;

function getPushClientEnv(): PushClientEnv {
  if (typeof window === "undefined") {
    return SERVER_ENV;
  }

  const ua = window.navigator.userAgent || "";
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  const standaloneMedia = window.matchMedia?.(
    "(display-mode: standalone)"
  ).matches;
  const navigatorStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  const isStandalone = Boolean(standaloneMedia || navigatorStandalone);

  const supportsPush =
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  if (
    cachedPushEnv &&
    cachedPushEnv.isIos === isIos &&
    cachedPushEnv.isStandalone === isStandalone &&
    cachedPushEnv.supportsPush === supportsPush
  ) {
    return cachedPushEnv;
  }

  cachedPushEnv = {
    mounted: true,
    isIos,
    isStandalone,
    supportsPush,
  };
  return cachedPushEnv;
}

function subscribeEnv(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const mq = window.matchMedia("(display-mode: standalone)");
  const handler = () => {
    cachedPushEnv = null;
    callback();
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationCard({ onNotify }: PushNotificationCardProps) {
  const env = useSyncExternalStore(
    subscribeEnv,
    getPushClientEnv,
    () => SERVER_ENV
  );

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<string>("default");
  const [busySubscribe, setBusySubscribe] = useState(false);
  const [busyTest, setBusyTest] = useState(false);

  const vapidPublicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

  useEffect(() => {
    if (!env.mounted || !env.supportsPush) return;

    let cancelled = false;
    void (async () => {
      try {
        const currentPermission =
          typeof Notification !== "undefined"
            ? Notification.permission
            : "default";
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) {
          setPermissionState(currentPermission);
          setIsSubscribed(Boolean(existing));
        }
      } catch {
        // Service worker registration failed silently
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [env.mounted, env.supportsPush]);

  const handleEnablePush = async () => {
    if (!env.supportsPush || typeof Notification === "undefined") {
      onNotify?.(
        "error",
        "Browser ini belum mendukung Web Push. Pasang aplikasi ke Home Screen terlebih dahulu."
      );
      return;
    }

    if (!vapidPublicKey) {
      onNotify?.(
        "error",
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY belum dikonfigurasi di environment server."
      );
      return;
    }

    setBusySubscribe(true);
    try {
      // Must be triggered inside user click gesture for iOS Safari PWA compatibility
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission !== "granted") {
        onNotify?.(
          "error",
          "Izin notifikasi ditolak. Aktifkan izin notifikasi di pengaturan browser/HP."
        );
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      const subJson = subscription.toJSON();
      const res = await fetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      const data = (await res.json()) as { subscribed?: boolean; error?: string };
      if (!res.ok || !data.subscribed) {
        onNotify?.("error", data.error || "Gagal menyimpan notifikasi perangkat.");
        return;
      }

      setIsSubscribed(true);
      onNotify?.(
        "success",
        "Notifikasi HP Kasir aktif! Booking baru & pengingat istirahat akan masuk otomatis."
      );
    } catch {
      onNotify?.(
        "error",
        "Gagal mengaktifkan Web Push. Pastikan koneksi HTTPS dan VAPID key valid."
      );
    } finally {
      setBusySubscribe(false);
    }
  };

  const handleDisablePush = async () => {
    if (!env.supportsPush) return;
    setBusySubscribe(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await fetch("/api/admin/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      onNotify?.("success", "Notifikasi HP Kasir pada perangkat ini dinonaktifkan.");
    } catch {
      onNotify?.("error", "Gagal menonaktifkan notifikasi perangkat.");
    } finally {
      setBusySubscribe(false);
    }
  };

  const handleTestPush = async () => {
    setBusyTest(true);
    try {
      const res = await fetch("/api/admin/push/test", {
        method: "POST",
      });
      const data = (await res.json()) as {
        sent?: number;
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        onNotify?.("error", data.error || "Gagal mengirim tes notifikasi.");
        return;
      }
      onNotify?.(
        "success",
        `Tes notifikasi terkirim ke ${data.sent ?? 0} dari ${data.total ?? 0} perangkat kasir.`
      );
    } catch {
      onNotify?.("error", "Gangguan jaringan saat mengirim tes notifikasi.");
    } finally {
      setBusyTest(false);
    }
  };

  const needsIosHomeScreen = env.mounted && env.isIos && !env.isStandalone;

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-3.5">
        <div>
          <h3 className="font-sans text-base font-semibold text-ink sm:text-lg">
            Notifikasi HP Kasir
          </h3>
          <p className="mt-1 font-sans text-xs leading-relaxed text-muted">
            Terima bunyi notifikasi otomatis saat ada booking online baru dan
            pengingat sebelum jam istirahat selesai (Sungai Kunyit, Kalimantan
            Barat — WIB).
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-lg border px-2.5 py-1 font-sans text-xs font-semibold ${
            isSubscribed
              ? "border-terracotta/45 bg-terracotta/12 text-terracotta"
              : "border-hairline bg-surface-elevated text-muted"
          }`}
        >
          {isSubscribed ? "Aktif di perangkat ini" : "Belum aktif"}
        </span>
      </div>

      {needsIosHomeScreen ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-terracotta/40 bg-terracotta/8 p-3.5 font-sans text-xs leading-relaxed text-ink">
          <Share aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-terracotta" />
          <div>
            <p className="font-semibold text-terracotta">
              Khusus iPhone / iPad (iOS Safari)
            </p>
            <p className="mt-1 text-muted">
              Apple mewajibkan aplikasi dipasang ke layar utama sebelum Web Push
              bisa diaktifkan. Ketuk ikon{" "}
              <strong className="text-ink">Share</strong> di Safari lalu pilih{" "}
              <strong className="text-ink">Add to Home Screen</strong>, kemudian
              buka kembali <strong className="text-ink">/admin</strong> dari
              ikon aplikasi tersebut.
            </p>
          </div>
        </div>
      ) : !env.mounted ? (
        <p className="mt-4 font-sans text-xs text-muted">
          Memeriksa dukungan notifikasi perangkat...
        </p>
      ) : !env.supportsPush ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-hairline bg-alabaster/65 p-3.5 font-sans text-xs text-muted">
          <Smartphone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
          <span>
            Browser ini belum mendukung Web Push Notification. Gunakan Chrome
            Android atau Safari iOS (via Add to Home Screen).
          </span>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {permissionState === "denied" ? (
            <p className="rounded-xl border border-crimson-alert/40 bg-crimson-alert/10 px-3.5 py-2.5 font-sans text-xs text-crimson-alert">
              Izin notifikasi sedang diblokir di pengaturan browser perangkat
              ini. Ubah izin notifikasi menjadi Izinkan lalu coba kembali.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2.5">
            {!isSubscribed ? (
              <button
                type="button"
                disabled={busySubscribe}
                onClick={() => void handleEnablePush()}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:flex-none sm:text-sm"
              >
                <Bell aria-hidden="true" className="h-4 w-4" />
                <span>
                  {busySubscribe
                    ? "Mengaktifkan..."
                    : "Aktifkan Notifikasi HP"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={busySubscribe}
                onClick={() => void handleDisablePush()}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-hairline bg-alabaster/75 px-4 font-sans text-xs font-semibold text-ink transition-colors hover:border-crimson-alert hover:text-crimson-alert disabled:opacity-50 sm:flex-none sm:text-sm"
              >
                <BellOff aria-hidden="true" className="h-4 w-4" />
                <span>
                  {busySubscribe ? "Memproses..." : "Nonaktifkan Perangkat Ini"}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={busyTest}
              onClick={() => void handleTestPush()}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-ink bg-ink px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:flex-none sm:text-sm"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              <span>{busyTest ? "Mengirim..." : "Tes Kirim Notif"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
