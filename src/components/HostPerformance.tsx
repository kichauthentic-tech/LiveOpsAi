import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, TrendingUp, Trophy } from "lucide-react";
import { Brand, LiveSession } from "../types";
import { WEEKDAY_LABELS, byWeekday, dataQuality, filterSessions, hostWeekdayGrid } from "../lib/performance/hostPerformance";
import { addDays, getTodayDate, isoWeekNumber, isoWeekStart } from "../lib/dateUtils";
import { downloadSheetsAsXlsx } from "../lib/exportXlsx";
import { useToast } from "../hooks/useToast";
import { errorMessage } from "../lib/errorMessage";
import { PageIntro } from "./common/PageIntro";

import { fmtDateVn, fmtFixed, fmtVndShort } from "../lib/format";
import { METRIC, metricHint } from "../lib/metricGlossary";
import { profileOf } from "../lib/platforms/profiles";
import { inPlatformScope, type PlatformScope } from "../lib/reportPlatform";
interface HostPerformanceProps {
  /** Sàn của workspace agency (07/10) — hai sàn không xếp hạng chung. */
  platform: PlatformScope;
  sessions: LiveSession[];
  brands: Brand[];
}

// FIX (audit module 4, 2026-09-25): trước đây dùng `new Date().toISOString().slice(0, 10)` — đúng
// anti-pattern mà dateUtils.ts đã cảnh báo tên riêng (toISOString() trả giờ UTC, 00:00-07:00 giờ VN
// bị lùi về NGÀY HÔM TRƯỚC). `s.date` lọc trong filterSessions() là ngày VN, nên mặc định "đến ngày"
// mở màn lúc nửa đêm VN sẽ vô tình bỏ sót ca hôm nay. Dùng getTodayDate() (giờ LOCAL của máy, đúng
// quy ước cả app đang dùng — xem dateUtils.ts) để nhất quán.
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Thứ 2 → Chủ nhật

// Kỳ xem (08/10): Ngày / Tuần (ISO, thứ Hai–Chủ nhật) / Tháng, có nút ‹ › chuyển kỳ; "range" giữ ô chọn khoảng ngày tự do (mặc định cũ 90 ngày).
type PeriodMode = "day" | "week" | "month" | "range";
const PERIOD_LABEL: Record<PeriodMode, string> = { day: "Ngày", week: "Tuần", month: "Tháng", range: "Tuỳ chọn" };

function monthEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return `${date.slice(0, 7)}-${`${new Date(Date.UTC(y, m, 0)).getUTCDate()}`.padStart(2, "0")}`;
}

/** Khoảng [from, to] của kỳ chứa `anchor`. */
function periodBounds(mode: Exclude<PeriodMode, "range">, anchor: string): { from: string; to: string } {
  if (mode === "day") return { from: anchor, to: anchor };
  if (mode === "week") {
    const from = isoWeekStart(anchor);
    return { from, to: addDays(from, 6) };
  }
  return { from: `${anchor.slice(0, 7)}-01`, to: monthEnd(anchor) };
}

