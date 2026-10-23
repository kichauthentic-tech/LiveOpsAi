import type { Brand, BrandChannel, BrandPlatformRate, BrandPlatformRateHistoryEntry, LiveSession, SessionFinance, ShiftSlot, Talent, TalentRateHistoryEntry, UserRole } from "../../types";
import type { EngineParams } from "../../lib/scheduling/engineParams";
import type { TabPrefetchCtx } from "../../lib/db/prefetch";
import { todayVn } from "../../lib/performance/brandCommitment";
import type { ReportPlatform } from "../../lib/reportPlatform";
import { AgencyDashboard, prefetchAgencyDashboard } from "../AgencyDashboard";
import { BrandPortal } from "./BrandPortal";

// Dashboard trong workspace brand. Role brand: cổng brand (bản tin ops gửi + giờ cam kết + lịch + báo cáo, không nhãn/xác suất — user
// chốt 21/10). Ops: CHÍNH tab Brand của Dashboard agency, khoá vào brand này (23/10 — user "gộp hẳn" màn Chi tiết kênh 21/10 vào
// Dashboard: một chỗ xem duy nhất; cây GMV/giờ, phương án, đề xuất tối ưu, bản tin chuyển vào tab Brand).

interface BrandDashboardProps {
  brand: Brand;
  /** Sàn của workspace đang mở. */
  platform: ReportPlatform;
  /** Sàn brand có (cổng brand). */
  platforms: ReportPlatform[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  engineParams: EngineParams;
  currentRole: UserRole;
  brandChannels: BrandChannel[];
  talents: Talent[];
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  talentRateHistory: TalentRateHistoryEntry[];
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
  onNavigate: (tab: string) => void;
  /** Cổng brand: mở Report Tháng. */
  onOpenReport?: () => void;
}

export function prefetchBrandDashboard(ctx: TabPrefetchCtx): void {
  if (ctx.role === "brand") return;
  prefetchAgencyDashboard(ctx);
}

export default function BrandDashboard(p: BrandDashboardProps) {
  if (p.currentRole === "brand") return <BrandPortal brandId={p.brand.id} brandName={p.brand.name} platform={p.platform} platforms={p.platforms} sessions={p.sessions} onOpenReport={p.onOpenReport} />;
  return (
    <AgencyDashboard
      key={`${p.brand.id}|${p.platform}`}
      lockBrandId={p.brand.id}
      platform={p.platform}
      today={todayVn()}
      brands={[p.brand]}
      brandChannels={p.brandChannels}
      sessions={p.sessions}
      shiftSlots={p.shiftSlots}
      engineParams={p.engineParams}
      currentRole={p.currentRole}
      talents={p.talents}
      financeRecords={p.financeRecords}
      brandPlatformRates={p.brandPlatformRates}
      brandPlatformRateHistory={p.brandPlatformRateHistory}
      talentRateHistory={p.talentRateHistory}
      onOpenMonthPlan={p.onOpenMonthPlan}
      onNavigate={p.onNavigate}
    />
  );
}
