import { NextRequest, NextResponse } from "next/server";
import { sendPushToAllAdmins } from "@/lib/push/web-push";
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
