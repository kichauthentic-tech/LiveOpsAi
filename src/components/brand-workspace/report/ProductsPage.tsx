import React, { useState } from "react";
import { fmtFixed, fmtVndShort } from "../../../lib/format";
import { METRIC } from "../../../lib/metricGlossary";
import type { PromotionMonthSlice, SkuRankSlice } from "../../../lib/dataraw/monthlyProductSlice";
import type { GiftStats } from "../../../lib/report/deepAnalysis";
import type { SkuMoves } from "../../../lib/report/monthlyReportInsights";
import { chartSkuLabel, shortSku } from "../../../lib/report/sectionInsights";
import { rankBadge, type ScatterPoint } from "../../../lib/report/reportVisuals";
import { fmtInt, fmtPct } from "./format";
import { downscaleImage } from "./Visuals";
import { fmtP, heat, scatter, tbl } from "./demoCharts";
import type { PageMetric } from "./ui";

// Trang 5 "Sản phẩm & khuyến mãi" dựng theo demo (scratchpad/build/template.html, #p5): KPI → phân tán + quà tặng → bảng Top SKU (ảnh tải lên)
// → bảng khuyến mãi. Markup/class lấy nguyên từ demo (demo.css, tiền tố .rt); số lấy từ bản chụp tháng.

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c as "&" | "<" | ">" | '"']));
const dec = (v: number, d: number) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const disp = (n: string) => shortSku(n).replace(/ - /g, " ");
const signed = (v: number, d = 1) => fmtP(v, d);
const TONE_VAR = { up: "var(--green)", down: "var(--red)", flat: "var(--gold)" } as const;

export interface ProductsPageData {
  sku: SkuMoves | null;
  skuRank: SkuRankSlice | null;
  gift: GiftStats | null;
  giftSlice: { giftItems: number } | null;
  giftByMonth: (GiftStats | null)[];
  giftMonthLabels: string[];
  giftPeriodLabel: string;
  giftMaxPriceLabel: string;
  promo: PromotionMonthSlice | null;
  prevMonthNo: number;
  points: ScatterPoint[];
  /** Report Shopee: Product List không có Product Impressions/Seller LIVE ⇒ bảng dùng Orders/Product Clicks, biểu đồ = tỷ trọng Product Clicks × Orders/Product Clicks. */
  variant?: "shopee";
}

const SHOPEE_CONV = `${METRIC.orders}/Product Clicks`;

/** Bốn ô KPI đầu trang (đúng thứ tự demo): Top 1 SKU · Độ tập trung SKU · Quà tặng kèm · Tiền giảm giá khuyến mãi. */
export function productsKpis(d: ProductsPageData): PageMetric[] {
  const out: PageMetric[] = [];
  const top = d.sku?.rows[0];
  if (top) {
    const parts = [top.gmvChange != null ? `${signed(top.gmvChange)} GMV${d.sku!.perDay ? " mỗi ngày" : ""}` : null, top.prevRank != null ? `hạng ${top.prevRank} → ${top.rank}` : `hạng ${top.rank}`].filter(Boolean);
    out.push({ label: `Top 1 · ${disp(top.name)}`, value: fmtVndShort(top.gmv), note: parts.join(" · ") });
  }
  if (d.skuRank?.skusFor80Pct != null && d.skuRank.sellingSkus > 0) {
    out.push({ label: "Độ tập trung SKU", value: `${fmtInt(d.skuRank.skusFor80Pct)} / ${fmtInt(d.skuRank.sellingSkus)}`, note: `SKU đầu bảng tạo 80% GMV (${fmtFixed((d.skuRank.skusFor80Pct / d.skuRank.sellingSkus) * 100, 0)}%)` });
  }
  if (d.gift) {
    out.push({ label: "Quà tặng kèm", value: dec(d.gift.giftPerOrder, 2), note: `món/đơn toàn shop · ${fmtInt(d.gift.giftItems)} món` });
  }
  if (d.promo?.totalDiscount != null && d.promo.totalDiscount > 0) {
    out.push({ label: "Tiền giảm giá khuyến mãi", value: fmtVndShort(d.promo.totalDiscount), note: `${d.promo.items.length} chương trình chạy trọn tháng` });
  }
  return out;
}

// ---- Biểu đồ phân tán Product CTR × CTOR (hàm scatter nguyên văn từ demo; chỉ tính trục + vị trí nhãn từ dữ liệu) ----
const medianOf = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pctAxis = (v: number) => dec(v, 1) + "%";

