import React, { useEffect, useMemo, useState } from "react";
import { LineChart } from "lucide-react";
import { LiveSession } from "../types";
import { BACKTEST_DAYS, ForecastParams, backtestMonthForecast, buildMonthForecaster, leadingSignalCheck, schemeShareOf, LEADING_MIN_MONTHS } from "../lib/performance/monthForecast";
import { nextMonthOf } from "../lib/performance/ceoBrief";
import { isCountable } from "../lib/performance/hostPerformance";
import { REPORT_PLATFORMS, platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { fetchForecastSnapshots, type ForecastSnapshot } from "../lib/db/forecastSnapshots";
import { fetchChannelAdsBudgets } from "../lib/db/monthPlans";
import { fmtFixed, fmtVndShort } from "../lib/format";

// AI Training Center — thẻ "Dự báo GMV tháng (engine target v3)". Phần tính ở lib/performance/monthForecast.ts; thẻ chỉ hiển thị:
// engine đang nghĩ gì về tháng tới, 4 chỉ số theo dõi (backtest walk-forward tính ngay khi vặn tham số), sổ dự báo đã ghi (0163) và
// phép đo tín hiệu dẫn (Ads, scheme — bước 4, chỉ kết luận khi đủ 3 tháng).

interface Props {
  brandId: string;
  /** Ca đã lọc cờ loại khỏi báo cáo. Thẻ tự lọc theo brand + sàn. */
  sessions: LiveSession[];
  /** Tham số ĐANG SỬA (chưa lưu). */
  params: ForecastParams;
  today: string;
  /** Scheme khuyến mãi của brand đang chọn. */
  schemes: { start: string; end: string }[];
}

const pct = (v: number | null | undefined, sign = false) => (v == null || !Number.isFinite(v) ? "—" : `${sign && v > 0 ? "+" : ""}${fmtFixed(v * 100, 1)}%`);
const tone = (v: number | null | undefined, ok: number) => (v == null ? "text-[var(--text-faint)]" : Math.abs(v) <= ok ? "text-emerald-400" : Math.abs(v) <= ok * 2 ? "text-amber-400" : "text-rose-400");
const BUCKET_LABEL = { daily: "Ngày thường", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" } as const;

export const ForecastTrainingCard: React.FC<Props> = ({ brandId, sessions, params, today, schemes }) => {
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);
  const platforms = useMemo(() => REPORT_PLATFORMS.filter((p) => brandSessions.some((s) => platformOf(s) === p)), [brandSessions]);
  const [picked, setPicked] = useState<{ brandId: string; platform: ReportPlatform } | null>(null);
  const platform: ReportPlatform | null = picked && picked.brandId === brandId && platforms.includes(picked.platform) ? picked.platform : platforms[0] ?? null;
  const channel = useMemo(() => (platform ? brandSessions.filter((s) => platformOf(s) === platform) : []), [brandSessions, platform]);

  const nextMonth = nextMonthOf(today.slice(0, 7));
  const fc = useMemo(() => (channel.length ? buildMonthForecaster(channel, nextMonth, params) : null), [channel, nextMonth, params]);
  const bt = useMemo(() => backtestMonthForecast(channel, params, today), [channel, params, today]);

  const [ledger, setLedger] = useState<{ key: string; rows: ForecastSnapshot[]; missing: boolean; error?: string } | null>(null);
  const [ads, setAds] = useState<{ key: string; map: Map<string, number> } | null>(null);
  const key = `${brandId}|${platform}`;
  useEffect(() => {
    if (!platform) return;
    let alive = true;
    fetchForecastSnapshots(brandId, platform)
      .then((r) => alive && setLedger({ key, ...r }))
      .catch((e) => alive && setLedger({ key, rows: [], missing: false, error: String(e?.message ?? e) }));
    fetchChannelAdsBudgets(brandId, platform).then((m) => alive && setAds({ key, map: m })).catch(() => alive && setAds({ key, map: new Map() }));
    return () => { alive = false; };
  }, [brandId, platform, key]);

  // GMV của từng tháng (ca có số) — để chấm các dòng sổ.
  const actualByMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of channel) if (isCountable(s) && !s.excludedFromReports) m.set(s.date.slice(0, 7), (m.get(s.date.slice(0, 7)) ?? 0) + (s.actualGmv ?? 0));
    return m;
  }, [channel]);
  const ledgerMonths = useMemo(() => {
    if (!ledger || ledger.key !== key) return [];
    const by = new Map<string, ForecastSnapshot[]>();
    for (const r of ledger.rows) (by.get(r.month) ?? by.set(r.month, []).get(r.month)!).push(r);
    return [...by.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, rows]) => {
      const done = month < today.slice(0, 7);
      const actual = done ? actualByMonth.get(month) ?? null : null;
      const plan = rows.find((r) => r.kind === "plan") ?? null;
      const daily = rows.filter((r) => r.kind === "daily");
      const at = (d: number) => [...daily].reverse().find((r) => Number(r.asOf.slice(8)) <= d) ?? null;
      const err = (r: ForecastSnapshot | null) => (r && actual ? r.p50 / actual - 1 : null);
      return { month, done, actual, plan, planErr: err(plan), days: daily.length, at: Object.fromEntries(BACKTEST_DAYS.map((d) => [d, err(at(d))])) as Record<number, number | null>, last: daily[daily.length - 1] ?? null };
    });
  }, [ledger, key, today, actualByMonth]);

  const leading = useMemo(() => {
    const adsMap = ads && ads.key === key ? ads.map : new Map<string, number>();
    // Lệch lúc lập: ưu tiên sổ (dự báo thật đã nói), thiếu thì lấy backtest.
    const months = bt.folds.map((f) => {
      const l = ledgerMonths.find((x) => x.month === f.month && x.planErr != null);
      return { month: f.month, planError: l?.planErr ?? f.planError, adsBudget: adsMap.get(f.month) ?? null, schemeShare: schemeShareOf(f.month, schemes) };
    });
    return leadingSignalCheck(months);
  }, [ads, key, bt, ledgerMonths, schemes]);

  const kpis = [
    { label: "Sai số dự báo ở ngày 18", goal: "≤ 5% mọi tháng", value: bt.within5AtDay18.of ? `${bt.within5AtDay18.hit}/${bt.within5AtDay18.of} tháng` : "—", sub: `trung bình ${pct(bt.inMonthMape[18])}`, good: bt.within5AtDay18.of > 0 && bt.within5AtDay18.hit === bt.within5AtDay18.of },
    { label: "Lệch hệ thống 3 tháng", goal: "trong ±5%", value: pct(bt.bias, true), sub: "dự báo lúc lập ÷ thực tế − 1", good: bt.bias != null && Math.abs(bt.bias) <= 0.05 },
    { label: "Đạt ≥ 95% target (3 mốc)", goal: "mọi tháng", value: bt.reach95.of ? `${bt.reach95.hit}/${bt.reach95.of} tháng` : "—", sub: `mô phỏng, bù tối đa +${Math.round(params.fcCheckpointCap * 100)}% giờ`, good: bt.reach95.of > 0 && bt.reach95.hit === bt.reach95.of },
    { label: "Rơi trong dải ~80%", goal: "≈ 80% số tháng", value: bt.coverage.of ? `${bt.coverage.hit}/${bt.coverage.of} tháng` : "—", sub: `lúc lập, sai lúc lập TB ${pct(bt.planMape)}`, good: bt.coverage.of > 0 && bt.coverage.hit / bt.coverage.of >= 0.7 }
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3" data-testid="forecast-training-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5"><LineChart className="w-4 h-4 text-[var(--accent-text)]" /> Dự báo GMV tháng — engine v3</h3>
        {platforms.length > 1 && (
          <div className="flex gap-1">
            {platforms.map((p) => (
              <button key={p} onClick={() => setPicked({ brandId, platform: p })} className={`px-2.5 min-h-6 rounded-lg text-xs font-bold border ${p === platform ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)] text-[var(--text)]"}`}>{p}</button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
        Dự báo ca = mức × (giờ × loại ngày × khung giờ × vị trí ngày) — cùng mô hình với bộ chia target. Mức = trung bình nhân của {params.fcRecentDays} ngày gần nhất và 3 tháng gần nhất. Trong tháng, mức cập nhật bằng GMV đã có ÷ kỳ vọng của chính các ca đã có số. Dùng ở Kế Hoạch Tháng (dự báo lưới), Dashboard, run-rate, Hỗ Trợ Vận Hành.
      </p>

      {!platform || channel.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Brand chưa có ca nào có số — chưa có gì để dự báo.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-2.5">
                <p className="text-[11px] text-[var(--text-faint)] leading-tight">{k.label} <span className="text-[var(--text-faint)]">· mục tiêu {k.goal}</span></p>
                <p className={`text-sm font-black mt-0.5 ${k.good ? "text-emerald-400" : "text-[var(--text)]"}`}>{k.value}</p>
                <p className="text-[11px] text-[var(--text-faint)]">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="text-xs space-y-1">
            <p className="font-bold text-[var(--text-muted)]">Tháng {Number(nextMonth.slice(5))} engine đang nghĩ gì</p>
            {!fc ? (
              <p className="text-[var(--text-muted)]">Chưa đủ lịch sử (cần ≥ 15 ca có số) — Kế Hoạch Tháng dùng engine cũ, Dashboard dùng GMV/giờ 28 ngày.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                  {fc.levelMonths.slice(-4).map((p) => <span key={p.month} className="text-[var(--text-muted)]">Mức T{Number(p.month.slice(5))}: <b className="text-[var(--text)]">{fmtVndShort(p.level)}</b> <span className="text-[var(--text-faint)]">({p.sessions} ca)</span></span>)}
                  {fc.levelRecent != null && <span className="text-[var(--text-muted)]">{params.fcRecentDays} ngày gần nhất: <b className="text-[var(--text)]">{fmtVndShort(fc.levelRecent)}</b></span>}
                  <span className="text-[var(--text-muted)]">Dùng: <b className="text-[var(--accent-text)]">{fmtVndShort(fc.level)}</b>/giờ quy chuẩn</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">Dải ~80% lúc lập: <b className="text-[var(--text)]">±{Math.round(fc.band * 100)}%</b> ({fc.big ? "kênh đủ lịch sử" : "kênh ít lịch sử"}) · giờ/ngày p90 đã thấy: {(["daily", "dday", "midmonth", "payday"] as const).map((b) => `${BUCKET_LABEL[b]} ${Number.isFinite(fc.dayHoursP90[b]) ? `${fmtFixed(fc.dayHoursP90[b], 1)}h` : "—"}`).join(" · ")}</p>
                {fc.pastErrors.length > 0 && (
                  <p className="text-[11px] text-[var(--text-muted)]">Lệch lúc lập các tháng trước: {fc.pastErrors.map((e) => <b key={e.month} className={`${tone(e.error, 0.05)} mr-1.5`}>T{Number(e.month.slice(5))} {pct(e.error, true)}</b>)}{fc.biasFactor !== 1 ? `— đang tự hiệu chỉnh ×${fmtFixed(fc.biasFactor, 2)}` : params.fcBiasCorrect ? "— chưa đủ điều kiện tự hiệu chỉnh" : "— tự hiệu chỉnh đang tắt"}</p>
                )}
                {fc.mostlyManual && <p className="text-[11px] text-amber-300">Lịch sử chủ yếu là số nhập tay (chưa đối soát) — độ tin thấp hơn.</p>}
              </>
            )}
          </div>

          <div className="text-xs">
            <p className="font-bold text-[var(--text-muted)] mb-1">Backtest: chỉ dùng dữ liệu trước mỗi tháng</p>
            {bt.folds.length === 0 ? (
              <p className="text-[var(--text-muted)]">Chưa có tháng nào đã hết với ≥ 10 ca và lịch sử trước nó.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[var(--text-faint)] text-right">
                      <th className="text-left font-normal py-1">Tháng</th>
                      <th className="font-normal px-1.5">GMV</th>
                      <th className="font-normal px-1.5" title="Dữ liệu tới ngày 20 tháng trước; lịch = ca đã thực sự chạy">Lúc lập</th>
                      {BACKTEST_DAYS.map((d) => <th key={d} className="font-normal px-1.5">Ngày {d}</th>)}
                      <th className="font-normal px-1.5" title="Target = dự báo lúc lập; 3 mốc bù giờ; GMV cuối ÷ target − 1">3 mốc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bt.folds.map((f) => (
                      <tr key={f.month} className="border-t border-[var(--border)] text-right">
                        <td className="text-left py-1 text-[var(--text)]">T{Number(f.month.slice(5))}/{f.month.slice(2, 4)} <span className="text-[var(--text-faint)]">({f.sessions} ca)</span></td>
                        <td className="px-1.5 text-[var(--text)]">{fmtVndShort(f.actual)}</td>
                        <td className={`px-1.5 ${tone(f.planError, 0.1)}`}>{pct(f.planError, true)}{f.inBand ? "" : " ⚠"}</td>
                        {BACKTEST_DAYS.map((d) => <td key={d} className={`px-1.5 ${tone(f.inMonth[d], 0.05)}`}>{pct(f.inMonth[d], true)}</td>)}
                        <td className={`px-1.5 ${f.simulated == null ? "text-[var(--text-faint)]" : f.simulated >= -0.05 ? "text-emerald-400" : "text-rose-400"}`}>{pct(f.simulated, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] text-[var(--text-faint)] leading-snug">Số = dự báo ÷ GMV cuối tháng − 1 (xanh: trong ±5% với cột ngày, ±10% với lúc lập). ⚠ = rơi ngoài dải ~80%. Backtest dùng lịch đã chạy làm lịch kế hoạch nên lạc quan hơn đời thật — sổ bên dưới là số đã nói thật.</p>
              </div>
            )}
          </div>

          <div className="text-xs">
            <p className="font-bold text-[var(--text-muted)] mb-1">Sổ dự báo đã ghi</p>
            {!ledger || ledger.key !== key ? (
              <p className="text-[var(--text-faint)]">Đang tải…</p>
            ) : ledger.missing ? (
              <p className="text-amber-300">DB chưa chạy migration 0163 (forecast_snapshots) — chưa ghi được sổ. Chạy SQL trong Supabase; Dashboard và nút Chốt tự ghi từ đó.</p>
            ) : ledger.error ? (
              <p className="text-rose-300">Không đọc được sổ: {ledger.error}</p>
            ) : ledgerMonths.length === 0 ? (
              <p className="text-[var(--text-muted)]">Chưa có dòng nào. Sổ tự ghi khi ceo/ops/admin mở Dashboard tháng này (mỗi kênh một dòng/ngày) và khi Chốt Kế Hoạch Tháng (dự báo lúc lập).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[var(--text-faint)] text-right">
                      <th className="text-left font-normal py-1">Tháng</th>
                      <th className="font-normal px-1.5">Lúc chốt</th>
                      {BACKTEST_DAYS.map((d) => <th key={d} className="font-normal px-1.5">Ngày {d}</th>)}
                      <th className="font-normal px-1.5">Ngày đã ghi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerMonths.map((r) => (
                      <tr key={r.month} className="border-t border-[var(--border)] text-right">
                        <td className="text-left py-1 text-[var(--text)]">T{Number(r.month.slice(5))}/{r.month.slice(2, 4)}{r.done ? "" : <span className="text-[var(--text-faint)]"> (đang chạy)</span>}</td>
                        <td className={`px-1.5 ${tone(r.planErr, 0.1)}`}>{r.plan ? (r.done ? pct(r.planErr, true) : fmtVndShort(r.plan.p50)) : "—"}</td>
                        {BACKTEST_DAYS.map((d) => <td key={d} className={`px-1.5 ${tone(r.at[d], 0.05)}`}>{r.done ? pct(r.at[d], true) : "—"}</td>)}
                        <td className="px-1.5 text-[var(--text-muted)]">{r.days}{!r.done && r.last ? ` · gần nhất ${fmtVndShort(r.last.p50)}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] text-[var(--text-faint)] leading-snug">Tháng đang chạy chỉ hiện số đã nói; hết tháng mới chấm lệch so với GMV cuối tháng (lấy từ ca, nên đối soát lại vẫn đúng).</p>
              </div>
            )}
          </div>

          <div className="text-xs space-y-1">
            <p className="font-bold text-[var(--text-muted)]">Tín hiệu dẫn — có kéo sai số lúc lập xuống không</p>
            {leading.map((c) => (
              <p key={c.signal} className="text-[11px] text-[var(--text-muted)] leading-snug">
                <b className="text-[var(--text)]">{c.signal === "ads" ? "Ngân sách Ads (Kế Hoạch Tháng)" : "Scheme khuyến mãi"}</b>:{" "}
                {c.months < LEADING_MIN_MONTHS
                  ? `chưa đủ — ${c.months}/${c.needed} tháng có ${c.signal === "ads" ? "ngân sách Ads" : "scheme"} kèm dự báo lúc lập. ${c.signal === "ads" ? "Nhập ô Ngân sách Ads ở Kế Hoạch Tháng mỗi tháng." : "Nhập scheme của brand ở CRM / lịch KM."}`
                  : <>sai lúc lập {pct(c.mapeBefore)} → <b className={c.helps ? "text-emerald-400" : "text-[var(--text)]"}>{pct(c.mapeAfter)}</b> nếu dùng (kiểm bỏ-một-tháng). {c.helps ? "Có lợi — đủ điều kiện đưa vào mức dự báo (cần sửa code, ghi vào WORKSPACE)." : "Chưa có lợi rõ (cần giảm ≥ 2 điểm %) — chưa dùng."}</>}
              </p>
            ))}
          </div>

          <details className="text-[11px] text-[var(--text-muted)]">
            <summary className="cursor-pointer font-bold text-[var(--text)] min-h-6">Đọc các con số này thế nào / muốn nâng cấp thì làm gì</summary>
            <ul className="list-disc pl-4 mt-1 space-y-0.5 leading-snug">
              <li>Lúc lập không thể ≤ 5%: mức GMV/giờ của brand tự lên xuống 5–30% mỗi tháng (Ads, voucher, hàng). Chỉ số đáng giữ là lệch hệ thống và dải 80%.</li>
              <li>≤ 5% đạt được ở dự báo trong tháng từ khoảng ngày 15–18 và ở kết quả cuối tháng nếu làm đủ 3 mốc bù giờ (tab Action của Dashboard).</li>
              <li>Ca đơn lẻ không bao giờ ≤ 5% (sàn ~18% kể cả khi biết trước) — đánh giá ca bằng dải, không bằng 100%.</li>
              <li>Sửa logic ở <code>src/lib/performance/monthForecast.ts</code>; mở bảng này cho cả hai sàn, chỉ nâng khi tốt hơn ≥ 2 tháng; chạy <code>npx vitest run tests/monthForecast.test.ts</code>. Đã thử và có hại: tự hiệu chỉnh lệch (CROCS T9 lệch 14% → 26%) — để tắt.</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
};