/** Lùi/tiến một kỳ — tháng nhảy theo lịch (không cộng 30 ngày) để không trôi ngày. */
function shiftAnchor(mode: Exclude<PeriodMode, "range">, anchor: string, dir: -1 | 1): string {
  if (mode === "day") return addDays(anchor, dir);
  if (mode === "week") return addDays(anchor, 7 * dir);
  const d = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 + dir, 1));
  return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}-01`;
}

function periodLabel(mode: Exclude<PeriodMode, "range">, anchor: string): string {
  if (mode === "day") return fmtDateVn(anchor);
  if (mode === "week") {
    const { week, year } = isoWeekNumber(anchor);
    const { from, to } = periodBounds("week", anchor);
    return `Tuần ${week}/${year} · ${fmtDateVn(from, false)} – ${fmtDateVn(to, false)}`;
  }
  return `Tháng ${Number(anchor.slice(5, 7))}/${anchor.slice(0, 4)}`;
}


export function HostPerformance({ platform, sessions, brands }: HostPerformanceProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<PeriodMode>("month");
  const [anchor, setAnchor] = useState(() => getTodayDate());
  const [rangeFrom, setRangeFrom] = useState(() => isoDaysAgo(90));
  const [rangeTo, setRangeTo] = useState(() => getTodayDate());
  const { from, to } = mode === "range" ? { from: rangeFrom, to: rangeTo } : periodBounds(mode, anchor);
  const today = getTodayDate();
  // Không cho tiến qua kỳ chứa hôm nay — chưa có ca nào để xếp hạng.
  const canNext = mode !== "range" && periodBounds(mode, anchor).to < today;
  const [brandId, setBrandId] = useState("");
  // Xếp hạng theo TỪNG SÀN (06/10): GMV/giờ hai sàn khác hẳn nhau (VERA Shopee ~1,6x TikTok T6–T9) — gộp lại thì host
  // đứng nhiều ca Shopee tự nhiên lên top. Mặc định TikTok; "cả 2 sàn" vẫn chọn được nhưng ghi rõ là không nên so.

  const scoped = useMemo(
    () => filterSessions(sessions.filter((s) => inPlatformScope(s, platform)), { from, to, brandId: brandId || undefined }),
    [sessions, platform, from, to, brandId]
  );

  // Ca chưa gán host tách khỏi xếp hạng (audit 2026-09-21): trước đây nó đứng chung bảng như một
  // "host" tên "Chưa gán host" và chiếm luôn một hạng trong top.
  // Bộ chỉ số của sàn đang xem (hồ sơ sàn): TikTok 18 chỉ số, Shopee Viewers/ATC/ABS/Items Sold. GMV/giờ là cột xếp hạng nên ghim
  // ngay sau tên host, các chỉ số còn lại theo đúng thứ tự chung. Ca chưa gán host tách khỏi xếp hạng (audit 2026-09-21).
  const metrics = profileOf(platform).metrics;
  const rankCols = metrics.defs.filter((d) => d.key !== "gmvPerHour");
  const { ranked: hosts, unassigned: unassignedHost } = useMemo(() => metrics.hostRanking(scoped), [metrics, scoped]);
  const weekdays = useMemo(() => byWeekday(scoped), [scoped]);
  const grid = useMemo(() => hostWeekdayGrid(scoped), [scoped]);
  const quality = useMemo(() => dataQuality(scoped), [scoped]);

  const gridMax = Math.max(1, ...grid.map((c) => c.gmvPerHour));
  const cellOf = (hostId: string, wd: number) => grid.find((c) => c.hostId === hostId && c.weekday === wd);

  const inputCls =
    "bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

  // Xuất đúng 3 bảng đang hiện, mỗi bảng 1 sheet. Giá trị để dạng SỐ THÔ (không `fmtKeyMetric`) để
  // Excel còn lọc/xếp/tính được — đây là chỗ khác duy nhất so với màn hình, và là cả lý do xuất file.
  // Ô trống = chỉ số không có dữ liệu, đúng chỗ màn hình in "—"; không ghi 0 vào, 0 là một con số thật.
  const exportXlsx = () => {
    const rank = hosts.map((h) => {
      const row: Record<string, string | number> = { Host: h.label, "Số ca": h.sessionCount, [METRIC.gmvPerHour]: h.gmvPerHour ?? "" };
      for (const d of rankCols) {
        const v = metrics.value(h, d.key);
        row[d.label] = v == null || Number.isNaN(v) ? "" : v;
      }
      return row;
    });
    const gridRows = hosts.map((h) => {
      const row: Record<string, string | number> = { Host: h.label };
      for (const wd of WEEKDAY_ORDER) {
        const c = cellOf(h.key, wd);
        row[WEEKDAY_LABELS[wd]] = c ? c.gmvPerHour : "";
        row[`${WEEKDAY_LABELS[wd]} — số ca`] = c ? c.sessionCount : "";
      }
      return row;
    });
    const wd: Record<string, string | number>[] = weekdays.map((w) => ({ Thứ: w.label, [METRIC.gmvPerHour]: w.gmvPerHour ?? "", "Số ca": w.sessionCount }));
    const scope = `${brandId ? (brands.find((b) => b.id === brandId)?.name ?? "brand") : "tat-ca-brand"}_${platform}`;
    downloadSheetsAsXlsx(
      [
        { name: "Xep hang host", rows: rank },
        { name: "Host x Thu", rows: gridRows },
        { name: "Hieu suat theo Thu", rows: wd }
      ],
      `HieuSuatHost_${scope}_${from}_${to}.xlsx`.replace(/\s+/g, "_")
    ).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[var(--accent-text)] shrink-0" /> Hiệu Suất Host
            </h2>
            <PageIntro>
              Đọc từ số liệu ca đã có, để trả lời câu hỏi khi sắp lịch: host nào hiệu quả nhất với brand nào, và mạnh nhất vào thứ mấy.
              Đây là số liệu tham khảo cho ops tự quyết, app không tự xếp lịch.
            </PageIntro>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden" role="group" aria-label="Kỳ xem">
              {(Object.keys(PERIOD_LABEL) as PeriodMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`px-2.5 py-1.5 text-xs font-bold ${mode === m ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-base)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                >
                  {PERIOD_LABEL[m]}
                </button>
              ))}
            </div>
            {mode === "range" ? (
              <>
                <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className={inputCls} />
                <span className="text-xs text-[var(--text-faint)]">→</span>
                <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className={inputCls} />
              </>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} className={`${inputCls} px-1.5`} title="Kỳ trước" aria-label="Kỳ trước">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-bold text-[var(--text)] min-w-[9rem] text-center whitespace-nowrap">{periodLabel(mode, anchor)}</span>
                <button
                  onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))}
                  disabled={!canNext}
                  className={`${inputCls} px-1.5 disabled:opacity-40`}
                  title="Kỳ sau"
                  aria-label="Kỳ sau"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls}>
              <option value="">Tất cả brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button
              onClick={exportXlsx}
              disabled={hosts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40"
              title="Tải 3 bảng đang xem ra Excel (3 sheet)"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel
            </button>
          </div>
        </div>

        {quality.total === 0 ? (
          <p className="text-xs text-[var(--text-faint)] mt-4">
            Chưa có ca nào có số liệu trong khoảng này. Số liệu sinh ra khi trợ live up file vào ca (mở ca ở Bảng Vận Hành).
          </p>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)] mt-4 flex items-start gap-1.5">
            {quality.manual > 0 && <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-amber-400" />}
            <span>
              {/* Ghi kỳ ngay cạnh con số (audit người mới 2026-10-04): Talent Pool cộng MỌI tháng nên cùng một host
                  hai màn ra hai số — trước đây chỉ Talent Pool có câu giải thích. */}
              <b className="text-[var(--text)]">{from === to ? fmtDateVn(from) : `${fmtDateVn(from)} – ${fmtDateVn(to)}`}{mode === "range" && from === isoDaysAgo(90) ? " (90 ngày gần nhất)" : ""}</b>
              {" · "}<b className="text-[var(--text)]">chỉ ca {platform}</b>
              {" · "}{quality.total} ca có số liệu: <span className="font-bold text-emerald-400">{quality.reconciled} đã đối soát</span>,{" "}
              <span className="font-bold text-sky-400">{quality.snapshot} số lúc giao ca</span>
              {quality.manual > 0 && (
                <>
                  ,{" "}
                  <span className="font-bold text-amber-400">{quality.manual} host tự khai tay</span> — phần tự khai chưa có gì bảo chứng,
                  cân nhắc khi dùng để ra quyết định
                </>
              )}
              .
            </span>
          </p>
        )}
      </div>

      {quality.total > 0 && (
        <>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
            <h3 className="text-xs font-black text-[var(--text)] flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> Xếp hạng host theo GMV/giờ
            </h3>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
              GMV/giờ là thước đo dùng để phân bổ ca — đo hiệu quả trên mỗi giờ nhân lực bỏ ra, không thiên vị host được xếp nhiều ca dài.
            </p>
            {unassignedHost && (
              <div className="mt-2 flex items-start gap-2 text-[11px] rounded-xl p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {unassignedHost.sessionCount} ca chưa gán host ({fmtVndShort(unassignedHost.gmv)} GMV · {fmtFixed(unassignedHost.hours, 1)}h) không được tính
                  vào xếp hạng — gán host cho ca ở "Dữ Liệu Gốc → nạp bù" hoặc Cửa sổ Ca Live để số này về đúng người.
                </span>
              </div>
            )}
            <div className="mt-3 overflow-x-auto">
              {/* Key Metrics đủ 18 chỉ số + AOV (lib/report/keyMetrics.ts). GMV/giờ là cột xếp hạng nên ghim ngay sau tên host,
                  17 chỉ số còn lại theo đúng thứ tự chung. */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--text-faint)] text-left text-[11px]">
                    <th className="font-bold pb-2 pr-3 sticky left-0 bg-[var(--surface)]">Host</th>
                    <th className="font-bold pb-2 pr-3 text-right whitespace-nowrap" title={metricHint(METRIC.gmvPerHour)}>{METRIC.gmvPerHour}</th>
                    {rankCols.map((d) => (
                      <th key={d.key} className="font-bold pb-2 pr-3 text-right whitespace-nowrap" title={metricHint(d.label)}>{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hosts.map((h) => (
                    <tr key={h.key} className="border-t border-[var(--border)]/60">
                      <td className="py-2 pr-3 font-bold text-[var(--text)] whitespace-nowrap sticky left-0 bg-[var(--surface)]">
                        {h.label} <span className="font-normal text-[var(--text-faint)]">· {h.sessionCount} ca</span>
                      </td>
                      <td className="py-2 pr-3 text-right font-bold text-emerald-400 whitespace-nowrap">{fmtVndShort(h.gmvPerHour ?? 0)}</td>
                      {rankCols.map((d) => (
                        <td key={d.key} className="py-2 pr-3 text-right text-[var(--text-muted)] whitespace-nowrap">{metrics.fmt(d, metrics.value(h, d.key))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
            <h3 className="text-xs font-black text-[var(--text)]">Host Mạnh Nhất Vào Thứ Mấy</h3>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
              Đậm hơn = GMV/giờ cao hơn. Ô trống nghĩa là host chưa từng live thứ đó trong khoảng đã chọn, không phải hiệu suất bằng 0.
              Hàng cuối "Mọi host" = hiệu suất chung của thứ đó — dùng để quyết định nên mở nhiều ca vào thứ nào, tách khỏi chuyện host nào trực.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-[var(--text-faint)] text-[11px]">
                    <th className="font-bold pb-2 pr-3 text-left">Host</th>
                    {WEEKDAY_ORDER.map((wd) => (
                      <th key={wd} className="font-bold pb-2 px-1 text-center">{WEEKDAY_LABELS[wd].replace("Thứ ", "T")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hosts.map((h) => (
                    <tr key={h.key} className="border-t border-[var(--border)]/60">
                      <td className="py-2 pr-3 font-bold text-[var(--text)] whitespace-nowrap">{h.label}</td>
                      {WEEKDAY_ORDER.map((wd) => {
                        const c = cellOf(h.key, wd);
                        const ratio = c ? c.gmvPerHour / gridMax : 0;
                        return (
                          <td key={wd} className="py-1 px-1 text-center">
                            {c ? (
                              <div
                                className="rounded-md py-1.5 text-[11px] font-bold text-[var(--text)]"
                                style={{ backgroundColor: `rgba(16, 185, 129, ${0.12 + ratio * 0.6})` }}
                                title={`${c.sessionCount} ca`}
                              >
                                {fmtVndShort(c.gmvPerHour)}
                              </div>
                            ) : (
                              <span className="text-[var(--text-faint)]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {/* "Hiệu Suất Chung Theo Thứ" từng là một thẻ 7 ô riêng ở cuối trang — nay là hàng tổng của lưới để thẳng cột với từng host. */}
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)]">
                    <td className="pt-2 pr-3 font-black text-[var(--text)] whitespace-nowrap">Mọi host</td>
                    {WEEKDAY_ORDER.map((wd) => {
                      const w = weekdays.find((x) => x.key === String(wd));
                      return (
                        <td key={wd} className="pt-2 px-1 text-center">
                          {w ? (
                            <>
                              <p className="text-[11px] font-black text-emerald-400">{fmtVndShort(w.gmvPerHour)}</p>
                              <p className="text-[11px] text-[var(--text-faint)]">{w.sessionCount} ca</p>
                            </>
                          ) : (
                            <span className="text-[var(--text-faint)]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
