import React, { useEffect, useMemo, useState } from "react";
import { SESSION_STATUS_CLS, SESSION_STATUS_LABEL_VI } from "../lib/sessionStatusUi";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileClock, Radio, UserX, X } from "lucide-react";
import { Brand, LiveSession, ShiftRegistration, ShiftSlot, Studio, Talent, UserRole, AuditLogEntry } from "../types";
import { getTodayDate } from "../lib/dateUtils";
import { fmtVndShort } from "../lib/format";
import { MissingStep, missingSteps } from "../lib/sessionLedger";
import { BrandLogo } from "./ui/BrandLogo";
import { PlatformChip } from "./common/PlatformChip";
import { sumGmvByPlatform } from "../lib/platforms/perf";
import { REPORT_PLATFORMS } from "../lib/reportPlatform";
import { clashedSessionIds, findPersonClashes } from "../lib/scheduling/conflicts";
import { SessionWindow } from "./SessionWindow";
import { PageHeader } from "./common/PageHeader";
import { StatTile } from "./common/StatTile";
import { SlotDetailModal } from "./scheduling/SlotDetailModal";
import { DraftsPanel } from "./control-room/DraftsPanel";
import type { SessionDraft } from "../lib/db/sessionDrafts";
import type { DraftEdit } from "../hooks/useSessionDrafts";

const WARN = "text-amber-300";
const OK = "text-emerald-300";

// Bảng Vận Hành — màn của NHỊP HẰNG NGÀY (tái cấu trúc 2026-09-21): hôm nay / ngày / tuần này có
// ca nào, ai trực, phòng nào, và mỗi ca còn thiếu gì (chưa có người · chưa up file · chưa report ·
// chưa đối soát). Click ca → Cửa sổ Ca Live. Không đặt ca ở đây — đặt ca là việc lập kế hoạch
// (Kế Hoạch Tháng / Đăng Ký & Chốt Lịch).
//  Mọi brand, mặc định hôm nay, chuyển ngày/tuần. Màn "Ca của tôi" của talent (mode "mine" cũ) đã thay bằng app talent
//  (components/talent/TalentToday, 11/10).
//  24/10: gộp Phòng Điều Hành — hai chế độ xem trên cùng một màn: "Hôm nay & tuần" (danh sách ca) và "Cả tháng" (`monthView`:
//  sa bàn thêm ca, ca xoay chuyển, tải người). Ca nháp của sa bàn là dòng trong danh sách ca + bộ lọc "Ca nháp" + một việc cần làm.

export interface OpsBoardProps {
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  brands: Brand[];
  studios: Studio[];
  talents: Talent[];
  currentRole: UserRole;
  myTalentId?: string;
  onSessionsUpdated: (sessions: LiveSession[]) => void;
  onUpdateSession?: (session: LiveSession) => Promise<boolean>;
  onDeleteSession?: (id: string) => Promise<void>;
  onCancelSession?: (id: string, reason: string, reopenSlot: boolean) => Promise<boolean>;
  onSetSessionExcluded?: (id: string, excluded: boolean, reason: string) => Promise<boolean>;
  onRequestDropout?: (sessionId: string, reason: string) => Promise<boolean>; // Đ7 (0116) — talent báo bận, chỉ gửi thông báo cho ops
  onLogAudit?: (entry: { action: string; details: string; category: AuditLogEntry["category"] }) => Promise<void>;
  // Ops chốt Host + Trợ live ngay trên dòng ca chưa có người (SlotDetailModal) — màn "Nhân sự ca" đã bỏ 08/10.
  onFinalizeSlot?: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  onDeleteSlot?: (id: string) => Promise<void>;
  fatigueWeekHours?: number;
  // Q4: bấm thông báo → App đặt id ca cần mở; bảng mở Cửa sổ Ca Live rồi báo lại để App xoá yêu cầu.
  requestOpenSessionId?: string | null;
  onOpenRequestHandled?: () => void;
  // Cột phải (Việc cần làm): màn rộng đứng cạnh danh sách ca và dính khi cuộn; màn hẹp nằm ngay dưới tiêu đề.
  aside?: React.ReactNode;
  /** Chế độ xem (App giữ — việc cần làm / nút "Mô phỏng thêm ca" ở Dashboard đổi được). Vắng = chỉ "Hôm nay & tuần". */
  view?: OpsView;
  onViewChange?: (v: OpsView) => void;
  /** Nội dung chế độ "Cả tháng" (OpsMonthView). */
  monthView?: React.ReactNode;
  /** Ca nháp sa bàn đang chờ (0170). */
  drafts?: SessionDraft[];
  onAcceptDraft?: (d: SessionDraft, e: DraftEdit) => Promise<void>;
  onDismissDrafts?: (ids: string[]) => Promise<void>;
  /** App yêu cầu mở sẵn một bộ lọc (việc "N ca nháp chờ xác nhận") — bảng đặt bộ lọc rồi báo lại để App xoá yêu cầu. */
  requestRange?: "drafts" | null;
  onRangeRequestHandled?: () => void;
}

