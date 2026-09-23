import { LiveSession, UserRole } from "../types";
import { SnapshotCounters, SnapshotRatios, computeSnapshotRatios } from "./liveSnapshot/metrics";
import { dataQuality, DataQuality, isCountable, sessionHours } from "./performance/hostPerformance";

// Sổ Ca (2026-09-19): nhìn theo TỪNG CA đã/đang chạy — số thật của ca, số đó tin được tới đâu,
// và còn thiếu bước nào để chốt tháng. Thay cho Live Sessions Hub (màn demo: chart phút/checklist/
// SKU/AI coach không có luồng ghi) và bảng Sessions thô của brand workspace. Chỉ đọc, không có
// form sửa số tay: đường ghi số vẫn là snapshot → report → đối soát như đã chốt.

export type MissingStep = "snapshot" | "report" | "reconcile";

export interface LedgerFilter {
  month: string; // "YYYY-MM", "" = mọi tháng
  brandId?: string;
  hostKey?: string;
  status?: LiveSession["status"] | "";
  missing?: MissingStep | "";
}

// Đã có số từ file: bậc live_snapshot/tiktok_reconciled, hoặc ca nạp bù (0086) mang sẵn room.
export function hasSnapshot(s: LiveSession): boolean {
  return s.dataSource === "live_snapshot" || s.dataSource === "tiktok_reconciled" || (s.liveRoomIds?.length ?? 0) > 0;
}

export function hasReport(s: LiveSession): boolean {
  return !!s.report?.submittedAt || !!s.report?.submittedByTalentId;
}

export function isReconciled(s: LiveSession): boolean {
  return s.dataSource === "tiktok_reconciled";
}

// Chỉ ca ĐÃ CHẠY mới "thiếu" được gì: ca sắp tới chưa có gì để thiếu, ca huỷ không cần số, ca
// nạp bù từ file tháng cũ không thể bổ sung report (không có host) nên cũng không đưa vào việc.
export function needsClosing(s: LiveSession, today: string): boolean {
  if (s.status === "Cancelled" || s.isBackfill) return false;
  if (s.status === "Completed") return true;
  return s.date < today;
}

export function missingSteps(s: LiveSession, today: string): MissingStep[] {
  if (!needsClosing(s, today)) return [];
  const out: MissingStep[] = [];
  if (!hasSnapshot(s)) out.push("snapshot");
  if (!hasReport(s)) out.push("report");
  if (!isReconciled(s)) out.push("reconcile");
  return out;
}

export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// Danh sách tháng có ca, mới nhất trước — để dropdown không liệt kê tháng trống.
export function ledgerMonths(sessions: LiveSession[]): string[] {
  return [...new Set(sessions.map((s) => monthOf(s.date)))].sort((a, b) => b.localeCompare(a));
}

// Cùng quy ước gom host với hostPerformance.hostKey: host_id có thể null trong khi tên còn.
export function ledgerHostKey(s: LiveSession): string {
  return s.hostId || (s.hostName ? `ten:${s.hostName}` : "");
}

