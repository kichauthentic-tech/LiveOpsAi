import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { ResponsiveContainer, ComposedChart, LineChart, ReferenceLine, BarChart, Bar, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { BarChart3, Flame, ListOrdered, ShoppingBag, Megaphone, AlertTriangle, CalendarClock, Users, PieChart as PieChartIcon, Activity, Download, Lightbulb, ChevronDown, Scale, Loader2, Save } from "lucide-react";
import { LiveSession, BrandMonthlyReport as BrandMonthlyReportType, BrandPlatformRate } from "../../types";
import { CHANNEL, METRIC, metricHint } from "../../lib/metricGlossary";
import { downloadSheetsAsXlsx } from "../../lib/exportXlsx";
import { useToast } from "../../hooks/useToast";
import { dailyFromSessions, monthRunRate, pickLivePerfSource } from "../../lib/report/sessionsLivePerf";
import { hydrateSnapshotSessions, MonthlyReportSnapshot, reportWindow, snapshotView } from "../../lib/report/monthlySnapshot";
import {
  autoNextSteps,
  autoSummary,
  campCompare,
  channelMix,
  compareWindow,
  DRIVER_LABEL,
  driverBreakdown,
  DriverBreakdown,
  DriverKey,
  liveStatsFromRows,
  LiveStats,
  NarrativeInput,
  pctChange,
  planCampAllocation,
  RATE_FACTORS,
  shopKpiProgress,
  shopTotals,
  skuMoves,
  trendSignal
} from "../../lib/report/monthlyReportInsights";
import {
  controlGroup,
  controlLabel,
  controlLine,
  controlVerdict,
  dailyGap,
  dailyGapLine,
  dayGroupStats,
  GIFT_MAX_PRICE,
  giftLine,
  giftStats,
  GiftStats,
  hostReliability,
  HostReliability,
  mixRateSplit,
  reliabilityText,
  VERDICT_TEXT
} from "../../lib/report/deepAnalysis";
import { CreatorLivePerfRow, vnDateOf } from "../../lib/dataraw/creatorLivePerfSlice";
import { fetchMonthPlan } from "../../lib/db/monthPlans";
import type { BrandMonthPlan, BrandMonthPlanSlot } from "../../types";
import { fetchMonthlyReport, saveMonthlyReportNarrative, saveMonthlyReportSectionNote } from "../../lib/db/monthlyReports";
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
  shortSku,
  whyInsight
} from "../../lib/report/sectionInsights";
import { resolveCampBucketType } from "../../lib/campaignDays";
import { MonthlyDeepDive } from "./deepdive/MonthlyDeepDive";
import { errorMessage } from "../../lib/errorMessage";
import { byHost, byHostDayType, dayTypeTeamTotals, dayTypeMetrics, dayTypeDriverLines, sumDayTypeParts, vsTeam, HOST_DAY_TYPE_ORDER, MIN_SESSIONS_TO_COMPARE, DAY_TYPE_DIFF_THRESHOLD, HostDayTypeRow, DayTypePart, DayTypeMetrics, dataQuality, filterSessions, hostKey, splitUnassignedHost, DataQuality } from "../../lib/performance/hostPerformance";
import { topSessionsByGmv, CAMP_DAY_BUCKET_ORDER, CAMP_DAY_BUCKET_LABEL, CampDayBucket, CampOverrides } from "../../lib/dataraw/creatorLivePerfMetrics";

import { fmtFixed, fmtVndShort } from "../../lib/format";
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

