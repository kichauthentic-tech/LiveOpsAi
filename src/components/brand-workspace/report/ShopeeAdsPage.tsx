import React, { useState } from "react";
import { fmtFixed, fmtVndFull, fmtVndShort } from "../../../lib/format";
import { METRIC } from "../../../lib/metricGlossary";
import { shopeeAdsRunning, type ShopeeAdsSuite } from "../../../lib/dataraw/shopeeAds";
import { analyzeShopeeAds, shortAdName, type AdsProductRow } from "../../../lib/report/shopeeAdsInsight";
import type { PageMetric } from "./ui";
import { DemoLegend, DemoPanel, DemoTable } from "./DemoBlocks";
import { columns, fmtM, hbars, pill, tbl } from "./demoCharts";
import { fmtInt } from "./format";
import { t as tr } from "../../../lib/displayLang";

// Trang Quảng cáo Report Shopee khi shop có Shop+ Ads / Product Ads (31/10, Franklin whole shop). Số cả tháng theo chiến dịch /
// sản phẩm, không có theo ngày. Phân tích lấy từ lib/report/shopeeAdsInsight.ts (cùng nguồn với Insight).

const x1 = (v: number | null) => (v == null ? "—" : v === 0 ? "0x" : `${fmtFixed(v, v < 1 ? 2 : 1)}x`);
const pc = (v: number | null, d = 1) => (v == null ? "—" : `${fmtFixed(v, d)}%`);
const status = (s: string) => pill(s, shopeeAdsRunning(s) ? "g" : "y");
const roasCell = (v: number | null) => ({ t: x1(v), c: v == null ? "" : v >= 10 ? "up" : v < 3 ? "dn" : "" });

/** 4 ô đầu trang. */
export function shopeeAdsMetrics(a: ShopeeAdsSuite): PageMetric[] {
  const z = analyzeShopeeAds(a);
  const t = z.totals;
  return [
    { label: METRIC.expense, value: fmtVndShort(t.expense), note: `${z.types.length} ${tr("loại Ads", "Ads types")}: ${z.types.map((x) => x.label).join(", ")}` },
    { label: tr("Doanh số từ Ads", "Sales from Ads"), value: fmtVndShort(t.gmv), note: `${METRIC.roas} ${x1(t.roas)} · ${tr("đơn trực tiếp", "direct orders")} ${fmtVndShort(t.gmvDirect)} (${x1(t.roasDirect)})` },
    { label: METRIC.acos, value: pc(t.acos), note: tr("Expense ÷ doanh số từ Ads", "Expense ÷ sales from Ads") },
    { label: `${METRIC.expense} / ${tr("lượt chuyển đổi", "conversion")}`, value: t.costPerConversion != null ? fmtVndShort(t.costPerConversion) : "—", note: `${fmtInt(t.conversions)} ${tr("lượt chuyển đổi", "conversions")}` }
  ];
}

type Tab = "live" | "shop" | "product";

