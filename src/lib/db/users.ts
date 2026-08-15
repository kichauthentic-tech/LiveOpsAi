import { supabase } from "../supabaseClient";
import { PermissionKey, SystemUser, UserRole } from "../../types";

interface DbProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  custom_role_title: string;
  avatar: string;
  status: SystemUser["status"];
  assigned_brand_id: string | null;
  assigned_talent_id: string | null;
  last_login: string | null;
  custom_permission_overrides: Partial<Record<PermissionKey, boolean>> | null;
}

function fromDb(row: DbProfile): SystemUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    customRoleTitle: row.custom_role_title,
    avatar: row.avatar,
    status: row.status,
    assignedBrandId: row.assigned_brand_id ?? undefined,
    assignedTalentId: row.assigned_talent_id ?? undefined,
    lastLogin: row.last_login ?? "",
    customPermissionOverrides: row.custom_permission_overrides ?? undefined
  };
}

export async function fetchUsers(): Promise<SystemUser[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbProfile[]).map(fromDb);
}

// Profile fields only — auth account (email/password) is managed separately via the
// server-side admin API (see inviteUser/deleteUserAccount below), since the anon key
// cannot touch auth.users.
export async function updateUserProfile(u: SystemUser): Promise<SystemUser> {
  const patch: Record<string, unknown> = {
    name: u.name,
    role: u.role,
    custom_role_title: u.customRoleTitle,
    status: u.status,
    assigned_brand_id: u.assignedBrandId || null,
    assigned_talent_id: u.assignedTalentId || null
  };
  // `customPermissionOverrides` is optional on SystemUser, so `undefined` is ambiguous — it could
  // mean "no overrides" or just "this caller didn't build that field". Only touch the column when
  // the caller explicitly set it (an empty object IS sent — that's a deliberate "clear all
  // overrides" — but a plain `undefined` leaves the existing DB value alone instead of wiping it).
  if (u.customPermissionOverrides !== undefined) {
    patch.custom_permission_overrides = u.customPermissionOverrides;
  }
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", u.id).select().single();
  if (error) throw error;
  return fromDb(data as DbProfile);
}

export interface NewTalentProfilePayload {
  name: string;
  phone: string;
  role: "Host" | "KOC" | "KOL" | "MC";
  gender: string;
  niches: string[];
}

export interface InviteUserPayload {
  name: string;
  email: string;
  role: UserRole;
  customRoleTitle: string;
  assignedBrandId?: string;
  assignedTalentId?: string;
  // Đảo chiều luồng tạo talent: khi role="talent" và không chọn assignedTalentId có sẵn,
  // gửi thông tin cơ bản này để server tự tạo hồ sơ Talent Pool + link 2 chiều luôn.
  newTalentProfile?: NewTalentProfilePayload;
}

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token ?? ""}`
    }
  });
}

// Creating a real login account requires Supabase's admin API (service role key),
// which must never be exposed to the browser — the request is proxied through our
// own Express server (see server.ts `/api/admin/users/invite`), which verifies the
// caller is a signed-in `ceo` before calling `auth.admin.inviteUserByEmail`.
export async function inviteUser(payload: InviteUserPayload): Promise<void> {
  const res = await authedFetch("/api/admin/users/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Không thể tạo tài khoản mới.");
  }
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const res = await authedFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Không thể xóa tài khoản.");
  }
}