// Phần 5 — MỘT bảng host duy nhất (2026-09-26 user: 3 bảng host chồng nhau "tùm lum quá"), đúng dạng
// bảng host của deck Crocs: chỉ số theo hàng × host theo cột + cột Cả team, tab Cả tháng / Daily /
// D-Day / Mid-Month / Pay Day. Dòng thụt vào là 4 thừa số nhân ra GMV/giờ. ▲▼ chỉ ở tab loại ngày (so
// Cả team CÙNG loại ngày, host ≥ MIN_SESSIONS_TO_COMPARE ca); tab Cả tháng so công bằng bằng dòng "So
// mặt bằng" (hostVsPeer) — so thẳng với team cả tháng thì host được xếp ca D-Day luôn thắng.
type HostTab = "all" | CampDayBucket;
const HostPerformancePanel: React.FC<{
  rows: HostDayTypeRow[];
  team: Record<CampDayBucket, DayTypePart>;
  campDaysLabel: Partial<Record<CampDayBucket, string>>;
  vsPeer: Map<string, number | null>;
  /** So mặt bằng gộp các tháng có số trong bản chụp, có khoảng tin cậy (deepAnalysis.hostReliability). */
  reliability: Map<string, HostReliability>;
  relMonths: number;
  children?: React.ReactNode; // cảnh báo dữ liệu (đối soát, ca chưa gán host, bản chụp cũ)
}> = ({ rows, team, campDaysLabel, vsPeer, reliability, relMonths, children }) => {
  const [tab, setTab] = useState<HostTab>("all");
  const partOf = (byBucket: Record<CampDayBucket, DayTypePart>, t: HostTab) => (t === "all" ? sumDayTypeParts(byBucket) : byBucket[t]);
  const active: HostTab = tab === "all" || team[tab].sessions > 0 ? tab : "all";
  const isAll = active === "all";
  const teamM = dayTypeMetrics(partOf(team, active));
  const hosts = rows
    .map((r) => ({ key: r.key, name: r.name, assist: r.assist, m: dayTypeMetrics(partOf(r.byBucket, active)) }))
    .filter((h) => h.m.sessions > 0)
    .sort((a, b) => b.m.gmv - a.m.gmv);
  // Người chỉ làm trợ live không có cột (cả cột "—"), gom thành 1 dòng dưới bảng.
  const assistOnly = isAll ? rows.filter((r) => sumDayTypeParts(r.byBucket).sessions === 0 && r.assist.sessions > 0) : [];
  // Tên gọi như deck (HÙNG, VÂN): chữ cuối; trùng thì lấy 2 chữ cuối.
  const lastWords = (name: string, n: number) => name.trim().split(/\s+/).slice(-n).join(" ");
  const shortName = (name: string) => (hosts.filter((h) => lastWords(h.name, 1) === lastWords(name, 1)).length > 1 ? lastWords(name, 2) : lastWords(name, 1));
  const lines = isAll ? [] : dayTypeDriverLines(hosts, teamM);

  type H = (typeof hosts)[number];
  type Row = { label: string; value: (m: DayTypeMetrics, h?: H) => React.ReactNode; cmp?: "gmvPerHour" | "viewsPerHour" | "liveCtr" | "ctor" | "aov"; indent?: boolean; bold?: boolean; onlyAll?: boolean };
  const metricRows: Row[] = [
    { label: METRIC.gmv, value: (m) => fmtVndShort(m.gmv) },
    { label: `${METRIC.liveHours} · ca`, value: (m) => `${fmtHours(m.hours)} · ${m.sessions}` },
    { label: METRIC.gmvPerHour, value: (m) => (m.gmvPerHour != null ? fmtVndShort(m.gmvPerHour) : "—"), cmp: "gmvPerHour", bold: true },
    {
      // Cột chính để so host (Report Tháng chuyên sâu 2026-09-26): backtest CROCS — so mặt bằng từng tháng không
      // dự báo được tháng sau (Spearman −0,04) ⇒ gộp nhiều tháng, chỉ tô màu khi khoảng tin cậy nằm hẳn một phía.
      label: `So mặt bằng ${relMonths} tháng`,
      onlyAll: true,
      bold: true,
      value: (_m, h) => {
        const r = h ? reliability.get(h.key) : undefined;
        if (!r) return "—";
        const color = r.verdict === "above" ? PAL.green : r.verdict === "below" ? PAL.red : PAL.cream;
        return (
          <span style={{ color }} title={`${r.name}: ${reliabilityText(r)} qua ${r.sessions} ca${r.lo == null ? " — dưới 3 ca, chưa tính khoảng tin cậy" : ""}`}>
            {reliabilityText({ ratio: r.ratio, lo: null, hi: null })}
            <span className="font-normal" style={{ color: PAL.muted }}> · {r.sessions} ca</span>
          </span>
        );
      }
    },
    {
      label: "So mặt bằng tháng này",
      onlyAll: true,
      value: (_m, h) => {
        if (!h) return "—";
        const v = vsPeer.get(h.key);
        return v == null ? "—" : <span style={{ color: PAL.muted }}>{v >= 0 ? "+" : "−"}{fmtFixed(Math.abs(v), 0)}%</span>;
      }
    },
    { label: METRIC.viewsPerHour, value: (m) => (m.viewsPerHour != null ? fmtInt(m.viewsPerHour) : "—"), cmp: "viewsPerHour", indent: true },
    { label: METRIC.liveCtr, value: (m) => (m.liveCtr != null ? `${fmtFixed(m.liveCtr, 1)}%` : "—"), cmp: "liveCtr", indent: true },
    { label: METRIC.ctor, value: (m) => fmtPct(m.ctor), cmp: "ctor", indent: true },
    // AOV hiện nghìn đồng — làm tròn "1,1 triệu" sẽ che mất chênh 5–10% giữa các host.
    { label: METRIC.aov, value: (m) => fmtVndShort(m.aov), cmp: "aov", indent: true },
    { label: METRIC.upt, value: (m) => (m.upt != null ? fmtFixed(m.upt, 2) : "—") },
    { label: METRIC.avgView, value: (m) => (m.avgViewSec != null ? `${Math.round(m.avgViewSec)}s` : "—") },
    { label: "Giờ trợ live", onlyAll: true, value: (_m, h) => (h && h.assist.sessions > 0 ? `${fmtHours(h.assist.hours)} · ${h.assist.sessions}` : "—") }
  ];
  // Dòng "Giờ trợ live" chỉ hiện khi có host trong bảng từng làm trợ (người chỉ làm trợ đã có dòng riêng dưới bảng).
  const anyHostAssist = hosts.some((h) => h.assist.sessions > 0);
  const shownRows = metricRows.filter((r) => (isAll || !r.onlyAll) && (r.label !== "Giờ trợ live" || anyHostAssist));
  const tabs: { key: HostTab; label: string; sessions: number }[] = [
    { key: "all", label: "Cả tháng", sessions: HOST_DAY_TYPE_ORDER.reduce((a, b) => a + team[b].sessions, 0) },
    ...HOST_DAY_TYPE_ORDER.map((b) => ({ key: b as HostTab, label: campDaysLabel[b] ? `${DAY_TYPE_SHORT[b]} · ${campDaysLabel[b]}` : DAY_TYPE_SHORT[b], sessions: team[b].sessions }))
  ];

  return (
    <Panel
      title="Host PFM"
      icon={<Users className="w-4 h-4" />}
      sub={
        isAll
          ? "GMV của ca tính trọn cho host; trợ live chỉ ghi giờ. Bấm tab loại ngày để xem thừa số của từng Daily / campaign"
          : "GMV/giờ = Views/giờ × LIVE CTR × CTOR × AOV (CTOR = Orders ÷ Product clicks)"
      }
    >
      {children}
      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist">
        {tabs.map((t) => {
          const on = t.key === active;
          const empty = t.sessions === 0;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              disabled={empty}
              onClick={() => setTab(t.key)}
              className="text-[11px] font-bold px-3 py-1 rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: on ? PAL.gold : PAL.panel2, color: on ? PAL.bg : PAL.cream, border: `1px solid ${on ? PAL.gold : PAL.line}` }}
            >
              {t.label}
              <span className="font-normal opacity-80"> · {empty ? "chưa có ca" : `${t.sessions} ca`}</span>
            </button>
          );
        })}
      </div>
      {/* Chú thích màu đặt ngay trên bảng — để ở phụ đề thì người đọc không biết xanh/đỏ so với cái gì. */}
      <p className="text-[11px] mb-2" style={{ color: PAL.muted }}>
        {isAll ? (
          <>
            So mặt bằng = GMV/giờ của host so với cả nhóm ở cùng tháng × loại ngày × buổi (ngày/tối) của từng ca. Chỉ tô{" "}
            <span style={{ color: PAL.green }}>xanh</span> / <span style={{ color: PAL.red }}>đỏ</span> khi gộp {relMonths} tháng mà khoảng tin cậy 95% vẫn
            nằm hẳn trên / dưới mặt bằng (rê chuột để xem khoảng). Số của riêng tháng này để tham khảo: một tháng vài ca thì chênh
            15–25% vẫn có thể là ngẫu nhiên.
          </>
        ) : (
          <>
            <span style={{ color: PAL.green }}>▲ xanh</span> / <span style={{ color: PAL.red }}>▼ đỏ</span> = cao / thấp hơn cột Cả team từ {DAY_TYPE_DIFF_THRESHOLD}% trở lên (cùng loại ngày). Host
            chỉ có 1 ca không so. Dùng để hiểu thừa số nào kéo GMV/giờ, không dùng để xếp hạng host (xếp hạng xem tab Cả tháng).
          </>
        )}
      </p>
      <ReportTable
        head={[
          "Chỉ số",
          // Cả team đứng ngay sau tên chỉ số: là mốc so sánh nên phải luôn thấy, không bị đẩy khuất khi bảng cuộn ngang.
          "Cả team",
          // Host dưới ngưỡng ca ghi thẳng trên tiêu đề (không làm mờ cột — user thấy cột đậm/nhạt khó hiểu).
          ...hosts.map((h) => `${shortName(h.name).toUpperCase()}${!isAll && h.m.sessions < MIN_SESSIONS_TO_COMPARE ? ` · ${h.m.sessions} ca` : ""}`)
        ]}
      >
        {shownRows.map((r, idx) => (
          <tr key={r.label} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
            <td className={`py-2 px-3 whitespace-nowrap ${r.bold ? "font-black" : "font-semibold"}`} style={{ color: r.indent ? PAL.muted : PAL.cream, paddingLeft: r.indent ? 24 : undefined }} title={metricHint(r.label)}>
              {r.label}
            </td>
            <td className={`py-2 px-3 text-right font-mono whitespace-nowrap ${r.bold ? "font-bold" : ""}`} style={{ color: PAL.cream, borderRight: `1px solid ${PAL.line}` }}>
              {r.onlyAll ? "" : r.value(teamM)}
            </td>
            {hosts.map((h) => {
              const thin = !isAll && h.m.sessions < MIN_SESSIONS_TO_COMPARE;
              const d = !isAll && r.cmp ? vsTeam(h.m, teamM, r.cmp) : null;
              const arrow = d == null || Math.abs(d) < DAY_TYPE_DIFF_THRESHOLD ? null : d > 0 ? "up" : "down";
              return (
                <td
                  key={h.key}
                  className={`py-2 px-3 text-right font-mono whitespace-nowrap ${r.bold ? "font-bold" : ""}`}
                  style={{ color: arrow === "up" ? PAL.green : arrow === "down" ? PAL.red : PAL.cream }}
                  title={d != null ? `${h.name}: ${d >= 0 ? "+" : "−"}${fmtFixed(Math.abs(d), 0)}% so với Cả team` : thin ? `${h.name}: ${h.m.sessions} ca — quá ít để so` : h.name}
                >
                  {r.value(h.m, h)}
                  {arrow === "up" ? " ▲" : arrow === "down" ? " ▼" : ""}
                </td>
              );
            })}
          </tr>
        ))}
        {hosts.length === 0 && (
          <tr>
            <td colSpan={2} className="py-6 text-center italic" style={{ color: PAL.muted }}>
              Chưa có phiên TikTok nào có số liệu trong tháng.
            </td>
          </tr>
        )}
      </ReportTable>
      {assistOnly.length > 0 && (
        <p className="mt-2 text-[11px]" style={{ color: PAL.muted }}>
          Chỉ làm trợ live: {assistOnly.map((r) => `${r.name} ${fmtHours(r.assist.hours)} · ${r.assist.sessions} ca`).join(" · ")}
        </p>
      )}
      {lines.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs" style={{ color: PAL.cream }}>
          {lines.map((l) => (
            <li key={l}>→ {l}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

// Nhãn ngắn loại ngày cho tiêu đề cột bảng host (bỏ phần "(13-15)" — khoảng camp có thể bị ghi đè).
const DAY_TYPE_SHORT: Record<CampDayBucket, string> = { daily: "Daily", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };

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

// ---------- Bố cục 7 phần, kết luận trước (Report Tháng chuyên sâu, 2026-09-26) ----------
// Thứ tự theo câu brand hỏi: kết quả thế nào → thị trường hay vận hành → vì sao → hàng → người → lịch → tháng sau.
// Công cụ nhập liệu của ops (khung camp, kế hoạch tháng sau) đã chuyển sang tab Nhập Ads & Ghi Chú; bảng creator
// affiliate nhập tay nằm ở trang Affiliate — report chỉ còn phần để đọc.

const SECTIONS: { id: string; label: string }[] = [
  { id: "summary", label: "1 · Kết luận" },
  { id: "shop", label: "2 · Thị trường hay vận hành" },
  { id: "why", label: "3 · Vì sao" },
  { id: "products", label: "4 · Sản phẩm" },
  { id: "people", label: "5 · Host" },
  { id: "context", label: "6 · Campaign & khung giờ" },
  { id: "next", label: "7 · Tháng sau" }
];

// 4 kênh — màu phân loại theo thứ tự cố định (blue/orange/aqua/yellow, bước tối của bảng màu đã kiểm
// mù màu cho các cặp kề nhau). Kênh luôn giữ một màu, không đổi theo thứ hạng.
const CHANNELS: { key: "liveLinked" | "affiliate" | "video" | "card"; label: string; color: string }[] = [
  { key: "liveLinked", label: CHANNEL.sellerLive, color: "#3987e5" },
  { key: "affiliate", label: CHANNEL.affiliateLive, color: "#d95926" },
  { key: "video", label: CHANNEL.video, color: "#199e70" },
  { key: "card", label: CHANNEL.productCard, color: "#c98500" }
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
  liveCtr: METRIC.liveCtr,
  ctor: METRIC.ctor,
  aov: METRIC.aov
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
          <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtVndShort(v)} width={70} />
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
        <div key={p.key} className="text-[11.5px] rounded-lg px-3 py-2" style={{ background: PAL.panel2, color: PAL.muted }}>
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
              <p className="text-[15px] font-black leading-snug" style={{ color: PAL.cream }}>
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

  // Dòng brand_monthly_reports của tháng: khoảng camp ops ghi đè, tóm tắt/việc tháng sau/Insight đã sửa, ghi chú
  // agency. Form nhập các cột kế hoạch nằm ở tab Nhập Ads & Ghi Chú (ReportPlanningInputs).
  const [monthlyReportRow, setMonthlyReportRow] = useState<BrandMonthlyReportType | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMonthlyReport(brandId, `${month}-01`)
      .then((row) => !cancelled && setMonthlyReportRow(row))
      .catch(() => !cancelled && setMonthlyReportRow(null));
    return () => {
      cancelled = true;
    };
  }, [brandId, month]);

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

  // Đổi nguồn số (2026-09-21): file Dataraw chỉ còn là DỰ PHÒNG — tháng nào có ca có số thì đọc từ ca
  // (lib/report/sessionsLivePerf.ts). *Raw = slice từ Dataraw (bản chụp chỉ giữ slice này cho tháng CHƯA có ca
  // nào có số); liveCurrent/livePrev = nguồn đã chọn.
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
  // Diễn biến theo ngày: file Live Performance Core Stats có GMV gián tiếp — ưu tiên khi có; không có thì gộp ca theo ngày.
  const dailyPerf = useMemo(() => (dailyPerfRaw?.hasAnyBatch ? dailyPerfRaw : dailyFromSessions(sessions, brandId, start, end)), [dailyPerfRaw, sessions, brandId, start, end]);
  const runRate = useMemo(() => monthRunRate(sessions, brandId, start, end), [sessions, brandId, start, end]);

  // Kế Hoạch Tháng của tháng trước / tháng này / tháng sau — nguồn khoảng ngày camp + target từng khung (tháng này)
  // và phân bổ tháng sau (phần 7). Bảng nhỏ, đọc thẳng, không đưa vào bản chụp.
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

  // Khung camp D-Day/Mid-Month/Pay Day, từng khung: khoảng nhập ở Nhập Ads & Ghi Chú (0071) → khoảng của Kế Hoạch
  // Tháng (0094) → lịch camp cố định (lib/campaignDays.ts).
  const campOverrides: CampOverrides = useMemo(() => {
    const out: CampOverrides = { ...(planCur?.plan.campRanges ?? {}) };
    if (monthlyReportRow?.campDdayStart && monthlyReportRow?.campDdayEnd) out.dday = { start: monthlyReportRow.campDdayStart, end: monthlyReportRow.campDdayEnd };
    if (monthlyReportRow?.campMidmonthStart && monthlyReportRow?.campMidmonthEnd)
      out.midmonth = { start: monthlyReportRow.campMidmonthStart, end: monthlyReportRow.campMidmonthEnd };
    if (monthlyReportRow?.campPaydayStart && monthlyReportRow?.campPaydayEnd) out.payday = { start: monthlyReportRow.campPaydayStart, end: monthlyReportRow.campPaydayEnd };
    return out;
  }, [monthlyReportRow, planCur]);
  // Tháng trước phân loại theo khoảng camp của CHÍNH tháng trước — đem khoảng của tháng này áp vào thì ngày camp
  // tháng trước (vd D-Day 8/8) bị tính thành ngày thường vì khung đó đã bị ghi đè.
  const prevCampOverrides: CampOverrides = useMemo(() => ({ ...(plans[prevMonth]?.plan.campRanges ?? {}) }), [plans, prevMonth]);
  const bucketCur = useMemo(() => (d: string) => resolveCampBucketType(d, campOverrides), [campOverrides]);
  const bucketPrev = useMemo(() => (d: string) => resolveCampBucketType(d, prevCampOverrides), [prevCampOverrides]);
  // Tháng cũ hơn chưa đọc Kế Hoạch Tháng ⇒ lịch camp mặc định.
  const bucketAny = useMemo(
    () => (d: string) => (d.startsWith(month) ? bucketCur(d) : d.startsWith(prevMonth) ? bucketPrev(d) : resolveCampBucketType(d)),
    [month, prevMonth, bucketCur, bucketPrev]
  );

  const topSessions = useMemo(() => topSessionsByGmv(liveCurrent?.rows ?? [], 10), [liveCurrent]);

  const completedInPeriod = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && s.status === "Completed"),
    [sessions, brandId, start, end]
  );

  // Host Performance — tổng hợp từ ca (Creator-Live-Performance không có tên host), dùng đúng
  // lib/performance/hostPerformance.ts như tab Hiệu Suất Host của agency: hai màn không được nói hai số về một người.
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
    // Ca chưa gán host tách khỏi bảng host (audit 2026-09-21): gom mọi ca vô danh thành một dòng rồi xếp hạng
    // chung với người thật là so sai đối tượng.
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

  // Target GMV = target CAM KẾT của tháng (Đ5, 2026-09-24): tháng có Kế Hoạch Tháng ĐÃ CHỐT thì lấy tổng target của
  // kế hoạch đó; không có thì cộng target các ca chưa huỷ (cách cũ). Chỉ áp cho khoảng đúng bằng TRỌN 1 tháng.
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

  const hasReturnRateConfig = brandPlatformRates.some((r) => r.brandId === brandId);
  const kpiTargetGmvCurRaw = scheduledTargetGmv(start, end);
  const kpiTargetGmvCur = kpiTargetGmvCurRaw > 0 ? kpiTargetGmvCurRaw : null;

  const dailyChartData = useMemo(
    () =>
      (dailyPerf?.daily ?? []).map((d) => ({
        label: d.date.slice(8, 10) + "/" + d.date.slice(5, 7),
        gmvLiveSession: d.gmvLiveSession,
        gmvIndirect: d.gmvIndirect
      })),
    [dailyPerf]
  );

  // So cùng số ngày: tháng report chưa có số tới ngày cuối thì so 1..N với 1..N tháng trước — so với trọn tháng
  // trước từng ra −40% cho T9 CROCS trong khi cùng kỳ chỉ −18%.
  const cmp = useMemo(() => compareWindow(month, snapshot.coverage.sessionsThrough), [month, snapshot]);
  // Bảng khung camp — MỖI khung so với CHÍNH khung đó tháng trước. Target: Kế Hoạch Tháng ĐÃ CHỐT (cộng target ca
  // theo khung) → không có thì target nhập tay (Nhập Ads & Ghi Chú).
  const planCampTargets = useMemo(() => {
    if (!planCur || planCur.plan.status !== "locked" || planCur.slots.length === 0) return null;
    return Object.fromEntries(planCampAllocation(planCur.slots, campOverrides).map((a) => [a.key, a.target > 0 ? a.target : null])) as Record<CampDayBucket, number | null>;
  }, [planCur, campOverrides]);
  const campTargetSource = planCampTargets ? "Kế Hoạch Tháng đã chốt" : "nhập tay ở Nhập Ads & Ghi Chú";
  const prevColLabel = cmp.partial ? `1–${Number(cmp.prevEnd.slice(8))}/${prevMonth.slice(5)}` : `Tháng ${prevMonth.slice(5)}`;
  const campDetailRows = useMemo(() => {
    const targets: Record<CampDayBucket, number | null> = planCampTargets ?? {
      dday: monthlyReportRow?.campDdayTargetGmv ?? null,
      midmonth: monthlyReportRow?.campMidmonthTargetGmv ?? null,
      payday: monthlyReportRow?.campPaydayTargetGmv ?? null,
      daily: null
    };
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

  // ============================ Số của 7 phần ============================
  // Phép tính nằm ở lib/report/monthlyReportInsights.ts + deepAnalysis.ts (thuần, có test). Ở đây chỉ nối dây.

  const liveCurStats = useMemo(() => liveStatsFromRows(liveCurrent?.rows ?? [], cmp.curStart, cmp.curEnd), [liveCurrent, cmp]);
  const livePrevStats = useMemo(() => liveStatsFromRows(livePrev?.rows ?? [], cmp.prevStart, cmp.prevEnd), [livePrev, cmp]);
  const drivers = useMemo(() => driverBreakdown(livePrevStats, liveCurStats), [livePrevStats, liveCurStats]);
  const waterfallData = useMemo(() => toWaterfall(drivers, cmp, month, prevMonth), [drivers, cmp, month, prevMonth]);

  const rowsOf = (m: string) => {
    const { start: s, end: e } = monthRangeLocal(m);
    return m === month ? liveCurrent?.rows ?? [] : m === prevMonth ? livePrev?.rows ?? [] : pickLivePerfSource(sessions, brandId, s, e, liveOlderMonths[m] ?? null).slice.rows;
  };
  // Trọn từng tháng (tháng report tới ngày có số) — cột "LIVE GMV (agency)" cạnh cơ cấu kênh cả tháng của Shop Analytics.
  const monthlyStats = useMemo(
    () => last4Months.map((m) => ({ month: m, stats: liveStatsFromRows(rowsOf(m), monthRangeLocal(m).start, m === month ? cmp.curEnd : monthRangeLocal(m).end) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [last4Months, month, prevMonth, liveCurrent, livePrev, sessions, brandId, liveOlderMonths, cmp]
  );
  // Xu hướng 4 tháng CÙNG SỐ NGÀY (tháng chưa hết thì mọi tháng cắt 1..N): đặt 3 tháng trọn cạnh tháng mới 22 ngày
  // từng sinh câu "giảm 4 tháng liên tiếp" so lệch kỳ.
  const trendDay = cmp.partial ? Number(cmp.curEnd.slice(8)) : null;
  const trendStats = useMemo(
    () =>
      last4Months.map((m) => {
        const { start: s, end: e } = monthRangeLocal(m);
        const cut = trendDay ? `${m}-${String(Math.min(trendDay, Number(e.slice(8)))).padStart(2, "0")}` : e;
        return { month: m, stats: liveStatsFromRows(rowsOf(m), s, cut) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [last4Months, month, prevMonth, liveCurrent, livePrev, sessions, brandId, liveOlderMonths, trendDay]
  );
  const trendColLabel = (m: string) => (trendDay ? `1–${Math.min(trendDay, Number(monthRangeLocal(m).end.slice(8)))}/${m.slice(5)}` : `${m.slice(5)}/${m.slice(2, 4)}`);

  // Quà tặng theo tháng (piece gifts của bản chụp, file Sản Phẩm + đơn Shop Analytics cùng kỳ).
  const giftByMonth = useMemo(() => last4Months.map((m) => (hiddenMonths.has(m) ? null : giftStats(view.gifts?.[m] ?? null, view.shopDays[m] ?? null))), [last4Months, hiddenMonths, view]);
  const giftCur = giftByMonth[3];
  const giftPrev = giftByMonth[2];
  const giftLineText = giftLine(giftPrev, giftCur, `T${Number(prevMonth.slice(5))}`);
  const giftSliceCur = view.gifts?.[month] ?? null;
  const giftsMissing = canManage && !view.gifts?.[month];
  const giftNote = giftSliceCur?.hasAnyBatch
    ? giftSliceCur.giftItems > 0
      ? `Quà tặng (dưới ${fmtVndShort(GIFT_MAX_PRICE)}/món): ${fmtInt(giftSliceCur.giftItems)} món ở ${giftSliceCur.giftSkus} SKU${giftSliceCur.top[0] ? `, nhiều nhất ${shortSku(giftSliceCur.top[0][0])}` : ""} — không tính vào UPT hàng bán thật.`
      : giftPrev && giftPrev.giftItems > 0
        ? `Tháng này không còn hàng quà tặng dưới ${fmtVndShort(GIFT_MAX_PRICE)}/món (tháng ${prevMonth.slice(5)}: ${fmtInt(giftPrev.giftItems)} món).`
        : null
    : null;

  // Ngày thường vs ngày camp, cơ cấu lịch vs hiệu suất.
  const dayGroups = useMemo(() => dayGroupStats(livePrev?.rows ?? [], liveCurrent?.rows ?? [], cmp, bucketPrev, bucketCur), [livePrev, liveCurrent, cmp, bucketPrev, bucketCur]);
  const mixRate = useMemo(() => mixRateSplit(livePrev?.rows ?? [], liveCurrent?.rows ?? [], cmp, bucketPrev, bucketCur), [livePrev, liveCurrent, cmp, bucketPrev, bucketCur]);
  const dailyGroup = dayGroups.find((g) => g.key === "daily");
  const dailyGapValue = dailyGap(dailyGroup);
  const dailyGapText = dailyGapLine(dailyGroup);

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

  // Nhóm đối chứng: live tài khoản shop vs phần còn lại của shop, theo ngày thường / ngày camp.
  const control = useMemo(
    () => controlGroup(shopDaysOf(prevMonth)?.days, view.shopDays[month]?.days, cmp, bucketPrev, bucketCur),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, prevMonth, month, cmp, bucketPrev, bucketCur, hiddenMonths]
  );
  const controlOps = control.find((r) => r.key !== "all" && controlVerdict(r) === "ops");

  // KPI GMV cả shop brand giao (Kế Hoạch Tháng, 0122) — mọi kênh, khác target live. Tháng chưa hết thì dự kiến theo
  // nhịp cùng kỳ tháng trước (chỉ khi tháng trước có đủ số cả tháng).
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

  // NMV: tỷ lệ hoàn ở Rate Card nếu đã nhập, không thì Refund rate thực của cả shop trong kỳ — ước tính, ghi rõ.
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

  // Khung giờ bắt đầu ca — GMV/giờ, cùng kỳ 2 tháng.
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

  // Phần 7 — kế hoạch tháng sau lấy từ Kế Hoạch Tháng (nguồn duy nhất của target/lịch tháng sau).
  const nextPlan = nextPlanFull ? { targetGmv: nextPlanFull.plan.targetGmv, status: nextPlanFull.plan.status, slotCount: nextPlanFull.slots.length } : null;
  const nextAllocation = useMemo(
    () => (nextPlanFull && nextPlanFull.slots.length > 0 ? planCampAllocation(nextPlanFull.slots, nextPlanFull.plan.campRanges) : null),
    [nextPlanFull]
  );

  // Top SKU: hạng tháng trước → tháng này + phễu. Tháng trước bị che với brand thì không có hạng/so sánh.
  const skuMoveData = useMemo(
    () => skuMoves(view.skuRank?.[month] ?? null, hiddenMonths.has(prevMonth) ? null : (view.skuRank?.[prevMonth] ?? null)),
    [view, month, prevMonth, hiddenMonths]
  );

  // Phần 5 — so mặt bằng tháng này (cột phụ) theo loại ngày.
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

  // Phần 5 — so mặt bằng GỘP các tháng có số trong bản chụp, kèm khoảng tin cậy (cột chính để so host).
  const reliabilitySessions = useMemo(
    () => filterSessions(sessions.filter((s) => s.brandId === brandId && s.platform === "TikTok" && s.status === "Completed"), {}),
    [sessions, brandId]
  );
  const reliability = useMemo(() => hostReliability(reliabilitySessions, bucketAny), [reliabilitySessions, bucketAny]);
  const reliabilityByKey = useMemo(() => new Map(reliability.map((r) => [r.key, r])), [reliability]);
  const relMonths = useMemo(() => new Set(reliabilitySessions.map((s) => s.date.slice(0, 7))).size, [reliabilitySessions]);

  // Phần 5 — host theo từng loại ngày: Daily + D-Day / Mid-Month / Pay Day TÁCH RIÊNG. GMV trọn cho host, trợ live chỉ ghi giờ.
  const hostDayType = useMemo(
    () =>
      byHostDayType(
        filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {}),
        (date) => resolveCampBucketType(date, campOverrides)
      ),
    [completedInPeriod, campOverrides]
  );
  const hostDayTypeTeam = useMemo(() => dayTypeTeamTotals(hostDayType), [hostDayType]);
  const campDaysLabel = useMemo(() => {
    const { start, end } = monthRangeLocal(month);
    const days: Record<CampDayBucket, number[]> = { daily: [], dday: [], midmonth: [], payday: [] };
    for (let d = Number(start.slice(-2)); d <= Number(end.slice(-2)); d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      days[resolveCampBucketType(date, campOverrides)].push(d);
    }
    const mm = Number(month.slice(5));
    const out: Partial<Record<CampDayBucket, string>> = {};
    for (const b of ["dday", "midmonth", "payday"] as const) {
      const ds = days[b];
      if (ds.length) out[b] = ds.length === 1 ? `${ds[0]}/${mm}` : `${ds[0]}–${ds[ds.length - 1]}/${mm}`;
    }
    return out;
  }, [month, campOverrides]);

  // Khung Insight phần 2–6 — tự sinh từ đúng các số phần đó đang hiện (lib/report/sectionInsights.ts).
  const sectionInsight: Record<InsightSection, SectionInsight | null> = {
    shop: shopInsight({ months: last4Months, mixes: channelMixes, agencyGmv: monthlyStats.map((x) => x.stats.gmv), shopCur, shopPrev: shopPrevSame, windowLabel: cmp.label, control }),
    why: whyInsight(livePrevStats, liveCurStats, { groups: dayGroups, mixRate, giftLine: giftLineText }),
    people: peopleInsight(hostInsight.rows, reliability),
    products: productsInsight(skuMoveData, topPromo?.items?.[0] ?? null, giftNote),
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
    targetGmv: kpiTargetGmvCur,
    nextMonth,
    nextPlan,
    shopKpi,
    controlLine: controlLine(control),
    controlOpsGroup: controlOps ? (controlOps.key as "daily" | "camp") : null,
    dailyGap: dailyGapValue != null && dailyGapText ? { line: dailyGapText, value: dailyGapValue } : null,
    giftLine: giftLineText
  };
  const autoSummaryLines = autoSummary(narrativeInput);
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
      setNarrativeError(errorMessage(e, "Lưu kết luận thất bại"));
    } finally {
      setNarrativeSaving(false);
    }
  };

  const agencyNotes = [
    ["Khuyến mãi", monthlyReportRow?.promotionNotes],
    ["Khách hàng", monthlyReportRow?.customerInsightNotes],
    ["Sức khoẻ tài khoản", monthlyReportRow?.accountHealthNotes]
  ].filter((x): x is [string, string] => !!x[1]?.trim());

  // Bảng xu hướng 4 tháng cùng số ngày (thay 8 ô xu hướng + bảng MoM + phễu + 2 biểu đồ 4 tháng — cùng số lặp 4 lần).
  // goodWhenUp null = trung tính (không tô). UPT live đổi theo quà tặng ⇒ trung tính; UPT bỏ quà mới là cách bán.
  type TrendRow = { label: string; get: (s: LiveStats, g: GiftStats | null) => number | null; fmt: (v: number) => string; goodWhenUp: boolean | null; indent?: boolean };
  const trendRows: TrendRow[] = [
    { label: METRIC.liveGmv, get: (s) => (s.sessions > 0 ? s.gmv : null), fmt: (v) => fmtVndShort(v), goodWhenUp: true },
    { label: METRIC.liveHours, get: (s) => (s.sessions > 0 ? s.hours : null), fmt: fmtHours, goodWhenUp: null },
    { label: METRIC.gmvPerHour, get: (s) => s.gmvPerHour, fmt: (v) => fmtVndShort(v), goodWhenUp: true },
    { label: METRIC.viewsPerHour, get: (s) => s.viewsPerHour, fmt: fmtInt, goodWhenUp: true, indent: true },
    { label: METRIC.liveCtr, get: (s) => s.liveCtr, fmt: (v) => `${fmtFixed(v, 1)}%`, goodWhenUp: true, indent: true },
    { label: METRIC.ctor, get: (s) => s.ctor, fmt: (v) => fmtPct(v), goodWhenUp: true, indent: true },
    { label: METRIC.aov, get: (s) => s.aov, fmt: (v) => fmtVndShort(v), goodWhenUp: true, indent: true },
    { label: METRIC.productCtr, get: (s) => s.ctr, fmt: (v) => fmtPct(v), goodWhenUp: true },
    { label: `${METRIC.upt} live`, get: (s) => s.upt, fmt: (v) => fmtFixed(v, 2), goodWhenUp: null },
    { label: "Quà tặng mỗi đơn (cả shop)", get: (_s, g) => g?.giftPerOrder ?? null, fmt: (v) => fmtFixed(v, 2), goodWhenUp: null },
    { label: `${METRIC.upt} bỏ quà (cả shop)`, get: (_s, g) => g?.uptExGift ?? null, fmt: (v) => fmtFixed(v, 2), goodWhenUp: true }
  ];
  const trendValues = (r: TrendRow) => trendStats.map((x, i) => r.get(x.stats, giftByMonth[i]));

  const [showDeepDive, setShowDeepDive] = useState(false);
  // Điện thoại (audit UX 2026-09-26, P2c): dưới 768px phần 2–7 chỉ hiện tiêu đề + Insight (kết luận), biểu đồ/bảng mở
  // khi bấm; Kết luận luôn mở. Desktop không đổi.
  const isNarrow = !useMediaQuery("(min-width: 768px)");
  const [openDetails, setOpenDetails] = useState<Set<string>>(() => new Set());
  const detailOpen = (id: string) => !isNarrow || openDetails.has(id);
  const openDetail = (id: string) => setOpenDetails((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  // Bấm mục lục tới phần đang gập: mở ra rồi mới cuộn — phải chờ React vẽ xong phần vừa mở (effect dưới), cuộn ngay
  // thì vị trí đích còn là của bản gập.
  const pendingScrollRef = useRef<string | null>(null);
  const scrollNow = (id: string) => document.getElementById(`mr-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const scrollTo = (id: string) => {
    if (id === "summary" || detailOpen(id)) return scrollNow(id);
    pendingScrollRef.current = id;
    openDetail(id);
  };
  useEffect(() => {
    const id = pendingScrollRef.current;
    if (!id || !openDetails.has(id)) return;
    pendingScrollRef.current = null;
    scrollNow(id);
  }, [openDetails]);

  // Xuất Excel toàn bộ Report Tháng — 1 file, mỗi bảng đang hiện là 1 sheet (trừ Phân Tích Sâu, ops-only). Chỉ đọc
  // lại đúng các mảng đã tính cho phần hiển thị — không tính số mới.
  const { showToast } = useToast();
  const handleExportAll = () => {
    const n = (v: number | null | undefined) => (v == null ? "" : Math.round(v * 100) / 100);
    downloadSheetsAsXlsx(
      [
        {
          name: "1 Ket Luan",
          rows: [
            ...summaryLines.map((l) => ({ "Phần": "Kết luận", "Nội dung": l })),
            ...nextLines.map((l) => ({ "Phần": "Việc tháng sau", "Nội dung": l })),
            ...(
              [
                ["shop", "Insight · Thị trường hay vận hành"],
                ["why", "Insight · Vì sao"],
                ["products", "Insight · Sản phẩm"],
                ["people", "Insight · Host"],
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
            { "Chỉ Số": "LIVE CTR (%)", "Kỳ trước": n(livePrevStats.liveCtr), "Kỳ này": n(liveCurStats.liveCtr) },
            { "Chỉ Số": "CTOR = Orders ÷ Product clicks (%)", "Kỳ trước": n(livePrevStats.ctor), "Kỳ này": n(liveCurStats.ctor) },
            { "Chỉ Số": "AOV", "Kỳ trước": n(livePrevStats.aov), "Kỳ này": n(liveCurStats.aov) },
            { "Chỉ Số": "Product CTR (%)", "Kỳ trước": n(livePrevStats.ctr), "Kỳ này": n(liveCurStats.ctr) },
            { "Chỉ Số": "Orders", "Kỳ trước": n(livePrevStats.orders), "Kỳ này": n(liveCurStats.orders) },
            { "Chỉ Số": "UPT live", "Kỳ trước": n(livePrevStats.upt), "Kỳ này": n(liveCurStats.upt) },
            { "Chỉ Số": "Target GMV", "Kỳ trước": "", "Kỳ này": n(kpiTargetGmvCur) },
            { "Chỉ Số": "KPI GMV", "Kỳ trước": "", "Kỳ này": n(shopKpi?.target) },
            { "Chỉ Số": "Total GMV dự kiến cuối tháng", "Kỳ trước": "", "Kỳ này": n(shopKpi?.projected) },
            { "Chỉ Số": `So sánh: ${cmp.label}`, "Kỳ trước": "", "Kỳ này": "" }
          ]
        },
        {
          name: "2 Thi truong - Van hanh",
          rows: control.map((r) => ({
            "Nhóm ngày": controlLabel(r.key),
            "Số ngày": r.days,
            "LIVE GMV agency kỳ trước": n(r.livePrev),
            "LIVE GMV agency kỳ này": n(r.liveCur),
            "± Live agency (%)": n(r.liveChg),
            "Phần còn lại kỳ trước": n(r.restPrev),
            "Phần còn lại kỳ này": n(r.restCur),
            "± Phần còn lại (%)": n(r.restChg),
            "± Lượt vào shop (%)": n(r.visitorsChg),
            "CVR shop kỳ trước (%)": n(r.cvrPrev),
            "CVR shop kỳ này (%)": n(r.cvrCur),
            "Đọc là": controlVerdict(r) ? VERDICT_TEXT[controlVerdict(r)!] : ""
          }))
        },
        {
          name: "2 Sales Channel",
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
          name: "3 Vi sao - Thua so",
          rows: (drivers?.parts ?? []).map((p) => ({ "Thừa số": DRIVER_LABEL[p.key], "± (%)": n(p.change), "Góp vào ± LIVE GMV": n(p.value) }))
        },
        {
          name: "3 Vi sao - Loai ngay",
          rows: dayGroups.map((g) => ({
            "Nhóm ngày": controlLabel(g.key),
            "Giờ live kỳ trước": n(g.prev.hours),
            "Giờ live kỳ này": n(g.cur.hours),
            "GMV/giờ kỳ trước": n(g.prev.gmvPerHour),
            "GMV/giờ kỳ này": n(g.cur.gmvPerHour),
            ...Object.fromEntries(RATE_FACTORS.map((k) => [`± ${DRIVER_LABEL[k]} (%)`, n(pctChange(g.prev[k], g.cur[k]))]))
          }))
        },
        {
          name: "3 Xu huong 4 thang",
          rows: trendRows.map((r) => ({ "Chỉ số": r.label, ...Object.fromEntries(trendStats.map((x, i) => [trendColLabel(x.month), n(trendValues(r)[i])])) }))
        },
        {
          name: "4 Top SKU",
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
          name: "4 Qua tang",
          rows: last4Months.map((m, i) => ({
            "Tháng": m,
            "Món quà tặng": n(giftByMonth[i]?.giftItems),
            "SKU quà tặng": n(giftByMonth[i]?.giftSkus),
            "Orders cả shop": n(giftByMonth[i]?.shopOrders),
            "Quà mỗi đơn": n(giftByMonth[i]?.giftPerOrder),
            "UPT cả shop": n(giftByMonth[i]?.uptShop),
            "UPT bỏ quà": n(giftByMonth[i]?.uptExGift)
          }))
        },
        {
          name: "4 Top Promotion",
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
          name: "5 Host Performance",
          rows: hostPerformance.map((h) => {
            const r = reliabilityByKey.get(h.key);
            return {
              "Host": h.hostName,
              "Sessions": h.sessionCount,
              "GMV": n(h.gmv),
              "Giờ live": n(h.hours),
              "GMV/giờ": n(h.gmvPerHour),
              [`So mặt bằng ${relMonths} tháng (%)`]: n(r ? (r.ratio - 1) * 100 : null),
              "Khoảng tin cậy thấp (%)": n(r?.lo != null ? (r.lo - 1) * 100 : null),
              "Khoảng tin cậy cao (%)": n(r?.hi != null ? (r.hi - 1) * 100 : null),
              [`Sessions ${relMonths} tháng`]: r?.sessions ?? "",
              "So mặt bằng tháng này (%)": n(hostInsight.vsPeer.get(h.key)),
              "Orders": n(h.orders),
              "Product CTR": n(h.ctr),
              "Sessions trợ live": hostDayType.find((x) => x.key === h.key)?.assist.sessions ?? 0,
              "Giờ trợ live": n(hostDayType.find((x) => x.key === h.key)?.assist.hours ?? 0)
            };
          })
        },
        {
          name: "5 Host chi so theo ngay",
          rows: HOST_DAY_TYPE_ORDER.flatMap((b) =>
            [...hostDayType.filter((h) => h.byBucket[b].sessions > 0).map((h) => ({ name: h.name, part: h.byBucket[b] })), ...(hostDayTypeTeam[b].sessions > 0 ? [{ name: "Cả team", part: hostDayTypeTeam[b] }] : [])].map(({ name, part }) => {
              const m = dayTypeMetrics(part);
              return {
                "Loại ngày": campDaysLabel[b] ? `${DAY_TYPE_SHORT[b]} ${campDaysLabel[b]}` : DAY_TYPE_SHORT[b],
                "Host": name,
                [METRIC.sessions]: m.sessions,
                [METRIC.gmv]: n(m.gmv),
                [METRIC.liveHours]: n(m.hours),
                [METRIC.gmvPerHour]: n(m.gmvPerHour),
                [METRIC.viewsPerHour]: n(m.viewsPerHour),
                [`${METRIC.liveCtr} (%)`]: n(m.liveCtr),
                ["CTOR = Orders ÷ Product clicks (%)"]: n(m.ctor),
                [METRIC.aov]: n(m.aov),
                [METRIC.upt]: n(m.upt),
                [`${METRIC.avgView} (s)`]: n(m.avgViewSec)
              };
            })
          )
        },
        {
          name: "6 Campaign",
          rows: campDetailRows.map((r) => ({
            "Khung": r.label,
            "Target GMV": n(r.target),
            "GMV": n(r.actual),
            "% Target": n(r.target ? (r.actual / r.target) * 100 : null),
            [`GMV cùng khung ${prevMonth}`]: n(r.prev.gmv),
            "Giờ live": n(r.hours),
            "GMV/giờ": n(r.gmvPerHour),
            "Product CTR": n(r.ctr),
            "CTOR": n(r.ctor)
          }))
        },
        {
          name: "6 Top Sessions",
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
        }
      ],
      `ReportThang_${brandName}_${month}.xlsx`.replace(/\s+/g, "_")
    ).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  const chgCell = (v: number | null, goodWhenUp: boolean | null = true, digits = 0) =>
    v == null ? (
      <span style={{ color: PAL.muted }}>—</span>
    ) : (
      <span style={{ color: goodWhenUp == null ? PAL.cream : (v >= 0) === goodWhenUp ? PAL.green : PAL.red }}>
        {v >= 0 ? "+" : "−"}
        {fmtFixed(Math.abs(v), digits)}%
      </span>
    );
  // Dấu trừ chuẩn "−" và làm tròn nghìn đồng cho số tiền nhỏ trong câu (fmtVndShort in "-").
  const signedMoney = (v: number) => `${v >= 0 ? "+" : "−"}${fmtVndShort(Math.round(Math.abs(v) / 1000) * 1000)}`;
  const rowStyle = (idx: number) => ({ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" });
  const warnBox = (children: React.ReactNode) => (
    <div className="flex items-start gap-2 text-[11px] rounded-xl p-2.5" style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: PAL.bg, border: `1px solid ${PAL.line}` }}>
      {/* Mục lục 7 phần — trang cuộn (user chốt 2026-09-25): tab giấu nội dung, brand có thể không bao giờ mở tới. */}
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
        {shopPiecesMissing && canManage && warnBox(<>Số liệu này chốt trước khi report có phần Shop Analytics — bấm "Cập nhật số liệu" ở trên để có đủ 7 phần.</>)}
        {giftsMissing && !shopPiecesMissing && warnBox(<>Số liệu này chốt trước khi report tách quà tặng khỏi UPT — bấm "Cập nhật số liệu" ở trên để có dòng quà tặng.</>)}

        {/* ===== 1. Kết luận ===== */}
        <section id="mr-summary" className="space-y-4 scroll-mt-16">
          <SectionHead no="1" title="Kết luận" sub={cmp.partial ? `Số tính tới ${cmp.curEnd.slice(8)}/${month.slice(5)} · % là cùng kỳ ${cmp.label}` : `Tháng ${month.slice(5)}/${month.slice(0, 4)} · % là ${cmp.label}`} />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiTile
              label="Total GMV"
              value={shopCur ? fmtVndShort(shopCur.gmv) : "—"}
              change={shopCur && shopPrevSame ? pctChange(shopPrevSame.gmv, shopCur.gmv) : null}
              note={
                shopKpi
                  ? `${fmtPct(shopKpi.pct)} KPI ${fmtVndShort(shopKpi.target)}${shopKpi.partial ? ` · dự kiến ${fmtPct(shopKpi.projectedPct)}` : ""}`
                  : shopCur
                    ? "Shop Analytics — mọi kênh"
                    : "chưa có file Shop Analytics"
              }
            />
            <KpiTile
              label="LIVE GMV (agency)"
              value={fmtVndShort(liveCurStats.gmv)}
              change={pctChange(livePrevStats.gmv, liveCurStats.gmv)}
              note={shopCur && shopCur.gmv > 0 ? `${fmtPct((liveCurStats.gmv / shopCur.gmv) * 100)} tổng shop · ${liveCurStats.sessions} ca` : `${liveCurStats.sessions} ca`}
            />
            <KpiTile
              label="NMV (ước tính)"
              value={nmvRate != null ? fmtVndShort(liveCurStats.gmv * (1 - nmvRate / 100)) : "—"}
              note={nmvRate != null ? `trừ ${fmtPct(nmvRate)} — ${nmvSource}` : "chưa có tỷ lệ hoàn hủy (Rate Card) / Refund rate (Shop Analytics)"}
            />
            <KpiTile label="Giờ live" value={fmtHours(liveCurStats.hours)} change={pctChange(livePrevStats.hours, liveCurStats.hours)} note={`${liveCurStats.sessions} ca có số`} />
            <KpiTile label="GMV/giờ" value={liveCurStats.gmvPerHour != null ? fmtVndShort(liveCurStats.gmvPerHour) : "—"} change={pctChange(livePrevStats.gmvPerHour, liveCurStats.gmvPerHour)} />
          </div>

          <div className="rounded-xl p-4 space-y-3" style={{ background: PAL.panel, border: `1px solid ${PAL.gold}44` }}>
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
                <ol className="space-y-2.5 text-[14px] leading-relaxed list-decimal pl-5" style={{ color: PAL.cream }}>
                  {summaryLines.map((l, i) => (
                    <li key={i} className={i === 0 ? "font-bold" : undefined}>
                      {l}
                    </li>
                  ))}
                </ol>
                {canManage && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px]" style={{ borderTop: `1px solid ${PAL.line}`, color: PAL.muted }}>
                    <span>{narrativeEdited ? "Ops đã sửa đoạn này (kết luận + việc tháng sau)." : "Bản tự sinh từ số liệu — sửa trước khi phát hành nếu cần."}</span>
                    {narrativeStale && <span style={{ color: PAL.gold }}>Số liệu đã cập nhật sau lần sửa — đọc lại cho khớp số mới.</span>}
                    <button onClick={startEditNarrative} className="font-bold underline" style={{ color: PAL.gold }}>
                      Sửa kết luận & việc tháng sau
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

          {(kpiTargetGmvCur || shopKpi) && (
            <div className="rounded-xl p-4 flex flex-wrap items-end gap-6" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
              {kpiTargetGmvCur && (
                <div className="flex-1 min-w-[220px]">
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>Target GMV (live)</div>
                  <div className="font-mono text-xl font-bold mt-1" style={{ color: PAL.cream }}>{fmtVndShort(kpiTargetGmvCur)}</div>
                  <ProgressBar pct={(liveCurStats.gmv / kpiTargetGmvCur) * 100} />
                </div>
              )}
              {shopKpi && (
                <div className="flex-1 min-w-[220px]">
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>KPI GMV (brand giao · mọi kênh)</div>
                  <div className="font-mono text-xl font-bold mt-1" style={{ color: PAL.cream }}>
                    {fmtVndShort(shopKpi.actual)} / {fmtVndShort(shopKpi.target)}
                  </div>
                  <ProgressBar pct={shopKpi.pct} label="KPI GMV" />
                  {shopKpi.partial && (
                    <div className="text-[11px] mt-1 font-mono" style={{ color: shopKpi.projectedPct >= 100 ? PAL.green : shopKpi.projectedPct >= 90 ? PAL.gold : PAL.red }}>
                      Dự kiến cuối tháng {fmtVndShort(shopKpi.projected)} · {fmtPct(shopKpi.projectedPct)} ({shopKpi.method === "prev" ? "theo nhịp cùng kỳ tháng trước" : "chia đều theo ngày"})
                    </div>
                  )}
                </div>
              )}
              {kpiTargetGmvCur && runRate && runRate.doneCount > 0 && runRate.targetTotal > 0 && (
                <div className="flex-1 min-w-[220px] text-[12px] space-y-0.5" style={{ color: PAL.muted }}>
                  <div>
                    Run-rate ca đã xong:{" "}
                    <b style={{ color: runRate.runRate == null ? PAL.muted : runRate.runRate >= 1 ? PAL.green : runRate.runRate >= 0.9 ? PAL.gold : PAL.red }}>
                      {runRate.runRate == null ? "—" : `${fmtFixed(runRate.runRate * 100, 0)}%`}
                    </b>{" "}
                    ({runRate.doneCount} ca xong · {runRate.pendingCount} còn lại)
                  </div>
                  <div>
                    Dự kiến cuối tháng <b style={{ color: PAL.cream }}>{fmtVndShort(runRate.projected)}</b> — {runRate.gap > 0 ? "thiếu" : "vượt"}{" "}
                    <b style={{ color: runRate.gap > 0 ? PAL.red : PAL.green }}>{fmtVndShort(Math.abs(runRate.gap))}</b>
                  </div>
                </div>
              )}
            </div>
          )}
          {!kpiTargetGmvCur && !shopKpi && canManage && (
            <p className="text-[11px]" style={{ color: PAL.muted }}>
              Tháng {month.slice(5)} chưa có target chốt / KPI GMV ở Kế Hoạch Tháng — khi có, phần này hiện % Target và dự kiến cuối tháng.
            </p>
          )}
          <Panel title="LIVE GMV luỹ kế theo ngày" icon={<Activity className="w-4 h-4" />} sub={`Tháng ${month.slice(5)} so với tháng ${prevMonth.slice(5)} — cùng trục ngày`}>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativeData} margin={{ right: 12 }}>
                  <CartesianGrid stroke={PAL.line} vertical={false} />
                  <XAxis dataKey="day" stroke={PAL.muted} fontSize={10} interval={3} />
                  <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtVndShort(v)} width={70} />
                  <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(d) => `Ngày ${d}`} formatter={(v) => fmtVndShort(chartNum(v))} />
                  {cmp.partial && <ReferenceLine x={Number(cmp.curEnd.slice(8))} stroke={PAL.muted} strokeDasharray="3 3" />}
                  <Line type="monotone" dataKey="prev" name={`Tháng ${prevMonth.slice(5)}`} stroke={PAL.blue} strokeWidth={2} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="cur" name={`Tháng ${month.slice(5)}`} stroke={PAL.gold} strokeWidth={2} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend items={[[`Tháng ${prevMonth.slice(5)}`, PAL.blue], [`Tháng ${month.slice(5)}`, PAL.gold]]} />
          </Panel>
        </section>

        {/* ===== 2. Thị trường hay vận hành ===== */}
        <section id="mr-shop" className="space-y-4 scroll-mt-16">
          <SectionHead no="2" title="Thị trường hay vận hành" sub="So live agency với phần còn lại của shop — cùng thị trường, cùng kỳ" />
          {insightBox("shop")}
          <SectionDetail open={detailOpen("shop")} onOpen={() => openDetail("shop")}>
            {control.length > 0 && (
              <Panel
                title="Live agency so với phần còn lại của shop"
                icon={<Scale className="w-4 h-4" />}
                sub={`${cmp.label} · phần còn lại = affiliate, video, thẻ sản phẩm (cùng thị trường, không do agency vận hành) · lệch ≥ 10 điểm mới coi là khác thị trường`}
              >
                <ReportTable head={["Nhóm ngày", "Live agency", "Phần còn lại", "Lượt vào shop", "CVR shop", "Đọc là"]}>
                  {control.map((r, idx) => {
                    const v = controlVerdict(r);
                    return (
                      <tr key={r.key} style={rowStyle(idx)}>
                        <td className={`py-2 px-3 ${r.key === "all" ? "font-black" : "font-semibold"}`} style={{ color: PAL.gold }}>
                          {controlLabel(r.key)} <span className="font-normal text-[11px]" style={{ color: PAL.muted }}>· {r.days} ngày</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono" title={`${fmtVndShort(r.livePrev)} → ${fmtVndShort(r.liveCur)}`}>
                          {chgCell(r.liveChg)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" title={`${fmtVndShort(r.restPrev)} → ${fmtVndShort(r.restCur)}`}>
                          {chgCell(r.restChg)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{chgCell(r.visitorsChg)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {r.cvrPrev != null && r.cvrCur != null ? `${fmtPct(r.cvrPrev)} → ${fmtPct(r.cvrCur)}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold whitespace-nowrap" style={{ color: v === "ops" ? PAL.red : v === "agency_better" ? PAL.green : PAL.cream }}>
                          {v ? VERDICT_TEXT[v] : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </ReportTable>
                <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                  Live agency ở bảng này là cột "Linked account LIVE-attributed GMV" của Shop Analytics — cùng nguồn với phần còn lại để so công bằng
                  (lệch nhẹ với LIVE GMV tính từ ca). Rê chuột lên % để xem số tiền. CVR shop = Orders ÷ lượt vào shop.
                </p>
              </Panel>
            )}
            {channelMixes.every((c) => !c) ? (
              <p className="text-sm py-4" style={{ color: PAL.muted }}>Chưa có file Shop Analytics cho các tháng này ở Dữ Liệu Gốc.</p>
            ) : (
              <Panel title="Cơ cấu Total GMV theo kênh" icon={<PieChartIcon className="w-4 h-4" />} sub="4 tháng gần nhất — tỷ trọng trên tổng shop">
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelChartData} layout="vertical" stackOffset="expand" margin={{ left: 4, right: 12 }}>
                      <CartesianGrid stroke={PAL.line} horizontal={false} />
                      <XAxis type="number" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                      <YAxis type="category" dataKey="label" stroke={PAL.muted} fontSize={11} width={52} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtVndShort(chartNum(v))} />
                      {CHANNELS.map((c) => (
                        <Bar key={c.key} dataKey={c.key} name={c.label} stackId="ch" fill={c.color} stroke={PAL.panel} strokeWidth={2} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ChartLegend items={CHANNELS.map((c) => [c.label, c.color])} />
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] font-bold" style={{ color: PAL.gold }}>
                    Chi tiết theo tháng{cmp.partial ? ` (tháng ${month.slice(5)} tính tới ${cmp.curEnd.slice(8)}/${month.slice(5)})` : ""}
                  </summary>
                  <div className="mt-2">
                    <ReportTable head={["Tháng", "Total GMV", "LIVE GMV (agency)", "Tỷ trọng agency", "Affiliate LIVE", "Video", "Product card", "Refund rate"]}>
                      {channelMixes.map((c, idx) => {
                        const m = last4Months[idx];
                        const agencyLive = monthlyStats[idx].stats.gmv;
                        return (
                          <tr key={m} style={rowStyle(idx)}>
                            <td className="py-2 px-3 font-semibold" style={{ color: PAL.cream }}>{m.slice(5)}/{m.slice(2, 4)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{c ? fmtVndShort(c.shopGmv) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{agencyLive > 0 ? fmtVndShort(agencyLive) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.gold }}>{c && agencyLive > 0 ? fmtPct((agencyLive / c.shopGmv) * 100) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c ? fmtVndShort(c.affiliate) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c ? fmtVndShort(c.video) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c?.card != null ? fmtVndShort(c.card) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c?.refundRate != null ? fmtPct(c.refundRate) : "—"}</td>
                          </tr>
                        );
                      })}
                    </ReportTable>
                    <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                      LIVE GMV (agency) = tổng các ca có số trong app; Affiliate LIVE = GMV từ LIVE của creator affiliate (Shop Analytics). Refund rate = Refunds ÷ GMV
                      của cả shop trong kỳ.
                      {canManage && channelMixes.some((c) => c?.coverage != null && Math.abs(c.coverage - 100) > 2) && " Có tháng 4 kênh lệch tổng shop quá 2% — kiểm lại file Sản Phẩm / Shop Analytics của tháng đó."}
                    </p>
                  </div>
                </details>
              </Panel>
            )}
          </SectionDetail>
        </section>

        {/* ===== 3. Vì sao ===== */}
        <section id="mr-why" className="space-y-4 scroll-mt-16">
          <SectionHead no="3" title="Vì sao tăng / giảm" sub={`LIVE GMV = Giờ live × Views/giờ × LIVE CTR × CTOR × AOV · ${cmp.label}`} />
          {insightBox("why")}
          <SectionDetail open={detailOpen("why")} onOpen={() => openDetail("why")}>
            {drivers ? (
              <WaterfallPanel title="Mỗi thừa số góp bao nhiêu vào mức thay đổi" sub="5 phần cộng đúng mức thay đổi LIVE GMV (chia theo tỷ trọng log)" data={waterfallData} breakdown={drivers} />
            ) : (
              <p className="text-sm" style={{ color: PAL.muted }}>Chưa đủ số của cả 2 kỳ (Giờ live, Views, Product clicks, Orders) để tách nguyên nhân.</p>
            )}
            {dayGroups.some((g) => g.cur.sessions > 0 || g.prev.sessions > 0) && (
              <Panel title="Ngày thường vs ngày camp" icon={<Flame className="w-4 h-4" />} sub={`GMV/giờ và 4 thừa số · ${cmp.label} · mỗi tháng dùng khoảng camp của chính tháng đó`}>
                <ReportTable head={["Nhóm ngày", "Giờ live", METRIC.gmvPerHour, "±", ...RATE_FACTORS.map((k) => DRIVER_LABEL[k])]}>
                  {dayGroups.map((g, idx) => (
                    <tr key={g.key} style={rowStyle(idx)}>
                      <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{controlLabel(g.key)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtHours(g.prev.hours)} → {fmtHours(g.cur.hours)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>
                        {g.prev.gmvPerHour != null ? fmtVndShort(g.prev.gmvPerHour) : "—"} → <b>{g.cur.gmvPerHour != null ? fmtVndShort(g.cur.gmvPerHour) : "—"}</b>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">{chgCell(pctChange(g.prev.gmvPerHour, g.cur.gmvPerHour))}</td>
                      {RATE_FACTORS.map((k) => (
                        <td key={k} className="py-2 px-3 text-right font-mono">{chgCell(pctChange(g.prev[k], g.cur[k]))}</td>
                      ))}
                    </tr>
                  ))}
                </ReportTable>
                {mixRate && (
                  <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                    Tách ΔGMV/giờ ({signedMoney(mixRate.delta)}): do cơ cấu giờ live giữa các loại ngày {signedMoney(mixRate.mix)}, do hiệu suất trong từng loại
                    ngày {signedMoney(mixRate.rate)}.
                  </p>
                )}
              </Panel>
            )}
            <Panel
              title="Xu hướng 4 tháng"
              icon={<BarChart3 className="w-4 h-4" />}
              sub={trendDay ? `Mọi tháng cắt 1–${trendDay} để so cùng số ngày` : "Trọn từng tháng"}
            >
              <ReportTable head={["Chỉ số", ...trendStats.map((x) => trendColLabel(x.month)), "±"]}>
                {trendRows.map((r, idx) => {
                  const vals = trendValues(r);
                  const sig = r.goodWhenUp != null ? trendSignal(r.label, vals) : null;
                  return (
                    <tr key={r.label} style={rowStyle(idx)}>
                      <td className="py-2 px-3 whitespace-nowrap font-semibold" style={{ color: r.indent ? PAL.muted : PAL.cream, paddingLeft: r.indent ? 24 : undefined }} title={metricHint(r.label)}>
                        {r.label}
                        {sig && (
                          <span className="ml-2 text-[11px] font-bold" style={{ color: (sig.direction === "up") === r.goodWhenUp ? PAL.green : PAL.red }}>
                            {sig.direction === "up" ? "↑" : "↓"} {sig.streak} tháng
                          </span>
                        )}
                      </td>
                      {vals.map((v, i) => (
                        <td key={i} className={`py-2 px-3 text-right font-mono ${i === vals.length - 1 ? "font-bold" : ""}`} style={{ color: i === vals.length - 1 ? PAL.cream : PAL.muted }}>
                          {v != null ? r.fmt(v) : "—"}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right font-mono">{chgCell(pctChange(vals[2], vals[3]), r.goodWhenUp)}</td>
                    </tr>
                  );
                })}
              </ReportTable>
              <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                Dòng thụt vào là 4 thừa số nhân ra GMV/giờ. CTOR = Orders ÷ Product clicks. UPT live đổi theo quà tặng kèm (hàng dưới {fmtVndShort(GIFT_MAX_PRICE)}/món, đếm từ file
                Sản Phẩm) nên để trung tính; UPT bỏ quà mới phản ánh cách bán. "↓ N tháng" = N tháng liên tiếp cùng chiều, tổng lệch ≥ 10%.
              </p>
            </Panel>
          </SectionDetail>
        </section>

        {/* ===== 4. Sản phẩm ===== */}
        <section id="mr-products" className="space-y-4 scroll-mt-16">
          <SectionHead no="4" title="Sản phẩm" sub="Top SKU theo GMV, phần bán qua Seller LIVE, quà tặng, khuyến mãi" />
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
                      <tr key={r.name} style={rowStyle(idx)}>
                        <td className="py-2 px-3 font-mono whitespace-nowrap" style={{ color: PAL.gold }}>
                          {r.rank}
                          <span className="ml-1.5 text-[11px]" style={{ color: moved == null ? PAL.muted : moved > 0 ? PAL.green : moved < 0 ? PAL.red : PAL.muted }}>
                            {r.prevRank == null ? (skuMoveData.prevLimit != null ? `(ngoài top ${skuMoveData.prevLimit})` : "") : moved === 0 ? "(=)" : `(${r.prevRank} ${moved! > 0 ? "▲" : "▼"})`}
                          </span>
                        </td>
                        <td className="py-2 px-3" style={{ color: PAL.cream }}>{r.name}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(r.gmv)}</td>
                        <td className="py-2 px-3 text-right font-mono">{chgCell(r.gmvChange, true, 1)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.gmv > 0 ? fmtPct((r.gmvLive / r.gmv) * 100) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(r.orders)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.itemsSold != null ? fmtInt(r.itemsSold) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(r.ctr)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(r.ctor)}</td>
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
                      <tr key={s.name} style={rowStyle(idx)}>
                        <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>{idx + 1}</td>
                        <td className="py-2 px-3" style={{ color: PAL.cream }}>{s.name}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(s.gmv)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(s.gmvLive)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{s.gmv > 0 ? fmtPct((s.gmvLive / s.gmv) * 100) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(s.orders)}</td>
                      </tr>
                    ))}
                  </ReportTable>
                </div>
              )}
              {giftSliceCur?.hasAnyBatch && giftSliceCur.giftItems > 0 && (
                <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                  Quà tặng (hàng dưới {fmtVndShort(GIFT_MAX_PRICE)}/món) tháng này: {fmtInt(giftSliceCur.giftItems)} món ở {giftSliceCur.giftSkus} SKU —{" "}
                  {giftSliceCur.top.map(([name, items, price]) => `${shortSku(name)} ${fmtInt(items)} món ~${fmtVndShort(price)}`).join("; ")}.
                </p>
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
                  Không có chương trình nào chạy trọn trong tháng này. Chương trình vắt qua nhiều tháng bị loại vì cột GMV trong file TikTok là luỹ kế cả chương trình.
                </p>
              ) : (
                <ReportTable head={["#", "Chương trình", "Trạng thái", "GMV", "Orders", "AOV"]}>
                  {(topPromo.items ?? []).map((p, idx) => (
                    <tr key={p.name + idx} style={rowStyle(idx)}>
                      <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>{idx + 1}</td>
                      <td className="py-2 px-3" style={{ color: PAL.cream }}>{p.name}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${promoStatusLabel(p.status).color}22`, color: promoStatusLabel(p.status).color }}>
                          {promoStatusLabel(p.status).label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(p.gmv)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(p.orders)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(p.aov)}</td>
                    </tr>
                  ))}
                </ReportTable>
              )}
            </Panel>
          </SectionDetail>
        </section>

        {/* ===== 5. Host ===== */}
        <section id="mr-people" className="space-y-4 scroll-mt-16">
          <SectionHead no="5" title="Host" sub={`Cùng cách tính với Hiệu Suất Host của agency · so mặt bằng gộp ${relMonths} tháng, có khoảng tin cậy`} />
          {insightBox("people")}
          <SectionDetail open={detailOpen("people")} onOpen={() => openDetail("people")}>
            <HostPerformancePanel rows={hostDayType} team={hostDayTypeTeam} campDaysLabel={campDaysLabel} vsPeer={hostInsight.vsPeer} reliability={reliabilityByKey} relMonths={relMonths}>
              {canManage && hostQuality.reconciled < hostQuality.total && (
                <div className="mb-3">
                  {warnBox(
                    <>
                      {hostQuality.total} phiên: {hostQuality.reconciled} đã đối soát
                      {hostQuality.snapshot > 0 ? `, ${hostQuality.snapshot} số lúc giao ca (chờ đối soát cuối kỳ)` : ""}
                      {hostQuality.manual > 0 ? `, ${hostQuality.manual} talent tự khai (chưa có gì bảo chứng)` : ""}. Đối soát ở "Vận Hành Live → Đối Soát Số Liệu" trước khi phát hành report.
                    </>
                  )}
                </div>
              )}
              {unassignedHost && !canManage && (
                <p className="text-[11px] mb-3" style={{ color: PAL.muted }}>
                  {unassignedHost.sessionCount} ca ({fmtVndShort(unassignedHost.gmv)}) chưa ghi nhận host nên không nằm trong bảng.
                </p>
              )}
              {unassignedHost && canManage && (
                <div className="mb-3">
                  {warnBox(
                    <>
                      {unassignedHost.sessionCount} ca chưa gán host ({fmtVndShort(unassignedHost.gmv)} · {fmtFixed(unassignedHost.hours, 1)}h) không nằm trong bảng này — gán host cho ca để số về đúng người.
                    </>
                  )}
                </div>
              )}
              {snapshot.version < 3 && canManage && (
                <div className="mb-3">{warnBox(<>Số liệu này chốt trước khi report lưu trợ live — dòng "Giờ trợ live" đang trống. Bấm "Cập nhật số liệu" ở trên để có.</>)}</div>
              )}
            </HostPerformancePanel>
          </SectionDetail>
        </section>

        {/* ===== 6. Campaign & khung giờ ===== */}
        <section id="mr-context" className="space-y-4 scroll-mt-16">
          <SectionHead no="6" title="Campaign & khung giờ" sub="Mỗi khung so với chính khung đó tháng trước, khung giờ bắt đầu ca" />
          {insightBox("context")}
          <SectionDetail open={detailOpen("context")} onOpen={() => openDetail("context")}>
            <Panel title="Campaign — so với cùng khung tháng trước" icon={<Flame className="w-4 h-4" />} sub={`GMV tính từ ca · Target GMV: ${campTargetSource} · ${cmp.label} · mỗi tháng dùng khoảng ngày Campaign của chính tháng đó`}>
              <ReportTable head={["Khung", "Target GMV", "GMV", "% Target", prevColLabel, "± GMV", "GMV/giờ", "± GMV/giờ", "CTOR"]}>
                {campDetailRows.map((r, idx) => {
                  const none = r.cur.sessions === 0;
                  return (
                    <tr key={r.key} style={rowStyle(idx)}>
                      <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{r.label}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.target != null ? fmtVndShort(r.target) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                        {none ? <span style={{ color: PAL.muted, fontWeight: 400 }}>chưa có ca</span> : fmtVndShort(r.cur.gmv)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{!none && r.target ? fmtPct((r.cur.gmv / r.target) * 100) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.prev.sessions > 0 ? fmtVndShort(r.prev.gmv) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono">{chgCell(none ? null : pctChange(r.prev.gmv, r.cur.gmv), true, 1)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.cur.gmvPerHour != null ? fmtVndShort(r.cur.gmvPerHour) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono">{chgCell(none ? null : pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour), true, 1)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(r.cur.ctor)}</td>
                    </tr>
                  );
                })}
              </ReportTable>
            </Panel>
            <Panel title="Khung giờ bắt đầu ca" icon={<CalendarClock className="w-4 h-4" />} sub={`GMV/giờ · ${cmp.label}`}>
              <ReportTable head={["Khung giờ", "Sessions (trước → nay)", "GMV/giờ kỳ trước", "GMV/giờ kỳ này", "Thay đổi"]}>
                {slotRows.map((r, idx) => (
                  <tr key={r.key} style={rowStyle(idx)}>
                    <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{r.label}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.prev.n} → {r.cur.n}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.prev.gmvPerHour != null ? fmtVndShort(r.prev.gmvPerHour) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{r.cur.gmvPerHour != null ? fmtVndShort(r.cur.gmvPerHour) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{chgCell(pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour), true, 1)}</td>
                  </tr>
                ))}
              </ReportTable>
            </Panel>
            <details className="rounded-xl" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
              <summary className="cursor-pointer px-4 py-3 text-xs font-bold" style={{ color: PAL.gold }}>
                Diễn biến theo ngày & Top 10 phiên live
              </summary>
              <div className="p-4 pt-0 space-y-4">
                {dailyPerf?.hasAnyBatch && dailyChartData.length > 0 && (
                  <Panel title="GMV theo ngày" icon={<BarChart3 className="w-4 h-4" />} sub="Nguồn: Live Performance Core Stats">
                    <div style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dailyChartData}>
                          <CartesianGrid stroke={PAL.line} vertical={false} />
                          <XAxis dataKey="label" stroke={PAL.muted} fontSize={10} interval={2} />
                          <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtVndShort(v)} width={70} />
                          <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtVndShort(chartNum(v))} />
                          <Area type="monotone" dataKey="gmvLiveSession" name="Direct GMV" stroke={PAL.gold} fill={`${PAL.gold}33`} strokeWidth={2} />
                          <Line type="monotone" dataKey="gmvIndirect" name="Indirect GMV" stroke={PAL.blue} strokeWidth={2} strokeDasharray="4 3" dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <ChartLegend items={[["Direct GMV", PAL.gold], ["Indirect GMV", PAL.blue]]} />
                  </Panel>
                )}
                <Panel title="Top 10 phiên live theo GMV" icon={<ListOrdered className="w-4 h-4" />} sub={liveSource.source === "sessions" ? "Nguồn: ca có số trong app" : "Nguồn: file Creator Live Performance"}>
                  <ReportTable head={["#", "Bắt đầu", "Giờ live", "GMV", "GMV/giờ", "Orders", "Items sold", "Views", "Product CTR", "CTOR"]}>
                    {topSessions.map((s, idx) => (
                      <tr key={s.roomId ?? idx} style={rowStyle(idx)}>
                        <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>{idx + 1}</td>
                        <td className="py-2 px-3 font-mono" style={{ color: PAL.cream }}>{fmtSessionStart(s.startTime)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtHours(s.hours)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(s.gmv)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(s.gmvPerHour)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(s.orders)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(s.itemsSold)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(s.views)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(s.ctr)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(s.ctor)}</td>
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
              </div>
            </details>
          </SectionDetail>
        </section>

        {/* ===== 7. Tháng sau ===== */}
        <section id="mr-next" className="space-y-4 scroll-mt-16">
          <SectionHead no="7" title="Tháng sau" sub={`Việc agency làm + kế hoạch tháng ${nextMonth.slice(5)} từ Kế Hoạch Tháng`} />
          <div className="rounded-xl p-4" style={{ background: PAL.panel, border: `1px solid ${PAL.gold}44` }}>
            <div className="text-[11px] uppercase tracking-wider mb-2 font-bold" style={{ color: PAL.gold }}>Việc agency làm tháng sau</div>
            <ol className="space-y-2 text-[13.5px] leading-relaxed list-decimal pl-5" style={{ color: PAL.cream }}>
              {nextLines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          </div>
          <SectionDetail open={detailOpen("next")} onOpen={() => openDetail("next")}>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <KpiTile label={`Target GMV tháng ${nextMonth.slice(5)}`} value={nextPlan && nextPlan.targetGmv > 0 ? fmtVndShort(nextPlan.targetGmv) : "—"} note={nextPlan ? (nextPlan.status === "locked" ? "đã chốt" : "đang lên lịch") : "chưa lập kế hoạch"} />
              <KpiTile label="Sessions kế hoạch" value={nextPlan ? String(nextPlan.slotCount) : "—"} note={nextPlan ? "trong Kế Hoạch Tháng" : ""} />
              {nextPlanFull && nextPlanFull.plan.shopTargetGmv > 0 && (
                <KpiTile
                  label={`KPI GMV tháng ${nextMonth.slice(5)}`}
                  value={fmtVndShort(nextPlanFull.plan.shopTargetGmv)}
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
                      <tr key={a.key} style={rowStyle(idx)}>
                        <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{CAMP_DAY_BUCKET_LABEL[a.key]}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtPct(a.share)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{a.target > 0 ? fmtVndShort(a.target) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{a.slots}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtHours(a.hours)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{a.requiredGmvPerHour != null ? fmtVndShort(a.requiredGmvPerHour) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{actual != null ? fmtVndShort(actual) : "—"}</td>
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

        {/* Nội bộ ops — không phải một phần của report gửi brand. */}
        {canManage && (
          <div className="space-y-2 pt-2" style={{ borderTop: `1px solid ${PAL.line}` }}>
            <p className="text-[11px]" style={{ color: PAL.muted }}>
              Chỉ ops thấy: khung camp, kế hoạch phân bổ và affiliate tháng sau nhập ở tab <b>Nhập Ads & Ghi Chú</b>; bảng creator affiliate theo tháng ở trang <b>Affiliate</b>.
            </p>
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
          </div>
        )}
      </div>
    </div>
  );
};
