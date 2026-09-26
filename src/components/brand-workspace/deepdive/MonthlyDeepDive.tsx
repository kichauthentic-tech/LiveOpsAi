import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, ReferenceLine, LabelList
} from "recharts";
import { Activity, AlertTriangle, CalendarDays, Filter, Flame, Gauge, Layers, Loader2, Megaphone, Package, Radio, TrendingUp, Users } from "lucide-react";
import { LiveSession } from "../../../types";
import { fetchDeepDiveSources, MonthSource } from "../../../lib/dataraw/deepDiveSource";
import { buildDeepDive, lastNMonths, prevMonthOf, DeepDive } from "../../../lib/report/deepdive/metrics";
import { errorMessage } from "../../../lib/errorMessage";
import {
  PAL, CHANNEL_COLORS, chartTooltipStyle, chartNum, Section, StatCard, Delta, BarCell, Empty,
  Th, Td, fmtInt, fmtDec, fmtPct, fmtMoney, fmtMoneyShort
} from "./kit";

// ---------------------------------------------------------------------------
// Report Tháng Chuyên Sâu — FORM MẪU (2026-09-23).
//
// Nguyên tắc: trang này KHÔNG có ô nhập tay nào. Mọi con số đều suy ra từ Dữ Liệu Gốc, nên tháng
// sau chỉ cần upload đủ 5 loại file là báo cáo tự dựng lại y hệt bố cục này cho tháng đó — không
// phải sửa code, không phải nhập lại. Phần nào thiếu file thì khối đó tự báo thiếu thay vì vẽ số 0.
//
// Nạp 2 pha (xem DeepDiveFetchOptions): pha 1 bỏ product_list để trang hiện ngay, pha 2 nạp nền
// rồi tính lại — file Sản Phẩm nặng ~5 MB/tháng, chặn pha 1 là trắng màn hình vài giây.
// ---------------------------------------------------------------------------

interface Props {
  brandId: string;
  sessions: LiveSession[];
  /** ops-only: trang phơi cả số chưa đối soát lẫn cảnh báo chất lượng dữ liệu. */
  canManage: boolean;
  /** Tháng do bên ngoài điều khiển. Bỏ trống = trang tự chọn (chế độ đứng riêng). */
  month?: string;
  /** Nhúng trong Report Tháng: ẩn header + ô chọn tháng vì đã có ở khung ngoài. */
  embedded?: boolean;
  brandName?: string;
}

const TREND_MONTHS = 6;

function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `Tháng ${parseInt(mm, 10)}/${y}`;
}

const NAV = [
  { id: "scorecard", label: "Tổng quan" },
  { id: "channels", label: "Cơ cấu kênh" },
  { id: "daily", label: "Theo ngày" },
  { id: "rhythm", label: "Nhịp & tập trung" },
  { id: "funnel", label: "Phễu LIVE" },
  { id: "sessions", label: "Phiên live" },
  { id: "campaign", label: "Campaign" },
  { id: "hosts", label: "Host" },
  { id: "products", label: "Sản phẩm" },
  { id: "promotions", label: "Khuyến mãi" },
  { id: "trend", label: "Xu hướng" }
];

export const MonthlyDeepDive: React.FC<Props> = ({ brandId, brandName = "", canManage, sessions, month: monthProp, embedded = false }) => {
  const [ownMonth, setOwnMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const month = monthProp ?? ownMonth;
  const setMonth = setOwnMonth;
  const [sources, setSources] = useState<Map<string, MonthSource> | null>(null);
  const [loading, setLoading] = useState(true);
  const [productLoading, setProductLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trendMonths = useMemo(() => lastNMonths(month, TREND_MONTHS), [month]);
  const prev = useMemo(() => prevMonthOf(month), [month]);

  // Pha 1 — mọi thứ trừ product_list.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDeepDiveSources(brandId, trendMonths, { promotionMonths: [prev, month], productMonths: [] })
      .then((s) => { if (!cancelled) { setSources(s); setLoading(false); } })
      .catch((e: unknown) => { if (!cancelled) { setError(errorMessage(e, "Không tải được dữ liệu phân tích chuyên sâu.")); setLoading(false); } });
    return () => { cancelled = true; };
  }, [brandId, trendMonths, prev, month]);

  // Pha 2 — product_list cho tháng này + tháng trước (để so MoM theo SKU).
  // Dep là BOOLEAN "đã có sources chưa", không phải object `sources`: pha 2 tự gọi setSources nên dep
  // theo object là vòng lặp vô hạn. Trước viết thẳng `sources === null` trong dep array — biểu thức
  // trong dep array thì rule không kiểm tĩnh được, nên tách thành biến.
  const sourcesLoaded = sources !== null;
  useEffect(() => {
    if (loading || !sourcesLoaded) return;
    let cancelled = false;
    setProductLoading(true);
    fetchDeepDiveSources(brandId, [prev, month], { promotionMonths: [], productMonths: [prev, month] })
      .then((withProducts) => {
        if (cancelled) return;
        setSources((cur) => {
          if (!cur) return cur;
          const next = new Map(cur);
          for (const m of [prev, month]) {
            const base = next.get(m);
            const extra = withProducts.get(m);
            if (base && extra) next.set(m, { ...base, products: extra.products, productsLoaded: true });
          }
          return next;
        });
        setProductLoading(false);
      })
      .catch(() => { if (!cancelled) setProductLoading(false); });
    return () => { cancelled = true; };
  }, [brandId, loading, month, prev, sourcesLoaded]);

  const sessionsByMonth = useMemo(() => {
    const m = new Map<string, LiveSession[]>();
    for (const mm of trendMonths) m.set(mm, []);
    for (const s of sessions) {
      if (s.brandId !== brandId) continue;
      const k = s.date.slice(0, 7);
      if (m.has(k)) m.get(k)!.push(s);
    }
    return m;
  }, [sessions, brandId, trendMonths]);

  const dd: DeepDive | null = useMemo(
    () => (sources ? buildDeepDive(month, sources, sessionsByMonth, trendMonths) : null),
    [sources, month, sessionsByMonth, trendMonths]
  );

  const monthOptions = useMemo(() => lastNMonths(new Date().toISOString().slice(0, 7), 18).reverse(), []);

  if (!canManage) {
    return <div className="p-6 rounded-2xl text-sm" style={{ background: PAL.panel, border: `1px solid ${PAL.line}`, color: PAL.muted }}>Bạn không có quyền xem báo cáo này.</div>;
  }

  return (
    <div className="space-y-4" style={{ color: PAL.cream }}>
      <header className="rounded-2xl p-5" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
        {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: PAL.gold }}>Report Tháng — Phân Tích Chuyên Sâu</p>
            <h2 className="text-2xl font-black mt-1">{brandName} — {monthLabel(month)}</h2>
            <p className="text-[11px] mt-1.5 max-w-3xl" style={{ color: PAL.muted }}>
              Không có ô nhập tay — tháng sau upload đủ file là báo cáo tự dựng lại theo đúng bố cục này.
              Chỉ số <b>theo ca</b> lấy từ ca đã đối soát trong Lịch Vận Hành; số <b>toàn shop / SKU / khuyến mãi</b> lấy từ Dữ Liệu Gốc.
            </p>
          </div>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
          >
            {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        )}

        {embedded && (
          <p className="text-[11px] mb-3" style={{ color: PAL.muted }}>
            Không có ô nhập tay — mọi con số suy ra từ ca đã đối soát và Dữ Liệu Gốc của đúng tháng đang xem ở trên.
            Tháng sau upload đủ file là khối này tự dựng lại.
          </p>
        )}

        <nav className={`flex flex-wrap gap-1.5 ${embedded ? "" : "mt-4"}`}>
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.muted }}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>

      {error && (
        <div className="p-3 rounded-xl text-xs font-semibold" style={{ background: "#2a1414", border: `1px solid ${PAL.red}55`, color: PAL.red }}>
          {error}
        </div>
      )}

      {loading || !dd ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm" style={{ color: PAL.muted }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Đang đọc Dữ Liệu Gốc…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px] px-1" style={{ color: PAL.muted }}>
            <span className="px-2 py-1 rounded-lg font-semibold" style={{ background: PAL.panel2, border: `1px solid ${dd.liveSource === "sessions" ? `${PAL.green}55` : `${PAL.gold}55`}`, color: dd.liveSource === "sessions" ? PAL.green : PAL.gold }}>
              Nguồn số theo ca: {dd.liveSourceLabel}
            </span>
          </div>
          <QualityBanner dd={dd} productLoading={productLoading} />
          <Scorecard dd={dd} />
          <Channels dd={dd} />
          <Daily dd={dd} />
          <Rhythm dd={dd} />
          <Funnel dd={dd} />
          <Sessions dd={dd} />
          <Campaigns dd={dd} />
          <Hosts dd={dd} />
          <Products dd={dd} loading={productLoading} />
          <Promotions dd={dd} />
          <Trend dd={dd} />
        </>
      )}
    </div>
  );
};

