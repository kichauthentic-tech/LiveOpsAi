// "Chia lại theo lịch hiện có" (0164, 10/10): collectRebase gom ca trên lịch + ca kế hoạch, buildRebase dựng danh sách gửi RPC.
// Chạy: npx vitest run tests/rebase.test.ts
import { describe, expect, test } from "vitest";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import { PlanDraftSlot, allocateDraftTargets } from "../src/lib/scheduling/monthPlanGrid";
import { activeDrafts, buildRebase, collectRebase, mergeAllocated } from "../src/lib/scheduling/rebase";

const TODAY = "2026-10-10";
const B = "brand-v";
const plan = (date: string, st: string, en: string, target: number, id: string, slotId?: string): PlanDraftSlot => ({ key: id, id, date, startTime: st, endTime: en, targetGmv: target, note: "", slotId });
const ses = (id: string, date: string, st: string, en: string, status = "Completed", platform = "Shopee") =>
  ({ id, brandId: B, platform, date, startTime: `${st}:00`, endTime: `${en}:00`, status }) as never;
const shift = (id: string, date: string, st: string, en: string, status: string, sessionId?: string, platform = "Shopee") =>
  ({ id, brandId: B, platform, date, startTime: `${st}:00`, endTime: `${en}:00`, status, sessionId }) as never;

const base = () => ({
  brandId: B,
  platform: "Shopee" as const,
  month: "2026-10",
  today: TODAY,
  planDrafts: [
    plan("2026-10-03", "10:00", "12:00", 200, "p1", "s1"), // đã qua, có phiên
    plan("2026-10-04", "10:00", "12:00", 200, "p2", "s2"), // đã qua, phiên huỷ
    plan("2026-10-20", "10:00", "12:00", 200, "p3", "s3"), // tương lai, ca mở
    plan("2026-10-05", "14:00", "16:00", 200, "p4"), // đã qua, chưa từng gắn ca thật, lịch không có gì
    plan("2026-10-25", "14:00", "16:00", 200, "p5") // tương lai, chưa mở ca
  ],
  sessions: [
    ses("a", "2026-10-03", "10:00", "12:00"),
    ses("b", "2026-10-04", "10:00", "12:00", "Cancelled"),
    ses("c", "2026-10-06", "19:00", "21:00"), // OP thêm, đã qua
    ses("d", "2026-10-22", "19:00", "21:00", "Upcoming"), // OP thêm, tương lai
    ses("e", "2026-10-22", "19:00", "21:00", "Upcoming"), // trùng đúng giờ với d
    ses("t", "2026-10-06", "19:00", "21:00", "Completed", "TikTok"), // sàn khác — không lẫn
    ses("x", "2026-11-02", "19:00", "21:00") // tháng khác
  ],
  shiftSlots: [
    shift("s1", "2026-10-03", "10:00", "12:00", "finalized", "a"),
    shift("s2", "2026-10-04", "10:00", "12:00", "finalized", "b"),
    shift("s3", "2026-10-20", "10:00", "12:00", "open"),
    shift("o1", "2026-10-27", "09:00", "11:00", "open") // ca OP mở chờ đăng ký, ngoài kế hoạch
  ]
});

