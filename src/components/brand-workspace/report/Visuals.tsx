import React, { useRef, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ScatterChart, Scatter, ZAxis, ReferenceLine } from "recharts";
import { BarChart3, ImagePlus, Scale, Table2, Users, X } from "lucide-react";
import { fmtFixed, fmtVndShort } from "../../../lib/format";
import { METRIC } from "../../../lib/metricGlossary";
import { fmtKeyMetric, KEY_METRICS } from "../../../lib/report/keyMetrics";
import type { KeyMetricsMonth, KeyMetricsTab } from "../../../lib/report/brandReport";
import { dayTypeMetrics, sumDayTypeParts, MIN_SESSIONS_TO_COMPARE, type HostDayTypeRow } from "../../../lib/performance/hostPerformance";
import { DAY_ABS_COLOR, dayAbsRows, heatColor, median, rankBadge, type BridgePoint, type PlanHourRow, type ScatterPoint } from "../../../lib/report/reportVisuals";
import type { CampDayBucket } from "../../../lib/campaignDays";
import { chartTooltipStyle, DAY_TYPE_SHORT, PAL } from "./theme";
import { chartNum } from "./format";
import { MethodNote, Panel, ReportTable } from "./ui";

// Khối biểu đồ/bảng GĐ2 của Report Tháng (demo CROCS T10 28/10): cầu GMV, GMV/giờ kế hoạch, bảng dọc theo loại ngày,
// scatter SKU + ảnh SKU, so sánh cặp chỉ số của host. Tính số nằm ở lib/report/reportVisuals.ts.

