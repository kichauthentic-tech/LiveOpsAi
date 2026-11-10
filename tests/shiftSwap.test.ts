// Đổi ca / nhường ca giữa talent (migration 0212): bản client của luật DB. Kịch bản lấy từ lịch 10–15/11 (Hùng, Henry, Thy, Dung).
// Chạy: npx vitest run tests/shiftSwap.test.ts
import { describe, expect, test } from "vitest";
import { applySwap, bestPartHint, holdRole, movePart, passReceivers, swapPeople, swapWith, swapProblems, type SwapPart } from "../src/lib/shiftSwap/swap";
import { findPersonClashes } from "../src/lib/scheduling/conflicts";
import type { LiveSession, Talent } from "../src/types";

const NAMES: Record<string, string> = { hung: "Hùng", henry: "Henry", thy: "Thy", dung: "Dung" };
const nameOf = (id: string) => NAMES[id] ?? id;
const NOW = Date.parse("2026-11-10T10:00:00+07:00");
const opts = { nowMs: NOW, nameOf };

const ca = (id: string, o: Partial<LiveSession> & { hostId: string; date: string; startTime: string; endTime: string; brandName: string }): LiveSession =>
  ({ id, platform: "TikTok", status: "Upcoming", hostName: nameOf(o.hostId), coHostName: "", ...o }) as LiveSession;

const croc = ca("croc", { brandName: "CROCS", date: "2026-11-12", startTime: "15:00", endTime: "19:00", hostId: "hung" });
const vera = ca("vera", { brandName: "VERA", date: "2026-11-12", startTime: "17:00", endTime: "20:00", hostId: "thy" });
const fran = ca("fran", { brandName: "Franklin", platform: "Shopee", date: "2026-11-12", startTime: "18:30", endTime: "20:30", hostId: "henry" });
const v2s = ca("v2s", { brandName: "VERA", platform: "Shopee", date: "2026-11-14", startTime: "10:00", endTime: "13:00", hostId: "hung" });
const v2t = ca("v2t", { brandName: "VERA", date: "2026-11-14", startTime: "10:00", endTime: "13:00", hostId: "dung" });
const soon = ca("soon", { brandName: "CROCS", date: "2026-11-10", startTime: "20:00", endTime: "22:00", hostId: "hung" });
const all = [croc, vera, fran, v2s, v2t, soon];
const whole = (s: LiveSession, dur: number): SwapPart => ({ sessionId: s.id, fromMin: 0, toMin: dur });
const pass = (to: string, give: SwapPart) => ({ kind: "pass" as const, fromTalent: "hung", toTalent: to, give });

describe("nhường ca — một luật: không phát sinh chồng giờ mới", () => {
  test("nhường CẢ ca cho người đang có ca chồng ⇒ chặn; người rảnh ⇒ qua", () => {
    expect(swapProblems(all, pass("thy", whole(croc, 240)), opts)[0]).toMatch(/Thy trùng ca VERA/);
    expect(swapProblems(all, pass("henry", whole(croc, 240)), opts)[0]).toMatch(/Henry trùng ca Franklin/);
    expect(swapProblems(all, pass("dung", whole(croc, 240)), opts)).toEqual([]);
  });

  test("nhường MỘT đoạn 15:00–17:00 cho Thy hoặc Henry thì không chồng ⇒ qua", () => {
    expect(swapProblems(all, pass("thy", { sessionId: "croc", fromMin: 0, toMin: 120 }), opts)).toEqual([]);
    expect(swapProblems(all, pass("henry", { sessionId: "croc", fromMin: 0, toMin: 120 }), opts)).toEqual([]);
  });

  test("gợi ý: cả ca bị chặn thì đề nghị đoạn dài nhất nhận được (15:00–17:00 = 0–120 phút)", () => {
    expect(bestPartHint(all, "hung", "thy", whole(croc, 240), opts)).toEqual({ fromMin: 0, toMin: 120 });
    expect(bestPartHint(all, "hung", "henry", whole(croc, 240), opts)).toEqual({ fromMin: 0, toMin: 210 });
  });

  test("danh sách người nhận: ok / lý do + gợi ý", () => {
    const talents = ["hung", "henry", "thy", "dung"].map((id) => ({ id, name: nameOf(id) }) as Talent);
    const r = passReceivers(all, "hung", whole(croc, 240), talents, opts);
    expect(r.find((x) => x.talentId === "dung")?.ok).toBe(true);
    expect(r.find((x) => x.talentId === "thy")).toMatchObject({ ok: false, hint: { fromMin: 0, toMin: 120 } });
    expect(r.find((x) => x.talentId === "hung")).toBeUndefined();
  });

  test("dưới 24 giờ ⇒ chặn, đổi sang 'Tôi không đi được ca này'", () => {
    expect(swapProblems(all, pass("dung", whole(soon, 120)), opts)[0]).toMatch(/dưới 24 giờ/);
  });

  test("người giao không giữ đoạn đó ⇒ chặn", () => {
    expect(swapProblems(all, { kind: "pass", fromTalent: "thy", toTalent: "dung", give: whole(croc, 240) }, opts)[0]).toMatch(/không còn giữ/);
  });

  test("ca huỷ ⇒ chặn; chồng giờ có sẵn từ trước KHÔNG bị tính", () => {
    expect(swapProblems([{ ...croc, status: "Cancelled" }, ...all.slice(1)], pass("dung", whole(croc, 240)), opts)).toEqual(["Ca đã huỷ."]);
    // Dung vốn đã đứng hai ca chồng nhau; nhận thêm ca KHÔNG chồng không làm tăng số cặp chồng.
    const dungA = ca("dA", { brandName: "X", date: "2026-11-13", startTime: "10:00", endTime: "12:00", hostId: "dung" });
    const dungB = ca("dB", { brandName: "Y", date: "2026-11-13", startTime: "11:00", endTime: "13:00", hostId: "dung" });
    expect(swapProblems([...all, dungA, dungB], pass("dung", whole(croc, 240)), opts)).toEqual([]);
  });
});

