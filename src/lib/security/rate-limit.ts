/**
 * Bounded sliding-window in-memory rate limiter for Madzhair.co endpoints:
 * - Booking per (IP + WhatsApp phone): max 3 attempts per 10 minutes (600,000 ms).
 * - Booking aggregate per IP address: max 15 attempts per 10 minutes (600,000 ms).
 * - Smart Ticket lookup (/tiket/[code]): max 30 lookups per 10 minutes per IP.
 * - Admin account credentials update (/api/admin/account): max 5 attempts per 15 minutes.
 * - Enforces a strict FIFO cap (`MAX_STORE_KEYS = 5000`) per Map to prevent OOM.
 */

export const BOOKING_RATE_LIMIT_MAX_ATTEMPTS = 3;
export const BOOKING_IP_AGGREGATE_MAX_ATTEMPTS = 15;
export const BOOKING_BURST_MAX_ATTEMPTS = BOOKING_IP_AGGREGATE_MAX_ATTEMPTS;
export const BOOKING_RATE_LIMIT_WINDOW_MS = 600_000; // 10 minutes

export const TICKET_LOOKUP_MAX_ATTEMPTS = 30;
export const TICKET_LOOKUP_WINDOW_MS = 600_000; // 10 minutes

export const ADMIN_ACCOUNT_MAX_ATTEMPTS = 5;
export const ADMIN_ACCOUNT_WINDOW_MS = 900_000; // 15 minutes

const MAX_STORE_KEYS = 5_000;
const IP_TOKEN_REGEX = /^[0-9a-fA-F:.]{2,45}$/;

export type RateLimitScope =
  | "ip_phone"
  | "ip_aggregate"
  | "ticket_lookup"
  | "admin_account";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  scope?: RateLimitScope;
}

const GLOBAL_PHONE_IP_STORE_KEY = "__madzhair_booking_phone_ip_limit_store__";
const GLOBAL_IP_AGGREGATE_STORE_KEY =
  "__madzhair_booking_ip_aggregate_limit_store__";
const GLOBAL_TICKET_LOOKUP_STORE_KEY = "__madzhair_ticket_lookup_limit_store__";
const GLOBAL_ADMIN_ACCOUNT_STORE_KEY = "__madzhair_admin_account_limit_store__";

type RateLimitStore = Map<string, number[]>;

function getStore(storeKey: string): RateLimitStore {
  const globalObj = globalThis as typeof globalThis & {
    [key: string]: RateLimitStore | undefined;
  };

  if (!globalObj[storeKey]) {
    globalObj[storeKey] = new Map<string, number[]>();
  }

  return globalObj[storeKey]!;
}

function pruneAndCapStore(
  store: RateLimitStore,
  now: number,
  windowMs: number
): void {
  if (store.size >= 500) {
    for (const [entryKey, timestamps] of store.entries()) {
      const active = timestamps.filter((ts) => now - ts < windowMs);
      if (active.length === 0) {
        store.delete(entryKey);
      } else if (active.length !== timestamps.length) {
        store.set(entryKey, active);
      }
    }
  }

  // Strict FIFO eviction cap against key-flooding OOM
  while (store.size >= MAX_STORE_KEYS) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
}

function evaluateLimit(
  storeKey: string,
  key: string,
  maxAttempts: number,
  windowMs: number,
  recordNow: boolean,
  scope: RateLimitScope
): RateLimitResult {
  const now = Date.now();
  const normalizedKey = key.trim().slice(0, 160) || "unknown";
  const store = getStore(storeKey);

  pruneAndCapStore(store, now, windowMs);

  const existing = store.get(normalizedKey) ?? [];
  const activeTimestamps = existing.filter((ts) => now - ts < windowMs);

  if (activeTimestamps.length >= maxAttempts) {
    store.delete(normalizedKey);
    store.set(normalizedKey, activeTimestamps);
    const oldestTimestamp = activeTimestamps[0];
    const retryAfterMs = Math.max(1_000, windowMs - (now - oldestTimestamp));

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      scope,
    };
  }

  if (recordNow) {
    const updatedTimestamps = [...activeTimestamps, now];
    store.delete(normalizedKey);
    store.set(normalizedKey, updatedTimestamps);

    return {
      allowed: true,
      remaining: Math.max(0, maxAttempts - updatedTimestamps.length),
      retryAfterSeconds: 0,
      scope,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - activeTimestamps.length),
    retryAfterSeconds: 0,
    scope,
  };
}

export function buildPhoneIpKey(ip: string, phone: string): string {
  const cleanIp = ip.trim() || "unknown";
  const cleanPhone = phone.replace(/\D/g, "").trim() || "unknown";
  return `${cleanIp}::${cleanPhone}`;
}

/**
 * Atomically checks and consumes 1 IP aggregate booking attempt (max 15 / 10 min).
 * Invoked at the start of every POST /api/bookings attempt so invalid/fuzzing
 * requests also consume IP quota.
 */
