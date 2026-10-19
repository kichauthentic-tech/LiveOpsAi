import React, { createContext, useContext } from "react";
import { PageIntro } from "./PageIntro";
import { PlatformChip } from "./PlatformChip";
import type { ReportPlatform } from "../../lib/reportPlatform";

/**
 * Màn "mọi kênh" của agency khi chọn "Tất cả kênh" vẽ cùng một component cho từng sàn (App `perPlatformBlocks`).
 * Trong khối sàn, PageHeader không vẽ lại tiêu đề trang (App đã vẽ MỘT lần ở trên) mà thành đầu khối "Các kênh TikTok"
 * + nút/bộ lọc của khối đó. Đo 18/10: Toàn Cảnh Brand / Hiệu Suất Host / Điều Phối Phát Hành / Dashboard ở "Tất cả kênh"
 * lặp nguyên thẻ tiêu đề + mô tả + bộ chọn tháng mỗi sàn — người đọc không biết bộ chọn nào điều khiển phần nào.
 */
export const PlatformBlockContext = createContext<{ platform: ReportPlatform; first: boolean } | null>(null);

/**
 * Đầu trang dùng chung: tiêu đề + 1 dòng giải thích (PageIntro) + nút/bộ chọn bên phải, hàng phụ (`children`: tab,
 * bộ lọc, cảnh báo) bên dưới.
 *
 * Bố cục 18/10 ("rối mắt"): đầu trang KHÔNG còn là một thẻ có viền/nền/bóng như các khối nội dung. Trước đó mọi thứ đều
 * là hộp cùng độ nặng (đầu trang, ô KPI, bảng), mắt không biết đâu là tiêu đề, đâu là nội dung. Tiêu đề nằm thẳng trên
 * nền, các khối nội dung bên dưới mới là thẻ — một tầng hộp.
 */
export const PageHeader: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, description, actions, children, className = "" }) => {
  const block = useContext(PlatformBlockContext);
  // max-w-full: thanh tab nowrap (vd Phân Quyền, 613px) tự cuộn ngang trong khung thay vì đẩy cả trang tràn ở 375px.
  const actionsEl = actions && <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">{actions}</div>;
  if (block) {
    return (
      <header className={`space-y-3 ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <h2 className="flex items-center gap-2 text-base font-black text-[var(--text)]">
            <PlatformChip platform={block.platform} /> Các kênh {block.platform}
          </h2>
          {actionsEl}
        </div>
        {block.first && description && <PageIntro className="!mt-0">{description}</PageIntro>}
        {children}
      </header>
    );
  }
  return (
    <header className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight text-[var(--text)] flex items-center gap-2.5">
            {Icon && <Icon className="w-5 h-5 text-[var(--accent-text)] shrink-0" />}
            <span className="min-w-0">{title}</span>
          </h1>
          {description && <PageIntro>{description}</PageIntro>}
        </div>
        {actionsEl}
      </div>
      {children}
    </header>
  );
};
