import { NextRequest, NextResponse } from "next/server";
import { checkBookingRateLimit, extractClientIp } from "@/lib/security/rate-limit";
import {
  checkHoneypot,
  sanitizeCustomerName,
  validateServiceTimeFormat,
} from "@/lib/security/sanitize";
import {
  DEFAULT_CLOSED_DATES,
  DEFAULT_SERVICES,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_WEEKLY_SCHEDULES,
  generateDemoTicketCode,
} from "@/lib/seed";
import { calculateAvailableSlots, formatTimeHHMM } from "@/lib/slots";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/types/database";

const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEMO_BOOKINGS_KEY = "__madzhair_demo_bookings__";

interface CreateBookingRequestBody {
  serviceId?: unknown;
  customerName?: unknown;
  bookingDate?: unknown;
  startTime?: unknown;
  website?: unknown;
}

function getDemoBookingsStore(): Booking[] {
  const globalObj = globalThis as typeof globalThis & {
    [DEMO_BOOKINGS_KEY]?: Booking[];
  };

  if (!globalObj[DEMO_BOOKINGS_KEY]) {
    globalObj[DEMO_BOOKINGS_KEY] = [];
  }

  return globalObj[DEMO_BOOKINGS_KEY];
}

function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_YYYY_MM_DD_REGEX.test(dateStr)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function mapRpcError(message: string): { status: number; error: string } {
  const upper = message.toUpperCase();

  if (upper.includes("SLOT_UNAVAILABLE")) {
    return {
      status: 409,
      error: "Maaf, slot jam tersebut baru saja terisi. Silakan pilih jam lain.",
    };
  }

  if (
    upper.includes("OUTSIDE_OPERATING_HOURS") ||
    upper.includes("OUTSIDE_HOURS")
  ) {
    return {
      status: 400,
      error: "Jam yang dipilih berada di luar jam operasional toko.",
    };
  }

  if (upper.includes("STORE_CLOSED") || upper.includes("DATE_CLOSED") || upper.includes("CLOSED")) {
    return {
      status: 400,
      error: "Toko sedang tutup pada tanggal yang dipilih.",
    };
  }

  if (upper.includes("SLOT_LEAD_TIME_EXPIRED")) {
    return {
      status: 400,
      error: "Batas waktu pemesanan untuk jam tersebut sudah lewat.",
    };
  }

  if (upper.includes("PAST_DATE")) {
    return {
      status: 400,
      error: "Tanggal booking tidak boleh di masa lalu.",
    };
  }

  if (upper.includes("INVALID_SLOT_GRID")) {
    return {
      status: 400,
      error: "Booking online hanya tersedia pada grid jam bulat per 1 jam.",
    };
  }

  if (upper.includes("SERVICE_NOT_FOUND")) {
    return {
      status: 400,
      error: "Layanan tidak ditemukan atau sedang tidak aktif.",
    };
  }

  if (upper.includes("INVALID_CUSTOMER_NAME")) {
    return {
      status: 400,
      error: "Nama pelanggan wajib 2 hingga 40 karakter.",
    };
  }

  return {
    status: 400,
    error: "Permintaan booking tidak dapat diproses. Periksa kembali jadwal Anda.",
  };
}

