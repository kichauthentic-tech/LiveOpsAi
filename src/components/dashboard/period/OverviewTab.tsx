import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Brand } from "../../../types";
import { accountActions, type AccountRow, type PlatformPace, type RowTone } from "../../../lib/performance/accountOverview";
import { LEVER_OWNER } from "../../../lib/performance/channelHealth";
import { fmtVndShort } from "../../../lib/format";
import type { ReportPlatform } from "../../../lib/reportPlatform";
import { BrandLogo } from "../../ui/BrandLogo";
import { PlatformChip } from "../../common/PlatformChip";
import { Card, ddmm, money, pct } from "../shared";

// Tab "Tổng quan account" của Dashboard (demo duyệt 24/10/2026): mọi kênh brand × sàn của MỌI sàn trên một bảng, xếp theo rủi ro.
// Chỉ trình bày — số và câu chữ dựng ở lib/performance/accountOverview.ts từ thẻ kênh. Tổng chỉ theo từng sàn (không cộng chéo sàn).

const TONE_BORDER: Record<RowTone, string> = { bad: "var(--danger)", warn: "var(--warning)", good: "var(--success)", off: "var(--border)" };
const TONE_PILL: Record<RowTone, string> = {
  bad: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  good: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  off: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
};
const Pill: React.FC<{ tone: RowTone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex self-start items-center text-[11px] font-bold px-2 py-0.5 rounded-full border leading-snug ${TONE_PILL[tone]}`}>{children}</span>
);
const num = (v: number, d = 0) => v.toLocaleString("vi-VN", { maximumFractionDigits: d });
const signPct = (x: number) => `${x >= 0 ? "+" : "−"}${num(Math.abs(x) * 100, Math.abs(x) < 0.1 ? 1 : 0)}%`;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export interface PlatformSummary {
  platform: ReportPlatform;
  pace: PlatformPace;
  waiting: number;
}

export const OverviewTab: React.FC<{
  rows: AccountRow[];
  summaries: PlatformSummary[];
  brands: Brand[];
  loading: boolean;
  today: string;
  onOpenBrand: (brandId: string, platform: ReportPlatform) => void;
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
}> = ({ rows, summaries, brands, loading, today, onOpenBrand, onOpenMonthPlan }) => {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const brandOf = new Map(brands.map((b) => [b.id, b]));
  const count = (t: RowTone) => rows.filter((r) => r.tone === t).length;
  const saveable = rows.filter((r) => r.rescue.kind === "save").length;
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-5">
      <div className="grid gap-2.5 md:grid-cols-2">
        {summaries.map((s) => (
          <Card key={s.platform} className="!p-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <PlatformChip platform={s.platform} />
              <Fig label="Thực đạt / Target" value={s.pace.target ? `${money(s.pace.actual)} / ${money(s.pace.target)}` : "—"} />
              <Fig label="Run-rate theo kế hoạch" value={s.pace.targetToDate > 0 ? pct(s.pace.actual / s.pace.targetToDate) : "—"} />
              <Fig label="Dự báo cuối tháng" value={s.pace.target ? <>~{money(s.pace.forecast)} <span className={`text-xs font-bold ${s.pace.forecast / s.pace.target < 0.9 ? "text-rose-400" : "text-amber-300"}`}>{pct(s.pace.forecast / s.pace.target)}</span></> : "—"} />
              <Fig label="Ca chưa có số liệu" value={String(s.waiting)} />
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
          <h3 className="text-base font-black text-[var(--text)]">Tổng quan account</h3>
          <span className="text-xs text-[var(--text-faint)]">{rows.length} account · sắp xếp theo mức rủi ro · bấm một dòng để xem hành động đề xuất</span>
        </div>
        <div className="flex flex-wrap gap-1.5 px-1">
          <Pill tone="bad">{count("bad")} rủi ro cao</Pill>
          <Pill tone="warn">{count("warn")} rủi ro</Pill>
          <Pill tone="off">{count("off")} chưa đủ dữ liệu / tạm dừng</Pill>
          <Pill tone="good">{saveable} bù được bằng giờ live</Pill>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">Đang dựng số từng account…</div>
      ) : (
        <div className="space-y-2">
          <div className="hidden xl:grid grid-cols-[150px_190px_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.15fr)_150px_16px] gap-4 px-4 text-[11px] font-semibold text-[var(--text-faint)]" aria-hidden="true">
            <span>Account</span><span>Trạng thái</span><span>Tiến độ tháng · <span className="font-normal">vạch = target luỹ kế, vòng = dự báo</span></span><span>Khả năng bù thiếu hụt</span><span>Phân rã GMV/giờ · Daily so tháng trước</span><span>Giờ cam kết</span><span />
          </div>
          {rows.map((r) => {
            const isOpen = open.has(r.key);
            const brand = brandOf.get(r.brandId);
            const actions = accountActions(r, today, fmtVndShort, LEVER_OWNER);
            return (
              <div key={r.key} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden" style={{ borderLeft: `3px solid ${TONE_BORDER[r.tone]}` }}>
                <button type="button" onClick={() => toggle(r.key)} aria-expanded={isOpen}
                  className="w-full text-left grid gap-x-4 gap-y-3 p-4 hover:bg-[var(--surface-hover)]/40 grid-cols-[minmax(0,1fr)_16px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16px] xl:grid-cols-[150px_190px_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.15fr)_150px_16px] xl:items-center">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {brand ? <BrandLogo brand={brand} size="md" /> : null}
                    <div className="min-w-0"><b className="block text-sm text-[var(--text)] truncate">{r.brandName}</b><PlatformChip platform={r.platform} className="mt-0.5" /></div>
                  </div>
                  <div className="flex flex-col gap-1 min-w-0 col-span-2 md:col-span-1">
                    <Label>Trạng thái</Label>
                    <Pill tone={r.tone}>{r.status}</Pill>
                    <span className="text-[11px] text-[var(--text-faint)]">{r.runRate != null ? `Run-rate ${pct(r.runRate)}${r.asOf ? ` · dữ liệu đến ${ddmm(r.asOf)}` : ""}` : r.lastLive ? `ca live cuối ${ddmm(r.lastLive)}` : "chưa có ca live trong tháng"}</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-[var(--text-faint)] transition-transform justify-self-end self-start xl:self-center row-start-1 col-start-2 md:col-start-3 xl:col-start-7 ${isOpen ? "rotate-90" : ""}`} aria-hidden="true" />
                  <div className="flex flex-col gap-1 min-w-0 col-span-2 md:col-span-3 xl:col-span-1"><Label>Tiến độ tháng</Label><Progress r={r} /></div>
                  <div className="flex flex-col gap-1 min-w-0 col-span-2 md:col-span-3 xl:col-span-1"><Label>Khả năng bù thiếu hụt</Label><Rescue r={r} /></div>
                  <div className="flex flex-col gap-1 min-w-0 col-span-2 md:col-span-2 xl:col-span-1"><Label>Phân rã GMV/giờ</Label><Why r={r} /></div>
                  <div className="flex flex-col gap-1 min-w-0 col-span-2 md:col-span-1"><Label>Giờ cam kết</Label><Hours r={r} /></div>
                </button>
                {isOpen && (
                  <div className="border-t border-[var(--border)] px-4 py-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:pl-[182px]">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-muted)] mb-1.5">Hành động đề xuất</p>
                      {actions.length ? <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text)]">{actions.map((a) => <li key={a}>{a}</li>)}</ul> : <p className="text-sm text-[var(--text-muted)]">Chưa có việc cần làm.</p>}
                    </div>
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 text-xs">
                      {r.state !== "off" && <button type="button" onClick={() => onOpenBrand(r.brandId, r.platform)} className="font-bold text-[var(--accent-text)] hover:underline min-h-[28px]">Xem chi tiết brand →</button>}
                      <button type="button" onClick={() => onOpenMonthPlan(r.brandId, r.platform)} className="font-bold text-[var(--accent-text)] hover:underline min-h-[28px]">Mở Kế Hoạch Tháng →</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-muted)]">
        <summary className="cursor-pointer font-bold">Nguồn số liệu của bảng</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1 leading-snug">
          <li><b className="text-[var(--text)]">Trạng thái, Run-rate, dự báo cuối tháng</b>: thẻ kênh (cùng một lần tính với tab Brand).</li>
          <li><b className="text-[var(--text)]">Cần / Hiện tại</b>: GMV/giờ cần trên các giờ live còn trong lịch để đạt target, so với GMV/giờ dự báo của các ca đó.</li>
          <li><b className="text-[var(--text)]">Bù được hay không</b>: mục Phương án ở tab Brand. Số giờ cần thêm ≤ giới hạn +30% giờ còn lại thì "Bù được"; vượt giới hạn thì thêm tối đa +30% và báo brand sớm. Giới hạn này đã kiểm chứng trên T7–T9: điều chỉnh đủ 3 mốc thì 9/9 tháng CROCS + VERA đạt ≥ 95% target.</li>
          <li><b className="text-[var(--text)]">Phân rã GMV/giờ</b>: chỉ ngày Daily, so ngày Daily cùng thứ tự tháng trước (TikTok: Views/giờ × LIVE CTR × CTOR × AOV; Shopee: Viewers/giờ × ATC/Viewer × GMV/ATC). Chữ đậm là yếu tố giảm mạnh nhất.</li>
          <li><b className="text-[var(--text)]">Giờ cam kết</b>: đã live + đã xếp lịch so với cam kết của tháng (CRM / Kế Hoạch Tháng).</li>
        </ul>
      </details>
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="xl:hidden text-[11px] font-semibold text-[var(--text-faint)]">{children}</span>;
const Fig: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="min-w-0"><p className="text-[11px] text-[var(--text-faint)]">{label}</p><p className="font-black tabular-nums text-[var(--text)]">{value}</p></div>
);

