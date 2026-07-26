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
    map[row.role] = row.permissions;
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
