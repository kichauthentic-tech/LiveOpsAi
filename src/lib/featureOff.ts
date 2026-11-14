// Một tính năng chưa dùng được vì DB chưa cập nhật (bảng/cột/hàm chưa có).
//
// Audit chữ 13/11: 40 chỗ nói thẳng với người dùng "cần chạy migration 0121 trong SQL Editor", "chạy file
// supabase/migrations/0155_affiliate_plan_first.sql", "PGRST202" — trái WORKSPACE §5.2(7) (không chữ kỹ thuật lộ ra).
// Người đứng trước màn không chạy được migration; chỉ admin chạy. Nên màn nói ĐÚNG việc không làm được + nhắn admin,
// còn số migration / tên bảng đi vào console.warn để admin (hoặc Claude) dò khi cần.
//
// `what` viết dưới dạng việc người dùng đang muốn làm, chữ thường, không chấm cuối: "ghi sổ dự báo", "gửi bản tin cho brand".

export const FEATURE_OFF_HINT = "nhắn admin cập nhật hệ thống";

/** Câu hiện trên màn: chỉ việc chưa làm được + ai xử lý. */
export function featureOffText(what: string): string {
  return `Chưa bật ${what} — ${FEATURE_OFF_HINT}.`;
}

/**
 * Lỗi để ném từ lớp db: message là chữ cho người dùng, chi tiết kỹ thuật (số migration, tên bảng, mã lỗi) chỉ vào console.
 * Lớp db gọi hàm này thay vì `new Error("… migration 0174 …")`.
 */
export function featureOffError(what: string, detail: string): Error {
  console.warn(`[LiveOps] chưa bật "${what}": ${detail}`);
  return new Error(featureOffText(what));
}
