import React from "react";
import type { Brand } from "../../../types";
import type { ReportPlatform } from "../../../lib/reportPlatform";
import { profileOf } from "../../../lib/platforms/profiles";
import { StatTile } from "../../common/StatTile";
import { Card, money, pct } from "../shared";
import type { BrandFiles, ShopMonth } from "./useBrandFiles";
import { CoTable, HostTable, SlotTable, type Scope } from "./opsBlocks";
import { BlockHead, Chg, Sect, TD, Table } from "./ui";

// Từ Shop trở xuống của tab Brand (demo v21–v22, 22/10/2026): mỗi mục một nhịp — hàng 4 ô số rồi thẻ trải hết chiều ngang; thẻ
// không có dữ liệu thì ẩn. Shop / SKU / Quảng cáo / Khuyến mãi chỉ có file theo tháng ⇒ chỉ hiện ở nút Tháng (hoặc kỳ khác ngoài
// tháng đang chạy). Đội live + khung giờ tính từ ca ⇒ ở nút Đợt campaign chỉ lấy các ca của đợt.

const sumOf = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const tot = (m: ShopMonth) => ({
  gmv: sumOf(m.days, (d) => d.gmv),
  live: sumOf(m.days, (d) => d.liveLinked),
  aff: sumOf(m.days, (d) => d.affiliate),
  video: sumOf(m.days, (d) => d.video),
  refunds: sumOf(m.days, (d) => d.refunds),
  days: m.days.length
});

export const ShopSection: React.FC<{ files: BrandFiles; platform: ReportPlatform }> = ({ files, platform }) => {
  if (files.loading) return <><Sect title="Shop" sub="đang đọc file brand…" /></>;
  if (!profileOf(platform).hasShopAnalytics) return <ShopeeShop files={files} />;
  const last = files.shop[files.shop.length - 1], prev = files.shop.length > 1 ? files.shop[files.shop.length - 2] : null;
  const x = last ? tot(last) : null, y = prev ? tot(prev) : null;
  const fileM = (m: ShopMonth) => `T${Number(m.month.slice(5))}`;
  const PARTS = [
    { label: "Seller LIVE", key: "live" as const, color: "var(--accent)" },
    { label: "Affiliate LIVE", key: "aff" as const, color: "var(--success)" },
    { label: "Video", key: "video" as const, color: "color-mix(in srgb, var(--success) 50%, transparent)" }
  ];
  return (
    <>
      <Sect title="Shop" sub="từ file brand upload ở Dữ Liệu Gốc · số theo tháng" />
      {x && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatTile frame="card" size="lg" label="Total GMV" value={money(x.gmv)} hint={y ? <><Chg cur={x.gmv / x.days} prev={y.gmv / y.days} /> mỗi ngày vs file {fileM(prev!)}</> : undefined} />
          <StatTile frame="card" size="lg" label="% LIVE GMV" value={pct(x.live / x.gmv)} hint={y ? <><Chg cur={x.live / x.gmv} prev={y.live / y.gmv} points /> vs file {fileM(prev!)}</> : "Seller LIVE ÷ Total GMV"} />
          <StatTile frame="card" size="lg" label="Affiliate LIVE" value={money(x.aff)} hint={`${pct(x.aff / x.gmv)} Total GMV`} />
          <StatTile frame="card" size="lg" label="Refund rate" value={pct(x.refunds / x.gmv, 1)} hint={y ? <><Chg cur={x.refunds / x.gmv} prev={y.refunds / y.gmv} points inv /> vs file {fileM(prev!)}</> : undefined} />
        </div>
      )}
      {files.shop.length > 0 ? (
        <Card>
          <BlockHead title="Cơ cấu GMV của shop theo tháng" sub={`File Shop Analytics · ${files.shop.length} tháng · cột phải = Seller LIVE ÷ Total GMV · * tháng chưa đủ ngày`} />
          <div className="space-y-2">
            {files.shop.map((m) => {
              const t = tot(m);
              const other = Math.max(0, t.gmv - t.live - t.aff - t.video);
              const segs = [...PARTS.map((p) => ({ ...p, v: t[p.key] })), { label: "Product card và nguồn khác", key: "other" as const, color: "var(--border)", v: other }];
              const full = m.days.length >= new Date(Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7)), 0)).getUTCDate();
              return (
                <div key={m.month} className="grid grid-cols-[56px_minmax(0,1fr)_88px] items-center gap-3 text-xs">
                  <span><b className="text-[var(--text)]">{fileM(m)}{full ? "" : "*"}</b><span className="block text-[var(--text-faint)] tabular-nums">{money(t.gmv)}</span></span>
                  <div className="flex h-6 rounded-md overflow-hidden bg-[var(--surface-base)]" role="img" aria-label={segs.map((s) => `${s.label} ${pct(s.v / t.gmv)}`).join(", ")}>
                    {segs.map((s) => (s.v > 0 ? <i key={s.key} className="h-full flex items-center justify-center text-[11px] font-bold text-[var(--text)]" style={{ width: `${(s.v / t.gmv) * 100}%`, background: s.color }} title={`${s.label}: ${money(s.v)} (${pct(s.v / t.gmv)})`}>{s.v / t.gmv >= 0.09 ? pct(s.v / t.gmv) : ""}</i> : null))}
                  </div>
                  <span className="text-right"><b className="text-[var(--text)]">{pct(t.live / t.gmv)}</b> LIVE<span className="block text-[var(--text-faint)]">Refund {pct(t.refunds / t.gmv, 1)}</span></span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-[var(--text-faint)]">
            {[...PARTS, { label: "Product card và nguồn khác", color: "var(--border)" }].map((p) => <span key={p.label} className="inline-flex items-center gap-1.5"><i className="w-3 h-2 rounded-sm" style={{ background: p.color }} />{p.label}</span>)}
          </div>
        </Card>
      ) : (
        <Card><p className="text-sm text-[var(--text-muted)]">Chưa có file Shop Analytics cho brand này ở Dữ Liệu Gốc.</p></Card>
      )}
      <SkuCard files={files} />
    </>
  );
};

