// Lưới Kế Hoạch Tháng (src/lib/scheduling/monthPlanGrid.ts) — phần thuần đứng sau màn ops vẽ ca và
// chia target tháng xuống từng ca. Chưa có test nào, ghi nhận là khoảng trống từ đợt audit 2026-09-25.
//
// Bất biến quan trọng nhất ở đây là TIỀN: `allocateDraftTargets` tự nhận "ca cuối nhận phần dư làm
// tròn — tổng luôn khớp target, không lệch vì làm tròn từng ca". Lệch ở đây là lệch giữa target cam
// kết với brand và tổng target các ca mà host nhận, tức đúng họ lỗi Đ5/E2E#1 đã phải vá 2 lần.
import { expect, test } from "vitest";
import {
  addHours,
  allocateDraftTargets,
  daysOfMonth,
  draftKeyOf,
  draftsFromSaved,
  draftsFromSessions,
  draftsFromSuggestion,
  endsAfterMidnight,
  mergeFromTemplates,
  nextSlotForDay,
  slotHours,
  totalsOf,
  validateDrafts,
  type PlanDraftSlot
} from "../src/lib/scheduling/monthPlanGrid";
import { BrandMonthPlan, BrandMonthPlanSlot, RecurringShiftTemplate } from "../src/types";

const PLAN: Pick<BrandMonthPlan, "defaultSlotHours" | "liveWindowStart" | "liveWindowEnd" | "maxSlotsPerDay"> = {
  defaultSlotHours: 2,
  liveWindowStart: "08:00",
  liveWindowEnd: "22:00",
  maxSlotsPerDay: 3
};

function d(date: string, startTime: string, endTime: string, extra: Partial<PlanDraftSlot> = {}): PlanDraftSlot {
  return { key: `${date}-${startTime}`, date, startTime, endTime, targetGmv: 0, note: "", ...extra };
}

// ── lịch / giờ ────────────────────────────────────────────────────────────────────────────────────

test("daysOfMonth đếm đúng số ngày, kể cả tháng 2 năm nhuận", () => {
  expect(daysOfMonth("2026-10")).toHaveLength(31);
  expect(daysOfMonth("2026-11")).toHaveLength(30);
  expect(daysOfMonth("2026-02")).toHaveLength(28);
  expect(daysOfMonth("2028-02")).toHaveLength(29);
  expect(daysOfMonth("2026-10")[0]).toBe("2026-10-01");
  expect(daysOfMonth("2026-10").at(-1)).toBe("2026-10-31");
});

test("addHours cộng giờ lẻ và chặn ở 23:59, không tràn sang ngày sau", () => {
  expect(addHours("09:00", 2)).toBe("11:00");
  expect(addHours("09:30", 1.5)).toBe("11:00");
  expect(addHours("22:00", 3)).toBe("23:59");
  expect(addHours("23:59", 1)).toBe("23:59");
});

test("slotHours: giờ kết thúc < bắt đầu được đọc là ca QUA ĐÊM, không phải giờ âm", () => {
  expect(slotHours({ startTime: "09:00", endTime: "11:30" })).toBe(2.5);
  expect(slotHours({ startTime: "22:00", endTime: "01:00" })).toBe(3);
  // `sessionDurationHours` cộng 24h khi lệch âm (ca qua đêm là ca thật ở đường Finance), nên
  // `Math.max(…, 0)` trong slotHours không bao giờ chạm tới — ca nhập ngược giờ ra 22h chứ không ra 0,
  // và thứ chặn nó là validateDrafts ("kết thúc trước khi bắt đầu"), không phải hàm này.
  expect(slotHours({ startTime: "11:00", endTime: "09:00" })).toBe(22);
  expect(validateDrafts([d("2026-10-06", "11:00", "09:00")], PLAN)).toHaveLength(1);
});

// ── nextSlotForDay ────────────────────────────────────────────────────────────────────────────────

test("ca đầu tiên của ngày bắt đầu ở đầu khung giờ", () => {
  const s = nextSlotForDay("2026-10-06", [], PLAN);
  expect(s).toMatchObject({ date: "2026-10-06", startTime: "08:00", endTime: "10:00", targetGmv: 0 });
});

test("ca tiếp theo nối sau ca cuối của ĐÚNG ngày đó", () => {
  const drafts = [d("2026-10-06", "08:00", "10:00"), d("2026-10-07", "08:00", "18:00")];
  expect(nextSlotForDay("2026-10-06", drafts, PLAN)).toMatchObject({ startTime: "10:00", endTime: "12:00" });
});

