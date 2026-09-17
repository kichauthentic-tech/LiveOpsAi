import { BrandMonthlyCommitment, LiveSession } from "../../types";
import { sessionDurationHours } from "../pnl";

// Giai đoạn 4 của tầng dữ liệu gốc mới: đối chiếu CAM KẾT (brand ký bao nhiêu giờ/tháng) với
// THỰC TẾ + ĐANG XẾP. Giai đoạn 3 trả lời "host nào làm tốt", tầng này trả lời câu đứng trước nó:
// "tháng này còn thiếu bao nhiêu giờ phải xếp cho brand nào".
//
// ====================================================================================
// GIỜ NÀO ĐƯỢC TÍNH VÀO CAM KẾT — quyết định quan trọng nhất của file này
// ====================================================================================
// Tính bằng GIỜ CA THEO LỊCH (`sessionDurationHours`), KHÔNG phải giờ live thật từ snapshot.
// Lý do: `computeSessionPnl` (src/lib/pnl.ts) tính doanh thu brand hourly = giờ ca theo lịch ×
// rate. Cam kết hợp đồng và hoá đơn phải đếm CÙNG một loại giờ, nếu không thì con số theo dõi
// không bao giờ khớp con số xuất hoá đơn và mọi tranh luận với brand đều bế tắc.
//
// Giờ live THẬT vẫn được tính song song (`actualLiveHours`) nhưng chỉ để CẢNH BÁO: xếp đủ 100h mà
// chỉ lên sóng 92h là rủi ro brand khiếu nại, ops cần thấy sớm. Không bao giờ đem nó trừ vào cam
// kết — đó là việc của đàm phán, không phải của phép tính.
// ====================================================================================

export type CommitmentStatus = "no_commitment" | "met" | "on_track" | "at_risk" | "behind";

export interface CommitmentProgress {
  brandId: string;
  brandName: string;
  periodMonth: string; // "YYYY-MM-01"
  committedHours: number;
  committedGmv?: number;
  isOverride: boolean;

  // Giờ ca theo lịch của ca ĐÃ diễn ra (Completed/Live Now).
  deliveredHours: number;
  deliveredSessions: number;
  // Giờ ca theo lịch của ca CÒN CHƯA diễn ra trong tháng (Upcoming).
  scheduledHours: number;
  scheduledSessions: number;
  // Tổng đã cam chắc có: đã chạy + đã lên lịch. Đây là số để so với cam kết.
  plannedTotalHours: number;
  // > 0 = còn thiếu bấy nhiêu giờ PHẢI XẾP THÊM. <= 0 = đã đủ/vượt.
  gapHours: number;

  // Đối chiếu độ tin: giờ live thật từ snapshot + số ca thật sự có snapshot.
  actualLiveHours: number;
  sessionsWithRealHours: number;

  deliveredGmv: number;
  gmvGap?: number;

  // Phần tháng đã trôi qua (0..1) và dự phóng theo nhịp hiện tại.
  elapsedFraction: number;
  pacedProjectionHours: number;

  status: CommitmentStatus;
}

