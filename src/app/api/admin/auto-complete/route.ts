import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
