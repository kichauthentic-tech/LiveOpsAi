// Chốt hàng loạt (src/lib/performance/bulkFinalize.ts) — module 257 dòng chưa có test nào, ghi nhận là
// khoảng trống từ đợt audit 2026-09-25 ("Chưa có unit test riêng cho bulkFinalize.ts/planMonthSlots.ts/
// monthPlanGrid.ts"). Đây là đường GÁN NGƯỜI: sai ở đây nghĩa là một người bị xếp 2 ca cùng giờ và
// không ai được cảnh báo, vì DB không chặn trùng — cảnh báo ở UI là hàng rào duy nhất (conflicts.ts).
//
// Hai nhóm test:
//   1. Hợp đồng của planner: lọc ca, xếp tham lam theo thứ tự thời gian, sổ riêng của mẻ, mệt mỏi/tuần.
//   2. TRỢ LIVE — lớp lỗi bulkFinalize bỏ sót: audit 2026-09-28 mục 8 đã gom luật trùng về conflicts.ts
//      và vá "popup ca chờ không kiểm Trợ live", nhưng bulkFinalize là cửa thứ 6 và không được vá.
import { expect, test } from "vitest";
import {
  eligibleSlots,
  hasAnyConflict,
  planBulkFinalize,
  recheckPlan,
  rowsReadyToFinalize,
  type BulkPlanRow
} from "../src/lib/performance/bulkFinalize";
import { LiveSession, ShiftRegistration, ShiftSlot } from "../src/types";

const TODAY = "2026-10-05";
const MONTH = "2026-10";
const BRAND = "brand-crocs";

function slot(id: string, date: string, startTime: string, endTime: string, extra: Partial<ShiftSlot> = {}): ShiftSlot {
  return {
    id,
    date,
    startTime,
    endTime,
    brandId: BRAND,
    brandName: "CROCS",
    platform: "TikTok",
    studioName: "",
    notes: "",
    status: "open",
    ...extra
  };
}

function reg(slotId: string, talentId: string): ShiftRegistration {
  return { id: `${slotId}-${talentId}`, slotId, talentId, registeredAt: "2026-10-01T00:00:00Z" };
}

function regsBySlot(...rs: ShiftRegistration[]): Map<string, ShiftRegistration[]> {
  const m = new Map<string, ShiftRegistration[]>();
  for (const r of rs) m.set(r.slotId, [...(m.get(r.slotId) ?? []), r]);
  return m;
}

function session(id: string, date: string, startTime: string, endTime: string, extra: Partial<LiveSession> = {}): LiveSession {
  return {
    id,
    title: id,
    brandId: BRAND,
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
    status: "Upcoming",
    targetGmv: 0,
    actualGmv: 0,
    totalOrders: 0,
    avgWatchTimeSeconds: 0,
    peakViewers: 0,
    totalViews: 0,
    ctrAvg: 0,
    cvrAvg: 0,
    ...extra
  } as LiveSession;
}

const NAMES = new Map([
  ["t-an", "An"],
  ["t-binh", "Bình"],
  ["t-cuong", "Cường"]
]);

// ── eligibleSlots ─────────────────────────────────────────────────────────────────────────────────

test("eligibleSlots: chỉ ca mở, trong tháng, chưa qua, và có người đăng ký", () => {
  const slots = [
    slot("s-ok", "2026-10-06", "09:00", "11:00"),
    slot("s-today", TODAY, "09:00", "11:00"), // ngày hôm nay vẫn chốt được
    slot("s-past", "2026-10-04", "09:00", "11:00"),
    slot("s-other-month", "2026-11-06", "09:00", "11:00"),
    slot("s-finalized", "2026-10-07", "09:00", "11:00", { status: "finalized" }),
    slot("s-cancelled", "2026-10-07", "14:00", "16:00", { status: "cancelled" }),
    slot("s-no-reg", "2026-10-08", "09:00", "11:00")
  ];
  const regs = regsBySlot(
    reg("s-ok", "t-an"),
    reg("s-today", "t-an"),
    reg("s-past", "t-an"),
    reg("s-other-month", "t-an"),
    reg("s-finalized", "t-an"),
    reg("s-cancelled", "t-an")
  );
  expect(eligibleSlots(slots, regs, MONTH, TODAY).map((s) => s.id)).toEqual(["s-today", "s-ok"]);
});

