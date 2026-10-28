import React, { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { BarChart3, Lightbulb, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, Save } from "lucide-react";
import { metricHint } from "../../../lib/metricGlossary";
import { DRIVER_LABEL, DriverBreakdown } from "../../../lib/report/monthlyReportInsights";
import { insightToText, parseInsightText, SectionInsight } from "../../../lib/report/sectionInsights";
import { errorMessage } from "../../../lib/errorMessage";

import { fmtFixed, fmtVndShort } from "../../../lib/format";
import type { ReportSectionId } from "./theme";
import { LINK_BTN, PAL, DRIVER_SHORT, chartTooltipStyle } from "./theme";
import { chartNum } from "./format";
import { STAT_LABEL_SHAPE } from "../../common/StatTile";

// Bộ component trình bày của Report Tháng — khung panel, bảng, thẻ KPI, hộp Insight, biểu đồ thác,
// ô sửa nhận xét. Tách khỏi MonthlyReportTabs.tsx 2026-10-01: toàn bộ chỗ này đã tự chứa sẵn (không
// đọc state nào của màn), nằm chung chỉ khiến phần TÍNH SỐ của report bị đẩy xuống quá tầm đọc.

export const Panel: React.FC<{ title: string; icon: React.ReactNode; sub?: string; children: React.ReactNode }> = ({ title, icon, sub, children }) => (
  <div className="rounded-2xl overflow-hidden" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
    <div
      className="px-5 py-3.5 flex items-center gap-2.5"
      style={{ borderBottom: `1px solid ${PAL.line}`, background: `linear-gradient(90deg, ${PAL.gold}22, transparent)` }}
    >
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: PAL.gold, color: "#1a1500" }}>
        {icon}
      </span>
      <div>
        <h3 className="font-black text-sm" style={{ color: PAL.cream }}>
          {title}
        </h3>
        {sub && (
          <p className="text-[11px]" style={{ color: PAL.muted }}>
            {sub}
          </p>
        )}
      </div>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// Cột đầu (tên chỉ số) dính trái khi bảng cuộn ngang. Bảng host ở Phần 5 rộng 1.260px trong khung
