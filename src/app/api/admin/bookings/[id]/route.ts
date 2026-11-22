import { NextRequest, NextResponse } from "next/server";
import {
  MAX_PAYLOAD_CHARS,
  validateOptionalTextNote,
  validateServiceTimeFormat,
} from "@/lib/security/sanitize";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/types/database";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BookingAction = "reschedule" | "complete" | "cancel";

function normalizeTimeWithSeconds(time: string): string {
  const trimmed = time.trim();
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}

function mapRpcError(message: string): { status: number; error: string } {
  if (message.includes("UNAUTHORIZED")) {
    return { status: 401, error: "Unauthorized" };
  }
  if (message.includes("BOOKING_NOT_FOUND")) {
    return { status: 404, error: "Data booking tidak ditemukan." };
  }
  if (message.includes("BOOKING_NOT_ACTIVE")) {
    return {
      status: 409,
      error: "Jadwal hanya bisa digeser saat berstatus BOOKED.",
    };
  }
  if (message.includes("SLOT_UNAVAILABLE")) {
    return {
      status: 409,
      error: "Jam pengganti sudah terisi jadwal lain.",
    };
  }
  if (message.includes("BREAK_TIME_CONFLICT")) {
    return {
      status: 409,
      error: "Jam pengganti beririsan dengan waktu istirahat studio.",
    };
  }
  if (message.includes("OUTSIDE_OPERATING_HOURS")) {
    return {
      status: 409,
      error: "Jam pengganti berada di luar jam operasional toko.",
    };
  }
  if (message.includes("DATE_CLOSED")) {
    return {
      status: 409,
      error: "Toko tutup pada tanggal booking tersebut.",
    };
  }

  return {
    status: 400,
    error: "Gagal memperbarui status booking.",
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: "ID booking tidak valid." },
      { status: 400 }
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

  const { action, newStartTime, notes } = body as {
    action?: unknown;
    newStartTime?: unknown;
    notes?: unknown;
  };

  const notesCheck = validateOptionalTextNote(notes, "Catatan perubahan jadwal");
  if (!notesCheck.valid) {
    return NextResponse.json(
      { error: notesCheck.error ?? "Catatan maksimal 200 karakter." },
      { status: 400 }
    );
  }

  if (
    action !== "reschedule" &&
    action !== "complete" &&
    action !== "cancel"
  ) {
    return NextResponse.json(
      { error: "Aksi tidak valid. Gunakan reschedule, complete, atau cancel." },
      { status: 400 }
    );
  }

  type RpcCaller = {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  const rpcClient = supabase as unknown as RpcCaller;
  let rpcData: unknown = null;
  let rpcErrorMessage: string | null = null;

  if (action === "reschedule") {
    if (
      typeof newStartTime !== "string" ||
      !validateServiceTimeFormat(newStartTime.trim())
    ) {
      return NextResponse.json(
        { error: "Jam pengganti (newStartTime) wajib berformat HH:MM." },
        { status: 400 }
      );
    }

    const { data, error } = await rpcClient.rpc("reschedule_booking_safe", {
      p_booking_id: id,
      p_new_start_time: normalizeTimeWithSeconds(newStartTime),
    });

    rpcData = data;
    rpcErrorMessage = error?.message ?? null;
  } else if (action === ("complete" satisfies BookingAction)) {
    const { data, error } = await rpcClient.rpc("complete_booking_safe", {
      p_booking_id: id,
    });

    rpcData = data;
    rpcErrorMessage = error?.message ?? null;
  } else {
    const { data, error } = await rpcClient.rpc("cancel_booking_safe", {
      p_booking_id: id,
    });

    rpcData = data;
    rpcErrorMessage = error?.message ?? null;
  }

  if (rpcErrorMessage) {
    const mapped = mapRpcError(rpcErrorMessage);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const booking = Array.isArray(rpcData)
    ? (rpcData[0] as Booking | undefined)
    : (rpcData as Booking | null);

  if (!booking) {
    return NextResponse.json(
      { error: "Data booking tidak ditemukan setelah pembaruan." },
      { status: 404 }
    );
  }

  // Fetch private customer WhatsApp exclusively for authenticated admin sessions
  let customerPhone: string | null = null;
  try {
    const { data: contactRow } = await supabase
      .from("booking_contacts")
      .select("phone")
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (contactRow && typeof contactRow.phone === "string") {
      customerPhone = contactRow.phone;
    }
  } catch {
    customerPhone = null;
  }

  return NextResponse.json({ booking, customerPhone }, { status: 200 });
}