export function ledgerHosts(sessions: LiveSession[]): { key: string; name: string }[] {
  const m = new Map<string, string>();
  for (const s of sessions) {
    const k = ledgerHostKey(s);
    if (k && !m.has(k)) m.set(k, s.hostName);
  }
  return [...m.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export function filterLedger(sessions: LiveSession[], f: LedgerFilter, today: string): LiveSession[] {
  return sessions
    .filter((s) => {
      if (f.month && monthOf(s.date) !== f.month) return false;
      if (f.brandId && s.brandId !== f.brandId) return false;
      if (f.hostKey && ledgerHostKey(s) !== f.hostKey) return false;
      if (f.status && s.status !== f.status) return false;
      if (f.missing && !missingSteps(s, today).includes(f.missing)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
}

export interface LedgerDay {
  date: string;
  sessions: LiveSession[];
}

export function groupByDate(rows: LiveSession[]): LedgerDay[] {
  const out: LedgerDay[] = [];
  for (const s of rows) {
    const last = out[out.length - 1];
    if (last && last.date === s.date) last.sessions.push(s);
    else out.push({ date: s.date, sessions: [s] });
  }
  return out;
}

export interface LedgerSummary {
  total: number;
  countable: number;
  hours: number;
  gmv: number;
  orders: number;
  gmvPerHour: number;
  quality: DataQuality;
  missing: Record<MissingStep, number>;
}

// Tổng hợp theo đúng bộ lọc đang xem. Số hiệu suất chỉ cộng ca "đếm được" (isCountable — cùng
// quy ước với Hiệu Suất Host) để GMV/giờ không bị pha loãng bởi ca chưa có số.
export function summarize(rows: LiveSession[], today: string): LedgerSummary {
  const countable = rows.filter(isCountable);
  const hours = countable.reduce((a, s) => a + sessionHours(s), 0);
  const gmv = countable.reduce((a, s) => a + (s.actualGmv ?? 0), 0);
  const orders = countable.reduce((a, s) => a + (s.totalOrders ?? 0), 0);
  const missing: Record<MissingStep, number> = { snapshot: 0, report: 0, reconcile: 0 };
  for (const s of rows) for (const m of missingSteps(s, today)) missing[m]++;
  return {
    total: rows.length,
    countable: countable.length,
    hours,
    gmv,
    orders,
    gmvPerHour: hours > 0 ? gmv / hours : 0,
    quality: dataQuality(countable),
    missing
  };
}

// 13 cột đếm được của ca (đã trừ theo snapshot) → tỷ lệ tính lại lúc đọc, đúng quy ước tầng
// snapshot. Trả null khi ca chưa có số từ file — số tự khai tay không có đủ cột để tính tỷ lệ.
export function sessionCounters(s: LiveSession): SnapshotCounters | null {
  if (!hasSnapshot(s)) return null;
  return {
    gmv: s.actualGmv ?? 0,
    itemsSold: s.attributedItemsSold ?? 0,
    orders: s.totalOrders ?? 0,
    skuOrders: s.attributedSkuOrders ?? 0,
    views: s.totalViews ?? 0,
    impressions: s.impressions ?? 0,
    productImpressions: s.productImpressions ?? 0,
    productClicks: s.productClicks ?? 0,
    newFollowers: s.newFollowers ?? 0,
    comments: s.commentsCount ?? 0,
    shares: s.sharesCount ?? 0,
    likes: s.likesCount ?? 0,
    durationMinutes: s.liveDurationMinutes ?? 0
  };
}

export function sessionRatios(s: LiveSession): SnapshotRatios | null {
  const c = sessionCounters(s);
  return c ? computeSnapshotRatios(c) : null;
}

// Ca nối: 2+ ca dùng chung 1 Room ID (host không tắt stream khi giao ca). Trả map sessionId →
// id các ca khác cùng room, để bảng đánh dấu và drawer liệt kê.
export function linkedSessions(sessions: LiveSession[]): Map<string, string[]> {
  const byRoom = new Map<string, string[]>();
  for (const s of sessions) {
    for (const r of s.liveRoomIds ?? []) {
      const list = byRoom.get(r) ?? [];
      list.push(s.id);
      byRoom.set(r, list);
    }
  }
  const out = new Map<string, string[]>();
  for (const ids of byRoom.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const cur = out.get(id) ?? [];
      for (const other of ids) if (other !== id && !cur.includes(other)) cur.push(other);
      out.set(id, cur);
    }
  }
  return out;
}

// Brand không cần hiểu 3 bậc nguồn: chưa đối soát là "tạm tính", đối soát xong là "đã chốt".
/** Số liệu của ca này có được phép hiện cho người đang xem không (migration 0107, Đợt B).
 *
 *  Chỉ role `brand` mới bị chặn, và chỉ khi tháng của ca CHƯA phát hành Report Tháng. Các cột số
 *  lúc đó đã bị view `live_sessions_secure` che về null → client ép thành 0, nên KHÔNG được hiện
 *  thẳng: "0 đ" đọc thành "agency bán được 0 đồng" chứ không phải "chưa tới lúc bạn xem".
 *
 *  Cố ý xét `role` chứ không xét `variant === "brand"` của Sổ Ca: ops mở Brand Workspace hộ khách
 *  qua switcher vẫn đang là ops và vẫn phải thấy đủ số để soát trước khi phát hành.
 */
export function metricsHiddenFor(s: LiveSession, role: UserRole): boolean {
  return role === "brand" && !s.monthPublished;
}

export function brandTrustLabel(s: LiveSession): "Đã chốt" | "Tạm tính" {
  return isReconciled(s) ? "Đã chốt" : "Tạm tính";
}

export interface SessionIncident {
  key: "restart" | "crossLive" | "hostLate" | "ot" | "earlyLeave";
  label: string;
  internal: boolean; // true = chỉ agency thấy (chuyện giữa agency và talent, không đưa cho brand)
}

export function sessionIncidents(s: LiveSession): SessionIncident[] {
  const r = s.report;
  if (!r) return [];
  const out: SessionIncident[] = [];
  if (r.restartCount > 0) out.push({ key: "restart", label: `Restart ×${r.restartCount}`, internal: false });
  if (r.crossLive) out.push({ key: "crossLive", label: "Cross-live", internal: false });
  if (r.hostLate) out.push({ key: "hostLate", label: "Host trễ", internal: true });
  if (r.otMinutes > 0) out.push({ key: "ot", label: `OT ${r.otMinutes}'`, internal: true });
  if (r.earlyLeaveMinutes > 0) out.push({ key: "earlyLeave", label: `Off sớm ${r.earlyLeaveMinutes}'`, internal: true });
  return out;
}
