/**
 * Sliding-window in-memory rate limiter for public booking endpoints (Shared Wi-Fi friendly).
 * - Per (IP + WhatsApp phone) combination: max 3 attempts per 10 minutes (600,000 ms).
 * - Aggregate per IP address: max 15 attempts per 10 minutes (600,000 ms) so customers
 *   sharing the barbershop Wi-Fi or multi-device testers do not block each other.
 */

export const BOOKING_RATE_LIMIT_MAX_ATTEMPTS = 3;
export const BOOKING_IP_AGGREGATE_MAX_ATTEMPTS = 15;
export const BOOKING_BURST_MAX_ATTEMPTS = BOOKING_IP_AGGREGATE_MAX_ATTEMPTS;
export const BOOKING_RATE_LIMIT_WINDOW_MS = 600_000; // 10 minutes

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  scope?: "ip_phone" | "ip_aggregate";
}

const GLOBAL_PHONE_IP_STORE_KEY = "__madzhair_booking_phone_ip_limit_store__";
const GLOBAL_IP_AGGREGATE_STORE_KEY =
  "__madzhair_booking_ip_aggregate_limit_store__";

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

function pruneExpiredEntries(store: RateLimitStore, now: number): void {
  if (store.size < 500) return;

  for (const [entryKey, timestamps] of store.entries()) {
    const active = timestamps.filter(
      (ts) => now - ts < BOOKING_RATE_LIMIT_WINDOW_MS
    );
    if (active.length === 0) {
      store.delete(entryKey);
    } else if (active.length !== timestamps.length) {
      store.set(entryKey, active);
    }
  }
}

function evaluateLimit(
  storeKey: string,
  key: string,
  maxAttempts: number,
  recordNow: boolean,
  scope: "ip_phone" | "ip_aggregate"
): RateLimitResult {
  const now = Date.now();
  const normalizedKey = key.trim() || "unknown";
  const store = getStore(storeKey);

  pruneExpiredEntries(store, now);

  const existing = store.get(normalizedKey) ?? [];
  const activeTimestamps = existing.filter(
    (ts) => now - ts < BOOKING_RATE_LIMIT_WINDOW_MS
  );

  if (activeTimestamps.length >= maxAttempts) {
    store.set(normalizedKey, activeTimestamps);
    const oldestTimestamp = activeTimestamps[0];
    const retryAfterMs = Math.max(
      1_000,
      BOOKING_RATE_LIMIT_WINDOW_MS - (now - oldestTimestamp)
    );

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      scope,
    };
  }

  if (recordNow) {
    const updatedTimestamps = [...activeTimestamps, now];
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
 * Checks aggregate IP rate limit (max 15 attempts per 10 minutes) and,
 * when `phone` is provided, checks strict (IP + WhatsApp phone) rate limit
 * (max 3 attempts per 10 minutes).
 */
export function checkBookingRateLimit(
  ip: string,
  phone?: string | null
): RateLimitResult {
  const ipCheck = evaluateLimit(
    GLOBAL_IP_AGGREGATE_STORE_KEY,
    ip,
    BOOKING_IP_AGGREGATE_MAX_ATTEMPTS,
    false,
    "ip_aggregate"
  );

  if (!ipCheck.allowed) {
    return ipCheck;
  }

  if (phone && phone.trim().length > 0) {
    const phoneIpKey = buildPhoneIpKey(ip, phone);
    const phoneIpCheck = evaluateLimit(
      GLOBAL_PHONE_IP_STORE_KEY,
      phoneIpKey,
      BOOKING_RATE_LIMIT_MAX_ATTEMPTS,
      false,
      "ip_phone"
    );
    if (!phoneIpCheck.allowed) {
      return phoneIpCheck;
    }
    return phoneIpCheck;
  }

  return ipCheck;
}

/**
 * Records 1 booking attempt for the aggregate IP quota (max 15 / 10 min)
 * and, when `phone` is provided, for the (IP + WhatsApp phone) quota (max 3 / 10 min).
 */
export function recordBookingQuotaUse(
  ip: string,
  phone?: string | null
): void {
  evaluateLimit(
    GLOBAL_IP_AGGREGATE_STORE_KEY,
    ip,
    BOOKING_IP_AGGREGATE_MAX_ATTEMPTS,
    true,
    "ip_aggregate"
  );

  if (phone && phone.trim().length > 0) {
    const phoneIpKey = buildPhoneIpKey(ip, phone);
    evaluateLimit(
      GLOBAL_PHONE_IP_STORE_KEY,
      phoneIpKey,
      BOOKING_RATE_LIMIT_MAX_ATTEMPTS,
      true,
      "ip_phone"
    );
  }
}

/**
 * Extracts a normalized client IP address from incoming request headers.
 * Prioritizes Vercel and standard reverse-proxy forwarding headers.
 */
export function extractClientIp(headers: Headers): string {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("cf-connecting-ip"),
  ];

  for (const rawHeader of candidates) {
    if (!rawHeader) continue;

    const firstIp = rawHeader.split(",")[0]?.trim();
    if (!firstIp) continue;

    // Strip control characters and limit length for safe map key usage
    const cleaned = firstIp.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 64);
    if (cleaned) {
      return cleaned;
    }
  }

  return "unknown";
}
