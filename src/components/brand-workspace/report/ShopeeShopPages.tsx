import React from "react";
import { fmtFixed } from "../../../lib/format";
import { SHOPEE_SHOP as SS } from "../../../lib/metricGlossary";
import { shopeeShopMonthThrough, shopeeShopSourcesThrough, shopeeShopSpikeDays, type ShopeeShopMonth, type ShopeeShopDay, type ShopeeShopSnapshot } from "../../../lib/report/shopeeShopReport";
import { DemoHead, DemoKpis, DemoPage, DemoPanel, DemoStack, DemoTable, Html, type DemoKpi } from "./DemoBlocks";
import { esc, fmtM, fmtP, hbars, svg, tbl, TX } from "./demoCharts";

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
const nf = (v: number) => Math.round(v).toLocaleString("vi-VN");

/** Nhãn nhỏ "Bối cảnh cả shop" đặt đầu panel: phần ngoài phạm vi vận hành của YFB. */
export const ContextTag: React.FC = () => <span style={{ fontSize: 11, color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 99, padding: "1px 8px", marginLeft: 8 }}>Bối cảnh cả shop</span>;

const MissingFile: React.FC<{ what: string; canManage: boolean }> = ({ what, canManage }) => (
  <p className="pns">{canManage ? `Chưa có file ${what} của tháng này — tải ở Dữ Liệu Gốc, nhóm "File cả shop".` : "Chưa có số liệu cho phần này trong tháng."}</p>
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
    growth: `${SS.totalSales} ${fmtM(shop.placed)}, ${shop.newBuyers > 0 && shop.buyers > 0 ? `${pc(ratio(shop.newBuyers, shop.buyers), 0)} số người mua là ${SS.newBuyers.toLowerCase()}` : `chưa tách ${SS.newBuyers.toLowerCase()}`}${newShare ? `, mang ${pc(newShare.share, 0)} doanh số` : ""}${spikes.days.length ? `. ${spikes.days.length} ngày có đơn lớn tạo ${pc(spikes.share * 100, 0)} doanh số tháng.` : "."}`,
    channels: `${SS.productCard} ${pc(ratio(cur.card, cur.total), 0)}, ${SS.sellerLive} ${pc(ratio(cur.live, cur.total), 1)}, ${SS.affiliate} ${pc(ratio(cur.affiliate, cur.total), 1)}, ${SS.sellerVideo} ${pc(ratio(cur.video, cur.total), 1)}${prev ? "" : ". Tháng trước chưa có file cả shop để so"}.`,
    promo: shop.discount || shop.voucher
      ? `${all ? `${pc(ratio(all.sales, shop.placed), 0)} doanh số đi qua ${SS.promotion.toLowerCase()}` : ""}${all && shop.voucher ? ", " : ""}${shop.voucher ? `${SS.voucher} tạo ${pc(ratio(shop.voucher.sales, shop.placed), 0)} với ${SS.cost.toLowerCase()} ${pc(ratio(shop.voucher.cost, shop.voucher.sales), 1)} doanh số ${SS.voucher}` : ""}.`
      : `Chưa có file ${SS.voucher} / Discount.`
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
    <DemoHead no={p.no} title={p.title} headline={p.headline || "Chưa có file Shop Stats của tháng này."} />
    <DemoPanel title="Chưa có dữ liệu cả shop">
      <MissingFile what="Shop Stats (…shopee-shop-stats…xlsx)" canManage={p.canManage} />
    </DemoPanel>
  </DemoPage>
);


