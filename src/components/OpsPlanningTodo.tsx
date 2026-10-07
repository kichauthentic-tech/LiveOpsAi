import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Layers, Target } from "lucide-react";
import type { Brand, BrandChannel, BrandMonthPlan, BrandMonthlyCommitment, LiveSession, ShiftRegistration, ShiftSlot, Talent } from "../types";
import { commitmentsRead } from "../lib/db/brandContracts";
import { planStatusesRead } from "../lib/db/monthPlans";
import { platformsOfBrand } from "../lib/channels";
import { channelTitle, brandPlatformKey, type ReportPlatform } from "../lib/reportPlatform";
import { SchedulingGap, computeSchedulingGaps, todayVn } from "../lib/performance/brandCommitment";
import { eligibleSlots } from "../lib/performance/bulkFinalize";
import { FATIGUE_WEEK_HOURS } from "../lib/performance/hostSuggestion";
import { talentShortName } from "../lib/talentName";
import { fmtMonth } from "../lib/format";
import type { TabPrefetchCtx } from "../lib/db/prefetch";
import { BulkFinalizePanel } from "./BulkFinalizePanel";
import { MonthPicker } from "./common/MonthPicker";

// Việc lập kế hoạch ca của ops — 08/10 chuyển từ màn "Nhân sự ca" (đã bỏ vì trùng Bảng Vận Hành / Cửa sổ Ca Live) sang cuối
// Bảng Vận Hành. Chỉ giữ 4 thứ mà chỗ khác không có: (1) kênh chưa chốt Kế Hoạch Tháng sau, (2) brand còn thiếu giờ so với cam
// kết hợp đồng, (3) ca mở chưa đủ người đăng ký, (4) chốt hàng loạt. Chốt từng ca: bấm dòng ca chưa có người ở Bảng Vận Hành
// (SlotDetailModal, có gợi ý Host theo hiệu suất + cảnh báo mệt).

