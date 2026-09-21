import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Radio, UserX } from "lucide-react";
import { Brand, LiveSession, ShiftRegistration, ShiftSlot, Studio, Talent, UserRole, AuditLogEntry } from "../types";
import { getTodayDate } from "../lib/dateUtils";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { SessionReportInput } from "../lib/db/sessionReports";
import { MissingStep, missingSteps } from "../lib/sessionLedger";
import { BrandLogo } from "./ui/BrandLogo";
import { SessionWindow } from "./SessionWindow";

// Bảng Vận Hành — màn của NHỊP HẰNG NGÀY (tái cấu trúc 2026-09-21): hôm nay / ngày / tuần này có
// ca nào, ai trực, phòng nào, và mỗi ca còn thiếu gì (chưa có người · chưa up file · chưa report ·
// chưa đối soát). Click ca → Cửa sổ Ca Live. Không đặt ca ở đây — đặt ca là việc lập kế hoạch
// (Kế Hoạch Tháng / Đăng Ký & Chốt Lịch).
//  - mode "ops": mọi brand, mặc định hôm nay, chuyển ngày/tuần.
//  - mode "mine" (talent — "Ca của tôi"): chỉ ca mình là host/trợ; hai khối "Cần nộp số liệu" (ca đã
//    qua còn thiếu file/report) và "Sắp tới 14 ngày". Đây là nơi trợ live nộp report.

export interface OpsBoardProps {
  mode: "ops" | "mine";
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  brands: Brand[];
  studios: Studio[];
  talents: Talent[];
  currentRole: UserRole;
  myTalentId?: string;
  onSubmitSessionReport: (sessionId: string, input: SessionReportInput) => Promise<boolean>;
  onSessionSnapshotApplied: (session: LiveSession) => void;
  onUpdateSession?: (session: LiveSession) => Promise<boolean>;
  onDeleteSession?: (id: string) => Promise<void>;
  onCancelSession?: (id: string, reason: string) => Promise<boolean>;
  onLogAudit?: (entry: { action: string; details: string; category: AuditLogEntry["category"] }) => Promise<void>;
  // Ca chưa có người → nhảy sang Đăng Ký & Chốt Lịch.
  onOpenScheduling?: () => void;
  // Q4: bấm thông báo → App đặt id ca cần mở; bảng mở Cửa sổ Ca Live rồi báo lại để App xoá yêu cầu.
  requestOpenSessionId?: string | null;
  onOpenRequestHandled?: () => void;
}

type Range = "today" | "tomorrow" | "week" | "day";

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MISSING_LABEL: Record<MissingStep, string> = { snapshot: "chưa up file", report: "chưa report", reconcile: "chưa đối soát" };
const STATUS_LABEL: Record<LiveSession["status"], string> = { "Live Now": "Đang live", Upcoming: "Sắp tới", Completed: "Đã xong", Cancelled: "Đã huỷ" };
const STATUS_CLS: Record<LiveSession["status"], string> = {
  "Live Now": "bg-red-950 text-red-300 border-red-800",
  Upcoming: "bg-amber-950 text-amber-300 border-amber-800",
  Completed: "bg-emerald-950 text-emerald-300 border-emerald-800",
  Cancelled: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
};

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

// Một dòng của bảng: ca thật (session) hoặc ca mở chưa chốt người (slot).
type Row =
  | { kind: "session"; date: string; startTime: string; endTime: string; session: LiveSession }
  | { kind: "slot"; date: string; startTime: string; endTime: string; slot: ShiftSlot; registered: number };

