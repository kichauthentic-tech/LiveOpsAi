import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  Link2,
  Trash2,
  X
} from "lucide-react";
import { Brand, LiveSession, UserRole } from "../types";
import { getTodayDate } from "../lib/dateUtils";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { sessionHours } from "../lib/performance/hostPerformance";
import { SessionReportInput } from "../lib/db/sessionReports";
import {
  LedgerFilter,
  MissingStep,
  brandTrustLabel,
  filterLedger,
  groupByDate,
  hasReport,
  hasSnapshot,
  isReconciled,
  ledgerHostKey,
  ledgerHosts,
  ledgerMonths,
  linkedSessions,
  missingSteps,
  needsClosing,
  sessionCounters,
  sessionIncidents,
  sessionRatios,
  summarize
} from "../lib/sessionLedger";
import { DataSourceBadge } from "./common/DataSourceBadge";
import { BrandLogo } from "./ui/BrandLogo";
import { SessionLiveSnapshotUpload } from "./SessionLiveSnapshotUpload";
import { SessionReportForm } from "./SessionReportForm";

// Sổ Ca — một component, hai biến thể (cùng cách SessionEventCard dùng chung cho 2 lịch):
//  - agency: mọi brand, thấy target/studio/trợ live, 3 ô tiến trình dữ liệu, mọi sự cố, hành động.
//  - brand: khoá 1 brand, chỉ số brand cần đọc, nhãn tin cậy 2 mức, ẩn sự cố nội bộ; role brand
//    chỉ đọc, ops mở brand workspace vẫn sửa được report như bảng Sessions cũ.
// Không có form thêm/sửa ca ở đây — mở ca nằm ở Đăng Ký & Chốt Lịch / Lịch Vận Hành.

interface SessionLedgerProps {
  variant: "agency" | "brand";
  sessions: LiveSession[];
  brands: Brand[];
  brandId?: string; // bắt buộc với variant brand
  currentRole: UserRole;
  onSubmitSessionReport: (sessionId: string, input: SessionReportInput) => Promise<boolean>;
  onSessionSnapshotApplied: (session: LiveSession) => void;
  onDeleteSession?: (id: string) => Promise<void>;
}

const OPS_ROLES: UserRole[] = ["ceo", "operations", "admin"];

const STATUS_LABEL: Record<LiveSession["status"], string> = {
  "Live Now": "Đang live",
  Upcoming: "Sắp tới",
  Completed: "Đã xong",
  Cancelled: "Đã huỷ"
};

const STATUS_CLS: Record<LiveSession["status"], string> = {
  "Live Now": "bg-red-950 text-red-300 border-red-800",
  Upcoming: "bg-amber-950 text-amber-300 border-amber-800",
  Completed: "bg-emerald-950 text-emerald-300 border-emerald-800",
  Cancelled: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
};

const MISSING_LABEL: Record<MissingStep, string> = {
  snapshot: "Chưa up snapshot",
  report: "Chưa có report",
  reconcile: "Chưa đối soát"
};

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const wd = WEEKDAY[new Date(y, m - 1, day).getDay()];
  return `${wd} ${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function fmtMonth(m: string): string {
  const [y, mm] = m.split("-");
  return `Tháng ${Number(mm)}/${y}`;
}

function fmtTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function fmtHours(h: number): string {
  return h > 0 ? `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h` : "—";
}

function fmtInt(n: number | undefined): string {
  return (n ?? 0).toLocaleString("vi-VN");
}

function fmtPct(n: number): string {
  return `${n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
}

const inputCls =
  "bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

