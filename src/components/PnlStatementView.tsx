import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { changePct, type PnlLine, type PnlRow, type PnlStatement, type PnlTrendPoint, type DailyTrend } from "../lib/accounting/pnlStatement";
import { fmtFixed, fmtMonth, fmtVndFull, fmtVndShort } from "../lib/format";
import { PlatformChip } from "./common/PlatformChip";
import { StatTile } from "./common/StatTile";

const TH = "py-2 pr-3 text-[11px] font-semibold text-[var(--text-muted)] whitespace-nowrap";
const TD = "py-2 pr-3 whitespace-nowrap";
const NUM = `${TD} text-right tabular-nums`;

/** "+12%" / "−8%" so với tháng trước; undefined khi không so được. */
function deltaText(cur: number, prev: number | undefined): { text: string; tone: string } | undefined {
  const c = changePct(cur, prev);
  if (c == null) return undefined;
  const rounded = Math.round(c);
  if (rounded === 0) return { text: "như tháng trước", tone: "text-[var(--text-faint)]" };
  return { text: `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}% so với tháng trước`, tone: rounded > 0 ? "text-emerald-400" : "text-red-400" };
}

const Delta: React.FC<{ cur: number; prev?: number; goodWhenUp?: boolean }> = ({ cur, prev, goodWhenUp = true }) => {
  const d = deltaText(cur, prev);
  if (!d) return null;
  // Chi phí tăng là xấu: đảo màu.
  const tone = goodWhenUp ? d.tone : d.tone.includes("emerald") ? "text-red-400" : d.tone.includes("red") ? "text-emerald-400" : d.tone;
  return <span className={tone}>{d.text}</span>;
};

// Một bảng màu cho cả ba biểu đồ: công talent = hồng, chi phí ca = vàng, lãi gộp = xanh, doanh thu = màu nhấn.
const C_REV = "var(--accent)";
const C_PAY = "#fb7185";
const C_COST = "#fbbf24";
const C_GP = "#10b981";
const C_LOSS = "#ef4444";
const AXIS = { fontSize: 11, fill: "var(--text-muted)" };
const TIP = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

const Legend2: React.FC<{ items: [string, string][] }> = ({ items }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
    {items.map(([c, l]) => (
      <span key={l}>
        <i className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: c }} />
        {l}
      </span>
    ))}
  </div>
);

const Card: React.FC<{ title: string; hint?: string; className?: string; children: React.ReactNode }> = ({ title, hint, className = "", children }) => (
  <section className={`bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] space-y-3 min-w-0 ${className}`}>
    <div>
      <h3 className="font-bold text-[var(--text)] text-base">{title}</h3>
      {hint && <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

/** Thác nước dọc: doanh thu → trừ công talent → trừ chi phí ca → lãi gộp. */
const Waterfall: React.FC<{ statement: PnlStatement }> = ({ statement }) => {
  const [rev, pay, cost, gp] = statement.waterfall;
  const data = [
    { name: "Doanh thu", range: [0, rev.value], fill: C_REV, shown: rev.value },
    { name: "Công talent", range: [rev.value + pay.value, rev.value], fill: C_PAY, shown: pay.value },
    { name: "Chi phí ca", range: [gp.value, rev.value + pay.value], fill: C_COST, shown: cost.value },
    { name: "Lãi gộp", range: [Math.min(gp.value, 0), Math.max(gp.value, 0)], fill: gp.value < 0 ? C_LOSS : C_GP, shown: gp.value }
  ];
  return (
    <div className="h-[260px]" role="img" aria-label={`Doanh thu ${fmtVndFull(rev.value)}, lãi gộp ${fmtVndFull(gp.value)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border-muted)" vertical={false} />
          <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
          <YAxis tickFormatter={(v: number) => fmtVndShort(v)} tick={AXIS} axisLine={false} tickLine={false} width={44} />
          <Tooltip contentStyle={TIP} cursor={false} formatter={(_v, _n, item) => fmtVndFull((item.payload as { shown: number }).shown)} />
          <Bar dataKey="range" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
            <LabelList dataKey="shown" position="top" formatter={(v: unknown) => fmtVndShort(Number(v))} style={{ fontSize: 11, fill: "var(--text)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Mỗi brand · sàn một thanh 100% doanh thu: phần lãi gộp càng dài càng khỏe; số tuyệt đối ở bên phải. */
const BrandBars: React.FC<{ rows: PnlRow[] }> = ({ rows }) => {
  const shown = rows.filter((r) => r.coverage !== "none" && r.revenue > 0);
  if (shown.length === 0) return null;
  const pct = (v: number, r: PnlRow) => `${(Math.max(v, 0) / Math.max(r.revenue, r.talentPay + r.sessionCosts)) * 100}%`;
  return (
    <div className="space-y-2.5">
      <Legend2 items={[[C_PAY, "Công talent"], [C_COST, "Chi phí ca"], [C_GP, "Lãi gộp"]]} />
      {shown.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(110px,170px)_1fr_minmax(150px,200px)] items-center gap-3 text-xs">
          <span className="truncate text-[var(--text)] font-semibold">
            {r.brandName} <PlatformChip platform={r.platform} />
          </span>
          <div className="flex h-5 rounded bg-[var(--surface-base)] overflow-hidden" role="img" aria-label={`${r.brandName}: doanh thu ${fmtVndFull(r.revenue)}, lãi gộp ${fmtVndFull(r.grossProfit)}`}>
            <div className="h-full" style={{ width: pct(r.talentPay, r), background: C_PAY }} />
            <div className="h-full" style={{ width: pct(r.sessionCosts, r), background: C_COST }} />
            <div className="h-full" style={{ width: pct(r.grossProfit, r), background: C_GP }} />
          </div>
          <span className="text-right tabular-nums">
            <span className="text-[var(--text-muted)]">{fmtVndShort(r.revenue)} → </span>
            <span className={`font-semibold ${r.grossProfit < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmtVndShort(r.grossProfit)}</span>
            {r.margin != null && <span className="text-[var(--text-faint)]"> · {fmtFixed(r.margin, 0)}%</span>}
          </span>
        </div>
      ))}
    </div>
  );
};

