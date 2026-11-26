import { NextRequest, NextResponse } from "next/server";
import { verifySameOriginMutation } from "@/lib/security/origin";
import { requireAdminSession } from "@/lib/supabase/admin-auth";

export async function POST(request: NextRequest) {
  const originError = verifySameOriginMutation(request, {
    requireJsonBody: false,
  });
  if (originError) {
    return originError;
  }

  const adminSession = await requireAdminSession();
  if (!adminSession.ok) {
    return NextResponse.json(
      { error: adminSession.error },
      { status: adminSession.status }
    );
  }
  const { supabase } = adminSession;

  const { data, error } = await supabase.rpc("auto_complete_overdue_bookings");
  if (error) {
    return NextResponse.json(
      { error: "Gagal menjalankan auto-complete jadwal." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { updatedCount: typeof data === "number" ? data : 0 },
    { status: 200 }
  );
}
