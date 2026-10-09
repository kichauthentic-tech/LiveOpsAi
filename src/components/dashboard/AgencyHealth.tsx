import React from "react";
import { CLIENT_CONCENTRATION_WARN, PERSON_CONCENTRATION_WARN, UNASSIGNED, hostKeyOf } from "../../lib/performance/ceoBrief";
import { expandHostPortions, isCountable, sessionHours } from "../../lib/performance/hostPerformance";
import type { LiveSession } from "../../types";
import type { DashModel } from "./model";
import { Card, SectionTitle, hrs, money, num, pct } from "./shared";

// Sức khoẻ agency (09/10/2026): rủi ro tập trung khách và người, lịch chưa đủ người, số chưa về. Chỉ số vận hành và tỷ trọng
// trong MỘT sàn — không cộng GMV giữa TikTok và Shopee (mỗi sàn một khối Dashboard).

type Tone = "good" | "warn" | "bad";
const TONE: Record<Tone, string> = { good: "text-emerald-400", warn: "text-amber-300", bad: "text-rose-400" };

const Tile: React.FC<{ label: string; value: string; tone: Tone; sub: React.ReactNode; action?: { label: string; tab: string }; onNavigate: (tab: string) => void }> = ({ label, value, tone, sub, action, onNavigate }) => (
  <Card className="!p-4 space-y-1 min-w-0">
    <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">{label}</p>
    <p className={`text-2xl font-black ${TONE[tone]}`}>{value}</p>
    <p className="text-xs text-[var(--text-faint)] leading-snug">{sub}</p>
    {action && <button onClick={() => onNavigate(action.tab)} className="min-h-6 -mx-1 px-1 rounded inline-flex items-center text-xs font-bold text-[var(--accent-text)] hover:underline">{action.label} →</button>}
  </Card>
);

export const AgencyHealth: React.FC<{ m: DashModel; curSessions: LiveSession[]; onNavigate: (tab: string) => void }> = ({ m, curSessions, onNavigate }) => {
  // Tập trung khách: tỷ trọng GMV tháng của brand lớn nhất trong sàn này.
  const brandGmv = m.brands.map((b) => ({ b, g: m.outlooks.get(b.id)?.actual ?? 0 })).filter((x) => x.g > 0).sort((a, z) => z.g - a.g);
  const totalGmv = brandGmv.reduce((a, x) => a + x.g, 0);
  const topClient = brandGmv[0];
  const clientShare = topClient && totalGmv > 0 ? topClient.g / totalGmv : null;

  // Tập trung người: tỷ trọng giờ live của host nhiều giờ nhất trong kỳ đang xem.
  const hours = new Map<string, { name: string; h: number }>();
  let totalH = 0;
  for (const s of expandHostPortions(curSessions.filter(isCountable))) {
    const h = sessionHours(s);
    totalH += h;
    const k = hostKeyOf(s);
    if (k === UNASSIGNED) continue;
    const e = hours.get(k) ?? { name: s.hostName, h: 0 };
    e.h += h;
    hours.set(k, e);
  }
  const topHost = [...hours.values()].sort((a, z) => z.h - a.h)[0];
  const hostShare = topHost && totalH > 0 ? topHost.h / totalH : null;

  // Lịch chưa đủ người: ca từ hôm nay tới cuối tháng chưa có host, chưa có trợ live, và ca còn mở.
  const upcoming = m.scopeSessions.filter((s) => s.date >= m.today && s.date.startsWith(m.month) && s.status !== "Cancelled");
  const noHost = upcoming.filter((s) => !s.hostId && !s.hostName).length;
  const noAssistant = upcoming.filter((s) => !s.coHostId && !s.coHostName).length;
  const openSlots = [...m.outlooks.entries()].filter(([id]) => m.scopeIds.includes(id)).reduce((a, [, o]) => a + o.pending.filter((p) => p.kind === "open_slot").length, 0);
  const unstaffed = noHost + openSlots;
  const unstaffedGmv = [...m.outlooks.entries()].filter(([id]) => m.scopeIds.includes(id)).reduce((a, [, o]) => a + o.pending.filter((p) => p.kind === "open_slot").reduce((x, p) => x + p.forecast, 0), 0);

  // Số chưa về: ca đã quá ngày mà chưa có số.
  const missing = [...m.outlooks.entries()].filter(([id]) => m.scopeIds.includes(id)).reduce((a, [, o]) => a + o.pending.filter((p) => p.kind === "session" && p.date < m.today).length, 0);

  return (
    <section className="space-y-3">
      <SectionTitle title="Rủi ro vận hành" note={`Tháng ${Number(m.month.slice(5))} · mốc an toàn: một khách không quá ${Math.round(CLIENT_CONCENTRATION_WARN * 100)}% GMV sàn, một người không quá ${Math.round(PERSON_CONCENTRATION_WARN * 100)}% giờ live`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile
          label="Tập trung khách"
          value={clientShare != null && brandGmv.length > 1 ? pct(clientShare) : "—"}
          tone={clientShare == null || brandGmv.length < 2 ? "good" : clientShare > 0.5 ? "bad" : clientShare > CLIENT_CONCENTRATION_WARN ? "warn" : "good"}
          sub={brandGmv.length > 1 && topClient ? `${topClient.b.name} chiếm ${pct(clientShare)} GMV sàn này tháng nay (${money(topClient.g)} / ${money(totalGmv)}). Khách này rút là hụt cả nhóm.` : "Sàn này chỉ có một khách có số — chưa có gì để so tỷ trọng."}
          onNavigate={onNavigate}
        />
        <Tile
          label="Tập trung người"
          value={hostShare != null ? pct(hostShare) : "—"}
          tone={hostShare == null ? "good" : hostShare > PERSON_CONCENTRATION_WARN ? "warn" : "good"}
          sub={topHost && hostShare != null ? `${topHost.name} gánh ${hrs(topHost.h)} trong kỳ đang xem. ${hostShare > PERSON_CONCENTRATION_WARN ? "Người này nghỉ là hụt một phần lớn lịch — cần host dự phòng." : "Chưa vượt mốc."}` : "Kỳ này chưa có ca có host để tính."}
          action={hostShare != null && hostShare > PERSON_CONCENTRATION_WARN ? { label: "Mở Hiệu Suất Host", tab: "host_performance" } : undefined}
          onNavigate={onNavigate}
        />
        <Tile
          label="Lịch chưa đủ người"
          value={num(unstaffed)}
          tone={unstaffed === 0 ? "good" : unstaffedGmv > 0 ? "bad" : "warn"}
          sub={`${noHost} ca chưa có host, ${openSlots} ca còn mở, ${noAssistant} ca chưa có trợ live (từ hôm nay tới cuối tháng).${unstaffedGmv > 0 ? ` Ca mở đang nằm trong dự phóng: ${money(unstaffedGmv)} GMV rủi ro.` : ""}`}
          action={unstaffed > 0 || noAssistant > 0 ? { label: "Mở Bảng Vận Hành", tab: "calendar" } : undefined}
          onNavigate={onNavigate}
        />
        <Tile
          label="Ca đã chạy chưa có số"
          value={num(missing)}
          tone={missing === 0 ? "good" : "bad"}
          sub={missing === 0 ? "Mọi ca đã chạy đều có số." : "Dự phóng và run-rate đang tạm tính phần này theo GMV/giờ gần đây. Up file giao ca hoặc đối soát để có số thật."}
          action={missing > 0 ? { label: "Mở Sổ Ca", tab: "sessions" } : undefined}
          onNavigate={onNavigate}
        />
      </div>
    </section>
  );
};
