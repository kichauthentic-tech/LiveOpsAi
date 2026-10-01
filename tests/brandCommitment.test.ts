// Cam kết hợp đồng (src/lib/performance/brandCommitment.ts) — 247 dòng thuần, chưa test nào chạm tới
// (đo 2026-10-01). Module này nuôi 3 màn: Cam Kết Hợp Đồng (agency), bản chỉ-đọc cho brand
// (BrandCommitmentView), và cột "Cam kết" của Toàn Cảnh Brand — cộng thêm khối "cần mở thêm bao nhiêu
// giờ" trên màn Đăng Ký & Chốt Lịch. Đây là giờ dùng để TÍNH TIỀN brand (file tự ghi: "cam kết hợp đồng
// và hoá đơn phải đếm CÙNG một loại giờ"), nên sai ở đây là sai hoá đơn hoặc sai số giờ giao cho khách.
import { expect, test } from "vitest";
import {
  brandsMissingCommitment,
  computeAllProgress,
  computeCommitmentProgress,
  computeSchedulingGaps,
  daysInMonth,
  elapsedFractionOf,
  isDelivered,
  isScheduled,
  monthKeyOf,
  openSlotHoursByBrand,
  plannedHoursOf
} from "../src/lib/performance/brandCommitment";
import { BrandMonthlyCommitment, LiveSession, ShiftSlot } from "../src/types";

const P = "2026-10-01";
const B1 = "brand-crocs";

const commit = (brandId: string, committedHours: number, extra: Partial<BrandMonthlyCommitment> = {}): BrandMonthlyCommitment => ({
  id: `c-${brandId}`,
  brandId,
  periodMonth: P,
  committedHours,
  isOverride: false,
  ...extra
});

function ses(
  id: string,
  date: string,
  startTime: string,
  endTime: string,
  status: LiveSession["status"],
  extra: Partial<LiveSession> = {}
): LiveSession {
  return {
    id,
    title: id,
    brandId: B1,
    brandName: "CROCS",
    shopTikTokHandle: "",
    monthPublished: true,
    studioId: "",
    studioName: "",
    hostId: "",
    hostName: "",
    assistantName: "",
    coHostName: "",
    platform: "TikTok",
    date,
    startTime,
    endTime,
    status,
    targetGmv: 0,
    actualGmv: 0,
    totalOrders: 0,
    avgWatchTimeSeconds: 0,
    peakViewers: 0,
    totalViews: 0,
    ctrAvg: 0,
    cvrAvg: 0,
    skus: [],
    checklist: [],
    minuteMetrics: [],
    ...extra
  } as LiveSession;
}

function slot(id: string, date: string, startTime: string, endTime: string, extra: Partial<ShiftSlot> = {}): ShiftSlot {
  return {
    id,
    date,
    startTime,
    endTime,
    brandId: B1,
    brandName: "CROCS",
    platform: "TikTok",
    studioName: "",
    notes: "",
    status: "open",
    ...extra
  };
}

// ── mốc thời gian ─────────────────────────────────────────────────────────────────────────────────

test("monthKeyOf / daysInMonth, kể cả tháng 2 năm nhuận", () => {
  expect(monthKeyOf("2026-10-05")).toBe("2026-10-01");
  expect(daysInMonth("2026-10-01")).toBe(31);
  expect(daysInMonth("2026-11-01")).toBe(30);
  expect(daysInMonth("2026-02-01")).toBe(28);
  expect(daysInMonth("2028-02-01")).toBe(29);
});

test("elapsedFractionOf: tháng trước = 1, tháng sau = 0, tháng này = ngày/số ngày", () => {
  expect(elapsedFractionOf(P, "2026-11-02")).toBe(1);
  expect(elapsedFractionOf(P, "2026-09-30")).toBe(0);
  expect(elapsedFractionOf(P, "2026-10-01")).toBeCloseTo(1 / 31, 6);
  expect(elapsedFractionOf(P, "2026-10-31")).toBe(1);
});

// ── phân loại ca ──────────────────────────────────────────────────────────────────────────────────