describe("nhường một đoạn — ghi đoạn giờ", () => {
  test("nhường 15:00–17:00 cho Thy: Thy 0–120, Hùng 120–240, người chính vẫn Hùng khi hai bên bằng nhau", () => {
    const r = applySwap(all, pass("thy", { sessionId: "croc", fromMin: 0, toMin: 120 }), nameOf);
    if ("error" in r) throw new Error(r.error);
    const next = r.sessions.find((s) => s.id === "croc")!;
    expect(next.staffSegments?.map((g) => [g.talentId, g.fromMin, g.toMin])).toEqual([["thy", 0, 120], ["hung", 120, 240]]);
    expect(findPersonClashes(r.sessions).filter((c) => c.talentId === "thy")).toEqual([]);
  });

  test("nhường cả ca không tạo đoạn, chỉ đổi host", () => {
    const r = applySwap(all, pass("dung", whole(croc, 240)), nameOf);
    if ("error" in r) throw new Error(r.error);
    const next = r.sessions.find((s) => s.id === "croc")!;
    expect(next.hostId).toBe("dung");
    expect(next.staffSegments).toEqual([]);
  });

  test("nhường lần hai: đoạn của người nhận gộp khi liền nhau; quá 3 đoạn thì từ chối", () => {
    const a = movePart(croc, "hung", "thy", 0, 60, nameOf);
    if ("error" in a) throw new Error(a.error);
    const b = movePart(a.session, "hung", "thy", 60, 120, nameOf);
    if ("error" in b) throw new Error(b.error);
    expect(b.session.staffSegments?.map((g) => [g.talentId, g.fromMin, g.toMin])).toEqual([["thy", 0, 120], ["hung", 120, 240]]);
    // 3 đoạn: thy 0–60, hung 60–120, dung 120–180, hung 180–240 = 4 đoạn ⇒ từ chối.
    const c = movePart(croc, "hung", "thy", 0, 60, nameOf);
    if ("error" in c) throw new Error(c.error);
    const d = movePart(c.session, "hung", "dung", 120, 180, nameOf);
    expect("error" in d).toBe(true);
  });

  test("holdRole: người nhận vừa nhận đoạn thì giữ trọn đoạn đó", () => {
    const a = movePart(croc, "hung", "thy", 0, 120, nameOf);
    if ("error" in a) throw new Error(a.error);
    expect(holdRole(a.session, "thy", 0, 120)).toBe("host");
    expect(holdRole(a.session, "hung", 0, 120)).toBeNull();
    expect(holdRole(a.session, "hung", 120, 240)).toBe("host");
  });
});

