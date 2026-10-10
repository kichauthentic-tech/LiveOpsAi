import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { Brand, BrandMonthPlan, BrandMonthPlanSlot, LiveSession, PromoScheme, ShiftSlot } from "../types";
import { EngineParams } from "../lib/scheduling/engineParams";
import { monthPlanRead } from "../lib/db/monthPlans";
import { effectiveCamp } from "../lib/campaignDays";
import { todayVn } from "../lib/performance/brandCommitment";
import { monthOutlook } from "../lib/performance/ceoBrief";
import { planRunRate, projectMonthEnd } from "../lib/performance/planRunRate";
import { platformOf, REPORT_PLATFORMS, type ReportPlatform } from "../lib/reportPlatform";
import { loadRememberedBrandId, pickDefaultBrandId, rememberBrandId } from "../lib/defaultBrand";
import OpsSupport from "./OpsSupport";

// Hỗ Trợ Vận Hành — 08/10 gộp vào Bảng Vận Hành (user: hai màn trùng nhau, cùng là "ca sắp tới"): nằm ở cuối Bảng Vận Hành như một khối
// thu gọn, tự chọn brand × sàn (Bảng Vận Hành không có bộ chọn sàn của workspace), chỉ nạp kế hoạch/benchmark khi mở khối.
// (Trước đó: tab agency, khôi phục 07/10 theo user chốt): benchmark ca sắp live 7 ngày tới của MỘT brand × sàn. Không
// còn nằm ở Dashboard brand (Dashboard là màn xem số, brand cũng thấy; benchmark là công cụ của ops lúc điều ca). Tính run-rate,
// dự kiến cuối tháng và hệ số k đúng như Dashboard (planRunRate + projectMonthEnd) để benchmark hai nơi không lệch số.

interface Props {
  /** Sàn mặc định khi mở khối. */
  platform: ReportPlatform;
  /** Brand có kênh trên một sàn — dùng khi đổi sàn trong khối. */
  brandsOn: (platform: ReportPlatform) => Brand[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  promoSchemes: PromoScheme[];
  engineParams: EngineParams;
  onOpenSession: (sessionId: string) => void;
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
}

const selectCls = "bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

export default function OpsSupportTab({ platform: defaultPlatform, brandsOn, sessions, shiftSlots, promoSchemes, engineParams, onOpenSession, onOpenMonthPlan }: Props) {
  const today = todayVn();
  const month = today.slice(0, 7);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<ReportPlatform>(defaultPlatform);
  const brands = useMemo(() => brandsOn(platform), [brandsOn, platform]);
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
  const planLoading = open && planKey !== key;
  useEffect(() => {
    if (!open || !brandId) return;
    let alive = true;
    monthPlanRead.take(brandId, month, platform).catch(() => null).then((p) => {
      if (!alive) return;
      setPlan(p);
      setPlanKey(key);
    });
    return () => {
      alive = false;
    };
  }, [open, brandId, month, platform, key]);

  const camp = useMemo(() => effectiveCamp(plan?.plan.campRanges), [plan]);
  const locked = !planLoading && plan?.plan.status === "locked";
  const rr = useMemo(() => (locked && plan ? planRunRate(month, plan.slots, slots, brandSessions, today, camp) : null), [locked, plan, month, slots, brandSessions, today, camp]);
  const outlook = useMemo(() => {
    if (!rr) return null;
    const open = slots.filter((sl) => sl.brandId === brandId && sl.status === "open" && !sl.sessionId);
    return monthOutlook(month, today, brandSessions, open, null, camp, engineParams);
  }, [rr, slots, brandId, month, today, brandSessions, camp, engineParams]);
  const projection = useMemo(() => projectMonthEnd(rr, outlook), [rr, outlook]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full p-4 sm:p-5 flex items-center gap-3 text-left">
        <Activity className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-black text-[var(--text)]">Kỳ vọng các ca sắp live (7 ngày tới)</span>
          <span className="block text-xs text-[var(--text-muted)] mt-0.5">
            Hỗ Trợ Vận Hành cũ: so số đang chạy trong phiên với kỳ vọng của từng ca, để đẩy traffic hoặc hãm ads. Chọn brand và sàn — năng suất hai sàn khác nhau nên không có benchmark chung.
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select value={platform} onChange={(e) => { setPlatform(e.target.value as ReportPlatform); setPickedBrand(null); }} className={selectCls} aria-label="Sàn">
              {REPORT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={brandId} onChange={(e) => { setPickedBrand(e.target.value); rememberBrandId(e.target.value); }} className={selectCls} aria-label="Brand">
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
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
      )}
    </div>
  );
}
