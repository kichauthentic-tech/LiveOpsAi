// Gộp các lời gọi ĐỌC giống nhau đang CÙNG BAY thành một request. KHÔNG giữ cache sau khi xong.
//
// VẤN ĐỀ ĐO ĐƯỢC (2026-10-01, đo trên BẢN BUILD PRODUCTION — không phải hiện tượng StrictMode gọi
// effect 2 lần ở dev). Màn Brand Dashboard, 5/5 lượt tải đều có 3 cặp request trùng NHAU TỪNG KÝ TỰ:
//
//   2x  brand_month_plans?brand_id=eq.<brand>&month=eq.<tháng này>
//   2x  brand_month_plan_slots?plan_id=eq.<plan>&order=date.asc,start_time.asc
//   2x  brand_dataraw_imports?select=id,report_type,period_start,period_end&brand_id=eq.<brand>
//                            &report_type=eq.shop_analytics
//
// Vì sao: `BrandDashboard` tự gọi `fetchMonthPlan(brandId, month)`, ĐỒNG THỜI render `<OpsSupport>`
// mà OpsSupport cũng tự gọi `fetchMonthPlan(brandId, month)` — hai component độc lập, không ai biết
// ai. Cặp `brand_month_plan_slots` là hệ quả: `fetchMonthPlan` là chuỗi 2 bước (plan rồi slots), nên
// 2 lời gọi thành 2 chuỗi. Cặp `brand_dataraw_imports` thì do `fetchShopDaysMonthSlice` được gọi 2
// lần (tháng này + tháng trước) mà truy vấn danh sách batch KHÔNG có bộ lọc kỳ (lọc kỳ làm ở JS),
// nên 2 lần ra đúng một URL.
//
// VÌ SAO CHỈ GỘP "ĐANG BAY", KHÔNG CACHE:
// Cache có hạn dùng sẽ làm hỏng đường GHI của Kế Hoạch Tháng: `MonthPlan.tsx` sau khi lưu/chốt kế
// hoạch gọi lại `fetchMonthPlan` để lấy bản mới (`const fresh = await fetchMonthPlan(...)`). Nếu đọc
// được phục vụ từ cache thì UI sẽ hiện lại bản CŨ sau khi vừa lưu. Gộp-khi-đang-bay không có rủi ro
// đó: lời gọi sau khi request trước đã settle luôn đi mạng thật. Nói cách khác ngữ nghĩa duy nhất bị
// đổi là "hai lời gọi CHỒNG NHAU VỀ THỜI GIAN dùng chung một kết quả" — mà hai lời gọi chồng nhau thì
// hôm nay cũng đã có thể nhận hai kết quả khác nhau nếu có ai ghi vào giữa, nên không hẹp hơn.
//
// ĐÃ KIỂM TRƯỚC KHI DÙNG — chia sẻ tham chiếu:
// Hai caller dùng chung một kết quả nghĩa là dùng chung các tham chiếu LỒNG bên trong (`planFromDb`
// trả `campRanges: r.camp_ranges ?? {}` và `blackoutDates: r.blackout_dates ?? []` — tham chiếu thẳng
// vào JSON gốc). Đã rà toàn bộ 31 chỗ dùng `campRanges` + 13 chỗ dùng `blackoutDates`: mọi đường ghi
// đều copy-on-write (`{ ...campRanges }`, `[...st.blackoutDates, day].sort()`), KHÔNG chỗ nào sửa tại
// chỗ. Nếu sau này có chỗ sửa tại chỗ thì phải copy ở đó, chứ đừng bỏ hàm này.

const inFlight = new Map<string, Promise<unknown>>();

/**
 * `key` phải mô tả ĐÚNG VÀ ĐỦ truy vấn sẽ chạy — gộp hai truy vấn khác nhau dưới cùng một key là
 * trả sai dữ liệu. Quy ước: `"<bảng>|<tham số>|..."`.
 *
 * Request lỗi cũng được dùng chung (cả hai caller cùng nhận reject), rồi key được xoá ngay — nên lần
 * thử lại sau đó đi mạng thật, không bị dính lỗi cũ.
 */
export function dedupeInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = inFlight.get(key);
  if (hit) return hit as Promise<T>;

  const p = run();
  inFlight.set(key, p);
  // Xoá khi settle. So sánh `=== p` để không xoá mất entry MỚI hơn (request sau đã bắt đầu trong lúc
  // cái này đang settle). `p.then(cleanup, cleanup)` tự nuốt reject của promise DẪN XUẤT nên không
  // sinh unhandled rejection; `p` gốc vẫn reject cho caller xử lý như trước.
  const cleanup = () => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  };
  p.then(cleanup, cleanup);
  return p;
}

/** Chỉ dùng cho test — xoá sổ đang-bay giữa các case. */
export function __resetInFlight(): void {
  inFlight.clear();
}
