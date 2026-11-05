import { createContext, useContext, useEffect, useState } from "react";
import { CHANNEL, METRIC } from "../../../lib/metricGlossary";
import { DriverKey } from "../../../lib/report/monthlyReportInsights";
import { CampDayBucket } from "../../../lib/campaignDays";
import { byLang, t } from "../../../lib/displayLang";


// Màu của Report Tháng. Trước 06/11 là skin đen-vàng CỐ ĐỊNH bất kể theme (tài liệu gửi brand). Nay (user: "đồng bộ toàn bộ")
// xem trong app thì theo theme: PAL là biến CSS --rt-* (index.css — theme YFB giữ đúng mã cũ, theme khác lấy token của theme);
// FILE HTML/PDF gửi brand vẫn đen-vàng: khung dựng bản xuất có class .rt-skin-yfb + RtSkinContext "yfb" (BrandMonthlyReport).
// Thuộc tính SVG của recharts (fill/stroke) không đọc var() ⇒ biểu đồ dùng usePal() lấy mã màu thật.
// Nút dạng chữ gạch chân trong report (Sửa Insight, Lưu, Huỷ…) — trước chỉ cao 17px (dòng chữ 11px), dưới
// ngưỡng 24px của WCAG 2.5.8; min-h-7 = 28px, giữ dáng link (audit UX 2026-09-29, M1).
export const LINK_BTN =
  "inline-flex items-center min-h-7 px-2 -mx-1 rounded-lg font-bold underline underline-offset-2 hover:bg-[color-mix(in_srgb,var(--rt-cream)_6%,transparent)] disabled:opacity-50";

/** Mã màu gốc của skin đen-vàng YFB — file xuất (exportStandaloneHtml) và giá trị mặc định :root của --rt-*. */
export const PAL_HEX = {
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
  blue: "#7fb0e0",
  onGold: "#1a1500"
};
export type Pal = typeof PAL_HEX;

/** Dùng trong style (inline) — biến CSS nên đổi theo theme. KHÔNG truyền vào thuộc tính SVG (dùng usePal()). */
export const PAL: Pal = {
  bg: "var(--rt-bg)",
  panel: "var(--rt-panel)",
  panel2: "var(--rt-panel2)",
  line: "var(--rt-line)",
  gold: "var(--rt-gold)",
  goldDim: "var(--rt-gold-dim)",
  cream: "var(--rt-cream)",
  muted: "var(--rt-muted)",
  green: "var(--rt-green)",
  red: "var(--rt-red)",
  blue: "var(--rt-blue)",
  onGold: "var(--rt-on-gold)"
};

/** Màu pha trong suốt — thay cách nối hex cũ (`${PAL.gold}55`), vì PAL giờ là var(). `pct` = độ đậm 0–100. */
export const alpha = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** "yfb" khi đang dựng bản xuất gửi brand: usePal() trả đúng mã đen-vàng dù người xuất đang dùng theme nào. */
export const RtSkinContext = createContext<"theme" | "yfb">("theme");

const resolvePal = (): Pal => {
  if (typeof document === "undefined") return PAL_HEX;
  // Biến có color-mix nên đọc thẳng getPropertyValue chỉ ra chuỗi chưa tính — tô vào một phần tử thử rồi chuẩn hoá qua canvas.
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const ctx = document.createElement("canvas").getContext("2d");
  const out = {} as Pal;
  for (const k of Object.keys(PAL) as (keyof Pal)[]) {
    probe.style.color = PAL[k];
    const c = getComputedStyle(probe).color;
    if (ctx) {
      ctx.fillStyle = PAL_HEX[k];
      ctx.fillStyle = c;
      out[k] = String(ctx.fillStyle);
    } else out[k] = c || PAL_HEX[k];
  }
  probe.remove();
  return out;
};

