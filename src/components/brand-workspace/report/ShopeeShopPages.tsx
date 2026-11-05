import React from "react";
import { fmtFixed } from "../../../lib/format";
import { SHOPEE_SHOP as SS } from "../../../lib/metricGlossary";
import { shopeeShopMonthThrough, shopeeShopSourcesThrough, shopeeShopSpikeDays, type ShopeeShopMonth, type ShopeeShopDay, type ShopeeShopSnapshot } from "../../../lib/report/shopeeShopReport";
import { DemoHead, DemoKpis, DemoPage, DemoPanel, DemoStack, DemoTable, Html, type DemoKpi } from "./DemoBlocks";
import { esc, fmtM, fmtP, hbars, svg, tbl, TX } from "./demoCharts";
import { monthLong, monthShort, numLocale, t as tr } from "../../../lib/displayLang";

// 3 trang CẢ SHOP của Report Tháng Shopee (bản 7, 31/10/2026) + các khối cả shop gắn vào trang Sản phẩm / Quảng cáo / Đơn huỷ.
// Số lấy từ bản chụp (`shop`, `shopPrev`) — dựng từ 5 file cả shop ở Dữ Liệu Gốc. GMV = Sales(Placed Order).
// Tên chỉ số và kênh dùng đúng chữ Seller Centre Shopee (SHOPEE_SHOP ở metricGlossary). Nhãn "Bối cảnh cả shop": phần không do YFB vận hành (Product card, voucher, khuyến mãi) không tính là kết quả của YFB.

const COLOR = { live: "#e0b43c", aff: "#d95926", video: "#199e70", card: "#3987e5" };
const pc = (v: number | null, d = 1) => (v == null ? "—" : `${fmtFixed(v, d)}%`);
const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const growth = (prev: number | null | undefined, cur: number | null | undefined) => (prev != null && cur != null && prev > 0 ? (cur / prev - 1) * 100 : null);
const chgCell = (v: number | null) => (v == null ? "—" : { t: fmtP(v, 0), c: v >= 0 ? "up" : "dn" });
const chgNote = (v: number | null, vs: string) => (v == null ? null : <span style={{ color: v >= 0 ? "var(--green)" : "var(--red)" }}>{v >= 0 ? "+" : "−"}{fmtFixed(Math.abs(v), 1)}% {vs}</span>);
/** "478000~1.738e+06" (Shopee ghi số khoa học) → "478K – 1,74M". */
const bandLabel = (band: string) => band.split("~").map((x) => (x.trim() === "∞" ? "∞" : Number.isFinite(Number(x)) ? fmtM(Number(x)) : x)).join(" – ");

/** Ghép các ghi chú của ô KPI bằng dấu chấm giữa, bỏ ghi chú rỗng. */
const notes = (...xs: (React.ReactNode | null)[]) => xs.filter((x) => x != null).map((x, i) => <React.Fragment key={i}>{i > 0 && " · "}{x}</React.Fragment>);
const nf = (v: number) => Math.round(v).toLocaleString(numLocale());

/** Nhãn nhỏ "Bối cảnh cả shop" đặt đầu panel: phần ngoài phạm vi vận hành của YFB. */
export const ContextTag: React.FC = () => <span style={{ fontSize: 11, color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 99, padding: "1px 8px", marginLeft: 8 }}>{tr("Bối cảnh cả shop", "Whole-shop context")}</span>;

const MissingFile: React.FC<{ what: string; canManage: boolean; gift?: boolean }> = ({ what, canManage, gift }) => (
  <p className="pns">
    {gift
      ? tr("Mục này chưa hiện số: file Shopee không tách được phần hàng quà tặng không bán, mà quà tặng đang bị ghi vào doanh số. Có file đã loại SKU quà tặng thì mục này hiện lại.", "Not shown yet: the Shopee file cannot separate non-sale gift items, which are being counted as sales. This section returns once a file without gift SKUs is available.")
      : canManage ? `Chưa có file ${what} của tháng này — tải ở Dữ Liệu Gốc, nhóm "File cả shop".` : tr("Chưa có số liệu cho phần này trong tháng.", "No data for this section this month yet.")}
  </p>
);

// ───────── biểu đồ cột theo ngày (placed, phần LIVE tô riêng) ─────────
function dayChart(days: ShopeeShopDay[], monthDays: number): string {
  const W = 700, H = 210, l = 40, r = 8, t = 14, b = 26;
  const maxV = Math.max(...days.map((d) => d.placed), 1);
  const unit = Math.pow(10, Math.floor(Math.log10(maxV)));
  const max = Math.ceil(maxV / unit) * unit;
  const bw = (W - l - r) / monthDays;
  const Y = (v: number) => t + (1 - v / max) * (H - t - b);
  let out = "";
  for (const f of [0, 0.5, 1]) out += `<line x1="${l}" x2="${W - r}" y1="${Y(max * f)}" y2="${Y(max * f)}" style="stroke:var(--line)"/>` + TX(l - 5, Y(max * f) + 4, fmtM(max * f), { a: "end", s: 10 });
  for (const d of days) {
    const x = l + (d.d - 1) * bw + 1.5;
    const w = Math.max(2, bw - 3);
    const liveLike = d.live + d.affLive;
    out += `<rect x="${x}" y="${Y(d.placed)}" width="${w}" height="${Math.max(0, H - b - Y(d.placed))}" rx="2" style="fill:${COLOR.card};opacity:.75"><title>${d.d}: ${esc(fmtM(d.placed))}</title></rect>`;
    if (liveLike > 0) out += `<rect x="${x}" y="${Y(liveLike)}" width="${w}" height="${Math.max(0, H - b - Y(liveLike))}" rx="2" style="fill:${COLOR.live}"/>`;
    if (d.d === 1 || d.d % 5 === 0) out += TX(x + w / 2, H - 8, String(d.d), { s: 10 });
  }
  return svg(W, H, out);
}