test("ca cuối tính theo giờ KẾT THÚC muộn nhất, không theo thứ tự trong mảng", () => {
  const drafts = [d("2026-10-06", "14:00", "16:00"), d("2026-10-06", "08:00", "10:00")];
  expect(nextSlotForDay("2026-10-06", drafts, PLAN)).toMatchObject({ startTime: "16:00", endTime: "18:00" });
});

test("ca mới bị cắt ngắn để không vượt cuối khung giờ", () => {
  const drafts = [d("2026-10-06", "08:00", "21:00")];
  expect(nextSlotForDay("2026-10-06", drafts, PLAN)).toMatchObject({ startTime: "21:00", endTime: "22:00" });
});

test("hết chỗ trong khung hoặc đủ số ca/ngày thì trả null", () => {
  expect(nextSlotForDay("2026-10-06", [d("2026-10-06", "08:00", "22:00")], PLAN)).toBeNull();
  const full = [d("2026-10-06", "08:00", "10:00"), d("2026-10-06", "10:00", "12:00"), d("2026-10-06", "12:00", "14:00")];
  expect(nextSlotForDay("2026-10-06", full, PLAN)).toBeNull();
});

// ── allocateDraftTargets: TIỀN ────────────────────────────────────────────────────────────────────

const sum = (ds: PlanDraftSlot[]) => ds.reduce((a, x) => a + x.targetGmv, 0);

test("tổng target các ca khớp ĐÚNG target tháng, không lệch vì làm tròn", () => {
  // 7 ca, target 5,5 tỷ, trọng số lẻ — chia đều kiểu nào cũng ra số thập phân.
  const drafts = Array.from({ length: 7 }, (_, i) => d("2026-10-0" + (i + 1), "09:00", "11:00"));
  const weights = [3, 1, 1, 1, 1, 1, 1];
  const out = allocateDraftTargets(drafts, 5_500_000_000, weights);
  expect(sum(out)).toBe(5_500_000_000);
});

test("tổng vẫn khớp với trọng số rất lệch nhau", () => {
  const drafts = Array.from({ length: 13 }, (_, i) => d(`2026-10-${`${i + 1}`.padStart(2, "0")}`, "09:00", "11:00"));
  const weights = [999, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 7];
  const out = allocateDraftTargets(drafts, 1_000_000_007, weights);
  expect(sum(out)).toBe(1_000_000_007);
  expect(out[0].targetGmv).toBeGreaterThan(out[1].targetGmv * 100);
});

test("chia theo trọng số, không chia đều", () => {
  const drafts = [d("2026-10-01", "09:00", "11:00"), d("2026-10-02", "09:00", "11:00")];
  const out = allocateDraftTargets(drafts, 300, [2, 1]);
  expect(out.map((x) => x.targetGmv)).toEqual([200, 100]);
});

test("không có trọng số nào > 0 thì rơi về chia theo GIỜ của từng ca", () => {
  const drafts = [d("2026-10-01", "09:00", "12:00"), d("2026-10-02", "09:00", "10:00")]; // 3h vs 1h
  const out = allocateDraftTargets(drafts, 400, [0, 0]);
  expect(out.map((x) => x.targetGmv)).toEqual([300, 100]);
});

test("target 0 hoặc lưới không có giờ nào thì mọi ca về 0, không ra NaN", () => {
  const drafts = [d("2026-10-01", "09:00", "11:00")];
  expect(allocateDraftTargets(drafts, 0, [1])[0].targetGmv).toBe(0);
  const zeroHours = [d("2026-10-01", "09:00", "09:00")];
  expect(allocateDraftTargets(zeroHours, 500, [0])[0].targetGmv).toBe(0);
});

test("expectedGmv lấy từ `forecasts`, và không xoá dự báo cũ khi dự báo mới là 0", () => {
  const drafts = [d("2026-10-01", "09:00", "11:00", { expectedGmv: 12_345 }), d("2026-10-02", "09:00", "11:00")];
  const out = allocateDraftTargets(drafts, 1_000, [1, 1], [0, 777.4]);
  expect(out[0].expectedGmv).toBe(12_345); // giữ nguyên, không bị 0 ghi đè
  expect(out[1].expectedGmv).toBe(777); // làm tròn
});

test("allocateDraftTargets không sửa mảng gốc", () => {
  const drafts = [d("2026-10-01", "09:00", "11:00")];
  allocateDraftTargets(drafts, 1_000, [1]);
  expect(drafts[0].targetGmv).toBe(0);
});

// ── totalsOf / validateDrafts ─────────────────────────────────────────────────────────────────────

