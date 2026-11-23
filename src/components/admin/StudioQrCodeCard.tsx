"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, ExternalLink, QrCode, X } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";

const DEFAULT_RESERVATION_URL = "https://madzhairco.vercel.app/?to=reservasi";
const POSTER_BRAND_NAME = "Madzhair Barber & Co";

function subscribeNoop(): () => void {
  return () => {};
}

function getClientBookingUrl(): string {
  if (typeof window === "undefined") {
    return DEFAULT_RESERVATION_URL;
  }
  return `${window.location.origin}/?to=reservasi`;
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

function copyTextFallback(text: string): boolean {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
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

  const displayBrandName =
    storeName && !/madzhair\.co/i.test(storeName)
      ? storeName
      : POSTER_BRAND_NAME;

  useEffect(() => {
    if (!modalOpen) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    void QRCode.toCanvas(canvas, bookingUrl, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "H",
      color: {
        dark: "#2B2B2B",
        light: "#FFFFFF",
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
    let copiedOk = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(bookingUrl);
        copiedOk = true;
      } else {
        copiedOk = copyTextFallback(bookingUrl);
      }
    } catch {
      copiedOk = copyTextFallback(bookingUrl);
    }

    if (copiedOk) {
      setCopied(true);
      onNotify?.("success", "Link booking pelanggan disalin ke clipboard.");
      window.setTimeout(() => setCopied(false), 2500);
    } else {
      onNotify?.(
        "error",
        "Gagal menyalin link. Salin manual dari alamat yang tampil."
      );
    }
  };

  const loadLogoImage = (src: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  const handleDownloadPrintablePng = async () => {
    setDownloading(true);
    try {
      const targetUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/?to=reservasi`
          : bookingUrl;

      const qrCanvas = document.createElement("canvas");
      const [logoImg] = await Promise.all([
        loadLogoImage("/images/brand/madzhair-logo-dark.png"),
        QRCode.toCanvas(qrCanvas, targetUrl, {
          width: 720,
          margin: 2,
          errorCorrectionLevel: "H",
          color: {
            dark: "#2B2B2B",
            light: "#FFFFFF",
          },
        }),
      ]);

      const poster = document.createElement("canvas");
      poster.width = 1200;
      poster.height = 1600;
      const ctx = poster.getContext("2d");
      if (!ctx) return;

      // Background Latar Halaman Utama (#F7F7F7)
      ctx.fillStyle = "#F7F7F7";
      ctx.fillRect(0, 0, poster.width, poster.height);

      // Inner Card Putih (#FFFFFF) + Border Moonlit Silver (#B3B3B3)
      drawRoundedRect(ctx, 76, 76, 1048, 1448, 48);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#B3B3B3";
      ctx.stroke();

      // Top Charcoal Noir Accent Bar (#2B2B2B)
      drawRoundedRect(ctx, 480, 128, 240, 10, 5);
      ctx.fillStyle = "#2B2B2B";
      ctx.fill();

      // Logo Resmi MADZ HAIR.CO (atau teks fallback jika gagal muat)
      ctx.textAlign = "center";
      if (logoImg && logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0) {
        const logoH = 148;
        const logoW = Math.round(
          logoH * (logoImg.naturalWidth / logoImg.naturalHeight)
        );
        ctx.drawImage(logoImg, 600 - logoW / 2, 168, logoW, logoH);
      } else {
        ctx.fillStyle = "#1E1E1E";
        ctx.font = "700 60px Poppins, system-ui, sans-serif";
        ctx.fillText(displayBrandName, 600, 260);
      }

      // Location Subtitle (Ironclad Grey #565656)
      ctx.fillStyle = "#565656";
      ctx.font = "500 28px Poppins, system-ui, sans-serif";
      ctx.fillText("Sungai Kunyit, Kalimantan Barat", 600, 358);

      // QR Frame (#FFFFFF + border #B3B3B3)
      drawRoundedRect(ctx, 210, 400, 780, 780, 40);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#B3B3B3";
      ctx.stroke();

      ctx.drawImage(qrCanvas, 240, 430, 720, 720);

      // Instructions (Charcoal Noir #2B2B2B + Ironclad Grey #565656)
      ctx.fillStyle = "#2B2B2B";
      ctx.font = "700 40px Poppins, system-ui, sans-serif";
      ctx.fillText("SCAN UNTUK BOOKING KURSI", 600, 1255);

      ctx.fillStyle = "#565656";
      ctx.font = "500 30px Poppins, system-ui, sans-serif";
      ctx.fillText(
        "Arahkan kamera HP untuk pilih layanan & jam",
        600,
        1314
      );
      ctx.fillText("tanpa perlu antre dan tanpa buat akun.", 600, 1356);

      // URL Footer (Urban Fog #848484)
      ctx.fillStyle = "#848484";
      ctx.font = "600 24px Poppins, system-ui, sans-serif";
      ctx.fillText(targetUrl.replace(/^https?:\/\//, ""), 600, 1450);

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
      <div className="rounded-2xl border border-[#B3B3B3] bg-[#FFFFFF] p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#B3B3B3] bg-[#E0E0E0] text-[#2B2B2B]">
              <QrCode aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-sans text-sm font-semibold text-[#2B2B2B]">
                QR Code Studio &amp; Link Booking
              </h3>
              <p className="mt-0.5 truncate font-sans text-xs text-[#565656]">
                {displayHost}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2B2B2B] px-4 font-sans text-xs font-semibold text-[#FFFFFF] transition-colors hover:bg-[#1F1F1F] sm:w-auto"
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#2B2B2B]/60 sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[#B3B3B3] bg-[#FFFFFF] px-4 pt-3 pb-safe font-sans shadow-2xl sm:rounded-2xl sm:p-5"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#B3B3B3] sm:hidden"
            />

            <div className="flex items-start justify-between gap-3 border-b border-[#E0E0E0] pb-3">
              <div>
                <p className="text-xs font-semibold text-[#565656]">
                  Poster Meja Kasir &amp; Cermin
                </p>
                <h2
                  id="studio-qr-modal-title"
                  className="mt-0.5 text-base font-semibold text-[#2B2B2B] sm:text-lg"
                >
                  QR Code Reservasi Studio
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Tutup pratinjau QR Code"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[#B3B3B3] bg-[#F7F7F7] text-[#565656] hover:border-[#2B2B2B] hover:text-[#2B2B2B]"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center rounded-2xl border border-[#B3B3B3] bg-[#F7F7F7] p-4 text-center">
              <BrandMark variant="compact" size="sm" shortWordmark className="mb-3" />
              <canvas
                ref={previewCanvasRef}
                width={220}
                height={220}
                aria-label={`QR Code Reservasi ${displayBrandName}`}
                className="h-[196px] w-[196px] rounded-xl border border-[#E0E0E0] bg-[#FFFFFF]"
              />
              <p className="mt-2.5 text-xs font-semibold text-[#2B2B2B]">
                Sungai Kunyit, Kalimantan Barat
              </p>
              <p className="mt-0.5 break-all text-[11px] text-[#565656]">
                {displayHost}
              </p>
            </div>

            <div className="mt-4 space-y-2 pb-2">
              <button
                type="button"
                disabled={downloading}
                onClick={() => void handleDownloadPrintablePng()}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#2B2B2B] px-4 font-sans text-xs font-semibold text-[#FFFFFF] transition-colors hover:bg-[#1F1F1F] disabled:opacity-50 sm:text-sm"
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
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#B3B3B3] bg-[#F7F7F7] px-3 font-sans text-xs font-semibold text-[#2B2B2B] transition-colors hover:border-[#2B2B2B] hover:bg-[#E0E0E0]"
                >
                  {copied ? (
                    <Check aria-hidden="true" className="h-3.5 w-3.5 text-[#2B2B2B]" />
                  ) : (
                    <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  <span>{copied ? "Link Disalin" : "Salin Link Booking"}</span>
                </button>

                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#B3B3B3] bg-[#FFFFFF] px-3 font-sans text-xs font-semibold text-[#2B2B2B] transition-colors hover:border-[#2B2B2B] hover:bg-[#F7F7F7]"
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
