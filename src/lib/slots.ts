import type {
  Booking,
  ClosedDate,
  PublicBookingSlot,
  Service,
  SlotItem,
  StoreLiveStatus,
  StoreNowParts,
  StoreSettings,
  UpcomingDateItem,
  WeeklySchedule,
} from "@/types/database";

const DEFAULT_TIMEZONE = "Asia/Pontianak";

const DAY_NAMES_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const DAY_NAMES_FULL = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;
const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Formats a time string ("HH:MM:SS", "HH:MM", or "H:MM") to "HH:MM".
 */
export function formatTimeHHMM(time: string): string {
  const parts = time.trim().split(":");
  const hour = Number.parseInt(parts[0] ?? "0", 10);
  const minute = Number.parseInt(parts[1] ?? "0", 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return "00:00";
  }

  return `${pad2(Math.max(0, Math.min(23, hour)))}:${pad2(
    Math.max(0, Math.min(59, minute))
  )}`;
}

/**
 * Parses "HH:MM" or "HH:MM:SS" into minutes from midnight (0..1439+).
 */
export function parseTimeToMinutes(time: string): number {
  const parts = time.trim().split(":");
  const hour = Number.parseInt(parts[0] ?? "0", 10);
  const minute = Number.parseInt(parts[1] ?? "0", 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return 0;
  }

  return hour * 60 + minute;
}

/**
 * Converts minutes from midnight into "HH:MM" (or "HH:MM:SS" if includeSeconds=true).
 */
export function minutesToTime(
  totalMinutes: number,
  includeSeconds = false
): string {
  const clamped = Math.max(0, Math.floor(totalMinutes));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return includeSeconds
    ? `${pad2(hour)}:${pad2(minute)}:00`
    : `${pad2(hour)}:${pad2(minute)}`;
}

/**
 * Parses "YYYY-MM-DD" into UTC dayOfWeek (0 = Sunday .. 6 = Saturday) without local TZ drift.
 */
export function getDayOfWeekFromDateStr(dateStr: string): number {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number.parseInt(yearStr ?? "", 10);
  const month = Number.parseInt(monthStr ?? "", 10);
  const day = Number.parseInt(dayStr ?? "", 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return 0;
  }

  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Returns current date & time components in the store's configured timezone.
 */
export function getStoreNowParts(
  timezone: string = DEFAULT_TIMEZONE,
  now: Date = new Date()
): StoreNowParts {
  const safeTimezone = timezone?.trim() || DEFAULT_TIMEZONE;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }

  const partMap: Record<string, string> = {};
  for (const part of formatter.formatToParts(now)) {
    if (part.type !== "literal") {
      partMap[part.type] = part.value;
    }
  }

  const year = Number.parseInt(partMap.year ?? "1970", 10);
  const month = Number.parseInt(partMap.month ?? "1", 10);
  const day = Number.parseInt(partMap.day ?? "1", 10);
  const hour = Number.parseInt(partMap.hour ?? "0", 10) % 24;
  const minute = Number.parseInt(partMap.minute ?? "0", 10);

  const dateStr = `${year}-${pad2(month)}-${pad2(day)}`;
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const minutesFromMidnight = hour * 60 + minute;
  const timeStr = `${pad2(hour)}:${pad2(minute)}`;

  return {
    dateStr,
    dayOfWeek,
    minutesFromMidnight,
    timeStr,
    year,
    month,
    day,
    hour,
    minute,
  };
}

export interface CalculateAvailableSlotsInput {
  /** Target date YYYY-MM-DD */
  date: string;
  service: Pick<Service, "slot_duration_minutes">;
  schedules: WeeklySchedule[];
  closedDates: ClosedDate[];
  bookings: Array<
    Pick<Booking, "booking_date" | "start_time" | "end_time" | "status"> & {
      id?: string;
    }
  >;
  settings: Pick<
    StoreSettings,
    "is_force_closed" | "lead_time_minutes" | "timezone"
  > &
    Partial<Pick<StoreSettings, "break_enabled" | "break_start" | "break_end">>;
  nowParts?: StoreNowParts;
  /** Optional: bypass customer lead_time_minutes check (e.g. admin reschedule view) */
  ignoreLeadTime?: boolean;
  /** Optional: exclude a booking ID when computing reschedule slots */
  excludeBookingId?: string;
}