export const shopeeShopHeadlines = (shop: ShopeeShopSnapshot | null | undefined, prev: ShopeeShopSnapshot | null | undefined) => {
  if (!shop) return { growth: "", channels: "", promo: "" };
  const cur = shopeeShopSourcesThrough(shop, 31);
  const spikes = shopeeShopSpikeDays(shop);
  const newShare = shop.buyerMix?.groups.find((g) => g.name === "new");
  const all = shop.discount?.types.find((t) => t.type === "Tất cả");
  return {
    growth: tr(
      `${SS.totalSales} ${fmtM(shop.placed)}, ${shop.newBuyers > 0 && shop.buyers > 0 ? `${pc(ratio(shop.newBuyers, shop.buyers), 0)} số người mua là ${SS.newBuyers.toLowerCase()}` : `chưa tách ${SS.newBuyers.toLowerCase()}`}${newShare ? `, mang ${pc(newShare.share, 0)} doanh số` : ""}${spikes.days.length ? `. ${spikes.days.length} ngày có đơn lớn tạo ${pc(spikes.share * 100, 0)} doanh số tháng.` : "."}`,
      `${SS.totalSales} ${fmtM(shop.placed)}, ${shop.newBuyers > 0 && shop.buyers > 0 ? `${pc(ratio(shop.newBuyers, shop.buyers), 0)} of buyers are ${SS.newBuyers.toLowerCase()}` : `${SS.newBuyers.toLowerCase()} not separated yet`}${newShare ? `, bringing ${pc(newShare.share, 0)} of sales` : ""}${spikes.days.length ? `. ${spikes.days.length} day(s) with large orders made ${pc(spikes.share * 100, 0)} of the month's sales.` : "."}`
    ),
    channels: `${SS.productCard} ${pc(ratio(cur.card, cur.total), 0)}, ${SS.sellerLive} ${pc(ratio(cur.live, cur.total), 1)}, ${SS.affiliate} ${pc(ratio(cur.affiliate, cur.total), 1)}, ${SS.sellerVideo} ${pc(ratio(cur.video, cur.total), 1)}${prev ? "" : tr(". Tháng trước chưa có file cả shop để so", ". No whole-shop file for last month to compare")}.`,
    promo: shop.discount || shop.voucher
      ? tr(
          `${all ? `${pc(ratio(all.sales, shop.placed), 0)} doanh số đi qua ${SS.promotion.toLowerCase()}` : ""}${all && shop.voucher ? ", " : ""}${shop.voucher ? `${SS.voucher} tạo ${pc(ratio(shop.voucher.sales, shop.placed), 0)} với ${SS.cost.toLowerCase()} ${pc(ratio(shop.voucher.cost, shop.voucher.sales), 1)} doanh số ${SS.voucher}` : ""}.`,
          `${all ? `${pc(ratio(all.sales, shop.placed), 0)} of sales went through ${SS.promotion.toLowerCase()}` : ""}${all && shop.voucher ? ", " : ""}${shop.voucher ? `${SS.voucher} drove ${pc(ratio(shop.voucher.sales, shop.placed), 0)} at a ${SS.cost.toLowerCase()} of ${pc(ratio(shop.voucher.cost, shop.voucher.sales), 1)} of ${SS.voucher} sales` : ""}.`
        )
      : shop.gift ? tr(`Khuyến mãi và ${SS.voucher.toLowerCase()} chưa hiện số vì file chưa tách được hàng quà tặng.`, `Promotions and ${SS.voucher.toLowerCase()} are not shown yet because the file cannot separate gift items.`) : tr(`Chưa có file ${SS.voucher} / Discount.`, `No ${SS.voucher} / Discount file yet.`)
  };
};

interface PageProps {
  no: string;
  title: string;
  headline: string;
  shop: ShopeeShopSnapshot | null;
  prev: ShopeeShopSnapshot | null;
  /** "Tháng 9" — nhãn tháng trước. */
  prevLabel: string;
  /** 3 tháng gần nhất (cũ → mới, tháng này ở cuối) — rỗng khi tháng trước chưa có phần cả shop. */
  trend: ShopeeShopMonth[];
  monthDays: number;
  canManage: boolean;
  insight?: React.ReactNode;
}

const Empty: React.FC<PageProps> = (p) => (
  <DemoPage>
    <DemoHead no={p.no} title={p.title} headline={p.headline || tr("Chưa có file Shop Stats của tháng này.", "No Shop Stats file for this month yet.")} />
    <DemoPanel title={tr("Chưa có dữ liệu cả shop", "No whole-shop data yet")}>
      <MissingFile what="Shop Stats (…shopee-shop-stats…xlsx)" canManage={p.canManage} />
    </DemoPanel>
  </DemoPage>
);


// ───────── So sánh 3 tháng gần nhất ─────────
const monthName = (m: ShopeeShopMonth) => monthLong(m.month);
const pctChange = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && a > 0 ? (b / a - 1) * 100 : null);
const pointDiff = (a: number | null, b: number | null) => (a != null && b != null ? b - a : null);
const toneCls = (v: number | null) => (v == null ? "nt" : Math.abs(v) < 1 ? "nt" : v > 0 ? "up" : "dn");
const chgTxt = (v: number | null) => (v == null ? "—" : { t: Math.abs(v) < 0.5 ? "0%" : fmtP(v, 0), c: toneCls(v) });
const ptTxt = (v: number | null) => (v == null ? "—" : { t: `${v >= 0 ? "+" : "−"}${fmtFixed(Math.abs(v), 1)} ${tr("điểm", "pts")}`, c: Math.abs(v) < 0.5 ? "nt" : v > 0 ? "up" : "dn" });
const cut = (trend: ShopeeShopMonth[]) => trend[trend.length - 1].throughDay;
const periodSub = (trend: ShopeeShopMonth[]) => tr(`Cùng kỳ 1–${cut(trend)} mỗi tháng; cột "so TN" là tháng này so với tháng N.`, `Same period 1–${cut(trend)} each month; the "vs" columns compare this month with that month.`);

