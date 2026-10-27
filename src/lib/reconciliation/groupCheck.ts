// Kiểm tra đối soát theo NHÓM LIÊN THÔNG (ca ↔ phiên): các ca và phiên dính nhau qua cùng một phiên thì thuộc một nhóm,
// nên ca nối, restart và ngắt giữa chừng dùng chung MỘT phép kiểm: tổng các ca của nhóm = tổng các phiên trong file.
// Chỉ ĐỌC — không đổi số nào. Hàm thuần, không đọc DB.

import type { LiveSession } from "../../types";
import type { ReconciliationRow, ReconShare } from "../db/liveReconciliation";
import { sessionWindowMs } from "../sessionStatus";
import { fmtVndFull } from "../format";

export type CheckKind = "sum_mismatch" | "outside_shift" | "gap" | "no_room" | "chip_stale";

export interface CheckIssue {
  kind: CheckKind;
  sessionId?: string;
  rowId?: string;
  /** Câu mô tả đã có tên phiên/giờ; ca được ghép nhãn ở UI qua `sessionId`. */
  text: string;
}

export interface ReconGroup {
  rowIds: string[];
  sessionIds: string[];
  fileGmv: number;
  shareGmv: number | null;
  /** "uoc_tinh" khi có ô chia theo giờ (thiếu snapshot); còn lại "chuan". */
  tier: "chuan" | "uoc_tinh";
  issues: CheckIssue[];
}

export interface ReconCheck {
  groups: ReconGroup[];
  /** Ca đã diễn ra trong kỳ file nhưng không phiên nào khớp. */
  orphanIssues: CheckIssue[];
  issues: CheckIssue[];
  counts: { chuan: number; uocTinh: number; canCheck: number };
  gmv: { chuan: number; uocTinh: number; canCheck: number };
}

export const OUTSIDE_TOLERANCE_MIN = 15;
const MIN = 60_000;

export interface CheckInput {
  rows: ReconciliationRow[];
  /** Bản chia theo dòng (preview_live_reconciliation); null = DB chưa có 0171 ⇒ bỏ phép kiểm tổng. */
  shares: Map<string, ReconShare[]> | null;
  sessions: LiveSession[];
  appliedAt?: string;
  periodStart?: string;
  periodEnd?: string;
  /** Giờ tạo lô: ca kết thúc sau giờ này thì file chưa thể có. */
  batchCreatedAt?: string;
  /** Chỉ hai rổ này được ghi vào ca. */
  appliedBuckets?: string[];
}

