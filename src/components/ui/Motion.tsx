import React, { useLayoutEffect, useRef } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, animate, domAnimation, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";

// Bộ chuyển động dùng chung (10/11 — kiểu "bento dashboard": thẻ hiện lần lượt, nổi nhẹ khi rê chuột, số chạy tới giá trị, khối
// bung/gập mượt). Màn nào dùng thì bọc gốc bằng <MotionRoot> — thư viện chỉ vào chunk của màn đó, không vào bundle chính.
// Người dùng bật "giảm chuyển động" ở hệ điều hành: MotionConfig bỏ dịch chuyển (chỉ còn mờ dần), CountUp hiện thẳng số cuối.
// Chỉ đổi transform/opacity (không gây dựng lại bố cục) — riêng Collapse đổi chiều cao của đúng một khối.

const EASE = [0.22, 1, 0.36, 1] as const;

export const MotionRoot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">{children}</MotionConfig>
  </LazyMotion>
);

/** Khối hiện dần từ dưới lên; `index` là thứ tự trong nhóm để các khối hiện lần lượt (trễ tối đa 8 bậc — danh sách dài không phải chờ). */
export const Reveal: React.FC<{ index?: number; lift?: boolean; className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ index = 0, lift = false, className, style, children }) => (
  <m.div
    className={className}
    style={style}
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE, delay: Math.min(index, 8) * 0.05 } }}
    whileHover={lift ? { y: -3, transition: { type: "spring", stiffness: 420, damping: 26 } } : undefined}
  >
    {children}
  </m.div>
);

/** Khối bung/gập theo chiều cao thật của nội dung. Luôn render component này; `open` quyết định có nội dung hay không. */
export const Collapse: React.FC<{ open: boolean; className?: string; children: React.ReactNode }> = ({ open, className, children }) => (
  <AnimatePresence initial={false}>
    {open && (
      <m.div
        className="overflow-hidden"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1, transition: { duration: 0.32, ease: EASE } }}
        exit={{ height: 0, opacity: 0, transition: { duration: 0.22, ease: EASE } }}
      >
        <div className={className}>{children}</div>
      </m.div>
    )}
  </AnimatePresence>
);

/** Số chạy từ giá trị trước đó (lần đầu: từ 0) tới `value`. `format` dựng chữ cho từng khung hình — dùng đúng hàm định dạng của màn. */
export const CountUp: React.FC<{ value: number; format: (v: number) => string; className?: string }> = ({ value, format, className }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const fmt = useRef(format);
  const reduce = useReducedMotion();
  useLayoutEffect(() => { fmt.current = format; });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = from.current;
    from.current = value;
    if (reduce || !isFinite(value) || start === value) {
      el.textContent = fmt.current(value);
      return;
    }
    el.textContent = fmt.current(start);
    const run = animate(start, value, { duration: 0.9, ease: EASE, onUpdate: (v) => { el.textContent = fmt.current(v); } });
    return () => run.stop();
  }, [value, reduce]);

  return <span ref={ref} className={className}>{format(value)}</span>;
};
