import { SHOPEE_SHOP_KINDS, shopeeShopData, type ShopeeShopChannels, type ShopeeShopKind } from "../dataraw/shopeeShop";

// Phần "cả shop" của bản chụp Report Tháng Shopee (bản 7, 31/10/2026) — dựng từ 5 file cả shop trong Dữ Liệu Gốc (0193).
// Hàm thuần, không đụng DB. Chỉ giữ số report cần (vài chục KB), không giữ dòng gốc. GMV = Sales(Placed Order).
// Bốn kênh chính (thẻ sản phẩm, Live, Video, liên kết) loại trừ nhau, cộng đúng Total; Ads là lát cắt chồng, không cộng.

type Rows = Record<string, unknown>[];
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

export interface ShopeeShopDay {
  /** Ngày trong tháng (1–31). */
  d: number;
  placed: number;
  confirmed: number;
  orders: number;
  visits: number;
  buyers: number;
  newBuyers: number;
  /** Doanh số đặt theo kênh trong ngày. `affLive` + `affVideo` = liên kết. */
  card: number;
  live: number;
  video: number;
  affLive: number;
  affVideo: number;
}

export interface ShopeeShopPromoRow { name: string; type: string; status: string; period: string; sales: number; orders: number; buyers: number; cost: number }

export interface ShopeeShopSnapshot {
  period: { start: string; end: string };
  /** Ngày cuối có số (file có thể thiếu những ngày cuối tháng). */
  throughDay: number;
  placed: number;
  confirmed: number;
  orders: number;
  cancelOrders: number;
  refundOrders: number;
  visits: number;
  clicks: number;
  buyers: number;
  newBuyers: number;
  oldBuyers: number;
  days: ShopeeShopDay[];
  channels: ShopeeShopChannels | null;
  confirmedChannels: ShopeeShopChannels | null;
  /** Nguồn con của doanh số đặt (Tìm kiếm, Đề xuất, Affiliate Video, các loại Ads…). */
  sources: { block: string; source: string; sales: number; share: number; orders: number; clicks: number; cost: number; roas: number }[];
  /** Khuyến mãi: theo loại, các chương trình lớn nhất; voucher: tổng và các mã lớn nhất. null = chưa tải file. */
  discount: { types: { type: string; sales: number; confirmedSales: number; orders: number; buyers: number }[]; programs: ShopeeShopPromoRow[] } | null;
  voucher: { sales: number; confirmedSales: number; orders: number; claims: number; cost: number; buyers: number; list: ShopeeShopPromoRow[] } | null;
  buyerMix: {
    groups: { name: "new" | "existing"; buyers: number; sales: number; share: number; conversion: number }[];
    categories: { name: string; sales: number; share: number }[];
    prices: { band: string; buyers: number; sales: number; conversion: number }[];
  } | null;
  /** Sản phẩm cả shop xếp theo doanh số đặt (tối đa 25). `gift` = hàng quà tặng không bán — report xếp riêng, không tính vào top. */
  products: { id: string; name: string; sales: number; share: number; impressions: number; clicks: number; orders: number; conversion: number; buyers: number; gift: boolean }[] | null;
  productCount: number;
  warnings: string[];
  files: Record<ShopeeShopKind, boolean>;
}

const isGift = (name: string) => /quà tặng|không bán/i.test(name);

function promoRow(r: Record<string, unknown>): ShopeeShopPromoRow {
  return { name: str(r.name), type: str(r.type), status: str(r.status), period: str(r.period), sales: num(r.sales), orders: num(r.orders), buyers: num(r.buyers), cost: num(r.cost) };
}

