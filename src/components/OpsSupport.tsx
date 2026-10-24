import { useEffect, useMemo, useState } from "react";
import type { CalendarEventRow, LiveSession, PromoScheme } from "../types";
import type { EngineParams } from "../lib/scheduling/engineParams";
import { buildHistory } from "../lib/scheduling/suggestEngine";
import { calendarEventsRead } from "../lib/db/monthPlans";
import { benchmarkForWindow, type EstimateCtx } from "../lib/opsSupport";
import { todayVn } from "../lib/performance/brandCommitment";
import { sessionDurationHours } from "../lib/pnl";
import { fmtVndShort } from "../lib/format";
import type { CampOverrides } from "../lib/campaignDays";
import { platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { profileOf } from "../lib/platforms/profiles";

// Hỗ Trợ Vận Hành = kỳ vọng của MỘT ca sắp live, mở ngay dưới dòng ca của Bảng Vận Hành (25/10, audit 24/10 user chốt: bỏ khối
// "Kỳ vọng các ca sắp live" phải chọn tay brand × sàn). Không ghi DB. GMV kỳ vọng nhận từ `expected` (expectedNowById — cùng số với sa bàn
// và dự kiến cuối tháng); phễu (view, CVR, CTR, AOV, ads) theo ô thứ × giờ của lịch sử brand cùng sàn (benchmarkForWindow) để ops so bằng
// mắt với dashboard sàn trong phiên: view thấp → đẩy traffic, CTR/CVR thấp → tối ưu, ads vượt → hãm. Lịch sử chỉ dựng khi mở dòng.

export interface ShiftWindow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  brandId: string;
  platform: ReportPlatform;
  /** Target GMV của ca (ca thật); ca chờ đăng ký không có. */
  targetGmv?: number;
}

interface Props {
  win: ShiftWindow;
  /** null = đang tính; undefined = kênh chưa đủ lịch sử để chiếu. */
  expected: number | null | undefined;
  sessions: LiveSession[];
  promoSchemes: PromoScheme[];
  engineParams: EngineParams;
  camp: CampOverrides;
}

const fmtPct = (x: number, digits = 0) => `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`;
const fmtN = (x: number) => Math.round(x).toLocaleString("vi-VN");

export default function OpsSupport({ win, expected, sessions, promoSchemes, engineParams, camp }: Props) {
  const today = todayVn();
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  useEffect(() => {
    let alive = true;
    calendarEventsRead.take().then((e) => alive && setEvents(e)).catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, []);
  const { funnel, viewsLabel } = profileOf(win.platform);

  // Ca của brand này chỉ giữ ĐÚNG SÀN (năng suất hai sàn khác nhau); brand khác giữ nguyên vì engine đọc lịch toàn agency.
  const sess = useMemo(() => sessions.filter((s) => s.brandId !== win.brandId || platformOf(s) === win.platform), [sessions, win.brandId, win.platform]);
  const brandSessions = useMemo(() => sess.filter((s) => s.brandId === win.brandId), [sess, win.brandId]);
  const schemes = useMemo(() => promoSchemes.filter((sc) => sc.brandId === win.brandId).map((sc) => ({ start: sc.startDate, end: sc.endDate, label: sc.title })), [promoSchemes, win.brandId]);
  const history = useMemo(() => buildHistory(sess, win.brandId, today, { events, schemes, params: engineParams }), [sess, win.brandId, today, events, schemes, engineParams]);
  const ctx = useMemo<EstimateCtx>(() => ({ camp, events, schemes }), [camp, events, schemes]);
  const b = useMemo(() => (history.brandGmvPerHour > 0 ? benchmarkForWindow(history, brandSessions, win, ctx) : null), [history, brandSessions, win, ctx]);

  const hours = sessionDurationHours(win.startTime, win.endTime);
  const target = win.targetGmv ?? 0;
  const high = target > 0 && expected != null && target > expected * engineParams.highExpectationRatio;
  const cell = (label: string, value: string, tone = "") => (
    <div className="min-w-0">
      <p className="text-[11px] text-[var(--text-faint)]">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone || "text-[var(--text)]"}`}>{value}</p>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        {cell("GMV kỳ vọng", expected == null ? (expected === null ? "đang tính…" : "—") : fmtVndShort(expected))}
        {cell("GMV/giờ kỳ vọng", expected != null && hours > 0 ? fmtVndShort(expected / hours) : "—")}
        {cell("Target GMV ca", target > 0 ? fmtVndShort(target) : "—", high ? "text-amber-300" : "")}
        {cell(`${viewsLabel}/giờ`, b ? fmtN(b.viewsPerHour) : "—")}
        {funnel.hasOrderFunnel && b && cell("Orders kỳ vọng", fmtN(b.expectedOrders))}
        {funnel.hasOrderFunnel && b && cell("CVR", fmtPct(b.conversion, 2))}
        {funnel.hasOrderFunnel && b && cell("LIVE CTR", b.liveCtr === null ? "—" : `${b.liveCtr.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`)}
        {funnel.hasOrderFunnel && b && cell("AOV", b.aov > 0 ? fmtVndShort(b.aov) : "—")}
        {funnel.hasOrderFunnel && b && cell("Ads / giờ", b.adsPerHour === null ? "chưa có report" : fmtVndShort(b.adsPerHour))}
      </div>
      {expected === undefined && <p className="text-[11px] text-[var(--text-faint)]">Kênh chưa đủ lịch sử để chiếu kỳ vọng (dưới 15 ca có số).</p>}
      {high && <p className="text-[11px] text-amber-300">Target ca cao hơn {engineParams.highExpectationRatio.toLocaleString("vi-VN")} lần kỳ vọng.</p>}
      {b && (b.thin || b.cellTags.includes("weak") || b.cellTags.includes("traffic_low_cvr")) && (
        <p className="text-[11px] text-amber-300">
          {b.thin ? "Ít dữ liệu ở khung này — phễu chỉ tham khảo. " : ""}
          {b.cellTags.includes("traffic_low_cvr") ? funnel.lowConversionTip : ""}
          {b.cellTags.includes("weak") ? "Khung yếu trong lịch sử." : ""}
        </p>
      )}
      <p className="text-[11px] text-[var(--text-faint)]">GMV kỳ vọng cùng số với sa bàn ở "Cả tháng". Phễu theo thứ × giờ trong lịch sử brand. {funnel.inSessionTip}</p>
    </div>
  );
}