export function skuScatterHtml(points: ScatterPoint[], axes: { xl: string; yl: string } = { xl: METRIC.productCtr, yl: METRIC.ctor }): string {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  // Trục có đúng k khoảng chia tròn (bước là bội của 0,1) bao trùm dữ liệu.
  const nice = (a: number[], k: number) => {
    const lo = Math.min(...a);
    const hi = Math.max(...a);
    const g = Math.max((hi - lo) * 0.12, 0.05);
    let step = Math.max(0.1, Math.ceil((hi - lo + 2 * g) / k / 0.1) * 0.1);
    for (;;) {
      const a0 = Math.floor((lo - g) / step) * step;
      if (a0 + k * step >= hi + g) return [Math.round(a0 * 10) / 10, Math.round((a0 + k * step) * 10) / 10] as const;
      step += 0.1;
    }
  };
  const [x0, x1] = nice(xs, 6);
  const [y0, y1] = nice(ys, 4);
  const o = { x0, x1, kx: 6, ky: 4, y0, y1, xf: pctAxis, yf: pctAxis, xl: axes.xl, yl: axes.yl, vx: medianOf(xs), vy: medianOf(ys), h: 340 };
  // Toạ độ trong SVG (khung 640×340, lề như hàm scatter) để nhãn điểm sát nhau chuyển xuống dưới.
  const sx = (v: number) => 48 + ((v - x0) / (x1 - x0)) * (640 - 48 - 14);
  const sy = (v: number) => 14 + ((y1 - v) / (y1 - y0)) * (340 - 14 - 42);
  const placed: { x: number; y: number }[] = [];
  const pts = [...points]
    .sort((a, b) => b.size - a.size)
    .map((p) => {
      const r = Math.sqrt(p.size / 1e6) * 0.62;
      const px = sx(p.x);
      const py = sy(p.y);
      const clash = placed.some((q) => Math.abs(q.x - px) < 70 && Math.abs(q.y - (py - r - 5)) < 13);
      placed.push({ x: px, y: clash ? py + r + 13 : py - r - 5 });
      const a = px > 520 ? "end" : px < 110 ? "start" : "middle";
      return { x: p.x, y: p.y, r: Math.max(r, 3), color: TONE_VAR[p.tone], l: esc(chartSkuLabel(p.label)), dx: a === "end" ? -4 : a === "start" ? 4 : 0, dy: clash ? r + 13 : -r - 5, a };
    });
  return scatter(pts, { ...o, quad: [{ x: 56, y: 28, t: `${axes.xl} thấp · ${axes.yl} cao` }, { x: 628, y: 292, t: `${axes.xl} cao · ${axes.yl} thấp`, a: "end" }] });
}

// ---- Bảng Top SKU ----
const rankCell = (rank: number, prevRank: number | null) => {
  const b = rankBadge(prevRank, rank);
  if (b.tone === "new") return `<b>${rank}</b> <span class="rk nt" title="Ngoài bảng tháng trước">mới</span>`;
  if (b.tone === "flat") return `<b>${rank}</b> <span class="rk nt" title="Giữ hạng so với tháng trước">=</span>`;
  return `<b>${rank}</b> <span class="rk ${b.tone === "up" ? "up" : "dn"}" title="Hạng tháng trước: ${prevRank}">${b.text}</span>`;
};

const thumbCell = (name: string, src: string | undefined, editable: boolean) => {
  const img = src && src.startsWith("data:image/") ? src : undefined;
  const inner = img
    ? `<img src="${img}" alt="${esc(name)}">${editable ? '<button type="button" class="rm" aria-label="Xoá ảnh" data-rm="1">×</button>' : ""}`
    : editable
      ? "<span>+<br>Tải ảnh</span>"
      : "<span>—</span>";
  return { t: `<div class="thumb" data-n="${esc(name)}"${editable ? ' tabindex="0" role="button"' : ""} aria-label="${editable ? "Tải ảnh cho " : "Ảnh "}${esc(name)}">${inner}${editable ? '<input type="file" accept="image/*" hidden>' : ""}</div>`, c: "imgc" };
};

