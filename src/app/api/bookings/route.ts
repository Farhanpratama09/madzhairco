import { NextRequest, NextResponse } from "next/server";
import { sendPushToAllAdmins } from "@/lib/push/web-push";
import {
  consumeBookingIpAttempt,
  consumeBookingPhoneAttempt,
  extractClientIp,
} from "@/lib/security/rate-limit";
import {
  checkHoneypot,
  MAX_PAYLOAD_CHARS,
  normalizeWhatsappPhone,
  sanitizeCustomerName,
  validateOptionalTextNote,
  validateServiceTimeFormat,
} from "@/lib/security/sanitize";
import {
  DEFAULT_CLOSED_DATES,
  DEFAULT_SERVICES,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_WEEKLY_SCHEDULES,
  generateDemoTicketCode,
} from "@/lib/seed";
import {
  calculateAvailableSlots,
  formatTimeHHMM,
  getStoreNowParts,
  isAlignedTo15MinGrid,
  parseTimeToMinutes,
} from "@/lib/slots";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Booking } from "@/types/database";

const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEMO_BOOKINGS_KEY = "__madzhair_demo_bookings__";
const DEMO_CONTACTS_KEY = "__madzhair_demo_booking_phones__";
const MAX_DEMO_BOOKINGS = 500;
const MAX_ADVANCE_BOOKING_DAYS = 21;
const MAX_ACTIVE_BOOKINGS_PER_PHONE = 2;

