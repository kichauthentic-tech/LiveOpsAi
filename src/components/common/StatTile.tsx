import React from "react";
import { metricHint } from "../../lib/metricGlossary";

// Ô số (KPI) dùng chung cả app — bố cục 18/10 đợt 2 (docs/WORKSPACE_HISTORY.md `## Sắp lại bố cục cho bớt rối`).
// Trước đó ~15 bản tự vẽ ở từng màn, phần lớn nhãn VIẾT HOA giãn chữ 11px (Report Tháng 137 chữ viết hoa một màn,
// Dashboard brand 32): nhãn nay chữ thường cùng một cỡ, số đậm, dòng phụ 11px. Màn mới cần ô số thì dùng component này,
// đừng tự vẽ lại (tests/layoutCalm.test.ts canh nhãn viết hoa).

/** Dáng chữ của nhãn ô số — Report Tháng (skin đen-vàng cố định) dùng cùng dáng, chỉ khác màu. */
export const STAT_LABEL_SHAPE = "text-xs font-medium leading-snug";
export const STAT_LABEL = `${STAT_LABEL_SHAPE} text-[var(--text-muted)]`;

type Size = "sm" | "md" | "lg";
// Trong 6 cỡ chữ đã chuẩn hoá ở M1 (11/12/14/16/18/20) — không thêm cỡ mới.
const VALUE_SIZE: Record<Size, string> = { sm: "text-sm", md: "text-lg", lg: "text-xl" };

// Nền ô luôn khác nền ngay sau nó một bậc: "card" = ô đứng thẳng trên nền trang (hàng KPI đầu trang, Dashboard);
// "box" = ô nằm trong một thẻ (nền thẻ là --surface); "plain" = không khung — ô nằm trong lưới/dòng đã có khung,
// thêm viền nữa là hộp lồng hộp.
const FRAME = {
  card: "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3",
  box: "rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-3",
  plain: ""
} as const;

export const StatTile: React.FC<{
  label: React.ReactNode;
  /** Bỏ trống khi ô chỉ có nội dung riêng (children). */
  value?: React.ReactNode;
  /** Dòng phụ dưới số (so kỳ trước, nguồn, mẫu số…). */
  hint?: React.ReactNode;
  size?: Size;
  /** Class màu của số; mặc định màu chữ chính. */
  tone?: string;
  /** Tooltip của nhãn — mặc định công thức trong metricGlossary khi nhãn là chuỗi. */
  title?: string;
  /** Tooltip của số. */
  valueTitle?: string;
  frame?: keyof typeof FRAME;
  className?: string;
  /** Phần thêm dưới dòng phụ (biểu đồ nhỏ, nút). */
  children?: React.ReactNode;
}> = ({ label, value, hint, size = "md", tone, title, valueTitle, frame = "box", className = "", children }) => (
  <div className={`min-w-0 ${FRAME[frame]} ${className}`}>
    <p className={`${STAT_LABEL} flex items-center gap-1`} title={title ?? (typeof label === "string" ? metricHint(label) : undefined)}>
      {label}
    </p>
    {value != null && (
      <p className={`${VALUE_SIZE[size]} font-black tabular-nums leading-tight mt-0.5 ${tone ?? "text-[var(--text)]"}`} title={valueTitle}>
        {value}
      </p>
    )}
    {hint != null && hint !== "" && <div className="text-[11px] text-[var(--text-faint)] mt-0.5 leading-snug">{hint}</div>}
    {children}
  </div>
);
