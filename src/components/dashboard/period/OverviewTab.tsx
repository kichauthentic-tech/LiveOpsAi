import { platformText } from "../../../lib/metricGlossary";
import React, { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { Brand } from "../../../types";
import { accountActions, type AccountRow, type PlatformPace, type RowTone } from "../../../lib/performance/accountOverview";
import { LEVER_OWNER } from "../../../lib/performance/channelHealth";
import { fmtVndShort } from "../../../lib/format";
import type { ReportPlatform } from "../../../lib/reportPlatform";
import { BrandLogo } from "../../ui/BrandLogo";
import { PlatformChip } from "../../common/PlatformChip";
import { LiveFunnel } from "../LiveFunnel";
import { CountUp, Collapse, Reveal } from "../../ui/Motion";
import { money, pct } from "../shared";

// Tab "Tổng quan account" của Dashboard (demo duyệt 24/10/2026): mọi kênh brand × sàn của MỌI sàn trên một bảng, xếp theo rủi ro.
// Chỉ trình bày — số và câu chữ dựng ở lib/performance/accountOverview.ts từ thẻ kênh. Tổng chỉ theo từng sàn (không cộng chéo sàn).
// 10–11/11: bố cục "bento", ÍT CHỮ — thẻ mực "Cần chú ý" (bấm một dòng = bung + cuộn tới account đó), thẻ từng sàn (số lớn, thanh, vòng dự báo),
// lưới thẻ account (tên, % dự báo, thanh; bấm mới ra Bù thiếu hụt / phân rã / giờ cam kết / hành động). Khối hiện lần lượt (ui/Motion.tsx).

const TONE_BORDER: Record<RowTone, string> = { bad: "var(--danger)", warn: "var(--warning)", good: "var(--success)", off: "var(--border)" };
const TONE_PILL: Record<RowTone, string> = {
  bad: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  good: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  off: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
};
const Pill: React.FC<{ tone: RowTone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex self-start items-center text-2xs font-bold px-2 py-0.5 rounded-full border leading-snug ${TONE_PILL[tone]}`}>{children}</span>
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
  const risky = rows.filter((r) => r.tone === "bad" || r.tone === "warn");
  // Từ thẻ "cần chú ý": bung dòng account đó và cuộn tới nó.
  const jump = (k: string) => {
    setOpen((s) => new Set(s).add(k));
    document.getElementById(`acct-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-4">
        <Reveal className={`bento-ink rounded-2xl p-6 flex flex-col justify-between gap-5 lg:col-span-2 ${summaries.length > 2 ? "lg:row-span-3" : "lg:row-span-2"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--text-muted)]">Cần chú ý</p>
            <AlertTriangle className="w-4 h-4 text-[var(--text-faint)]" aria-hidden="true" />
          </div>
          <CountUp value={risky.length} format={(v) => String(Math.round(v))} className="text-7xl font-black tabular-nums tracking-tight text-[var(--text)] leading-none" />
          {loading ? null : risky.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Ổn</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {risky.slice(0, 4).map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => jump(r.key)} className="w-full flex items-center gap-3 py-2.5 text-left rounded-lg hover:bg-[var(--surface-hover)] -mx-2 px-2 min-h-[44px]" title={r.status}>
                    <i className="w-2 h-2 rounded-full shrink-0" style={{ background: TONE_BORDER[r.tone] }} aria-hidden="true" />
                    <b className="min-w-0 flex-1 text-sm text-[var(--text)] truncate">{r.brandName} <span className="font-medium text-[var(--text-faint)]">{r.platform}</span></b>
                    {r.target && r.forecast != null ? <span className="text-sm font-black tabular-nums text-[var(--text)]">{pct(r.forecast / r.target)}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Reveal>

        {summaries.map((s, i) => {
          const { actual, target, targetToDate, forecast } = s.pace;
          const tick = target && targetToDate > 0 ? clamp((targetToDate / target) * 100) : null;
          return (
            <Reveal key={s.platform} index={i + 1} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2 flex items-center gap-5" >
              <div className="min-w-0 flex-1" title={targetToDate > 0 ? `Run-rate ${pct(actual / targetToDate)} · ${s.waiting} ca chưa có số liệu` : undefined}>
                <PlatformChip platform={s.platform} />
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-4xl font-black tabular-nums tracking-tight text-[var(--text)]">
                  <CountUp value={actual} format={money} />
                  <span className="text-sm font-bold tracking-normal text-[var(--text-faint)]">{target ? `/ ${money(target)}` : ""}</span>
                </p>
                {target ? (
                  <div className="relative mt-4 h-2.5 rounded-full bg-[var(--surface-elevated)]" role="img" aria-label={`Thực đạt ${money(actual)} trên target ${money(target)}`}>
                    <div className="absolute inset-0 overflow-hidden rounded-full">
                      <i className="bar-grow block h-full rounded-full bg-[var(--accent)]" style={{ width: `${clamp((actual / target) * 100)}%` }} />
                    </div>
                    {tick != null && <b className="absolute -top-1 -bottom-1 w-0.5 rounded bg-[var(--text)] opacity-75" style={{ left: `${tick}%` }} />}
                  </div>
                ) : null}
              </div>
              {target ? <Ring ratio={forecast / target} /> : null}
            </Reveal>
          );
        })}
      </div>

      <h3 className="px-1 text-base font-black text-[var(--text)]">Account <span className="font-medium text-[var(--text-faint)]">{rows.length}</span></h3>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">Đang tải…</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 items-start">
          {rows.map((r, i) => {
            const isOpen = open.has(r.key);
            const brand = brandOf.get(r.brandId);
            const actions = accountActions(r, today, fmtVndShort, LEVER_OWNER);
            const ratio = r.target && r.forecast != null ? r.forecast / r.target : null;
            const fill = r.target ? clamp((r.actual / r.target) * 100) : 0;
            const tick = r.target && r.targetToDate != null ? clamp((r.targetToDate / r.target) * 100) : null;
            return (
              <Reveal key={r.key} id={`acct-${r.key}`} index={i} lift className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <button type="button" onClick={() => toggle(r.key)} aria-expanded={isOpen} className="w-full text-left p-5 hover:bg-[var(--surface-hover)]/40">
                  <div className="flex items-center gap-2.5">
                    {brand ? <BrandLogo brand={brand} size="md" /> : null}
                    <b className="min-w-0 flex-1 text-sm text-[var(--text)] truncate">{r.brandName}</b>
                    <PlatformChip platform={r.platform} />
                    <ChevronRight className={`w-4 h-4 text-[var(--text-faint)] transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden="true" />
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <span className="text-4xl font-black tabular-nums tracking-tight leading-none" style={{ color: ratio == null ? "var(--text-faint)" : TONE_BORDER[r.tone] }}>
                      {ratio == null ? "—" : <CountUp value={ratio * 100} format={(v) => `${Math.round(v)}%`} />}
                    </span>
                    <Pill tone={r.tone}>{r.status}</Pill>
                  </div>
                  {r.target ? (
                    <>
                      <div className="relative mt-4 h-2 rounded-full bg-[var(--surface-elevated)]" role="img" aria-label={`Thực đạt ${money(r.actual)} trên target ${money(r.target)}`}>
                        <div className="absolute inset-0 overflow-hidden rounded-full">
                          <i className="bar-grow block h-full rounded-full" style={{ width: `${fill}%`, background: TONE_BORDER[r.tone] }} />
                        </div>
                        {tick != null && <b className="absolute -top-1 -bottom-1 w-0.5 rounded bg-[var(--text)] opacity-75" style={{ left: `${tick}%` }} />}
                      </div>
                      <p className="mt-2 text-xs tabular-nums text-[var(--text-faint)]"><b className="text-[var(--text-muted)]">{money(r.actual)}</b> / {money(r.target)}</p>
                    </>
                  ) : null}
                </button>
                <Collapse open={isOpen} className="border-t border-[var(--border)] p-5 space-y-4">
                  <div className="space-y-1"><Label>Bù thiếu hụt</Label><Rescue r={r} /></div>
                  <div className="space-y-1"><Label>{platformText("GMV/giờ", r.platform)}</Label><Why r={r} /></div>
                  <div className="space-y-1"><Label>Giờ cam kết</Label><Hours r={r} /></div>
                  {r.funnels.length > 0 && <div><Label>Phễu LIVE</Label><div className="mt-1"><LiveFunnel views={r.funnels} showAction={false} /></div></div>}
                  {actions.length > 0 && (
                    <div className="space-y-1">
                      <Label>Hành động</Label>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text)]">{actions.map((a) => <li key={a}>{a}</li>)}</ul>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {r.state !== "off" && <button type="button" onClick={() => onOpenBrand(r.brandId, r.platform)} className="font-bold text-[var(--accent-text)] hover:underline min-h-[28px]">Chi tiết brand →</button>}
                    <button type="button" onClick={() => onOpenMonthPlan(r.brandId, r.platform)} className="font-bold text-[var(--accent-text)] hover:underline min-h-[28px]">Kế Hoạch Tháng →</button>
                  </div>
                </Collapse>
              </Reveal>
            );
          })}
        </div>
      )}

      <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-muted)]">
        <summary className="cursor-pointer font-bold">Nguồn số liệu</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1 leading-snug">
          <li><b className="text-[var(--text)]">Trạng thái, Run-rate, dự báo cuối tháng</b>: thẻ kênh (cùng một lần tính với tab Brand).</li>
          <li><b className="text-[var(--text)]">Cần / Hiện tại</b>: {platformText("GMV/giờ", "all")} cần trên các giờ live còn trong lịch để đạt target, so với {platformText("GMV/giờ", "all")} dự báo của các ca đó.</li>
          <li><b className="text-[var(--text)]">Bù được hay không</b>: mục Phương án ở tab Brand. Số giờ cần thêm ≤ giới hạn +30% giờ còn lại thì "Bù được"; vượt giới hạn thì thêm tối đa +30% và báo brand sớm. Giới hạn này đã kiểm chứng trên T7–T9: điều chỉnh đủ 3 mốc thì 9/9 tháng CROCS + VERA đạt ≥ 95% target.</li>
          <li><b className="text-[var(--text)]">Phân rã {platformText("GMV/giờ", "all")}</b>: chỉ ngày Daily, so ngày Daily cùng thứ tự tháng trước (TikTok: Views/giờ × LIVE CTR × CTOR × AOV; Shopee: Viewers/giờ × ATC/Viewer × {platformText("GMV/ATC", "all")}). Chữ đậm là yếu tố giảm mạnh nhất.</li>
          <li><b className="text-[var(--text)]">Giờ cam kết</b>: đã live + đã xếp lịch so với cam kết của tháng (CRM / Kế Hoạch Tháng).</li>
        </ul>
      </details>
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-xs font-bold text-[var(--text-muted)]">{children}</p>;
// Vòng đo "dự báo cuối tháng so target": < 90% đỏ, < 100% vàng, đạt thì xanh.
const Ring: React.FC<{ ratio: number }> = ({ ratio }) => {
  const R = 30, len = 2 * Math.PI * R, off = len * (1 - Math.min(Math.max(ratio, 0), 1));
  const color = ratio < 0.9 ? "var(--danger)" : ratio < 1 ? "var(--warning)" : "var(--success)";
  return (
    <div className="shrink-0" title="Dự báo cuối tháng so với target tháng">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90" role="img" aria-label={`Dự báo cuối tháng ${pct(ratio)} target`}>
          <circle cx="36" cy="36" r={R} fill="none" strokeWidth="7" style={{ stroke: "var(--surface-elevated)" }} />
          <circle cx="36" cy="36" r={R} fill="none" strokeWidth="7" strokeLinecap="round" className="ring-grow" strokeDasharray={len} strokeDashoffset={off} style={{ stroke: color, ["--ring-len" as string]: len }} />
        </svg>
        <b className="absolute inset-0 grid place-items-center text-sm font-black tabular-nums text-[var(--text)]">{pct(ratio)}</b>
      </div>
    </div>
  );
};