interface CreateBookingRequestBody {
  serviceId?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  bookingDate?: unknown;
  startTime?: unknown;
  notes?: unknown;
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

function getDemoContactsStore(): Map<string, string> {
  const globalObj = globalThis as typeof globalThis & {
    [DEMO_CONTACTS_KEY]?: Map<string, string>;
  };

  if (!globalObj[DEMO_CONTACTS_KEY]) {
    globalObj[DEMO_CONTACTS_KEY] = new Map<string, string>();
  }

  return globalObj[DEMO_CONTACTS_KEY];
}

function pushBoundedDemoBooking(booking: Booking, phone: string): void {
  const demoStore = getDemoBookingsStore();
  const demoContacts = getDemoContactsStore();

  while (demoStore.length >= MAX_DEMO_BOOKINGS) {
    const evicted = demoStore.shift();
    if (evicted) {
      demoContacts.delete(evicted.id);
    }
  }

  demoStore.push(booking);
  demoContacts.set(booking.id, phone);
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

function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = Number.parseInt(yStr ?? "1970", 10);
  const month = Number.parseInt(mStr ?? "1", 10);
  const day = Number.parseInt(dStr ?? "1", 10);
  const target = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, "0");
  const d = String(target.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isDemoBookingOverdue(
  booking: Booking,
  todayDateStr: string,
  nowMinutesFromMidnight: number
): boolean {
  if (booking.booking_date < todayDateStr) {
    return true;
  }
  if (booking.booking_date > todayDateStr) {
    return false;
  }
  return parseTimeToMinutes(booking.end_time) + 15 <= nowMinutesFromMidnight;
}

function mapRpcError(
  message: string,
  code?: string | null
): { status: number; error: string; conflict: boolean } {
  const upper = message.toUpperCase();
  const sqlCode = (code ?? "").toUpperCase();

  if (upper.includes("MAX_ACTIVE_BOOKINGS_PER_PHONE")) {
    return {
      status: 429,
      conflict: false,
      error:
        "Nomor WhatsApp ini sudah memiliki 2 reservasi aktif. Selesaikan atau hubungi studio bila ingin mengubah jadwal.",
    };
  }

  if (upper.includes("DATE_TOO_FAR_AHEAD")) {
    return {
      status: 400,
      conflict: false,
      error: `Reservasi online maksimal ${MAX_ADVANCE_BOOKING_DAYS} hari ke depan.`,
    };
  }

  if (
    upper.includes("SLOT_UNAVAILABLE") ||
    sqlCode === "23505" ||
    sqlCode === "23P01" ||
    sqlCode === "40001"
  ) {
    return {
      status: 409,
      conflict: true,
      error:
        "Maaf, slot jam tersebut baru saja terisi oleh pelanggan lain. Silakan pilih jam lain yang tersedia.",
    };
  }

  if (upper.includes("BREAK_TIME_CONFLICT")) {
    return {
      status: 409,
      conflict: true,
      error: "Jam yang dipilih beririsan dengan waktu istirahat studio.",
    };
  }

  if (
    upper.includes("OUTSIDE_OPERATING_HOURS") ||
    upper.includes("OUTSIDE_HOURS")
  ) {
    return {
      status: 409,
      conflict: true,
      error: "Jam yang dipilih berada di luar jam operasional toko.",
    };
  }

  if (
    upper.includes("STORE_CLOSED") ||
    upper.includes("DATE_CLOSED") ||
    upper.includes("CLOSED")
  ) {
    return {
      status: 409,
      conflict: true,
      error: "Toko sedang tutup pada tanggal yang dipilih.",
    };
  }

  if (upper.includes("SLOT_LEAD_TIME_EXPIRED")) {
    return {
      status: 409,
      conflict: true,
      error: "Batas waktu pemesanan untuk jam tersebut sudah lewat.",
    };
  }

  if (upper.includes("PAST_DATE")) {
    return {
      status: 400,
      conflict: false,
      error: "Tanggal booking tidak boleh di masa lalu.",
    };
  }

  if (upper.includes("INVALID_SLOT_GRID")) {
    return {
      status: 400,
      conflict: false,
      error:
        "Jam mulai reservasi harus kelipatan 15 menit (:00, :15, :30, atau :45).",
    };
  }

  if (upper.includes("SERVICE_NOT_FOUND")) {
    return {
      status: 400,
      conflict: false,
      error: "Layanan tidak ditemukan atau sedang tidak aktif.",
    };
  }

  if (upper.includes("INVALID_CUSTOMER_NAME")) {
    return {
      status: 400,
      conflict: false,
      error: "Nama pelanggan wajib 2 hingga 80 karakter.",
    };
  }

  if (upper.includes("INVALID_CUSTOMER_PHONE")) {
    return {
      status: 400,
      conflict: false,
      error:
        "Nomor WhatsApp tidak valid. Gunakan nomor aktif (contoh: 081234567890).",
    };
  }

  return {
    status: 400,
    conflict: false,
    error:
      "Permintaan booking tidak dapat diproses. Periksa kembali jadwal Anda.",
  };
}

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (!isValidCalendarDate(dateParam)) {
    return NextResponse.json(
      { error: "Parameter tanggal (date=YYYY-MM-DD) tidak valid." },
      { status: 400 }
    );
  }

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Koneksi server booking tidak tersedia." },
        { status: 503 }
      );
    }

    const { data, error } = await supabase.rpc("get_public_bookings_for_date", {
      p_date: dateParam,
    });

    if (error) {
      return NextResponse.json(
        { error: "Gagal memuat slot jadwal terbaru." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        bookings: Array.isArray(data) ? data : [],
        mode: "supabase",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  const demoStore = getDemoBookingsStore();
  const nowParts = getStoreNowParts(DEFAULT_STORE_SETTINGS.timezone);
  const publicSlots = demoStore
    .filter(
      (b) =>
        b.booking_date === dateParam &&
        b.status === "BOOKED" &&
        !isDemoBookingOverdue(b, nowParts.dateStr, nowParts.minutesFromMidnight)
    )
    .map((b) => ({
      id: b.id,
      booking_date: b.booking_date,
      start_time: b.start_time,
      end_time: b.end_time,
      status: b.status,
    }));

  return NextResponse.json(
    {
      bookings: publicSlots,
      mode: "demo",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const clientIp = extractClientIp(request.headers);

  // Catat kuota agregat IP pada SETIAP percobaan POST (termasuk payload cacat/fuzzing)
  const ipRateLimit = consumeBookingIpAttempt(clientIp);
  if (!ipRateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan booking. Coba lagi dalam ${ipRateLimit.retryAfterSeconds} detik.`,
        retryAfterSeconds: ipRateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(ipRateLimit.retryAfterSeconds),
        },
      }
    );
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Payload request tidak dapat dibaca." },
      { status: 400 }
    );
  }

  if (rawText.length > MAX_PAYLOAD_CHARS) {
    return NextResponse.json(
      {
        error: `Ukuran payload melebihi batas maksimum (${MAX_PAYLOAD_CHARS} karakter).`,
      },
      { status: 400 }
    );
  }

  let body: CreateBookingRequestBody;
  try {
    body = JSON.parse(rawText) as CreateBookingRequestBody;
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
      end_time: "14:45:00",
      status: "BOOKED",
      source: "ONLINE",
      notes: null,
      rescheduled_at: null,
      previous_date: null,
      previous_start_time: null,
      previous_end_time: null,
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
  if (!serviceId || serviceId.length > 80) {
    return NextResponse.json(
      { error: "Layanan wajib dipilih dengan ID yang valid." },
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

  const validatedNotes = validateOptionalTextNote(body.notes, "Catatan booking");
  if (!validatedNotes.valid) {
    return NextResponse.json(
      { error: validatedNotes.error ?? "Catatan booking maksimal 200 karakter." },
      { status: 400 }
    );
  }

  const normalizedPhone = normalizeWhatsappPhone(body.customerPhone);
  if (!normalizedPhone.valid) {
    return NextResponse.json(
      { error: normalizedPhone.error ?? "Nomor WhatsApp tidak valid." },
      { status: 400 }
    );
  }

  // Catat kuota ketat per kombinasi (IP + nomor WhatsApp) (maks 3 percobaan / 10 menit) di setiap percobaan
  const phoneIpRateLimit = consumeBookingPhoneAttempt(
    clientIp,
    normalizedPhone.value
  );
  if (!phoneIpRateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan booking untuk nomor WhatsApp ini. Coba lagi dalam ${phoneIpRateLimit.retryAfterSeconds} detik.`,
        retryAfterSeconds: phoneIpRateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(phoneIpRateLimit.retryAfterSeconds),
        },
      }
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

  const nowParts = getStoreNowParts(DEFAULT_STORE_SETTINGS.timezone);
  const maxAdvanceDateStr = addDaysToDateStr(
    nowParts.dateStr,
    MAX_ADVANCE_BOOKING_DAYS
  );
  if (bookingDate < nowParts.dateStr) {
    return NextResponse.json(
      { error: "Tanggal booking tidak boleh di masa lalu." },
      { status: 400 }
    );
  }
  if (bookingDate > maxAdvanceDateStr) {
    return NextResponse.json(
      {
        error: `Reservasi online maksimal ${MAX_ADVANCE_BOOKING_DAYS} hari ke depan.`,
      },
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
  if (!isAlignedTo15MinGrid(normalizedHHMM)) {
    return NextResponse.json(
      {
        error:
          "Jam mulai reservasi harus kelipatan 15 menit (:00, :15, :30, atau :45).",
      },
      { status: 400 }
    );
  }
  const startTimeSql = `${normalizedHHMM}:00`;

  // Mode 1: Supabase RPC atomic booking via server-only service_role client
  if (isSupabaseConfigured()) {
    const serviceSupabase = createServiceRoleClient();
    if (!serviceSupabase) {
      return NextResponse.json(
        { error: "Koneksi server booking tidak tersedia." },
        { status: 503 }
      );
    }

    const { data, error } = await serviceSupabase.rpc("create_booking_safe", {
      p_service_id: serviceId,
      p_customer_name: sanitizedName.value.slice(0, 80),
      p_booking_date: bookingDate,
      p_start_time: startTimeSql,
      p_source: "ONLINE",
      p_customer_phone: normalizedPhone.value,
    });

    if (error) {
      const mapped = mapRpcError(error.message ?? "", error.code ?? null);
      if (mapped.status !== 409 && mapped.status !== 429) {
        console.error(
          "[bookings] create_booking_safe RPC error:",
          error.code,
          error.message
        );
      }
      return NextResponse.json(
        { error: mapped.error, conflict: mapped.conflict },
        { status: mapped.status }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Booking gagal dibuat. Silakan coba lagi." },
        { status: 500 }
      );
    }

    const createdBooking = data as Booking;

    // Best-effort instant Web Push to admin cashier devices (never fails the booking)
    try {
      await sendPushToAllAdmins(
        {
          title: `Booking Baru · ${createdBooking.ticket_code}`,
          body: `${createdBooking.customer_name} — ${createdBooking.service_name} (${createdBooking.booking_date} ${formatTimeHHMM(
            createdBooking.start_time
          )} WIB)`,
          url: "/admin",
          tag: `booking-${createdBooking.ticket_code}`,
        },
        serviceSupabase
      );
    } catch {
      // Best-effort: ignore push dispatch errors
    }

    return NextResponse.json(
      { booking: createdBooking, mode: "supabase" },
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
  const demoContacts = getDemoContactsStore();

  // Bebaskan booking demo overdue (> end_time + 15 menit WIB) sebelum menghitung slot & kuota
  for (const item of demoStore) {
    if (
      item.status === "BOOKED" &&
      isDemoBookingOverdue(item, nowParts.dateStr, nowParts.minutesFromMidnight)
    ) {
      item.status = "COMPLETED";
    }
  }

  // Batasi maksimal 2 booking aktif per nomor WhatsApp (identik dengan create_booking_safe SQL)
  const activePhoneCount = demoStore.filter(
    (item) =>
      item.status === "BOOKED" &&
      item.booking_date >= nowParts.dateStr &&
      demoContacts.get(item.id) === normalizedPhone.value
  ).length;

  if (activePhoneCount >= MAX_ACTIVE_BOOKINGS_PER_PHONE) {
    return NextResponse.json(
      {
        error:
          "Nomor WhatsApp ini sudah memiliki 2 reservasi aktif. Selesaikan atau hubungi studio bila ingin mengubah jadwal.",
        conflict: false,
      },
      { status: 429 }
    );
  }

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
      targetSlot.status === "BREAK" ||
      targetSlot.status === "INSUFFICIENT_TIME";
    return NextResponse.json(
      {
        error:
          targetSlot.status === "BOOKED"
            ? "Maaf, slot jam tersebut baru saja terisi oleh pelanggan lain. Silakan pilih jam lain yang tersedia."
            : targetSlot.reason ??
              (isConflict
                ? "Slot tidak tersedia atau waktu tidak mencukupi."
                : "Batas waktu pemesanan sudah lewat."),
        conflict: isConflict,
      },
      { status: isConflict ? 409 : 400 }
    );
  }

  // Belt-and-suspenders interval overlap check: new_start < existing_end && new_end > existing_start
  const hasOverlapInDemo = demoStore.some((existing) => {
    if (existing.booking_date !== bookingDate || existing.status !== "BOOKED") {
      return false;
    }
    const existingStart = parseTimeToMinutes(existing.start_time);
    const existingEnd = parseTimeToMinutes(existing.end_time);
    return (
      targetSlot.startMinutes < existingEnd &&
      targetSlot.endMinutes > existingStart
    );
  });

  if (hasOverlapInDemo) {
    return NextResponse.json(
      {
        error:
          "Maaf, slot jam tersebut baru saja terisi oleh pelanggan lain. Silakan pilih jam lain yang tersedia.",
        conflict: true,
      },
      { status: 409 }
    );
  }

  const existingCodes = new Set(demoStore.map((item) => item.ticket_code));
  const ticketCode = generateDemoTicketCode(existingCodes);
  const nowIso = new Date().toISOString();

  const demoBooking: Booking = {
    id:
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ticket_code: ticketCode,
    service_id: service.id,
    service_name: service.name,
    customer_name: sanitizedName.value,
    booking_date: bookingDate,
    start_time: startTimeSql,
    end_time: `${targetSlot.endTime}:00`,
    status: "BOOKED",
    source: "ONLINE",
    notes: validatedNotes.value,
    rescheduled_at: null,
    previous_date: null,
    previous_start_time: null,
    previous_end_time: null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  pushBoundedDemoBooking(demoBooking, normalizedPhone.value);

  return NextResponse.json(
    { booking: demoBooking, mode: "demo" },
    { status: 201 }
  );
}
