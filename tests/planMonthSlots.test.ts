// Sinh ca tháng từ quy tắc lặp (src/lib/scheduling/planMonthSlots.ts) — bản xem trước cho màn Đăng Ký
// & Chốt Lịch trước khi bấm sinh thật qua RPC generate_shift_slots. Chưa có test nào, ghi nhận là
// khoảng trống từ đợt audit 2026-09-25.
//
// Thứ cần canh nhất là KHOÁ CHỐNG TRÙNG: chính file này ghi rằng bản cũ dedupe theo `template_id`
// nên "xoá quy tắc rồi tạo lại → id mới → sinh trùng". Khoá hiện tại là khoá tự nhiên của ca
// (brand|ngày|giờ|nền tảng) — test dưới đây bẻ đúng tình huống đó.
import { expect, test } from "vitest";
import { planMonthSlots, slotNaturalKey } from "../src/lib/scheduling/planMonthSlots";
import { RecurringShiftTemplate, ShiftSlot } from "../src/types";

const MONTH = "2026-10"; // T10/2026: 01/10 là thứ Năm, 31 ngày
const TODAY = "2026-10-01";
const BRAND = "brand-crocs";

function tpl(id: string, weekday: number, extra: Partial<RecurringShiftTemplate> = {}): RecurringShiftTemplate {
  return {
    id,
    weekday,
    brandId: BRAND,
    brandName: "CROCS",
    platform: "TikTok",
    studioName: "",
    notes: "",
    startTime: "09:00",
    endTime: "11:00",
    active: true,
    ...extra
  } as RecurringShiftTemplate;
}

function slot(id: string, date: string, extra: Partial<ShiftSlot> = {}): ShiftSlot {
  return {
    id,
    date,
    startTime: "09:00",
    endTime: "11:00",
    brandId: BRAND,
    brandName: "CROCS",
    platform: "TikTok",
    studioName: "",
    notes: "",
    status: "open",
    ...extra
  };
}

test("quy tắc theo thứ sinh đúng số ngày trong tháng", () => {
  // Thứ Năm của T10/2026: 1, 8, 15, 22, 29 ⇒ 5 ca.
  const plan = planMonthSlots([tpl("t1", 4)], [], MONTH, TODAY);
  expect(plan.toCreate.map((s) => s.date)).toEqual([
    "2026-10-01",
    "2026-10-08",
    "2026-10-15",
    "2026-10-22",
    "2026-10-29"
  ]);
  expect(plan.perBrand).toEqual([{ brandId: BRAND, brandName: "CROCS", newCount: 5, newHours: 10 }]);
});

test("isDaily phủ cả 31 ngày, không nhìn weekday", () => {
  const plan = planMonthSlots([tpl("t1", 0, { isDaily: true })], [], MONTH, TODAY);
  expect(plan.toCreate).toHaveLength(31);
});

test("ngày đã qua không sinh ca", () => {
  const plan = planMonthSlots([tpl("t1", 4)], [], MONTH, "2026-10-16");
  expect(plan.toCreate.map((s) => s.date)).toEqual(["2026-10-22", "2026-10-29"]);
  expect(plan.skippedPast).toBe(3);
});

test("quy tắc tắt (active=false) bị bỏ hẳn", () => {
  const plan = planMonthSlots([tpl("t1", 4, { active: false })], [], MONTH, TODAY);
  expect(plan.toCreate).toEqual([]);
  expect(plan.skippedNoBrand).toBe(0);
});

test("quy tắc không gắn brand không sinh ca, đếm riêng", () => {
  const plan = planMonthSlots([tpl("t1", 4, { brandId: undefined })], [], MONTH, TODAY);
  expect(plan.toCreate).toEqual([]);
  expect(plan.skippedNoBrand).toBe(1);
});

