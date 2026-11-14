// Viên "số tin được tới đâu" của brand: Sổ Ca và Cửa sổ Ca Live dùng CHUNG `common/TrustBadge` từ 14/11 (trước đó mỗi
// màn một bản y hệt kèm tooltip riêng). Render phía server — hai chỗ gọi đều chỉ hiện cho role brand nên không xem được
// bằng tài khoản admin.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
import { TrustBadge } from "../src/components/common/TrustBadge";
import type { LiveSession } from "../src/types";

const session = (over: Partial<LiveSession>) =>
  ({
    id: "s1", brandId: "b", brandName: "CROCS", platform: "TikTok", date: "2026-11-05",
    startTime: "18:00", endTime: "21:00", status: "Completed", dataSource: "live_snapshot", ...over
  }) as LiveSession;

const html = (s: LiveSession) => renderToStaticMarkup(React.createElement(TrustBadge, { session: s }));

test("ca đã đối soát: nhãn Đã chốt, tooltip nói đúng tên sàn", () => {
  const h = html(session({ dataSource: "tiktok_reconciled" }));
  expect(h).toContain("Đã chốt");
  expect(h).toMatch(/title="Số đã đối soát với báo cáo [^"]+ cuối kỳ"/);
});

test("ca mới có số lúc giao ca: nhãn Tạm tính", () => {
  const h = html(session({ dataSource: "live_snapshot" }));
  expect(h).toContain("Tạm tính");
  expect(h).toContain("còn cập nhật");
});

test("tooltip theo sàn của ca, không gõ cứng TikTok", () => {
  const shopee = html(session({ platform: "Shopee", dataSource: "tiktok_reconciled" }));
  expect(shopee).not.toContain("TikTok");
  const tiktok = html(session({ platform: "TikTok", dataSource: "tiktok_reconciled" }));
  expect(tiktok).not.toBe(shopee);
});