export function consumeBookingIpAttempt(ip: string): RateLimitResult {
  return evaluateLimit(
    GLOBAL_IP_AGGREGATE_STORE_KEY,
    ip,
    BOOKING_IP_AGGREGATE_MAX_ATTEMPTS,
    BOOKING_RATE_LIMIT_WINDOW_MS,
    true,
    "ip_aggregate"
  );
}

/**
 * Atomically checks and consumes 1 (IP + WhatsApp phone) booking attempt (max 3 / 10 min)
 * without double-counting the aggregate IP store.
 */
export function consumeBookingPhoneAttempt(
  ip: string,
  phone: string
): RateLimitResult {
  const phoneIpKey = buildPhoneIpKey(ip, phone);
  return evaluateLimit(
    GLOBAL_PHONE_IP_STORE_KEY,
    phoneIpKey,
    BOOKING_RATE_LIMIT_MAX_ATTEMPTS,
    BOOKING_RATE_LIMIT_WINDOW_MS,
    true,
    "ip_phone"
  );
}

/**
 * Non-mutating check retained for callers inspecting remaining quota.
 */
export function checkBookingRateLimit(
  ip: string,
  phone?: string | null
): RateLimitResult {
  const ipCheck = evaluateLimit(
    GLOBAL_IP_AGGREGATE_STORE_KEY,
    ip,
    BOOKING_IP_AGGREGATE_MAX_ATTEMPTS,
    BOOKING_RATE_LIMIT_WINDOW_MS,
    false,
    "ip_aggregate"
  );

  if (!ipCheck.allowed) {
    return ipCheck;
  }

  if (phone && phone.trim().length > 0) {
    const phoneIpKey = buildPhoneIpKey(ip, phone);
    return evaluateLimit(
      GLOBAL_PHONE_IP_STORE_KEY,
      phoneIpKey,
      BOOKING_RATE_LIMIT_MAX_ATTEMPTS,
      BOOKING_RATE_LIMIT_WINDOW_MS,
      false,
      "ip_phone"
    );
  }

  return ipCheck;
}

export function recordBookingQuotaUse(
  ip: string,
  phone?: string | null
): void {
  evaluateLimit(
    GLOBAL_IP_AGGREGATE_STORE_KEY,
    ip,
    BOOKING_IP_AGGREGATE_MAX_ATTEMPTS,
    BOOKING_RATE_LIMIT_WINDOW_MS,
    true,
    "ip_aggregate"
  );

  if (phone && phone.trim().length > 0) {
    const phoneIpKey = buildPhoneIpKey(ip, phone);
    evaluateLimit(
      GLOBAL_PHONE_IP_STORE_KEY,
      phoneIpKey,
      BOOKING_RATE_LIMIT_MAX_ATTEMPTS,
      BOOKING_RATE_LIMIT_WINDOW_MS,
      true,
      "ip_phone"
    );
  }
}

/**
 * Rate-limits Smart Ticket lookups (`/tiket/[code]`) per IP address
 * (max 30 lookups per 10 minutes) to deter brute-force enumeration.
 */
export function consumeTicketLookupQuota(ip: string): RateLimitResult {
  return evaluateLimit(
    GLOBAL_TICKET_LOOKUP_STORE_KEY,
    `ticket::${ip.trim() || "unknown"}`,
    TICKET_LOOKUP_MAX_ATTEMPTS,
    TICKET_LOOKUP_WINDOW_MS,
    true,
    "ticket_lookup"
  );
}

/**
 * Rate-limits admin password/email change attempts (`/api/admin/account`)
 * (max 5 attempts per 15 minutes per user and per IP).
 */
export function consumeAdminAccountQuota(
  ip: string,
  userId: string
): RateLimitResult {
  const userCheck = evaluateLimit(
    GLOBAL_ADMIN_ACCOUNT_STORE_KEY,
    `user::${userId}`,
    ADMIN_ACCOUNT_MAX_ATTEMPTS,
    ADMIN_ACCOUNT_WINDOW_MS,
    true,
    "admin_account"
  );
  if (!userCheck.allowed) {
    return userCheck;
  }

  return evaluateLimit(
    GLOBAL_ADMIN_ACCOUNT_STORE_KEY,
    `ip::${ip.trim() || "unknown"}`,
    ADMIN_ACCOUNT_MAX_ATTEMPTS * 2,
    ADMIN_ACCOUNT_WINDOW_MS,
    true,
    "admin_account"
  );
}

/**
 * Extracts a normalized client IP address from trusted platform headers.
 */
export function extractClientIp(headers: Headers): string {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for"),
  ];

  for (const rawHeader of candidates) {
    if (!rawHeader) continue;

    const firstIp = rawHeader.split(",")[0]?.trim() ?? "";
    if (!firstIp) continue;

    const cleaned = firstIp.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 45);
    if (cleaned && IP_TOKEN_REGEX.test(cleaned)) {
      return cleaned.toLowerCase();
    }
  }

  return "unknown";
}
