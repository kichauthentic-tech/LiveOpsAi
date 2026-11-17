import { useSyncExternalStore } from "react";
import type { WeeklyMode } from "./performance/weeklyReport";

// Kỳ đang xem của Báo Cáo Tuần — một biến module để hai khối sàn (TikTok / Shopee, mỗi khối một component) cùng xem MỘT kỳ
// mà App.tsx không phải giữ state hay import tĩnh component tab (tests/bundleSplit). Không lưu localStorage: mở lại là "Từ đầu tháng".

export interface WeeklyPeriod {
  mode: WeeklyMode;
  /** Một ngày bất kỳ trong kỳ. */
  anchor: string;
}

let current: WeeklyPeriod | null = null;
const listeners = new Set<() => void>();

export function useWeeklyPeriod(today: string): [WeeklyPeriod, (p: WeeklyPeriod) => void] {
  const fallback = { mode: "mtd" as const, anchor: today };
  const value = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current ?? FALLBACK_CACHE(fallback),
    () => fallback
  );
  return [value, (p) => { current = p; listeners.forEach((l) => l()); }];
}

// useSyncExternalStore cần cùng một tham chiếu giữa các lần đọc khi chưa ai chọn kỳ.
let cache: WeeklyPeriod | null = null;
function FALLBACK_CACHE(f: WeeklyPeriod): WeeklyPeriod {
  if (!cache || cache.anchor !== f.anchor) cache = f;
  return cache;
}