// 1.060px ngay cả trên màn 1440 (9 host × cột), cuộn sang phải là mất luôn tên chỉ số nên không còn
// biết đang đọc dòng nào — ý định này đã ghi trong comment của bảng host từ 2026-09-26 nhưng chưa
// được cài (audit UX lần 2 — M7). Nền đặc PAL.panel để chữ dòng dưới không lộ qua khi cuộn.
/** `leftCols`: chỉ số các cột chữ (canh trái) — mặc định chỉ cột đầu, các cột sau là số (canh phải). */
export const ReportTable: React.FC<{ head: string[]; children: React.ReactNode; leftCols?: number[] }> = ({ head, children, leftCols }) => (
  <div className="overflow-x-auto -mx-1">
    <table className="w-full text-xs min-w-[520px] [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_th:first-child]:bg-[#17171b] [&_td:first-child]:bg-[#17171b]">
      <thead>
        <tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
          {head.map((h, i) => (
            <th
              key={i}
              className={`py-2 px-3 text-left text-[11px] font-semibold ${i > 0 && !leftCols?.includes(i) ? "text-right" : ""}`}
              style={{ color: PAL.muted }}
              title={metricHint(h)}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

export interface WaterfallPoint {
  label: string;
  base: number;
  value: number;
  kind: "total" | "up" | "down";
  display: number;
}

export function toWaterfall(b: DriverBreakdown | null, cmp: { partial: boolean; prevEnd: string; curEnd: string }, month: string, prevMonth: string): WaterfallPoint[] {
  if (!b) return [];
  const out: WaterfallPoint[] = [];
  out.push({ label: cmp.partial ? `1–${Number(cmp.prevEnd.slice(8))}/${prevMonth.slice(5)}` : `Tháng ${prevMonth.slice(5)}`, base: 0, value: b.from, kind: "total", display: b.from });
  let run = b.from;
  for (const p of b.parts) {
    const next = run + p.value;
    out.push({ label: DRIVER_SHORT[p.key], base: Math.min(run, next), value: Math.abs(p.value), kind: p.value >= 0 ? "up" : "down", display: p.value });
    run = next;
  }
  out.push({ label: cmp.partial ? `1–${Number(cmp.curEnd.slice(8))}/${month.slice(5)}` : `Tháng ${month.slice(5)}`, base: 0, value: b.to, kind: "total", display: b.to });
  return out;
}

export const WaterfallPanel: React.FC<{ title: string; sub: string; data: WaterfallPoint[]; breakdown: DriverBreakdown; note?: string }> = ({ title, sub, data, breakdown, note }) => (
  <Panel title={title} icon={<BarChart3 className="w-4 h-4" />} sub={sub}>
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 8 }}>
          <CartesianGrid stroke={PAL.line} vertical={false} />
          <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} interval={0} />
          <YAxis stroke={PAL.muted} fontSize={11} tickFormatter={(v) => fmtVndShort(v)} width={70} />
          <Tooltip contentStyle={chartTooltipStyle} formatter={(_v, _n, item) => fmtVndShort(chartNum((item as { payload?: { display?: number } }).payload?.display))} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} legendType="none" tooltipType="none" />
          <Bar dataKey="value" stackId="w" radius={[4, 4, 0, 0]} name="GMV">
            {data.map((d, i) => (
              <Cell key={i} fill={d.kind === "total" ? PAL.gold : d.kind === "up" ? PAL.green : PAL.red} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-2">
      {breakdown.parts.map((p) => (
        <div key={p.key} className="text-xs rounded-lg px-3 py-2" style={{ background: PAL.panel2, color: PAL.muted }}>
          <span style={{ color: PAL.cream }}>{DRIVER_LABEL[p.key]}</span> {p.change >= 0 ? "+" : "−"}{fmtFixed(Math.abs(p.change), 1)}% ⇒{" "}
          <span className="font-mono" style={{ color: p.value >= 0 ? PAL.green : PAL.red }}>
            {p.value >= 0 ? "+" : "−"}{fmtVndShort(Math.abs(p.value))}
          </span>
        </div>
      ))}
    </div>
    {note && (
      <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
        {note}
      </p>
    )}
  </Panel>
);

// Phần chi tiết của một mục Report Tháng — trên điện thoại gập lại sau Insight (xem isNarrow trong MonthlyReportTabs).
export const SectionDetail: React.FC<{ open: boolean; onOpen: () => void; children: React.ReactNode }> = ({ open, onOpen, children }) =>
  open ? (
    <>{children}</>
  ) : (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold"
      style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.gold }}
    >
      Xem chi tiết (biểu đồ, bảng) <ChevronDown className="w-3.5 h-3.5" />
    </button>
  );

export const SectionHead: React.FC<{ no: string; title: string; sub?: string }> = ({ no, title, sub }) => (
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2" style={{ borderBottom: `1px solid ${PAL.line}` }}>
    <span className="font-mono text-xs font-bold" style={{ color: PAL.gold }}>
      {no}
    </span>
    <h2 className="font-black text-lg" style={{ color: PAL.cream }}>
      {title}
    </h2>
    {sub && (
      <span className="text-[11px]" style={{ color: PAL.muted }}>
        {sub}
      </span>
    )}
  </div>
);

// ---------- Khung "mỗi trang một màn" (28/10/2026, demo Report Tháng đã chốt) ----------
// PageHead = số trang + tiêu đề kết luận (action title) + hàng ≤4 ô chỉ số. Ô: nhãn cố định 2 dòng để số lớn thẳng hàng; số chính là
// GMV/số tuyệt đối; % Target chỉ là huy hiệu cạnh số (xanh ≥100%, vàng 90–100%, đỏ <90%), chú thích nhỏ bên dưới.
export interface PageMetric {
  label: string;
  value: string;
  /** % Target (hoặc % KPI) — vẽ thành huy hiệu cạnh số; null/undefined = không có. */
  badge?: number | null;
  /** Thay chữ huy hiệu (mặc định "<pct>% Target"). */
  badgeLabel?: string;
  /** % đổi so với kỳ so sánh — dòng ▲/▼ nhỏ khi ô không có huy hiệu. */
  change?: number | null;
  note?: string;
}

export const badgeTone = (p: number) => (p >= 100 ? PAL.green : p >= 90 ? PAL.gold : PAL.red);

export const PageMetricCard: React.FC<PageMetric> = ({ label, value, badge, badgeLabel, change, note }) => (
  <div className="min-w-0 rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
    <div className="text-[11px] font-bold leading-snug line-clamp-2 min-h-[2.75em]" style={{ color: PAL.muted }} title={metricHint(label)}>
      {label}
    </div>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
      <span className="font-mono text-2xl font-bold" style={{ color: PAL.cream }}>
        {value}
      </span>
      {badge != null && (
        <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap" style={{ color: badgeTone(badge), border: `1px solid ${badgeTone(badge)}`, background: `${badgeTone(badge)}1f` }}>
          {badgeLabel ?? `${fmtFixed(badge, 0)}% Target`}
        </span>
      )}
    </div>
    {change != null && (
      <div className="text-[11px] mt-1 font-bold" style={{ color: change >= 0 ? PAL.green : PAL.red }}>
        {change >= 0 ? "▲" : "▼"} {fmtFixed(Math.abs(change), 1)}% cùng kỳ
      </div>
    )}
    {note && (
      <div className="text-[11px] mt-1" style={{ color: PAL.muted }}>
        {note}
      </div>
    )}
  </div>
);

export const PageHead: React.FC<{ no: string; title: string; sub?: string; headline?: string; metrics?: PageMetric[] }> = ({ no, title, headline, metrics }) => (
  <>
    <div className="ph">
      <div className="pt">{no} · {title}</div>
      <h2>{headline ?? title}</h2>
    </div>
    {metrics && metrics.length > 0 && (
      <div className="kpis" data-testid="page-metrics">
        {metrics.slice(0, 4).map((m, i) => (
          <div key={i} className="kpi">
            <div className="lab" title={metricHint(m.label)}>{m.label}</div>
            <div className="val">{m.value}</div>
            {(m.badge != null || m.change != null || m.note) && (
              <div className="note">
                {m.badge != null && <span className={`pc ${m.badge >= 100 ? "up" : m.badge >= 90 ? "am" : "dn"}`}>{m.badgeLabel ?? `${fmtFixed(m.badge, 0)}% Target`}</span>}
                {m.change != null && <span className={m.change >= 0 ? "up" : "dn"}>{m.change >= 0 ? "▲" : "▼"} {fmtFixed(Math.abs(m.change), 1)}% cùng kỳ </span>}
                {m.note}
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </>
);

type RailItem = { id: ReportSectionId; label: string };

// Thanh trang: hàng tab ngang cuộn được, dính mép trên (user bỏ cột bên trái 28/10 vì chiếm diện tích). `forExport` (file gửi brand) không dùng
// thành phần này — file xuất hiện đủ 10 trang nên dùng mục lục cuộn cũ (nút data-sec, script của exportStandaloneHtml.ts).
export const PageRail = React.forwardRef<HTMLElement, { items: RailItem[]; current: ReportSectionId; onSelect: (id: ReportSectionId) => void; onExcel: () => void }>(({ items, current, onSelect, onExcel }, ref) => (
  <nav
    ref={ref}
    aria-label="Các trang của report"
    className="flex items-center gap-1 px-3 py-2 overflow-x-auto sticky -top-3 sm:-top-6 z-20 rounded-t-2xl"
    style={{ background: PAL.bg, borderBottom: `1px solid ${PAL.line}` }}
  >
    {items.map((it, i) => (
      <button
        key={it.id}
        data-rail={it.id}
        onClick={() => onSelect(it.id)}
        aria-current={current === it.id ? "page" : undefined}
        className="px-3 py-1.5 text-xs font-bold whitespace-nowrap rounded-lg text-left focus-visible:outline focus-visible:outline-2"
        style={current === it.id ? { color: PAL.gold, background: PAL.panel2 } : { color: PAL.muted }}
      >
        <span className="font-mono mr-1.5">{i + 1}</span>
        {it.label}
      </button>
    ))}
    <button
      onClick={onExcel}
      data-export-hide
      title="Xuất toàn bộ Report Tháng ra 1 file Excel nhiều sheet"
      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0"
      style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.gold }}
    >
      <Download className="w-3.5 h-3.5" /> Xuất Excel
    </button>
  </nav>
));
PageRail.displayName = "PageRail";

export const PagePager: React.FC<{ prev: RailItem | null; next: RailItem | null; onSelect: (id: ReportSectionId) => void }> = ({ prev, next, onSelect }) => (
  <div className="flex items-center justify-between gap-3 pt-4" style={{ borderTop: `1px solid ${PAL.line}` }} data-export-hide>
    {prev ? (
      <button onClick={() => onSelect(prev.id)} className={`${LINK_BTN} no-underline gap-1`} style={{ color: PAL.gold }}>
        <ChevronLeft className="w-4 h-4" /> Trang trước · {prev.label}
      </button>
    ) : (
      <span />
    )}
    {next ? (
      <button onClick={() => onSelect(next.id)} className={`${LINK_BTN} no-underline gap-1`} style={{ color: PAL.gold }}>
        Trang sau · {next.label} <ChevronRight className="w-4 h-4" />
      </button>
    ) : (
      <span />
    )}
  </div>
);

// Khung Insight đầu phần 3–7 (2026-09-26, học từ deck report Crocs): kết luận → số chứng minh → việc cần
// làm. Bản tự sinh từ bản chụp; ops sửa được (0121) — bản đã sửa hiện cho brand thay bản tự sinh.
export const InsightBox: React.FC<{
  auto: SectionInsight | null;
  note?: { text: string; savedAt: string };
  computedAt: string;
  canManage: boolean;
  onSave: (text: string | null) => Promise<void>;
}> = ({ auto, note, computedAt, canManage, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = note ? parseInsightText(note.text) : auto;
  if (!shown && !canManage) return null;
  const save = async (text: string | null) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(text);
      setEditing(false);
    } catch (e) {
      const msg = errorMessage(e, "Lưu Insight thất bại");
      setError(/section_notes/.test(msg) ? "Chưa có cột section_notes — cần chạy migration 0121 trong SQL Editor." : msg);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rounded-xl p-4 space-y-2" style={{ background: "#1f1b10", border: `1px solid ${PAL.gold}44` }}>
      <div className="flex items-center gap-2 text-xs font-bold" style={{ color: PAL.gold }}>
        <Lightbulb className="w-3.5 h-3.5" /> Insight
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(6, draft.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 70)), 1))}
            className="w-full rounded-lg p-2.5 text-[13px] leading-relaxed font-sans"
            style={{ background: PAL.panel, border: `1px solid ${PAL.line}`, color: PAL.cream }}
          />
          <p className="text-[11px]" style={{ color: PAL.muted }}>
            Dòng đầu = kết luận · mỗi dòng sau = 1 gạch đầu dòng · dòng bắt đầu bằng "→" = việc cần làm.
          </p>
          {error && <p className="text-[11px]" style={{ color: PAL.red }}>{error}</p>}
          <div className="flex gap-3 text-[11px] font-bold">
            <button onClick={() => save(draft.trim() || null)} disabled={saving} className={LINK_BTN} style={{ color: PAL.gold }}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} className={LINK_BTN} style={{ color: PAL.muted }}>
              Huỷ
            </button>
          </div>
        </div>
      ) : (
        <>
          {shown ? (
            <>
              <p className="text-base font-black leading-snug" style={{ color: PAL.cream }}>
                {shown.headline}
              </p>
              {shown.points.length > 0 && (
                <ul className="space-y-1 text-sm leading-relaxed list-disc pl-5" style={{ color: PAL.cream }}>
                  {shown.points.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
              {shown.action && (
                <p className="text-sm font-semibold" style={{ color: PAL.gold }}>
                  → {shown.action}
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px]" style={{ color: PAL.muted }}>Chưa đủ số để tự sinh Insight cho phần này.</p>
          )}
          {canManage && (
            <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px]" style={{ borderTop: `1px solid ${PAL.line}`, color: PAL.muted }}>
              <span>{note ? "Ops đã sửa." : "Bản tự sinh từ số liệu."}</span>
              {note && note.savedAt < computedAt && <span style={{ color: PAL.gold }}>Số liệu đã cập nhật sau lần sửa — đọc lại cho khớp.</span>}
              <button
                onClick={() => {
                  setDraft(note?.text ?? (auto ? insightToText(auto) : ""));
                  setError(null);
                  setEditing(true);
                }}
                className={LINK_BTN}
                style={{ color: PAL.gold }}
              >
                Sửa Insight
              </button>
              {note && (
                <button onClick={() => save(null)} disabled={saving} className={LINK_BTN} style={{ color: PAL.muted }}>
                  Dùng lại bản tự sinh
                </button>
              )}
              {error && <span style={{ color: PAL.red }}>{error}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Cùng dáng với StatTile của app (common/StatTile.tsx: nhãn chữ thường 12px, số đậm, dòng phụ 11px) nhưng giữ skin đen-vàng
// cố định của report. frame "plain" = ô nằm trong một Panel — không vẽ thêm khung (trước 18/10 report lồng hộp 4 tầng).
export const KpiTile: React.FC<{ label: string; value: string; change?: number | null; note?: string; frame?: "box" | "plain" }> = ({ label, value, change, note, frame = "box" }) => (
  <div className={`min-w-0 ${frame === "box" ? "rounded-xl p-4" : ""}`} style={frame === "box" ? { background: PAL.panel2, border: `1px solid ${PAL.line}` } : undefined}>
    <div className={STAT_LABEL_SHAPE} style={{ color: PAL.muted }} title={metricHint(label)}>
      {label}
    </div>
    <div className="font-mono text-xl font-bold mt-1" style={{ color: PAL.cream }}>
      {value}
    </div>
    {change != null && (
      <div className="text-[11px] mt-1 font-bold" style={{ color: change >= 0 ? PAL.green : PAL.red }}>
        {change >= 0 ? "▲" : "▼"} {fmtFixed(Math.abs(change), 1)}% cùng kỳ
      </div>
    )}
    {note && (
      <div className="text-[11px] mt-1" style={{ color: PAL.muted }}>
        {note}
      </div>
    )}
  </div>
);

// Giải thích cách tính dài của một khối — gập sau dòng "Cách tính" (bố cục 18/10 đợt 2). Số, kết luận và chú thích màu
// vẫn hiện; chỉ phần nói phương pháp mới gập.
export const MethodNote: React.FC<{ children: React.ReactNode; label?: string; className?: string }> = ({ children, label = "Cách tính", className = "mt-2" }) => (
  <details className={`text-[11px] ${className}`} style={{ color: PAL.muted }}>
    <summary className="cursor-pointer min-h-6 py-1 font-bold w-fit">{label}</summary>
    <div className="leading-relaxed">{children}</div>
  </details>
);

export const ChartLegend: React.FC<{ items: [string, string][] }> = ({ items }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
    {items.map(([label, color]) => (
      <span key={label} className="flex items-center gap-1.5 text-[11px]" style={{ color: PAL.muted }}>
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
        {label}
      </span>
    ))}
  </div>
);

export const NarrativeEditor: React.FC<{
  summaryDraft: string;
  onSummary: (v: string) => void;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}> = ({ summaryDraft, onSummary, saving, error, onSave, onCancel }) => (
  <div className="space-y-3">
    <label className="block space-y-1">
      <span className="text-xs font-medium" style={{ color: PAL.muted }}>
        Kết luận (phần 1) — mỗi dòng một ý
      </span>
      <textarea
        id="mr-summary-text"
        value={summaryDraft}
        onChange={(e) => onSummary(e.target.value)}
        rows={6}
        className="w-full p-3 rounded-lg text-[13px] leading-relaxed"
        style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
      />
    </label>
    {error && (
      <p className="text-xs font-semibold" style={{ color: PAL.red }}>
        {error}
      </p>
    )}
    <div className="flex gap-2">
      <button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-60" style={{ background: PAL.gold, color: "#1a1500" }}>
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu
      </button>
      <button onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.muted }}>
        Huỷ
      </button>
    </div>
  </div>
);


/** "Insight tổng hợp" cuối mỗi trang: markup demo (DemoShopWhy.tsx); bản sửa lưu ở section_notes. */
export { DemoInsight as PageInsight } from "./DemoShopWhy";
