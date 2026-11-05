import React, { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
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
 * Nút ⓘ cạnh tiêu đề: bấm mở đoạn giải thích của trang, bấm ra ngoài hoặc Esc thì đóng. Đầu trang một hàng (05/11) — trước
 * đó mô tả là một dòng riêng dưới tiêu đề (PageIntro), cộng với hàng tab là 2 hàng chữ trước khi tới số đầu tiên.
 */
const PageInfo: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      {/* -m-1 p-1: vùng bấm 24px (WCAG 2.5.8) mà không đẩy chữ tiêu đề. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Trang này để làm gì"
        title="Trang này để làm gì"
        className={`-m-1 p-1 rounded-full transition-colors ${open ? "text-[var(--accent-text)]" : "text-[var(--text-faint)] hover:text-[var(--text)]"}`}
      >
        <Info className="w-4 h-4" />
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute left-0 top-full mt-2 z-30 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs font-normal leading-relaxed tracking-normal text-[var(--text-muted)] shadow-2xl"
        >
          {children}
        </span>
      )}
    </span>
  );
};

/**
 * Đầu trang dùng chung, MỘT hàng: tiêu đề + ⓘ (mô tả) · `tabs` (thanh tab / chọn kỳ của trang) · `actions` (bộ lọc, nút)
 * dồn phải. Màn hẹp thì hàng tự xuống dòng. `children` (cảnh báo, ô số…) vẫn nằm dưới hàng tiêu đề.
 *
 * Bố cục 18/10 ("rối mắt"): đầu trang KHÔNG còn là một thẻ có viền/nền/bóng như các khối nội dung. Trước đó mọi thứ đều
 * là hộp cùng độ nặng (đầu trang, ô KPI, bảng), mắt không biết đâu là tiêu đề, đâu là nội dung. Tiêu đề nằm thẳng trên
 * nền, các khối nội dung bên dưới mới là thẻ — một tầng hộp.
 *
 * Một hàng 05/11 (user chốt sau đề xuất theme + bố cục): đo 1440×900, nội dung Sổ Ca bắt đầu ở y=303, Lịch & Studio 216,
 * Hiệu Suất Host 189, Dashboard 181 — tiêu đề, dòng mô tả, hàng tab mỗi thứ một hàng. Nay mô tả vào ⓘ, tab lên cùng hàng.
 */
export const PageHeader: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Thanh tab / bộ chọn kỳ của trang — nằm ngay sau tiêu đề trên cùng hàng. */
  tabs?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, description, tabs, actions, children, className = "" }) => {
  const block = useContext(PlatformBlockContext);
  // max-w-full: thanh tab nowrap (vd Phân Quyền, 613px) tự cuộn ngang trong khung thay vì đẩy cả trang tràn ở 375px.
  const actionsEl = actions && <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0 ml-auto">{actions}</div>;
  const tabsEl = tabs && <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">{tabs}</div>;
  if (block) {
    return (
      <header className={`space-y-3 ${className}`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] pb-3">
          <h2 className="flex items-center gap-2 text-base font-black text-[var(--text)]">
            <PlatformChip platform={block.platform} /> Các kênh {block.platform}
            {block.first && description && <PageInfo>{description}</PageInfo>}
          </h2>
          {tabsEl}
          {actionsEl}
        </div>
        {children}
      </header>
    );
  }
  return (
    <header className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-black tracking-tight text-[var(--text)] flex items-center gap-2.5 min-w-0">
          {Icon && <Icon className="w-5 h-5 text-[var(--accent-text)] shrink-0" />}
          <span className="min-w-0">{title}</span>
          {description && <PageInfo>{description}</PageInfo>}
        </h1>
        {tabsEl}
        {actionsEl}
      </div>
      {children}
    </header>
  );
};
