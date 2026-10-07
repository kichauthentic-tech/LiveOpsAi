// Kế hoạch Affiliate (migration 0155) — phần thuần: suy cột tự tính, đọc ô dán từ sheet, khớp phiên file ↔ kế hoạch.
// Số liệu lấy từ bản sheet T10/2026 của ops (CROCS) và 4 phiên T9 đang có trong app.
import { describe, expect, test } from "vitest";
import {
  dayLabelOf,
  defaultAffiliatePlanMonth,
  defaultBudgetRate,
  normalizeCampName,
  parseDayLabel,
  parsePlanPaste,
  parsePlanTimeline,
  parseVnNumber,
  planBudget,
  planGmvPerHour,
  planHours,
  planTotals,
  suggestCampName,
  toUsd,
  DEFAULT_FX_RATE
} from "../src/lib/affiliate/plan";
import { matchPlanToSessions, sameCreator } from "../src/lib/affiliate/planMatch";

// Bản sheet T10 của ops, dán nguyên từ Google Sheet (Tab giữa các ô).
const SHEET = [
  "OCT\tCROCS",
  "Lịch live\tCreator\tCamp Name\tTimeline\tDuration\tTarget GMV (VNĐ)\tGMV/hour\tĐơn vị $\tBudget Ads\tNote",
  "09/10/2026\tKhói\tD - Day\t10h - 18h\t8\t700.000.000\t87.500.000\t$26.616\t24.500.000\t",
  "14/10/2026\tLong Pham\tMid-Month\t20h - 00h\t4\t100.000.000\t25.000.000\t$3.802\t3.000.000\t",
  "15/10/2026\tMạnh Ka\tMid-Month\t19h - 24h\t5\t150.000.000\t30.000.000\t$5.703\t4.500.000\t",
  "25/10/2026\tMạnh Ka\tPay - Day\t19h - 24h\t5\t150.000.000\t30.000.000\t$5.703\t4.500.000\t",
  "\t\t\tTotal\t\t1.100.000.000\t\t\t36.500.000\t"
].join("\n");

describe("timeline → giờ", () => {
  test.each([
    ["10h - 18h", 8],
    ["20h - 00h", 4],
    ["19h - 24h", 5],
    ["19h-23h", 4],
    ["10:15 - 18:00", 7.8],
    ["19h20 - 23h42", 4.4]
  ])("%s = %s giờ", (label, hours) => {
    expect(parsePlanTimeline(label)?.hours).toBe(hours);
  });
  test("không đọc được", () => {
    expect(parsePlanTimeline("cả ngày")).toBeNull();
    expect(parsePlanTimeline("")).toBeNull();
    expect(parsePlanTimeline("25h - 30h")).toBeNull();
  });
});

describe("cột tự tính khớp đúng sheet của ops", () => {
  const rows = parsePlanPaste(SHEET);
  test("4 dòng, tổng khớp dòng Total của sheet", () => {
    expect(rows).toHaveLength(4);
    const t = planTotals(rows.map((r) => ({ ...r, status: "planned" as const })));
    expect(t.target).toBe(1_100_000_000);
    expect(t.hours).toBe(22);
    // Budget Ads sheet: 24,5tr + 3tr + 4,5tr + 4,5tr = 36,5tr — chính là 3,5% D-Day + 3% còn lại.
    expect(t.budgetAds).toBe(36_500_000);
  });
  test("GMV/hour = Target ÷ Duration (87,5tr / 25tr / 30tr)", () => {
    expect(rows.map((r) => planGmvPerHour(r))).toEqual([87_500_000, 25_000_000, 30_000_000, 30_000_000]);
  });
  test("$ = Target ÷ 26.300 làm tròn khớp sheet ($26.616 / $3.802 / $5.703)", () => {
    expect(rows.map((r) => Math.round(toUsd(r.targetGmv, DEFAULT_FX_RATE)!))).toEqual([26616, 3802, 5703, 5703]);
  });
  test("Budget Ads mặc định D-Day 3,5%, còn lại 3%", () => {
    expect(defaultBudgetRate("D-Day")).toBe(0.035);
    expect(defaultBudgetRate("Pay Day")).toBe(0.03);
    expect(planBudget({ targetGmv: 700_000_000, campName: "D-Day" })).toBe(24_500_000);
    expect(planBudget({ targetGmv: 100_000_000, campName: "Mid-Month" })).toBe(3_000_000);
    // ops gõ đè thì dùng số gõ
    expect(planBudget({ targetGmv: 100_000_000, campName: "Mid-Month", planBudgetAds: 5_000_000 })).toBe(5_000_000);
  });
  test("giờ gõ đè thắng giờ suy từ timeline", () => {
    expect(planHours({ planTimelineLabel: "10h - 18h" })).toBe(8);
    expect(planHours({ planTimelineLabel: "10h - 18h", planDurationHours: 7 })).toBe(7);
    expect(planHours({})).toBeUndefined();
  });
  test("phiên huỷ không vào tổng", () => {
    const t = planTotals([{ targetGmv: 100, planTimelineLabel: "10h - 12h", status: "cancelled" }, { targetGmv: 50, status: "planned" }]);
    expect(t.sessions).toBe(1);
    expect(t.target).toBe(50);
  });
});

