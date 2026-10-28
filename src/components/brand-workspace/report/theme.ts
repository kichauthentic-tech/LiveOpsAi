import { CHANNEL, METRIC } from "../../../lib/metricGlossary";
import { DriverKey } from "../../../lib/report/monthlyReportInsights";
import { CampDayBucket } from "../../../lib/campaignDays";


// Skin đen-vàng CỐ ĐỊNH của Report Tháng + các bảng hằng số dùng chung. Tách khỏi MonthlyReportTabs.tsx
// 2026-10-01 (file khi đó 2.337 dòng). Đây là tài liệu gửi thẳng cho brand để pitching nên nhận diện
// phải nhất quán bất kể Ops đang chọn theme nội bộ nào — KHÔNG dùng var(--accent)/var(--surface).

// Report Tháng — skin đen-vàng CỐ ĐỊNH riêng cho tab này (khác theme sáng/tối/sand nội bộ app):
// đây là tài liệu gửi thẳng cho brand để pitching, nhận diện thương hiệu phải nhất quán bất kể Ops
// đang chọn theme nội bộ nào. Không dùng var(--accent)/var(--surface) như phần còn lại của app.
// Nút dạng chữ gạch chân trong report (Sửa Insight, Lưu, Huỷ…) — trước chỉ cao 17px (dòng chữ 11px), dưới
// ngưỡng 24px của WCAG 2.5.8; min-h-7 = 28px, giữ dáng link (audit UX 2026-09-29, M1).
export const LINK_BTN =
  "inline-flex items-center min-h-7 px-2 -mx-1 rounded-lg font-bold underline underline-offset-2 hover:bg-white/5 disabled:opacity-50";

export const PAL = {
  bg: "#0b0b0d",
  panel: "#17171b",
  panel2: "#1d1d22",
  line: "#2a2a30",
  gold: "#f2c94c",
  goldDim: "#a9873a",
  cream: "#f4f1e8",
  muted: "#93939c",
  green: "#6fcf97",
  red: "#eb6b6b",
  blue: "#7fb0e0"
};

export const chartTooltipStyle = { background: PAL.panel2, border: `1px solid ${PAL.line}`, borderRadius: 8, fontSize: 11, color: PAL.cream };

// ---------- Bố cục 10 trang gửi brand (user duyệt demo CROCS T9, 24/10/2026) ----------
// Thứ tự theo câu brand hỏi: đạt gì → shop & phần của livestream → nguyên nhân → hàng & khuyến mãi → Ads → hủy/hoàn & NMV →
// host & khung giờ → affiliate → tháng sau → bảng Key Metrics tra cứu. Trang không có dữ liệu thì ẩn với brand (ops vẫn thấy
// kèm lời nhắc tải file), số trang đánh lại theo các trang đang hiện. Công cụ nhập liệu nằm ở Nhập Ads / Affiliate / Kế Hoạch Tháng.

export type ReportSectionId = "summary" | "shop" | "why" | "products" | "ads" | "nmv" | "people" | "affiliate" | "next" | "keymetrics";
// Thứ tự trang (user chốt 28/10 theo demo Report Tháng): Tổng quan → Key Metrics (bảng tra cứu đứng ngay sau kết luận) → Hủy, hoàn & NMV
// (tiền thật đặt sớm) → Toàn shop → Nguyên nhân → Sản phẩm → Host → Quảng cáo → Affiliate → Kế hoạch tháng sau.
// MonthlyReportTabs dựng DOM theo thứ tự cũ và xếp lại bằng CSS `order` theo mảng này (secOrder) — đổi thứ tự chỉ cần sửa mảng.
export const SECTIONS: { id: ReportSectionId; label: string; title: string }[] = [
  { id: "summary", label: "Tổng quan", title: "Tổng quan & KPI" },
  { id: "keymetrics", label: "Key Metrics", title: "Key Metrics" },
  { id: "nmv", label: "NMV", title: "Hoàn & NMV ước tính" },
  { id: "shop", label: "Toàn shop", title: "Toàn shop & đóng góp của livestream YFB" },
  { id: "why", label: "Nguyên nhân", title: "Phân tích nguyên nhân" },
  { id: "products", label: "Sản phẩm", title: "Sản phẩm & khuyến mãi" },
  { id: "people", label: "Host", title: "Host & khung giờ" },
  { id: "ads", label: "Ads", title: "Quảng cáo" },
  { id: "affiliate", label: "Affiliate", title: "Affiliate" },
  { id: "next", label: "Tháng sau", title: "Kế hoạch tháng sau & hành động" }
];

// 4 kênh — màu phân loại theo thứ tự cố định (blue/orange/aqua/yellow, bước tối của bảng màu đã kiểm
// mù màu cho các cặp kề nhau). Kênh luôn giữ một màu, không đổi theo thứ hạng.
export const CHANNELS: { key: "liveLinked" | "affiliate" | "video" | "card"; label: string; color: string }[] = [
  // "Linked account" = MỌI live trên tài khoản shop, không chỉ ca agency (tỷ trọng agency ở bảng chi tiết).
  { key: "liveLinked", label: `${CHANNEL.sellerLive} (cả tài khoản shop)`, color: "#3987e5" },
  { key: "affiliate", label: CHANNEL.affiliateLive, color: "#d95926" },
  { key: "video", label: CHANNEL.video, color: "#199e70" },
  { key: "card", label: CHANNEL.productCard, color: "#c98500" }
];

// Nhãn ngắn loại ngày cho tiêu đề cột bảng host (bỏ phần "(13-15)" — khoảng camp có thể bị ghi đè).
export const DAY_TYPE_SHORT: Record<CampDayBucket, string> = { daily: "Daily", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };

// Nhãn trục ngắn — 2 biểu đồ đứng cạnh nhau, nhãn đầy đủ (DRIVER_LABEL) dính vào nhau. Nhãn đầy đủ vẫn ở
// các ô chú thích bên dưới biểu đồ.
export const DRIVER_SHORT: Record<DriverKey, string> = {
  hours: METRIC.liveHours,
  viewsPerHour: METRIC.viewsPerHour,
  liveCtr: METRIC.liveCtr,
  ctor: METRIC.ctor,
  aov: METRIC.aov
};