/** Bảng 3 tháng: mỗi dòng một chỉ số, % tháng này so tháng trước và so 2 tháng trước. */
const trendTable = (trend: ShopeeShopMonth[], rows: { name: string; vals: (number | null)[]; fmt: (v: number) => string; kind?: "pct" | "pt"; bold?: boolean }[]) => {
  const names = trend.map(monthName);
  const last = trend.length - 1;
  return tbl(
    [tr("Chỉ số", "Metric"), ...names, `${tr("so", "vs")} ${monthShort(trend[last - 1].month)}`, ...(trend.length > 2 ? [`${tr("so", "vs")} ${monthShort(trend[0].month)}`] : [])],
    rows.map((r) => {
      const chg = (i: number) => (r.kind === "pt" ? ptTxt(pointDiff(r.vals[i], r.vals[last])) : chgTxt(pctChange(r.vals[i], r.vals[last])));
      return [r.bold ? `<b>${esc(r.name)}</b>` : esc(r.name), ...r.vals.map((v) => (v == null ? "—" : r.fmt(v))), chg(last - 1), ...(trend.length > 2 ? [chg(0)] : [])];
    })
  );
};

/** Trang Tổng quan: doanh số theo bốn nguồn, 3 tháng cùng kỳ. */
export const ShopeeShopTrendPanel: React.FC<{ trend: ShopeeShopMonth[] }> = ({ trend }) => {
  if (trend.length < 2) return null;
  const c = cut(trend);
  const th = trend.map((m) => shopeeShopMonthThrough(m, c));
  const html = trendTable(trend, [
    { name: SS.totalSales, vals: th.map((x) => x.placed), fmt: fmtM, bold: true },
    { name: SS.productCard, vals: th.map((x) => x.card), fmt: fmtM },
    { name: SS.sellerLive, vals: th.map((x) => x.live), fmt: fmtM },
    { name: SS.sellerVideo, vals: th.map((x) => x.video), fmt: fmtM },
    { name: SS.affiliate, vals: th.map((x) => x.affiliate), fmt: fmtM },
    { name: `% ${SS.sellerLive.toLowerCase()} / ${SS.totalSales.toLowerCase()}`, vals: th.map((x) => ratio(x.live + x.affLive, x.placed)), fmt: (v) => pc(v), kind: "pt" }
  ]);
  return (
    <DemoPanel title={tr("Tăng trưởng 3 tháng gần nhất", "Growth over the last 3 months")} sub={<>{SS.salesPlaced} {tr("theo bốn nguồn doanh số.", "by the four sales sources.")} {periodSub(trend)}</>}>
      <DemoTable html={html} />
    </DemoPanel>
  );
};

/** Trang Tăng trưởng: cột doanh số 3 tháng + khách hàng. */
const TrendGrowthPanel: React.FC<{ trend: ShopeeShopMonth[] }> = ({ trend }) => {
  if (trend.length < 2) return null;
  const c = cut(trend);
  const th = trend.map((m) => shopeeShopMonthThrough(m, c));
  const W = 560, H = 190, l = 8, t = 24, b = 28;
  const max = Math.max(...th.map((x) => x.placed), 1);
  const bw = Math.min(90, (W - l * 2) / trend.length - 30);
  const gap = (W - l * 2) / trend.length;
  let chart = "";
  th.forEach((x, i) => {
    const cx = l + gap * i + gap / 2;
    const h = (x.placed / max) * (H - t - b), hl = ((x.live + x.affLive) / max) * (H - t - b);
    const last = i === th.length - 1;
    chart += `<rect x="${cx - bw / 2}" y="${H - b - h}" width="${bw}" height="${h}" rx="4" style="fill:${COLOR.card};opacity:${last ? 0.95 : 0.55}"/>`;
    if (hl > 0) chart += `<rect x="${cx - bw / 2}" y="${H - b - hl}" width="${bw}" height="${hl}" rx="4" style="fill:${COLOR.live}"/>`;
    chart += TX(cx, H - b - h - 6, fmtM(x.placed), { s: 12, w: 700, c: "var(--cream)" }) + TX(cx, H - 10, monthName(trend[i]), { s: 12 });
    if (i > 0) chart += TX(cx, H - b - h - 20, fmtP(pctChange(th[i - 1].placed, x.placed) ?? 0, 0), { s: 11, c: (pctChange(th[i - 1].placed, x.placed) ?? 0) >= 0 ? "var(--green)" : "var(--red)", w: 700 });
  });
  const html = trendTable(trend, [
    { name: SS.visits, vals: trend.map((m) => m.visits), fmt: nf },
    { name: SS.buyers, vals: trend.map((m) => m.buyers), fmt: nf },
    { name: SS.newBuyers, vals: trend.map((m) => m.newBuyers), fmt: nf },
    { name: SS.existingBuyers, vals: trend.map((m) => m.oldBuyers), fmt: nf },
    { name: `% ${SS.newBuyers.toLowerCase()} / ${SS.buyers.toLowerCase()}`, vals: trend.map((m) => ratio(m.newBuyers, m.buyers)), fmt: (v) => pc(v), kind: "pt" },
    { name: `${SS.orderConversion} (${tr("đơn / lượt truy cập", "orders / visits")})`, vals: trend.map((m) => ratio(m.orders, m.visits)), fmt: (v) => pc(v, 2), kind: "pt" }
  ]);
  return (
    <DemoStack>
      <DemoPanel title={`${SS.totalSales} · ${tr("3 tháng", "3 months")}`} sub={<>{tr(`Cột vàng = phần ${SS.sellerLive} và ${SS.affiliateLive}.`, `Gold = ${SS.sellerLive} and ${SS.affiliateLive}.`)} {periodSub(trend)}</>}>
        <Html html={svg(W, H, chart)} />
      </DemoPanel>
      <DemoPanel title={tr("Khách hàng 3 tháng", "Customers over 3 months")} sub={tr("Số cả tháng do Shopee tính (người mua và lượt truy cập là số duy nhất trong kỳ, không cộng được theo ngày).", "Full-month figures from Shopee (buyers and visits are unique within the period and cannot be summed by day).")}>
        <DemoTable html={html} />
      </DemoPanel>
    </DemoStack>
  );
};

