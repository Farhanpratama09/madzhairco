import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createClient } from "./server";

export type AdminSessionResult =
  | {
      ok: true;
      supabase: SupabaseClient<Database>;
      user: User;
    }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    };

/**
 * Verifies that an authenticated Supabase user ID is explicitly registered
 * in `public.admin_users` (fail-closed zero-trust RBAC).
 */
export async function verifyAdminUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    return data.user_id === userId;
  } catch {
    return false;
  }
}

/**
 * Authoritative server-side admin session & RBAC guard for `/admin` pages
 * and `/api/admin/**` Route Handlers.
 */
export async function requireAdminSession(): Promise<AdminSessionResult> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const isAdmin = await verifyAdminUser(supabase, user.id);
  if (!isAdmin) {
    return {
      ok: false,
      status: 403,
      error: "Akses ditolak. Akun ini tidak terdaftar sebagai admin resmi.",
    };
  }

  return {
    ok: true,
    supabase,
    user,
  };
}
