import React from "react";
import { changePct, type PnlLine, type PnlRow, type PnlStatement, type PnlTrendPoint, type DailyTrend } from "../lib/accounting/pnlStatement";
import { fmtFixed, fmtMonth, fmtVndFull, fmtVndShort } from "../lib/format";
import { platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { PlatformChip } from "./common/PlatformChip";
import { StatTile } from "./common/StatTile";
import { niceMax, useTooltip } from "./dashboard/shared";

const TH = "py-2 pr-3 text-2xs font-semibold text-[var(--text-muted)] whitespace-nowrap";
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
const C_MARGIN = "#f472b6";

const Legend2: React.FC<{ items: [string, string][] }> = ({ items }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-[var(--text-muted)]">
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
      {hint && <p className="text-2xs text-[var(--text-faint)] mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

// Trục Y của cả ba biểu đồ chia 4 mức; r1 giữ toạ độ SVG một chữ số thập phân cho file nhẹ.
const TICKS = [0, 1, 2, 3, 4];
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Mức âm (lỗ) cũng cần một đầu trục tròn trịa. */
const axisMin = (lo: number) => (lo < 0 ? -niceMax(-lo) : 0);

/** Thác nước dọc: doanh thu → trừ công talent → trừ chi phí ca → lãi gộp. */
const Waterfall: React.FC<{ statement: PnlStatement }> = ({ statement }) => {
  const tip = useTooltip();
  const [rev, pay, cost, gp] = statement.waterfall;
  const bars = [
    { name: "Doanh thu", lo: 0, hi: rev.value, fill: C_REV, shown: rev.value },
    { name: "Công talent", lo: rev.value + pay.value, hi: rev.value, fill: C_PAY, shown: pay.value },
    { name: "Chi phí ca", lo: gp.value, hi: rev.value + pay.value, fill: C_COST, shown: cost.value },
    { name: "Lãi gộp", lo: Math.min(gp.value, 0), hi: Math.max(gp.value, 0), fill: gp.value < 0 ? C_LOSS : C_GP, shown: gp.value }
  ];
  const W = 480, H = 260, L = 54, R = 8, T = 24, B = 26, iw = W - L - R, ih = H - T - B;
  const ymax = niceMax(Math.max(1, ...bars.map((b) => b.hi)));
  const ymin = axisMin(Math.min(0, ...bars.map((b) => b.lo)));
  const Y = (v: number) => T + ih - (ih * (v - ymin)) / (ymax - ymin);
  const slot = iw / bars.length, bw = Math.min(64, slot * 0.6);
  return (
    <div onMouseMove={tip.onMove} onMouseLeave={tip.onLeave}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Doanh thu ${fmtVndFull(rev.value)}, lãi gộp ${fmtVndFull(gp.value)}`}>
        {TICKS.map((j) => {
          const v = ymin + ((ymax - ymin) * j) / 4;
          return (
            <g key={j}>
              <line x1={L} x2={L + iw} y1={r1(Y(v))} y2={r1(Y(v))} stroke="var(--border-muted)" />
              <text x={L - 6} y={r1(Y(v)) + 3.5} textAnchor="end" fontSize="11" fill="var(--text-muted)">
                {fmtVndShort(v)}
              </text>
            </g>
          );
        })}
        {bars.map((b, i) => {
          const x = L + slot * i + (slot - bw) / 2;
          return (
            <g key={b.name} data-tip={`${b.name}: ${fmtVndFull(b.shown)}`}>
              <rect x={r1(x)} y={r1(Y(b.hi))} width={r1(bw)} height={r1(Math.max(1, Y(b.lo) - Y(b.hi)))} rx="3" fill={b.fill} />
              <text x={r1(x + bw / 2)} y={r1(Y(b.hi)) - 7} textAnchor="middle" fontSize="11" fill="var(--text)">
                {fmtVndShort(b.shown)}
              </text>
              <text x={r1(x + bw / 2)} y={H - 7} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
                {b.name}
              </text>
            </g>
          );
        })}
      </svg>
      {tip.node}
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
  const tip = useTooltip();
  const pts = trend.map((t) => ({
    month: t.month,
    name: `T${Number(t.month.slice(5))}/${t.month.slice(2, 4)}`,
    pay: Math.round(t.talentPay),
    cost: Math.round(t.sessionCosts),
    gp: Math.round(Math.max(t.grossProfit, 0)),
    revenue: Math.round(t.revenue),
    margin: t.margin == null ? null : Math.round(t.margin * 10) / 10
  }));
  const W = 760, H = 260, L = 54, R = 44, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
  const n = Math.max(pts.length, 1);
  const ymax = niceMax(Math.max(1, ...pts.map((p) => p.pay + p.cost + p.gp)));
  const Y = (v: number) => T + ih - (ih * v) / ymax;
  const Ypct = (v: number) => T + ih - (ih * v) / 100;
  const slot = iw / n, bw = Math.min(56, slot * 0.62);
  const X = (i: number) => L + slot * (i + 0.5);
  const marginPath = pts
    .map((p, i) => (p.margin == null ? null : `${r1(X(i))} ${r1(Ypct(p.margin))}`))
    .filter((v): v is string => v !== null)
    .map((v, i) => `${i ? "L" : "M"}${v}`)
    .join("");
  return (
    <div className="space-y-2">
      <Legend2 items={[[C_PAY, "Công talent"], [C_COST, "Chi phí ca"], [C_GP, "Lãi gộp"], [C_MARGIN, "Biên lãi % (trục phải)"]]} />
      <div onMouseMove={tip.onMove} onMouseLeave={tip.onLeave}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Doanh thu tách công talent, chi phí ca, lãi gộp và biên lãi theo tháng">
          {TICKS.map((j) => {
            const v = (ymax * j) / 4;
            return (
              <g key={j}>
                <line x1={L} x2={L + iw} y1={r1(Y(v))} y2={r1(Y(v))} stroke="var(--border-muted)" />
                <text x={L - 6} y={r1(Y(v)) + 3.5} textAnchor="end" fontSize="11" fill="var(--text-muted)">
                  {fmtVndShort(v)}
                </text>
                <text x={L + iw + 6} y={r1(Ypct((100 * j) / 4)) + 3.5} fontSize="11" fill="var(--text-muted)">
                  {(100 * j) / 4}%
                </text>
              </g>
            );
          })}
          {pts.map((p, i) => {
            const x = L + slot * i + (slot - bw) / 2;
            const o = p.month === current ? 1 : 0.55;
            const seg = (lo: number, hi: number, fill: string, k: string) =>
              hi > lo ? <rect key={k} x={r1(x)} y={r1(Y(hi))} width={r1(bw)} height={r1(Math.max(1, Y(lo) - Y(hi)))} fill={fill} opacity={o} rx={k === "gp" ? 3 : 0} /> : null;
            return (
              <g
                key={p.month}
                data-tip={`${p.name}\nDoanh thu ${fmtVndFull(p.revenue)}\nCông talent ${fmtVndFull(p.pay)}\nChi phí ca ${fmtVndFull(p.cost)}\nLãi gộp ${fmtVndFull(p.gp)}${p.margin == null ? "" : `\nBiên lãi ${fmtFixed(p.margin, 1)}%`}`}
              >
                <rect x={r1(L + slot * i)} y={T} width={r1(slot)} height={ih} fill="transparent" />
                {seg(0, p.pay, C_PAY, "pay")}
                {seg(p.pay, p.pay + p.cost, C_COST, "cost")}
                {seg(p.pay + p.cost, p.pay + p.cost + p.gp, C_GP, "gp")}
                <text x={r1(X(i))} y={H - 7} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
                  {p.name}
                </text>
              </g>
            );
          })}
          {marginPath && <path d={marginPath} fill="none" stroke={C_MARGIN} strokeWidth="2" />}
          {pts.map((p, i) => (p.margin == null ? null : <circle key={`m${p.month}`} cx={r1(X(i))} cy={r1(Ypct(p.margin))} r="3" fill={C_MARGIN} />))}
        </svg>
        {tip.node}
      </div>
    </div>
  );
};

// Màu phân loại cho account: tránh hồng/vàng/xanh lá đã dành cho công talent / chi phí / lãi gộp.
// Nét vẽ theo sàn (hồ sơ sàn không giữ nét vẽ nên khai Record ở đây, không rẽ nhánh if theo tên sàn).
const LINE_DASH: Record<ReportPlatform, string | undefined> = { TikTok: undefined, Shopee: "6 3" };

const ACCOUNT_COLORS = ["#60a5fa", "#a78bfa", "#2dd4bf", "#fb923c", "#e879f9", "#38bdf8", "#a3e635", "#f87171"];

/** Mỗi account (brand · sàn) một đường lãi gộp theo ngày trong tháng; đường 0 là ranh lỗ, Shopee nét đứt. */
const DailyLines: React.FC<{ daily: DailyTrend }> = ({ daily }) => {
  const [mode, setMode] = React.useState<"cumulative" | "perDay">("cumulative");
  const tip = useTooltip();
  const series = daily.series.slice(0, ACCOUNT_COLORS.length);
  const label = (s: (typeof series)[number]) => `${s.brandName} · ${s.platform}`;
  const vals = series.map((s) => (mode === "cumulative" ? s.cumulative : s.perDay).map((v) => Math.round(v)));
  const W = 760, H = 300, L = 56, R = 14, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
  const n = Math.max(daily.days.length, 1);
  const flat = vals.flat();
  const ymax = niceMax(Math.max(1, ...flat));
  const ymin = axisMin(Math.min(0, ...flat));
  const X = (i: number) => (n === 1 ? L + iw / 2 : L + (iw * i) / (n - 1));
  const Y = (v: number) => T + ih - (ih * (v - ymin)) / (ymax - ymin);
  const every = Math.ceil(n / 10);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend2 items={series.map((s, i): [string, string] => [ACCOUNT_COLORS[i], label(s)])} />
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-xs" role="group" aria-label="Kiểu số liệu">
          {(
            [
              ["cumulative", "Luỹ kế"],
              ["perDay", "Từng ngày"]
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`px-3 py-1 rounded-md min-h-[28px] ${mode === k ? "seg-on font-semibold" : "text-[var(--text-muted)]"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div onMouseMove={tip.onMove} onMouseLeave={tip.onLeave}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Lãi gộp từng account theo ngày trong tháng">
          {TICKS.map((j) => {
            const v = ymin + ((ymax - ymin) * j) / 4;
            return (
              <g key={j}>
                <line x1={L} x2={L + iw} y1={r1(Y(v))} y2={r1(Y(v))} stroke="var(--border-muted)" />
                <text x={L - 6} y={r1(Y(v)) + 3.5} textAnchor="end" fontSize="11" fill="var(--text-muted)">
                  {fmtVndShort(v)}
                </text>
              </g>
            );
          })}
          {ymin < 0 && <line x1={L} x2={L + iw} y1={r1(Y(0))} y2={r1(Y(0))} stroke="var(--text-faint)" strokeDasharray="4 3" />}
          {daily.days.map((d, i) => (i % every === 0 ? (
            <text key={d} x={r1(X(i))} y={H - 7} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {d}
            </text>
          ) : null))}
          {series.map((s, si) => (
            <path
              key={s.key}
              d={vals[si].map((v, i) => `${i ? "L" : "M"}${r1(X(i))} ${r1(Y(v))}`).join("")}
              fill="none"
              stroke={ACCOUNT_COLORS[si]}
              strokeWidth="2"
              strokeDasharray={LINE_DASH[platformOf(s)]}
            />
          ))}
          {daily.days.map((d, i) => (
            <rect
              key={`t${d}`}
              x={r1(X(i) - iw / n / 2)}
              y={T}
              width={r1(Math.max(2, iw / n))}
              height={ih}
              fill="transparent"
              data-tip={`Ngày ${d}\n${series
                .map((s, si) => ({ t: `${label(s)}: ${fmtVndFull(vals[si][i] ?? 0)}`, v: vals[si][i] ?? 0 }))
                .sort((a, b) => b.v - a.v)
                .map((x) => x.t)
                .join("\n")}`}
            />
          ))}
        </svg>
        {tip.node}
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
      <td className={NUM}>{none ? "—" : <>{fmtVndFull(r.revenue)}{r.estimated && <span className="ml-1 text-2xs text-amber-300" title="NMV còn theo % hoàn ước tính">ước tính</span>}</>}</td>
      <td className={NUM}>{none ? "—" : fmtVndFull(r.talentPay)}</td>
      <td className={NUM}>{none ? "—" : fmtVndFull(r.sessionCosts)}</td>
      <td className={`${NUM} font-bold ${none ? "text-[var(--text-faint)]" : r.grossProfit < 0 ? "text-red-400" : "text-emerald-400"}`}>{none ? "—" : fmtVndFull(r.grossProfit)}</td>
      <td className={NUM}>{none || r.margin == null ? "—" : `${fmtFixed(r.margin, 1)}%`}</td>
      <td className={`${NUM} text-2xs`}>{r.prev ? <Delta cur={r.grossProfit} prev={r.prev.grossProfit} /> : <span className="text-[var(--text-faint)]">—</span>}</td>
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
                  <td className={`${NUM} text-2xs`}>{p ? <Delta cur={t.grossProfit} prev={p.grossProfit} /> : "—"}</td>
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
