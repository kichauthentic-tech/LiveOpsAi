// Tên hiển thị của talent ở chỗ hẹp (ô lịch, chip, lưới gán host).
// Ưu tiên nickname ops đặt (0087); không có thì cắt 2 từ cuối họ tên như cách cũ.
import { Talent } from "../types";

export const shortName = (full: string): string => full.trim().split(/\s+/).slice(-2).join(" ");

export function talentShortName(t: Pick<Talent, "name" | "nickname"> | undefined, fallbackFullName = ""): string {
  if (t?.nickname?.trim()) return t.nickname.trim();
  return shortName(t?.name ?? fallbackFullName);
}

// "Kim Vân · Nguyễn Thị Kim Vân" cho dropdown — đủ để phân biệt người trùng tên ngắn.
export function talentOptionLabel(t: Pick<Talent, "name" | "nickname">): string {
  const nick = t.nickname?.trim();
  return nick && nick !== t.name ? `${nick} · ${t.name}` : t.name;
}
