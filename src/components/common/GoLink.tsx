import React from "react";

/**
 * Nút "sang đúng chỗ phải nhập" — chữ ngắn + mũi tên.
 *
 * Audit người mới 04/10: bảng toàn chữ "Chưa lập / Chưa có cam kết / Chưa tạo" mà không nói đi đâu để làm.
 * Audit chữ 13/11: đếm 59 câu chỉ đường bằng CHỮ ("nhập ở CRM → Hợp đồng & giá", "đặt cam kết ở Kế Hoạch Tháng").
 * Chỗ nào có đường đi thì dùng nút này thay cho câu — §5.2 "không chỉ đường bằng chữ".
 *
 * `onClick` rỗng (không có quyền / không có callback) ⇒ không vẽ gì, để màn không hiện nút bấm không được.
 */
export const GoLink: React.FC<{ label: string; onClick?: () => void; className?: string }> = ({ label, onClick, className = "" }) =>
  onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`text-2xs font-bold text-[var(--accent-text)] hover:underline min-h-6 ${className}`}
    >
      {label} →
    </button>
  ) : null;
