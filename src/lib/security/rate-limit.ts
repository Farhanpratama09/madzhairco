/**
 * Sliding-window in-memory rate limiter for public booking endpoints.
 * Limit: max 3 attempts per client key (IP) within a 15-minute (900,000 ms) window.
 */

export const BOOKING_RATE_LIMIT_MAX_ATTEMPTS = 3;
export const BOOKING_RATE_LIMIT_WINDOW_MS = 900_000; // 15 minutes

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const GLOBAL_STORE_KEY = "__madzhair_booking_rate_limit_store__";

type RateLimitStore = Map<string, number[]>;

function getStore(): RateLimitStore {
  const globalObj = globalThis as typeof globalThis & {
    [GLOBAL_STORE_KEY]?: RateLimitStore;
  };

  if (!globalObj[GLOBAL_STORE_KEY]) {
    globalObj[GLOBAL_STORE_KEY] = new Map<string, number[]>();
  }

  return globalObj[GLOBAL_STORE_KEY];
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

/**
 * Checks and records a booking attempt against a sliding 15-minute window.
 */
export function checkBookingRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const normalizedKey = key.trim() || "unknown";
  const store = getStore();

  pruneExpiredEntries(store, now);

  const existing = store.get(normalizedKey) ?? [];
  const activeTimestamps = existing.filter(
    (ts) => now - ts < BOOKING_RATE_LIMIT_WINDOW_MS
  );

  if (activeTimestamps.length >= BOOKING_RATE_LIMIT_MAX_ATTEMPTS) {
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

  const updatedTimestamps = [...activeTimestamps, now];
  store.set(normalizedKey, updatedTimestamps);

  return {
    allowed: true,
    remaining: Math.max(
      0,
      BOOKING_RATE_LIMIT_MAX_ATTEMPTS - updatedTimestamps.length
    ),
    retryAfterSeconds: 0,
  };
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