// ───────── So sánh 3 tháng gần nhất ─────────
const monthName = (m: ShopeeShopMonth) => `Tháng ${Number(m.month.slice(5))}`;
const pctChange = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && a > 0 ? (b / a - 1) * 100 : null);
const pointDiff = (a: number | null, b: number | null) => (a != null && b != null ? b - a : null);
const toneCls = (v: number | null) => (v == null ? "nt" : Math.abs(v) < 1 ? "nt" : v > 0 ? "up" : "dn");
const chgTxt = (v: number | null) => (v == null ? "—" : { t: Math.abs(v) < 0.5 ? "0%" : fmtP(v, 0), c: toneCls(v) });
const ptTxt = (v: number | null) => (v == null ? "—" : { t: `${v >= 0 ? "+" : "−"}${fmtFixed(Math.abs(v), 1)} điểm`, c: Math.abs(v) < 0.5 ? "nt" : v > 0 ? "up" : "dn" });
const cut = (trend: ShopeeShopMonth[]) => trend[trend.length - 1].throughDay;
const periodSub = (trend: ShopeeShopMonth[]) => `Cùng kỳ 1–${cut(trend)} mỗi tháng; cột "so TN" là tháng này so với tháng N.`;

/** Bảng 3 tháng: mỗi dòng một chỉ số, % tháng này so tháng trước và so 2 tháng trước. */
const trendTable = (trend: ShopeeShopMonth[], rows: { name: string; vals: (number | null)[]; fmt: (v: number) => string; kind?: "pct" | "pt"; bold?: boolean }[]) => {
  const names = trend.map(monthName);
  const last = trend.length - 1;
  return tbl(
    ["Chỉ số", ...names, `so T${Number(trend[last - 1].month.slice(5))}`, ...(trend.length > 2 ? [`so T${Number(trend[0].month.slice(5))}`] : [])],
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
    { name: `% ${SS.sellerLive.toLowerCase()} / tổng doanh số`, vals: th.map((x) => ratio(x.live + x.affLive, x.placed)), fmt: (v) => pc(v), kind: "pt" }
  ]);
  return (
    <DemoPanel title="Tăng trưởng 3 tháng gần nhất" sub={<>{SS.salesPlaced} theo bốn nguồn doanh số. {periodSub(trend)}</>}>
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
    { name: `% ${SS.newBuyers.toLowerCase()} / số người mua`, vals: trend.map((m) => ratio(m.newBuyers, m.buyers)), fmt: (v) => pc(v), kind: "pt" },
    { name: `${SS.orderConversion} (đơn / lượt truy cập)`, vals: trend.map((m) => ratio(m.orders, m.visits)), fmt: (v) => pc(v, 2), kind: "pt" }
  ]);
  return (
    <DemoStack>
      <DemoPanel title={`${SS.totalSales} 3 tháng`} sub={<>Cột vàng = phần {SS.sellerLive} và {SS.affiliateLive}. {periodSub(trend)}</>}>
        <Html html={svg(W, H, chart)} />
      </DemoPanel>
      <DemoPanel title="Khách hàng 3 tháng" sub="Số cả tháng do Shopee tính (người mua và lượt truy cập là số duy nhất trong kỳ, không cộng được theo ngày).">
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
  const bars = th.map((x, i) => `<div class="nm">${esc(monthName(trend[i]))}<small>${fmtM(x.placed)}</small></div><div class="trk" style="display:flex;overflow:hidden">${parts.map(([, color, f]) => `<div style="width:${ratio(f(x), x.placed) ?? 0}%;background:${color}"></div>`).join("")}</div><div class="v">${pc(ratio(x.live + x.affLive, x.placed))} ${esc(SS.sellerLive.split(" ")[0].toLowerCase())}</div>`).join("");
  const last = th.length - 1;
  const html = tbl(
    ["Nguồn doanh số", ...trend.map((m) => `% ${monthName(m)}`), `${monthName(trend[last])} so ${monthName(trend[last - 1])}`],
    parts.map(([name, , f]) => [esc(name), ...th.map((x) => pc(ratio(f(x), x.placed))), ptTxt(pointDiff(ratio(f(th[last - 1]), th[last - 1].placed), ratio(f(th[last]), th[last].placed)))])
  );
  return (
    <DemoPanel title="Cơ cấu nguồn doanh số 3 tháng" sub={<>Tỷ trọng trong {SS.totalSales.toLowerCase()}. {periodSub(trend)}</>}>
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
    { name: `Doanh số qua ${SS.promotion.toLowerCase()}`, vals: trend.map((m) => m.discountSales), fmt: fmtM },
    { name: `% ${SS.promotion.toLowerCase()} / ${SS.totalSales.toLowerCase()}`, vals: trend.map((m) => (m.discountSales != null ? ratio(m.discountSales, m.placed) : null)), fmt: (v) => pc(v, 0), kind: "pt" },
    { name: `Doanh số qua ${SS.voucher}`, vals: trend.map((m) => m.voucherSales), fmt: fmtM },
    { name: `% ${SS.voucher} / ${SS.totalSales.toLowerCase()}`, vals: trend.map((m) => (m.voucherSales != null ? ratio(m.voucherSales, m.placed) : null)), fmt: (v) => pc(v, 0), kind: "pt" },
    { name: `${SS.cost} ${SS.voucher}`, vals: trend.map((m) => m.voucherCost), fmt: fmtM },
    { name: `${SS.cost} / doanh số ${SS.voucher}`, vals: trend.map((m) => (m.voucherCost != null && m.voucherSales ? ratio(m.voucherCost, m.voucherSales) : null)), fmt: (v) => pc(v, 1), kind: "pt" }
  ]);
  return (
    <DemoPanel title="Khuyến mãi và Voucher 3 tháng" sub="Số cả tháng của file Discount và Voucher; % tính trên tổng doanh số cả tháng.">
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
  const vs = `so ${p.prevLabel}`;
  const mix = shop.buyerMix;
  const newG = mix?.groups.find((g) => g.name === "new"), oldG = mix?.groups.find((g) => g.name === "existing");
  const spikes = shopeeShopSpikeDays(shop);
  const tiles: DemoKpi[] = [
    { lab: `${SS.totalSales} · tới ngày ${through}`, val: fmtM(shop.placed), note: notes(chgNote(growth(sumP((d) => d.placed), shop.placed), vs), `${SS.salesConfirmed} ${fmtM(shop.confirmed)}`) },
    { lab: SS.visits, val: nf(shop.visits), note: notes(chgNote(growth(sumP((d) => d.visits), shop.visits), vs), `${SS.orderConversion.toLowerCase()} ${pc(ratio(shop.orders, shop.visits), 2)}`) },
    { lab: SS.buyers, val: nf(shop.buyers), note: notes(`${nf(shop.newBuyers)} ${SS.newBuyers.toLowerCase()}, ${nf(shop.oldBuyers)} ${SS.existingBuyers.toLowerCase()}`) },
    { lab: `Doanh số từ ${SS.newBuyers.toLowerCase()}`, val: newG ? fmtM(newG.sales) : "—", note: newG ? `${pc(newG.share, 0)} doanh số · ${nf(newG.buyers)} người mua` : `chưa có file ${SS.salesComposition}` }
  ];
  const buyerBars = mix && newG && oldG
    ? hbars([
        { name: SS.newBuyers, sub: `${nf(newG.buyers)} người · tỷ lệ chuyển đổi ${pc(newG.conversion, 1)}`, value: newG.sales / 1e6, text: `${fmtM(newG.sales)} · ${pc(newG.share, 0)}`, cls: "" },
        { name: SS.existingBuyers, sub: `${nf(oldG.buyers)} người · tỷ lệ chuyển đổi ${pc(oldG.conversion, 1)}`, value: oldG.sales / 1e6, text: `${fmtM(oldG.sales)} · ${pc(oldG.share, 0)}`, cls: "" }
      ])
    : "";
  const priceHtml = mix?.prices.length
    ? tbl([SS.priceBand, "Người mua", "Doanh số", "% doanh số", "Tỷ lệ chuyển đổi"], mix.prices.map((x) => [esc(bandLabel(x.band)), nf(x.buyers), fmtM(x.sales), pc(ratio(x.sales, mix.prices.reduce((a, y) => a + y.sales, 0))), pc(x.conversion, 2)]))
    : "";
  return (
    <DemoPage>
      <DemoHead no={p.no} title={p.title} headline={p.headline} />
      <DemoKpis items={tiles} />
      <DemoPanel title={`${SS.totalSales} mỗi ngày`} sub={<>Cột xanh dương = {SS.totalSales.toLowerCase()} (Đơn đã đặt), cột vàng = phần {SS.sellerLive} và {SS.affiliateLive}. Dữ liệu tới ngày {through}.<ContextTag /></>}>
        <Html html={dayChart(shop.days, p.monthDays)} />
        {spikes.days.length > 0 && (
          <p className="pns">
            {spikes.days.length} ngày ({spikes.days.map((d) => d.d).join(", ")}) mỗi ngày trên 3 lần trung vị, cộng lại {fmtM(spikes.days.reduce((a, d) => a + d.placed, 0))}, bằng {pc(spikes.share * 100, 0)} doanh số tháng và chỉ có {spikes.days.reduce((a, d) => a + d.orders, 0)} đơn. Doanh số cả shop nhảy theo vài đơn giá trị cao, không theo đều từng ngày.
          </p>
        )}
      </DemoPanel>
      <TrendGrowthPanel trend={p.trend} />
      <DemoStack>
        <DemoPanel title={`${SS.newBuyers} và ${SS.existingBuyers.toLowerCase()}`} sub={<>Doanh số đặt theo nhóm người mua.<ContextTag /></>}>
          {buyerBars ? <Html className="hb" html={buyerBars} /> : <MissingFile what={`${SS.salesComposition} (sales_composition_…xlsx)`} canManage={p.canManage} />}
        </DemoPanel>
        <DemoPanel title={SS.priceBand} sub={<>Người mua và doanh số theo khung giá, từ file {SS.salesComposition}.<ContextTag /></>}>
          {priceHtml ? <DemoTable html={priceHtml} /> : <MissingFile what={`${SS.salesComposition} (sales_composition_…xlsx)`} canManage={p.canManage} />}
        </DemoPanel>
      </DemoStack>
      {p.insight}
    </DemoPage>
  );
};

