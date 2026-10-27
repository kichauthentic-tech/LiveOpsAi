import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, LayoutDashboard, Send } from "lucide-react";
import type { LiveSession } from "../../types";
import { fetchBrandBulletins } from "../../lib/db/brandBulletins";
import type { Bulletin } from "../../lib/brand/bulletin";
import { todayVn } from "../../lib/performance/brandCommitment";
import { addDays } from "../../lib/dateUtils";
import { channelTitle, platformOf, type ReportPlatform } from "../../lib/reportPlatform";
import { fmtVndShort } from "../../lib/format";
import { PageHeader } from "../common/PageHeader";
import { StatTile } from "../common/StatTile";

// CỔNG BRAND (21/10/2026, đề xuất "một thẻ kênh" — user chốt cả 4 điểm): role brand mở Dashboard thấy 4 khối — số tháng này (bản tin
// ops gửi), giờ live đã thực hiện so với cam kết, lịch 7 ngày tới, báo cáo tháng đã phát hành. Brand đã xem GMV từng phiên trong Seller Center,
// nên cổng chỉ mang thứ agency có. KHÔNG có nhãn "Rủi ro/Hụt target" hay xác suất (luật 4); KHÔNG tự tính số tháng chưa phát hành từ ca
// (bị che ở live_sessions_secure — 0107) — số trong tháng chỉ tới qua bản tin (0179).

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dmw = (d: string) => `${WD[new Date(`${d}T00:00:00`).getDay()]} ${dm(d)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hrs = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
const dmhm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const BrandPortal: React.FC<{
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  platforms: ReportPlatform[];
  sessions: LiveSession[];
  onOpenReport?: () => void;
}> = ({ brandId, brandName, platform, platforms, sessions, onOpenReport }) => {
  const today = todayVn();
  const month = today.slice(0, 7);
  const name = channelTitle(brandName, platform, platforms.length > 1);
  const [data, setData] = useState<{ key: string; rows: Bulletin[]; missing: boolean; error?: string } | null>(null);
  const key = `${brandId}|${platform}`;
  useEffect(() => {
    let alive = true;
    fetchBrandBulletins(brandId, platform)
      .then((r) => alive && setData({ key, ...r }))
      .catch(() => alive && setData({ key, rows: [], missing: false, error: "Chưa đọc được bản tin — thử tải lại trang." }));
    return () => { alive = false; };
  }, [brandId, platform, key]);
  const loaded = data?.key === key ? data : null;
  const latest = loaded?.rows.find((b) => b.month === month) ?? null;
  const p = latest?.payload;

  const mine = useMemo(() => sessions.filter((s) => s.brandId === brandId && platformOf(s) === platform && s.status !== "Cancelled"), [sessions, brandId, platform]);
  const weekEnd = addDays(today, 6);
  const week = mine.filter((s) => s.date >= today && s.date <= weekEnd).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const published = [...new Set(mine.filter((s) => s.monthPublished).map((s) => s.date.slice(0, 7)))].sort().reverse();

  return (
    <div className="space-y-5">
      <PageHeader icon={LayoutDashboard} title={`Tổng quan · ${name}`} description="Số tháng này YFB gửi, giờ live đã thực hiện so với cam kết, lịch 7 ngày tới và báo cáo tháng." />

      <section className="space-y-3" aria-label="Tháng này">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2"><Send className="w-4 h-4 text-[var(--accent-text)]" /> Tháng {Number(month.slice(5))}/{month.slice(0, 4)}</h3>
          {latest && <span className="text-xs text-[var(--text-faint)]">YFB gửi {dmhm(latest.publishedAt)}{p?.asOf ? ` · số tới ${p.lastShift ? `ca ${p.lastShift.startTime}–${p.lastShift.endTime} ${dm(p.lastShift.date)}` : dm(p.asOf)}` : ""}</span>}
        </div>
        {!loaded ? (
          <p className="text-sm text-[var(--text-faint)] px-1">Đang tải…</p>
        ) : loaded.error ? (
          <p className="text-sm text-rose-400 px-1">{loaded.error}</p>
        ) : !p ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--text-muted)]">YFB chưa gửi bản tin tháng này. Bản tin có số liệu đã đạt so kế hoạch, dự báo cuối tháng và giờ live đã thực hiện.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatTile frame="card" size="lg" label="Đã đạt" value={fmtVndShort(p.actual)} hint={p.target ? <>target tháng {fmtVndShort(p.target)}{p.runRate != null ? <> · <b className="text-[var(--text)]">{pct(p.runRate)}</b> so kế hoạch tới nay</> : ""}</> : "tháng này chưa có target kế hoạch"} />
              <StatTile frame="card" size="lg" label="Dự báo cuối tháng" value={p.forecast != null ? `~${fmtVndShort(p.forecast)}` : "—"} hint={p.forecast != null ? "theo lịch live còn lại và GMV/giờ gần đây" : "kênh mới, chưa đủ lịch sử để ước tính"} />
              <StatTile frame="card" size="lg" label="Giờ live đã thực hiện" value={p.hours ? `${hrs(p.hours.delivered)} / ${hrs(p.hours.committed)}` : "—"} hint={p.hours ? `cam kết hợp đồng · còn ${hrs(p.hours.scheduled)} trong lịch` : "chưa có cam kết giờ cho tháng này"}>
                {p.hours && p.hours.committed > 0 && (
                  <div className="relative h-2 mt-1.5 rounded bg-[var(--surface-base)]" role="img" aria-label={`Đã live ${hrs(p.hours.delivered)} trên ${hrs(p.hours.committed)} cam kết`}>
                    <div className="absolute inset-y-0 left-0 rounded bg-[var(--success)]" style={{ width: `${Math.min(100, (p.hours.delivered / p.hours.committed) * 100)}%` }} />
                  </div>
                )}
              </StatTile>
            </div>
            {latest!.note && <p className="rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--text)] whitespace-pre-wrap">{latest!.note}</p>}
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2" aria-label="Lịch 7 ngày tới">
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2"><CalendarDays className="w-4 h-4 text-[var(--accent-text)]" /> Lịch 7 ngày tới · {week.length} ca</h3>
          {week.length === 0 ? <p className="text-sm text-[var(--text-faint)]">Chưa có ca nào trong 7 ngày tới.</p> : (
            <ul className="divide-y divide-[var(--border)]">
              {week.map((s) => (
                <li key={s.id} className="grid grid-cols-[84px_100px_minmax(0,1fr)] gap-2 py-2 text-sm">
                  <span className="tabular-nums text-[var(--text-muted)]">{dmw(s.date)}</span>
                  <span className="tabular-nums text-[var(--text)]">{s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}</span>
                  <span className="truncate text-[var(--text)]">{s.hostName || "chưa xếp host"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2" aria-label="Báo cáo tháng">
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2"><FileText className="w-4 h-4 text-[var(--accent-text)]" /> Báo cáo tháng</h3>
          {published.length === 0 ? <p className="text-sm text-[var(--text-faint)]">Chưa có báo cáo tháng nào được phát hành.</p> : (
            <ul className="divide-y divide-[var(--border)]">
              {published.map((m) => (
                <li key={m} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-[var(--text)]">Tháng {Number(m.slice(5))}/{m.slice(0, 4)}</span>
                  {onOpenReport && <button type="button" onClick={onOpenReport} className="min-h-[28px] px-2.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)]">Mở Report Tháng</button>}
                </li>
              ))}
            </ul>
          )}
          {(loaded?.rows.filter((b) => b.month !== month).length ?? 0) > 0 && (
            <p className="text-xs text-[var(--text-faint)] pt-1">Bản tin các tháng trước: {loaded!.rows.filter((b) => b.month !== month).slice(0, 4).map((b) => `T${Number(b.month.slice(5))} (${dm(b.publishedAt.slice(0, 10))})`).join(", ")}</p>
          )}
        </section>
      </div>
    </div>
  );
};
