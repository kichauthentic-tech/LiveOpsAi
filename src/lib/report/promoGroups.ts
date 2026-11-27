import type { PromotionRow } from "../dataraw/monthlyProductSlice";
import { byLang, t } from "../displayLang";

// CTKM gom theo LOẠI (Report Tháng · trang Sản phẩm, user 27/11 "Ok v gom theo loại"). Đo CROCS T11 (41 chương trình trong
// tháng): Giảm giá sản phẩm 3 CT = 68% tiền giảm, Voucher 16 CT = 32%, Quà tặng 20 CT (file không ghi giá quà); bảng Top 10
// cũ giấu 31/41 chương trình vì quà tặng bị chia lẻ theo từng ngày/khung giờ.
// Cột "Loại" của TikTok để trống phần lớn voucher & quà (CROCS T11: 43/49) ⇒ dùng cột này khi có, không thì suy theo tên.
// KHÔNG cộng GMV giữa các nhóm: một đơn có thể vừa dùng voucher vừa được quà.

export type PromoKind = "markdown" | "voucher" | "gift" | "bundle" | "flash" | "other";
export const PROMO_KIND_ORDER: PromoKind[] = ["markdown", "voucher", "gift", "bundle", "flash", "other"];
export const PROMO_KIND_LABEL: Record<PromoKind, string> = byLang(() => ({
  markdown: t("Giảm giá sản phẩm", "Product discount"),
  voucher: "Voucher",
  gift: t("Quà tặng", "Free gift"),
  bundle: t("Mua nhiều giảm nhiều", "Buy more, save more"),
  flash: "Flash sale",
  other: t("Khác", "Other")
}));

export function promoKind(p: Pick<PromotionRow, "name" | "type" | "discount">): PromoKind {
  const ty = (p.type ?? "").toLowerCase();
  if (/flash/.test(ty)) return "flash";
  if (/bmsm|bundle|buy more/.test(ty)) return "bundle";
  if (/fix price|percentage off|product discount|discount/.test(ty)) return "markdown";
  if (/voucher|coupon/.test(ty)) return "voucher";
  if (/gift/.test(ty)) return "gift";
  const n = p.name.toLowerCase();
  if (/flash sale/.test(n)) return "flash";
  if (/\bbuy \d|\bmua \d|combo|mua thêm/.test(n)) return "bundle";
  // VC/Voucher trước quà: "[VC 20%] Baya Pearl white - Black Friday" là voucher dù không có chữ "giảm".
  if (/\bvc\b|\bvc\s?\d|voucher|mã giảm/.test(n)) return "voucher";
  if (/tặng|\bfree\b|quà|gift/.test(n)) return "gift";
  if (/\bmd\b|fix price|^gi[aá]\s|^gía\s|giảm giá|\bprice\b/.test(n)) return "markdown";
  return (p.discount ?? 0) > 0 ? "other" : "gift";
}

/** Mức giảm của một chương trình (%): cột "Tỷ lệ giảm giá trung bình" của TikTok (tiền giảm ÷ giá trước giảm); thiếu thì tự tính
 *  cùng công thức. Chương trình không có tiền giảm (quà tặng) ⇒ null. */
export function promoRate(p: Pick<PromotionRow, "gmv" | "discount" | "discountRate">): number | null {
  if (!p.discount || p.discount <= 0) return null;
  if (p.discountRate != null && p.discountRate > 0) return p.discountRate;
  return p.gmv + p.discount > 0 ? (p.discount / (p.gmv + p.discount)) * 100 : null;
}

export interface PromoGroup {
  kind: PromoKind;
  label: string;
  items: PromotionRow[];
  count: number;
  orders: number;
  discount: number;
  /** % của tổng tiền giảm cả tháng; null khi tháng không có tiền giảm. */
  share: number | null;
  /** Mức giảm thấp nhất – cao nhất trong nhóm (%); null khi nhóm không có tiền giảm. */
  rateMin: number | null;
  rateMax: number | null;
}

