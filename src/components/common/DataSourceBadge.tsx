import React from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { LiveSession } from "../../types";

interface DataSourceBadgeProps {
  dataSource: LiveSession["dataSource"];
  className?: string;
}

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({ dataSource, className = "" }) => {
  if (dataSource === "tiktok_reconciled") {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-950 text-emerald-300 border-emerald-800 ${className}`}
        title="Số liệu đã được đối soát với báo cáo chính thức từ TikTok Shop"
      >
        <CheckCircle2 className="w-3 h-3" /> Đã Đối Soát
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-950 text-amber-300 border-amber-800 ${className}`}
      title="Số liệu do talent nhập tay, chờ đối soát với báo cáo chính thức từ TikTok Shop"
    >
      <Clock className="w-3 h-3" /> Tạm Tính
    </span>
  );
};
