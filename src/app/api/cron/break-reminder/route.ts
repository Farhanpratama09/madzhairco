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

async function handleBreakReminder(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";

  // Fail-closed: refuse execution if CRON_SECRET is missing or empty
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET belum dikonfigurasi di server." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
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
  if (!settings) {
    return NextResponse.json(
      { skipped: true, reason: "store_settings tidak ditemukan" },
      { status: 200 }
    );
  }

  if (settings.is_force_closed) {
    return NextResponse.json(
      { skipped: true, reason: "Studio sedang tutup darurat" },
      { status: 200 }
    );
  }

  if (!settings.break_enabled) {
    return NextResponse.json(
      { skipped: true, reason: "Jam istirahat harian nonaktif" },
      { status: 200 }
    );
  }

  // Always compute local time using valid IANA timezone (Asia/Pontianak for Sungai Kunyit, Kalimantan Barat)
  const nowParts = getStoreNowParts(settings.timezone || "Asia/Pontianak");
  const todayStr = nowParts.dateStr;

  // Idempotency guard: send at most once per local date
  if (settings.break_reminder_sent_date === todayStr) {
    return NextResponse.json(
      { skipped: true, reason: "Pengingat hari ini sudah terkirim", date: todayStr },
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
      { skipped: true, reason: "Hari ini libur rutin", date: todayStr },
      { status: 200 }
    );
  }

  const todayClosed = closedDates.find((row) => row.closed_date === todayStr);
  if (todayClosed && !todayClosed.close_from_time) {
    return NextResponse.json(
      { skipped: true, reason: "Studio tutup seharian hari ini", date: todayStr },
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
      { skipped: true, reason: "Sudah diklaim proses lain", date: todayStr },
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