/** Dựng phần cả shop từ dòng đã lưu của 5 loại file. Chưa có Shop Stats ⇒ null (report không có phần cả shop). */
export function buildShopeeShopSnapshot(input: Partial<Record<ShopeeShopKind, Rows>>, period: { start: string; end: string } | null, extraWarnings: string[] = []): ShopeeShopSnapshot | null {
  let warnings = extraWarnings;
  const statsRows = input.shopee_shop_stats;
  const data = statsRows ? shopeeShopData(statsRows) : null;
  if (!statsRows || !data || !period) return null;

  // Tên nguồn so không phân biệt hoa thường (tên kênh hiển thị lấy ở metricGlossary, ở đây chỉ là khoá đọc file).
  const blockDay = (block: string, source: string) => {
    const m = new Map<number, number>();
    for (const r of statsRows) if (r.t === "channelDay" && r.block === block && str(r.source).toLowerCase() === source) m.set(Number(String(r.date).slice(8, 10)), num(r.sales));
    return m;
  };
  const card = blockDay("card", "thẻ sản phẩm"), live = blockDay("live", "live"), video = blockDay("video", "video");
  const affLive = blockDay("affiliate", "affiliate live"), affVideo = blockDay("affiliate", "affiliate video");
  const days: ShopeeShopDay[] = data.days.map((x) => {
    const d = Number(x.date.slice(8, 10));
    return { d, placed: x.placed, confirmed: x.confirmed, orders: x.orders, visits: x.visits, buyers: x.buyers, newBuyers: x.newBuyers, card: card.get(d) ?? 0, live: live.get(d) ?? 0, video: video.get(d) ?? 0, affLive: affLive.get(d) ?? 0, affVideo: affVideo.get(d) ?? 0 };
  });

  const ch = data.channels;
  if (ch) {
    const four = ch.card + ch.live + ch.video + ch.affiliate;
    if (Math.abs(four - ch.total) > Math.max(1000, ch.total * 0.001)) warnings = [...warnings, "Bốn nguồn doanh số của Shop Stats không cộng đúng tổng doanh số — kiểm tra file."];
  }
  const disc = input.shopee_discount;
  const vou = input.shopee_voucher;
  const comp = input.shopee_composition;
  const prod = input.shopee_shop_products;
  const products = prod ? prod.filter((r) => r.basis === "placed").sort((a, b) => num(b.sales) - num(a.sales)).slice(0, 25).map((r) => ({ id: str(r.id), name: str(r.name), sales: num(r.sales), share: num(r.share), impressions: num(r.impressions), clicks: num(r.clicks), orders: num(r.orders), conversion: num(r.conversion), buyers: num(r.buyers), gift: isGift(str(r.name)) })) : null;
  const total = vou?.find((r) => r.t === "total");
  const top = (rows: Rows, t: string, n: number) => rows.filter((r) => r.t === t).sort((a, b) => num(b.sales) - num(a.sales)).slice(0, n).map(promoRow);
  return {
    period,
    throughDay: Math.max(...days.map((x) => x.d)),
    placed: data.placed,
    confirmed: data.confirmed,
    orders: data.orders,
    cancelOrders: data.total?.cancelOrders ?? sum(data.days, (x) => x.cancelOrders),
    refundOrders: data.total?.refundOrders ?? sum(data.days, (x) => x.refundOrders),
    visits: data.total?.visits ?? sum(data.days, (x) => x.visits),
    clicks: data.total?.clicks ?? sum(data.days, (x) => x.clicks),
    buyers: data.total?.buyers ?? sum(data.days, (x) => x.buyers),
    newBuyers: data.total?.newBuyers ?? sum(data.days, (x) => x.newBuyers),
    oldBuyers: data.total?.oldBuyers ?? sum(data.days, (x) => x.oldBuyers),
    days,
    channels: data.channels,
    confirmedChannels: data.confirmedChannels,
    sources: data.sources,
    discount: disc
      ? {
          types: disc.filter((r) => r.t === "type").map((r) => ({ type: str(r.type), sales: num(r.sales), confirmedSales: num(r.confirmedSales), orders: num(r.orders), buyers: num(r.buyers) })),
          programs: top(disc, "program", 8)
        }
      : null,
    voucher: vou && total ? { sales: num(total.sales), confirmedSales: num(total.confirmedSales), orders: num(total.orders), claims: num(total.claims), cost: num(total.cost), buyers: num(total.buyers), list: top(vou, "voucher", 8) } : null,
    buyerMix: comp
      ? {
          groups: comp.filter((r) => r.t === "buyerGroup" && r.basis === "placed").map((r) => ({ name: r.name === "new" ? "new" as const : "existing" as const, buyers: num(r.buyers), sales: num(r.sales), share: num(r.share), conversion: num(r.conversion) })),
          categories: comp.filter((r) => r.t === "category" && r.basis === "placed").map((r) => ({ name: str(r.name), sales: num(r.sales), share: num(r.share) })),
          prices: comp.filter((r) => r.t === "price" && r.basis === "placed").map((r) => ({ band: str(r.band), buyers: num(r.buyers), sales: num(r.sales), conversion: num(r.conversion) }))
        }
      : null,
    products,
    productCount: prod ? prod.filter((r) => r.basis === "placed").length : 0,
    warnings,
    files: Object.fromEntries(SHOPEE_SHOP_KINDS.map((k) => [k, !!input[k]])) as Record<ShopeeShopKind, boolean>
  };
}

/** GMV và 4 kênh tính tới hết ngày `day` (bao gồm) — cùng khuôn ChannelSplit của trang Tổng quan TikTok.
 *  Dùng khuôn bảng kênh của trang Tổng quan TikTok: liveLinked = Livestream của người bán, affiliate = Affiliate Live, video = Video của người bán + Affiliate Video. */
export function shopeeShopSplitThrough(shop: ShopeeShopSnapshot, day: number): { shopGmv: number; liveLinked: number; affiliate: number; video: number; card: number } {
  const ds = shop.days.filter((x) => x.d <= day);
  return {
    shopGmv: sum(ds, (x) => x.placed),
    liveLinked: sum(ds, (x) => x.live),
    affiliate: sum(ds, (x) => x.affLive),
    video: sum(ds, (x) => x.video + x.affVideo),
    card: sum(ds, (x) => x.card)
  };
}

