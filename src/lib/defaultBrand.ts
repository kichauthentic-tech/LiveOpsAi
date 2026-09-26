// Brand mặc định cho các màn có ô chọn brand (Kế Hoạch Tháng, Hỗ Trợ Vận Hành, AI Training, Mở ca chờ
// đăng ký). Trước đây mọi màn lấy `brands[0]` — tức brand đứng đầu bảng chữ cái (Franklin, 0 ca) — nên
// mở ra là màn trống, lần nào cũng phải đổi tay sang brand đang chạy (audit UX 2026-09-26).
//
// Thứ tự ưu tiên: brand ops chọn lần gần nhất (còn tồn tại) → brand có ca gần nhất tính tới hôm nay
// → brands[0]. Ca tương lai không tính vào bước 2: một ca test mở trước cho brand mới không được kéo
// mặc định khỏi brand đang live thật.

import type { Brand, LiveSession } from "../types";

const STORAGE_KEY = "liveops_os_v2_lastBrandId";

export function pickDefaultBrandId(
  brands: Pick<Brand, "id">[],
  sessions: Pick<LiveSession, "brandId" | "date" | "status">[],
  remembered: string | null,
  today: string
): string {
  if (brands.length === 0) return "";
  const ids = new Set(brands.map((b) => b.id));
  if (remembered && ids.has(remembered)) return remembered;

  let best: { brandId: string; date: string } | null = null;
  for (const s of sessions) {
    if (s.status === "Cancelled" || !ids.has(s.brandId) || s.date > today) continue;
    if (!best || s.date > best.date) best = { brandId: s.brandId, date: s.date };
  }
  return best?.brandId ?? brands[0].id;
}

export function loadRememberedBrandId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberBrandId(brandId: string): void {
  if (!brandId) return;
  try {
    localStorage.setItem(STORAGE_KEY, brandId);
  } catch {
    // Chế độ ẩn danh/chặn storage: chỉ mất phần "nhớ", vẫn rơi về brand có ca gần nhất.
  }
}
