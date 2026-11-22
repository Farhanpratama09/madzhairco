import { NextResponse } from "next/server";
import { sendPushToAllAdmins } from "@/lib/push/web-push";
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

  const summary = await sendPushToAllAdmins(
    {
      title: "Tes Notifikasi · Madzhair Barber & Co",
      body: "Notifikasi kasir HP aktif untuk Sungai Kunyit, Kalimantan Barat (WIB).",
      url: "/admin",
      tag: "madzhair-test-push",
    },
    supabase
  );

  if (!summary.configured) {
    return NextResponse.json(
      {
        error:
          summary.reason ??
          "Konfigurasi VAPID Web Push belum lengkap di server.",
      },
      { status: 503 }
    );
  }

  if (summary.total === 0) {
    return NextResponse.json(
      {
        error:
          "Belum ada perangkat HP kasir yang terdaftar. Tekan Aktifkan Notifikasi HP terlebih dahulu.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      sent: summary.sent,
      total: summary.total,
      removed: summary.removed,
    },
    { status: 200 }
  );
}