// --- Khối: cảnh báo dữ liệu -------------------------------------------------

const QualityBanner: React.FC<{ dd: DeepDive; productLoading: boolean }> = ({ dd, productLoading }) => {
  const flags = dd.quality.filter((q) => !(q.level === "info" && q.message.startsWith("Khối Sản Phẩm")) || productLoading);
  if (flags.length === 0) return null;
  const color = (l: string) => (l === "error" ? PAL.red : l === "warn" ? PAL.gold : PAL.blue);
  return (
    <div className="rounded-2xl p-4 space-y-1.5" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: PAL.muted }}>
        <AlertTriangle className="w-3.5 h-3.5" /> Chất lượng dữ liệu
      </div>
      {flags.map((q, i) => (
        <div key={i} className="text-[11.5px] flex gap-2 items-start">
          <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color(q.level) }} />
          <span style={{ color: q.level === "error" ? PAL.red : PAL.cream }}>{q.message}</span>
        </div>
      ))}
    </div>
  );
};

// --- Khối: scorecard --------------------------------------------------------

const Scorecard: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  const fmtVal = (k: DeepDive["kpis"][number]) =>
    k.format === "money" ? fmtMoneyShort(k.value)
      : k.format === "pct" ? fmtPct(k.value, 2)
        : k.format === "decimal" ? fmtDec(k.value, 1)
          : fmtInt(k.value);
  return (
    <Section
      id="scorecard"
      title="Tổng Quan Tháng"
      icon={<Gauge className="w-4 h-4" />}
      sub={`So với ${dd.prevMonth ? monthLabel(dd.prevMonth) : "tháng trước (chưa có dữ liệu)"}${dd.isPartial ? ` · tháng chưa trọn (${dd.daysWithData}/${dd.daysInMonth} ngày)` : ""}`}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2.5">
        {dd.kpis.map((k) => (
          <StatCard
            key={k.key}
            label={k.label}
            value={fmtVal(k)}
            delta={k.deltaPct}
            higherIsBetter={k.higherIsBetter}
            hint={k.hint}
            prevLabel={k.prev == null ? undefined : k.format === "money" ? fmtMoneyShort(k.prev) : k.format === "pct" ? fmtPct(k.prev, 2) : fmtInt(k.prev)}
          />
        ))}
      </div>
    </Section>
  );
};

// --- Khối: kênh -------------------------------------------------------------

