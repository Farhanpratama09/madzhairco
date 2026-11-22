import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface SubscribePayload {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
}

function isValidPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
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

  let body: SubscribePayload;
  try {
    body = (await request.json()) as SubscribePayload;
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
    !isValidPushEndpoint(endpoint) ||
    typeof p256dh !== "string" ||
    p256dh.trim().length < 16 ||
    typeof auth !== "string" ||
    auth.trim().length < 8
  ) {
    return NextResponse.json(
      { error: "Data Web Push subscription tidak lengkap atau tidak valid." },
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

  let body: { endpoint?: unknown };
  try {
    body = (await request.json()) as { endpoint?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Payload tidak valid." },
      { status: 400 }
    );
  }

  if (!isValidPushEndpoint(body?.endpoint)) {
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
