// Hồ sơ sàn (Bước 2 lộ trình đa sàn, 07/10/2026): mọi khác biệt TikTok / Shopee nằm ở src/lib/platforms/ — màn hình hỏi hồ sơ
// (`profileOf`) hoặc tra Record theo sàn, KHÔNG so chuỗi tên sàn. Trước đợt này có ~210 câu `=== "Shopee"` / `isShopee` rải trong
// ~35 file, màn nào quên một nhánh là sai số. File này canh: (1) hồ sơ đủ và đúng luật dữ liệu gốc tách sàn, (2) bộ quét.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import { PLATFORM_PROFILES, profileOf } from "../src/lib/platforms/profiles";
import { REPORT_PLATFORMS, platformOf } from "../src/lib/reportPlatform";
import { brandNavGroups } from "../src/lib/appNav";

const ALL_PROFILES = REPORT_PLATFORMS.map((p) => PLATFORM_PROFILES[p]);

describe("hồ sơ sàn", () => {
  test("mỗi sàn có hồ sơ, khoá khớp id", () => {
    expect(ALL_PROFILES.map((p) => p.id)).toEqual(REPORT_PLATFORMS);
    for (const p of REPORT_PLATFORMS) expect(PLATFORM_PROFILES[p].id).toBe(p);
  });
  test("dữ liệu gốc hai sàn KHÔNG dùng chung loại file nào (user xác nhận 07/10: khác hoàn toàn)", () => {
    const [a, b] = ALL_PROFILES;
    expect(a.dataRawTypes.filter((t) => b.dataRawTypes.includes(t))).toEqual([]);
    expect(a.adsFileType).not.toBe(b.adsFileType);
    expect(a.reconciliationFile).not.toBe(b.reconciliationFile);
  });
  test("bộ chỉ số: mỗi sàn có GMV, giờ, GMV/giờ; ô KPI CEO là chỉ số có thật trong bộ của sàn", () => {
    for (const p of ALL_PROFILES) {
      const keys = p.metrics.defs.map((d) => d.key);
      for (const k of ["gmv", "hours", "gmvPerHour"]) expect(keys, p.id).toContain(k);
      for (const k of p.briefKpis) expect(keys, `${p.id} ${k.key}`).toContain(k.key);
      for (const d of p.metrics.defs) expect(p.metrics.groups.map((g) => g.group), `${p.id} ${d.key}`).toContain(d.group);
    }
  });
  test("tab ẩn theo sàn là tab có thật của Brand workspace", () => {
    const ids = brandNavGroups("ceo").flatMap((g) => g.items.map((i) => i.id));
    for (const p of ALL_PROFILES) for (const t of p.hiddenBrandTabs) expect(ids).toContain(t);
  });
  test("dòng thiếu / sai sàn = sàn cũ (TikTok), không đoán gì khác", () => {
    expect(platformOf({})).toBe("TikTok");
    expect(platformOf({ platform: "Lazada" })).toBe("TikTok");
    expect(platformOf({ platform: "Shopee" })).toBe("Shopee");
    expect(profileOf({ platform: "Shopee" }).handover).toBe("link");
    expect(profileOf("TikTok").handover).toBe("file");
  });
});

// ---------- bộ quét ----------
const SRC = join(__dirname, "..", "src");
const BRANCH_RE = /(===|!==)\s*"(Shopee|TikTok)"|"(Shopee|TikTok)"\s*(===|!==)|\b(isShopee|shopeeOnly|isTikTok)\b|\?\?\s*"TikTok"/;
/** Chỗ được phép nói thẳng tên sàn: lõi định nghĩa sàn + server (không import được mã client). */
const ALLOWED = (rel: string) =>
  rel.startsWith("lib/platforms/") ||
  rel === "lib/reportPlatform.ts" ||
  rel.startsWith("server/");

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

test("không màn nào rẽ nhánh theo tên sàn — hỏi hồ sơ sàn (profileOf) hoặc Record theo sàn", () => {
  const offenders: string[] = [];
  for (const p of walk(SRC)) {
    const rel = relative(SRC, p).split("\\").join("/");
    if (ALLOWED(rel)) continue;
    readFileSync(p, "utf8").split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (BRANCH_RE.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  expect(offenders).toEqual([]);
});
