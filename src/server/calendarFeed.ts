import type express from "express";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Link lịch riêng của từng host/trợ (app talent bản 2, 16/10/2026, migration 0177). Người làm live thêm link này MỘT lần vào Google
// Calendar / Lịch iPhone: ca tự hiện, tự nhắc trước giờ live, OP đổi giờ thì lịch điện thoại tự đổi theo — không cần thông báo đẩy
// hay Zalo OA. Đo 16/10: 1/39 tài khoản talent từng mở app, 0 lần bấm "Đã nhận" ⇒ lịch phải tự tới điện thoại.
//
// Link = mã bí mật (`talent_calendar_feeds.token`, chỉ service_role đọc được). Ai có link thấy lịch ca của người đó (giờ, brand,
// phòng, người đi cùng) — không có GMV, target, rate. Lộ link thì người đó bấm "Đổi link" ở tab Tôi, link cũ chết ngay.
//
// File này tự chứa (không import lib khác của app): api/index.ts chạy ESM không qua bundler, import tương đối nào cũng phải có ".js"
// cho cả chuỗi (tests/serverImports.test.ts). Luật đổi người giữa ca chép đúng `effectiveSegments` (lib/staffSegments.ts): vai
// có đoạn thì đoạn là sự thật, vai không có đoạn thì host_id / co_host_id làm cả ca.

export type FeedRole = "host" | "co_host";

export interface FeedSessionRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  platform: string | null;
  brand_name: string | null;
  studio_name: string | null;
  host_id: string | null;
  host_name: string | null;
  co_host_id: string | null;
  co_host_name: string | null;
  is_backfill: boolean | null;
}

export interface FeedSegmentRow {
  session_id: string;
  talent_id: string;
  role: FeedRole;
  from_min: number;
  to_min: number;
}

export interface FeedEvent {
  uid: string;
  /** ms UTC */
  start: number;
  end: number;
  summary: string;
  location: string;
  description: string;
}

