import { Brand } from "../types";
import crocsLogo from "../assets/brands/crocs.png";
import franklinLogo from "../assets/brands/franklin.png";
import jockeyLogo from "../assets/brands/jockey.png";
import veraLogo from "../assets/brands/vera.jpg";

// Logo ảnh thật của các brand đối tác. Khác `Brand.logo` (emoji nhập tay ở CRM & Projects, xem
// lib/brandIcons.ts) — file ảnh nằm trong repo nên không phụ thuộc DB/CDN, và brand chưa có ảnh
// vẫn rơi về emoji cũ. Thêm brand mới: bỏ file vào src/assets/brands/ rồi khai báo 1 dòng ở
// BRAND_LOGOS bên dưới, không sửa component nào khác.
export interface BrandLogoAsset {
  src: string;
  alt: string;
  /** true = logo tối trên nền trong suốt/trắng (Franklin, Jockey) → phải đặt trên chip nền sáng +
   * object-contain, nếu không sẽ "biến mất" trên UI nền tối. false = ảnh vuông đã có nền màu
   * thương hiệu riêng (Crocs xanh lá, Vera hồng) → phủ kín ô, không padding. */
  needsLightChip: boolean;
}

// Khớp theo *token* trong Brand.name thay vì brandId: id là UUID sinh từ DB (khác nhau giữa
// môi trường dev/prod), còn tên brand thì ổn định và do người dùng nhập.
const BRAND_LOGOS: Array<{ keyword: string; asset: BrandLogoAsset }> = [
  { keyword: "franklin", asset: { src: franklinLogo, alt: "Franklin", needsLightChip: true } },
  { keyword: "crocs", asset: { src: crocsLogo, alt: "Crocs", needsLightChip: false } },
  { keyword: "jockey", asset: { src: jockeyLogo, alt: "Jockey", needsLightChip: true } },
  { keyword: "vera", asset: { src: veraLogo, alt: "Vera", needsLightChip: false } }
];

// Bỏ dấu tiếng Việt + hạ chữ thường để "Vera Fashion", "VERA", "Công ty Verá" đều khớp keyword.
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

export const getBrandLogoAsset = (
  brand: Pick<Brand, "name"> | null | undefined
): BrandLogoAsset | null => {
  if (!brand?.name) return null;
  // Tách token để "Vera" không khớp nhầm một tên dài chứa chuỗi con ngẫu nhiên.
  const tokens = new Set(normalize(brand.name).split(/[^a-z0-9]+/).filter(Boolean));
  return BRAND_LOGOS.find(({ keyword }) => tokens.has(keyword))?.asset ?? null;
};
