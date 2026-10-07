import tiktokLogo from "../assets/platforms/tiktok.png";
import shopeeLogo from "../assets/platforms/shopee.png";

// Logo ảnh của sàn (TikTok / Shopee) — dùng thay chữ tên sàn trên các lịch (ui/PlatformLogo). Cả hai file đã là
// ô vuông bo góc có nền riêng (TikTok đen, Shopee cam) nên vẽ kín ô, không cần chip nền. Thêm sàn mới: bỏ file
// vào src/assets/platforms/ và thêm 1 dòng ở đây (Record theo `LiveSession["platform"]` nên quên là lỗi compile).
export const PLATFORM_LOGO_SRC: Record<"TikTok" | "Shopee", string> = {
  TikTok: tiktokLogo,
  Shopee: shopeeLogo
};
