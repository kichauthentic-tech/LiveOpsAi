// Tài khoản chưa có email (user chốt 06/10: cấp tài khoản cho host/trợ trước, bổ sung email sau). Supabase Auth đăng nhập bằng
// email, nên tài khoản như vậy mang một email NỘI BỘ `<tên đăng nhập>@liveops.invalid` — đuôi `.invalid` (RFC 2606) không bao giờ
// gửi thư được. Ô đăng nhập nhận tên trần ("thaitoan") và tự ghép đuôi. Có email thật thì admin bấm "Thêm email" (Phân Quyền &
// Role) ⇒ đổi sang email thật; trigger `sync_profile_email` (0047) chép sang profiles.email. Quên mật khẩu khi chưa có email:
// admin bấm "Đặt lại mật khẩu", không gửi thư (gửi tới địa chỉ không tồn tại chỉ làm hỏng uy tín gửi thư của Supabase).
// Dùng chung client + server (src/server/createApp.ts).

export const LOGIN_ALIAS_DOMAIN = "liveops.invalid";
const LOGIN_NAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function isLoginName(s: string): boolean {
  return LOGIN_NAME_RE.test(s.trim().toLowerCase());
}

export function aliasEmail(loginName: string): string {
  return `${loginName.trim().toLowerCase()}@${LOGIN_ALIAS_DOMAIN}`;
}

export function isAliasEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(`@${LOGIN_ALIAS_DOMAIN}`);
}

/** Cách hiện tài khoản: email thật giữ nguyên, email nội bộ ⇒ tên đăng nhập. */
export function loginLabel(email: string): string {
  return isAliasEmail(email) ? email.slice(0, email.lastIndexOf("@")) : email;
}

/** Ô đăng nhập: có "@" ⇒ email; không có ⇒ tên đăng nhập ⇒ email nội bộ. */
export function loginIdentifierToEmail(input: string): string {
  const s = input.trim();
  return s.includes("@") ? s : aliasEmail(s);
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** "Huỳnh Thái Toàn" ⇒ "thaitoan" (hai chữ cuối, cách người trong đội gọi nhau); trùng thì thêm số: "thaitoan2". */
export function suggestLoginName(fullName: string, takenEmails: string[]): string {
  const words = fullName.trim().split(/\s+/).map(slug).filter(Boolean);
  let base = words.slice(-2).join("") || "host";
  if (base.length < 3) base = words.join("").padEnd(3, "0");
  base = base.slice(0, 26);
  const taken = new Set(takenEmails.map((e) => e.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}${n}`;
    if (!taken.has(aliasEmail(name))) return name;
  }
}

/** Ô "Email hoặc tên đăng nhập" khi cấp tài khoản: trống ⇒ tên gợi ý; có "@" ⇒ email thật; còn lại ⇒ tên đăng nhập tự gõ. */
export function resolveLoginInput(input: string, suggested: string): { email: string } | { error: string } {
  const s = input.trim().toLowerCase();
  if (s === "") return { email: aliasEmail(suggested) };
  if (s.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { error: "Email chưa đúng dạng (vd: ten@gmail.com)." };
    if (isAliasEmail(s)) return { error: "Gõ tên đăng nhập trần (không kèm @), hoặc email thật." };
    return { email: s };
  }
  if (!isLoginName(s)) return { error: "Tên đăng nhập chỉ gồm chữ không dấu, số, dấu . _ - (3–30 ký tự)." };
  return { email: aliasEmail(s) };
}
