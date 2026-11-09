// Khoá tab "Tôi" (rate + thu nhập) của app talent — 09/11.
// Bối cảnh: host/trợ dùng chung PC công ty; người trước quên đăng xuất thì người sau mở app là thấy rate và thu nhập của họ.
// Cách chặn: vào tab Tôi phải nhập lại mật khẩu của CHÍNH tài khoản đang đăng nhập; mở khoá chỉ sống trong bộ nhớ trang
// (rời tab / tải lại / đăng xuất là khoá lại) và tự khoá sau một quãng không thao tác.
// Đây là khoá giao diện chống người ngồi sau ở cùng máy, không phải rào ở DB (xem WORKSPACE_DESIGN §1, mục 09/11).

/** Không thao tác trong bao lâu thì khoá lại. */
export const RATE_LOCK_IDLE_MS = 3 * 60 * 1000;

/** Số lần nhập sai liên tiếp trước khi bắt chờ, và thời gian chờ. */
export const RATE_LOCK_MAX_TRIES = 3;
export const RATE_LOCK_COOLDOWN_MS = 30 * 1000;

/** `lastActiveAt` = lúc thao tác gần nhất sau khi mở khoá; null = đang khoá. */
export function isRateUnlocked(lastActiveAt: number | null, now: number, idleMs: number = RATE_LOCK_IDLE_MS): boolean {
  return lastActiveAt !== null && now - lastActiveAt < idleMs;
}

/** Số giây còn phải chờ sau khi sai quá số lần cho phép (0 = được nhập). */
export function cooldownLeftSec(failedTries: number, lastFailAt: number | null, now: number): number {
  if (failedTries < RATE_LOCK_MAX_TRIES || lastFailAt === null) return 0;
  const left = RATE_LOCK_COOLDOWN_MS - (now - lastFailAt);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
