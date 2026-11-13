import type { LiveSession } from "../types";
import { clockAtOffset, segmentsOfRole, sessionMinutes } from "./staffSegments";
import { hostPortions } from "./performance/hostPerformance";

// Ca đổi host giữa ca ĐÃ có số liệu (12/11): DB giữ MỘT ca (file, đối soát, lương không đụng), nhưng Sổ Ca hiện mỗi host một dòng —
// giờ riêng, target chia theo phút, GMV/đơn/view theo phần thật của host (hostPortions: số lúc đổi host nếu có, không thì chia theo giờ).
// Ca chưa có số liệu được DB tách thành ca thật (0216) nên không còn đoạn host để tách ở đây.
// Chỉ tách khi mỗi host đứng đúng một đoạn (A→B). Kiểu A→B→A giữ một dòng (phần chia theo người, không theo đoạn).
// Mọi dòng ảo giữ nguyên `id` của ca gốc: bấm vào mở đúng cửa sổ ca.

// Trợ live của một dòng ảo: một dòng = MỘT tên trợ (như host), không hiện chuỗi "A → B" — thẻ trên lịch
// theo giờ hẹp theo đúng phút của dòng (có dòng chỉ ~1-2 tiếng), chữ dài dễ bị thẻ cắt mất. Trợ đổi người NGAY
// TRONG một dòng (ví dụ Giang → Vương trong 1h35' của dòng host B) chỉ lấy người đứng NHIỀU PHÚT NHẤT trong khung
// [from,to) của dòng (hoà: vào trước); xem chi tiết đổi người thật thì mở cửa sổ ca. Khung không có trợ nào = để trống.
function coHostOfWindow(s: LiveSession, from: number, to: number): Partial<LiveSession> {
  const cs = segmentsOfRole(s, "co_host");
  if (cs.length === 0) return {};
  const inWin = cs.filter((c) => c.fromMin < to && c.toMin > from);
  if (inWin.length === 0) return { coHostId: undefined, coHostName: "" };
  const mins = new Map<string, number>();
  for (const c of inWin) mins.set(c.talentId, (mins.get(c.talentId) ?? 0) + Math.min(c.toMin, to) - Math.max(c.fromMin, from));
  const main = [...mins.entries()].sort((a, b) => b[1] - a[1] || inWin.findIndex((c) => c.talentId === a[0]) - inWin.findIndex((c) => c.talentId === b[0]))[0];
  return { coHostId: main[0], coHostName: inWin.find((c) => c.talentId === main[0])!.talentName, staffSegments: undefined };
}

export function hostSplitRows(s: LiveSession): LiveSession[] {
  const segs = segmentsOfRole(s, "host");
  if (segs.length < 2 || new Set(segs.map((g) => g.talentId)).size !== segs.length) return [s];
  const byTalent = new Map(hostPortions(s).map((p) => [p.hostId, p]));
  if (segs.some((g) => !byTalent.has(g.talentId))) return [s];
  const dur = sessionMinutes(s);
  if (dur <= 0) return [s];
  let targetLeft = s.targetGmv ?? 0;
  return segs.map((g, i) => {
    const from = i === 0 ? 0 : segs[i - 1].toMin;
    const to = i === segs.length - 1 ? dur : g.toMin;
    const target = i === segs.length - 1 ? targetLeft : Math.round((s.targetGmv ?? 0) * (to - from) / dur);
    targetLeft -= target;
    return { ...byTalent.get(g.talentId)!, ...coHostOfWindow(s, from, to), startTime: clockAtOffset(s, from), endTime: clockAtOffset(s, to), targetGmv: target, actualStartAt: undefined, actualEndAt: undefined };
  });
}

/** Khoá React cho dòng ảo (cùng id ca gốc nên không dùng id làm khoá). */
export const hostSplitKey = (s: LiveSession): string => `${s.id}|${s.hostId}|${s.startTime}`;