const Rescue: React.FC<{ r: AccountRow }> = ({ r }) => {
  const x = r.rescue;
  if (x.kind === "no_schedule" && r.hours) return <><Pill tone="bad">Rủi ro không đủ giờ cam kết</Pill><span className="text-2xs text-[var(--text-faint)]">Cam kết {num(r.hours.committed)} giờ, chưa xếp lịch live giờ nào.</span></>;
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
        <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-2xs">
          <span className="text-[var(--text-faint)]">Cần</span>
          <span className="h-2 rounded bg-[var(--surface-base)] overflow-hidden"><i className="block h-full rounded" style={{ width: `${(x.needRate / max) * 100}%`, background: TONE_BORDER[tone === "off" ? "warn" : tone] }} /></span>
          <b className="tabular-nums text-[var(--text)]">{money(x.needRate)}/giờ</b>
          <span className="text-[var(--text-faint)]">Hiện tại</span>
          <span className="h-2 rounded bg-[var(--surface-base)] overflow-hidden"><i className="block h-full rounded bg-[var(--text-faint)]" style={{ width: `${(x.nowRate / max) * 100}%` }} /></span>
          <b className="tabular-nums text-[var(--text)]">{money(x.nowRate)}/giờ</b>
        </div>
      )}
      {x.hoursLeft != null && x.hoursLeft > 0 && <span className="text-2xs text-[var(--text-faint)]">còn {num(x.hoursLeft)} giờ live trong lịch{x.kind === "cannot" && x.needPct != null ? ` · cần thêm +${num(x.needPct * 100)}% giờ, vượt giới hạn +30%` : ""}</span>}
    </>
  );
};

