import React, { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { BarChart3, Lightbulb, ChevronDown, Loader2, Save } from "lucide-react";
import { metricHint } from "../../../lib/metricGlossary";
import { DRIVER_LABEL, DriverBreakdown } from "../../../lib/report/monthlyReportInsights";
import { insightToText, parseInsightText, SectionInsight } from "../../../lib/report/sectionInsights";
import { errorMessage } from "../../../lib/errorMessage";

import { fmtFixed, fmtVndShort } from "../../../lib/format";
import { LINK_BTN, PAL, DRIVER_SHORT, chartTooltipStyle } from "./theme";
import { chartNum } from "./format";

// Bộ component trình bày của Report Tháng — khung panel, bảng, thẻ KPI, hộp Insight, biểu đồ thác,
// ô sửa nhận xét. Tách khỏi MonthlyReportTabs.tsx 2026-10-01: toàn bộ chỗ này đã tự chứa sẵn (không
// đọc state nào của màn), nằm chung chỉ khiến phần TÍNH SỐ của report bị đẩy xuống quá tầm đọc.

export const ProgressBar: React.FC<{ pct: number | null; label?: string }> = ({ pct, label = "target Lịch Vận Hành" }) => {
  const clamped = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-2">
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: PAL.line }}>
        <div className="h-full rounded-full" style={{ width: `${clamped}%`, background: PAL.gold }} />
      </div>
      <div className="text-[11px] mt-1 font-mono" style={{ color: PAL.muted }}>
        {pct == null ? "chưa có target (Lịch Vận Hành)" : `${fmtFixed(pct, 1)}% ${label}`}
      </div>
    </div>
  );
};

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
export const ReportTable: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto -mx-1">
    <table className="w-full text-xs min-w-[520px] [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_th:first-child]:bg-[#17171b] [&_td:first-child]:bg-[#17171b]">
      <thead>
        <tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
          {head.map((h, i) => (
            <th
              key={i}
              className={`py-2 px-3 text-left text-[11px] uppercase tracking-wider ${i > 0 ? "text-right" : ""}`}
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
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: PAL.gold }}>
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

export const KpiTile: React.FC<{ label: string; value: string; change?: number | null; note?: string }> = ({ label, value, change, note }) => (
  <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
    <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }} title={metricHint(label)}>
      {label}
    </div>
    <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
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
  nextDraft: string;
  onSummary: (v: string) => void;
  onNext: (v: string) => void;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}> = ({ summaryDraft, nextDraft, onSummary, onNext, saving, error, onSave, onCancel }) => (
  <div className="space-y-3">
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>
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
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>
        Việc tháng sau (phần 7) — mỗi dòng một việc
      </span>
      <textarea
        id="mr-next-text"
        value={nextDraft}
        onChange={(e) => onNext(e.target.value)}
        rows={4}
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