test("ca đã có trong tháng (cùng khoá tự nhiên) không sinh lại", () => {
  const plan = planMonthSlots([tpl("t1", 4)], [slot("s1", "2026-10-08")], MONTH, TODAY);
  expect(plan.toCreate.map((s) => s.date)).toEqual(["2026-10-01", "2026-10-15", "2026-10-22", "2026-10-29"]);
  expect(plan.skippedExisting).toBe(1);
});

test("ca đã huỷ KHÔNG chặn sinh lại ca cùng khung", () => {
  const plan = planMonthSlots([tpl("t1", 4)], [slot("s1", "2026-10-08", { status: "cancelled" })], MONTH, TODAY);
  expect(plan.toCreate.map((s) => s.date)).toContain("2026-10-08");
  expect(plan.skippedExisting).toBe(0);
});

test("ca cùng ngày giờ nhưng KHÁC brand không bị coi là trùng", () => {
  const other = slot("s1", "2026-10-08", { brandId: "brand-vera", brandName: "VERA" });
  const plan = planMonthSlots([tpl("t1", 4)], [other], MONTH, TODAY);
  expect(plan.skippedExisting).toBe(0);
  expect(plan.toCreate).toHaveLength(5);
});

test("khoá chống trùng là khoá tự nhiên, KHÔNG phải templateId", () => {
  // Đúng hồi quy ghi ở đầu file: xoá quy tắc rồi tạo lại ⇒ id mới. Hai quy tắc id khác nhau nhưng
  // cùng brand|giờ|nền tảng chỉ được sinh 1 ca mỗi ngày.
  const plan = planMonthSlots([tpl("cu", 4), tpl("moi-sau-khi-xoa", 4)], [], MONTH, TODAY);
  expect(plan.toCreate).toHaveLength(5);
  expect(plan.skippedExisting).toBe(5);
  expect(new Set(plan.toCreate.map(slotNaturalKey)).size).toBe(5);
});

test("hai quy tắc KHÁC giờ cùng ngày thì sinh cả hai", () => {
  const plan = planMonthSlots([tpl("t1", 4), tpl("t2", 4, { startTime: "14:00", endTime: "16:00" })], [], MONTH, TODAY);
  expect(plan.toCreate).toHaveLength(10);
  expect(plan.perBrand[0].newHours).toBe(20);
});

test("lọc theo brandId chỉ xét quy tắc của brand đó", () => {
  const templates = [tpl("t1", 4), tpl("t2", 4, { brandId: "brand-vera", brandName: "VERA" })];
  const plan = planMonthSlots(templates, [], MONTH, TODAY, BRAND);
  expect(plan.perBrand.map((b) => b.brandId)).toEqual([BRAND]);
  expect(plan.toCreate).toHaveLength(5);
});

test("toCreate xếp theo ngày rồi giờ, perBrand xếp theo tên brand", () => {
  const templates = [
    tpl("t-chieu", 4, { startTime: "14:00", endTime: "16:00" }),
    tpl("t-sang", 4),
    tpl("t-vera", 4, { brandId: "brand-vera", brandName: "ARIA" })
  ];
  const plan = planMonthSlots(templates, [], MONTH, TODAY);
  expect(plan.toCreate.slice(0, 3).map((s) => `${s.date} ${s.startTime}`)).toEqual([
    "2026-10-01 09:00",
    "2026-10-01 09:00",
    "2026-10-01 14:00"
  ]);
  expect(plan.perBrand.map((b) => b.brandName)).toEqual(["ARIA", "CROCS"]);
});

test("tháng 2 năm nhuận đếm đúng 29 ngày", () => {
  // 2028 là năm nhuận — `new Date(y, m, 0).getDate()` phải ra 29, không phải 28.
  const plan = planMonthSlots([tpl("t1", 0, { isDaily: true })], [], "2028-02", "2028-02-01");
  expect(plan.toCreate).toHaveLength(29);
});

test("ca đã có ở THÁNG KHÁC không chặn ca tháng này", () => {
  const plan = planMonthSlots([tpl("t1", 4)], [slot("s1", "2026-09-10")], MONTH, TODAY);
  expect(plan.skippedExisting).toBe(0);
});