test("eligibleSlots: xếp theo ngày rồi giờ bắt đầu", () => {
  const slots = [
    slot("b", "2026-10-07", "09:00", "11:00"),
    slot("c", "2026-10-06", "14:00", "16:00"),
    slot("a", "2026-10-06", "09:00", "11:00")
  ];
  const regs = regsBySlot(reg("a", "t-an"), reg("b", "t-an"), reg("c", "t-an"));
  expect(eligibleSlots(slots, regs, MONTH, TODAY).map((s) => s.id)).toEqual(["a", "c", "b"]);
});

// ── planBulkFinalize ──────────────────────────────────────────────────────────────────────────────

test("planner không gán cùng một người cho 2 ca trùng giờ trong CÙNG một mẻ", () => {
  // Đúng cái bẫy ghi ở đầu bulkFinalize.ts: xét riêng lẻ thì cả 2 ca đều "không trùng".
  const slots = [slot("s1", "2026-10-06", "09:00", "11:00"), slot("s2", "2026-10-06", "10:00", "12:00")];
  const regs = regsBySlot(reg("s1", "t-an"), reg("s2", "t-an"));
  const rows = planBulkFinalize(slots, regs, [], NAMES, { today: TODAY, month: MONTH });

  expect(rows[0].hostId).toBe("t-an");
  expect(rows[1].hostId).toBe(""); // An đã bị mẻ này chiếm khung 09–11
  expect(rows[1].noFreeCandidate).toBe(true);
  expect(rows[1].include).toBe(false);
});

test("planner nhường người thứ hai khi người đầu đã bận trong mẻ", () => {
  const slots = [slot("s1", "2026-10-06", "09:00", "11:00"), slot("s2", "2026-10-06", "10:00", "12:00")];
  const regs = regsBySlot(reg("s1", "t-an"), reg("s2", "t-an"), reg("s2", "t-binh"));
  const rows = planBulkFinalize(slots, regs, [], NAMES, { today: TODAY, month: MONTH });
  expect(rows.map((r) => r.hostId)).toEqual(["t-an", "t-binh"]);
  expect(rows[1].include).toBe(true);
});

test("planner tránh người đã là TRỢ LIVE của một ca đã tồn tại (không chỉ Host)", () => {
  const existing = [session("x1", "2026-10-06", "09:00", "11:00", { hostId: "t-cuong", coHostId: "t-an" })];
  const slots = [slot("s1", "2026-10-06", "10:00", "12:00")];
  const regs = regsBySlot(reg("s1", "t-an"), reg("s1", "t-binh"));
  const rows = planBulkFinalize(slots, regs, existing, NAMES, { today: TODAY, month: MONTH });
  expect(rows[0].hostId).toBe("t-binh");
});

test("ca huỷ không chiếm chỗ của ai", () => {
  const existing = [session("x1", "2026-10-06", "09:00", "11:00", { hostId: "t-an", status: "Cancelled" })];
  const slots = [slot("s1", "2026-10-06", "10:00", "12:00")];
  const rows = planBulkFinalize(slots, regsBySlot(reg("s1", "t-an")), existing, NAMES, { today: TODAY, month: MONTH });
  expect(rows[0].hostId).toBe("t-an");
  expect(hasAnyConflict(rows[0].conflicts)).toBe(false);
});

test("phòng bị mẻ này chiếm thì dòng sau không tự tick, kể cả khi host khác", () => {
  const slots = [
    slot("s1", "2026-10-06", "09:00", "11:00", { studioId: "st-1", studioName: "Studio 1" }),
    slot("s2", "2026-10-06", "10:00", "12:00", { studioId: "st-1", studioName: "Studio 1" })
  ];
  const regs = regsBySlot(reg("s1", "t-an"), reg("s2", "t-binh"));
  const rows = planBulkFinalize(slots, regs, [], NAMES, { today: TODAY, month: MONTH });
  expect(rows[1].conflicts.studioInBatch).toBe(true);
  expect(rows[1].include).toBe(false);
  expect(rows[0].conflicts.studioInBatch).toBe(false);
});