// Ngày hôm nay theo giờ VN. Không dùng toISOString() (ra giờ UTC — lúc 0-7h sáng VN sẽ trả về
// ngày hôm trước, đầu tháng thì trả về nhầm cả THÁNG trước và làm lệch toàn bộ run-rate).
export function todayVn(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function monthKeyOf(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function daysInMonth(periodMonth: string): number {
  const [y, m] = periodMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Ca bị huỷ không giao giờ nào cho brand và cũng không còn là kế hoạch — loại khỏi mọi phép đếm.
// Khác `isCountable` của hostPerformance.ts: ở đó ca không có số liệu bị loại vì không nói lên
// hiệu suất, còn ở đây ca lên sóng mà GMV = 0 VẪN giao đủ giờ cho brand nên vẫn phải đếm.
export function isDelivered(s: LiveSession): boolean {
  return s.status === "Completed" || s.status === "Live Now";
}

export function isScheduled(s: LiveSession): boolean {
  return s.status === "Upcoming";
}

export function plannedHoursOf(s: LiveSession): number {
  return sessionDurationHours(s.startTime, s.endTime);
}

// 0 = tháng chưa tới, 1 = tháng đã xong, ở giữa = đang chạy tới ngày thứ N.
export function elapsedFractionOf(periodMonth: string, today: string = todayVn()): number {
  const currentMonth = monthKeyOf(today);
  if (periodMonth < currentMonth) return 1;
  if (periodMonth > currentMonth) return 0;
  return Number(today.slice(8, 10)) / daysInMonth(periodMonth);
}

function statusOf(committed: number, delivered: number, plannedTotal: number, elapsed: number): CommitmentStatus {
  if (committed <= 0) return "no_commitment";
  if (delivered >= committed) return "met";
  // Tháng đã đóng: không xếp thêm được nữa, chỉ còn so cái đã giao.
  if (elapsed >= 1) return "behind";
  if (plannedTotal >= committed) return "on_track";
  if (plannedTotal >= committed * 0.9) return "at_risk";
  return "behind";
}

export function computeCommitmentProgress(
  commitment: BrandMonthlyCommitment,
  brandName: string,
  sessions: LiveSession[],
  today: string = todayVn()
): CommitmentProgress {
  const inScope = sessions.filter(
    (s) => s.brandId === commitment.brandId && monthKeyOf(s.date) === commitment.periodMonth
  );

  let deliveredHours = 0, deliveredSessions = 0, deliveredGmv = 0;
  let scheduledHours = 0, scheduledSessions = 0;
  let actualLiveHours = 0, sessionsWithRealHours = 0;

  for (const s of inScope) {
    if (isDelivered(s)) {
      deliveredHours += plannedHoursOf(s);
      deliveredSessions += 1;
      deliveredGmv += s.actualGmv ?? 0;
      if (s.liveDurationMinutes && s.liveDurationMinutes > 0) {
        actualLiveHours += s.liveDurationMinutes / 60;
        sessionsWithRealHours += 1;
      }
    } else if (isScheduled(s)) {
      scheduledHours += plannedHoursOf(s);
      scheduledSessions += 1;
    }
  }

  const plannedTotalHours = deliveredHours + scheduledHours;
  const elapsedFraction = elapsedFractionOf(commitment.periodMonth, today);

  return {
    brandId: commitment.brandId,
    brandName,
    periodMonth: commitment.periodMonth,
    committedHours: commitment.committedHours,
    committedGmv: commitment.committedGmv,
    isOverride: commitment.isOverride,
    deliveredHours,
    deliveredSessions,
    scheduledHours,
    scheduledSessions,
    plannedTotalHours,
    gapHours: commitment.committedHours - plannedTotalHours,
    actualLiveHours,
    sessionsWithRealHours,
    deliveredGmv,
    gmvGap: commitment.committedGmv === undefined ? undefined : commitment.committedGmv - deliveredGmv,
    elapsedFraction,
    // Chia cho 0 khi tháng chưa bắt đầu — không có nhịp nào để suy ra, trả 0 thay vì Infinity.
    pacedProjectionHours: elapsedFraction > 0 ? deliveredHours / elapsedFraction : 0,
    status: statusOf(commitment.committedHours, deliveredHours, plannedTotalHours, elapsedFraction)
  };
}

export function computeAllProgress(
  commitments: BrandMonthlyCommitment[],
  brandNameById: Record<string, string>,
  sessions: LiveSession[],
  periodMonth: string,
  today: string = todayVn()
): CommitmentProgress[] {
  return commitments
    .filter((c) => c.periodMonth === periodMonth)
    .map((c) => computeCommitmentProgress(c, brandNameById[c.brandId] ?? "Brand đã xoá", sessions, today))
    .sort((a, b) => b.gapHours - a.gapHours);
}

// Brand có ca trong tháng nhưng KHÔNG có dòng cam kết nào — không phải lỗi, nhưng ops cần biết để
// còn nhập: mọi con số run-rate của brand đó đang không có mẫu số nào để so.
export function brandsMissingCommitment(
  commitments: BrandMonthlyCommitment[],
  sessions: LiveSession[],
  periodMonth: string
): string[] {
  const has = new Set(commitments.filter((c) => c.periodMonth === periodMonth).map((c) => c.brandId));
  const seen = new Set<string>();
  for (const s of sessions) {
    if (monthKeyOf(s.date) === periodMonth && s.status !== "Cancelled" && !has.has(s.brandId)) {
      seen.add(s.brandId);
    }
  }
  return [...seen];
}
