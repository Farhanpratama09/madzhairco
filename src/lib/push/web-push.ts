import { sendNotification, setVapidDetails } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidWebPushEndpoint } from "@/lib/security/sanitize";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Database, PushSubscriptionRow } from "@/types/database";

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface SendPushSummary {
  configured: boolean;
  total: number;
  sent: number;
  failed: number;
  removed: number;
  reason?: string;
}

function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@madzhair.co";

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(): boolean {
  return Boolean(getVapidConfig());
}

/**
 * Sends a Web Push payload to all stored admin subscriptions on verified vendor endpoints.
 * Automatically deletes stale (404/410) or untrusted endpoints.
 * Never throws so public booking flow stays resilient (best-effort).
 */
export async function sendPushToAllAdmins(
  payload: PushNotificationPayload,
  clientOverride?: SupabaseClient<Database> | null
): Promise<SendPushSummary> {
  const vapid = getVapidConfig();
  if (!vapid) {
    return {
      configured: false,
      total: 0,
      sent: 0,
      failed: 0,
      removed: 0,
      reason: "VAPID keys belum dikonfigurasi.",
    };
  }

  const client = clientOverride ?? createServiceRoleClient();
  if (!client) {
    return {
      configured: false,
      total: 0,
      sent: 0,
      failed: 0,
      removed: 0,
      reason: "Layanan push server belum dikonfigurasi.",
    };
  }

  try {
    setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

    const { data, error } = await client
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_agent, created_at, updated_at");

    if (error || !Array.isArray(data) || data.length === 0) {
      return {
        configured: true,
        total: 0,
        sent: 0,
        failed: 0,
        removed: 0,
        reason: error ? "Gagal membaca daftar perangkat notifikasi." : undefined,
      };
    }

    const subscriptions = data as PushSubscriptionRow[];
    const safeUrl =
      typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//")
        ? payload.url
        : "/admin";

    const serializedPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: safeUrl,
      tag: payload.tag ?? "madzhair-admin",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });

    let sent = 0;
    let failed = 0;
    const staleIds: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        if (!isValidWebPushEndpoint(sub.endpoint)) {
          failed += 1;
          staleIds.push(sub.id);
          return;
        }

        try {
          await sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            serializedPayload,
            { TTL: 3600 }
          );
          sent += 1;
        } catch (err: unknown) {
          failed += 1;
          const statusCode =
            typeof err === "object" &&
            err !== null &&
            "statusCode" in err &&
            typeof (err as { statusCode?: unknown }).statusCode === "number"
              ? (err as { statusCode: number }).statusCode
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            staleIds.push(sub.id);
          }
        }
      })
    );

    if (staleIds.length > 0) {
      await client.from("push_subscriptions").delete().in("id", staleIds);
    }

    return {
      configured: true,
      total: subscriptions.length,
      sent,
      failed,
      removed: staleIds.length,
    };
  } catch {
    return {
      configured: true,
      total: 0,
      sent: 0,
      failed: 1,
      removed: 0,
      reason: "Gagal mengirim Web Push.",
    };
  }
}
