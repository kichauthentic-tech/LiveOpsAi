import { supabase } from "../supabaseClient";
import { fetchAllPages } from "./fetchAllPages";
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
export async function fetchShiftRegistrations(): Promise<ShiftRegistration[]> {
  // Một dòng cho mỗi lượt talent đăng ký ca — tăng theo số ca. Xem src/lib/db/fetchAllPages.ts.
  const rows = await fetchAllPages<DbShiftRegistration>((from, to) =>
    supabase.from("session_availability").select("*").order("id", { ascending: true }).range(from, to)
  );
  return rows.map(fromDb);
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
