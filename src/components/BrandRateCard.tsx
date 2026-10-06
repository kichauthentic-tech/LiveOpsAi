import React, { useMemo } from "react";
import { Brand, BrandPlatformRate, BrandPlatformRateHistoryEntry } from "../types";
import { History, Tag } from "lucide-react";
import { fmtDateVn, fmtVndFull } from "../lib/format";
import { rateOf } from "../lib/brandPricing";
import type { ReportPlatform } from "../lib/reportPlatform";

// Giá của brand × sàn — CHỈ ĐỌC, nằm trong tab "Hợp Đồng" của Brand Workspace (gộp với cam kết 06/10: hai nửa của
// cùng một hợp đồng, trước đó là 2 tab "Rate Card" + "Cam Kết Hợp Đồng"). Sửa giá ở CRM → "Hợp đồng & giá"
// (BrandConfigPanel) — chỗ nhập duy nhất. RLS đọc đã mở cho role brand từ 0105.

interface Props {
  brand: Pick<Brand, "id" | "billingModel">;
  platform: ReportPlatform;
  rates: BrandPlatformRate[];
  rateHistory: BrandPlatformRateHistoryEntry[];
}

export const BrandRateCard: React.FC<Props> = ({ brand, platform, rates, rateHistory }) => {
  const rate = rateOf(rates, brand.id, platform);
  const hourly = brand.billingModel === "hourly";
  const history = useMemo(
    () => rateHistory.filter((h) => h.brandId === brand.id && h.platform === platform).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [rateHistory, brand.id, platform]
  );
  const cell = (label: string, value: string | null, note: string) => (
    <div className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold">{label}</div>
      <div className={`mt-0.5 text-base font-black ${value ? "text-[var(--text)]" : "text-[var(--text-faint)]"}`}>{value ?? "chưa đặt"}</div>
      <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{note}</p>
    </div>
  );

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3 shadow-xl">
      <h3 className="font-black text-[var(--text)] flex items-center gap-2">
        <Tag className="w-4 h-4 text-[var(--accent-text)]" /> Giá {platform}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {hourly
          ? cell("Đơn giá / giờ live", rate && rate.ratePerHour > 0 ? fmtVndFull(rate.ratePerHour) : null, "Tính trên giờ ca theo lịch.")
          : cell("% hoa hồng agency", rate?.commissionRate != null ? `${rate.commissionRate}% NMV` : null, "NMV = GMV × (1 − tỷ lệ hoàn huỷ).")}
        {cell("Tỷ lệ hoàn huỷ", rate && rate.returnRate > 0 ? `${rate.returnRate}%` : null, "Dùng để ước NMV từ GMV.")}
      </div>
      {history.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer font-bold text-[var(--text-muted)] inline-flex items-center gap-1">
            <History className="w-3 h-3" /> Lịch sử giá ({history.length})
          </summary>
          <div className="mt-1.5 space-y-1">
            {history.map((h) => (
              <div key={h.id} className="flex flex-wrap justify-between gap-1 bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-lg px-3 py-1.5">
                <span className="text-[var(--text-muted)]">{fmtDateVn(h.effectiveFrom)} → {h.effectiveTo ? fmtDateVn(h.effectiveTo) : "nay"}</span>
                <span className="text-[var(--text)] font-bold">
                  {hourly ? `${fmtVndFull(h.ratePerHour)}/giờ` : h.commissionRate != null ? `${h.commissionRate}%` : "—"}
                  <span className="text-[var(--text-faint)] font-normal"> · hoàn huỷ {h.returnRate}%</span>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
