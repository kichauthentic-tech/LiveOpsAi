import React, { useEffect, useState } from "react";
import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import { BrandLogo } from "../ui/BrandLogo";
import { coneHalf, combineCones, forecastFlags, landingOfMany, type LandingKey } from "../../lib/performance/forecastCone";
import { BOARD_ISSUES, DATA_ISSUES, inRange, monthEndOf, prevMonthOf, totalsOf, type Issue, type MonthOutlook } from "../../lib/performance/ceoBrief";
import { LEVER_OWNER, runRateByWave, WAVE_NAME, type Cause, type WaveRunRate } from "../../lib/performance/channelHealth";
import { controlGroup, controlLabel, controlVerdict, liveGmvByDate, VERDICT_TEXT, type ControlRow } from "../../lib/report/deepAnalysis";
import { compareWindow } from "../../lib/report/monthlyReportInsights";
import { fetchShopDaysMonthSlice, type ShopDaysMonthSlice } from "../../lib/dataraw/monthlyProductSlice";
import { hasLiveNumbers, sessionToLivePerfRow } from "../../lib/report/sessionsLivePerf";
import { resolveCampBucketType } from "../../lib/campaignDays";
import { profileOf } from "../../lib/platforms/profiles";
import type { Brand } from "../../types";
import type { ChannelHealth, DashModel } from "./model";
import { ChannelPlan } from "./ActionPlan";
import { DrillDown } from "./DrillDown";
import { ConeChart, LandingChip, RunRateBar } from "./RunRate";
import { ACTION_TAB, Card, Delta, SectionTitle, ddmm, hrs, money, pct } from "./shared";

// Tab "Tháng này" (10/10/2026, đề xuất https://claude.ai/artifact/DKuM9K9dLJy1nTvFPPtYNX — gộp Overview + Deepdive + Action cũ).
// Thứ tự đúng bốn câu CEO hỏi: số tin tới đâu → mỗi kênh về đâu và VÌ SAO (một nhãn + nguyên nhân gốc) → việc gì → chi tiết một kênh.
// Mọi luật số ở lib/performance/channelHealth.ts; file này chỉ trình bày.

const LANDING_ORDER: Record<LandingKey, number> = { short: 0, unlikely: 1, likely: 2, safe: 3, no_forecast: 4, no_target: 5 };
const CAUSE_DOT: Record<Cause["tone"], string> = { bad: "bg-rose-400", warn: "bg-amber-300", good: "bg-emerald-400", info: "bg-[var(--text-faint)]" };

type Row = { b: Brand; o: MonthOutlook; h: ChannelHealth };