const Progress: React.FC<{ r: AccountRow }> = ({ r }) => {
  if (!r.target) return <span className="text-xs text-[var(--text-faint)]">{r.state === "off" ? "không chạy tháng này" : "chưa có target"}</span>;
  const fill = clamp((r.actual / r.target) * 100), tick = r.targetToDate != null ? clamp((r.targetToDate / r.target) * 100) : null;
  const fc = r.forecast != null ? clamp((r.forecast / r.target) * 100) : null;
  return (
    <>
      <div className="relative h-2.5 rounded-full bg-[var(--surface-base)] border border-[var(--border)]" role="img" aria-label={`Thực đạt ${money(r.actual)} trên target ${money(r.target)}`}>
        <i className="absolute inset-y-0 left-0 rounded-full opacity-85" style={{ width: `${fill}%`, background: TONE_BORDER[r.tone === "off" ? "off" : r.tone] }} />
        {tick != null && <b className="absolute -top-1 -bottom-1 w-0.5 rounded bg-[var(--text)] opacity-75" style={{ left: `${tick}%` }} />}
        {fc != null && <b className="absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full border-2 border-[var(--text)] bg-[var(--surface)]" style={{ left: `${fc}%` }} />}
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums"><b className="text-[var(--text)]">{money(r.actual)}</b> / {money(r.target)} · {pct(r.actual / r.target)}</span>
      <span className="text-[11px] text-[var(--text-faint)]">{r.targetToDate != null ? `target luỹ kế ${money(r.targetToDate)} · ` : ""}{r.forecast != null ? <>dự báo <b className="text-[var(--text-muted)]">~{money(r.forecast)}</b> ({pct(r.forecast / r.target)})</> : "chưa có dự báo"}</span>
    </>
  );
};

