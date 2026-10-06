// LUẬT CỨNG (user chốt 07/10/2026): KHÔNG BAO GIỜ cộng, gộp, lấy trung bình hay xếp hạng gộp chỉ số HIỆU SUẤT (GMV, target GMV,
// đơn, view, GMV/giờ, mọi tỷ lệ) giữa TikTok và Shopee. Số vận hành (ca, giờ, người) và tiền của agency thì cộng được.
// File này canh luật bằng (1) test hành vi ở các chỗ từng vi phạm và (2) bộ quét src/: phép cộng số hiệu suất viết tay chỉ
// được nằm trong file đã duyệt là "nhận ca một sàn"; file mới muốn cộng thì dùng lib/platforms/perf.ts (sumByPlatform).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import { suggestHosts } from "../src/lib/performance/hostSuggestion";
import { computeTalentBrandPerf, computeTalentRealTotals } from "../src/lib/metrics/avgGmv";
import { assertOnePlatform, platformsWithValue, sumByPlatform, sumGmvByPlatform } from "../src/lib/platforms/perf";
import { keyMetricsOfSessions } from "../src/lib/report/keyMetrics";
import type { LiveSession } from "../src/types";

const ca = (id: string, hostId: string, platform: "TikTok" | "Shopee", gmv: number, extra: Partial<LiveSession> = {}): LiveSession =>
  ({
    id, title: id, brandId: "vera", brandName: "VERA", shopTikTokHandle: "", monthPublished: true, studioId: "", studioName: "",
    hostId, hostName: hostId, assistantName: "", coHostName: "", platform, date: "2026-09-10", startTime: "09:00", endTime: "12:00",
    status: "Completed", targetGmv: 0, actualGmv: gmv, totalOrders: 0, avgWatchTimeSeconds: 0, peakViewers: 0, totalViews: 0, ctrAvg: 0, cvrAvg: 0,
    dataSource: "manual", ...extra
  }) as LiveSession;

const names = new Map([["A", "A"], ["D", "D"]]);
const slotTikTok = { date: "2026-10-12", startTime: "09:00", endTime: "12:00", platform: "TikTok" as const };

describe("gợi ý host chỉ tính GMV/giờ trong đúng sàn của ca", () => {
  // Mô phỏng số đo VERA 07/10: host A mạnh nhờ ca Shopee (sàn bán ~1,66x), host D mạnh hơn ở TikTok.
  const tiktok = [ca("t1", "A", "TikTok", 6_786_000), ca("t2", "D", "TikTok", 7_896_000)];
  const shopee = [ca("s1", "A", "Shopee", 13_098_000), ca("s2", "A", "Shopee", 13_098_000)];

  test("ca TikTok: D (2,63M/giờ TikTok) đứng trên A (2,26M/giờ TikTok)", () => {
    const r = suggestHosts(["A", "D"], names, tiktok, "vera", 1, undefined, slotTikTok);
    expect(r.map((x) => x.talentId)).toEqual(["D", "A"]);
  });
  test("thêm ca Shopee của A không làm đổi thứ hạng cho ca TikTok", () => {
    const r = suggestHosts(["A", "D"], names, [...tiktok, ...shopee], "vera", 1, undefined, slotTikTok);
    expect(r.map((x) => x.talentId)).toEqual(["D", "A"]);
    expect(r.find((x) => x.talentId === "A")!.brandSessions).toBe(1);
    expect(r[0].platform).toBe("TikTok");
  });
  test("mệt mỏi / công bằng vẫn đếm ca mọi sàn: một người là một người", () => {
    const upcoming = ca("s3", "A", "Shopee", 0, { date: "2026-10-13", status: "Upcoming" });
    const r = suggestHosts(["A", "D"], names, [...tiktok, upcoming], "vera", 1, undefined, slotTikTok);
    expect(r.find((x) => x.talentId === "A")!.weekHours).toBe(3);
  });
});

describe("Talent Pool / Hồ Sơ: GMV tách theo sàn, không có tổng gộp", () => {
  const rows = [ca("t1", "A", "TikTok", 30e6), ca("s1", "A", "Shopee", 50e6)];
  test("tổng của talent", () => {
    const t = computeTalentRealTotals(rows, "A");
    expect(t.sessionCount).toBe(2); // số vận hành cộng được
    expect(t.hours).toBe(6);
    expect(t.perf.TikTok.gmv).toBe(30e6);
    expect(t.perf.Shopee.gmv).toBe(50e6);
    expect("totalGmv" in t).toBe(false);
  });
  test("GMV/giờ theo kênh brand × sàn", () => {
    const perf = computeTalentBrandPerf(rows, "A", ["vera"]).filter((r) => r.sessions > 0);
    expect(perf.map((r) => [r.platform, r.gmvPerHour])).toEqual([["TikTok", 10e6], ["Shopee", 50e6 / 3]]);
  });
});

