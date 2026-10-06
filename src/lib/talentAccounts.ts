import type { LiveSession, SystemUser, Talent } from "../types";

// Đợt 3 lịch 2 sàn: cấp tài khoản cho host/trợ ĐÃ có hồ sơ (34+ hồ sơ thật nạp 19/09 không kèm tài khoản). Luồng "Thêm
// Tài Khoản Mới" cũ luôn tạo hồ sơ talent MỚI — tài khoản đó không thấy ca nào. Ở đây gắn tài khoản vào đúng hồ sơ cũ.

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

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Lời nhắn dán Zalo cho host/trợ sau khi cấp tài khoản. Mật khẩu chỉ hiện một lần, lần đầu đăng nhập bị bắt đổi. */
export function credentialMessage(name: string, email: string, password: string, appUrl: string): string {
  return [
    `Chào ${name}, đây là tài khoản LiveOps của bạn:`,
    `• Mở: ${appUrl}`,
    `• Email: ${email}`,
    `• Mật khẩu tạm: ${password}`,
    `Lần đầu đăng nhập app sẽ bắt đổi mật khẩu. Vào "Ca Của Tôi" để xem lịch; hết ca thì mở ca → Giao ca.`
  ].join("\n");
}
