import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseConfig } from "./config";

/**
 * Server-only Supabase admin client using SUPABASE_SERVICE_ROLE_KEY.
 * Used exclusively by server Route Handlers (e.g. best-effort Web Push fan-out
 * on POST /api/bookings and /api/cron/break-reminder) to read private
 * `push_subscriptions` without exposing them to public `anon` role.
 *
 * Returns null gracefully when SUPABASE_SERVICE_ROLE_KEY is not configured.
 */
export function createServiceRoleClient(): SupabaseClient<Database> | null {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