test("totalsOf đếm ngày theo ngày DUY NHẤT, không theo số ca", () => {
  const drafts = [
    d("2026-10-06", "08:00", "10:00", { targetGmv: 100 }),
    d("2026-10-06", "10:00", "12:30", { targetGmv: 200 }),
    d("2026-10-07", "08:00", "10:00", { targetGmv: 300 })
  ];
  expect(totalsOf(drafts)).toEqual({ slots: 3, days: 2, hours: 6.5, target: 600 });
});

test("validateDrafts bắt giờ ngược, ngoài khung, chồng giờ, quá số ca/ngày", () => {
  expect(validateDrafts([d("2026-10-06", "11:00", "09:00")], PLAN)[0]).toContain("kết thúc trước khi bắt đầu");
  expect(validateDrafts([d("2026-10-06", "07:00", "09:00")], PLAN)[0]).toContain("ngoài khung");
  expect(validateDrafts([d("2026-10-06", "20:00", "23:00")], PLAN)[0]).toContain("ngoài khung");

  const overlap = [d("2026-10-06", "08:00", "11:00"), d("2026-10-06", "10:00", "12:00")];
  expect(validateDrafts(overlap, PLAN).some((e) => e.includes("chồng giờ"))).toBe(true);

  const tooMany = Array.from({ length: 4 }, (_, i) => d("2026-10-06", `${8 + i * 2}:00`.padStart(5, "0"), `${10 + i * 2}:00`.padStart(5, "0")));
  expect(validateDrafts(tooMany, PLAN).some((e) => e.includes("vượt tối đa 3"))).toBe(true);
});

test("ca nối đuôi nhau (kết thúc = bắt đầu) KHÔNG phải chồng giờ", () => {
  const back2back = [d("2026-10-06", "08:00", "10:00"), d("2026-10-06", "10:00", "12:00")];
  expect(validateDrafts(back2back, PLAN)).toEqual([]);
});

test("lưới hợp lệ không sinh lỗi nào, và ca khác NGÀY không bị tính chồng giờ", () => {
  const ok = [d("2026-10-06", "08:00", "10:00"), d("2026-10-07", "08:00", "10:00")];
  expect(validateDrafts(ok, PLAN)).toEqual([]);
});

// ── draftsFromSaved / draftsFromSuggestion / mergeFromTemplates ───────────────────────────────────

test("draftsFromSaved giữ id làm key và bỏ expectedGmv = 0", () => {
  const saved: BrandMonthPlanSlot[] = [
    { id: "slot-1", date: "2026-10-06", startTime: "08:00", endTime: "10:00", targetGmv: 100, note: "n", expectedGmv: 0 } as BrandMonthPlanSlot,
    { id: "slot-2", date: "2026-10-07", startTime: "08:00", endTime: "10:00", targetGmv: 200, note: "", expectedGmv: 55 } as BrandMonthPlanSlot
  ];
  const out = draftsFromSaved(saved);
  expect(out[0]).toMatchObject({ key: "slot-1", id: "slot-1", targetGmv: 100 });
  expect(out[0].expectedGmv).toBeUndefined();
  expect(out[1].expectedGmv).toBe(55);
});

test("draftsFromSuggestion giữ id/slotId/note của ca ĐÃ LƯU khớp ngày|giờ", () => {
  // Không giữ được id là engine "gợi ý" xong thì ca cũ bị xoá rồi tạo lại ⇒ mất liên kết slot_id,
  // đúng họ lỗi E2E #1 làm target tháng tụt âm thầm.
  const current = [d("2026-10-06", "08:00", "10:00", { key: "k1", id: "slot-1", slotId: "shift-1", note: "ghi chú cũ" })];
  const out = draftsFromSuggestion(current, [
    { date: "2026-10-06", startTime: "08:00", endTime: "10:00", targetGmv: 500, expectedGmv: 400, reason: "r", highExpectation: false },
    { date: "2026-10-07", startTime: "08:00", endTime: "10:00", targetGmv: 600, expectedGmv: 300, reason: "r2", highExpectation: true }
  ]);
  expect(out[0]).toMatchObject({ key: "k1", id: "slot-1", slotId: "shift-1", note: "ghi chú cũ", targetGmv: 500 });
  expect(out[1].id).toBeUndefined();
  expect(out[1].note).toBe("");
});

test("draftKeyOf không gồm target/note — ca chỉ khác target vẫn là cùng một khung", () => {
  expect(draftKeyOf(d("2026-10-06", "08:00", "10:00", { targetGmv: 1 }))).toBe(
    draftKeyOf(d("2026-10-06", "08:00", "10:00", { targetGmv: 999, note: "x" }))
  );
});

