import React, { useEffect, useMemo, useState } from "react";
import { SESSION_STATUS_CLS, SESSION_STATUS_LABEL_VI } from "../lib/sessionStatusUi";
import { CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileClock, Radio, UserX, X } from "lucide-react";
import { Brand, LiveSession, ShiftRegistration, ShiftSlot, Studio, Talent, UserRole, AuditLogEntry } from "../types";
import { getTodayDate } from "../lib/dateUtils";
import { fmtVndShort } from "../lib/format";
import { isUnconfirmedPast } from "../lib/sessionStatus";
import { BrandLogo } from "./ui/BrandLogo";
import { PlatformChip } from "./common/PlatformChip";
import { sumGmvByPlatform } from "../lib/platforms/perf";
import { platformOf, REPORT_PLATFORMS, type ReportPlatform } from "../lib/reportPlatform";
import { clashedSessionIds, findPersonClashes } from "../lib/scheduling/conflicts";
import { fetchShiftAcks, isShiftAcksBackendMissing, type ShiftAck } from "../lib/db/shiftAcks";
import { unackedSoon } from "../lib/talent/acks";
import type { BoardView } from "../lib/todoList";
import { SessionWindow } from "./SessionWindow";
import { PageHeader } from "./common/PageHeader";
import { StatTile } from "./common/StatTile";
import { SlotDetailModal } from "./scheduling/SlotDetailModal";
import { DraftsPanel } from "./control-room/DraftsPanel";
import type { SessionDraft } from "../lib/db/sessionDrafts";
import type { DraftEdit } from "../hooks/useSessionDrafts";
import type { ShiftWindow } from "./OpsSupport";

// Bảng Vận Hành — màn của NHỊP HẰNG NGÀY (tái cấu trúc 2026-09-21): ca nào, ai trực, phòng nào, ca nào còn thiếu gì. Click ca → Cửa sổ
// Ca Live. Không đặt ca ở đây — đặt ca là việc lập kế hoạch (Kế Hoạch Tháng). Màn "Ca của tôi" của talent đã thay bằng app talent (11/10).
//  24/10: gộp Phòng Điều Hành — hai chế độ "Hôm nay & tuần" và "Cả tháng" (`monthView`, giữ nguyên sau lần mở đầu để không tính lại).
//  25/10 (audit 24/10, user chốt cả 3 đề xuất; demo https://claude.ai/artifact/HTPVorM52vK9VyYvooyzVW):
//   • Khối "Cần xử lý" đầu trang: ca đã qua giờ chưa có số (trước chỉ thấy khi sang Sổ Ca — màn mở ở "Hôm nay" nên 30 ca tồn không hiện),
//     chỗ trùng người theo ngày, chip lọc ca hôm nay chưa có host / chưa có phòng / chưa nhận lịch. Bỏ khối trùng người đỏ riêng.
//   • Nhãn trên dòng ca: đỏ "chưa có số" = `isUnconfirmedPast` (cùng định nghĩa với việc cần làm). Bỏ nhãn vàng "chưa giao ca / chưa up file"
//     theo form: 180/216 ca mang nhãn đó đã có số + đã đối soát (user chốt: đã có số thì không cảnh báo).
//   • Kỳ vọng GMV ngay trên dòng ca sắp tới (`expectedOf` = expectedNowById), mở mũi tên xem phễu (OpsSupport) — bỏ khối chọn brand riêng.
//   • Dòng ca là component ngoài hàm vẽ (trước khai báo bên trong ⇒ cả danh sách dựng lại mỗi lần cập nhật, bấm trượt khi dòng vừa thay).

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
  /** Nội dung chế độ "Cả tháng" (khối lập kế hoạch + OpsMonthView). */
  monthView?: React.ReactNode;
  /** Ca nháp sa bàn đang chờ (0170). */
  drafts?: SessionDraft[];
  onAcceptDraft?: (d: SessionDraft, e: DraftEdit) => Promise<void>;
  onDismissDrafts?: (ids: string[]) => Promise<void>;
  /** App yêu cầu mở sẵn một chỗ (bấm việc cần làm) — bảng mở rồi báo lại để App xoá yêu cầu. */
  requestRange?: BoardView | null;
  onRangeRequestHandled?: () => void;
  /** Kỳ vọng GMV của ca / ca chờ đăng ký: null = đang tính, undefined = kênh chưa đủ lịch sử. Vắng = không hiện cột kỳ vọng. */
  expectedOf?: (id: string) => number | null | undefined;
  /** Chi tiết kỳ vọng + phễu khi mở mũi tên của dòng ca sắp tới (App bọc OpsSupport). */
  renderExpectDetail?: (win: ShiftWindow) => React.ReactNode;
}

