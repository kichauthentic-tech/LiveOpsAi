// Gợi ý gộp các dòng đối soát thuộc cùng một ca bị restart / ngắt giữa chừng (0167).
// Mỗi lần tắt bật stream sàn sinh một room mới. Hai kiểu cần gộp:
//  • mảnh ngắn (≤ BLIP_MINUTES, thường GMV 0): dính vào dòng LIỀN KỀ gần nhất (khoảng nghỉ ≤ MAX_GAP_MINUTES);
//  • hai room dài bị ngắt giữa chừng: khoảng nghỉ ≤ CUT_GAP_MINUTES và cùng khớp một ca.
// Chỉ GỢI Ý — ops xem nhóm rồi mới bấm gộp. Hàm thuần, không đọc DB.

import type { ReconciliationRow } from "../db/liveReconciliation";

export const BLIP_MINUTES = 10;
export const MAX_GAP_MINUTES = 10;
export const CUT_GAP_MINUTES = 5;

export interface MergeGroup {
  /** Id các dòng của nhóm, theo thứ tự giờ bắt đầu. */
  ids: string[];
  startedAt: string;
  endedAt: string;
  gmv: number;
  /** Số mảnh ngắn trong nhóm — để hiện "N lần restart". */
  blips: number;
}

const MIN = 60_000;

export function suggestMergeGroups(rows: ReconciliationRow[]): MergeGroup[] {
  const cand = rows
    .filter((r) => (r.bucket === "agency" || r.bucket === "review") && r.startedAt && r.endedAt)
    .map((r) => ({ r, s: Date.parse(r.startedAt!), e: Date.parse(r.endedAt!) }))
    .filter((c) => Number.isFinite(c.s) && Number.isFinite(c.e) && c.e >= c.s)
    .sort((a, b) => a.s - b.s || a.e - b.e);

  const parent = cand.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  const gap = (a: number, b: number) => Math.max(0, (cand[b].s - cand[a].e) / MIN);
  const isBlip = (i: number) => (cand[i].e - cand[i].s) / MIN <= BLIP_MINUTES;

  for (let i = 0; i < cand.length; i++) {
    if (isBlip(i)) {
      const prev = i > 0 ? gap(i - 1, i) : Infinity;
      const next = i < cand.length - 1 ? gap(i, i + 1) : Infinity;
      if (Math.min(prev, next) > MAX_GAP_MINUTES) continue;
      union(i, next <= prev ? i + 1 : i - 1);
    } else if (i < cand.length - 1 && !isBlip(i + 1) && gap(i, i + 1) <= CUT_GAP_MINUTES) {
      const a = new Set(cand[i].r.matchedSessionIds);
      if (cand[i + 1].r.matchedSessionIds.some((id) => a.has(id))) union(i, i + 1);
    }
  }

  const byRoot = new Map<number, number[]>();
  cand.forEach((_, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), i]));
  return [...byRoot.values()]
    .filter((m) => m.length >= 2)
    .map((m) => ({
      ids: m.map((i) => cand[i].r.id),
      startedAt: cand[m[0]].r.startedAt!,
      endedAt: new Date(Math.max(...m.map((i) => cand[i].e))).toISOString(),
      gmv: m.reduce((s, i) => s + cand[i].r.gmv, 0),
      blips: m.filter(isBlip).length
    }))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}