test("ca huỷ không phải đã giao, cũng không phải đã xếp", () => {
  const cancelled = ses("x", "2026-10-05", "09:00", "11:00", "Cancelled");
  expect(isDelivered(cancelled)).toBe(false);
  expect(isScheduled(cancelled)).toBe(false);
});

test("'Live Now' tính là ĐÃ GIAO, 'Upcoming' tính là ĐÃ XẾP", () => {
  expect(isDelivered(ses("a", "2026-10-05", "09:00", "11:00", "Live Now"))).toBe(true);
  expect(isDelivered(ses("b", "2026-10-05", "09:00", "11:00", "Completed"))).toBe(true);
  expect(isScheduled(ses("c", "2026-10-05", "09:00", "11:00", "Upcoming"))).toBe(true);
});

test("giờ cam kết là giờ CA THEO LỊCH, không phải giờ live thật", () => {
  // Đúng quyết định ghi ở đầu module: cam kết và hoá đơn phải đếm cùng một loại giờ.
  const s = ses("a", "2026-10-05", "09:00", "11:00", "Completed", { liveDurationMinutes: 45 });
  expect(plannedHoursOf(s)).toBe(2);
  const p = computeCommitmentProgress(commit(B1, 10), "CROCS", [s], "2026-10-20");
  expect(p.deliveredHours).toBe(2); // 2h theo lịch
  expect(p.actualLiveHours).toBe(0.75); // 45 phút thật — chỉ để cảnh báo
  expect(p.sessionsWithRealHours).toBe(1);
});

// ── computeCommitmentProgress ─────────────────────────────────────────────────────────────────────

test("chỉ tính ca của ĐÚNG brand và ĐÚNG tháng", () => {
  const sessions = [
    ses("in", "2026-10-05", "09:00", "11:00", "Completed"),
    ses("khac-thang", "2026-09-05", "09:00", "11:00", "Completed"),
    ses("khac-brand", "2026-10-06", "09:00", "11:00", "Completed", { brandId: "brand-vera" })
  ];
  const p = computeCommitmentProgress(commit(B1, 10), "CROCS", sessions, "2026-10-20");
  expect(p.deliveredSessions).toBe(1);
  expect(p.deliveredHours).toBe(2);
});

test("gapHours = cam kết − (đã chạy + đã chốt chưa chạy), ca huỷ không được đếm", () => {
  const sessions = [
    ses("d1", "2026-10-05", "08:00", "18:00", "Completed"), // 10h
    ses("u1", "2026-10-25", "08:00", "14:00", "Upcoming"), // 6h
    ses("c1", "2026-10-26", "08:00", "18:00", "Cancelled") // 0
  ];
  const p = computeCommitmentProgress(commit(B1, 20), "CROCS", sessions, "2026-10-20");
  expect(p.deliveredHours).toBe(10);
  expect(p.scheduledHours).toBe(6);
  expect(p.plannedTotalHours).toBe(16);
  expect(p.gapHours).toBe(4);
});

test("gmvGap là undefined khi hợp đồng không cam kết GMV", () => {
  const s = [ses("d1", "2026-10-05", "08:00", "18:00", "Completed", { actualGmv: 500 })];
  expect(computeCommitmentProgress(commit(B1, 10), "CROCS", s, "2026-10-20").gmvGap).toBeUndefined();
  const withGmv = computeCommitmentProgress(commit(B1, 10, { committedGmv: 2000 }), "CROCS", s, "2026-10-20");
  expect(withGmv.deliveredGmv).toBe(500);
  expect(withGmv.gmvGap).toBe(1500);
});

test("pacedProjection trả 0 (không phải Infinity) khi tháng chưa bắt đầu", () => {
  const p = computeCommitmentProgress(commit(B1, 100), "CROCS", [], "2026-09-15");
  expect(p.elapsedFraction).toBe(0);
  expect(p.pacedProjectionHours).toBe(0);
  expect(Number.isFinite(p.pacedProjectionHours)).toBe(true);
});