export type OpsView = "day" | "month";

type Range = "past" | "today" | "tomorrow" | "week" | "day" | "drafts" | "backlog";
type Filter = "nohost" | "noroom" | "unack";

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const STATUS_LABEL = SESSION_STATUS_LABEL_VI;
const STATUS_CLS = SESSION_STATUS_CLS;
const OPS_ROLES: UserRole[] = ["ceo", "admin", "operations"];

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
const isUpcoming = (s: LiveSession, today: string) => s.status === "Upcoming" || s.status === "Live Now" || (s.status !== "Cancelled" && s.status !== "Completed" && s.date >= today);

// Một dòng của bảng: ca thật (session), ca mở chưa chốt người (slot), hoặc ca nháp của sa bàn chờ xác nhận (draft).
type Row =
  | { kind: "session"; date: string; startTime: string; endTime: string; session: LiveSession }
  | { kind: "slot"; date: string; startTime: string; endTime: string; slot: ShiftSlot; registered: number }
  | { kind: "draft"; date: string; startTime: string; endTime: string; draft: SessionDraft };

// Bố cục 18/10: dòng ca là một hàng trong danh sách kẻ vạch, cột cố định giờ · brand · người · nhãn · kỳ vọng/GMV · trạng thái · mở chi tiết.
// Màn hẹp: flex-wrap (trạng thái lên cùng hàng giờ + brand, người + nhãn xuống hàng dưới).
const ROW_CLS =
  "w-full text-left rounded-lg px-2 sm:px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 transition-colors cursor-pointer md:grid md:grid-cols-[104px_168px_minmax(0,1fr)_minmax(0,auto)_76px_76px_24px]";
const onKeyOpen = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

const Expect: React.FC<{ value: number | null | undefined }> = ({ value }) => (
  <span className="order-5 md:order-none text-right text-xs font-bold tabular-nums text-[var(--text)] leading-tight" title="GMV kỳ vọng ở mức hiện tại của kênh — cùng số với sa bàn Cả tháng">
    {value === null ? "…" : value === undefined ? "—" : fmtVndShort(value)}
    <span className="block text-[11px] font-medium text-[var(--text-faint)]">kỳ vọng</span>
  </span>
);
const ExpandBtn: React.FC<{ open: boolean; onToggle: () => void }> = ({ open, onToggle }) => (
  <button
    type="button"
    aria-expanded={open}
    aria-label={open ? "Đóng chi tiết kỳ vọng" : "Xem kỳ vọng và phễu của ca"}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    className="order-6 md:order-none p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
  >
    <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
  </button>
);

