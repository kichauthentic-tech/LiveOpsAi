import { LiveSession } from "../../types";
import { sessionDurationHours } from "../pnl";

// Giai đoạn 3 của tầng dữ liệu gốc mới: đọc ra hiệu suất thật để làm nền cho việc SẮP LỊCH.
// Chỉ tổng hợp, không tự xếp lịch — ops vẫn là người quyết, đúng tinh thần đã chốt (tránh lặp lại
// rủi ro "hiển thị số chưa đáng tin" của module Dashboard cũ đã xoá).

export interface PerfTotals {
  sessionCount: number;
  hours: number;
  gmv: number;
  orders: number;
  views: number;
  productClicks: number;
  productImpressions: number;
}

export interface PerfRow extends PerfTotals {
  key: string;
  label: string;
  subLabel?: string;
  gmvPerHour: number;
  gmvPerSession: number;
  ctr: number;
}

export interface DataQuality {
  total: number;
  reconciled: number; // đã đối soát chốt
  snapshot: number; // số thật lúc giao ca, TikTok còn cập nhật trễ
  manual: number; // host tự khai, chưa có gì bảo chứng
}

const EMPTY: PerfTotals = {
  sessionCount: 0, hours: 0, gmv: 0, orders: 0, views: 0, productClicks: 0, productImpressions: 0
};

// Giờ live THỰC TẾ nếu có (đọc từ file), nếu chưa có thì tạm dùng giờ kế hoạch của ca. Dùng giờ
// kế hoạch cho GMV/giờ sẽ hơi lệch, nhưng bỏ ca đó ra khỏi thống kê còn sai hơn.
export function sessionHours(s: LiveSession): number {
  if (s.liveDurationMinutes && s.liveDurationMinutes > 0) return s.liveDurationMinutes / 60;
  return sessionDurationHours(s.startTime, s.endTime);
}

// Ca chưa diễn ra hoặc bị huỷ không phản ánh hiệu suất gì.
export function isCountable(s: LiveSession): boolean {
  if (s.status === "Cancelled" || s.status === "Upcoming") return false;
  return (s.actualGmv ?? 0) > 0 || (s.totalViews ?? 0) > 0;
}

function addTo(acc: PerfTotals, s: LiveSession): PerfTotals {
  return {
    sessionCount: acc.sessionCount + 1,
    hours: acc.hours + sessionHours(s),
    gmv: acc.gmv + (s.actualGmv ?? 0),
    orders: acc.orders + (s.totalOrders ?? 0),
    views: acc.views + (s.totalViews ?? 0),
    productClicks: acc.productClicks + (s.productClicks ?? 0),
    productImpressions: acc.productImpressions + (s.productImpressions ?? 0)
  };
}

function finish(key: string, label: string, t: PerfTotals, subLabel?: string): PerfRow {
  return {
    ...t,
    key,
    label,
    subLabel,
    gmvPerHour: t.hours > 0 ? t.gmv / t.hours : 0,
    gmvPerSession: t.sessionCount > 0 ? t.gmv / t.sessionCount : 0,
    ctr: t.productImpressions > 0 ? (t.productClicks / t.productImpressions) * 100 : 0
  };
}

export interface PerfFilter {
  from?: string; // "YYYY-MM-DD"
  to?: string;
  brandId?: string;
  hostId?: string;
}

export function filterSessions(sessions: LiveSession[], f: PerfFilter): LiveSession[] {
  return sessions.filter((s) => {
    if (!isCountable(s)) return false;
    if (f.from && s.date < f.from) return false;
    if (f.to && s.date > f.to) return false;
    if (f.brandId && s.brandId !== f.brandId) return false;
    if (f.hostId && s.hostId !== f.hostId) return false;
    return true;
  });
}

