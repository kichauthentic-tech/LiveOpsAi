import React, { useState } from "react";
import { Users } from "lucide-react";
import { metricHint } from "../../../lib/metricGlossary";
import { HostReliability, reliabilityText } from "../../../lib/report/deepAnalysis";
import { fmtKeyMetric, KEY_METRICS, keyMetricValue } from "../../../lib/report/keyMetrics";
import { dayTypeMetrics, dayTypeDriverLines, sumDayTypeParts, vsTeam, HOST_DAY_TYPE_ORDER, MIN_SESSIONS_TO_COMPARE, DAY_TYPE_DIFF_THRESHOLD, HostDayTypeRow, DayTypePart, DayTypeMetrics } from "../../../lib/performance/hostPerformance";
import { CampDayBucket } from "../../../lib/dataraw/creatorLivePerfMetrics";

import { fmtFixed } from "../../../lib/format";
import { DAY_TYPE_SHORT, PAL } from "./theme";
import { fmtHours } from "./format";
import { Panel, ReportTable } from "./ui";

// Bảng Host PFM của Report Tháng (phần 5). Tách riêng vì một mình nó đã 183 dòng và có state cục bộ
// của chính nó (tab loại ngày), khác hẳn các component trình bày thuần ở ./ui.tsx.

// Phần 5 — MỘT bảng host duy nhất (2026-09-26 user: 3 bảng host chồng nhau "tùm lum quá"), đúng dạng
// bảng host của deck Crocs: chỉ số theo hàng × host theo cột + cột Cả team, tab Cả tháng / Daily /
// D-Day / Mid-Month / Pay Day. Dòng thụt vào là 4 thừa số nhân ra GMV/giờ. ▲▼ chỉ ở tab loại ngày (so
// Cả team CÙNG loại ngày, host ≥ MIN_SESSIONS_TO_COMPARE ca); tab Cả tháng so công bằng bằng dòng "So
// mặt bằng" (hostVsPeer) — so thẳng với team cả tháng thì host được xếp ca D-Day luôn thắng.
export type HostTab = "all" | CampDayBucket;

export const HostPerformancePanel: React.FC<{
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
  // Key Metrics (lib/report/keyMetrics.ts): 18 chỉ số + AOV, cùng thứ tự mọi report. Hai dòng "So mặt bằng" (kết luận
  // xếp hạng) đứng trên cùng; ▲▼ chỉ tô 5 thừa số của GMV/giờ.
  const CMP_KEYS = new Set<string>(["gmvPerHour", "viewsPerHour", "liveCtr", "ctor", "aov"]);
  const keyRows: Row[] = KEY_METRICS.map((d) => ({
    label: d.label,
    value: (m: DayTypeMetrics) =>
      d.key === "hours" ? `${fmtHours(m.hours)} · ${m.sessions} ca` : fmtKeyMetric(d, keyMetricValue(m, d.key)),
    cmp: CMP_KEYS.has(d.key) ? (d.key as Row["cmp"]) : undefined,
    bold: d.key === "gmvPerHour" || d.key === "gmv"
  }));
  const metricRows: Row[] = [
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
    ...keyRows,
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