// ── trạng thái ────────────────────────────────────────────────────────────────────────────────────

const statusOf = (committed: number, deliveredH: number, scheduledH: number, today: string) =>
  computeCommitmentProgress(
    commit(B1, committed),
    "CROCS",
    [
      ...(deliveredH > 0 ? [ses("d", "2026-10-02", "00:00", `${`${deliveredH}`.padStart(2, "0")}:00`, "Completed")] : []),
      ...(scheduledH > 0 ? [ses("u", "2026-10-28", "00:00", `${`${scheduledH}`.padStart(2, "0")}:00`, "Upcoming")] : [])
    ],
    today
  ).status;

test("trạng thái: chưa cam kết / đã đủ / đúng tiến độ / sát ngưỡng / hụt", () => {
  expect(statusOf(0, 0, 0, "2026-10-15")).toBe("no_commitment");
  expect(statusOf(10, 10, 0, "2026-10-15")).toBe("met");
  expect(statusOf(20, 5, 15, "2026-10-15")).toBe("on_track");
  expect(statusOf(20, 5, 13, "2026-10-15")).toBe("at_risk"); // 18/20 = 90%
  expect(statusOf(20, 5, 5, "2026-10-15")).toBe("behind");
});

test("tháng ĐÃ ĐÓNG mà chưa giao đủ thì là hụt, dù đã từng xếp đủ", () => {
  expect(statusOf(20, 5, 15, "2026-11-03")).toBe("behind");
});

test("NGÀY CUỐI THÁNG chưa phải tháng đã đóng — ca của chính hôm đó vẫn còn chạy", () => {
  // Cùng một dữ liệu: 30/10 ra "on_track", nên 31/10 cũng phải "on_track". Bản cũ lật sang "behind"
  // chỉ vì elapsedFraction chạm đúng 1.0 ngày cuối, trong khi `statusOf` hiểu elapsed>=1 là "tháng đã
  // đóng, không xếp thêm được nữa" — ngày 31 thì mệnh đề đó sai, và ca ngày 31 còn chưa lên sóng.
  expect(statusOf(20, 5, 15, "2026-10-30")).toBe("on_track");
  expect(statusOf(20, 5, 15, "2026-10-31")).toBe("on_track");
  expect(statusOf(20, 5, 13, "2026-10-31")).toBe("at_risk");
  // Sang tháng sau thì mới thật sự đóng.
  expect(statusOf(20, 5, 15, "2026-11-01")).toBe("behind");
});

// ── computeAllProgress ────────────────────────────────────────────────────────────────────────────

test("computeAllProgress lọc đúng tháng, xếp brand thiếu nhiều nhất lên đầu", () => {
  const commitments = [
    commit("b-it", 10),
    commit("b-nhieu", 100),
    commit("b-thang-khac", 999, { periodMonth: "2026-09-01" })
  ];
  const rows = computeAllProgress(commitments, { "b-it": "Ít", "b-nhieu": "Nhiều" }, [], P, "2026-10-20");
  expect(rows.map((r) => r.brandId)).toEqual(["b-nhieu", "b-it"]);
});

test("brand bị xoá vẫn hiện dòng, có nhãn thay vì tên rỗng", () => {
  const rows = computeAllProgress([commit("b-mat", 10)], {}, [], P, "2026-10-20");
  expect(rows[0].brandName).toBe("Brand đã xoá");
});

test("brandsMissingCommitment: có ca trong tháng mà không có dòng cam kết", () => {
  const sessions = [
    ses("a", "2026-10-05", "09:00", "11:00", "Completed", { brandId: "b-chua-cam-ket" }),
    ses("b", "2026-10-06", "09:00", "11:00", "Cancelled", { brandId: "b-chi-co-ca-huy" }),
    ses("c", "2026-10-07", "09:00", "11:00", "Completed", { brandId: B1 })
  ];
  expect(brandsMissingCommitment([commit(B1, 10)], sessions, P)).toEqual(["b-chua-cam-ket"]);
});

