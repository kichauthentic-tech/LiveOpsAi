import React from "react";
import { AlertTriangle, CalendarRange, Target } from "lucide-react";
import { runRateVerdict } from "../../lib/performance/runRateUpdate";
import { BrandLogo } from "../ui/BrandLogo";
import { PlatformChip } from "../common/PlatformChip";
import { chartColor, ddmm, money, pct } from "../dashboard/shared";
import { PctBar, TONE_VAR, TonePill } from "./parts";
import type { AccountVM } from "./types";

const tabular = "tabular-nums";

// Có ca đã vào run-rate nằm sau ngày đủ số (tính theo từng ca) — số có thể còn đổi khi ca được đối soát.
export const isTentative = (a: AccountVM) => (a.report?.tail.shifts ?? 0) > 0;

export const AccountCard: React.FC<{ vm: AccountVM; selected: boolean; onSelect: () => void; onOpenMonthPlan: (brandId: string, platform: AccountVM["platform"]) => void }> = ({ vm, selected, onSelect, onOpenMonthPlan }) => {
  const r = vm.report;
  const color = chartColor(vm.brand.name);
  const v = runRateVerdict(r?.total.runRate ?? null);
  const base = `group relative text-left rounded-2xl border bg-[var(--surface)] p-4 flex flex-col gap-3 min-w-0 transition-all overflow-hidden ${selected ? "border-[var(--accent)] ring-1 ring-[var(--accent)] shadow-lg" : "border-[var(--border)] hover:border-[var(--text-faint)]"}`;
  const head = (
    <div className="flex items-center gap-2.5 min-w-0">
      <BrandLogo brand={vm.brand} size="md" />
      <div className="min-w-0">
        <div className="text-sm font-black text-[var(--text)] truncate">{vm.brand.name}</div>
        <div className="mt-0.5"><PlatformChip platform={vm.platform} /></div>
      </div>
    </div>
  );
  const accent = <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />;

  if (vm.loading) {
    return (
      <div className={`${base} animate-pulse`} aria-busy="true">
        {accent}{head}
        <div className="h-9 w-24 rounded-lg bg-[var(--surface-elevated)]" />
        <div className="h-2 rounded-full bg-[var(--surface-elevated)]" />
        <div className="h-3 w-2/3 rounded bg-[var(--surface-elevated)]" />
      </div>
    );
  }

  if (!r) {
    return (
      <div className={`${base} !cursor-default`}>
        {accent}{head}
        <div>
          <div className="text-sm font-bold text-[var(--text)]">{vm.planStatus === "draft" ? "Kế hoạch tháng còn nháp" : vm.planStatus === "locked" ? "Kế hoạch chưa có ca" : "Chưa lập Kế Hoạch Tháng"}</div>
          <p className="text-xs text-[var(--text-faint)] mt-1 leading-snug">
            Run-rate cần target của các ca đã chốt.{vm.actualOnly > 0 ? ` Tháng này đã đạt ${money(vm.actualOnly)}.` : ""}
          </p>
        </div>
        <button type="button" onClick={() => onOpenMonthPlan(vm.brand.id, vm.platform)} className="mt-auto inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] min-h-[32px]">
          <CalendarRange className="w-3.5 h-3.5" />Mở Kế Hoạch Tháng
        </button>
      </div>
    );
  }

  const t = r.total;
  const tentative = isTentative(vm);
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={base}>
      {accent}
      <div className="flex items-start justify-between gap-2">
        {head}
        {tentative && <span className="text-[11px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-1.5 py-0.5 whitespace-nowrap" title={`Gồm ${r.tail.shifts} ca sau ngày đủ số${r.tail.unreconciled > 0 ? `, ${r.tail.unreconciled} chưa đối soát` : ""} — số còn đổi khi đối soát`}>Gồm ca mới</span>}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className={`text-4xl font-black leading-none ${tabular}`} style={{ color: TONE_VAR[v.tone] }}>{t.runRate == null ? "—" : Math.round(t.runRate * 100)}<span className="text-lg text-[var(--text-muted)] font-extrabold">{t.runRate == null ? "" : "%"}</span></div>
          <div className="text-[11px] text-[var(--text-faint)] mt-1">run-rate{r.asOf ? ` · số tới ${ddmm(r.asOf)}` : ""}</div>
        </div>
        <TonePill tone={v.tone}>{v.label}</TonePill>
      </div>
      <PctBar value={t.runRate} tone={v.tone} label={`Run-rate ${vm.name}: ${pct(t.runRate)}`} />
      <dl className="grid grid-cols-2 gap-x-3 text-xs">
        <div><dt className="text-[var(--text-faint)]">Đạt</dt><dd className={`font-bold text-[var(--text)] ${tabular}`}>{money(t.actual)}</dd></div>
        <div><dt className="text-[var(--text-faint)]">Kỳ vọng tới nay</dt><dd className={`font-bold text-[var(--text-muted)] ${tabular}`}>{money(t.targetToDate)}</dd></div>
      </dl>
      <div className="border-t border-[var(--border-muted)] pt-2.5 space-y-1 text-xs text-[var(--text-muted)]">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-[var(--text-faint)] shrink-0" />Target tháng</span>
          <b className={`text-[var(--text)] ${tabular}`}>{money(t.target)}</b>
        </div>
        {t.keepPace != null && (
          <div className="flex items-center justify-between gap-2">
            <span className="pl-5">Giữ nhịp → cuối tháng</span>
            <b className={`text-[var(--text)] ${tabular}`}>~{money(t.keepPace)}</b>
          </div>
        )}
      </div>
      {vm.missingSessions > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-300 leading-snug">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{vm.missingSessions} ca đã chạy chưa có số{vm.oldestMissing ? ` (cũ nhất ${ddmm(vm.oldestMissing)})` : ""}</span>
        </div>
      )}
    </button>
  );
};
