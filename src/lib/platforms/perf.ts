import { platformOf, REPORT_PLATFORMS, type ReportPlatform } from "../reportPlatform";

// LUẬT CỨNG (user chốt 07/10): KHÔNG BAO GIỜ cộng, gộp, lấy trung bình hay xếp hạng gộp bất kỳ chỉ số HIỆU SUẤT nào
// (GMV, target GMV, đơn, view, GMV/giờ, mọi tỷ lệ) giữa TikTok và Shopee. Dữ liệu gốc hai sàn khác bản chất: TikTok GMV
// gồm đơn huỷ/hoàn, Shopee GMV = doanh số đơn đặt; một dòng file TikTok là một phòng, Shopee là một phiên.
// Số VẬN HÀNH (ca, giờ, người, phòng) và TIỀN của agency (doanh thu, lương, chi phí, lãi) thì cộng được.
//
// Mọi chỗ cần cộng số hiệu suất của một mảng có thể lẫn sàn phải đi qua đây: kết quả luôn là MỘT số cho MỖI sàn.
// `tests/noCrossPlatformPerf.test.ts` quét src/ để chặn phép cộng số hiệu suất viết tay ở màn chưa được duyệt.

/** Cộng một trường hiệu suất, tách theo sàn. */
export function sumByPlatform<T extends { platform?: string | null }>(rows: readonly T[], pick: (r: T) => number | null | undefined): Record<ReportPlatform, number> {
  const out = { TikTok: 0, Shopee: 0 } as Record<ReportPlatform, number>;
  for (const r of rows) out[platformOf(r)] += pick(r) ?? 0;
  return out;
}

/** GMV của các ca, tách theo sàn. */
export const sumGmvByPlatform = <T extends { platform?: string | null; actualGmv?: number }>(rows: readonly T[]) => sumByPlatform(rows, (r) => r.actualGmv);

/** Sàn có số (> 0), TikTok trước — để hiện "TikTok 120M · Shopee 80M" mà không bao giờ có ô tổng. */
export const platformsWithValue = (v: Record<ReportPlatform, number>): ReportPlatform[] => REPORT_PLATFORMS.filter((p) => v[p] > 0);

/**
 * Chốt chặn cho hàm cộng số hiệu suất nhận mảng ca: mảng phải cùng MỘT sàn. Lệch sàn là lỗi lập trình (màn quên lọc),
 * nên ném lỗi khi chạy test/dev để lộ ngay; bản build production chỉ ghi console để không làm trắng màn của người dùng.
 */
export function assertOnePlatform(rows: readonly { platform?: string | null }[], where: string): void {
  if (rows.length < 2) return;
  const first = platformOf(rows[0]);
  if (rows.every((r) => platformOf(r) === first)) return;
  const msg = `${where}: mảng ca lẫn TikTok và Shopee — số hiệu suất không được cộng giữa hai sàn (lọc theo sàn trước khi gọi).`;
  if (import.meta.env?.PROD) console.error(msg);
  else throw new Error(msg);
}
