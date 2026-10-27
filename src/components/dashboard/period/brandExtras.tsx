import React, { useMemo } from "react";
import type { LiveSession } from "../../../types";
import type { ChannelCard } from "../../../lib/performance/channelCard";
import type { CampDayBucket } from "../../../lib/campaignDays";
import { resolveCampBucketType } from "../../../lib/campaignDays";
import { compareWindow } from "../../../lib/report/monthlyReportInsights";
import { hasLiveNumbers, sessionToLivePerfRow } from "../../../lib/report/sessionsLivePerf";
import { controlGroup, controlLabel, controlVerdict, liveGmvByDate, VERDICT_TEXT } from "../../../lib/report/deepAnalysis";
import { SLOT_BLOCKS, SLOT_BLOCK_LABEL, campPositions, campRuleReliable, campWindows, slotBlock, slotIndex, slotRuleReliable, walkForward, type SlotBlock } from "../../../lib/performance/slotInsights";
import { isCountable, sessionHours } from "../../../lib/performance/hostPerformance";
import { sessionDurationHours } from "../../../lib/pnl";
import { addDays } from "../../../lib/dateUtils";
import { METRIC } from "../../../lib/metricGlossary";
import { profileOf } from "../../../lib/platforms/profiles";
import type { ReportPlatform } from "../../../lib/reportPlatform";
import { fmtVndShort } from "../../../lib/format";
import { TreeCard } from "../TreeCard";
import { ChannelPlan } from "../ActionPlan";
import { Card, ddmm, money, niceMax, pct } from "../shared";
import type { ForecastSnapshot } from "../../../lib/db/forecastSnapshots";
import { eachDay } from "../../../lib/dateUtils";
import { monthEndOf } from "../../../lib/performance/ceoBrief";
import type { BrandFiles } from "./useBrandFiles";
import { BlockHead, Sect } from "./ui";

// "Vì sao và nên làm gì" của tab Brand — chuyển từ màn Chi tiết kênh (21/10) khi gộp vào Dashboard (23/10). Chỉ tháng đang chạy, nút
// Tháng. Cây GMV/giờ + phương án = thẻ kênh (MỘT lần tính); nhóm đối chứng shop + đề xuất đã thử lại = cùng hàm Report Tháng dùng.

const num = (x: number | null | undefined, d = 0) => (x == null || !isFinite(x) ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: d }));