/**
 * Pure slot engine implementing PRD Section 3 + v1.9:
 * - Rounded 1-hour grid (e.g. 12:00, 13:00, ...)
 * - Overlap check: start < newEnd && end > newStart for BOOKED only (COMPLETED releases chair)
 * - 2-hour Hair Chemicals disables slots with < 120m before next booking, break_start, or effective close_time
 * - Daily break check (default 17:15-18:30 WIB): full service interval overlap
 *   (e.g. 16:00 open for 1h Haircut, INSUFFICIENT_TIME for 2h Hair Chemicals; 17:00 & 18:00 BREAK)
 * - Early close override (closed_dates.close_from_time): trims close_time ONLY for that date
 * - Enforces lead_time_minutes (default 30m) on today's slots
 */
export function calculateAvailableSlots({
  date,
  service,
  schedules,
  closedDates,
  bookings,
  settings,
  nowParts,
  ignoreLeadTime = false,
  excludeBookingId,
}: CalculateAvailableSlotsInput): SlotItem[] {
  if (!date || settings.is_force_closed) {
    return [];
  }

  const matchedClosedDate = closedDates.find((item) => item.closed_date === date);
  if (matchedClosedDate && !matchedClosedDate.close_from_time) {
    return [];
  }

  const dayOfWeek = getDayOfWeekFromDateStr(date);
  const schedule = schedules.find((item) => item.day_of_week === dayOfWeek);
  if (!schedule || !schedule.is_open) {
    return [];
  }

  const openMinutes = parseTimeToMinutes(schedule.open_time);
  const regularCloseMinutes = parseTimeToMinutes(schedule.close_time);
  const effectiveCloseMinutes = matchedClosedDate?.close_from_time
    ? Math.min(
        regularCloseMinutes,
        parseTimeToMinutes(matchedClosedDate.close_from_time)
      )
    : regularCloseMinutes;

  if (effectiveCloseMinutes <= openMinutes) {
    return [];
  }

  const breakEnabled = Boolean(settings.break_enabled);
  const breakStartMinutes = breakEnabled
    ? parseTimeToMinutes(settings.break_start ?? "17:15:00")
    : -1;
  const breakEndMinutes = breakEnabled
    ? parseTimeToMinutes(settings.break_end ?? "18:30:00")
    : -1;
  const hasValidBreak =
    breakEnabled &&
    breakStartMinutes >= 0 &&
    breakEndMinutes > breakStartMinutes;

  const durationMinutes = Math.max(60, service.slot_duration_minutes);
  const now = nowParts ?? getStoreNowParts(settings.timezone);
  const isPastDate = date < now.dateStr;
  const isToday = date === now.dateStr;

  if (isPastDate) {
    return [];
  }

  const activeBookings = bookings
    .filter(
      (b) =>
        b.booking_date === date &&
        b.status === "BOOKED" &&
        (!excludeBookingId || b.id !== excludeBookingId)
    )
    .map((b) => ({
      start: parseTimeToMinutes(b.start_time),
      end: parseTimeToMinutes(b.end_time),
    }));

  // Snap start to rounded 1-hour grid
  const firstGridMinutes = Math.ceil(openMinutes / 60) * 60;
  const slots: SlotItem[] = [];

  for (
    let slotStart = firstGridMinutes;
    slotStart + 60 <= effectiveCloseMinutes;
    slotStart += 60
  ) {
    const slotEnd = slotStart + durationMinutes;
    const firstBlockEnd = slotStart + 60;

    const isLeadTimeExpired =
      !ignoreLeadTime &&
      isToday &&
      slotStart <= now.minutesFromMidnight + settings.lead_time_minutes;

    const isPastTodayForAdmin =
      ignoreLeadTime && isToday && slotStart + 60 <= now.minutesFromMidnight;

    const hasFirstHourOverlap = activeBookings.some(
      (b) => b.start < firstBlockEnd && b.end > slotStart
    );

    const hasFullOverlap = activeBookings.some(
      (b) => b.start < slotEnd && b.end > slotStart
    );

    const hasFirstHourBreakOverlap =
      hasValidBreak &&
      slotStart < breakEndMinutes &&
      firstBlockEnd > breakStartMinutes;

    const hasFullBreakOverlap =
      hasValidBreak &&
      slotStart < breakEndMinutes &&
      slotEnd > breakStartMinutes;

    const exceedsClosing = slotEnd > effectiveCloseMinutes;

    if (isLeadTimeExpired || isPastTodayForAdmin) {
      slots.push({
        time: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
        startMinutes: slotStart,
        endMinutes: slotEnd,
        available: false,
        status: "EXPIRED",
        reason: "Batas waktu pemesanan telah lewat",
      });
    } else if (hasFirstHourOverlap) {
      slots.push({
        time: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
        startMinutes: slotStart,
        endMinutes: slotEnd,
        available: false,
        status: "BOOKED",
        reason: "Slot sudah terisi",
      });
    } else if (hasFirstHourBreakOverlap) {
      slots.push({
        time: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
        startMinutes: slotStart,
        endMinutes: slotEnd,
        available: false,
        status: "BREAK",
        reason: `Jam istirahat studio (${formatTimeHHMM(
          settings.break_start ?? "17:15:00"
        )} – ${formatTimeHHMM(settings.break_end ?? "18:30:00")} WIB)`,
      });
    } else if (exceedsClosing || hasFullOverlap || hasFullBreakOverlap) {
      slots.push({
        time: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
        startMinutes: slotStart,
        endMinutes: slotEnd,
        available: false,
        status: "INSUFFICIENT_TIME",
        reason: exceedsClosing
          ? "Sisa waktu sebelum tutup kurang dari durasi layanan"
          : hasFullBreakOverlap
            ? "Durasi layanan beririsan dengan jam istirahat studio"
            : "Sisa waktu sebelum jadwal berikutnya tidak mencukupi",
      });
    } else {
      slots.push({
        time: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
        startMinutes: slotStart,
        endMinutes: slotEnd,
        available: true,
        status: "AVAILABLE",
      });
    }
  }

  return slots;
}