const Rescue: React.FC<{ r: AccountRow }> = ({ r }) => {
  const x = r.rescue;
  if (x.kind === "no_schedule" && r.hours) return <><Pill tone="bad">Rủi ro không đủ giờ cam kết</Pill><span className="text-[11px] text-[var(--text-faint)]">Cam kết {num(r.hours.committed)} giờ, chưa xếp lịch live giờ nào.</span></>;
  if (x.kind === "off" || x.kind === "no_plan") return <span className="text-xs text-[var(--text-faint)]">{x.kind === "off" ? "Không có lịch live" : "Chưa có target để tính"}</span>;
  const tone: RowTone = x.kind === "on_track" || x.kind === "save" ? "good" : x.kind === "no_forecast" ? "off" : "bad";
  const head =
    x.kind === "on_track" ? "Đúng tiến độ · không cần bù"
    : x.kind === "save" ? `Bù được · +${num(x.extraHours ?? 0)} giờ live`
    : x.kind === "cannot" && x.projectedAfter != null && r.target ? `Không bù kịp · tối đa ~${pct(x.projectedAfter / r.target)} target`
    : x.kind === "no_hours" ? "Không còn giờ live trong lịch"
    : "Chưa đủ dữ liệu dự báo";
  const max = Math.max(x.needRate ?? 0, x.nowRate ?? 0);
  return (
    <>
      <Pill tone={tone}>{head}</Pill>
      {x.needRate != null && x.nowRate != null && max > 0 && (
        <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="text-[var(--text-faint)]">Cần</span>
          <span className="h-2 rounded bg-[var(--surface-base)] overflow-hidden"><i className="block h-full rounded" style={{ width: `${(x.needRate / max) * 100}%`, background: TONE_BORDER[tone === "off" ? "warn" : tone] }} /></span>
          <b className="tabular-nums text-[var(--text)]">{money(x.needRate)}/giờ</b>
          <span className="text-[var(--text-faint)]">Hiện tại</span>
          <span className="h-2 rounded bg-[var(--surface-base)] overflow-hidden"><i className="block h-full rounded bg-[var(--text-faint)]" style={{ width: `${(x.nowRate / max) * 100}%` }} /></span>
          <b className="tabular-nums text-[var(--text)]">{money(x.nowRate)}/giờ</b>
        </div>
      )}
      {x.hoursLeft != null && x.hoursLeft > 0 && <span className="text-[11px] text-[var(--text-faint)]">còn {num(x.hoursLeft)} giờ live trong lịch{x.kind === "cannot" && x.needPct != null ? ` · cần thêm +${num(x.needPct * 100)}% giờ, vượt giới hạn +30%` : ""}</span>}
    </>
  );
};

