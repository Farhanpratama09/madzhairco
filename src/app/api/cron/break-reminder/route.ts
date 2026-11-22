import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendPushToAllAdmins } from "@/lib/push/web-push";
import {
  formatTimeHHMM,
  getStoreNowParts,
  parseTimeToMinutes,
} from "@/lib/slots";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ClosedDate, StoreSettings, WeeklySchedule } from "@/types/database";

function verifyBearerSecret(
  authHeader: string | null,
  expectedSecret: string
): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const provided = authHeader.slice("Bearer ".length).trim();
  if (!provided) {
    return false;
  }

  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expectedSecret, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}

function subtractDaysFromDateStr(
  dateStr: string,
  daysToSubtract: number
): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number.parseInt(yearStr ?? "0", 10);
  const month = Number.parseInt(monthStr ?? "1", 10);
  const day = Number.parseInt(dayStr ?? "1", 10);
  const utcDate = new Date(Date.UTC(year, month - 1, day - daysToSubtract));
  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utcDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface HistoricalCleanupSummary {
  todayWib: string;
  bookingsCutoffDate: string;
  closedDatesCutoffDate: string;
  deletedBookingContacts: number;
  deletedBookings: number;
  deletedClosedDates: number;
}

async function runHistoricalCleanup(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  todayWibStr: string
): Promise<HistoricalCleanupSummary> {
  // Retensi H-1: simpan hari ini & kemarin (H-1), hapus booking_date < (hari ini WIB - 1 hari)
  const bookingsCutoffDate = subtractDaysFromDateStr(todayWibStr, 1);
  // Retensi 7 hari untuk closed_dates: hapus closed_date < (hari ini WIB - 7 hari)
  const closedDatesCutoffDate = subtractDaysFromDateStr(todayWibStr, 7);

  let deletedBookingContacts = 0;
  let deletedBookings = 0;
  let deletedClosedDates = 0;

  try {
    // 1. Ambil ID booking lama (booking_date < hari ini WIB - 1 hari)
    const { data: oldBookingRows } = await supabase
      .from("bookings")
      .select("id")
      .lt("booking_date", bookingsCutoffDate);

    const oldBookingIds = Array.isArray(oldBookingRows)
      ? oldBookingRows
          .map((row) => (row as { id?: string }).id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    // 2. Hapus booking_contacts untuk booking lama secara eksplisit
    if (oldBookingIds.length > 0) {
      const { data: deletedContactsRows } = await supabase
        .from("booking_contacts")
        .delete()
        .in("booking_id", oldBookingIds)
        .select("booking_id");

      if (Array.isArray(deletedContactsRows)) {
        deletedBookingContacts = deletedContactsRows.length;
      }
    }

    // 3. Hapus bookings dengan booking_date < (hari ini WIB - 1 hari)
    const { data: deletedBookingRows } = await supabase
      .from("bookings")
      .delete()
      .lt("booking_date", bookingsCutoffDate)
      .select("id");

    if (Array.isArray(deletedBookingRows)) {
      deletedBookings = deletedBookingRows.length;
    }

    // 4. Hapus closed_dates dengan closed_date < (hari ini WIB - 7 hari)
    const { data: deletedClosedRows } = await supabase
      .from("closed_dates")
      .delete()
      .lt("closed_date", closedDatesCutoffDate)
      .select("id");

    if (Array.isArray(deletedClosedRows)) {
      deletedClosedDates = deletedClosedRows.length;
    }
  } catch (err) {
    console.error("[cron/break-reminder] Historical cleanup error:", err);
  }

  return {
    todayWib: todayWibStr,
    bookingsCutoffDate,
    closedDatesCutoffDate,
    deletedBookingContacts,
    deletedBookings,
    deletedClosedDates,
  };
}

async function handleBreakReminder(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";

  // Fail-closed: refuse execution if CRON_SECRET is missing or empty
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET belum dikonfigurasi di server." },
      { status: 503 }
    );
  }

  if (!verifyBearerSecret(authHeader, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server." },
      { status: 503 }
    );
  }

  const [settingsRes, schedulesRes, closedDatesRes] = await Promise.all([
    supabase
      .from("store_settings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("weekly_schedules")
      .select("*")
      .order("day_of_week", { ascending: true }),
    supabase.from("closed_dates").select("*"),
  ]);

  if (settingsRes.error) {
    return NextResponse.json(
      {
        error: "Gagal membaca store_settings dari Supabase.",
        code: settingsRes.error.code ?? null,
        detail: settingsRes.error.message,
      },
      { status: 500 }
    );
  }

  if (schedulesRes.error || closedDatesRes.error) {
    const dbErr = schedulesRes.error ?? closedDatesRes.error;
    return NextResponse.json(
      {
        error: "Gagal membaca jadwal operasional dari Supabase.",
        code: dbErr?.code ?? null,
        detail: dbErr?.message ?? null,
      },
      { status: 500 }
    );
  }

  const settings = settingsRes.data as StoreSettings | null;
  // Always compute local time using valid IANA timezone (Asia/Pontianak for Sungai Kunyit, Kalimantan Barat)
  const nowParts = getStoreNowParts(settings?.timezone || "Asia/Pontianak");
  const todayStr = nowParts.dateStr;

  // Jalankan auto-cleanup riwayat lama (booking_contacts & bookings < H-1 WIB, closed_dates < H-7 WIB)
  const cleanup = await runHistoricalCleanup(supabase, todayStr);

  if (!settings) {
    return NextResponse.json(
      { skipped: true, reason: "store_settings tidak ditemukan", cleanup },
      { status: 200 }
    );
  }

  if (settings.is_force_closed) {
    return NextResponse.json(
      { skipped: true, reason: "Studio sedang tutup darurat", cleanup },
      { status: 200 }
    );
  }

  if (!settings.break_enabled) {
    return NextResponse.json(
      { skipped: true, reason: "Jam istirahat harian nonaktif", cleanup },
      { status: 200 }
    );
  }

  // Idempotency guard: send at most once per local date
  if (settings.break_reminder_sent_date === todayStr) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Pengingat hari ini sudah terkirim",
        date: todayStr,
        cleanup,
      },
      { status: 200 }
    );
  }

  const schedules = (schedulesRes.data as WeeklySchedule[] | null) ?? [];
  const closedDates = (closedDatesRes.data as ClosedDate[] | null) ?? [];

  const todaySchedule = schedules.find(
    (row) => row.day_of_week === nowParts.dayOfWeek
  );
  if (!todaySchedule || !todaySchedule.is_open) {
    return NextResponse.json(
      { skipped: true, reason: "Hari ini libur rutin", date: todayStr, cleanup },
      { status: 200 }
    );
  }

  const todayClosed = closedDates.find((row) => row.closed_date === todayStr);
  if (todayClosed && !todayClosed.close_from_time) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Studio tutup seharian hari ini",
        date: todayStr,
        cleanup,
      },
      { status: 200 }
    );
  }

  const breakEndMinutes = parseTimeToMinutes(settings.break_end || "18:30:00");
  const regularCloseMinutes = parseTimeToMinutes(todaySchedule.close_time);
  const effectiveCloseMinutes = todayClosed?.close_from_time
    ? Math.min(
        regularCloseMinutes,
        parseTimeToMinutes(todayClosed.close_from_time)
      )
    : regularCloseMinutes;

  if (effectiveCloseMinutes <= breakEndMinutes) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Studio sudah tutup sebelum jam istirahat selesai",
        date: todayStr,
        cleanup,
      },
      { status: 200 }
    );
  }

  // Safe external-cron window: [break_end - 15 menit, break_end + 5 menit] (Asia/Pontianak)
  const windowStart = breakEndMinutes - 15;
  const windowEnd = breakEndMinutes + 5;
  if (
    nowParts.minutesFromMidnight < windowStart ||
    nowParts.minutesFromMidnight > windowEnd
  ) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Di luar jendela pengingat istirahat",
        nowWib: nowParts.timeStr,
        breakEndWib: formatTimeHHMM(settings.break_end || "18:30:00"),
        cleanup,
      },
      { status: 200 }
    );
  }

  // Claim idempotency atomically before sending to prevent duplicate dispatches on concurrent cron retries
  const { data: claimed, error: claimError } = await supabase
    .from("store_settings")
    .update({ break_reminder_sent_date: todayStr })
    .eq("id", settings.id)
    .or(
      `break_reminder_sent_date.is.null,break_reminder_sent_date.neq.${todayStr}`
    )
    .select("id")
    .maybeSingle();

  if (claimError || !claimed) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Sudah diklaim proses lain",
        date: todayStr,
        cleanup,
      },
      { status: 200 }
    );
  }

  const breakEndLabel = formatTimeHHMM(settings.break_end || "18:30:00");
  const pushSummary = await sendPushToAllAdmins(
    {
      title: "Jam Istirahat Segera Selesai",
      body: `Istirahat selesai pukul ${breakEndLabel} WIB. Cek antrean kursi sesi malam di Madzhair Barber & Co.`,
      url: "/admin",
      tag: `break-reminder-${todayStr}`,
    },
    supabase
  );

  return NextResponse.json(
    {
      triggered: true,
      date: todayStr,
      nowWib: nowParts.timeStr,
      breakEndWib: breakEndLabel,
      push: pushSummary,
      cleanup,
    },
    { status: 200 }
  );
}

export async function GET(request: NextRequest) {
  return handleBreakReminder(request);
}

export async function POST(request: NextRequest) {
  return handleBreakReminder(request);
}
