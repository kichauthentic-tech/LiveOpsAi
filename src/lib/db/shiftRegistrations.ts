import { supabase } from "../supabaseClient";
import { fetchAllPages } from "./fetchAllPages";
import { deltaSince, maxStamp, mergeDelta, type DeltaStore } from "./deltaTable";
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
export function __resetShiftRegistrationStore(): void {
  regStore = null;
  regScope = null;
}

const REG_SELECT = "id,slot_id,talent_id,registered_at";
const sortedRegs = (rows: Iterable<DbShiftRegistration>) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(fromDb);

/**
 * Nạp TRỌN (mở app). `talentId` có ⇒ chỉ đăng ký của talent đó: app talent chỉ dùng đăng ký CỦA MÌNH (tab Đăng ký ca, chấm đỏ,
 * cửa sổ slot "Đã đăng ký · Huỷ") — danh sách người khác đăng ký chỉ ops xem (SlotDetailModal `canManage`). Egress 22/11: talent
 * là phần lớn lượt mở app, mỗi lượt ~740 KB (3.800 dòng đợt T12) → vài KB. Nạp lại sau khi ghi thì dùng `refreshShiftRegistrations`
 * (giữ đúng phạm vi lượt nạp trọn gần nhất).
 */
export async function fetchShiftRegistrations(talentId?: string): Promise<ShiftRegistration[]> {
  const scope = talentId ?? null;
  // Một dòng cho mỗi lượt talent đăng ký ca — tăng theo số ca. Xem src/lib/db/fetchAllPages.ts.
  const rows = await fetchAllPages<DbShiftRegistration>((from, to) => {
    const q = supabase.from("session_availability").select(REG_SELECT);
    return (scope ? q.eq("talent_id", scope) : q).order("id", { ascending: true }).range(from, to).returns<DbShiftRegistration[]>();
  });
  regStore = { byId: new Map(rows.map((r) => [r.id, r])), mark: maxStamp(rows, (r) => r.registered_at) };
  regScope = scope;
  return rows.map(fromDb);
}

/** Nạp lại theo phần đã đổi (egress 22/11): ~740 KB → vài KB. Chưa có kho / số dòng lệch (có lượt huỷ đăng ký) ⇒ tải trọn. */
export async function refreshShiftRegistrations(): Promise<ShiftRegistration[]> {
  const base = regStore;
  const scope = regScope;
  if (!base) return fetchShiftRegistrations(scope ?? undefined);
  const since = deltaSince(base.mark);
  const [changed, head] = await Promise.all([
    fetchAllPages<DbShiftRegistration>((from, to) => {
      const q = supabase.from("session_availability").select(REG_SELECT).gt("registered_at", since);
      return (scope ? q.eq("talent_id", scope) : q).order("id", { ascending: true }).range(from, to).returns<DbShiftRegistration[]>();
    }),
    scope
      ? supabase.from("session_availability").select("id", { count: "exact", head: true }).eq("talent_id", scope)
      : supabase.from("session_availability").select("id", { count: "exact", head: true })
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