const TONE_FILL = { up: PAL.green, down: PAL.red, flat: PAL.gold } as const;
const vnPct = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${fmtFixed(Math.abs(v), d)}%`;

// ---------- cầu GMV ----------

export const BridgePanel: React.FC<{ title: string; sub: string; points: BridgePoint[]; axisMin?: number; note?: string; legend?: React.ReactNode }> = ({ title, sub, points, axisMin, note, legend }) => (
  <Panel title={title} icon={<BarChart3 className="w-4 h-4" />} sub={sub}>
    <div style={{ height: 260 }} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${fmtVndShort(p.display)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points.map((p) => (axisMin != null && p.kind === "total" ? { ...p, base: axisMin, value: Math.max(p.value - axisMin, 0) } : p))} margin={{ top: 18, right: 8 }}>
          <CartesianGrid stroke={PAL.line} vertical={false} />
          <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} interval={0} />
          <YAxis stroke={PAL.muted} fontSize={11} width={64} domain={axisMin != null ? [axisMin, "auto"] : [0, "auto"]} allowDataOverflow tickFormatter={(v) => fmtVndShort(v)} />
          <Tooltip cursor={false} contentStyle={chartTooltipStyle} itemStyle={{ color: PAL.cream }} labelStyle={{ color: PAL.cream, fontWeight: 700 }} formatter={(_v, _n, item) => fmtVndShort(chartNum((item as { payload?: { display?: number } }).payload?.display))} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} legendType="none" tooltipType="none" />
          <Bar dataKey="value" stackId="w" radius={[4, 4, 0, 0]} name="GMV" isAnimationActive={false} label={(raw) => {
              const l = raw as { x?: number | string; y?: number | string; width?: number | string; index?: number };
              const p = points[l.index ?? -1];
              if (!p || l.x == null || l.y == null || l.width == null) return <g />;
              const txt = p.kind === "total" ? fmtVndShort(p.display) : `${p.display >= 0 ? "+" : "−"}${fmtVndShort(Math.abs(p.display))}`;
              return (
                <text x={Number(l.x) + Number(l.width) / 2} y={Number(l.y) - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill={p.kind === "total" ? PAL.cream : p.kind === "up" ? PAL.green : PAL.red}>{txt}</text>
              );
            }}>
            {points.map((p, i) => (
              <Cell key={i} fill={p.kind === "total" ? PAL.gold : p.kind === "up" ? PAL.green : PAL.red} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    {legend}
    {note && <MethodNote>{note}</MethodNote>}
  </Panel>
);

// ---------- GMV/giờ kế hoạch so với thực tế ----------

export const PlanHoursPanel: React.FC<{ rows: PlanHourRow[]; title: string }> = ({ rows, title }) => {
  const shown = rows.filter((r) => r.planGmvPerHour != null && r.actualGmvPerHour != null);
  if (!shown.length) return null;
  const tHours = shown.reduce((a, r) => a + r.planHours, 0);
  const tTarget = shown.reduce((a, r) => a + r.planTarget, 0);
  const tActual = shown.reduce((a, r) => a + r.actualGmvPerHour! * r.planHours, 0);
  const pctTone = (p: number) => (p >= 100 ? PAL.green : p >= 95 ? PAL.cream : PAL.red);
  const line = (key: string, label: string, share: number, target: number, hours: number, plan: number, actual: number, total?: boolean) => {
    const pct = (actual / plan) * 100;
    return (
      <tr key={key} style={total ? { background: PAL.panel2 } : { borderBottom: `1px solid ${PAL.line}` }}>
        <td className="py-2 px-3 font-bold" style={{ color: PAL.cream }}>{label}</td>
        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtFixed(share * 100, 0)}%</td>
        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtVndShort(target)}</td>
        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtFixed(hours, 0)}</td>
        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtVndShort(plan)}</td>
        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(actual)}</td>
        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: pctTone(pct) }}>{fmtFixed(pct, 0)}%</td>
      </tr>
    );
  };
  return (
    <Panel title={title} icon={<Scale className="w-4 h-4" />}>
      <ReportTable head={["Loại ngày", "Phân bổ", "Target GMV", "Giờ kế hoạch", `${METRIC.gmvPerHour} kế hoạch`, "Thực tế", "% kế hoạch"]}>
        {shown.map((r) => line(r.key, DAY_TYPE_SHORT[r.key], r.share, r.planTarget, r.planHours, r.planGmvPerHour!, r.actualGmvPerHour!))}
        {tHours > 0 && line("all", "Cả tháng", 1, tTarget, tHours, tTarget / tHours, tActual / tHours, true)}
      </ReportTable>
    </Panel>
  );
};

// ---------- bảng dọc: số đo từng loại ngày ----------

const DAY_TABS: KeyMetricsTab[] = ["daily", "dday", "midmonth", "payday"];

export const DayAbsPanel: React.FC<{ months: KeyMetricsMonth[]; monthLabel: (m: string) => string }> = ({ months, monthLabel }) => {
  const tabs = DAY_TABS.filter((t) => months.some((m) => m.stats[t].sessions > 0));
  if (months.length < 2 || !tabs.length) return null;
  const rows = dayAbsRows(months, tabs);
  const label = (k: string) => KEY_METRICS.find((d) => d.key === k)!;
  return (
    <Panel title="Số đo từng loại ngày" icon={<Table2 className="w-4 h-4" />} sub={`Mỗi loại ngày là một nhóm cột ${months.map((m) => monthLabel(m.month)).join(", ")} cùng màu nhận diện · ô tô màu theo thay đổi so với tháng liền trước (xanh tăng, đỏ giảm, đậm hơn khi lớn) · viền sáng = vượt ngưỡng dao động`}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px] border-collapse" style={{ minWidth: 220 + tabs.length * months.length * 74 }}>
          <thead>
            <tr>
              <th rowSpan={2} className="text-left px-2 py-1.5 font-semibold sticky left-0 z-[1]" style={{ color: PAL.muted, background: PAL.panel }}>Chỉ số</th>
              {tabs.map((t) => (
                <th key={t} colSpan={months.length} className="px-2 py-1.5 text-center font-black" style={{ color: DAY_ABS_COLOR[t], borderTop: `3px solid ${DAY_ABS_COLOR[t]}`, background: `${DAY_ABS_COLOR[t]}1a`, borderLeft: `2px solid ${DAY_ABS_COLOR[t]}99` }}>
                  {DAY_TYPE_SHORT[t as CampDayBucket]}
                </th>
              ))}
            </tr>
            <tr>
              {tabs.flatMap((t) =>
                months.map((m, i) => (
                  <th key={`${t}${m.month}`} className="px-1.5 py-1 text-center font-bold" style={{ color: DAY_ABS_COLOR[t], background: `${DAY_ABS_COLOR[t]}0f`, borderBottom: `1px solid ${DAY_ABS_COLOR[t]}80`, borderLeft: i === 0 ? `2px solid ${DAY_ABS_COLOR[t]}99` : undefined }}>
                    {monthLabel(m.month)}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-2 py-1.5 font-bold whitespace-nowrap sticky left-0 z-[1]" style={{ color: PAL.cream, background: PAL.panel, borderBottom: `1px solid ${PAL.line}` }}>{label(r.key).label}</td>
                {tabs.flatMap((t) =>
                  (r.cells[t] ?? []).map((c, i) => (
                    <td
                      key={`${t}${i}`}
                      className="px-1.5 py-1.5 text-center font-mono leading-tight"
                      style={{
                        color: i === 0 ? PAL.muted : PAL.cream,
                        background: i === 0 ? undefined : heatColor(c.change, r.neutral),
                        boxShadow: c.significant ? `inset 0 0 0 1.5px ${PAL.cream}` : undefined,
                        fontWeight: c.significant ? 800 : 500,
                        borderBottom: `1px solid ${PAL.line}`,
                        borderLeft: i === 0 ? `2px solid ${DAY_ABS_COLOR[t]}99` : undefined
                      }}
                      title={c.change != null ? `${vnPct(c.change)} so với tháng liền trước` : "tháng mốc"}
                    >
                      {fmtKeyMetric(label(r.key), c.value)}
                      {c.change != null && <small className="block text-[11px] opacity-80">{vnPct(c.change, 0)}</small>}
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
        Tháng đầu là mốc, không tô · mỗi loại ngày so với chính nó theo lịch Campaign của từng tháng · {METRIC.liveHours} và {METRIC.upt} tô xanh dương vì không đánh giá tốt hay xấu.
      </p>
    </Panel>
  );
};

// ---------- scatter ----------

export interface ScatterAxis {
  title: string;
  fmt: (v: number) => string;
}

const ScatterBody: React.FC<{ points: ScatterPoint[]; x: ScatterAxis; y: ScatterAxis; vx: number | null; vy: number | null; sizeLabel: string }> = ({ points, x, y, vx, vy, sizeLabel }) => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const pad = (a: number[]) => {
    const lo = Math.min(...a);
    const hi = Math.max(...a);
    const d = (hi - lo || Math.abs(hi) || 1) * 0.15;
    return [lo - d, hi + d] as [number, number];
  };
  return (
    <div style={{ height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 14, right: 22, bottom: 24, left: 4 }}>
          <CartesianGrid stroke={PAL.line} />
          <XAxis type="number" dataKey="x" name={x.title} domain={pad(xs)} stroke={PAL.muted} fontSize={11} tickFormatter={x.fmt} label={{ value: x.title, position: "insideBottom", offset: -14, fill: PAL.muted, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={y.title} domain={pad(ys)} stroke={PAL.muted} fontSize={11} width={56} tickFormatter={y.fmt} label={{ value: y.title, angle: -90, position: "insideLeft", fill: PAL.muted, fontSize: 11 }} />
          <ZAxis type="number" dataKey="size" range={[70, 520]} name={sizeLabel} />
          {vx != null && <ReferenceLine x={vx} stroke={PAL.cream} strokeDasharray="4 4" strokeOpacity={0.6} />}
          {vy != null && <ReferenceLine y={vy} stroke={PAL.cream} strokeDasharray="4 4" strokeOpacity={0.6} />}
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={chartTooltipStyle}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as ScatterPoint | undefined;
              if (!p) return null;
              return (
                <div className="px-2.5 py-1.5 rounded-lg text-[11px]" style={chartTooltipStyle}>
                  <b>{p.label}</b>
                  <div>{x.title}: {x.fmt(p.x)}</div>
                  <div>{y.title}: {y.fmt(p.y)}</div>
                </div>
              );
            }}
          />
          <Scatter data={points} isAnimationActive={false} label={{ dataKey: "label", position: "top", fill: PAL.cream, fontSize: 11 }}>
            {points.map((p) => (
              <Cell key={p.key} fill={TONE_FILL[p.tone]} fillOpacity={0.75} stroke={TONE_FILL[p.tone]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

const pct2 = (v: number) => `${fmtFixed(v, 2)}%`;

export const SkuScatterPanel: React.FC<{ points: ScatterPoint[] }> = ({ points }) => {
  if (points.length < 3) return null;
  return (
    <Panel title="Product CTR và CTOR của Top SKU" icon={<BarChart3 className="w-4 h-4" />} sub="Kích thước điểm = GMV · màu = thay đổi hạng so với tháng trước · đường nét đứt = trung vị">
      <ScatterBody points={points} x={{ title: METRIC.productCtr, fmt: pct2 }} y={{ title: METRIC.ctor, fmt: pct2 }} vx={median(points.map((p) => p.x))} vy={median(points.map((p) => p.y))} sizeLabel="GMV" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs" style={{ color: PAL.muted }}>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: PAL.green }} />tăng hạng</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: PAL.red }} />giảm hạng</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: PAL.gold }} />giữ hạng / mới vào</span>
      </div>
    </Panel>
  );
};

// ---------- huy hiệu hạng + ảnh SKU ----------

export const RankBadge: React.FC<{ prevRank: number | null; rank: number; prevLimit?: number | null }> = ({ prevRank, rank, prevLimit }) => {
  const b = rankBadge(prevRank, rank);
  const color = b.tone === "up" ? PAL.green : b.tone === "down" ? PAL.red : PAL.muted;
  return (
    <span
      className="inline-block min-w-[38px] text-center text-[11px] font-extrabold px-1.5 rounded-full ml-1.5"
      style={{ color, border: `1px solid ${b.tone === "up" || b.tone === "down" ? `${color}66` : PAL.line}`, background: b.tone === "up" || b.tone === "down" ? `${color}29` : undefined }}
      title={prevRank == null ? (prevLimit != null ? `Ngoài top ${prevLimit} tháng trước` : "Không có hạng tháng trước") : `Hạng tháng trước: ${prevRank}`}
    >
      {b.text}
    </span>
  );
};

/** Thu nhỏ ảnh về cạnh dài ≤ 112px, JPEG — đủ nhỏ để lưu cùng ghi chú báo cáo (app chưa có file storage thật). */
export function downscaleImage(file: File, max = 112): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Chỉ nhận tệp ảnh."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("Trình duyệt không xử lý được ảnh."));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh."));
    };
    img.src = url;
  });
}

export const SkuThumb: React.FC<{ name: string; src?: string; editable: boolean; onSave: (dataUrl: string) => Promise<void>; onClear: () => Promise<void> }> = ({ name, src, editable, onSave, onClear }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      await onSave(await downscaleImage(f));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không lưu được ảnh.");
    } finally {
      setBusy(false);
    }
  };
  const box = "relative w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center text-center text-[11px] leading-tight";
  if (!src && !editable) return <span className={box} style={{ border: `1px dashed ${PAL.line}`, color: PAL.muted }}>—</span>;
  return (
    <span className="relative inline-block">
      {src ? (
        <span className={box} style={{ border: `1px solid ${PAL.line}`, background: "#fff" }}>
          <img src={src} alt={name} className="w-full h-full object-contain" />
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files[0]);
          }}
          aria-label={`Tải ảnh cho ${name}`}
          className={`${box} cursor-pointer hover:border-[#f2c94c]`}
          style={{ border: `1px dashed ${PAL.line}`, background: PAL.bg, color: PAL.muted }}
        >
          {busy ? "…" : <ImagePlus className="w-4 h-4" />}
        </button>
      )}
      {src && editable && (
        <button type="button" disabled={busy} aria-label={`Xoá ảnh ${name}`} onClick={() => void onClear()} className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,.75)", color: "#fff" }}>
          <X className="w-3 h-3" />
        </button>
      )}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <span className="block text-[11px] mt-0.5" style={{ color: PAL.red }}>{err}</span>}
    </span>
  );
};