export const ShopeeAdsPage: React.FC<{ ads: ShopeeAdsSuite }> = ({ ads }) => {
  const z = analyzeShopeeAds(ads);
  const tabs: { id: Tab; label: string }[] = [
    ...(ads.live ? [{ id: "live" as const, label: "Livestream Ads" }] : []),
    ...(ads.shop ? [{ id: "shop" as const, label: "Shop+ Ads" }] : []),
    ...(ads.product ? [{ id: "product" as const, label: "Product Ads" }] : [])
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? "live");
  const cur = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  const maxV = Math.max(1, ...z.types.map((t) => Math.max(t.expense, t.gmv)));
  const chart = columns(
    z.types.map((t) => ({ l: `${t.label}\n${METRIC.roas} ${x1(t.roas)}`, v: [t.expense, t.gmv] })),
    [{ color: "#55555d" }, { color: "var(--gold)" }],
    { min: 0, max: maxV * 1.12, h: 250, fmt: (v: number) => fmtM(v) }
  );

  return (
    <>
      <DemoPanel title={tr("Chi phí và doanh số theo loại Ads", "Spend and sales by Ads type")} sub={tr("Cột xám = Expense, cột vàng = doanh số Shopee ghi nhận cho quảng cáo. Doanh số các loại có thể trùng đơn với nhau.", "Grey bar = Expense, gold bar = sales Shopee attributes to the ads. Sales of different types may overlap.")}>
        <div dangerouslySetInnerHTML={{ __html: chart }} />
        <DemoLegend>
          {z.types.map((t) => (
            <span key={t.kind}>{t.label}: {fmtFixed(t.expenseShare, 0)}% {tr("chi phí", "of spend")} → {fmtFixed(t.gmvShare, 1)}% {tr("doanh số", "of sales")}</span>
          ))}
        </DemoLegend>
      </DemoPanel>

      {tabs.length > 0 && (
        <div className="pn">
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" className={t.id === cur ? "seg-on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {cur === "live" && ads.live && (
            <>
              <div className="pnh">Livestream Ads · {tr("theo chiến dịch", "by campaign")}</div>
              {z.liveDrag && <div className="pns">{tr(`Chiến dịch "${z.liveDrag.name}" chi ${fmtVndShort(z.liveDrag.expense)}, doanh số ${fmtVndShort(z.liveDrag.gmv)} — ${fmtFixed(z.liveDrag.shareOfLive, 0)}% chi phí Livestream Ads.`, `Campaign "${z.liveDrag.name}" spent ${fmtVndShort(z.liveDrag.expense)} for ${fmtVndShort(z.liveDrag.gmv)} in sales — ${fmtFixed(z.liveDrag.shareOfLive, 0)}% of Livestream Ads spend.`)}</div>}
              <DemoTable
                html={tbl(
                  [tr("Chiến dịch", "Campaign"), METRIC.views, METRIC.orders, METRIC.expense, tr("Doanh số", "Sales"), METRIC.roas],
                  ads.live.campaigns.map((c) => [`${c.name}<br><small>${c.objective}</small> ${status(c.status)}`, fmtInt(c.views), fmtInt(c.orders), fmtVndFull(c.expense), fmtVndFull(c.gmv), roasCell(c.roas)]),
                  [0]
                )}
              />
              <div className="legend">{tr(`${METRIC.orders} có thể ghi 0 dù có doanh số: Shopee tính doanh số theo cửa sổ quy đổi, không khớp từng đơn trong file này.`, `${METRIC.orders} may show 0 despite sales: Shopee attributes sales over a conversion window that does not match individual orders in this file.`)}</div>
            </>
          )}

          {cur === "shop" && ads.shop && (
            <>
              <div className="pnh">Shop+ Ads · {tr("tìm kiếm từ khoá / ngành hàng", "keyword / category search")}</div>
              {z.searchManual && z.searchAuto && <div className="pns">{tr(`Thủ công ${x1(z.searchManual.roas)} so với tự động ${x1(z.searchAuto.roas)}. Chiến dịch tự động chỉ có số từ ngày bắt đầu, so sánh theo ROAS chứ không theo tổng chi phí.`, `Manual ${x1(z.searchManual.roas)} vs automatic ${x1(z.searchAuto.roas)}. Automatic campaigns only have data from their start date, so compare by ROAS rather than total spend.`)}</div>}
              <DemoTable
                html={tbl(
                  [tr("Chiến dịch", "Campaign"), tr("Đấu thầu", "Bidding"), tr("Từ khoá", "Keyword"), tr("Bắt đầu", "Start"), METRIC.expense, tr("Doanh số", "Sales"), tr("Doanh số trực tiếp", "Direct sales"), METRIC.roas, METRIC.acos, tr("Tỷ lệ click", "Click rate"), tr("Chi phí / chuyển đổi", "Cost / conversion")],
                  ads.shop.rows.map((r) => [
                    r.name, r.bidding, r.keyword, r.startDate, fmtVndFull(r.expense), fmtVndFull(r.gmv), fmtVndFull(r.gmvDirect), roasCell(r.expense > 0 ? r.gmv / r.expense : null),
                    pc(r.gmv > 0 ? (r.expense / r.gmv) * 100 : null), pc(r.views > 0 ? (r.clicks / r.views) * 100 : null, 2), r.conversions > 0 ? fmtVndFull(r.expense / r.conversions) : "—"
                  ]),
                  [0, 1, 2]
                )}
              />
            </>
          )}

          {cur === "product" && ads.product && <ProductTab ads={ads} z={z} />}
        </div>
      )}
    </>
  );
};