/** Mã màu thật của report theo theme đang chọn (đổi theme là vẽ lại) — cho fill/stroke của biểu đồ SVG. */
export function usePal(): Pal {
  const skin = useContext(RtSkinContext);
  const [pal, setPal] = useState<Pal>(() => (skin === "yfb" ? PAL_HEX : resolvePal()));
  useEffect(() => {
    if (skin === "yfb") return;
    const update = () => setPal(resolvePal());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [skin]);
  return skin === "yfb" ? PAL_HEX : pal;
}

export const chartTooltipStyle = { background: PAL.panel2, border: `1px solid ${PAL.line}`, borderRadius: 8, fontSize: 11, color: PAL.cream };

// ---------- Bố cục 10 trang gửi brand (user duyệt demo CROCS T9, 24/10/2026) ----------
// Thứ tự theo câu brand hỏi: đạt gì → shop & phần của livestream → nguyên nhân → hàng & khuyến mãi → Ads → hủy/hoàn & NMV →
// host & khung giờ → affiliate → tháng sau → bảng Key Metrics tra cứu. Trang không có dữ liệu thì ẩn với brand (ops vẫn thấy
// kèm lời nhắc tải file), số trang đánh lại theo các trang đang hiện. Công cụ nhập liệu nằm ở Nhập Ads / Affiliate / Kế Hoạch Tháng.

export type ReportSectionId = "summary" | "shop" | "why" | "products" | "ads" | "nmv" | "people" | "affiliate" | "next" | "keymetrics";
// Thứ tự trang (user chốt 28/10 theo demo Report Tháng): Tổng quan → Key Metrics (bảng tra cứu đứng ngay sau kết luận) → Hủy, hoàn & NMV
// (tiền thật đặt sớm) → Toàn shop → Nguyên nhân → Sản phẩm → Host → Quảng cáo → Affiliate → Kế hoạch tháng sau.
// MonthlyReportTabs dựng DOM theo thứ tự cũ và xếp lại bằng CSS `order` theo mảng này (secOrder) — đổi thứ tự chỉ cần sửa mảng.
export const SECTIONS: { id: ReportSectionId; label: string; title: string }[] = byLang(
  () => [
    { id: "summary", label: t("Tổng quan", "Overview"), title: t("Tổng quan & KPI", "Overview & KPI") },
    { id: "keymetrics", label: "Key Metrics", title: "Key Metrics" },
    { id: "nmv", label: "NMV", title: t("Hoàn & NMV ước tính", "Refunds & estimated NMV") },
    { id: "shop", label: t("Toàn shop", "Whole shop"), title: t("Toàn shop & đóng góp của livestream YFB", "Whole shop & YFB livestream contribution") },
    { id: "why", label: t("Nguyên nhân", "Root cause"), title: t("Phân tích nguyên nhân", "Root-cause analysis") },
    { id: "products", label: t("Sản phẩm", "Products"), title: t("Sản phẩm & khuyến mãi", "Products & promotions") },
    { id: "people", label: "Host", title: t("Host & khung giờ", "Hosts & time slots") },
    { id: "ads", label: "Ads", title: t("Quảng cáo", "Advertising") },
    { id: "affiliate", label: "Affiliate", title: "Affiliate" },
    { id: "next", label: t("Tháng sau", "Next month"), title: t("Kế hoạch tháng sau & hành động", "Next month's plan & actions") }
  ],
  []
);

// 4 kênh — màu phân loại theo thứ tự cố định (blue/orange/aqua/yellow, bước tối của bảng màu đã kiểm
// mù màu cho các cặp kề nhau). Kênh luôn giữ một màu, không đổi theo thứ hạng.
export const CHANNELS: { key: "liveLinked" | "affiliate" | "video" | "card"; label: string; color: string }[] = byLang(
  () => [
    // "Linked account" = MỌI live trên tài khoản shop, không chỉ ca agency (tỷ trọng agency ở bảng chi tiết).
    { key: "liveLinked", label: `${CHANNEL.sellerLive} ${t("(cả tài khoản shop)", "(whole shop account)")}`, color: "#3987e5" },
    { key: "affiliate", label: CHANNEL.affiliateLive, color: "#d95926" },
    { key: "video", label: CHANNEL.video, color: "#199e70" },
    { key: "card", label: CHANNEL.productCard, color: "#c98500" }
  ],
  []
);

// Nhãn ngắn loại ngày cho tiêu đề cột bảng host (bỏ phần "(13-15)" — khoảng camp có thể bị ghi đè).
export const DAY_TYPE_SHORT: Record<CampDayBucket, string> = { daily: "Daily", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };

// Nhãn trục ngắn — 2 biểu đồ đứng cạnh nhau, nhãn đầy đủ (DRIVER_LABEL) dính vào nhau. Nhãn đầy đủ vẫn ở
// các ô chú thích bên dưới biểu đồ.
export const DRIVER_SHORT: Record<DriverKey, string> = byLang(() => ({
  hours: METRIC.liveHours,
  viewsPerHour: METRIC.viewsPerHour,
  liveCtr: METRIC.liveCtr,
  ctor: METRIC.ctor,
  aov: METRIC.aov
}));
