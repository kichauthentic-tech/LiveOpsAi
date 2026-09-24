import React, { useEffect, useMemo, useState } from "react";
import { SESSION_STATUS_CLS, SESSION_STATUS_LABEL_VI } from "../lib/sessionStatusUi";
import { AlertTriangle, Ban, CheckCircle2, Circle, EyeOff, Hand, Link2, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { AuditLogEntry, Brand, LiveSession, Studio, Talent, UserRole } from "../types";
import { dateTimeRangesOverlap } from "../lib/dateUtils";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { sessionHours } from "../lib/performance/hostPerformance";
import { SessionReportInput } from "../lib/db/sessionReports";
import {
  MissingStep,
  brandTrustLabel,
  hasReport,
  hasSnapshot,
  linkedSessions,
  missingSteps,
  sessionCounters,
  sessionIncidents,
  metricsHiddenFor,
  sessionRatios
} from "../lib/sessionLedger";
import { DataSourceBadge } from "./common/DataSourceBadge";
import { BrandLogo } from "./ui/BrandLogo";
import { SessionLiveSnapshotUpload } from "./SessionLiveSnapshotUpload";
import { SessionReportForm } from "./SessionReportForm";

// Cửa sổ Ca Live — MỘT cửa sổ chi tiết cho một ca, dùng chung cho mọi nơi click vào ca (Sổ Ca,
// Lịch Vận Hành, Đăng Ký & Chốt Lịch, Sessions bên brand). Thay cho 3 "chi tiết ca" khác nhau
// trước đây (tái cấu trúc 2026-09-21, xem WORKSPACE_DESIGN). Toàn màn hình trên điện thoại.
//
// Phân quyền theo vai (UI chỉ giấu — RPC/RLS vẫn tự guard):
//  - ops (ceo/admin/operations): thấy tất cả, sửa giờ/studio/người, up file, report (được hạ bậc
//    sửa tay), xoá ca.
//  - talent là host/trợ của ĐÚNG ca này: thấy thông tin + "Số liệu ca" 2 bước (up file → khai
//    phần máy không biết → nộp). Talent khác: chỉ đọc thông tin.
//  - brand: chỉ đọc, nhãn tin cậy 2 mức, ẩn sự cố nội bộ, không thấy target/studio/trợ.

export interface SessionWindowViewer {
  role: UserRole;
  myTalentId?: string;
}

export interface SessionWindowProps {
  session: LiveSession;
  brand?: Brand;
  viewer: SessionWindowViewer;
  today: string;
  allSessions: LiveSession[];
  // Chỉ cần khi ops được sửa ca (Lịch Vận Hành / Sổ Ca agency); thiếu thì ẩn nút Sửa.
  studios?: Studio[];
  talents?: Talent[];
  onClose: () => void;
  onSubmitSessionReport?: (sessionId: string, input: SessionReportInput) => Promise<boolean>;
  onSessionSnapshotApplied?: (session: LiveSession) => void;
  onUpdateSession?: (session: LiveSession) => Promise<boolean>;
  onDeleteSession?: (id: string) => Promise<void>;
  // 0097: huỷ ca (ops) — ca chưa có số liệu; slot đã chốt về 'cancelled', talent được báo.
  onCancelSession?: (id: string, reason: string, reopenSlot: boolean) => Promise<boolean>;
  // Đ10 (0114): ca ĐÃ có số thì không huỷ/xoá được (chủ ý — số là bằng chứng). Đường này giữ dòng
  // + số nhưng tách khỏi mọi tổng hợp, và đảo lại được.
  onSetSessionExcluded?: (id: string, excluded: boolean, reason: string) => Promise<boolean>;
  // Đ7 (0116): talent báo KHÔNG ĐI ĐƯỢC ca đã chốt. Chỉ gửi thông báo cho ops — cố ý không tự đổi
  // lịch, không tự nhả ca: việc thay người vẫn của ops (giữ nguyên quyết định U2 2026-09-21).
  onRequestDropout?: (sessionId: string, reason: string) => Promise<boolean>;
  // U2 (audit 2026-09-21): "Báo bận / thay người" gộp vào Sửa ca ở đây — đổi Host/Trợ thì ghi lý do,
  // lưu audit log như luồng cũ ở Đăng Ký & Chốt Lịch (trigger 0083 tự báo người mới/cũ).
  onLogAudit?: (entry: { action: string; details: string; category: AuditLogEntry["category"] }) => Promise<void>;
}

const OPS_ROLES: UserRole[] = ["ceo", "operations", "admin"];
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const STATUS_LABEL = SESSION_STATUS_LABEL_VI;
const STATUS_CLS = SESSION_STATUS_CLS;
const MISSING_LABEL: Record<MissingStep, string> = {
  snapshot: "Chưa up file số liệu",
  report: "Chưa có report",
  reconcile: "Chưa đối soát"
};

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${WEEKDAY[new Date(y, m - 1, day).getDay()]} ${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—");
const fmtHours = (h: number) => (h > 0 ? `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h` : "—");
const fmtInt = (n: number | undefined) => (n ?? 0).toLocaleString("vi-VN");
const fmtPct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;

const inputCls = "w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs";

export const SessionWindow: React.FC<SessionWindowProps> = ({
  session: s,
  brand,
  viewer,
  today,
  allSessions,
  studios,
  talents,
  onClose,
  onSubmitSessionReport,
  onSessionSnapshotApplied,
  onUpdateSession,
  onDeleteSession,
  onCancelSession,
  onSetSessionExcluded,
  onRequestDropout,
  onLogAudit
}) => {
  const isBrandView = viewer.role === "brand";
  const isOps = OPS_ROLES.includes(viewer.role);
  const isMine = !!viewer.myTalentId && (viewer.myTalentId === s.hostId || viewer.myTalentId === s.coHostId);
  // Up file / nộp report: ops, hoặc host/trợ của đúng ca (khớp guard can_edit_session_snapshot, 0082).
  // U6: ca nạp bù (tháng cũ) không có report — không hiện form.
  const canReport = !isBrandView && (isOps || isMine) && !s.isBackfill && !!onSubmitSessionReport;
  const canSnapshot = !isBrandView && (isOps || isMine) && !s.isBackfill && !!onSessionSnapshotApplied;
  const canEdit = isOps && !!onUpdateSession && !!studios && !!talents;
  // Brand + tháng chưa phát hành Report Tháng (0107): view đã che số về null/0, cửa sổ này phải
  // nói rõ lý do thay vì hiện "—" như ca chưa có số.
  const hideMetrics = metricsHiddenFor(s, viewer.role);

  const [editingReport, setEditingReport] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [excludeReason, setExcludeReason] = useState("");
  const [excluding, setExcluding] = useState(false);
  const [dropoutOpen, setDropoutOpen] = useState(false);
  const [dropoutReason, setDropoutReason] = useState("");
  const [dropoutSending, setDropoutSending] = useState(false);
  const [dropoutSent, setDropoutSent] = useState(false);
  const [edit, setEdit] = useState({ date: s.date, startTime: s.startTime, endTime: s.endTime, studioId: s.studioId, hostId: s.hostId, coHostId: s.coHostId ?? "" });
  const [changeReason, setChangeReason] = useState("");
  const peopleChanged = edit.hostId !== s.hostId || (edit.coHostId || "") !== (s.coHostId ?? "");
  useEffect(() => {
    setEditingReport(false);
    setEditing(false);
    setEdit({ date: s.date, startTime: s.startTime, endTime: s.endTime, studioId: s.studioId, hostId: s.hostId, coHostId: s.coHostId ?? "" });
    // Chỉ reset khi MỞ MỘT CA KHÁC. Nghe theo exhaustive-deps (thêm s.date/s.startTime/...) thì mỗi
    // lần refetch nền trả về ca có giá trị đổi sẽ xoá sạch phần ops đang sửa giữa dòng.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset theo danh tính ca, không theo nội dung
  }, [s.id]);
  // Đóng bằng Esc; khoá cuộn nền khi mở (điện thoại).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const counters = sessionCounters(s);
  const ratios = sessionRatios(s);
  const incidents = sessionIncidents(s).filter((i) => !isBrandView || !i.internal);
  const missing = isBrandView ? [] : missingSteps(s, today);
  const planHours = sessionHours({ ...s, liveDurationMinutes: undefined });
  const liveHours = s.liveDurationMinutes ? s.liveDurationMinutes / 60 : 0;
  const gmvPerHour = liveHours > 0 ? (s.actualGmv ?? 0) / liveHours : planHours > 0 ? (s.actualGmv ?? 0) / planHours : 0;
  const linked = useMemo(() => linkedSessions(allSessions).get(s.id) ?? [], [allSessions, s.id]);
  const linkedLabel = linked
    .map((id) => allSessions.find((x) => x.id === id))
    .filter((x): x is LiveSession => !!x)
    .map((x) => `${fmtDate(x.date)} ${x.startTime}–${x.endTime} (${x.hostName || "chưa gán"})`);

  // Trùng studio / host — xét cả ca qua đêm của ngày trước (Q6).
  const conflicts = useMemo(() => {
    const out = { studio: "", host: "" };
    if (!editing) return out;
    for (const x of allSessions) {
      if (x.id === s.id || x.status === "Cancelled") continue;
      if (!dateTimeRangesOverlap(x, edit)) continue;
      if (x.studioId === edit.studioId && !out.studio) out.studio = x.title || `${x.brandName} ${x.startTime}–${x.endTime}`;
      if (x.hostId === edit.hostId && !out.host) out.host = `${x.hostName} (${x.title || x.brandName})`;
    }
    return out;
  }, [editing, edit, allSessions, s.id]);

  const saveEdit = async () => {
    if (!onUpdateSession) return;
    if (edit.startTime === edit.endTime) { window.alert("Giờ bắt đầu và giờ kết thúc không được trùng nhau."); return; }
    const studioObj = studios?.find((x) => x.id === edit.studioId);
    const hostObj = talents?.find((t) => t.id === edit.hostId);
    const coObj = talents?.find((t) => t.id === edit.coHostId);
    const updated: LiveSession = {
      ...s,
      date: edit.date,
      startTime: edit.startTime,
      endTime: edit.endTime,
      studioId: edit.studioId,
      studioName: studioObj?.name || s.studioName,
      hostId: edit.hostId,
      hostName: hostObj?.name || s.hostName,
      coHostId: edit.coHostId || undefined,
      coHostName: coObj?.name || ""
    };
    setSaving(true);
    const ok = await onUpdateSession(updated);
    if (ok && peopleChanged && onLogAudit) {
      const parts: string[] = [];
      if (edit.hostId !== s.hostId) parts.push(`Host: ${s.hostName || "—"} → ${hostObj?.name ?? "—"}`);
      if ((edit.coHostId || "") !== (s.coHostId ?? "")) parts.push(`Trợ live: ${s.coHostName || "—"} → ${coObj?.name ?? "—"}`);
      await onLogAudit({
        action: "Thay người trên ca",
        details: `Ca ${s.date} ${s.startTime}-${s.endTime} (${s.brandName}): ${parts.join("; ")}. Lý do: ${changeReason.trim() || "Không ghi lý do"}.`,
        category: "Security Alert"
      });
    }
    setSaving(false);
    if (ok) { setEditing(false); setChangeReason(""); }
  };

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

  const hasData = s.dataSource !== "manual" || (s.actualGmv ?? 0) > 0 || (s.totalOrders ?? 0) > 0;
  const canCancel = isOps && !!onCancelSession && s.status !== "Cancelled" && !hasData;
  const doCancel = async (reopenSlot: boolean) => {
    if (!onCancelSession) return;
    setCancelling(true);
    const ok = await onCancelSession(s.id, cancelReason.trim(), reopenSlot);
    setCancelling(false);
    if (ok) { setCancelOpen(false); setCancelReason(""); }
  };
  // Loại khỏi báo cáo (Đ10/0114). Chỉ chào khi ca THẬT SỰ không huỷ/xoá được — còn huỷ được thì
  // huỷ đúng hơn (ca không diễn ra), tách sổ chỉ dành cho ca đã diễn ra mà số của nó là rác.
  const canExclude = isOps && !!onSetSessionExcluded && (hasData || !!s.excludedFromReports);
  const doExclude = async (excluded: boolean) => {
    if (!onSetSessionExcluded) return;
    setExcluding(true);
    const ok = await onSetSessionExcluded(s.id, excluded, excludeReason.trim());
    setExcluding(false);
    if (ok) { setExcludeOpen(false); setExcludeReason(""); }
  };

  // Đ7: chỉ người ĐANG giữ ca, ca chưa diễn ra, ca chưa huỷ. (DB guard lại đúng ba điều này —
  // đây chỉ là để không chào một cái nút chắc chắn lỗi.)
  const canDropout = isMine && !isOps && !!onRequestDropout && s.status !== "Cancelled" && s.date >= today;
  const doDropout = async () => {
    if (!onRequestDropout) return;
    setDropoutSending(true);
    const ok = await onRequestDropout(s.id, dropoutReason.trim());
    setDropoutSending(false);
    if (ok) { setDropoutOpen(false); setDropoutReason(""); setDropoutSent(true); }
  };

  const snapshotDone = hasSnapshot(s);
  const reportDone = hasReport(s);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[600px] bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl overflow-y-auto" role="dialog" aria-label="Cửa sổ ca live">
        {/* Đầu: brand · ngày · giờ · người · trạng thái */}
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
              {/* Nhãn tin cậy nói "số này chốt tới đâu" — vô nghĩa khi chưa được thấy số nào. */}
              {isBrandView ? (
                hideMetrics ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]">
                    chưa phát hành
                  </span>
                ) : (
                  <TrustBadge session={s} />
                )
              ) : (
                <DataSourceBadge dataSource={s.dataSource} />
              )}
              {!isBrandView && s.isBackfill && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]">nạp bù từ file</span>
              )}
              {/* RPC snapshot (0078) cũng ghi reconciled_at — chỉ gọi là "đối soát" khi nguồn số thật sự là tiktok_reconciled. */}
              {s.reconciledAt && s.dataSource === "tiktok_reconciled" && <span className="text-[10px] text-[var(--text-faint)]">đối soát {new Date(s.reconciledAt).toLocaleDateString("vi-VN")}</span>}
              {isMine && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-sky-950 text-sky-300 border-sky-800">ca của tôi</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && !editing && (
              <button onClick={() => setEditing(true)} className="text-[11px] font-bold text-[var(--accent-text)] px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/40 flex items-center gap-1"><Pencil className="w-3 h-3" /> Sửa ca · thay người</button>
            )}
            <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)] p-1" aria-label="Đóng"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {s.status === "Cancelled" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-3 text-xs text-[var(--text-muted)]">
              Ca đã huỷ{s.cancelledAt ? ` lúc ${new Date(s.cancelledAt).toLocaleString("vi-VN")}` : ""}{s.cancelReason ? ` — lý do: ${s.cancelReason}` : ""}.
            </div>
          )}
          {s.excludedFromReports && (
            <div className="rounded-xl border border-violet-800 bg-violet-950/40 p-3 text-xs text-violet-200 flex items-start gap-2">
              <EyeOff className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <b>Ca đã loại khỏi báo cáo.</b> Số của ca giữ nguyên ở đây làm lịch sử, nhưng không được tính vào bất kỳ tổng
                hợp nào (Report Tháng, Hiệu Suất Host, cam kết giờ, P&amp;L) và brand không thấy ca này.
                {s.excludedReason ? ` Lý do: ${s.excludedReason}.` : ""}
                {s.excludedAt ? ` Loại lúc ${new Date(s.excludedAt).toLocaleString("vi-VN")}.` : ""}
              </span>
            </div>
          )}
          {missing.length > 0 && s.status !== "Cancelled" && !s.excludedFromReports && (
            <div className="rounded-xl border border-amber-800 bg-amber-950/50 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Còn thiếu để chốt: {missing.map((m) => MISSING_LABEL[m]).join(" · ")}</span>
            </div>
          )}

          {/* Sửa ca (ops) */}
          {editing && canEdit && (
            <section className="space-y-3 text-xs bg-[var(--surface-base)] p-3 rounded-xl border border-[var(--border)]">
              {(conflicts.studio || conflicts.host) && (
                <div className="p-2.5 bg-rose-950/80 border border-rose-700/80 rounded-xl text-[11px] space-y-1 text-rose-200 font-medium">
                  {conflicts.studio && <p>• Trùng Studio: "{conflicts.studio}"</p>}
                  {conflicts.host && <p>• Trùng Host: "{conflicts.host}"</p>}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <label className="block"><span className="font-bold text-[var(--text-muted)] block mb-1">Ngày</span><input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} className={`${inputCls} font-mono`} /></label>
                <label className="block"><span className="font-bold text-[var(--text-muted)] block mb-1">Bắt đầu</span><input type="time" value={edit.startTime} onChange={(e) => setEdit({ ...edit, startTime: e.target.value })} className={`${inputCls} font-mono`} /></label>
                <label className="block"><span className="font-bold text-[var(--text-muted)] block mb-1">Kết thúc</span><input type="time" value={edit.endTime} onChange={(e) => setEdit({ ...edit, endTime: e.target.value })} className={`${inputCls} font-mono`} /></label>
              </div>
              <label className="block"><span className="font-bold text-[var(--text-muted)] block mb-1">Phòng Studio</span>
                <select value={edit.studioId} onChange={(e) => setEdit({ ...edit, studioId: e.target.value })} className={inputCls}>
                  {studios!.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="font-bold text-[var(--text-muted)] block mb-1">Host</span>
                  <select value={edit.hostId} onChange={(e) => setEdit({ ...edit, hostId: e.target.value })} className={inputCls}>
                    <option value="">-- Chưa gán --</option>
                    {talents!.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="block"><span className="font-bold text-[var(--text-muted)] block mb-1">Trợ live</span>
                  <select value={edit.coHostId} onChange={(e) => setEdit({ ...edit, coHostId: e.target.value })} className={inputCls}>
                    <option value="">-- Không có --</option>
                    {talents!.filter((t) => t.id !== edit.hostId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              </div>
              {peopleChanged && (
                <label className="block"><span className="font-bold text-amber-300 block mb-1">Lý do đổi người <span className="font-normal text-[var(--text-faint)]">(báo bận, đổi ca…) — ghi vào nhật ký, người mới/cũ được báo</span></span>
                  <input type="text" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Vd: Host báo bận đột xuất" className={inputCls} />
                </label>
              )}
              <p className="text-[10px] text-[var(--text-faint)]">Target GMV của ca lấy từ Kế Hoạch Tháng đã chốt — không sửa ở đây.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-[11px]">Huỷ</button>
                <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px]">{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
              </div>
            </section>
          )}

          {/* Kế hoạch vs thực tế */}
          <section>
            <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold mb-2">Kế hoạch vs thực tế</h4>
            <div className="grid grid-cols-2 gap-2">
              <KV label="Giờ kế hoạch" value={`${s.startTime}–${s.endTime} (${fmtHours(planHours)})`} />
              {hideMetrics ? (
                <>
                  <KV label="Giờ live thật" value="chưa phát hành" muted />
                  <KV label="GMV thực tế" value="chưa phát hành" muted />
                  <KV label="GMV / giờ" value="chưa phát hành" muted />
                </>
              ) : (
                <>
                  <KV label="Giờ live thật" value={s.actualStartAt ? `${fmtTime(s.actualStartAt)}–${fmtTime(s.actualEndAt)} (${fmtHours(liveHours)})` : "chưa có file"} muted={!s.actualStartAt} />
                  {!isBrandView && <KV label="Target GMV" value={s.targetGmv ? formatCurrencyAdaptive(s.targetGmv) : "chưa có target"} muted={!s.targetGmv} />}
                  <KV label="GMV thực tế" value={s.actualGmv ? formatCurrencyAdaptive(s.actualGmv) : "—"} accent={!!s.actualGmv} />
                  {!isBrandView && s.targetGmv > 0 && <KV label="Đạt target" value={fmtPct(((s.actualGmv ?? 0) / s.targetGmv) * 100)} />}
                  <KV label="GMV / giờ" value={gmvPerHour > 0 ? formatCurrencyAdaptive(gmvPerHour) : "—"} />
                </>
              )}
            </div>
            {hideMetrics && (
              <p className="mt-2 text-[11px] text-[var(--text-faint)] italic">
                Số liệu tháng {s.date.slice(0, 7)} sẽ hiện tại đây sau khi Report Tháng được phát hành.
              </p>
            )}
          </section>

          {/* Số liệu ca — 2 bước cho người trực ca: up file → khai thêm → nộp */}
          {(canSnapshot || canReport) && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)]/60 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold">Nộp số liệu ca</h4>
                <div className="flex items-center gap-1">
                  <StepPill n={1} label="File số liệu" done={snapshotDone} />
                  <StepPill n={2} label="Report" done={reportDone} />
                </div>
              </div>
              {canSnapshot && (
                <div>
                  <p className="text-xs font-bold text-[var(--text)] mb-1.5">Bước 1 · Up file Creator-Live-Performance {snapshotDone && <span className="text-emerald-400 font-normal">— đã có</span>}</p>
                  <SessionLiveSnapshotUpload session={s} onApplied={onSessionSnapshotApplied!} />
                </div>
              )}
              {canReport && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-xs font-bold text-[var(--text)]">Bước 2 · Khai phần máy không biết {reportDone && <span className="text-emerald-400 font-normal">— đã nộp</span>}</p>
                    {!editingReport && (
                      <button onClick={() => setEditingReport(true)} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors">
                        {reportDone ? "Sửa report" : "Nhập report"}
                      </button>
                    )}
                  </div>
                  {!editingReport && !reportDone && (
                    <p className="text-[11px] text-[var(--text-faint)]">OT / off sớm / restart / ADS / xu đã tung / link dashboard{snapshotDone ? "" : " — chưa có file thì 5 ô số phải gõ tay, ops sẽ đối soát lại"}.</p>
                  )}
                  {editingReport && (
                    <SessionReportForm
                      session={s}
                      onSubmit={async (input) => {
                        const ok = await onSubmitSessionReport!(s.id, input);
                        if (ok) setEditingReport(false);
                        return ok;
                      }}
                      onCancel={() => setEditingReport(false)}
                      canOverrideMetrics={isOps}
                    />
                  )}
                </div>
              )}
            </section>
          )}

          {/* Report đã nộp (mọi vai đọc được) */}
          {!editingReport && (s.report || incidents.length > 0) && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold mb-2">Report ca</h4>
              {s.report ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {incidents.length === 0 && <span className="text-xs text-emerald-300">Không có sự cố</span>}
                    {incidents.map((i) => (
                      <span key={i.key} className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-rose-950/60 text-rose-300 border-rose-800">{i.label}</span>
                    ))}
                  </div>
                  {s.report.statusNote && <p className="text-xs text-[var(--text)] whitespace-pre-wrap">{s.report.statusNote}</p>}
                  {(s.report.dashboardLink1 || s.report.dashboardLink2) && (
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      {s.report.dashboardLink1 && <a href={s.report.dashboardLink1} target="_blank" rel="noreferrer" className="text-[var(--accent-text)] underline">Dashboard 1</a>}
                      {s.report.dashboardLink2 && <a href={s.report.dashboardLink2} target="_blank" rel="noreferrer" className="text-[var(--accent-text)] underline">Dashboard 2</a>}
                    </div>
                  )}
                  {s.report.submittedAt && (
                    <p className="text-[10px] text-[var(--text-faint)]">Nhập lúc {new Date(s.report.submittedAt).toLocaleString("vi-VN")}{s.report.submittedByRole ? ` · ${s.report.submittedByRole}` : ""}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-faint)] italic">Chưa có report.</p>
              )}
            </section>
          )}

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
                <p className="text-[10px] text-[var(--text-faint)] mt-2">Tỷ lệ tính lại từ số đã tách theo ca, không lấy cột tỷ lệ cộng dồn của file.</p>
              </>
            ) : s.actualGmv || s.totalOrders || s.totalViews ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <KV label="Đơn" value={fmtInt(s.totalOrders)} />
                  <KV label="Lượt xem" value={fmtInt(s.totalViews)} />
                  <KV label="Peak viewers" value={fmtInt(s.peakViewers)} />
                </div>
                <p className="text-[10px] text-amber-300 mt-2">Số tự khai tay — chưa có file nên không tính được tỷ lệ.</p>
              </>
            ) : (
              <p className="text-xs text-[var(--text-faint)] italic">Chưa có số liệu.</p>
            )}
          </section>

          {/* Lịch sử — mốc có trong dữ liệu ca (U6). Audit log chi tiết xem ở Nhật ký hệ thống. */}
          {!isBrandView && (() => {
            const fmtAt = (iso: string) => new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
            const events: { at: string; label: string }[] = [];
            if (s.report?.submittedAt) events.push({ at: s.report.submittedAt, label: `Report nộp${s.report.submittedByRole ? ` (${s.report.submittedByRole})` : ""}` });
            if (s.actualStartAt && (s.liveRoomIds?.length ?? 0) > 0) events.push({ at: s.actualStartAt, label: `File số liệu · live thật ${fmtTime(s.actualStartAt)}–${fmtTime(s.actualEndAt)}` });
            // `reconciled_at` là "lần cuối ghi số vào ca", KHÔNG phải "đã đối soát": RPC snapshot
            // (0078/0079 `recompute_session_from_snapshot`) cũng set cột này. Không guard theo
            // dataSource thì ca vừa up file đã hiện "Đối soát TikTok ghi đè số liệu" ngay dưới dòng
            // "Còn thiếu để chốt: Chưa đối soát" — cùng một cửa sổ nói hai điều ngược nhau. Đây là
            // đúng guard đã dùng ở badge nguồn số phía trên.
            if (s.reconciledAt && s.dataSource === "tiktok_reconciled") {
              events.push({ at: s.reconciledAt, label: "Đối soát TikTok ghi đè số liệu" });
            }
            if (s.cancelledAt) events.push({ at: s.cancelledAt, label: `Huỷ ca${s.cancelReason ? ` — ${s.cancelReason}` : ""}` });
            if (events.length === 0) return null;
            events.sort((a, b) => a.at.localeCompare(b.at));
            return (
              <section>
                <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold mb-2">Lịch sử</h4>
                <ul className="space-y-1">
                  {events.map((e, i) => (
                    <li key={i} className="text-xs flex items-start gap-2">
                      <span className="font-mono text-[var(--text-faint)] shrink-0">{fmtAt(e.at)}</span>
                      <span className="text-[var(--text-muted)]">{e.label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}

          {/* Phiên TikTok / ca nối */}
          {!isBrandView && ((s.liveRoomIds?.length ?? 0) > 0 || linkedLabel.length > 0) && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold mb-2">Phiên TikTok</h4>
              {(s.liveRoomIds?.length ?? 0) > 0 && <p className="text-xs text-[var(--text-muted)] font-mono break-all">Room: {s.liveRoomIds!.join(", ")}</p>}
              {linkedLabel.length > 0 && (
                <p className="text-xs text-sky-300 mt-1 flex items-start gap-1"><Link2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>Ca nối, chung room với: {linkedLabel.join("; ")}</span></p>
              )}
            </section>
          )}

          {canDropout && (
            <div className="pt-3 border-t border-[var(--border)]">
              {dropoutSent ? (
                <p className="text-[11px] text-emerald-300 flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
                  Đã báo cho vận hành. <b>Lịch chưa đổi</b> — chờ ops xác nhận người thay, và nhớ theo dõi chuông.
                </p>
              ) : !dropoutOpen ? (
                <button onClick={() => setDropoutOpen(true)} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 hover:text-amber-200 transition-colors">
                  <Hand className="w-3.5 h-3.5" /> Tôi không đi được ca này
                </button>
              ) : (
                <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-3 space-y-2">
                  <p className="text-xs text-amber-200">
                    Gửi cho vận hành: bạn không đi được ca {fmtDate(s.date)} {s.startTime}–{s.endTime}. <b>Lịch KHÔNG tự đổi</b> —
                    ops sẽ tìm người thay hoặc huỷ ca, và bạn nhận thông báo khi có kết quả. Báo càng sớm càng dễ thay.
                  </p>
                  <input value={dropoutReason} onChange={(e) => setDropoutReason(e.target.value)} placeholder="Lý do (vd: bị bệnh, trùng lịch học, việc gia đình)" className={inputCls} />
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={() => { setDropoutOpen(false); setDropoutReason(""); }} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-[11px]">Thôi</button>
                    <button onClick={doDropout} disabled={dropoutSending} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold text-[11px]">
                      {dropoutSending ? "Đang gửi..." : "Gửi cho vận hành"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isOps && (canCancel || canExclude || (onDeleteSession && !hasData)) && (
            <div className="pt-3 border-t border-[var(--border)] space-y-2">
              {canCancel && !cancelOpen && (
                <button onClick={() => setCancelOpen(true)} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 hover:text-amber-200 transition-colors">
                  <Ban className="w-3.5 h-3.5" /> Huỷ ca này
                </button>
              )}
              {canCancel && cancelOpen && (
                <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-3 space-y-2">
                  <p className="text-xs text-amber-200">Huỷ ca {fmtDate(s.date)} {s.startTime}–{s.endTime}: ca về "Đã huỷ", host/trợ được báo nếu ca chưa diễn ra. Chọn tiếp ca chờ đăng ký đi đâu:</p>
                  <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Lý do (vd: brand đổi lịch, host bận không thay được)" className={inputCls} />
                  {/* Đ2 (0113): trước đây chỉ có một đường và nó luôn đóng luôn ca chờ đăng ký, mà
                      slot 'cancelled' thì KHÔNG có cách nào mở lại — ops mất cả đăng ký rảnh cũ lẫn
                      liên kết với ca kế hoạch. Đặt lựa chọn ngay ở đây vì đây đúng là lúc ops biết
                      mình đang bỏ hẳn ca hay chỉ cần đổi người. */}
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={() => setCancelOpen(false)} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-[11px]">Không</button>
                    <button onClick={() => doCancel(false)} disabled={cancelling} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white font-bold text-[11px]" title="Ca chờ đăng ký cũng đóng luôn — không live khung này nữa">
                      {cancelling ? "Đang huỷ..." : "Huỷ hẳn ca"}
                    </button>
                    <button onClick={() => doCancel(true)} disabled={cancelling} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-[11px]" title="Ca chờ đăng ký về 'mở' — giữ nguyên đăng ký rảnh cũ và liên kết với Kế Hoạch Tháng">
                      {cancelling ? "Đang huỷ..." : "Huỷ ca, mở lại tìm người khác"}
                    </button>
                  </div>
                </div>
              )}
              {/* Đ10 (0114): ca đã có số KHÔNG huỷ/xoá được — chủ ý, số đã ghi là bằng chứng. Nhưng
                  trước 0114 hệ quả là ca nhập nhầm brand / ca test kẹt vĩnh viễn trong mọi tổng hợp,
                  gỡ được bằng đúng một cách: SQL tay. Đây là đường thứ ba: giữ dòng, bỏ khỏi sổ. */}
              {canExclude && !s.excludedFromReports && !excludeOpen && (
                <button onClick={() => setExcludeOpen(true)} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-300 hover:text-violet-200 transition-colors">
                  <EyeOff className="w-3.5 h-3.5" /> Loại ca này khỏi báo cáo
                </button>
              )}
              {canExclude && !s.excludedFromReports && excludeOpen && (
                <div className="rounded-xl border border-violet-800 bg-violet-950/40 p-3 space-y-2">
                  <p className="text-xs text-violet-200">
                    Ca {fmtDate(s.date)} {s.startTime}–{s.endTime} sẽ <b>không được tính vào bất kỳ con số nào</b> nữa, và brand
                    không còn thấy ca. Dòng + số liệu vẫn ở lại đây làm lịch sử, bỏ cờ lúc nào cũng được.
                  </p>
                  <input value={excludeReason} onChange={(e) => setExcludeReason(e.target.value)} placeholder="Lý do (bắt buộc — vd: nhập nhầm brand, ca test, trùng room với ca 12/09)" className={inputCls} />
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={() => { setExcludeOpen(false); setExcludeReason(""); }} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-[11px]">Không</button>
                    <button onClick={() => doExclude(true)} disabled={excluding || excludeReason.trim() === ""} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-[11px]">
                      {excluding ? "Đang loại..." : "Loại khỏi báo cáo"}
                    </button>
                  </div>
                </div>
              )}
              {canExclude && s.excludedFromReports && (
                <button onClick={() => doExclude(false)} disabled={excluding} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 hover:text-emerald-200 disabled:opacity-50 transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> {excluding ? "Đang đưa lại..." : "Đưa ca trở lại báo cáo"}
                </button>
              )}
              {onDeleteSession && !hasData && (
                <div>
                  <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-faint)] hover:text-rose-400 disabled:opacity-40 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Đang xoá..." : "Xoá hẳn ca này"}
                  </button>
                  <span className="text-[10px] text-[var(--text-faint)] ml-2">— ca mở đang gắn sẽ về "mở" để chốt người khác; ca đã có số liệu không xoá được.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

const StepPill: React.FC<{ n: number; label: string; done: boolean }> = ({ n, label, done }) => (
  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${done ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-[var(--surface-base)] text-[var(--text-faint)] border-[var(--border)]"}`}>
    {done ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />} {n} · {label}
  </span>
);

const TrustBadge: React.FC<{ session: LiveSession }> = ({ session }) => {
  const label = brandTrustLabel(session);
  const done = label === "Đã chốt";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${done ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"}`} title={done ? "Số đã đối soát với báo cáo TikTok cuối kỳ" : "Số ghi nhận lúc giao ca / tự khai, TikTok còn cập nhật"}>
      {done ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />} {label}
    </span>
  );
};

const KV: React.FC<{ label: string; value: string; muted?: boolean; accent?: boolean }> = ({ label, value, muted, accent }) => (
  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2.5 py-2">
    <p className="text-[10px] text-[var(--text-faint)]">{label}</p>
    <p className={`text-xs font-bold ${accent ? "text-[var(--success)]" : muted ? "text-[var(--text-faint)] font-normal italic" : "text-[var(--text)]"}`}>{value}</p>
  </div>
);