/** Xu hướng nhiều tháng: cột chồng = doanh thu tách thành công talent / chi phí ca / lãi gộp; đường = biên lãi %. */
const TrendChart: React.FC<{ trend: PnlTrendPoint[]; current: string }> = ({ trend, current }) => {
  const data = trend.map((t) => ({
    name: `T${Number(t.month.slice(5))}/${t.month.slice(2, 4)}`,
    month: t.month,
    "Công talent": Math.round(t.talentPay),
    "Chi phí ca": Math.round(t.sessionCosts),
    "Lãi gộp": Math.round(Math.max(t.grossProfit, 0)),
    "Doanh thu": Math.round(t.revenue),
    "Biên lãi": t.margin == null ? null : Math.round(t.margin * 10) / 10,
    partial: t.coverage !== "full"
  }));
  return (
    <div className="space-y-2">
      <Legend2 items={[[C_PAY, "Công talent"], [C_COST, "Chi phí ca"], [C_GP, "Lãi gộp"], ["#f472b6", "Biên lãi % (trục phải)"]]} />
      <div className="h-[260px]" role="img" aria-label="Doanh thu tách công talent, chi phí ca, lãi gộp và biên lãi theo tháng">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border-muted)" vertical={false} />
            <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis yAxisId="vnd" tickFormatter={(v: number) => fmtVndShort(v)} tick={AXIS} axisLine={false} tickLine={false} width={44} />
            <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={AXIS} axisLine={false} tickLine={false} width={38} />
            <Tooltip contentStyle={TIP} formatter={(v, n) => (n === "Biên lãi" ? `${v}%` : fmtVndFull(Number(v)))} />
            <Bar yAxisId="vnd" dataKey="Công talent" stackId="s" fill={C_PAY} maxBarSize={56} isAnimationActive={false} />
            <Bar yAxisId="vnd" dataKey="Chi phí ca" stackId="s" fill={C_COST} maxBarSize={56} isAnimationActive={false} />
            <Bar yAxisId="vnd" dataKey="Lãi gộp" stackId="s" fill={C_GP} maxBarSize={56} isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.month} fillOpacity={d.month === current ? 1 : 0.55} />
              ))}
            </Bar>
            <Line yAxisId="pct" type="monotone" dataKey="Biên lãi" stroke="#f472b6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Màu phân loại cho account: tránh hồng/vàng/xanh lá đã dành cho công talent / chi phí / lãi gộp.
const ACCOUNT_COLORS = ["#60a5fa", "#a78bfa", "#2dd4bf", "#fb923c", "#e879f9", "#38bdf8", "#a3e635", "#f87171"];

