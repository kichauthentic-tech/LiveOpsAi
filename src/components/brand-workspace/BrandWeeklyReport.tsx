import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, UserRole } from "../../types";
import { CalendarRange, ChevronLeft, ChevronRight, AlertTriangle, Loader2, Database, TrendingUp } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import {
  fetchDataRawWeekSlice,
  isoWeekStart,
  isoWeekNumber,
  addDays,
  eachDay,
  DataRawWeekSlice
} from "../../lib/dataraw/weeklySlice";
import { getTodayDate } from "../../lib/dateUtils";

interface BrandWeeklyReportProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  currentRole: UserRole;
}

const CAN_VIEW_ROLES: UserRole[] = ["ceo", "operations", "admin"];

const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const fmtInt = (n: number) => n.toLocaleString("vi-VN");

// Report Tuần là báo cáo VẬN HÀNH nội bộ (đọc-only, không có luồng draft/publish như Report
// Tháng — report tháng mới là bản giao cho brand). Số liệu ghép 2 nguồn:
//   - live_sessions: ca đã lên lịch/đã chạy trong tuần theo hệ thống.
//   - Dataraw (lọc từ batch tháng): số CHÍNH THỨC từ TikTok cho đúng các ngày trong tuần.
// Đặt cạnh nhau để ops thấy ngay tuần này hệ thống ghi nhận lệch gì so với TikTok.
export const BrandWeeklyReport: React.FC<BrandWeeklyReportProps> = ({ brandId, brandName, sessions, currentRole }) => {
  const [weekStart, setWeekStart] = useState(() => isoWeekStart(getTodayDate()));
  const [slice, setSlice] = useState<DataRawWeekSlice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const { week, year } = useMemo(() => isoWeekNumber(weekStart), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDataRawWeekSlice(brandId, weekStart, weekEnd)
      .then((s) => { if (!cancelled) setSlice(s); })
      .catch((e) => { if (!cancelled) setError(e.message ?? String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId, weekStart, weekEnd]);

  const weekSessions = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= weekStart && s.date <= weekEnd),
    [sessions, brandId, weekStart, weekEnd]
  );
  const completed = useMemo(() => weekSessions.filter((s) => s.status === "Completed"), [weekSessions]);
  const unreconciled = useMemo(
    () => completed.filter((s) => (s.dataSource ?? "manual") !== "tiktok_reconciled"),
    [completed]
  );

  const shopTotals = useMemo(() => {
    const d = slice?.daily ?? [];
    const gmv = d.reduce((a, x) => a + x.gmv, 0);
    const orders = d.reduce((a, x) => a + x.orders, 0);
    const customers = d.reduce((a, x) => a + x.customers, 0);
    const visitors = d.reduce((a, x) => a + x.visitors, 0);
    const gmvFromLive = d.reduce((a, x) => a + x.gmvFromLive, 0);
    return { gmv, orders, customers, visitors, gmvFromLive, aov: orders ? gmv / orders : 0 };
  }, [slice]);

  const liveTotals = useMemo(() => {
    const l = slice?.live ?? [];
    return {
      count: l.length,
      gmv: l.reduce((a, x) => a + x.gmv, 0),
      minutes: l.reduce((a, x) => a + (x.durationMinutes ?? 0), 0),
      views: l.reduce((a, x) => a + x.views, 0)
    };
  }, [slice]);

  const hostRows = useMemo(() => {
    const map = new Map<string, { hostName: string; count: number; gmv: number }>();
    for (const s of completed) {
      const key = s.hostName || "Chưa gán";
      const e = map.get(key) ?? { hostName: key, count: 0, gmv: 0 };
      e.count += 1;
      e.gmv += s.actualGmv || 0;
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => b.gmv - a.gmv);
  }, [completed]);

  const dailyByDate = useMemo(() => {
    const m = new Map<string, (typeof slice.daily)[number]>();
    (slice?.daily ?? []).forEach((d) => m.set(d.date, d));
    return m;
  }, [slice]);

  if (!CAN_VIEW_ROLES.includes(currentRole)) {
    return (
      <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] text-sm text-[var(--text-muted)]">
        Bạn không có quyền xem Report Tuần.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + điều hướng tuần */}
      <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider">Report Tuần</p>
            <h3 className="font-bold text-[var(--text)] text-lg flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-emerald-600" />
              {brandName} — Tuần {week}/{year}
            </h3>
            <p className="text-xs text-[var(--text-muted)]">{fmtDay(weekStart)} → {fmtDay(weekEnd)}/{weekEnd.slice(0, 4)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)]">
              <ChevronLeft className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => e.target.value && setWeekStart(isoWeekStart(e.target.value))}
              className="p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] text-xs font-semibold"
            />
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)]">
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-800/50 text-red-400 text-xs font-semibold p-3 rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {/* Cảnh báo phủ dữ liệu — thiếu file khác hẳn "có file nhưng số bằng 0" */}
        {!loading && slice && !slice.hasAnyBatch && (
          <div className="bg-amber-950/40 border border-amber-800/50 text-amber-400 text-xs font-semibold p-3 rounded-xl flex items-start gap-2">
            <Database className="w-4 h-4 shrink-0 mt-0.5" />
            Chưa có báo cáo Dữ Liệu Gốc nào phủ tuần này. Vào <b>Dữ Liệu Gốc</b> upload "Shop Analytics" + "Live Analysis" của tháng tương ứng trước.
          </div>
        )}
        {!loading && slice?.hasAnyBatch && slice.missingDays.length > 0 && (
          <div className="bg-amber-950/40 border border-amber-800/50 text-amber-400 text-xs font-semibold p-3 rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Dữ Liệu Gốc chưa phủ hết tuần — thiếu {slice.missingDays.length} ngày ({slice.missingDays.map(fmtDay).join(", ")}). Số tổng bên dưới đang thiếu các ngày đó, upload file mới nhất rồi xem lại.
          </div>
        )}
        {!loading && unreconciled.length > 0 && (
          <div className="bg-blue-950/40 border border-blue-800/50 text-blue-300 text-xs font-semibold p-3 rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {unreconciled.length} phiên Completed trong tuần chưa đối soát với TikTok — cột "Hệ thống" bên dưới còn là số tạm tính.
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-[var(--surface)] p-8 rounded-2xl border border-[var(--border)] flex items-center justify-center gap-2 text-[var(--text-muted)] text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang đọc Dữ Liệu Gốc...
        </div>
      ) : (
        <>
          {/* KPI tuần — số chính thức TikTok từ Dataraw */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "GMV Shop (TikTok)", value: formatCurrencyAdaptive(shopTotals.gmv), sub: `${formatCurrencyAdaptive(shopTotals.gmvFromLive)} từ LIVE` },
              { label: "Đơn Hàng", value: fmtInt(shopTotals.orders), sub: `${fmtInt(shopTotals.customers)} khách` },
              { label: "AOV", value: formatCurrencyAdaptive(shopTotals.aov), sub: `${fmtInt(shopTotals.visitors)} khách truy cập` },
              { label: "Phiên Live (TikTok)", value: fmtInt(liveTotals.count), sub: `${Math.floor(liveTotals.minutes / 60)}h${String(liveTotals.minutes % 60).padStart(2, "0")} · ${fmtInt(liveTotals.views)} view` }
            ].map((k) => (
              <div key={k.label} className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm">
                <p className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider">{k.label}</p>
                <p className="font-black text-[var(--text)] text-xl mt-1">{k.value}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Theo ngày — ghép Dataraw (TikTok) với số hệ thống để thấy lệch ngay */}
          <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-2">
            <h4 className="font-bold text-[var(--text)] text-xs flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" /> Theo Ngày
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-[var(--surface-elevated)]">
                  <tr className="text-left text-[var(--text-muted)]">
                    <th className="p-2">Ngày</th>
                    <th className="p-2">GMV Shop (TikTok)</th>
                    <th className="p-2">GMV từ LIVE</th>
                    <th className="p-2">Đơn</th>
                    <th className="p-2">Khách Truy Cập</th>
                    <th className="p-2">CVR</th>
                    <th className="p-2">Phiên (Hệ thống)</th>
                    <th className="p-2">GMV (Hệ thống)</th>
                  </tr>
                </thead>
                <tbody>
                  {eachDay(weekStart, weekEnd).map((d, i) => {
                    const row = dailyByDate.get(d);
                    const daySessions = completed.filter((s) => s.date === d);
                    const daySystemGmv = daySessions.reduce((a, s) => a + (s.actualGmv || 0), 0);
                    const missing = slice?.missingDays.includes(d);
                    return (
                      <tr key={d} className="border-t border-[var(--border-muted)]">
                        <td className="p-2 font-semibold text-[var(--text)]">{DOW[i]} {fmtDay(d)}</td>
                        {missing ? (
                          <td colSpan={5} className="p-2 text-amber-500 font-semibold">Chưa có dữ liệu gốc cho ngày này</td>
                        ) : (
                          <>
                            <td className="p-2 font-semibold text-[var(--text)]">{formatCurrencyAdaptive(row?.gmv ?? 0)}</td>
                            <td className="p-2 text-[var(--text-muted)]">{formatCurrencyAdaptive(row?.gmvFromLive ?? 0)}</td>
                            <td className="p-2 text-[var(--text-muted)]">{fmtInt(row?.orders ?? 0)}</td>
                            <td className="p-2 text-[var(--text-muted)]">{fmtInt(row?.visitors ?? 0)}</td>
                            <td className="p-2 text-[var(--text-muted)]">{(row?.conversionRate ?? 0).toFixed(2)}%</td>
                          </>
                        )}
                        <td className="p-2 text-[var(--text-muted)]">{daySessions.length || "—"}</td>
                        <td className="p-2 text-[var(--text-muted)]">{daySessions.length ? formatCurrencyAdaptive(daySystemGmv) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Từng phiên live theo số TikTok */}
          <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-2">
            <h4 className="font-bold text-[var(--text)] text-xs">
              Phiên Live Trong Tuần — Số TikTok ({slice?.live.length ?? 0}) · Hệ thống ghi nhận {completed.length} phiên Completed
            </h4>
            {(slice?.live.length ?? 0) === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">Không có phiên live nào trong tuần theo báo cáo Live Analysis.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-[var(--surface-elevated)]">
                    <tr className="text-left text-[var(--text-muted)]">
                      <th className="p-2">Ngày</th><th className="p-2">Bắt đầu</th><th className="p-2">Nhà sáng tạo</th>
                      <th className="p-2">Thời lượng</th><th className="p-2">GMV LIVE</th><th className="p-2">Lượt xem</th><th className="p-2">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slice!.live.map((l, i) => (
                      <tr key={`${l.date}-${l.time}-${i}`} className="border-t border-[var(--border-muted)]">
                        <td className="p-2 font-semibold text-[var(--text)]">{fmtDay(l.date)}</td>
                        <td className="p-2 text-[var(--text-muted)]">{l.time}</td>
                        <td className="p-2 text-[var(--text-muted)]">{l.creatorName || "—"}</td>
                        <td className="p-2 text-[var(--text-muted)]">
                          {l.durationMinutes !== undefined ? `${Math.floor(l.durationMinutes / 60)}h${String(l.durationMinutes % 60).padStart(2, "0")}` : "—"}
                        </td>
                        <td className="p-2 font-semibold text-[var(--text)]">{formatCurrencyAdaptive(l.gmv)}</td>
                        <td className="p-2 text-[var(--text-muted)]">{fmtInt(l.views)}</td>
                        <td className="p-2 text-[var(--text-muted)]">{l.ctr.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Host trong tuần — từ live_sessions (Dataraw không map được host của agency) */}
          {hostRows.length > 0 && (
            <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-2">
              <h4 className="font-bold text-[var(--text)] text-xs">Host Trong Tuần (theo hệ thống)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-[var(--surface-elevated)]">
                    <tr className="text-left text-[var(--text-muted)]">
                      <th className="p-2">Host</th><th className="p-2">Số Phiên</th><th className="p-2">GMV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hostRows.map((h) => (
                      <tr key={h.hostName} className="border-t border-[var(--border-muted)]">
                        <td className="p-2 font-semibold text-[var(--text)]">{h.hostName}</td>
                        <td className="p-2 text-[var(--text-muted)]">{h.count}</td>
                        <td className="p-2 text-[var(--text-muted)]">{formatCurrencyAdaptive(h.gmv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
