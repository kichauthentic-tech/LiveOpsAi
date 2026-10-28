import React, { useState } from "react";
import { Flame, Gauge, Table2, Users, CalendarRange, Receipt } from "lucide-react";
import { CHANNEL, METRIC } from "../../../lib/metricGlossary";
import { KEY_METRIC_GROUPS, fmtKeyMetric } from "../../../lib/report/keyMetrics";
import {
  DAY_TYPE_FACTORS,
  KEY_METRICS_TABS,
  changeTone,
  creatorRates,
  keyMetricsTable,
  type ChangeTone,
  type CreatorPlanRow,
  type CreatorSessionRow,
  type CreatorTotals,
  type DayTypeFactor,
  type DayTypeFactorRow,
  type KeyMetricsMonth,
  type KeyMetricsTab,
  type ScoreRow
} from "../../../lib/report/brandReport";
import type { CampDayBucket } from "../../../lib/campaignDays";
import { fmtFixed, fmtVndShort } from "../../../lib/format";
import { DAY_TYPE_SHORT, PAL } from "./theme";
import { fmtHours, fmtPct } from "./format";
import { KpiTile, MethodNote, Panel, ReportTable } from "./ui";

// Các khối MỚI của Report Tháng 10 trang (user duyệt demo CROCS T9, 24/10/2026): bảng điểm, bảng nhiệt loại ngày, Key Metrics
// 3 tháng × 5 bảng, affiliate theo phiên creator, lịch creator tháng sau, hủy/hoàn & NMV. Số tính ở lib/report/brandReport.ts;
// ở đây chỉ trình bày, cùng skin đen-vàng cố định của report (theme.ts).