export function skuTableHtml(sku: SkuMoves, images: (name: string) => string | undefined, editable: boolean, variant?: "shopee"): string {
  const prevLabel = "so với tháng trước";
  if (variant === "shopee") {
    return tbl(
      ["Ảnh sản phẩm", `Hạng · ${prevLabel}`, "Sản phẩm", METRIC.gmv, sku.perDay ? "± GMV/ngày" : "± GMV", "Orders", METRIC.itemsSoldShopee, SHOPEE_CONV],
      sku.rows.map((r) => [
        thumbCell(r.name, images(r.name), editable),
        { t: rankCell(r.rank, r.prevRank), c: "hm" },
        { t: esc(disp(r.name)), c: "w" },
        fmtVndShort(r.gmv),
        r.gmvChange == null ? { t: "—", c: "hm" } : { t: signed(r.gmvChange), c: "hm", s: heat(r.gmvChange, 60) + (Math.abs(r.gmvChange) >= 30 ? ";font-weight:800" : "") },
        fmtInt(r.orders),
        r.itemsSold != null ? fmtInt(r.itemsSold) : "—",
        r.ctor != null ? fmtPct(r.ctor) : "—"
      ]),
      [2]
    );
  }
  return tbl(
    ["Ảnh sản phẩm", `Hạng · ${prevLabel}`, "Sản phẩm", "GMV", sku.perDay ? "± GMV/ngày" : "± GMV", "Tỷ trọng Seller LIVE", "Orders", "Items sold", METRIC.productCtr, METRIC.ctor],
    sku.rows.map((r) => [
      thumbCell(r.name, images(r.name), editable),
      { t: rankCell(r.rank, r.prevRank), c: "hm" },
      { t: esc(disp(r.name)), c: "w" },
      fmtVndShort(r.gmv),
      r.gmvChange == null ? { t: "—", c: "hm" } : { t: signed(r.gmvChange), c: "hm", s: heat(r.gmvChange, 60) + (Math.abs(r.gmvChange) >= 30 ? ";font-weight:800" : "") },
      r.gmv > 0 ? fmtPct((r.gmvLive / r.gmv) * 100) : "—",
      fmtInt(r.orders),
      r.itemsSold != null ? fmtInt(r.itemsSold) : "—",
      r.ctr != null ? fmtPct(r.ctr) : "—",
      { t: r.ctor != null ? fmtPct(r.ctor) : "—", c: r.ctor == null ? "" : r.ctor < 1 ? "dn" : r.ctor >= 1.6 ? "up" : "" }
    ]),
    [2]
  );
}

// ---- Bảng khuyến mãi ----
export function promoTableHtml(promo: PromotionMonthSlice): string {
  return tbl(
    ["Chương trình", "GMV", "Orders", "AOV", "Giảm giá", "ROI"],
    promo.items.map((p) => [esc(p.name), fmtVndShort(p.gmv), fmtInt(p.orders), fmtVndShort(p.aov), p.discount != null ? fmtVndShort(p.discount) : "—", p.roi != null && p.roi > 0 ? { t: dec(p.roi, 2), c: p.roi < 2 ? "dn" : "" } : "—"])
  );
}

