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

export const SLOT_INTERVAL_MINUTES = 15;

/**
 * Validates that a time string ("HH:MM" or "HH:MM:SS") lies on a 15-minute boundary
 * (:00, :15, :30, :45) with zero seconds.
 */
export function isAlignedTo15MinGrid(time: string): boolean {
  const parts = time.trim().split(":");
  if (parts.length < 2 || parts.length > 3) {
    return false;
  }

  const hour = Number.parseInt(parts[0] ?? "", 10);
  const minute = Number.parseInt(parts[1] ?? "", 10);
  const second = parts.length === 3 ? Number.parseInt(parts[2] ?? "", 10) : 0;

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second !== 0
  ) {
    return false;
  }

  return minute % SLOT_INTERVAL_MINUTES === 0;
}

/**
 * Resolves the active service duration in minutes (minimum 15 minutes).
 */
export function getServiceDurationMinutes(
  service: Pick<Service, "slot_duration_minutes"> &
    Partial<Pick<Service, "display_duration_minutes">>
): number {
  const raw =
    Number.isFinite(service.slot_duration_minutes) &&
    service.slot_duration_minutes > 0
      ? service.slot_duration_minutes
      : service.display_duration_minutes ?? 45;
  return Math.max(SLOT_INTERVAL_MINUTES, Math.floor(raw));
}

export interface CalculateAvailableSlotsInput {
  /** Target date YYYY-MM-DD */
  date: string;
  service: Pick<Service, "slot_duration_minutes"> &
    Partial<Pick<Service, "display_duration_minutes">>;
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
  /** Optional: bypass customer lead_time_minutes check (e.g. admin walk-in/reschedule view) */
  ignoreLeadTime?: boolean;
  /** Optional: exclude a booking ID when computing reschedule slots */
  excludeBookingId?: string;
}

/**
 * Pure Dynamic Interval Scheduling engine (15-minute granularity):
 * - Generates candidate start times every 15 minutes from open_time up to effectiveCloseMinutes.
 * - Start time S with service duration D (e.g. Haircut 45m, Hair Chemicals 120m) is valid iff:
 *   (a) S + D <= effectiveCloseMinutes (respects weekly schedule & closed_dates.close_from_time)
 *   (b) No overlap with active BOOKED bookings (S < existing_end && S + D > existing_start)
 *       nor with enabled daily break window (S < break_end && S + D > break_start)
 *   (c) Respects lead_time_minutes on today's slots (or current 15m window when ignoreLeadTime=true)
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

  const durationMinutes = getServiceDurationMinutes(service);
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

  // Snap first candidate to 15-minute boundary >= openMinutes
  const firstGridMinutes =
    Math.ceil(openMinutes / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
  const slots: SlotItem[] = [];

  for (
    let slotStart = firstGridMinutes;
    slotStart < effectiveCloseMinutes;
    slotStart += SLOT_INTERVAL_MINUTES
  ) {
    const slotEnd = slotStart + durationMinutes;

    const isLeadTimeExpired =
      !ignoreLeadTime &&
      isToday &&
      slotStart <= now.minutesFromMidnight + settings.lead_time_minutes;

    const isPastTodayForAdmin =
      ignoreLeadTime &&
      isToday &&
      slotStart + SLOT_INTERVAL_MINUTES <= now.minutesFromMidnight;

    const exceedsClosing = slotEnd > effectiveCloseMinutes;

    const hasBookingOverlap = activeBookings.some(
      (b) => slotStart < b.end && slotEnd > b.start
    );

    const startsDuringBooking = activeBookings.some(
      (b) => slotStart >= b.start && slotStart < b.end
    );

    const hasBreakOverlap =
      hasValidBreak &&
      slotStart < breakEndMinutes &&
      slotEnd > breakStartMinutes;

    const startsDuringBreak =
      hasValidBreak &&
      slotStart >= breakStartMinutes &&
      slotStart < breakEndMinutes;

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
    } else if (startsDuringBooking) {
      slots.push({
        time: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
        startMinutes: slotStart,
        endMinutes: slotEnd,
        available: false,
        status: "BOOKED",
        reason: "Slot sudah terisi",
      });
    } else if (startsDuringBreak) {
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
    } else if (exceedsClosing || hasBookingOverlap || hasBreakOverlap) {
      slots.push({
        time: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
        startMinutes: slotStart,
        endMinutes: slotEnd,
        available: false,
        status: "INSUFFICIENT_TIME",
        reason: exceedsClosing
          ? "Sisa waktu sebelum tutup kurang dari durasi layanan"
          : hasBreakOverlap
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

export type AdminTodayOperationalPhase =
  | "EARLY_CLOSED"
  | "CLOSED_ALL_DAY"
  | "ENDED_TODAY"
  | "BEFORE_OPEN"
  | "OPEN_NOW";

export interface AdminTodayOperationalState {
  phase: AdminTodayOperationalPhase;
  badgeText: string;
  description: string;
  tone: "open" | "closed" | "neutral";
  openTime: string | null;
  effectiveCloseTime: string | null;
  earlyCloseCutoff: string | null;
  canCloseFromNow: boolean;
  canCloseAllDay: boolean;
  canReopen: boolean;
  isOverrideClosed: boolean;
}

/**
 * Computes the exact 5-state operational machine for today in /admin
 * using local Asia/Pontianak (WIB) time, weekly schedule, and today's closed_dates override.
 */