/** Mỗi account (brand · sàn) một đường lãi gộp theo ngày trong tháng; đường 0 là ranh lãi/lỗ, Shopee nét đứt. */
const DailyLines: React.FC<{ daily: DailyTrend }> = ({ daily }) => {
  const [mode, setMode] = React.useState<"cumulative" | "perDay">("cumulative");
  const series = daily.series.slice(0, ACCOUNT_COLORS.length);
  const label = (s: (typeof series)[number]) => `${s.brandName} · ${s.platform}`;
  const data = daily.days.map((d, i) => ({
    day: d,
    ...Object.fromEntries(series.map((s) => [label(s), Math.round(mode === "cumulative" ? s.cumulative[i] : s.perDay[i])]))
  }));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend2 items={series.map((s, i): [string, string] => [ACCOUNT_COLORS[i], label(s)])} />
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-xs" role="group" aria-label="Kiểu số liệu">
          {(
            [
              ["cumulative", "Cộng dồn"],
              ["perDay", "Từng ngày"]
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`px-3 py-1 rounded-md min-h-[28px] ${mode === k ? "seg-on font-semibold" : "text-[var(--text-muted)]"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[300px]" role="img" aria-label="Lãi gộp từng account theo ngày trong tháng">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border-muted)" vertical={false} />
            <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(d: number) => `${d}`} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v: number) => fmtVndShort(v)} tick={AXIS} axisLine={false} tickLine={false} width={48} />
            <Tooltip contentStyle={TIP} labelFormatter={(d) => `Ngày ${d}`} formatter={(v) => fmtVndFull(Number(v))} itemSorter={(i) => -Number(i.value ?? 0)} />
            <ReferenceLine y={0} stroke="var(--text-faint)" strokeDasharray="4 3" />
            {series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={label(s)} stroke={ACCOUNT_COLORS[i]} strokeWidth={2} strokeDasharray={s.platform === "Shopee" ? "6 3" : undefined} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const CoverageChip: React.FC<{ row: PnlLine }> = ({ row }) => {
  if (row.total === 0) return <span className="text-[var(--text-faint)]">—</span>;
  const tone = row.coverage === "full" ? "text-emerald-400" : row.coverage === "partial" ? "text-amber-300" : "text-red-400";
  return (
    <span className={tone} title="ca đủ dữ liệu / tổng ca">
      {row.counted}/{row.total}
    </span>
  );
};

const RowCells: React.FC<{ r: PnlRow }> = ({ r }) => {
  const none = r.coverage === "none";
  return (
    <>
      <td className={NUM}>{none ? "—" : <>{fmtVndFull(r.revenue)}{r.estimated && <span className="ml-1 text-[11px] text-amber-300" title="NMV còn theo % hoàn ước tính">ước tính</span>}</>}</td>
      <td className={NUM}>{none ? "—" : fmtVndFull(r.talentPay)}</td>
      <td className={NUM}>{none ? "—" : fmtVndFull(r.sessionCosts)}</td>
      <td className={`${NUM} font-bold ${none ? "text-[var(--text-faint)]" : r.grossProfit < 0 ? "text-red-400" : "text-emerald-400"}`}>{none ? "—" : fmtVndFull(r.grossProfit)}</td>
      <td className={NUM}>{none || r.margin == null ? "—" : `${fmtFixed(r.margin, 1)}%`}</td>
      <td className={`${NUM} text-[11px]`}>{r.prev ? <Delta cur={r.grossProfit} prev={r.prev.grossProfit} /> : <span className="text-[var(--text-faint)]">—</span>}</td>
      <td className={NUM}>
        <CoverageChip row={r} />
      </td>
    </>
  );
};

export const PnlStatementView: React.FC<{ statement: PnlStatement; trend: PnlTrendPoint[]; daily: DailyTrend; hasPrev: boolean; onOpenDetail: () => void }> = ({ statement, trend, daily, hasPrev, onOpenDetail }) => {
  const t = statement.total;
  const p = statement.prevTotal;
  const empty = t.total === 0;
  // Tháng chưa có số nào thì so với tháng trước chỉ ra "−100%" gây hiểu lầm.
  hasPrev = hasPrev && t.counted > 0;
  const covered = t.coverage === "full";
  return (
    <div className="space-y-6">
      {!empty && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center gap-x-3 gap-y-1 ${covered ? "border-emerald-500/40" : "border-amber-500/50"} bg-[var(--surface-base)]`}
        >
          <span className="font-bold text-[var(--text)]">
            {covered ? "Đủ số cả tháng" : `Mới tính được ${t.counted}/${t.total} ca`}
          </span>
          <span className="text-[var(--text-muted)]">
            {covered
              ? `${fmtMonth(statement.month)}: mọi ca tính tiền đều đủ rate và giá.`
              : `${statement.uncountedSessions} ca thiếu rate hoặc giá chưa vào P&L — lãi gộp bên dưới chỉ là phần đã tính được, không phải cả tháng.`}
          </span>
          {!covered && (
            <button type="button" onClick={onOpenDetail} className="ml-auto font-semibold text-[var(--accent-text)] hover:underline min-h-[24px]">
              Xem ca thiếu ở Đối chiếu
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile frame="card" label="Doanh thu" value={fmtVndFull(t.revenue)} hint={hasPrev ? <Delta cur={t.revenue} prev={p?.revenue} /> : undefined} />
        <StatTile frame="card" label="Công talent" value={fmtVndFull(t.talentPay)} hint={hasPrev ? <Delta cur={t.talentPay} prev={p?.talentPay} goodWhenUp={false} /> : undefined} />
        <StatTile frame="card" label="Chi phí ca" value={fmtVndFull(t.sessionCosts)} hint={t.sessionCosts === 0 ? "studio + Ads theo ca, chưa có số" : hasPrev ? <Delta cur={t.sessionCosts} prev={p?.sessionCosts} goodWhenUp={false} /> : undefined} />
        <StatTile
          frame="card"
          label="Lãi gộp"
          value={t.counted === 0 ? "Chưa tính được" : fmtVndFull(t.grossProfit)}
          tone={t.counted === 0 ? "text-[var(--text-faint)]" : t.grossProfit < 0 ? "text-red-400" : "text-emerald-400"}
          hint={t.margin != null ? <>{fmtFixed(t.margin, 1)}% doanh thu{hasPrev && changePct(t.grossProfit, p?.grossProfit) != null ? <> · <Delta cur={t.grossProfit} prev={p?.grossProfit} /></> : null}</> : undefined}
        />
      </div>

      {!empty && t.counted > 0 && (
        <div className="grid gap-4 lg:grid-cols-5">
          {trend.length >= 2 && (
            <Card title={`Xu hướng ${trend.length} tháng`} hint="Cột = doanh thu chia ba phần; tháng đang xem đậm hơn. Tháng chưa đủ ca tính được sẽ thấp hơn thực tế." className="lg:col-span-3">
              <TrendChart trend={trend} current={statement.month} />
            </Card>
          )}
          <Card title={`Từ doanh thu đến lãi gộp · ${fmtMonth(statement.month)}`} className={trend.length >= 2 ? "lg:col-span-2" : "lg:col-span-5"}>
            <Waterfall statement={statement} />
          </Card>
        </div>
      )}

      {daily.series.length > 0 && (
        <Card title={`Lãi / lỗ từng account theo ngày · ${fmtMonth(statement.month)}`} hint="Mỗi đường là một brand · sàn; xuống dưới đường 0 là lỗ. Tính theo từng ca, chưa gồm khoản chốt cả tháng (hoàn NMV, phí tháng) nên cuối tháng có thể lệch bảng.">
          <DailyLines daily={daily} />
        </Card>
      )}

      {!empty && t.counted > 0 && (
        <Card title="Mỗi brand · sàn giữ lại bao nhiêu lãi" hint="Thanh = 100% doanh thu của dòng đó.">
          <BrandBars rows={statement.rows} />
        </Card>
      )}

      <section className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] space-y-3">
        <h3 className="font-bold text-[var(--text)] text-base">Lãi gộp theo brand và sàn</h3>
        {statement.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Tháng {fmtMonth(statement.month)} chưa có ca nào tính tiền.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-[var(--border)]">
                  <th className={TH}>Brand · sàn</th>
                  <th className={`${TH} text-right`}>Doanh thu</th>
                  <th className={`${TH} text-right`}>Công talent</th>
                  <th className={`${TH} text-right`}>Chi phí ca</th>
                  <th className={`${TH} text-right`}>Lãi gộp</th>
                  <th className={`${TH} text-right`}>Biên</th>
                  <th className={`${TH} text-right`}>Lãi gộp so tháng trước</th>
                  <th className={`${TH} text-right`}>Ca tính được</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-muted)]">
                {statement.rows.map((r) => (
                  <tr key={r.key}>
                    <td className={TD}>
                      <span className="font-semibold text-[var(--text)]">{r.brandName}</span> <PlatformChip platform={r.platform} />
                    </td>
                    <RowCells r={r} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border)] font-bold text-[var(--text)]">
                  <td className={TD}>Tổng</td>
                  <td className={NUM}>{fmtVndFull(t.revenue)}</td>
                  <td className={NUM}>{fmtVndFull(t.talentPay)}</td>
                  <td className={NUM}>{fmtVndFull(t.sessionCosts)}</td>
                  <td className={NUM}>{fmtVndFull(t.grossProfit)}</td>
                  <td className={NUM}>{t.margin == null ? "—" : `${fmtFixed(t.margin, 1)}%`}</td>
                  <td className={`${NUM} text-[11px]`}>{p ? <Delta cur={t.grossProfit} prev={p.grossProfit} /> : "—"}</td>
                  <td className={NUM}>
                    <CoverageChip row={t} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