export const ProductsPageBody: React.FC<{
  data: ProductsPageData;
  images: (name: string) => string | undefined;
  canManage: boolean;
  onSaveImage: (name: string, dataUrl: string | null) => Promise<void>;
  curDaysLabel: string;
  prevMonthLabel: string;
  empty?: React.ReactNode;
}> = ({ data, images, canManage, onSaveImage, curDaysLabel, prevMonthLabel, empty }) => {
  const [status, setStatus] = useState("");
  const sku = data.sku;
  const shopee = data.variant === "shopee";
  const giftHas = data.giftByMonth.some((g) => g && g.giftPerOrder != null);
  const put = async (name: string, file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("Chọn một tệp ảnh (JPG, PNG, WebP)");
      return;
    }
    try {
      await onSaveImage(name, await downscaleImage(file, 160));
      setStatus("Đã lưu cùng báo cáo");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Không lưu được ảnh");
    }
  };
  const clear = async (name: string) => {
    try {
      await onSaveImage(name, null);
      setStatus("Đã xoá ảnh");
    } catch {
      setStatus("Không xoá được ảnh");
    }
  };
  const thumbOf = (t: EventTarget | null) => (t instanceof Element ? (t.closest(".thumb") as HTMLElement | null) : null);
  const giftRows: [string, (g: GiftStats) => number][] = [
    ["Quà tặng mỗi đơn (toàn shop)", (g) => g.giftPerOrder],
    [`${METRIC.upt} toàn shop`, (g) => g.uptShop],
    [`${METRIC.upt} không tính quà tặng`, (g) => g.uptExGift]
  ];
  return (
    <>
      <div className="stk">
        {data.points.length >= 3 && (
          <div className="pn">
            <div className="pnh">{shopee ? `Tỷ trọng Product Clicks và ${SHOPEE_CONV} của Top ${data.points.length} sản phẩm` : `${METRIC.productCtr} và ${METRIC.ctor} của Top ${data.points.length} SKU`}</div>
            <div className="pns">{`${shopee ? "Tỷ trọng Product Clicks = Product Clicks của sản phẩm ÷ tổng của nhóm · " : ""}Kích thước điểm = GMV · màu = thay đổi hạng so với tháng ${data.prevMonthNo} · đường nét đứt = trung vị Top ${data.points.length}.`}</div>
            <div dangerouslySetInnerHTML={{ __html: shopee ? skuScatterHtml(data.points, { xl: "Tỷ trọng Product Clicks", yl: SHOPEE_CONV }) : skuScatterHtml(data.points) }} />
            <div className="legend">
              <span><i style={{ background: "var(--green)" }} />tăng hạng</span>
              <span><i style={{ background: "var(--red)" }} />giảm hạng</span>
              <span><i style={{ background: "var(--gold)" }} />giữ hạng</span>
            </div>
          </div>
        )}
        {giftHas && (
          <div className="pn">
            <div className="pnh">{`Quà tặng kèm và ${METRIC.upt}, ${data.giftPeriodLabel}`}</div>
            <div className="pns">{`Quà tặng: sản phẩm giá dưới ${data.giftMaxPriceLabel}/món. ${METRIC.upt} không tính quà tặng phản ánh cách bán thực.`}</div>
            <div className="tw">
              <table
                dangerouslySetInnerHTML={{
                  __html: tbl(
                    ["", ...data.giftMonthLabels],
                    giftRows.map(([label, get]) => [label, ...data.giftByMonth.map((g) => (g ? dec(get(g), 2) : "—"))])
                  )
                }}
              />
            </div>
          </div>
        )}
      </div>
      {sku ? (
        <div className="pn">
          <div className="pnh">{`Top ${sku.rows.length} SKU theo GMV`}</div>
          <div className="pns">{`Nguồn file ${shopee ? "Product List của Shopee Live · GMV = Sales(Placed Order)" : "Sản Phẩm"}${curDaysLabel} · hạng so với tháng ${data.prevMonthNo}${sku.perDay ? " · % tính trên GMV mỗi ngày" : ""}.`}</div>
          <div
            className="tw"
            onClick={(e) => {
              const t = thumbOf(e.target);
              if (!t || !canManage) return;
              if ((e.target as Element).closest("[data-rm]")) {
                void clear(t.dataset.n!);
                return;
              }
              const inp = t.querySelector("input");
              if (inp && e.target !== inp) inp.click();
            }}
            onKeyDown={(e) => {
              const t = thumbOf(e.target);
              if (t && canManage && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                t.querySelector("input")?.click();
              }
            }}
            onChange={(e) => {
              const inp = e.target as HTMLInputElement;
              const t = thumbOf(inp);
              if (t && inp.type === "file") {
                void put(t.dataset.n!, inp.files?.[0]);
                inp.value = "";
              }
            }}
            onDragOver={(e) => {
              if (canManage && thumbOf(e.target)) e.preventDefault();
            }}
            onDrop={(e) => {
              const t = thumbOf(e.target);
              if (t && canManage) {
                e.preventDefault();
                void put(t.dataset.n!, e.dataTransfer.files[0]);
              }
            }}
          >
            <table dangerouslySetInnerHTML={{ __html: skuTableHtml(sku, images, canManage, data.variant) }} />
          </div>
          {canManage && (
            <div className="legend">
              <span>Bấm vào ô ảnh (hoặc kéo thả tệp) để tải ảnh sản phẩm; bấm × để xoá. Ảnh được thu nhỏ và lưu cùng báo cáo.</span>
              <span className="st" aria-live="polite">{status}</span>
            </div>
          )}
        </div>
      ) : (
        empty
      )}
      {data.promo && data.promo.items.length > 0 && (
        <div className="pn">
          <div className="pnh">Top chương trình khuyến mãi</div>
          <div className="pns">Chỉ các chương trình chạy trọn tháng · ROI = GMV ÷ tiền giảm giá · chương trình tặng quà có tiền giảm giá bằng 0 vì là quà tặng.</div>
          <div className="tw">
            <table dangerouslySetInnerHTML={{ __html: promoTableHtml(data.promo) }} />
          </div>
        </div>
      )}
    </>
  );
};
