import React, { createContext, useContext } from "react";
import { metricFor, platformText, type TermPlatform } from "../../../lib/metricGlossary";

// Tên chỉ số doanh số theo sàn cho các trang report DÙNG CHUNG giữa TikTok và Shopee (Tổng quan, Sản phẩm, Host, Kế hoạch tháng sau).
// Report Shopee bọc cây trang bằng <ReportTermsProvider platform="Shopee">; trang chung lấy tên qua useTerms() thay vì gõ "GMV" cứng.
const Ctx = createContext<TermPlatform>("TikTok");

export const ReportTermsProvider: React.FC<{ platform: TermPlatform; children: React.ReactNode }> = ({ platform, children }) => <Ctx.Provider value={platform}>{children}</Ctx.Provider>;

export function useTerms() {
  const platform = useContext(Ctx);
  return { platform, M: metricFor(platform), t: (s: string) => platformText(s, platform) };
}
