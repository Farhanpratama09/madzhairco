"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, ExternalLink, QrCode, X } from "lucide-react";

const DEFAULT_RESERVATION_URL = "https://madzhairco.vercel.app/#reservasi";

function subscribeNoop(): () => void {
  return () => {};
}

function getClientBookingUrl(): string {
  if (typeof window === "undefined") {
    return DEFAULT_RESERVATION_URL;
  }
  return `${window.location.origin}/#reservasi`;
}

function getServerBookingUrl(): string {
  return DEFAULT_RESERVATION_URL;
}

interface StudioQrCodeCardProps {
  storeName: string;
  onNotify?: (type: "success" | "error", message: string) => void;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function StudioQrCodeCard({
  storeName,
  onNotify,
}: StudioQrCodeCardProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bookingUrl = useSyncExternalStore(
    subscribeNoop,
    getClientBookingUrl,
    getServerBookingUrl
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!modalOpen) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    void QRCode.toCanvas(canvas, bookingUrl, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "H",
      color: {
        dark: "#303841",
        light: "#F7F3EC",
      },
    });
  }, [modalOpen, bookingUrl]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      onNotify?.("success", "Link booking pelanggan disalin ke clipboard.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      onNotify?.("error", "Gagal menyalin link. Salin manual dari alamat yang tampil.");
    }
  };

  const handleDownloadPrintablePng = async () => {
    setDownloading(true);
    try {
      const targetUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/#reservasi`
          : bookingUrl;

      const qrCanvas = document.createElement("canvas");
      await QRCode.toCanvas(qrCanvas, targetUrl, {
        width: 720,
        margin: 2,
        errorCorrectionLevel: "H",
        color: {
          dark: "#303841",
          light: "#FFFFFF",
        },
      });

      const poster = document.createElement("canvas");
      poster.width = 1200;
      poster.height = 1600;
      const ctx = poster.getContext("2d");
      if (!ctx) return;

      // Background Warm Alabaster
      ctx.fillStyle = "#EFE8DD";
      ctx.fillRect(0, 0, poster.width, poster.height);

      // Inner Soft Ivory Card
      drawRoundedRect(ctx, 76, 76, 1048, 1448, 48);
      ctx.fillStyle = "#F7F3EC";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#DCD4C6";
      ctx.stroke();

      // Top Burnt Terracotta Accent Bar
      drawRoundedRect(ctx, 480, 140, 240, 10, 5);
      ctx.fillStyle = "#C25934";
      ctx.fill();

      // Brand Heading
      ctx.fillStyle = "#303841";
      ctx.textAlign = "center";
      ctx.font = "700 68px Poppins, system-ui, sans-serif";
      ctx.fillText(storeName || "Madzhair.co", 600, 245);

      ctx.fillStyle = "#5C646D";
      ctx.font = "500 30px Poppins, system-ui, sans-serif";
      ctx.fillText("Sungai Kunyit, Kalimantan Barat", 600, 300);

      // QR Frame
      drawRoundedRect(ctx, 210, 370, 780, 780, 40);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#DCD4C6";
      ctx.stroke();

      ctx.drawImage(qrCanvas, 240, 400, 720, 720);

      // Instructions
      ctx.fillStyle = "#C25934";
      ctx.font = "700 40px Poppins, system-ui, sans-serif";
      ctx.fillText("SCAN UNTUK BOOKING KURSI", 600, 1245);

      ctx.fillStyle = "#303841";
      ctx.font = "500 30px Poppins, system-ui, sans-serif";
      ctx.fillText(
        "Arahkan kamera HP untuk pilih layanan & jam",
        600,
        1305
      );
      ctx.fillText("tanpa perlu antre dan tanpa buat akun.", 600, 1348);

      // URL Footer
      ctx.fillStyle = "#5C646D";
      ctx.font = "600 24px Poppins, system-ui, sans-serif";
      ctx.fillText(targetUrl.replace(/^https?:\/\//, ""), 600, 1445);

      const dataUrl = poster.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "madzhair-qr-studio-siap-cetak.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloading(false);
    }
  };

  const displayHost = bookingUrl.replace(/^https?:\/\//, "");

  return (
    <>
      {/* Baris Ringkas Tanpa Preview Poster Terbuka di Halaman Utama CMS */}
      <div className="rounded-2xl border border-hairline bg-surface p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-terracotta/30 bg-terracotta/10 text-terracotta">
              <QrCode aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-sans text-sm font-semibold text-ink">
                QR Code Studio &amp; Link Booking
              </h3>
              <p className="mt-0.5 truncate font-sans text-xs text-muted">
                {displayHost}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 sm:w-auto"
          >
            <QrCode aria-hidden="true" className="h-4 w-4" />
            <span>Preview &amp; Unduh QR PNG</span>
          </button>
        </div>
      </div>

      {/* Modal / Drawer Pratinjau QR + Download PNG + Salin/Buka Link Pelanggan */}
      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-qr-modal-title"
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-hairline bg-surface px-4 pt-3 pb-safe font-sans shadow-2xl sm:rounded-2xl sm:p-5"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-3 h-1 w-10 rounded-full bg-hairline sm:hidden"
            />

            <div className="flex items-start justify-between gap-3 border-b border-hairline pb-3">
              <div>
                <p className="text-xs font-semibold text-terracotta">
                  Poster Meja Kasir &amp; Cermin
                </p>
                <h2
                  id="studio-qr-modal-title"
                  className="mt-0.5 text-base font-semibold text-ink sm:text-lg"
                >
                  QR Code Reservasi Studio
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Tutup pratinjau QR Code"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-hairline bg-alabaster/75 text-muted hover:border-ink hover:text-ink"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center rounded-2xl border border-hairline bg-alabaster/65 p-4 text-center">
              <canvas
                ref={previewCanvasRef}
                width={220}
                height={220}
                aria-label={`QR Code Reservasi ${storeName}`}
                className="h-[196px] w-[196px] rounded-xl bg-surface"
              />
              <p className="mt-2.5 text-xs font-semibold text-ink">
                {storeName} · Sungai Kunyit, Kalimantan Barat
              </p>
              <p className="mt-0.5 break-all text-[11px] text-muted">
                {displayHost}
              </p>
            </div>

            <div className="mt-4 space-y-2 pb-2">
              <button
                type="button"
                disabled={downloading}
                onClick={() => void handleDownloadPrintablePng()}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:text-sm"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                <span>
                  {downloading ? "Menyiapkan PNG..." : "Download PNG Siap Cetak"}
                </span>
              </button>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-hairline bg-alabaster/75 px-3 font-sans text-xs font-semibold text-ink transition-colors hover:border-terracotta hover:text-terracotta"
                >
                  {copied ? (
                    <Check aria-hidden="true" className="h-3.5 w-3.5 text-terracotta" />
                  ) : (
                    <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  <span>{copied ? "Link Disalin" : "Salin Link Booking"}</span>
                </button>

                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-elevated/70 px-3 font-sans text-xs font-semibold text-ink transition-colors hover:border-ink"
                >
                  <span>Buka Halaman Pelanggan</span>
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
