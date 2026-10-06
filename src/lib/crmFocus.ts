import { platformOf } from "./reportPlatform";
// Nút "Sửa ở CRM" từ màn khác (Kế Hoạch Tháng, Toàn Cảnh Brand, Việc cần làm) mở thẳng khối "Hợp đồng & giá" của
// đúng brand × sàn. Một lần dùng: CRM đọc rồi xoá ngay khi mount — mở CRM từ menu thì không tự bung brand nào.
const KEY = "liveops_crm_focus";

export function requestCrmFocus(brandId: string, platform: "TikTok" | "Shopee" = "TikTok"): void {
  try {
    sessionStorage.setItem(KEY, `${brandId}|${platform}`);
  } catch {
    // Chặn storage: CRM mở như bình thường, chỉ mất bước tự bung.
  }
}

export function takeCrmFocus(): { brandId: string; platform: "TikTok" | "Shopee" } | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!v) return null;
    const [brandId, p] = v.split("|");
    return brandId ? { brandId, platform: platformOf({ platform: p }) } : null;
  } catch {
    return null;
  }
}
