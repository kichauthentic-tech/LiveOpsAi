import { personClash, studioClash } from "../scheduling/conflicts";
import { LiveSession, ShiftRegistration, ShiftSlot } from "../../types";
import { dateTimeRangesOverlap } from "../dateUtils";
import { FATIGUE_WEEK_HOURS, HostSuggestion, mondayOf, suggestHosts } from "./hostSuggestion";
import { sessionDurationHours } from "../pnl";
import { platformOf } from "../reportPlatform";

// Chốt lịch hàng loạt (điểm nghẽn #3 của audit module Vận Hành Live). Không phải vòng lặp gọi
// onFinalizeSlot nhiều lần — có một cái bẫy bắt buộc phải xử ở đây:
//
// `checkConflicts()` trong ShiftScheduling chỉ đối chiếu với `sessions` ĐÃ TỒN TẠI. Trong một mẻ
// chốt hàng loạt thì chưa ca nào trong mẻ được tạo cả, nên nếu tự chọn cùng một host giỏi nhất cho
// 5 ca trùng giờ thì cả 5 đều "không trùng" khi xét riêng lẻ, rồi chốt xong mới lòi ra một người
// bị xếp 5 ca cùng lúc. Vì vậy planner dưới đây giữ sổ riêng những gì MẺ NÀY đã gán, và xét trùng
// trên cả hai nguồn.
//
// Nguyên tắc: planner chỉ ĐỀ XUẤT. Mọi dòng đều hiện ra cho ops sửa/bỏ tick trước khi bấm chốt —
// không bao giờ tự chốt ngầm.

export interface BulkConflicts {
  // Trùng với ca đã tồn tại trong hệ thống.
  hostExisting: boolean;
  coHostExisting: boolean;
  studioExisting: boolean;
  // Trùng với một dòng khác trong chính mẻ này.
  hostInBatch: boolean;
  coHostInBatch: boolean;
  studioInBatch: boolean;
}

export interface BulkPlanRow {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  brandName: string;
  brandId?: string;
  studioId?: string;
  studioName: string;
  candidates: HostSuggestion[];
  hostId: string; // "" = chưa gán được ai
  coHostId: string;
  include: boolean;
  conflicts: BulkConflicts;
  // true = planner không tìm được ai rảnh trong số người đã đăng ký ca này.
  noFreeCandidate: boolean;
}

export function hasAnyConflict(c: BulkConflicts): boolean {
  return c.hostExisting || c.coHostExisting || c.studioExisting || c.hostInBatch || c.coHostInBatch || c.studioInBatch;
}