export const OpsBoard: React.FC<OpsBoardProps> = ({
  mode,
  sessions,
  shiftSlots,
  shiftRegistrations,
  brands,
  studios,
  talents,
  currentRole,
  myTalentId,
  onSubmitSessionReport,
  onSessionSnapshotApplied,
  onUpdateSession,
  onDeleteSession,
  onCancelSession,
  onLogAudit,
  onOpenScheduling,
  requestOpenSessionId = null,
  onOpenRequestHandled
}) => {
  const today = getTodayDate();
  const [range, setRange] = useState<Range>("today");
  const [anchor, setAnchor] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!requestOpenSessionId) return;
    setOpenId(requestOpenSessionId);
    onOpenRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestOpenSessionId]);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const regsBySlot = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of shiftRegistrations) m.set(r.slotId, (m.get(r.slotId) ?? 0) + 1);
    return m;
  }, [shiftRegistrations]);

  const [from, to] = useMemo<[string, string]>(() => {
    if (range === "today") return [today, today];
    if (range === "tomorrow") return [addDays(today, 1), addDays(today, 1)];
    if (range === "week") { const mon = mondayOf(anchor); return [mon, addDays(mon, 6)]; }
    return [anchor, anchor];
  }, [range, anchor, today]);

  const mine = (s: LiveSession) => !!myTalentId && (s.hostId === myTalentId || s.coHostId === myTalentId);

  // Ops: mọi ca (session + slot mở chưa chốt) trong khoảng đang xem.
  const rows = useMemo<Row[]>(() => {
    if (mode !== "ops") return [];
    const out: Row[] = [];
    for (const s of sessions) {
      if (s.date < from || s.date > to || s.isBackfill) continue;
      out.push({ kind: "session", date: s.date, startTime: s.startTime, endTime: s.endTime, session: s });
    }
    for (const sl of shiftSlots) {
      if (sl.date < from || sl.date > to || sl.status !== "open") continue;
      out.push({ kind: "slot", date: sl.date, startTime: sl.startTime, endTime: sl.endTime, slot: sl, registered: regsBySlot.get(sl.id) ?? 0 });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [mode, sessions, shiftSlots, from, to, regsBySlot]);

  // Talent: ca của tôi cần nộp (đã qua, thiếu file/report) + sắp tới 14 ngày.
  const mineDue = useMemo(
    () => (mode === "mine" ? sessions.filter((s) => mine(s) && s.date <= today && missingSteps(s, today).some((m) => m !== "reconcile")).sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)) : []),
    [mode, sessions, myTalentId, today]
  );
  const mineUpcoming = useMemo(
    () => (mode === "mine" ? sessions.filter((s) => mine(s) && s.date >= today && s.date <= addDays(today, 14) && s.status !== "Cancelled" && !mineDue.includes(s)).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(a.startTime)) : []),
    [mode, sessions, myTalentId, today, mineDue]
  );

  const summary = useMemo(() => {
    const ss = rows.filter((r): r is Extract<Row, { kind: "session" }> => r.kind === "session").map((r) => r.session);
    return {
      total: rows.length,
      noHost: rows.filter((r) => r.kind === "slot" || !r.session.hostId).length,
      pending: ss.filter((s) => missingSteps(s, today).some((m) => m !== "reconcile")).length,
      gmv: ss.reduce((a, s) => a + (s.actualGmv ?? 0), 0)
    };
  }, [rows, today]);

  const openSession = openId ? sessions.find((s) => s.id === openId) ?? null : null;

  const SessionRow = ({ s }: { s: LiveSession }) => {
    const missing = missingSteps(s, today);
    const actionable = missing.filter((m) => m !== "reconcile");
    return (
      <button onClick={() => setOpenId(s.id)} className="w-full text-left bg-[var(--surface-base)] border border-[var(--border)] hover:border-[var(--accent)] rounded-xl p-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 transition-colors">
        <span className="font-mono text-sm font-black text-[var(--text)] w-[104px] shrink-0">{s.startTime}–{s.endTime}</span>
        <span className="flex items-center gap-1.5 min-w-0">
          <BrandLogo brand={brandById.get(s.brandId) ?? { name: s.brandName, logo: "" }} size="xs" />
          <span className="text-sm font-bold text-[var(--text)] truncate">{s.brandName}</span>
        </span>
        {mode === "mine" && <span className="text-[11px] text-[var(--text-faint)]">{fmtDay(s.date)}</span>}
        <span className="text-xs text-[var(--text-muted)] truncate">
          {s.hostName ? `Host ${s.hostName}` : <span className="text-rose-300 font-bold">chưa gán host</span>}
          {s.coHostName ? ` · Trợ ${s.coHostName}` : ""}
          {s.studioName ? ` · ${s.studioName}` : ""}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CLS[s.status]}`}>{STATUS_LABEL[s.status]}</span>
          {s.actualGmv ? <span className="text-[11px] font-bold text-emerald-300">{formatCurrencyAdaptive(s.actualGmv)}</span> : null}
          {actionable.map((m) => (
            <span key={m} className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-950/60 text-amber-300 border-amber-800">{MISSING_LABEL[m]}</span>
          ))}
          {missing.length === 0 && s.status === "Completed" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
        </span>
      </button>
    );
  };

  const SlotRow = ({ r }: { r: Extract<Row, { kind: "slot" }> }) => (
    <button onClick={onOpenScheduling} className="w-full text-left bg-[var(--surface-base)] border border-dashed border-rose-800/70 hover:border-rose-500 rounded-xl p-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 transition-colors" title="Chốt người ở Nhân sự ca">
      <span className="font-mono text-sm font-black text-[var(--text)] w-[104px] shrink-0">{r.startTime.slice(0, 5)}–{r.endTime.slice(0, 5)}</span>
      <span className="flex items-center gap-1.5 min-w-0">
        <BrandLogo brand={r.slot.brandId ? brandById.get(r.slot.brandId) : undefined} size="xs" />
        <span className="text-sm font-bold text-[var(--text)] truncate">{r.slot.brandName}</span>
      </span>
      <span className="text-xs text-rose-300 font-bold flex items-center gap-1"><UserX className="w-3.5 h-3.5" /> chưa có người · {r.registered} đăng ký</span>
      <span className="ml-auto text-[11px] text-[var(--text-faint)] flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> chốt ở Nhân sự ca</span>
    </button>
  );

  const groupedByDay = (list: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of list) { const l = m.get(r.date) ?? []; l.push(r); m.set(r.date, l); }
    return [...m.entries()];
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
            <Radio className="w-5 h-5 text-red-400" />
            {mode === "mine" ? "Ca Của Tôi" : "Bảng Vận Hành"}
          </h2>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {mode === "mine" ? "Ca bạn trực: nộp file số liệu + report ngay khi hết ca. Bấm vào ca để mở." : "Hôm nay có ca nào, ai trực, còn thiếu gì. Bấm vào ca để mở cửa sổ ca."}
          </p>
        </div>
        {mode === "ops" && (
          <div className="flex flex-wrap items-center gap-2">
            {(["today", "tomorrow", "week", "day"] as Range[]).map((r) => (
              <button key={r} onClick={() => { setRange(r); if (r === "today") setAnchor(today); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${range === r ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                {r === "today" ? "Hôm nay" : r === "tomorrow" ? "Ngày mai" : r === "week" ? "Tuần" : "Ngày…"}
              </button>
            ))}
            {(range === "week" || range === "day") && (
              <div className="flex items-center gap-1">
                <button onClick={() => setAnchor(addDays(anchor, range === "week" ? -7 : -1))} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)]"><ChevronLeft className="w-4 h-4" /></button>
                <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text)]" />
                <button onClick={() => setAnchor(addDays(anchor, range === "week" ? 7 : 1))} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)]"><ChevronRight className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {mode === "ops" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label={range === "week" ? "Ca trong tuần" : "Ca trong ngày"} value={String(summary.total)} />
            <Stat label="Chưa có người" value={String(summary.noHost)} tone={summary.noHost > 0 ? "warn" : "ok"} />
            <Stat label="Chưa nộp số liệu" value={String(summary.pending)} tone={summary.pending > 0 ? "warn" : "ok"} />
            <Stat label="GMV đã ghi nhận" value={summary.gmv > 0 ? formatCurrencyAdaptive(summary.gmv) : "—"} />
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 space-y-4">
            {rows.length === 0 && (
              <p className="text-sm text-[var(--text-faint)] italic py-6 text-center">
                Không có ca nào {range === "today" ? "hôm nay" : range === "tomorrow" ? "ngày mai" : "trong khoảng này"}. Ca được mở từ Kế Hoạch Tháng hoặc nút "Mở ca chờ đăng ký" ở Lịch & Studio.
              </p>
            )}
            {groupedByDay(rows).map(([day, list]) => (
              <div key={day} className="space-y-1.5">
                {range !== "today" && range !== "tomorrow" && <p className={`text-[11px] font-black uppercase tracking-wide ${day === today ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"}`}>{fmtDay(day)}{day === today ? " · hôm nay" : ""}</p>}
                {list.map((r) => (r.kind === "session" ? <SessionRow key={r.session.id} s={r.session} /> : <SlotRow key={r.slot.id} r={r} />))}
              </div>
            ))}
          </div>
        </>
      )}

      {mode === "mine" && (
        <>
          {!myTalentId && (
            <div className="rounded-xl border border-amber-800 bg-amber-950/50 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Tài khoản này chưa gắn với hồ sơ talent nào — nhờ ops gắn ở Phân Quyền & Role để thấy ca của bạn.</span>
            </div>
          )}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 space-y-2">
            <h3 className="text-sm font-black text-[var(--text)] flex items-center gap-2">
              Cần nộp số liệu
              {mineDue.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">{mineDue.length}</span>}
            </h3>
            {mineDue.length === 0 ? <p className="text-xs text-[var(--text-faint)] italic">Không còn ca nào thiếu file/report.</p> : mineDue.map((s) => <SessionRow key={s.id} s={s} />)}
          </section>
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 space-y-2">
            <h3 className="text-sm font-black text-[var(--text)]">Sắp tới (14 ngày)</h3>
            {mineUpcoming.length === 0 ? <p className="text-xs text-[var(--text-faint)] italic">Chưa có ca nào được chốt cho bạn. Đăng ký ca mở ở tab Đăng Ký Ca.</p> : mineUpcoming.map((s) => <SessionRow key={s.id} s={s} />)}
          </section>
        </>
      )}

      {openSession && (
        <SessionWindow
          session={openSession}
          brand={brandById.get(openSession.brandId)}
          viewer={{ role: currentRole, myTalentId }}
          today={today}
          allSessions={sessions}
          studios={mode === "ops" ? studios : undefined}
          talents={mode === "ops" ? talents : undefined}
          onClose={() => setOpenId(null)}
          onSubmitSessionReport={onSubmitSessionReport}
          onSessionSnapshotApplied={onSessionSnapshotApplied}
          onUpdateSession={mode === "ops" ? onUpdateSession : undefined}
          onDeleteSession={mode === "ops" ? onDeleteSession : undefined}
          onCancelSession={mode === "ops" ? onCancelSession : undefined}
          onLogAudit={mode === "ops" ? onLogAudit : undefined}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; tone?: "ok" | "warn" }> = ({ label, value, tone }) => (
  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
    <p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
    <p className={`text-lg font-black mt-0.5 ${tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-[var(--text)]"}`}>{value}</p>
  </div>
);