// ───────── Trang: Kênh bán ─────────
const SRC_BLOCK_LABEL: Record<string, string> = { card: SS.productCard, live: SS.sellerLive, video: SS.sellerVideo, affiliate: SS.affiliate, ads: `${SS.shopeeAds} (chồng lên các kênh)` };

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
    ["Nguồn doanh số", "Doanh số", "% tổng doanh số", `So ${p.prevLabel}`],
    rows.map((r) => [r.sub ? `<span class="nt" style="padding-left:14px">${esc(r.name)}</span>` : `<b>${esc(r.name)}</b>`, fmtM(r.v), pc(ratio(r.v, total)), chgCell(growth(r.pv, r.v))])
  );
  const blocks = ["card", "live", "affiliate", "video"] as const;
  const srcHtml = blocks
    .map((b) => {
      const rs = shop.sources.filter((s) => s.block === b);
      if (!rs.length) return "";
      const head = rs[0];
      const sub = rs.slice(1).filter((s) => s.sales > 0);
      return [{ grp: esc(SRC_BLOCK_LABEL[b]) }, ...[head, ...sub].map((s, i) => [i === 0 ? `<b>${esc(s.source)}</b>` : `<span class="nt" style="padding-left:14px">${esc(s.source)}</span>`, fmtM(s.sales), pc(ratio(s.sales, head.sales > 0 ? head.sales : total)), s.orders > 0 ? nf(s.orders) : "—", s.clicks > 0 ? nf(s.clicks) : "—"])];
    })
    .flat()
    .filter(Boolean);
  const adsRows = shop.sources.filter((s) => s.block === "ads" && (s.sales > 0 || s.cost > 0));
  const spikes = shopeeShopSpikeDays(shop);
  return (
    <DemoPage>
      <DemoHead no={p.no} title={p.title} headline={p.headline} />
      <DemoPanel title={`${SS.totalSales} theo nguồn doanh số`} sub={`Đơn đã đặt, tới ngày ${shop.throughDay}. % so ${p.prevLabel} cùng ngày. Bốn nguồn đầu cộng đúng ${SS.totalSales.toLowerCase()}.`}>
        <DemoTable html={chanHtml} />
        {!pv && <p className="pns">{p.prevLabel} chưa có file cả shop nên chưa so được.</p>}
      </DemoPanel>
      <TrendChannelsPanel trend={p.trend} />
      <DemoPanel title={`${SS.traffic} của từng nguồn doanh số`} sub={<>Doanh số (Đơn đã đặt) theo nguồn lưu lượng dẫn vào đơn.<ContextTag /></>}>
        <DemoTable html={tbl([SS.traffic, "Doanh số", "% trong nguồn doanh số", "Đơn", SS.productClicks], srcHtml)} />
        {(shop.sources.find((s) => s.block === "card" && s.source === "Khác")?.share ?? 0) > 30 && (
          <p className="pns">Nguồn &quot;Khác&quot; chiếm phần lớn {SS.productCard}; Shopee không cho biết đây là nguồn gì. {spikes.days.length > 0 ? "Phần này có thể cùng nhóm với các đơn lớn ở những ngày doanh số nhảy, cần xác nhận với brand." : ""}</p>
        )}
      </DemoPanel>
      {adsRows.length > 0 && (
        <DemoPanel title={`Doanh số qua ${SS.shopeeAds}`} sub={`Chồng lên các nguồn doanh số, đã nằm trong ${SS.totalSales.toLowerCase()}, không cộng thêm.`}>
          <DemoTable html={tbl(["Loại quảng cáo", "Doanh số", SS.cost, "ROAS"], adsRows.map((s) => [esc(s.source), fmtM(s.sales), s.cost > 0 ? fmtM(s.cost) : "—", s.roas > 0 ? fmtFixed(s.roas, 1) : "—"]))} />
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
    { lab: `Doanh số qua ${SS.promotion.toLowerCase()}`, val: all ? fmtM(all.sales) : "—", note: all ? `${pc(ratio(all.sales, shop.placed), 0)} ${SS.totalSales.toLowerCase()} · ${all.orders} đơn` : "chưa có file Discount" },
    { lab: `Doanh số qua ${SS.voucher}`, val: v ? fmtM(v.sales) : "—", note: v ? `${pc(ratio(v.sales, shop.placed), 0)} ${SS.totalSales.toLowerCase()} · ${v.orders} đơn` : `chưa có file ${SS.voucher}` },
    { lab: `${SS.cost} ${SS.voucher}`, val: v ? fmtM(v.cost) : "—", note: v ? `${pc(ratio(v.cost, v.sales), 1)} doanh số ${SS.voucher}` : undefined },
    { lab: `${SS.voucher} (${SS.claimed})`, val: v ? nf(v.claims) : "—", note: v ? `${SS.usageRate} ${pc(ratio(v.orders, v.claims), 1)}` : undefined }
  ];
  const typeHtml = d ? tbl(["Loại", "Doanh số", "Đơn", "Người mua"], d.types.map((t) => [esc(t.type), fmtM(t.sales), String(t.orders), String(t.buyers)])) : "";
  const progHtml = d?.programs.length ? tbl(["Tên chương trình", "Loại khuyến mãi", "Thời gian diễn ra", "Doanh số", "Đơn"], d.programs.map((x) => [esc(x.name), esc(x.type.replace(/\s*\(.*\)/, "")), esc(x.period), fmtM(x.sales), String(x.orders)]), [0]) : "";
  const vouHtml = v?.list.length ? tbl(["Tên mã giảm giá", "Loại Voucher", "Trạng thái", "Doanh số", SS.cost, `${SS.cost} / doanh số`], v.list.map((x) => [esc(x.name), esc(x.type), esc(x.status), fmtM(x.sales), x.cost > 0 ? fmtM(x.cost) : "—", x.sales > 0 ? pc(ratio(x.cost, x.sales), 1) : "—"]), [0]) : "";
  return (
    <DemoPage>
      <DemoHead no={p.no} title={p.title} headline={p.headline} />
      <DemoKpis items={tiles} />
      <TrendPromoPanel trend={p.trend} />
      <DemoStack>
        <DemoPanel title="Loại khuyến mãi" sub={<>Một đơn có thể nằm ở nhiều loại ({SS.promotion}, {SS.combo}, {SS.dealShock}) nên các dòng cộng lại có thể lớn hơn &quot;Tất cả&quot;.<ContextTag /></>}>
          {typeHtml ? <DemoTable html={typeHtml} /> : <MissingFile what="Discount (discount_…xlsx)" canManage={p.canManage} />}
        </DemoPanel>
      </DemoStack>
      <DemoPanel title={`${SS.promoProgram} lớn nhất`} sub={<>Xếp theo doanh số (Đơn đã đặt).<ContextTag /></>}>
        {progHtml ? <DemoTable html={progHtml} /> : <MissingFile what="Discount (discount_…xlsx)" canManage={p.canManage} />}
      </DemoPanel>
      <DemoPanel title={SS.voucher} sub={<>Doanh số và chi phí từng mã giảm giá.<ContextTag /></>}>
        {vouHtml ? <DemoTable html={vouHtml} /> : <MissingFile what="Voucher (voucher_…xlsx)" canManage={p.canManage} />}
      </DemoPanel>
      {p.insight}
    </DemoPage>
  );
};

// ───────── Khối gắn vào trang có sẵn ─────────

/** Sản phẩm cả shop (gắn dưới trang Sản phẩm): hàng quà tặng xếp riêng, không tính vào top. */
export const ShopeeShopProductsPanel: React.FC<{ shop: ShopeeShopSnapshot | null; canManage: boolean }> = ({ shop, canManage }) => {
  if (!shop?.products) return <DemoPanel title="Sản phẩm cả shop"><MissingFile what="Sản phẩm cả shop (producttraffic_Product_Card…xlsx)" canManage={canManage} /></DemoPanel>;
  const real = shop.products.filter((x) => !x.gift).slice(0, 10);
  const gifts = shop.products.filter((x) => x.gift);
  const max = Math.max(...real.map((x) => x.sales), 1);
  const bars = hbars(real.map((x) => ({ name: x.name.length > 58 ? `${x.name.slice(0, 56)}…` : x.name, sub: `${SS.productClicks.toLowerCase()} ${nf(x.clicks)} · ${SS.orderConversion.toLowerCase()} ${pc(x.conversion, 2)}`, value: x.sales, text: fmtM(x.sales), cls: "" })), max);
  return (
    <DemoPanel title="Top sản phẩm cả shop" sub={<>Doanh số (Đơn đã đặt), mọi nguồn. {shop.productCount} sản phẩm có số.<ContextTag /></>}>
      <Html className="hb" html={bars} />
      {gifts.length > 0 && (
        <p className="pns">
          Đã loại khỏi xếp hạng: {gifts.map((g) => `${g.name} (${fmtM(g.sales)}, ${pc(ratio(g.sales, shop.placed), 0)} ${SS.totalSales.toLowerCase()}, ${SS.orderConversion.toLowerCase()} ${pc(g.conversion, 1)})`).join("; ")}. Hàng quà tặng không bán nhưng ghi nhận doanh số — cần xác nhận với brand đây là hàng gắn vào đơn combo hay ghi nhận sai.
        </p>
      )}
    </DemoPanel>
  );
};

/** Đơn huỷ và thực nhận của cả shop (gắn dưới trang Đơn huỷ). Cột "doanh số đơn huỷ" của file chưa dùng vì lệch với số xác nhận. */
export const ShopeeShopCancelPanel: React.FC<{ shop: ShopeeShopSnapshot | null; liveGmv: number; liveConfirmed: number; canManage: boolean; trend?: ShopeeShopMonth[] }> = ({ shop, liveGmv, liveConfirmed, canManage, trend = [] }) => {
  if (!shop) return <DemoPanel title="Cả shop: Đơn đã đặt và Đơn đã xác nhận"><MissingFile what="Shop Stats (…shopee-shop-stats…xlsx)" canManage={canManage} /></DemoPanel>;
  const rate = ratio(shop.confirmed, shop.placed);
  const liveRate = liveGmv > 0 && liveConfirmed > 0 ? ratio(liveConfirmed, liveGmv) : null;
  const max = shop.placed / 1e6;
  const bars = hbars([
    { name: SS.salesPlaced, sub: `${nf(shop.orders)} ${SS.orders.toLowerCase()}`, value: shop.placed / 1e6, text: fmtM(shop.placed), cls: "" },
    { name: SS.salesConfirmed, sub: `${pc(rate, 1)} ${SS.salesPlaced.toLowerCase()}`, value: shop.confirmed / 1e6, text: fmtM(shop.confirmed), cls: "" },
    ...(liveGmv > 0 ? [{ name: `${SS.sellerLive}: ${SS.salesPlaced}`, sub: "file theo ngày", value: liveGmv / 1e6, text: fmtM(liveGmv), cls: "" }] : []),
    ...(liveConfirmed > 0 ? [{ name: `${SS.sellerLive}: ${SS.salesConfirmed}`, sub: `${pc(liveRate, 1)} doanh số đã đặt`, value: liveConfirmed / 1e6, text: fmtM(liveConfirmed), cls: "" }] : [])
  ], max);
  return (
    <DemoPanel title="Cả shop: Đơn đã đặt và Đơn đã xác nhận" sub={`${SS.cancelledOrders} ${nf(shop.cancelOrders)} trên ${nf(shop.orders)} đơn (${pc(ratio(shop.cancelOrders, shop.orders), 1)}), ${SS.refundedOrders.toLowerCase()} ${nf(shop.refundOrders)} đơn.`}>
      <Html className="hb" html={bars} />
      {liveRate != null && rate != null && liveRate < rate - 3 && <p className="pns">Livestream giữ lại {pc(liveRate, 1)} khi xác nhận, thấp hơn cả shop ({pc(rate, 1)}).</p>}
      {trend.length >= 2 && (
        <DemoTable
          html={trendTable(trend, [
            { name: `${SS.salesConfirmed} / ${SS.salesPlaced.toLowerCase()}`, vals: trend.map((m) => ratio(m.confirmed, m.placed)), fmt: (v) => pc(v), kind: "pt" },
            { name: `${SS.cancelledOrders} / ${SS.orders.toLowerCase()}`, vals: trend.map((m) => ratio(m.cancelOrders, m.orders)), fmt: (v) => pc(v), kind: "pt" }
          ])}
        />
      )}
      <p className="pns">Báo cáo dùng số {SS.cancelledOrders.toLowerCase()}, chưa dùng cột "Doanh số đơn hủy" của file Shopee vì lệch với số xác nhận.</p>
    </DemoPanel>
  );
};

/** Ads theo tỷ trọng cả shop (gắn dưới trang Quảng cáo). */
export const ShopeeShopAdsPanel: React.FC<{ shop: ShopeeShopSnapshot | null }> = ({ shop }) => {
  if (!shop?.channels || shop.channels.ads <= 0) return null;
  const ads = shop.sources.filter((s) => s.block === "ads");
  const cost = ads.reduce((a, s) => a + s.cost, 0);
  return (
    <DemoPanel title={`${SS.shopeeAds} trong ${SS.totalSales.toLowerCase()}`} sub={`Doanh số Shopee quy cho quảng cáo, nằm trong ${SS.totalSales.toLowerCase()}, không cộng thêm.`}>
      <p className="pns">
        Doanh số qua {SS.shopeeAds} {fmtM(shop.channels.ads)}, {pc(ratio(shop.channels.ads, shop.placed), 0)} {SS.totalSales.toLowerCase()}; {SS.cost.toLowerCase()} {fmtM(cost)}, ROAS chung {cost > 0 ? fmtFixed(shop.channels.ads / cost, 1) : "—"}.
      </p>
    </DemoPanel>
  );
};