// Ca mở, chưa tới ngày, và có ít nhất 1 người đăng ký. Ca chưa ai đăng ký thì không có gì để chốt.
export function eligibleSlots(
  slots: ShiftSlot[],
  registrationsBySlot: Map<string, ShiftRegistration[]>,
  month: string, // "YYYY-MM"
  today: string
): ShiftSlot[] {
  return slots
    .filter(
      (s) =>
        s.status === "open" &&
        s.date.startsWith(month) &&
        s.date >= today &&
        (registrationsBySlot.get(s.id) ?? []).length > 0
    )
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

// Nhận đúng 4 trường cần dùng thay vì cả ShiftSlot, để recheckPlan() truyền thẳng BulkPlanRow vào
// được mà không phải dựng lại một ShiftSlot giả.
type TimeWindow = Pick<ShiftSlot, "date" | "startTime" | "endTime" | "studioId">;

function conflictsWithExisting(
  sessions: LiveSession[],
  slot: TimeWindow,
  hostId: string,
  coHostId: string
): { host: boolean; coHost: boolean; studio: boolean } {
  // Luật trùng chung (lib/scheduling/conflicts.ts) — áp cho CẢ HAI vai. Bản trước chỉ truyền host vào
  // đây, đúng lỗi mà audit 2026-09-28 mục 8 đã vá cho popup ca chờ/Cửa sổ ca nhưng bỏ sót cửa này:
  // `personClash` vốn đã xét cả vai Trợ live của ca bên kia, cái thiếu là không ai hỏi nó về Trợ live
  // của ca BÊN NÀY. Phòng chỉ xét ca đã chốt: ca chờ đăng ký cùng phòng là chính các ca đang chốt
  // trong mẻ, sổ BatchLedger lo phần đó.
  const host = !!personClash(sessions, slot, hostId || undefined);
  const coHost = !!personClash(sessions, slot, coHostId || undefined);
  const studio = !!studioClash(sessions, [], slot);
  return { host, coHost, studio };
}

// Những gì mẻ này đã gán, để dòng sau không giẫm lên dòng trước.
interface BatchLedger {
  // talentId -> các khung giờ đã bị chiếm
  byTalent: Map<string, { date: string; startTime: string; endTime: string }[]>;
  byStudio: Map<string, { date: string; startTime: string; endTime: string }[]>;
  // "talentId|thứ-hai-của-tuần" -> giờ đã gán trong mẻ. `weekHours` từ suggestHosts chỉ đếm ca ĐÃ
  // TỒN TẠI; không cộng sổ này thì một người có thể nhận 30h trong một lần bấm mà không ai bị coi
  // là mệt.
  weekHoursByTalent: Map<string, number>;
}

const weekKey = (talentId: string, date: string) => `${talentId}|${mondayOf(date)}`;

function busyInBatch(
  ledger: Map<string, { date: string; startTime: string; endTime: string }[]>,
  key: string,
  slot: TimeWindow
): boolean {
  for (const t of ledger.get(key) ?? []) {
    if (dateTimeRangesOverlap(t, slot)) return true;
  }
  return false;
}

function claim(
  ledger: Map<string, { date: string; startTime: string; endTime: string }[]>,
  key: string,
  slot: TimeWindow
): void {
  const list = ledger.get(key) ?? [];
  list.push({ date: slot.date, startTime: slot.startTime, endTime: slot.endTime });
  ledger.set(key, list);
}

export interface PlanOptions {
  perfSince?: string;
  today: string;
  month: string;
  fatigueWeekHours?: number; // mặc định FATIGUE_WEEK_HOURS; admin vặn trong AI Training Center
}

// Xếp tham lam theo thứ tự thời gian: mỗi ca lấy người xếp hạng cao nhất mà chưa bận — bận theo ca
// đã tồn tại HOẶC theo dòng khác trong mẻ. Tham lam chứ không tối ưu toàn cục: ops còn sửa tay
// được, và một thuật toán "tối ưu" mà ops không đoán được nó nghĩ gì thì tệ hơn là tốt.
export function planBulkFinalize(
  slots: ShiftSlot[],
  registrationsBySlot: Map<string, ShiftRegistration[]>,
  sessions: LiveSession[],
  talentNameById: Map<string, string>,
  opts: PlanOptions
): BulkPlanRow[] {
  const eligible = eligibleSlots(slots, registrationsBySlot, opts.month, opts.today);
  const ledger: BatchLedger = { byTalent: new Map(), byStudio: new Map(), weekHoursByTalent: new Map() };
  const rows: BulkPlanRow[] = [];

  for (const slot of eligible) {
    const regs = registrationsBySlot.get(slot.id) ?? [];
    const candidates = suggestHosts(
      regs.map((r) => r.talentId),
      talentNameById,
      sessions,
      slot.brandId,
      new Date(`${slot.date}T00:00:00`).getDay(),
      opts.perfSince,
      { date: slot.date, startTime: slot.startTime, endTime: slot.endTime, platform: platformOf(slot) }
    );

    // Người đầu tiên (theo xếp hạng) mà không bận ở khung giờ này. Giai đoạn D: người đã quá ngưỡng
    // giờ/tuần (ca đã có + ca mẻ này vừa gán) bị đẩy xuống cuối hàng — vẫn được chọn nếu không còn ai.
    const slotHours = sessionDurationHours(slot.startTime, slot.endTime);
    const fatigueAt = opts.fatigueWeekHours ?? FATIGUE_WEEK_HOURS;
    const tired = (c: HostSuggestion) =>
      c.weekHours + (ledger.weekHoursByTalent.get(weekKey(c.talentId, slot.date)) ?? 0) + slotHours > fatigueAt;
    const ordered = [...candidates].sort((a, b) => Number(tired(a)) - Number(tired(b)));
    const free = ordered.find(
      (c) =>
        !conflictsWithExisting(sessions, slot, c.talentId, "").host &&
        !busyInBatch(ledger.byTalent, c.talentId, slot)
    );
    const hostId = free?.talentId ?? "";

    if (hostId) {
      claim(ledger.byTalent, hostId, slot);
      const wk = weekKey(hostId, slot.date);
      ledger.weekHoursByTalent.set(wk, (ledger.weekHoursByTalent.get(wk) ?? 0) + slotHours);
    }
    // Studio bị chiếm theo ca chứ không theo người — claim kể cả khi chưa gán được host, vì ca vẫn
    // sẽ dùng phòng đó nếu ops tự chọn người sau.
    const studioBusyInBatch = slot.studioId ? busyInBatch(ledger.byStudio, slot.studioId, slot) : false;
    if (slot.studioId) claim(ledger.byStudio, slot.studioId, slot);

    // Planner không bao giờ tự gán Trợ live (`coHostId: ""`) — ops chọn tay, và `recheckPlan` chạy
    // sau mỗi lần chọn mới là nơi kiểm. Ở đây 2 cờ coHost* luôn false, đúng trạng thái.
    const existing = conflictsWithExisting(sessions, slot, hostId, "");

    rows.push({
      slotId: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      brandName: slot.brandName,
      brandId: slot.brandId,
      studioId: slot.studioId,
      studioName: slot.studioName,
      candidates,
      hostId,
      coHostId: "",
      // Ca không gán được ai, hoặc có trùng lịch, thì KHÔNG tự tick — ops phải chủ động xử.
      include: hostId !== "" && !existing.host && !existing.studio && !studioBusyInBatch,
      conflicts: {
        hostExisting: existing.host,
        coHostExisting: false,
        studioExisting: existing.studio,
        hostInBatch: false,
        coHostInBatch: false,
        studioInBatch: studioBusyInBatch
      },
      noFreeCandidate: hostId === "" && candidates.length > 0
    });
  }

  return rows;
}

// Tính lại toàn bộ cờ trùng sau khi ops sửa tay (đổi host, bỏ tick, đổi trợ live). Phải quét lại
// cả mẻ chứ không sửa cục bộ: đổi 1 dòng có thể giải phóng hoặc gây trùng ở dòng bất kỳ khác.
// Chỉ các dòng ĐANG ĐƯỢC TICK mới tính vào trùng-trong-mẻ — dòng đã bỏ tick sẽ không được chốt
// nên không chiếm chỗ của ai.
//
// Sổ trong mẻ khoá theo NGƯỜI, không theo vai: bản trước khoá theo `hostId` nên "An làm Host ca 9–11
// và Trợ live ca 10–12" đi qua sạch cả hai cổng, trong khi luật chung của conflicts.ts nói rõ một
// người bận nếu đang là Host HOẶC Trợ live của ca chồng giờ. Mỗi dòng gửi tối đa 2 lượt đặt chỗ
// (Host + Trợ live) vào cùng một sổ, và cờ được gắn cho đúng vai của từng bên.
type BatchRole = "host" | "coHost";

export function recheckPlan(rows: BulkPlanRow[], sessions: LiveSession[]): BulkPlanRow[] {
  const personSeen = new Map<string, { row: BulkPlanRow; role: BatchRole }[]>();
  const studioSeen = new Map<string, BulkPlanRow[]>();

  const out = rows.map((r) => {
    const existing = conflictsWithExisting(sessions, r, r.hostId, r.coHostId);
    return {
      ...r,
      conflicts: {
        hostExisting: existing.host,
        coHostExisting: existing.coHost,
        studioExisting: existing.studio,
        hostInBatch: false,
        coHostInBatch: false,
        studioInBatch: false
      }
    };
  });

  const flag = (r: BulkPlanRow, role: BatchRole) => {
    if (role === "host") r.conflicts.hostInBatch = true;
    else r.conflicts.coHostInBatch = true;
  };

  for (const r of out) {
    if (!r.include) continue;
    // Một người không làm được 2 vai trong CÙNG một ca. Đo trên harness 2026-10-01: UI hiện ĐÃ chặn
    // cả hai chiều (đổi Host trùng Trợ live thì onChange xoá Trợ live; dropdown Trợ live lọc bỏ đúng
    // Host nên không chọn ngược lại được) ⇒ nhánh này là lớp phòng thủ cho người gọi khác, KHÔNG phải
    // lỗ đang hở. Giữ vì `BulkPlanRow` cho phép dựng trạng thái đó và hàm này là nơi duy nhất gác.
    if (r.hostId && r.hostId === r.coHostId) r.conflicts.coHostInBatch = true;

    for (const role of ["host", "coHost"] as const) {
      const talentId = role === "host" ? r.hostId : r.coHostId;
      if (!talentId) continue;
      const peers = personSeen.get(talentId) ?? [];
      for (const p of peers) {
        if (p.row === r) continue; // hai vai của chính dòng này — đã xử ở trên
        if (dateTimeRangesOverlap(p.row, r)) {
          flag(r, role);
          flag(p.row, p.role);
        }
      }
      peers.push({ row: r, role });
      personSeen.set(talentId, peers);
    }

    if (r.studioId) {
      const peers = studioSeen.get(r.studioId) ?? [];
      for (const p of peers) {
        if (dateTimeRangesOverlap(p, r)) {
          r.conflicts.studioInBatch = true;
          p.conflicts.studioInBatch = true;
        }
      }
      peers.push(r);
      studioSeen.set(r.studioId, peers);
    }
  }

  return out;
}

// Dòng thật sự sẽ được gửi đi chốt: có tick, có host, và không vướng trùng nào.
export function rowsReadyToFinalize(rows: BulkPlanRow[]): BulkPlanRow[] {
  return rows.filter((r) => r.include && r.hostId !== "" && !hasAnyConflict(r.conflicts));
}