// ── MỞ THÊM BAO NHIÊU GIỜ: ca chờ đăng ký ở ngày đã qua ───────────────────────────────────────────
// `ShiftScheduling.tsx` chỗ nào cũng dùng `openFutureSlots` (`status === "open" && date >= today`):
// danh sách ca (dòng 296), đếm ô lịch (630/633), nút thao tác trên ca (820). Riêng hàm tính "cần mở
// thêm" lại đếm MỌI ca mở kể cả ngày đã qua — ca mà chính màn đó không cho chốt và không cho thấy.
// Hệ quả: ops được bảo "cần mở thêm ít hơn thực tế" ⇒ mở thiếu ca ⇒ brand nhận thiếu giờ hợp đồng.

test("ca chờ đăng ký ở ngày ĐÃ QUA không được trừ vào 'cần mở thêm'", () => {
  const slots = [
    slot("qua", "2026-10-02", "08:00", "18:00"), // 10h, đã qua — không ai đăng ký được nữa
    slot("toi", "2026-10-25", "08:00", "14:00") // 6h, còn mở được
  ];
  const g = computeSchedulingGaps([commit(B1, 100)], { [B1]: "CROCS" }, [], slots, P, "2026-10-20")[0];
  expect(g.gapHours).toBe(100);
  expect(g.openSlotHours).toBe(6);
  expect(g.openSlotCount).toBe(1);
  expect(g.hoursStillToOpen).toBe(94);
});

test("ca mở ĐÚNG HÔM NAY vẫn được tính — hôm nay chưa qua", () => {
  const g = computeSchedulingGaps(
    [commit(B1, 100)],
    { [B1]: "CROCS" },
    [],
    [slot("homnay", "2026-10-20", "08:00", "18:00")],
    P,
    "2026-10-20"
  )[0];
  expect(g.openSlotHours).toBe(10);
  expect(g.hoursStillToOpen).toBe(90);
});

test("openSlotHoursByBrand: bỏ ca đã chốt, ca huỷ, ca không gắn brand, ca tháng khác", () => {
  const slots = [
    slot("ok", "2026-10-25", "08:00", "14:00"),
    slot("chot", "2026-10-25", "14:00", "20:00", { status: "finalized" }),
    slot("huy", "2026-10-26", "08:00", "14:00", { status: "cancelled" }),
    slot("khong-brand", "2026-10-26", "08:00", "14:00", { brandId: undefined }),
    slot("thang-khac", "2026-11-02", "08:00", "14:00")
  ];
  const m = openSlotHoursByBrand(slots, P, "2026-10-20");
  expect(m.get(B1)).toEqual({ hours: 6, count: 1 });
  expect(m.size).toBe(1);
});

test("computeSchedulingGaps xếp brand cần MỞ THÊM nhiều nhất lên đầu", () => {
  const commitments = [commit("b-a", 50), commit("b-b", 50)];
  const slots = [
    { ...slot("sa", "2026-10-25", "08:00", "18:00"), brandId: "b-a" },
    { ...slot("sb1", "2026-10-25", "08:00", "18:00"), brandId: "b-b" },
    { ...slot("sb2", "2026-10-26", "08:00", "18:00"), brandId: "b-b" }
  ];
  const rows = computeSchedulingGaps(commitments, { "b-a": "A", "b-b": "B" }, [], slots, P, "2026-10-20");
  expect(rows.map((r) => r.brandId)).toEqual(["b-a", "b-b"]);
  expect(rows[0].hoursStillToOpen).toBe(40);
  expect(rows[1].hoursStillToOpen).toBe(30);
});

test("monthClosed: chỉ true khi đã sang tháng sau, KHÔNG phải ngày cuối tháng", () => {
  const p = (today: string) => computeCommitmentProgress(commit(B1, 10), "CROCS", [], today).monthClosed;
  expect(p("2026-10-30")).toBe(false);
  expect(p("2026-10-31")).toBe(false);
  expect(p("2026-11-01")).toBe(true);
  expect(p("2026-09-20")).toBe(false); // tháng chưa tới cũng chưa đóng
});
