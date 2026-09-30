// PostgREST chặn cứng 1.000 dòng mỗi request (`db-max-rows` của Supabase). Query KHÔNG phân trang
// trên một bảng lớn dần thì không báo lỗi gì cả — nó trả về đúng 1.000 dòng đầu rồi im lặng, và mọi
// con số tính từ đó sai mà không ai biết.
//
// Đo 2026-10-01 trên DB thật: `brand_dataraw_rows` đã có 5.333 dòng, 4/24 đợt nhập vượt trần
// (1.181 · 1.176 · 1.164 · 1.080) — tức màn Dữ Liệu Gốc ĐANG hiện thiếu dòng. Các bảng theo ca /
// theo tháng khác (ca, lịch ca, đăng ký ca, tài chính ca, target kế hoạch, lịch sử rate) hôm nay
// còn nhỏ nhưng chỉ tăng, nên chỗ nào đọc cả bảng đều phải đi qua đây.
//
// `fetchAllSessionRows` (sessions.ts) đã tự cuộn trang từ trước theo đúng cách này; helper chỉ gom
// lại một chỗ để chỗ mới không phải nghĩ lại — và để `tests/pagedQueries.test.ts` canh được.
export const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

/**
 * Gọi `page(from, to)` liên tiếp cho tới khi nhận về một trang ngắn hơn `PAGE_SIZE`.
 *
 * `page` phải kèm `.order(...)` ỔN ĐỊNH (có cột phá hoà, thường là `id`) — thiếu thứ tự xác định
 * thì Postgres được phép trả cùng một dòng ở hai trang khác nhau và bỏ sót dòng khác.
 */
export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}