export const WhySection: React.FC<{ card: ChannelCard; sessions: LiveSession[]; platform: ReportPlatform; files: BrandFiles; today: string; onNavigate: (tab: string) => void }> = ({ card, sessions, platform, files, today, onNavigate }) => {
  const prof = profileOf(platform);
  const month = card.month;
  const bucketOf = card.bucketOf;
  const through = card.shownThrough;
  const win = useMemo(() => compareWindow(month, through), [month, through]);
  const shopCur = files.shop.find((m) => m.month === month), shopPrev = files.shop.find((m) => m.month === win.prevStart.slice(0, 7));
  const control = useMemo(() => {
    if (!prof.hasShopAnalytics || !shopCur || !shopPrev) return [];
    const rows = liveGmvByDate(sessions.filter(hasLiveNumbers).map(sessionToLivePerfRow));
    return controlGroup(shopPrev.days, shopCur.days, win, (d) => resolveCampBucketType(d), bucketOf, { prev: rows, cur: rows });
  }, [prof, shopCur, shopPrev, sessions, win, bucketOf]);
  return (
    <>
      <Sect title="Nguyên nhân và hành động đề xuất" sub="tháng đang chạy · cùng số với thẻ kênh" />
      <Card>
        <BlockHead title="Phân rã GMV/giờ · ngày Daily" />
        <TreeCard tree={card.tree} platform={platform} />
        {!prof.hasShopAnalytics ? null : control.length > 0 ? (
          <ul className="text-xs text-[var(--text-muted)] space-y-1 mt-3">
            <li className="text-[var(--text-faint)]">Nhóm đối chứng — live = ca agency, phần còn lại của shop = Total GMV trừ Seller LIVE; cùng cách tính với Report Tháng:</li>
            {control.map((r) => {
              const v = controlVerdict(r);
              return (
                <li key={r.key}>
                  <b className="text-[var(--text)]">{controlLabel(r.key)}</b>: live {r.liveChg == null ? "—" : `${r.liveChg >= 0 ? "+" : "−"}${num(Math.abs(r.liveChg))}%`}, phần còn lại {r.restChg == null ? "—" : `${r.restChg >= 0 ? "+" : "−"}${num(Math.abs(r.restChg))}%`}
                  {v && <> ⇒ <span className={v === "ops" ? "text-rose-300 font-bold" : ""}>{VERDICT_TEXT[v]}</span></>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-[var(--text-faint)] mt-3">Chưa có Shop Analytics tháng này và tháng trước ở Dữ Liệu Gốc — chưa so được với phần còn lại của shop.</p>
        )}
      </Card>
      {card.plan && (
        <ChannelPlan
          o={card.outlook}
          p={card.plan}
          today={today}
          extra={<button type="button" onClick={() => onNavigate("control_room")} className="min-h-[28px] px-2.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)]">Mô phỏng thêm ca</button>}
        />
      )}
      <Suggestions sessions={sessions} bucketOf={bucketOf} through={through} win={win} />
    </>
  );
};

/** Đề xuất tối ưu — chỉ giữ quy tắc đã thử lại trên tháng cũ của chính brand (slotInsights). */
const Suggestions: React.FC<{ sessions: LiveSession[]; bucketOf: (d: string) => CampDayBucket; through: string | null; win: ReturnType<typeof compareWindow> }> = ({ sessions, bucketOf, through, win }) => {
  const history = useMemo(() => sessions.filter((s) => !through || s.date <= through), [sessions, through]);
  const sIdx = useMemo(() => slotIndex(history, bucketOf), [history, bucketOf]);
  const wfSlot = useMemo(() => walkForward(history, bucketOf, (s) => slotBlock(s.startTime)), [history, bucketOf]);
  const wfWeekday = useMemo(() => walkForward(history, bucketOf, (s) => String(new Date(`${s.date}T00:00:00`).getDay())), [history, bucketOf]);
  const cPos = useMemo(() => campPositions(campWindows(history, bucketOf)), [history, bucketOf]);
  const slotOk = slotRuleReliable(sIdx, wfSlot);
  const campOk = campRuleReliable(cPos);
  const hoursPerDailyDay = (xs: LiveSession[], k: SlotBlock) => {
    const d = xs.filter((s) => isCountable(s) && bucketOf(s.date) === "daily");
    const days = new Set(d.map((s) => s.date)).size;
    return days ? d.filter((s) => slotBlock(s.startTime) === k).reduce((a, s) => a + sessionHours(s), 0) / days : null;
  };
  const curRange = sessions.filter((s) => s.date >= win.curStart && s.date <= win.curEnd);
  const prevRange = sessions.filter((s) => s.date >= win.prevStart && s.date <= win.prevEnd);
  // Dời giờ TỪ khung yếu chắc chắn (cả dải < 1) mà kỳ này còn chạy giờ, SANG khung mạnh nhất (không cố định 11–13h → 19–20h).
  const slotMove = (() => {
    const rows = SLOT_BLOCKS.flatMap((k) => (sIdx[k] ? [{ k, r: sIdx[k]! }] : []));
    const from = rows.filter(({ k, r }) => r.hi < 1 && (hoursPerDailyDay(curRange, k) ?? 0) > 0).sort((a, b) => a.r.idx - b.r.idx)[0];
    const to = rows.filter(({ r }) => r.lo > (from?.r.hi ?? 1)).sort((a, b) => b.r.idx - a.r.idx)[0];
    return from && to ? { from: from.k, to: to.k, lo: to.r.lo - from.r.hi, hi: to.r.hi - from.r.lo } : null;
  })();
  // GMV/giờ 28 ngày gần nhất theo GIỜ KẾ HOẠCH (nhân với "dời/thêm N giờ lịch").
  const recent28 = useMemo(() => {
    if (!through) return null;
    const f = addDays(through, -27);
    const xs = sessions.filter((s) => isCountable(s) && s.date >= f && s.date <= through);
    const byCamp = (camp: boolean) => {
      const x = xs.filter((s) => (bucketOf(s.date) !== "daily") === camp);
      const h = x.reduce((a, s) => a + sessionDurationHours(s.startTime, s.endTime), 0);
      return h > 0 ? x.reduce((a, s) => a + (s.actualGmv ?? 0), 0) / h : null;
    };
    return { daily: byCamp(false), camp: byCamp(true) };
  }, [sessions, through, bucketOf]);
  const lbl = (k: SlotBlock) => SLOT_BLOCK_LABEL[k].replace("Bắt đầu ", "");
  const pill = (ok: boolean) => <span className={`px-2 py-0.5 rounded-full text-[11px] ${ok ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--surface-elevated)] text-[var(--text-faint)]"}`}>{ok ? "Đủ tin cậy" : "Chưa đủ tin cậy"}</span>;
  return (
    <Card>
      <BlockHead title="Đề xuất tối ưu" sub="Chỉ giữ quy tắc đã được thử lại: lấy các tháng trước để đoán tháng sau, quy tắc nào đoán đúng hơn mới được đưa ra. Mức tăng là mức tối đa — giả định giờ dời sang khung khác vẫn bán tốt như trung bình khung đó." />
      <div className="space-y-4 text-xs">
        <div className={`border-l-2 pl-3 space-y-1.5 ${slotOk ? "border-emerald-500" : "border-[var(--border)] opacity-80"}`}>
          <p className="font-bold text-[var(--text)] flex items-center gap-2">{pill(slotOk)}Khung giờ ngày Daily</p>
          {SLOT_BLOCKS.some((k) => sIdx[k]) && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="text-[var(--text-faint)] text-left">
                    <th className="pb-1 pr-3 font-semibold">Khung</th>
                    <th className="pb-1 pr-3 text-right font-semibold">Chỉ số (1,00 = trung bình tháng)</th>
                    <th className="pb-1 pr-3 text-right font-semibold" title="Vùng tin cậy 90% của chỉ số">Vùng tin cậy 90%</th>
                    <th className="pb-1 text-right font-semibold">Giờ lịch sử</th>
                  </tr>
                </thead>
                <tbody>
                  {SLOT_BLOCKS.filter((k) => sIdx[k]).map((k) => {
                    const r = sIdx[k]!;
                    return (
                      <tr key={k} className="border-t border-[var(--border)]/60">
                        <td className="py-1 pr-3 text-[var(--text)]">{SLOT_BLOCK_LABEL[k]}</td>
                        <td className={`py-1 pr-3 text-right tabular-nums font-bold ${r.hi < 1 ? "text-rose-400" : r.lo > 1 ? "text-emerald-400" : "text-[var(--text)]"}`}>{num(r.idx, 2)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums text-[var(--text-muted)]">{num(r.lo, 2)} – {num(r.hi, 2)}</td>
                        <td className="py-1 text-right tabular-nums text-[var(--text-faint)]">{num(r.hours)}h</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {slotOk && slotMove && recent28?.daily != null && (
            <p className="text-[var(--text-muted)]">
              Dời 1 giờ ngày Daily từ khung {lbl(slotMove.from)} sang {lbl(slotMove.to)} ≈ <b className="text-[var(--text)]">+{fmtVndShort(slotMove.lo * recent28.daily)} – {fmtVndShort(slotMove.hi * recent28.daily)}</b> theo {METRIC.gmvPerHour} ngày thường 28 ngày gần nhất.
              {(() => {
                const hF = hoursPerDailyDay(curRange, slotMove.from), hT = hoursPerDailyDay(curRange, slotMove.to), hTp = hoursPerDailyDay(prevRange, slotMove.to);
                if (hT == null) return null;
                return <> Kỳ này mỗi ngày Daily live {num(hT, 1)}h ở khung {lbl(slotMove.to)} (cùng kỳ tháng trước {num(hTp, 1)}h) và {num(hF, 1)}h ở khung {lbl(slotMove.from)}.{hTp != null && hT < hTp * 0.85 && <b className="text-rose-300"> Giờ ở khung mạnh nhất đang bị cắt bớt.</b>}</>;
              })()}
            </p>
          )}
          <p className="text-[var(--text-faint)]">Thử lại trên tháng cũ: dùng chỉ số khung của các tháng trước {wfSlot.gain == null ? "chưa đủ tháng để thử" : Math.abs(wfSlot.gain) < 0.005 ? "gần như không đổi sai số dự đoán" : `${wfSlot.gain > 0 ? "giảm" : "tăng"} sai số dự đoán ${pct(Math.abs(wfSlot.gain))}`} ({wfSlot.months} tháng).</p>
        </div>
        <div className={`border-l-2 pl-3 space-y-1.5 ${campOk ? "border-emerald-500" : "border-[var(--border)] opacity-80"}`}>
          <p className="font-bold text-[var(--text)] flex items-center gap-2">{pill(campOk)}Mid-Month / Pay Day: dồn giờ vào ngày đầu</p>
          {cPos ? (
            <p className="text-[var(--text-muted)]">
              Ngày 1 đạt <b className="text-[var(--text)]">{num(cPos[0].idx, 2)}</b> lần {METRIC.gmvPerHour} trung bình đợt ({cPos[0].above}/{cPos[0].windows} đợt cao hơn), ngày 3 đạt <b className="text-[var(--text)]">{num(cPos[2].idx, 2)}</b> ({cPos[2].windows - cPos[2].above}/{cPos[2].windows} đợt thấp hơn).
              Trung bình đang xếp {num(cPos[0].avgHours, 1)}h cho ngày 1 và {num(cPos[2].avgHours, 1)}h cho ngày 3.
              {campOk && recent28?.camp != null && <> Dời 1 ca 3h từ ngày 3 sang ngày 1 ≈ <b className="text-[var(--text)]">+{fmtVndShort(3 * (cPos[0].idx - cPos[2].idx) * recent28.camp)}</b> mỗi đợt.</>}
            </p>
          ) : (
            <p className="text-[var(--text-faint)]">Chưa đủ 2 đợt Mid-Month / Pay Day có số liệu cả 3 ngày.</p>
          )}
        </div>
        <div className="border-l-2 border-[var(--border)] pl-3 space-y-1 opacity-80">
          <p className="font-bold text-[var(--text)] flex items-center gap-2"><span className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--surface-elevated)] text-[var(--text-faint)]">Đã thử, bị loại</span> Chọn thứ trong tuần để live · Xếp hạng host theo tháng</p>
          <p className="text-[var(--text-faint)]">
            Chỉ số thứ trong tuần của các tháng trước {wfWeekday.gain == null ? "chưa đủ tháng để thử" : wfWeekday.gain > 0 ? `giảm sai số ${pct(wfWeekday.gain)}` : `làm sai số tăng ${pct(-wfWeekday.gain)}`}; host đứng đầu tháng này gần như không đứng đầu tháng sau (đo CROCS 26/09). Màn này không đưa lời khuyên dựa trên hai thứ đó.
          </p>
        </div>
      </div>
    </Card>
  );
};

/** Dự báo cuối tháng qua từng ngày (sổ dự báo 0163 — engine chụp mỗi ngày): dự báo đang lên hay xuống, dải ~80%, vạch target. */
export const ForecastHistory: React.FC<{ card: ChannelCard; rows: ForecastSnapshot[] }> = ({ card, rows }) => {
  const month = card.month;
  const pts = rows.filter((r) => r.month === month && r.kind === "daily").sort((a, b) => a.asOf.localeCompare(b.asOf));
  if (pts.length < 2) return null;
  const days = eachDay(`${month}-01`, monthEndOf(`${month}-01`));
  const W = 760, H = 220, L = 52, R = 110, T = 16, B = 24, iw = W - L - R, ih = H - T - B;
  const X = (d: string) => L + (iw * (days.indexOf(d) + 0.5)) / days.length;
  // Trục bám khoảng số (không từ 0) để thấy dự báo lên/xuống vài %; vẫn chứa vạch target.
  const vals = [...pts.flatMap((p) => [p.lo ?? p.p50, p.hi ?? p.p50]), ...(card.target ? [card.target] : [])];
  const lo0 = Math.min(...vals), hi0 = Math.max(...vals), pad = (hi0 - lo0) * 0.15 || hi0 * 0.05;
  const step = niceMax((hi0 - lo0 + 2 * pad) / 4);
  const ymin = Math.max(0, Math.floor((lo0 - pad) / step) * step), ymax = ymin + step * 4;
  const Y = (v: number) => T + ih - (ih * (v - ymin)) / (ymax - ymin);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${r1(X(p.asOf))} ${r1(Y(p.p50))}`).join("");
  const band = pts.filter((p) => p.lo != null && p.hi != null);
  const area = band.length > 1 ? `${band.map((p, i) => `${i ? "L" : "M"}${r1(X(p.asOf))} ${r1(Y(p.hi!))}`).join("")}${[...band].reverse().map((p) => `L${r1(X(p.asOf))} ${r1(Y(p.lo!))}`).join("")}Z` : "";
  const last = pts[pts.length - 1], first = pts[0];
  const ch = last.p50 / first.p50 - 1;
  return (
    <Card>
      <BlockHead title="Dự báo cuối tháng qua từng ngày" sub={`Dự báo ghi lại mỗi ngày · vùng tin cậy 80% · từ ${ddmm(first.asOf)} tới ${ddmm(last.asOf)} dự báo ${ch >= 0 ? "lên" : "xuống"} ${pct(Math.abs(ch), 1)} (${money(first.p50)} → ${money(last.p50)})`} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Dự báo cuối tháng qua từng ngày">
        {[0, 1, 2, 3, 4].map((j) => { const v = ymin + step * j; return <g key={j}><line x1={L} x2={L + iw} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeDasharray={j ? "2 4" : undefined} /><text x={L - 6} y={Y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-faint)">{money(v)}</text></g>; })}
        {days.map((d, i) => (i % 5 === 0 ? <text key={d} x={X(d)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-faint)">{ddmm(d)}</text> : null))}
        {area && <path d={area} fill="var(--accent)" opacity=".14" />}
        {card.target ? <><line x1={L} x2={L + iw} y1={Y(card.target)} y2={Y(card.target)} stroke="var(--warning)" strokeDasharray="5 4" /><text x={L + iw + 6} y={Y(card.target) + 3.5} fontSize="10.5" fontWeight="600" fill="var(--warning)">Target {money(card.target)}</text></> : null}
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {pts.map((p) => <circle key={p.asOf} cx={X(p.asOf)} cy={Y(p.p50)} r="2.5" fill="var(--accent)"><title>{`${ddmm(p.asOf)}: dự báo ${money(p.p50)}${p.lo != null && p.hi != null ? ` (${money(p.lo)}–${money(p.hi)})` : ""}`}</title></circle>)}
        <text x={L + iw + 6} y={Y(last.p50) + (card.target && Math.abs(Y(last.p50) - Y(card.target)) < 14 ? 17 : 3.5)} fontSize="10.5" fontWeight="600" fill="var(--text-muted)">~{money(last.p50)}</text>
      </svg>
    </Card>
  );
};
