import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Clock, Database, Megaphone, Package, ShoppingBag, Users, Info } from "lucide-react";
import type { BrandMonthlyReport } from "../../types";
import { fmtFixed, fmtVndFull, fmtVndShort } from "../../lib/format";
import { METRIC } from "../../lib/metricGlossary";
import { InsightBox, KpiTile, Panel, ReportTable, SectionHead } from "./report/ui";
import { PAL, chartTooltipStyle } from "./report/theme";
import { chartNum, fmtInt } from "./report/format";
import { getCampaignDayInfo } from "../../lib/campaignDays";
import { saveMonthlyReportSectionNote } from "../../lib/db/monthlyReports";
import { shopeeInsights, shopeeNotes, type ShopeeReportSnapshot, type ShopeeSection } from "../../lib/report/shopeeSnapshot";

// Report Tháng SHOPEE (migration 0139): đọc bản chụp đã chốt (lib/report/shopeeSnapshot.ts), cùng skin đen-vàng và cùng bộ
// khung với report TikTok. 6 phần theo deck report tháng của Franklin: kết quả → xu hướng ngày → phễu & nguồn traffic →
// lịch live → host → sản phẩm, cuối là "Cách tính và điểm cần xác nhận". GMV Shopee = Sales(Placed Order) (user chốt 06/10).
// TÊN CHỈ SỐ (user chốt 07/10): đúng tên cột file Shopee (Viewers, Views, ATC, ABS, GPM, Sales (Confirmed Order)…) — qua METRIC
// trong lib/metricGlossary.ts, không tự dịch/đặt tên; tiêu đề phần và câu giải thích vẫn tiếng Việt.

const SECTION_LABEL: Record<ShopeeSection, string> = {
  summary: "Kết quả",
  daily: "Xu hướng theo ngày",
  funnel: "Phễu và nguồn traffic",
  schedule: "Lịch live: khung giờ & loại ngày",
  people: "Host",
  products: "Sản phẩm"
};

const CAMP_SHORT_LABEL = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" } as const;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${fmtFixed(v, d)}%`);
const change = (cur: number | null | undefined, prev: number | null | undefined): number | null =>
  cur != null && prev != null && prev > 0 ? (cur / prev - 1) * 100 : null;
const hoursLabel = (h: number) => `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
const durLabel = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}m${String(Math.round(sec % 60)).padStart(2, "0")}s` : `${Math.round(sec)}s`);
/** ABS = Sales ÷ Orders; bản chụp cũ (bản 2) chưa lưu `abs` thì tính lại từ hai số đã có. */
const absOf = (x: { gmv: number; orders: number; abs?: number | null }): number | null => x.abs ?? (x.orders > 0 ? x.gmv / x.orders : null);

const TD = "py-2 px-3 text-right font-mono";
const TD1 = "py-2 px-3 font-semibold";

interface Props {
  brandId: string;
  brandName: string;
  month: string;
  snapshot: ShopeeReportSnapshot;
  report: BrandMonthlyReport | null;
  canManage: boolean;
  onReportChange: (r: BrandMonthlyReport) => void;
}

