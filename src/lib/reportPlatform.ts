// Report Tháng tách theo sàn (migration 0139): mỗi brand mỗi tháng có thể có MỘT report TikTok và MỘT report Shopee,
// phát hành / thu hồi / đóng sổ riêng. Dòng cũ trước 0139 đều là TikTok.
export type ReportPlatform = "TikTok" | "Shopee";
export const REPORT_PLATFORMS: ReportPlatform[] = ["TikTok", "Shopee"];
