import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Lock,
  Minus,
  TrendingUp,
  Users
} from "lucide-react";
import { Brand, BrandPlatformRate, LiveSession, Talent, UserRole } from "../types";
import {
  AgencyTotals,
  Delta,
  OverviewGrain,
  comparableRange,
  delta,
  indexByDate,
  moneyReadiness,
  periodOf,
  recentPeriods,
  sessionsIn,
  sharesOf,
  shiftPeriod,
  statsFor,
  totalsOf
} from "../lib/performance/agencyOverview";
import { byBrand, byHost, isCountable, splitUnassignedHost } from "../lib/performance/hostPerformance";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { getTodayDate } from "../lib/dateUtils";
import { BrandLogo } from "./ui/BrandLogo";

// Toàn Cảnh Agency (2026-09-24) — màn CEO mở hằng tuần/tháng để thấy nhịp của cả agency.
// Mọi luật số nằm trong lib/performance/agencyOverview.ts, file này chỉ trình bày.
//
// Ba thứ màn này CỐ Ý không có, vì đúng chúng đã giết module Dashboard cũ (xoá 2026-09-13):
//   - Không có ô dự phóng cuối kỳ. Muốn dự phóng thì sang Hỗ Trợ Vận Hành (có engine + đã verify).
//   - Không có ô tiền nào khi chưa đủ rate: khối P&L hiện DANH SÁCH THỨ CÒN THIẾU, không hiện 0đ.
//   - Không tự ý so tháng dở với tháng đủ — kỳ trước luôn bị cắt về đúng số ngày đã trôi.

interface AgencyOverviewProps {
  sessions: LiveSession[];
  brands: Brand[];
  talents: Talent[];
  brandPlatformRates: BrandPlatformRate[];
  currentRole: UserRole;
  onOpenSessions?: () => void;
  onOpenHostPerformance?: () => void;
  onOpenRateCard?: () => void;
  onOpenTalents?: () => void;
}

/** Một brand gánh quá ngưỡng này thì mất brand đó là mất gần hết doanh số — CEO phải biết. */
const BRAND_CONCENTRATION_WARN = 60;
/** Một host gánh quá ngưỡng này là rủi ro nhân sự: người đó nghỉ/ốm là thủng kỳ. */
const HOST_CONCENTRATION_WARN = 30;

const fmtHours = (h: number) => `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
const fmtInt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
const fmtMoney = (n: number) => formatCurrencyAdaptive(n, "");

/** Chip so sánh với kỳ trước. `null` phần trăm = kỳ trước bằng 0, KHÔNG được hiện "+0%" hay "∞". */
const DeltaChip: React.FC<{ d: Delta; invert?: boolean }> = ({ d, invert }) => {
  const flat = d.abs === 0;
  const good = invert ? d.abs < 0 : d.abs > 0;
  const cls = flat
    ? "text-[var(--text-faint)]"
    : good
      ? "text-emerald-400"
      : "text-rose-400";
  const Icon = flat ? Minus : d.abs > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${cls}`}>
      <Icon className="w-3 h-3" />
      {d.pct == null ? "kỳ trước chưa có số" : `${d.pct > 0 ? "+" : ""}${d.pct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`}
    </span>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string;
  sub?: React.ReactNode;
  d?: Delta;
  invert?: boolean;
  accent?: boolean;
}> = ({ label, value, sub, d, invert, accent }) => (
  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3.5 space-y-1">
    <p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] font-bold">{label}</p>
    <p className={`text-xl font-black leading-tight ${accent ? "text-[var(--success)]" : "text-[var(--text)]"}`}>{value}</p>
    <div className="flex items-center gap-2 flex-wrap">
      {d && <DeltaChip d={d} invert={invert} />}
      {sub && <span className="text-[10px] text-[var(--text-faint)]">{sub}</span>}
    </div>
  </div>
);

/** Thanh xu hướng bằng CSS, không dùng recharts: `fill="var(--x)"` của SVG KHÔNG resolve biến CSS
 *  nên chart sẽ sai màu ở theme sáng/sand, còn div thì tự đúng cả 3 theme. */
