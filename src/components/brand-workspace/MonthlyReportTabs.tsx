import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  ReferenceLine,
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend
} from "recharts";
import {
  BarChart3,
  Flame,
  ListOrdered,
  ShoppingBag,
  Megaphone,
  Loader2,
  AlertTriangle,
  Handshake,
  CalendarClock,
  Plus,
  Trash2,
  Save,
  Filter,
  Users,
  PieChart as PieChartIcon,
  Activity,
  Download,
  Lightbulb,
  CalendarDays,
  ChevronDown
} from "lucide-react";
import { LiveSession, BrandMonthlyReport as BrandMonthlyReportType, AffiliatePlanEntry, AffiliateActualEntry, BrandPlatformRate } from "../../types";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { CHANNEL, METRIC, metricHint } from "../../lib/metricGlossary";
import { downloadSheetsAsXlsx } from "../../lib/exportXlsx";
import { useToast } from "../../hooks/useToast";
import { dailyFromSessions, monthRunRate, pickLivePerfSource } from "../../lib/report/sessionsLivePerf";
import { hydrateSnapshotSessions, MonthlyReportSnapshot, reportWindow, snapshotView } from "../../lib/report/monthlySnapshot";
import {
  autoNextSteps,
  autoSummary,
  basketBreakdown,
  campCompare,
  channelMix,
  compareWindow,
  DRIVER_LABEL,
  driverBreakdown,
  DriverBreakdown,
  DriverKey,
  LIVE_CTR_LABEL,
  liveStatsFromRows,
  LiveStats,
  NarrativeInput,
  pctChange,
  planCampAllocation,
  shopKpiProgress,
  shopTotals,
  skuMoves,
  trendSignal,
  UPT_LABEL
} from "../../lib/report/monthlyReportInsights";
import { CreatorLivePerfRow, vnDateOf } from "../../lib/dataraw/creatorLivePerfSlice";
import { fetchMonthPlan } from "../../lib/db/monthPlans";
import type { BrandMonthPlan, BrandMonthPlanSlot } from "../../types";
import { fetchMonthlyReport, upsertMonthlyReport, MonthlyReportManualInput, saveMonthlyReportNarrative, saveMonthlyReportSectionNote } from "../../lib/db/monthlyReports";
import {
  contextInsight,
  HostInsightRow,
  hostVsPeer,
  InsightSection,
  insightToText,
  parseInsightText,
  peopleInsight,
  productsInsight,
  SectionInsight,
  shopInsight,
  whyInsight
} from "../../lib/report/sectionInsights";
import { resolveCampBucketType } from "../../lib/campaignDays";
import { fetchAffiliatePlans, replaceAffiliatePlans } from "../../lib/db/affiliatePlans";
import { fetchAffiliateActuals, replaceAffiliateActuals } from "../../lib/db/affiliateActuals";
import { MonthlyDeepDive } from "./deepdive/MonthlyDeepDive";
import { errorMessage } from "../../lib/errorMessage";
import { byHost, byHostDayType, dataQuality, filterSessions, hostKey, splitUnassignedHost, DataQuality } from "../../lib/performance/hostPerformance";
import {
  aggregateCreatorLivePerfRows,
  bucketByCampaignDay,
  buildFunnel,
  topSessionsByGmv,
  CAMP_DAY_BUCKET_ORDER,
  CAMP_DAY_BUCKET_LABEL,
  CampDayBucket,
  CampOverrides,
  CreatorLivePerfAgg
} from "../../lib/dataraw/creatorLivePerfMetrics";

import { fmtFixed } from "../../lib/format";
// Report Tháng — skin đen-vàng CỐ ĐỊNH riêng cho tab này (khác theme sáng/tối/sand nội bộ app):
// đây là tài liệu gửi thẳng cho brand để pitching, nhận diện thương hiệu phải nhất quán bất kể Ops
// đang chọn theme nội bộ nào. Không dùng var(--accent)/var(--surface) như phần còn lại của app.
const PAL = {
  bg: "#0b0b0d",
  panel: "#17171b",
  panel2: "#1d1d22",
  line: "#2a2a30",
  gold: "#f2c94c",
  goldDim: "#a9873a",
  cream: "#f4f1e8",
  muted: "#93939c",
  green: "#6fcf97",
  red: "#eb6b6b",
  blue: "#7fb0e0"
};

