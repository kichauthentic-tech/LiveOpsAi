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
  /** Màu pha loãng vào nền ô lịch để ra nền + viền THẺ CA (ui/SessionEventCard). Khác `primary` ở brand
   * wordmark đen (Jockey/Franklin): primary gần đen pha 14% ra xám đục, nên dùng xám/xanh than dịu hơn. */
  accent: string;
  /** Nền viên thuốc Target GMV ở giao diện sáng — đậm, chữ trắng (`TARGET_PILL_FG`), tương phản ≥ 7:1. */
  ink: string;
  /** Nền viên thuốc Target GMV ở giao diện tối — sáng, chữ `inkDarkOn`. */
  inkDark: string;
  inkDarkOn: string;
}

/** Chữ trên viên thuốc Target GMV ở giao diện sáng (nền `ink` luôn đậm). */
export const TARGET_PILL_FG = "#ffffff";

// `accent/ink/inkDark` chỉ cần khai báo khi muốn chốt tay; không khai báo thì `buildTheme` tự suy từ primary
// (ink = primary tối đi cho tới khi chữ trắng ≥ 7:1, inkDark = primary sáng lên). Brand đen khai báo tay vì
// suy tự động ra đen/trắng thuần, mất cá tính của Franklin (xanh than).
interface BrandThemeSeed {
  keyword: string;
  primary: string;
  secondary: string;
  accent?: string;
  ink?: string;
  inkDark?: string;
}

const BRAND_THEMES: BrandThemeSeed[] = [
  // Sample từ crocs.png — nền xanh lá thương hiệu.
  { keyword: "crocs", primary: "#80C141", secondary: "#4F9427", ink: "#2D6212", inkDark: "#9AD65C" },
  // Sample từ vera.jpg — nền hồng magenta thương hiệu.
  { keyword: "vera", primary: "#EE008A", secondary: "#A80063", ink: "#8A0052", inkDark: "#F27AC0" },
  // Jockey + Franklin đều là wordmark ĐEN trên nền trong suốt (không có màu thương hiệu thứ 2 trên
  // file logo). Giữ primary đen cho đúng logo, nhưng cho 2 brand điểm cuối gradient khác nhau
  // (Jockey trung tính, Franklin ngả xanh than) để vẫn phân biệt được khi 2 brand nằm cạnh nhau
  // trên cùng ô ngày — sửa 2 dòng này nếu sau này brand cung cấp màu chính thức.
  { keyword: "jockey", primary: "#0A0A0A", secondary: "#3F3F46", accent: "#52525B", ink: "#18181B", inkDark: "#E4E4E7" },
  { keyword: "franklin", primary: "#0F172A", secondary: "#475569", accent: "#3B5A8A", ink: "#0F172A", inkDark: "#E2E8F0" }
];

// Brand chưa khai báo màu — hash tên ra 1 màu cố định trong bảng dưới (cùng bộ màu Tailwind-500
// mà app vẫn dùng), để mỗi lần render đều ra đúng 1 màu, không nhảy màu giữa các view.
const FALLBACK = ["#f43f5e", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#f97316", "#6366f1", "#84cc16"];

const NEUTRAL: BrandTheme = {
  primary: "#64748b",
  secondary: "#334155",
  onPrimary: "#ffffff",
  isLight: false,
  accent: "#64748b",
  ink: "#334155",
  inkDark: "#cbd5e1",
  inkDarkOn: "#0f172a"
};

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

const toHex = (rgb: [number, number, number]): string =>
  `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

const mix = (hex: string, target: [number, number, number], t: number): string => {
  const c = hexToRgb(hex);
  return toHex([c[0] + (target[0] - c[0]) * t, c[1] + (target[1] - c[1]) * t, c[2] + (target[2] - c[2]) * t]);
};

const channel = (v: number): number => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

/** Độ tương phản WCAG giữa 2 màu hex (1–21). Export để test khoá "Target GMV không bao giờ chìm". */
export const contrastRatio = (a: string, b: string): number => {
  const lum = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Tối dần primary về đen cho tới khi chữ trắng đọc được ≥ 7:1 (AAA) — viên thuốc Target GMV.
const deriveInk = (primary: string): string => {
  let ink = primary;
  for (let i = 0; i < 12 && contrastRatio(ink, TARGET_PILL_FG) < 7; i++) ink = mix(ink, [0, 0, 0], 0.15);
  return ink;
};

const buildTheme = (seed: Omit<BrandThemeSeed, "keyword">): BrandTheme => {
  const { primary, secondary } = seed;
  const light = isLightColor(primary);
  const inkDark = seed.inkDark ?? mix(primary, [255, 255, 255], 0.35);
  return {
    primary,
    secondary,
    onPrimary: light ? "#0f172a" : "#ffffff",
    isLight: light,
    accent: seed.accent ?? primary,
    ink: seed.ink ?? deriveInk(primary),
    inkDark,
    // Chữ trên viên thuốc sáng: đen gần như thuần, luôn ≥ 7:1 trên mọi inkDark sáng.
    inkDarkOn: contrastRatio(inkDark, "#0b0b0f") >= 7 ? "#0b0b0f" : "#ffffff"
  };
};

/** Khớp theo *token* trong `Brand.name` (không phải brandId — id là UUID khác nhau giữa các môi trường). */
export const getBrandTheme = (brandName: string | null | undefined): BrandTheme => {
  if (!brandName) return NEUTRAL;
  const tokens = new Set(normalize(brandName).split(/[^a-z0-9]+/).filter(Boolean));
  const known = BRAND_THEMES.find(({ keyword }) => tokens.has(keyword));
  if (known) return buildTheme(known);
  const primary = FALLBACK[hashString(normalize(brandName)) % FALLBACK.length];
  return buildTheme({ primary, secondary: primary });
};

