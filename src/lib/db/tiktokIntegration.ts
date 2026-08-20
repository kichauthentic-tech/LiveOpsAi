import { supabase } from "../supabaseClient";
import { TikTokConnectionStatus, TikTokWebhookEvent } from "../../types";

// Access/refresh tokens live server-side only (table `tiktok_shop_connections` has no
// client-readable RLS policy at all) — every call here either proxies through server.ts
// (status/authorize/disconnect) or reads the non-sensitive append-only event log directly.
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token ?? ""}`
    }
  });
}

export async function fetchTikTokStatus(): Promise<TikTokConnectionStatus> {
  const res = await authedFetch("/api/tiktok/status");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Không thể tải trạng thái kết nối TikTok.");
  }
  return res.json();
}

// Returns the TikTok authorization URL to redirect the browser to (window.location.href = url).
export async function getTikTokAuthorizeUrl(): Promise<string> {
  const res = await authedFetch("/api/tiktok/oauth/authorize");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Không thể khởi tạo kết nối TikTok.");
  }
  const body = await res.json();
  return body.url as string;
}

export async function disconnectTikTok(shopId: string): Promise<void> {
  const res = await authedFetch("/api/tiktok/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shop_id: shopId })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Không thể ngắt kết nối TikTok.");
  }
}

interface DbTikTokWebhookEvent {
  id: string;
  event_type: string;
  shop_id: string;
  payload: Record<string, unknown>;
  session_id: string | null;
  received_at: string;
}

function fromDb(row: DbTikTokWebhookEvent): TikTokWebhookEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    shopId: row.shop_id,
    payload: row.payload ?? {},
    sessionId: row.session_id ?? undefined,
    receivedAt: row.received_at
  };
}

export async function fetchTikTokWebhookEvents(limit = 50): Promise<TikTokWebhookEvent[]> {
  const { data, error } = await supabase
    .from("tiktok_webhook_events")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as DbTikTokWebhookEvent[]).map(fromDb);
}