const TrendBars: React.FC<{
  data: { key: string; label: string; value: number; caption: string; current: boolean }[];
  format: (n: number) => string;
}> = ({ data, format }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2 h-36">
      {data.map((d) => (
        <div key={d.key} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" title={`${d.caption}: ${format(d.value)}`}>
          <span className="text-[10px] font-bold text-[var(--text-muted)] whitespace-nowrap">
            {d.value > 0 ? format(d.value) : "—"}
          </span>
          <div
            className="w-full rounded-t-md transition-all"
            style={{
              height: `${Math.max(2, (d.value / max) * 100)}%`,
              background: d.current ? "var(--success)" : "var(--accent)",
              opacity: d.value > 0 ? (d.current ? 1 : 0.55) : 0.15
            }}
          />
          <span className={`text-[10px] whitespace-nowrap ${d.current ? "text-[var(--text)] font-bold" : "text-[var(--text-faint)]"}`}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
};

const Panel: React.FC<{ title: string; icon?: React.ReactNode; desc?: string; right?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  desc,
  right,
  children
}) => (
  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-black text-[var(--text)] flex items-center gap-1.5">
          {icon}
          {title}
        </h3>
        {desc && <p className="text-[11px] text-[var(--text-faint)] mt-0.5 max-w-2xl">{desc}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

export const AgencyOverview: React.FC<AgencyOverviewProps> = ({
  sessions,
  brands,
  talents,
  brandPlatformRates,
  currentRole,
  onOpenSessions,
  onOpenHostPerformance,
  onOpenRateCard,
  onOpenTalents
}) => {
  const today = getTodayDate();
  const [grain, setGrain] = useState<OverviewGrain>("month");
  const [anchorDate, setAnchorDate] = useState(today);

  const period = useMemo(() => periodOf(grain, anchorDate), [grain, anchorDate]);
  const idx = useMemo(() => indexByDate(sessions), [sessions]);

  const rows = useMemo(() => sessionsIn(idx, period.start, period.end), [idx, period]);
  const totals = useMemo(() => totalsOf(rows, today), [rows, today]);

  const prevRange = useMemo(() => comparableRange(grain, period, today), [grain, period, today]);
  const prevTotals = useMemo(
    () => totalsOf(sessionsIn(idx, prevRange.start, prevRange.end), today),
    [idx, prevRange, today]
  );

  const trend = useMemo(
    () => statsFor(idx, recentPeriods(grain, period, grain === "week" ? 8 : 6), today),
    [idx, grain, period, today]
  );

  const countableRows = useMemo(() => rows.filter(isCountable), [rows]);
  const brandShares = useMemo(() => sharesOf(byBrand(countableRows)), [countableRows]);
  const hostSplit = useMemo(() => splitUnassignedHost(byHost(countableRows)), [countableRows]);
  const hostShares = useMemo(() => sharesOf(hostSplit.ranked), [hostSplit]);
  const totalHostHours = useMemo(() => hostShares.reduce((a, r) => a + r.hours, 0), [hostShares]);

  const money = useMemo(
    () => moneyReadiness(brands, brandPlatformRates, talents, rows),
    [brands, brandPlatformRates, talents, rows]
  );

  const inProgress = today >= period.start && today <= period.end;
  const canSeeMoney = currentRole === "ceo" || currentRole === "admin";
  const go = (d: number) => setAnchorDate(shiftPeriod(grain, period, d).start);
  const atLatest = period.end >= today;

  const d = (pick: (t: AgencyTotals) => number) => delta(pick(totals), pick(prevTotals));

  const grainBtn = (g: OverviewGrain, label: string) => (
    <button
      key={g}
      onClick={() => setGrain(g)}
      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
        grain === g
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] border border-[var(--border)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Đầu trang: chọn tuần/tháng + điều hướng kỳ */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
            <Activity className="w-5 h-5 text-[var(--accent-text)]" /> Toàn Cảnh Agency
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">{[grainBtn("week", "Tuần"), grainBtn("month", "Tháng")]}</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => go(-1)}
                className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)]"
                aria-label="Kỳ trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => go(1)}
                disabled={atLatest}
                className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)] disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Kỳ sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black text-[var(--text)]">{period.longLabel}</span>
          {inProgress && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-sky-950 text-sky-300 border-sky-800">
              đang chạy
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)] max-w-3xl">
          Chỉ số thật đã xảy ra, không có ô nào là dự phóng cuối kỳ. So sánh với{" "}
          <strong className="text-[var(--text)]">{prevRange.longLabel}</strong>
          {inProgress && " — kỳ trước đã được cắt về đúng số ngày đã trôi để so cho công bằng"}.
        </p>
      </div>

      {/* Dải số chính */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Giờ live" value={fmtHours(totals.hours)} d={d((t) => t.hours)} sub={`${totals.countable} ca có số`} />
        <StatCard label="GMV" value={fmtMoney(totals.gmv)} d={d((t) => t.gmv)} accent />
        <StatCard label="GMV / giờ" value={fmtMoney(totals.gmvPerHour)} d={d((t) => t.gmvPerHour)} />
        <StatCard label="Đơn" value={fmtInt(totals.orders)} d={d((t) => t.orders)} sub={`AOV ${fmtMoney(totals.aov)}`} />
        <StatCard label="Lượt xem" value={fmtInt(totals.views)} d={d((t) => t.views)} />
      </div>

      {/* Xu hướng */}
      <Panel
        title={grain === "week" ? "Nhịp 8 tuần gần nhất" : "Nhịp 6 tháng gần nhất"}
        icon={<TrendingUp className="w-4 h-4 text-[var(--accent-text)]" />}
        desc="Cột xanh lá là kỳ đang xem. Kỳ đang chạy chưa đủ ngày nên tự nhiên thấp hơn — đọc kèm nhãn 'đang chạy' ở trên."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">GMV</p>
            <TrendBars
              format={fmtMoney}
              data={trend.map((s) => ({
                key: s.period.key,
                label: s.period.label,
                value: s.totals.gmv,
                caption: s.period.longLabel,
                current: s.period.key === period.key
              }))}
            />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">
              GMV / giờ <span className="font-normal text-[var(--text-faint)]">— không phụ thuộc kỳ dài hay ngắn</span>
            </p>
            <TrendBars
              format={fmtMoney}
              data={trend.map((s) => ({
                key: s.period.key,
                label: s.period.label,
                value: s.totals.gmvPerHour,
                caption: s.period.longLabel,
                current: s.period.key === period.key
              }))}
            />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Đóng góp theo brand */}
        <Panel
          title="Đóng góp theo brand"
          desc="Chỉ tính ca đã có số. Thiếu brand nào ở đây nghĩa là kỳ này brand đó chưa chạy ca nào có số."
        >
          {brandShares.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] italic py-4 text-center">Kỳ này chưa có ca nào có số.</p>
          ) : (
            <div className="space-y-2.5">
              {brandShares.map((r) => {
                const brand = brands.find((b) => b.id === r.key);
                return (
                  <div key={r.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text)] min-w-0">
                        {brand && <BrandLogo brand={brand} size="xs" />}
                        <span className="truncate">{r.label}</span>
                      </span>
                      <span className="whitespace-nowrap text-[var(--text-muted)]">
                        <strong className="text-[var(--success)]">{fmtMoney(r.gmv)}</strong> · {fmtHours(r.hours)} ·{" "}
                        {fmtMoney(r.gmvPerHour)}/h
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${r.share}%`, background: "var(--success)" }} />
                    </div>
                    <p className="text-[10px] text-[var(--text-faint)]">
                      {fmtPct(r.share)} GMV kỳ này · {r.countable} ca
                    </p>
                  </div>
                );
              })}
              {brandShares[0] && brandShares[0].share > BRAND_CONCENTRATION_WARN && (
                <p className="text-[11px] text-amber-300 font-semibold flex items-start gap-1.5 pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {brandShares[0].label} gánh {fmtPct(brandShares[0].share)} doanh số kỳ này — mất khách này là mất gần hết
                    doanh thu của kỳ.
                  </span>
                </p>
              )}
            </div>
          )}
        </Panel>

        {/* Con người */}
        <Panel
          title="Con người"
          icon={<Users className="w-4 h-4 text-[var(--accent-text)]" />}
          desc="Xếp theo GMV/giờ. Chi tiết theo thứ trong tuần nằm ở Hiệu Suất Host."
          right={
            onOpenHostPerformance && (
              <button
                onClick={onOpenHostPerformance}
                className="text-[11px] font-bold text-[var(--accent-text)] hover:underline whitespace-nowrap"
              >
                Hiệu Suất Host →
              </button>
            )
          }
        >
          {hostShares.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] italic py-4 text-center">Kỳ này chưa có ca nào có số.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[var(--surface-elevated)] rounded-xl p-2">
                  <p className="text-lg font-black text-[var(--text)]">{hostShares.length}</p>
                  <p className="text-[10px] text-[var(--text-faint)]">host chạy ca</p>
                </div>
                <div className="bg-[var(--surface-elevated)] rounded-xl p-2">
                  <p className="text-lg font-black text-[var(--text)]">{fmtMoney(hostShares[0].gmvPerHour)}</p>
                  <p className="text-[10px] text-[var(--text-faint)]">cao nhất /giờ</p>
                </div>
                <div className="bg-[var(--surface-elevated)] rounded-xl p-2">
                  <p className="text-lg font-black text-[var(--text)]">
                    {fmtMoney(hostShares[hostShares.length - 1].gmvPerHour)}
                  </p>
                  <p className="text-[10px] text-[var(--text-faint)]">thấp nhất /giờ</p>
                </div>
              </div>

              <table className="w-full text-xs">
                <tbody>
                  {hostShares.slice(0, 5).map((r) => (
                    <tr key={r.key} className="border-b border-[var(--border-muted)] last:border-0">
                      <td className="py-1.5 font-bold text-[var(--text)] truncate max-w-[10rem]">{r.label}</td>
                      <td className="py-1.5 text-right text-[var(--text-muted)] whitespace-nowrap">{fmtHours(r.hours)}</td>
                      <td className="py-1.5 text-right font-bold text-[var(--success)] whitespace-nowrap">
                        {fmtMoney(r.gmvPerHour)}/h
                      </td>
                      <td className="py-1.5 text-right text-[var(--text-faint)] whitespace-nowrap">{fmtPct(r.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalHostHours > 0 && (hostShares[0].hours / totalHostHours) * 100 > HOST_CONCENTRATION_WARN && (
                <p className="text-[11px] text-amber-300 font-semibold flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {hostShares[0].label} gánh {fmtPct((hostShares[0].hours / totalHostHours) * 100)} số giờ live kỳ này —
                    người này nghỉ là thủng kỳ.
                  </span>
                </p>
              )}
              {hostSplit.unassigned && (
                <p className="text-[11px] text-[var(--text-faint)]">
                  Ngoài ra còn {hostSplit.unassigned.sessionCount} ca chưa gán host ({fmtMoney(hostSplit.unassigned.gmv)}) —
                  không xếp hạng được.
                </p>
              )}
            </div>
          )}
        </Panel>

        {/* Phễu */}
        <Panel
          title="Phễu chuyển đổi"
          desc="Tỷ lệ tính lại từ số đã cộng, không phải trung bình tỷ lệ của từng ca."
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-[var(--surface-elevated)] rounded-xl p-2.5">
              <p className="text-base font-black text-[var(--text)]">{fmtInt(totals.productImpressions)}</p>
              <p className="text-[10px] text-[var(--text-faint)]">hiển thị SP</p>
            </div>
            <div className="bg-[var(--surface-elevated)] rounded-xl p-2.5">
              <p className="text-base font-black text-[var(--text)]">{fmtInt(totals.productClicks)}</p>
              <p className="text-[10px] text-[var(--text-faint)]">click SP</p>
            </div>
            <div className="bg-[var(--surface-elevated)] rounded-xl p-2.5">
              <p className="text-base font-black text-[var(--text)]">{fmtInt(totals.orders)}</p>
              <p className="text-[10px] text-[var(--text-faint)]">đơn</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[var(--surface-elevated)] rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[var(--text-faint)] uppercase font-bold">CTR</p>
                <p className="text-base font-black text-[var(--text)]">{fmtPct(totals.ctr)}</p>
              </div>
              <DeltaChip d={d((t) => t.ctr)} />
            </div>
            <div className="bg-[var(--surface-elevated)] rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[var(--text-faint)] uppercase font-bold">CTOR</p>
                <p className="text-base font-black text-[var(--text)]">{fmtPct(totals.ctor)}</p>
              </div>
              <DeltaChip d={d((t) => t.ctor)} />
            </div>
          </div>
          {totals.productImpressions === 0 && (
            <p className="text-[11px] text-[var(--text-faint)]">
              Kỳ này chưa ca nào có số hiển thị/click — cột phễu chỉ có ở ca đã nạp file, không có ở ca nhập tay.
            </p>
          )}
        </Panel>

        {/* Kỷ luật vận hành */}
        <Panel
          title="Kỷ luật vận hành"
          desc="Số ca và độ tin cậy của số liệu kỳ này."
          right={
            onOpenSessions && (
              <button
                onClick={onOpenSessions}
                className="text-[11px] font-bold text-[var(--accent-text)] hover:underline whitespace-nowrap"
              >
                Sổ Ca →
              </button>
            )
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-[var(--surface-elevated)] rounded-xl p-2.5">
              <p className="text-lg font-black text-[var(--text)]">{totals.scheduled}</p>
              <p className="text-[10px] text-[var(--text-faint)]">ca đã xếp</p>
            </div>
            <div className="bg-[var(--surface-elevated)] rounded-xl p-2.5">
              <p className="text-lg font-black text-[var(--text)]">{totals.happened}</p>
              <p className="text-[10px] text-[var(--text-faint)]">đã diễn ra</p>
            </div>
            <div className="bg-[var(--surface-elevated)] rounded-xl p-2.5">
              <p className={`text-lg font-black ${totals.noNumbers > 0 ? "text-amber-300" : "text-[var(--text)]"}`}>
                {totals.noNumbers}
              </p>
              <p className="text-[10px] text-[var(--text-faint)]">chưa có số</p>
            </div>
            <div className="bg-[var(--surface-elevated)] rounded-xl p-2.5">
              <p className={`text-lg font-black ${totals.cancelled > 0 ? "text-rose-300" : "text-[var(--text)]"}`}>
                {totals.cancelled}
              </p>
              <p className="text-[10px] text-[var(--text-faint)]">ca huỷ</p>
            </div>
          </div>

          {totals.quality.total > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-[var(--text-muted)]">Số liệu tin được tới đâu</p>
              <div className="h-2 rounded-full overflow-hidden flex bg-[var(--surface-elevated)]">
                <div
                  style={{ width: `${(totals.quality.reconciled / totals.quality.total) * 100}%`, background: "var(--success)" }}
                />
                <div
                  style={{ width: `${(totals.quality.snapshot / totals.quality.total) * 100}%`, background: "var(--accent)" }}
                />
                <div
                  style={{ width: `${(totals.quality.manual / totals.quality.total) * 100}%`, background: "var(--warning)" }}
                />
              </div>
              <p className="text-[10px] text-[var(--text-faint)]">
                {totals.quality.reconciled} đã đối soát · {totals.quality.snapshot} từ file giao ca · {totals.quality.manual}{" "}
                tự khai
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* Khối tiền — chỉ ceo/admin, và KHÔNG hiện số nào khi chưa đủ điều kiện tính */}
      {canSeeMoney && (
        <Panel
          title="Doanh thu & lợi nhuận agency"
          icon={<Lock className="w-4 h-4 text-[var(--text-faint)]" />}
          desc="Chỉ ceo/admin thấy khối này."
        >
          {money.ready ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-muted)]">
                Đã đủ điều kiện để tính P&L cho kỳ này ({money.eligibleSessions} ca hợp lệ). Số chi tiết theo từng ca nằm ở
                tab <strong className="text-[var(--text)]">Finance &amp; P&amp;L</strong> — màn này cố ý không nhân bản con
                số tiền ra hai chỗ.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-[var(--text-muted)]">
                Chưa tính được P&amp;L cho kỳ này. Cố ý <strong className="text-[var(--text)]">không hiện 0đ</strong> — "lãi
                0đ" và "chưa ai nhập rate" là hai chuyện hoàn toàn khác nhau.
              </p>
              <ul className="space-y-1.5">
                {money.blockers.map((b) => (
                  <li key={b} className="text-[11px] text-amber-300 font-semibold flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                {onOpenRateCard && (
                  <button
                    onClick={onOpenRateCard}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--accent-text)] hover:bg-[var(--surface-elevated)]"
                  >
                    Nhập Rate Card (CRM) →
                  </button>
                )}
                {onOpenTalents && (
                  <button
                    onClick={onOpenTalents}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--accent-text)] hover:bg-[var(--surface-elevated)]"
                  >
                    Nhập rate talent (Talent Pool) →
                  </button>
                )}
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
};