describe("đổi ca (swap)", () => {
  const swap = { kind: "swap" as const, fromTalent: "hung", toTalent: "dung", give: whole(v2s, 180), take: whole(v2t, 180) };

  test("hai ca cùng giờ đổi cho nhau: từng bước riêng sẽ chồng nhưng đổi cùng lúc thì không ⇒ qua", () => {
    expect(swapProblems(all, swap, opts)).toEqual([]);
    const r = applySwap(all, swap, nameOf);
    if ("error" in r) throw new Error(r.error);
    expect(r.sessions.find((s) => s.id === "v2s")?.hostId).toBe("dung");
    expect(r.sessions.find((s) => s.id === "v2t")?.hostId).toBe("hung");
  });

  test("đổi mà một bên bị chồng giờ ⇒ chặn", () => {
    expect(swapProblems(all, { kind: "swap", fromTalent: "hung", toTalent: "thy", give: whole(croc, 240), take: whole(vera, 180) }, opts)).toEqual([]);
    // Hùng đưa croc (15–19) lấy fran của Henry (18:30–20:30): Hùng hết croc nên không chồng; Henry có croc 15–19 chồng với… chính fran của mình (đã đưa đi) ⇒ qua.
    expect(swapProblems(all, { kind: "swap", fromTalent: "hung", toTalent: "henry", give: whole(croc, 240), take: whole(fran, 120) }, opts)).toEqual([]);
    // Thy giữ vera 17–20; Hùng đưa v2s (14/11) lấy fran: Thy không dính, Hùng nhận fran 18:30–20:30 chồng croc (Hùng vẫn giữ croc) ⇒ chặn.
    const bad = swapProblems(all, { kind: "swap", fromTalent: "hung", toTalent: "henry", give: whole(v2s, 180), take: whole(fran, 120) }, opts);
    expect(bad[0]).toMatch(/Hùng trùng ca CROCS/);
  });

  test("chọn người trước: Dung có ca đổi được; ca < 24 giờ và ca của chính mình không có mặt", () => {
    const talents = ["hung", "henry", "thy", "dung"].map((id) => ({ id, name: nameOf(id) }) as Talent);
    const c = swapWith(all, "hung", whole(v2s, 180), "dung", opts);
    expect(c.map((x) => x.take.sessionId)).toEqual(["v2t"]);
    expect(swapWith(all, "hung", whole(v2s, 180), "hung", opts)).toEqual([]);
    expect(swapPeople(all, "hung", whole(v2s, 180), talents, opts).map((x) => x.talentId)).toContain("dung");
    expect(swapPeople(all, "hung", whole(v2s, 180), talents, opts).flatMap((x) => swapWith(all, "hung", whole(v2s, 180), x.talentId, opts)).map((x) => x.take.sessionId)).not.toContain("soon");
  });
});

describe("vòng xoay 3 người", () => {
  // Hùng giữ p 10:00–12:30, Thy giữ q 11:00–13:00, Dung giữ r 12:00–14:00; mỗi người nhường cho người kế tiếp.
  const p = ca("p", { brandName: "VERA", date: "2026-11-14", startTime: "10:00", endTime: "12:30", hostId: "hung" });
  const q = ca("q", { brandName: "VERA", date: "2026-11-14", startTime: "11:00", endTime: "13:00", hostId: "thy" });
  const r = ca("r", { brandName: "VERA", date: "2026-11-14", startTime: "12:00", endTime: "14:00", hostId: "dung" });
  const ring = [p, q, r];

  test("từng bước nhường riêng đều bị chặn (mỗi bước tạo chồng giờ cho người nhận)", () => {
    expect(swapProblems(ring, { kind: "pass", fromTalent: "hung", toTalent: "thy", give: whole(p, 150) }, opts)).not.toEqual([]);
    expect(swapProblems(ring, { kind: "pass", fromTalent: "thy", toTalent: "dung", give: whole(q, 120) }, opts)).not.toEqual([]);
    expect(swapProblems(ring, { kind: "pass", fromTalent: "dung", toTalent: "hung", give: whole(r, 120) }, opts)).not.toEqual([]);
  });

  test("hai yêu cầu cùng chờ: duyệt cái đầu thì cái sau (kiểm lại trên lịch mới) bị chặn", () => {
    const x = ca("x", { brandName: "VERA", date: "2026-11-14", startTime: "10:00", endTime: "12:00", hostId: "hung" });
    const y = ca("y", { brandName: "VERA", date: "2026-11-14", startTime: "11:00", endTime: "13:00", hostId: "thy" });
    const base = [x, y];
    const r1 = pass("dung", whole(x, 120));
    const r2 = { kind: "pass" as const, fromTalent: "thy", toTalent: "dung", give: whole(y, 120) };
    expect(swapProblems(base, r1, opts)).toEqual([]);
    expect(swapProblems(base, r2, opts)).toEqual([]);
    const after = applySwap(base, r1, nameOf);
    if ("error" in after) throw new Error(after.error);
    expect(swapProblems(after.sessions, r2, opts)[0]).toMatch(/Dung trùng ca/);
  });
});
