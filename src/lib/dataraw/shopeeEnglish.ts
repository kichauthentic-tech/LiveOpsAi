import type { ShopeeSheets } from "./shopeeShop";

// Seller Centre để tiếng Anh: 5 file cả shop có CÙNG cấu trúc với bản tiếng Việt, chỉ khác chữ (tên sheet, tên cột, vài giá trị như
// trạng thái / loại khuyến mãi). Thay vì viết lại bộ đọc, dịch chữ Anh → Việt ngay sau khi mở file, rồi bộ đọc tiếng Việt chạy như cũ
// (dữ liệu lưu vào DB vẫn là một dạng duy nhất, report không cần biết file gốc bằng tiếng gì). File tiếng Việt đi qua hàm này không đổi.

const cell = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const lc = (s: string) => s.normalize("NFC").toLowerCase();

// Chữ trong ô → chữ tiếng Việt. Khớp nguyên ô (không phân biệt hoa thường); ô không có trong bảng giữ nguyên.
const TEXT: Record<string, string> = {
  // chung
  "Date": "Ngày", "Product": "Sản phẩm", "Item ID": "Mã sản phẩm", "Current Item Status": "Tình trạng sản phẩm hiện tại",
  "Normal": "Đang hoạt động", "Unlisted": "Đã ẩn", "Ongoing": "Đang diễn ra", "Expired": "Đã kết thúc", "Status": "Trạng thái",
  "Sales Ratio": "Tỷ lệ doanh số", "Product Impressions": "Lượt hiển thị sản phẩm", "Product Clicks": "Lượt nhấp vào sản phẩm",
  "Order Conversion Rate": "Tỷ lệ chuyển đổi đơn hàng", "Sales per Order": "Doanh số trên mỗi đơn hàng", "Orders": "Tổng số đơn hàng",
  "Buyers": "Người mua", "Unique Product Impressions": "Lượt hiển thị sản phẩm duy nhất", "Unique Product Clicks": "Lượt nhấp sản phẩm duy nhất",
  // Shop Stats — cột
  "Visitors": "Số lượt truy cập", "Cancelled Orders": "Đơn đã hủy", "Cancelled Sales": "Doanh số đơn hủy",
  "Returned/Refunded Orders": "Đơn đã hoàn trả / hoàn tiền", "Returned/Refunded Sales": "Doanh số các đơn Trả hàng/Hoàn tiền",
  "# of buyers": "số người mua", "# of new buyers": "số người mua mới", "# of existing buyers": "số người mua hiện tại",
  "Order Type": "Loại Đơn Hàng", "Traffic Source": "Nguồn lưu lượng",
  "Sales from Product Card": "Doanh thu từ thẻ sản phẩm", "Sales from Seller Live": "Doanh thu từ Livestream của người bán",
  "Sales from Seller Video": "Doanh thu từ Video của người bán", "Sales from Affiliate": "Doanh thu từ đối tác liên kết",
  "Sales from Shopee Ads": "Doanh thu từ quảng cáo Shopee",
  "Live Views": "Lượt xem Livestream", "Video Views": "Lượt xem Video", "Content Views": "Lượt xem nội dung",
  "Ads Expense": "Chi phí quảng cáo", "Ads ROAS": "ROAS quảng cáo", "Conversion": "Tỷ lệ chuyển đổi",
  // Shop Stats — khối và nguồn
  "Product Card": "Thẻ sản phẩm", "Seller Live": "Live", "Seller Video": "Video", "Shopee Affiliate": "Tiếp thị liên kết",
  "Shopee Ads": "Dịch vụ Hiển thị Shopee", "Recommendation": "Đề xuất", "Search": "Tìm kiếm", "Shop": "Cửa hàng",
  "Shopping Cart": "Giỏ hàng", "Promotion": "Khuyến mãi", "My Purchase": "Đơn mua của tôi", "Others": "Khác",
  "Live Tab": "Thẻ Live", "Product Ads (GMV Max Auto Bidding)": "Quảng cáo GMV tối đa tự động đấu thầu cho sản phẩm",
  "Shop+ Ads": "Quảng cáo cửa hàng", "Live Ads": "Dịch Vụ Hiển Thị Live", "Product Ads (Others)": "Quảng cáo GMV tối đa ROAS tùy chỉnh cho sản phẩm",
  // Voucher
  "Date Period": "Khung thời gian", "Time Period": "Thời Gian", "Claim Period": "Khung Thời Gian", "Claims": "Nhận",
  "Voucher Name": "Tên mã giảm giá", "Voucher Code": "Mã giảm giá", "Creator": "Người tạo", "Voucher Type": "Loại Voucher",
  "Shopee Created": "Shopee đã tạo", "Seller Created": "Người bán đã tạo", "Ads Smart Voucher": "Voucher Thông Minh của Dịch Vụ Hiển Thị",
  "Shop-wide Voucher": "Voucher Toàn Shop", "Follower Voucher": "Voucher Ưu Đãi Follower", "Live Voucher": "Voucher Live", "New Buyer Voucher": "Voucher Người Mua Mới",
  // Discount (cũng là loại ưu đãi của voucher: "Discount" = Khuyến Mãi)
  "Promotion Type": "Loại khuyến mãi", "Promotion Name": "Tên chương trình", "Promotion Period": "Thời gian diễn ra chương trình",
  "All": "Tất cả", "Discount": "Khuyến Mãi", "Bundle Deal": "Combo Khuyến Mãi", "Add-on Deal": "Mua Kèm Deal Sốc",
  "Discount Promotion": "Chương Trình Khuyến Mãi", "Add-on Deal (Gift with Min. Spend)": "Mua Kèm Deal Sốc (Mua Để Nhận Quà)",
  // Sales Composition
  "Shopee Category": "Ngành Hàng", "Sub-Category": "Ngành Hàng Con", "Sales %": "% Doanh Số", "Buyers %": "% Người mua",
  "Conversion Rate": "Tỷ lệ chuyển đổi", "Price Range (VND)": "Theo Phân Khúc Giá (VND)", "Type of Buyers": "Nhóm",
  "New Buyers": "Người mua mới", "Existing Buyers": "Người mua hiện tại",
  "Sports & Outdoors": "Thể Thao & Dã Ngoại", "Sports & Outdoor Recreation Equipments": "Dụng Cụ Thể Thao & Dã Ngoại",
  "Sports & Outdoor Accessories": "Phụ Kiện Thể Thao & Dã Ngoại", "Sports & Outdoor Apparels": "Thời Trang Thể Thao & Dã Ngoại"
};
const TEXT_LC = new Map(Object.entries(TEXT).map(([k, v]) => [lc(k), v]));