describe("lib/platforms/perf", () => {
  test("cộng theo sàn, không bao giờ ra một tổng", () => {
    const v = sumGmvByPlatform([ca("a", "A", "TikTok", 10), ca("b", "A", "Shopee", 5), ca("c", "A", "TikTok", 1)]);
    expect(v).toEqual({ TikTok: 11, Shopee: 5 });
    expect(platformsWithValue(sumByPlatform([ca("a", "A", "Shopee", 0, { targetGmv: 9 })], (s) => s.targetGmv))).toEqual(["Shopee"]);
  });
  test("hàm cộng chỉ số ném lỗi khi mảng ca lẫn hai sàn", () => {
    expect(() => assertOnePlatform([ca("a", "A", "TikTok", 1), ca("b", "A", "Shopee", 1)], "x")).toThrow(/lẫn TikTok và Shopee/);
    expect(() => keyMetricsOfSessions([ca("a", "A", "TikTok", 1), ca("b", "A", "Shopee", 1)], () => 1)).toThrow();
    expect(() => assertOnePlatform([ca("a", "A", "Shopee", 1), ca("b", "A", "Shopee", 1)], "x")).not.toThrow();
  });
});

// ---------- bộ quét ----------
const SRC = join(__dirname, "..", "src");
const PERF = "actualGmv|targetGmv|totalOrders|totalViews|peakViewers|impressions|productImpressions|productClicks|attributedItemsSold|cumGmv";
const PERF_RE = new RegExp(`\\b(${PERF})\\b`);
const SUM_RE = new RegExp(`reduce\\s*[<(]|\\+=|\\+\\s*\\(?\\s*[\\w!?.]+\\.(${PERF})\\b`);

/**
 * File được phép cộng số hiệu suất viết tay, vì NHẬN CA MỘT SÀN theo hợp đồng (người gọi đã lọc sàn, hoặc tự lọc bên trong).
 * Thêm file vào đây phải kèm lý do đó. Không chắc thì dùng sumByPlatform/sumGmvByPlatform của lib/platforms/perf.ts.
 */
const SINGLE_PLATFORM_FILES: Record<string, string> = {
  "components/brand-workspace/BrandDashboard.tsx": "workspace brand đã lọc ca theo sàn (platformSessions ở App)",
  "components/brand-workspace/BrandWeeklyReport.tsx": "nhận `platform`, lọc ca theo sàn",
  "components/brand-workspace/MonthlyReportTabs.tsx": "report TikTok, chỉ ca TikTok",
  "lib/dataraw/productListAgg.ts": "file product_list của một sàn",
  "lib/metrics/avgGmv.ts": "perfOf/computeTalentBrandPerf nhận mảng đã lọc theo sàn",
  "lib/performance/brandCommitment.ts": "cam kết của một kênh: lọc brand + sàn + tháng",
  "lib/performance/ceoBrief.ts": "CeoBrief truyền ca của một sàn",
  "lib/performance/hostSuggestion.ts": "lọc platformOf(s) === slot.platform trước khi cộng",
  "lib/performance/planRunRate.ts": "run-rate của một kế hoạch (brand × tháng × sàn)",
  "lib/performance/slotInsights.ts": "Dashboard brand / Kế Hoạch Tháng truyền ca một kênh",
  "lib/report/deepAnalysis.ts": "report TikTok",
  "lib/report/keyMetrics.ts": "keyMetricsOfSessions có assertOnePlatform",
  "lib/report/monthlyReportInsights.ts": "report một kênh",
  "lib/report/monthlySnapshot.ts": "bản chụp report một kênh",
  "lib/report/rhythm.ts": "report một kênh",
  "lib/scheduling/monthPlanGrid.ts": "lưới kế hoạch của một kênh",
  "lib/scheduling/planEvaluation.ts": "đánh giá kế hoạch của một kênh",
  "lib/scheduling/suggestEngine.ts": "buildHistory có assertOnePlatform",
  "lib/sessionLedger.ts": "summarize có assertOnePlatform"
};

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

test("không file nào ngoài danh sách đã duyệt cộng số hiệu suất viết tay", () => {
  const offenders: string[] = [];
  for (const p of walk(SRC)) {
    const rel = relative(SRC, p).split("\\").join("/");
    if (rel.startsWith("lib/platforms/") || SINGLE_PLATFORM_FILES[rel]) continue;
    readFileSync(p, "utf8").split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (PERF_RE.test(line) && SUM_RE.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(offenders, "Cộng số hiệu suất có thể lẫn hai sàn — dùng sumByPlatform (lib/platforms/perf.ts) hoặc chứng minh file chỉ nhận một sàn rồi thêm vào SINGLE_PLATFORM_FILES").toEqual([]);
});

test("danh sách đã duyệt không giữ file đã hết cộng (tránh danh sách mục)", () => {
  const stale = Object.keys(SINGLE_PLATFORM_FILES).filter((rel) => {
    const src = readFileSync(join(SRC, rel), "utf8");
    return !src.split("\n").some((l) => !/^\s*(\/\/|\*)/.test(l) && PERF_RE.test(l) && SUM_RE.test(l));
  });
  expect(stale).toEqual([]);
});