// ---------- host: so sánh cặp chỉ số ----------

type HostPair = { key: string; name: string; x: ScatterAxis; y: ScatterAxis; pick: (m: ReturnType<typeof dayTypeMetrics>) => [number | null, number | null]; cap: string };

const HOST_PAIRS: HostPair[] = [
  { key: "traffic", name: `${METRIC.viewsPerHour} × ${METRIC.gmvPerHour}`, x: { title: METRIC.viewsPerHour, fmt: (v) => Math.round(v).toLocaleString("vi-VN") }, y: { title: METRIC.gmvPerHour, fmt: fmtVndShort }, pick: (m) => [m.viewsPerHour, m.gmvPerHour], cap: "Host ở góc trên-phải kéo được cả traffic lẫn doanh thu mỗi giờ." },
  { key: "conv", name: `${METRIC.liveCtr} × ${METRIC.ctor}`, x: { title: METRIC.liveCtr, fmt: (v) => `${fmtFixed(v, 1)}%` }, y: { title: METRIC.ctor, fmt: pct2 }, pick: (m) => [m.liveCtr, m.ctor], cap: "LIVE CTR đo khả năng giữ người xem vào phiên; CTOR đo khả năng chuyển lượt nhấp thành đơn." },
  { key: "basket", name: `${METRIC.ctor} × ${METRIC.aov}`, x: { title: METRIC.ctor, fmt: pct2 }, y: { title: METRIC.aov, fmt: fmtVndShort }, pick: (m) => [m.ctor, m.aov], cap: "Host chốt đơn nhiều nhưng giá trị đơn thấp (góc trên-trái) cần thử bán combo." }
];

