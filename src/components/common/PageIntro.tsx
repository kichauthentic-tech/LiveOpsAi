import React, { useLayoutEffect, useRef, useState } from "react";

/**
 * Đoạn giải thích dưới tiêu đề trang — mặc định chỉ 1 dòng, bấm "Chi tiết" để đọc hết.
 *
 * Audit UX 2026-09-26: thẻ tiêu đề các trang kéo xuống tới y=191–483px trên màn 900px, phần lớn là
 * đoạn giải thích 100–280 ký tự mà người dùng quen tay đọc một lần là đủ. Câu đầu thường đã nói
 * trang để làm gì nên giữ 1 dòng; nút chỉ hiện khi chữ thật sự bị cắt.
 */
export const PageIntro: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  return (
    <div className={`mt-1 flex items-baseline gap-2 max-w-3xl min-w-0 ${className}`}>
      <p ref={ref} className={`text-xs text-[var(--text-muted)] leading-relaxed min-w-0 ${open ? "" : "line-clamp-1"}`}>
        {children}
      </p>
      {(clipped || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          // Vùng bấm 17px là dưới sàn 24px của WCAG 2.5.8, mà nút này có mặt ở 11 màn. `-m-1.5 p-1.5`
          // nới vùng bấm ra 24px+ mà không đẩy dòng chữ (cùng cách M5 đã dùng cho nút trong lưới ca).
          className="shrink-0 -m-1.5 p-1.5 text-[11px] font-bold text-[var(--accent-text)] hover:underline whitespace-nowrap"
        >
          {open ? "Thu gọn" : "Chi tiết"}
        </button>
      )}
    </div>
  );
};
