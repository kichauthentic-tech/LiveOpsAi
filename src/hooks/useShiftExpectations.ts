import { useEffect, useMemo, useState } from "react";
import type { Brand, BrandChannel, BrandMonthPlan, LiveSession, ShiftSlot } from "../types";
import type { EngineParams } from "../lib/scheduling/engineParams";
import { effectiveCamp, resolveCampBucketType, type CampOverrides } from "../lib/campaignDays";
import { platformsOfBrand } from "../lib/channels";
import { planStatusesRead } from "../lib/db/monthPlans";
import { buildChannelRoom } from "../lib/performance/controlRoom";
import { brandPlatformKey, platformOf, type ReportPlatform } from "../lib/reportPlatform";

// Kỳ vọng GMV từng ca sắp tới cho dòng ca của Bảng Vận Hành (audit 24/10, user chốt 25/10: kỳ vọng nằm trên dòng ca, bỏ khối chọn brand
// "Kỳ vọng các ca sắp live"). MỘT số kỳ vọng mỗi ca = `ChannelRoom.expectedNowById` — cùng số với sa bàn "Cả tháng" và phần còn lại của
// dự kiến cuối tháng. Tháng này theo khung camp của Kế Hoạch Tháng, tháng sau (tuần vắt qua cuối tháng) theo lịch cố định.
// Tính trong một tick sau khi danh sách ca đã vẽ (~150ms cho 7 kênh) để màn không đứng hình; trước khi xong dòng ca hiện "…".

const nextMonthOf = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
};

export interface ShiftExpectations {
  /** null = đang tính; số = kỳ vọng; vắng trong Map = kênh chưa đủ lịch sử để chiếu. */
  byId: Map<string, number> | null;
  /** Khung camp hiệu lực của kênh tháng này (benchmark phễu trong chi tiết ca dùng). */
  campOf: (brandId: string, platform: ReportPlatform) => CampOverrides;
}

export function useShiftExpectations(input: {
  enabled: boolean;
  today: string;
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  brands: Brand[];
  channels: BrandChannel[];
  params: EngineParams;
}): ShiftExpectations {
  const { enabled, today, sessions, shiftSlots, brands, channels, params } = input;
  const month = today.slice(0, 7);
  const [plans, setPlans] = useState<Map<string, BrandMonthPlan> | null>(null);
  const [byId, setById] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    planStatusesRead.take(month).then((m) => alive && setPlans(m)).catch(() => alive && setPlans(new Map()));
    return () => {
      alive = false;
    };
  }, [enabled, month]);

  const campOf = useMemo(() => (brandId: string, platform: ReportPlatform) => effectiveCamp(plans?.get(brandPlatformKey(brandId, platform))?.campRanges), [plans]);

  useEffect(() => {
    if (!enabled || !plans) return;
    const t = setTimeout(() => {
      const out = new Map<string, number>();
      const next = nextMonthOf(month);
      for (const b of brands) {
        for (const p of platformsOfBrand(channels, b.id)) {
          const xs = sessions.filter((s) => s.brandId === b.id && platformOf(s) === p && !s.excludedFromReports);
          if (xs.length === 0) continue;
          const open = shiftSlots.filter((sl) => sl.brandId === b.id && platformOf(sl) === p);
          const camp = campOf(b.id, p);
          for (const m of [month, next]) {
            const room = buildChannelRoom({ sessions: xs, month: m, today, target: null, bucketOf: m === month ? (d) => resolveCampBucketType(d, camp) : (d) => resolveCampBucketType(d), params, openSlots: open });
            if (room) for (const [id, v] of room.expectedNowById) out.set(id, v);
          }
        }
      }
      setById(out);
    }, 0);
    return () => clearTimeout(t);
  }, [enabled, plans, brands, channels, sessions, shiftSlots, month, today, params, campOf]);

  return { byId: enabled ? byId : null, campOf };
}
