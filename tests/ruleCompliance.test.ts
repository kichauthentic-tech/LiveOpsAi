// Đợt 3: đo tuân thủ luật Tự fill trên lịch thật + giờ cam kết vs thực tế. Chạy: npx vitest run tests/ruleCompliance.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const C = await import("../src/lib/roster/ruleCompliance");
const { DEFAULT_ENGINE_PARAMS } = await import("../src/lib/scheduling/engineParams");
import type { LiveSession, Talent } from "../src/types";

const tal = (id: string, role: Talent["role"], rate: number, gender = "Nữ"): Talent =>
  ({ id, name: id, nickname: id, role, gender, ratePerHour: rate, assistantRatePerHour: role === "Assistant" ? rate : 0, ratePerSession: 0 }) as Talent;
const ses = (id: string, date: string, o: Partial<LiveSession> = {}): LiveSession =>
  ({ id, brandId: "b1", platform: "TikTok", date, startTime: "19:00", endTime: "22:00", status: "Completed", hostId: "h", ...o }) as LiveSession;
const base = {
  month: "2026-11",
  history: [],
  brandNames: new Map([["b1", "NIKE"], ["cr", "CROCS"]]),
  params: DEFAULT_ENGINE_PARAMS,
  lateEnd: "23:00",
  caps: {}
};
const line = (r: ReturnType<typeof C.buildComplianceReport>, id: string) => r.lines.find((l) => l.id === id)!;

describe("endsLate", () => {
  test("qua nửa đêm hoặc kết thúc từ giờ khuya", () => {
    expect(C.endsLate("21:00", "00:30", "23:00")).toBe(true);
    expect(C.endsLate("20:00", "23:00", "23:00")).toBe(true);
    expect(C.endsLate("19:00", "22:00", "23:00")).toBe(false);
  });
});

describe("buildComplianceReport", () => {
  test("cast: ca Daily TikTok đo theo trần 150K, ca Shopee theo trần 200K; thiếu rate không tính vào mẫu số", () => {
    const talents = [tal("h", "Host", 120000), tal("exp", "Host", 260000), tal("noRate", "Host", 0)];
    const sessions = [
      ses("1", "2026-11-03"), // Daily TikTok, 120K ⇒ đạt, 3h
      ses("2", "2026-11-04", { hostId: "exp" }), // 260K ⇒ vượt, 3h
      ses("3", "2026-11-05", { hostId: "noRate" }), // chưa có rate ⇒ không đo
      ses("4", "2026-11-06", { platform: "Shopee", hostId: "h" }), // Shopee 120K ⇒ đạt
      ses("5", "2026-11-10", { hostId: "exp" }) // D-Day ⇒ ca camp, không áp trần TikTok
    ];
    const r = C.buildComplianceReport({ ...base, sessions, talents });
    expect(line(r, "cast_tiktok_regular")).toMatchObject({ hours: 6, okHours: 3, unknownHours: 3 });
    expect(line(r, "cast_shopee")).toMatchObject({ hours: 3, okHours: 3 });
  });

  test("trợ nam: Franklin/CROCS và ca đêm; chưa có giới tính thì không đo", () => {
    const talents = [tal("h", "Host", 100000), tal("nam", "Assistant", 50000, "Nam"), tal("nữ", "Assistant", 50000, "Nữ"), tal("rỗng", "Assistant", 50000, "")];
    const sessions = [
      ses("1", "2026-11-03", { brandId: "cr", coHostId: "nam" }),
      ses("2", "2026-11-04", { brandId: "cr", coHostId: "nữ" }),
      ses("3", "2026-11-05", { brandId: "cr", coHostId: "rỗng" }),
      ses("4", "2026-11-06", { startTime: "20:00", endTime: "23:30", coHostId: "nữ" }),
      ses("5", "2026-11-07", { startTime: "20:00", endTime: "23:30", coHostId: "nam" })
    ];
    const r = C.buildComplianceReport({ ...base, sessions, talents });
    expect(line(r, "male_sport")).toMatchObject({ hours: 6, okHours: 3, unknownHours: 3 });
    expect(line(r, "male_night")).toMatchObject({ hours: 7, okHours: 3.5 });
  });

  test("cam kết vs thực tế: giờ cả tháng, giờ nửa đầu, trần nửa đầu tự tính theo tỷ lệ giờ ca", () => {
    const talents = [tal("h", "Host", 100000)];
    // 3 ca nửa đầu + 3 ca nửa sau, mỗi ca 3h ⇒ nửa đầu = 50% giờ tháng.
    const sessions = [2, 3, 4, 17, 18, 19].map((d) => ses(`s${d}`, `2026-11-${String(d).padStart(2, "0")}`));
    const r = C.buildComplianceReport({ ...base, sessions, talents, caps: { h: { monthMax: 12, note: "camp" } } });
    expect(r.people).toHaveLength(1);
    expect(r.people[0]).toMatchObject({ cap: 12, actual: 18, actualHalf: 9, note: "camp" });
    expect(r.people[0].halfCap).toBeCloseTo(12 * 0.5 * 1.1, 6);
    expect(C.buildComplianceReport({ ...base, sessions, talents, caps: { h: { monthMax: 12, firstHalfMax: 4 } } }).people[0].halfCap).toBe(4);
  });

  test("ca huỷ và ca chia đoạn người không tính; PFM chỉ dùng dữ liệu trước tháng", () => {
    const mk = (id: string, host: string, date: string, gmv: number) => ses(id, date, { hostId: host, actualGmv: gmv });
    const sessions = [
      ...Array.from({ length: 6 }, (_, i) => mk(`a${i}`, "avg", "2026-10-10", 3_000_000)),
      ...Array.from({ length: 6 }, (_, i) => mk(`s${i}`, "star", "2026-10-12", 6_000_000)),
      ses("c", "2026-11-03", { status: "Cancelled" }),
      ses("seg", "2026-11-04", { staffSegments: [{ role: "host" }] as never }),
      ses("ok", "2026-11-05", { hostId: "star", actualGmv: 1 })
    ];
    const r = C.buildComplianceReport({ ...base, sessions, talents: [tal("avg", "Host", 100000), tal("star", "Host", 100000), tal("h", "Host", 100000)] });
    expect(r.totalHours).toBe(3);
    expect(r.perf.regular).toBeGreaterThan(1);
  });
});