describe("đọc ô dán từ Google Sheet", () => {
  const rows = parsePlanPaste(SHEET);
  test("bỏ dòng tiêu đề và dòng Total", () => {
    expect(rows.map((r) => r.date)).toEqual(["2026-10-09", "2026-10-14", "2026-10-15", "2026-10-25"]);
  });
  test("chuẩn hoá tên camp ('D - Day' → 'D-Day', 'Pay - Day' → 'Pay Day' như tên chuẩn của app)", () => {
    expect(rows.map((r) => r.campName)).toEqual(["D-Day", "Mid-Month", "Mid-Month", "Pay Day"]);
  });
  test("đọc creator, timeline, duration, target, budget", () => {
    expect(rows[0]).toMatchObject({
      creatorName: "Khói",
      planTimelineLabel: "10h - 18h",
      planDurationHours: 8,
      targetGmv: 700_000_000,
      planBudgetAds: 24_500_000
    });
  });
  test("bản dán chỉ có 5 cột nhập tay (không GMV/hour, $, Budget) vẫn đọc được", () => {
    const r = parsePlanPaste("30/10/2026\tLinh Ân\tPay - Day\t19h - 23h\t80.000.000");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ creatorName: "Linh Ân", planTimelineLabel: "19h - 23h", targetGmv: 80_000_000 });
    expect(r[0].planDurationHours).toBeUndefined();
    expect(r[0].planBudgetAds).toBeUndefined();
  });
  test("ghi chú ở cuối dòng", () => {
    const r = parsePlanPaste("09/10/2026\tKhói\tD-Day\t10h - 18h\t8\t700.000.000\t87.500.000\t$26.616\t24.500.000\tSale lớn");
    expect(r[0].note).toBe("Sale lớn");
  });
  test("phân tách bằng nhiều dấu cách (copy từ chỗ khác không có Tab)", () => {
    const r = parsePlanPaste("09/10/2026   Khói   D-Day   10h - 18h   8   700.000.000");
    expect(r[0]).toMatchObject({ creatorName: "Khói", planDurationHours: 8, targetGmv: 700_000_000 });
  });
});

describe("tiện ích ngày/số/camp", () => {
  test("ngày", () => {
    expect(parseDayLabel("9/10/2026")).toBe("2026-10-09");
    expect(parseDayLabel("09/10/2026")).toBe("2026-10-09");
    expect(parseDayLabel("2026-10-09")).toBe("2026-10-09");
    expect(parseDayLabel("31/02/2026")).toBeNull();
    expect(parseDayLabel("abc")).toBeNull();
    expect(dayLabelOf("2026-10-09")).toBe("9/10/2026");
  });
  test("số kiểu Việt", () => {
    expect(parseVnNumber("700.000.000")).toBe(700_000_000);
    expect(parseVnNumber("$26.616")).toBe(26616);
    expect(parseVnNumber("3,5")).toBe(3.5);
    expect(parseVnNumber("7.5")).toBe(7.5);
    expect(parseVnNumber("Total")).toBeNaN();
  });
  test("tên camp", () => {
    expect(normalizeCampName("D - Day")).toBe("D-Day");
    expect(normalizeCampName("mid month")).toBe("Mid-Month");
    expect(normalizeCampName("Pay Day")).toBe("Pay Day");
    expect(normalizeCampName("Pay-Day")).toBe("Pay Day");
    expect(normalizeCampName("Pay - Day")).toBe("Pay Day");
    expect(normalizeCampName("Big")).toBeUndefined();
  });
  test("camp gợi ý theo ngày: các ngày camp T10 trong sheet", () => {
    expect(suggestCampName("2026-10-09")).toBe("D-Day"); // D-Day 10/10 kéo dài 8–10
    expect(suggestCampName("2026-10-14")).toBe("Mid-Month");
    expect(suggestCampName("2026-10-15")).toBe("Mid-Month");
    expect(suggestCampName("2026-10-25")).toBe("Pay Day");
    expect(suggestCampName("2026-10-20")).toBe("Daily");
  });
  test("camp gợi ý theo khoảng ngày riêng của Kế Hoạch Tháng thay lịch cố định", () => {
    const ov = { midmonth: { start: "2026-10-16", end: "2026-10-18" } };
    expect(suggestCampName("2026-10-14", ov)).toBe("Daily");
    expect(suggestCampName("2026-10-17", ov)).toBe("Mid-Month");
  });
  test("tháng mở sẵn: từ ngày 20 là lập kế hoạch tháng sau", () => {
    expect(defaultAffiliatePlanMonth("2026-10-08")).toBe("2026-10");
    expect(defaultAffiliatePlanMonth("2026-10-19")).toBe("2026-10");
    expect(defaultAffiliatePlanMonth("2026-10-20")).toBe("2026-11");
    expect(defaultAffiliatePlanMonth("2026-12-25")).toBe("2027-01");
  });
});