const Why: React.FC<{ r: AccountRow }> = ({ r }) => {
  const t = r.tree;
  if (!t) return <span className="text-xs text-[var(--text-faint)]">{r.state === "live" ? "Chưa đủ ca Daily có số liệu ở cả hai tháng để phân rã." : "Không có ca live tháng này."}</span>;
  const worst = t.worst && t.worst.change < -0.03 ? t.worst.label : null;
  return (
    <>
      <span className="text-xs text-[var(--text-muted)]">{platformText("GMV/giờ", r.platform)} (Daily) {t.gmvPerHour.change != null && <b className={t.gmvPerHour.change >= 0 ? "text-emerald-400" : "text-rose-400"}>{signPct(t.gmvPerHour.change)}</b>} <span className="text-[var(--text-faint)]">vs {money(t.gmvPerHour.prev)}/giờ</span></span>
      <div className="grid grid-cols-[80px_minmax(0,1fr)_44px] items-center gap-x-2 gap-y-1 text-2xs">
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
  if (!h) return <span className="text-2xs text-[var(--text-faint)]">không có cam kết giờ{r.waiting ? ` · ${r.waiting} ca chưa có số liệu` : ""}</span>;
  const run = clamp((h.delivered / h.committed) * 100), sched = Math.min(clamp((h.scheduled / h.committed) * 100), 100 - run);
  return (
    <>
      <div className="relative h-2 rounded-full bg-[var(--surface-base)] border border-[var(--border)] overflow-hidden">
        <i className="absolute inset-y-0 left-0 bg-[var(--text)] opacity-55" style={{ width: `${run}%` }} />
        <i className="absolute inset-y-0 bg-[var(--text)] opacity-20" style={{ left: `${run}%`, width: `${sched}%` }} />
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums">{num(h.delivered)} đã live + {num(h.scheduled)} đã xếp / {num(h.committed)} giờ</span>
      <span className={`text-2xs ${h.gap > 0.5 ? "text-amber-300" : "text-[var(--text-faint)]"}`}>{h.gap > 0.5 ? `còn ${num(h.gap)} giờ chưa xếp lịch` : h.gap < -0.5 ? `vượt cam kết ${num(-h.gap)} giờ` : "đủ giờ cam kết"}{r.waiting ? ` · ${r.waiting} ca chưa có số liệu` : ""}</span>
    </>
  );
};
