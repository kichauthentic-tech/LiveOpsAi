// Giao ca + đổi host bằng FILE cho cả hai sàn (0154): màn nói đúng tên file/nơi tải của từng sàn, không còn ô dán link/gõ số.
// Vẽ SSR để bắt NaN/undefined và để canh việc đường gõ tay không quay lại.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { FileHandover } = await import("../src/components/FileHandover");
const { HostChangeReports } = await import("../src/components/HostChangeReports");
const { ConfirmProvider } = await import("../src/hooks/useConfirm");
import type { LiveSession } from "../src/types";

const ses = (platform: "TikTok" | "Shopee", over: Partial<LiveSession> = {}) =>
  ({
    id: "s1", title: "x", brandName: "VERA", platform, date: "2026-10-08", startTime: "15:00", endTime: "17:30", status: "Upcoming",
    dataSource: "manual", targetGmv: 0, actualGmv: 0, ...over
  }) as unknown as LiveSession;

const noBad = (html: string) => expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);

describe("FileHandover — một luồng, tên file theo sàn", () => {
  test.each([
    ["TikTok", "Creator-Live-Performance"],
    ["Shopee", "Live List"]
  ] as const)("%s: bước 1 là up file %s, giao ca khoá tới khi có file", (platform, file) => {
    const html = renderToStaticMarkup(React.createElement(ConfirmProvider, null, React.createElement(FileHandover, { session: ses(platform), onSaved: () => {} })));
    expect(html).toContain(`1 · Up file ${file}`);
    expect(html).toContain("Up file ở bước 1 trước");
    expect(html).not.toMatch(/Link dashboard|link dashboard|gõ số/);
    noBad(html);
  });
});

describe("HostChangeReports — số lúc đổi host chỉ qua file", () => {
  const withSwap = (platform: "TikTok" | "Shopee") =>
    ses(platform, {
      staffSegments: [
        { talentId: "a", talentName: "Host A", role: "host", fromMin: 0, toMin: 60 },
        { talentId: "b", talentName: "Host B", role: "host", fromMin: 60, toMin: 150 }
      ]
    });
  test.each([
    ["TikTok", "Creator-Live-Performance"],
    ["Shopee", "Live List"]
  ] as const)("%s: chỗ đổi host hướng dẫn tải %s, không có ô nhập tay", (platform, file) => {
    const html = renderToStaticMarkup(React.createElement(HostChangeReports, { session: withSwap(platform), canSubmit: true, onSaved: () => {} }));
    expect(html).toContain(file);
    expect(html).toContain("Chọn File Số Liệu");
    expect(html).not.toMatch(/Link dashboard|placeholder="vd 11\.513/);
    noBad(html);
  });
});
