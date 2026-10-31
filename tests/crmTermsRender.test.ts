// CRM "Hợp đồng & giá" sau 0191: có bảng điều khoản ⇒ khối Điều khoản hợp tác thay cho công tắc cũ; chưa chạy 0191 ⇒ giữ công tắc cũ
// để vẫn nhập được giá, và nói rõ vì sao. Render phía server (không có trình duyệt).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
import { BrandConfigPanel } from "../src/components/BrandConfigPanel";
import { ConfirmProvider } from "../src/hooks/useConfirm";
import { emptyTerms, newFee, type FeeComponent, type TermsPeriod } from "../src/lib/commercial/terms";
import type { Brand } from "../src/types";

const brand = { id: "b", name: "VERA", billingModel: "hourly" } as Brand;
const noop = async () => true;
const props = (over: Record<string, unknown>) =>
  ({
    brand, platform: "TikTok", platforms: ["TikTok"], onPlatformChange: () => {}, canEdit: true,
    rates: [], rateHistory: [], contracts: [], commitments: [], studios: [], brandStudios: [], onUpdateBrand: () => {},
    onSaveRate: noop, onSaveReturnRate: noop, onSaveCommissionRate: noop, onSaveServiceScope: noop, onSetBrandStudio: noop, onContractsChanged: async () => {},
    termPeriods: [], termsAvailable: true, onTermsChanged: () => {}, ...over
  }) as unknown as React.ComponentProps<typeof BrandConfigPanel>;
const html = (over: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(ConfirmProvider, null, React.createElement(BrandConfigPanel, props(over))));

describe("CRM Hợp đồng & giá", () => {
  test("chưa chạy 0191: giữ công tắc cách thu phí + ô giá cũ, nói rõ chưa lưu được điều khoản", () => {
    const h = html({ termsAvailable: false });
    expect(h).toContain("migration 0191");
    expect(h).toContain("Cách thu phí:");
    expect(h).toContain("Đơn giá / giờ live");
    expect(h).not.toContain("Tính phí tháng");
  });
  test("có bảng điều khoản, chưa khai: gợi ý gói mẫu và chỉ ra đang tính theo cách cũ; không còn công tắc cũ", () => {
    const h = html({});
    expect(h).toContain("Chưa khai — đang tính theo cách cũ");
    expect(h).toContain("Khai điều khoản");
    expect(h).toContain("Trọn gói (Live + Ads + Affiliate)");
    expect(h).not.toContain("Cách thu phí:");
    // Bốn tab, mỗi lúc chỉ thấy một phần; tab mặc định là Điều khoản.
    for (const t of ["Điều khoản", "Hợp đồng", "Tính phí tháng", "Kênh, host, phòng"]) expect(h).toContain(`>${t}</button>`);
    expect(h).not.toContain("Phòng live mặc định");
  });
  test("đã khai điều khoản: hiện điều khoản đọc bằng lời và nút sửa", () => {
    const per = { ...(newFee("per_hour") as Extract<FeeComponent, { kind: "per_hour" }>), rate: 350_000 };
    const period: TermsPeriod = { id: "p", brandId: "b", platform: "TikTok", kind: "standard", label: "", startDate: "2020-01-01", terms: { ...emptyTerms(), fees: [per] } };
    const h = html({ termPeriods: [period] });
    expect(h).toContain("Phí theo giờ live: 350K/giờ.");
    expect(h).toContain("Sửa</button>");
  });
});
