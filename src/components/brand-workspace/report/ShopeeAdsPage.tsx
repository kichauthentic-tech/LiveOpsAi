import React, { useState } from "react";
import { fmtFixed, fmtVndFull, fmtVndShort } from "../../../lib/format";
import { METRIC } from "../../../lib/metricGlossary";
import { shopeeAdsRunning, type ShopeeAdsSuite } from "../../../lib/dataraw/shopeeAds";
import { analyzeShopeeAds, shortAdName, type AdsProductRow } from "../../../lib/report/shopeeAdsInsight";
import type { PageMetric } from "./ui";
import { DemoLegend, DemoPanel, DemoTable } from "./DemoBlocks";
import { columns, fmtM, hbars, pill, tbl } from "./demoCharts";
import { fmtInt } from "./format";

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
    { label: METRIC.expense, value: fmtVndShort(t.expense), note: `${z.types.length} loại Ads: ${z.types.map((x) => x.label).join(", ")}` },
    { label: "Doanh số từ Ads", value: fmtVndShort(t.gmv), note: `${METRIC.roas} ${x1(t.roas)} · đơn trực tiếp ${fmtVndShort(t.gmvDirect)} (${x1(t.roasDirect)})` },
    { label: METRIC.acos, value: pc(t.acos), note: "Expense ÷ doanh số từ Ads" },
    { label: `${METRIC.expense} / lượt chuyển đổi`, value: t.costPerConversion != null ? fmtVndShort(t.costPerConversion) : "—", note: `${fmtInt(t.conversions)} lượt chuyển đổi` }
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
      <DemoPanel title="Chi phí và doanh số theo loại Ads" sub="Cột xám = Expense, cột vàng = doanh số Shopee ghi nhận cho quảng cáo. Doanh số các loại có thể trùng đơn với nhau.">
        <div dangerouslySetInnerHTML={{ __html: chart }} />
        <DemoLegend>
          {z.types.map((t) => (
            <span key={t.kind}>{t.label}: {fmtFixed(t.expenseShare, 0)}% chi phí → {fmtFixed(t.gmvShare, 1)}% doanh số</span>
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
              <div className="pnh">Livestream Ads · theo chiến dịch</div>
              {z.liveDrag && <div className="pns">{`Chiến dịch "${z.liveDrag.name}" chi ${fmtVndShort(z.liveDrag.expense)}, doanh số ${fmtVndShort(z.liveDrag.gmv)} — ${fmtFixed(z.liveDrag.shareOfLive, 0)}% chi phí Livestream Ads.`}</div>}
              <DemoTable
                html={tbl(
                  ["Chiến dịch", METRIC.views, METRIC.orders, METRIC.expense, "Doanh số", METRIC.roas],
                  ads.live.campaigns.map((c) => [`${c.name}<br><small>${c.objective}</small> ${status(c.status)}`, fmtInt(c.views), fmtInt(c.orders), fmtVndFull(c.expense), fmtVndFull(c.gmv), roasCell(c.roas)]),
                  [0]
                )}
              />
              <div className="legend">{METRIC.orders} có thể ghi 0 dù có doanh số: Shopee tính doanh số theo cửa sổ quy đổi, không khớp từng đơn trong file này.</div>
            </>
          )}

          {cur === "shop" && ads.shop && (
            <>
              <div className="pnh">Shop+ Ads · tìm kiếm từ khoá / ngành hàng</div>
              {z.searchManual && z.searchAuto && <div className="pns">{`Thủ công ${x1(z.searchManual.roas)} so với tự động ${x1(z.searchAuto.roas)}. Chiến dịch tự động chỉ có số từ ngày bắt đầu, so sánh theo ROAS chứ không theo tổng chi phí.`}</div>}
              <DemoTable
                html={tbl(
                  ["Chiến dịch", "Đấu thầu", "Từ khoá", "Bắt đầu", METRIC.expense, "Doanh số", "Doanh số trực tiếp", METRIC.roas, METRIC.acos, "Tỷ lệ click", "Chi phí / chuyển đổi"],
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
              {shortAdName(p.name, 46)}: chi {fmtVndShort(p.expense)}, {p.gmv > 0 ? `${METRIC.roas} ${x1(p.roas)}, trực tiếp ${x1(p.roasDirect)}` : "không ra doanh số"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <>
      <div className="pnh">Product Ads · theo sản phẩm</div>
      <div className="pns">
        {z.productRunning ? `${z.productRunning.count} sản phẩm đang chạy ${x1(z.productRunning.roas)}` : "Không có sản phẩm đang chạy"}
        {z.productPaused ? `; ${z.productPaused.count} sản phẩm tạm dừng ${x1(z.productPaused.roas)}` : ""}
        {z.noSales.count > 0 ? `. ${z.noSales.count} sản phẩm chi ${fmtVndShort(z.noSales.expense)} mà không ra doanh số.` : "."}
      </div>
      <DemoLegend>
        <span>Thanh = Expense, số cuối dòng = Expense · ROAS</span>
        <span>● đang chạy</span>
        <span>xanh: ROAS ≥ 10x</span>
        <span>đỏ: dưới 3x</span>
      </DemoLegend>
      <div className="hb" dangerouslySetInnerHTML={{ __html: bars }} />
      <div className="g2" style={{ marginTop: 12 }}>
        {list("Chi nhiều, ROAS thấp", z.weak, "Không có sản phẩm chi từ 400.000 mà ROAS dưới 7x.")}
        {list("Đáng tăng ngân sách (đang chạy, ROAS từ 10x)", z.strong, "Không có sản phẩm đang chạy đạt ROAS 10x.")}
      </div>
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12 }}>Bảng đầy đủ {z.products.length} sản phẩm</summary>
        <DemoTable
          html={tbl(
            ["Sản phẩm", "Trạng thái", METRIC.views, "Click", "Thêm vào giỏ", "Chuyển đổi", METRIC.expense, "Doanh số", "Doanh số trực tiếp", METRIC.roas, "ROAS trực tiếp", METRIC.acos],
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