export type OpsView = "day" | "month";

type Range = "today" | "tomorrow" | "week" | "day" | "drafts";

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MISSING_LABEL: Record<MissingStep, string> = { snapshot: "chưa up file", report: "chưa giao ca", reconcile: "chưa đối soát" };
const STATUS_LABEL = SESSION_STATUS_LABEL_VI;
const STATUS_CLS = SESSION_STATUS_CLS;

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}
function fmtDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${WEEKDAY[new Date(y, m - 1, day).getDay()]} ${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

// Một dòng của bảng: ca thật (session), ca mở chưa chốt người (slot), hoặc ca nháp của sa bàn chờ xác nhận (draft).
type Row =
  | { kind: "session"; date: string; startTime: string; endTime: string; session: LiveSession }
  | { kind: "slot"; date: string; startTime: string; endTime: string; slot: ShiftSlot; registered: number }
  | { kind: "draft"; date: string; startTime: string; endTime: string; draft: SessionDraft };

export const OpsBoard: React.FC<OpsBoardProps> = ({
  sessions,
  shiftSlots,
  shiftRegistrations,
  brands,
  studios,
  talents,
  currentRole,
  myTalentId,
  onSessionsUpdated,
  onUpdateSession,
  onDeleteSession,
  onCancelSession,
  onSetSessionExcluded,
  onRequestDropout,
  onLogAudit,
  onFinalizeSlot,
  onDeleteSlot,
  fatigueWeekHours,
  requestOpenSessionId = null,
  onOpenRequestHandled,
  aside,
  view = "day",
  onViewChange,
  monthView,
  drafts = [],
  onAcceptDraft,
  onDismissDrafts,
  requestRange = null,
  onRangeRequestHandled
}) => {
  const today = getTodayDate();
  const [rangeState, setRange] = useState<Range>("today");
  // Hết nháp khi đang ở bộ lọc Ca nháp ⇒ về hôm nay (nút lọc biến mất cùng lúc).
  const range: Range = rangeState === "drafts" && drafts.length === 0 ? "today" : rangeState;
  const [anchor, setAnchor] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);
  useEffect(() => {
    if (!requestOpenSessionId) return;
    setOpenId(requestOpenSessionId);
    onOpenRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestOpenSessionId]);
  useEffect(() => {
    if (!requestRange) return;
    setRange(requestRange);
    onRangeRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestRange]);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const draftName = (d: SessionDraft) => `${brandById.get(d.brandId)?.name ?? "Brand"} · ${d.platform}`;
  const talentName = (id: string | null) => (id ? talents.find((t) => t.id === id)?.name ?? "?" : "");
  const regsBySlot = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of shiftRegistrations) m.set(r.slotId, (m.get(r.slotId) ?? 0) + 1);
    return m;
  }, [shiftRegistrations]);

  const [from, to] = useMemo<[string, string]>(() => {
    if (range === "today") return [today, today];
    if (range === "tomorrow") return [addDays(today, 1), addDays(today, 1)];
    if (range === "week") { const mon = mondayOf(anchor); return [mon, addDays(mon, 6)]; }
    if (range === "drafts") return [today, "9999-12-31"];
    return [anchor, anchor];
  }, [range, anchor, today]);

  // Ops: mọi ca (session + slot mở chưa chốt) trong khoảng đang xem.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const d of drafts) {
      if (d.date < from || d.date > to) continue;
      out.push({ kind: "draft", date: d.date, startTime: d.startTime, endTime: d.endTime, draft: d });
    }
    if (range === "drafts") return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    for (const s of sessions) {
      if (s.date < from || s.date > to || s.isBackfill) continue;
      out.push({ kind: "session", date: s.date, startTime: s.startTime, endTime: s.endTime, session: s });
    }
    for (const sl of shiftSlots) {
      if (sl.date < from || sl.date > to || sl.status !== "open") continue;
      out.push({ kind: "slot", date: sl.date, startTime: sl.startTime, endTime: sl.endTime, slot: sl, registered: regsBySlot.get(sl.id) ?? 0 });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [sessions, shiftSlots, drafts, range, from, to, regsBySlot]);

  const summary = useMemo(() => {
    const ss = rows.filter((r): r is Extract<Row, { kind: "session" }> => r.kind === "session").map((r) => r.session);
    return {
      total: rows.filter((r) => r.kind !== "draft").length,
      noHost: rows.filter((r) => r.kind === "slot" || (r.kind === "session" && !r.session.hostId)).length,
      pending: ss.filter((s) => missingSteps(s, today).some((m) => m !== "reconcile")).length,
      // GMV tách theo sàn — user chốt 07/10: không bao giờ cộng GMV TikTok với Shopee.
      gmv: sumGmvByPlatform(ss)
    };
  }, [rows, today]);

  // Trùng người từ hôm nay trở đi (user chốt 06/10: một người chỉ đứng một ca tại một thời điểm). Quét cả lịch, không
  // chỉ khoảng đang xem — chỗ trùng ngày 25 vẫn phải thấy khi đang xem hôm nay.
  const clashes = useMemo(() => findPersonClashes(sessions, { from: today }), [sessions, today]);
  const clashBySession = useMemo(() => clashedSessionIds(clashes), [clashes]);

  const openSession = openId ? sessions.find((s) => s.id === openId) ?? null : null;

  // Bố cục 18/10: dòng ca là một hàng trong danh sách kẻ vạch (trước: mỗi ca một hộp viền nằm trong hộp lớn, 13 hộp/ngày), cột
  // cố định giờ · brand · người · việc thiếu · trạng thái để mắt dò theo cột. Việc thiếu gộp MỘT cụm chữ vàng thay vì 2–3 nhãn
  // viền ("chưa up file", "chưa giao ca"), trạng thái luôn ở mép phải.
  // md trở lên: lưới cột cố định (giờ · brand · người · việc thiếu · trạng thái) — cụm việc thiếu dài tự xuống dòng TRONG ô của nó
  // thay vì đẩy nhãn trạng thái rớt xuống đầu hàng sau. Màn hẹp: flex-wrap như cũ.
  const ROW_CLS =
    "w-full text-left rounded-lg px-2 sm:px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 transition-colors md:grid md:grid-cols-[104px_168px_minmax(0,1fr)_minmax(0,auto)_76px]";
  const SessionRow = ({ s }: { s: LiveSession }) => {
    const missing = missingSteps(s, today);
    const actionable = missing.filter((m) => m !== "reconcile");
    const noRoom = !s.studioId && s.status !== "Cancelled" && s.date >= today;
    return (
      <button onClick={() => setOpenId(s.id)} className={`${ROW_CLS} hover:bg-[var(--surface-elevated)]/70`}>
        <span className="font-mono text-sm font-black text-[var(--text)] w-[104px] shrink-0">{s.startTime}–{s.endTime}</span>
        <span className="flex items-center gap-1.5 min-w-0 sm:w-[168px] shrink-0">
          <BrandLogo brand={brandById.get(s.brandId) ?? { name: s.brandName, logo: "" }} size="xs" />
          <span className="text-sm font-bold text-[var(--text)] truncate">{s.brandName}</span>
          <PlatformChip platform={s.platform} />
        </span>
        <span className="order-4 md:order-none flex-1 basis-40 min-w-0 text-xs text-[var(--text-muted)] truncate md:basis-auto" title={[s.hostName ? `Host ${s.hostName}` : "chưa gán host", s.coHostName ? `Trợ ${s.coHostName}` : "", s.studioName ?? ""].filter(Boolean).join(" · ")}>
          {s.hostName ? <span className="text-[var(--text)]">{s.hostName}</span> : <span className="text-rose-300 font-bold">chưa gán host</span>}
          {s.coHostName ? <span className="text-[var(--text-faint)]"> · Trợ {s.coHostName}</span> : ""}
          {s.studioName ? <span className="text-[var(--text-faint)]"> · {s.studioName}</span> : ""}
        </span>
        <span className="order-5 md:order-none ml-auto md:ml-0 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[11px] font-bold">
          {clashBySession.has(s.id) && (
            <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300" title="Người này có ca khác cùng giờ">
              trùng người: {clashBySession.get(s.id)!.join(", ")}
            </span>
          )}
          {(noRoom || actionable.length > 0) && (
            <span className="text-amber-300">{[noRoom ? "chưa có phòng" : "", ...actionable.map((m) => MISSING_LABEL[m])].filter(Boolean).join(" · ")}</span>
          )}
          {s.actualGmv ? <span className="text-emerald-300">{fmtVndShort(s.actualGmv)}</span> : null}
          {missing.length === 0 && s.status === "Completed" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-label="Đủ bước" />}
        </span>
        {/* Điện thoại: trạng thái lên cùng hàng giờ + brand (order), người + việc thiếu xuống hàng dưới. */}
        <span className={`order-3 md:order-none ml-auto md:ml-0 shrink-0 min-w-[68px] text-center text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CLS[s.status]}`}>{STATUS_LABEL[s.status]}</span>
      </button>
    );
  };

  const SlotRow = ({ r }: { r: Extract<Row, { kind: "slot" }> }) => (
    <button onClick={() => setOpenSlotId(r.slot.id)} className={`${ROW_CLS} bg-rose-500/[0.06] hover:bg-rose-500/10`} title="Mở để chốt Host + Trợ live">
      <span className="font-mono text-sm font-black text-[var(--text)] w-[104px] shrink-0">{r.startTime.slice(0, 5)}–{r.endTime.slice(0, 5)}</span>
      <span className="flex items-center gap-1.5 min-w-0 sm:w-[168px] shrink-0">
        <BrandLogo brand={r.slot.brandId ? brandById.get(r.slot.brandId) : undefined} size="xs" />
        <span className="text-sm font-bold text-[var(--text)] truncate">{r.slot.brandName}</span>
        <PlatformChip platform={r.slot.platform} />
      </span>
      <span className="order-4 md:order-none flex-1 basis-40 min-w-0 md:basis-auto text-xs text-rose-300 font-bold flex items-center gap-1"><UserX className="w-3.5 h-3.5" /> chưa có người · {r.registered} đăng ký</span>
      <span className="hidden md:block" />
      <span className="order-3 md:order-none ml-auto md:ml-0 text-[11px] font-bold text-[var(--accent-text)] flex items-center justify-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Chốt người</span>
    </button>
  );

  // Ca nháp (sa bàn, 0170): viền nét đứt vàng — chưa phải ca thật; bấm để sửa giờ/người/phòng rồi xác nhận.
  const DraftRow = ({ d }: { d: SessionDraft }) => (
    <button onClick={() => setOpenDraftId(d.id)} className={`${ROW_CLS} border border-dashed border-amber-500/40 bg-amber-500/[0.05] hover:bg-amber-500/10`} title="Ca nháp từ sa bàn — mở để xác nhận thành ca">
      <span className="font-mono text-sm font-black text-[var(--text)] w-[104px] shrink-0">{d.startTime}–{d.endTime}</span>
      <span className="flex items-center gap-1.5 min-w-0 sm:w-[168px] shrink-0">
        <BrandLogo brand={brandById.get(d.brandId)} size="xs" />
        <span className="text-sm font-bold text-[var(--text)] truncate">{brandById.get(d.brandId)?.name ?? "Brand"}</span>
        <PlatformChip platform={d.platform} />
      </span>
      <span className="order-4 md:order-none flex-1 basis-40 min-w-0 md:basis-auto text-xs text-[var(--text-muted)] truncate">
        {d.hostId ? <span className="text-[var(--text)]">{talentName(d.hostId)}</span> : <span className="text-rose-300 font-bold">chưa chọn host</span>}
        {d.coHostId ? <span className="text-[var(--text-faint)]"> · Trợ {talentName(d.coHostId)}</span> : ""}
        <span className="text-[var(--text-faint)]"> · kỳ vọng {fmtVndShort(d.expectedGmv)}</span>
      </span>
      <span className="order-5 md:order-none ml-auto md:ml-0 text-[11px] font-bold text-amber-300 truncate">{d.reason}</span>
      <span className="order-3 md:order-none ml-auto md:ml-0 text-[11px] font-bold text-amber-300 flex items-center justify-center gap-1"><FileClock className="w-3.5 h-3.5" /> Nháp</span>
    </button>
  );

  const groupedByDay = (list: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of list) { const l = m.get(r.date) ?? []; l.push(r); m.set(r.date, l); }
    return [...m.entries()];
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Radio}
        title="Bảng Vận Hành"
        description={view === "month" ? `Tháng ${Number(today.slice(5, 7))}: thử thêm ca để kịp target, xem ai đang gánh nhiều giờ. Tình hình từng kênh ở Dashboard.` : "Hôm nay có ca nào, ai trực, còn thiếu gì. Bấm vào ca để mở cửa sổ ca."}
        actions={
          <>
            {monthView && onViewChange && (
              <div className="flex rounded-lg border border-[var(--border)] p-0.5 mr-1" role="group" aria-label="Chế độ xem">
                {(["day", "month"] as OpsView[]).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => onViewChange(v)} className={`px-3 py-1.5 rounded-md text-xs font-bold ${view === v ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                    {v === "day" ? "Hôm nay & tuần" : "Cả tháng"}
                  </button>
                ))}
              </div>
            )}
            {view === "day" && (["today", "tomorrow", "week", "day"] as Range[]).map((r) => (
              <button key={r} onClick={() => { setRange(r); if (r === "today") setAnchor(today); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${range === r ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                {r === "today" ? "Hôm nay" : r === "tomorrow" ? "Ngày mai" : r === "week" ? "Tuần" : "Ngày…"}
              </button>
            ))}
            {view === "day" && drafts.length > 0 && (
              <button onClick={() => setRange("drafts")} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${range === "drafts" ? "seg-on" : "border-amber-500/50 text-amber-300 hover:text-[var(--text)]"}`}>
                Ca nháp · {drafts.length}
              </button>
            )}
            {view === "day" && (range === "week" || range === "day") && (
              <div className="flex items-center gap-1">
                <button onClick={() => setAnchor(addDays(anchor, range === "week" ? -7 : -1))} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)]"><ChevronLeft className="w-4 h-4" /></button>
                <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text)]" />
                <button onClick={() => setAnchor(addDays(anchor, range === "week" ? 7 : 1))} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)]"><ChevronRight className="w-4 h-4" /></button>
              </div>
            )}
          </>
        }
      />

      {view === "month" && monthView}
      {view === "day" && (
        <div className={aside ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] items-start" : ""}>
          {aside && <aside className="min-w-0 xl:col-start-2 xl:row-start-1 xl:sticky xl:top-0">{aside}</aside>}
          <div className="space-y-4 min-w-0 xl:col-start-1 xl:row-start-1">
          {/* Không có ca nào thì 4 ô "0 / 0 / 0 / —" không nói gì mà câu trạng thái ngay dưới đã nói đủ
              (kèm chỗ mở ca) — bỏ luôn hàng ô thay vì bày 4 số 0 (audit UX lần 2 — M7, cùng luật với
              Run-rate ở Dashboard brand M2). */}
          {summary.total > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatTile frame="card" label={range === "week" ? "Ca trong tuần" : "Ca trong ngày"} value={String(summary.total)} />
              <StatTile frame="card" label="Chưa có người" value={String(summary.noHost)} tone={summary.noHost > 0 ? WARN : OK} />
              <StatTile frame="card" label="Chưa giao ca" value={String(summary.pending)} tone={summary.pending > 0 ? WARN : OK} />
              <StatTile
                frame="card"
                label="GMV đã ghi nhận"
                value={REPORT_PLATFORMS.some((p) => summary.gmv[p] > 0) ? REPORT_PLATFORMS.filter((p) => summary.gmv[p] > 0).map((p) => `${p} ${fmtVndShort(summary.gmv[p])}`).join(" · ") : "—"}
              />
            </div>
          )}
          {clashes.length > 0 && (
            <details className="group bg-rose-950/30 border border-rose-800 rounded-2xl" open={clashes.length <= 5}>
              <summary className="list-none cursor-pointer p-3 sm:p-4 flex items-center gap-2 text-sm font-black text-rose-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {clashes.length} chỗ trùng người từ hôm nay
                <span className="text-[11px] font-normal text-rose-300/80">— một người chỉ đứng một ca tại một thời điểm; bấm ca để đổi người</span>
                <ChevronDown className="w-4 h-4 ml-auto shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-1.5">
                {clashes.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-mono text-[var(--text-muted)] w-[64px] shrink-0">{fmtDay(c.session.date)}</span>
                    <span className="font-bold text-[var(--text)]">{c.talentName || "?"}</span>
                    {c.other ? (
                      <>
                        <ClashLink s={c.session} onOpen={setOpenId} />
                        <span className="text-[var(--text-faint)]">và</span>
                        <ClashLink s={c.other} onOpen={setOpenId} />
                      </>
                    ) : (
                      <>
                        <span className="text-[var(--text-muted)]">vừa là Host vừa là Trợ live của</span>
                        <ClashLink s={c.session} onOpen={setOpenId} />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-2 sm:p-3 space-y-4">
            {range === "drafts" && rows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 sm:px-3 pt-1 text-xs text-[var(--text-muted)]">
                <span>{rows.length} ca nháp từ sa bàn (chế độ Cả tháng). Bấm từng ca để sửa giờ, người, phòng rồi xác nhận thành ca.</span>
                {onDismissDrafts && <button type="button" onClick={() => void onDismissDrafts(drafts.map((d) => d.id))} className="font-bold text-[var(--text-muted)] hover:text-rose-400 min-h-[28px]">Bỏ cả {drafts.length} ca nháp</button>}
              </div>
            )}
            {rows.length === 0 && (
              <p className="text-sm text-[var(--text-faint)] italic py-6 text-center">
                Không có ca nào {range === "today" ? "hôm nay" : range === "tomorrow" ? "ngày mai" : "trong khoảng này"}. Ca được mở từ Kế Hoạch Tháng hoặc nút "Mở ca chờ đăng ký" ở Lịch & Studio.
              </p>
            )}
            {groupedByDay(rows).map(([day, list]) => (
              <div key={day}>
                {range !== "today" && range !== "tomorrow" && <p className={`px-2 sm:px-3 pb-1 text-xs font-black ${day === today ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"}`}>{fmtDay(day)}{day === today ? " · hôm nay" : ""}</p>}
                <div className="divide-y divide-[var(--border-muted)]">
                  {list.map((r) => (r.kind === "session" ? <SessionRow key={r.session.id} s={r.session} /> : r.kind === "slot" ? <SlotRow key={r.slot.id} r={r} /> : <DraftRow key={r.draft.id} d={r.draft} />))}
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {openDraftId && onAcceptDraft && onDismissDrafts && (() => {
        const d = drafts.find((x) => x.id === openDraftId);
        if (!d) return null;
        const close = () => setOpenDraftId(null);
        return (
          <div className="fixed inset-0 z-50 bg-[var(--surface-base)]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" role="dialog" aria-label="Xác nhận ca nháp">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-3xl w-full p-4 sm:p-6 space-y-3 shadow-2xl">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <p className="font-black text-[var(--text)]">Ca nháp · {fmtDay(d.date)}</p>
                  <p className="text-xs text-[var(--text-muted)]">Xác nhận = tạo ca thật và chốt người. Trùng người/phòng bị chặn như ca thường.</p>
                </div>
                <button type="button" onClick={close} aria-label="Đóng" className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
              </div>
              <DraftsPanel
                drafts={[d]}
                nameOf={draftName}
                talents={talents}
                studios={studios}
                today={today}
                onAccept={async (x, e) => { await onAcceptDraft(x, e); close(); }}
                onDismiss={async (ids) => { await onDismissDrafts(ids); close(); }}
              />
            </div>
          </div>
        );
      })()}

      {openSlotId && (() => {
        const slot = shiftSlots.find((x) => x.id === openSlotId);
        return slot ? (
          <SlotDetailModal
            slot={slot}
            onClose={() => setOpenSlotId(null)}
            talents={talents}
            registrations={shiftRegistrations}
            sessions={sessions}
            shiftSlots={shiftSlots}
            canManage
            onFinalizeSlot={onFinalizeSlot}
            onDeleteSlot={onDeleteSlot}
            fatigueWeekHours={fatigueWeekHours}
          />
        ) : null;
      })()}

      {openSession && (
        <SessionWindow
          session={openSession}
          brand={brandById.get(openSession.brandId)}
          viewer={{ role: currentRole, myTalentId }}
          today={today}
          allSessions={sessions}
          studios={studios}
          talents={talents}
          shiftSlots={shiftSlots}
          onClose={() => setOpenId(null)}
          onSessionsUpdated={onSessionsUpdated}
          onUpdateSession={onUpdateSession}
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

const ClashLink: React.FC<{ s: LiveSession; onOpen: (id: string) => void }> = ({ s, onOpen }) => (
  <button onClick={() => onOpen(s.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-800/70 bg-[var(--surface-base)] hover:border-rose-500 text-[var(--text)] min-h-6">
    <span className="font-bold">{s.brandName}</span>
    <PlatformChip platform={s.platform} />
    <span className="font-mono">{s.startTime}–{s.endTime}</span>
  </button>
);

