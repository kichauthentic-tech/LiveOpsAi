// Kế hoạch vs thực tế + hiệu chỉnh engine (src/lib/scheduling/planEvaluation.ts) — 118 dòng thuần,
// chưa test nào chạm tới (đo 2026-10-01). Đầu ra của nó đi hai đường: bảng "dự báo → thực tế" ở
// MonthPlan + AI Training Center, và hệ số `factors` mà engine NHÂN vào GMV/giờ kỳ vọng tháng sau —
// tức sai ở đây không dừng ở một con số hiển thị, nó đi thẳng vào kế hoạch tháng kế tiếp.
import { expect, test } from "vitest";
import { buildCalibration, calibrationKey, evaluatePlan } from "../src/lib/scheduling/planEvaluation";
import { DEFAULT_ENGINE_PARAMS } from "../src/lib/scheduling/engineParams";
import { BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../src/types";

const B = "brand-crocs";
const D = "2026-09-10"; // thứ Năm

function slot(id: string, extra: Partial<ShiftSlot> = {}): ShiftSlot {
  return {
    id,
    date: D,
    startTime: "09:00",
    endTime: "11:00",
    brandId: B,
    brandName: "CROCS",
    platform: "TikTok",
    studioName: "",
    notes: "",
    status: "finalized",
    ...extra
  };
}

function ses(id: string, actualGmv: number, extra: Partial<LiveSession> = {}): LiveSession {
  return {
    id,
    title: id,
    brandId: B,
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
    date: D,
    startTime: "09:00",
    endTime: "11:00",
    status: "Completed",
    dataSource: "tiktok_reconciled",
    targetGmv: 0,
    actualGmv,
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

function ps(id: string, expectedGmv: number, targetGmv: number, slotId?: string, extra: Partial<BrandMonthPlanSlot> = {}): BrandMonthPlanSlot {
  return { id, planId: "p1", date: D, startTime: "09:00", endTime: "11:00", targetGmv, expectedGmv, slotId, note: "", ...extra };
}

// ── phân loại từng dòng ───────────────────────────────────────────────────────────────────────────

test("ca kế hoạch mất liên kết shift_slot ⇒ 'unlinked', không phải 'pending'", () => {
  // Lỗi E2E #1: xoá ca ở Nhân sự ca làm `slot_id` về null. Phải phân biệt được với ca chưa chạy.
  const r = evaluatePlan([ps("a", 100, 100, undefined)], [], []).rows[0];
  expect(r.status).toBe("unlinked");
  expect(r.actualGmv).toBeNull();
});

test("ca chờ đăng ký bị huỷ ⇒ 'cancelled'; ca thật bị huỷ cũng 'cancelled'", () => {
  const bySlot = evaluatePlan([ps("a", 100, 100, "s1")], [slot("s1", { status: "cancelled" })], []).rows[0];
  expect(bySlot.status).toBe("cancelled");

  const bySession = evaluatePlan(
    [ps("a", 100, 100, "s1")],
    [slot("s1", { sessionId: "x1" })],
    [ses("x1", 500, { status: "Cancelled" })]
  ).rows[0];
  expect(bySession.status).toBe("cancelled");
});

test("ca đã chốt nhưng chưa có số ⇒ 'pending', không tính vào tổng nào", () => {
  const ev = evaluatePlan(
    [ps("a", 100, 100, "s1")],
    [slot("s1", { sessionId: "x1" })],
    [ses("x1", 0, { status: "Upcoming", dataSource: "manual" })]
  );
  expect(ev.rows[0].status).toBe("pending");
  expect(ev.doneCount).toBe(0);
  expect(ev.actualDone).toBe(0);
});

test("ca đã up file mà bán 0 là KẾT QUẢ THẬT, không phải 'chờ'", () => {
  // Cùng định nghĩa isCountable với mọi màn (audit 2026-09-28 mục 6).
  const ev = evaluatePlan(
    [ps("a", 100, 100, "s1")],
    [slot("s1", { sessionId: "x1" })],
    [ses("x1", 0, { status: "Completed", dataSource: "live_snapshot", totalViews: 500 })]
  );
  expect(ev.rows[0].status).toBe("done");
  expect(ev.rows[0].actualGmv).toBe(0);
  expect(ev.rows[0].errorPct).toBe(-1);
});

test("errorPct = (thực tế − dự báo) / dự báo; ca không có dự báo thì null", () => {
  const ev = evaluatePlan(
    [ps("a", 100, 100, "s1"), ps("b", 0, 100, "s2")],
    [slot("s1", { sessionId: "x1" }), slot("s2", { sessionId: "x2" })],
    [ses("x1", 150), ses("x2", 150)]
  );
  expect(ev.rows[0].errorPct).toBeCloseTo(0.5, 6);
  expect(ev.rows[1].errorPct).toBeNull();
});

// ── TỔNG: "dự báo → thực tế" phải so CÙNG MỘT TẬP ca ─────────────────────────────────────────────
// `expectedDone` chỉ cộng ca CÓ dự báo (expectedGmv > 0), trong khi `actualDone`/`targetDone` cộng
// MỌI ca đã xong. Hai màn đặt chúng cạnh nhau bằng dấu mũi tên ("dự báo X → thực tế Y" ở
// EngineTrainingPanel, "Dự báo X · target Z · thực tế Y" ở MonthPlan), nên người đọc hiểu phần chênh
// là engine dự sai — trong khi phần lớn chênh lệch có thể chỉ là ca ops đặt tay (expected = 0) vốn
// KHÔNG có dự báo nào để sai. `actualForecast` là vế thực tế của ĐÚNG tập đã dự báo.

test("actualForecast cộng thực tế của đúng tập ca CÓ dự báo", () => {
  const ev = evaluatePlan(
    [ps("engine1", 100, 100, "s1"), ps("engine2", 100, 100, "s2"), ps("tay1", 0, 0, "s3"), ps("tay2", 0, 0, "s4")],
    [slot("s1", { sessionId: "x1" }), slot("s2", { sessionId: "x2" }), slot("s3", { sessionId: "x3" }), slot("s4", { sessionId: "x4" })],
    [ses("x1", 110), ses("x2", 110), ses("x3", 400), ses("x4", 400)]
  );
  expect(ev.doneCount).toBe(4);
  expect(ev.forecastCount).toBe(2);
  expect(ev.expectedDone).toBe(200);
  expect(ev.actualForecast).toBe(220); // vế so được với 200
  expect(ev.actualDone).toBe(1020); // tổng thật của tháng, KHÁC tập trên
  expect(ev.bias).toBeCloseTo(0.1, 6); // khớp 200 → 220, không phải 200 → 1020
});

test("brand chưa có lịch sử: engine không dự báo ca nào ⇒ forecastCount 0, không có vế để so", () => {
  // Đ12 cold start — 3/4 brand rơi vào đây. Bản cũ vẫn in "dự báo 0 → thực tế 3,5 tỷ".
  const ev = evaluatePlan(
    [ps("a", 0, 100, "s1"), ps("b", 0, 100, "s2")],
    [slot("s1", { sessionId: "x1" }), slot("s2", { sessionId: "x2" })],
    [ses("x1", 1_750_000_000), ses("x2", 1_750_000_000)]
  );
  expect(ev.forecastCount).toBe(0);
  expect(ev.expectedDone).toBe(0);
  expect(ev.actualForecast).toBe(0);
  expect(ev.actualDone).toBe(3_500_000_000);
  expect(ev.bias).toBeNull();
  expect(ev.mape).toBeNull();
});

test("mape là sai số tuyệt đối trung bình, chỉ trên ca có dự báo", () => {
  const ev = evaluatePlan(
    [ps("a", 100, 0, "s1"), ps("b", 100, 0, "s2"), ps("tay", 0, 0, "s3")],
    [slot("s1", { sessionId: "x1" }), slot("s2", { sessionId: "x2" }), slot("s3", { sessionId: "x3" })],
    [ses("x1", 150), ses("x2", 50), ses("x3", 9999)]
  );
  expect(ev.mape).toBeCloseTo(0.5, 6); // |+50%| và |−50%| ⇒ 50%, ca đặt tay không kéo vào
  expect(ev.bias).toBeCloseTo(0, 6);
});

// ── buildCalibration ──────────────────────────────────────────────────────────────────────────────

test("ca 2h TRÙNG KHÍT 1 khối ⇒ hiệu chỉnh đúng 1 ô, kéo về 1 theo số quan sát", () => {
  // Khối 2h chia theo giờ chẵn (08:00-10:00 là khối 4), nên ca phải bắt đầu đúng giờ chẵn mới gọn 1 ô.
  const aligned = { startTime: "08:00", endTime: "10:00" };
  const ev = evaluatePlan(
    [ps("a", 100, 100, "s1", aligned)],
    [slot("s1", { sessionId: "x1", ...aligned })],
    [ses("x1", 200, aligned)]
  );
  const cal = buildCalibration([ev]);
  expect(cal.observations).toBe(1);
  expect(cal.overallBias).toBeCloseTo(1, 6);
  expect([...cal.factors.keys()]).toEqual([calibrationKey(4, 4)]);
  const k = DEFAULT_ENGINE_PARAMS.calibrationK;
  expect(cal.factors.get(calibrationKey(4, 4))).toBeCloseTo((1 * 2 + k) / (1 + k), 6);
});

test("ca 2h lệch giờ chẵn nằm vắt 2 khối — đúng thiết kế, không phải lỗi", () => {
  const ev = evaluatePlan([ps("a", 100, 100, "s1")], [slot("s1", { sessionId: "x1" })], [ses("x1", 200)]);
  expect([...buildCalibration([ev]).factors.keys()].sort()).toEqual([calibrationKey(4, 4), calibrationKey(4, 5)]);
});

test("ca dài rải đều theo phút vào các khối nó phủ, không dồn 1 ô", () => {
  const long = { startTime: "08:00", endTime: "14:00" }; // 6h = khối 4,5,6
  const ev = evaluatePlan(
    [ps("a", 300, 300, "s1", long)],
    [slot("s1", { sessionId: "x1", ...long })],
    [ses("x1", 300, long)]
  );
  const cal = buildCalibration([ev]);
  expect([...cal.factors.keys()].sort()).toEqual([calibrationKey(4, 4), calibrationKey(4, 5), calibrationKey(4, 6)].sort());
});

test("ca qua đêm đẩy phần sau nửa đêm sang THỨ hôm sau", () => {
  const night = { startTime: "22:00", endTime: "02:00" };
  const ev = evaluatePlan(
    [ps("a", 100, 100, "s1", night)],
    [slot("s1", { sessionId: "x1", ...night })],
    [ses("x1", 100, night)]
  );
  const keys = [...buildCalibration([ev]).factors.keys()].sort();
  expect(keys).toContain(calibrationKey(4, 11)); // 22:00-24:00 thứ Năm
  expect(keys).toContain(calibrationKey(5, 0)); // 00:00-02:00 thứ Sáu
});

test("hệ số bị kẹp trong [calibrationMin, calibrationMax]", () => {
  const evs = Array.from({ length: 50 }, (_, i) =>
    evaluatePlan([ps(`a${i}`, 1, 1, "s1")], [slot("s1", { sessionId: "x1" })], [ses("x1", 10_000)])
  );
  const f = buildCalibration(evs).factors.get(calibrationKey(4, 4))!;
  expect(f).toBeLessThanOrEqual(DEFAULT_ENGINE_PARAMS.calibrationMax);
  expect(f).toBeGreaterThanOrEqual(DEFAULT_ENGINE_PARAMS.calibrationMin);
});

test("ca ops đặt tay (không dự báo) không tham gia hiệu chỉnh", () => {
  const ev = evaluatePlan([ps("a", 0, 100, "s1")], [slot("s1", { sessionId: "x1" })], [ses("x1", 999)]);
  const cal = buildCalibration([ev]);
  expect(cal.observations).toBe(0);
  expect(cal.factors.size).toBe(0);
  expect(cal.overallBias).toBeNull();
});

test("ca có giờ kết thúc = giờ bắt đầu không được rải thành 24 giờ hiệu chỉnh", () => {
  // PHÒNG THỦ: `validateDrafts` (monthPlanGrid) chặn `endTime <= startTime` nên lưới hiện tại không
  // lưu được ca kiểu này. Nhưng bản cũ của `buildCalibration` dùng `if (end <= cur) end += 24*60`,
  // tức coi ca 0 giờ là ca QUA ĐÊM DÀI 24H và rải GMV ra 13 ô, tràn sang cả thứ hôm sau — một dòng
  // hỏng đủ bẻ hệ số của cả hai ngày. Quy ước toàn app (FIX L8, pnl.ts) là chỉ `mins < 0` mới cộng
  // 24h; `start == end` là 0 giờ.
  const same = { startTime: "09:00", endTime: "09:00" };
  const ev = evaluatePlan(
    [ps("a", 100, 100, "s1", same)],
    [slot("s1", { sessionId: "x1", ...same })],
    [ses("x1", 120, same)]
  );
  const cal = buildCalibration([ev]);
  expect(cal.factors.size).toBe(0);
  expect(cal.observations).toBe(1); // vẫn được đếm vào bias tổng
  expect(cal.overallBias).toBeCloseTo(0.2, 6);
});
