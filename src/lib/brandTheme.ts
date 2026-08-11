import { Brand } from "../types";

// Màu nhận diện của từng brand, LẤY TỪ MÀU THẬT TRÊN FILE LOGO trong src/assets/brands/
// (sample pixel màu chủ đạo), không phải màu random. Nhờ vậy badge session trên lịch đọc ra
// đúng "màu của brand" như người vận hành quen nhìn — Crocs xanh lá, Vera hồng magenta...
//
// Khác `lib/brandColors.ts` cũ (đã xoá): bảng đó hash brandId ra 1 màu Tailwind bất kỳ nên
// Crocs có thể ra màu tím. Ở đây dùng hex thật + inline style vì Tailwind không sinh được class
// từ hex động.
//
// Thêm brand mới: bỏ logo vào src/assets/brands/ + 1 dòng ở `BRAND_LOGOS` (lib/brandLogos.ts),
// rồi 1 dòng ở `BRAND_THEMES` bên dưới. Brand chưa khai báo vẫn có màu ổn định (hash → FALLBACK).
export interface BrandTheme {
  /** Màu chủ đạo trên logo — dùng làm nền badge, viền trái card, chấm chú giải. */
  primary: string;
  /** Điểm cuối gradient (tối/đậm hơn primary) — tạo chiều sâu kiểu poster. */
  secondary: string;
  /** Màu chữ đọc được trên nền primary (tự tính theo độ sáng, không set tay). */
  onPrimary: string;
  /** true khi primary là màu sáng → chữ tối; các lớp phủ (chip meta) phải dùng đen mờ thay vì trắng mờ. */
  isLight: boolean;
}

const BRAND_THEMES: Array<{ keyword: string; primary: string; secondary: string }> = [
  // Sample từ crocs.png — nền xanh lá thương hiệu.
  { keyword: "crocs", primary: "#80C141", secondary: "#4F9427" },
  // Sample từ vera.jpg — nền hồng magenta thương hiệu.
  { keyword: "vera", primary: "#EE008A", secondary: "#A80063" },
  // Jockey + Franklin đều là wordmark ĐEN trên nền trong suốt (không có màu thương hiệu thứ 2 trên
  // file logo). Giữ primary đen cho đúng logo, nhưng cho 2 brand điểm cuối gradient khác nhau
  // (Jockey trung tính, Franklin ngả xanh than) để vẫn phân biệt được khi 2 brand nằm cạnh nhau
  // trên cùng ô ngày — sửa 2 dòng này nếu sau này brand cung cấp màu chính thức.
  { keyword: "jockey", primary: "#0A0A0A", secondary: "#3F3F46" },
  { keyword: "franklin", primary: "#0F172A", secondary: "#475569" }
];

// Brand chưa khai báo màu — hash tên ra 1 màu cố định trong bảng dưới (cùng bộ màu Tailwind-500
// mà app vẫn dùng), để mỗi lần render đều ra đúng 1 màu, không nhảy màu giữa các view.
const FALLBACK = ["#f43f5e", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#f97316", "#6366f1", "#84cc16"];

const NEUTRAL: BrandTheme = { primary: "#64748b", secondary: "#334155", onPrimary: "#ffffff", isLight: false };

// Bỏ dấu tiếng Việt + hạ chữ thường — cùng hàm/ý đồ với lib/brandLogos.ts để 2 bảng luôn khớp brand.
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

// Độ sáng cảm nhận (perceived brightness). Ngưỡng 0.63 chọn theo dữ liệu thật: xanh Crocs (0.62)
// vẫn dùng chữ trắng đúng như logo gốc, còn vàng amber/lime nhạt (0.65+) mới chuyển sang chữ tối.
const isLightColor = (hex: string): boolean => {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.63;
};

/** Pha màu với alpha — dùng cho nền mềm (ô ngày, chip) mà vẫn giữ đúng sắc brand. */
export const withAlpha = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Gradient nền badge kiểu poster — luôn đi từ primary sang secondary. */
export const brandGradient = (theme: BrandTheme): string =>
  `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`;

const buildTheme = (primary: string, secondary: string): BrandTheme => {
  const light = isLightColor(primary);
  return { primary, secondary, onPrimary: light ? "#0f172a" : "#ffffff", isLight: light };
};

/** Khớp theo *token* trong `Brand.name` (không phải brandId — id là UUID khác nhau giữa các môi trường). */
export const getBrandTheme = (brandName: string | null | undefined): BrandTheme => {
  if (!brandName) return NEUTRAL;
  const tokens = new Set(normalize(brandName).split(/[^a-z0-9]+/).filter(Boolean));
  const known = BRAND_THEMES.find(({ keyword }) => tokens.has(keyword));
  if (known) return buildTheme(known.primary, known.secondary);
  const primary = FALLBACK[hashString(normalize(brandName)) % FALLBACK.length];
  return buildTheme(primary, primary);
};

export const getBrandThemeFor = (brand: Pick<Brand, "name"> | null | undefined): BrandTheme =>
  getBrandTheme(brand?.name);
