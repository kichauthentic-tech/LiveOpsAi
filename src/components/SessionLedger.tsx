import React, { useEffect, useMemo, useState } from "react";
import { SESSION_STATUS_CLS, SESSION_STATUS_LABEL_VI } from "../lib/sessionStatusUi";
import { BookOpen, CheckCircle2, ChevronRight, Circle, Download, EyeOff, Link2 } from "lucide-react";
import { Brand, LiveSession, Studio, Talent, UserRole, AuditLogEntry } from "../types";
import { getTodayDate } from "../lib/dateUtils";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { sessionHours } from "../lib/performance/hostPerformance";
import { SessionReportInput } from "../lib/db/sessionReports";
import { downloadRowsAsXlsx } from "../lib/exportXlsx";
import { LedgerFilter, MissingStep, brandTrustLabel, filterLedger, groupByDate, hasReport, hasSnapshot, isReconciled, needsClosing, metricsHiddenFor, ledgerHosts, ledgerMonths, linkedSessions, missingSteps, sessionIncidents, summarize } from "../lib/sessionLedger";

import { BrandLogo } from "./ui/BrandLogo";
import { SessionWindow } from "./SessionWindow";

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
  myTalentId?: string;
  // Cho Cửa sổ Ca Live: ops sửa giờ/studio/người ngay trong cửa sổ (agency).
  studios?: Studio[];
  talents?: Talent[];
  onSubmitSessionReport: (sessionId: string, input: SessionReportInput) => Promise<boolean>;
  onSessionSnapshotApplied: (session: LiveSession) => void;
  onUpdateSession?: (session: LiveSession) => Promise<boolean>;
  onDeleteSession?: (id: string) => Promise<void>;
  onCancelSession?: (id: string, reason: string, reopenSlot: boolean) => Promise<boolean>;
  onSetSessionExcluded?: (id: string, excluded: boolean, reason: string) => Promise<boolean>;
  onRequestDropout?: (sessionId: string, reason: string) => Promise<boolean>; // Đ7 (0116) — talent báo bận, chỉ gửi thông báo cho ops
  /** Đ10 (0114): ca đã loại khỏi báo cáo — App lọc chúng ra khỏi `activeSessions` nên chúng KHÔNG
   *  có trong `sessions` ở đây, và không được có (mọi ô tổng ở màn này sẽ sai). Sổ Ca là màn duy
   *  nhất nhận riêng danh sách đó: không có đường này thì cờ là một chiều — loại rồi thì chính ops
   *  cũng không tìm lại được ca để bỏ cờ. Cố ý KHÔNG trộn vào `rows`/`summary`/Xuất Excel. */
  excludedSessions?: LiveSession[];
  onLogAudit?: (entry: { action: string; details: string; category: AuditLogEntry["category"] }) => Promise<void>;
}

const STATUS_LABEL = SESSION_STATUS_LABEL_VI;

const STATUS_CLS = SESSION_STATUS_CLS;

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

const inputCls =
  "bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

// Ô số bị khoá vì tháng chưa phát hành. Cố ý KHÔNG dùng dấu "—" như ô rỗng: brand phải phân biệt
// được "ca này chưa có số" với "có số rồi nhưng chưa tới lượt bạn xem".
const LockedCell: React.FC = () => (
  <span
    title="Số liệu tháng này sẽ hiện sau khi Report Tháng được phát hành."
    className="text-[11px] text-[var(--text-faint)] font-normal italic"
  >
    chưa phát hành
  </span>
);