export const ThisMonth: React.FC<{
  m: DashModel;
  kpi: React.ReactNode;
  selected: string | null;
  onSelect: (brandId: string) => void;
  onNavigate: (tab: string) => void;
  /** Đọc được Dữ Liệu Gốc (ceo/ops/admin) — khối "Thị trường hay mình" cần file Shop Analytics. */
  canReadShop: boolean;
}> = ({ m, kpi, selected, onSelect, onNavigate, canReadShop }) => {
  const rows: Row[] = m.brands
    .filter((b) => m.scopeIds.includes(b.id))
    .map((b) => ({ b, o: m.outlooks.get(b.id)!, h: m.health.get(b.id)! }))
    .filter((r) => r.o && r.h && (r.o.actual > 0 || r.o.pending.length > 0 || r.o.target))
    .sort((a, z) => LANDING_ORDER[a.h.verdict.landing.key] - LANDING_ORDER[z.h.verdict.landing.key] || z.o.actual - a.o.actual);
  const current = rows.find((r) => r.b.id === selected) ?? rows[0];
  const idle = m.brands.filter((b) => m.scopeIds.includes(b.id) && !rows.some((r) => r.b.id === b.id));

  return (
    <div className="space-y-5 sm:space-y-7">
      <TrustStrip m={m} onNavigate={onNavigate} />
      <Summary m={m} rows={rows} />

      <section className="space-y-3">
        <SectionTitle title="Từng kênh: về đâu và vì sao" note="Bấm một dòng để xem chi tiết kênh · kênh cần xử lý nhất lên đầu" />
        <Board m={m} rows={rows} current={current?.b.id ?? null} onSelect={onSelect} />
        {idle.length > 0 && <p className="text-xs text-[var(--text-faint)] px-1">Không chạy tháng {Number(m.month.slice(5))} (không có ca, không có lịch): {idle.map((b) => m.channelName(b)).join(", ")}.</p>}
      </section>

      <Todo issues={m.issues} onNavigate={onNavigate} />

      {current && <ChannelDetail key={current.b.id} m={m} row={current} canReadShop={canReadShop} onNavigate={onNavigate} />}

      <section className="space-y-3">
        <SectionTitle title={`Kết quả tới ${m.coverage.completeThrough ? ddmm(m.coverage.completeThrough) : "ngày có số"}`} note="Mũi tên so cùng loại ngày tháng trước — ngày thường thứ k ↔ ngày thường thứ k, ngày camp ↔ cùng đợt, cùng vị trí" />
        {kpi}
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------

const TrustStrip: React.FC<{ m: DashModel; onNavigate: (tab: string) => void }> = ({ m, onNavigate }) => {
  const c = m.coverage;
  const ok = c.missingSessions === 0;
  return (
    <div role="status" className={`rounded-xl border px-3 py-2.5 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 ${ok ? "border-emerald-800/60 bg-emerald-950/30" : "border-amber-800/60 bg-amber-950/30"}`}>
      <b className="text-[var(--text)]">{c.completeThrough ? `Số đủ tới ${ddmm(c.completeThrough)}` : "Chưa ngày nào đủ số"}</b>
      <span className="text-[var(--text-muted)]">ngày đủ số = ít nhất 90% giờ ca đã chạy có số</span>
      {!ok && <span className="text-amber-300 font-bold">{c.missingSessions} ca đã chạy chờ số{c.oldestMissing ? ` (cũ nhất ${ddmm(c.oldestMissing)})` : ""}</span>}
      {c.partialBefore.length > 0 && <span className="text-[var(--text-faint)]">{c.partialBefore.length} ngày trước mốc còn thiếu vài ca</span>}
      <span className="text-[var(--text-faint)]">Run-rate và mũi tên so sánh chỉ tính tới ngày đủ số.</span>
      {!ok && <button onClick={() => onNavigate("sessions")} className="min-h-6 -mx-1 px-1 rounded text-xs font-bold text-[var(--accent-text)] hover:underline">Mở Sổ Ca →</button>}
    </div>
  );
};

const Summary: React.FC<{ m: DashModel; rows: Row[] }> = ({ m, rows }) => {
  const withForecast = rows.filter((r) => r.o.projectionMethod !== "none" && (r.o.actual > 0 || r.o.pending.length > 0));
  const withTarget = rows.filter((r) => r.o.target && r.o.projectionMethod !== "none");
  const cone = combineCones(withForecast.map((r) => r.o));
  const landing = withTarget.length ? landingOfMany(withTarget.map((r) => r.o)) : null;
  const pm = prevMonthOf(m.month);
  const prevFull = totalsOf(inRange(m.scopeSessions, `${pm}-01`, monthEndOf(`${pm}-01`))).gmv;
  // Đợt kế tiếp sớm nhất trong các kênh; giờ là số vận hành nên cộng được giữa các kênh cùng sàn.
  const waves = rows.map((r) => r.h.wave).filter((w): w is NonNullable<typeof w> => !!w);
  const first = waves.sort((a, z) => a.days[0].localeCompare(z.days[0]))[0];
  const same = first ? waves.filter((w) => w.bucket === first.bucket && w.days[0] === first.days[0]) : [];
  const sched = same.reduce((a, w) => a + w.scheduledHours, 0);
  const usual = same.every((w) => w.usualHours != null) ? same.reduce((a, w) => a + (w.usualHours ?? 0), 0) : null;
  const thin = rows.filter((r) => r.h.wave && same.includes(r.h.wave) && r.h.wave.ratio != null && r.h.wave.ratio < 0.8).map((r) => m.channelName(r.b));
  const label = "text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]";
  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card className="!p-4 space-y-1">
        <p className={label}>Cuối tháng về đâu</p>
        {withForecast.length === 0 ? <p className="text-sm text-[var(--text-faint)] pt-1">Chưa có số hay lịch để chiếu.</p> : (
          <>
            <p className="text-2xl font-black text-[var(--text)]">{money(cone.projected)}</p>
            <p className="text-xs text-[var(--text-faint)] leading-snug">Dải ~80%: {money(cone.lo)} – {money(cone.hi)}{prevFull > 0 ? ` · bằng ${pct(cone.projected / prevFull)} cả tháng ${Number(pm.slice(5))}` : ""}</p>
            {landing?.pHit != null && (
              <p className="text-xs flex flex-wrap items-center gap-1.5 pt-0.5">
                <LandingChip keyName={landing.key} />
                <span className="text-[var(--text-muted)]">{withTarget.length < rows.length ? `${withTarget.length}/${rows.length} kênh có target: ` : ""}khả năng đạt ≈ {pct(landing.pHit)}</span>
              </p>
            )}
          </>
        )}
      </Card>
      <Card className="!p-4 space-y-1">
        <p className={label}>Tới {m.coverage.completeThrough ? ddmm(m.coverage.completeThrough) : "ngày có số"}</p>
        <p className="text-2xl font-black text-[var(--text)]">{money(m.cur.gmv)}</p>
        <p className="text-xs text-[var(--text-faint)] flex flex-wrap items-center gap-x-1.5">LIVE GMV <Delta cur={m.cmp.cur.gmv} prev={m.cmp.prev.gmv} /> · GMV/giờ {money(m.cur.gmvPerHour)} <Delta cur={m.cmp.cur.gmvPerHour} prev={m.cmp.prev.gmvPerHour} /></p>
        <p className="text-[11px] text-[var(--text-faint)] leading-snug">so cùng loại ngày tháng trước (không so ngày lịch)</p>
      </Card>
      <Card className="!p-4 space-y-1">
        <p className={label}>Đợt kế tiếp</p>
        {!first ? <p className="text-sm text-[var(--text-faint)] pt-1">Tháng này không còn đợt camp nào.</p> : (
          <>
            <p className="text-2xl font-black text-[var(--text)]">{WAVE_NAME[first.bucket]} <span className="text-base font-bold text-[var(--text-muted)]">{ddmm(first.days[0])}–{ddmm(first.days[first.days.length - 1])}</span></p>
            <p className="text-xs text-[var(--text-faint)] leading-snug">{hrs(sched)} trong lịch{usual != null ? ` · mọi khi ~${hrs(usual)}` : ""}{first.status === "live" ? " · đang chạy" : ""}</p>
            {thin.length > 0 && <p className="text-xs text-amber-300 leading-snug">Lịch mỏng: {thin.join(", ")}</p>}
          </>
        )}
      </Card>
    </section>
  );
};

const Board: React.FC<{ m: DashModel; rows: Row[]; current: string | null; onSelect: (id: string) => void }> = ({ m, rows, current, onSelect }) => {
  const th = "px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)] whitespace-nowrap";
  if (rows.length === 0) return <Card><p className="text-sm text-[var(--text-faint)]">Chưa có kênh nào có số hay lịch trong tháng này.</p></Card>;
  const anyTarget = rows.some((r) => r.o.target);
  return (
    <>
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)]">
            <tr>
              <th className={`${th} text-left`}>Kênh</th>
              <th className={`${th} text-left`}>Kết luận</th>
              {anyTarget && <th className={`${th} text-right`}>Target</th>}
              <th className={`${th} text-right`}>Dự phóng</th>
              {anyTarget && <th className={`${th} text-right`}>Thiếu / dư</th>}
              <th className={`${th} text-left`}>Nguyên nhân gốc</th>
              {anyTarget && <th className={`${th} text-left`}>Run-rate</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map(({ b, o, h }) => {
              const v = h.verdict;
              const half = coneHalf(o.actual, o.projected, o.coneCoef);
              const gap = o.target && o.projectionMethod !== "none" ? o.projected - o.target.total : null;
              const sel = current === b.id;
              return (
                <tr key={b.id} tabIndex={0} aria-selected={sel} onClick={() => onSelect(b.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(b.id))}
                  className={`cursor-pointer align-top hover:bg-[var(--surface-hover)]/40 ${sel ? "bg-[var(--accent)]/10" : ""}`}>
                  <td className="px-3 py-2.5"><span className="flex items-center gap-2 font-bold text-[var(--text)] whitespace-nowrap"><BrandLogo brand={b} size="xs" /> {m.channelName(b)}</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap"><LandingChip keyName={v.landing.key} />{v.landing.pHit != null && <span className="ml-1.5 text-xs text-[var(--text-faint)]">{pct(v.landing.pHit)}</span>}</td>
                  {anyTarget && <td className="px-3 py-2.5 text-right whitespace-nowrap text-[var(--text-muted)]">{o.target ? money(o.target.total) : "—"}</td>}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {o.projectionMethod === "none" ? <span className="text-[var(--text-faint)]">—</span> : <><b className="text-[var(--text)]">{money(o.projected)}</b>{half > 0 && <span className="block text-[11px] text-[var(--text-faint)]">{money(o.projected - half)} – {money(o.projected + half)}</span>}</>}
                  </td>
                  {anyTarget && <td className={`px-3 py-2.5 text-right whitespace-nowrap font-bold ${gap == null ? "text-[var(--text-faint)]" : gap < 0 ? "text-rose-400" : "text-emerald-400"}`}>{gap == null ? "—" : `${gap < 0 ? "−" : "+"}${money(Math.abs(gap))}`}</td>}
                  <td className="px-3 py-2.5 min-w-[260px]">
                    {v.causes.length === 0 ? <span className="text-xs text-[var(--text-faint)]">Không có nguyên nhân nào nổi lên.</span> : (
                      <ul className="space-y-0.5">
                        {v.causes.slice(0, 2).map((c, i) => (
                          <li key={c.key} className={`flex gap-1.5 leading-snug ${i ? "text-xs text-[var(--text-faint)]" : "text-[13px] text-[var(--text)]"}`}>
                            <i className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${CAUSE_DOT[c.tone]}`} aria-hidden="true" />{c.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  {anyTarget && (
                    <td className="px-3 py-2.5 min-w-[150px]">
                      {v.runRate != null ? <div className="flex items-center gap-2"><div className="flex-1"><RunRateBar value={v.runRate} /></div><span className="text-xs text-[var(--text-muted)] w-10 text-right">{pct(v.runRate)}</span></div> : <span className="text-xs text-[var(--text-faint)]">{o.target ? "chờ ngày đủ số" : "chờ chốt kế hoạch"}</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-[var(--text-faint)] leading-snug px-1">
        Kết luận = khả năng đạt target theo dự phóng và dải ~80% — mỗi kênh một nhãn. Run-rate là số phụ, chỉ tính tới ngày đủ số. Nguyên nhân gốc xếp theo thứ tự: số chưa về → target cao ngay lúc chốt (cần &gt; 1,3× GMV/giờ 28 ngày trước tháng) → GMV/giờ ngày thường giảm &gt; 10% so cùng loại ngày → lịch đợt tới mỏng.
        {!anyTarget && " Cột Target, Thiếu/dư và Run-rate hiện khi OP chốt Kế Hoạch Tháng."}
      </p>
    </>
  );
};

const Todo: React.FC<{ issues: Issue[]; onNavigate: (tab: string) => void }> = ({ issues, onNavigate }) => {
  // Việc đã thành dòng của bảng kết luận (chậm tiến độ, dự phóng thiếu, hết lịch) không lặp lại; việc dữ liệu tách nhóm riêng.
  const business = issues.filter((i) => !i.code || (!DATA_ISSUES.has(i.code) && !BOARD_ISSUES.has(i.code))).slice(0, 5);
  const data = issues.filter((i) => i.code && DATA_ISSUES.has(i.code));
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <IssueCard title="Việc kinh doanh" note="tối đa 5 · đỏ trước" issues={business} empty="Không có việc kinh doanh nào nổi lên ngoài bảng trên." onNavigate={onNavigate} />
      <IssueCard title="Việc dữ liệu" note="ops up file / gán host — số trên màn sẽ đủ hơn" issues={data} empty="Mọi ca đã chạy đều có số và có host." onNavigate={onNavigate} />
    </section>
  );
};

const IssueCard: React.FC<{ title: string; note: string; issues: Issue[]; empty: string; onNavigate: (tab: string) => void }> = ({ title, note, issues, empty, onNavigate }) => (
  <Card>
    <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
      <h4 className="font-black text-[var(--text)]">{title}</h4>
      <span className="text-[11px] text-[var(--text-faint)]">{note}</span>
    </div>
    {issues.length === 0 ? <p className="text-sm text-emerald-400 py-1">{empty}</p> : (
      <ul className="divide-y divide-[var(--border)]">
        {issues.map((it, i) => {
          const Icon = it.level === "info" ? Info : it.level === "bad" ? CircleAlert : AlertTriangle;
          const color = it.level === "bad" ? "text-rose-400" : it.level === "warn" ? "text-amber-300" : "text-[var(--text-faint)]";
          return (
            <li key={i} className="py-2.5 flex gap-2.5">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} aria-label={it.level === "bad" ? "Cần xử lý" : it.level === "warn" ? "Cần để ý" : "Thông tin"} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text)]">{it.title}</p>
                <p className="text-xs text-[var(--text-faint)] leading-snug">{it.detail}</p>
                {it.action && <button onClick={() => onNavigate(ACTION_TAB[it.action!].tab)} className="min-h-6 -mx-1 px-1 rounded inline-flex items-center text-xs font-bold text-[var(--accent-text)] hover:underline mt-0.5">{ACTION_TAB[it.action].label} →</button>}
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </Card>
);

// ---------------------------------------------------------------------------
// Chi tiết một kênh
// ---------------------------------------------------------------------------

const ChannelDetail: React.FC<{ m: DashModel; row: Row; canReadShop: boolean; onNavigate: (tab: string) => void }> = ({ m, row, canReadShop, onNavigate }) => {
  const { b, o, h } = row;
  const handling = m.handling.get(b.id);
  const waves = runRateByWave(o, h.coverage.completeThrough);
  return (
    <section className="space-y-3">
      <SectionTitle title={`Chi tiết · ${m.channelName(b)}`} note="Đổi kênh bằng cách bấm dòng khác ở bảng trên" />
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <BrandLogo brand={b} size="xs" /><b className="text-[var(--text)]">{m.channelName(b)}</b><LandingChip keyName={h.verdict.landing.key} />
          {h.verdict.landing.pHit != null && <span className="text-xs text-[var(--text-faint)]">khả năng đạt ≈ {pct(h.verdict.landing.pHit)}</span>}
        </div>
        {h.verdict.causes.length > 0 && (
          <ul className="space-y-1">
            {h.verdict.causes.map((c) => <li key={c.key} className="text-sm text-[var(--text-muted)] flex gap-2 leading-snug"><i className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${CAUSE_DOT[c.tone]}`} aria-hidden="true" />{c.text}</li>)}
          </ul>
        )}
        {/* Độ tin của dự phóng (ca chưa có số đang được tạm tính, kênh chưa đủ lịch sử…) — cờ của forecastCone. */}
        {forecastFlags(o, m.today).map((f, i) => <p key={i} className={`text-[11px] leading-snug ${f.level === "warn" ? "text-amber-300" : "text-[var(--text-faint)]"}`}>{f.level === "warn" ? "! " : "· "}{f.text}</p>)}
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <TreeCard m={m} h={h} />
        <MarketCard m={m} b={b} h={h} canReadShop={canReadShop} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <WaveCard rows={waves} through={h.coverage.completeThrough} />
        <Card>
          <h4 className="font-black text-[var(--text)] mb-1">GMV cộng dồn, target và dự phóng</h4>
          <ConeChart outlook={o} month={m.month} />
        </Card>
      </div>
      {handling && (o.actual > 0 || o.pending.length > 0) && <ChannelPlan b={b} o={o} p={handling} name={`Phương án · ${m.channelName(b)}`} today={m.today} />}
      <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
        <summary className="list-none cursor-pointer p-4 flex items-center justify-between gap-2 min-h-[44px]">
          <span className="font-black text-[var(--text)]">Đi sâu: từng đợt, từng ngày, từng ca</span>
          <span className="text-xs font-bold text-[var(--accent-text)]"><span className="group-open:hidden">Mở ▾</span><span className="hidden group-open:inline">Thu gọn ▴</span></span>
        </summary>
        <div className="px-4 pb-4"><DrillDown m={m} onNavigate={onNavigate} channelId={b.id} /></div>
      </details>
    </section>
  );
};

const TreeCard: React.FC<{ m: DashModel; h: ChannelHealth }> = ({ m, h }) => {
  const t = h.tree;
  const prof = profileOf(m.platform);
  const sign = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(x) < 0.1 ? 1 : 0 })}%`);
  const tone = (x: number | null) => (x == null || Math.abs(x) < 0.03 ? "text-[var(--text-muted)]" : x > 0 ? "text-emerald-400" : "text-rose-400");
  const mx = t ? Math.max(0.05, ...t.parts.map((p) => Math.abs(p.change))) : 1;
  return (
    <Card className="space-y-3">
      <div>
        <h4 className="font-black text-[var(--text)]">Cây GMV/giờ · ngày thường</h4>
        <p className="text-xs text-[var(--text-faint)] leading-snug mt-0.5">{prof.metrics.driverFormula.replace(/^GMV = [^×]+× /, "GMV/giờ = ")} · ngày thường tháng này so ngày thường cùng thứ tự tháng trước</p>
      </div>
      {!t ? <p className="text-sm text-[var(--text-faint)]">Chưa đủ ca ngày thường có số ở cả hai tháng (cần từ 3 ca mỗi bên) để so.</p> : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-2xl font-black text-[var(--text)]">{money(t.gmvPerHour.cur)}/giờ</span>
            <span className={`text-sm font-bold ${tone(t.gmvPerHour.change)}`}>{sign(t.gmvPerHour.change)}</span>
            <span className="text-xs text-[var(--text-faint)]">tháng trước {money(t.gmvPerHour.prev)}/giờ · {t.curSessions} ca / {t.prevSessions} ca</span>
          </div>
          <div className="space-y-1.5">
            {t.parts.map((p) => {
              const worst = t.worst?.label === p.label && p.change < -0.03;
              return (
                <div key={p.label} className="grid grid-cols-[110px_1fr] sm:grid-cols-[130px_1fr] items-center gap-2 text-xs">
                  <span className={worst ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}>{p.label}</span>
                  <div className="relative h-5">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border)]" />
                    <div className={`absolute inset-y-0.5 rounded ${p.change >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={p.change >= 0 ? { left: "50%", width: `${(Math.abs(p.change) / mx) * 45}%` } : { right: "50%", width: `${(Math.abs(p.change) / mx) * 45}%` }} />
                    <span className={`absolute top-0.5 font-mono text-[11px] ${p.change >= 0 ? "text-emerald-400" : "text-rose-400"}`} style={p.change >= 0 ? { left: `calc(50% + ${(Math.abs(p.change) / mx) * 45}% + 4px)` } : { right: `calc(50% + ${(Math.abs(p.change) / mx) * 45}% + 4px)` }}>{sign(p.change)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-snug">
            {t.worst && t.worst.change < -0.03 ? <>Nhánh kéo xuống nhiều nhất: <b className="text-[var(--text)]">{t.worst.label} {sign(t.worst.change)}</b>. Người giữ đòn bẩy — {LEVER_OWNER[t.worst.label] ?? "xem chi tiết từng ca"}.</> : "Không nhánh nào giảm quá 3%."}
          </p>
        </>
      )}
    </Card>
  );
};

