import React, { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Clock, Database, Package, ShoppingBag, Users, Info } from "lucide-react";
import type { BrandMonthlyReport } from "../../types";
import { fmtFixed, fmtVndFull, fmtVndShort } from "../../lib/format";
import { METRIC } from "../../lib/metricGlossary";
import { InsightBox, KpiTile, Panel, ReportTable, SectionHead } from "./report/ui";
import { PAL, chartTooltipStyle } from "./report/theme";
import { chartNum, fmtInt } from "./report/format";
import { getCampaignDayInfo } from "../../lib/campaignDays";
import { saveMonthlyReportSectionNote } from "../../lib/db/monthlyReports";
import type { ShopeeReportSnapshot, ShopeeSection } from "../../lib/report/shopeeSnapshot";

// Report Tháng SHOPEE (migration 0139): đọc bản chụp đã chốt (lib/report/shopeeSnapshot.ts), cùng skin đen-vàng và cùng bộ
// khung với report TikTok. 6 phần theo deck report tháng của Franklin: kết quả → xu hướng ngày → phễu & nguồn traffic →
// lịch live → host → sản phẩm, cuối là "Cách tính và điểm cần xác nhận". GMV Shopee = doanh số ĐẶT (user chốt 06/10).

const SECTION_LABEL: Record<ShopeeSection, string> = {
  summary: "Kết quả",
  daily: "Xu hướng theo ngày",
  funnel: "Phễu và nguồn traffic",
  schedule: "Lịch live: khung giờ & loại ngày",
  people: "Host",
  products: "Sản phẩm"
};

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${fmtFixed(v, d)}%`);
const change = (cur: number | null | undefined, prev: number | null | undefined): number | null =>
  cur != null && prev != null && prev > 0 ? (cur / prev - 1) * 100 : null;
const hoursLabel = (h: number) => `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;

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

  const insight = (key: ShopeeSection) => (
    <InsightBox
      auto={s.insights[key]}
      note={report?.sectionNotes?.[`shopee_${key}`]}
      computedAt={s.computedAt}
      canManage={canManage}
      onSave={async (text) => onReportChange(await saveMonthlyReportSectionNote(brandId, `${month}-01`, `shopee_${key}`, text, "Shopee"))}
    />
  );

  const chartData = s.days.map((d) => ({ date: dm(d.date), gmv: d.salesPlaced, camp: getCampaignDayInfo(d.date)?.shortLabel ?? "" }));
  const cancelPct = h.gmv > 0 && h.confirmed > 0 ? (1 - h.confirmed / h.gmv) * 100 : null;

  return (
    <div className="space-y-8 rounded-2xl p-4 sm:p-6" style={{ background: PAL.bg }} aria-label={`Report Shopee tháng ${Number(monthM)}/${monthY} ${brandName}`}>
      {/* 1 · Kết quả */}
      <section className="space-y-4">
        <SectionHead no="1" title={SECTION_LABEL.summary} sub={`Shopee Live · 01–${h.lastDay ? dm(h.lastDay) : "…"}/${monthY} · GMV = doanh số đặt`} />
        {insight("summary")}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile label="GMV" value={fmtVndShort(h.gmv)} change={change(h.gmv, p?.gmv)} note={`Đặt ${fmtVndFull(h.gmv)}`} />
          <KpiTile label="Thực nhận (đã xác nhận)" value={fmtVndShort(h.confirmed)} change={change(h.confirmed, p?.confirmed)} note={cancelPct != null ? `Huỷ ${pct(cancelPct)} giá trị` : "Chưa có doanh số xác nhận"} />
          <KpiTile label="Đơn hàng" value={fmtInt(h.orders)} change={change(h.orders, p?.orders)} note={`${fmtInt(h.ordersConfirmed)} đơn xác nhận`} />
          <KpiTile label={METRIC.aov} value={h.aov != null ? fmtVndShort(h.aov) : "—"} change={change(h.aov, p?.aov)} note="GMV ÷ đơn đặt" />
          <KpiTile label={METRIC.liveHours} value={hoursLabel(h.liveHours)} change={change(h.liveHours, p?.liveHours)} note={`${fmtInt(h.liveSessions)} phiên live`} />
          <KpiTile label={METRIC.gmvPerHour} value={h.gmvPerHour != null ? fmtVndShort(h.gmvPerHour) : "—"} change={change(h.gmvPerHour, p?.gmvPerHour)} note="GMV ÷ giờ live (Live List)" />
          <KpiTile label="Người xem" value={fmtInt(h.viewers)} change={change(h.viewers, p?.viewers)} note={`${fmtInt(h.views)} lượt xem`} />
          <KpiTile label="Món bán ra" value={fmtInt(h.items)} change={change(h.items, p?.items)} />
        </div>
        {p && (
          <p className="text-[11px]" style={{ color: PAL.muted }}>
            Mũi tên so với tháng trước theo bản chụp Shopee tháng trước ({p.days} ngày có doanh số, tới {p.lastDay ? dm(p.lastDay) : "—"}).
          </p>
        )}
      </section>

      {/* 2 · Xu hướng theo ngày */}
      <section className="space-y-4">
        <SectionHead no="2" title={SECTION_LABEL.daily} sub="Doanh số đặt từng ngày (file theo ngày)" />
        {insight("daily")}
        {s.days.length === 0 ? (
          <EmptyNote text="Chưa có file theo ngày (export-sc…csv) của tháng này — up ở Dữ Liệu Gốc." />
        ) : (
          <Panel title="GMV theo ngày" icon={<BarChart3 className="w-4 h-4" />} sub="Cột sáng = ngày camp (D-Day, Mid-Month, Pay Day)">
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
          <Panel title="Ngày cao nhất" icon={<ShoppingBag className="w-4 h-4" />} sub={`Top 5 trên ${s.days.length} ngày có số`}>
            <ReportTable head={["Ngày", "GMV", "Thực nhận", "Đơn", "Người xem", "% GMV tháng"]}>
              {[...s.days]
                .sort((a, b) => b.salesPlaced - a.salesPlaced)
                .slice(0, 5)
                .map((d) => (
                  <tr key={d.date} style={{ borderBottom: `1px solid ${PAL.line}`, color: PAL.cream }}>
                    <td className={TD1}>
                      {dm(d.date)}
                      {getCampaignDayInfo(d.date) ? <span style={{ color: PAL.gold }}> · {getCampaignDayInfo(d.date)!.shortLabel}</span> : null}
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
          <EmptyNote text="Chưa có file overview (overview-v2…csv) của tháng này — up ở Dữ Liệu Gốc." />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="Người xem" value={fmtInt(o.viewers)} note={`${fmtInt(o.views)} lượt xem`} />
              <KpiTile label="Tương tác" value={fmtInt(o.engaged)} note={`${pct(o.viewers > 0 ? (o.engaged / o.viewers) * 100 : null)} người xem`} />
              <KpiTile label="Hiển thị sản phẩm" value={fmtInt(o.productImpressions)} />
              <KpiTile label="Click sản phẩm" value={fmtInt(o.productClicks)} note={`CTR ${pct(o.ctrPct, 2)}`} />
              <KpiTile label="Thêm vào giỏ" value={fmtInt(o.atc)} />
              <KpiTile label="Đơn đặt" value={fmtInt(o.ordersPlaced)} note={`Tỷ lệ đơn/click ${pct(o.orderRatePlacedPct, 2)}`} />
              {o.buyersPlaced > 0 && <KpiTile label="Người mua" value={fmtInt(o.buyersPlaced)} note={`${fmtInt(o.buyersConfirmed)} xác nhận`} />}
              <KpiTile label="Khách mới" value={pct(o.salesNewPlaced + o.salesOldPlaced > 0 ? (o.salesNewPlaced / (o.salesNewPlaced + o.salesOldPlaced)) * 100 : null, 0)} note="% doanh số từ khách mới" />
            </div>
            <Panel title="Nguồn traffic của live" icon={<Database className="w-4 h-4" />} sub="Doanh số và lượt xem theo nguồn dẫn vào phòng live">
              <ReportTable head={["Nguồn", "% doanh số", "Doanh số đặt", "Lượt xem", "Người xem", "Tương tác"]}>
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
          <EmptyNote text="Chưa có file Live List (…live_stream_list…xlsx) của tháng này — up ở Dữ Liệu Gốc." />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile label="Giờ live thực tế" value={hoursLabel(h.liveHours)} note={s.plan.hours > 0 ? `Lịch ca trong app ${hoursLabel(s.plan.hours)}` : "Chưa có ca Shopee trong app"} />
              <KpiTile label="Số phiên" value={fmtInt(h.liveSessions)} note={`${s.plan.sessions} ca trong app`} />
              <KpiTile label="GMV/phiên" value={h.liveSessions > 0 ? fmtVndShort(h.gmv / h.liveSessions) : "—"} />
              <KpiTile label={METRIC.gmvPerHour} value={h.gmvPerHour != null ? fmtVndShort(h.gmvPerHour) : "—"} />
            </div>
            <Panel title="Theo khung giờ" icon={<Clock className="w-4 h-4" />}>
              <ReportTable head={["Khung giờ", "Phiên", "Giờ live", "GMV", "GMV/giờ", "Người xem TB/phiên"]}>
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
            <Panel title="Theo loại ngày" icon={<Clock className="w-4 h-4" />} sub="Lịch camp cố định: D-Day, Mid-Month 13–15, Pay Day 23–25">
              <ReportTable head={["Loại ngày", "Ngày", "Phiên", "Giờ live", "GMV", "% GMV", "GMV/giờ"]}>
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
        <SectionHead no="5" title={SECTION_LABEL.people} sub="Từ ca Shopee đã diễn ra trong app" />
        {insight("people")}
        {s.hosts.length === 0 ? (
          <EmptyNote text="Chưa có ca Shopee đã diễn ra và đã gán host trong tháng này." />
        ) : (
          <Panel
            title="Xếp hạng GMV/giờ"
            icon={<Users className="w-4 h-4" />}
            sub={s.quality.manual > 0 ? `${s.quality.manual}/${s.quality.total} ca còn là số tạm (chưa đối soát bằng Live List)` : "Tất cả ca đã đối soát"}
          >
            <ReportTable head={["Host", "Ca", "Giờ", "GMV", "GMV/giờ"]}>
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
                {s.unassigned.sessions} ca chưa gán host ({fmtVndShort(s.unassigned.gmv)} GMV) không nằm trong xếp hạng.
              </p>
            )}
          </Panel>
        )}
      </section>

      {/* 6 · Sản phẩm */}
      <section className="space-y-4">
        <SectionHead no="6" title={SECTION_LABEL.products} sub="Product List của Shopee Live — doanh số bán trong live" />
        {insight("products")}
        {s.products.count === 0 ? (
          <EmptyNote text="Chưa có file Product List (…live_product_list…xlsx) của tháng này — up ở Dữ Liệu Gốc." />
        ) : (
          <Panel title="Sản phẩm bán chạy" icon={<Package className="w-4 h-4" />} sub={`${s.products.withSales}/${s.products.count} sản phẩm có doanh số · ba sản phẩm đầu ${pct(s.products.top3Share != null ? s.products.top3Share * 100 : null)}`}>
            <ReportTable head={["#", "Sản phẩm", "GMV", "% live", "Đơn", "Click", "Thêm giỏ"]}>
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
        <SectionHead no="·" title="Cách tính và điểm cần xác nhận" sub="Số nào lấy từ file nào, phần nào còn là số tạm" />
        <ul className="space-y-1.5 text-[12px] leading-relaxed list-disc pl-5" style={{ color: PAL.muted }}>
          {s.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
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