export function checkReconGroups(input: CheckInput): ReconCheck {
  const { shares, appliedAt } = input;
  const buckets = input.appliedBuckets ?? ["agency", "review"];
  const byId = new Map(input.sessions.map((s) => [s.id, s]));
  const rows = input.rows.filter((r) => buckets.includes(r.bucket) && !r.excluded && r.matchedSessionIds.length > 0);

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p !== x) { p = find(p); parent.set(x, p); }
    return p;
  };
  for (const r of rows) for (const id of r.matchedSessionIds) parent.set(find(id), find(r.matchedSessionIds[0]));

  const byGroup = new Map<string, ReconciliationRow[]>();
  for (const r of rows) {
    const k = find(r.matchedSessionIds[0]);
    byGroup.set(k, [...(byGroup.get(k) ?? []), r]);
  }

  const label = (id: string) => {
    const s = byId.get(id);
    return s ? `${s.date.slice(8, 10)}/${s.date.slice(5, 7)} ${s.startTime}–${s.endTime}` : "ca ẩn";
  };
  const appliedMs = appliedAt ? Date.parse(appliedAt) : null;
  const groups: ReconGroup[] = [];

  for (const gRows of byGroup.values()) {
    const sessionIds = [...new Set(gRows.flatMap((r) => r.matchedSessionIds))];
    const fileGmv = gRows.reduce((s, r) => s + r.gmv, 0);
    const issues: CheckIssue[] = [];
    let shareGmv: number | null = null;
    let estimated = false;

    if (shares && gRows.every((r) => (shares.get(r.id)?.length ?? 0) > 0)) {
      const all = gRows.flatMap((r) => shares.get(r.id) ?? []);
      shareGmv = all.reduce((s, sh) => s + sh.gmv, 0);
      estimated = all.some((sh) => sh.method === "time");
      if (Math.abs(fileGmv - shareGmv) > Math.max(1000, fileGmv * 0.005)) {
        issues.push({ kind: "sum_mismatch", rowId: gRows[0].id, sessionId: sessionIds[0], text: `Tổng các ca ${fmtVndFull(shareGmv)} khác tổng phiên trong file ${fmtVndFull(fileGmv)}` });
      }
      // Mục tiêu 1: số đang hiển thị trên ca vs số đúng theo file (chỉ ca mà lần đối soát gần nhất là lô này).
      if (appliedMs != null) {
        const want = new Map<string, { gmv: number; current: number; source?: string }>();
        for (const sh of all) {
          const w = want.get(sh.sessionId) ?? { gmv: 0, current: sh.currentGmv, source: sh.currentSource };
          w.gmv += sh.gmv;
          want.set(sh.sessionId, w);
        }
        for (const [sid, w] of want) {
          const at = byId.get(sid)?.reconciledAt;
          if (!at || Date.parse(at) > appliedMs + 60_000) continue;
          if (w.source === "tiktok_reconciled" && Math.abs(w.gmv - w.current) > Math.max(1, Math.abs(w.current) * 0.01)) {
            issues.push({ kind: "chip_stale", sessionId: sid, text: `Số trên ca ${fmtVndFull(w.current)}, đúng theo file ${fmtVndFull(w.gmv)} — bấm Áp Dụng Lại` });
          }
        }
      }
    }

    for (const r of gRows) {
      if (!r.startedAt || !r.endedAt) continue;
      const rs = Date.parse(r.startedAt), re = Date.parse(r.endedAt);
      const wins = r.matchedSessionIds.map((id) => ({ id, w: byId.get(id) })).filter((x) => x.w).map((x) => ({ id: x.id, w: sessionWindowMs(x.w!) })).sort((a, b) => a.w[0] - b.w[0]);
      if (wins.length === 0) continue;
      const head = (wins[0].w[0] - rs) / MIN;
      const tail = (re - Math.max(...wins.map((x) => x.w[1]))) / MIN;
      if (head > OUTSIDE_TOLERANCE_MIN) issues.push({ kind: "outside_shift", rowId: r.id, sessionId: wins[0].id, text: `Phiên bắt đầu sớm hơn ca ${Math.round(head)} phút — phần đó ngoài lịch` });
      if (tail > OUTSIDE_TOLERANCE_MIN) issues.push({ kind: "outside_shift", rowId: r.id, sessionId: wins[wins.length - 1].id, text: `Phiên kết thúc muộn hơn ca ${Math.round(tail)} phút — phần đó ngoài lịch` });
      for (let i = 0; i + 1 < wins.length; i++) {
        const gap = (wins[i + 1].w[0] - wins[i].w[1]) / MIN;
        if (gap > OUTSIDE_TOLERANCE_MIN) issues.push({ kind: "gap", rowId: r.id, sessionId: wins[i + 1].id, text: `Hai ca nối cùng một phiên cách nhau ${Math.round(gap)} phút — thiếu ca ở giữa?` });
      }
    }

    groups.push({ rowIds: gRows.map((r) => r.id), sessionIds, fileGmv, shareGmv, tier: estimated ? "uoc_tinh" : "chuan", issues });
  }

  // Ca đã diễn ra trong kỳ file (và file đã có thể chứa nó) nhưng không phiên nào của lô khớp — kể cả phiên bị bỏ chọn.
  const matchedAny = new Set(input.rows.flatMap((r) => r.matchedSessionIds));
  const createdMs = input.batchCreatedAt ? Date.parse(input.batchCreatedAt) : Infinity;
  const orphanIssues: CheckIssue[] = [];
  for (const s of input.sessions) {
    if (s.status !== "Completed" || s.isBackfill || matchedAny.has(s.id)) continue;
    if (input.periodStart && s.date < input.periodStart) continue;
    if (input.periodEnd && s.date > input.periodEnd) continue;
    if (sessionWindowMs(s)[1] > createdMs) continue;
    orphanIssues.push({ kind: "no_room", sessionId: s.id, text: `Ca ${label(s.id)} đã diễn ra nhưng không phiên nào trong file khớp — số trên ca chưa được đối soát` });
  }

  const counts = { chuan: 0, uocTinh: 0, canCheck: 0 };
  const gmv = { chuan: 0, uocTinh: 0, canCheck: 0 };
  for (const g of groups) {
    const k = g.issues.length > 0 ? "canCheck" : g.tier === "uoc_tinh" ? "uocTinh" : "chuan";
    counts[k]++;
    gmv[k] += g.fileGmv;
  }
  counts.canCheck += orphanIssues.length;
  return { groups, orphanIssues, issues: [...groups.flatMap((g) => g.issues), ...orphanIssues], counts, gmv };
}