export const SessionLedger: React.FC<SessionLedgerProps> = ({
  variant,
  sessions,
  brands,
  brandId,
  currentRole,
  onSubmitSessionReport,
  onSessionSnapshotApplied,
  onDeleteSession
}) => {
  const isBrandView = variant === "brand";
  const isOps = OPS_ROLES.includes(currentRole);
  const today = getTodayDate();

  const scoped = useMemo(
    () => (isBrandView && brandId ? sessions.filter((s) => s.brandId === brandId) : sessions),
    [sessions, isBrandView, brandId]
  );

  const months = useMemo(() => ledgerMonths(scoped), [scoped]);
  const hosts = useMemo(() => ledgerHosts(scoped), [scoped]);
  const brandsById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const linked = useMemo(() => linkedSessions(sessions), [sessions]);

  const [filter, setFilter] = useState<LedgerFilter>(() => ({ month: today.slice(0, 7) }));
  // Tháng hiện tại chưa có ca (đầu tháng, hoặc brand mới) thì rơi về tháng gần nhất có ca —
  // không để người dùng mở ra thấy bảng trống rồi tưởng mất dữ liệu.
  useEffect(() => {
    if (months.length > 0 && filter.month && !months.includes(filter.month)) {
      setFilter((f) => ({ ...f, month: months[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months.join(",")]);

  const rows = useMemo(() => filterLedger(scoped, filter, today), [scoped, filter, today]);
  const days = useMemo(() => groupByDate(rows), [rows]);
  const summary = useMemo(() => summarize(rows, today), [rows, today]);

  const [openId, setOpenId] = useState<string | null>(null);
  const openSession = openId ? sessions.find((s) => s.id === openId) ?? null : null;

  const patch = (p: Partial<LedgerFilter>) => setFilter((f) => ({ ...f, ...p }));

  return (
    <div className="space-y-4">
      {/* Tiêu đề + bộ lọc */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[var(--accent-text)]" /> Sổ Ca
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1 max-w-2xl">
              {isBrandView
                ? "Từng ca live đã chạy cho brand: giờ live thật, GMV, đơn, lượt xem. Số “Tạm tính” còn chờ TikTok cập nhật, “Đã chốt” là số đối soát cuối kỳ."
                : "Từng ca đã/đang chạy: số thật của ca, số đó tin được tới đâu, và còn thiếu bước nào (snapshot → report → đối soát) để chốt tháng."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={filter.month} onChange={(e) => patch({ month: e.target.value })} className={inputCls}>
              <option value="">Mọi tháng</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(m)}
                </option>
              ))}
            </select>
            {!isBrandView && (
              <select value={filter.brandId ?? ""} onChange={(e) => patch({ brandId: e.target.value })} className={inputCls}>
                <option value="">Mọi brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <select value={filter.hostKey ?? ""} onChange={(e) => patch({ hostKey: e.target.value })} className={inputCls}>
              <option value="">Mọi host</option>
              {hosts.map((h) => (
                <option key={h.key} value={h.key}>
                  {h.name}
                </option>
              ))}
            </select>
            <select
              value={filter.status ?? ""}
              onChange={(e) => patch({ status: e.target.value as LedgerFilter["status"] })}
              className={inputCls}
            >
              <option value="">Mọi trạng thái</option>
              {(Object.keys(STATUS_LABEL) as LiveSession["status"][]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bộ lọc "còn thiếu" — thứ biến sổ thành việc phải làm. Brand không cần thấy quy trình nội bộ. */}
        {!isBrandView && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--text-faint)] mr-1">Còn thiếu:</span>
            {(["snapshot", "report", "reconcile"] as MissingStep[]).map((m) => {
              const active = filter.missing === m;
              return (
                <button
                  key={m}
                  onClick={() => patch({ missing: active ? "" : m })}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                    active
                      ? "bg-amber-600 text-white border-amber-500"
                      : summary.missing[m] > 0
                        ? "bg-amber-950/60 text-amber-300 border-amber-800 hover:bg-amber-900"
                        : "bg-[var(--surface-base)] text-[var(--text-faint)] border-[var(--border)]"
                  }`}
                >
                  {MISSING_LABEL[m]} ({summary.missing[m]})
                </button>
              );
            })}
          </div>
        )}

        {/* Dải tổng hợp theo bộ lọc */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat label="Số ca" value={String(summary.total)} sub={summary.countable < summary.total ? `${summary.countable} ca có số` : undefined} />
          <Stat label="Giờ live" value={fmtHours(summary.hours)} sub="giờ thật, thiếu thì lấy giờ kế hoạch" />
          <Stat label="GMV" value={formatCurrencyAdaptive(summary.gmv, "")} accent />
          <Stat label="Đơn" value={fmtInt(summary.orders)} />
          <Stat label="GMV / giờ" value={formatCurrencyAdaptive(summary.gmvPerHour, "")} />
          <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Nguồn số liệu</p>
            {summary.countable === 0 ? (
              <p className="text-xs text-[var(--text-faint)] mt-1">—</p>
            ) : isBrandView ? (
              <p className="text-xs text-[var(--text)] mt-1">
                <b className="text-emerald-300">{summary.quality.reconciled}</b> đã chốt ·{" "}
                <b className="text-amber-300">{summary.quality.snapshot + summary.quality.manual}</b> tạm tính
              </p>
            ) : (
              <p className="text-xs text-[var(--text)] mt-1">
                <b className="text-emerald-300">{summary.quality.reconciled}</b> đối soát ·{" "}
                <b className="text-sky-300">{summary.quality.snapshot}</b> snapshot ·{" "}
                <b className="text-amber-300">{summary.quality.manual}</b> tự khai
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bảng gom theo ngày */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4">Giờ</th>
                {!isBrandView && <th className="py-2.5 px-2">Brand</th>}
                <th className="py-2.5 px-2">Host</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                <th className="py-2.5 px-2 text-right">Giờ live</th>
                {!isBrandView && <th className="py-2.5 px-2 text-right">Target</th>}
                <th className="py-2.5 px-2 text-right">GMV</th>
                <th className="py-2.5 px-2 text-right">Đơn</th>
                {isBrandView && <th className="py-2.5 px-2 text-right">Lượt xem</th>}
                <th className="py-2.5 px-2 text-right">GMV/giờ</th>
                <th className="py-2.5 px-2">{isBrandView ? "Số liệu" : "Dữ liệu"}</th>
                <th className="py-2.5 px-2">Sự cố</th>
                <th className="py-2.5 px-2" />
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <React.Fragment key={day.date}>
                  <tr className="bg-[var(--surface-elevated)]/50">
                    <td colSpan={13} className="py-1.5 px-4 text-[11px] font-bold text-[var(--text-muted)]">
                      {fmtDate(day.date)}
                      <span className="text-[var(--text-faint)] font-normal"> · {day.sessions.length} ca</span>
                    </td>
                  </tr>
                  {day.sessions.map((s) => {
                    const hours = sessionHours(s);
                    const gmvPerHour = hours > 0 ? (s.actualGmv ?? 0) / hours : 0;
                    const incidents = sessionIncidents(s).filter((i) => !isBrandView || !i.internal);
                    const missing = isBrandView ? [] : missingSteps(s, today);
                    const isOpen = openId === s.id;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setOpenId(s.id)}
                        className={`border-b border-[var(--border-muted)] cursor-pointer transition-colors ${
                          isOpen ? "bg-[var(--accent)]/10" : "hover:bg-[var(--surface-elevated)]/40"
                        }`}
                      >
                        <td className="py-2.5 px-4 font-mono text-[var(--text)] whitespace-nowrap">
                          {s.startTime}–{s.endTime}
                          {s.actualStartAt && (
                            <span className="block text-[10px] text-[var(--text-faint)] font-sans">
                              thật {fmtTime(s.actualStartAt)}–{fmtTime(s.actualEndAt)}
                            </span>
                          )}
                        </td>
                        {!isBrandView && (
                          <td className="py-2.5 px-2">
                            <span className="inline-flex items-center gap-1.5 text-[var(--text)] font-bold">
                              <BrandLogo brand={brandsById.get(s.brandId) ?? { name: s.brandName, logo: "" }} size="xs" />
                              {s.brandName}
                            </span>
                          </td>
                        )}
                        <td className="py-2.5 px-2 text-[var(--text)]">
                          {s.hostName || <span className="text-[var(--text-faint)] italic">{isBrandView ? "—" : "chưa gán"}</span>}
                          {!isBrandView && s.coHostName && (
                            <span className="block text-[10px] text-[var(--text-faint)]">+ {s.coHostName}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CLS[s.status]}`}>
                            {STATUS_LABEL[s.status]}
                          </span>
                          {!isBrandView && s.isBackfill && (
                            <span className="block text-[10px] text-[var(--text-faint)] mt-0.5">nạp bù</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right text-[var(--text-muted)] whitespace-nowrap">
                          {s.liveDurationMinutes ? fmtHours(s.liveDurationMinutes / 60) : <span className="text-[var(--text-faint)]">({fmtHours(hours)})</span>}
                        </td>
                        {!isBrandView && (
                          <td className="py-2.5 px-2 text-right text-[var(--text-muted)] whitespace-nowrap">
                            {s.targetGmv ? formatCurrencyAdaptive(s.targetGmv, "") : "—"}
                          </td>
                        )}
                        <td className="py-2.5 px-2 text-right font-bold text-[var(--success)] whitespace-nowrap">
                          {s.actualGmv ? formatCurrencyAdaptive(s.actualGmv, "") : <span className="text-[var(--text-faint)] font-normal">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-right text-[var(--text-muted)]">{s.totalOrders ? fmtInt(s.totalOrders) : "—"}</td>
                        {isBrandView && (
                          <td className="py-2.5 px-2 text-right text-[var(--text-muted)]">{s.totalViews ? fmtInt(s.totalViews) : "—"}</td>
                        )}
                        <td className="py-2.5 px-2 text-right text-[var(--text-muted)] whitespace-nowrap">
                          {gmvPerHour > 0 ? formatCurrencyAdaptive(gmvPerHour, "") : "—"}
                        </td>
                        <td className="py-2.5 px-2">
                          {isBrandView ? (
                            s.status === "Completed" || s.actualGmv ? <TrustBadge session={s} /> : <span className="text-[var(--text-faint)]">—</span>
                          ) : (
                            <PipelineDots session={s} today={today} />
                          )}
                          {!isBrandView && missing.length > 0 && (
                            <span className="block text-[10px] text-amber-300 mt-0.5">{missing.map((m) => MISSING_LABEL[m]).join(" · ")}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex flex-wrap gap-1">
                            {incidents.map((i) => (
                              <span
                                key={i.key}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-rose-950/60 text-rose-300 border-rose-800 whitespace-nowrap"
                              >
                                {i.label}
                              </span>
                            ))}
                            {linked.has(s.id) && (
                              <span
                                title="Ca nối — dùng chung Room ID với ca khác"
                                className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-sky-950/60 text-sky-300 border-sky-800"
                              >
                                <Link2 className="w-3 h-3" /> nối
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-[var(--text-faint)]">
                          <ChevronRight className="w-4 h-4" />
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-[var(--text-faint)] italic">
                    {scoped.length === 0 ? "Chưa có ca nào." : "Không có ca nào khớp bộ lọc."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openSession && (
        <SessionDrawer
          session={openSession}
          brand={brandsById.get(openSession.brandId)}
          isBrandView={isBrandView}
          isOps={isOps}
          today={today}
          linkedIds={linked.get(openSession.id) ?? []}
          allSessions={sessions}
          onClose={() => setOpenId(null)}
          onSubmitSessionReport={onSubmitSessionReport}
          onSessionSnapshotApplied={onSessionSnapshotApplied}
          onDeleteSession={onDeleteSession}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; sub?: string; accent?: boolean }> = ({ label, value, sub, accent }) => (
  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-2.5">
    <p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
    <p className={`text-base font-black mt-0.5 ${accent ? "text-[var(--success)]" : "text-[var(--text)]"}`}>{value}</p>
    {sub && <p className="text-[10px] text-[var(--text-faint)]">{sub}</p>}
  </div>
);

const TrustBadge: React.FC<{ session: LiveSession }> = ({ session }) => {
  const label = brandTrustLabel(session);
  const done = label === "Đã chốt";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
        done ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"
      }`}
      title={done ? "Số đã đối soát với báo cáo TikTok cuối kỳ" : "Số ghi nhận lúc giao ca / tự khai, TikTok còn cập nhật"}
    >
      {done ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />} {label}
    </span>
  );
};

// 3 ô tiến trình dữ liệu: snapshot → report → đối soát. Ca không cần chốt (sắp tới/huỷ/nạp bù)
// hiện mờ để không bị đọc nhầm là thiếu.
const PipelineDots: React.FC<{ session: LiveSession; today: string }> = ({ session, today }) => {
  const relevant = needsClosing(session, today);
  const steps: { label: string; done: boolean }[] = [
    { label: "Snapshot", done: hasSnapshot(session) },
    { label: "Report", done: hasReport(session) },
    { label: "Đối soát", done: isReconciled(session) }
  ];
  return (
    <div className={`flex items-center gap-1 ${relevant ? "" : "opacity-40"}`} title={steps.map((s) => `${s.label}: ${s.done ? "✓" : "—"}`).join(" · ")}>
      {steps.map((s) => (
        <span
          key={s.label}
          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            s.done
              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
              : relevant
                ? "bg-[var(--surface-base)] text-[var(--text-faint)] border-[var(--border)]"
                : "bg-transparent text-[var(--text-faint)] border-[var(--border-muted)]"
          }`}
        >
          {s.done ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
          {s.label}
        </span>
      ))}
    </div>
  );
};

interface SessionDrawerProps {
  session: LiveSession;
  brand?: Brand;
  isBrandView: boolean;
  isOps: boolean;
  today: string;
  linkedIds: string[];
  allSessions: LiveSession[];
  onClose: () => void;
  onSubmitSessionReport: (sessionId: string, input: SessionReportInput) => Promise<boolean>;
  onSessionSnapshotApplied: (session: LiveSession) => void;
  onDeleteSession?: (id: string) => Promise<void>;
}

const SessionDrawer: React.FC<SessionDrawerProps> = ({
  session: s,
  brand,
  isBrandView,
  isOps,
  today,
  linkedIds,
  allSessions,
  onClose,
  onSubmitSessionReport,
  onSessionSnapshotApplied,
  onDeleteSession
}) => {
  const [editingReport, setEditingReport] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => setEditingReport(false), [s.id]);

  const counters = sessionCounters(s);
  const ratios = sessionRatios(s);
  const incidents = sessionIncidents(s).filter((i) => !isBrandView || !i.internal);
  const missing = isBrandView ? [] : missingSteps(s, today);
  const planHours = sessionHours({ ...s, liveDurationMinutes: undefined });
  const liveHours = s.liveDurationMinutes ? s.liveDurationMinutes / 60 : 0;
  const gmvPerHour = liveHours > 0 ? (s.actualGmv ?? 0) / liveHours : planHours > 0 ? (s.actualGmv ?? 0) / planHours : 0;
  const linkedLabel = linkedIds
    .map((id) => allSessions.find((x) => x.id === id))
    .filter((x): x is LiveSession => !!x)
    .map((x) => `${fmtDate(x.date)} ${x.startTime}–${x.endTime} (${x.hostName || "chưa gán"})`);

  const handleDelete = async () => {
    if (!onDeleteSession) return;
    if (!window.confirm(`Xoá ca ${fmtDate(s.date)} ${s.startTime}–${s.endTime} (${s.brandName})? Không hoàn tác được.`)) return;
    setDeleting(true);
    try {
      await onDeleteSession(s.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] p-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BrandLogo brand={brand ?? { name: s.brandName, logo: "" }} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-black text-[var(--text)] truncate">
                  {s.brandName} · {fmtDate(s.date)} · {s.startTime}–{s.endTime}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">
                  Host {s.hostName || (isBrandView ? "—" : "chưa gán")}
                  {!isBrandView && s.coHostName ? ` · Trợ ${s.coHostName}` : ""}
                  {!isBrandView && s.studioName ? ` · ${s.studioName}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CLS[s.status]}`}>{STATUS_LABEL[s.status]}</span>
              {isBrandView ? <TrustBadge session={s} /> : <DataSourceBadge dataSource={s.dataSource} />}
              {!isBrandView && s.isBackfill && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]">
                  nạp bù từ file
                </span>
              )}
              {s.reconciledAt && (
                <span className="text-[10px] text-[var(--text-faint)]">
                  đối soát {new Date(s.reconciledAt).toLocaleDateString("vi-VN")}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)] shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {missing.length > 0 && (
            <div className="rounded-xl border border-amber-800 bg-amber-950/50 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Còn thiếu để chốt: {missing.map((m) => MISSING_LABEL[m]).join(" · ")}</span>
            </div>
          )}

          {/* Kế hoạch vs thực tế */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold mb-2">Kế hoạch vs thực tế</h4>
            <div className="grid grid-cols-2 gap-2">
              <KV label="Giờ kế hoạch" value={`${s.startTime}–${s.endTime} (${fmtHours(planHours)})`} />
              <KV
                label="Giờ live thật"
                value={s.actualStartAt ? `${fmtTime(s.actualStartAt)}–${fmtTime(s.actualEndAt)} (${fmtHours(liveHours)})` : "chưa có file"}
                muted={!s.actualStartAt}
              />
              {!isBrandView && <KV label="Target GMV" value={s.targetGmv ? formatCurrencyAdaptive(s.targetGmv) : "chưa có target"} muted={!s.targetGmv} />}
              <KV label="GMV thực tế" value={s.actualGmv ? formatCurrencyAdaptive(s.actualGmv) : "—"} accent={!!s.actualGmv} />
              {!isBrandView && s.targetGmv > 0 && (
                <KV label="Đạt target" value={fmtPct(((s.actualGmv ?? 0) / s.targetGmv) * 100)} />
              )}
              <KV label="GMV / giờ" value={gmvPerHour > 0 ? formatCurrencyAdaptive(gmvPerHour) : "—"} />
            </div>
          </section>

          {/* Số liệu ca */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold mb-2">Số liệu ca</h4>
            {counters ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <KV label="Đơn" value={fmtInt(counters.orders)} />
                  <KV label="Sản phẩm bán" value={fmtInt(counters.itemsSold)} />
                  <KV label="Đơn SKU" value={fmtInt(counters.skuOrders)} />
                  <KV label="Lượt xem" value={fmtInt(counters.views)} />
                  <KV label="Hiển thị" value={fmtInt(counters.impressions)} />
                  <KV label="Hiển thị SP" value={fmtInt(counters.productImpressions)} />
                  <KV label="Click SP" value={fmtInt(counters.productClicks)} />
                  <KV label="Follow mới" value={fmtInt(counters.newFollowers)} />
                  <KV label="Bình luận" value={fmtInt(counters.comments)} />
                  <KV label="Chia sẻ" value={fmtInt(counters.shares)} />
                  <KV label="Thích" value={fmtInt(counters.likes)} />
                  <KV label="Peak viewers" value={fmtInt(s.peakViewers)} />
                </div>
                {ratios && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <KV label="AOV" value={formatCurrencyAdaptive(ratios.aov)} />
                    <KV label="CTR" value={fmtPct(ratios.ctr)} />
                    <KV label="CTOR" value={fmtPct(ratios.ctor)} />
                    <KV label="LIVE CTR" value={fmtPct(ratios.liveCtr)} />
                    <KV label="SKU order rate" value={fmtPct(ratios.skuOrderRate)} />
                    <KV label="Show GPM" value={formatCurrencyAdaptive(ratios.showGpm)} />
                  </div>
                )}
                <p className="text-[10px] text-[var(--text-faint)] mt-2">
                  Tỷ lệ tính lại từ số đã tách theo ca, không lấy cột tỷ lệ cộng dồn của file.
                </p>
              </>
            ) : s.actualGmv || s.totalOrders || s.totalViews ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <KV label="Đơn" value={fmtInt(s.totalOrders)} />
                  <KV label="Lượt xem" value={fmtInt(s.totalViews)} />
                  <KV label="Peak viewers" value={fmtInt(s.peakViewers)} />
                </div>
                <p className="text-[10px] text-amber-300 mt-2">Số tự khai tay — chưa có file snapshot nên không tính được tỷ lệ.</p>
              </>
            ) : (
              <p className="text-xs text-[var(--text-faint)] italic">Chưa có số liệu.</p>
            )}
          </section>

          {/* Room / ca nối */}
          {!isBrandView && ((s.liveRoomIds?.length ?? 0) > 0 || linkedLabel.length > 0) && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold mb-2">Phiên TikTok</h4>
              {(s.liveRoomIds?.length ?? 0) > 0 && (
                <p className="text-xs text-[var(--text-muted)] font-mono break-all">Room: {s.liveRoomIds!.join(", ")}</p>
              )}
              {linkedLabel.length > 0 && (
                <p className="text-xs text-sky-300 mt-1 flex items-start gap-1">
                  <Link2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Ca nối, chung room với: {linkedLabel.join("; ")}</span>
                </p>
              )}
            </section>
          )}

          {/* Report ca */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold">Report ca</h4>
              {isOps && !editingReport && (
                <button
                  onClick={() => setEditingReport(true)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors"
                >
                  {s.report ? "Sửa report" : "Nhập report"}
                </button>
              )}
            </div>
            {editingReport ? (
              <SessionReportForm
                session={s}
                onSubmit={async (input) => {
                  const ok = await onSubmitSessionReport(s.id, input);
                  if (ok) setEditingReport(false);
                  return ok;
                }}
                onCancel={() => setEditingReport(false)}
                canOverrideMetrics={isOps}
              />
            ) : s.report ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {incidents.length === 0 && <span className="text-xs text-emerald-300">Không có sự cố</span>}
                  {incidents.map((i) => (
                    <span key={i.key} className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-rose-950/60 text-rose-300 border-rose-800">
                      {i.label}
                    </span>
                  ))}
                </div>
                {s.report.statusNote && <p className="text-xs text-[var(--text)] whitespace-pre-wrap">{s.report.statusNote}</p>}
                {(s.report.dashboardLink1 || s.report.dashboardLink2) && (
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {s.report.dashboardLink1 && (
                      <a href={s.report.dashboardLink1} target="_blank" rel="noreferrer" className="text-[var(--accent-text)] underline">
                        Dashboard 1
                      </a>
                    )}
                    {s.report.dashboardLink2 && (
                      <a href={s.report.dashboardLink2} target="_blank" rel="noreferrer" className="text-[var(--accent-text)] underline">
                        Dashboard 2
                      </a>
                    )}
                  </div>
                )}
                {s.report.submittedAt && (
                  <p className="text-[10px] text-[var(--text-faint)]">
                    Nhập lúc {new Date(s.report.submittedAt).toLocaleString("vi-VN")}
                    {s.report.submittedByRole ? ` · ${s.report.submittedByRole}` : ""}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-faint)] italic">Chưa có report.</p>
            )}
          </section>

          {/* Snapshot — chỉ agency; RPC tự guard quyền, UI chỉ giấu với brand */}
          {!isBrandView && isOps && !s.isBackfill && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold mb-2">File số liệu (snapshot)</h4>
              <SessionLiveSnapshotUpload session={s} onApplied={onSessionSnapshotApplied} />
            </section>
          )}

          {!isBrandView && isOps && onDeleteSession && (
            <div className="pt-3 border-t border-[var(--border)]">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-faint)] hover:text-rose-400 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Đang xoá..." : "Xoá ca này"}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

const KV: React.FC<{ label: string; value: string; muted?: boolean; accent?: boolean }> = ({ label, value, muted, accent }) => (
  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2.5 py-2">
    <p className="text-[10px] text-[var(--text-faint)]">{label}</p>
    <p className={`text-xs font-bold ${accent ? "text-[var(--success)]" : muted ? "text-[var(--text-faint)] font-normal italic" : "text-[var(--text)]"}`}>{value}</p>
  </div>
);
