import React, { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import type { Brand, BrandChannel, BrandMonthlyReport, BrandMonthPlan, LiveSession } from "../types";
import { fetchDataRawImportStamps, type DataRawImportStamp } from "../lib/db/brandDataRaw";
import { fetchAffiliateTodoData, type AffiliateTodoRow } from "../lib/db/affiliateActuals";
import { fetchPlanStatuses } from "../lib/db/monthPlans";
import { brandMonthKey, brandPlatformKey, channelTitle, platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { platformsOfBrand } from "../lib/channels";
import { rememberBrandId } from "../lib/defaultBrand";
import { CLOSE_COLUMNS, closeDeadline, closeRow, openCount, type CloseCell, type CloseState } from "../lib/report/monthClose";
import { errorMessage } from "../lib/errorMessage";
import { BrandLogo } from "./ui/BrandLogo";

// "Chốt tháng" ở Toàn Cảnh Brand (audit Report Tháng 27/10, phương án B): mỗi kênh của sàn đang xem một dòng, mỗi đầu vào của Report
// Tháng một ô; ô chưa đủ là nút mở đúng chỗ nhập. Logic ở lib/report/monthClose.ts.

const CELL_CLS: Record<CloseState, string> = {
  ok: "bg-emerald-950 text-emerald-300 border-emerald-800",
  partial: "bg-amber-950 text-amber-300 border-amber-800",
  missing: "bg-rose-950 text-rose-300 border-rose-800",
  optional: "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)]",
  na: "bg-transparent text-[var(--text-faint)] border-transparent"
};

const addMonths = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

interface Props {
  platform: ReportPlatform;
  month: string;
  today: string;
  brands: Brand[];
  brandChannels: BrandChannel[];
  sessions: LiveSession[];
  monthlyReports: Map<string, BrandMonthlyReport>;
  onNavigate?: (tab: string, brandId?: string, platform?: ReportPlatform) => void;
}

export const MonthClosePanel: React.FC<Props> = ({ platform, month, today, brands, brandChannels, sessions, monthlyReports, onNavigate }) => {
  const channelBrands = useMemo(
    () =>
      brands
        .filter((b) => platformsOfBrand(brandChannels, b.id).includes(platform))
        .filter((b) => sessions.some((s) => s.brandId === b.id && platformOf(s) === platform && s.date.startsWith(month) && s.status !== "Cancelled"))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [brands, brandChannels, platform, sessions, month]
  );
  const brandKey = channelBrands.map((b) => b.id).join(",");
  const nextMonth = addMonths(month, 1);

  const [data, setData] = useState<{ key: string; stamps: Map<string, DataRawImportStamp[]>; affiliate: AffiliateTodoRow[] | null; nextPlans: Map<string, BrandMonthPlan> } | null>(null);
  // Lỗi gắn với lượt đọc của nó — đổi tháng là tự hết, không phải xoá trong effect.
  const [failed, setFailed] = useState<{ key: string; msg: string } | null>(null);
  const loadKey = `${month}|${brandKey}`;
  const error = failed?.key === loadKey ? failed.msg : null;
  useEffect(() => {
    let alive = true;
    const ids = brandKey ? brandKey.split(",") : [];
    Promise.all([
      Promise.all(ids.map((id) => fetchDataRawImportStamps(id).then((s) => [id, s] as const))),
      // Affiliate thiếu bảng (DB chưa 0155) thì cột ghi "không chạy" — không chặn cả khối.
      fetchAffiliateTodoData([month]).then((a) => a.rows).catch(() => null),
      fetchPlanStatuses(nextMonth)
    ])
      .then(([stamps, affiliate, nextPlans]) => alive && setData({ key: loadKey, stamps: new Map(stamps), affiliate, nextPlans }))
      .catch((e) => alive && setFailed({ key: loadKey, msg: errorMessage(e, "Không tải được trạng thái file") }));
    return () => {
      alive = false;
    };
  }, [loadKey, brandKey, month, nextMonth]);

  const ready = data?.key === loadKey;
  const rows = useMemo(() => {
    if (!ready || !data) return [];
    return channelBrands
      .map((b) => {
        const cells = closeRow({
          brandId: b.id,
          platform,
          month,
          today,
          sessions,
          stamps: data.stamps.get(b.id) ?? [],
          affiliate: data.affiliate,
          nextPlan: data.nextPlans.get(brandPlatformKey(b.id, platform)),
          report: monthlyReports.get(brandMonthKey(b.id, month, platform))
        });
        return { brand: b, cells, open: openCount(cells), multi: platformsOfBrand(brandChannels, b.id).length > 1 };
      })
      .sort((a, b) => b.open - a.open || a.brand.name.localeCompare(b.brand.name));
  }, [ready, data, channelBrands, platform, month, today, sessions, monthlyReports, brandChannels]);

  if (channelBrands.length === 0) return null;
  const deadline = closeDeadline(month);
  const left = dayDiff(today, deadline);
  const totalOpen = rows.reduce((a, r) => a + r.open, 0);
  const cols = CLOSE_COLUMNS[platform];
  const go = (brandId: string, c: CloseCell) => {
    if (!onNavigate) return;
    const tab = cols.find((x) => x.key === c.key)!.tab;
    if (tab === "month_plan") {
      rememberBrandId(brandId);
      onNavigate(tab, undefined, platform);
    } else onNavigate(tab, brandId, platform);
  };

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden" aria-label={`Chốt tháng ${Number(month.slice(5))}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
          <ClipboardCheck className="w-4 h-4 text-[var(--accent-text)]" /> Chốt tháng {Number(month.slice(5))}/{month.slice(0, 4)} · {platform}
        </h2>
        <span className={`text-xs font-semibold ${left < 0 ? "text-rose-300" : left <= 3 ? "text-amber-300" : "text-[var(--text-muted)]"}`}>
          hạn {deadline.slice(8)}/{deadline.slice(5, 7)}
          {left < 0 ? ` · quá ${-left} ngày` : left === 0 ? " · hôm nay" : ` · còn ${left} ngày`}
        </span>
        {ready && <span className="text-xs text-[var(--text-faint)]">{totalOpen ? `${totalOpen} ô còn thiếu` : "đủ đầu vào cho mọi kênh"}</span>}
      </div>
      <p className="px-4 pb-2 text-[11px] text-[var(--text-faint)]">
        Report Tháng chỉ đầy đủ khi mọi ô xanh. File toàn shop phủ thiếu ngày thì không phát hành được; chưa tải file toàn shop thì report gửi brand chỉ có phần livestream. Bấm ô để mở chỗ nhập.
      </p>
      {error && <p className="px-4 pb-3 text-xs text-red-300">{error}</p>}
      {!ready && !error && (
        <p className="px-4 pb-3 text-[11px] text-[var(--text-faint)] flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Đang đọc file đã tải…
        </p>
      )}
      {ready && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-y border-[var(--border)] text-[11px] font-semibold">
                <th className="py-2 px-4">Kênh</th>
                {cols.map((c) => (
                  <th key={c.key} className="py-2 px-2 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ brand: b, cells, multi }) => (
                <tr key={b.id} className="border-b border-[var(--border-muted)] align-top">
                  <td className="py-2 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text)]">
                      <BrandLogo brand={b} size="xs" /> {channelTitle(b.name, platform, multi)}
                    </span>
                  </td>
                  {cells.map((c) => {
                    const actionable = (c.state === "missing" || c.state === "partial" || c.state === "optional") && !!onNavigate;
                    const cls = `inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${CELL_CLS[c.state]}`;
                    return (
                      <td key={c.key} className="py-2 px-2">
                        {actionable ? (
                          <button type="button" onClick={() => go(b.id, c)} className={`${cls} min-h-6 hover:brightness-125`} title="Mở chỗ nhập">
                            {c.text} →
                          </button>
                        ) : (
                          <span className={cls}>{c.text}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