/** Trang Kênh bán: cơ cấu bốn nguồn theo tháng (cột 100%) + thay đổi tỷ trọng. */
const TrendChannelsPanel: React.FC<{ trend: ShopeeShopMonth[] }> = ({ trend }) => {
  if (trend.length < 2) return null;
  const c = cut(trend);
  const th = trend.map((m) => shopeeShopMonthThrough(m, c));
  const parts: [string, string, (x: (typeof th)[number]) => number][] = [[SS.productCard, COLOR.card, (x) => x.card], [SS.sellerLive, COLOR.live, (x) => x.live], [SS.sellerVideo, COLOR.video, (x) => x.video], [SS.affiliate, COLOR.aff, (x) => x.affiliate]];
  const bars = th.map((x, i) => `<div class="nm">${esc(monthName(trend[i]))}<small>${fmtM(x.placed)}</small></div><div class="trk" style="display:flex;overflow:hidden">${parts.map(([, color, f]) => `<div style="width:${ratio(f(x), x.placed) ?? 0}%;background:${color}"></div>`).join("")}</div><div class="v">${pc(ratio(x.live + x.affLive, x.placed))} live</div>`).join("");
  const last = th.length - 1;
  const html = tbl(
    [tr("Nguồn doanh số", "Sales source"), ...trend.map((m) => `% ${monthName(m)}`), `${monthName(trend[last])} ${tr("so", "vs")} ${monthName(trend[last - 1])}`],
    parts.map(([name, , f]) => [esc(name), ...th.map((x) => pc(ratio(f(x), x.placed))), ptTxt(pointDiff(ratio(f(th[last - 1]), th[last - 1].placed), ratio(f(th[last]), th[last].placed)))])
  );
  return (
    <DemoPanel title={tr("Cơ cấu nguồn doanh số 3 tháng", "Sales source mix over 3 months")} sub={<>{tr(`Tỷ trọng trong ${SS.totalSales.toLowerCase()}.`, `Share of ${SS.totalSales.toLowerCase()}.`)} {periodSub(trend)}</>}>
      <Html className="hb" html={bars} />
      <div className="leg" style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>{parts.map(([name, color]) => <span key={name}><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: color, marginRight: 6 }} />{name}</span>)}</div>
      <DemoTable html={html} />
    </DemoPanel>
  );
};

/** Trang Khuyến mãi: tỷ trọng khuyến mãi / voucher và chi phí voucher theo tháng. */
const TrendPromoPanel: React.FC<{ trend: ShopeeShopMonth[] }> = ({ trend }) => {
  if (trend.length < 2 || !trend.some((m) => m.discountSales != null || m.voucherSales != null)) return null;
  const html = trendTable(trend, [
    { name: `${tr("Doanh số qua", "Sales via")} ${SS.promotion.toLowerCase()}`, vals: trend.map((m) => m.discountSales), fmt: fmtM },
    { name: `% ${SS.promotion.toLowerCase()} / ${SS.totalSales.toLowerCase()}`, vals: trend.map((m) => (m.discountSales != null ? ratio(m.discountSales, m.placed) : null)), fmt: (v) => pc(v, 0), kind: "pt" },
    { name: `${tr("Doanh số qua", "Sales via")} ${SS.voucher}`, vals: trend.map((m) => m.voucherSales), fmt: fmtM },
    { name: `% ${SS.voucher} / ${SS.totalSales.toLowerCase()}`, vals: trend.map((m) => (m.voucherSales != null ? ratio(m.voucherSales, m.placed) : null)), fmt: (v) => pc(v, 0), kind: "pt" },
    { name: `${SS.cost} ${SS.voucher}`, vals: trend.map((m) => m.voucherCost), fmt: fmtM },
    { name: `${SS.cost} / ${tr("doanh số", "sales")} ${SS.voucher}`, vals: trend.map((m) => (m.voucherCost != null && m.voucherSales ? ratio(m.voucherCost, m.voucherSales) : null)), fmt: (v) => pc(v, 1), kind: "pt" }
  ]);
  return (
    <DemoPanel title={tr("Khuyến mãi và Voucher 3 tháng", "Promotions and Vouchers over 3 months")} sub={tr("Số cả tháng của file Discount và Voucher; % tính trên tổng doanh số cả tháng.", "Full-month figures from the Discount and Voucher files; % of total monthly sales.")}>
      <DemoTable html={html} />
    </DemoPanel>
  );
};

