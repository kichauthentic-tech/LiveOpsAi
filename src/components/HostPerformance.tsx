import { useMemo, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { Brand, LiveSession } from "../types";
import {
  WEEKDAY_LABELS,
  byHost,
  byWeekday,
  dataQuality,
  filterSessions,
  hostWeekdayGrid,
  splitUnassignedHost
} from "../lib/performance/hostPerformance";
import { getTodayDate } from "../lib/dateUtils";

interface HostPerformanceProps {
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

function fmtVnd(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "tr";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Thứ 2 → Chủ nhật

export function HostPerformance({ sessions, brands }: HostPerformanceProps) {
  const [from, setFrom] = useState(() => isoDaysAgo(90));
  const [to, setTo] = useState(() => getTodayDate());
  const [brandId, setBrandId] = useState("");

  const scoped = useMemo(
    () => filterSessions(sessions, { from, to, brandId: brandId || undefined }),
    [sessions, from, to, brandId]
  );

  // Ca chưa gán host tách khỏi xếp hạng (audit 2026-09-21): trước đây nó đứng chung bảng như một
  // "host" tên "Chưa gán host" và chiếm luôn một hạng trong top.
  const { ranked: hosts, unassigned: unassignedHost } = useMemo(() => splitUnassignedHost(byHost(scoped)), [scoped]);
  const weekdays = useMemo(() => byWeekday(scoped), [scoped]);
  const grid = useMemo(() => hostWeekdayGrid(scoped), [scoped]);
  const quality = useMemo(() => dataQuality(scoped), [scoped]);

  const gridMax = Math.max(1, ...grid.map((c) => c.gmvPerHour));
  const cellOf = (hostId: string, wd: number) => grid.find((c) => c.hostId === hostId && c.weekday === wd);

  const inputCls =
    "bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-[var(--text)]">Hiệu Suất Host</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1 max-w-2xl">
              Đọc từ số liệu ca đã có, để trả lời câu hỏi khi sắp lịch: host nào hiệu quả nhất với brand nào, và mạnh nhất vào thứ mấy.
              Đây là số liệu tham khảo cho ops tự quyết, app không tự xếp lịch.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            <span className="text-xs text-[var(--text-faint)]">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls}>
              <option value="">Tất cả brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
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
              {quality.total} ca có số liệu: <span className="font-bold text-emerald-400">{quality.reconciled} đã đối soát</span>,{" "}
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
          <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
            <h3 className="text-xs font-black text-[var(--text)] flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Xếp hạng host theo GMV/giờ
            </h3>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
              GMV/giờ là thước đo dùng để phân bổ ca — đo hiệu quả trên mỗi giờ nhân lực bỏ ra, không thiên vị host được xếp nhiều ca dài.
            </p>
            {unassignedHost && (
              <div className="mt-2 flex items-start gap-2 text-[11px] rounded-xl p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {unassignedHost.sessionCount} ca chưa gán host ({fmtVnd(unassignedHost.gmv)} GMV · {unassignedHost.hours.toFixed(1)}h) không được tính
                  vào xếp hạng — gán host cho ca ở "Dữ Liệu Gốc → nạp bù" hoặc Cửa sổ Ca Live để số này về đúng người.
                </span>
              </div>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-[var(--text-faint)] text-left text-[11px]">
                    <th className="font-bold pb-2 pr-3">Host</th>
                    <th className="font-bold pb-2 pr-3 text-right">GMV/giờ</th>
                    <th className="font-bold pb-2 pr-3 text-right">GMV</th>
                    <th className="font-bold pb-2 pr-3 text-right">Sessions</th>
                    <th className="font-bold pb-2 pr-3 text-right">Giờ live</th>
                    <th className="font-bold pb-2 pr-3 text-right">GMV/session</th>
                    <th className="font-bold pb-2 text-right">Product CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {hosts.map((h) => (
                    <tr key={h.key} className="border-t border-[var(--border)]/60">
                      <td className="py-2 pr-3 font-bold text-[var(--text)]">{h.label}</td>
                      <td className="py-2 pr-3 text-right font-bold text-emerald-400">{fmtVnd(h.gmvPerHour)}</td>
                      <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{fmtVnd(h.gmv)}</td>
                      <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{h.sessionCount}</td>
                      <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{h.hours.toFixed(1)}h</td>
                      <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{fmtVnd(h.gmvPerSession)}</td>
                      <td className="py-2 text-right text-[var(--text-muted)]">{h.ctr.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
            <h3 className="text-xs font-black text-[var(--text)]">Host Mạnh Nhất Vào Thứ Mấy</h3>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
              Đậm hơn = GMV/giờ cao hơn. Ô trống nghĩa là host chưa từng live thứ đó trong khoảng đã chọn, không phải hiệu suất bằng 0.
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
                                {fmtVnd(c.gmvPerHour)}
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
              </table>
            </div>
          </div>

          <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
            <h3 className="text-xs font-black text-[var(--text)]">Hiệu Suất Chung Theo Thứ</h3>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
              Dùng để quyết định nên mở nhiều ca vào thứ nào, tách khỏi chuyện host nào trực.
            </p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {weekdays.map((w) => (
                <div key={w.key} className="bg-[var(--surface-base)] rounded-xl p-2.5 text-center">
                  <p className="text-[11px] text-[var(--text-faint)]">{w.label}</p>
                  <p className="text-sm font-black text-emerald-400 mt-1">{fmtVnd(w.gmvPerHour)}</p>
                  <p className="text-[11px] text-[var(--text-faint)] mt-0.5">GMV/giờ · {w.sessionCount} ca</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