export interface IsStoreOpenLiveInput {
  schedules: WeeklySchedule[];
  closedDates: ClosedDate[];
  settings: Pick<StoreSettings, "is_force_closed" | "timezone">;
  nowParts?: StoreNowParts;
}

/**
 * Determines whether the barbershop is currently open in real time.
 */
export function isStoreOpenLive({
  schedules,
  closedDates,
  settings,
  nowParts,
}: IsStoreOpenLiveInput): StoreLiveStatus {
  const now = nowParts ?? getStoreNowParts(settings.timezone);

  if (settings.is_force_closed) {
    return {
      isOpen: false,
      reason: "FORCE_CLOSED",
      openTime: null,
      closeTime: null,
      closedReason: "Toko sedang tutup sementara",
    };
  }

  const matchedClosed = closedDates.find(
    (item) => item.closed_date === now.dateStr
  );
  if (matchedClosed && !matchedClosed.close_from_time) {
    return {
      isOpen: false,
      reason: "CLOSED_DATE",
      openTime: null,
      closeTime: null,
      closedReason: matchedClosed.reason ?? "Libur khusus",
    };
  }

  const schedule = schedules.find(
    (item) => item.day_of_week === now.dayOfWeek
  );
  if (!schedule || !schedule.is_open) {
    return {
      isOpen: false,
      reason: "DAY_OFF",
      openTime: null,
      closeTime: null,
      closedReason: "Hari libur rutin",
    };
  }

  const openMinutes = parseTimeToMinutes(schedule.open_time);
  const regularCloseMinutes = parseTimeToMinutes(schedule.close_time);
  const effectiveCloseMinutes = matchedClosed?.close_from_time
    ? Math.min(
        regularCloseMinutes,
        parseTimeToMinutes(matchedClosed.close_from_time)
      )
    : regularCloseMinutes;

  const openTime = formatTimeHHMM(schedule.open_time);
  const closeTime = minutesToTime(effectiveCloseMinutes);

  if (effectiveCloseMinutes <= openMinutes) {
    return {
      isOpen: false,
      reason: "CLOSED_DATE",
      openTime: null,
      closeTime: null,
      closedReason: matchedClosed?.reason ?? "Tutup lebih awal hari ini",
    };
  }

  if (now.minutesFromMidnight < openMinutes) {
    return {
      isOpen: false,
      reason: "BEFORE_OPEN",
      openTime,
      closeTime,
      closedReason: null,
    };
  }

  if (now.minutesFromMidnight >= effectiveCloseMinutes) {
    return {
      isOpen: false,
      reason: "AFTER_CLOSE",
      openTime,
      closeTime,
      closedReason: matchedClosed?.close_from_time
        ? matchedClosed.reason ?? `Tutup mulai ${closeTime} WIB`
        : null,
    };
  }

  return {
    isOpen: true,
    reason: "OPEN",
    openTime,
    closeTime,
    closedReason: null,
  };
}