describe("collectRebase", () => {
  const set = collectRebase(base());
  const by = (key: string) => set.rows.find((r) => r.key === key)!;

  test("phân loại ca kế hoạch: phiên sống, phiên huỷ, ca mở tương lai, ca đã qua không có gì, ca tương lai chưa mở", () => {
    expect(by("p1").state).toBe("active");
    expect(by("p2").state).toBe("cancelled");
    expect(by("p3").state).toBe("active");
    expect(by("p4").state).toBe("nosession");
    expect(by("p5").state).toBe("active");
    expect(set.futureNoCalendar).toBe(1);
  });

  test("ca OP thêm: phiên đã qua + phiên tương lai + ca mở không phiên; không lấy sàn khác, tháng khác, ca huỷ; trùng giờ chỉ lấy một", () => {
    const added = set.rows.filter((r) => r.source === "added").map((r) => r.key).sort();
    expect(added).toEqual(["add:c", "add:d", "add:o1"]);
    expect(by("add:c").link).toEqual({ sessionId: "c" });
    expect(by("add:o1").link).toEqual({ shiftSlotId: "o1" });
    expect(set.skippedSameTime).toBe(1);
  });

  test("lưới chỉ có ca đã lưu: ca không có id (chỉ trên trình duyệt) bị bỏ qua, phiên của nó rơi vào ca OP thêm", () => {
    const b = base();
    b.planDrafts.push({ key: "new-1", date: "2026-10-06", startTime: "19:00", endTime: "21:00", targetGmv: 0, note: "" });
    const s2 = collectRebase(b);
    expect(s2.rows.some((r) => r.key === "new-1")).toBe(false);
    expect(s2.rows.some((r) => r.key === "add:c")).toBe(true);
  });

  test("ca kế hoạch chưa gắn mà khớp giờ với một phiên trên lịch ⇒ active + gắn phiên đó, phiên không thành ca thêm", () => {
    const b = base();
    b.planDrafts.push(plan("2026-10-06", "19:00", "21:00", 0, "p6"));
    const s2 = collectRebase(b);
    const r = s2.rows.find((x) => x.key === "p6")!;
    expect(r.state).toBe("active");
    expect(r.link).toEqual({ sessionId: "c" });
    expect(s2.rows.some((x) => x.key === "add:c")).toBe(false);
  });

  test("ca thêm trùng giờ với một ca kế hoạch có sẵn thì bỏ qua (kế hoạch không có hai ca cùng giờ)", () => {
    const b = base();
    b.sessions.push(ses("dup", "2026-10-03", "10:00", "12:00", "Completed")); // trùng p1 nhưng là phiên khác
    expect(collectRebase(b).skippedSameTime).toBe(2);
  });

  test("sắp theo ngày + giờ", () => {
    const keys = set.rows.map((r) => `${r.draft.date}|${r.draft.startTime}`);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("buildRebase", () => {
  const set = collectRebase(base());
  const act = activeDrafts(set);
  const after = mergeAllocated(set, allocateDraftTargets(act, 1000, act.map(() => 1), act.map(() => 1)));
  const rb = buildRebase(set, after, TODAY);

  test("Σ target mới = target tháng; ca huỷ / không phiên = 0; ca thêm có target", () => {
    expect(after.reduce((a, d) => a + d.targetGmv, 0)).toBe(1000);
    expect(after[set.rows.findIndex((r) => r.key === "p2")].targetGmv).toBe(0);
    expect(after[set.rows.findIndex((r) => r.key === "p4")].targetGmv).toBe(0);
    expect(rb.newTotal).toBe(1000);
    expect(rb.activeSlots).toBe(6); // p1 p3 p5 + 3 ca thêm (c, d, o1)
  });

  test("đếm: ca đổi, ca đã qua đổi, ca thêm (đã qua), ca về 0, tổng cũ", () => {
    expect(rb.oldTotal).toBe(1000); // 5 ca kế hoạch × 200
    expect(rb.added).toBe(3);
    expect(rb.addedPast).toBe(1);
    expect(rb.zeroed).toBe(2); // p2 (huỷ) + p4 (không phiên)
    expect(rb.items.filter((i) => i.id).length).toBe(rb.changed);
    expect(rb.items.filter((i) => !i.id).length).toBe(3);
  });

  test("ca thêm gửi session_id / shift_slot_id đúng; ca kế hoạch gửi id", () => {
    const addC = rb.items.find((i) => i.session_id === "c");
    const addO = rb.items.find((i) => i.shift_slot_id === "o1");
    expect(addC).toBeTruthy();
    expect(addO).toBeTruthy();
    expect(addC!.id).toBeUndefined();
    expect(rb.items.find((i) => i.id === "p2")).toEqual({ id: "p2", target: 0 });
  });

  test("chia trùng target hiện tại và không có ca nào thêm ⇒ danh sách rỗng", () => {
    const b = base();
    b.sessions = b.sessions.filter((s: { id: string }) => !["c", "d", "e"].includes(s.id));
    b.shiftSlots = b.shiftSlots.filter((s: { id: string }) => s.id !== "o1");
    b.planDrafts = b.planDrafts.filter((d) => ["p1", "p3"].includes(d.id!));
    const s2 = collectRebase(b);
    const a2 = activeDrafts(s2);
    const merged = mergeAllocated(s2, allocateDraftTargets(a2, 400, [1, 1], [1, 1]));
    expect(buildRebase(s2, merged, TODAY).items).toEqual([]);
  });

  test("mergeAllocated từ chối kết quả sai số ca", () => {
    expect(() => mergeAllocated(set, [])).toThrow();
  });
});

describe("target theo nhóm ngày trên ca đã qua", () => {
  test("D-Day (08–09/10, đã qua) nhận đúng số nhóm; ca đã qua đổi được đếm riêng", () => {
    const planDrafts = [plan("2026-10-08", "11:00", "14:00", 0, "a", "sa"), plan("2026-10-09", "19:00", "22:00", 0, "b", "sb"), plan("2026-10-20", "19:00", "22:00", 0, "c", "sc")];
    const set = collectRebase({
      brandId: B, platform: "Shopee", month: "2026-10", today: TODAY, planDrafts,
      sessions: [ses("sa1", "2026-10-08", "11:00", "14:00"), ses("sb1", "2026-10-09", "19:00", "22:00")],
      shiftSlots: [shift("sa", "2026-10-08", "11:00", "14:00", "finalized", "sa1"), shift("sb", "2026-10-09", "19:00", "22:00", "finalized", "sb1"), shift("sc", "2026-10-20", "19:00", "22:00", "open")]
    });
    const act = activeDrafts(set);
    const after = mergeAllocated(set, allocateDraftTargets(act, 1000, [1, 1, 1], [1, 1, 1], { bucketOf: (d) => resolveCampBucketType(d), targets: { dday: 700 } }));
    const rb = buildRebase(set, after, TODAY);
    expect(rb.items.filter((i) => i.id !== "c").reduce((x, i) => x + i.target, 0)).toBe(700);
    expect(rb.newTotal).toBe(1000);
    expect(rb.pastChanged).toBe(2);
  });
});
