/**
 * Input sanitization, honeypot detection, and strict allowlist validators
 * for Madzhair.co zero-trust security boundaries.
 */

export interface SanitizeNameResult {
  valid: boolean;
  value: string;
  error?: string;
}

export interface SocialEmbedValidationResult {
  valid: boolean;
  platform?: "tiktok" | "instagram";
  url?: string;
  error?: string;
}

const TIKTOK_ALLOWED_HOSTS = new Set([
  "www.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

const INSTAGRAM_ALLOWED_HOSTS = new Set(["www.instagram.com"]);

const TICKET_CODE_STRICT_REGEX = /^MDZ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;
const TICKET_CODE_DEMO_COMPAT_REGEX = /^MDZ-[A-Z0-9]{4}$/;
const SERVICE_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/;

/**
 * Returns true when an automated bot fills a hidden honeypot field.
 */
export function checkHoneypot(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return true;
}

/**
 * Sanitizes customer_name by stripping HTML tags, control characters,
 * invisible formatting characters, and collapsing whitespace.
 * Enforces mandatory length between 2 and 40 characters.
 */
export function sanitizeCustomerName(raw: unknown): SanitizeNameResult {
  if (typeof raw !== "string") {
    return {
      valid: false,
      value: "",
      error: "Nama pelanggan wajib berupa teks.",
    };
  }

  let cleaned = raw;
  // Iteratively strip HTML/XML tags to prevent nested tag bypasses like <<script>>
  let previous: string;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(/<[^>]*>/g, "");
  } while (cleaned !== previous);

  cleaned = cleaned
    // Remove any remaining angle brackets
    .replace(/[<>]/g, "")
    // Remove ASCII & Unicode control characters
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    // Remove zero-width & bidirectional override characters
    .replace(/[\u200B-\u200D\u202A-\u202E\uFEFF]/g, "")
    // Collapse consecutive whitespace into single spaces
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 2) {
    return {
      valid: false,
      value: cleaned,
      error: "Nama pelanggan minimal 2 karakter.",
    };
  }

  if (cleaned.length > 40) {
    return {
      valid: false,
      value: cleaned,
      error: "Nama pelanggan maksimal 40 karakter.",
    };
  }

  return {
    valid: true,
    value: cleaned,
  };
}

/**
 * Validates social media embed URLs against a strict HTTPS domain whitelist.
 * Only permits https:// URLs on www.tiktok.com, vm.tiktok.com, vt.tiktok.com,
 * and www.instagram.com. Rejects javascript:, data:, http:, credentials, and other hosts.
 */
export function validateSocialEmbedUrl(
  raw: unknown
): SocialEmbedValidationResult {
  if (typeof raw !== "string") {
    return {
      valid: false,
      error: "URL media sosial harus berupa teks.",
    };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: "URL media sosial wajib diisi.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      error: "Format URL media sosial tidak valid.",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      error: "URL media sosial wajib menggunakan protokol https://.",
    };
  }

  if (parsed.username || parsed.password || parsed.port) {
    return {
      valid: false,
      error: "URL media sosial tidak boleh mengandung kredensial atau port khusus.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (TIKTOK_ALLOWED_HOSTS.has(hostname)) {
    return {
      valid: true,
      platform: "tiktok",
      url: parsed.toString(),
    };
  }

  if (INSTAGRAM_ALLOWED_HOSTS.has(hostname)) {
    return {
      valid: true,
      platform: "instagram",
      url: parsed.toString(),
    };
  }

  return {
    valid: false,
    error:
      "Domain tidak diizinkan. Hanya www.tiktok.com, vm.tiktok.com, vt.tiktok.com, atau www.instagram.com yang diperbolehkan.",
  };
}

/**
 * Validates ticket code format:
 * Strict unambiguous MDZ-XXXX or demo-compatible MDZ-[A-Z0-9]{4}.
 */
export function validateTicketCode(raw: string): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  return (
    TICKET_CODE_STRICT_REGEX.test(raw) ||
    TICKET_CODE_DEMO_COMPAT_REGEX.test(raw)
  );
}

/**
 * Validates 24-hour service time format: HH:MM or HH:MM:00.
 */
export function validateServiceTimeFormat(time: string): boolean {
  if (typeof time !== "string") {
    return false;
  }

  return SERVICE_TIME_REGEX.test(time);
}