export async function POST(request: NextRequest) {
  const clientIp = extractClientIp(request.headers);
  const rateLimit = checkBookingRateLimit(clientIp);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan booking. Coba lagi dalam ${rateLimit.retryAfterSeconds} detik.`,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  let body: CreateBookingRequestBody;
  try {
    body = (await request.json()) as CreateBookingRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Payload JSON tidak valid." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Data booking wajib diisi." },
      { status: 400 }
    );
  }

  // Silent fake success for automated bots triggering the hidden honeypot field
  if (checkHoneypot(body.website)) {
    const fakeCode = generateDemoTicketCode();
    const nowIso = new Date().toISOString();
    const fakeBooking: Booking = {
      id: "00000000-0000-4000-8000-000000000000",
      ticket_code: fakeCode,
      service_id: DEFAULT_SERVICES[0].id,
      service_name: DEFAULT_SERVICES[0].name,
      customer_name: "Pelanggan",
      booking_date:
        typeof body.bookingDate === "string" && isValidCalendarDate(body.bookingDate)
          ? body.bookingDate
          : nowIso.slice(0, 10),
      start_time: "14:00:00",
      end_time: "15:00:00",
      status: "BOOKED",
      source: "ONLINE",
      notes: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    return NextResponse.json(
      { booking: fakeBooking, mode: "demo" },
      { status: 200 }
    );
  }

  const serviceId =
    typeof body.serviceId === "string" ? body.serviceId.trim() : "";
  if (!serviceId) {
    return NextResponse.json(
      { error: "Layanan wajib dipilih." },
      { status: 400 }
    );
  }

  const sanitizedName = sanitizeCustomerName(body.customerName);
  if (!sanitizedName.valid) {
    return NextResponse.json(
      { error: sanitizedName.error ?? "Nama pelanggan tidak valid." },
      { status: 400 }
    );
  }

  const bookingDate =
    typeof body.bookingDate === "string" ? body.bookingDate.trim() : "";
  if (!isValidCalendarDate(bookingDate)) {
    return NextResponse.json(
      { error: "Format tanggal booking wajib YYYY-MM-DD yang valid." },
      { status: 400 }
    );
  }

  const rawStartTime =
    typeof body.startTime === "string" ? body.startTime.trim() : "";
  if (!validateServiceTimeFormat(rawStartTime)) {
    return NextResponse.json(
      { error: "Format jam mulai tidak valid (gunakan HH:MM)." },
      { status: 400 }
    );
  }

  const normalizedHHMM = formatTimeHHMM(rawStartTime);
  if (!normalizedHHMM.endsWith(":00")) {
    return NextResponse.json(
      { error: "Booking online hanya tersedia pada jam bulat per 1 jam." },
      { status: 400 }
    );
  }
  const startTimeSql = `${normalizedHHMM}:00`;

  // Mode 1: Supabase RPC atomic booking
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Koneksi server booking tidak tersedia." },
        { status: 503 }
      );
    }

    const { data, error } = await supabase.rpc("create_booking_safe", {
      p_service_id: serviceId,
      p_customer_name: sanitizedName.value,
      p_booking_date: bookingDate,
      p_start_time: startTimeSql,
      p_source: "ONLINE",
    });

    if (error) {
      const mapped = mapRpcError(error.message ?? "");
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Booking gagal dibuat. Silakan coba lagi." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { booking: data, mode: "supabase" },
      { status: 201 }
    );
  }

  // Mode 2: Local demo mode fallback when Supabase env is not configured
  const service = DEFAULT_SERVICES.find(
    (item) => item.id === serviceId || item.slug === serviceId
  );

  if (!service || !service.is_active) {
    return NextResponse.json(
      { error: "Layanan tidak ditemukan." },
      { status: 400 }
    );
  }

  const demoStore = getDemoBookingsStore();
  const slots = calculateAvailableSlots({
    date: bookingDate,
    service,
    schedules: DEFAULT_WEEKLY_SCHEDULES,
    closedDates: DEFAULT_CLOSED_DATES,
    bookings: demoStore,
    settings: DEFAULT_STORE_SETTINGS,
  });

  if (slots.length === 0) {
    return NextResponse.json(
      { error: "Toko sedang tutup pada tanggal yang dipilih." },
      { status: 400 }
    );
  }

  const targetSlot = slots.find((slot) => slot.time === normalizedHHMM);
  if (!targetSlot) {
    return NextResponse.json(
      { error: "Jam yang dipilih di luar jam operasional toko." },
      { status: 400 }
    );
  }

  if (!targetSlot.available) {
    const isConflict =
      targetSlot.status === "BOOKED" ||
      targetSlot.status === "INSUFFICIENT_TIME";
    return NextResponse.json(
      {
        error:
          targetSlot.reason ??
          (isConflict
            ? "Slot tidak tersedia atau waktu tidak mencukupi."
            : "Batas waktu pemesanan sudah lewat."),
      },
      { status: isConflict ? 409 : 400 }
    );
  }

  const existingCodes = new Set(demoStore.map((item) => item.ticket_code));
  const ticketCode = generateDemoTicketCode(existingCodes);
  const nowIso = new Date().toISOString();

  const demoBooking: Booking = {
    id: globalThis.crypto.randomUUID(),
    ticket_code: ticketCode,
    service_id: service.id,
    service_name: service.name,
    customer_name: sanitizedName.value,
    booking_date: bookingDate,
    start_time: startTimeSql,
    end_time: `${targetSlot.endTime}:00`,
    status: "BOOKED",
    source: "ONLINE",
    notes: null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  demoStore.push(demoBooking);

  return NextResponse.json(
    { booking: demoBooking, mode: "demo" },
    { status: 201 }
  );
}
