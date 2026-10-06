import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { Brand, BrandMonthPlan, BrandMonthPlanSlot, LiveSession, PromoScheme, ShiftSlot } from "../types";
import { EngineParams } from "../lib/scheduling/engineParams";
import { monthPlanRead } from "../lib/db/monthPlans";
import { effectiveCamp } from "../lib/campaignDays";
import { todayVn } from "../lib/performance/brandCommitment";
import { monthOutlook } from "../lib/performance/ceoBrief";
import { planRunRate, projectMonthEnd } from "../lib/performance/planRunRate";
import { platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { loadRememberedBrandId, pickDefaultBrandId, rememberBrandId } from "../lib/defaultBrand";
import { PageHeader } from "./common/PageHeader";
import OpsSupport from "./OpsSupport";

// Hỗ Trợ Vận Hành (tab agency, khôi phục 07/10 theo user chốt): benchmark ca sắp live 7 ngày tới của MỘT brand × sàn. Không
// còn nằm ở Dashboard brand (Dashboard là màn xem số, brand cũng thấy; benchmark là công cụ của ops lúc điều ca). Tính run-rate,
// dự kiến cuối tháng và hệ số k đúng như Dashboard (planRunRate + projectMonthEnd) để benchmark hai nơi không lệch số.

interface Props {
  /** Sàn của workspace agency (07/10). */
  platform: ReportPlatform;
  brands: Brand[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  promoSchemes: PromoScheme[];
  engineParams: EngineParams;
  onOpenSession: (sessionId: string) => void;
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
}

const selectCls = "bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

export default function OpsSupportTab({ platform, brands, sessions, shiftSlots, promoSchemes, engineParams, onOpenSession, onOpenMonthPlan }: Props) {
  const today = todayVn();
  const month = today.slice(0, 7);
  const [pickedBrand, setPickedBrand] = useState<string | null>(null);
  const brandId = pickedBrand && brands.some((b) => b.id === pickedBrand) ? pickedBrand : pickDefaultBrandId(brands, sessions, loadRememberedBrandId(), today);
  const brand = brands.find((b) => b.id === brandId);

  // Ca/slot của brand này chỉ giữ ĐÚNG SÀN (như Dashboard); brand khác giữ nguyên vì engine đọc lịch toàn agency.
  const sess = useMemo(() => sessions.filter((s) => s.brandId !== brandId || platformOf(s) === platform), [sessions, brandId, platform]);
  const slots = useMemo(() => shiftSlots.filter((sl) => sl.brandId !== brandId || platformOf(sl) === platform), [shiftSlots, brandId, platform]);
  const brandSessions = useMemo(() => sess.filter((s) => s.brandId === brandId), [sess, brandId]);

  const [plan, setPlan] = useState<{ plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null>(null);
  const [planKey, setPlanKey] = useState<string | null>(null);
  const key = `${brandId}|${month}|${platform}`;
  const planLoading = planKey !== key;
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    monthPlanRead.take(brandId, month, platform).catch(() => null).then((p) => {
      if (!alive) return;
      setPlan(p);
      setPlanKey(key);
    });
    return () => {
      alive = false;
    };
  }, [brandId, month, platform, key]);

  const camp = useMemo(() => effectiveCamp(plan?.plan.campRanges), [plan]);
  const locked = !planLoading && plan?.plan.status === "locked";
  const rr = useMemo(() => (locked && plan ? planRunRate(month, plan.slots, slots, brandSessions, today, camp) : null), [locked, plan, month, slots, brandSessions, today, camp]);
  const outlook = useMemo(() => {
    if (!rr) return null;
    const open = slots.filter((sl) => sl.brandId === brandId && sl.status === "open" && !sl.sessionId);
    return monthOutlook(month, today, brandSessions, open, null, camp);
  }, [rr, slots, brandId, month, today, brandSessions, camp]);
  const projection = useMemo(() => projectMonthEnd(rr, outlook), [rr, outlook]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        icon={Activity}
        title="Hỗ Trợ Vận Hành"
        description="Kỳ vọng cho các ca sắp live trong 7 ngày tới, để ops điều ca và so với số đang chạy trong phiên. Chỉ ca của sàn đang chọn ở workspace — năng suất hai sàn khác nhau nên không có benchmark chung."
        actions={
          <>
            <select value={brandId} onChange={(e) => { setPickedBrand(e.target.value); rememberBrandId(e.target.value); }} className={selectCls} aria-label="Brand">
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </>
        }
      />
      {brand && (
        <OpsSupport
          show="benchmark"
          rr={rr}
          projection={projection}
          brandId={brandId}
          brandName={`${brand.name} · ${platform}`}
          platform={platform}
          month={month}
          plan={plan}
          camp={camp}
          planLoading={planLoading}
          sessions={sess}
          shiftSlots={slots}
          promoSchemes={promoSchemes}
          engineParams={engineParams}
          onOpenMonthPlan={() => onOpenMonthPlan(brandId, platform)}
          onOpenSession={onOpenSession}
        />
      )}
    </div>
  );
}
