"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { Download, QrCode } from "lucide-react";

const DEFAULT_RESERVATION_URL = "https://madzhair.vercel.app/#reservasi";

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

export function StudioQrCodeCard({ storeName }: StudioQrCodeCardProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bookingUrl = useSyncExternalStore(
    subscribeNoop,
    getClientBookingUrl,
    getServerBookingUrl
  );
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
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
  }, [bookingUrl]);

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

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="mx-auto flex shrink-0 flex-col items-center rounded-2xl border border-hairline bg-alabaster/65 p-3.5 sm:mx-0">
          <canvas
            ref={previewCanvasRef}
            width={220}
            height={220}
            aria-label={`QR Code Reservasi ${storeName}`}
            className="h-[180px] w-[180px] rounded-xl bg-surface sm:h-[200px] sm:w-[200px]"
          />
          <p className="mt-2 font-sans text-[11px] font-semibold text-ink">
            {storeName} · Sungai Kunyit
          </p>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2 text-terracotta">
            <QrCode aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="font-sans text-xs font-semibold">
              Poster Meja Kasir &amp; Cermin
            </span>
          </div>

          <h3 className="font-sans text-base font-semibold text-ink sm:text-lg">
            QR Code Reservasi Studio
          </h3>

          <p className="font-sans text-xs leading-relaxed text-muted sm:text-sm">
            Cetak dan tempel di kaca atau meja kasir studio. Pelanggan cukup
            scan dengan kamera HP untuk langsung memilih jadwal di{" "}
            <span className="font-semibold text-ink break-all">
              {bookingUrl.replace(/^https?:\/\//, "")}
            </span>
            .
          </p>

          <button
            type="button"
            disabled={downloading}
            onClick={() => void handleDownloadPrintablePng()}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 font-sans text-xs font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto sm:text-sm"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            <span>
              {downloading ? "Menyiapkan PNG..." : "Download PNG Siap Cetak"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