// ───────── Trang: Tăng trưởng & khách hàng ─────────
export const ShopeeGrowthPage: React.FC<PageProps> = (p) => {
  const { shop, prev } = p;
  if (!shop) return <Empty {...p} />;
  const through = shop.throughDay;
  const prevCut = prev ? prev.days.filter((d) => d.d <= through) : null;
  const sumP = (f: (d: ShopeeShopDay) => number) => (prevCut ? prevCut.reduce((a, d) => a + f(d), 0) : null);
  const vs = `${tr("so", "vs")} ${p.prevLabel}`;
  const mix = shop.buyerMix;
  const newG = mix?.groups.find((g) => g.name === "new"), oldG = mix?.groups.find((g) => g.name === "existing");
  const spikes = shopeeShopSpikeDays(shop);
  const tiles: DemoKpi[] = [
    { lab: `${SS.totalSales} · ${tr("tới ngày", "to day")} ${through}`, val: fmtM(shop.placed), note: notes(chgNote(growth(sumP((d) => d.placed), shop.placed), vs), `${SS.salesConfirmed} ${fmtM(shop.confirmed)}`) },
    { lab: SS.visits, val: nf(shop.visits), note: notes(chgNote(growth(sumP((d) => d.visits), shop.visits), vs), `${SS.orderConversion.toLowerCase()} ${pc(ratio(shop.orders, shop.visits), 2)}`) },
    { lab: SS.buyers, val: nf(shop.buyers), note: notes(`${nf(shop.newBuyers)} ${SS.newBuyers.toLowerCase()}, ${nf(shop.oldBuyers)} ${SS.existingBuyers.toLowerCase()}`) },
    { lab: `${tr("Doanh số từ", "Sales from")} ${SS.newBuyers.toLowerCase()}`, val: newG ? fmtM(newG.sales) : "—", note: newG ? `${pc(newG.share, 0)} ${tr("doanh số", "of sales")} · ${nf(newG.buyers)} ${tr("người mua", "buyers")}` : shop.gift ? tr("chưa tách được hàng quà tặng", "gift items not separated yet") : `${tr("chưa có file", "no file yet:")} ${SS.salesComposition}` }
  ];
  const buyerBars = mix && newG && oldG
    ? hbars([
        { name: SS.newBuyers, sub: `${nf(newG.buyers)} ${tr("người · tỷ lệ chuyển đổi", "people · conversion rate")} ${pc(newG.conversion, 1)}`, value: newG.sales / 1e6, text: `${fmtM(newG.sales)} · ${pc(newG.share, 0)}`, cls: "" },
        { name: SS.existingBuyers, sub: `${nf(oldG.buyers)} ${tr("người · tỷ lệ chuyển đổi", "people · conversion rate")} ${pc(oldG.conversion, 1)}`, value: oldG.sales / 1e6, text: `${fmtM(oldG.sales)} · ${pc(oldG.share, 0)}`, cls: "" }
      ])
    : "";
  const priceHtml = mix?.prices.length
    ? tbl([SS.priceBand, tr("Người mua", "Buyers"), tr("Doanh số", "Sales"), tr("% doanh số", "% of sales"), tr("Tỷ lệ chuyển đổi", "Conversion rate")], mix.prices.map((x) => [esc(bandLabel(x.band)), nf(x.buyers), fmtM(x.sales), pc(ratio(x.sales, mix.prices.reduce((a, y) => a + y.sales, 0))), pc(x.conversion, 2)]))
    : "";
  return (
    <DemoPage>
      <DemoHead no={p.no} title={p.title} headline={p.headline} />
      <DemoKpis items={tiles} />
      <DemoPanel title={`${SS.totalSales} ${tr("mỗi ngày", "by day")}`} sub={<>{tr(`Cột xanh dương = ${SS.totalSales.toLowerCase()} (Đơn đã đặt), cột vàng = phần ${SS.sellerLive} và ${SS.affiliateLive}. Dữ liệu tới ngày ${through}.`, `Blue = ${SS.totalSales.toLowerCase()} (placed orders), gold = ${SS.sellerLive} and ${SS.affiliateLive}. Data through day ${through}.`)}<ContextTag /></>}>
        <Html html={dayChart(shop.days, p.monthDays)} />
        {shop.gift && (
          <p className="pns">
            {tr(
              `Đã trừ ${fmtM(shop.gift.sales)} hàng quà tặng không bán khỏi ${SS.totalSales.toLowerCase()}. Số theo ngày là ước lượng (chia theo doanh số hủy của các ngày có đơn quà tặng); ${SS.orders.toLowerCase()}, ${SS.buyers.toLowerCase()} và ${SS.orderConversion.toLowerCase()} còn gồm đơn quà tặng nên chưa chính xác.`,
              `${fmtM(shop.gift.sales)} of non-sale gift items was removed from ${SS.totalSales.toLowerCase()}. Daily figures are estimates (allocated by cancelled sales on days with gift orders); ${SS.orders.toLowerCase()}, ${SS.buyers.toLowerCase()} and ${SS.orderConversion.toLowerCase()} still include gift orders, so they are not exact.`
            )}
          </p>
        )}
        {spikes.days.length > 0 && (
          <p className="pns">
            {tr(
              `${spikes.days.length} ngày (${spikes.days.map((d) => d.d).join(", ")}) mỗi ngày trên 3 lần trung vị, cộng lại ${fmtM(spikes.days.reduce((a, d) => a + d.placed, 0))}, bằng ${pc(spikes.share * 100, 0)} doanh số tháng và chỉ có ${spikes.days.reduce((a, d) => a + d.orders, 0)} đơn. Doanh số cả shop nhảy theo vài đơn giá trị cao, không theo đều từng ngày.`,
              `${spikes.days.length} day(s) (${spikes.days.map((d) => d.d).join(", ")}) each above 3× the median, totalling ${fmtM(spikes.days.reduce((a, d) => a + d.placed, 0))}, ${pc(spikes.share * 100, 0)} of the month's sales from only ${spikes.days.reduce((a, d) => a + d.orders, 0)} orders. Whole-shop sales jump with a few high-value orders rather than evenly by day.`
            )}
          </p>
        )}
      </DemoPanel>
      <TrendGrowthPanel trend={p.trend} />
      <DemoStack>
        <DemoPanel title={`${SS.newBuyers} ${tr("và", "and")} ${SS.existingBuyers.toLowerCase()}`} sub={<>{tr("Doanh số đặt theo nhóm người mua.", "Placed sales by buyer group.")}<ContextTag /></>}>
          {buyerBars ? <Html className="hb" html={buyerBars} /> : <MissingFile what={`${SS.salesComposition} (sales_composition_…xlsx)`} canManage={p.canManage} gift={!!shop.gift} />}
        </DemoPanel>
        <DemoPanel title={SS.priceBand} sub={<>{tr(`Người mua và doanh số theo khung giá, từ file ${SS.salesComposition}.`, `Buyers and sales by price band, from the ${SS.salesComposition} file.`)}<ContextTag /></>}>
          {priceHtml ? <DemoTable html={priceHtml} /> : <MissingFile what={`${SS.salesComposition} (sales_composition_…xlsx)`} canManage={p.canManage} />}
        </DemoPanel>
      </DemoStack>
      {p.insight}
    </DemoPage>
  );
};

// ───────── Trang: Kênh bán ─────────
const srcBlockLabel = (b: string): string =>
  (({ card: SS.productCard, live: SS.sellerLive, video: SS.sellerVideo, affiliate: SS.affiliate, ads: `${SS.shopeeAds} ${tr("(chồng lên các kênh)", "(overlaps the channels)")}` }) as Record<string, string>)[b];