const VN_OFFSET_MIN = 7 * 60; // Asia/Ho_Chi_Minh, không có giờ mùa hè
const hhmm = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
const sessionLen = (s: Pick<FeedSessionRow, "start_time" | "end_time">) => {
  const d = hhmm(s.end_time) - hhmm(s.start_time);
  return d <= 0 ? d + 1440 : d;
};
/** ms UTC của phút thứ `offset` kể từ giờ bắt đầu ca (ngày theo giờ Việt Nam). */
const atOffset = (s: Pick<FeedSessionRow, "date" | "start_time">, offset: number) => {
  const [y, mo, d] = s.date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d) + (hhmm(s.start_time) + offset - VN_OFFSET_MIN) * 60_000;
};
const clock = (s: Pick<FeedSessionRow, "start_time">, offset: number) => {
  const t = (hhmm(s.start_time) + offset) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** Các khoảng (phút kể từ đầu ca) người này đứng ca theo từng vai. */
export function personWindows(s: FeedSessionRow, segs: FeedSegmentRow[], talentId: string): { role: FeedRole; from: number; to: number }[] {
  const out: { role: FeedRole; from: number; to: number }[] = [];
  for (const role of ["host", "co_host"] as const) {
    const own = segs.filter((g) => g.session_id === s.id && g.role === role);
    if (own.length > 0) {
      for (const g of own) if (g.talent_id === talentId) out.push({ role, from: g.from_min, to: g.to_min });
    } else if ((role === "host" ? s.host_id : s.co_host_id) === talentId) {
      out.push({ role, from: 0, to: sessionLen(s) });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

const PLATFORM_LABEL: Record<string, string> = { TikTok: "TikTok", Shopee: "Shopee" };

/** Sự kiện lịch của một người: một sự kiện cho mỗi khoảng đứng ca, bỏ ca huỷ và ca nạp bù. */
export function feedEvents(sessions: FeedSessionRow[], segs: FeedSegmentRow[], talentId: string, appUrl: string): FeedEvent[] {
  const out: FeedEvent[] = [];
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.is_backfill) continue;
    const wins = personWindows(s, segs, talentId);
    const len = sessionLen(s);
    for (const w of wins) {
      const roleLabel = w.role === "host" ? "Host" : "Trợ live";
      const partner = w.role === "host" ? s.co_host_name ? `Trợ live: ${s.co_host_name}` : "Không có trợ live" : `Host: ${s.host_name || "chưa có"}`;
      const part = w.from > 0 || w.to < len ? `Bạn đứng ${clock(s, w.from)}–${clock(s, w.to)} của ca ${clock(s, 0)}–${clock(s, len)}` : "";
      out.push({
        uid: `${s.id}-${talentId}-${w.role}-${w.from}@liveops`,
        start: atOffset(s, w.from),
        end: atOffset(s, w.to),
        summary: `${s.brand_name || "Ca live"} ${PLATFORM_LABEL[s.platform ?? ""] ?? s.platform ?? ""} · ${roleLabel}`.replace(/\s+·/, " ·"),
        location: s.studio_name || "",
        description: [partner, part, `Mở app: ${appUrl}`].filter(Boolean).join("\n")
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------- RFC 5545 ----------

const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Gấp dòng dài hơn 75 byte (UTF-8) — không cắt giữa một ký tự nhiều byte. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // dòng nối bắt đầu bằng 1 dấu cách
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcs(calName: string, events: FeedEvent[], nowMs: number, remindMin = 60): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LiveOps AI//Lich ca live//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H"
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${icsDate(nowMs)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${esc(e.summary)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      `DESCRIPTION:${esc(e.description)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:-PT${remindMin}M`,
      `DESCRIPTION:${esc(`${e.summary} sau ${remindMin} phút`)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export const newFeedToken = () => crypto.randomBytes(24).toString("base64url");
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const FEED_PAST_DAYS = 14;
const FEED_AHEAD_DAYS = 62;

const isoDay = (ms: number) => new Date(ms + VN_OFFSET_MIN * 60_000).toISOString().slice(0, 10);

type Caller = { userId?: string; reason?: string };

/** Đăng ký 3 route: lấy link của mình, đổi link, và file .ics công khai theo mã. */
export function registerCalendarFeedRoutes(
  app: express.Express,
  deps: {
    supabaseAdmin: SupabaseClient | null;
    authUserOf: (req: express.Request) => Promise<Caller>;
    rateLimit: (windowMs: number, max: number) => express.RequestHandler;
  }
) {
  const { supabaseAdmin, authUserOf, rateLimit } = deps;

  const myTalentId = async (req: express.Request, res: express.Response): Promise<string | null> => {
    const caller = await authUserOf(req);
    if (!caller.userId || !supabaseAdmin) {
      res.status(403).json({ error: caller.reason ?? "forbidden" });
      return null;
    }
    const { data, error } = await supabaseAdmin.from("profiles").select("assigned_talent_id").eq("id", caller.userId).maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return null;
    }
    if (!data?.assigned_talent_id) {
      res.status(400).json({ error: "Tài khoản chưa gắn hồ sơ host/trợ live." });
      return null;
    }
    return data.assigned_talent_id as string;
  };

  // Bảng chưa có (chưa chạy 0177) ⇒ trả 501 để màn nói rõ "chưa bật", không phải lỗi lạ.
  const missingTable = (msg: string | undefined) => /talent_calendar_feeds/.test(msg ?? "") && /(does not exist|schema cache|not find)/i.test(msg ?? "");

  app.get("/api/me/calendar-feed", rateLimit(60_000, 30), async (req, res) => {
    const talentId = await myTalentId(req, res);
    if (!talentId || !supabaseAdmin) return;
    const { data, error } = await supabaseAdmin.from("talent_calendar_feeds").select("token").eq("talent_id", talentId).maybeSingle();
    if (error) return res.status(missingTable(error.message) ? 501 : 500).json({ error: error.message });
    if (data?.token) return res.json({ token: data.token });
    const token = newFeedToken();
    const ins = await supabaseAdmin.from("talent_calendar_feeds").insert({ talent_id: talentId, token });
    if (ins.error) {
      // Hai máy bấm cùng lúc: dòng của máy kia đã vào trước — đọc lại.
      const again = await supabaseAdmin.from("talent_calendar_feeds").select("token").eq("talent_id", talentId).maybeSingle();
      if (again.data?.token) return res.json({ token: again.data.token });
      return res.status(missingTable(ins.error.message) ? 501 : 500).json({ error: ins.error.message });
    }
    res.json({ token });
  });

  app.post("/api/me/calendar-feed/rotate", rateLimit(60_000, 10), async (req, res) => {
    const talentId = await myTalentId(req, res);
    if (!talentId || !supabaseAdmin) return;
    const token = newFeedToken();
    const { error } = await supabaseAdmin
      .from("talent_calendar_feeds")
      .upsert({ talent_id: talentId, token, rotated_at: new Date().toISOString() }, { onConflict: "talent_id" });
    if (error) return res.status(missingTable(error.message) ? 501 : 500).json({ error: error.message });
    res.json({ token });
  });

  // Ứng dụng lịch tự tải lại mỗi ~1 giờ (Google: vài giờ). Không xác thực — mã trong link chính là quyền đọc.
  app.get("/api/calendar/:file", rateLimit(60_000, 60), async (req, res) => {
    const token = String(req.params.file || "").replace(/\.ics$/i, "");
    if (!supabaseAdmin || !TOKEN_RE.test(token)) return res.status(404).send("Not found");
    const feed = await supabaseAdmin.from("talent_calendar_feeds").select("talent_id").eq("token", token).maybeSingle();
    if (feed.error || !feed.data) return res.status(404).send("Not found");
    const talentId = feed.data.talent_id as string;

    const now = Date.now();
    const from = isoDay(now - FEED_PAST_DAYS * 86_400_000);
    const to = isoDay(now + FEED_AHEAD_DAYS * 86_400_000);
    const cols = "id,date,start_time,end_time,status,platform,brand_name,studio_name,host_id,host_name,co_host_id,co_host_name,is_backfill";
    const [talent, direct, segRows] = await Promise.all([
      supabaseAdmin.from("talents").select("name,nickname").eq("id", talentId).maybeSingle(),
      supabaseAdmin.from("live_sessions").select(cols).or(`host_id.eq.${talentId},co_host_id.eq.${talentId}`).gte("date", from).lte("date", to),
      supabaseAdmin.from("session_staff_segments").select("session_id").eq("talent_id", talentId)
    ]);
    if (direct.error) return res.status(500).send("Error");
    const sessions = new Map<string, FeedSessionRow>(((direct.data ?? []) as FeedSessionRow[]).map((s) => [s.id, s]));
    const segIds = [...new Set(((segRows.data ?? []) as { session_id: string }[]).map((r) => r.session_id))].filter((id) => !sessions.has(id));
    if (segIds.length > 0) {
      const extra = await supabaseAdmin.from("live_sessions").select(cols).in("id", segIds).gte("date", from).lte("date", to);
      for (const s of (extra.data ?? []) as FeedSessionRow[]) sessions.set(s.id, s);
    }
    const ids = [...sessions.keys()];
    const segs = ids.length
      ? (((await supabaseAdmin.from("session_staff_segments").select("session_id,talent_id,role,from_min,to_min").in("session_id", ids)).data ?? []) as FeedSegmentRow[])
      : [];

    const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] || req.protocol;
    const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host || "";
    const appUrl = `${proto}://${host}/ca-cua-toi`;
    const who = talent.data?.nickname?.trim() || talent.data?.name || "";
    const body = buildIcs(`Lịch live${who ? ` · ${who}` : ""}`, feedEvents([...sessions.values()], segs, talentId, appUrl), now);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="lich-live.ics"');
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(body);
  });
}