describe("khớp phiên file với kế hoạch", () => {
  test("tên ngắn khớp tên dài, không phân biệt dấu/hoa thường", () => {
    expect(sameCreator("Khói", "Kiot Khói")).toBe(true);
    expect(sameCreator("Mạnh Ka", "Mạnh Ka - Giày Thể Thao Crocs")).toBe(true);
    expect(sameCreator("manh ka", "MẠNH KA")).toBe(true);
    expect(sameCreator("Linh Ân", "Linh Chi")).toBe(false);
    expect(sameCreator("", "Khói")).toBe(false);
    expect(sameCreator("Long Pham", "Mạnh Ka")).toBe(false);
  });

  const planned = [
    { key: "p1", date: "2026-10-09", creatorName: "Khói", planTimelineLabel: "10h - 18h" },
    { key: "p2", date: "2026-10-14", creatorName: "Long Pham", planTimelineLabel: "20h - 00h" },
    { key: "p3", date: "2026-10-15", creatorName: "Mạnh Ka", planTimelineLabel: "19h - 24h" }
  ];
  const sessions = [
    { key: "s1", date: "2026-10-09", creatorName: "Kiot Khói", timelineLabel: "10:15 - 18:00" },
    { key: "s2", date: "2026-10-14", creatorName: "Long Pham", timelineLabel: "20:05 - 00:10" },
    { key: "s3", date: "2026-10-17", creatorName: "Linh Ân", timelineLabel: "19:06 - 23:41" }
  ];

  test("ghép đúng cặp, nêu phiên ngoài kế hoạch và kế hoạch không có phiên", () => {
    const r = matchPlanToSessions(planned, sessions);
    expect(r.pairs).toEqual([
      { planKey: "p2", sessionKey: "s2", startDiffMin: 5 },
      { planKey: "p1", sessionKey: "s1", startDiffMin: 15 }
    ]);
    expect(r.unplannedSessions).toEqual(["s3"]);
    expect(r.unmatchedPlans).toEqual(["p3"]);
  });
  test("khác ngày thì không ghép dù cùng creator", () => {
    const r = matchPlanToSessions([planned[0]], [{ ...sessions[0], date: "2026-10-10" }]);
    expect(r.pairs).toEqual([]);
    expect(r.unplannedSessions).toEqual(["s1"]);
  });
  test("cùng creator hai phiên một ngày: ghép theo giờ gần nhất, không ghép chéo", () => {
    const r = matchPlanToSessions(
      [
        { key: "a", date: "2026-10-09", creatorName: "Khói", planTimelineLabel: "10h - 14h" },
        { key: "b", date: "2026-10-09", creatorName: "Khói", planTimelineLabel: "19h - 23h" }
      ],
      [
        { key: "x", date: "2026-10-09", creatorName: "Kiot Khói", timelineLabel: "19:10 - 23:00" },
        { key: "y", date: "2026-10-09", creatorName: "Kiot Khói", timelineLabel: "10:00 - 14:05" }
      ]
    );
    expect(Object.fromEntries(r.pairs.map((p) => [p.planKey, p.sessionKey]))).toEqual({ a: "y", b: "x" });
  });
  test("hai creator trùng từ cùng ngày: giờ phân xử", () => {
    const r = matchPlanToSessions(
      [{ key: "a", date: "2026-10-09", creatorName: "Linh", planTimelineLabel: "19h - 23h" }],
      [
        { key: "chi", date: "2026-10-09", creatorName: "Linh Chi", timelineLabel: "10:00 - 12:00" },
        { key: "an", date: "2026-10-09", creatorName: "Linh Ân", timelineLabel: "19:06 - 23:41" }
      ]
    );
    expect(r.pairs).toEqual([{ planKey: "a", sessionKey: "an", startDiffMin: 6 }]);
    expect(r.unplannedSessions).toEqual(["chi"]);
  });
  test("thiếu giờ ở một bên vẫn khớp theo ngày + creator", () => {
    const r = matchPlanToSessions([{ key: "a", date: "2026-10-09", creatorName: "Khói" }], [sessions[0]]);
    expect(r.pairs).toEqual([{ planKey: "a", sessionKey: "s1", startDiffMin: null }]);
  });
  test("khớp theo nickname khi tên creator của file khác hẳn", () => {
    const r = matchPlanToSessions(
      [{ key: "a", date: "2026-10-09", creatorName: "kiotkhoi" }],
      [{ key: "s", date: "2026-10-09", creatorName: "Khói Kiot Official", nickname: "kiotkhoi", timelineLabel: "10:00 - 12:00" }]
    );
    expect(r.pairs).toHaveLength(1);
  });
});