/**
 * Generates today and upcoming dates anchored in the store's timezone.
 */
export function getTodayAndUpcomingDates(
  timezone: string = DEFAULT_TIMEZONE,
  daysCount: number = 14,
  now: Date = new Date()
): UpcomingDateItem[] {
  const count = Math.max(1, Math.min(60, Math.floor(daysCount)));
  const nowParts = getStoreNowParts(timezone, now);
  const items: UpcomingDateItem[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    const utcDate = new Date(
      Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + offset)
    );
    const year = utcDate.getUTCFullYear();
    const month = utcDate.getUTCMonth() + 1;
    const dayNumber = utcDate.getUTCDate();
    const dayOfWeek = utcDate.getUTCDay();

    const dateStr = `${year}-${pad2(month)}-${pad2(dayNumber)}`;
    const dayNameShort = DAY_NAMES_SHORT[dayOfWeek] ?? "Min";
    const dayNameFull = DAY_NAMES_FULL[dayOfWeek] ?? "Minggu";
    const monthShort = MONTH_NAMES_SHORT[month - 1] ?? "Jan";

    items.push({
      dateStr,
      dayOfWeek,
      dayNumber,
      month,
      year,
      isToday: offset === 0,
      labelShort: `${dayNameShort}, ${dayNumber} ${monthShort}`,
      dayNameShort,
      dayNameFull,
    });
  }

  return items;
}

/**
 * Helper to find the first active slot block for 1-Tap Walk-in in /admin.
 * Checks the current rounded hour first (if not already past its end), then next slots today.
 */
export function findWalkinTargetSlot(
  service: Pick<Service, "slot_duration_minutes">,
  schedules: WeeklySchedule[],
  closedDates: ClosedDate[],
  bookings: PublicBookingSlot[] | Booking[],
  settings: Pick<
    StoreSettings,
    "is_force_closed" | "lead_time_minutes" | "timezone"
  > &
    Partial<Pick<StoreSettings, "break_enabled" | "break_start" | "break_end">>,
  nowParts?: StoreNowParts
): SlotItem | null {
  const now = nowParts ?? getStoreNowParts(settings.timezone);
  const currentHourStart = Math.floor(now.minutesFromMidnight / 60) * 60;

  const slots = calculateAvailableSlots({
    date: now.dateStr,
    service,
    schedules,
    closedDates,
    bookings,
    settings,
    nowParts: now,
    ignoreLeadTime: true,
  });

  return (
    slots.find(
      (slot) => slot.available && slot.startMinutes >= currentHourStart
    ) ?? null
  );
}