export function getAdminTodayOperationalState({
  schedules,
  closedDates,
  settings,
  nowParts,
}: IsStoreOpenLiveInput): AdminTodayOperationalState {
  const now = nowParts ?? getStoreNowParts(settings.timezone);
  const todaySchedule =
    schedules.find((item) => item.day_of_week === now.dayOfWeek) ?? null;
  const todayClosedEntry =
    closedDates.find((item) => item.closed_date === now.dateStr) ?? null;

  const isForceClosed = Boolean(settings.is_force_closed);
  const hasEarlyClose = Boolean(
    todayClosedEntry && todayClosedEntry.close_from_time !== null
  );
  const hasFullDayOverride = Boolean(
    todayClosedEntry && todayClosedEntry.close_from_time === null
  );
  const isWeeklyDayOff = !todaySchedule || !todaySchedule.is_open;

  // (a) Sudah Tutup Mendadak (close_from_time !== null, tanpa force-close global)
  if (!isForceClosed && hasEarlyClose && todayClosedEntry?.close_from_time) {
    const cutoffLabel = formatTimeHHMM(todayClosedEntry.close_from_time);
    return {
      phase: "EARLY_CLOSED",
      badgeText: `Ditutup Mendadak mulai ${cutoffLabel} WIB`,
      description: `Studio ditutup lebih awal mulai ${cutoffLabel} WIB khusus hari ini. Jadwal besok tetap normal.`,
      tone: "closed",
      openTime: todaySchedule ? formatTimeHHMM(todaySchedule.open_time) : null,
      effectiveCloseTime: cutoffLabel,
      earlyCloseCutoff: cutoffLabel,
      canCloseFromNow: false,
      canCloseAllDay: false,
      canReopen: true,
      isOverrideClosed: true,
    };
  }

  // (b) Libur Seharian (is_force_closed / !is_open / close_from_time === null di closed_dates)
  if (isForceClosed || isWeeklyDayOff || hasFullDayOverride) {
    const canReopen = isForceClosed || hasFullDayOverride;
    return {
      phase: "CLOSED_ALL_DAY",
      badgeText: "Studio Tutup Hari Ini",
      description: isForceClosed
        ? "Mode tutup sementara aktif. Booking online & walk-in dijeda sampai dibuka kembali."
        : hasFullDayOverride
          ? "Studio ditutup seharian khusus hari ini. Jadwal besok tetap normal."
          : "Hari ini merupakan hari libur rutin sesuai jadwal mingguan.",
      tone: "closed",
      openTime: null,
      effectiveCloseTime: null,
      earlyCloseCutoff: null,
      canCloseFromNow: false,
      canCloseAllDay: false,
      canReopen,
      isOverrideClosed: canReopen,
    };
  }

  const openMinutes = parseTimeToMinutes(todaySchedule.open_time);
  const regularCloseMinutes = parseTimeToMinutes(todaySchedule.close_time);
  const openLabel = formatTimeHHMM(todaySchedule.open_time);
  const effectiveCloseLabel = minutesToTime(regularCloseMinutes);

  // (c) Jam Operasional Hari Ini Sudah Selesai (nowWib >= effective_close_time)
  if (now.minutesFromMidnight >= regularCloseMinutes) {
    return {
      phase: "ENDED_TODAY",
      badgeText: `Operasional Hari Ini Selesai (Tutup ${effectiveCloseLabel} WIB)`,
      description: `Jam layanan hari ini telah berakhir pukul ${effectiveCloseLabel} WIB. Jadwal besok tetap berjalan otomatis.`,
      tone: "neutral",
      openTime: openLabel,
      effectiveCloseTime: effectiveCloseLabel,
      earlyCloseCutoff: null,
      canCloseFromNow: false,
      canCloseAllDay: false,
      canReopen: false,
      isOverrideClosed: false,
    };
  }

  // (d) Belum Jam Buka (nowWib < open_time)
  if (now.minutesFromMidnight < openMinutes) {
    return {
      phase: "BEFORE_OPEN",
      badgeText: `Belum Buka · Buka ${openLabel} WIB`,
      description: `Studio dijadwalkan buka pukul ${openLabel} – ${effectiveCloseLabel} WIB hari ini.`,
      tone: "neutral",
      openTime: openLabel,
      effectiveCloseTime: effectiveCloseLabel,
      earlyCloseCutoff: null,
      canCloseFromNow: false,
      canCloseAllDay: true,
      canReopen: false,
      isOverrideClosed: false,
    };
  }

  // (e) Sedang Jam Operasional (open_time <= nowWib < effective_close_time)
  return {
    phase: "OPEN_NOW",
    badgeText: `Sedang Buka · Tutup ${effectiveCloseLabel} WIB`,
    description: `Studio sedang beroperasi (${openLabel} – ${effectiveCloseLabel} WIB). Anda dapat menutup lebih awal khusus hari ini jika diperlukan.`,
    tone: "open",
    openTime: openLabel,
    effectiveCloseTime: effectiveCloseLabel,
    earlyCloseCutoff: null,
    canCloseFromNow: true,
    canCloseAllDay: true,
    canReopen: false,
    isOverrideClosed: false,
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
 * Returns all valid 15-minute walk-in slots for today starting from the current
 * 15-minute window (bypassing customer lead_time_minutes).
 */
export function getWalkinAvailableSlots(
  service: Pick<Service, "slot_duration_minutes"> &
    Partial<Pick<Service, "display_duration_minutes">>,
  schedules: WeeklySchedule[],
  closedDates: ClosedDate[],
  bookings: PublicBookingSlot[] | Booking[],
  settings: Pick<
    StoreSettings,
    "is_force_closed" | "lead_time_minutes" | "timezone"
  > &
    Partial<Pick<StoreSettings, "break_enabled" | "break_start" | "break_end">>,
  nowParts?: StoreNowParts
): SlotItem[] {
  const now = nowParts ?? getStoreNowParts(settings.timezone);
  const currentQuarterStart =
    Math.floor(now.minutesFromMidnight / SLOT_INTERVAL_MINUTES) *
    SLOT_INTERVAL_MINUTES;

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

  return slots.filter(
    (slot) => slot.available && slot.startMinutes >= currentQuarterStart
  );
}

/**
 * Helper to find the first active 15-minute slot block for 1-Tap Walk-in in /admin.
 */
export function findWalkinTargetSlot(
  service: Pick<Service, "slot_duration_minutes"> &
    Partial<Pick<Service, "display_duration_minutes">>,
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
  return (
    getWalkinAvailableSlots(
      service,
      schedules,
      closedDates,
      bookings,
      settings,
      nowParts
    )[0] ?? null
  );
}

export interface TimelineGap {
  startMinutes: number;
  endMinutes: number;
}

export interface ComputeTimelineFreeGapsInput {
  startMinutes: number;
  endMinutes: number;
  busyIntervals: Array<{ startMinutes: number; endMinutes: number }>;
  /** Optional boundaries (e.g. early close cutoff) that split free segments */
  splitAtMinutes?: number[];
}

/**
 * Computes exact unoccupied chair intervals for the admin timeline.
 * Subtracts active bookings & break windows from [startMinutes, endMinutes],
 * splits on optional explicit boundaries, and neatly divides long spans at whole
 * hours only when both sides are >= 30 minutes (preventing noisy 15m slivers).
 */
export function computeTimelineFreeGaps({
  startMinutes,
  endMinutes,
  busyIntervals,
  splitAtMinutes = [],
}: ComputeTimelineFreeGapsInput): TimelineGap[] {
  if (endMinutes <= startMinutes) {
    return [];
  }

  const clampedBusy = busyIntervals
    .map((interval) => ({
      startMinutes: Math.max(startMinutes, interval.startMinutes),
      endMinutes: Math.min(endMinutes, interval.endMinutes),
    }))
    .filter((interval) => interval.endMinutes > interval.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const mergedBusy: TimelineGap[] = [];
  for (const interval of clampedBusy) {
    const last = mergedBusy[mergedBusy.length - 1];
    if (last && interval.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, interval.endMinutes);
    } else {
      mergedBusy.push({ ...interval });
    }
  }

  const rawFree: TimelineGap[] = [];
  let cursor = startMinutes;
  for (const busy of mergedBusy) {
    if (busy.startMinutes > cursor) {
      rawFree.push({ startMinutes: cursor, endMinutes: busy.startMinutes });
    }
    cursor = Math.max(cursor, busy.endMinutes);
  }
  if (cursor < endMinutes) {
    rawFree.push({ startMinutes: cursor, endMinutes });
  }

  const sortedSplits = Array.from(
    new Set(
      splitAtMinutes.filter((m) => m > startMinutes && m < endMinutes)
    )
  ).sort((a, b) => a - b);

  const boundedFree: TimelineGap[] = [];
  for (const gap of rawFree) {
    let segStart = gap.startMinutes;
    for (const splitPoint of sortedSplits) {
      if (splitPoint > segStart && splitPoint < gap.endMinutes) {
        boundedFree.push({ startMinutes: segStart, endMinutes: splitPoint });
        segStart = splitPoint;
      }
    }
    if (segStart < gap.endMinutes) {
      boundedFree.push({ startMinutes: segStart, endMinutes: gap.endMinutes });
    }
  }

  const result: TimelineGap[] = [];
  for (const seg of boundedFree) {
    let segCursor = seg.startMinutes;
    const firstHourAfter = (Math.floor(seg.startMinutes / 60) + 1) * 60;
    for (let hourMark = firstHourAfter; hourMark < seg.endMinutes; hourMark += 60) {
      if (hourMark - segCursor >= 30 && seg.endMinutes - hourMark >= 30) {
        result.push({ startMinutes: segCursor, endMinutes: hourMark });
        segCursor = hourMark;
      }
    }
    if (segCursor < seg.endMinutes) {
      result.push({ startMinutes: segCursor, endMinutes: seg.endMinutes });
    }
  }

  return result;
}

