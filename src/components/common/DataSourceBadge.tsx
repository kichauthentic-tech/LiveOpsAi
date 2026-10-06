import React from "react";
import { CheckCircle2, Clock, FileCheck2 } from "lucide-react";
import { LiveSession } from "../../types";
import { profileOf } from "../../lib/platforms/profiles";
import { dataSourceTier } from "../../lib/dataSource";

interface DataSourceBadgeProps {
  dataSource: LiveSession["dataSource"];
  /** Sàn của ca (0139) — chỉ để tooltip nói đúng nguồn đối soát; mặc định TikTok. */
  platform?: LiveSession["platform"];
  className?: string;
}

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({ dataSource, platform = "TikTok", className = "" }) => {
  const prof = profileOf({ platform });
  const shop = prof.shopLabel;
  const tier = dataSourceTier({ dataSource });
  if (tier === "reconciled") {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-emerald-950 text-emerald-300 border-emerald-800 ${className}`}
        title={`Số liệu đã được đối soát với báo cáo chính thức từ ${shop}`}
      >
        <CheckCircle2 className="w-3 h-3" /> Đã Đối Soát
      </span>
    );
  }

  // Bậc giữa (migration 0078): số đọc từ file TikTok trợ live up lúc giao ca — thật hơn nhập
  // tay, nhưng TikTok còn cập nhật trễ nên chưa phải số chốt. Trước đây rơi chung vào "Tạm Tính",
  // làm ops tưởng ca đã có file vẫn là số gõ tay.
  // Shopee (0150): số dashboard gõ lúc giao ca cũng là bậc này — trước 0150 rơi vào "Tạm Tính" chung với số nạp bảng tính.
  if (tier === "handover") {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-sky-950 text-sky-300 border-sky-800 ${className}`}
        title={
          dataSource === "live_snapshot"
            ? `Số đọc từ file ${prof.reconciliationFile} trợ live up lúc giao ca — chờ đối soát cuối kỳ`
            : `Số dashboard ${shop} trợ live gõ lúc giao ca (đã trừ ca nối) — thường thấp hơn số chốt, chờ đối soát bằng ${prof.reconciliationFile}`
        }
      >
        <FileCheck2 className="w-3 h-3" /> Số Lúc Giao Ca
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-amber-950 text-amber-300 border-amber-800 ${className}`}
      title={`Số nạp từ bảng tính vận hành hoặc tự khai — chưa có số lúc giao ca, chờ đối soát với báo cáo chính thức từ ${shop}`}
    >
      <Clock className="w-3 h-3" /> Tạm Tính
    </span>
  );
};
