// Ngày VN (UTC+7) của một instant ISO — tách khỏi creatorLivePerfSlice.ts (file đó import supabaseClient,
// mà supabaseClient ném lỗi khi thiếu biến môi trường) để code thuần như lib/report/monthlyReportInsights.ts
// dùng được trong test/CI không có .env.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function vnDateOf(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`;
}
