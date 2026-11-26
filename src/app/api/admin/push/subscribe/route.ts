import { NextRequest, NextResponse } from "next/server";
import { verifySameOriginMutation } from "@/lib/security/origin";
import {
  isValidWebPushEndpoint,
  MAX_PAYLOAD_CHARS,
} from "@/lib/security/sanitize";
import { requireAdminSession } from "@/lib/supabase/admin-auth";

interface SubscribePayload {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
}

export async function POST(request: NextRequest) {
  const originError = verifySameOriginMutation(request);
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

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Payload subscription tidak dapat dibaca." },
      { status: 400 }
    );
  }

  if (rawText.length > MAX_PAYLOAD_CHARS) {
    return NextResponse.json(
      { error: "Ukuran payload melebihi batas maksimum." },
      { status: 400 }
    );
  }

  let body: SubscribePayload;
  try {
    body = JSON.parse(rawText) as SubscribePayload;
  } catch {
    return NextResponse.json(
      { error: "Payload subscription tidak valid." },
      { status: 400 }
    );
  }

  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;

  if (
    !isValidWebPushEndpoint(endpoint) ||
    typeof p256dh !== "string" ||
    p256dh.trim().length < 16 ||
    p256dh.trim().length > 256 ||
    typeof auth !== "string" ||
    auth.trim().length < 8 ||
    auth.trim().length > 128
  ) {
    return NextResponse.json(
      {
        error:
          "Data Web Push subscription tidak valid atau berasal dari penyedia tidak resmi.",
      },
      { status: 400 }
    );
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: endpoint.trim(),
      p256dh: p256dh.trim(),
      auth: auth.trim(),
      user_agent: userAgent,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return NextResponse.json(
      { error: "Gagal menyimpan perangkat notifikasi." },
      { status: 500 }
    );
  }

  return NextResponse.json({ subscribed: true }, { status: 200 });
}

export async function DELETE(request: NextRequest) {
  const originError = verifySameOriginMutation(request);
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

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Payload tidak dapat dibaca." },
      { status: 400 }
    );
  }

  if (rawText.length > MAX_PAYLOAD_CHARS) {
    return NextResponse.json(
      { error: "Ukuran payload melebihi batas maksimum." },
      { status: 400 }
    );
  }

  let body: { endpoint?: unknown };
  try {
    body = JSON.parse(rawText) as { endpoint?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Payload tidak valid." },
      { status: 400 }
    );
  }

  if (!isValidWebPushEndpoint(body?.endpoint)) {
    return NextResponse.json(
      { error: "Endpoint push tidak valid." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint.trim());

  if (error) {
    return NextResponse.json(
      { error: "Gagal menonaktifkan perangkat notifikasi." },
      { status: 500 }
    );
  }

  return NextResponse.json({ subscribed: false }, { status: 200 });
}