// Cột số liệu voucher / discount: "Sales (Placed Order) (VND)" → "Bán hàng (đặt hàng) (VND)" …
const BASIS: Record<string, string> = { "placed order": "đặt hàng", "confirmed order": "Đơn đặt hàng được xác nhận" };
const METRIC: [RegExp, string][] = [
  [/^sales \((placed order|confirmed order)\)( \(vnd\))?$/i, "Bán hàng"],
  [/^orders \((placed order|confirmed order)\)$/i, "Đơn đặt hàng"],
  [/^buyers \((placed order|confirmed order)\)$/i, "Người mua"],
  [/^cost \((placed order|confirmed order)\)( \(vnd\))?$/i, "Chi phí"],
  [/^units sold \((placed order|confirmed order)\)$/i, "Đơn vị được bán"]
];
function metricName(s: string): string | null {
  for (const [re, vi] of METRIC) {
    const m = s.match(re);
    if (m) return `${vi} (${BASIS[m[1].toLowerCase()]})${/\(vnd\)$/i.test(s) ? " (VND)" : ""}`;
  }
  return null;
}

// Tên sheet Anh → Việt. Hai file trùng tên sheet "Placed Order" / "Confirmed Order" (Shop Stats và Sales Composition) nên phân biệt theo nội dung.
const SHEET_COMMON: [string, string][] = [
  ["key metrics", "Tổng quan"], ["metric trends", "Xu hướng số liệu"], ["trend chart of each metric", "Biểu đồ"], ["performance list", "Danh sách hiệu suất"],
  ["paid order", "Đơn Đã Thanh Toán"],
  ["traffic sources (placed", "Nguồn truy cập cho Đơn hàng đã đặt"], ["traffic sources (confirmed", "Nguồn lưu lượng truy cập (đơn đã xác nhận)"],
  ["source contribution (placed", "(đơn đã đặt)Theo nguồn lưu lượng"],
  ["(placed) product traffic", "(đơn đã đặt)Lưu lượng truy cập"], ["(confirmed) product traffic", "(đơn đã xác nhận)Lưu lượng truy cập"]
];

const isEnglishName = (name: string) => /^[\x20-\x7e]+$/.test(name);

/** Dịch file Seller Centre tiếng Anh sang tiếng Việt; file tiếng Việt trả về nguyên (không có tên sheet tiếng Anh nào khớp). */
export function translateShopeeSheets(sheets: ShopeeSheets): ShopeeSheets {
  const names = Object.keys(sheets);
  if (!names.some((n) => isEnglishName(n))) return sheets;
  const byName = (n: string) => names.find((x) => lc(x) === n);
  const placedSheet = byName("placed order");
  const isComposition = !!placedSheet && sheets[placedSheet].some((r) => cell(r?.[0]) === "Data Period");
  const isStats = !isComposition && !!byName("paid order");
  const out: ShopeeSheets = {};
  for (const name of names) {
    const l = lc(name);
    let newName = name;
    let dailySales = false;
    if (isComposition && l === "placed order") newName = "Đặt hàng";
    else if (isComposition && l === "confirmed order") newName = "Đơn đặt hàng xác nhận";
    else if (isStats && l === "placed order") { newName = "Đơn hàng đã đặt"; dailySales = true; }
    else if (isStats && l === "confirmed order") { newName = "Đơn đã xác nhận"; dailySales = true; }
    else if (isStats && l === "paid order") { newName = "Đơn Đã Thanh Toán"; dailySales = true; }
    else {
      const hit = SHEET_COMMON.find(([k]) => l.startsWith(k));
      if (hit) newName = hit[1];
    }
    out[newName] = sheets[name].map((row) =>
      Array.isArray(row)
        ? row.map((v) => {
            if (typeof v !== "string") return v;
            const s = v.replace(/）/g, ")").replace(/（/g, "(").trim();
            if (dailySales && /^sales \(vnd\)$/i.test(s)) return "Tổng doanh số (VND)";
            if (/^sales \(vnd\)$/i.test(s)) return "Doanh số (VND)";
            return metricName(s) ?? TEXT_LC.get(lc(s)) ?? v;
          })
        : row
    );
  }
  return out;
}