const MarketCard: React.FC<{ m: DashModel; b: Brand; h: ChannelHealth; canReadShop: boolean }> = ({ m, b, h, canReadShop }) => {
  const prof = profileOf(m.platform);
  const through = h.coverage.completeThrough && h.coverage.completeThrough < `${m.month}-01` ? null : h.coverage.completeThrough;
  const [shop, setShop] = useState<{ key: string; cur: ShopDaysMonthSlice; prev: ShopDaysMonthSlice } | null>(null);
  const key = `${b.id}|${m.month}`;
  useEffect(() => {
    if (!canReadShop || !prof.hasShopAnalytics) return;
    let alive = true;
    const pm = prevMonthOf(m.month);
    Promise.all([fetchShopDaysMonthSlice(b.id, `${m.month}-01`, monthEndOf(`${m.month}-01`)), fetchShopDaysMonthSlice(b.id, `${pm}-01`, monthEndOf(`${pm}-01`))])
      .then(([cur, prev]) => alive && setShop({ key, cur, prev }))
      .catch(() => alive && setShop({ key, cur: { days: [], hasAnyBatch: false }, prev: { days: [], hasAnyBatch: false } }));
    return () => { alive = false; };
  }, [b.id, m.month, key, canReadShop, prof.hasShopAnalytics]);

  let body: React.ReactNode;
  if (!prof.hasShopAnalytics) body = <p className="text-sm text-[var(--text-faint)]">{prof.label} không có file Shop Analytics (Total GMV theo ngày) ở Dữ Liệu Gốc nên chưa tách được thị trường với vận hành.</p>;
  else if (!canReadShop) body = <p className="text-sm text-[var(--text-faint)]">Chỉ ops/CEO đọc được file shop.</p>;
  else if (!shop || shop.key !== key) body = <p className="text-sm text-[var(--text-faint)]">Đang tải file Shop Analytics…</p>;
  else {
    const win = compareWindow(m.month, through);
    const live = liveGmvByDate(m.platformSessions.filter((s) => s.brandId === b.id && hasLiveNumbers(s)).map(sessionToLivePerfRow));
    const rows: ControlRow[] = controlGroup(shop.prev.days, shop.cur.days, win, (d) => resolveCampBucketType(d), h.bucketOf, { prev: live, cur: live });
    const lastShop = shop.cur.days.map((d) => d.date).sort().pop();
    body = rows.length === 0 ? (
      <p className="text-sm text-[var(--text-faint)]">{!shop.cur.hasAnyBatch ? `Chưa up Shop Analytics tháng ${Number(m.month.slice(5))}` : !shop.prev.hasAnyBatch ? `Chưa up Shop Analytics tháng ${Number(prevMonthOf(m.month).slice(5))}` : "File shop chưa có ngày nào trùng kỳ đang so"} ở Dữ Liệu Gốc của {b.name} — chưa tách được thị trường với vận hành. Up file shop hằng tuần để có khối này.</p>
    ) : (
      <>
        <ul className="space-y-2">
          {rows.map((r) => {
            const v = controlVerdict(r);
            const shopTotal = r.shopLiveCur + r.restCur;
            const share = shopTotal > 0 ? r.liveCur / shopTotal : null;
            return (
              <li key={r.key} className="text-sm">
                <p className="text-[var(--text)]"><b>{controlLabel(r.key)}</b> · live agency {r.liveChg == null ? "—" : `${r.liveChg >= 0 ? "+" : "−"}${Math.round(Math.abs(r.liveChg))}%`} · phần còn lại của shop {r.restChg == null ? "—" : `${r.restChg >= 0 ? "+" : "−"}${Math.round(Math.abs(r.restChg))}%`}</p>
                <p className="text-xs text-[var(--text-faint)]">{v ? <span className={v === "ops" ? "text-rose-300 font-bold" : ""}>⇒ {VERDICT_TEXT[v]}</span> : null}{share != null && r.key === "all" ? ` · live ≈ ${pct(share)} GMV shop` : ""}</p>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-[var(--text-faint)] leading-snug">{win.label}{lastShop ? ` · file shop tới ${ddmm(lastShop)}` : ""}. Live = ca agency; phần còn lại = GMV shop trừ live tài khoản shop (cùng cách Report Tháng).</p>
      </>
    );
  }
  return (
    <Card className="space-y-3">
      <h4 className="font-black text-[var(--text)]">Thị trường hay do mình</h4>
      {body}
    </Card>
  );
};

const WaveCard: React.FC<{ rows: WaveRunRate[]; through: string | null }> = ({ rows, through }) => (
  <Card className="space-y-3">
    <div>
      <h4 className="font-black text-[var(--text)]">Run-rate theo đợt</h4>
      <p className="text-xs text-[var(--text-faint)] leading-snug mt-0.5">Thực đạt ÷ target các ca kế hoạch đã chốt, tới ngày đủ số{through ? ` (${ddmm(through)})` : ""}. Ca kế hoạch huỷ vẫn giữ target.</p>
    </div>
    {rows.length === 0 ? <p className="text-sm text-[var(--text-faint)]">Kênh chưa chốt Kế Hoạch Tháng nên chưa có target theo đợt.</p> : (
      <div className="grid grid-cols-[minmax(100px,1fr)_minmax(120px,2fr)_auto] gap-x-3 gap-y-2.5 items-center">
        {rows.map((r) => (
          <React.Fragment key={r.key}>
            <div className={`min-w-0 ${r.key === "month" ? "" : "pl-3 border-l border-[var(--border)]"}`}>
              <p className="font-bold text-sm text-[var(--text)] truncate">{r.label}</p>
              <p className="text-[11px] text-[var(--text-faint)]">{r.key === "month" || r.key === "daily" ? `${r.days.length} ngày` : `${ddmm(r.days[0])}–${ddmm(r.days[r.days.length - 1])}`} · {{ done: "đã qua", live: "đang chạy", next: "sắp tới" }[r.state]}</p>
            </div>
            {r.state === "next" ? (
              <p className="text-xs text-[var(--text-muted)] col-span-2">Target {money(r.target)}{r.forecast != null ? ` · lịch hiện chiếu ${money(r.forecast)} (${pct(r.forecast / r.target)})` : ""}</p>
            ) : (
              <>
                <RunRateBar value={r.runRate} />
                <p className="text-xs text-right whitespace-nowrap"><b className="text-[var(--text)]">{pct(r.runRate)}</b> <span className="text-[var(--text-faint)]">{money(r.actual)} / {money(r.targetToDate)}</span></p>
              </>
            )}
          </React.Fragment>
        ))}
      </div>
    )}
  </Card>
);