/** Doanh số đặt tới hết ngày `day` theo ĐÚNG bốn nguồn của Shopee (Thẻ sản phẩm, Livestream của người bán, Video của người bán, Tiếp thị liên kết). */
export function shopeeShopSourcesThrough(shop: ShopeeShopSnapshot, day: number) {
  const ds = shop.days.filter((x) => x.d <= day);
  const r = { total: sum(ds, (x) => x.placed), card: sum(ds, (x) => x.card), live: sum(ds, (x) => x.live), video: sum(ds, (x) => x.video), affLive: sum(ds, (x) => x.affLive), affVideo: sum(ds, (x) => x.affVideo) };
  return { ...r, affiliate: r.affLive + r.affVideo };
}

/** Livestream (của người bán + Affiliate Live) chiếm bao nhiêu % tổng doanh số. */
export function shopeeShopLiveShare(shop: ShopeeShopSnapshot): number | null {
  const s = shopeeShopSplitThrough(shop, 31);
  return s.shopGmv > 0 ? ((s.liveLinked + s.affiliate) / s.shopGmv) * 100 : null;
}

/** Các ngày có doanh số lớn bất thường (> 3 lần trung vị ngày): lời nhắc "doanh số nhảy theo vài đơn lớn". */
export function shopeeShopSpikeDays(shop: ShopeeShopSnapshot): { days: ShopeeShopDay[]; share: number } {
  const sorted = [...shop.days].map((x) => x.placed).sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const days = shop.days.filter((x) => med > 0 && x.placed > med * 3);
  return { days, share: shop.placed > 0 ? sum(days, (x) => x.placed) / shop.placed : 0 };
}

// ───────── So sánh 3 tháng gần nhất ─────────

/** Tóm tắt một tháng của phần cả shop (nhỏ, nối chuỗi qua các bản chụp: bản chụp tháng N giữ 2 tháng trước nó). */
export interface ShopeeShopMonth {
  month: string;
  throughDay: number;
  /** Doanh số đặt theo ngày và theo nguồn — để so cùng kỳ (cùng số ngày) giữa các tháng. */
  days: { d: number; placed: number; card: number; live: number; video: number; affLive: number; affVideo: number }[];
  placed: number;
  confirmed: number;
  orders: number;
  cancelOrders: number;
  visits: number;
  buyers: number;
  newBuyers: number;
  oldBuyers: number;
  discountSales: number | null;
  voucherSales: number | null;
  voucherCost: number | null;
  newBuyerSales: number | null;
}

export function shopeeShopMonthOf(shop: ShopeeShopSnapshot, month: string): ShopeeShopMonth {
  const all = shop.discount?.types.find((t) => t.type === "Tất cả");
  return {
    month,
    throughDay: shop.throughDay,
    days: shop.days.map((x) => ({ d: x.d, placed: x.placed, card: x.card, live: x.live, video: x.video, affLive: x.affLive, affVideo: x.affVideo })),
    placed: shop.placed,
    confirmed: shop.confirmed,
    orders: shop.orders,
    cancelOrders: shop.cancelOrders,
    visits: shop.visits,
    buyers: shop.buyers,
    newBuyers: shop.newBuyers,
    oldBuyers: shop.oldBuyers,
    discountSales: all ? all.sales : null,
    voucherSales: shop.voucher ? shop.voucher.sales : null,
    voucherCost: shop.voucher ? shop.voucher.cost : null,
    newBuyerSales: shop.buyerMix?.groups.find((g) => g.name === "new")?.sales ?? null
  };
}

/** Doanh số đặt của một tháng tới hết ngày `day` (cùng kỳ), theo bốn nguồn của Shopee. */
export function shopeeShopMonthThrough(m: ShopeeShopMonth, day: number) {
  const ds = m.days.filter((x) => x.d <= day);
  const t = { placed: sum(ds, (x) => x.placed), card: sum(ds, (x) => x.card), live: sum(ds, (x) => x.live), video: sum(ds, (x) => x.video), affLive: sum(ds, (x) => x.affLive), affVideo: sum(ds, (x) => x.affVideo) };
  return { ...t, affiliate: t.affLive + t.affVideo };
}

/** 3 tháng gần nhất (cũ → mới), tháng hiện tại ở cuối. Tháng trước chưa có file cả shop thì chuỗi ngắn hơn; < 2 tháng ⇒ rỗng (không vẽ). */
export function shopeeShopTrend(shop: ShopeeShopSnapshot | null | undefined, month: string, history: ShopeeShopMonth[] | null | undefined): ShopeeShopMonth[] {
  if (!shop) return [];
  const months = [...(history ?? []).filter((h) => h.month < month).sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-2), shopeeShopMonthOf(shop, month)];
  return months.length >= 2 ? months : [];
}