const TONE_COLOR: Record<ChangeTone, string> = { up: PAL.green, down: PAL.red, shift: PAL.gold, noise: PAL.muted };
const TONE_BG: Record<ChangeTone, string> = { up: `${PAL.green}22`, down: `${PAL.red}22`, shift: `${PAL.gold}18`, noise: "transparent" };
const signedPct = (v: number | null, digits = 0) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${fmtFixed(Math.abs(v), digits)}%`);
const rowStyle = (idx: number) => ({ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" });
const TAB_LABEL: Record<KeyMetricsTab, string> = { all: "Cả tháng", ...DAY_TYPE_SHORT };

/** Chú thích màu dùng chung cho mọi bảng có ngưỡng dao động. */
export const ToneLegend: React.FC<{ extra?: string }> = ({ extra }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] mt-2" style={{ color: PAL.muted }}>
    {(
      [
        ["down", "suy giảm có ý nghĩa"],
        ["up", "cải thiện có ý nghĩa"],
        ["shift", "thay đổi có ý nghĩa, không đánh giá tốt/xấu"],
        ["noise", "trong ngưỡng dao động"]
      ] as [ChangeTone, string][]
    ).map(([t, l]) => (
      <span key={t} className="px-1.5 py-0.5 rounded font-bold" style={{ color: TONE_COLOR[t], background: TONE_BG[t], border: t === "noise" ? `1px solid ${PAL.line}` : undefined }}>
        {l}
      </span>
    ))}
    {extra && <span>{extra}</span>}
  </div>
);

// ---------- Trang 1: bảng điểm ----------

const SCORE_LABEL: Record<ScoreRow["key"], string> = { all: `${METRIC.liveGmv} (YFB vận hành)`, shop: METRIC.totalGmv, ...DAY_TYPE_SHORT };

export const ScoreboardPanel: React.FC<{ rows: ScoreRow[]; campSpans: Partial<Record<CampDayBucket, string>>; footnote?: string }> = ({ rows, campSpans, footnote }) => (
  <Panel title="Bảng điểm tháng" icon={<Gauge className="w-4 h-4" />} sub="Target theo Kế Hoạch Tháng đã chốt · tháng chưa kết thúc thì % tính trên target tới nay (cùng số run-rate Dashboard) · KPI toàn shop do brand giao · vạch = 100%">
    <ReportTable head={["", "Target", "Thực tế", METRIC.pctTarget, ""]}>
      {rows.map((r, idx) => {
        const tone = r.pct == null ? PAL.muted : r.pct >= 100 ? PAL.green : r.pct >= 95 ? PAL.gold : PAL.red;
        const sub = r.key !== "all" && r.key !== "shop";
        const w = r.pct == null ? 0 : Math.min(r.pct, 130) / 1.3;
        return (
          <tr key={r.key} style={{ ...rowStyle(idx), borderTop: r.key === "shop" ? `1px solid ${PAL.muted}55` : undefined }}>
            <td className={`py-2 px-3 whitespace-nowrap ${sub ? "pl-7 font-medium" : "font-bold"}`} style={{ color: sub ? PAL.cream : PAL.gold }}>
              {SCORE_LABEL[r.key]}
              {sub && campSpans[r.key as CampDayBucket] && <span className="text-[11px] font-normal" style={{ color: PAL.muted }}> · {campSpans[r.key as CampDayBucket]}</span>}
              {r.key === "shop" && <span className="text-[11px] font-normal" style={{ color: PAL.muted }}> · KPI toàn shop, gồm các kênh ngoài livestream</span>}
            </td>
            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
              {r.targetToDate != null && r.target && Math.round(r.targetToDate) !== Math.round(r.target) ? (
                <>
                  {fmtVndShort(r.targetToDate)}
                  <span className="block text-[11px] font-normal">tới nay · cả tháng {fmtVndShort(r.target)}</span>
                </>
              ) : r.target ? fmtVndShort(r.target) : "—"}
            </td>
            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(r.actual)}</td>
            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: tone }}>{r.pct == null ? "—" : `${fmtFixed(r.pct, 1)}%`}</td>
            <td className="py-2 px-3 w-[28%] min-w-[110px]">
              <span className="relative block h-2.5 rounded" style={{ background: PAL.panel2 }}>
                <span className="block h-full rounded" style={{ width: `${w}%`, background: tone }} />
                <span className="absolute -top-1 -bottom-1 w-0.5" style={{ left: `${100 / 1.3}%`, background: PAL.cream, opacity: 0.7 }} />
              </span>
            </td>
          </tr>
        );
      })}
    </ReportTable>
    {footnote && <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>{footnote}</p>}
  </Panel>
);

// ---------- Trang 3: bảng nhiệt loại ngày × yếu tố ----------

const FACTOR_LABEL: Record<DayTypeFactor, string> = {
  hours: METRIC.liveHours,
  viewsPerHour: METRIC.viewsPerHour,
  liveCtr: METRIC.liveCtr,
  ctor: METRIC.ctor,
  aov: METRIC.aov,
  gmvPerHour: METRIC.gmvPerHour
};

export const DayTypeHeatPanel: React.FC<{ rows: DayTypeFactorRow[]; windowLabel: string }> = ({ rows, windowLabel }) => (
  <Panel title="Phân rã theo loại ngày" icon={<Flame className="w-4 h-4" />} sub={`% thay đổi · ${windowLabel} · mỗi loại ngày so với chính loại ngày đó, theo lịch campaign của từng tháng`}>
    <ReportTable head={["Loại ngày", ...DAY_TYPE_FACTORS.map((f) => FACTOR_LABEL[f]), "Ngưỡng dao động", "Đánh giá"]}>
      {rows.map((r, idx) => (
        <tr key={r.key} style={rowStyle(idx)}>
          <td className="py-2 px-3 font-semibold whitespace-nowrap" style={{ color: PAL.gold }}>
            {DAY_TYPE_SHORT[r.key]} <span className="text-[11px] font-normal" style={{ color: PAL.muted }}>· {r.sessionsPrev} → {r.sessionsCur} phiên</span>
          </td>
          {DAY_TYPE_FACTORS.map((f) => {
            const tone = f === "hours" ? "noise" : changeTone(r.change[f], r.band, true);
            return (
              <td key={f} className="py-2 px-3 text-right font-mono font-bold" style={{ color: TONE_COLOR[tone], background: TONE_BG[tone] }}>
                {signedPct(r.change[f])}
              </td>
            );
          })}
          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.band == null ? "—" : `±${fmtFixed(r.band, 0)}%`}</td>
          <td className="py-2 px-3 text-right whitespace-nowrap font-semibold" style={{ color: r.significant ? TONE_COLOR[changeTone(r.change.gmvPerHour, r.band, true)] : PAL.muted }}>
            {r.band == null ? "chưa đủ phiên" : r.significant ? ((r.change.gmvPerHour ?? 0) < 0 ? "giảm có ý nghĩa" : "tăng có ý nghĩa") : "trong ngưỡng dao động"}
          </td>
        </tr>
      ))}
    </ReportTable>
    <ToneLegend extra={`· ${METRIC.liveHours} không đánh giá tốt/xấu vì do lịch quyết định`} />
    <MethodNote>
      Ngưỡng dao động 95% = 1,96 × 26% × √(1/n₁ + 1/n₂), n là số phiên của hai tháng đem so; 26% là độ lệch {METRIC.gmvPerHour} của một phiên so với
      mức kỳ vọng. Thay đổi nhỏ hơn ngưỡng có thể chỉ là biến động ngẫu nhiên giữa các phiên nên không kết luận. {METRIC.gmvPerHour} = {METRIC.viewsPerHour} ×{" "}
      {METRIC.liveCtr} × {METRIC.ctor} × {METRIC.aov}.
    </MethodNote>
  </Panel>
);

// ---------- Trang 10: Key Metrics 3 tháng × 5 bảng ----------

export const KeyMetricsPanel: React.FC<{ months: KeyMetricsMonth[]; monthLabel: (m: string) => string; spans: Partial<Record<CampDayBucket, string>>[]; windowNote?: string }> = ({
  months,
  monthLabel,
  spans,
  windowNote
}) => {
  const [tab, setTab] = useState<KeyMetricsTab>("all");
  const tables = Object.fromEntries(KEY_METRICS_TABS.map((t) => [t, keyMetricsTable(months, t)])) as Record<KeyMetricsTab, ReturnType<typeof keyMetricsTable>>;
  const cur = tables[tab];
  const last = months.length - 1;
  const span = (i: number) => (tab === "all" ? windowNote ?? "cả tháng" : tab === "daily" ? "ngoài campaign" : spans[i]?.[tab] ?? "—");
  const bad = cur.rows.filter((r) => r.tones[last] === "down").map((r) => r.def.label);
  return (
    <Panel title="Key Metrics · 3 tháng gần nhất" icon={<Table2 className="w-4 h-4" />} sub="Mỗi đợt campaign so với cùng đợt các tháng trước, theo lịch campaign của từng tháng">
      <div role="tablist" aria-label="Bảng Key Metrics" className="flex flex-wrap gap-1 mb-3">
        {KEY_METRICS_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="min-h-8 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold"
            style={tab === t ? { color: PAL.cream, background: `${PAL.gold}2e`, border: `1px solid ${PAL.gold}73` } : { color: PAL.muted, border: `1px solid ${PAL.line}` }}
          >
            {TAB_LABEL[t]}
            <span className="text-[11px] font-black px-1.5 rounded-full" style={{ background: PAL.panel2, color: tables[t].downCount > 0 ? PAL.red : PAL.muted }}>
              {tables[t].downCount}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[12px] font-bold mb-2" style={{ color: bad.length ? PAL.red : PAL.muted }}>
        {months.length > 1
          ? bad.length
            ? `${monthLabel(months[last].month)} so ${monthLabel(months[last - 1].month)}: ${bad.length} chỉ số suy giảm có ý nghĩa — ${bad.join(", ")}`
            : `${monthLabel(months[last].month)} so ${monthLabel(months[last - 1].month)}: không chỉ số nào suy giảm có ý nghĩa`
          : "Chưa có tháng trước để so."}
      </p>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[620px]">
          <thead>
            <tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
              <th className="py-2 px-3 text-left text-[11px] font-semibold" style={{ color: PAL.muted }}>Chỉ số</th>
              {months.map((m, i) => (
                <th key={m.month} className="py-2 px-3 text-right text-[11px] font-semibold whitespace-nowrap" style={{ color: i === last ? PAL.cream : PAL.muted }}>
                  {monthLabel(m.month)}
                  <span className="block font-normal">{span(i)} · {m.stats[tab].sessions} phiên</span>
                </th>
              ))}
              {months.slice(1).map((m, i) => (
                <th key={`c${m.month}`} className="py-2 px-3 text-right text-[11px] font-semibold whitespace-nowrap" style={{ color: PAL.muted }}>
                  {monthLabel(m.month)} so {monthLabel(months[i].month)}
                  <span className="block font-normal">ngưỡng {cur.bands[i + 1] == null ? "—" : `±${fmtFixed(cur.bands[i + 1]!, 0)}%`}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={months.length * 2} className="pt-3 pb-1 px-3 text-[12px] font-black" style={{ color: PAL.gold, borderBottom: `1px solid ${PAL.line}` }}>Target</td>
            </tr>
            <tr style={rowStyle(0)}>
              <td className="py-2 px-3 font-medium whitespace-nowrap" style={{ color: PAL.cream }}>{METRIC.targetGmv}</td>
              {months.map((m) => (
                <td key={m.month} className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{m.targets?.[tab] ? fmtVndShort(m.targets[tab]!) : "—"}</td>
              ))}
              {months.slice(1).map((m) => <td key={`t${m.month}`} />)}
            </tr>
            <tr style={rowStyle(1)}>
              <td className="py-2 px-3 font-medium whitespace-nowrap" style={{ color: PAL.cream }}>{METRIC.pctTarget}</td>
              {months.map((m) => {
                const t = m.targets?.[tab];
                const p = t ? (m.gmvForTarget[tab] / t) * 100 : null;
                return (
                  <td key={m.month} className="py-2 px-3 text-right font-mono font-bold" style={{ color: p == null ? PAL.muted : p >= 100 ? PAL.green : p >= 95 ? PAL.gold : PAL.red }}>
                    {p == null ? "—" : `${fmtFixed(p, 1)}%`}
                  </td>
                );
              })}
              {months.slice(1).map((m) => <td key={`p${m.month}`} />)}
            </tr>
            {KEY_METRIC_GROUPS.map((g) => (
              <React.Fragment key={g.group}>
                <tr>
                  <td colSpan={months.length * 2} className="pt-3 pb-1 px-3 text-[12px] font-black" style={{ color: PAL.gold, borderBottom: `1px solid ${PAL.line}` }} title={g.hint}>
                    {g.label}
                  </td>
                </tr>
                {cur.rows
                  .filter((r) => r.def.group === g.group)
                  .map((r, idx) => (
                    <tr key={r.def.key} style={rowStyle(idx)}>
                      <td className="py-2 px-3 font-medium whitespace-nowrap" style={{ color: PAL.cream }}>{r.def.label}</td>
                      {r.values.map((v, i) => (
                        <td key={i} className={`py-2 px-3 text-right font-mono ${i === last ? "font-bold" : ""}`} style={{ color: i === last ? PAL.cream : PAL.muted }}>
                          {fmtKeyMetric(r.def, v)}
                        </td>
                      ))}
                      {r.changes.slice(1).map((c, i) => (
                        <td key={`c${i}`} className="py-2 px-3 text-right font-mono font-bold" style={{ color: TONE_COLOR[r.tones[i + 1]], background: TONE_BG[r.tones[i + 1]] }}>
                          {signedPct(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <ToneLegend extra={`· ${METRIC.liveHours} không đánh giá tốt/xấu vì do lịch quyết định · số trên mỗi tab = chỉ số suy giảm có ý nghĩa`} />
      <MethodNote>
        Ngưỡng dao động tính theo số phiên của hai tháng đem so (như trang 3) — đợt campaign chỉ có vài phiên nên ngưỡng rộng. {METRIC.upt} và {METRIC.avgPrice}{" "}
        đổi theo quà tặng kèm (trang 4) nên không đánh giá tốt/xấu. % Target tính trên {METRIC.liveGmv} của mọi phiên, cùng số trang 1.
      </MethodNote>
    </Panel>
  );
};

// ---------- Trang 8: affiliate ----------

export const AffiliatePanel: React.FC<{ rows: CreatorSessionRow[]; totals: CreatorTotals; shopAffiliate: number | null; agencyGmvPerHour: number | null }> = ({
  rows,
  totals,
  shopAffiliate,
  agencyGmvPerHour
}) => {
  const rate = creatorRates(totals);
  const partOf = (n: number) => (n < totals.sessions ? ` · ${n}/${totals.sessions} phiên` : "");
  return (
  <Panel title="Phiên livestream của creator" icon={<Users className="w-4 h-4" />} sub="Tab Affiliate · Direct GMV trong phiên · % Target và ROAS chỉ tính trên các phiên có target / có Ads cost">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mb-4">
      <KpiTile frame="plain" label={METRIC.directGmv} value={fmtVndShort(totals.gmv)} note={rate.pctTarget != null ? `${fmtPct(rate.pctTarget)} target ${fmtVndShort(totals.target)}${partOf(totals.targetSessions)}` : undefined} />
      <KpiTile frame="plain" label="Phiên · giờ" value={`${totals.sessions} · ${fmtHours(totals.hours)}`} note={`${totals.creators} creator`} />
      <KpiTile frame="plain" label={METRIC.gmvPerHour} value={rate.gmvPerHour != null ? fmtVndShort(rate.gmvPerHour) : "—"} note={agencyGmvPerHour != null ? `${METRIC.liveGmv} (YFB) ${fmtVndShort(agencyGmvPerHour)}` : undefined} />
      <KpiTile frame="plain" label={METRIC.roas} value={rate.roas != null ? `${fmtFixed(rate.roas, 1)}x` : "—"} note={rate.roas != null ? `${METRIC.adsCost} ${fmtVndShort(totals.ads)}${partOf(totals.adsSessions)}` : undefined} />
    </div>
    <ReportTable head={["Creator", "Phiên", METRIC.directGmv, METRIC.targetGmv, METRIC.pctTarget, METRIC.gmvPerHour, METRIC.roas]}>
      {rows.map((r, idx) => {
        const tone = r.pctTarget == null ? PAL.muted : r.pctTarget >= 90 ? PAL.green : r.pctTarget >= 60 ? PAL.gold : PAL.red;
        return (
          <tr key={idx} style={rowStyle(idx)}>
            <td className="py-2 px-3 font-semibold whitespace-nowrap" style={{ color: PAL.cream }}>{r.creator}</td>
            <td className="py-2 px-3 text-right font-mono whitespace-nowrap" style={{ color: PAL.muted }}>
              {r.date ? `${r.date.slice(8)}/${r.date.slice(5, 7)}` : "—"}
              {r.campName ? ` · ${r.campName}` : ""}
            </td>
            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(r.gmv)}</td>
            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.target ? fmtVndShort(r.target) : "—"}</td>
            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: tone }}>{r.pctTarget == null ? "—" : `${fmtFixed(r.pctTarget, 0)}%`}</td>
            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{r.gmvPerHour != null ? fmtVndShort(r.gmvPerHour) : "—"}</td>
            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{r.roas != null ? `${fmtFixed(r.roas, 1)}x` : "—"}</td>
          </tr>
        );
      })}
    </ReportTable>
    <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
      {totals.top && totals.creators > 1 && `${totals.top.creator} chiếm ${fmtFixed(totals.top.share, 1)}% Direct GMV của creator. `}
      {shopAffiliate != null && `${CHANNEL.affiliateLive} toàn shop (Shop Analytics) ${fmtVndShort(shopAffiliate)} — gồm cả creator ngoài danh sách. `}
      Mỗi creator chỉ có vài phiên mỗi tháng nên chênh lệch giữa hai phiên có thể là biến động ngẫu nhiên.
    </p>
  </Panel>
  );
};

// ---------- Trang 9: lịch creator tháng sau ----------

export const CreatorPlanPanel: React.FC<{ rows: CreatorPlanRow[]; monthLabel: string; curLabel: string; fxRate: number; draftNote?: string }> = ({ rows, monthLabel, curLabel, fxRate, draftNote }) => {
  const total = rows.reduce((a, r) => ({ target: a.target + (r.target ?? 0), hours: a.hours + (r.hours ?? 0), ads: a.ads + (r.budgetAds ?? 0) }), { target: 0, hours: 0, ads: 0 });
  const creators = new Set(rows.map((r) => r.creator.trim().toLowerCase())).size;
  const topShare = (() => {
    const big = rows.filter((r) => r.target).sort((a, b) => (b.target ?? 0) - (a.target ?? 0))[0];
    return big && total.target > 0 ? { row: big, share: ((big.target ?? 0) / total.target) * 100 } : null;
  })();
  return (
    <Panel title={`Lịch livestream affiliate creator ${monthLabel}`} icon={<CalendarRange className="w-4 h-4" />} sub={`Tab Affiliate → Kế hoạch · Target (USD) = Target GMV ÷ tỷ giá ${fxRate.toLocaleString("vi-VN")} · so GMV/giờ mục tiêu với phiên tốt nhất của creator ở ${curLabel}`}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[880px]">
          <thead>
            <tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
              {["Lịch live", "Creator", "Campaign", "Khung giờ", "Thời lượng", METRIC.targetGmv, "GMV/giờ mục tiêu", "Target (USD)", "Budget Ads", `GMV/giờ ${curLabel} của creator`, `Mục tiêu so với ${curLabel}`, "Note"].map((h, i) => (
                <th key={h} className={`py-2 px-3 text-[11px] font-semibold whitespace-nowrap ${i >= 4 && i <= 9 ? "text-right" : "text-left"}`} style={{ color: PAL.muted }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const tone = r.ratio == null ? PAL.muted : r.ratio >= 2 ? PAL.red : r.ratio >= 1.3 ? PAL.gold : PAL.green;
              return (
                <tr key={idx} style={rowStyle(idx)}>
                  <td className="py-2 px-3 font-mono whitespace-nowrap" style={{ color: PAL.cream }}>{r.date ? `${r.date.slice(8)}/${r.date.slice(5, 7)}` : "—"}</td>
                  <td className="py-2 px-3 font-semibold whitespace-nowrap" style={{ color: PAL.cream }}>{r.creator}</td>
                  <td className="py-2 px-3 whitespace-nowrap" style={{ color: PAL.muted }}>{r.campName ?? "—"}</td>
                  <td className="py-2 px-3 font-mono whitespace-nowrap" style={{ color: PAL.muted }}>{r.timeline ?? "—"}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.hours != null ? fmtHours(r.hours) : "—"}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{r.target ? fmtVndShort(r.target) : "—"}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{r.requiredGmvPerHour != null ? fmtVndShort(r.requiredGmvPerHour) : "—"}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.target && fxRate > 0 ? `$${Math.round(r.target / fxRate).toLocaleString("vi-VN")}` : "—"}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.budgetAds != null ? fmtVndShort(r.budgetAds) : "—"}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.bestGmvPerHour != null ? fmtVndShort(r.bestGmvPerHour) : "—"}</td>
                  <td className="py-2 px-3 whitespace-nowrap font-bold" style={{ color: tone }}>{r.ratio != null ? `gấp ${fmtFixed(r.ratio, 1)} lần` : "chưa có phiên"}</td>
                  <td className="py-2 px-3 min-w-[140px]" style={{ color: PAL.muted }}>{r.note ?? ""}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: `1px solid ${PAL.muted}55` }}>
              <td colSpan={4} className="py-2 px-3 font-bold" style={{ color: PAL.gold }}>Tổng · {rows.length} phiên · {creators} creator</td>
              <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtHours(total.hours)}</td>
              <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(total.target)}</td>
              <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{total.hours > 0 ? fmtVndShort(total.target / total.hours) : "—"}</td>
              <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fxRate > 0 ? `$${Math.round(total.target / fxRate).toLocaleString("vi-VN")}` : "—"}</td>
              <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtVndShort(total.ads)}</td>
              <td colSpan={3} className="py-2 px-3 font-mono" style={{ color: PAL.muted }}>{total.target > 0 ? `Ads = ${fmtFixed((total.ads / total.target) * 100, 1)}% target` : ""}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {topShare && topShare.share >= 40 && (
        <p className="text-[11px] mt-2" style={{ color: PAL.gold }}>
          Phiên {topShare.row.creator}{topShare.row.date ? ` ${topShare.row.date.slice(8)}/${topShare.row.date.slice(5, 7)}` : ""} chiếm {fmtFixed(topShare.share, 0)}% target affiliate tháng
          {topShare.row.ratio != null ? ` và cần GMV/giờ gấp ${fmtFixed(topShare.row.ratio, 1)} lần phiên tốt nhất của creator này ở ${curLabel}` : ""} — kết quả affiliate cả tháng phụ thuộc lớn vào một phiên.
        </p>
      )}
      {draftNote && <p className="text-[11px] mt-1" style={{ color: PAL.gold }}>{draftNote}</p>}
    </Panel>
  );
};

// ---------- Trang 6: hủy, hoàn & NMV ----------

export const NmvPanel: React.FC<{
  gmv: number;
  refundRate: number | null;
  refundRatePrev: number | null;
  windowLabel: string;
  contractRate: number | null;
  shopRefundOnly: boolean;
  /** Trạng thái chốt của Refund rate tháng này (lib/refundStatus.ts). */
  refundStatus?: { label: string; reasons: string[]; definitionWarning: string | null } | null;
  /** Có chuỗi này ⇒ tháng trước khác mẫu file, không so sánh. */
  refundNotComparable?: string | null;
  nmvRate?: number | null;
  nmvLabel?: string | null;
  nmvIsEstimate?: boolean;
}> = ({ gmv, refundRate, refundRatePrev, windowLabel, contractRate, shopRefundOnly, refundStatus, refundNotComparable, nmvRate, nmvLabel, nmvIsEstimate }) => {
  const bars: [string, number, string][] = [];
  if (contractRate != null) bars.push([`Theo tỷ lệ hoàn hủy trong hợp đồng (${fmtFixed(contractRate, 1)}%)`, gmv * (1 - contractRate / 100), PAL.gold]);
  if (refundRate != null) bars.push([`Chỉ trừ ${METRIC.refundRate} thực tế (${fmtFixed(refundRate, 1)}%${refundStatus ? `, ${refundStatus.label}` : ""})`, gmv * (1 - refundRate / 100), PAL.blue]);
  if (nmvRate != null && nmvRate !== contractRate && nmvRate !== refundRate) bars.push([`${METRIC.nmv}${nmvIsEstimate ? " ước tính" : ""} (${fmtFixed(nmvRate, 1)}%)`, gmv * (1 - nmvRate / 100), PAL.gold]);
  const max = Math.max(gmv, ...bars.map((b) => b[1]));
  return (
    <Panel title="Hủy, hoàn & NMV" icon={<Receipt className="w-4 h-4" />} sub={`${METRIC.nmv} = ${METRIC.liveGmv} × (1 − tỷ lệ hoàn hủy) · ${METRIC.refundRate} của Shop Analytics, ${windowLabel}`}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mb-4">
        <KpiTile frame="plain" label={`${METRIC.refundRate} toàn shop`} value={refundRate != null ? fmtPct(refundRate) : "—"} note={refundRatePrev != null ? `tháng trước ${fmtPct(refundRatePrev)}` : refundNotComparable ?? "Shop Analytics"} />
        <KpiTile frame="plain" label="Tỷ lệ hủy" value="—" note="cần dữ liệu Order (chưa có trong report)" />
        <KpiTile frame="plain" label={`${METRIC.liveGmv} trước hoàn hủy`} value={fmtVndShort(gmv)} />
      </div>
      <div className="space-y-2">
        {bars.map(([label, v, color]) => (
          <div key={label} className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4.5rem] gap-3 items-center text-[12px]">
            <span style={{ color: PAL.cream }}>{label}</span>
            <span className="h-3 rounded overflow-hidden" style={{ background: PAL.panel2 }}>
              <span className="block h-full rounded" style={{ width: `${(v / max) * 100}%`, background: color }} />
            </span>
            <span className="text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(v)}</span>
          </div>
        ))}
      </div>
      {(refundStatus?.reasons.length || refundStatus?.definitionWarning || nmvLabel) && (
        <p className="text-[11px] mt-3" style={{ color: PAL.muted }}>
          {refundStatus && refundStatus.reasons.length > 0 ? `${METRIC.refundRate} tạm tính — chưa chốt vì ${refundStatus.reasons.join("; ")}. ` : ""}
          {refundStatus?.definitionWarning ? `${refundStatus.definitionWarning} ` : ""}
          {nmvLabel ? `${METRIC.nmv}: ${nmvLabel}.` : ""}
        </p>
      )}
      <p className="text-[11px] mt-3" style={{ color: PAL.muted }}>
        {shopRefundOnly
          ? `${METRIC.refundRate} chỉ gồm giá trị hoàn tiền, chưa gồm đơn hủy — ${METRIC.nmv} thật sẽ thấp hơn. `
          : ""}
        {bars.length > 1 ? `Hai cách tính cho ${METRIC.nmv} khác nhau khi chưa có số liệu đơn hủy; ` : ""}Công thức {METRIC.nmv} nên thống nhất trong hợp đồng.
      </p>
    </Panel>
  );
};
