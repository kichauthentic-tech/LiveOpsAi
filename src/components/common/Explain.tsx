import React from "react";

// Phần giải thích dài (cách tính, cách đọc bảng, vì sao) gập sau một dòng — bố cục 18/10 đợt 2: AI Training Center
// đo 159 dòng giải thích bày sẵn, số và bảng bị đẩy xuống dưới. Số, kết quả và cảnh báo vẫn hiện; chỉ phần nói phương
// pháp mới gập. Report Tháng có bản cùng ý theo skin riêng (`MethodNote` ở brand-workspace/report/ui.tsx).
export const Explain: React.FC<{ summary: React.ReactNode; children: React.ReactNode; className?: string }> = ({ summary, children, className = "" }) => (
  <details className={`text-[11px] text-[var(--text-muted)] ${className}`}>
    <summary className="cursor-pointer min-h-6 py-0.5 w-fit font-bold hover:text-[var(--text)]">{summary}</summary>
    <div className="mt-1 leading-snug space-y-1">{children}</div>
  </details>
);