test("mergeFromTemplates thêm ca còn thiếu và GIỮ NGUYÊN ca ops đã vẽ", () => {
  const templates: RecurringShiftTemplate[] = [
    {
      id: "t1",
      weekday: 4, // thứ Năm
      brandId: "brand-crocs",
      brandName: "CROCS",
      platform: "TikTok",
      studioName: "",
      notes: "từ quy tắc",
      startTime: "09:00",
      endTime: "11:00",
      active: true
    } as RecurringShiftTemplate
  ];
  // 08/10/2026 là thứ Năm — ops đã vẽ tay đúng khung đó, kèm target đã nhập.
  const existing = [d("2026-10-08", "09:00", "11:00", { key: "mine", targetGmv: 777 })];
  const { next, added } = mergeFromTemplates(existing, templates, "2026-10", "brand-crocs", "2026-10-01");

  expect(added).toBe(4); // 01, 15, 22, 29 (08 đã có)
  expect(next[0]).toMatchObject({ key: "mine", targetGmv: 777 }); // không bị ghi đè
  expect(next.filter((x) => x.date === "2026-10-08")).toHaveLength(1); // không nhân đôi
  expect(next.find((x) => x.date === "2026-10-15")?.note).toBe("từ quy tắc");
});

// ── dựng lưới từ ca đã nhập (07/10: lịch T10 nạp bằng file, 0 shift_slots) ──────────────────────────────


const sess = (date: string, startTime: string, endTime: string, targetGmv = 0, status: "Upcoming" | "Cancelled" | "Completed" = "Upcoming") => ({ date, startTime, endTime, targetGmv, status });

test("draftsFromSessions: bỏ ca huỷ, gộp ca trùng hệt giờ, giữ target ghi trên ca", () => {
  const { next, added, duplicates } = draftsFromSessions(
    [
      sess("2026-10-02", "11:00", "14:00", 10_000_000),
      sess("2026-10-02", "11:00", "14:00", 99), // trùng hệt (VERA TikTok 03/10 có thật) — chỉ lấy một
      sess("2026-10-01", "20:00:00", "23:00:00", 5_000_000), // giờ có giây vẫn về hh:mm
      sess("2026-10-03", "11:00", "14:00", 7, "Cancelled")
    ],
    []
  );
  expect(added).toBe(2);
  expect(duplicates).toBe(1);
  expect(next.map(draftKeyOf)).toEqual(["2026-10-01|20:00|23:00", "2026-10-02|11:00|14:00"]);
  expect(next.map((x) => x.targetGmv)).toEqual([5_000_000, 10_000_000]);
});

test("draftsFromSessions: ca đã có trong lưới giữ nguyên id/target, chỉ thêm ca còn thiếu", () => {
  const have = d("2026-10-02", "11:00", "14:00", { id: "plan-slot-1", targetGmv: 42 });
  const { next, added } = draftsFromSessions([sess("2026-10-02", "11:00", "14:00", 1), sess("2026-10-04", "09:00", "12:00", 8)], [have]);
  expect(added).toBe(1);
  expect(next.find((x) => x.date === "2026-10-02")).toMatchObject({ id: "plan-slot-1", targetGmv: 42 });
});

test("ca qua nửa đêm hợp lệ trong lưới; nhập ngược giờ ban ngày vẫn bị chặn", () => {
  const win = { ...PLAN, liveWindowStart: "09:00", liveWindowEnd: "23:59" };
  expect(endsAfterMidnight({ startTime: "21:00", endTime: "00:30" })).toBe(true);
  expect(endsAfterMidnight({ startTime: "21:00", endTime: "00:00" })).toBe(true);
  expect(endsAfterMidnight({ startTime: "11:00", endTime: "09:00" })).toBe(false);
  expect(validateDrafts([d("2026-10-09", "21:00", "00:30")], win)).toEqual([]);
  expect(validateDrafts([d("2026-10-09", "11:00", "09:00")], win)[0]).toContain("kết thúc trước khi bắt đầu");
  // chồng giờ tính qua nửa đêm: ca 21:00–00:30 và ca 23:00 cùng ngày chồng nhau
  expect(validateDrafts([d("2026-10-09", "21:00", "00:30"), d("2026-10-09", "23:00", "23:30")], win).join()).toContain("chồng giờ");
  // ca qua nửa đêm bắt đầu sau cuối khung vẫn ngoài khung
  expect(validateDrafts([d("2026-10-09", "23:30", "00:30")], { ...PLAN, liveWindowStart: "09:00", liveWindowEnd: "23:00" }).join()).toContain("ngoài khung");
});
