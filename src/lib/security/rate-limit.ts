/**
 * Sliding-window in-memory rate limiter for public booking endpoints.
 * - Confirmed bookings / conflict probes: max 3 per IP within 15 minutes (900,000 ms).
 * - General request burst guard (failed validations/errors): max 15 per IP within 15 minutes
 *   so legitimate users are not locked out if a transient error occurs.
 */

export const BOOKING_RATE_LIMIT_MAX_ATTEMPTS = 3;
export const BOOKING_BURST_MAX_ATTEMPTS = 15;
export const BOOKING_RATE_LIMIT_WINDOW_MS = 900_000; // 15 minutes

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const GLOBAL_STORE_KEY = "__madzhair_booking_rate_limit_store__";
const GLOBAL_BURST_STORE_KEY = "__madzhair_booking_burst_limit_store__";

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
  recordNow: boolean
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
    };
  }

  if (recordNow) {
    const updatedTimestamps = [...activeTimestamps, now];
    store.set(normalizedKey, updatedTimestamps);

    return {
      allowed: true,
      remaining: Math.max(0, maxAttempts - updatedTimestamps.length),
      retryAfterSeconds: 0,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - activeTimestamps.length),
    retryAfterSeconds: 0,
  };
}

/**
 * Checks whether the client has remaining booking quota (max 3 successful/probed bookings per 15 min)
 * and burst quota (max 15 total POST requests per 15 min), without burning the 3-booking quota yet.
 */
export function checkBookingRateLimit(key: string): RateLimitResult {
  const bookingQuota = evaluateLimit(
    GLOBAL_STORE_KEY,
    key,
    BOOKING_RATE_LIMIT_MAX_ATTEMPTS,
    false
  );
  if (!bookingQuota.allowed) {
    return bookingQuota;
  }

  const burstQuota = evaluateLimit(
    GLOBAL_BURST_STORE_KEY,
    key,
    BOOKING_BURST_MAX_ATTEMPTS,
    true
  );
  return burstQuota;
}

/**
 * Records consumption of 1 booking quota slot (call when booking succeeds or hits slot conflict/honeypot).
 */
export function recordBookingQuotaUse(key: string): void {
  evaluateLimit(GLOBAL_STORE_KEY, key, BOOKING_RATE_LIMIT_MAX_ATTEMPTS, true);
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
