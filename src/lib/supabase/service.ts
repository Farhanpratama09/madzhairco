import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

/**
 * Server-only Supabase admin client using SUPABASE_SERVICE_ROLE_KEY.
 * Used exclusively by server Route Handlers (POST /api/bookings, Web Push fan-out,
 * /api/admin/account, and /api/cron/break-reminder).
 *
 * Returns null gracefully when SUPABASE_SERVICE_ROLE_KEY is missing or a placeholder.
 */
export function createServiceRoleClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { url } = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const normalizedServiceKey = serviceRoleKey.toLowerCase();

  if (
    !url ||
    !serviceRoleKey ||
    serviceRoleKey.length <= 10 ||
    normalizedServiceKey.includes("placeholder") ||
    normalizedServiceKey.includes("your-service-role-key")
  ) {
    return null;
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
