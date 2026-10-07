// Màn nhập số liệu (Dữ Liệu Gốc, Nhập Ads) mở ngay khi có brand + kênh, không đợi cả danh sách ca (đo 07/10: 1.500 ca là
// phần nặng nhất lúc mở app). Test này canh các điều kiện để việc đó an toàn — thiếu một cái là màn hiện "0 ca" giả hoặc
// chọn nhầm sàn. Là quét nguồn như `pagedQueries.test.ts` vì App chưa có test render.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { TABS_NEEDING_SHELL_ONLY, TABS_WITHOUT_CORE_DATA } from "../src/lib/appNav";

const SRC = join(__dirname, "..", "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("TABS_NEEDING_SHELL_ONLY", () => {
  test("đúng hai màn nhập số liệu, không trùng danh sách bỏ cổng hẳn", () => {
    expect([...TABS_NEEDING_SHELL_ONLY].sort()).toEqual(["brand_ads_report", "brand_dataraw"]);
    for (const t of TABS_NEEDING_SHELL_ONLY) expect(TABS_WITHOUT_CORE_DATA.has(t)).toBe(false);
  });

  test("App dùng cổng riêng cho các tab này, cả khi vẽ lẫn khi nạp trước", () => {
    const app = read("App.tsx");
    expect(app).toContain("TABS_NEEDING_SHELL_ONLY.has(activeTab) ? shellDataReady : coreDataReady");
    expect(app, "khung chờ phải theo cổng của tab").toContain("!tabDataReady && !TABS_WITHOUT_CORE_DATA.has(activeTab)");
    expect(app, "nạp trước dừng theo cùng cổng, không nạp thừa sau khi màn đã mount").toContain("if (!session || tabDataReady) return;");
  });

  test("kênh brand nạp riêng, không nằm trong đợt chậm cùng kế hoạch tháng", () => {
    const hook = read("hooks/useWorkspaceData.ts");
    const batch = hook.slice(hook.indexOf("Promise.all([fetchBrandPlatformRates()"), hook.indexOf(".then(([rates"));
    expect(batch, "đưa fetchBrandChannels về Promise.all này là làm shellDataReady chờ đợt chậm").not.toContain("fetchBrandChannels");
    expect(hook).toContain("channelsLoadedFor === authUserId");
    expect(hook, "lỗi cũng phải đánh dấu đã xong, không treo khung chờ").toMatch(/fetchBrandChannels\(\)[\s\S]{0,400}\.finally\(\(\) => \{ if \(!cancelled\) setChannelsLoadedFor\(authUserId\)/);
  });
});

describe("Dữ Liệu Gốc: khối cần ca tự chờ", () => {
  const src = read("components/brand-workspace/BrandDataRaw.tsx");
  test("Đối soát và Nạp bù chỉ vẽ khi ca đã về", () => {
    expect(src).toContain("{coreReady && isReconType && (");
    expect(src.match(/\{coreReady && isReconType && \(/g)?.length, "Đối soát + Nạp bù (cả hai sàn từ 0156) đều chờ ca").toBe(2);
  });
  test("App truyền cờ ca đã nạp", () => {
    expect(read("App.tsx")).toContain("coreReady={coreDataReady}");
  });
});

describe("Nhập Ads: tháng mặc định theo ca về sau", () => {
  test("chỉ giữ tháng người dùng chọn, mặc định tính lại khi ca về", () => {
    const src = read("components/brand-workspace/BrandAdsReport.tsx");
    expect(src).toContain("const month = pickedMonth ?? defaultMonth;");
    expect(src, "không còn chốt tháng bằng useState khởi tạo từ ca (ca có thể rỗng lúc mở)").not.toMatch(/useState\(\(\) => defaultReportMonth/);
  });
});