const SkuCard: React.FC<{ files: BrandFiles }> = ({ files }) => {
  const s = files.sku;
  if (!s || s.items.length === 0) return null;
  const days = (a?: string, b?: string) => (a && b ? (Date.parse(b) - Date.parse(a)) / 86400000 + 1 : 30);
  const k = files.skuPrev ? days(files.skuPrev.periodStart, files.skuPrev.periodEnd) / days(s.periodStart, s.periodEnd) : 1;
  const prevOf = (name: string) => { const r = files.skuPrev?.items.find((x) => x.name === name); return r ? r.gmvLive / k : null; };
  return (
    <Card>
      <BlockHead title="Sản phẩm bán qua live" sub={`File Sản Phẩm ${s.periodStart ?? ""}${s.periodEnd ? `–${s.periodEnd}` : ""} · top ${s.items.length} theo GMV${files.skuPrev ? ` · dưới GMV live: so với file tháng trước${k !== 1 ? " (quy về cùng số ngày vì hai file dài khác nhau)" : ""}` : ""}`} />
      <Table head={["Sản phẩm", "GMV live", "GMV", "% live", "Items sold"]}>
        {s.items.map((r) => {
          const p = prevOf(r.name);
          return (
            <tr key={r.name}>
              <td className={`${TD} max-w-[520px] truncate font-medium text-[var(--text)]`} title={r.name}>{r.name}</td>
              <td className={TD}>{money(r.gmvLive)}{files.skuPrev && <div className="text-[11px]">{p == null ? <span className="text-[var(--text-faint)]">mới vào top</span> : <Chg cur={r.gmvLive} prev={p} />}</div>}</td>
              <td className={TD}>{money(r.gmv)}</td>
              <td className={TD}>{pct(r.gmv ? r.gmvLive / r.gmv : null)}</td>
              <td className={TD}>{r.itemsSold == null ? "—" : r.itemsSold.toLocaleString("vi-VN")}</td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
};

const ShopeeShop: React.FC<{ files: BrandFiles }> = ({ files }) => {
  const c = files.shopee, p = files.shopeePrev;
  if (!c.length) return <><Sect title="Shop" sub="từ file Shopee theo ngày ở Dữ Liệu Gốc" /><Card><p className="text-sm text-[var(--text-muted)]">Chưa có file Shopee theo ngày (Live Daily) cho tháng này.</p></Card></>;
  const s = (xs: typeof c, f: (d: (typeof c)[number]) => number) => xs.reduce((a, d) => a + f(d), 0);
  const per = (xs: typeof c, f: (d: (typeof c)[number]) => number) => (xs.length ? s(xs, f) / xs.length : null);
  const placed = s(c, (d) => d.salesPlaced), conf = s(c, (d) => d.salesConfirmed), cancel = placed > 0 ? 1 - conf / placed : null;
  const cancelB = p.length && s(p, (d) => d.salesPlaced) > 0 ? 1 - s(p, (d) => d.salesConfirmed) / s(p, (d) => d.salesPlaced) : null;
  return (
    <>
      <Sect title="Shop" sub={`File Shopee theo ngày ${c[0].date.slice(8, 10)}–${c[c.length - 1].date.slice(8, 10)}/${c[0].date.slice(5, 7)} · số trong app theo đơn đặt (Placed Order); Confirmed Order là số brand thực nhận · so với file tháng trước, mỗi ngày`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatTile frame="card" size="lg" label="Sales (Placed Order)" value={money(placed)} hint={p.length ? <><Chg cur={per(c, (d) => d.salesPlaced)} prev={per(p, (d) => d.salesPlaced)} /> mỗi ngày vs tháng trước</> : undefined} />
        <StatTile frame="card" size="lg" label="Sales (Confirmed Order)" value={money(conf)} hint={p.length ? <><Chg cur={per(c, (d) => d.salesConfirmed)} prev={per(p, (d) => d.salesConfirmed)} /> mỗi ngày vs tháng trước</> : undefined} />
        <StatTile frame="card" size="lg" label="Huỷ sau khi đặt" value={pct(cancel, 1)} hint={cancelB != null ? <><Chg cur={cancel} prev={cancelB} points inv /> vs tháng trước</> : "1 − Confirmed ÷ Placed"} />
        <StatTile frame="card" size="lg" label="Engaged Viewers" value={s(c, (d) => d.engaged).toLocaleString("vi-VN")} hint={p.length ? <><Chg cur={per(c, (d) => d.engaged)} prev={per(p, (d) => d.engaged)} /> mỗi ngày vs tháng trước</> : undefined} />
      </div>
    </>
  );
};

export const AdsSection: React.FC<{ files: BrandFiles }> = ({ files }) => {
  const ads = files.ads, promo = files.promo;
  const aff = files.affiliate;
  if (files.loading || (!ads && !(promo && promo.items.length) && aff.length === 0)) return null;
  const cost = ads ? sumOf(ads.days, (d) => d.cost) : 0, rev = ads ? sumOf(ads.days, (d) => d.revenue) : 0, orders = ads ? sumOf(ads.days, (d) => d.orders) : 0;
  return (
    <>
      <Sect title="Quảng cáo, khuyến mãi và affiliate" sub="từ file brand và tab Affiliate · số theo tháng" />
      {ads && ads.days.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatTile frame="card" size="lg" label="Ads cost" value={money(cost)} hint={`${ads.days[0].date.slice(8, 10)}–${ads.days[ads.days.length - 1].date.slice(8, 10)}/${ads.days[0].date.slice(5, 7)}`} />
          <StatTile frame="card" size="lg" label="GMV từ ads" value={money(rev)} hint={`${orders.toLocaleString("vi-VN")} SKU orders`} />
          <StatTile frame="card" size="lg" label="ROAS" value={cost > 0 ? (rev / cost).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "—"} hint="đồng thu / đồng chi" />
          <StatTile frame="card" size="lg" label="Cost/Order" value={orders > 0 ? money(cost / orders) : "—"} hint="TikTok Ads" />
        </div>
      )}
      {aff.length > 0 && (
        <Card>
          <BlockHead title="Affiliate (creator ngoài)" sub={`Tab Affiliate · ${aff.length} phiên · dòng chưa có số liệu là kế hoạch · không cộng vào GMV live của agency`} />
          <Table head={["Creator", "Ngày", "Giờ", "GMV", "Target", "Orders", "Ads cost"]}>
            {aff.map((e, i) => {
              const planned = e.status === "planned";
              const h = e.durationHours ?? e.planDurationHours;
              return (
                <tr key={e.id ?? i} className={planned ? "opacity-70" : ""}>
                  <td className={`${TD} max-w-[260px] truncate text-[var(--text)]`} title={e.creatorName}>{e.creatorName}</td>
                  <td className={TD}>{e.liveDateLabel ?? "—"}</td>
                  <td className={TD}>{h != null ? h.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "—"}</td>
                  <td className={TD}>{planned ? <span className="text-[var(--text-faint)]">kế hoạch</span> : money(e.directGmv ?? null)}</td>
                  <td className={TD}>{e.targetGmv ? money(e.targetGmv) : "—"}</td>
                  <td className={TD}>{e.orders != null ? e.orders.toLocaleString("vi-VN") : "—"}</td>
                  <td className={TD}>{(e.adsCost ?? e.planBudgetAds) ? money(e.adsCost ?? e.planBudgetAds ?? null) : "—"}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
      {promo && promo.items.length > 0 && (
        <Card>
          <BlockHead title="Khuyến mãi" sub={`Chương trình chạy trọn trong tháng · top ${promo.items.length} theo GMV${promo.excludedMultiMonth ? ` · bỏ ${promo.excludedMultiMonth} chương trình vắt qua tháng khác (file chỉ có số liệu luỹ kế)` : ""}`} />
          <Table head={["Chương trình", "GMV", "Orders", "Avg. discount", "ROI"]}>
            {promo.items.map((r) => (
              <tr key={r.name}>
                <td className={`${TD} max-w-[420px] truncate text-[var(--text)]`} title={r.name}>{r.name}</td>
                <td className={TD}>{money(r.gmv)}</td>
                <td className={TD}>{r.orders.toLocaleString("vi-VN")}</td>
                <td className={TD}>{r.discount != null && r.orders ? money(r.discount / r.orders) : "—"}</td>
                <td className={TD}>{r.roi != null ? r.roi.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
};

export const TeamSection: React.FC<{ s: Scope; brands: Brand[]; wave?: string }> = ({ s, brands, wave }) => (
  <>
    <Sect title="Nhân sự live" sub={wave ? `chỉ các ca ${wave} · host tính GMV, trợ live tính giờ · so với ${wave} tháng trước` : "host tính GMV, trợ live tính giờ · theo kỳ đang chọn"} />
    <div className="grid gap-4 xl:grid-cols-2 items-start [&>*]:min-w-0">
      <HostTable s={s} brands={brands} showBrand={false} minSessions={wave ? 1 : 3} title="Host chạy kênh này" />
      <CoTable s={s} brands={brands} showBrand={false} />
    </div>
    <SlotTable s={s} within={wave ? "đợt" : "kỳ"} />
  </>
);
