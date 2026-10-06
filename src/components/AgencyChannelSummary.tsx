import React, { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import type { Brand, BrandChannel, BrandPlatformRate, BrandPlatformRateHistoryEntry, LiveSession, SessionFinance, Talent, TalentRateHistoryEntry } from "../types";
import { computeSessionPnl } from "../lib/pnl";
import { financeOf, type PnlFn } from "../lib/performance/ceoBrief";
import { isCountable, sessionHours } from "../lib/performance/hostPerformance";
import { channelsOfBrand } from "../lib/channels";
import { sumGmvByPlatform } from "../lib/platforms/perf";
import { profileOf } from "../lib/platforms/profiles";
import { platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { defaultViewMonth } from "../lib/defaultMonth";
import { getTodayDate } from "../lib/dateUtils";
import { fmtMonth, fmtVndShort } from "../lib/format";
import { MonthPicker } from "./common/MonthPicker";
import { PlatformChip } from "./common/PlatformChip";

// Toàn agency một tháng (Bước 3 lộ trình đa sàn, 07/10) — đầu Dashboard khi chọn "Tất cả kênh". Luật user chốt 07/10:
// số VẬN HÀNH (ca, giờ) và TIỀN của agency (doanh thu, lãi) cộng được qua mọi kênh; số HIỆU SUẤT (GMV, đơn…) chỉ theo từng kênh,
// cộng tối đa trong MỘT sàn — không có ô GMV toàn agency. Chi tiết từng sàn ở các khối bên dưới.

interface Props {
  platforms: ReportPlatform[];
  channels: BrandChannel[];
  brands: Brand[];
  sessions: LiveSession[];
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  talents: Talent[];
  talentRateHistory: TalentRateHistoryEntry[];
  canSeeMoney: boolean;
}

const hrs = (h: number) => `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;

export function AgencyChannelSummary({ platforms, channels, brands, sessions, financeRecords, brandPlatformRates, brandPlatformRateHistory, talents, talentRateHistory, canSeeMoney }: Props) {
  const today = getTodayDate();
  const [month, setMonth] = useState(() => defaultViewMonth(today, sessions));
  const inMonth = useMemo(() => sessions.filter((s) => s.date.startsWith(month) && s.status !== "Cancelled"), [sessions, month]);

  const pnl: PnlFn = useMemo(() => {
    const financeBySessionId = Object.fromEntries(financeRecords.map((f) => [f.sessionId, f]));
    const talentById = Object.fromEntries(talents.map((t) => [t.id, t]));
    const brandById = Object.fromEntries(brands.map((b) => [b.id, b]));
    return (s: LiveSession) => {
      const r = computeSessionPnl(s, financeBySessionId, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory);
      return { revenue: r.grossAgencyRev, cost: r.grossAgencyRev - r.netProfit, profit: r.netProfit, missing: r.missingInputs };
    };
  }, [financeRecords, talents, brands, brandPlatformRates, talentRateHistory, brandPlatformRateHistory]);

  // Một dòng mỗi kênh đang có ca trong tháng (hoặc đang chạy).
  const rows = useMemo(
    () =>
      brands
        .flatMap((b) => channelsOfBrand(channels, b.id).map((c) => ({ b, c })))
        .map(({ b, c }) => {
          const own = inMonth.filter((s) => s.brandId === b.id && platformOf(s) === c.platform);
          const countable = own.filter(isCountable);
          return {
            key: `${b.id}|${c.platform}`,
            brand: b,
            platform: c.platform,
            paused: c.status === "paused",
            sessions: own.length,
            done: countable.length,
            hours: countable.reduce((a, s) => a + sessionHours(s), 0),
            gmv: sumGmvByPlatform(countable)[c.platform],
            fin: canSeeMoney ? financeOf(own, pnl) : null
          };
        })
        .filter((r) => r.sessions > 0 || !r.paused),
    [brands, channels, inMonth, canSeeMoney, pnl]
  );

  const totalSessions = rows.reduce((a, r) => a + r.sessions, 0);
  const totalHours = rows.reduce((a, r) => a + r.hours, 0);
  const money = canSeeMoney ? financeOf(inMonth, pnl) : null;
  const gmvByPlatform = sumGmvByPlatform(inMonth.filter(isCountable));

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-4 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black text-[var(--text)]">
            <Building2 className="w-4 h-4 text-[var(--accent-text)]" /> Toàn agency · tháng {fmtMonth(month)}
          </h2>
          <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
            Ca, giờ và tiền cộng qua mọi kênh. GMV chỉ cộng trong cùng một sàn — hai sàn khác định nghĩa GMV: {platforms.map((p) => profileOf(p).gmvDefinition).join("; ")}.
          </p>
        </div>
        <MonthPicker value={month} onChange={setMonth} ariaLabel="Tháng" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Ca trong tháng" value={totalSessions.toLocaleString("vi-VN")} sub={`gồm ca sắp tới · ${rows.filter((r) => r.sessions > 0).length} kênh có ca`} />
        <Tile label="Giờ live (ca có số)" value={hrs(totalHours)} />
        {canSeeMoney && money && (
          <>
            <Tile label="Doanh thu agency" value={money.priced ? fmtVndShort(money.revenue) : "Chưa tính được"} sub={money.sessions ? `${money.priced}/${money.sessions} ca đủ dữ liệu tiền` : undefined} />
            <Tile label="Lãi gộp" value={money.priced ? fmtVndShort(money.profit) : "Chưa tính được"} sub={money.margin != null ? `biên ${Math.round(money.margin * 100)}%` : "nhập giá ở CRM, rate ở Talent Pool"} />
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-faint)] border-b border-[var(--border)]">
              <th className="py-2 pr-3">Kênh</th>
              <th className="py-2 pr-3 text-right">Ca</th>
              <th className="py-2 pr-3 text-right">Giờ live</th>
              <th className="py-2 pr-3 text-right">GMV (của kênh)</th>
              {canSeeMoney && <th className="py-2 pr-3 text-right">Doanh thu agency</th>}
              {canSeeMoney && <th className="py-2 pr-3 text-right">Lãi gộp</th>}
            </tr>
          </thead>
          <tbody>
            {platforms.map((p) => (
              <React.Fragment key={p}>
                {rows
                  .filter((r) => r.platform === p)
                  .map((r) => (
                    <tr key={r.key} className="border-b border-[var(--border-muted)]">
                      <td className="py-2 pr-3 font-bold text-[var(--text)] whitespace-nowrap">
                        {r.brand.name} <PlatformChip platform={r.platform} />
                        {r.paused && <span className="ml-1.5 text-[11px] font-normal text-amber-300">tạm dừng</span>}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{r.sessions || "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.hours > 0 ? hrs(r.hours) : "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono font-bold text-[var(--text)]">{r.gmv > 0 ? fmtVndShort(r.gmv) : "—"}</td>
                      {canSeeMoney && <td className="py-2 pr-3 text-right font-mono">{r.fin?.priced ? fmtVndShort(r.fin.revenue) : "—"}</td>}
                      {canSeeMoney && <td className="py-2 pr-3 text-right font-mono">{r.fin?.priced ? fmtVndShort(r.fin.profit) : "—"}</td>}
                    </tr>
                  ))}
                <tr className="border-b border-[var(--border)] bg-[var(--surface-elevated)]/40 text-[var(--text-muted)]">
                  <td className="py-1.5 pr-3 text-[11px] font-bold">Cộng {p}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{rows.filter((r) => r.platform === p).reduce((a, r) => a + r.sessions, 0) || "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{hrs(rows.filter((r) => r.platform === p).reduce((a, r) => a + r.hours, 0))}</td>
                  <td className="py-1.5 pr-3 text-right font-mono font-bold">{gmvByPlatform[p] > 0 ? fmtVndShort(gmvByPlatform[p]) : "—"}</td>
                  {canSeeMoney && <td className="py-1.5 pr-3" />}
                  {canSeeMoney && <td className="py-1.5 pr-3" />}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-3">
      <p className="text-[11px] uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
      <p className="text-lg font-black text-[var(--text)] mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{sub}</p>}
    </div>
  );
}