test("ngưỡng giờ/tuần đẩy người đã quá tải xuống cuối hàng, nhưng vẫn chọn nếu không còn ai", () => {
  const slots = [
    slot("s1", "2026-10-06", "08:00", "18:00"), // 10h
    slot("s2", "2026-10-07", "08:00", "18:00"), // 10h
    slot("s3", "2026-10-08", "08:00", "18:00") // 10h — tới đây An đã 30h/tuần
  ];
  const regs = regsBySlot(reg("s1", "t-an"), reg("s2", "t-an"), reg("s3", "t-an"));
  const rows = planBulkFinalize(slots, regs, [], NAMES, { today: TODAY, month: MONTH, fatigueWeekHours: 24 });
  // Không ai khác đăng ký ⇒ vẫn là An cả 3 ca (không trùng giờ nhau), đúng "vẫn được chọn nếu không còn ai".
  expect(rows.map((r) => r.hostId)).toEqual(["t-an", "t-an", "t-an"]);

  // Có người thứ hai thì ca thứ 3 phải nhường, vì An đã vượt ngưỡng ngay trong mẻ này.
  const regs2 = regsBySlot(reg("s1", "t-an"), reg("s2", "t-an"), reg("s3", "t-an"), reg("s3", "t-binh"));
  const rows2 = planBulkFinalize(slots, regs2, [], NAMES, { today: TODAY, month: MONTH, fatigueWeekHours: 24 });
  expect(rows2[2].hostId).toBe("t-binh");
});

// ── recheckPlan ───────────────────────────────────────────────────────────────────────────────────

function row(id: string, date: string, startTime: string, endTime: string, extra: Partial<BulkPlanRow> = {}): BulkPlanRow {
  return {
    slotId: id,
    date,
    startTime,
    endTime,
    brandName: "CROCS",
    brandId: BRAND,
    studioName: "",
    candidates: [],
    hostId: "",
    coHostId: "",
    include: true,
    conflicts: {
      hostExisting: false,
      coHostExisting: false,
      studioExisting: false,
      hostInBatch: false,
      coHostInBatch: false,
      studioInBatch: false
    },
    noFreeCandidate: false,
    ...extra
  };
}

test("recheckPlan gắn cờ cho CẢ HAI dòng khi ops tự đổi về cùng một Host trùng giờ", () => {
  const rows = [
    row("s1", "2026-10-06", "09:00", "11:00", { hostId: "t-an" }),
    row("s2", "2026-10-06", "10:00", "12:00", { hostId: "t-an" })
  ];
  const out = recheckPlan(rows, []);
  expect(out.map((r) => r.conflicts.hostInBatch)).toEqual([true, true]);
  expect(rowsReadyToFinalize(out)).toEqual([]);
});

test("recheckPlan: dòng đã bỏ tick không chiếm chỗ của dòng còn tick", () => {
  const rows = [
    row("s1", "2026-10-06", "09:00", "11:00", { hostId: "t-an", include: false }),
    row("s2", "2026-10-06", "10:00", "12:00", { hostId: "t-an", include: true })
  ];
  const out = recheckPlan(rows, []);
  expect(out[1].conflicts.hostInBatch).toBe(false);
  expect(rowsReadyToFinalize(out).map((r) => r.slotId)).toEqual(["s2"]);
});

test("recheckPlan tính lại cờ trùng với ca ĐÃ TỒN TẠI sau khi ops đổi Host", () => {
  const existing = [session("x1", "2026-10-06", "09:00", "11:00", { hostId: "t-an" })];
  const out = recheckPlan([row("s1", "2026-10-06", "10:00", "12:00", { hostId: "t-an" })], existing);
  expect(out[0].conflicts.hostExisting).toBe(true);
  expect(rowsReadyToFinalize(out)).toEqual([]);
});

test("rowsReadyToFinalize bỏ dòng chưa có Host dù đang tick", () => {
  const out = recheckPlan([row("s1", "2026-10-06", "09:00", "11:00", { hostId: "", include: true })], []);
  expect(rowsReadyToFinalize(out)).toEqual([]);
});

// ── TRỢ LIVE: lớp lỗi bulkFinalize bỏ sót (audit 2026-09-28 mục 8 không vá cửa này) ───────────────
// Dropdown Trợ live của BulkFinalizePanel cho chọn bất kỳ ai đã đăng ký ca đó, và `patch()` gọi
// recheckPlan sau mỗi lần đổi — nhưng recheckPlan không đọc `coHostId` một lần nào, nên 4 cảnh báo
// dưới đây trước bản vá đều KHÔNG bắn, và `run()` gửi thẳng coHostId xuống handleFinalizeShiftSlot
// (hàm này cũng không kiểm trùng). Hậu quả: một người thành Trợ live của 2 ca live cùng lúc.

