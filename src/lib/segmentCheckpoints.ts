import type { LiveSession, StaffCheckpoint } from "../types";
import { clockAtOffset, segmentsOfRole } from "./staffSegments";

// Số lúc đổi HOST giữa ca (migration 0147). Khi host này xuống, trợ live up ngay số TỔNG đang thấy trên dashboard; host sau =
// số cuối ca − số lúc đổi. MỘT nơi định nghĩa "chỗ đổi host" và "phần GMV/view/đơn của từng host" cho mọi màn
// (hostPortions, form nhập, Sổ Ca). Không có số ⇒ quay về chia theo giờ (0138), nên ca cũ không đổi số.
//
// Số của một host = hiệu hai lần chụp số TỔNG, nhưng số chốt (file đối soát) thường cao hơn số lúc giao ca (đo T8–T9: 16–23%)
// nên KHÔNG trừ thẳng vào GMV của ca: lấy TỶ LỆ các phần rồi nhân vào số chính thức của ca (actualGmv…). Cộng phần các host
// luôn bằng đúng số của ca.

export interface HostBoundary {
  atMin: number;
  clock: string;
  fromName: string;
  toName: string;
  fromTalentId: string;
  toTalentId: string;
}

/** Các chỗ đổi host: giữa hai đoạn host liền nhau (đã khai báo ở "Đổi người giữa ca"). Ca không chia đoạn host: []. */
export function hostBoundaries(s: LiveSession): HostBoundary[] {
  if (!(s.staffSegments ?? []).some((g) => g.role === "host")) return [];
  const segs = segmentsOfRole(s, "host");
  const out: HostBoundary[] = [];
  for (let i = 0; i + 1 < segs.length; i++) {
    const a = segs[i], b = segs[i + 1];
    out.push({
      atMin: a.toMin,
      clock: clockAtOffset(s, a.toMin),
      fromName: a.talentName,
      toName: b.talentName,
      fromTalentId: a.talentId,
      toTalentId: b.talentId
    });
  }
  return out;
}

export function checkpointAt(s: Pick<LiveSession, "staffCheckpoints">, atMin: number): StaffCheckpoint | undefined {
  return (s.staffCheckpoints ?? []).find((c) => c.atMin === atMin);
}

/** Chỗ đổi host chưa có số (việc trợ live cần làm). */
export function missingCheckpoints(s: LiveSession): HostBoundary[] {
  return hostBoundaries(s).filter((b) => !checkpointAt(s, b.atMin));
}

export type CheckpointMetric = "gmv" | "views" | "orders";

/** Tỷ lệ từng host trong một chỉ số, theo thứ tự đoạn host. null = chưa đủ số để chia (dùng chia theo giờ). */
function partRatios(s: LiveSession, metric: CheckpointMetric): number[] | null {
  const bounds = hostBoundaries(s);
  if (bounds.length === 0) return null;
  const cps = bounds.map((b) => checkpointAt(s, b.atMin));
  if (cps.some((c) => !c)) return null;
  const pick = (c: StaffCheckpoint) => (metric === "gmv" ? c.cumGmv : metric === "views" ? c.cumViews : c.cumOrders);
  const baseOf = (c: StaffCheckpoint) => (metric === "gmv" ? c.baseGmv : metric === "views" ? c.baseViews : c.baseOrders);
  const cums = cps.map((c) => pick(c!));
  if (cums.some((v) => v == null)) return null;
  const base = baseOf(cps[0]!);

  // Phần các host trước host cuối = hiệu hai lần chụp (số không giảm: DB chặn, ở đây kẹp 0 cho chắc).
  const parts: number[] = [];
  let prev = base;
  for (const c of cums as number[]) {
    parts.push(Math.max(c - prev, 0));
    prev = Math.max(c, prev);
  }
  // Host cuối = số cuối ca − số lúc đổi cuối. Số cuối: số TỔNG lúc giao ca nếu có, không thì số chính thức của ca.
  const r = s.report;
  const finalCum = metric === "gmv" ? r?.cumGmv : metric === "views" ? r?.cumViews : r?.cumOrders;
  const official = metric === "gmv" ? s.actualGmv : metric === "views" ? s.totalViews : s.totalOrders;
  const finalTotal = finalCum != null ? finalCum - base : official ?? 0;
  parts.push(Math.max(finalTotal - parts.reduce((a, b) => a + b, 0), 0));

  const sum = parts.reduce((a, b) => a + b, 0);
  return sum > 0 ? parts.map((p) => p / sum) : null;
}

/** Tỷ lệ theo người (cộng mọi đoạn host của người đó) cho từng chỉ số có số lúc đổi host; chỉ số nào chưa đủ thì vắng. */
export function hostMetricShares(s: LiveSession): Partial<Record<CheckpointMetric, Map<string, number>>> {
  const segs = segmentsOfRole(s, "host");
  const out: Partial<Record<CheckpointMetric, Map<string, number>>> = {};
  for (const metric of ["gmv", "views", "orders"] as const) {
    const ratios = partRatios(s, metric);
    if (!ratios || ratios.length !== segs.length) continue;
    const m = new Map<string, number>();
    segs.forEach((g, i) => m.set(g.talentId, (m.get(g.talentId) ?? 0) + ratios[i]));
    out[metric] = m;
  }
  return out;
}