export const ShopeeChannelsPage: React.FC<PageProps> = (p) => {
  const { shop, prev } = p;
  if (!shop || !shop.channels) return <Empty {...p} />;
  const cur = shopeeShopSourcesThrough(shop, shop.throughDay);
  const pv = prev ? shopeeShopSourcesThrough(prev, Math.min(shop.throughDay, prev.throughDay)) : null;
  const total = cur.total;
  // Đúng bốn nguồn doanh số của Shopee; Tiếp thị liên kết kèm Affiliate Video / Affiliate Live. Bốn dòng đầu cộng đúng Tổng doanh số.
  const rows: { name: string; v: number; pv: number | null; sub?: boolean }[] = [
    { name: SS.productCard, v: cur.card, pv: pv?.card ?? null },
    { name: SS.sellerLive, v: cur.live, pv: pv?.live ?? null },
    { name: SS.sellerVideo, v: cur.video, pv: pv?.video ?? null },
    { name: SS.affiliate, v: cur.affiliate, pv: pv?.affiliate ?? null },
    { name: SS.affiliateVideo, v: cur.affVideo, pv: pv?.affVideo ?? null, sub: true },
    { name: SS.affiliateLive, v: cur.affLive, pv: pv?.affLive ?? null, sub: true },
    { name: SS.totalSales, v: total, pv: pv?.total ?? null }
  ];
  const chanHtml = tbl(
    [tr("Nguồn doanh số", "Sales source"), tr("Doanh số", "Sales"), `% ${SS.totalSales.toLowerCase()}`, `${tr("So", "vs")} ${p.prevLabel}`],
    rows.map((r) => [r.sub ? `<span class="nt" style="padding-left:14px">${esc(r.name)}</span>` : `<b>${esc(r.name)}</b>`, fmtM(r.v), pc(ratio(r.v, total)), chgCell(growth(r.pv, r.v))])
  );
  const blocks = ["card", "live", "affiliate", "video"] as const;
  const srcHtml = blocks
    .map((b) => {
      const rs = shop.sources.filter((s) => s.block === b);
      if (!rs.length) return "";
      const head = rs[0];
      const sub = rs.slice(1).filter((s) => s.sales > 0);
      return [{ grp: esc(srcBlockLabel(b)) }, ...[head, ...sub].map((s, i) => [i === 0 ? `<b>${esc(s.source)}</b>` : `<span class="nt" style="padding-left:14px">${esc(s.source)}</span>`, fmtM(s.sales), pc(ratio(s.sales, head.sales > 0 ? head.sales : total)), s.orders > 0 ? nf(s.orders) : "—", s.clicks > 0 ? nf(s.clicks) : "—"])];
    })
    .flat()
    .filter(Boolean);
  const adsRows = shop.sources.filter((s) => s.block === "ads" && (s.sales > 0 || s.cost > 0));
  const spikes = shopeeShopSpikeDays(shop);
  return (
    <DemoPage>
      <DemoHead no={p.no} title={p.title} headline={p.headline} />
      <DemoPanel
        title={`${SS.totalSales} ${tr("theo nguồn doanh số", "by sales source")}`}
        sub={tr(`Đơn đã đặt, tới ngày ${shop.throughDay}. % so ${p.prevLabel} cùng ngày. Bốn nguồn đầu cộng đúng ${SS.totalSales.toLowerCase()}.`, `Placed orders through day ${shop.throughDay}. % vs ${p.prevLabel}, same days. The first four sources add up exactly to ${SS.totalSales.toLowerCase()}.`)}
      >
        <DemoTable html={chanHtml} />
        {!pv && <p className="pns">{tr(`${p.prevLabel} chưa có file cả shop nên chưa so được.`, `${p.prevLabel} has no whole-shop file, so no comparison yet.`)}</p>}
      </DemoPanel>
      <TrendChannelsPanel trend={p.trend} />
      <DemoPanel title={`${SS.traffic} ${tr("của từng nguồn doanh số", "for each sales source")}`} sub={<>{tr("Doanh số (Đơn đã đặt) theo nguồn lưu lượng dẫn vào đơn.", "Sales (placed orders) by the traffic source leading to the order.")}<ContextTag /></>}>
        <DemoTable html={tbl([SS.traffic, tr("Doanh số", "Sales"), tr("% trong nguồn doanh số", "% within sales source"), tr("Đơn", "Orders"), SS.productClicks], srcHtml)} />
        {shop.gift && <p className="pns">{tr(`Chỉ hiện nguồn lưu lượng tổng của ${SS.productCard}: các nguồn con (Tìm kiếm, Đề xuất, Khác…) còn gồm hàng quà tặng nên chưa hiện.`, `Only the total traffic for ${SS.productCard} is shown: the sub-sources (Search, Recommendation, Other…) still include gift items.`)}</p>}
        {(shop.sources.find((s) => s.block === "card" && s.source === "Khác")?.share ?? 0) > 30 && (
          <p className="pns">
            {tr(`Nguồn "Khác" chiếm phần lớn ${SS.productCard}; Shopee không cho biết đây là nguồn gì.`, `The "Other" source makes up most of ${SS.productCard}; Shopee does not say what it is.`)}{" "}
            {spikes.days.length > 0 ? tr("Phần này có thể cùng nhóm với các đơn lớn ở những ngày doanh số nhảy, cần xác nhận với brand.", "It may be the same group as the large orders on spike days; to be confirmed with the brand.") : ""}
          </p>
        )}
      </DemoPanel>
      {adsRows.length > 0 && (
        <DemoPanel title={`${tr("Doanh số qua", "Sales via")} ${SS.shopeeAds}`} sub={tr(`Chồng lên các nguồn doanh số, đã nằm trong ${SS.totalSales.toLowerCase()}, không cộng thêm.`, `Overlaps the sales sources; already included in ${SS.totalSales.toLowerCase()}, not added on top.`)}>
          <DemoTable html={tbl([tr("Loại quảng cáo", "Ad type"), tr("Doanh số", "Sales"), SS.cost, "ROAS"], adsRows.map((s) => [esc(s.source), fmtM(s.sales), s.cost > 0 ? fmtM(s.cost) : "—", s.roas > 0 ? fmtFixed(s.roas, 1) : "—"]))} />
        </DemoPanel>
      )}
      {p.insight}
    </DemoPage>
  );
};

