import React from "react";
import type { LucideIcon } from "lucide-react";
import { PageIntro } from "./PageIntro";

/**
 * Thẻ đầu trang dùng chung: icon + tiêu đề + 1 dòng giải thích (PageIntro) + nút/bộ chọn bên phải.
 *
 * Audit UX 2026-09-29 (Đợt 0 #5): 14 màn đã dùng kiểu "tiêu đề + PageIntro", 11 màn còn kiểu cũ — dòng
 * chữ nhỏ viết hoa ("TÀI NGUYÊN CHUNG") + tiêu đề 24px, không nói trang để làm gì, cao ~130px. Cùng
 * khuôn với thẻ đầu Sổ Ca (text-lg, icon accent, p-4 sm:p-5). `children` là hàng phụ bên dưới
 * (cảnh báo, bộ lọc…).
 */
export const PageHeader: React.FC<{
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, description, actions, children, className = "" }) => (
  <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-xl space-y-3 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-[var(--accent-text)] shrink-0" />}
          <span className="min-w-0">{title}</span>
        </h2>
        {description && <PageIntro>{description}</PageIntro>}
      </div>
      {/* max-w-full: thanh tab nowrap (vd Phân Quyền, 613px) tự cuộn ngang trong khung thay vì đẩy cả trang tràn ở 375px. */}
      {actions && <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">{actions}</div>}
    </div>
    {children}
  </div>
);