interface Props {
  brands: Brand[];
  channels: BrandChannel[];
  sessions: LiveSession[];
  talents: Talent[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  fatigueWeekHours?: number;
  onFinalizeSlot: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  /** Mở Kế Hoạch Tháng của đúng kênh (brand × sàn) chưa chốt. */
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
}

// "YYYY-MM" của tháng sau `today` (YYYY-MM-DD) — dùng chung cho effect và hàm nạp trước để key khớp.
function nextMonthKey(today: string): string {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

// Lượt đọc lúc mở màn — nạp trước trong lúc chờ đợt nạp chung (lib/db/prefetch.ts). Role chưa biết thì coi như ops.
export function prefetchOpsPlanning({ role }: TabPrefetchCtx): void {
  if (role && role !== "ceo" && role !== "operations" && role !== "admin") return;
  commitmentsRead.prefetch();
  planStatusesRead.prefetch(nextMonthKey(todayVn()));
}

const num = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export default function OpsPlanningTodo({ brands, channels, sessions, talents, shiftSlots, shiftRegistrations, fatigueWeekHours = FATIGUE_WEEK_HOURS, onFinalizeSlot, onOpenMonthPlan }: Props) {
  const today = todayVn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [bulkOpen, setBulkOpen] = useState(false);

  // Cam kết hợp đồng (0081): RLS chỉ cho ceo/admin/operations đọc. Lỗi/thiếu quyền chỉ ẩn khối cam kết, không chặn việc khác.
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[]>([]);
  useEffect(() => {
    let alive = true;
    commitmentsRead.take().then((rows) => { if (alive) setCommitments(rows); }).catch(() => { if (alive) setCommitments([]); });
    return () => { alive = false; };
  }, []);

  const [nextPlans, setNextPlans] = useState<Map<string, BrandMonthPlan> | null>(null);
  useEffect(() => {
    let alive = true;
    planStatusesRead.take(nextMonthKey(today)).then((map) => { if (alive) setNextPlans(map); }).catch(() => { if (alive) setNextPlans(null); });
    return () => { alive = false; };
  }, [today]);

  // Kế hoạch theo sàn (0140): VERA chốt TikTok mà chưa chốt Shopee vẫn phải nhắc "VERA Shopee".
  const planMissing = useMemo(
    () =>
      nextPlans
        ? brands.flatMap((b) => {
            const ps = platformsOfBrand(channels, b.id, false);
            return ps
              .filter((p) => nextPlans.get(brandPlatformKey(b.id, p))?.status !== "locked")
              .map((p) => ({ brandId: b.id, platform: p, label: ps.length > 1 ? `${b.name} ${p}` : b.name }));
          })
        : [],
    [nextPlans, brands, channels]
  );

  const registrationsBySlot = useMemo(() => {
    const map = new Map<string, ShiftRegistration[]>();
    for (const r of shiftRegistrations) {
      const list = map.get(r.slotId) ?? [];
      list.push(r);
      map.set(r.slotId, list);
    }
    return map;
  }, [shiftRegistrations]);

  // Ca mở từ hôm nay của tháng đang xem: 0 đăng ký = thiếu cả Host lẫn Trợ live; đúng 1 = đủ chọn Host nhưng chưa còn ai làm Trợ live.
  const { missingBoth, missingCoHost } = useMemo(() => {
    const open = shiftSlots.filter((s) => s.status === "open" && s.date.startsWith(month) && s.date >= today);
    return {
      missingBoth: open.filter((s) => (registrationsBySlot.get(s.id) ?? []).length === 0).length,
      missingCoHost: open.filter((s) => (registrationsBySlot.get(s.id) ?? []).length === 1).length
    };
  }, [shiftSlots, month, today, registrationsBySlot]);

  // Cam kết của THÁNG ĐANG XEM, đã trừ phần ca đã mở chờ chốt ⇒ việc còn phải làm thật, không phải tổng khoảng cách với cam kết.
  const gaps = useMemo<SchedulingGap[]>(
    () =>
      computeSchedulingGaps(commitments, Object.fromEntries(brands.map((b) => [b.id, b.name])), sessions, shiftSlots, `${month}-01`)
        .filter((g) => g.committedHours > 0),
    [commitments, brands, sessions, shiftSlots, month]
  );
  const gapsToShow = useMemo(
    () => gaps.filter((g) => g.hoursStillToOpen > 0.01 || g.unconfirmedSessions > 0 || (g.monthClosed && g.gapHours > 0.01)),
    [gaps]
  );

  const bulkCandidateCount = useMemo(
    () => eligibleSlots(shiftSlots, registrationsBySlot, month, today).length,
    [shiftSlots, registrationsBySlot, month, today]
  );

  // Mốc lịch sử hiệu suất khi gợi ý host: 90 ngày gần nhất (lấy cả đời thì phong độ cũ kéo trung bình).
  const perfSince = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 90);
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
  }, [today]);
  const talentNameById = useMemo(() => new Map(talents.map((t) => [t.id, talentShortName(t)])), [talents]);

  const workCount = planMissing.length + gapsToShow.length + (missingBoth > 0 ? 1 : 0) + (missingCoHost > 0 ? 1 : 0) + (bulkCandidateCount > 0 ? 1 : 0);

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="w-4 h-4 text-[var(--accent-text)]" />
        <h3 className="text-sm font-black text-[var(--text)]">Việc lập kế hoạch ca</h3>
        {workCount > 0 ? (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">{workCount} việc</span>
        ) : (
          <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> không còn việc tồn đọng</span>
        )}
        <div className="ml-auto">
          <MonthPicker value={month} onChange={(m) => { setMonth(m); setBulkOpen(false); }} />
        </div>
      </div>

      {planMissing.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-900 rounded-xl px-4 py-2.5 text-xs text-amber-200 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Tháng sau chưa chốt kế hoạch ca:</span>
          {planMissing.map((m, i) => (
            <React.Fragment key={`${m.brandId}|${m.platform}`}>
              <button
                onClick={() => onOpenMonthPlan(m.brandId, m.platform)}
                className="min-h-6 -mx-0.5 px-0.5 rounded font-bold text-amber-200 underline underline-offset-2"
                title="Mở Kế Hoạch Tháng của kênh này"
              >
                {m.label}
              </button>
              {i < planMissing.length - 1 ? "," : "."}
            </React.Fragment>
          ))}
        </div>
      )}

      {(missingBoth > 0 || missingCoHost > 0) && (
        <div className="bg-rose-950/90 border border-rose-900 rounded-xl px-4 py-2.5 text-sm text-rose-200 flex flex-wrap items-center gap-x-3 gap-y-1">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {missingBoth > 0 && <span><span className="font-bold">{missingBoth}</span> ca chưa có ai đăng ký</span>}
          {missingBoth > 0 && missingCoHost > 0 && <span className="text-rose-700">·</span>}
          {missingCoHost > 0 && <span className="text-amber-200"><span className="font-bold">{missingCoHost}</span> ca thiếu Trợ live</span>}
          <span className="text-rose-300 text-xs">— {fmtMonth(month)}, từ hôm nay. Bấm dòng ca chưa có người ở trên để chốt.</span>
        </div>
      )}

      {gapsToShow.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)]">
            <Target className="w-4 h-4 text-blue-400" /> Cam kết hợp đồng tháng {fmtMonth(month)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {gapsToShow.map((g) => {
              const done = g.hoursStillToOpen <= 0.01;
              return (
                <div key={brandPlatformKey(g.brandId, g.platform)} className={`rounded-xl p-3 border ${done ? "bg-emerald-950/30 border-emerald-900" : "bg-rose-950/25 border-rose-900"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--text)] truncate">{channelTitle(g.brandName, g.platform, false)}</span>
                    <span className="text-[11px] text-[var(--text-faint)] shrink-0">cam kết {num(g.committedHours)}h</span>
                  </div>
                  <p className={`text-lg font-black mt-0.5 ${done ? "text-emerald-400" : "text-rose-400"}`}>
                    {g.monthClosed ? `Tháng đã đóng · hụt ${num(Math.max(g.gapHours, 0))}h` : done ? "Đã mở đủ" : `Cần mở thêm ${num(g.hoursStillToOpen)}h`}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
                    Đã live {num(g.deliveredHours)}h · đã chốt chưa live {num(g.scheduledHours)}h · đang mở chờ chốt {num(g.openSlotHours)}h ({g.openSlotCount} ca)
                    {g.unconfirmedSessions > 0 && (
                      <span className="text-amber-300"> · {num(g.unconfirmedHours)}h ({g.unconfirmedSessions} ca) đã qua giờ chưa có số — xác nhận hoặc huỷ trước khi mở bù</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">Giờ ca theo lịch, cùng loại giờ dùng để tính tiền brand. Mở thêm ca ở Lịch & Studio; đặt cam kết ở CRM hoặc Kế Hoạch Tháng.</p>
        </div>
      )}

      {bulkCandidateCount > 0 && !bulkOpen && (
        <button
          onClick={() => setBulkOpen(true)}
          className="w-full flex items-center justify-center gap-2 bg-[var(--surface-base)] border border-[var(--border)] hover:border-blue-700 rounded-xl px-4 py-3 text-sm font-bold text-[var(--text)] transition-colors"
        >
          <Layers className="w-4 h-4 text-blue-400" />
          Chốt lịch hàng loạt
          <span className="text-xs font-normal text-[var(--text-muted)]">— {bulkCandidateCount} ca đang mở đã có người đăng ký</span>
        </button>
      )}

      {bulkOpen && (
        <BulkFinalizePanel
          slots={shiftSlots}
          registrationsBySlot={registrationsBySlot}
          sessions={sessions}
          talentNameById={talentNameById}
          month={month}
          today={today}
          perfSince={perfSince}
          fatigueWeekHours={fatigueWeekHours}
          onFinalizeSlot={onFinalizeSlot}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </section>
  );
}
