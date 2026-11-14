import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * Nút ⓘ cạnh một tiêu đề: bấm mở đoạn giải thích, bấm ra ngoài hoặc Esc thì đóng.
 *
 * Trước 13/11 chỉ `PageHeader` có (mô tả trang, 05/11). Audit chữ 13/11 đếm 375 dòng chú giải chữ nhỏ mờ luôn hiện ở 104
 * file — phần lớn là mô tả khối ("khối này là gì, đọc thế nào") nằm thẳng dưới mỗi tiêu đề. Tách ra đây để `BlockHead`,
 * `Panel` và tiêu đề tự dựng dùng cùng một ⓘ, không ai phải viết lại popover.
 *
 * Số, kết luận và cảnh báo KHÔNG vào đây — chỉ phần nói phương pháp, cách đọc, vì sao (cùng luật với `Explain`).
 */
export const InfoDot: React.FC<{ children: React.ReactNode; label?: string; size?: "sm" | "md"; className?: string }> = ({
  children,
  label = "Khối này là gì",
  size = "sm",
  className = ""
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const id = useId();

  // Hộp rộng tới 26rem mà neo `left-0` theo nút ⓘ, nên nút nằm bên phải (ô số cột phải, tiêu đề khối bên phải) thì hộp
  // tràn khỏi mép màn — thấy rõ ở 375px khi kiểm 13/11. Mở xong thì đo và dịch ngang vừa đủ để nằm trong màn, chừa 12px.
  // Không đặt lại shift khi đóng (tránh setState trong effect): phép đo dưới đây cộng/trừ TƯƠNG ĐỐI so với chỗ đang
  // đứng, nên lần mở sau có lệch sẵn thì vẫn tự kéo về trong màn.
  useLayoutEffect(() => {
    if (!open) return;
    const el = noteRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const over = r.right - (window.innerWidth - 12);
    const under = 12 - r.left;
    if (over > 0) setShift((s) => s - over);
    else if (under > 0) setShift((s) => s + under);
  }, [open]);

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

  // `ml-1` bù lại `-m-1` của nút bên dưới (thủ thuật lấy vùng bấm 24px): thiếu nó thì ⓘ dính sát chữ đứng trước khi
  // đặt cuối câu — thấy ở Hiệu Suất Host 14/11. Trong tiêu đề flex có `gap` thì thành 10px, vẫn cân.
  return (
    <span ref={ref} className={`relative inline-flex align-middle ml-1 ${className}`}>
      {/* -m-1 p-1: vùng bấm 24px (WCAG 2.5.8) mà không đẩy chữ tiêu đề. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        className={`-m-1 p-1 rounded-full transition-colors ${open ? "text-[var(--accent-text)]" : "text-[var(--text-faint)] hover:text-[var(--text)]"}`}
      >
        <Info className={size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"} />
      </button>
      {open && (
        <span
          ref={noteRef}
          id={id}
          role="note"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          className="absolute left-0 top-full mt-2 z-30 w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs font-normal leading-relaxed tracking-normal text-[var(--text-muted)] shadow-2xl"
        >
          {children}
        </span>
      )}
    </span>
  );
};