export function dataQuality(sessions: LiveSession[]): DataQuality {
  const q: DataQuality = { total: sessions.length, reconciled: 0, snapshot: 0, manual: 0 };
  for (const s of sessions) {
    if (s.dataSource === "tiktok_reconciled") q.reconciled++;
    else if (s.dataSource === "live_snapshot") q.snapshot++;
    else q.manual++;
  }
  return q;
}

function groupBy(
  sessions: LiveSession[],
  keyOf: (s: LiveSession) => string,
  labelOf: (s: LiveSession) => { label: string; subLabel?: string }
): PerfRow[] {
  const acc = new Map<string, { t: PerfTotals; label: string; subLabel?: string }>();
  for (const s of sessions) {
    const k = keyOf(s);
    const cur = acc.get(k) ?? { t: EMPTY, ...labelOf(s) };
    acc.set(k, { ...cur, t: addTo(cur.t, s) });
  }
  return [...acc.entries()]
    .map(([k, v]) => finish(k, v.label, v.t, v.subLabel))
    .sort((a, b) => b.gmvPerHour - a.gmvPerHour);
}

// host_id có thể rỗng (talent bị xoá -> on delete set null, hoặc ca tạo tay không gán host) trong
// khi host_name denormalized vẫn còn. Gom theo id rồi rơi về TÊN, chứ không dồn mọi ca thiếu id
// vào chung một khoá — làm vậy sẽ trộn nhiều host thành một dòng và mượn nhầm tên của ca đầu tiên.
export function hostKey(s: LiveSession): string {
  return s.hostId || (s.hostName ? `ten:${s.hostName}` : "chua-gan-host");
}

export function byHost(sessions: LiveSession[]): PerfRow[] {
  return groupBy(sessions, hostKey, (s) => ({ label: s.hostName || "Chưa gán host" }));
}

export function byHostBrand(sessions: LiveSession[]): PerfRow[] {
  return groupBy(
    sessions,
    (s) => `${hostKey(s)}::${s.brandId}`,
    (s) => ({ label: s.hostName || "Chưa gán host", subLabel: s.brandName })
  );
}

export const WEEKDAY_LABELS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

// Thứ trong tuần theo giờ VN. s.date là chuỗi "YYYY-MM-DD" ngày VN sẵn rồi nên dựng Date ở UTC để
// khỏi lệch thứ theo múi giờ máy chạy trình duyệt.
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function byWeekday(sessions: LiveSession[]): PerfRow[] {
  const rows = groupBy(
    sessions,
    (s) => String(weekdayOf(s.date)),
    (s) => ({ label: WEEKDAY_LABELS[weekdayOf(s.date)] })
  );
  return rows.sort((a, b) => ((Number(a.key) + 6) % 7) - ((Number(b.key) + 6) % 7));
}

export function byDate(sessions: LiveSession[]): PerfRow[] {
  return groupBy(sessions, (s) => s.date, (s) => ({ label: s.date })).sort((a, b) => a.key.localeCompare(b.key));
}

// Ô hiệu suất cho lưới host × thứ — thứ mà việc sắp lịch thật sự cần: "host này mạnh nhất vào thứ mấy".
export interface HostWeekdayCell {
  hostId: string;
  weekday: number;
  gmvPerHour: number;
  sessionCount: number;
}

export function hostWeekdayGrid(sessions: LiveSession[]): HostWeekdayCell[] {
  const acc = new Map<string, PerfTotals>();
  for (const s of sessions) {
    // Cùng công thức khoá với byHost() để lưới khớp đúng dòng xếp hạng.
    const k = `${hostKey(s)}::${weekdayOf(s.date)}`;
    acc.set(k, addTo(acc.get(k) ?? EMPTY, s));
  }
  return [...acc.entries()].map(([k, t]) => {
    const [hostId, wd] = k.split("::");
    return {
      hostId,
      weekday: Number(wd),
      gmvPerHour: t.hours > 0 ? t.gmv / t.hours : 0,
      sessionCount: t.sessionCount
    };
  });
}
