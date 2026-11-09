import { expect, test } from "vitest";
import { defaultMilestones, draftFromSaved, extraSignupDeadline, halfOf, halfRange, milestoneError, slotDeadline } from "../src/lib/roster/milestones";
import { pickExtraSlots, targetIntake } from "../src/lib/scheduling/targetIntake";
import { signupDeadlineOf } from "../src/lib/db/roster";
import { isoWeekStart } from "../src/lib/dateUtils";
import { vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

test("đợt theo ngày: 1–15 là đợt 1, 16–cuối là đợt 2", () => {
  expect(halfOf("2026-12-15")).toBe(1);
  expect(halfOf("2026-12-16")).toBe(2);
  expect(halfRange("2026-12", 2)).toBe("16–31/12");
  expect(halfRange("2027-02", 2)).toBe("16–28/2");
});

test("mốc mặc định = ngày 10/15/20/25 tháng trước; mở muộn thì dời, vẫn đúng thứ tự", () => {
  expect(defaultMilestones("2026-12", "2026-11-03")).toEqual({ d1Date: "2026-11-10", d1Time: "17:00", d2Date: "2026-11-20", d2Time: "17:00", p1: "2026-11-15", p2: "2026-11-25" });
  // Tháng 1 ⇒ mốc ở tháng 12 năm trước.
  expect(defaultMilestones("2027-01", "2026-12-01").d1Date).toBe("2026-12-10");
  // Mở lịch tháng 12 vào 9/11 (09/11, audit): hạn đợt 1 gốc 10/11 chỉ còn 1 ngày ⇒ dời tới hôm nay + 3 ngày = 12/11; các mốc sau giữ.
  expect(defaultMilestones("2026-12", "2026-11-09")).toEqual({ d1Date: "2026-11-12", d1Time: "17:00", d2Date: "2026-11-20", d2Time: "17:00", p1: "2026-11-15", p2: "2026-11-25" });
  // Mở lịch tháng 12 vào 18/11: hạn đợt 1 đã qua ⇒ hôm nay + 3 ngày; chốt đợt 1 sau hạn; đợt 2 dồn theo, chốt đợt 2 giữ 25.
  const late = defaultMilestones("2026-12", "2026-11-18");
  expect(late).toMatchObject({ d1Date: "2026-11-21", p1: "2026-11-22", d2Date: "2026-11-22", p2: "2026-11-25" });
  expect(milestoneError(late)).toBeNull();
  // Mở lịch vào 26/11: mọi mốc dồn sau hôm nay + 3 ngày, thứ tự vẫn đúng.
  const veryLate = defaultMilestones("2026-12", "2026-11-26");
  expect(veryLate).toMatchObject({ d1Date: "2026-11-29", p1: "2026-11-30", d2Date: "2026-11-30", p2: "2026-12-01" });
  expect(milestoneError(veryLate)).toBeNull();
});

test("thứ tự mốc sai bị báo", () => {
  const ok = defaultMilestones("2026-12", "2026-11-01");
  expect(milestoneError(ok)).toBeNull();
  expect(milestoneError({ ...ok, d2Date: "2026-11-09" })).toMatch("đợt 2 phải sau");
  expect(milestoneError({ ...ok, p1: "2026-11-09" })).toMatch("chốt lịch đợt 1");
  expect(milestoneError({ ...ok, p2: "" })).toMatch("Điền đủ");
});

test("bản nháp từ mốc đã lưu: giữ ngày đã lưu, ô trống lấy mặc định", () => {
  const d = draftFromSaved({ month: "2026-12", signupDeadline: new Date(2026, 10, 11, 9, 30).toISOString() }, "2026-12", "2026-11-03");
  expect(d).toMatchObject({ d1Date: "2026-11-11", d1Time: "09:30", d2Date: "2026-11-20", p1: "2026-11-15" });
});

test("hạn của một ca: hạn riêng ca bổ sung > hạn đợt theo ngày > hạn tuần cũ (lấy sớm hơn)", () => {
  const m = { month: "2026-12", signupDeadline: "2026-11-10T10:00:00Z", signupDeadline2: "2026-11-20T10:00:00Z" };
  expect(slotDeadline("2026-12-05", m)).toBe("2026-11-10T10:00:00Z");
  expect(slotDeadline("2026-12-20", m)).toBe("2026-11-20T10:00:00Z");
  // Chưa đặt đợt 2 ⇒ hạn đợt 1 áp cả tháng (như 0180).
  expect(slotDeadline("2026-12-20", { month: "2026-12", signupDeadline: "2026-11-10T10:00:00Z" })).toBe("2026-11-10T10:00:00Z");
  expect(slotDeadline("2026-12-20", m, "2026-11-15T10:00:00Z")).toBe("2026-11-15T10:00:00Z");
  expect(slotDeadline("2026-12-20", m, undefined, "2026-12-03T10:00:00Z")).toBe("2026-12-03T10:00:00Z");
  expect(signupDeadlineOf({ date: "2026-12-20", signupDeadline: "2026-12-03T10:00:00Z" }, [m], [], isoWeekStart)).toBe("2026-12-03T10:00:00Z");
  expect(signupDeadlineOf({ date: "2026-12-20" }, [m], [], isoWeekStart)).toBe("2026-11-20T10:00:00Z");
});

test("3 mức nhận target: ≤10% chia, 10–30% ca bổ sung, >30% báo lại brand (số T11 thật)", () => {
  // CROCS T11: target 5.983M, dự báo 5.832M, 299h ⇒ +3% chỉ chia.
  expect(targetIntake(5983e6, 5832e6, 299).tier).toBe("allocate");
  // VERA Shopee T11: 1.227M vs 1.025M, 274h ⇒ +20%, cần ~54h, trần 82h.
  const vs = targetIntake(1227e6, 1025e6, 274);
  expect(vs.tier).toBe("add");
  expect(Math.round(vs.hoursNeeded)).toBe(54);
  expect(Math.round(vs.hoursCap)).toBe(82);
  // VERA TikTok T11: 1.000M vs 480M ⇒ +108%.
  expect(targetIntake(1000e6, 480e6, 259).tier).toBe("renegotiate");
  // Biên: đúng 10% / 30% thuộc mức dưới; target thấp hơn dự báo ⇒ chỉ chia.
  expect(targetIntake(110, 100, 10).tier).toBe("allocate");
  expect(targetIntake(130, 100, 10).tier).toBe("add");
  expect(targetIntake(131, 100, 10).tier).toBe("renegotiate");
  expect(targetIntake(80, 100, 10)).toMatchObject({ tier: "allocate", hoursNeeded: 0 });
  expect(targetIntake(100, 0, 10).tier).toBe("no_forecast");
});

test("chọn ca bổ sung: bỏ hôm nay/đã qua, dừng khi đủ giờ, không quá trần", () => {
  const c = (date: string, hours: number) => ({ date, startTime: "19:00", endTime: "22:00", hours });
  const cands = [c("2026-11-06", 3), c("2026-11-10", 3), c("2026-11-11", 3), c("2026-11-12", 3), c("2026-11-13", 3)];
  expect(pickExtraSlots(cands, 5, 20, "2026-11-06").map((x) => x.date)).toEqual(["2026-11-10", "2026-11-11"]);
  expect(pickExtraSlots(cands, 50, 7, "2026-11-06").map((x) => x.date)).toEqual(["2026-11-10", "2026-11-11"]);
  expect(pickExtraSlots(cands, 0, 7, "2026-11-06")).toEqual([]);
});

test("hạn đăng ký thêm cho ca còn thiếu người (0207): 17:00 trước ngày ca 1 ngày, tối đa 2 ngày nữa; ca sát giờ thì 2 giờ trước giờ bắt đầu; hết thời gian = null", () => {
  const now = new Date("2026-11-09T10:00:00"); // giờ máy
  const hm = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null);
  // Ca xa: lấy hôm nay + 2 ngày 17:00 (sớm hơn ngày-trước-ca).
  expect(hm(extraSignupDeadline("2026-11-20", "19:00", now))).toBe("2026-11-11 17:00");
  // Ca gần hơn 3 ngày: lấy 17:00 ngày trước ca.
  expect(hm(extraSignupDeadline("2026-11-11", "19:00", now))).toBe("2026-11-10 17:00");
  // Ca ngày mai: 17:00 hôm nay còn trước giờ ca ⇒ hôm nay 17:00 > now.
  expect(hm(extraSignupDeadline("2026-11-10", "19:00", now))).toBe("2026-11-09 17:00");
  // Ca hôm nay 19:00 lúc 18:30: ngày-trước-ca đã qua ⇒ 2 giờ trước ca = 17:00 đã qua ⇒ null.
  expect(extraSignupDeadline("2026-11-09", "19:00", new Date("2026-11-09T18:30:00"))).toBeNull();
  // Ca hôm nay 22:00 lúc 10:00: 20:00 hôm nay.
  expect(hm(extraSignupDeadline("2026-11-09", "22:00", now))).toBe("2026-11-09 20:00");
});