/** Nhóm theo loại, nhóm nhiều tiền giảm xếp trước; trong nhóm chương trình xếp theo GMV. */
export function promoGroups(items: PromotionRow[]): PromoGroup[] {
  const total = items.reduce((a, p) => a + (p.discount ?? 0), 0);
  const by = new Map<PromoKind, PromotionRow[]>();
  for (const p of items) {
    const k = promoKind(p);
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  return [...by.entries()]
    .map(([kind, rows]) => {
      const discount = rows.reduce((a, p) => a + (p.discount ?? 0), 0);
      const rates = rows.map(promoRate).filter((r): r is number => r != null);
      return {
        kind,
        label: PROMO_KIND_LABEL[kind],
        items: [...rows].sort((a, b) => b.gmv - a.gmv),
        count: rows.length,
        orders: rows.reduce((a, p) => a + p.orders, 0),
        discount,
        share: total > 0 ? (discount / total) * 100 : null,
        rateMin: rates.length ? Math.min(...rates) : null,
        rateMax: rates.length ? Math.max(...rates) : null
      };
    })
    .sort((a, b) => b.discount - a.discount || b.count - a.count || PROMO_KIND_ORDER.indexOf(a.kind) - PROMO_KIND_ORDER.indexOf(b.kind));
}

// ---------------------------------------------------------------------------------------------------
// Hiệu quả đo được của từng chương trình (user 27/11 "trong dữ liệu gốc rất đầy đủ, check lại"): ghép kỳ chạy (tới phút) với
// Shop Analytics theo ngày. CROCS T11: VC 10% Double Day phủ 48% đơn shop, giỏ 1,00M vs 1,09M đơn thường; quà JB chain phủ 54–78%.
// KHÔNG đo được đơn TĂNG THÊM nhờ chương trình: tháng nào cũng có quà/MD chạy mọi ngày ⇒ không có ngày "sạch" làm mốc.
// Chỉ tính khi kỳ chạy (cắt về tháng + phạm vi file) ≥ 24 giờ và nằm trọn trong các ngày có Shop Analytics: chương trình vài giờ
// (vd "[1.11| 11-14H]") chia theo ngày sẽ sai (đơn dồn vào giờ live — từng ra 124%).

export interface ShopDayOrders { date: string; gmv: number; orders: number }

export interface PromoReach {
  /** % đơn của shop trong kỳ chạy có dùng chương trình. */
  reach: number;
  /** Tiền giảm ÷ đơn dùng (null khi không có tiền giảm). */
  perOrder: number | null;
  /** GMV/đơn của đơn dùng chương trình so với GMV/đơn của cả shop cùng kỳ (%). */
  aovVsShop: number;
}

const MS_DAY = 86_400_000;
const at = (s: string) => Date.parse(s.length <= 10 ? `${s}T00:00:00+07:00` : `${s.replace(" ", "T")}:00+07:00`);

/** Kỳ chạy "2026-11-09 00:00 - 2026-11-12 23:59" (giờ VN) ⇒ mốc ms; sai mẫu ⇒ null. */
export function promoWindow(period: string): { start: number; end: number } | null {
  const m = period.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*-\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
  if (!m) return null;
  const start = at(m[1]), end = at(m[2]) + 60_000;
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function promoReach(p: Pick<PromotionRow, "period" | "gmv" | "orders" | "discount">, days: ShopDayOrders[], monthStart: string, fileEnd?: string): PromoReach | null {
  const w = promoWindow(p.period);
  if (!w || p.orders <= 0 || !days.length) return null;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const shopFrom = at(sorted[0].date), shopTo = at(sorted[sorted.length - 1].date) + MS_DAY;
  const from = Math.max(w.start, at(monthStart));
  const to = Math.min(w.end, fileEnd ? at(fileEnd) : w.end);
  if (to - from < MS_DAY || from < shopFrom || to > shopTo) return null;
  let orders = 0, gmv = 0;
  for (const d of sorted) {
    const a = Math.max(from, at(d.date)), b = Math.min(to, at(d.date) + MS_DAY);
    if (b <= a) continue;
    const f = (b - a) / MS_DAY;
    orders += d.orders * f;
    gmv += d.gmv * f;
  }
  if (orders <= 0 || gmv <= 0) return null;
  const reach = (p.orders / orders) * 100;
  if (reach > 100) return null;
  return { reach, perOrder: p.discount && p.discount > 0 ? p.discount / p.orders : null, aovVsShop: (p.gmv / p.orders / (gmv / orders) - 1) * 100 };
}