const Why: React.FC<{ r: AccountRow }> = ({ r }) => {
  const t = r.tree;
  if (!t) return <span className="text-xs text-[var(--text-faint)]">{r.state === "live" ? "Chưa đủ ca Daily có số liệu ở cả hai tháng để phân rã." : "Không có ca live tháng này."}</span>;
  const worst = t.worst && t.worst.change < -0.03 ? t.worst.label : null;
  return (
    <>
      <span className="text-xs text-[var(--text-muted)]">GMV/giờ (Daily) {t.gmvPerHour.change != null && <b className={t.gmvPerHour.change >= 0 ? "text-emerald-400" : "text-rose-400"}>{signPct(t.gmvPerHour.change)}</b>} <span className="text-[var(--text-faint)]">vs {money(t.gmvPerHour.prev)}/giờ</span></span>
      <div className="grid grid-cols-[80px_minmax(0,1fr)_44px] items-center gap-x-2 gap-y-1 text-[11px]">
        {t.parts.map((p) => {
          const w = (Math.min(Math.abs(p.change), 0.4) / 0.4) * 50;
          return (
            <React.Fragment key={p.label}>
              <span className={p.label === worst ? "font-black text-[var(--text)]" : "text-[var(--text-faint)]"}>{p.label}</span>
              <span className="relative h-2">
                <b className="absolute -top-0.5 -bottom-0.5 left-1/2 w-px bg-[var(--border)]" />
                <i className={`absolute inset-y-0 rounded ${p.change >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={p.change >= 0 ? { left: "50%", width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }} />
              </span>
              <b className={`text-right tabular-nums ${p.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{signPct(p.change)}</b>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
};

const Hours: React.FC<{ r: AccountRow }> = ({ r }) => {
  const h = r.hours;
  if (!h) return <span className="text-[11px] text-[var(--text-faint)]">không có cam kết giờ{r.waiting ? ` · ${r.waiting} ca chưa có số liệu` : ""}</span>;
  const run = clamp((h.delivered / h.committed) * 100), sched = Math.min(clamp((h.scheduled / h.committed) * 100), 100 - run);
  return (
    <>
      <div className="relative h-2 rounded-full bg-[var(--surface-base)] border border-[var(--border)] overflow-hidden">
        <i className="absolute inset-y-0 left-0 bg-[var(--text)] opacity-55" style={{ width: `${run}%` }} />
        <i className="absolute inset-y-0 bg-[var(--text)] opacity-20" style={{ left: `${run}%`, width: `${sched}%` }} />
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums">{num(h.delivered)} đã live + {num(h.scheduled)} đã xếp / {num(h.committed)} giờ</span>
      <span className={`text-[11px] ${h.gap > 0.5 ? "text-amber-300" : "text-[var(--text-faint)]"}`}>{h.gap > 0.5 ? `còn ${num(h.gap)} giờ chưa xếp lịch` : h.gap < -0.5 ? `vượt cam kết ${num(-h.gap)} giờ` : "đủ giờ cam kết"}{r.waiting ? ` · ${r.waiting} ca chưa có số liệu` : ""}</span>
    </>
  );
};
