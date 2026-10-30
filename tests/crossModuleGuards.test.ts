import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BrandMonthlyReport } from "../src/types";
import { isSessionMonthClosed } from "../src/lib/closedMonth";
import { errorMessage } from "../src/lib/errorMessage";
import { hostKey, coHostKey, personKey } from "../src/lib/performance/hostPerformance";
import type { LiveSession } from "../src/types";

const report = (status: "draft" | "published", platform: "TikTok" | "Shopee" = "TikTok") =>
  ({ brandId: "b1", periodMonth: "2026-09-01", platform, status }) as unknown as BrandMonthlyReport;

describe("tháng đã phát hành = đóng sổ (ops biết trước khi Lưu)", () => {
  const reports = new Map<string, BrandMonthlyReport>([["b1|2026-09", report("published")], ["b1|2026-08", report("draft")]]);
  test("đúng brand × tháng × sàn", () => {
    expect(isSessionMonthClosed(reports, { brandId: "b1", date: "2026-09-14", platform: "TikTok" })).toBe(true);
    expect(isSessionMonthClosed(reports, { brandId: "b1", date: "2026-08-14", platform: "TikTok" })).toBe(false);
    expect(isSessionMonthClosed(reports, { brandId: "b1", date: "2026-09-14", platform: "Shopee" })).toBe(false);
    expect(isSessionMonthClosed(reports, { brandId: "b2", date: "2026-09-14", platform: "TikTok" })).toBe(false);
  });
  test("thông báo lỗi DB không còn nhắc màn đã gỡ", () => {
    const msg = errorMessage({ message: "Thu hồi report ở Điều Phối Phát Hành trước khi sửa" });
    expect(msg).not.toContain("Điều Phối Phát Hành");
    expect(msg).toContain("Toàn Cảnh Brand");
  });
});

describe("một khoá người cho mọi màn", () => {
  const s = (hostId: string, hostName: string, coHostId = "", coHostName = "") => ({ hostId, hostName, coHostId, coHostName }) as unknown as LiveSession;
  test("tên thừa khoảng trắng vẫn là một người", () => {
    expect(personKey(undefined, "Lan ")).toBe(personKey(undefined, "Lan"));
    expect(hostKey(s("", "Lan "))).toBe(hostKey(s("", "Lan")));
    expect(coHostKey(s("h", "x", "", " Mai"))).toBe("ten:Mai");
  });
  test("id thắng tên; không id không tên ⇒ null", () => {
    expect(personKey("t1", "Lan")).toBe("t1");
    expect(personKey("", "  ")).toBeNull();
  });
});

describe("nguồn số chỉ đọc qua dataSource.ts", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  test("không so chuỗi data_source ngoài lib/dataSource.ts", () => {
    const bad = files(join(__dirname, "../src"))
      .filter((f) => !f.endsWith("lib/dataSource.ts"))
      .filter((f) => /\.dataSource\s*(===|!==)\s*["']/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
