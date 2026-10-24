import { supabase } from "../supabaseClient";
import { UserRole, PermissionKey, RolePermissionsMap } from "../../types";

interface DbRolePermissionRow {
  role: UserRole;
  permissions: Record<PermissionKey, boolean>;
}

export async function fetchRolePermissions(): Promise<RolePermissionsMap> {
  const { data, error } = await supabase.from("role_permissions").select("*");
  if (error) throw error;
  const map = {} as RolePermissionsMap;
  for (const row of data as DbRolePermissionRow[]) {
    // DB chưa chạy 0180 thì chưa có key manage_month_plan — Kế Hoạch Tháng đi theo manage_sessions như trước, OP không mất màn.
    const p = { ...row.permissions };
    if (p.manage_month_plan === undefined) p.manage_month_plan = !!p.manage_sessions;
    map[row.role] = p;
  }
  return map;
}

export async function updateRolePermissions(newMap: RolePermissionsMap): Promise<RolePermissionsMap> {
  const rows: DbRolePermissionRow[] = (Object.keys(newMap) as UserRole[]).map((role) => ({
    role,
    permissions: newMap[role]
  }));
  const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role" });
  if (error) throw error;
  return fetchRolePermissions();
}
