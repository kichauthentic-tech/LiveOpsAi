import type { LiveSession, SystemUser, Talent } from "../types";
import { isAliasEmail, loginLabel } from "./loginName";

// Đợt 3 lịch 2 sàn: cấp tài khoản cho host/trợ ĐÃ có hồ sơ (34+ hồ sơ thật nạp 19/09 không kèm tài khoản). Luồng "Thêm
// Tài Khoản Mới" cũ luôn tạo hồ sơ talent MỚI — tài khoản đó không thấy ca nào. Ở đây gắn tài khoản vào đúng hồ sơ cũ.

/** Kết quả cấp tài khoản cho một hồ sơ: có `password` (hiện một lần) hoặc `error`. */
export interface GrantResult {
  talentId: string;
  name: string;
  email: string;
  password?: string;
  error?: string;
}

export interface TalentWithoutAccount {
  talent: Talent;
  /** Số ca (chưa huỷ, không phải ca nạp file) từ hôm nay trở đi mà người này đứng host/trợ/một đoạn. */
  upcoming: number;
  /** Ngày ca gần nhất từ hôm nay ("" nếu không có). */
  nextDate: string;
}

function standsIn(s: LiveSession, talentId: string): boolean {
  return (
    s.hostId === talentId ||
    s.coHostId === talentId ||
    (s.staffSegments ?? []).some((g) => g.talentId === talentId)
  );
}

/** Hồ sơ talent chưa gắn tài khoản nào — người có nhiều ca sắp tới nhất lên đầu (cần tài khoản trước). */
export function talentsWithoutAccount(
  talents: Talent[],
  users: Pick<SystemUser, "assignedTalentId">[],
  sessions: LiveSession[],
  today: string
): TalentWithoutAccount[] {
  const linked = new Set(users.map((u) => u.assignedTalentId).filter(Boolean));
  const ahead = sessions.filter((s) => s.date >= today && s.status !== "Cancelled" && !s.isBackfill);
  return talents
    .filter((t) => !linked.has(t.id) && !t.profileId)
    .map((t) => {
      const mine = ahead.filter((s) => standsIn(s, t.id));
      const nextDate = mine.reduce((min, s) => (min === "" || s.date < min ? s.date : min), "");
      return { talent: t, upcoming: mine.length, nextDate };
    })
    .sort((a, b) => b.upcoming - a.upcoming || a.talent.name.localeCompare(b.talent.name, "vi"));
}

/** Lời nhắn dán Zalo sau khi cấp tài khoản / đặt lại mật khẩu. Mật khẩu chỉ hiện một lần, lần đăng nhập tới bị bắt đổi.
 *  Tài khoản chưa có email (lib/loginName.ts) ⇒ ghi "Tên đăng nhập" thay cho email. */
export function credentialMessage(name: string, email: string, password: string, appUrl: string, kind: "new" | "reset" = "new"): string {
  const login = isAliasEmail(email) ? `• Tên đăng nhập: ${loginLabel(email)}` : `• Email: ${email}`;
  return [
    kind === "new" ? `Chào ${name}, đây là tài khoản LiveOps của bạn:` : `Chào ${name}, mật khẩu LiveOps của bạn đã được đặt lại:`,
    `• Mở: ${appUrl}`,
    login,
    `• Mật khẩu tạm: ${password}`,
    kind === "new"
      ? `Lần đầu đăng nhập app sẽ bắt đổi mật khẩu. Vào "Ca Của Tôi" để xem lịch; hết ca thì mở ca → Giao ca.`
      : `Đăng nhập xong app sẽ bắt đổi mật khẩu mới.`
  ].join("\n");
}