const ProductTab: React.FC<{ ads: ShopeeAdsSuite; z: ReturnType<typeof analyzeShopeeAds> }> = ({ z }) => {
  const top = [...z.products].filter((p) => p.expense > 0).sort((a, b) => b.expense - a.expense).slice(0, 12);
  const max = Math.max(1, ...top.map((p) => p.expense));
  const bars = hbars(
    top.map((p) => ({
      name: `${p.running ? "● " : ""}${shortAdName(p.name, 40)}`,
      value: p.expense,
      cls: (p.roas ?? 0) < 3 ? "red" : (p.roas ?? 0) >= 10 ? "blue" : "",
      text: `${fmtVndShort(p.expense)} · ${x1(p.roas)}`
    })),
    max
  );
  const list = (title: string, rows: AdsProductRow[], empty: string) => (
    <div className="pn" style={{ marginBottom: 0 }}>
      <div className="pnh">{title}</div>
      {rows.length === 0 ? (
        <div className="pns">{empty}</div>
      ) : (
        <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12 }}>
          {rows.map((p) => (
            <li key={p.productId || p.name}>
              {shortAdName(p.name, 46)}: {tr("chi", "spent")} {fmtVndShort(p.expense)}, {p.gmv > 0 ? `${METRIC.roas} ${x1(p.roas)}, ${tr("trực tiếp", "direct")} ${x1(p.roasDirect)}` : tr("không ra doanh số", "no sales")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <>
      <div className="pnh">Product Ads · {tr("theo sản phẩm", "by product")}</div>
      <div className="pns">
        {z.productRunning ? tr(`${z.productRunning.count} sản phẩm đang chạy ${x1(z.productRunning.roas)}`, `${z.productRunning.count} running products ${x1(z.productRunning.roas)}`) : tr("Không có sản phẩm đang chạy", "No running products")}
        {z.productPaused ? tr(`; ${z.productPaused.count} sản phẩm tạm dừng ${x1(z.productPaused.roas)}`, `; ${z.productPaused.count} paused products ${x1(z.productPaused.roas)}`) : ""}
        {z.noSales.count > 0 ? tr(`. ${z.noSales.count} sản phẩm chi ${fmtVndShort(z.noSales.expense)} mà không ra doanh số.`, `. ${z.noSales.count} products spent ${fmtVndShort(z.noSales.expense)} without any sales.`) : "."}
      </div>
      <DemoLegend>
        <span>{tr("Thanh = Expense, số cuối dòng = Expense · ROAS", "Bar = Expense, figures at the end = Expense · ROAS")}</span>
        <span>● {tr("đang chạy", "running")}</span>
        <span>{tr("xanh: ROAS ≥ 10x", "blue: ROAS ≥ 10x")}</span>
        <span>{tr("đỏ: dưới 3x", "red: below 3x")}</span>
      </DemoLegend>
      <div className="hb" dangerouslySetInnerHTML={{ __html: bars }} />
      <div className="g2" style={{ marginTop: 12 }}>
        {list(tr("Chi nhiều, ROAS thấp", "High spend, low ROAS"), z.weak, tr("Không có sản phẩm chi từ 400.000 mà ROAS dưới 7x.", "No product spending 400,000+ with ROAS below 7x."))}
        {list(tr("Đáng tăng ngân sách (đang chạy, ROAS từ 10x)", "Worth more budget (running, ROAS 10x+)"), z.strong, tr("Không có sản phẩm đang chạy đạt ROAS 10x.", "No running product reaches ROAS 10x."))}
      </div>
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12 }}>{tr(`Bảng đầy đủ ${z.products.length} sản phẩm`, `Full table of ${z.products.length} products`)}</summary>
        <DemoTable
          html={tbl(
            [tr("Sản phẩm", "Product"), tr("Trạng thái", "Status"), METRIC.views, "Click", tr("Thêm vào giỏ", "Add to cart"), tr("Chuyển đổi", "Conversions"), METRIC.expense, tr("Doanh số", "Sales"), tr("Doanh số trực tiếp", "Direct sales"), METRIC.roas, tr("ROAS trực tiếp", "Direct ROAS"), METRIC.acos],
            [...z.products].sort((a, b) => b.expense - a.expense).map((p) => [
              shortAdName(p.name, 60), status(p.status), fmtInt(p.views), fmtInt(p.clicks), fmtInt(p.addToCart), fmtInt(p.conversions), fmtVndFull(p.expense), fmtVndFull(p.gmv), fmtVndFull(p.gmvDirect),
              roasCell(p.roas), x1(p.roasDirect), pc(p.gmv > 0 ? (p.expense / p.gmv) * 100 : null)
            ]),
            [0]
          )}
        />
      </details>
    </>
  );
};