const Channels: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  const data = dd.channels.filter((c) => c.gmv > 0);
  const growth = dd.channels.filter((c) => c.contributionToGrowthPct != null);
  return (
    <Section
      id="channels"
      title="Cơ cấu GMV theo kênh"
      icon={<Layers className="w-4 h-4" />}
      sub='"Đóng góp tăng trưởng" = phần kênh đó cộng/trừ vào mức tăng Total GMV so tháng trước, tính bằng điểm phần trăm trên nền GMV tháng trước — cộng lại đúng bằng % tăng tổng.'
    >
      {data.length === 0 ? <Empty>Chưa có dữ liệu kênh — cần file Shop Analytics.</Empty> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="gmv" nameKey="label" innerRadius={62} outerRadius={96} paddingAngle={2}>
                  {data.map((d) => <Cell key={d.key} fill={CHANNEL_COLORS[d.key] ?? PAL.faint} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtMoney(chartNum(v))} />
                <Legend wrapperStyle={{ fontSize: 10.5, color: PAL.muted }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growth} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid stroke={PAL.line} horizontal={false} />
                <XAxis type="number" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => `${v}đ%`} />
                <YAxis type="category" dataKey="label" stroke={PAL.muted} fontSize={10} width={150} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => `${fmtDec(chartNum(v), 1)} điểm %`} />
                <ReferenceLine x={0} stroke={PAL.muted} />
                <Bar dataKey="contributionToGrowthPct" name="Đóng góp tăng trưởng" radius={[0, 4, 4, 0]}>
                  {growth.map((d) => <Cell key={d.key} fill={(d.contributionToGrowthPct ?? 0) >= 0 ? PAL.green : PAL.red} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {data.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-[11.5px]">
            <thead><tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
              <Th>Kênh</Th><Th align="right">GMV</Th><Th align="right">Tỷ trọng</Th><Th align="right">Tháng trước</Th><Th align="right">Dịch chuyển</Th><Th align="right">MoM</Th>
            </tr></thead>
            <tbody>
              {dd.channels.map((c) => (
                <tr key={c.key} style={{ borderBottom: `1px solid ${PAL.line}55` }}>
                  <Td><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: CHANNEL_COLORS[c.key] ?? PAL.faint }} />{c.label}</Td>
                  <Td align="right" mono>{fmtMoney(c.gmv)}</Td>
                  <Td align="right" mono>{fmtPct(c.share)}</Td>
                  <Td align="right" mono color={PAL.muted}>{fmtPct(c.prevShare)}</Td>
                  <Td align="right" mono color={c.share - c.prevShare >= 0 ? PAL.green : PAL.red}>
                    {c.share - c.prevShare >= 0 ? "+" : ""}{fmtDec(c.share - c.prevShare, 1)} đ%
                  </Td>
                  <Td align="right" mono><Delta value={c.deltaPct} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
};

// --- Khối: theo ngày --------------------------------------------------------

const Daily: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  const data = dd.daily.map((d) => ({ ...d, label: String(d.day) }));
  const maxGmv = Math.max(1, ...dd.daily.map((d) => d.gmv));
  // Lưới lịch: tuần × thứ, đậm nhạt theo GMV.
  const weeks: (typeof dd.daily[number] | null)[][] = [];
  if (dd.daily.length > 0) {
    let week: (typeof dd.daily[number] | null)[] = Array(7).fill(null);
    const firstIdx = (dd.daily[0].weekday + 6) % 7;
    for (let i = 0; i < firstIdx; i++) week[i] = null;
    for (const d of dd.daily) {
      const col = (d.weekday + 6) % 7;
      week[col] = d;
      if (col === 6) { weeks.push(week); week = Array(7).fill(null); }
    }
    if (week.some(Boolean)) weeks.push(week);
  }
  return (
    <Section
      id="daily"
      title="Diễn Biến Theo Ngày"
      icon={<CalendarDays className="w-4 h-4" />}
      sub="Cột = GMV ngày · đường vàng = trung bình trượt 7 ngày (làm phẳng nhiễu cuối tuần/campaign) · vùng tím = Seller LIVE GMV."
    >
      {data.length === 0 ? <Empty>Chưa có file Shop Analytics cho tháng này.</Empty> : (
        <>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid stroke={PAL.line} vertical={false} />
                <XAxis dataKey="label" stroke={PAL.muted} fontSize={10} />
                <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtMoneyShort(v)} width={62} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v, n) => [fmtMoney(chartNum(v)), String(n)]} labelFormatter={(l) => `Ngày ${l}`} />
                <Legend wrapperStyle={{ fontSize: 10.5 }} />
                <Bar dataKey="gmv" name="GMV" fill={`${PAL.gold}cc`} radius={[3, 3, 0, 0]} />
                <Bar dataKey="liveGmv" name="Seller LIVE GMV" fill={`${PAL.violet}99`} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="ma7" name="TB trượt 7 ngày" stroke={PAL.cream} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-bold mb-2" style={{ color: PAL.muted }}>Lưới lịch — đậm = GMV cao</p>
            <div className="grid grid-cols-7 gap-1 max-w-xl">
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w) => (
                <div key={w} className="text-[9.5px] text-center font-bold" style={{ color: PAL.faint }}>{w}</div>
              ))}
              {weeks.flat().map((d, i) => {
                if (!d) return <div key={i} />;
                const intensity = d.gmv / maxGmv;
                return (
                  <div
                    key={i}
                    className="rounded-md px-1 py-1.5 text-center"
                    style={{ background: `rgba(242,201,76,${0.08 + intensity * 0.82})`, border: `1px solid ${PAL.line}` }}
                    title={`${d.date} · ${fmtMoney(d.gmv)} · ${d.sessions} phiên${d.campaign ? ` · ${d.campaign}` : ""}`}
                  >
                    <div className="text-[10px] font-bold" style={{ color: intensity > 0.5 ? "#1a1500" : PAL.cream }}>{d.day}</div>
                    <div className="text-[8.5px] font-mono" style={{ color: intensity > 0.5 ? "#1a150099" : PAL.muted }}>{fmtMoneyShort(d.gmv)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Section>
  );
};

// --- Khối: nhịp & tập trung -------------------------------------------------

const Rhythm: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  const pareto = [...dd.daily].sort((a, b) => b.gmv - a.gmv);
  const total = pareto.reduce((a, d) => a + d.gmv, 0);
  // react-hooks/immutability (audit 2026-09-24): tránh biến acc bị mutate qua từng vòng .map —
  // cộng dồn bằng slice+reduce, mảng ngày trong tháng nhỏ (≤31) nên O(n²) không đáng kể.
  const paretoData = pareto.map((d, i) => {
    const acc = pareto.slice(0, i + 1).reduce((sum, x) => sum + x.gmv, 0);
    return { rank: i + 1, date: d.date.slice(8), gmv: d.gmv, cum: total > 0 ? (acc / total) * 100 : 0 };
  });
  return (
    <Section
      id="rhythm"
      title="Nhịp Bán & Độ Tập Trung"
      icon={<Activity className="w-4 h-4" />}
      sub="Chỉ số thứ 100 = ngày trung bình của tháng. Đường Pareto cho biết doanh thu dồn vào bao nhiêu ngày — càng dốc thì tháng càng phụ thuộc vài ngày campaign."
    >
      {dd.daily.length === 0 ? <Empty>Chưa có dữ liệu ngày.</Empty> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
            <StatCard label="Top 5 ngày chiếm" value={fmtPct(dd.concentration.top5DaysGmvPct)} />
            <StatCard label="Số ngày tạo 80% GMV" value={`${dd.concentration.daysFor80Pct ?? "—"}/${dd.daily.length}`} />
            <StatCard label="Ngày đỉnh" value={fmtMoneyShort(dd.concentration.bestDay?.gmv)} prevLabel={dd.concentration.bestDay?.date.slice(5)} />
            <StatCard label="Ngày thấp nhất" value={fmtMoneyShort(dd.concentration.worstDay?.gmv)} prevLabel={dd.concentration.worstDay?.date.slice(5)} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="h-[240px]">
              <p className="text-[11px] font-bold mb-1" style={{ color: PAL.muted }}>Chân dung theo thứ</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={dd.weekday}>
                  <CartesianGrid stroke={PAL.line} vertical={false} />
                  <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                  <YAxis stroke={PAL.muted} fontSize={10} width={36} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v, n) => [n === "indexVsMean" ? `${fmtDec(chartNum(v), 0)} (100 = TB)` : fmtMoney(chartNum(v)), String(n)]} />
                  <ReferenceLine y={100} stroke={PAL.muted} strokeDasharray="3 3" />
                  <Bar dataKey="indexVsMean" name="Chỉ số GMV" radius={[4, 4, 0, 0]}>
                    {dd.weekday.map((w) => <Cell key={w.weekday} fill={w.indexVsMean >= 100 ? PAL.green : PAL.goldDim} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-[240px]">
              <p className="text-[11px] font-bold mb-1" style={{ color: PAL.muted }}>Pareto ngày — % GMV luỹ kế</p>
              <ResponsiveContainer width="100%" height="90%">
                <ComposedChart data={paretoData}>
                  <CartesianGrid stroke={PAL.line} vertical={false} />
                  <XAxis dataKey="rank" stroke={PAL.muted} fontSize={10} />
                  <YAxis yAxisId="l" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtMoneyShort(v)} width={58} />
                  <YAxis yAxisId="r" orientation="right" stroke={PAL.muted} fontSize={10} domain={[0, 100]} width={36} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v, n) => [n === "cum" ? fmtPct(chartNum(v)) : fmtMoney(chartNum(v)), String(n)]} labelFormatter={(l) => `Hạng ${l}`} />
                  <Bar yAxisId="l" dataKey="gmv" name="GMV ngày" fill={`${PAL.gold}aa`} />
                  <Line yAxisId="r" type="monotone" dataKey="cum" name="cum" stroke={PAL.teal} strokeWidth={2} dot={false} />
                  <ReferenceLine yAxisId="r" y={80} stroke={PAL.teal} strokeDasharray="3 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </Section>
  );
};

// --- Khối: phễu -------------------------------------------------------------

const Funnel: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  const f = dd.liveFunnel;
  // Thang chiều dài chỉ tính các bậc ĐẾM. Gộp cả GMV (đơn vị đồng, lớn hơn 4-5 bậc độ lớn) vào
  // thang chung sẽ ép mọi bậc kia về gần 0 — nhìn như phễu rỗng dù số hoàn toàn bình thường.
  const maxV = Math.max(1, ...f.filter((s) => s.key !== "gmv").map((s) => s.value));
  if (f.every((s) => s.value === 0)) {
    return (
      <Section id="funnel" title="Phễu chuyển đổi LIVE" icon={<Filter className="w-4 h-4" />}>
        <Empty>Chưa có file Creator Live Performance cho tháng này.</Empty>
      </Section>
    );
  }
  return (
    <Section
      id="funnel"
      title="Phễu chuyển đổi LIVE"
      icon={<Filter className="w-4 h-4" />}
      sub="Bậc “Product impressions / Views” là SỐ LẦN, không phải tỷ lệ — một người xem thấy sản phẩm nhiều lần trong phiên. Các bậc sau là tỷ lệ chuyển đổi thật."
    >
      <div className="space-y-2.5">
        {f.map((s) => {
          const isRatio = s.key === "impressions";
          const conv = s.convFromPrev;
          const prevConv = s.prevConvFromPrev;
          const convDelta = conv != null && prevConv != null && prevConv > 0 ? ((conv - prevConv) / prevConv) * 100 : null;
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[11.5px] font-bold">{s.label}</span>
                <span className="font-mono text-[12px]">{s.key === "gmv" ? fmtMoney(s.value) : fmtInt(s.value)}</span>
              </div>
              <div className="h-6 rounded-lg overflow-hidden" style={{ background: PAL.panel3 }}>
                <div
                  className="h-6 rounded-lg flex items-center justify-end pr-2"
                  style={{ width: s.key === "gmv" ? "100%" : `${Math.max(3, (s.value / maxV) * 100)}%`, background: s.key === "gmv" ? PAL.gold : `${PAL.blue}cc` }}
                >
                  {s.prev != null && (
                    <span className="text-[9.5px] font-mono" style={{ color: "#0b0b0d" }}>
                      MoM {s.prev > 0 ? `${s.value >= s.prev ? "+" : ""}${fmtDec(((s.value - s.prev) / s.prev) * 100, 0)}%` : "—"}
                    </span>
                  )}
                </div>
              </div>
              {conv != null && (
                <div className="text-[10.5px] mt-1 flex items-center gap-2" style={{ color: PAL.muted }}>
                  <span>
                    {isRatio ? `×${fmtDec(conv / 100, 1)} lần / view` : `chuyển đổi ${fmtPct(conv, 2)}`}
                  </span>
                  {prevConv != null && (
                    <>
                      <span style={{ color: PAL.faint }}>· tháng trước {isRatio ? `×${fmtDec(prevConv / 100, 1)}` : fmtPct(prevConv, 2)}</span>
                      <Delta value={convDelta} />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

// --- Khối: phiên ------------------------------------------------------------

const Sessions: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  const s = dd.sessionStats;
  const pts = dd.sessions.filter((x) => x.hours > 0.1);
  const medianGph = s.gmvPerHour?.median ?? 0;
  const medianCtor = pts.length > 0 ? [...pts].map((x) => x.ctor).sort((a, b) => a - b)[Math.floor(pts.length / 2)] : 0;
  const top = [...dd.sessions].sort((a, b) => b.gmvPerHour - a.gmvPerHour).slice(0, 8);
  const bottom = [...dd.sessions].filter((x) => x.hours > 0.5).sort((a, b) => a.gmvPerHour - b.gmvPerHour).slice(0, 8);
  const maxGph = Math.max(1, ...dd.sessions.map((x) => x.gmvPerHour));
  if (dd.sessions.length === 0) {
    return (
      <Section id="sessions" title="Hiệu Suất Từng Phiên LIVE" icon={<Radio className="w-4 h-4" />}>
        <Empty>Chưa có file Creator Live Performance cho tháng này.</Empty>
      </Section>
    );
  }
  return (
    <Section
      id="sessions"
      title="Hiệu Suất Từng Phiên LIVE"
      icon={<Radio className="w-4 h-4" />}
      sub={`${s.count} phiên · ${fmtDec(s.hours, 0)} giờ. Ma trận chia 4 góc theo TRUNG VỊ của chính tháng này, nên "góc phần tư" luôn có nghĩa tương đối với mặt bằng tháng chứ không phải ngưỡng cứng.`}
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-5">
        <StatCard label="GMV/giờ — thấp nhất" value={fmtMoneyShort(s.gmvPerHour?.worst)} />
        <StatCard label="Phân vị 25" value={fmtMoneyShort(s.gmvPerHour?.p25)} />
        <StatCard label="Trung vị" value={fmtMoneyShort(s.gmvPerHour?.median)} />
        <StatCard label="Phân vị 75" value={fmtMoneyShort(s.gmvPerHour?.p75)} />
        <StatCard label="Cao nhất" value={fmtMoneyShort(s.gmvPerHour?.best)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="h-[300px]">
          <p className="text-[11px] font-bold mb-1" style={{ color: PAL.muted }}>Ma trận phiên — GMV/giờ × CTOR (bong bóng = GMV)</p>
          <ResponsiveContainer width="100%" height="90%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 4 }}>
              <CartesianGrid stroke={PAL.line} />
              <XAxis type="number" dataKey="gmvPerHour" name="GMV/giờ" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtMoneyShort(v)} />
              <YAxis type="number" dataKey="ctor" name="CTOR" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => `${v}%`} width={40} />
              <ZAxis type="number" dataKey="gmv" range={[30, 420]} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(v, n) => [n === "CTOR" ? fmtPct(chartNum(v), 2) : fmtMoney(chartNum(v)), String(n)]}
                labelFormatter={() => ""}
              />
              <ReferenceLine x={medianGph} stroke={PAL.muted} strokeDasharray="3 3" />
              <ReferenceLine y={medianCtor} stroke={PAL.muted} strokeDasharray="3 3" />
              <Scatter data={pts} fill={`${PAL.gold}bb`}>
                {pts.map((p, i) => (
                  <Cell key={i} fill={p.gmvPerHour >= medianGph && p.ctor >= medianCtor ? PAL.green : p.gmvPerHour < medianGph && p.ctor < medianCtor ? PAL.red : `${PAL.gold}cc`} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="h-[300px]">
          <p className="text-[11px] font-bold mb-1" style={{ color: PAL.muted }}>Giờ vàng — GMV/giờ theo khung giờ bắt đầu</p>
          <ResponsiveContainer width="100%" height="90%">
            <ComposedChart data={s.hourBuckets}>
              <CartesianGrid stroke={PAL.line} vertical={false} />
              <XAxis dataKey="label" stroke={PAL.muted} fontSize={10} />
              <YAxis yAxisId="l" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtMoneyShort(v)} width={58} />
              <YAxis yAxisId="r" orientation="right" stroke={PAL.muted} fontSize={10} width={28} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v, n) => [n === "sessions" ? `${fmtInt(chartNum(v))} phiên` : fmtMoney(chartNum(v)), String(n)]} />
              <Bar yAxisId="l" dataKey="gmvPerHour" name="GMV/giờ" fill={`${PAL.gold}cc`} radius={[3, 3, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="sessions" name="sessions" stroke={PAL.blue} strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-[11px] mt-4 mb-2" style={{ color: PAL.muted }}>
        Tương quan thời lượng ↔ GMV: <b style={{ color: PAL.cream }}>{s.durationGmvCorr == null ? "—" : fmtDec(s.durationGmvCorr, 3)}</b>
        {s.durationGmvCorr != null && (
          <span> — {s.durationGmvCorr > 0.7 ? "live dài hơn gần như chắc chắn ra nhiều GMV hơn; nghẽn nằm ở số giờ chứ không phải chất lượng phiên." : s.durationGmvCorr > 0.4 ? "thời lượng có ảnh hưởng nhưng không quyết định — chất lượng phiên đang tạo khác biệt." : "thời lượng gần như không giải thích được GMV; kéo dài phiên sẽ không giúp gì."}</span>
        )}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-3">
        {[{ title: "8 phiên hiệu suất cao nhất", rows: top, color: PAL.green }, { title: "8 phiên thấp nhất (≥30 phút)", rows: bottom, color: PAL.red }].map((blk) => (
          <div key={blk.title}>
            <p className="text-[11px] font-bold mb-2" style={{ color: PAL.muted }}>{blk.title}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
                  <Th>Ngày</Th><Th>Phiên</Th><Th align="right">Giờ live</Th><Th align="right">GMV</Th><Th align="right" w="34%">GMV/giờ</Th>
                </tr></thead>
                <tbody>
                  {blk.rows.map((r) => (
                    <tr key={r.roomId} style={{ borderBottom: `1px solid ${PAL.line}55` }}>
                      <Td mono color={PAL.muted}>{r.date.slice(5)}</Td>
                      <Td title={r.title}>{(r.hostName ?? r.title).slice(0, 22)}</Td>
                      <Td align="right" mono>{fmtDec(r.hours, 1)}</Td>
                      <Td align="right" mono>{fmtMoneyShort(r.gmv)}</Td>
                      <Td align="right"><BarCell value={r.gmvPerHour} max={maxGph} color={blk.color} label={fmtMoneyShort(r.gmvPerHour)} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};

// --- Khối: campaign ---------------------------------------------------------

const Campaigns: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  if (dd.campaigns.length === 0) {
    return (
      <Section id="campaign" title="Hiệu Suất Theo Campaign" icon={<Flame className="w-4 h-4" />}>
        <Empty>Chưa có phiên live nào để phân loại campaign.</Empty>
      </Section>
    );
  }
  const maxGph = Math.max(1, ...dd.campaigns.map((c) => c.gmvPerHour ?? 0));
  return (
    <Section
      id="campaign"
      title="Hiệu Suất Theo Campaign"
      icon={<Flame className="w-4 h-4" />}
      sub="Campaign suy ra từ TIÊU ĐỀ PHÒNG LIVE — TikTok không có trường campaign. Phiên không khớp từ khoá nào xếp vào “Thường” để làm mốc so sánh."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead><tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
            <Th>Campaign</Th><Th align="right">Sessions</Th><Th align="right">Ngày</Th><Th align="right">Giờ live</Th>
            <Th align="right">GMV</Th><Th align="right">GMV/ngày</Th><Th align="right">CTOR</Th><Th align="right" w="26%">GMV/giờ</Th>
          </tr></thead>
          <tbody>
            {dd.campaigns.map((c) => {
              const base = dd.campaigns.find((x) => x.name === "Thường");
              const lift = base && base.gmvPerHour && c.gmvPerHour && c.name !== "Thường"
                ? ((c.gmvPerHour - base.gmvPerHour) / base.gmvPerHour) * 100 : null;
              return (
                <tr key={c.name} style={{ borderBottom: `1px solid ${PAL.line}55` }}>
                  <Td>{c.name}{lift != null && <span className="ml-2 text-[10px]" style={{ color: lift >= 0 ? PAL.green : PAL.red }}>{lift >= 0 ? "+" : ""}{fmtDec(lift, 0)}% vs Thường</span>}</Td>
                  <Td align="right" mono>{c.sessions}</Td>
                  <Td align="right" mono>{c.days}</Td>
                  <Td align="right" mono>{fmtDec(c.hours, 0)}</Td>
                  <Td align="right" mono>{fmtMoney(c.gmv)}</Td>
                  <Td align="right" mono>{fmtMoneyShort(c.gmvPerDay)}</Td>
                  <Td align="right" mono>{fmtPct(c.avgCtor, 2)}</Td>
                  <Td align="right"><BarCell value={c.gmvPerHour ?? 0} max={maxGph} label={fmtMoneyShort(c.gmvPerHour)} /></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
};

// --- Khối: host -------------------------------------------------------------

const Hosts: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  const rows = dd.hosts.filter((h) => h.gmv > 0 || h.sessions > 0);
  if (rows.length === 0) {
    return (
      <Section id="hosts" title="Hiệu Suất Host" icon={<Users className="w-4 h-4" />}>
        <Empty>Chưa có ca nào của tháng này trong Lịch Vận Hành.</Empty>
      </Section>
    );
  }
  const maxGmv = Math.max(1, ...rows.map((h) => h.gmv));
  const medGph = [...rows].map((h) => h.gmvPerHour ?? 0).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0;
  const medCtor = [...rows].map((h) => h.ctor ?? 0).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0;
  const scatter = rows.filter((h) => (h.gmvPerHour ?? 0) > 0);
  return (
    <Section
      id="hosts"
      title="Hiệu Suất Host"
      icon={<Users className="w-4 h-4" />}
      sub="GMV/giờ là thước đo công bằng nhất giữa các host vì số ca và độ dài ca rất khác nhau. Ma trận dùng trung vị của chính tháng làm ranh giới."
    >
      <div className="h-[290px] mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 20, bottom: 8, left: 4 }}>
            <CartesianGrid stroke={PAL.line} />
            <XAxis type="number" dataKey="gmvPerHour" name="GMV/giờ" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtMoneyShort(v)} />
            <YAxis type="number" dataKey="ctor" name="CTOR" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => `${v}%`} width={42} />
            <ZAxis type="number" dataKey="gmv" range={[40, 460]} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(v, n) => [n === "CTOR" ? fmtPct(chartNum(v), 2) : fmtMoney(chartNum(v)), String(n)]}
              labelFormatter={() => ""}
            />
            <ReferenceLine x={medGph} stroke={PAL.muted} strokeDasharray="3 3" />
            <ReferenceLine y={medCtor} stroke={PAL.muted} strokeDasharray="3 3" />
            <Scatter data={scatter} fill={PAL.gold}>
              <LabelList dataKey="hostName" position="top" style={{ fontSize: 9, fill: PAL.muted }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead><tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
            <Th>Host</Th><Th align="right">Sessions</Th><Th align="right">Giờ live</Th><Th align="right">GMV</Th>
            <Th align="right">GMV/giờ</Th><Th align="right">AOV</Th><Th align="right">Product CTR</Th><Th align="right">CTOR</Th>
            <Th align="right">New followers</Th><Th align="right">MoM</Th><Th align="right" w="18%">Tỷ trọng</Th>
          </tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.hostName} style={{ borderBottom: `1px solid ${PAL.line}55` }}>
                <Td color={h.hostName.startsWith("(") ? PAL.red : PAL.cream}>{h.hostName}</Td>
                <Td align="right" mono>{h.sessions}</Td>
                <Td align="right" mono>{fmtDec(h.hours, 0)}</Td>
                <Td align="right" mono>{fmtMoney(h.gmv)}</Td>
                <Td align="right" mono color={(h.gmvPerHour ?? 0) >= medGph ? PAL.green : PAL.cream}>{fmtMoneyShort(h.gmvPerHour)}</Td>
                <Td align="right" mono>{fmtMoneyShort(h.aov)}</Td>
                <Td align="right" mono>{fmtPct(h.ctr, 2)}</Td>
                <Td align="right" mono>{fmtPct(h.ctor, 2)}</Td>
                <Td align="right" mono>{fmtInt(h.newFollowers)}</Td>
                <Td align="right" mono><Delta value={h.deltaPct} /></Td>
                <Td align="right"><BarCell value={h.gmv} max={maxGmv} label={fmtPct(h.sharePct)} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
};

// --- Khối: sản phẩm ---------------------------------------------------------

const Products: React.FC<{ dd: DeepDive; loading: boolean }> = ({ dd, loading }) => {
  const p = dd.products;
  if (loading && !p.loaded) {
    return (
      <Section id="products" title="Phân Tích Sản Phẩm" icon={<Package className="w-4 h-4" />}>
        <div className="flex items-center justify-center gap-2 py-10 text-xs" style={{ color: PAL.muted }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải file Sản Phẩm (~5 MB/tháng)…
        </div>
      </Section>
    );
  }
  if (p.top.length === 0) {
    return (
      <Section id="products" title="Phân Tích Sản Phẩm" icon={<Package className="w-4 h-4" />}>
        <Empty>Chưa có file Sản Phẩm cho tháng này.</Empty>
      </Section>
    );
  }
  const maxGmv = Math.max(1, ...p.top.map((x) => x.gmv));
  const paretoData = p.top.map((x, i) => ({ rank: i + 1, gmv: x.gmv, cum: x.cumulativeSharePct }));
  return (
    <Section
      id="products"
      title="Phân Tích Sản Phẩm"
      icon={<Package className="w-4 h-4" />}
      sub={`${fmtInt(p.totalSkusWithSales)} SKU có doanh thu · ${p.skusFor80Pct ?? "—"} SKU đầu bảng đã tạo 80% GMV. Cột "Tỷ trọng LIVE" cho biết SKU đó sống nhờ live hay nhờ kênh khác.`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="h-[240px]">
          <p className="text-[11px] font-bold mb-1" style={{ color: PAL.muted }}>Pareto SKU (top 20)</p>
          <ResponsiveContainer width="100%" height="90%">
            <ComposedChart data={paretoData}>
              <CartesianGrid stroke={PAL.line} vertical={false} />
              <XAxis dataKey="rank" stroke={PAL.muted} fontSize={10} />
              <YAxis yAxisId="l" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtMoneyShort(v)} width={58} />
              <YAxis yAxisId="r" orientation="right" stroke={PAL.muted} fontSize={10} domain={[0, 100]} width={34} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v, n) => [n === "cum" ? fmtPct(chartNum(v)) : fmtMoney(chartNum(v)), String(n)]} />
              <Bar yAxisId="l" dataKey="gmv" name="GMV" fill={`${PAL.gold}bb`} />
              <Line yAxisId="r" type="monotone" dataKey="cum" name="cum" stroke={PAL.teal} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="h-[240px]">
          <p className="text-[11px] font-bold mb-1" style={{ color: PAL.muted }}>GMV theo kênh bán (từ file Sản Phẩm)</p>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={p.channelSplit} layout="vertical" margin={{ left: 10, right: 40 }}>
              <CartesianGrid stroke={PAL.line} horizontal={false} />
              <XAxis type="number" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtMoneyShort(v)} />
              <YAxis type="category" dataKey="label" stroke={PAL.muted} fontSize={10} width={100} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtMoney(chartNum(v))} />
              <Bar dataKey="gmv" name="GMV" radius={[0, 4, 4, 0]}>
                {p.channelSplit.map((c) => <Cell key={c.key} fill={CHANNEL_COLORS[c.key] ?? PAL.faint} />)}
                <LabelList dataKey="share" position="right" formatter={(v: unknown) => fmtPct(chartNum(v))} style={{ fontSize: 9.5, fill: PAL.muted }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead><tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
            <Th>#</Th><Th>Sản phẩm</Th><Th align="right">GMV</Th><Th align="right">Tỷ trọng</Th><Th align="right">Luỹ kế</Th>
            <Th align="right">SKU orders</Th><Th align="right">Product CTR</Th><Th align="right">CTOR</Th><Th align="right">Tỷ trọng LIVE</Th><Th align="right">MoM</Th><Th align="right" w="14%"></Th>
          </tr></thead>
          <tbody>
            {p.top.map((x, i) => (
              <tr key={x.productId || x.name} style={{ borderBottom: `1px solid ${PAL.line}55` }}>
                <Td mono color={PAL.faint}>{i + 1}</Td>
                <Td title={x.name}>{x.name.length > 52 ? `${x.name.slice(0, 52)}…` : x.name}</Td>
                <Td align="right" mono>{fmtMoney(x.gmv)}</Td>
                <Td align="right" mono>{fmtPct(x.sharePct)}</Td>
                <Td align="right" mono color={PAL.muted}>{fmtPct(x.cumulativeSharePct, 0)}</Td>
                <Td align="right" mono>{fmtInt(x.skuOrders)}</Td>
                <Td align="right" mono>{fmtPct(x.ctr, 2)}</Td>
                <Td align="right" mono>{fmtPct(x.ctorSku, 2)}</Td>
                <Td align="right" mono color={x.liveSharePct >= 70 ? PAL.violet : PAL.cream}>{fmtPct(x.liveSharePct, 0)}</Td>
                <Td align="right" mono><Delta value={x.deltaPct} /></Td>
                <Td align="right"><BarCell value={x.gmv} max={maxGmv} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(p.risers.length > 0 || p.fallers.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          {[{ title: "SKU tăng mạnh nhất (tuyệt đối)", rows: p.risers, color: PAL.green }, { title: "SKU giảm mạnh nhất", rows: p.fallers, color: PAL.red }].map((blk) => (
            <div key={blk.title}>
              <p className="text-[11px] font-bold mb-2" style={{ color: PAL.muted }}>{blk.title}</p>
              <table className="w-full text-[11px]">
                <thead><tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
                  <Th>Sản phẩm</Th><Th align="right">Tháng trước</Th><Th align="right">Tháng này</Th><Th align="right">Chênh</Th>
                </tr></thead>
                <tbody>
                  {blk.rows.map((x) => (
                    <tr key={x.productId || x.name} style={{ borderBottom: `1px solid ${PAL.line}55` }}>
                      <Td title={x.name}>{x.name.length > 34 ? `${x.name.slice(0, 34)}…` : x.name}</Td>
                      <Td align="right" mono color={PAL.muted}>{fmtMoneyShort(x.prevGmv)}</Td>
                      <Td align="right" mono>{fmtMoneyShort(x.gmv)}</Td>
                      <Td align="right" mono color={blk.color}>{x.gmv - (x.prevGmv ?? 0) >= 0 ? "+" : ""}{fmtMoneyShort(x.gmv - (x.prevGmv ?? 0))}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
};

// --- Khối: khuyến mãi -------------------------------------------------------

const Promotions: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  const p = dd.promotions;
  if (p.insideMonth.length === 0 && p.longRunning.length === 0) {
    return (
      <Section id="promotions" title="Chương Trình Khuyến Mãi" icon={<Megaphone className="w-4 h-4" />}>
        <Empty>Chưa có file Khuyến Mãi cho tháng này.</Empty>
      </Section>
    );
  }
  const maxGmv = Math.max(1, ...p.insideMonth.map((x) => x.gmvLifetime));
  return (
    <Section
      id="promotions"
      title="Chương Trình Khuyến Mãi"
      icon={<Megaphone className="w-4 h-4" />}
      sub="Cột GMV trong file TikTok là LUỸ KẾ CẢ CHƯƠNG TRÌNH, không cắt theo tháng. Nên bảng chính chỉ xếp hạng chương trình chạy TRỌN trong tháng — với chúng, luỹ kế chính là số của tháng."
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-5">
        <StatCard label="CTKM trọn trong tháng" value={fmtInt(p.insideMonth.length)} />
        <StatCard label="Tổng tiền giảm giá" value={fmtMoneyShort(p.totalDiscount)} />
        <StatCard label="CTKM dài hạn (không xếp hạng)" value={fmtInt(p.longRunning.length)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead><tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
            <Th>Chương trình</Th><Th>Kỳ chạy</Th><Th align="right">GMV</Th><Th align="right">% GMV tháng</Th>
            <Th align="right">Orders</Th><Th align="right">AOV</Th><Th align="right">Giảm giá</Th><Th align="right">ROI</Th><Th align="right" w="14%"></Th>
          </tr></thead>
          <tbody>
            {p.insideMonth.slice(0, 15).map((x) => (
              <tr key={x.id} style={{ borderBottom: `1px solid ${PAL.line}55` }}>
                <Td title={x.name}>{x.name.length > 40 ? `${x.name.slice(0, 40)}…` : x.name}</Td>
                <Td mono color={PAL.muted}>{x.periodStart?.slice(5)} → {x.periodEnd?.slice(5)}</Td>
                <Td align="right" mono>{fmtMoney(x.gmvLifetime)}</Td>
                <Td align="right" mono color={PAL.gold}>{fmtPct(x.gmvShareOfMonth)}</Td>
                <Td align="right" mono>{fmtInt(x.orders)}</Td>
                <Td align="right" mono>{fmtMoneyShort(x.aov)}</Td>
                <Td align="right" mono color={PAL.red}>{fmtMoneyShort(x.discountAmount)}</Td>
                <Td align="right" mono color={x.roi >= 5 ? PAL.green : x.roi > 0 ? PAL.cream : PAL.faint}>{x.roi > 0 ? fmtDec(x.roi, 2) : "—"}</Td>
                <Td align="right"><BarCell value={x.gmvLifetime} max={maxGmv} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.longRunning.length > 0 && (
        <div className="mt-4 p-3 rounded-xl" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
          <p className="text-[11px] font-bold mb-2" style={{ color: PAL.gold }}>Chương trình dài hạn — số là luỹ kế nhiều tháng, KHÔNG so được với bảng trên</p>
          <table className="w-full text-[11px]">
            <thead><tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
              <Th>Chương trình</Th><Th>Kỳ chạy</Th><Th align="right">GMV luỹ kế</Th><Th align="right">Giảm giá luỹ kế</Th>
            </tr></thead>
            <tbody>
              {p.longRunning.map((x) => (
                <tr key={x.id} style={{ borderBottom: `1px solid ${PAL.line}55` }}>
                  <Td title={x.name}>{x.name.length > 44 ? `${x.name.slice(0, 44)}…` : x.name}</Td>
                  <Td mono color={PAL.muted}>{x.periodStart} → {x.periodEnd}</Td>
                  <Td align="right" mono color={PAL.muted}>{fmtMoney(x.gmvLifetime)}</Td>
                  <Td align="right" mono color={PAL.muted}>{fmtMoneyShort(x.discountAmount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
};

// --- Khối: xu hướng ---------------------------------------------------------

const Trend: React.FC<{ dd: DeepDive }> = ({ dd }) => {
  const data = dd.trend.filter((t) => t.gmv > 0 || t.sessions > 0).map((t) => ({ ...t, label: monthLabel(t.month).replace("Tháng ", "T") }));
  if (data.length === 0) return null;
  return (
    <Section
      id="trend"
      title={`Xu Hướng ${data.length} Tháng`}
      icon={<TrendingUp className="w-4 h-4" />}
      sub="GMV/giờ là chỉ số quan trọng nhất của mảng vận hành: GMV tăng vì live nhiều giờ hơn hay vì mỗi giờ live hiệu quả hơn — đường này tách bạch hai chuyện đó."
    >
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid stroke={PAL.line} vertical={false} />
            <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
            <YAxis yAxisId="l" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtMoneyShort(v)} width={62} />
            <YAxis yAxisId="r" orientation="right" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtMoneyShort(v)} width={62} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtMoney(chartNum(v))} />
            <Legend wrapperStyle={{ fontSize: 10.5 }} />
            <Bar yAxisId="l" dataKey="gmv" name="Total GMV" fill={`${PAL.gold}aa`} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="l" dataKey="liveGmv" name="Seller LIVE GMV" fill={`${PAL.violet}99`} radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="gmvPerLiveHour" name="GMV/giờ" stroke={PAL.teal} strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto mt-4">
        <table className="w-full text-[11.5px]">
          <thead><tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
            <Th>Tháng</Th><Th align="right">Total GMV</Th><Th align="right">Seller LIVE GMV</Th><Th align="right">Tỷ trọng LIVE</Th>
            <Th align="right">Orders</Th><Th align="right">AOV</Th><Th align="right">Conversion rate</Th>
            <Th align="right">Sessions</Th><Th align="right">Giờ live</Th><Th align="right">GMV/giờ</Th>
          </tr></thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.month} style={{ borderBottom: `1px solid ${PAL.line}55`, background: t.month === dd.month ? `${PAL.gold}12` : undefined }}>
                <Td>{monthLabel(t.month)}</Td>
                <Td align="right" mono>{fmtMoney(t.gmv)}</Td>
                <Td align="right" mono>{fmtMoney(t.liveGmv)}</Td>
                <Td align="right" mono>{fmtPct(t.gmv > 0 ? (t.liveGmv / t.gmv) * 100 : null)}</Td>
                <Td align="right" mono>{fmtInt(t.orders)}</Td>
                <Td align="right" mono>{fmtMoneyShort(t.aov)}</Td>
                <Td align="right" mono>{fmtPct(t.cvr, 2)}</Td>
                <Td align="right" mono>{fmtInt(t.sessions)}</Td>
                <Td align="right" mono>{fmtDec(t.liveHours, 0)}</Td>
                <Td align="right" mono color={PAL.teal}>{fmtMoneyShort(t.gmvPerLiveHour)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
};

export default MonthlyDeepDive;