function monthRangeLocal(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  return { start, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}
function prevMonthStrLocal(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonthStrLocal(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

// recharts khai formatter của <Tooltip> nhận ValueType | undefined (string | number | mảng của
// chúng), không phải number — viết thẳng `(v: number) => ...` là nói dối kiểu, strict bắt đúng.
// Bọc một lần ở đây thay vì ép kiểu ở 8 chỗ gọi: ép kiểu thì lần sau recharts đổi signature sẽ
// không còn ai báo.
function chartNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtPct(n: number | null): string {
  return n == null ? "—" : `${fmtFixed(n, 2)}%`;
}
function fmtHours(n: number): string {
  return `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
}
function fmtRoas(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}
// Status khuyến mãi trong file thật là tiếng Anh nguyên văn (expired/deactivated) — "ongoing" đã
// bị lọc khỏi Top khuyến mãi ở nguồn (monthlyProductSlice.ts) nên không cần map ở đây.
function promoStatusLabel(status: string): { label: string; color: string } {
  const s = status.toLowerCase();
  if (s === "expired") return { label: "Đã Kết Thúc", color: PAL.gold };
  if (s === "deactivated") return { label: "Đã Tắt", color: PAL.red };
  return { label: status, color: PAL.muted };
}
function fmtSessionStart(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(shifted.getUTCDate())}/${p(shifted.getUTCMonth() + 1)} ${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`;
}

let planRowKeyCounter = 0;
function newPlanRowKey(): string {
  planRowKeyCounter += 1;
  return `plan-row-${planRowKeyCounter}`;
}
type EditableAffiliatePlanEntry = AffiliatePlanEntry & { _key: string };

let affiliateRowKeyCounter = 0;
function newAffiliateRowKey(): string {
  affiliateRowKeyCounter += 1;
  return `affiliate-row-${affiliateRowKeyCounter}`;
}
type EditableAffiliateActualEntry = AffiliateActualEntry & { _key: string };
function roasOf(gmv: number | undefined, adsCost: number | undefined): number | null {
  return adsCost && adsCost > 0 ? (gmv || 0) / adsCost : null;
}
function runrateOf(gmv: number | undefined, target: number | undefined): number | null {
  return target && target > 0 ? ((gmv || 0) / target) * 100 : null;
}

const dayMonthLabel = (iso?: string | null) => (iso ? `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}` : "");

const ProgressBar: React.FC<{ pct: number | null; label?: string }> = ({ pct, label = "target Lịch Vận Hành" }) => {
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

interface MonthlyReportTabsProps {
  brandId: string;
  brandName: string;
  month: string;
  // Bản chụp số liệu (migration 0119, lib/report/monthlySnapshot.ts) — MỌI con số của tab 01–04 lấy
  // từ đây: ca, target kế hoạch (Đ5, xem scheduledTargetGmv), rate card, slice Dữ Liệu Gốc. Không tự
  // tải Dữ Liệu Gốc nữa.
  snapshot: MonthlyReportSnapshot;
  // Ca SỐNG của app — chỉ dùng cho (a) Tab 05 Phân Tích Sâu (ops-only, vẫn tính trực tiếp) và (b) biết
  // tháng nào brand đã được phát hành (monthPublished) để che số tháng chưa phát hành khỏi cột so sánh.
  liveSessions: LiveSession[];
  canManage: boolean;
}

const Panel: React.FC<{ title: string; icon: React.ReactNode; sub?: string; children: React.ReactNode }> = ({ title, icon, sub, children }) => (
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

const ReportTable: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto -mx-1">
    <table className="w-full text-xs min-w-[520px]">
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

const chartTooltipStyle = { background: PAL.panel2, border: `1px solid ${PAL.line}`, borderRadius: 8, fontSize: 11, color: PAL.cream };

// ---------- Bố cục 8 phần (2026-09-25) ----------

const SECTIONS: { id: string; label: string }[] = [
  { id: "summary", label: "1 · Tóm tắt" },
  { id: "target", label: "2 · Target & tiến độ" },
  { id: "shop", label: "3 · Sales Channel" },
  { id: "why", label: "4 · Key Metrics" },
  { id: "people", label: "5 · Host Performance" },
  { id: "products", label: "6 · Sản phẩm" },
  { id: "context", label: "7 · Campaign & khung giờ" },
  { id: "next", label: "8 · Target Plan tháng sau" },
  { id: "appendix", label: "Phụ lục" }
];

// 4 kênh — màu phân loại theo thứ tự cố định (blue/orange/aqua/yellow, bước tối của bảng màu đã kiểm
// mù màu cho các cặp kề nhau). Kênh luôn giữ một màu, không đổi theo thứ hạng.
const CHANNELS: { key: "liveLinked" | "affiliate" | "video" | "card"; label: string; color: string }[] = [
  { key: "liveLinked", label: CHANNEL.sellerLive, color: "#3987e5" },
  { key: "affiliate", label: CHANNEL.affiliateLive, color: "#d95926" },
  { key: "video", label: CHANNEL.video, color: "#199e70" },
  { key: "card", label: CHANNEL.productCard, color: "#c98500" }
];

const FUNNEL_TILES: { key: string; label: string; get: (s: LiveStats) => number | null; format: (v: number) => string; goodWhenUp: boolean | null }[] = [
  { key: "vph", label: METRIC.viewsPerHour, get: (s) => s.viewsPerHour, format: (v) => fmtInt(v), goodWhenUp: true },
  { key: "livectr", label: METRIC.liveCtr, get: (s) => s.liveCtr, format: (v) => fmtPct(v), goodWhenUp: true },
  { key: "ctr", label: METRIC.productCtr, get: (s) => s.ctr, format: (v) => fmtPct(v), goodWhenUp: true },
  { key: "ctor", label: METRIC.ctor, get: (s) => s.ctor, format: (v) => fmtPct(v), goodWhenUp: true },
  { key: "gpv", label: METRIC.gmvPerView, get: (s) => s.gmvPerView, format: (v) => `${fmtInt(v)} đ`, goodWhenUp: true },
  { key: "aov", label: METRIC.aov, get: (s) => s.aov, format: (v) => `${fmtInt(v / 1000)}k đ`, goodWhenUp: true },
  { key: "upt", label: METRIC.upt, get: (s) => s.upt, format: (v) => fmtFixed(v, 2), goodWhenUp: true },
  // Đọc cùng UPT: UPT giảm thì GMV/SP tự tăng dù giá bán không đổi ⇒ trung tính, không tô xanh/đỏ.
  { key: "ppi", label: METRIC.avgPrice, get: (s) => s.pricePerItem, format: (v) => `${fmtInt(v / 1000)}k đ`, goodWhenUp: null }
];

interface WaterfallPoint {
  label: string;
  base: number;
  value: number;
  kind: "total" | "up" | "down";
  display: number;
}

// Nhãn trục ngắn — 2 biểu đồ đứng cạnh nhau, nhãn đầy đủ (DRIVER_LABEL) dính vào nhau. Nhãn đầy đủ vẫn ở
// các ô chú thích bên dưới biểu đồ.
const DRIVER_SHORT: Record<DriverKey, string> = {
  hours: METRIC.liveHours,
  viewsPerHour: METRIC.viewsPerHour,
  gmvPerView: METRIC.gmvPerView,
  orders: METRIC.orders,
  upt: METRIC.upt,
  pricePerItem: METRIC.avgPrice
};

function toWaterfall(b: DriverBreakdown | null, cmp: { partial: boolean; prevEnd: string; curEnd: string }, month: string, prevMonth: string): WaterfallPoint[] {
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

const WaterfallPanel: React.FC<{ title: string; sub: string; data: WaterfallPoint[]; breakdown: DriverBreakdown; note?: string }> = ({ title, sub, data, breakdown, note }) => (
  <Panel title={title} icon={<BarChart3 className="w-4 h-4" />} sub={sub}>
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 8 }}>
          <CartesianGrid stroke={PAL.line} vertical={false} />
          <XAxis dataKey="label" stroke={PAL.muted} fontSize={10.5} interval={0} />
          <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
          <Tooltip contentStyle={chartTooltipStyle} formatter={(_v, _n, item) => formatCurrencyAdaptive(chartNum((item as { payload?: { display?: number } }).payload?.display))} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} legendType="none" tooltipType="none" />
          <Bar dataKey="value" stackId="w" radius={[4, 4, 0, 0]} name="GMV">
            {data.map((d, i) => (
              <Cell key={i} fill={d.kind === "total" ? PAL.gold : d.kind === "up" ? PAL.green : PAL.red} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
      {breakdown.parts.map((p) => (
        <div key={p.key} className="text-[11.5px] rounded-lg px-3 py-2" style={{ background: PAL.panel2, color: PAL.muted }}>
          <span style={{ color: PAL.cream }}>{DRIVER_LABEL[p.key]}</span> {p.change >= 0 ? "+" : "−"}{fmtFixed(Math.abs(p.change), 1)}% ⇒{" "}
          <span className="font-mono" style={{ color: p.value >= 0 ? PAL.green : PAL.red }}>
            {p.value >= 0 ? "+" : "−"}{formatCurrencyAdaptive(Math.abs(p.value))}
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
const SectionDetail: React.FC<{ open: boolean; onOpen: () => void; children: React.ReactNode }> = ({ open, onOpen, children }) =>
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

const SectionHead: React.FC<{ no: string; title: string; sub?: string }> = ({ no, title, sub }) => (
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
const InsightBox: React.FC<{
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
            <button onClick={() => save(draft.trim() || null)} disabled={saving} className="underline disabled:opacity-50" style={{ color: PAL.gold }}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} className="underline" style={{ color: PAL.muted }}>
              Huỷ
            </button>
          </div>
        </div>
      ) : (
        <>
          {shown ? (
            <>
              <p className="text-[13.5px] font-bold leading-relaxed" style={{ color: PAL.cream }}>
                {shown.headline}
              </p>
              {shown.points.length > 0 && (
                <ul className="space-y-1 text-[12.5px] leading-relaxed list-disc pl-5" style={{ color: PAL.cream }}>
                  {shown.points.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
              {shown.action && (
                <p className="text-[12.5px] font-semibold" style={{ color: PAL.gold }}>
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
                className="font-bold underline"
                style={{ color: PAL.gold }}
              >
                Sửa Insight
              </button>
              {note && (
                <button onClick={() => save(null)} disabled={saving} className="font-bold underline disabled:opacity-50" style={{ color: PAL.muted }}>
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

const KpiTile: React.FC<{ label: string; value: string; change?: number | null; note?: string }> = ({ label, value, change, note }) => (
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

const ChartLegend: React.FC<{ items: [string, string][] }> = ({ items }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
    {items.map(([label, color]) => (
      <span key={label} className="flex items-center gap-1.5 text-[11px]" style={{ color: PAL.muted }}>
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
        {label}
      </span>
    ))}
  </div>
);

// Ô xu hướng 4 tháng: số tháng report + đường nhỏ (1 chuỗi, 1 trục), điểm cuối tô theo chiều tốt/xấu.
// goodWhenUp null = chỉ số trung tính (vd GMV/SP — tăng có thể chỉ vì mỗi đơn ít SP hơn): chấm cuối màu vàng.
const TrendTile: React.FC<{ label: string; points: { label: string; value: number | null }[]; format: (v: number) => string; goodWhenUp: boolean | null }> = ({ label, points, format, goodWhenUp }) => {
  const last = points[points.length - 1]?.value ?? null;
  const prev = points[points.length - 2]?.value ?? null;
  const bad = goodWhenUp != null && last != null && prev != null && (goodWhenUp ? last < prev : last > prev);
  return (
    <div className="rounded-xl p-3" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }} title={metricHint(label)}>
        {label}
      </div>
      <div className="font-mono text-lg font-bold mt-1" style={{ color: PAL.cream }}>
        {last != null ? format(last) : "—"}
      </div>
      <div style={{ height: 36 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => format(chartNum(v))} labelFormatter={(l) => String(l)} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={PAL.gold}
              strokeWidth={2}
              isAnimationActive={false}
              dot={(p: { cx?: number; cy?: number; index?: number }) =>
                p.index === points.length - 1 ? (
                  <circle key="end" cx={p.cx} cy={p.cy} r={3.5} fill={goodWhenUp == null ? PAL.gold : bad ? PAL.red : PAL.green} stroke={PAL.panel2} strokeWidth={2} />
                ) : (
                  <g key={p.index} />
                )
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[11px] font-mono truncate" style={{ color: PAL.muted }} title={points.map((p) => `${p.label}: ${p.value != null ? format(p.value) : "—"}`).join(" · ")}>
        {points.map((p) => (p.value != null ? format(p.value) : "—")).join(" → ")}
      </div>
    </div>
  );
};

const NarrativeEditor: React.FC<{
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
        Tóm tắt (phần 1) — mỗi dòng một ý
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
        Việc tháng sau (phần 8) — mỗi dòng một việc
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


export const MonthlyReportTabs: React.FC<MonthlyReportTabsProps> = ({ brandId, brandName, month, snapshot, liveSessions, canManage }) => {

  // Brand KHÔNG được thấy số của tháng chưa phát hành (quyết định 2026-09-22, 0107) — kể cả qua cột
  // "tháng trước"/biểu đồ xu hướng của report tháng này. Bản chụp do ops dựng nên có đủ số 4 tháng;
  // với brand, bỏ hẳn ca + slice của các tháng trong cửa sổ chưa phát hành (đọc cờ monthPublished của
  // ca sống — nguồn sự thật hiện tại, không phải lúc chốt). Tháng report thì đã phát hành (brand đọc
  // được bản chụp là nhờ vậy).
  const hiddenMonths = useMemo(() => {
    if (canManage) return new Set<string>();
    const published = new Set(liveSessions.filter((s) => s.brandId === brandId && s.monthPublished).map((s) => s.date.slice(0, 7)));
    return new Set(reportWindow(month).filter((m) => m !== month && !published.has(m)));
  }, [canManage, liveSessions, brandId, month]);
  const sessions = useMemo(
    () => hydrateSnapshotSessions(snapshot).filter((s) => !hiddenMonths.has(s.date.slice(0, 7))),
    [snapshot, hiddenMonths]
  );
  const brandPlatformRates: BrandPlatformRate[] = snapshot.rates;
  const planMonthTotals = useMemo(() => new Map(Object.entries(snapshot.planMonthTotals)), [snapshot]);
  const view = useMemo(() => snapshotView(snapshot), [snapshot]);

  // Tab 05 Kế hoạch tháng sau — fetch/lưu riêng, không chung vòng loading với 4 tab số liệu thật
  // ở trên (đây là dữ liệu nhập tay, độc lập Dataraw).
  const [monthlyReportRow, setMonthlyReportRow] = useState<BrandMonthlyReportType | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planSaving, setPlanSaving] = useState(false);
  const [planErrorMsg, setPlanErrorMsg] = useState<string | null>(null);
  // Tab 02 Livestream — khung camp D-Day/Mid-Month/Pay Day cấu hình theo brand+tháng (migration
  // 0071), cùng row/save pattern như KPI Target ở trên nhưng form riêng.
  const [campSaving, setCampSaving] = useState(false);
  const [campErrorMsg, setCampErrorMsg] = useState<string | null>(null);
  const [campDdayStartInput, setCampDdayStartInput] = useState("");
  const [campDdayEndInput, setCampDdayEndInput] = useState("");
  const [campDdayTargetInput, setCampDdayTargetInput] = useState("");
  const [campMidmonthStartInput, setCampMidmonthStartInput] = useState("");
  const [campMidmonthEndInput, setCampMidmonthEndInput] = useState("");
  const [campMidmonthTargetInput, setCampMidmonthTargetInput] = useState("");
  const [campPaydayStartInput, setCampPaydayStartInput] = useState("");
  const [campPaydayEndInput, setCampPaydayEndInput] = useState("");
  const [campPaydayTargetInput, setCampPaydayTargetInput] = useState("");
  const [planTargetGmv, setPlanTargetGmv] = useState("");
  const [planTargetNmv, setPlanTargetNmv] = useState("");
  const [planTargetHours, setPlanTargetHours] = useState("");
  const [pctDaily, setPctDaily] = useState("");
  const [pctDday, setPctDday] = useState("");
  const [pctMidmonth, setPctMidmonth] = useState("");
  const [pctPayday, setPctPayday] = useState("");
  const [planRows, setPlanRows] = useState<EditableAffiliatePlanEntry[]>([]);

  // Tab 04 Affiliate — nhập tay hoàn toàn (migration 0067), fetch/lưu độc lập giống Tab 05.
  const [affiliateLoading, setAffiliateLoading] = useState(true);
  const [affiliateSaving, setAffiliateSaving] = useState(false);
  const [affiliateErrorMsg, setAffiliateErrorMsg] = useState<string | null>(null);
  const [affiliateRows, setAffiliateRows] = useState<EditableAffiliateActualEntry[]>([]);
  // Nút "Nhập Từ Dữ Liệu Gốc" (migration 0074) — điền directGmv/itemsSold/avgPrice/ctr/ctor từ file
  // Transaction Analysis - Creator List, KHÔNG đụng targetGmv/durationHours/adsCost/liveDateLabel
  // (vẫn nhập tay, file không có các số này).

  const { start, end } = useMemo(() => monthRangeLocal(month), [month]);
  const prevMonth = useMemo(() => prevMonthStrLocal(month), [month]);
  const { start: prevStart, end: prevEnd } = useMemo(() => monthRangeLocal(prevMonth), [prevMonth]);
  const last4Months = useMemo(() => {
    const out: string[] = [];
    let m = month;
    for (let i = 0; i < 4; i++) {
      out.unshift(m);
      m = prevMonthStrLocal(m);
    }
    return out;
  }, [month]);

  // Đổi nguồn số (2026-09-21): file Dataraw chỉ còn là DỰ PHÒNG — tháng nào có ca có số thì Tab 01/02
  // đọc từ ca (lib/report/sessionsLivePerf.ts). *Raw = slice từ Dataraw (bản chụp chỉ giữ slice này
  // cho tháng CHƯA có ca nào có số); liveCurrent/livePrev = nguồn đã chọn.
  const hidden = (m: string) => hiddenMonths.has(m);
  const liveCurrentRaw = view.liveRaw[month] ?? null;
  const livePrevRaw = hidden(prevMonth) ? null : (view.liveRaw[prevMonth] ?? null);
  const liveOlderMonths = useMemo(
    () => Object.fromEntries(Object.entries(view.liveRaw).map(([m, v]) => [m, hiddenMonths.has(m) ? null : v])),
    [view, hiddenMonths]
  );
  const dailyPerfRaw = view.dailyPerfRaw;
  const topSku = view.topSku;
  const topPromo = view.topPromo;

  const liveSource = useMemo(() => pickLivePerfSource(sessions, brandId, start, end, liveCurrentRaw), [sessions, brandId, start, end, liveCurrentRaw]);
  const livePrevSource = useMemo(() => pickLivePerfSource(sessions, brandId, prevStart, prevEnd, livePrevRaw), [sessions, brandId, prevStart, prevEnd, livePrevRaw]);
  const liveCurrent = liveSource.slice;
  const livePrev = livePrevSource.slice;
  // Diễn biến theo ngày: file Live Performance Core Stats có GMV gián tiếp — ưu tiên khi có; không có
  // thì gộp ca theo ngày.
  const dailyPerf = useMemo(() => (dailyPerfRaw?.hasAnyBatch ? dailyPerfRaw : dailyFromSessions(sessions, brandId, start, end)), [dailyPerfRaw, sessions, brandId, start, end]);
  const runRate = useMemo(() => monthRunRate(sessions, brandId, start, end), [sessions, brandId, start, end]);
  const currentAgg = useMemo(() => aggregateCreatorLivePerfRows(liveCurrent?.rows ?? []), [liveCurrent]);
  const prevAgg = useMemo(() => aggregateCreatorLivePerfRows(livePrev?.rows ?? []), [livePrev]);

  // Kế Hoạch Tháng của tháng trước / tháng này / tháng sau — nguồn khoảng ngày camp + target từng khung
  // (tháng này) và phân bổ tháng sau (phần 8). Bảng nhỏ (≤ ~100 ca/tháng), đọc thẳng như phần 8 vẫn làm
  // từ trước, không đưa vào bản chụp.
  const [plans, setPlans] = useState<Record<string, { plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null>>({});
  const nextMonth = useMemo(() => nextMonthStrLocal(month), [month]);
  useEffect(() => {
    let cancelled = false;
    const ms = [prevMonth, month, nextMonth];
    Promise.all(ms.map((m) => fetchMonthPlan(brandId, m).catch(() => null))).then((rs) => {
      if (!cancelled) setPlans(Object.fromEntries(ms.map((m, i) => [m, rs[i]])));
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, prevMonth, month, nextMonth]);
  const planCur = plans[month] ?? null;
  const nextPlanFull = plans[nextMonth] ?? null;

  // Khung camp D-Day/Mid-Month/Pay Day, từng khung: khoảng nhập ở report (migration 0071) → khoảng của
  // Kế Hoạch Tháng (0094) → lịch camp cố định (lib/campaignDays.ts).
  const campOverrides: CampOverrides = useMemo(() => {
    const out: CampOverrides = { ...(planCur?.plan.campRanges ?? {}) };
    if (monthlyReportRow?.campDdayStart && monthlyReportRow?.campDdayEnd) out.dday = { start: monthlyReportRow.campDdayStart, end: monthlyReportRow.campDdayEnd };
    if (monthlyReportRow?.campMidmonthStart && monthlyReportRow?.campMidmonthEnd)
      out.midmonth = { start: monthlyReportRow.campMidmonthStart, end: monthlyReportRow.campMidmonthEnd };
    if (monthlyReportRow?.campPaydayStart && monthlyReportRow?.campPaydayEnd) out.payday = { start: monthlyReportRow.campPaydayStart, end: monthlyReportRow.campPaydayEnd };
    return out;
  }, [monthlyReportRow, planCur]);
  // Tháng trước phân loại theo khoảng camp của CHÍNH tháng trước — đem khoảng của tháng này áp vào thì
  // ngày camp tháng trước (vd D-Day 8/8) bị tính thành ngày thường vì khung đó đã bị ghi đè.
  const prevCampOverrides: CampOverrides = useMemo(() => ({ ...(plans[prevMonth]?.plan.campRanges ?? {}) }), [plans, prevMonth]);

  const campBuckets = useMemo(() => bucketByCampaignDay(liveCurrent?.rows ?? [], campOverrides), [liveCurrent, campOverrides]);
  const prevCampBuckets = useMemo(() => bucketByCampaignDay(livePrev?.rows ?? [], prevCampOverrides), [livePrev, prevCampOverrides]);
  const funnelStages = useMemo(() => buildFunnel(liveCurrent?.rows ?? []), [liveCurrent]);
  const topSessions = useMemo(() => topSessionsByGmv(liveCurrent?.rows ?? [], 10), [liveCurrent]);

  // Chart "GMV/Giờ & Số Giờ Live" — combo bar+line dual-axis, 4 tháng (brief Module 2).
  const gmvHourTrend = useMemo(
    () =>
      last4Months.map((m) => {
        const older = m === month || m === prevMonth ? null : pickLivePerfSource(sessions, brandId, monthRangeLocal(m).start, monthRangeLocal(m).end, liveOlderMonths[m] ?? null).slice;
        const agg = m === month ? currentAgg : m === prevMonth ? prevAgg : aggregateCreatorLivePerfRows(older?.rows ?? []);
        return { label: m.slice(5, 7) + "/" + m.slice(2, 4), gmvPerHour: agg.gmvPerHour ?? 0, hours: agg.hours };
      }),
    [last4Months, month, prevMonth, currentAgg, prevAgg, liveOlderMonths, sessions, brandId]
  );

  // Gợi ý % phân bổ mặc định cho Tab 05 — trung bình tỷ trọng GMV thực đạt theo khung camp của
  // tháng đang xem + tháng trước (2 tháng đã fetch sẵn cho Tab 02, không fetch thêm). Nếu cả 2
  // tháng đều chưa có dữ liệu Live Analysis (brand mới/chưa import), fallback về chia đều 25% mỗi
  // khung — rõ ràng là fallback, KHÔNG giả vờ là số liệu lịch sử thật.
  const suggestedPct = useMemo(() => {
    const gmvByBucket = (buckets: ReturnType<typeof bucketByCampaignDay>) =>
      CAMP_DAY_BUCKET_ORDER.reduce(
        (acc, b) => {
          acc[b] = aggregateCreatorLivePerfRows(buckets[b]).gmv;
          return acc;
        },
        {} as Record<CampDayBucket, number>
      );
    const a = gmvByBucket(campBuckets);
    const b = gmvByBucket(prevCampBuckets);
    const total = CAMP_DAY_BUCKET_ORDER.reduce((sum, k) => sum + a[k] + b[k], 0);
    if (total <= 0) {
      return { dday: 25, midmonth: 25, payday: 25, daily: 25, isFallback: true };
    }
    return {
      dday: ((a.dday + b.dday) / total) * 100,
      midmonth: ((a.midmonth + b.midmonth) / total) * 100,
      payday: ((a.payday + b.payday) / total) * 100,
      daily: ((a.daily + b.daily) / total) * 100,
      isFallback: false
    };
  }, [campBuckets, prevCampBuckets]);

  useEffect(() => {
    let cancelled = false;
    setPlanLoading(true);
    setPlanErrorMsg(null);
    Promise.all([fetchMonthlyReport(brandId, `${month}-01`), fetchAffiliatePlans(brandId, `${nextMonth}-01`)])
      .then(([row, entries]) => {
        if (cancelled) return;
        setMonthlyReportRow(row);
        setCampDdayStartInput(row?.campDdayStart ?? "");
        setCampDdayEndInput(row?.campDdayEnd ?? "");
        setCampDdayTargetInput(row?.campDdayTargetGmv != null ? String(row.campDdayTargetGmv) : "");
        setCampMidmonthStartInput(row?.campMidmonthStart ?? "");
        setCampMidmonthEndInput(row?.campMidmonthEnd ?? "");
        setCampMidmonthTargetInput(row?.campMidmonthTargetGmv != null ? String(row.campMidmonthTargetGmv) : "");
        setCampPaydayStartInput(row?.campPaydayStart ?? "");
        setCampPaydayEndInput(row?.campPaydayEnd ?? "");
        setCampPaydayTargetInput(row?.campPaydayTargetGmv != null ? String(row.campPaydayTargetGmv) : "");
        setPlanTargetGmv(row?.planTargetGmv != null ? String(row.planTargetGmv) : "");
        setPlanTargetNmv(row?.planTargetNmv != null ? String(row.planTargetNmv) : "");
        setPlanTargetHours(row?.planTargetHours != null ? String(row.planTargetHours) : "");
        // Đã chốt trước đó thì dùng số đã lưu, chưa có thì điền sẵn % gợi ý theo lịch sử (ops có
        // thể sửa trước khi lưu) — chỉ tính khi effect này chạy, tránh suggestedPct đổi liên tục
        // ghi đè input ops đang gõ dở.
        setPctDaily(row?.planPctDaily != null ? String(row.planPctDaily) : suggestedPct.daily.toFixed(1));
        setPctDday(row?.planPctDday != null ? String(row.planPctDday) : suggestedPct.dday.toFixed(1));
        setPctMidmonth(row?.planPctMidmonth != null ? String(row.planPctMidmonth) : suggestedPct.midmonth.toFixed(1));
        setPctPayday(row?.planPctPayday != null ? String(row.planPctPayday) : suggestedPct.payday.toFixed(1));
        setPlanRows(entries.map((e) => ({ ...e, _key: newPlanRowKey() })));
      })
      .catch((e) => !cancelled && setPlanErrorMsg(e.message || "Không tải được Kế hoạch tháng sau"))
      .finally(() => !cancelled && setPlanLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, month, nextMonth]);

  const planPctTotal = useMemo(
    () => (Number(pctDaily) || 0) + (Number(pctDday) || 0) + (Number(pctMidmonth) || 0) + (Number(pctPayday) || 0),
    [pctDaily, pctDday, pctMidmonth, pctPayday]
  );
  const planDonutData = useMemo(
    () => [
      { label: "Daily", value: Number(pctDaily) || 0, color: PAL.gold },
      { label: "D-Day", value: Number(pctDday) || 0, color: PAL.green },
      { label: "Pay Day", value: Number(pctPayday) || 0, color: PAL.blue },
      { label: "Mid-Month", value: Number(pctMidmonth) || 0, color: PAL.muted }
    ],
    [pctDaily, pctDday, pctMidmonth, pctPayday]
  );
  const planBucketRows = useMemo(() => {
    const totalGmv = Number(planTargetGmv) || 0;
    const totalHours = Number(planTargetHours) || 0;
    return [
      { key: "daily", label: "Daily", pct: Number(pctDaily) || 0 },
      { key: "dday", label: "D-Day", pct: Number(pctDday) || 0 },
      { key: "payday", label: "Pay Day", pct: Number(pctPayday) || 0 },
      { key: "midmonth", label: "Mid-Month", pct: Number(pctMidmonth) || 0 }
    ].map((b) => {
      const gmv = (totalGmv * b.pct) / 100;
      const hours = (totalHours * b.pct) / 100;
      return { ...b, gmv, hours, gmvPerHour: hours > 0 ? gmv / hours : null };
    });
  }, [planTargetGmv, planTargetHours, pctDaily, pctDday, pctMidmonth, pctPayday]);

  const handleSavePlan = async () => {
    setPlanSaving(true);
    setPlanErrorMsg(null);
    try {
      // Pass-through nguyên giá trị Ads/ROAS/Notes đã tải (form đó sống ở BrandMonthlyReport.tsx,
      // không đụng ở đây) — tránh upsert ghi đè các field đó về null.
      const input: MonthlyReportManualInput = {
        adsSpend: monthlyReportRow?.adsSpend,
        roas: monthlyReportRow?.roas,
        promotionNotes: monthlyReportRow?.promotionNotes,
        customerInsightNotes: monthlyReportRow?.customerInsightNotes,
        accountHealthNotes: monthlyReportRow?.accountHealthNotes,
        planTargetGmv: planTargetGmv ? Number(planTargetGmv) : undefined,
        planTargetNmv: planTargetNmv ? Number(planTargetNmv) : undefined,
        planTargetHours: planTargetHours ? Number(planTargetHours) : undefined,
        planPctDaily: pctDaily ? Number(pctDaily) : undefined,
        planPctDday: pctDday ? Number(pctDday) : undefined,
        planPctMidmonth: pctMidmonth ? Number(pctMidmonth) : undefined,
        planPctPayday: pctPayday ? Number(pctPayday) : undefined,
        campDdayStart: monthlyReportRow?.campDdayStart,
        campDdayEnd: monthlyReportRow?.campDdayEnd,
        campDdayTargetGmv: monthlyReportRow?.campDdayTargetGmv,
        campMidmonthStart: monthlyReportRow?.campMidmonthStart,
        campMidmonthEnd: monthlyReportRow?.campMidmonthEnd,
        campMidmonthTargetGmv: monthlyReportRow?.campMidmonthTargetGmv,
        campPaydayStart: monthlyReportRow?.campPaydayStart,
        campPaydayEnd: monthlyReportRow?.campPaydayEnd,
        campPaydayTargetGmv: monthlyReportRow?.campPaydayTargetGmv
      };
      const savedRow = await upsertMonthlyReport(brandId, `${month}-01`, input);
      setMonthlyReportRow(savedRow);
      const savedEntries = await replaceAffiliatePlans(brandId, `${nextMonth}-01`, planRows);
      setPlanRows(savedEntries.map((e) => ({ ...e, _key: newPlanRowKey() })));
    } catch (e) {
      setPlanErrorMsg(errorMessage(e, "Lưu Kế hoạch tháng sau thất bại"));
    } finally {
      setPlanSaving(false);
    }
  };

  const handleSaveCampConfig = async () => {
    setCampSaving(true);
    setCampErrorMsg(null);
    try {
      const input: MonthlyReportManualInput = {
        adsSpend: monthlyReportRow?.adsSpend,
        roas: monthlyReportRow?.roas,
        promotionNotes: monthlyReportRow?.promotionNotes,
        customerInsightNotes: monthlyReportRow?.customerInsightNotes,
        accountHealthNotes: monthlyReportRow?.accountHealthNotes,
        planTargetGmv: monthlyReportRow?.planTargetGmv,
        planTargetNmv: monthlyReportRow?.planTargetNmv,
        planTargetHours: monthlyReportRow?.planTargetHours,
        planPctDaily: monthlyReportRow?.planPctDaily,
        planPctDday: monthlyReportRow?.planPctDday,
        planPctMidmonth: monthlyReportRow?.planPctMidmonth,
        planPctPayday: monthlyReportRow?.planPctPayday,
        campDdayStart: campDdayStartInput || undefined,
        campDdayEnd: campDdayEndInput || undefined,
        campDdayTargetGmv: campDdayTargetInput ? Number(campDdayTargetInput) : undefined,
        campMidmonthStart: campMidmonthStartInput || undefined,
        campMidmonthEnd: campMidmonthEndInput || undefined,
        campMidmonthTargetGmv: campMidmonthTargetInput ? Number(campMidmonthTargetInput) : undefined,
        campPaydayStart: campPaydayStartInput || undefined,
        campPaydayEnd: campPaydayEndInput || undefined,
        campPaydayTargetGmv: campPaydayTargetInput ? Number(campPaydayTargetInput) : undefined
      };
      const savedRow = await upsertMonthlyReport(brandId, `${month}-01`, input);
      setMonthlyReportRow(savedRow);
    } catch (e) {
      setCampErrorMsg(errorMessage(e, "Lưu Khung Camp thất bại"));
    } finally {
      setCampSaving(false);
    }
  };

  const addPlanRow = () =>
    setPlanRows((rows) => [
      ...rows,
      { _key: newPlanRowKey(), brandId, periodMonth: `${nextMonth}-01`, creatorName: "", campTag: "", scheduleLabel: "", timelineLabel: "" }
    ]);
  const removePlanRow = (key: string) => setPlanRows((rows) => rows.filter((r) => r._key !== key));
  const updatePlanRow = (key: string, patch: Partial<AffiliatePlanEntry>) =>
    setPlanRows((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const planAffiliateTotals = useMemo(
    () => ({
      targetGmv: planRows.reduce((sum, r) => sum + (r.targetGmv || 0), 0),
      budgetAds: planRows.reduce((sum, r) => sum + (r.budgetAds || 0), 0)
    }),
    [planRows]
  );

  // Tab 04 Affiliate — nhập tay hoàn toàn (migration 0067). Fetch theo THÁNG ĐANG XEM (khác Tab 05
  // fetch theo nextMonth).
  useEffect(() => {
    let cancelled = false;
    setAffiliateLoading(true);
    setAffiliateErrorMsg(null);
    fetchAffiliateActuals(brandId, `${month}-01`)
      .then((entries) => {
        if (cancelled) return;
        setAffiliateRows(entries.map((e) => ({ ...e, _key: newAffiliateRowKey() })));
      })
      .catch((e) => !cancelled && setAffiliateErrorMsg(e.message || "Không tải được Affiliate"))
      .finally(() => !cancelled && setAffiliateLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, month]);

  const addAffiliateRow = () =>
    setAffiliateRows((rows) => [...rows, { _key: newAffiliateRowKey(), brandId, periodMonth: `${month}-01`, creatorName: "" }]);
  const removeAffiliateRow = (key: string) => setAffiliateRows((rows) => rows.filter((r) => r._key !== key));
  const updateAffiliateRow = (key: string, patch: Partial<AffiliateActualEntry>) =>
    setAffiliateRows((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const handleSaveAffiliate = async () => {
    setAffiliateSaving(true);
    setAffiliateErrorMsg(null);
    try {
      const saved = await replaceAffiliateActuals(brandId, `${month}-01`, affiliateRows);
      setAffiliateRows(saved.map((e) => ({ ...e, _key: newAffiliateRowKey() })));
    } catch (e) {
      setAffiliateErrorMsg(errorMessage(e, "Lưu Affiliate thất bại"));
    } finally {
      setAffiliateSaving(false);
    }
  };

  const affiliateChartData = useMemo(
    () =>
      affiliateRows
        .filter((r) => r.creatorName.trim())
        .map((r) => ({
          label: r.creatorName,
          gmvHour: r.durationHours && r.durationHours > 0 ? (r.directGmv || 0) / r.durationHours : 0,
          runrate: runrateOf(r.directGmv, r.targetGmv) ?? 0
        })),
    [affiliateRows]
  );

  const completedInPeriod = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && s.status === "Completed"),
    [sessions, brandId, start, end]
  );

  // Host Performance (Tab 02) — Creator-Live-Performance không có tên host nên KHÔNG tính từ
  // Dataraw; tổng hợp từ session nội bộ (đã biết hostName sẵn).
  //
  // Audit Module 3 (2026-09-18): trước đây tab này tự gom bằng một vòng lặp riêng — giờ KẾ HOẠCH,
  // đếm cả ca GMV = 0, gom theo tên, kèm cột CVR mà không luồng nào ghi — nên brand đọc ra một
  // GMV/giờ KHÁC với tab "Hiệu Suất Host" của agency về cùng một host. Giờ dùng đúng
  // lib/performance/hostPerformance.ts (giờ live thật khi có, loại ca không có số, gom theo id rồi
  // mới tới tên) — hai màn hình không bao giờ được nói hai con số về cùng một người.
  interface HostPerfRow {
    key: string;
    hostName: string;
    sessionCount: number;
    quality: DataQuality;
    gmv: number;
    orders: number;
    hours: number;
    gmvPerHour: number | null;
    ctr: number | null;
  }
  const hostPerformance = useMemo<HostPerfRow[]>(() => {
    const tiktokSessions = filterSessions(
      completedInPeriod.filter((s) => s.platform === "TikTok"),
      {}
    );
    const byKey = new Map<string, LiveSession[]>();
    for (const s of tiktokSessions) {
      const list = byKey.get(hostKey(s)) ?? [];
      list.push(s);
      byKey.set(hostKey(s), list);
    }
    // Ca chưa gán host bị tách khỏi bảng/biểu đồ host (audit 2026-09-21): gom mọi ca vô danh thành
    // một dòng rồi xếp hạng chung với người thật là so sai đối tượng.
    return splitUnassignedHost(byHost(tiktokSessions))
      .ranked.sort((a, b) => b.gmv - a.gmv)
      .map((r) => ({
        key: r.key,
        hostName: r.label,
        sessionCount: r.sessionCount,
        quality: dataQuality(byKey.get(r.key) ?? []),
        gmv: r.gmv,
        orders: r.orders,
        hours: r.hours,
        gmvPerHour: r.hours > 0 ? r.gmvPerHour : null,
        ctr: r.productImpressions > 0 ? r.ctr : null
      }));
  }, [completedInPeriod]);
  const hostQuality = useMemo(() => dataQuality(filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {})), [completedInPeriod]);
  const unassignedHost = useMemo(
    () => splitUnassignedHost(byHost(filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {}))).unassigned,
    [completedInPeriod]
  );

  // Target GMV/NMV (Tab 01 Tổng Quan) = target CAM KẾT của tháng.
  //
  // Đ5 (2026-09-24) — cách cũ cộng `targetGmv` của các ca chưa huỷ trong kỳ, với ghi chú "tổng này =
  // đúng tổng kế hoạch tháng khi có kế hoạch". Bất biến đó KHÔNG đúng: ca kế hoạch chưa chốt người
  // thì chưa có `live_session` nào để cộng, nên mẫu số tụt đúng bằng phần chưa xếp. Đo được trên
  // VERA 09/2026: kế hoạch 100tr (2 ca × 50tr), mới xếp người 1 ca ⇒ mẫu số ra 50tr ⇒ Report báo
  // "145% target" trong khi thực tế mới đạt 72,5% cam kết. Càng sớm trong tháng càng sai nhiều —
  // tức là sai to nhất đúng lúc người ta nhìn để quyết xếp thêm ca hay không.
  //
  // Nay: tháng nào có Kế Hoạch Tháng ĐÃ CHỐT thì lấy thẳng tổng target của kế hoạch đó (cùng con
  // số Hỗ Trợ Vận Hành gọi là "TARGET ĐÃ CHỐT" và Toàn Cảnh Brand hiện ở cột Kế hoạch tháng — ba
  // màn không được nói ba số). Không có kế hoạch chốt thì giữ nguyên cách cũ (target đi từ tab 05
  // của tháng trước, phân bổ xuống từng ca).
  //
  // Chỉ áp cho khoảng đúng bằng TRỌN 1 tháng — mọi lời gọi trong file này đều là monthRangeLocal(),
  // nhưng để ai đó sau này truyền khoảng tuỳ ý vào thì rơi về cách cũ thay vì trả nhầm target tháng.
  const wholeMonthKey = (s: string, e: string): string | null => {
    if (s.slice(0, 7) !== e.slice(0, 7) || !s.endsWith("-01")) return null;
    const { end: lastDay } = monthRangeLocal(s.slice(0, 7));
    return e === lastDay ? `${brandId}|${s.slice(0, 7)}` : null;
  };
  const plannedMonthTarget = (s: string, e: string): number | null => {
    const key = wholeMonthKey(s, e);
    const total = key ? planMonthTotals?.get(key) : undefined;
    return total !== undefined && total > 0 ? total : null;
  };
  const sumSessionTargets = (s: string, e: string) =>
    sessions
      .filter((x) => x.brandId === brandId && x.date >= s && x.date <= e && x.status !== "Cancelled")
      .reduce((sum, x) => sum + (x.targetGmv || 0), 0);

  const scheduledTargetGmv = (s: string, e: string) => plannedMonthTarget(s, e) ?? sumSessionTargets(s, e);

  // Chart "Target vs Thực Đạt GMV" (brief Module 1) — Target = tổng target đã lên lịch (xem trên),
  // Actual = Total GMV thực tế.
  const trend = useMemo(() => {
    const out: { label: string; kpiTarget: number | null; actual: number }[] = [];
    for (const m of last4Months) {
      const { start: s, end: e } = monthRangeLocal(m);
      const list = sessions.filter((x) => x.brandId === brandId && x.date >= s && x.date <= e && x.status === "Completed");
      const target = scheduledTargetGmv(s, e);
      out.push({
        label: m.slice(5, 7) + "/" + m.slice(2, 4),
        kpiTarget: target > 0 ? target : null,
        actual: list.reduce((sum, x) => sum + (x.actualGmv || 0), 0)
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, brandId, last4Months, brandPlatformRates]);

  const hasReturnRateConfig = brandPlatformRates.some((r) => r.brandId === brandId);
  const kpiTargetGmvCurRaw = scheduledTargetGmv(start, end);
  const kpiTargetGmvCur = kpiTargetGmvCurRaw > 0 ? kpiTargetGmvCurRaw : null;

  // "Diễn Biến GMV Theo Ngày" (brief Module 2) — 2 line: gmv_live_session (fill gold) + gmv_indirect
  // (dashed blue), cả 2 từ File 1. Giữ thêm GPM (đã build trước đó, không có trong brief nhưng vẫn
  // hữu ích) làm line thứ 3 trên trục phải thay vì bỏ hẳn công đã làm.
  const dailyChartData = useMemo(
    () =>
      (dailyPerf?.daily ?? []).map((d) => ({
        label: d.date.slice(8, 10) + "/" + d.date.slice(5, 7),
        gmvLiveSession: d.gmvLiveSession,
        gmvIndirect: d.gmvIndirect,
        gpm: d.gpm
      })),
    [dailyPerf]
  );

  // So cùng số ngày: tháng report chưa có số tới ngày cuối thì so 1..N với 1..N tháng trước — so với
  // trọn tháng trước từng ra −40% cho T9 CROCS trong khi cùng kỳ chỉ −18%.
  const cmp = useMemo(() => compareWindow(month, snapshot.coverage.sessionsThrough), [month, snapshot]);
  // Bảng khung camp — MỖI khung so với CHÍNH khung đó tháng trước (deck report Crocs T8 làm tay từng
  // camp). Thực đạt tính từ ca (cùng nguồn phần 1–4; D-Day CROCS T8 1,172 tỷ khớp deck 1,17 tỷ), không từ
  // file Live Performance Core Stats như trước — hai nguồn lệch nhau ~15% nên không đặt cạnh nhau được.
  // Target: Kế Hoạch Tháng ĐÃ CHỐT (cộng target ca theo khung) → không có thì target nhập tay ở report.
  const planCampTargets = useMemo(() => {
    if (!planCur || planCur.plan.status !== "locked" || planCur.slots.length === 0) return null;
    return Object.fromEntries(planCampAllocation(planCur.slots, campOverrides).map((a) => [a.key, a.target > 0 ? a.target : null])) as Record<CampDayBucket, number | null>;
  }, [planCur, campOverrides]);
  const campTargetSource = planCampTargets ? "Kế Hoạch Tháng đã chốt" : "nhập tay ở report";
  const prevColLabel = cmp.partial ? `1–${Number(cmp.prevEnd.slice(8))}/${prevMonth.slice(5)}` : `Tháng ${prevMonth.slice(5)}`;
  const curColLabel = cmp.partial ? `1–${Number(cmp.curEnd.slice(8))}/${month.slice(5)}` : `Tháng ${month.slice(5)}`;
  const campDetailRows = useMemo(() => {
    const targets: Record<CampDayBucket, number | null> = planCampTargets ?? {
      dday: monthlyReportRow?.campDdayTargetGmv ?? null,
      midmonth: monthlyReportRow?.campMidmonthTargetGmv ?? null,
      payday: monthlyReportRow?.campPaydayTargetGmv ?? null,
      daily: null
    };
    // Cùng kỳ như phần 1–4: tháng chưa hết thì tháng trước cũng cắt ở cùng ngày — không thì dòng ngày
    // thường của T9 (tới 22/09) bị so với trọn T8 và ra −38% giả.
    return campCompare(liveCurrent?.rows ?? [], { start: cmp.curStart, end: cmp.curEnd, overrides: campOverrides }, livePrev?.rows ?? [], { start: cmp.prevStart, end: cmp.prevEnd, overrides: prevCampOverrides }, targets).map((r) => ({
      ...r,
      label: CAMP_DAY_BUCKET_LABEL[r.key],
      actual: r.cur.gmv,
      hours: r.cur.hours,
      gmvPerHour: r.cur.gmvPerHour,
      ctr: r.cur.ctr,
      ctor: r.cur.ctor
    }));
  }, [liveCurrent, livePrev, cmp, campOverrides, prevCampOverrides, planCampTargets, monthlyReportRow]);
  const campTargetVsActualData = useMemo(
    () =>
      campDetailRows
        .filter((r) => r.key !== "daily")
        .map((r) => ({ label: CAMP_DAY_BUCKET_LABEL[r.key].replace(/ \(.*\)$/, ""), target: r.target ?? 0, actual: r.actual, prev: r.prev.gmv })),
    [campDetailRows]
  );


  // ============================ Bố cục 8 phần (2026-09-25) ============================
  // Mọi phép tính mới nằm ở lib/report/monthlyReportInsights.ts (thuần, có test). Ở đây chỉ nối dây.

  const liveCurStats = useMemo(() => liveStatsFromRows(liveCurrent?.rows ?? [], cmp.curStart, cmp.curEnd), [liveCurrent, cmp]);
  const livePrevStats = useMemo(() => liveStatsFromRows(livePrev?.rows ?? [], cmp.prevStart, cmp.prevEnd), [livePrev, cmp]);
  const prevAggWindow = useMemo(
    () => aggregateCreatorLivePerfRows((livePrev?.rows ?? []).filter((r) => { const d = vnDateOf(r.startTime); return d >= cmp.prevStart && d <= cmp.prevEnd; })),
    [livePrev, cmp]
  );
  const drivers = useMemo(() => driverBreakdown(livePrevStats, liveCurStats), [livePrevStats, liveCurStats]);
  const basket = useMemo(() => basketBreakdown(livePrevStats, liveCurStats), [livePrevStats, liveCurStats]);

  // 4 tháng (tháng report tính tới ngày có số) — cho ô xu hướng phễu + dấu hiệu "N tháng liên tiếp".
  const monthlyStats = useMemo(
    () =>
      last4Months.map((m) => {
        const { start: s, end: e } = monthRangeLocal(m);
        const rows = m === month ? liveCurrent?.rows ?? [] : m === prevMonth ? livePrev?.rows ?? [] : pickLivePerfSource(sessions, brandId, s, e, liveOlderMonths[m] ?? null).slice.rows;
        return { month: m, stats: liveStatsFromRows(rows, s, m === month ? cmp.curEnd : e) };
      }),
    [last4Months, month, prevMonth, liveCurrent, livePrev, sessions, brandId, liveOlderMonths, cmp]
  );
  const signals = useMemo(() => {
    const has = monthlyStats.filter((x) => x.stats.sessions > 0).length === monthlyStats.length;
    if (!has) return [];
    return [
      trendSignal(METRIC.ctor, monthlyStats.map((x) => x.stats.ctor)),
      trendSignal(METRIC.productCtr, monthlyStats.map((x) => x.stats.ctr)),
      trendSignal(METRIC.viewsPerHour, monthlyStats.map((x) => x.stats.viewsPerHour)),
      trendSignal(METRIC.aov, monthlyStats.map((x) => x.stats.aov)),
      trendSignal(UPT_LABEL, monthlyStats.map((x) => x.stats.upt)),
      trendSignal(LIVE_CTR_LABEL, monthlyStats.map((x) => x.stats.liveCtr))
    ].filter((x): x is NonNullable<typeof x> => x !== null);
  }, [monthlyStats]);

  // Toàn shop (Shop Analytics theo ngày). Tháng bị che với brand thì slice null ⇒ không có số so sánh.
  const shopDaysOf = (m: string) => (hiddenMonths.has(m) ? null : view.shopDays[m] ?? null);
  const shopCur = useMemo(() => shopTotals(view.shopDays[month], cmp.curStart, cmp.curEnd), [view, month, cmp]);
  const shopPrevSame = useMemo(() => shopTotals(hiddenMonths.has(prevMonth) ? null : view.shopDays[prevMonth], cmp.prevStart, cmp.prevEnd), [view, prevMonth, cmp, hiddenMonths]);
  const channelMixes = useMemo(
    () =>
      last4Months.map((m) => {
        const { start: s, end: e } = monthRangeLocal(m);
        const card = hiddenMonths.has(m) ? null : view.cardGmv[m];
        return channelMix(m, shopTotals(shopDaysOf(m), s, e), card?.hasAnyBatch ? card.cardGmv : null);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [last4Months, view, hiddenMonths]
  );
  const channelChartData = useMemo(
    () =>
      channelMixes
        .map((c, idx) => (c ? { label: `${last4Months[idx].slice(5)}/${last4Months[idx].slice(2, 4)}`, liveLinked: c.liveLinked, affiliate: c.affiliate, video: c.video, card: c.card ?? 0 } : null))
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [channelMixes, last4Months]
  );
  const shopPiecesMissing = !Object.values(view.shopDays).some(Boolean) && !Object.values(view.cardGmv).some(Boolean);

  // KPI GMV cả shop brand giao (Kế Hoạch Tháng, 0122) — mọi kênh, khác target live. Tháng chưa hết thì dự
  // kiến theo nhịp cùng kỳ tháng trước (chỉ khi tháng trước có đủ số cả tháng).
  const shopKpi = useMemo(() => {
    const target = planCur?.plan.shopTargetGmv ?? 0;
    if (!target || !shopCur) return null;
    const lastDay = Number(monthRangeLocal(month).end.slice(8));
    const throughDay = shopCur.through ? Number(shopCur.through.slice(8, 10)) : lastDay;
    const { start: ps, end: pe } = monthRangeLocal(prevMonth);
    const prevSlice = hiddenMonths.has(prevMonth) ? null : view.shopDays[prevMonth];
    const toDay = shopTotals(prevSlice, ps, `${prevMonth}-${String(Math.min(throughDay, Number(pe.slice(8)))).padStart(2, "0")}`);
    const total = shopTotals(prevSlice, ps, pe);
    const prevShape = toDay && total && total.through === pe ? { toDay: toDay.gmv, total: total.gmv } : null;
    return shopKpiProgress(target, shopCur, lastDay, prevShape);
  }, [planCur, shopCur, month, prevMonth, hiddenMonths, view]);

  // NMV: tỷ lệ hoàn ở Rate Card (điều khoản hợp đồng) nếu đã nhập, không thì tỷ lệ hoàn THỰC của cả shop
  // trong kỳ (Shop Analytics) — ước tính, ghi rõ trên report.
  const refundRateShop = shopCur && shopCur.gmv > 0 ? (shopCur.refunds / shopCur.gmv) * 100 : null;
  const tiktokReturnRate = brandPlatformRates.find((r) => r.brandId === brandId && r.platform === "TikTok")?.returnRate;
  const nmvRate = hasReturnRateConfig ? tiktokReturnRate ?? null : refundRateShop;
  const nmvSource = hasReturnRateConfig ? "tỷ lệ hoàn hủy ở Rate Card" : refundRateShop != null ? "Refund rate thực của cả shop trong kỳ" : null;

  // Luỹ kế GMV live theo ngày — tháng report vs tháng trước (cùng trục ngày 1..31).
  const cumulativeData = useMemo(() => {
    const byDay = (rows: CreatorLivePerfRow[], m: string) => {
      const arr = new Array(31).fill(0);
      for (const r of rows) {
        const d = vnDateOf(r.startTime);
        if (d.startsWith(m)) arr[Number(d.slice(8, 10)) - 1] += r.gmv;
      }
      return arr;
    };
    const cur = byDay(liveCurrent?.rows ?? [], month);
    const prev = byDay(livePrev?.rows ?? [], prevMonth);
    const curLast = Number(cmp.curEnd.slice(8, 10));
    const prevLast = Number(prevEnd.slice(8, 10));
    const out: { day: number; cur: number | null; prev: number | null }[] = [];
    let a = 0;
    let b = 0;
    for (let i = 0; i < 31; i++) {
      a += cur[i];
      b += prev[i];
      out.push({ day: i + 1, cur: i + 1 <= curLast ? a : null, prev: i + 1 <= prevLast ? b : null });
    }
    return out;
  }, [liveCurrent, livePrev, month, prevMonth, cmp, prevEnd]);

  // Waterfall "vì sao": cột nền trong suốt + cột giá trị (recharts không có waterfall sẵn).
  const waterfallData = useMemo(() => toWaterfall(drivers, cmp, month, prevMonth), [drivers, cmp, month, prevMonth]);
  const basketWaterfall = useMemo(() => toWaterfall(basket, cmp, month, prevMonth), [basket, cmp, month, prevMonth]);

  // Khung giờ bắt đầu ca — GMV/giờ, cùng kỳ 2 tháng (phần 7 "Bối cảnh").
  const slotRows = useMemo(() => {
    const buckets = [
      { key: "morning", label: "Sáng (trước 12h)", test: (h: number) => h < 12 },
      { key: "afternoon", label: "Chiều (12h–17h)", test: (h: number) => h >= 12 && h < 17 },
      { key: "evening", label: "Tối (từ 17h)", test: (h: number) => h >= 17 }
    ];
    const hourOf = (iso: string) => (new Date(iso).getUTCHours() + 7) % 24;
    const agg = (rows: CreatorLivePerfRow[], s: string, e: string, test: (h: number) => boolean) => {
      let n = 0, gmv = 0, hours = 0;
      for (const r of rows) {
        const d = vnDateOf(r.startTime);
        if (d < s || d > e || !test(hourOf(r.startTime))) continue;
        n++;
        gmv += r.gmv;
        hours += r.hours;
      }
      return { n, gmv, gmvPerHour: hours > 0 ? gmv / hours : null };
    };
    return buckets.map((b) => ({
      ...b,
      cur: agg(liveCurrent?.rows ?? [], cmp.curStart, cmp.curEnd, b.test),
      prev: agg(livePrev?.rows ?? [], cmp.prevStart, cmp.prevEnd, b.test)
    }));
  }, [liveCurrent, livePrev, cmp]);

  // Phần 8 — kế hoạch tháng sau lấy từ Kế Hoạch Tháng (nguồn duy nhất của target/lịch tháng sau).
  const nextPlan = nextPlanFull ? { targetGmv: nextPlanFull.plan.targetGmv, status: nextPlanFull.plan.status, slotCount: nextPlanFull.slots.length } : null;
  // Phân bổ tháng sau theo khung camp (% · target · giờ · GMV/giờ cần), đặt cạnh GMV/giờ thực đạt cùng
  // khung tháng này — thấy ngay khung nào đang đặt target cao hơn sức bán hiện tại.
  const nextAllocation = useMemo(
    () => (nextPlanFull && nextPlanFull.slots.length > 0 ? planCampAllocation(nextPlanFull.slots, nextPlanFull.plan.campRanges) : null),
    [nextPlanFull]
  );

  // Top SKU: hạng tháng trước → tháng này + phễu (piece skuRank, bản chụp từ 2026-09-26). Tháng trước bị
  // che với brand (chưa phát hành) thì không có hạng/so sánh.
  const skuMoveData = useMemo(
    () => skuMoves(view.skuRank?.[month] ?? null, hiddenMonths.has(prevMonth) ? null : (view.skuRank?.[prevMonth] ?? null)),
    [view, month, prevMonth, hiddenMonths]
  );

  const campBest = useMemo(() => {
    const camps = campDetailRows.filter((r) => r.key !== "daily" && r.gmvPerHour != null && r.hours > 0).sort((a, b) => (b.gmvPerHour ?? 0) - (a.gmvPerHour ?? 0));
    return camps[0] ? { label: camps[0].label, gmvPerHour: camps[0].gmvPerHour! } : null;
  }, [campDetailRows]);
  const dailyGmvPerHour = campDetailRows.find((r) => r.key === "daily")?.gmvPerHour ?? null;

  // Phần 5 — host so với mặt bằng CÙNG LOẠI NGÀY: mỗi host tách theo khung camp/ngày thường (cùng cách
  // tính giờ/GMV với bảng host), vì host được xếp nhiều ca camp tự nhiên có GMV/giờ cao hơn.
  const hostInsight = useMemo(() => {
    const tiktok = filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {});
    const rows = new Map<string, HostInsightRow>();
    for (const b of CAMP_DAY_BUCKET_ORDER) {
      const part = tiktok.filter((s) => resolveCampBucketType(s.date, campOverrides) === b);
      for (const r of splitUnassignedHost(byHost(part)).ranked) {
        const cur = rows.get(r.key) ?? { name: r.label, gmv: 0, hours: 0, byBucket: {} };
        cur.gmv += r.gmv;
        cur.hours += r.hours;
        cur.byBucket[b] = { gmv: r.gmv, hours: r.hours };
        rows.set(r.key, cur);
      }
    }
    const keys = [...rows.keys()];
    const list = [...rows.values()];
    const peer = hostVsPeer(list);
    return { rows: list, vsPeer: new Map(keys.map((k, idx) => [k, peer[idx].vsPeer])) };
  }, [completedInPeriod, campOverrides]);

  // Phần 5 — host tách ngày thường / ngày camp (Pay Day, Mid-Month, D-Day gộp). Luật chia: GMV trọn
  // cho host, trợ live chỉ ghi giờ (xem byHostDayType).
  const hostDayType = useMemo(
    () =>
      byHostDayType(
        filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {}),
        (date) => resolveCampBucketType(date, campOverrides) !== "daily"
      ),
    [completedInPeriod, campOverrides]
  );

  // Khung Insight phần 3–7 — tự sinh từ đúng các số phần đó đang hiện (lib/report/sectionInsights.ts).
  const sectionInsight: Record<InsightSection, SectionInsight | null> = {
    shop: shopInsight({ months: last4Months, mixes: channelMixes, agencyGmv: monthlyStats.map((x) => x.stats.gmv), shopCur, shopPrev: shopPrevSame, windowLabel: cmp.label }),
    why: whyInsight(livePrevStats, liveCurStats),
    people: peopleInsight(hostInsight.rows),
    products: productsInsight(skuMoveData, topPromo?.items?.[0] ?? null),
    context: contextInsight(campDetailRows, slotRows)
  };
  const shownInsight = (key: InsightSection) => {
    const note = monthlyReportRow?.sectionNotes?.[key];
    return note ? parseInsightText(note.text) : sectionInsight[key];
  };
  const insightBox = (key: InsightSection) => (
    <InsightBox
      auto={sectionInsight[key]}
      note={monthlyReportRow?.sectionNotes?.[key]}
      computedAt={snapshot.computedAt}
      canManage={canManage}
      onSave={async (text) => setMonthlyReportRow(await saveMonthlyReportSectionNote(brandId, `${month}-01`, key, text))}
    />
  );

  const narrativeInput: NarrativeInput = {
    month,
    window: cmp,
    shopCur,
    shopPrev: shopPrevSame,
    liveCur: liveCurStats,
    livePrev: livePrevStats,
    drivers,
    basket,
    signals,
    targetGmv: kpiTargetGmvCur,
    campBest,
    dailyGmvPerHour,
    nextMonth,
    nextPlan,
    shopKpi
  };
  const autoSummaryLines = autoSummary({ ...narrativeInput, skus: skuMoveData });
  const autoNextLines = autoNextSteps(narrativeInput);
  const splitLines = (t?: string) => (t ?? "").split("\n").map((l) => l.replace(/^[-•\s]+/, "").trim()).filter(Boolean);
  const summaryLines = monthlyReportRow?.summaryText != null ? splitLines(monthlyReportRow.summaryText) : autoSummaryLines;
  const nextLines = monthlyReportRow?.nextStepsText != null ? splitLines(monthlyReportRow.nextStepsText) : autoNextLines;
  const narrativeEdited = monthlyReportRow?.summaryText != null || monthlyReportRow?.nextStepsText != null;
  // Đoạn đã sửa viết theo bộ số CŨ hơn lần cập nhật số liệu gần nhất ⇒ nhắc ops đọc lại trước khi phát hành.
  const narrativeStale = narrativeEdited && !!monthlyReportRow?.summarySavedAt && monthlyReportRow.summarySavedAt < snapshot.computedAt;

  const [editingNarrative, setEditingNarrative] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [nextDraft, setNextDraft] = useState("");
  const [narrativeSaving, setNarrativeSaving] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const startEditNarrative = () => {
    setSummaryDraft(summaryLines.join("\n"));
    setNextDraft(nextLines.join("\n"));
    setNarrativeError(null);
    setEditingNarrative(true);
  };
  const saveNarrative = async (reset: boolean) => {
    setNarrativeSaving(true);
    setNarrativeError(null);
    try {
      const row = await saveMonthlyReportNarrative(
        brandId,
        `${month}-01`,
        reset ? { summaryText: null, nextStepsText: null } : { summaryText: summaryDraft.trim() || null, nextStepsText: nextDraft.trim() || null }
      );
      setMonthlyReportRow(row);
      setEditingNarrative(false);
    } catch (e) {
      setNarrativeError(errorMessage(e, "Lưu tóm tắt thất bại"));
    } finally {
      setNarrativeSaving(false);
    }
  };

  const agencyNotes = [
    ["Khuyến mãi", monthlyReportRow?.promotionNotes],
    ["Khách hàng", monthlyReportRow?.customerInsightNotes],
    ["Sức khoẻ tài khoản", monthlyReportRow?.accountHealthNotes]
  ].filter((x): x is [string, string] => !!x[1]?.trim());

  const [showDeepDive, setShowDeepDive] = useState(false);
  // Điện thoại (audit UX 2026-09-26, P2): trang 24,7 màn 375px, phần 4–7 chiếm 56%. Dưới 768px phần 3–8 + Phụ
  // lục chỉ hiện tiêu đề + Insight (kết luận), biểu đồ/bảng mở khi bấm; Tóm tắt + Target luôn mở. Desktop không đổi.
  const isNarrow = !useMediaQuery("(min-width: 768px)");
  const [openDetails, setOpenDetails] = useState<Set<string>>(() => new Set());
  const detailOpen = (id: string) => !isNarrow || openDetails.has(id);
  const openDetail = (id: string) => setOpenDetails((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  // Bấm mục lục tới phần đang gập: mở ra rồi mới cuộn — phải chờ React vẽ xong phần vừa mở (effect dưới),
  // cuộn ngay thì vị trí đích còn là của bản gập.
  const pendingScrollRef = useRef<string | null>(null);
  const scrollNow = (id: string) => document.getElementById(`mr-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const scrollTo = (id: string) => {
    if (detailOpen(id)) return scrollNow(id);
    pendingScrollRef.current = id;
    openDetail(id);
  };
  useEffect(() => {
    const id = pendingScrollRef.current;
    if (!id || !openDetails.has(id)) return;
    pendingScrollRef.current = null;
    scrollNow(id);
  }, [openDetails]);

  // Xuất Excel toàn bộ Report Tháng (Đợt "trung tâm report") — 1 file, mỗi bảng đang có trên các
  // tab (trừ 05 Phân Tích Sâu, ops-only, không thuộc tài liệu gửi brand) là 1 sheet, để không phải
  // bấm xuất từng tab. Chỉ đọc lại đúng các mảng đã tính cho phần hiển thị — không tính số mới.
  const { showToast } = useToast();
  const handleExportAll = () => {
    const n = (v: number | null | undefined) => (v == null ? "" : Math.round(v * 100) / 100);
    downloadSheetsAsXlsx(
      [
        {
          name: "1 Tom Tat",
          rows: [
            ...summaryLines.map((l) => ({ "Phần": "Tóm tắt", "Nội dung": l })),
            ...nextLines.map((l) => ({ "Phần": "Việc tháng sau", "Nội dung": l })),
            ...(
              [
                ["shop", "Insight · Sales Channel"],
                ["why", "Insight · Key Metrics"],
                ["people", "Insight · Host Performance"],
                ["products", "Insight · Sản phẩm"],
                ["context", "Insight · Campaign & khung giờ"]
              ] as [InsightSection, string][]
            ).flatMap(([key, label]) => {
              const ins = shownInsight(key);
              return ins ? insightToText(ins).split("\n").map((l) => ({ "Phần": label, "Nội dung": l })) : [];
            })
          ]
        },
        {
          name: "1 KPI",
          rows: [
            { "Chỉ Số": "Total GMV", "Kỳ trước": n(shopPrevSame?.gmv), "Kỳ này": n(shopCur?.gmv) },
            { "Chỉ Số": "LIVE GMV (agency)", "Kỳ trước": n(livePrevStats.gmv), "Kỳ này": n(liveCurStats.gmv) },
            { "Chỉ Số": "Giờ live", "Kỳ trước": n(livePrevStats.hours), "Kỳ này": n(liveCurStats.hours) },
            { "Chỉ Số": "GMV/giờ", "Kỳ trước": n(livePrevStats.gmvPerHour), "Kỳ này": n(liveCurStats.gmvPerHour) },
            { "Chỉ Số": "Views/giờ", "Kỳ trước": n(livePrevStats.viewsPerHour), "Kỳ này": n(liveCurStats.viewsPerHour) },
            { "Chỉ Số": "Product CTR (%)", "Kỳ trước": n(livePrevStats.ctr), "Kỳ này": n(liveCurStats.ctr) },
            { "Chỉ Số": "CTOR (%)", "Kỳ trước": n(livePrevStats.ctor), "Kỳ này": n(liveCurStats.ctor) },
            { "Chỉ Số": "LIVE CTR (%)", "Kỳ trước": n(livePrevStats.liveCtr), "Kỳ này": n(liveCurStats.liveCtr) },
            { "Chỉ Số": "Orders", "Kỳ trước": n(livePrevStats.orders), "Kỳ này": n(liveCurStats.orders) },
            { "Chỉ Số": "UPT", "Kỳ trước": n(livePrevStats.upt), "Kỳ này": n(liveCurStats.upt) },
            { "Chỉ Số": "Avg. price", "Kỳ trước": n(livePrevStats.pricePerItem), "Kỳ này": n(liveCurStats.pricePerItem) },
            { "Chỉ Số": "AOV", "Kỳ trước": n(livePrevStats.aov), "Kỳ này": n(liveCurStats.aov) },
            { "Chỉ Số": "Target GMV", "Kỳ trước": "", "Kỳ này": n(kpiTargetGmvCur) },
            { "Chỉ Số": "KPI GMV", "Kỳ trước": "", "Kỳ này": n(shopKpi?.target) },
            { "Chỉ Số": "Total GMV dự kiến cuối tháng", "Kỳ trước": "", "Kỳ này": n(shopKpi?.projected) },
            { "Chỉ Số": `So sánh: ${cmp.label}`, "Kỳ trước": "", "Kỳ này": "" }
          ]
        },
        {
          name: "3 Sales Channel",
          rows: channelMixes.map((c, idx) => ({
            "Tháng": last4Months[idx],
            "Total GMV": n(c?.shopGmv),
            "LIVE GMV (agency)": n(monthlyStats[idx].stats.gmv),
            "Seller LIVE": n(c?.liveLinked),
            "Affiliate LIVE": n(c?.affiliate),
            "Video": n(c?.video),
            "Product card": n(c?.card),
            "Refund rate (%)": n(c?.refundRate)
          }))
        },
        {
          name: "7 Campaign",
          rows: campDetailRows.map((r) => ({
            "Khung": r.label,
            "Target GMV": n(r.target),
            "GMV": n(r.actual),
            "% Target": n(r.target ? (r.actual / r.target) * 100 : null),
            [`GMV cùng khung ${prevMonth}`]: n(r.prev.gmv),
            "UPT": n(r.cur.upt),
            "Giờ live": n(r.hours),
            "GMV/giờ": n(r.gmvPerHour),
            "Product CTR": n(r.ctr),
            "CTOR": n(r.ctor)
          }))
        },
        {
          name: "7 Top Sessions",
          rows: topSessions.map((s, idx) => ({
            "#": idx + 1,
            "Bắt Đầu": fmtSessionStart(s.startTime),
            "Giờ live": n(s.hours),
            "GMV": n(s.gmv),
            "GMV/giờ": n(s.gmvPerHour),
            "Orders": n(s.orders),
            "Items sold": n(s.itemsSold),
            "Views": n(s.views),
            "Product CTR": n(s.ctr),
            "CTOR": n(s.ctor)
          }))
        },
        {
          name: "5 Host Performance",
          rows: hostPerformance.map((h) => ({
            "Host": h.hostName,
            "Sessions": h.sessionCount,
            "GMV": n(h.gmv),
            "Giờ live": n(h.hours),
            "GMV/giờ": n(h.gmvPerHour),
            "So mặt bằng cùng loại ngày (%)": n(hostInsight.vsPeer.get(h.key)),
            "Orders": n(h.orders),
            "Product CTR": n(h.ctr)
          }))
        },
        {
          name: "5 Host Daily-Campaign",
          rows: hostDayType.map((h) => ({
            "Host": h.name,
            "Sessions Daily": h.daily.sessions,
            "GMV Daily": n(h.daily.gmv),
            "Giờ live Daily": n(h.daily.hours),
            "GMV/giờ Daily": n(h.daily.hours > 0 ? h.daily.gmv / h.daily.hours : null),
            "Sessions Campaign": h.camp.sessions,
            "GMV Campaign": n(h.camp.gmv),
            "Giờ live Campaign": n(h.camp.hours),
            "GMV/giờ Campaign": n(h.camp.hours > 0 ? h.camp.gmv / h.camp.hours : null),
            "Sessions trợ live": h.assist.sessions,
            "Giờ trợ live": n(h.assist.hours)
          }))
        },
        {
          name: "6 Top SKU",
          rows: skuMoveData
            ? skuMoveData.rows.map((r) => ({
                "Hạng": r.rank,
                [`Hạng ${prevMonth}`]: r.prevRank ?? "",
                "Sản Phẩm": r.name,
                "GMV": n(r.gmv),
                [skuMoveData.perDay ? "± GMV/ngày (%)" : "± GMV (%)"]: n(r.gmvChange),
                "Seller LIVE GMV": n(r.gmvLive),
                "Orders": n(r.orders),
                "Items sold": n(r.itemsSold),
                "Product CTR (%)": n(r.ctr),
                "CTOR (%)": n(r.ctor)
              }))
            : (topSku?.items ?? []).map((s, idx) => ({ "#": idx + 1, "Sản Phẩm": s.name, "GMV": n(s.gmv), "Seller LIVE GMV": n(s.gmvLive), "Orders": n(s.orders) }))
        },
        {
          name: "6 Top Promotion",
          rows: (topPromo?.items ?? []).map((p, idx) => ({
            "#": idx + 1,
            "Chương Trình": p.name,
            "Trạng Thái": promoStatusLabel(p.status).label,
            "GMV": n(p.gmv),
            "Orders": n(p.orders),
            "AOV": n(p.aov)
          }))
        },
        {
          name: "Phu Luc - Affiliate",
          rows: affiliateRows.map((a) => ({
            "Creator": a.creatorName,
            "Ngày Live": a.liveDateLabel ?? "",
            "Target GMV": n(a.targetGmv),
            "Direct GMV": n(a.directGmv),
            "Giờ live": n(a.durationHours),
            "Ads cost": n(a.adsCost),
            "Items sold": n(a.itemsSold),
            "Viewers": n(a.viewer),
            "Avg. price": n(a.avgPrice),
            "LIVE CTR": n(a.ctr),
            "CTOR": n(a.ctor),
            "% Target": n(runrateOf(a.directGmv, a.targetGmv)),
            "ROAS": n(roasOf(a.directGmv, a.adsCost))
          }))
        },
        {
          name: "Phu Luc - Phan Bo",
          rows: planBucketRows.map((b) => ({
            "Khung": b.label,
            "Phân Bổ (%)": n(b.pct),
            "Target GMV": n(b.gmv),
            "Giờ live": n(b.hours),
            "GMV/giờ": n(b.gmvPerHour)
          }))
        },
        {
          name: "Phu Luc - KH Affiliate",
          rows: planRows.map((r) => ({
            "Lịch Live": r.scheduleLabel ?? "",
            "Creator": r.creatorName,
            "Camp": r.campTag ?? "",
            "Timeline": r.timelineLabel ?? "",
            "Giờ live": n(r.durationHours),
            "Target GMV": n(r.targetGmv),
            "Budget Ads": n(r.budgetAds)
          }))
        }
      ],
      `ReportThang_${brandName}_${month}.xlsx`.replace(/\s+/g, "_")
    ).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: PAL.bg, border: `1px solid ${PAL.line}` }}>
      {/* Mục lục 8 phần — trang cuộn thay 6 tab (user chốt 2026-09-25): tab giấu nội dung, brand có thể không
          bao giờ mở tới tab 04. */}
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto sticky top-0 z-10" style={{ background: PAL.bg, borderBottom: `1px solid ${PAL.line}` }}>
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            onClick={() => scrollTo(sec.id)}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap rounded-lg hover:opacity-100 focus-visible:outline focus-visible:outline-2"
            style={{ color: PAL.muted }}
          >
            {sec.label}
          </button>
        ))}
        <button
          onClick={handleExportAll}
          title="Xuất toàn bộ Report Tháng ra 1 file Excel nhiều sheet"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0"
          style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.gold }}
        >
          <Download className="w-3.5 h-3.5" /> Xuất Excel
        </button>
      </div>

      <div className="p-5 space-y-8">
        {shopPiecesMissing && canManage && (
          <div className="flex items-start gap-2 text-[11px] rounded-xl p-2.5" style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Số liệu này chốt trước khi report có phần "Toàn shop &amp; kênh" — bấm "Cập nhật số liệu" ở trên để có đủ 8 phần.
          </div>
        )}

        {/* ===== 1. Tóm tắt ===== */}
        <section id="mr-summary" className="space-y-4 scroll-mt-16">
          <SectionHead no="1" title="Tóm tắt" sub={cmp.partial ? `Số tính tới ${cmp.curEnd.slice(8)}/${month.slice(5)} · % là cùng kỳ ${cmp.label}` : `Tháng ${month.slice(5)}/${month.slice(0, 4)} · % là ${cmp.label}`} />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiTile
              label="Total GMV"
              value={shopCur ? formatCurrencyAdaptive(shopCur.gmv) : "—"}
              change={shopCur && shopPrevSame ? pctChange(shopPrevSame.gmv, shopCur.gmv) : null}
              note={
                shopKpi
                  ? `${fmtPct(shopKpi.pct)} KPI ${formatCurrencyAdaptive(shopKpi.target)}${shopKpi.partial ? ` · dự kiến ${fmtPct(shopKpi.projectedPct)}` : ""}`
                  : shopCur
                    ? "Shop Analytics — mọi kênh"
                    : "chưa có file Shop Analytics"
              }
            />
            <KpiTile
              label="LIVE GMV (agency)"
              value={formatCurrencyAdaptive(liveCurStats.gmv)}
              change={pctChange(livePrevStats.gmv, liveCurStats.gmv)}
              note={shopCur && shopCur.gmv > 0 ? `${fmtPct((liveCurStats.gmv / shopCur.gmv) * 100)} tổng shop · ${liveCurStats.sessions} ca` : `${liveCurStats.sessions} ca`}
            />
            <KpiTile
              label="NMV (ước tính)"
              value={nmvRate != null ? formatCurrencyAdaptive(liveCurStats.gmv * (1 - nmvRate / 100)) : "—"}
              note={nmvRate != null ? `trừ ${fmtPct(nmvRate)} — ${nmvSource}` : "chưa có tỷ lệ hoàn hủy (Rate Card) / Refund rate (Shop Analytics)"}
            />
            <KpiTile label="Giờ live" value={fmtHours(liveCurStats.hours)} change={pctChange(livePrevStats.hours, liveCurStats.hours)} note={`${liveCurStats.sessions} ca có số`} />
            <KpiTile label="GMV/giờ" value={liveCurStats.gmvPerHour != null ? formatCurrencyAdaptive(liveCurStats.gmvPerHour) : "—"} change={pctChange(livePrevStats.gmvPerHour, liveCurStats.gmvPerHour)} />
          </div>

          <div className="rounded-xl p-4 space-y-3" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
            {editingNarrative ? (
              <NarrativeEditor
                summaryDraft={summaryDraft}
                nextDraft={nextDraft}
                onSummary={setSummaryDraft}
                onNext={setNextDraft}
                saving={narrativeSaving}
                error={narrativeError}
                onSave={() => saveNarrative(false)}
                onCancel={() => setEditingNarrative(false)}
              />
            ) : (
              <>
                <ul className="space-y-2 text-[13.5px] leading-relaxed list-disc pl-5" style={{ color: PAL.cream }}>
                  {summaryLines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
                {canManage && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px]" style={{ borderTop: `1px solid ${PAL.line}`, color: PAL.muted }}>
                    <span>{narrativeEdited ? "Ops đã sửa đoạn này (tóm tắt + việc tháng sau)." : "Bản tự sinh từ số liệu — sửa trước khi phát hành nếu cần."}</span>
                    {narrativeStale && <span style={{ color: PAL.gold }}>Số liệu đã cập nhật sau lần sửa — đọc lại cho khớp số mới.</span>}
                    <button onClick={startEditNarrative} className="font-bold underline" style={{ color: PAL.gold }}>
                      Sửa tóm tắt & việc tháng sau
                    </button>
                    {narrativeEdited && (
                      <button onClick={() => saveNarrative(true)} disabled={narrativeSaving} className="font-bold underline disabled:opacity-50" style={{ color: PAL.muted }}>
                        Dùng lại bản tự sinh
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ===== 2. Mục tiêu & tiến độ ===== */}
        <section id="mr-target" className="space-y-4 scroll-mt-16">
          <SectionHead no="2" title="Target & tiến độ" sub="Target lấy từ Kế Hoạch Tháng đã chốt; so luỹ kế cùng ngày với tháng trước" />
          {kpiTargetGmvCur ? (
            <div className="rounded-xl p-4 flex flex-wrap items-end gap-6" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
              <div>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>Target GMV</div>
                <div className="font-mono text-xl font-bold mt-1" style={{ color: PAL.cream }}>{formatCurrencyAdaptive(kpiTargetGmvCur)}</div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <ProgressBar pct={(liveCurStats.gmv / kpiTargetGmvCur) * 100} />
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-[11.5px] rounded-xl p-3" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.muted }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: PAL.gold }} />
              Tháng {month.slice(5)} chưa có target chốt ở Kế Hoạch Tháng — phần này hiện % Target, run-rate và dự kiến cuối tháng khi có. Bên dưới là so sánh cùng kỳ, luôn có.
            </div>
          )}
          {shopKpi ? (
            <div className="rounded-xl p-4 flex flex-wrap items-end gap-6" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
              <div>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>KPI GMV</div>
                <div className="font-mono text-xl font-bold mt-1" style={{ color: PAL.cream }}>{formatCurrencyAdaptive(shopKpi.target)}</div>
                <div className="text-[11px]" style={{ color: PAL.muted }}>brand giao · mọi kênh · Kế Hoạch Tháng</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>{shopKpi.partial ? `Đã đạt tới ${dayMonthLabel(shopCur?.through)}` : "Thực đạt"}</div>
                <div className="font-mono text-xl font-bold mt-1" style={{ color: PAL.cream }}>{formatCurrencyAdaptive(shopKpi.actual)}</div>
              </div>
              {shopKpi.partial && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>Dự kiến cuối tháng</div>
                  <div className="font-mono text-xl font-bold mt-1" style={{ color: shopKpi.projectedPct >= 100 ? PAL.green : shopKpi.projectedPct >= 90 ? PAL.gold : PAL.red }}>
                    {formatCurrencyAdaptive(shopKpi.projected)} · {fmtPct(shopKpi.projectedPct)}
                  </div>
                  <div className="text-[11px]" style={{ color: PAL.muted }}>{shopKpi.method === "prev" ? "theo nhịp cùng kỳ tháng trước" : "chia đều theo ngày"}</div>
                </div>
              )}
              <div className="flex-1 min-w-[200px]">
                <ProgressBar pct={shopKpi.pct} label="KPI GMV" />
              </div>
            </div>
          ) : (
            canManage &&
            shopCur && (
              <p className="text-[11px]" style={{ color: PAL.muted }}>
                Chưa có KPI GMV (cả shop) cho tháng {month.slice(5)} — nhập ở Kế Hoạch Tháng (ô "KPI GMV") nếu brand có giao.
              </p>
            )
          )}
          {runRate && runRate.doneCount > 0 && (
                  <div className="rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>Target kế hoạch</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: PAL.cream }}>{formatCurrencyAdaptive(runRate.targetTotal)}</div>
                      <div className="text-[11px]" style={{ color: PAL.muted }}>{runRate.doneCount} ca xong · {runRate.pendingCount} còn lại</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>Đã đạt</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: PAL.green }}>{formatCurrencyAdaptive(runRate.actualDone)}</div>
                      <div className="text-[11px]" style={{ color: PAL.muted }}>{runRate.targetTotal > 0 ? `${fmtFixed(((runRate.actualDone / runRate.targetTotal) * 100), 0)}% target` : ""}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>Run-rate</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: runRate.runRate === null ? PAL.muted : runRate.runRate >= 1 ? PAL.green : runRate.runRate >= 0.9 ? PAL.gold : PAL.red }}>
                        {runRate.runRate === null ? "—" : `${fmtFixed((runRate.runRate * 100), 0)}%`}
                      </div>
                      <div className="text-[11px]" style={{ color: PAL.muted }}>thực tế ÷ target ca đã xong</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>Dự kiến cuối tháng</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: PAL.cream }}>{formatCurrencyAdaptive(runRate.projected)}</div>
                      <div className="text-[11px]" style={{ color: PAL.muted }}>còn lại = target × run-rate</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>{runRate.gap > 0 ? "Thiếu" : "Vượt"}</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: runRate.gap > 0 ? PAL.red : PAL.green }}>{formatCurrencyAdaptive(Math.abs(runRate.gap))}</div>
                      <div className="text-[11px]" style={{ color: PAL.muted }}>{runRate.targetTotal > 0 ? `${fmtFixed(((Math.abs(runRate.gap) / runRate.targetTotal) * 100), 1)}% target` : ""}</div>
                    </div>
                  </div>
                )}
          <Panel title="LIVE GMV luỹ kế theo ngày" icon={<Activity className="w-4 h-4" />} sub={`Tháng ${month.slice(5)} so với tháng ${prevMonth.slice(5)} — cùng trục ngày`}>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativeData} margin={{ right: 12 }}>
                  <CartesianGrid stroke={PAL.line} vertical={false} />
                  <XAxis dataKey="day" stroke={PAL.muted} fontSize={10} interval={3} />
                  <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                  <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(d) => `Ngày ${d}`} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                  {cmp.partial && <ReferenceLine x={Number(cmp.curEnd.slice(8))} stroke={PAL.muted} strokeDasharray="3 3" />}
                  <Line type="monotone" dataKey="prev" name={`Tháng ${prevMonth.slice(5)}`} stroke={PAL.blue} strokeWidth={2} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="cur" name={`Tháng ${month.slice(5)}`} stroke={PAL.gold} strokeWidth={2} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend items={[[`Tháng ${prevMonth.slice(5)}`, PAL.blue], [`Tháng ${month.slice(5)}`, PAL.gold]]} />
          </Panel>
          <Panel
                  title="Target GMV vs GMV — 4 tháng gần nhất"
                  icon={<BarChart3 className="w-4 h-4" />}
                  sub="Target GMV: tổng target đã lên lịch (Lịch Vận Hành) · GMV: LIVE GMV thực đạt"
                >
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trend}>
                        <CartesianGrid stroke={PAL.line} vertical={false} />
                        <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                        <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                        <Bar dataKey="kpiTarget" name="Target (Lịch Vận Hành)" fill={`${PAL.gold}33`} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="actual" name="GMV" fill={PAL.gold} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
        </section>

        {/* ===== 3. Toàn shop & kênh ===== */}
        <section id="mr-shop" className="space-y-4 scroll-mt-16">
          <SectionHead no="3" title="Sales Channel" sub="Shop Analytics: Seller LIVE + Affiliate LIVE + Video, cộng Product card (file Sản Phẩm) ≈ 100% Total GMV" />
          {insightBox("shop")}
          <SectionDetail open={detailOpen("shop")} onOpen={() => openDetail("shop")}>
          {channelMixes.every((c) => !c) ? (
            <p className="text-sm py-4" style={{ color: PAL.muted }}>Chưa có file Shop Analytics cho các tháng này ở Dữ Liệu Gốc.</p>
          ) : (
            <>
              <Panel title="Cơ cấu Total GMV theo kênh" icon={<PieChartIcon className="w-4 h-4" />} sub="4 tháng gần nhất — tỷ trọng trên tổng shop">
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelChartData} layout="vertical" stackOffset="expand" margin={{ left: 4, right: 12 }}>
                      <CartesianGrid stroke={PAL.line} horizontal={false} />
                      <XAxis type="number" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                      <YAxis type="category" dataKey="label" stroke={PAL.muted} fontSize={11} width={52} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                      {CHANNELS.map((c) => (
                        <Bar key={c.key} dataKey={c.key} name={c.label} stackId="ch" fill={c.color} stroke={PAL.panel} strokeWidth={2} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ChartLegend items={CHANNELS.map((c) => [c.label, c.color])} />
              </Panel>
              <Panel title="Chi tiết theo tháng" icon={<ListOrdered className="w-4 h-4" />} sub={cmp.partial ? `Tháng ${month.slice(5)} tính tới ${cmp.curEnd.slice(8)}/${month.slice(5)}` : undefined}>
                <ReportTable head={["Tháng", "Total GMV", "LIVE GMV (agency)", "Tỷ trọng agency", "Affiliate LIVE", "Video", "Product card", "Refund rate"]}>
                  {channelMixes.map((c, idx) => {
                    const m = last4Months[idx];
                    const agencyLive = monthlyStats[idx].stats.gmv;
                    return (
                      <tr key={m} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                        <td className="py-2 px-3 font-semibold" style={{ color: PAL.cream }}>{m.slice(5)}/{m.slice(2, 4)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{c ? formatCurrencyAdaptive(c.shopGmv) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{agencyLive > 0 ? formatCurrencyAdaptive(agencyLive) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.gold }}>{c && agencyLive > 0 ? fmtPct((agencyLive / c.shopGmv) * 100) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c ? formatCurrencyAdaptive(c.affiliate) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c ? formatCurrencyAdaptive(c.video) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c?.card != null ? formatCurrencyAdaptive(c.card) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c?.refundRate != null ? fmtPct(c.refundRate) : "—"}</td>
                      </tr>
                    );
                  })}
                </ReportTable>
                <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                  LIVE GMV (agency) = tổng các ca có số trong app; Affiliate LIVE = GMV từ LIVE của creator affiliate (Shop Analytics). Refund rate = Refunds ÷ GMV,
                  của cả shop trong kỳ (tính theo ngày hoàn, không theo đơn của từng ca).
                  {canManage && channelMixes.some((c) => c?.coverage != null && Math.abs(c.coverage - 100) > 2) && " Có tháng 4 kênh lệch tổng shop quá 2% — kiểm lại file Sản Phẩm / Shop Analytics của tháng đó."}
                </p>
              </Panel>
            </>
          )}
          </SectionDetail>
        </section>

        {/* ===== 4. Vì sao ===== */}
        <section id="mr-why" className="space-y-4 scroll-mt-16">
          <SectionHead no="4" title="Key Metrics — vì sao tăng / giảm" sub={`LIVE GMV tách theo 2 góc: traffic (Giờ live × Views/giờ × GMV/View) và đơn hàng (Orders × UPT × Avg. price) · ${cmp.label}`} />
          {insightBox("why")}
          <SectionDetail open={detailOpen("why")} onOpen={() => openDetail("why")}>
          {drivers || basket ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {drivers && <WaterfallPanel title="Góc traffic" sub="Giờ live × Views/giờ × GMV/View — 3 phần cộng đúng mức thay đổi" data={waterfallData} breakdown={drivers} />}
              {basket && (
                <WaterfallPanel
                  title="Góc đơn hàng"
                  sub="Orders × UPT × Avg. price — 3 phần cộng đúng mức thay đổi"
                  data={basketWaterfall}
                  breakdown={basket}
                  note={(() => {
                    const v = basket.parts.filter((p) => p.key !== "orders").reduce((a, p) => a + p.value, 0);
                    return `UPT + Avg. price = AOV: ${v >= 0 ? "+" : "−"}${formatCurrencyAdaptive(Math.abs(v))}. Hai phần này thường ngược chiều — UPT giảm thì Avg. price tự tăng dù giá bán không đổi, nên đọc cùng nhau.`;
                  })()}
                />
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: PAL.muted }}>Chưa đủ số của cả 2 kỳ (Giờ live, Views, Orders, Items sold) để tách nguyên nhân.</p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {FUNNEL_TILES.map((t) => (
              <TrendTile key={t.key} label={t.label} points={monthlyStats.map((x) => ({ label: `${x.month.slice(5)}/${x.month.slice(2, 4)}`, value: t.get(x.stats) }))} format={t.format} goodWhenUp={t.goodWhenUp} />
            ))}
          </div>
          {signals.length > 0 && (
            <div className="rounded-xl p-3 space-y-1 text-[12px]" style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}>
              {signals.map((s) => (
                <div key={s.label} className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {s.label} {s.direction === "down" ? "giảm" : "tăng"} {s.streak} tháng liên tiếp ({s.totalChange >= 0 ? "+" : "−"}{fmtFixed(Math.abs(s.totalChange), 0)}%).
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Phễu Chuyển Đổi" icon={<Filter className="w-4 h-4" />} sub="LIVE impressions → Views → Product impressions → Product clicks → Orders">
                      <div style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={funnelStages} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid stroke={PAL.line} horizontal={false} />
                            <XAxis type="number" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtInt(v)} />
                            <YAxis type="category" dataKey="label" stroke={PAL.muted} fontSize={10} width={90} />
                            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtInt(chartNum(v))} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                              {funnelStages.map((_, i) => (
                                <Cell key={i} fill={[PAL.gold, PAL.goldDim, `${PAL.gold}88`, PAL.blue, PAL.green][i] ?? PAL.gold} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Panel>
            <Panel title="MoM Key Metrics" icon={<BarChart3 className="w-4 h-4" />} sub={cmp.partial ? `Cùng kỳ ${cmp.label}` : `So kỳ với ${prevMonth}`}>
                      <ReportTable head={["Metric", cmp.partial ? `1–${Number(cmp.prevEnd.slice(8))}/${prevMonth.slice(5)}` : prevMonth, cmp.partial ? `1–${Number(cmp.curEnd.slice(8))}/${month.slice(5)}` : "Tháng Này"]}>
                        {(
                          [
                            [METRIC.liveGmv, (a: CreatorLivePerfAgg) => formatCurrencyAdaptive(a.gmv)],
                            [METRIC.sessions, (a: CreatorLivePerfAgg) => fmtInt(a.sessionCount)],
                            [METRIC.itemsSold, (a: CreatorLivePerfAgg) => fmtInt(a.itemsSold)],
                            [METRIC.orders, (a: CreatorLivePerfAgg) => fmtInt(a.orders)],
                            [METRIC.liveHours, (a: CreatorLivePerfAgg) => fmtHours(a.hours)],
                            [METRIC.gmvPerHour, (a: CreatorLivePerfAgg) => formatCurrencyAdaptive(a.gmvPerHour ?? 0)],
                            [METRIC.upt, (a: CreatorLivePerfAgg) => (a.upt != null ? fmtFixed(a.upt, 2) : "—")],
                            [METRIC.avgPrice, (a: CreatorLivePerfAgg) => (a.avgPrice != null ? `${fmtInt(a.avgPrice / 1000)}k đ` : "—")],
                            [METRIC.aov, (a: CreatorLivePerfAgg) => (a.orders > 0 ? formatCurrencyAdaptive(a.gmv / a.orders) : "—")],
                            [METRIC.err, (a: CreatorLivePerfAgg) => fmtPct(a.err)],
                            [METRIC.liveCtr, (a: CreatorLivePerfAgg) => fmtPct(a.liveCtr)],
                            [METRIC.productCtr, (a: CreatorLivePerfAgg) => fmtPct(a.ctr)],
                            [METRIC.ctor, (a: CreatorLivePerfAgg) => fmtPct(a.ctor)]
                          ] as [string, (a: CreatorLivePerfAgg) => string][]
                        ).map(([label, get], idx) => (
                          <tr key={label} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                            <td className="py-2 px-3 font-semibold" style={{ color: PAL.cream }} title={metricHint(label)}>
                              {label}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {get(prevAggWindow)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                              {get(currentAgg)}
                            </td>
                          </tr>
                        ))}
                      </ReportTable>
                    </Panel>
          </div>
          </SectionDetail>
        </section>

        {/* ===== 5. Người ===== */}
        <section id="mr-people" className="space-y-4 scroll-mt-16">
          <SectionHead no="5" title="Host Performance" sub="Cùng cách tính với Hiệu Suất Host của agency · So mặt bằng = GMV/giờ của host so với mặt bằng nhóm ở đúng các ngày Daily/Campaign host đó live" />
          {insightBox("people")}
          <SectionDetail open={detailOpen("people")} onOpen={() => openDetail("people")}>
          <Panel title="Host PFM Overview" icon={<Users className="w-4 h-4" />} sub="Cùng cách tính với tab Hiệu Suất Host của agency — giờ live thật khi có file, ca không có số không tính">
                  {canManage && hostQuality.reconciled < hostQuality.total && (
                    <div
                      className="flex items-start gap-2 text-[11px] rounded-xl p-2.5 mb-3"
                      style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {hostQuality.total} phiên: {hostQuality.reconciled} đã đối soát
                        {hostQuality.snapshot > 0 ? `, ${hostQuality.snapshot} số lúc giao ca (chờ đối soát cuối kỳ)` : ""}
                        {hostQuality.manual > 0 ? `, ${hostQuality.manual} talent tự khai (chưa có gì bảo chứng)` : ""}.
                        {" "}Đối soát ở "Vận Hành Live → Đối Soát Số Liệu" trước khi phát hành report.
                      </span>
                    </div>
                  )}
                  {unassignedHost && !canManage && (
                    <p className="text-[11px] mb-3" style={{ color: PAL.muted }}>
                      {unassignedHost.sessionCount} ca ({formatCurrencyAdaptive(unassignedHost.gmv)}) chưa ghi nhận host nên không nằm trong bảng.
                    </p>
                  )}
                  {unassignedHost && canManage && (
                    <div
                      className="flex items-start gap-2 text-[11px] rounded-xl p-2.5 mb-3"
                      style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {unassignedHost.sessionCount} ca chưa gán host ({formatCurrencyAdaptive(unassignedHost.gmv)} ·{" "}
                        {fmtFixed(unassignedHost.hours, 1)}h) không nằm trong bảng/biểu đồ này — gán host cho ca để số về đúng người.
                      </span>
                    </div>
                  )}
                  <ReportTable head={["Host", "Sessions", "GMV", "Giờ live", "GMV/giờ", "So mặt bằng", "Orders", "Product CTR"]}>
                    {hostPerformance.map((h, idx) => (
                      <tr key={h.key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                        <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>
                          {h.hostName}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {h.sessionCount}
                          {h.quality.reconciled < h.sessionCount ? ` (${h.quality.reconciled} đã đối soát)` : ""}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                          {formatCurrencyAdaptive(h.gmv)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {fmtHours(h.hours)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {h.gmvPerHour != null ? formatCurrencyAdaptive(h.gmvPerHour) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {(() => {
                            const v = hostInsight.vsPeer.get(h.key);
                            return v == null ? <span style={{ color: PAL.muted }}>—</span> : <span style={{ color: v >= 0 ? PAL.green : PAL.red }}>{v >= 0 ? "+" : "−"}{fmtFixed(Math.abs(v), 0)}%</span>;
                          })()}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {fmtInt(h.orders)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {fmtPct(h.ctr)}
                        </td>
                      </tr>
                    ))}
                    {hostPerformance.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center italic" style={{ color: PAL.muted }}>
                          Chưa có phiên TikTok nào có số liệu trong tháng.
                        </td>
                      </tr>
                    )}
                  </ReportTable>
                </Panel>
          <Panel
            title="Host Theo Loại Ngày"
            icon={<CalendarDays className="w-4 h-4" />}
            sub="Campaign = D-Day, Mid-Month, Pay Day. GMV của ca tính trọn cho host; trợ live không nhận GMV, chỉ ghi giờ trợ live (không cộng vào giờ host)"
          >
            {snapshot.version < 3 && canManage && (
              <div className="flex items-start gap-2 text-[11px] rounded-xl p-2.5 mb-3" style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Số liệu này chốt trước khi report lưu trợ live — cột "Giờ Trợ Live" đang trống. Bấm "Cập nhật số liệu" ở trên để có.
              </div>
            )}
            <ReportTable head={["Host", "GMV Daily", "Giờ live", "GMV/giờ", "GMV Campaign", "Giờ live", "GMV/giờ", "Giờ trợ live"]}>
              {hostDayType.map((h, idx) => {
                const cells = (p: { sessions: number; gmv: number; hours: number }) =>
                  p.sessions === 0
                    ? [<td key="g" className="py-2 px-3 text-right" style={{ color: PAL.muted }}>—</td>, <td key="h" />, <td key="r" />]
                    : [
                        <td key="g" className="py-2 px-3 text-right font-mono whitespace-nowrap font-bold" style={{ color: PAL.cream }}>
                          {formatCurrencyAdaptive(p.gmv)}
                        </td>,
                        <td key="h" className="py-2 px-3 text-right font-mono whitespace-nowrap" style={{ color: PAL.muted }}>
                          {fmtHours(p.hours)} · {p.sessions} ca
                        </td>,
                        <td key="r" className="py-2 px-3 text-right font-mono whitespace-nowrap" style={{ color: PAL.muted }}>
                          {p.hours > 0 ? formatCurrencyAdaptive(p.gmv / p.hours) : "—"}
                        </td>
                      ];
                return (
                  <tr key={h.key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                    <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>
                      {h.name}
                    </td>
                    {cells(h.daily)}
                    {cells(h.camp)}
                    <td className="py-2 px-3 text-right font-mono whitespace-nowrap" style={{ color: PAL.muted }}>
                      {h.assist.sessions > 0 ? `${fmtHours(h.assist.hours)} · ${h.assist.sessions} ca` : "—"}
                    </td>
                  </tr>
                );
              })}
              {hostDayType.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center italic" style={{ color: PAL.muted }}>
                    Chưa có phiên TikTok nào có số liệu trong tháng.
                  </td>
                </tr>
              )}
            </ReportTable>
          </Panel>
          </SectionDetail>
        </section>

        {/* ===== 6. Hàng ===== */}
        <section id="mr-products" className="space-y-4 scroll-mt-16">
          <SectionHead no="6" title="Sản phẩm" sub="Top SKU theo GMV, phần bán qua Seller LIVE, khuyến mãi chạy trong tháng" />
          {insightBox("products")}
          <SectionDetail open={detailOpen("products")} onOpen={() => openDetail("products")}>
          <Panel
            title="Top SKU theo GMV"
            icon={<ShoppingBag className="w-4 h-4" />}
            sub={
              skuMoveData
                ? `Nguồn: file Sản Phẩm${skuMoveData.curDays ? ` (${skuMoveData.curDays} ngày)` : ""} · hạng so với tháng ${prevMonth.slice(5)}${skuMoveData.perDay ? ` (${skuMoveData.prevDays} ngày) — % GMV tính trên GMV mỗi ngày vì 2 file phủ số ngày khác nhau` : ""} · Product CTR/CTOR là phễu tổng của sản phẩm (mọi kênh)`
                : "Nguồn: file Sản Phẩm — Seller LIVE GMV = GMV bán qua LIVE của tài khoản shop"
            }
          >
            {!topSku?.hasAnyBatch ? (
              <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                Chưa có file "Product List" nào được import trong Dữ Liệu Gốc cho tháng này.
              </p>
            ) : skuMoveData ? (
              <ReportTable head={["Hạng", "Sản phẩm", "GMV", skuMoveData.perDay ? "± GMV/ngày" : "± GMV", "Tỷ trọng Seller LIVE", "Orders", "Items sold", "Product CTR", "CTOR"]}>
                {skuMoveData.rows.map((r, idx) => {
                  const moved = r.prevRank == null ? null : r.prevRank - r.rank;
                  return (
                    <tr key={r.name} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                      <td className="py-2 px-3 font-mono whitespace-nowrap" style={{ color: PAL.gold }}>
                        {r.rank}
                        <span className="ml-1.5 text-[11px]" style={{ color: moved == null ? PAL.muted : moved > 0 ? PAL.green : moved < 0 ? PAL.red : PAL.muted }}>
                          {r.prevRank == null
                            ? skuMoveData.prevLimit != null
                              ? `(ngoài top ${skuMoveData.prevLimit})`
                              : ""
                            : moved === 0
                              ? "(=)"
                              : `(${r.prevRank} ${moved! > 0 ? "▲" : "▼"})`}
                        </span>
                      </td>
                      <td className="py-2 px-3" style={{ color: PAL.cream }}>
                        {r.name}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                        {formatCurrencyAdaptive(r.gmv)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: r.gmvChange == null ? PAL.muted : r.gmvChange >= 0 ? PAL.green : PAL.red }}>
                        {r.gmvChange == null ? "—" : `${r.gmvChange >= 0 ? "+" : "−"}${fmtFixed(Math.abs(r.gmvChange), 1)}%`}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {r.gmv > 0 ? fmtPct((r.gmvLive / r.gmv) * 100) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {fmtInt(r.orders)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {r.itemsSold != null ? fmtInt(r.itemsSold) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {fmtPct(r.ctr)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {fmtPct(r.ctor)}
                      </td>
                    </tr>
                  );
                })}
              </ReportTable>
            ) : (
              <div className="space-y-2">
                {canManage && (
                  <p className="text-[11px]" style={{ color: PAL.gold }}>
                    Bấm "Cập nhật số liệu" để có hạng so với tháng trước và phễu từng SKU.
                  </p>
                )}
                <ReportTable head={["#", "Sản phẩm", "GMV", "Seller LIVE GMV", "Tỷ trọng Seller LIVE", "Orders"]}>
                  {(topSku.items ?? []).map((s, idx) => (
                    <tr key={s.name} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                      <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3" style={{ color: PAL.cream }}>
                        {s.name}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                        {formatCurrencyAdaptive(s.gmv)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {formatCurrencyAdaptive(s.gmvLive)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {s.gmv > 0 ? fmtPct((s.gmvLive / s.gmv) * 100) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {fmtInt(s.orders)}
                      </td>
                    </tr>
                  ))}
                </ReportTable>
              </div>
            )}
          </Panel>
          <Panel
                  title="Top Chương Trình Khuyến Mãi"
                  icon={<Megaphone className="w-4 h-4" />}
                  sub={`Nguồn: Shop Promotion List — chỉ xếp hạng chương trình chạy TRỌN trong tháng${topPromo?.excludedMultiMonth ? ` (đã loại ${topPromo.excludedMultiMonth} chương trình vắt qua tháng khác)` : ""}`}
                >
                  {!topPromo?.hasAnyBatch ? (
                    <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                      Chưa có file "Shop Promotion List" nào được import trong Dữ Liệu Gốc cho tháng này.
                    </p>
                  ) : topPromo.items.length === 0 ? (
                    <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                      Không có chương trình nào chạy trọn trong tháng này. Chương trình vắt qua nhiều tháng bị loại vì
                      cột GMV trong file TikTok là luỹ kế cả chương trình, không tách được phần thuộc tháng.
                    </p>
                  ) : (
                    <ReportTable head={["#", "Chương trình", "Trạng thái", "GMV", "Orders", "AOV"]}>
                      {(topPromo.items ?? []).map((p, idx) => (
                        <tr key={p.name + idx} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                          <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3" style={{ color: PAL.cream }}>
                            {p.name}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span
                              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${promoStatusLabel(p.status).color}22`, color: promoStatusLabel(p.status).color }}
                            >
                              {promoStatusLabel(p.status).label}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                            {formatCurrencyAdaptive(p.gmv)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                            {fmtInt(p.orders)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                            {formatCurrencyAdaptive(p.aov)}
                          </td>
                        </tr>
                      ))}
                    </ReportTable>
                  )}
                </Panel>
          </SectionDetail>
        </section>

        {/* ===== 7. Bối cảnh ===== */}
        <section id="mr-context" className="space-y-4 scroll-mt-16">
          <SectionHead no="7" title="Campaign & khung giờ" sub="Ngày Campaign, khung giờ, diễn biến theo ngày, phiên nổi bật" />
          {insightBox("context")}
          <SectionDetail open={detailOpen("context")} onOpen={() => openDetail("context")}>
          <Panel
            title="Campaign — so với cùng khung tháng trước"
            icon={<Flame className="w-4 h-4" />}
            sub={`GMV tính từ ca · Target GMV: ${campTargetSource} · ${cmp.label} · mỗi tháng dùng khoảng ngày Campaign của chính tháng đó`}
          >
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={campTargetVsActualData}>
                  <CartesianGrid stroke={PAL.line} vertical={false} />
                  <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                  <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                  <Legend wrapperStyle={{ fontSize: 11, color: PAL.muted }} />
                  <Bar dataKey="prev" name={prevColLabel} fill={PAL.line} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill={`${PAL.gold}2e`} stroke={PAL.gold} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name={curColLabel} fill={PAL.gold} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ReportTable head={["Khung", "Target GMV", "GMV", "% Target", prevColLabel, "± GMV", "GMV/giờ", "± GMV/giờ", "UPT", "CTOR"]}>
              {campDetailRows.map((r, idx) => {
                const none = r.cur.sessions === 0;
                const gChg = none ? null : pctChange(r.prev.gmv, r.cur.gmv);
                const hChg = none ? null : pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour);
                const chg = (v: number | null) =>
                  v == null ? <span style={{ color: PAL.muted }}>—</span> : <span style={{ color: v >= 0 ? PAL.green : PAL.red }}>{v >= 0 ? "+" : "−"}{fmtFixed(Math.abs(v), 1)}%</span>;
                return (
                  <tr key={r.key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                    <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>
                      {r.label}
                    </td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                      {r.target != null ? formatCurrencyAdaptive(r.target) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                      {none ? <span style={{ color: PAL.muted, fontWeight: 400 }}>chưa có ca</span> : formatCurrencyAdaptive(r.cur.gmv)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>
                      {!none && r.target ? fmtPct((r.cur.gmv / r.target) * 100) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                      {r.prev.sessions > 0 ? formatCurrencyAdaptive(r.prev.gmv) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{chg(gChg)}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                      {r.cur.gmvPerHour != null ? formatCurrencyAdaptive(r.cur.gmvPerHour) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{chg(hChg)}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                      {r.cur.upt != null ? fmtFixed(r.cur.upt, 2) : "—"}
                      {r.cur.upt != null && r.prev.upt != null && <span className="ml-1 text-[11px]">({fmtFixed(r.prev.upt, 2)})</span>}
                    </td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                      {fmtPct(r.cur.ctor)}
                    </td>
                  </tr>
                );
              })}
            </ReportTable>
          </Panel>
          <Panel title="Khung giờ bắt đầu ca" icon={<CalendarClock className="w-4 h-4" />} sub={`GMV/giờ · ${cmp.label}`}>
            <ReportTable head={["Khung giờ", "Sessions (trước → nay)", "GMV/giờ kỳ trước", "GMV/giờ kỳ này", "Thay đổi"]}>
              {slotRows.map((r, idx) => {
                const chg = pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour);
                return (
                  <tr key={r.key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                    <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{r.label}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.prev.n} → {r.cur.n}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.prev.gmvPerHour != null ? formatCurrencyAdaptive(r.prev.gmvPerHour) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{r.cur.gmvPerHour != null ? formatCurrencyAdaptive(r.cur.gmvPerHour) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: chg == null ? PAL.muted : chg >= 0 ? PAL.green : PAL.red }}>{chg == null ? "—" : `${chg >= 0 ? "+" : "−"}${fmtFixed(Math.abs(chg), 1)}%`}</td>
                  </tr>
                );
              })}
            </ReportTable>
          </Panel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="GMV/giờ — 4 tháng" icon={<BarChart3 className="w-4 h-4" />}>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gmvHourTrend}>
                    <CartesianGrid stroke={PAL.line} vertical={false} />
                    <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                    <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                    <Bar dataKey="gmvPerHour" name="GMV/giờ" fill={PAL.gold} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Giờ live — 4 tháng" icon={<BarChart3 className="w-4 h-4" />} sub={cmp.partial ? `Tháng ${month.slice(5)} tính tới ${cmp.curEnd.slice(8)}/${month.slice(5)}` : undefined}>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gmvHourTrend}>
                    <CartesianGrid stroke={PAL.line} vertical={false} />
                    <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                    <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtHours(v)} width={50} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtHours(chartNum(v))} />
                    <Bar dataKey="hours" name="Giờ live" fill={PAL.blue} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
          {dailyPerf?.hasAnyBatch && dailyChartData.length > 0 && (
                      <Panel title="GMV theo ngày" icon={<BarChart3 className="w-4 h-4" />} sub="Nguồn: Live Performance Core Stats">
                        <div style={{ height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={dailyChartData}>
                              <CartesianGrid stroke={PAL.line} vertical={false} />
                              <XAxis dataKey="label" stroke={PAL.muted} fontSize={10} interval={2} />
                              <YAxis yAxisId="gmv" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                              <Area
                                yAxisId="gmv"
                                type="monotone"
                                dataKey="gmvLiveSession"
                                name="Direct GMV"
                                stroke={PAL.gold}
                                fill={`${PAL.gold}33`}
                                strokeWidth={2}
                              />
                              <Line
                                yAxisId="gmv"
                                type="monotone"
                                dataKey="gmvIndirect"
                                name="Indirect GMV"
                                stroke={PAL.blue}
                                strokeWidth={2}
                                strokeDasharray="4 3"
                                dot={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </Panel>
                    )}
          <Panel title="Top 10 phiên live theo GMV" icon={<ListOrdered className="w-4 h-4" />} sub={liveSource.source === "sessions" ? "Nguồn: ca có số trong app" : "Nguồn: file Creator Live Performance"}>
                      <ReportTable head={["#", "Bắt đầu", "Giờ live", "GMV", "GMV/giờ", "Orders", "Items sold", "Views", "Product CTR", "CTOR"]}>
                        {topSessions.map((s, idx) => (
                          <tr key={s.roomId ?? idx} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                            <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono" style={{ color: PAL.cream }}>
                              {fmtSessionStart(s.startTime)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtHours(s.hours)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                              {formatCurrencyAdaptive(s.gmv)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {formatCurrencyAdaptive(s.gmvPerHour)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtInt(s.orders)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtInt(s.itemsSold)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtInt(s.views)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtPct(s.ctr)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtPct(s.ctor)}
                            </td>
                          </tr>
                        ))}
                        {topSessions.length === 0 && (
                          <tr>
                            <td colSpan={10} className="py-6 text-center italic" style={{ color: PAL.muted }}>
                              Chưa có phiên live nào trong tháng.
                            </td>
                          </tr>
                        )}
                      </ReportTable>
                    </Panel>
          </SectionDetail>
        </section>

        {/* ===== 8. Tháng sau ===== */}
        <section id="mr-next" className="space-y-4 scroll-mt-16">
          <SectionHead no="8" title="Target Plan tháng sau" sub={`Kế hoạch tháng ${nextMonth.slice(5)} lấy từ Kế Hoạch Tháng`} />
          <SectionDetail open={detailOpen("next")} onOpen={() => openDetail("next")}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiTile label={`Target GMV tháng ${nextMonth.slice(5)}`} value={nextPlan && nextPlan.targetGmv > 0 ? formatCurrencyAdaptive(nextPlan.targetGmv) : "—"} note={nextPlan ? (nextPlan.status === "locked" ? "đã chốt" : "đang lên lịch") : "chưa lập kế hoạch"} />
            <KpiTile label="Sessions kế hoạch" value={nextPlan ? String(nextPlan.slotCount) : "—"} note={nextPlan ? "trong Kế Hoạch Tháng" : ""} />
            {nextPlanFull && nextPlanFull.plan.shopTargetGmv > 0 && (
              <KpiTile
                label={`KPI GMV tháng ${nextMonth.slice(5)}`}
                value={formatCurrencyAdaptive(nextPlanFull.plan.shopTargetGmv)}
                note={nextPlan && nextPlan.targetGmv > 0 ? `Target GMV live = ${fmtPct((nextPlan.targetGmv / nextPlanFull.plan.shopTargetGmv) * 100)} KPI GMV` : "brand giao · mọi kênh"}
              />
            )}
          </div>
          {nextAllocation && (
            <Panel
              title={`Phân bổ target tháng ${nextMonth.slice(5)} theo khung`}
              icon={<Flame className="w-4 h-4" />}
              sub={`Cộng từ ca trong Kế Hoạch Tháng ${nextMonth.slice(5)} · so GMV/giờ cần đạt với GMV/giờ thực đạt cùng khung tháng ${month.slice(5)}`}
            >
              <ReportTable head={["Khung", "Phân bổ (%)", "Target GMV", "Sessions", "Giờ live", "GMV/giờ cần", `GMV/giờ T${Number(month.slice(5))}`, "Cần tăng"]}>
                {nextAllocation.map((a, idx) => {
                  const actual = campDetailRows.find((r) => r.key === a.key)?.cur.gmvPerHour ?? null;
                  const gap = a.requiredGmvPerHour != null && actual != null && actual > 0 ? ((a.requiredGmvPerHour - actual) / actual) * 100 : null;
                  return (
                    <tr key={a.key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                      <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>
                        {CAMP_DAY_BUCKET_LABEL[a.key]}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>
                        {fmtPct(a.share)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                        {a.target > 0 ? formatCurrencyAdaptive(a.target) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {a.slots}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {fmtHours(a.hours)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>
                        {a.requiredGmvPerHour != null ? formatCurrencyAdaptive(a.requiredGmvPerHour) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                        {actual != null ? formatCurrencyAdaptive(actual) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: gap == null ? PAL.muted : gap > 10 ? PAL.red : gap > 0 ? PAL.gold : PAL.green }}>
                        {gap == null ? "—" : `${gap >= 0 ? "+" : "−"}${fmtFixed(Math.abs(gap), 0)}%`}
                      </td>
                    </tr>
                  );
                })}
              </ReportTable>
              <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                "Cần tăng" = GMV/giờ phải đạt so với GMV/giờ thực đạt cùng khung tháng này{cmp.partial ? ` (tính tới ${Number(cmp.curEnd.slice(8))}/${month.slice(5)})` : ""}. Đỏ: cần tăng hơn 10%.
              </p>
            </Panel>
          )}
          <div className="rounded-xl p-4" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
            <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: PAL.muted }}>Việc agency làm tháng sau</div>
            <ul className="space-y-2 text-[13.5px] leading-relaxed list-disc pl-5" style={{ color: PAL.cream }}>
              {nextLines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
          {agencyNotes.length > 0 && (
            <div className="rounded-xl p-4 space-y-2" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
              <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>Ghi chú của agency</div>
              {agencyNotes.map(([label, text]) => (
                <p key={label} className="text-[13px] whitespace-pre-line" style={{ color: PAL.cream }}>
                  <b style={{ color: PAL.gold }}>{label}:</b> {text}
                </p>
              ))}
            </div>
          )}
          </SectionDetail>
        </section>

        {/* ===== Phụ lục ===== */}
        <section id="mr-appendix" className="space-y-4 scroll-mt-16">
          <SectionHead no="—" title="Phụ lục" sub="Chi tiết creator affiliate (nhập tay)" />
          <SectionDetail open={detailOpen("appendix")} onOpen={() => openDetail("appendix")}>
          {(canManage || affiliateRows.length > 0) && (
            <div className="space-y-4">
                <div
                  className="flex items-start gap-2 text-[11px] rounded-xl p-2.5"
                  style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Bảng này tổng hợp theo CREATOR/THÁNG và nhập tay hoàn toàn. Số chi tiết theo TỪNG PHIÊN LIVE (đọc tự
                  động từ file "Live Analysis") nằm ở trang <b>Affiliate</b> ngoài menu trái — hai nơi dùng chung một bảng dữ
                  liệu. % Target/ROAS tự tính từ Direct GMV so với Target GMV/Ads cost.
                </div>

                {affiliateLoading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-sm" style={{ color: PAL.muted }}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải Affiliate...
                  </div>
                ) : (
                  <>
                    {affiliateErrorMsg && (
                      <div className="p-3 rounded-xl text-xs font-semibold" style={{ background: "#2a1414", border: `1px solid ${PAL.red}55`, color: PAL.red }}>
                        {affiliateErrorMsg}
                      </div>
                    )}

                    <Panel title="Performance Creator Affiliate" icon={<Handshake className="w-4 h-4" />} sub={`Tháng ${month} — nhập tay; số theo PHIÊN xem ở trang Affiliate`}>
                      <div className="space-y-3">
                        {affiliateRows.map((a) => {
                          const roas = roasOf(a.directGmv, a.adsCost);
                          const runrate = runrateOf(a.directGmv, a.targetGmv);
                          const field = (
                            key: keyof AffiliateActualEntry,
                            label: string,
                            type: "text" | "number" = "number",
                            placeholder?: string
                          ) => (
                            <div>
                              <label className="text-[11px] uppercase tracking-wider block mb-1" style={{ color: PAL.muted }}>
                                {label}
                              </label>
                              <input
                                type={type}
                                value={(a[key] as string | number) ?? ""}
                                placeholder={placeholder}
                                onChange={(e) =>
                                  updateAffiliateRow(a._key, { [key]: type === "number" ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value })
                                }
                                disabled={!canManage}
                                className="w-full p-2 rounded-lg text-xs font-mono disabled:opacity-60"
                                style={{ background: PAL.panel, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                              />
                            </div>
                          );
                          return (
                            <div key={a._key} className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                                <input
                                  type="text"
                                  value={a.creatorName}
                                  placeholder="Tên creator"
                                  onChange={(e) => updateAffiliateRow(a._key, { creatorName: e.target.value })}
                                  disabled={!canManage}
                                  className="font-black text-sm bg-transparent border-none outline-none disabled:opacity-60"
                                  style={{ color: PAL.gold, minWidth: 140 }}
                                />
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: runrate != null && runrate >= 100 ? `${PAL.green}22` : `${PAL.red}22`, color: runrate != null && runrate >= 100 ? PAL.green : PAL.red }}
                                  >
                                    % Target {runrate != null ? `${fmtFixed(runrate, 2)}%` : "—"}
                                  </span>
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${PAL.blue}22`, color: PAL.blue }}>
                                    ROAS {fmtRoas(roas)}
                                  </span>
                                  {canManage && (
                                    <button onClick={() => removeAffiliateRow(a._key)} style={{ color: PAL.red }} title="Xoá creator">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {field("liveDateLabel", "Ngày live", "text", "06-07/8")}
                                {field("targetGmv", "Target GMV")}
                                {field("directGmv", "Direct GMV")}
                                {field("durationHours", "Giờ live")}
                                {field("adsCost", "Ads cost")}
                                {field("itemsSold", "Items sold")}
                                {field("viewer", "Viewers")}
                                {field("avgPrice", "Avg. price")}
                                {field("ctr", "LIVE CTR (%)")}
                                {field("ctor", "CTOR (%)")}
                              </div>
                            </div>
                          );
                        })}
                        {affiliateRows.length === 0 && (
                          <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                            Chưa có creator affiliate nào cho tháng {month}.
                          </p>
                        )}
                      </div>
                      {canManage && (
                        <button
                          onClick={addAffiliateRow}
                          className="mt-3 flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                          style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.gold }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm Creator
                        </button>
                      )}
                    </Panel>

                    {affiliateChartData.length > 0 && (
                      <Panel title="So sánh hiệu suất creator" icon={<BarChart3 className="w-4 h-4" />} sub="GMV/giờ vs % Target">
                        <div style={{ height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={affiliateChartData}>
                              <CartesianGrid stroke={PAL.line} vertical={false} />
                              <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                              <YAxis yAxisId="gmvHour" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                              <YAxis yAxisId="runrate" orientation="right" stroke={PAL.green} fontSize={10} tickFormatter={(v) => `${fmtFixed(v, 0)}%`} width={50} />
                              <Tooltip contentStyle={chartTooltipStyle} />
                              <Bar yAxisId="gmvHour" dataKey="gmvHour" name="GMV/giờ" fill={PAL.gold} radius={[3, 3, 0, 0]} />
                              <Line yAxisId="runrate" type="monotone" dataKey="runrate" name="% Target" stroke={PAL.green} strokeWidth={2} dot={{ r: 3 }} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </Panel>
                    )}

                    {canManage && (
                      <div className="flex justify-end">
                        <button
                          onClick={handleSaveAffiliate}
                          disabled={affiliateSaving}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
                          style={{ background: PAL.gold, color: "#1a1500" }}
                        >
                          <Save className="w-4 h-4" /> {affiliateSaving ? "Đang Lưu..." : "Lưu Affiliate"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
          )}
          {canManage && (
            <details className="rounded-xl" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
              <summary className="cursor-pointer px-4 py-3 text-xs font-bold" style={{ color: PAL.gold }}>
                Công cụ nhập liệu (chỉ ops, brand không thấy) — khung camp, kế hoạch phân bổ &amp; affiliate tháng sau
              </summary>
              <div className="p-4 space-y-4">
                <Panel title="Khung camp tháng này" icon={<Flame className="w-4 h-4" />} sub="Ghi đè khoảng ngày D-Day / Mid-Month / Pay Day + target từng khung cho phần 7">
                  {canManage && (
                        <div className="mb-4 space-y-2.5 pb-4" style={{ borderBottom: `1px solid ${PAL.line}` }}>
                          {(
                            [
                              ["D-Day", campDdayStartInput, setCampDdayStartInput, campDdayEndInput, setCampDdayEndInput, campDdayTargetInput, setCampDdayTargetInput],
                              [
                                "Mid-Month",
                                campMidmonthStartInput,
                                setCampMidmonthStartInput,
                                campMidmonthEndInput,
                                setCampMidmonthEndInput,
                                campMidmonthTargetInput,
                                setCampMidmonthTargetInput
                              ],
                              [
                                "Pay Day",
                                campPaydayStartInput,
                                setCampPaydayStartInput,
                                campPaydayEndInput,
                                setCampPaydayEndInput,
                                campPaydayTargetInput,
                                setCampPaydayTargetInput
                              ]
                            ] as [string, string, (v: string) => void, string, (v: string) => void, string, (v: string) => void][]
                          ).map(([label, startVal, setStart, endVal, setEnd, targetVal, setTarget]) => (
                            <div key={label} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                              <span className="text-xs font-bold" style={{ color: PAL.cream }}>
                                {label}
                              </span>
                              <input
                                type="date"
                                value={startVal}
                                onChange={(e) => setStart(e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-mono"
                                style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                              />
                              <input
                                type="date"
                                value={endVal}
                                onChange={(e) => setEnd(e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-mono"
                                style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                              />
                              <input
                                type="number"
                                value={targetVal}
                                onChange={(e) => setTarget(e.target.value)}
                                placeholder="Target GMV"
                                className="px-2.5 py-1.5 rounded-lg text-xs font-mono"
                                style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                              />
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={handleSaveCampConfig}
                              disabled={campSaving}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold"
                              style={{ background: PAL.gold, color: "#1a1500" }}
                            >
                              {campSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu Khung Camp
                            </button>
                            {campErrorMsg && (
                              <span className="text-xs font-semibold" style={{ color: PAL.red }}>
                                {campErrorMsg}
                              </span>
                            )}
                            <span className="text-[11px] italic" style={{ color: PAL.muted }}>
                              Để trống thì dùng khung mặc định (Mid-Month 13-15, Pay Day 23-25, D-Day theo ngày trùng lặp gần nhất). Đã nhập camp nào thì camp đó chỉ tính đúng khoảng nhập — khung mặc định của camp đó không còn áp dụng.
                            </span>
                          </div>
                        </div>
                      )}
                </Panel>
                <div className="space-y-4">
                <div
                  className="flex items-start gap-2 text-[11px] rounded-xl p-2.5"
                  style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Toàn bộ mục này là kế hoạch cho tháng {nextMonth} (chưa xảy ra) — nhập tay hoàn toàn, không đọc Dataraw/lịch
                  vận hành. % phân bổ đã điền sẵn theo tỷ trọng GMV thực đạt trung bình {suggestedPct.isFallback ? "(chưa có dữ liệu lịch sử, đang để mặc định chia đều 25%)" : "của 2 tháng gần nhất"} — sửa tự do trước khi lưu.
                </div>

                {planLoading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-sm" style={{ color: PAL.muted }}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải Kế hoạch tháng sau...
                  </div>
                ) : (
                  <>
                    {planErrorMsg && (
                      <div className="p-3 rounded-xl text-xs font-semibold" style={{ background: "#2a1414", border: `1px solid ${PAL.red}55`, color: PAL.red }}>
                        {planErrorMsg}
                      </div>
                    )}

                    <Panel title={`Kế Hoạch Phân Bổ Target — Tháng ${nextMonth}`} icon={<CalendarClock className="w-4 h-4" />}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1" style={{ color: PAL.muted }}>
                            Target GMV (LIVE)
                          </label>
                          <input
                            type="number"
                            value={planTargetGmv}
                            onChange={(e) => setPlanTargetGmv(e.target.value)}
                            disabled={!canManage}
                            className="w-full p-2.5 rounded-xl font-mono font-bold disabled:opacity-60"
                            style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1" style={{ color: PAL.muted }}>
                            Target NMV Tổng
                          </label>
                          <input
                            type="number"
                            value={planTargetNmv}
                            onChange={(e) => setPlanTargetNmv(e.target.value)}
                            disabled={!canManage}
                            className="w-full p-2.5 rounded-xl font-mono font-bold disabled:opacity-60"
                            style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1" style={{ color: PAL.muted }}>
                            Tổng Giờ Live Kế Hoạch
                          </label>
                          <input
                            type="number"
                            value={planTargetHours}
                            onChange={(e) => setPlanTargetHours(e.target.value)}
                            disabled={!canManage}
                            className="w-full p-2.5 rounded-xl font-mono font-bold disabled:opacity-60"
                            style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div style={{ height: 240 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={planDonutData} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                                {planDonutData.map((d) => (
                                  <Cell key={d.label} fill={d.color} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => `${fmtFixed(chartNum(v), 1)}%`} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <ReportTable head={["Khung", "Phân bổ (%)", "Target GMV", "Giờ live", "GMV/giờ"]}>
                            {planBucketRows.map((b, idx) => {
                              const setter = { daily: setPctDaily, dday: setPctDday, payday: setPctPayday, midmonth: setPctMidmonth }[b.key]!;
                              const value = { daily: pctDaily, dday: pctDday, payday: pctPayday, midmonth: pctMidmonth }[b.key]!;
                              return (
                                <tr key={b.key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                                  <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>
                                    {b.label}
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <input
                                      type="number"
                                      value={value}
                                      onChange={(e) => setter(e.target.value)}
                                      disabled={!canManage}
                                      className="w-16 text-right p-1 rounded font-mono disabled:opacity-60"
                                      style={{ background: PAL.panel, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                                    />
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                                    {formatCurrencyAdaptive(b.gmv)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                                    {fmtHours(b.hours)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                                    {b.gmvPerHour != null ? formatCurrencyAdaptive(b.gmvPerHour) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </ReportTable>
                          <p className="text-[11px] mt-2 text-right" style={{ color: Math.abs(planPctTotal - 100) > 0.5 ? PAL.red : PAL.muted }}>
                            Tổng phân bổ: {fmtFixed(planPctTotal, 1)}% {Math.abs(planPctTotal - 100) > 0.5 ? "(nên bằng 100%)" : ""}
                          </p>
                        </div>
                      </div>
                    </Panel>

                    <Panel title={`Kế Hoạch Affiliate — Tháng ${nextMonth}`} icon={<Handshake className="w-4 h-4" />}>
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-xs min-w-[760px]">
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
                              {["Lịch live", "Creator", "Camp", "Timeline", "Giờ live", "Target GMV", "GMV/giờ kỳ vọng", "Budget Ads", ""].map((h) => (
                                <th key={h} className="py-2 px-2 text-left text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {planRows.map((r, idx) => (
                              <tr key={r._key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                                {(
                                  [
                                    ["scheduleLabel", "text", "6-7.8"],
                                    ["creatorName", "text", "Tên creator"],
                                    ["campTag", "text", "D-Day"],
                                    ["timelineLabel", "text", "19h - 9h"]
                                  ] as [keyof AffiliatePlanEntry, string, string][]
                                ).map(([field, type, placeholder]) => (
                                  <td key={field} className="py-1.5 px-2">
                                    <input
                                      type={type}
                                      value={(r[field] as string) ?? ""}
                                      placeholder={placeholder}
                                      onChange={(e) => updatePlanRow(r._key, { [field]: e.target.value })}
                                      disabled={!canManage}
                                      className="w-full p-1.5 rounded font-medium disabled:opacity-60"
                                      style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                                    />
                                  </td>
                                ))}
                                {(
                                  [
                                    ["durationHours", "h"],
                                    ["targetGmv", "đ"]
                                  ] as [keyof AffiliatePlanEntry, string][]
                                ).map(([field]) => (
                                  <td key={field} className="py-1.5 px-2">
                                    <input
                                      type="number"
                                      value={(r[field] as number) ?? ""}
                                      onChange={(e) => updatePlanRow(r._key, { [field]: e.target.value ? Number(e.target.value) : undefined })}
                                      disabled={!canManage}
                                      className="w-24 text-right p-1.5 rounded font-mono disabled:opacity-60"
                                      style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                                    />
                                  </td>
                                ))}
                                <td className="py-1.5 px-2 text-right font-mono" style={{ color: PAL.muted }}>
                                  {r.targetGmv && r.durationHours ? formatCurrencyAdaptive(r.targetGmv / r.durationHours) : "—"}
                                </td>
                                {(
                                  [["budgetAds", "đ"]] as [keyof AffiliatePlanEntry, string][]
                                ).map(([field]) => (
                                  <td key={field} className="py-1.5 px-2">
                                    <input
                                      type="number"
                                      value={(r[field] as number) ?? ""}
                                      onChange={(e) => updatePlanRow(r._key, { [field]: e.target.value ? Number(e.target.value) : undefined })}
                                      disabled={!canManage}
                                      className="w-24 text-right p-1.5 rounded font-mono disabled:opacity-60"
                                      style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                                    />
                                  </td>
                                ))}
                                <td className="py-1.5 px-2">
                                  {canManage && (
                                    <button onClick={() => removePlanRow(r._key)} style={{ color: PAL.red }} title="Xoá dòng">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {planRows.length === 0 && (
                              <tr>
                                <td colSpan={9} className="py-6 text-center italic" style={{ color: PAL.muted }}>
                                  Chưa có kế hoạch Affiliate nào cho tháng {nextMonth}.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {planRows.length > 0 && (
                            <tfoot>
                              <tr style={{ borderTop: `1px solid ${PAL.line}` }}>
                                <td colSpan={5} className="py-2 px-2 font-bold text-right" style={{ color: PAL.cream }}>
                                  Tổng target tháng {nextMonth}
                                </td>
                                <td className="py-2 px-2 text-right font-mono font-bold" style={{ color: PAL.gold }}>
                                  {formatCurrencyAdaptive(planAffiliateTotals.targetGmv)}
                                </td>
                                <td />
                                <td className="py-2 px-2 text-right font-mono font-bold" style={{ color: PAL.gold }}>
                                  {formatCurrencyAdaptive(planAffiliateTotals.budgetAds)}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      {canManage && (
                        <button
                          onClick={addPlanRow}
                          className="mt-3 flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                          style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.gold }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm Dòng
                        </button>
                      )}
                    </Panel>

                    {canManage && (
                      <div className="flex justify-end">
                        <button
                          onClick={handleSavePlan}
                          disabled={planSaving}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
                          style={{ background: PAL.gold, color: "#1a1500" }}
                        >
                          <Save className="w-4 h-4" /> {planSaving ? "Đang Lưu..." : "Lưu Kế Hoạch Tháng Sau"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              </div>
            </details>
          )}
          {canManage && (
            <div className="rounded-xl" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
              <button onClick={() => setShowDeepDive((v) => !v)} className="w-full text-left px-4 py-3 text-xs font-bold" style={{ color: PAL.gold }}>
                {showDeepDive ? "▾" : "▸"} Phân tích sâu (nội bộ ops) — tải thêm Dữ Liệu Gốc khi mở
              </button>
              {showDeepDive && (
                <div className="p-4 pt-0">
                  <MonthlyDeepDive brandId={brandId} sessions={liveSessions} canManage={canManage} month={month} embedded />
                </div>
              )}
            </div>
          )}
          </SectionDetail>
        </section>
      </div>
    </div>
  );
};