export const SessionLedger: React.FC<SessionLedgerProps> = ({
  variant,
  sessions,
  brands,
  brandId,
  currentRole,
  myTalentId,
  studios,
  talents,
  onSubmitSessionReport,
  onSessionSnapshotApplied,
  onUpdateSession,
  onDeleteSession,
  onCancelSession,
  onSetSessionExcluded,
  onRequestDropout,
  excludedSessions = [],
  onLogAudit
}) => {
  const isBrandView = variant === "brand";
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

  // Số ca trong bộ lọc hiện tại mà người đang xem KHÔNG được thấy số (brand + tháng chưa phát
  // hành). Các ca đó đóng góp 0 vào mọi ô KPI ở dải tổng bên dưới, nên phải nói ra: không thì
  // brand đọc "3,5 tỷ" mà thực tế là tổng của riêng những tháng đã phát hành, và tưởng đó là
  // toàn bộ kết quả.
  const hiddenCount = useMemo(
    () => rows.filter((s) => metricsHiddenFor(s, currentRole)).length,
    [rows, currentRole]
  );

  const [openId, setOpenId] = useState<string | null>(null);
  const openSession = openId ? sessions.find((s) => s.id === openId) ?? excludedSessions.find((s) => s.id === openId) ?? null : null;
  // Không lọc theo tháng đang chọn: cả điểm của khối này là tìm lại được ca đã loại, mà người đi
  // tìm thường không nhớ nó nằm tháng nào. Số lượng luôn rất nhỏ.
  const excludedScoped = useMemo(
    () => (isBrandView && brandId ? excludedSessions.filter((s) => s.brandId === brandId) : excludedSessions)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
    [excludedSessions, isBrandView, brandId]
  );

  const patch = (p: Partial<LedgerFilter>) => setFilter((f) => ({ ...f, ...p }));

  // Xuất Excel (Đợt C/4) — đúng những dòng/cột đang hiện trên bảng bên dưới, kể cả phần bị che.
  // Không đọc thêm gì ngoài `rows` (đã lọc + đã che theo role từ chính state đang render), nên
  // không thể lộ hơn những gì màn hình đang cho xem.
  const handleExport = () => {
    const exportRows = rows.map((s) => {
      const hours = sessionHours(s);
      const gmvPerHour = hours > 0 ? (s.actualGmv ?? 0) / hours : 0;
      const hideMetrics = metricsHiddenFor(s, currentRole);
      const incidents = sessionIncidents(s).filter((i) => !isBrandView || !i.internal);
      const row: Record<string, string | number> = {
        "Ngày": s.date,
        "Giờ": `${s.startTime}–${s.endTime}`
      };
      if (!isBrandView) row["Brand"] = s.brandName;
      row["Host"] = s.hostName || (isBrandView ? "" : "chưa gán");
      if (!isBrandView) row["Trợ live"] = s.coHostName || "";
      row["Trạng thái"] = STATUS_LABEL[s.status];
      row["Giờ live"] = s.liveDurationMinutes ? Number((s.liveDurationMinutes / 60).toFixed(2)) : Number(hours.toFixed(2));
      if (!isBrandView) row["Target GMV"] = s.targetGmv || 0;
      row["GMV"] = hideMetrics ? "Chưa phát hành" : s.actualGmv || 0;
      row["Orders"] = hideMetrics ? "Chưa phát hành" : s.totalOrders || 0;
      if (isBrandView) row["Views"] = hideMetrics ? "Chưa phát hành" : s.totalViews || 0;
      row["GMV/giờ"] = hideMetrics ? "Chưa phát hành" : Math.round(gmvPerHour);
      row[isBrandView ? "Số liệu" : "Dữ liệu"] = isBrandView
        ? hideMetrics
          ? "Chờ phát hành"
          : s.status === "Completed" || s.actualGmv
            ? brandTrustLabel(s)
            : ""
        : !needsClosing(s, today)
          ? "Chưa cần đóng"
          : [
              hasSnapshot(s) ? "Snapshot ✓" : "Snapshot ✗",
              hasReport(s) ? "Report ✓" : "Report ✗",
              isReconciled(s) ? "Đối soát ✓" : "Đối soát ✗"
            ].join(", ");
      row["Sự cố"] = incidents.map((i) => i.label).join(", ");
      return row;
    });
    const monthLabel = filter.month || "moi-thang";
    const scopeLabel = isBrandView ? (brandsById.get(brandId ?? "")?.name ?? "brand") : (filter.brandId ? brandsById.get(filter.brandId)?.name ?? "brand" : "tat-ca-brand");
    downloadRowsAsXlsx("So Ca", exportRows, `SoCa_${scopeLabel}_${monthLabel}.xlsx`.replace(/\s+/g, "_"));
  };

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
            {hiddenCount > 0 && (
              <p className="text-[11px] text-amber-300 mt-1.5 max-w-2xl">
                {hiddenCount}/{rows.length} ca thuộc tháng chưa phát hành Report Tháng — số liệu của các ca đó chưa hiển thị,
                và <b>chưa được tính</b> vào các ô tổng bên dưới.
              </p>
            )}
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
            <button
              onClick={handleExport}
              disabled={rows.length === 0}
              title="Xuất đúng các dòng đang lọc ra file Excel"
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel
            </button>
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
          <Stat label="Sessions" value={String(summary.total)} sub={summary.countable < summary.total ? `${summary.countable} ca có số` : undefined} />
          <Stat label="Giờ live" value={fmtHours(summary.hours)} sub="giờ thật, thiếu thì lấy giờ kế hoạch" />
          <Stat label="GMV" value={formatCurrencyAdaptive(summary.gmv, "")} accent />
          <Stat label="Orders" value={fmtInt(summary.orders)} />
          <Stat label="GMV/giờ" value={formatCurrencyAdaptive(summary.gmvPerHour, "")} />
          <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-2.5">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-faint)]">Nguồn số liệu</p>
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
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[11px] tracking-wider">
                <th className="py-2.5 px-4">Giờ</th>
                {!isBrandView && <th className="py-2.5 px-2">Brand</th>}
                <th className="py-2.5 px-2">Host</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                <th className="py-2.5 px-2 text-right">Giờ live</th>
                {!isBrandView && <th className="py-2.5 px-2 text-right">Target GMV</th>}
                <th className="py-2.5 px-2 text-right">GMV</th>
                <th className="py-2.5 px-2 text-right">Orders</th>
                {isBrandView && <th className="py-2.5 px-2 text-right">Views</th>}
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
                    // Brand + tháng chưa phát hành: số đã bị view che, ô phải nói rõ LÝ DO.
                    const hideMetrics = metricsHiddenFor(s, currentRole);
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
                            <span className="block text-[11px] text-[var(--text-faint)] font-sans">
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
                            <span className="block text-[11px] text-[var(--text-faint)]">+ {s.coHostName}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CLS[s.status]}`}>
                            {STATUS_LABEL[s.status]}
                          </span>
                          {!isBrandView && s.isBackfill && (
                            <span className="block text-[11px] text-[var(--text-faint)] mt-0.5">nạp bù</span>
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
                          {hideMetrics ? (
                            <LockedCell />
                          ) : s.actualGmv ? (
                            formatCurrencyAdaptive(s.actualGmv, "")
                          ) : (
                            <span className="text-[var(--text-faint)] font-normal">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right text-[var(--text-muted)]">
                          {hideMetrics ? <LockedCell /> : s.totalOrders ? fmtInt(s.totalOrders) : "—"}
                        </td>
                        {isBrandView && (
                          <td className="py-2.5 px-2 text-right text-[var(--text-muted)]">
                            {hideMetrics ? <LockedCell /> : s.totalViews ? fmtInt(s.totalViews) : "—"}
                          </td>
                        )}
                        <td className="py-2.5 px-2 text-right text-[var(--text-muted)] whitespace-nowrap">
                          {hideMetrics ? <LockedCell /> : gmvPerHour > 0 ? formatCurrencyAdaptive(gmvPerHour, "") : "—"}
                        </td>
                        <td className="py-2.5 px-2">
                          {isBrandView ? (
                            hideMetrics ? (
                              <span className="text-[11px] text-[var(--text-faint)]">chờ phát hành</span>
                            ) : s.status === "Completed" || s.actualGmv ? (
                              <TrustBadge session={s} />
                            ) : (
                              <span className="text-[var(--text-faint)]">—</span>
                            )
                          ) : (
                            <PipelineDots session={s} today={today} />
                          )}
                          {!isBrandView && missing.length > 0 && (
                            <span className="block text-[11px] text-amber-300 mt-0.5">{missing.map((m) => MISSING_LABEL[m]).join(" · ")}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex flex-wrap gap-1">
                            {incidents.map((i) => (
                              <span
                                key={i.key}
                                className="text-[11px] font-bold px-1.5 py-0.5 rounded border bg-rose-950/60 text-rose-300 border-rose-800 whitespace-nowrap"
                              >
                                {i.label}
                              </span>
                            ))}
                            {linked.has(s.id) && (
                              <span
                                title="Ca nối — dùng chung Room ID với ca khác"
                                className="inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded border bg-sky-950/60 text-sky-300 border-sky-800"
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

      {excludedScoped.length > 0 && (
        <div className="bg-[var(--surface)] border border-violet-900/60 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-violet-300" />
            <h3 className="text-sm font-bold text-[var(--text)]">Ca đã loại khỏi báo cáo ({excludedScoped.length})</h3>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Mọi tháng, không theo bộ lọc trên. Số của các ca này <b>không</b> nằm trong dải tổng ở trên, cũng không nằm trong
            Report Tháng / Hiệu Suất Host / P&amp;L, và brand không thấy chúng. Bấm vào ca để xem số cũ hoặc đưa trở lại.
          </p>
          <ul className="divide-y divide-[var(--border-muted)]">
            {excludedScoped.map((s) => (
              <li key={s.id}>
                <button onClick={() => setOpenId(s.id)} className="w-full text-left py-2 hover:bg-[var(--surface-hover)] rounded-lg px-2 -mx-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">{s.date} {s.startTime}–{s.endTime}</span>
                  <span className="text-xs font-bold text-[var(--text)]">{s.brandName}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">{s.hostName || "—"}</span>
                  <span className="text-[11px] font-bold text-violet-300">{formatCurrencyAdaptive(s.actualGmv ?? 0, "")}</span>
                  {s.excludedReason && <span className="text-[11px] text-[var(--text-faint)] italic">— {s.excludedReason}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openSession && (
        <SessionWindow
          session={openSession}
          brand={brandsById.get(openSession.brandId)}
          viewer={{ role: currentRole, myTalentId }}
          today={today}
          allSessions={sessions}
          studios={isBrandView ? undefined : studios}
          talents={isBrandView ? undefined : talents}
          onClose={() => setOpenId(null)}
          onSubmitSessionReport={onSubmitSessionReport}
          onSessionSnapshotApplied={onSessionSnapshotApplied}
          onUpdateSession={isBrandView ? undefined : onUpdateSession}
          onDeleteSession={onDeleteSession}
          onCancelSession={onCancelSession}
          onSetSessionExcluded={onSetSessionExcluded}
          onRequestDropout={onRequestDropout}
          onLogAudit={onLogAudit}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; sub?: string; accent?: boolean }> = ({ label, value, sub, accent }) => (
  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-2.5">
    <p className="text-[11px] uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
    <p className={`text-base font-black mt-0.5 ${accent ? "text-[var(--success)]" : "text-[var(--text)]"}`}>{value}</p>
    {sub && <p className="text-[11px] text-[var(--text-faint)]">{sub}</p>}
  </div>
);

const TrustBadge: React.FC<{ session: LiveSession }> = ({ session }) => {
  const label = brandTrustLabel(session);
  const done = label === "Đã chốt";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
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
          className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded border ${
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
