import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Gauge, Info, Send } from "lucide-react";
import type { Brand, BrandChannel, BrandMonthPlan, BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../types";
import { PageHeader } from "./common/PageHeader";
import { MonthPicker } from "./common/MonthPicker";
import { useTooltip } from "./dashboard/shared";
import { AccountCard } from "./runrate/AccountCard";
import { AccountDetail } from "./runrate/AccountDetail";
import { toUpdateAccount, UpdateComposer } from "./runrate/UpdateComposer";
import type { Lens } from "./runrate/lenses";
import type { AccountVM } from "./runrate/types";
import { defaultViewMonth } from "../lib/defaultMonth";
import { effectiveCamp } from "../lib/campaignDays";
import { platformsOfBrand } from "../lib/channels";
import { downloadSheetsAsXlsx } from "../lib/exportXlsx";
import { errorMessage } from "../lib/errorMessage";
import { monthPlanRead, planStatusesRead } from "../lib/db/monthPlans";
import { todayVn } from "../lib/performance/brandCommitment";
import { monthEndOf } from "../lib/performance/ceoBrief";
import { dataCoverage } from "../lib/performance/channelHealth";
import { planRunRate } from "../lib/performance/planRunRate";
import { buildAccountRunRate, monthActualOf, resolveAsOf, runRateExportSheets } from "../lib/performance/runRateUpdate";
import { brandPlatformKey, channelTitle, platformOf, REPORT_PLATFORMS, type ReportPlatform } from "../lib/reportPlatform";
import { profileOf } from "../lib/platforms/profiles";
import { useToast } from "../hooks/useToast";

// Run-rate (11/10/2026): màn để CẬP NHẬT kết quả đạt được cho sếp + brand — mỗi ngày / mỗi tuần / khi vào đợt campaign — theo
// tháng · đợt campaign · ngày · ca. Số đi qua đúng một nguồn `planRunRate` (target = Σ target ca của Kế Hoạch Tháng đã chốt,
// luật 28/09); lib/performance/runRateUpdate.ts chỉ cắt ở ngày "số tới" và soạn bản tin. Mỗi tài khoản (brand × sàn) đứng riêng:
// KHÔNG có số nào cộng hai tài khoản, càng không cộng hai sàn.

interface RunRateBoardProps {
  sessions: LiveSession[];
  brands: Brand[];
  brandChannels: BrandChannel[];
  shiftSlots: ShiftSlot[];
  onNavigate: (tab: string) => void;
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
}

export function RunRateBoard({ sessions, brands, brandChannels, shiftSlots, onNavigate, onOpenMonthPlan }: RunRateBoardProps) {
  const today = todayVn();
  const { showToast } = useToast();
  const tooltip = useTooltip();
  const [month, setMonth] = useState(() => defaultViewMonth(today, sessions));
  const [asOfPick, setAsOfPick] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens>("month");
  const [composerOpen, setComposerOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  // Kế hoạch + ca kế hoạch gắn nhãn tháng đã đọc: đổi tháng thì dữ liệu cũ tự bị coi là chưa có (không cần reset trong effect).
  const [planData, setPlanData] = useState<{ month: string; plans: Map<string, BrandMonthPlan> } | null>(null);
  const [slotData, setSlotData] = useState<{ month: string; planKey: string; slots: Map<string, BrandMonthPlanSlot[]> } | null>(null);
  const [loadError, setLoadError] = useState<{ month: string; text: string } | null>(null);

  const accounts = useMemo(
    () =>
      brands.flatMap((b) => {
        const ps = platformsOfBrand(brandChannels, b.id);
        return ps.map((p) => ({ brand: b, platform: p, key: brandPlatformKey(b.id, p), multi: ps.length > 1 }));
      }),
    [brands, brandChannels]
  );

  const plans = planData?.month === month ? planData.plans : null;
  useEffect(() => {
    let alive = true;
    planStatusesRead.take(month)
      .then((m) => alive && setPlanData({ month, plans: m }))
      .catch((e) => {
        if (!alive) return;
        setPlanData({ month, plans: new Map() });
        setLoadError({ month, text: errorMessage(e) });
      });
    return () => { alive = false; };
  }, [month]);

  // Chỉ kênh ĐÃ CHỐT mới có ca kế hoạch để tính run-rate (kế hoạch nháp chưa có target chính thức).
  const lockedKeys = useMemo(() => (plans ? accounts.filter((a) => plans.get(a.key)?.status === "locked").map((a) => a.key).join(",") : null), [accounts, plans]);
  useEffect(() => {
    if (lockedKeys == null) return;
    let alive = true;
    const locked = accounts.filter((a) => lockedKeys.split(",").includes(a.key));
    Promise.all(locked.map((a) => monthPlanRead.take(a.brand.id, month, a.platform).then((r): [string, BrandMonthPlanSlot[]] => [a.key, r?.slots ?? []]).catch((e): [string, BrandMonthPlanSlot[]] => {
      if (alive) setLoadError({ month, text: errorMessage(e) });
      return [a.key, []];
    }))).then((rows) => alive && setSlotData({ month, planKey: lockedKeys, slots: new Map(rows) }));
    return () => { alive = false; };
  }, [lockedKeys, accounts, month]);
  const slotsReady = lockedKeys != null && slotData?.month === month && slotData.planKey === lockedKeys;

  const vms: AccountVM[] = useMemo(() => {
    const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
    return accounts.map((a): AccountVM => {
      const plan = plans?.get(a.key);
      const chSessions = sessions.filter((s) => s.brandId === a.brand.id && platformOf(s) === a.platform);
      const coverage = dataCoverage(chSessions, today, mStart, mEnd);
      const base = {
        key: a.key,
        brand: a.brand,
        platform: a.platform,
        name: channelTitle(a.brand.name, a.platform, a.multi),
        planStatus: (plan ? plan.status : "none") as AccountVM["planStatus"],
        actualOnly: monthActualOf(chSessions, month, today),
        completeThrough: coverage.completeThrough,
        missingSessions: coverage.missingSessions,
        oldestMissing: coverage.oldestMissing
      };
      if (!plans) return { ...base, report: null, loading: true };
      if (plan?.status !== "locked") return { ...base, report: null, loading: false };
      if (!slotsReady) return { ...base, report: null, loading: true };
      const slots = slotData!.slots.get(a.key) ?? [];
      if (slots.length === 0) return { ...base, report: null, loading: false };
      const rr = planRunRate(month, slots, shiftSlots.filter((sl) => sl.brandId === a.brand.id), chSessions, today, effectiveCamp(plan.campRanges));
      const asOf = resolveAsOf(month, rr.through, asOfPick, coverage.completeThrough ?? rr.through);
      return { ...base, report: buildAccountRunRate(rr, asOf), loading: false };
    });
  }, [accounts, plans, slotsReady, slotData, sessions, shiftSlots, month, today, asOfPick]);

  const selected = vms.find((v) => v.key === selectedKey && v.report) ?? vms.find((v) => v.report) ?? null;
  const groups = REPORT_PLATFORMS.map((p) => ({ platform: p, items: vms.filter((v) => v.platform === p) })).filter((g) => g.items.length > 0);
  const anyReport = vms.some((v) => v.report);
  const stillLoading = vms.some((v) => v.loading);
  const error = loadError?.month === month ? loadError.text : null;

  // Chọn một tài khoản ⇒ cuộn xuống phần chi tiết của nó (trang dài: 7 thẻ rồi mới tới chi tiết).
  const pickAccount = (key: string) => {
    setSelectedKey(key);
    window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const exportXlsx = () => {
    const sheets = runRateExportSheets(vms.map(toUpdateAccount));
    const stamp = asOfPick ?? today;
    downloadSheetsAsXlsx(sheets, `RunRate_${month}_${stamp}.xlsx`).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  return (
    <div className="space-y-5" onMouseMove={tooltip.onMove} onMouseLeave={tooltip.onLeave}>
      <PageHeader
        icon={Gauge}
        title="Run-rate"
        description="Kết quả đạt được so với target đã chốt, theo tháng, đợt campaign, ngày và từng ca. Xem xong bấm “Soạn cập nhật” để có sẵn bản tin gửi sếp và brand."
        actions={
          <>
            <MonthPicker value={month} onChange={(m) => { setMonth(m); setAsOfPick(null); }} max={today.slice(0, 7)} />
            <button type="button" onClick={exportXlsx} disabled={!anyReport} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40 min-h-[40px]">
              <Download className="w-4 h-4" />Tải Excel
            </button>
            <button type="button" onClick={() => setComposerOpen(true)} disabled={!anyReport} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-40 min-h-[40px] shadow">
              <Send className="w-4 h-4" />Soạn cập nhật
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--text-muted)]">Số tới ngày</span>
            <div role="group" aria-label="Chọn ngày số tới" className="inline-flex items-center p-0.5 rounded-xl bg-[var(--surface-base)] border border-[var(--border)]">
              <button type="button" aria-pressed={asOfPick == null} onClick={() => setAsOfPick(null)} className={`px-3 py-1.5 rounded-[10px] text-xs font-bold min-h-[30px] transition-colors ${asOfPick == null ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>Ngày đủ số</button>
              <label className={`inline-flex items-center px-1 rounded-[10px] ${asOfPick != null ? "bg-[var(--accent)]/15" : ""}`}>
                <span className="sr-only">Chọn một ngày cụ thể</span>
                <input
                  type="date"
                  value={asOfPick ?? ""}
                  min={`${month}-01`}
                  max={today < monthEndOf(`${month}-01`) ? today : monthEndOf(`${month}-01`)}
                  onChange={(e) => setAsOfPick(e.target.value || null)}
                  className="bg-transparent text-xs font-bold text-[var(--text)] px-1.5 py-1 focus:outline-none min-h-[30px]"
                />
              </label>
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-[var(--text-faint)] max-w-2xl leading-snug">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>“Ngày đủ số” = ngày cuối mà ít nhất 90% giờ ca đã chạy có số, tính riêng từng tài khoản. Chọn ngày cụ thể để chốt cùng một mốc cho mọi tài khoản (ngày chưa có số tự lùi về ngày cuối có số).</span>
          </p>
        </div>
      </PageHeader>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">Không đọc được Kế Hoạch Tháng: {error}</div>}

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">Chưa có tài khoản (brand × sàn) nào. Thêm kênh cho brand ở CRM.</div>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.platform} aria-label={`Tài khoản ${profileOf({ platform: g.platform }).label}`} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-sm font-black text-[var(--text)]">{profileOf({ platform: g.platform }).label}</h3>
                <span className="text-xs text-[var(--text-faint)]">{g.items.length} tài khoản · số hiệu suất của hai sàn không cộng với nhau</span>
              </div>
              {/* Điện thoại: một hàng cuộn ngang (7 thẻ xếp dọc đẩy phần chi tiết đi quá xa); từ sm: lưới. */}
              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 xl:grid-cols-4">
                {g.items.map((vm) => (
                  <div key={vm.key} className="snap-start shrink-0 w-[82%] sm:w-auto min-w-0 flex flex-col [&>*]:flex-1">
                    <AccountCard vm={vm} selected={selected?.key === vm.key} onSelect={() => pickAccount(vm.key)} onOpenMonthPlan={onOpenMonthPlan} />
                  </div>
                ))}
              </div>
            </section>
          ))}

          {selected ? (
            <div ref={detailRef} className="scroll-mt-4">
              <AccountDetail key={selected.key} vm={selected} lens={lens} onLens={setLens} onNavigate={onNavigate} />
            </div>
          ) : (
            !stillLoading && (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center space-y-1.5">
                <p className="text-sm font-bold text-[var(--text)]">Tháng này chưa có tài khoản nào có Kế Hoạch Tháng đã chốt.</p>
                <p className="text-sm text-[var(--text-muted)]">Run-rate là thực đạt ÷ target của các ca đã chốt, nên cần chốt kế hoạch trước. Mở thẻ tài khoản ở trên để sang Kế Hoạch Tháng.</p>
              </div>
            )
          )}
        </>
      )}

      <UpdateComposer open={composerOpen} onClose={() => setComposerOpen(false)} accounts={vms} month={month} today={today} selectedKey={selected?.key ?? null} onExport={exportXlsx} />
      {tooltip.node}
    </div>
  );
}