export const ShopeeMonthlyReportTabs: React.FC<Props> = ({ brandId, brandName, month, snapshot: s, report, canManage, onReportChange }) => {
  const h = s.headline;
  const p = s.prev;
  const o = s.overview;
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [monthY, monthM] = month.split("-");

  // Nhận xét + ghi chú tính lại từ bản chụp (hàm thuần, chỉ đọc trường có từ bản 1) để bộ từ gửi brand áp cả cho bản chụp chốt
  // trước 27/10 — chữ đã lưu trong bản chụp cũ còn "ca", "số tạm". Ghi chú nội bộ (file thiếu, ca trong app, đối soát) chỉ ops thấy.
  const insights = useMemo(() => shopeeInsights(s), [s]);
  const brandNotes = useMemo(() => shopeeNotes(s, "brand"), [s]);
  const opsNotes = useMemo(() => (canManage ? shopeeNotes(s, "ops") : []), [canManage, s]);
  const fileHint = (what: string) => (canManage ? `Chưa có file ${what} của tháng này — tải lên ở Dữ Liệu Gốc.` : "Chưa có số liệu cho phần này trong tháng.");

  const insight = (key: ShopeeSection) => (
    <InsightBox
      auto={insights[key]}
      note={report?.sectionNotes?.[`shopee_${key}`]}
      computedAt={s.computedAt}
      canManage={canManage}
      onSave={async (text) => onReportChange(await saveMonthlyReportSectionNote(brandId, `${month}-01`, `shopee_${key}`, text, "Shopee"))}
    />
  );

  // Cột sáng = ngày campaign theo khung của Kế Hoạch Tháng (bản chụp 4); bản chụp cũ đọc lịch cố định.
  const campLabelOf = (date: string): string => {
    if (!s.campDays) return getCampaignDayInfo(date)?.shortLabel ?? "";
    const k = s.campDays[date];
    return k ? CAMP_SHORT_LABEL[k] : "";
  };
  const chartData = s.days.map((d) => ({ date: dm(d.date), gmv: d.salesPlaced, camp: campLabelOf(d.date) }));
  const cancelPct = h.gmv > 0 && h.confirmed > 0 ? (1 - h.confirmed / h.gmv) * 100 : null;

  return (
    <div className="space-y-8 rounded-2xl p-4 sm:p-6" style={{ background: PAL.bg }} aria-label={`Report Shopee tháng ${Number(monthM)}/${monthY} ${brandName}`}>
      {/* 1 · Kết quả */}
      <section className="space-y-4">
        <SectionHead no="1" title={SECTION_LABEL.summary} sub={`Shopee Live · 01–${h.lastDay ? dm(h.lastDay) : "…"}/${monthY} · GMV = Sales(Placed Order)`} />
        {insight("summary")}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile label={METRIC.gmv} value={fmtVndShort(h.gmv)} change={change(h.gmv, p?.gmv)} note={`Sales(Placed Order) ${fmtVndFull(h.gmv)}`} />
          <KpiTile label={METRIC.salesConfirmed} value={fmtVndShort(h.confirmed)} change={change(h.confirmed, p?.confirmed)} note={cancelPct != null ? `Thực nhận · huỷ ${pct(cancelPct)} giá trị` : "Chưa có Sales(Confirmed Order)"} />
          <KpiTile label={METRIC.orders} value={fmtInt(h.orders)} change={change(h.orders, p?.orders)} note={`${fmtInt(h.ordersConfirmed)} ${METRIC.ordersConfirmed}`} />
          <KpiTile label={METRIC.abs} value={absOf(h) != null ? fmtVndShort(absOf(h)!) : "—"} change={change(absOf(h), p ? absOf(p) : null)} note="Sales ÷ Orders (Placed Order)" />
          <KpiTile label={METRIC.liveHours} value={hoursLabel(h.liveHours)} change={change(h.liveHours, p?.liveHours)} note={`${fmtInt(h.liveSessions)} phiên live`} />
          <KpiTile label={METRIC.gmvPerHour} value={h.gmvPerHour != null ? fmtVndShort(h.gmvPerHour) : "—"} change={change(h.gmvPerHour, p?.gmvPerHour)} note="Tự tính: GMV ÷ giờ live (Live List)" />
          <KpiTile label={METRIC.viewers} value={fmtInt(h.viewers)} change={change(h.viewers, p?.viewers)} note={`${fmtInt(h.views)} ${METRIC.views}`} />
          <KpiTile label={METRIC.itemsSoldShopee} value={fmtInt(h.items)} change={change(h.items, p?.items)} />
        </div>
        {p && (
          <p className="text-[11px]" style={{ color: PAL.muted }}>
            Mũi tên so với tháng trước theo bản chụp Shopee tháng trước ({p.days} ngày có doanh số, tới {p.lastDay ? dm(p.lastDay) : "—"}).
          </p>
        )}
        {(s.ads || s.promo) && (
          <Panel title="Ads và khuyến mãi" icon={<Megaphone className="w-4 h-4" />} sub="Expense, ROAS: file Shopee Live Ads (cả tháng) · Coins, voucher: file overview">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {s.ads ? (
                <>
                  <KpiTile label={METRIC.expense} value={fmtVndShort(s.ads.expense)} note={`${s.ads.campaigns} chiến dịch Live Ads`} />
                  <KpiTile label={METRIC.roas} value={s.ads.roas != null ? `${fmtFixed(s.ads.roas, 1)}x` : "—"} note={`GMV trong file Ads ${fmtVndShort(s.ads.gmv)}${h.gmv > 0 ? ` (${pct((s.ads.gmv / h.gmv) * 100)} GMV live)` : ""}`} />
                  <KpiTile label={`${METRIC.expense}/${METRIC.orders}`} value={s.ads.costPerOrder != null ? fmtVndShort(s.ads.costPerOrder) : "—"} note={`${fmtInt(s.ads.orders)} ${METRIC.orders} trong file Ads`} />
                </>
              ) : (
                <KpiTile label={METRIC.expense} value="—" note="Chưa có file Ads Shopee" />
              )}
              {s.promo && (
                <>
                  <KpiTile label={METRIC.coinsClaimed} value={fmtInt(s.promo.coins)} note={`≈ ${fmtVndShort(s.promo.coins)}${h.gmv > 0 && s.promo.coins > 0 ? ` (${pct((s.promo.coins / h.gmv) * 100, 2)} GMV)` : ""}`} />
                  <KpiTile label={METRIC.shopVoucherClaimed} value={fmtInt(s.promo.vouchers)} />
                  <KpiTile label={METRIC.specialLiveVoucherClaimed} value={fmtInt(s.promo.liveVouchers)} />
                </>
              )}
            </div>
          </Panel>
        )}
      </section>

      {/* 2 · Xu hướng theo ngày */}
      <section className="space-y-4">
        <SectionHead no="2" title={SECTION_LABEL.daily} sub="Sales(Placed Order) từng ngày (file theo ngày)" />
        {insight("daily")}
        {s.days.length === 0 ? (
          <EmptyNote text={fileHint("theo ngày (export-sc…csv)")} />
        ) : (
          <Panel title={`${METRIC.gmv} theo ngày`} icon={<BarChart3 className="w-4 h-4" />} sub="Cột sáng = ngày Campaign (D-Day, Mid-Month, Pay Day)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={PAL.line} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: PAL.muted, fontSize: 11 }} interval={1} />
                  <YAxis tick={{ fill: PAL.muted, fontSize: 11 }} tickFormatter={(v) => fmtVndShort(chartNum(v))} width={52} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtVndFull(chartNum(v))} labelFormatter={(l, items) => `${l}${items?.[0]?.payload?.camp ? ` · ${items[0].payload.camp}` : ""}`} />
                  <Bar dataKey="gmv" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.camp ? PAL.gold : PAL.goldDim} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {s.noLiveDays.length > 0 && (
              <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                Ngày không có phiên live: {s.noLiveDays.map(dm).join(", ")}.
              </p>
            )}
          </Panel>
        )}
        {s.days.length > 0 && (
          <Panel title="Ngày cao nhất" icon={<ShoppingBag className="w-4 h-4" />} sub={`Top 5 trên ${s.days.length} ngày có số liệu`}>
            <ReportTable head={["Ngày", METRIC.gmv, METRIC.salesConfirmed, METRIC.orders, "Total Viewers", "% GMV tháng"]}>
              {[...s.days]
                .sort((a, b) => b.salesPlaced - a.salesPlaced)
                .slice(0, 5)
                .map((d) => (
                  <tr key={d.date} style={{ borderBottom: `1px solid ${PAL.line}`, color: PAL.cream }}>
                    <td className={TD1}>
                      {dm(d.date)}
                      {campLabelOf(d.date) ? <span style={{ color: PAL.gold }}> · {campLabelOf(d.date)}</span> : null}
                    </td>
                    <td className={TD}>{fmtVndFull(d.salesPlaced)}</td>
                    <td className={TD}>{fmtVndFull(d.salesConfirmed)}</td>
                    <td className={TD}>{fmtInt(d.ordersPlaced)}</td>
                    <td className={TD}>{fmtInt(d.viewers)}</td>
                    <td className={TD}>{h.gmv > 0 ? pct((d.salesPlaced / h.gmv) * 100) : "—"}</td>
                  </tr>
                ))}
            </ReportTable>
          </Panel>
        )}
      </section>

      {/* 3 · Phễu và nguồn traffic */}
      <section className="space-y-4">
        <SectionHead no="3" title={SECTION_LABEL.funnel} sub="File overview của Shopee — cả tháng" />
        {insight("funnel")}
        {!o ? (
          <EmptyNote text={fileHint("overview (overview-v2…csv)")} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label={METRIC.viewers} value={fmtInt(o.viewers)} note={`${fmtInt(o.views)} ${METRIC.views}`} />
              <KpiTile label={METRIC.engagedViewers} value={fmtInt(o.engaged)} note={`${pct(o.viewers > 0 ? (o.engaged / o.viewers) * 100 : null)} ${METRIC.viewers}`} />
              <KpiTile label="Product Impressions" value={fmtInt(o.productImpressions)} />
              <KpiTile label="Product Clicks" value={fmtInt(o.productClicks)} note={`${METRIC.ctr} ${pct(o.ctrPct, 2)} (Conversion Funnel)`} />
              <KpiTile label={METRIC.atc} value={fmtInt(o.atc)} />
              <KpiTile label={`${METRIC.orders} (Placed Order)`} value={fmtInt(o.ordersPlaced)} note={`${METRIC.orderRate} ${pct(o.orderRatePlacedPct, 2)}`} />
              {o.buyersPlaced > 0 && <KpiTile label={METRIC.buyers} value={fmtInt(o.buyersPlaced)} note={`${fmtInt(o.buyersConfirmed)} Buyers(Confirmed Order)`} />}
              <KpiTile label={METRIC.salesNewCustomers} value={pct(o.salesNewPlaced + o.salesOldPlaced > 0 ? (o.salesNewPlaced / (o.salesNewPlaced + o.salesOldPlaced)) * 100 : null, 0)} note="% Sales(Placed Order)" />
            </div>
            <Panel title="Engagement" icon={<Users className="w-4 h-4" />} sub="Cả tháng, từ file overview của Shopee">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiTile label={METRIC.gpm} value={o.gpmPlaced > 0 ? fmtVndShort(o.gpmPlaced) : "—"} note="Sales trên 1.000 Views" />
                <KpiTile label={METRIC.salesPerBuyer} value={o.salesPerBuyerPlaced > 0 ? fmtVndShort(o.salesPerBuyerPlaced) : "—"} />
                <KpiTile label={METRIC.avgViewingDuration} value={o.avgViewSec > 0 ? durLabel(o.avgViewSec) : "—"} />
                <KpiTile label={METRIC.pcu} value={fmtInt(o.pcu)} />
                <KpiTile label={METRIC.totalLikes} value={fmtInt(o.likes)} />
                <KpiTile label={METRIC.totalShares} value={fmtInt(o.shares)} />
                <KpiTile label={METRIC.totalComments} value={fmtInt(o.comments)} />
                <KpiTile label={METRIC.liveNewFollowers} value={fmtInt(o.newFollowers)} />
              </div>
            </Panel>
            <Panel title="Nguồn traffic của live" icon={<Database className="w-4 h-4" />} sub="Sales và lượt xem theo Traffic Source dẫn vào phòng live">
              <ReportTable head={["Traffic Source", METRIC.salesRatio, "Sales (Placed Order)", METRIC.liveViews, METRIC.liveViewers, METRIC.engagedViewers]}>
                {[...o.sources]
                  .sort((a, b) => b.salesPlaced - a.salesPlaced)
                  .map((x) => (
                    <tr key={x.key} style={{ borderBottom: `1px solid ${PAL.line}`, color: PAL.cream }}>
                      <td className={TD1}>{x.key}</td>
                      <td className={TD}>{pct(x.salesRatioPct, 0)}</td>
                      <td className={TD}>{fmtVndFull(x.salesPlaced)}</td>
                      <td className={TD}>{fmtInt(x.views)}</td>
                      <td className={TD}>{fmtInt(x.viewers)}</td>
                      <td className={TD}>{fmtInt(x.engaged)}</td>
                    </tr>
                  ))}
              </ReportTable>
            </Panel>
          </>
        )}
      </section>

      {/* 4 · Lịch live */}
      <section className="space-y-4">
        <SectionHead no="4" title={SECTION_LABEL.schedule} sub="Giờ live thực tế từ Live List; khung giờ theo giờ bắt đầu phiên" />
        {insight("schedule")}
        {s.slots.length === 0 ? (
          <EmptyNote text={fileHint("Live List (…live_stream_list…xlsx)")} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label={`${METRIC.liveHours} thực tế`} value={hoursLabel(h.liveHours)} note={s.plan.hours > 0 ? `Lịch đã lên ${hoursLabel(s.plan.hours)}` : canManage ? "Chưa có ca Shopee trong app" : undefined} />
              <KpiTile label="Số phiên" value={fmtInt(h.liveSessions)} note={s.plan.sessions > 0 ? `${s.plan.sessions} phiên theo lịch` : undefined} />
              <KpiTile label="GMV/phiên" note="Tự tính: GMV ÷ số phiên" value={h.liveSessions > 0 ? fmtVndShort(h.gmv / h.liveSessions) : "—"} />
              <KpiTile label={METRIC.gmvPerHour} value={h.gmvPerHour != null ? fmtVndShort(h.gmvPerHour) : "—"} />
            </div>
            <Panel title="Theo khung giờ" icon={<Clock className="w-4 h-4" />}>
              <ReportTable head={["Khung giờ", "Phiên", "Giờ live", METRIC.gmv, METRIC.gmvPerHour, `${METRIC.viewers} trung bình/phiên`]}>
                {s.slots.map((x) => (
                  <tr key={x.key} style={{ borderBottom: `1px solid ${PAL.line}`, color: PAL.cream }}>
                    <td className={TD1}>{x.label}</td>
                    <td className={TD}>{fmtInt(x.sessions)}</td>
                    <td className={TD}>{hoursLabel(x.hours)}</td>
                    <td className={TD}>{fmtVndFull(x.gmv)}</td>
                    <td className={TD}>{x.gmvPerHour != null ? fmtVndFull(x.gmvPerHour) : "—"}</td>
                    <td className={TD}>{x.avgViewers != null ? fmtInt(x.avgViewers) : "—"}</td>
                  </tr>
                ))}
              </ReportTable>
            </Panel>
            <Panel title="Theo loại ngày" icon={<Clock className="w-4 h-4" />} sub={s.campFromPlan ? "Khung campaign theo kế hoạch tháng" : "Lịch campaign cố định: D-Day, Mid-Month 13–15, Pay Day 23–25"}>
              <ReportTable head={["Loại ngày", "Ngày", "Phiên", "Giờ live", METRIC.gmv, `% ${METRIC.gmv}`, METRIC.gmvPerHour]}>
                {s.camps.map((x) => (
                  <tr key={x.key} style={{ borderBottom: `1px solid ${PAL.line}`, color: PAL.cream }}>
                    <td className={TD1}>{x.label}</td>
                    <td className={TD}>{fmtInt(x.days)}</td>
                    <td className={TD}>{fmtInt(x.sessions)}</td>
                    <td className={TD}>{hoursLabel(x.hours)}</td>
                    <td className={TD}>{fmtVndFull(x.gmv)}</td>
                    <td className={TD}>{pct(x.share != null ? x.share * 100 : null)}</td>
                    <td className={TD}>{x.gmvPerHour != null ? fmtVndFull(x.gmvPerHour) : "—"}</td>
                  </tr>
                ))}
              </ReportTable>
            </Panel>
          </>
        )}
      </section>

      {/* 5 · Host */}
      <section className="space-y-4">
        <SectionHead no="5" title={SECTION_LABEL.people} sub="Các phiên live Shopee do YFB vận hành trong tháng" />
        {insight("people")}
        {s.hosts.length === 0 ? (
          <EmptyNote text={canManage ? "Chưa có ca Shopee đã diễn ra và đã gán host trong tháng này." : "Chưa có phiên đã ghi nhận host trong tháng này."} />
        ) : (
          <Panel
            title={`Xếp hạng ${METRIC.gmvPerHour}`}
            icon={<Users className="w-4 h-4" />}
            sub={canManage ? (s.quality.manual > 0 ? `${s.quality.manual}/${s.quality.total} ca còn là số tạm tính (chưa đối soát bằng Live List)` : "Tất cả ca đã đối soát") : undefined}
          >
            <ReportTable head={["Host", "Phiên", "Giờ", METRIC.gmv, METRIC.gmvPerHour]}>
              {s.hosts.map((x) => (
                <tr key={x.key} style={{ borderBottom: `1px solid ${PAL.line}`, color: PAL.cream }}>
                  <td className={TD1}>{x.name}</td>
                  <td className={TD}>{fmtInt(x.sessions)}</td>
                  <td className={TD}>{hoursLabel(x.hours)}</td>
                  <td className={TD}>{fmtVndFull(x.gmv)}</td>
                  <td className={TD}>{x.gmvPerHour != null ? fmtVndFull(x.gmvPerHour) : "—"}</td>
                </tr>
              ))}
            </ReportTable>
            {s.unassigned && s.unassigned.sessions > 0 && (
              <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                {canManage
                  ? `${s.unassigned.sessions} ca chưa gán host (${fmtVndShort(s.unassigned.gmv)} GMV) không nằm trong xếp hạng.`
                  : `${s.unassigned.sessions} phiên (${fmtVndShort(s.unassigned.gmv)}) chưa ghi nhận host nên không nằm trong bảng.`}
              </p>
            )}
          </Panel>
        )}
      </section>

      {/* 6 · Sản phẩm */}
      <section className="space-y-4">
        <SectionHead no="6" title={SECTION_LABEL.products} sub="Product List của Shopee Live — Sales(Placed Order) trong live" />
        {insight("products")}
        {s.products.count === 0 ? (
          <EmptyNote text={fileHint("Product List (…live_product_list…xlsx)")} />
        ) : (
          <Panel title="Sản phẩm bán chạy" icon={<Package className="w-4 h-4" />} sub={`${s.products.withSales}/${s.products.count} sản phẩm có Sales · ba sản phẩm đầu ${pct(s.products.top3Share != null ? s.products.top3Share * 100 : null)}`}>
            <ReportTable head={["#", "Product(s)", METRIC.gmv, "% live", METRIC.orders, "Product Clicks", METRIC.atc]}>
              {(showAllProducts ? s.products.top : s.products.top.slice(0, 10)).map((x, i) => (
                <tr key={`${x.rank}-${i}`} style={{ borderBottom: `1px solid ${PAL.line}`, color: PAL.cream }}>
                  <td className={TD1}>{i + 1}</td>
                  <td className="py-2 px-3 text-left max-w-[360px]">{x.name}</td>
                  <td className={TD}>{fmtVndFull(x.salesPlaced)}</td>
                  <td className={TD}>{s.products.totalSales > 0 ? pct((x.salesPlaced / s.products.totalSales) * 100) : "—"}</td>
                  <td className={TD}>{fmtInt(x.ordersPlaced)}</td>
                  <td className={TD}>{fmtInt(x.clicks)}</td>
                  <td className={TD}>{fmtInt(x.atc)}</td>
                </tr>
              ))}
            </ReportTable>
            {s.products.top.length > 10 && (
              <button onClick={() => setShowAllProducts((v) => !v)} className="mt-2 text-[11px] font-bold underline min-h-7" style={{ color: PAL.gold }}>
                {showAllProducts ? "Chỉ hiện 10 đầu" : `Hiện thêm tới ${s.products.top.length}`}
              </button>
            )}
          </Panel>
        )}
      </section>

      {/* Cách tính và điểm cần xác nhận */}
      <section className="space-y-3">
        <SectionHead no="·" title="Cách tính" sub="Số nào lấy từ file nào của Shopee" />
        <ul className="space-y-1.5 text-[12px] leading-relaxed list-disc pl-5" style={{ color: PAL.muted }}>
          {brandNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
        {opsNotes.length > 0 && (
          <div className="rounded-xl p-3 space-y-1" style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}>
            <p className="text-[11px] font-bold">Chỉ ops thấy — cần xác nhận trước khi phát hành</p>
            <ul className="space-y-1 text-[11px] leading-relaxed list-disc pl-5">
              {opsNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: PAL.muted }}>
          <Info className="w-3.5 h-3.5" /> Số liệu chốt lúc {new Date(s.computedAt).toLocaleString("vi-VN")}.
        </p>
      </section>
    </div>
  );
};

const EmptyNote: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-xl p-5 text-center text-[12px]" style={{ background: PAL.panel, border: `1px dashed ${PAL.line}`, color: PAL.muted }}>
    {text}
  </div>
);