// ───────── Trang: Khuyến mãi & voucher ─────────
export const ShopeePromoPage: React.FC<PageProps> = (p) => {
  const { shop } = p;
  if (!shop) return <Empty {...p} />;
  const d = shop.discount, v = shop.voucher;
  const all = d?.types.find((t) => t.type === "Tất cả");
  const tiles: DemoKpi[] = [
    { lab: `${tr("Doanh số qua", "Sales via")} ${SS.promotion.toLowerCase()}`, val: all ? fmtM(all.sales) : "—", note: all ? `${pc(ratio(all.sales, shop.placed), 0)} ${SS.totalSales.toLowerCase()} · ${all.orders} ${tr("đơn", "orders")}` : shop.gift ? tr("chưa tách được hàng quà tặng", "gift items not separated yet") : tr("chưa có file Discount", "no Discount file yet") },
    { lab: `${tr("Doanh số qua", "Sales via")} ${SS.voucher}`, val: v ? fmtM(v.sales) : "—", note: v ? `${pc(ratio(v.sales, shop.placed), 0)} ${SS.totalSales.toLowerCase()} · ${v.orders} ${tr("đơn", "orders")}` : shop.gift ? tr("chưa tách được hàng quà tặng", "gift items not separated yet") : `${tr("chưa có file", "no file yet:")} ${SS.voucher}` },
    { lab: `${SS.cost} ${SS.voucher}`, val: v ? fmtM(v.cost) : "—", note: v ? `${pc(ratio(v.cost, v.sales), 1)} ${tr("doanh số", "of sales")} ${SS.voucher}` : undefined },
    { lab: `${SS.voucher} (${SS.claimed})`, val: v ? nf(v.claims) : "—", note: v ? `${SS.usageRate} ${pc(ratio(v.orders, v.claims), 1)}` : undefined }
  ];
  const typeHtml = d ? tbl([tr("Loại", "Type"), tr("Doanh số", "Sales"), tr("Đơn", "Orders"), tr("Người mua", "Buyers")], d.types.map((t) => [esc(t.type), fmtM(t.sales), String(t.orders), String(t.buyers)])) : "";
  const progHtml = d?.programs.length ? tbl([tr("Tên chương trình", "Programme"), tr("Loại khuyến mãi", "Promotion type"), tr("Thời gian diễn ra", "Period"), tr("Doanh số", "Sales"), tr("Đơn", "Orders")], d.programs.map((x) => [esc(x.name), esc(x.type.replace(/\s*\(.*\)/, "")), esc(x.period), fmtM(x.sales), String(x.orders)]), [0]) : "";
  const vouHtml = v?.list.length ? tbl([tr("Tên mã giảm giá", "Voucher"), tr("Loại Voucher", "Voucher type"), tr("Trạng thái", "Status"), tr("Doanh số", "Sales"), SS.cost, `${SS.cost} / ${tr("doanh số", "sales")}`], v.list.map((x) => [esc(x.name), esc(x.type), esc(x.status), fmtM(x.sales), x.cost > 0 ? fmtM(x.cost) : "—", x.sales > 0 ? pc(ratio(x.cost, x.sales), 1) : "—"]), [0]) : "";
  return (
    <DemoPage>
      <DemoHead no={p.no} title={p.title} headline={p.headline} />
      <DemoKpis items={tiles} />
      <TrendPromoPanel trend={p.trend} />
      <DemoStack>
        <DemoPanel title={tr("Loại khuyến mãi", "Promotion types")} sub={<>{tr(`Một đơn có thể nằm ở nhiều loại (${SS.promotion}, ${SS.combo}, ${SS.dealShock}) nên các dòng cộng lại có thể lớn hơn "Tất cả".`, `An order can fall into several types (${SS.promotion}, ${SS.combo}, ${SS.dealShock}), so the rows may add up to more than "Tất cả" (All).`)}<ContextTag /></>}>
          {typeHtml ? <DemoTable html={typeHtml} /> : <MissingFile what="Discount (discount_…xlsx)" canManage={p.canManage} gift={!!shop.gift} />}
        </DemoPanel>
      </DemoStack>
      <DemoPanel title={tr(`${SS.promoProgram} lớn nhất`, `Largest ${SS.promoProgram}s`)} sub={<>{tr("Xếp theo doanh số (Đơn đã đặt).", "Ranked by sales (placed orders).")}<ContextTag /></>}>
        {progHtml ? <DemoTable html={progHtml} /> : <MissingFile what="Discount (discount_…xlsx)" canManage={p.canManage} gift={!!shop.gift} />}
      </DemoPanel>
      <DemoPanel title={SS.voucher} sub={<>{tr("Doanh số và chi phí từng mã giảm giá.", "Sales and cost of each voucher.")}<ContextTag /></>}>
        {vouHtml ? <DemoTable html={vouHtml} /> : <MissingFile what="Voucher (voucher_…xlsx)" canManage={p.canManage} gift={!!shop.gift} />}
      </DemoPanel>
      {p.insight}
    </DemoPage>
  );
};

// ───────── Khối gắn vào trang có sẵn ─────────

/** Sản phẩm cả shop (gắn dưới trang Sản phẩm): hàng quà tặng xếp riêng, không tính vào top. */
export const ShopeeShopProductsPanel: React.FC<{ shop: ShopeeShopSnapshot | null; canManage: boolean }> = ({ shop, canManage }) => {
  if (!shop?.products) return <DemoPanel title={tr("Sản phẩm cả shop", "Whole-shop products")}><MissingFile what="Sản phẩm cả shop (producttraffic_Product_Card…xlsx)" canManage={canManage} /></DemoPanel>;
  const real = shop.products.filter((x) => !x.gift).slice(0, 10);
  const gifts = shop.products.filter((x) => x.gift);
  const max = Math.max(...real.map((x) => x.sales), 1);
  const bars = hbars(real.map((x) => ({ name: x.name.length > 58 ? `${x.name.slice(0, 56)}…` : x.name, sub: `${SS.productClicks.toLowerCase()} ${nf(x.clicks)} · ${SS.orderConversion.toLowerCase()} ${pc(x.conversion, 2)}`, value: x.sales, text: fmtM(x.sales), cls: "" })), max);
  return (
    <DemoPanel title={tr("Top sản phẩm cả shop", "Top whole-shop products")} sub={<>{tr(`Doanh số (Đơn đã đặt), mọi nguồn. ${shop.productCount} sản phẩm có số.`, `Sales (placed orders), all sources. ${shop.productCount} products with data.`)}<ContextTag /></>}>
      <Html className="hb" html={bars} />
      {gifts.length > 0 && (
        <p className="pns">
          {tr("Đã loại khỏi xếp hạng", "Excluded from the ranking")}: {gifts.map((g) => `${g.name} (${fmtM(g.sales)}, ${pc(ratio(g.sales, shop.placed), 0)} ${SS.totalSales.toLowerCase()}, ${SS.orderConversion.toLowerCase()} ${pc(g.conversion, 1)})`).join("; ")}.{" "}
          {tr("Hàng quà tặng không bán nhưng ghi nhận doanh số — cần xác nhận với brand đây là hàng gắn vào đơn combo hay ghi nhận sai.", "Gift items are not sold but are recorded as sales — to be confirmed with the brand whether they are attached to bundle orders or recorded in error.")}
        </p>
      )}
    </DemoPanel>
  );
};