const SessionRow: React.FC<{
  s: LiveSession;
  brand: Brand | undefined;
  today: string;
  clashWith?: string[];
  unackNames?: string;
  expected?: number | null;
  showExpected: boolean;
  open: boolean;
  onOpen: (id: string) => void;
  onToggle?: () => void;
}> = ({ s, brand, today, clashWith, unackNames, expected, showExpected, open, onOpen, onToggle }) => {
  const upcoming = isUpcoming(s, today);
  const noNumbers = isUnconfirmedPast(s);
  const noRoom = !s.studioId && s.status !== "Cancelled" && s.date >= today;
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(s.id)} onKeyDown={onKeyOpen(() => onOpen(s.id))} className={`${ROW_CLS} hover:bg-[var(--surface-elevated)]/70`}>
      <span className="font-mono text-sm font-black text-[var(--text)] w-[104px] shrink-0">{s.startTime}–{s.endTime}</span>
      <span className="flex items-center gap-1.5 min-w-0 sm:w-[168px] shrink-0">
        <BrandLogo brand={brand ?? { name: s.brandName, logo: "" }} size="xs" />
        <span className="text-sm font-bold text-[var(--text)] truncate">{s.brandName}</span>
        <PlatformChip platform={s.platform} />
      </span>
      <span className="order-4 md:order-none flex-1 basis-40 min-w-0 text-xs text-[var(--text-muted)] truncate md:basis-auto" title={[s.hostName ? `Host ${s.hostName}` : "chưa gán host", s.coHostName ? `Trợ ${s.coHostName}` : "", s.studioName ?? ""].filter(Boolean).join(" · ")}>
        {s.hostName ? <span className="text-[var(--text)]">{s.hostName}</span> : <span className="text-rose-300 font-bold">chưa gán host</span>}
        {s.coHostName ? <span className="text-[var(--text-faint)]"> · Trợ {s.coHostName}</span> : ""}
        {s.studioName ? <span className="text-[var(--text-faint)]"> · {s.studioName}</span> : ""}
      </span>
      <span className="order-5 md:order-none ml-auto md:ml-0 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[11px] font-bold">
        {clashWith && <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300" title="Người này có ca khác cùng giờ">trùng người: {clashWith.join(", ")}</span>}
        {noNumbers && <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300">chưa có số</span>}
        {noRoom && <span className="text-amber-300">chưa có phòng</span>}
        {unackNames && <span className="text-amber-300" title={unackNames}>chưa nhận lịch: {unackNames}</span>}
      </span>
      {upcoming && showExpected ? (
        <Expect value={expected} />
      ) : (
        <span className="order-5 md:order-none text-right text-xs font-bold tabular-nums">
          {s.actualGmv ? <span className="text-emerald-300">{fmtVndShort(s.actualGmv)}</span> : null}
          {!noNumbers && s.status === "Completed" && !s.actualGmv && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" aria-label="Đã có số" />}
        </span>
      )}
      {/* Điện thoại: trạng thái lên cùng hàng giờ + brand (order), người + nhãn xuống hàng dưới. */}
      <span className={`order-3 md:order-none ml-auto md:ml-0 shrink-0 min-w-[68px] text-center text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CLS[s.status]}`}>{STATUS_LABEL[s.status]}</span>
      {upcoming && onToggle ? <ExpandBtn open={open} onToggle={onToggle} /> : <span className="hidden md:block" />}
    </div>
  );
};

const SlotRow: React.FC<{ r: Extract<Row, { kind: "slot" }>; brand: Brand | undefined; expected?: number | null; showExpected: boolean; open: boolean; onOpen: (id: string) => void; onToggle?: () => void }> = ({ r, brand, expected, showExpected, open, onOpen, onToggle }) => (
  <div role="button" tabIndex={0} onClick={() => onOpen(r.slot.id)} onKeyDown={onKeyOpen(() => onOpen(r.slot.id))} className={`${ROW_CLS} bg-rose-500/[0.06] hover:bg-rose-500/10`} title="Mở để chốt Host + Trợ live">
    <span className="font-mono text-sm font-black text-[var(--text)] w-[104px] shrink-0">{r.startTime.slice(0, 5)}–{r.endTime.slice(0, 5)}</span>
    <span className="flex items-center gap-1.5 min-w-0 sm:w-[168px] shrink-0">
      <BrandLogo brand={brand} size="xs" />
      <span className="text-sm font-bold text-[var(--text)] truncate">{r.slot.brandName}</span>
      <PlatformChip platform={r.slot.platform} />
    </span>
    <span className="order-4 md:order-none flex-1 basis-40 min-w-0 md:basis-auto text-xs text-rose-300 font-bold flex items-center gap-1"><UserX className="w-3.5 h-3.5" /> chưa có người · {r.registered} đăng ký</span>
    <span className="hidden md:block" />
    {showExpected ? <Expect value={expected} /> : <span className="hidden md:block" />}
    <span className="order-3 md:order-none ml-auto md:ml-0 text-[11px] font-bold text-[var(--accent-text)] flex items-center justify-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Chốt người</span>
    {onToggle ? <ExpandBtn open={open} onToggle={onToggle} /> : <span className="hidden md:block" />}
  </div>
);

// Ca nháp (sa bàn, 0170): viền nét đứt vàng — chưa phải ca thật; bấm để sửa giờ/người/phòng rồi xác nhận.
const DraftRow: React.FC<{ d: SessionDraft; brand: Brand | undefined; hostName: string; coHostName: string; onOpen: (id: string) => void }> = ({ d, brand, hostName, coHostName, onOpen }) => (
  <div role="button" tabIndex={0} onClick={() => onOpen(d.id)} onKeyDown={onKeyOpen(() => onOpen(d.id))} className={`${ROW_CLS} border border-dashed border-amber-500/40 bg-amber-500/[0.05] hover:bg-amber-500/10`} title="Ca nháp từ sa bàn — mở để xác nhận thành ca">
    <span className="font-mono text-sm font-black text-[var(--text)] w-[104px] shrink-0">{d.startTime}–{d.endTime}</span>
    <span className="flex items-center gap-1.5 min-w-0 sm:w-[168px] shrink-0">
      <BrandLogo brand={brand} size="xs" />
      <span className="text-sm font-bold text-[var(--text)] truncate">{brand?.name ?? "Brand"}</span>
      <PlatformChip platform={d.platform} />
    </span>
    <span className="order-4 md:order-none flex-1 basis-40 min-w-0 md:basis-auto text-xs text-[var(--text-muted)] truncate">
      {d.hostId ? <span className="text-[var(--text)]">{hostName}</span> : <span className="text-rose-300 font-bold">chưa chọn host</span>}
      {d.coHostId ? <span className="text-[var(--text-faint)]"> · Trợ {coHostName}</span> : ""}
    </span>
    <span className="order-5 md:order-none ml-auto md:ml-0 text-[11px] font-bold text-amber-300 truncate">{d.reason}</span>
    <Expect value={d.expectedGmv} />
    <span className="order-3 md:order-none ml-auto md:ml-0 text-[11px] font-bold text-amber-300 flex items-center justify-center gap-1"><FileClock className="w-3.5 h-3.5" /> Nháp</span>
    <span className="hidden md:block" />
  </div>
);

// Khối "Cần xử lý": những thứ phải làm trước khi nhìn lịch. Mỗi dòng mở đúng danh sách / ngày / bộ lọc của nó.
const NeedsQueue: React.FC<{
  backlogByDay: [string, number][];
  backlogTotal: number;
  clashByDay: { date: string; n: number; people: string[] }[];
  counts: Record<Filter, number>;
  today: string;
  range: Range;
  filter: Filter | null;
  onBacklog: () => void;
  onDay: (date: string) => void;
  onFilter: (f: Filter) => void;
}> = ({ backlogByDay, backlogTotal, clashByDay, counts, today, range, filter, onBacklog, onDay, onFilter }) => {
  const nothing = backlogTotal === 0 && clashByDay.length === 0 && counts.nohost + counts.noroom + counts.unack === 0;
  if (nothing) {
    return <p className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Không có gì cần xử lý: ca đã qua đều có số, lịch không trùng người.</p>;
  }
  const first = clashByDay[0];
  const rest = clashByDay.slice(1);
  const dayLabel = (d: string) => (d === today ? "hôm nay" : d === addDays(today, 1) ? `ngày mai ${fmtDay(d)}` : fmtDay(d));
  const chip = (f: Filter, label: string) =>
    counts[f] > 0 && (
      <button key={f} type="button" aria-pressed={filter === f} onClick={() => onFilter(f)} className={`px-2.5 py-1 rounded-full text-xs font-bold border min-h-[28px] ${filter === f ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
        {label} <b className="tabular-nums text-[var(--text)]">{counts[f]}</b>
      </button>
    );
  return (
    <section className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.05] p-3 sm:p-4 space-y-3" aria-label="Cần xử lý">
      <h3 className="text-sm font-black text-[var(--text)]">Cần xử lý</h3>
      {backlogTotal > 0 && (
        <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 items-center">
          <span className="text-xl font-black tabular-nums text-rose-300 text-right">{backlogTotal}</span>
          <span className="min-w-0 text-xs text-[var(--text-muted)]">
            <b className="block text-sm text-[var(--text)]">ca đã qua giờ chưa có số</b>
            {backlogByDay.map(([d, n]) => `${fmtDay(d)}: ${n}`).join(" · ")}
          </span>
          <button type="button" onClick={onBacklog} aria-pressed={range === "backlog"} className={`px-3 py-1.5 rounded-lg text-xs font-bold min-h-[32px] ${range === "backlog" ? "border border-[var(--border)] text-[var(--text)]" : "bg-[var(--accent)] text-[var(--accent-contrast)]"}`}>
            {range === "backlog" ? "Thu lại" : "Xem & giao ca"}
          </button>
        </div>
      )}
      {first && (
        <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 items-center">
          <span className="text-xl font-black tabular-nums text-rose-300 text-right">{first.n}</span>
          <span className="min-w-0 text-xs text-[var(--text-muted)]">
            <b className="block text-sm text-[var(--text)]">chỗ trùng người {dayLabel(first.date)}</b>
            {first.people.join(", ")}
            {rest.length > 0 && ` · thêm ${rest.map((r) => `${r.n} chỗ ${fmtDay(r.date)}`).join(", ")}`}
          </span>
          <button type="button" onClick={() => onDay(first.date)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] min-h-[32px]">
            Xem {first.date === today ? "hôm nay" : first.date === addDays(today, 1) ? "ngày mai" : fmtDay(first.date)}
          </button>
        </div>
      )}
      {counts.nohost + counts.noroom + counts.unack > 0 && (
        <div className="flex flex-wrap gap-1.5 sm:pl-12">
          {chip("nohost", "hôm nay chưa có host")}
          {chip("noroom", "hôm nay chưa có phòng")}
          {chip("unack", "chưa nhận lịch · ca trong 12 giờ")}
        </div>
      )}
    </section>
  );
};

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
  onRangeRequestHandled,
  expectedOf,
  renderExpectDetail
}) => {
  const today = getTodayDate();
  const isOps = OPS_ROLES.includes(currentRole);
  const [rangeState, setRange] = useState<Range>("today");
  const [filter, setFilter] = useState<Filter | null>(null);
  // Hết nháp khi đang ở bộ lọc Ca nháp ⇒ về hôm nay (nút lọc biến mất cùng lúc).
  const range: Range = rangeState === "drafts" && drafts.length === 0 ? "today" : rangeState;
  const [anchor, setAnchor] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);
  const [expandId, setExpandId] = useState<string | null>(null);
  // "Cả tháng" dựng một lần rồi giữ (ẩn khi về "Hôm nay & tuần") — trước 25/10 mỗi lần bấm tính lại ~0,8 giây.
  const [monthSeen, setMonthSeen] = useState(view === "month");
  if (view === "month" && !monthSeen) setMonthSeen(true);

  const pickDay = (date: string) => {
    setFilter(null);
    if (date === today) setRange("today");
    else if (date === addDays(today, 1)) setRange("tomorrow");
    else {
      setAnchor(date);
      setRange("day");
    }
  };
  useEffect(() => {
    if (!requestOpenSessionId) return;
    setOpenId(requestOpenSessionId);
    onOpenRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestOpenSessionId]);
  useEffect(() => {
    if (!requestRange) return;
    if (requestRange === "drafts" || requestRange === "backlog") {
      setFilter(null);
      setRange(requestRange);
    } else if (requestRange === "unack") {
      setRange("today");
      setFilter("unack");
    } else pickDay(requestRange.slice(4));
    onRangeRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestRange]);

  // "Đã nhận lịch" (0169) — chỉ để chip lọc "chưa nhận lịch · ca trong 12 giờ". Lỗi / DB chưa chạy ⇒ không có chip.
  const [acks, setAcks] = useState<ShiftAck[] | null>(null);
  useEffect(() => {
    if (!isOps || view !== "day") return;
    let alive = true;
    fetchShiftAcks(today)
      .then((a) => alive && setAcks(a))
      .catch((e) => {
        if (!isShiftAcksBackendMissing(e)) console.warn("[LiveOps] Không đọc được shift_acks:", e);
        if (alive) setAcks(null);
      });
    return () => {
      alive = false;
    };
  }, [isOps, view, today]);
  const [nowMs] = useState(() => Date.now());
  const unackBySession = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!acks) return m;
    for (const p of unackedSoon(sessions, acks, nowMs, 12)) for (const s of p.sessions) m.set(s.id, [...(m.get(s.id) ?? []), p.name]);
    return m;
  }, [sessions, acks, nowMs]);

  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const draftName = (d: SessionDraft) => `${brandById.get(d.brandId)?.name ?? "Brand"} · ${d.platform}`;
  const talentName = (id: string | null) => (id ? talents.find((t) => t.id === id)?.name ?? "?" : "");
  const regsBySlot = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of shiftRegistrations) m.set(r.slotId, (m.get(r.slotId) ?? 0) + 1);
    return m;
  }, [shiftRegistrations]);

  // Ca đã qua giờ chưa có số — CÙNG `isUnconfirmedPast` với việc cần làm "N ca đã qua giờ chưa có số".
  const backlog = useMemo(() => sessions.filter(isUnconfirmedPast), [sessions]);
  const backlogByDay = useMemo<[string, number][]>(() => {
    const m = new Map<string, number>();
    for (const s of backlog) m.set(s.date, (m.get(s.date) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [backlog]);

  // Trùng người từ hôm nay trở đi (user chốt 06/10: một người chỉ đứng một ca tại một thời điểm). Quét cả lịch — chỗ trùng ngày 25 vẫn
  // phải thấy khi đang xem hôm nay; khối Cần xử lý gom theo ngày, ngày sớm nhất đứng đầu.
  const clashes = useMemo(() => findPersonClashes(sessions, { from: today }), [sessions, today]);
  const clashBySession = useMemo(() => clashedSessionIds(clashes), [clashes]);
  const clashByDay = useMemo(() => {
    const m = new Map<string, { n: number; people: Set<string> }>();
    for (const c of clashes) {
      const x = m.get(c.session.date) ?? { n: 0, people: new Set<string>() };
      x.n += 1;
      if (c.talentName) x.people.add(c.talentName);
      m.set(c.session.date, x);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, x]) => ({ date, n: x.n, people: [...x.people] }));
  }, [clashes]);

  const todaySessions = useMemo(() => sessions.filter((s) => s.date === today && s.status !== "Cancelled" && !s.isBackfill), [sessions, today]);
  const matchFilter = (s: LiveSession, f: Filter) => (f === "nohost" ? !s.hostId : f === "noroom" ? !s.studioId : unackBySession.has(s.id));
  const counts: Record<Filter, number> = {
    nohost: todaySessions.filter((s) => matchFilter(s, "nohost")).length,
    noroom: todaySessions.filter((s) => matchFilter(s, "noroom")).length,
    unack: todaySessions.filter((s) => matchFilter(s, "unack")).length
  };

  const [from, to] = useMemo<[string, string]>(() => {
    if (range === "today") return [today, today];
    if (range === "tomorrow") return [addDays(today, 1), addDays(today, 1)];
    if (range === "past") return [addDays(today, -7), addDays(today, -1)];
    if (range === "week") { const mon = mondayOf(anchor); return [mon, addDays(mon, 6)]; }
    if (range === "drafts") return [today, "9999-12-31"];
    if (range === "backlog") return ["0000-01-01", "9999-12-31"];
    return [anchor, anchor];
  }, [range, anchor, today]);

  // Ops: mọi ca (session + slot mở chưa chốt + nháp) trong khoảng đang xem.
  const rows = useMemo<Row[]>(() => {
    const byTime = (a: Row, b: Row) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
    if (range === "backlog") {
      // Mới nhất trước: hôm qua là việc gấp nhất.
      return backlog.map<Row>((s) => ({ kind: "session", date: s.date, startTime: s.startTime, endTime: s.endTime, session: s })).sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));
    }
    const out: Row[] = [];
    for (const d of drafts) {
      if (d.date < from || d.date > to) continue;
      out.push({ kind: "draft", date: d.date, startTime: d.startTime, endTime: d.endTime, draft: d });
    }
    if (range === "drafts") return out.sort(byTime);
    for (const s of sessions) {
      if (s.date < from || s.date > to || s.isBackfill) continue;
      if (filter && !matchFilter(s, filter)) continue;
      out.push({ kind: "session", date: s.date, startTime: s.startTime, endTime: s.endTime, session: s });
    }
    if (!filter) {
      for (const sl of shiftSlots) {
        if (sl.date < from || sl.date > to || sl.status !== "open") continue;
        out.push({ kind: "slot", date: sl.date, startTime: sl.startTime, endTime: sl.endTime, slot: sl, registered: regsBySlot.get(sl.id) ?? 0 });
      }
    }
    return out.sort(byTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, shiftSlots, drafts, range, from, to, regsBySlot, backlog, filter, unackBySession]);

  // Tóm tắt khoảng đang xem: số ca + (sắp tới) kỳ vọng / (đã qua) GMV đã ghi nhận — TÁCH theo sàn, không cộng TikTok với Shopee (07/10).
  const summary = useMemo(() => {
    const ss = rows.filter((r): r is Extract<Row, { kind: "session" }> => r.kind === "session").map((r) => r.session);
    const exp: Record<ReportPlatform, number> = { TikTok: 0, Shopee: 0 };
    let expKnown = 0;
    if (expectedOf) {
      for (const r of rows) {
        if (r.kind === "draft") continue;
        const id = r.kind === "session" ? r.session.id : r.slot.id;
        if (r.kind === "session" && !isUpcoming(r.session, today)) continue;
        const v = expectedOf(id);
        if (typeof v === "number") {
          exp[r.kind === "session" ? platformOf(r.session) : platformOf(r.slot)] += v;
          expKnown += 1;
        }
      }
    }
    return {
      total: rows.filter((r) => r.kind !== "draft").length,
      noNumbers: ss.filter(isUnconfirmedPast).length,
      gmv: sumGmvByPlatform(ss),
      exp,
      expKnown
    };
  }, [rows, expectedOf, today]);

  const openSession = openId ? sessions.find((s) => s.id === openId) ?? null : null;

  const groupedByDay = (list: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of list) { const l = m.get(r.date) ?? []; l.push(r); m.set(r.date, l); }
    return [...m.entries()];
  };
  const winOf = (r: Extract<Row, { kind: "session" | "slot" }>): ShiftWindow =>
    r.kind === "session"
      ? { id: r.session.id, date: r.date, startTime: r.startTime, endTime: r.endTime, brandId: r.session.brandId, platform: platformOf(r.session), targetGmv: r.session.targetGmv }
      : { id: r.slot.id, date: r.date, startTime: r.startTime, endTime: r.endTime, brandId: r.slot.brandId ?? "", platform: platformOf(r.slot) };
  const showExpected = !!expectedOf;
  const toggle = (id: string) => (renderExpectDetail ? () => setExpandId((x) => (x === id ? null : id)) : undefined);
  const pastRange = range === "past" || range === "backlog";
  const emptyText =
    range === "backlog" ? "Không còn ca nào đã qua giờ mà chưa có số." :
    filter ? "Không có ca hôm nay khớp bộ lọc." :
    `Không có ca nào ${range === "today" ? "hôm nay" : range === "tomorrow" ? "ngày mai" : "trong khoảng này"}. Ca được mở từ Kế Hoạch Tháng hoặc nút "Mở ca chờ đăng ký" ở Lịch & Studio.`;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Radio}
        title="Bảng Vận Hành"
        description={view === "month" ? `Tháng ${Number(today.slice(5, 7))}: lập kế hoạch, cam kết giờ, thêm ca để kịp target, ai đang gánh nhiều giờ.` : "Việc cần xử lý trước, rồi lịch. Bấm vào ca để mở cửa sổ ca, mũi tên bên phải để xem kỳ vọng."}
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
            {view === "day" && (["past", "today", "tomorrow", "week", "day"] as Range[]).map((r) => (
              <button key={r} onClick={() => { setRange(r); setFilter(null); if (r === "today") setAnchor(today); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${range === r && !filter ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                {r === "past" ? "7 ngày qua" : r === "today" ? "Hôm nay" : r === "tomorrow" ? "Ngày mai" : r === "week" ? "Tuần" : "Ngày…"}
              </button>
            ))}
            {view === "day" && drafts.length > 0 && (
              <button onClick={() => { setRange("drafts"); setFilter(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${range === "drafts" ? "seg-on" : "border-amber-500/50 text-amber-300 hover:text-[var(--text)]"}`}>
                Ca nháp · {drafts.length}
              </button>
            )}
            {view === "day" && (range === "week" || range === "day") && (
              <div className="flex items-center gap-1">
                <button onClick={() => setAnchor(addDays(anchor, range === "week" ? -7 : -1))} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)]" aria-label="Lùi"><ChevronLeft className="w-4 h-4" /></button>
                <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text)]" />
                <button onClick={() => setAnchor(addDays(anchor, range === "week" ? 7 : 1))} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)]" aria-label="Tới"><ChevronRight className="w-4 h-4" /></button>
              </div>
            )}
          </>
        }
      />

      {monthSeen && monthView && <div hidden={view !== "month"} className="space-y-4">{monthView}</div>}
      {/* Cả hai chế độ giữ nguyên khi chuyển qua lại (ẩn bằng `hidden`) — không dựng lại việc cần làm / không tải lại dữ liệu.
          Thứ tự DOM = thứ tự màn hẹp: Cần xử lý → việc cần làm → danh sách ca. Màn rộng: việc cần làm là cột phải dính khi cuộn. */}
      {(
        <div hidden={view !== "day"} className={aside ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr] items-start" : "space-y-4"}>
            {isOps && (
              <div className="min-w-0 xl:col-start-1 xl:row-start-1">
              <NeedsQueue
                backlogByDay={backlogByDay}
                backlogTotal={backlog.length}
                clashByDay={clashByDay}
                counts={counts}
                today={today}
                range={range}
                filter={filter}
                onBacklog={() => { setFilter(null); setRange(range === "backlog" ? "today" : "backlog"); }}
                onDay={pickDay}
                onFilter={(f) => { setRange("today"); setFilter((x) => (x === f ? null : f)); }}
              />
              </div>
            )}
            {aside && <aside className="min-w-0 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-0">{aside}</aside>}
            <div className="min-w-0 xl:col-start-1 xl:row-start-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-2 sm:p-3 space-y-4">
              {range === "drafts" && rows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-2 sm:px-3 pt-1 text-xs text-[var(--text-muted)]">
                  <span>{rows.length} ca nháp từ sa bàn (chế độ Cả tháng). Bấm từng ca để sửa giờ, người, phòng rồi xác nhận thành ca.</span>
                  {onDismissDrafts && <button type="button" onClick={() => void onDismissDrafts(drafts.map((d) => d.id))} className="font-bold text-[var(--text-muted)] hover:text-rose-400 min-h-[28px]">Bỏ cả {drafts.length} ca nháp</button>}
                </div>
              )}
              {/* Tóm tắt một hàng ô không khung (thay 4 ô "Ca trong ngày / Chưa có người / Chưa giao ca / GMV" — 3 ô kia nay nằm ở khối Cần xử lý
                  và nhãn trên dòng ca). Không có ca thì không bày ô 0. */}
              {summary.total > 0 && range !== "drafts" && (
                <div className="flex flex-wrap gap-x-8 gap-y-2 px-2 sm:px-3 pt-1">
                  <StatTile frame="plain" size="sm" label={range === "backlog" ? "Ca chưa có số" : range === "today" ? "Ca hôm nay" : "Ca"} value={String(summary.total)} />
                  {pastRange
                    ? REPORT_PLATFORMS.filter((p) => summary.gmv[p] > 0).map((p) => <StatTile key={p} frame="plain" size="sm" label={`GMV đã ghi nhận ${p}`} value={fmtVndShort(summary.gmv[p])} />)
                    : summary.expKnown > 0 && REPORT_PLATFORMS.filter((p) => summary.exp[p] > 0).map((p) => <StatTile key={p} frame="plain" size="sm" label={`Kỳ vọng ${p}`} value={fmtVndShort(summary.exp[p])} />)}
                  {range === "past" && <StatTile frame="plain" size="sm" label="Chưa có số" value={String(summary.noNumbers)} tone={summary.noNumbers > 0 ? "text-rose-300" : "text-emerald-300"} />}
                </div>
              )}
              {rows.length === 0 && <p className="text-sm text-[var(--text-faint)] italic py-6 text-center">{emptyText}</p>}
              {groupedByDay(rows).map(([day, list]) => (
                <div key={day}>
                  {range !== "today" && range !== "tomorrow" && <p className={`px-2 sm:px-3 pb-1 text-xs font-black ${day === today ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"}`}>{fmtDay(day)}{day === today ? " · hôm nay" : ""}</p>}
                  <div className="divide-y divide-[var(--border-muted)]">
                    {list.map((r) => {
                      if (r.kind === "draft") return <DraftRow key={r.draft.id} d={r.draft} brand={brandById.get(r.draft.brandId)} hostName={talentName(r.draft.hostId)} coHostName={talentName(r.draft.coHostId)} onOpen={setOpenDraftId} />;
                      const id = r.kind === "session" ? r.session.id : r.slot.id;
                      const open = expandId === id;
                      const row =
                        r.kind === "session" ? (
                          <SessionRow
                            s={r.session}
                            brand={brandById.get(r.session.brandId)}
                            today={today}
                            clashWith={clashBySession.get(r.session.id)}
                            unackNames={filter === "unack" ? unackBySession.get(r.session.id)?.join(", ") : undefined}
                            expected={expectedOf?.(id)}
                            showExpected={showExpected}
                            open={open}
                            onOpen={setOpenId}
                            onToggle={toggle(id)}
                          />
                        ) : (
                          <SlotRow r={r} brand={r.slot.brandId ? brandById.get(r.slot.brandId) : undefined} expected={expectedOf?.(id)} showExpected={showExpected} open={open} onOpen={setOpenSlotId} onToggle={toggle(id)} />
                        );
                      return (
                        <React.Fragment key={id}>
                          {row}
                          {open && renderExpectDetail && <div className="px-2 sm:px-3 pb-3 pt-1 md:pl-[120px]">{renderExpectDetail(winOf(r))}</div>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              ))}
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
