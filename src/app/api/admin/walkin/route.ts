import { NextRequest, NextResponse } from "next/server";
import {
  MAX_PAYLOAD_CHARS,
  sanitizeCustomerName,
  validateOptionalTextNote,
  validateServiceTimeFormat,
} from "@/lib/security/sanitize";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/types/database";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) {
    return false;
  }

  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = Number.parseInt(yStr ?? "", 10);
  const month = Number.parseInt(mStr ?? "", 10);
  const day = Number.parseInt(dStr ?? "", 10);

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function normalizeTimeWithSeconds(time: string): string {
  const trimmed = time.trim();
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}

function mapRpcError(message: string): { status: number; error: string } {
  if (message.includes("UNAUTHORIZED")) {
    return { status: 401, error: "Unauthorized" };
  }
  if (message.includes("STORE_CLOSED")) {
    return {
      status: 409,
      error: "Toko sedang dalam mode Tutup Darurat. Buka toko terlebih dahulu.",
    };
  }
  if (message.includes("DATE_CLOSED")) {
    return {
      status: 409,
      error: "Toko libur atau tutup pada tanggal tersebut.",
    };
  }
  if (message.includes("OUTSIDE_OPERATING_HOURS")) {
    return {
      status: 409,
      error: "Jam walk-in berada di luar jam operasional atau melewati jam tutup.",
    };
  }
  if (message.includes("SLOT_UNAVAILABLE")) {
    return {
      status: 409,
      error: "Slot waktu tersebut baru saja terisi. Silakan muat ulang antrean.",
    };
  }
  if (message.includes("BREAK_TIME_CONFLICT")) {
    return {
      status: 409,
      error: "Slot walk-in beririsan dengan jam istirahat studio.",
    };
  }
  if (message.includes("SERVICE_NOT_FOUND")) {
    return { status: 404, error: "Layanan tidak ditemukan atau tidak aktif." };
  }
  if (message.includes("PAST_DATE")) {
    return { status: 400, error: "Tanggal walk-in tidak boleh di masa lalu." };
  }

  return {
    status: 400,
    error: "Gagal mencatat walk-in. Periksa ketersediaan slot dan coba lagi.",
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch {
    return NextResponse.json(
      { error: "Format payload JSON tidak valid." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Payload permintaan wajib berupa objek." },
      { status: 400 }
    );
  }

  const { serviceId, bookingDate, startTime, customerName, notes } = body as {
    serviceId?: unknown;
    bookingDate?: unknown;
    startTime?: unknown;
    customerName?: unknown;
    notes?: unknown;
  };

  let resolvedWalkinName = "Walk-in";
  if (customerName !== undefined && customerName !== null && customerName !== "") {
    const nameCheck = sanitizeCustomerName(customerName);
    if (!nameCheck.valid) {
      return NextResponse.json(
        { error: nameCheck.error ?? "Nama pelanggan walk-in tidak valid." },
        { status: 400 }
      );
    }
    resolvedWalkinName = nameCheck.value;
  }

  const notesCheck = validateOptionalTextNote(notes, "Catatan walk-in");
  if (!notesCheck.valid) {
    return NextResponse.json(
      { error: notesCheck.error ?? "Catatan walk-in maksimal 200 karakter." },
      { status: 400 }
    );
  }

  if (typeof serviceId !== "string" || !UUID_REGEX.test(serviceId.trim())) {
    return NextResponse.json(
      { error: "ID layanan tidak valid." },
      { status: 400 }
    );
  }

  if (typeof bookingDate !== "string" || !isValidCalendarDate(bookingDate.trim())) {
    return NextResponse.json(
      { error: "Format tanggal booking tidak valid (YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  if (typeof startTime !== "string" || !validateServiceTimeFormat(startTime.trim())) {
    return NextResponse.json(
      { error: "Format jam mulai tidak valid (HH:MM)." },
      { status: 400 }
    );
  }

  type RpcCaller = {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  const { data, error: rpcError } = await (supabase as unknown as RpcCaller).rpc(
    "create_booking_safe",
    {
      p_service_id: serviceId.trim(),
      p_customer_name: resolvedWalkinName,
      p_booking_date: bookingDate.trim(),
      p_start_time: normalizeTimeWithSeconds(startTime),
      p_source: "WALKIN",
      p_customer_phone: null,
    }
  );

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message ?? "");
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const booking = Array.isArray(data)
    ? (data[0] as Booking | undefined)
    : (data as Booking | null);

  if (!booking) {
    return NextResponse.json(
      { error: "Data booking walk-in tidak dikembalikan oleh server." },
      { status: 500 }
    );
  }

  return NextResponse.json({ booking }, { status: 201 });
}