/** Đơn huỷ và thực nhận của cả shop (gắn dưới trang Đơn huỷ). Cột "doanh số đơn huỷ" của file chưa dùng vì lệch với số xác nhận. */
export const ShopeeShopCancelPanel: React.FC<{ shop: ShopeeShopSnapshot | null; liveGmv: number; liveConfirmed: number; canManage: boolean; trend?: ShopeeShopMonth[] }> = ({ shop, liveGmv, liveConfirmed, canManage, trend = [] }) => {
  if (!shop) return <DemoPanel title={tr("Cả shop: Đơn đã đặt và Đơn đã xác nhận", "Whole shop: placed vs confirmed orders")}><MissingFile what="Shop Stats (…shopee-shop-stats…xlsx)" canManage={canManage} /></DemoPanel>;
  const rate = ratio(shop.confirmed, shop.placed);
  const liveRate = liveGmv > 0 && liveConfirmed > 0 ? ratio(liveConfirmed, liveGmv) : null;
  const max = shop.placed / 1e6;
  const bars = hbars([
    { name: SS.salesPlaced, sub: `${nf(shop.orders)} ${SS.orders.toLowerCase()}`, value: shop.placed / 1e6, text: fmtM(shop.placed), cls: "" },
    { name: SS.salesConfirmed, sub: `${pc(rate, 1)} ${SS.salesPlaced.toLowerCase()}`, value: shop.confirmed / 1e6, text: fmtM(shop.confirmed), cls: "" },
    ...(liveGmv > 0 ? [{ name: `${SS.sellerLive}: ${SS.salesPlaced}`, sub: tr("file theo ngày", "daily file"), value: liveGmv / 1e6, text: fmtM(liveGmv), cls: "" }] : []),
    ...(liveConfirmed > 0 ? [{ name: `${SS.sellerLive}: ${SS.salesConfirmed}`, sub: `${pc(liveRate, 1)} ${tr("doanh số đã đặt", "of placed sales")}`, value: liveConfirmed / 1e6, text: fmtM(liveConfirmed), cls: "" }] : [])
  ], max);
  return (
    <DemoPanel
      title={tr("Cả shop: Đơn đã đặt và Đơn đã xác nhận", "Whole shop: placed vs confirmed orders")}
      sub={tr(
        `${SS.cancelledOrders} ${nf(shop.cancelOrders)} trên ${nf(shop.orders)} đơn (${pc(ratio(shop.cancelOrders, shop.orders), 1)}), ${SS.refundedOrders.toLowerCase()} ${nf(shop.refundOrders)} đơn.`,
        `${SS.cancelledOrders} ${nf(shop.cancelOrders)} of ${nf(shop.orders)} orders (${pc(ratio(shop.cancelOrders, shop.orders), 1)}), ${SS.refundedOrders.toLowerCase()} ${nf(shop.refundOrders)}.`
      )}
    >
      <Html className="hb" html={bars} />
      {liveRate != null && rate != null && liveRate < rate - 3 && <p className="pns">{tr(`Livestream giữ lại ${pc(liveRate, 1)} khi xác nhận, thấp hơn cả shop (${pc(rate, 1)}).`, `Livestream keeps ${pc(liveRate, 1)} after confirmation, below the whole shop (${pc(rate, 1)}).`)}</p>}
      {trend.length >= 2 && (
        <DemoTable
          html={trendTable(trend, [
            { name: `${SS.salesConfirmed} / ${SS.salesPlaced.toLowerCase()}`, vals: trend.map((m) => ratio(m.confirmed, m.placed)), fmt: (v) => pc(v), kind: "pt" },
            { name: `${SS.cancelledOrders} / ${SS.orders.toLowerCase()}`, vals: trend.map((m) => ratio(m.cancelOrders, m.orders)), fmt: (v) => pc(v), kind: "pt" }
          ])}
        />
      )}
      <p className="pns">{tr(`Báo cáo dùng số ${SS.cancelledOrders.toLowerCase()}, chưa dùng cột "Doanh số đơn hủy" của file Shopee vì lệch với số xác nhận.`, `The report uses the count of ${SS.cancelledOrders.toLowerCase()}, not the Shopee file's cancelled-sales column, which does not match the confirmed figures.`)}</p>
    </DemoPanel>
  );
};

/** Ads theo tỷ trọng cả shop (gắn dưới trang Quảng cáo). */
export const ShopeeShopAdsPanel: React.FC<{ shop: ShopeeShopSnapshot | null }> = ({ shop }) => {
  if (!shop?.channels || shop.channels.ads <= 0) return null;
  const ads = shop.sources.filter((s) => s.block === "ads");
  const cost = ads.reduce((a, s) => a + s.cost, 0);
  return (
    <DemoPanel title={`${SS.shopeeAds} ${tr("trong", "in")} ${SS.totalSales.toLowerCase()}`} sub={tr(`Doanh số Shopee quy cho quảng cáo, nằm trong ${SS.totalSales.toLowerCase()}, không cộng thêm.`, `Sales Shopee attributes to ads, included in ${SS.totalSales.toLowerCase()}, not added on top.`)}>
      <p className="pns">
        {tr("Doanh số qua", "Sales via")} {SS.shopeeAds} {fmtM(shop.channels.ads)}, {pc(ratio(shop.channels.ads, shop.placed), 0)} {SS.totalSales.toLowerCase()}; {SS.cost.toLowerCase()} {fmtM(cost)}, {tr("ROAS chung", "overall ROAS")} {cost > 0 ? fmtFixed(shop.channels.ads / cost, 1) : "—"}.
      </p>
    </DemoPanel>
  );
};
