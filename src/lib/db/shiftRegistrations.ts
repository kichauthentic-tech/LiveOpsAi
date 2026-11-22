import { supabase } from "../supabaseClient";
import { fetchAllPages } from "./fetchAllPages";
import { deltaSince, maxStamp, mergeDelta, type DeltaStore } from "./deltaTable";
import { getTodayDate } from "../dateUtils";
import { ShiftRegistration } from "../../types";

interface DbShiftRegistration {
  id: string;
  slot_id: string;
  talent_id: string;
  registered_at: string;
}

function fromDb(row: DbShiftRegistration): ShiftRegistration {
  return {
    id: row.id,
    slotId: row.slot_id,
    talentId: row.talent_id,
    registeredAt: row.registered_at
  };
}

// Presence/absence of a row is the whole model — no update, only insert
// ("đăng ký") and delete ("hủy đăng ký"), same shape as auditLogs.ts.
// Kho thô cho lượt nạp lại theo phần đã đổi (deltaTable.ts). Bảng chỉ thêm/xoá, không sửa ⇒ dấu = registered_at (default now()):
// dòng thêm có dấu mới, dòng xoá lộ ra ở số dòng lệch ⇒ tải trọn.
let regStore: DeltaStore<DbShiftRegistration> | null = null;
// Phạm vi của kho: null = mọi đăng ký (ops/trainer/brand); id talent = chỉ đăng ký của talent đó (egress 22/11).
let regScope: string | null = null;
// Cửa sổ của kho (ngày slot nhỏ nhất). Sang tháng mới ⇒ cửa sổ đổi ⇒ tải trọn lại.
let regFrom: string | null = null;
export function __resetShiftRegistrationStore(): void {
  regStore = null;
  regScope = null;
  regFrom = null;
}

/**
 * Cửa sổ đăng ký ca (egress 22/11): chỉ đăng ký của slot từ ĐẦU THÁNG TRƯỚC trở đi. Đăng ký chỉ có nghĩa với slot đang xếp / đã xếp
 * gần đây (Điều Phối, Đăng ký ca, lịch, Bảng Vận Hành đều đọc theo tuần/tháng hiện tại trở đi); bảng tăng ~3.800 dòng mỗi tháng và
 * trước đây đọc trọn mỗi lần mở app. Lùi Điều Phối về 2 tháng trước sẽ không còn thấy "báo rảnh" — có chủ ý.
 */
export function registrationWindowStart(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}-01`;
}

// `shift_slots!inner()` = embed RỖNG: lọc theo ngày slot mà không trả thêm cột nào (PostgREST ≥ 12; đã thử trên DB thật).
const REG_SELECT = "id,slot_id,talent_id,registered_at,shift_slots!inner()";
const sortedRegs = (rows: Iterable<DbShiftRegistration>) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(fromDb);

/**
 * Nạp TRỌN (mở app). `talentId` có ⇒ chỉ đăng ký của talent đó: app talent chỉ dùng đăng ký CỦA MÌNH (tab Đăng ký ca, chấm đỏ,
 * cửa sổ slot "Đã đăng ký · Huỷ") — danh sách người khác đăng ký chỉ ops xem (SlotDetailModal `canManage`). Egress 22/11: talent
 * là phần lớn lượt mở app, mỗi lượt ~740 KB (3.800 dòng đợt T12) → vài KB. Nạp lại sau khi ghi thì dùng `refreshShiftRegistrations`
 * (giữ đúng phạm vi lượt nạp trọn gần nhất).
 */
export async function fetchShiftRegistrations(talentId?: string): Promise<ShiftRegistration[]> {
  const scope = talentId ?? null;
  const windowFrom = registrationWindowStart(getTodayDate());
  // Một dòng cho mỗi lượt talent đăng ký ca — tăng theo số ca. Xem src/lib/db/fetchAllPages.ts.
  const rows = await fetchAllPages<DbShiftRegistration>((from, to) => {
    const q = supabase.from("session_availability").select(REG_SELECT).gte("shift_slots.date", windowFrom);
    return (scope ? q.eq("talent_id", scope) : q).order("id", { ascending: true }).range(from, to).returns<DbShiftRegistration[]>();
  });
  regStore = { byId: new Map(rows.map((r) => [r.id, r])), mark: maxStamp(rows, (r) => r.registered_at) };
  regScope = scope;
  regFrom = windowFrom;
  return rows.map(fromDb);
}

/** Nạp lại theo phần đã đổi (egress 22/11): ~740 KB → vài KB. Chưa có kho / số dòng lệch (có lượt huỷ đăng ký) ⇒ tải trọn. */
export async function refreshShiftRegistrations(): Promise<ShiftRegistration[]> {
  const base = regStore;
  const scope = regScope;
  const windowFrom = registrationWindowStart(getTodayDate());
  if (!base || regFrom !== windowFrom) return fetchShiftRegistrations(scope ?? undefined);
  const since = deltaSince(base.mark);
  // Đếm cùng cửa sổ: slot dời ngày qua mép cửa sổ (đăng ký không đổi dấu) cũng lộ ra ở số dòng lệch ⇒ tải trọn.
  const counted = supabase.from("session_availability").select("id,shift_slots!inner()", { count: "exact", head: true }).gte("shift_slots.date", windowFrom);
  const [changed, head] = await Promise.all([
    fetchAllPages<DbShiftRegistration>((from, to) => {
      const q = supabase.from("session_availability").select(REG_SELECT).gte("shift_slots.date", windowFrom).gt("registered_at", since);
      return (scope ? q.eq("talent_id", scope) : q).order("id", { ascending: true }).range(from, to).returns<DbShiftRegistration[]>();
    }),
    scope ? counted.eq("talent_id", scope) : counted
  ]);
  if (head.error) throw head.error;
  const next = mergeDelta(base, changed, head.count, (r) => r.registered_at, (r) => r);
  if (!next || regStore !== base) return fetchShiftRegistrations(scope ?? undefined);
  regStore = next;
  return sortedRegs(next.byId.values());
}

export async function registerForSlot(slotId: string, talentId: string): Promise<ShiftRegistration> {
  const { data, error } = await supabase
    .from("session_availability")
    .insert({ slot_id: slotId, talent_id: talentId })
    .select()
    .single();
  // 0133: talent chỉ đăng ký được ca CÒN MỞ, chưa qua ngày — RLS từ chối thì nói bằng lời của nghiệp vụ.
  if (error?.code === "42501") throw new Error("Ca này không còn nhận đăng ký (đã chốt người, đã huỷ hoặc đã qua ngày) — tải lại trang để thấy trạng thái mới.");
  if (error) throw error;
  return fromDb(data as DbShiftRegistration);
}

export async function unregisterFromSlot(slotId: string, talentId: string): Promise<void> {
  const { data, error } = await supabase
    .from("session_availability")
    .delete()
    .eq("slot_id", slotId)
    .eq("talent_id", talentId)
    .select("id");
  if (error) throw error;
  // 0133: ca đã chốt người/huỷ thì RLS lọc mất dòng (0 dòng, không lỗi) — đăng ký lúc đó chỉ còn là lịch sử.
  if (((data as unknown[]) ?? []).length === 0) throw new Error("Ca này đã chốt người hoặc đã huỷ — không huỷ đăng ký được nữa. Không đi được thì báo ops ở Cửa sổ Ca Live.");
}