test("Trợ live trùng với ca ĐÃ TỒN TẠI phải bị gắn cờ", () => {
  const existing = [session("x1", "2026-10-06", "09:00", "11:00", { hostId: "t-cuong" })];
  const out = recheckPlan([row("s1", "2026-10-06", "10:00", "12:00", { hostId: "t-an", coHostId: "t-cuong" })], existing);
  expect(out[0].conflicts.coHostExisting).toBe(true);
  expect(rowsReadyToFinalize(out)).toEqual([]);
});

test("Trợ live trùng Trợ live của một ca đã tồn tại phải bị gắn cờ", () => {
  const existing = [session("x1", "2026-10-06", "09:00", "11:00", { hostId: "t-cuong", coHostId: "t-binh" })];
  const out = recheckPlan([row("s1", "2026-10-06", "10:00", "12:00", { hostId: "t-an", coHostId: "t-binh" })], existing);
  expect(out[0].conflicts.coHostExisting).toBe(true);
});

test("cùng một người làm Trợ live ở 2 dòng trùng giờ trong mẻ phải bị gắn cờ cả hai", () => {
  const rows = [
    row("s1", "2026-10-06", "09:00", "11:00", { hostId: "t-an", coHostId: "t-cuong" }),
    row("s2", "2026-10-06", "10:00", "12:00", { hostId: "t-binh", coHostId: "t-cuong" })
  ];
  const out = recheckPlan(rows, []);
  expect(out.map((r) => r.conflicts.coHostInBatch)).toEqual([true, true]);
  expect(rowsReadyToFinalize(out)).toEqual([]);
});

test("Host ở dòng này + Trợ live ở dòng trùng giờ kia cũng là một người bận", () => {
  // Luật chung của conflicts.ts: "một người bận nếu đang là Host HOẶC Trợ live của một ca chồng giờ".
  // Trong mẻ cũng phải đúng luật đó, không chỉ Host-với-Host.
  const rows = [
    row("s1", "2026-10-06", "09:00", "11:00", { hostId: "t-an", coHostId: "" }),
    row("s2", "2026-10-06", "10:00", "12:00", { hostId: "t-binh", coHostId: "t-an" })
  ];
  const out = recheckPlan(rows, []);
  expect(hasAnyConflict(out[0].conflicts)).toBe(true);
  expect(hasAnyConflict(out[1].conflicts)).toBe(true);
  expect(rowsReadyToFinalize(out)).toEqual([]);
});

test("Trợ live KHÔNG trùng giờ thì không bị gắn cờ oan", () => {
  const existing = [session("x1", "2026-10-06", "09:00", "11:00", { hostId: "t-cuong" })];
  const rows = [
    row("s1", "2026-10-06", "14:00", "16:00", { hostId: "t-an", coHostId: "t-cuong" }),
    row("s2", "2026-10-07", "14:00", "16:00", { hostId: "t-binh", coHostId: "t-cuong" })
  ];
  const out = recheckPlan(rows, existing);
  expect(out.every((r) => !hasAnyConflict(r.conflicts))).toBe(true);
  expect(rowsReadyToFinalize(out).map((r) => r.slotId)).toEqual(["s1", "s2"]);
});

test("cùng một người vừa Host vừa Trợ live của CHÍNH dòng đó phải bị gắn cờ", () => {
  // PHÒNG THỦ, không phải lỗ đang hở: đo trên harness 2026-10-01 thì UI chặn được cả hai chiều
  // (onChange của Host xoá Trợ live trùng; dropdown Trợ live lọc bỏ đúng Host). Test này giữ cho
  // người gọi khác — kiểu dữ liệu `BulkPlanRow` vẫn dựng được trạng thái này.
  const out = recheckPlan([row("s1", "2026-10-06", "09:00", "11:00", { hostId: "t-an", coHostId: "t-an" })], []);
  expect(hasAnyConflict(out[0].conflicts)).toBe(true);
  expect(rowsReadyToFinalize(out)).toEqual([]);
});
