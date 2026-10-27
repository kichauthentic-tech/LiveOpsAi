import React from "react";
import { Target } from "lucide-react";
import { METRIC } from "../../../lib/metricGlossary";
import { ADS_PARTS, ADS_PART_LABEL, type AdsMonthSummary } from "../../../lib/ads/adsTracking";
import { CAMP_DAY_BUCKET_ORDER } from "../../../lib/campaignDays";
import { fmtDateVn, fmtFixed, fmtVndShort } from "../../../lib/format";
import { DAY_TYPE_SHORT, PAL } from "./theme";
import { KpiTile, Panel, ReportTable } from "./ui";

// Trang Quảng cáo — ngân sách Ads theo kế hoạch brand (file tracking dán ở Nhập Ads, 0184): target vs thực tế tách Live / Product /
// Creator và theo loại ngày, cắt ở ngày cuối có số thực. ROAS Live = LIVE GMV YFB ÷ Ads Live cùng các ngày đó (ước tính: Ads Live
// của brand có thể đẩy cả phiên ngoài YFB). Số tính ở lib/ads/adsTracking.ts.

const rowStyle = (idx: number) => ({ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" });
const pctOf = (a: number, t: number) => (t > 0 ? `${fmtFixed((a / t) * 100, 1)}%` : "—");
const signed = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${fmtFixed(Math.abs(v), 1)}%`);
const roasX = (gmv: number, ads: number) => (ads > 0 && gmv > 0 ? `${fmtFixed(gmv / ads, 1)}x` : "—");

export const AdsPlanPanel: React.FC<{ s: AdsMonthSummary; month: string }> = ({ s, month }) => {
  const through = s.lastActual ? fmtDateVn(s.lastActual, false) : null;
  const span = through ? `1–${through}` : `tháng ${month.slice(5)}`;
  const buckets = CAMP_DAY_BUCKET_ORDER.filter((b) => s.buckets[b]);
  const hasLive = buckets.some((b) => s.buckets[b]!.liveGmv > 0);
  return (
    <Panel
      title="Ngân sách Ads theo kế hoạch"
      icon={<Target className="w-4 h-4" />}
      sub={`Kế hoạch Ads theo ngày của brand · Live / Product (GMV Max) / Creator · so thực tế ${span} với target cùng các ngày`}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mb-4">
        <KpiTile frame="plain" label="Target Ads cả tháng" value={fmtVndShort(s.monthTarget)} note={`${s.days} ngày có target`} />
        <KpiTile frame="plain" label={through ? `${METRIC.adsCost} tới ${through}` : METRIC.adsCost} value={fmtVndShort(s.mtdActual)} note={s.spentOfMonth != null ? `${fmtFixed(s.spentOfMonth, 1)}% target cả tháng` : undefined} />
        <KpiTile frame="plain" label="So target cùng kỳ" value={signed(s.runrate)} note={through ? `thực tế ÷ target ${span}` : undefined} />
        <KpiTile frame="plain" label="ROAS Live" value={s.liveRoas != null ? `${fmtFixed(s.liveRoas, 1)}x` : "—"} note={s.liveRoas != null ? "LIVE GMV YFB ÷ Ads Live, cùng ngày" : undefined} />
      </div>
      <ReportTable head={[`Luỹ kế ${span}`, "Target", "Thực tế", "% target"]}>
        {ADS_PARTS.filter((p) => s.parts[p].target > 0 || s.parts[p].actual > 0).map((p, idx) => (
          <tr key={p} style={rowStyle(idx)}>
            <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{ADS_PART_LABEL[p]}</td>
            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(s.parts[p].target)}</td>
            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtVndShort(s.parts[p].actual)}</td>
            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{pctOf(s.parts[p].actual, s.parts[p].target)}</td>
          </tr>
        ))}
      </ReportTable>
      {buckets.length > 0 && (
        <div className="mt-3">
          <ReportTable head={["Loại ngày", "Số ngày", "Target", "Thực tế", "% target", ...(hasLive ? ["Ads Live", METRIC.liveGmv, "ROAS Live"] : [])]}>
            {buckets.map((b, idx) => {
              const r = s.buckets[b]!;
              return (
                <tr key={b} style={rowStyle(idx)}>
                  <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{DAY_TYPE_SHORT[b]}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.days}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(r.target)}</td>
                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtVndShort(r.actual)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{pctOf(r.actual, r.target)}</td>
                  {hasLive && (
                    <>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(r.liveAds)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.liveGmv > 0 ? fmtVndShort(r.liveGmv) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{roasX(r.liveGmv, r.liveAds)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </ReportTable>
        </div>
      )}
      {s.offDays.length > 0 && (
        <p className="mt-3 text-[11px]" style={{ color: PAL.muted }}>
          Ngày chi lệch target từ 30%: {s.offDays.map((d) => `${fmtDateVn(d.date, false)} ${signed(d.pct)}${d.note ? ` (${d.note})` : ""}`).join("; ")}.
        </p>
      )}
      {hasLive && (
        <p className="mt-2 text-[11px]" style={{ color: PAL.muted }}>
          ROAS Live là ước tính: Ads Live của shop có thể đẩy cả phiên ngoài livestream YFB, còn LIVE GMV chỉ gồm phiên YFB.
        </p>
      )}
    </Panel>
  );
};