export const HostPairPanel: React.FC<{ rows: HostDayTypeRow[]; shortName: (full: string) => string }> = ({ rows, shortName }) => {
  const [k, setK] = useState(HOST_PAIRS[0].key);
  const pair = HOST_PAIRS.find((p) => p.key === k) ?? HOST_PAIRS[0];
  const hosts = rows
    .map((r) => ({ key: r.key, name: r.name, m: dayTypeMetrics(sumDayTypeParts(r.byBucket)) }))
    .filter((h) => h.m.sessions >= MIN_SESSIONS_TO_COMPARE * 2);
  const raw = hosts.map((h) => ({ h, v: pair.pick(h.m) })).filter((x): x is { h: (typeof hosts)[number]; v: [number, number] } => x.v[0] != null && x.v[1] != null);
  if (raw.length < 3) return null;
  const gmOf = (h: (typeof hosts)[number]) => h.m.gmvPerHour ?? 0;
  const gm = median(raw.map((x) => gmOf(x.h))) ?? 0;
  const points: ScatterPoint[] = raw.map((x) => ({
    key: x.h.key,
    label: shortName(x.h.name),
    x: x.v[0],
    y: x.v[1],
    size: x.h.m.sessions,
    tone: gmOf(x.h) > gm * 1.05 ? "up" : gmOf(x.h) < gm * 0.95 ? "down" : "flat"
  }));
  return (
    <Panel title="Hồ sơ host: so sánh cặp chỉ số" icon={<Users className="w-4 h-4" />} sub={`Mỗi điểm là một host có từ ${MIN_SESSIONS_TO_COMPARE * 2} phiên trở lên · kích thước = số phiên · màu theo ${METRIC.gmvPerHour} so với trung vị các host · đường nét đứt = trung vị`}>
      <div role="tablist" aria-label="Cặp chỉ số" className="flex flex-wrap gap-1.5 mb-3">
        {HOST_PAIRS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === k}
            onClick={() => setK(p.key)}
            className="min-h-8 px-3 py-1 rounded-lg text-xs font-bold"
            style={p.key === k ? { color: PAL.gold, background: `${PAL.gold}2e`, border: `1px solid ${PAL.gold}73` } : { color: PAL.muted, border: `1px solid ${PAL.line}` }}
          >
            {p.name}
          </button>
        ))}
      </div>
      <ScatterBody points={points} x={pair.x} y={pair.y} vx={median(points.map((p) => p.x))} vy={median(points.map((p) => p.y))} sizeLabel="Số phiên" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs" style={{ color: PAL.muted }}>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: PAL.green }} />{METRIC.gmvPerHour} cao hơn trung vị</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: PAL.red }} />thấp hơn</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: PAL.gold }} />ngang</span>
      </div>
      <p className="text-[12px] mt-2" style={{ color: PAL.cream }}>{pair.cap}</p>
    </Panel>
  );
};
