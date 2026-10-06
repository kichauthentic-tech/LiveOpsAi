import React, { useEffect, useMemo, useState } from "react";
import { defaultReportMonth } from "../../lib/defaultMonth";
import { LiveSession, UserRole, BrandMonthlyReport as BrandMonthlyReportType, BrandDataRawImport, DataRawReportType } from "../../types";
import { AlertTriangle, FileSpreadsheet, Loader2, Lock, Megaphone, Target, Trash2, Upload } from "lucide-react";
import { parseDataRawExcel, type ParsedDataRawImport } from "../../lib/dataraw/parseDataRawExcel";
import { adsMonthStats, adsPrevSameCut, readAdsDays } from "../../lib/dataraw/adsCampaignOverview";
import { fetchAdsMonthSlice, type AdsMonthSlice } from "../../lib/dataraw/monthlyProductSlice";
import { createOrReplaceDataRawImport, dataRawImportsRead, deleteDataRawImport, fetchDataRawImports, findExistingImportForMonth } from "../../lib/db/brandDataRaw";
import { useConfirm } from "../../hooks/useConfirm";
import { getTodayMonth } from "../../lib/dateUtils";
import { monthlyReportRead } from "../../lib/db/monthlyReports";
import { errorMessage } from "../../lib/errorMessage";
import type { TabPrefetchCtx } from "../../lib/db/prefetch";

import { fmtDateVn, fmtMonth, fmtFixed, fmtVndFull, fmtVndShort } from "../../lib/format";
import { MonthPicker } from "../common/MonthPicker";
import { PageHeader } from "../common/PageHeader";
import { ShopeeAdsPanel } from "./ShopeeAdsPanel";
import { fetchMonthlyReport } from "../../lib/db/monthlyReports";
import type { ReportPlatform } from "../../lib/reportPlatform";
// Nhập Ads (tab ops-only, tách khỏi Report Tháng 2026-09-21). Từ 2026-10-05 (migration 0137): Ads lấy từ FILE
// "Campaign overview data" của TikTok Ads (GMV Max, theo ngày, toàn cửa hàng) tải lên ngay ở đây — chỗ DUY NHẤT nhập
// Ads; file lưu vào kho Dữ Liệu Gốc (loại ads_campaign_overview, 1 file / brand / tháng), Report Tháng phần 6 đọc lại
// qua bản chụp. Gọn trang 05/10 (user: "thừa quá"; đo production: 4/4 dòng report để trống các ô này) — đã bỏ:
// ô "Ads cost bổ sung"/"ROAS ghi đè", 3 ô ghi chú Promotion/Customer Insight/Account Health (nhận xét viết bằng
// "Sửa Insight" ở từng phần của Report Tháng), khối Ads theo ca từ Report Ca (Finance vẫn đọc), khối "Target và lịch
// tháng sau" (chỉ là nút sang Kế Hoạch Tháng). Còn lại khung camp gập — chỉ tháng không có Kế Hoạch Tháng.

const CAN_MANAGE_ROLES: UserRole[] = ["ceo", "operations", "admin"];
const ADS_TYPE: DataRawReportType = "ads_campaign_overview";

interface BrandAdsReportProps {
  brandId: string;
  brandName: string;
  /** Sàn (bộ chuyển sàn của Brand workspace): TikTok = file TikTok Ads (0137), Shopee = file Shopee Live Ads (0142). */
  platform: ReportPlatform;
  multiPlatform: boolean;
  sessions: LiveSession[];
  currentRole: UserRole;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function prevMonthStr(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m là 1-12, lùi 1 tháng
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function momPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// tone: "up" = tăng là tốt (xanh), "down" = giảm là tốt (chi phí/đơn), "neutral" = không tô màu (chi phí Ads).
const MomChip: React.FC<{ current: number | null; previous: number | null; tone?: "up" | "down" | "neutral" }> = ({ current, previous, tone = "up" }) => {
  if (current == null || previous == null) return <div className="text-[11px] text-[var(--text-faint)] mt-0.5">MoM —</div>;
  const pct = momPct(current, previous);
  if (pct == null) return <div className="text-[11px] text-[var(--text-faint)] mt-0.5">MoM —</div>;
  const positive = pct >= 0;
  const good = tone === "up" ? positive : !positive;
  const color = tone === "neutral" ? "text-[var(--text-muted)]" : good ? "text-emerald-400" : "text-red-400";
  return (
    <div className={`text-[11px] font-bold mt-0.5 ${color}`}>
      MoM {positive ? "+" : ""}
      {fmtFixed(pct, 1)}%
    </div>
  );
};

// Lượt đọc lúc mở màn — nạp trước trong lúc chờ đợt nạp chung (lib/db/prefetch.ts).
export function prefetchBrandAdsReport({ brandId, role }: TabPrefetchCtx): void {
  if (!brandId || (role && !CAN_MANAGE_ROLES.includes(role))) return;
  const month = defaultReportMonth(`${getTodayMonth()}-01`, []);
  monthlyReportRead.prefetch(brandId, `${month}-01`);
  dataRawImportsRead.prefetch(brandId, ADS_TYPE);
}

export const BrandAdsReport: React.FC<BrandAdsReportProps> = ({ brandId, brandName, platform, multiPlatform, sessions, currentRole }) => {
  const isShopee = platform === "Shopee";
  const canManage = CAN_MANAGE_ROLES.includes(currentRole);
  // Cùng tháng mở sẵn với Report Tháng — phần nhập ở đây đi theo report đó (lib/defaultMonth.ts).
  const [month, setMonth] = useState(() => defaultReportMonth(`${getTodayMonth()}-01`, sessions.filter((s) => s.brandId === brandId)));
  const [report, setReport] = useState<BrandMonthlyReportType | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const confirm = useConfirm();
  // File Ads (TikTok Ads "Campaign overview data") — danh sách file đã tải + số của tháng đang xem và tháng trước.
  const [adsImports, setAdsImports] = useState<BrandDataRawImport[]>([]);
  const [adsCur, setAdsCur] = useState<AdsMonthSlice | null>(null);
  const [adsPrev, setAdsPrev] = useState<AdsMonthSlice | null>(null);
  // Khoá (tháng|lần ghi) của lượt đọc đã về — khác khoá hiện tại ⇒ đang đọc (không setState đầu effect).
  const [adsLoadedKey, setAdsLoadedKey] = useState<string | null>(null);
  const [adsVersion, setAdsVersion] = useState(0); // tăng sau mỗi lần tải lên/xoá ⇒ đọc lại
  const [adsError, setAdsError] = useState<string | null>(null);
  const [adsPreview, setAdsPreview] = useState<{ parsed: ParsedDataRawImport; fileName: string; replace?: BrandDataRawImport } | null>(null);
  const [adsSaving, setAdsSaving] = useState(false);

  const { start, end } = useMemo(() => monthRange(month), [month]);
  const { start: prevStart, end: prevEnd } = useMemo(() => monthRange(prevMonthStr(month)), [month]);

  useEffect(() => {
    let cancelled = false;
    // Lần đầu nhận bản nạp trước; sau khi ghi thì đọc thẳng (lib/db/prefetch.ts).
    (adsVersion === 0 ? dataRawImportsRead.take(brandId, ADS_TYPE) : fetchDataRawImports(brandId, ADS_TYPE))
      .then((list) => !cancelled && setAdsImports(list))
      .catch((e) => !cancelled && setAdsError(errorMessage(e, "Không tải được danh sách file Ads")));
    return () => {
      cancelled = true;
    };
  }, [brandId, adsVersion]);
  useEffect(() => {
    let cancelled = false;
    const key = `${brandId}|${start}|${adsVersion}`;
    Promise.all([fetchAdsMonthSlice(brandId, start, end), fetchAdsMonthSlice(brandId, prevStart, prevEnd)])
      .then(([cur, prev]) => {
        if (cancelled) return;
        setAdsCur(cur);
        setAdsPrev(prev);
      })
      .catch((e) => !cancelled && setAdsError(errorMessage(e, "Không đọc được file Ads")))
      .finally(() => !cancelled && setAdsLoadedKey(key));
    return () => {
      cancelled = true;
    };
  }, [brandId, start, end, prevStart, prevEnd, adsVersion]);

  const adsLoading = adsLoadedKey !== `${brandId}|${start}|${adsVersion}`;
  const adsImportOfMonth = useMemo(() => findExistingImportForMonth(adsImports, `${month}-01`), [adsImports, month]);
  const adsStats = useMemo(() => (adsCur?.days.length ? adsMonthStats(adsCur.days) : null), [adsCur]);
  // So cùng kỳ: tháng này chưa đủ ngày ⇒ tháng trước cắt cùng số ngày.
  const adsPrevStats = useMemo(
    () => (adsCur?.days.length && adsPrev?.days.length ? adsMonthStats(adsPrevSameCut(adsCur.days, adsPrev.days, end)) : null),
    [adsCur, adsPrev, end]
  );
  const previewStats = useMemo(() => (adsPreview ? adsMonthStats(readAdsDays(adsPreview.parsed.columns, adsPreview.parsed.rows)) : null), [adsPreview]);

  const handleAdsFile = async (file: File) => {
    setAdsError(null);
    setAdsPreview(null);
    try {
      const parsed = await parseDataRawExcel(file, ADS_TYPE);
      setAdsPreview({ parsed, fileName: file.name, replace: findExistingImportForMonth(adsImports, parsed.periodStart) });
    } catch (e) {
      setAdsError(errorMessage(e, "Không đọc được file."));
    }
  };

  const handleAdsConfirm = async () => {
    if (!adsPreview) return;
    setAdsSaving(true);
    setAdsError(null);
    try {
      await createOrReplaceDataRawImport(brandId, ADS_TYPE, adsPreview.fileName, adsPreview.parsed, adsPreview.replace?.id);
      const fileMonth = adsPreview.parsed.periodStart?.slice(0, 7);
      setAdsPreview(null);
      if (fileMonth && fileMonth !== month) setMonth(fileMonth);
      setAdsVersion((v) => v + 1);
    } catch (e) {
      setAdsError(errorMessage(e, "Không lưu được file Ads."));
    } finally {
      setAdsSaving(false);
    }
  };

  const handleAdsDelete = async () => {
    if (!adsImportOfMonth) return;
    if (!(await confirm(`Xoá file Ads tháng ${fmtMonth(month)}? Report Tháng sẽ không còn phần Ads của tháng này cho tới khi tải lại.`, { danger: true }))) return;
    try {
      await deleteDataRawImport(adsImportOfMonth.id);
      setAdsVersion((v) => v + 1);
    } catch (e) {
      setAdsError(errorMessage(e, "Không xoá được file Ads."));
    }
  };


  useEffect(() => {
    let cancelled = false;
    setErrorMsg(null);
    (isShopee ? fetchMonthlyReport(brandId, `${month}-01`, "Shopee") : monthlyReportRead.take(brandId, `${month}-01`))
      .then((r) => {
        if (cancelled) return;
        setReport(r);
      })
      .catch((e) => !cancelled && setErrorMsg(e.message || "Không tải được dữ liệu tháng"));
    return () => {
      cancelled = true;
    };
  }, [brandId, month, canManage, isShopee]);

  const isPublished = report?.status === "published";


  return (
    <div className="space-y-5">
      <PageHeader
        icon={Megaphone}
        title={`Nhập Ads · ${brandName}${multiPlatform || isShopee ? ` · ${platform}` : ""}`}
        description={
          isShopee
            ? 'Tải file "Shopee Live Ads Report" từ Quảng cáo Shopee, mỗi tháng một file — app tự tính chi phí, ROAS, chi phí/đơn và đưa vào Report Shopee. Xu (Coins Claimed) lấy sẵn từ file tổng quan Shopee ở Dữ Liệu Gốc, không cần nhập.'
            : `Tải file "Campaign overview data" (xem theo ngày) từ TikTok Ads, mỗi tháng một file — app tự tính chi phí, ROI, chi phí/đơn và đưa vào Report Tháng phần 6. Nhận xét cho brand viết bằng nút "Sửa Insight" ở từng phần của Report Tháng.`
        }
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            {isPublished && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-emerald-950 text-emerald-300 border-emerald-800">
                <Lock className="w-3.5 h-3.5" /> Report tháng đã phát hành
              </span>
            )}
          </>
        }
      />

      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{errorMsg}</div>
      )}

      {isShopee && (
        <ShopeeAdsPanel brandId={brandId} brandName={brandName} month={month} canManage={canManage} isPublished={isPublished} onMonthChange={setMonth} />
      )}

      {/* File Ads TikTok — chỗ DUY NHẤT nhập Ads TikTok (migration 0137, lib/dataraw/adsCampaignOverview.ts). */}
      {!isShopee && (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-[var(--accent-text)]" /> Ads toàn cửa hàng · tháng {fmtMonth(month)}
            </h3>
            <p className="text-[11px] text-[var(--text-faint)] mt-1">
              Nguồn: file &quot;Campaign overview data&quot; của TikTok Ads (gồm LIVE GMV Max và Product GMV Max), xem theo ngày. ROI = doanh thu
              gộp ÷ chi phí, cùng cách TikTok tính. So với tháng {fmtMonth(prevMonthStr(month))}
              {adsStats?.lastDate && adsStats.lastDate < end ? ` cắt cùng số ngày (1–${Number(adsStats.lastDate.slice(8))})` : ""}.
            </p>
          </div>
          {adsImportOfMonth && canManage && (
            <button onClick={handleAdsDelete} className="text-[11px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded-lg">
              <Trash2 className="w-3.5 h-3.5" /> Xoá file tháng này
            </button>
          )}
        </div>

        {adsError && <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{adsError}</div>}

        {canManage && !adsPreview && (
          <label className="border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)]/40 p-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-[var(--surface-hover)]">
            <Upload className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="font-bold text-[var(--text)] text-xs">
              {adsImportOfMonth ? "Tải file mới để thay file tháng này" : "Chọn file Ads (.xlsx) tải từ TikTok Ads"}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) handleAdsFile(f);
              }}
            />
          </label>
        )}

        {adsPreview && previewStats && (
          <div className="space-y-3 border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-elevated)]/40">
            <p className="text-xs font-semibold text-[var(--text)] flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> {adsPreview.fileName}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Tháng <b className="text-[var(--text)]">{fmtMonth(adsPreview.parsed.periodStart!.slice(0, 7))}</b> · {previewStats.days.length} ngày (
              {fmtDateVn(previewStats.firstDate!, false)}–{fmtDateVn(previewStats.lastDate!, false)}) · chi phí{" "}
              <b className="text-[var(--text)]">{fmtVndFull(previewStats.cost)}</b> · {fmtVndFull(previewStats.orders)} đơn SKU · doanh thu gộp{" "}
              <b className="text-[var(--text)]">{fmtVndFull(previewStats.revenue)}</b> · ROI {previewStats.roi != null ? `${fmtFixed(previewStats.roi, 1)}x` : "—"}
            </p>
            <p className="text-[11px] text-amber-300">
              File không ghi tên shop — kiểm lại đây đúng là Ads của <b>{brandName}</b> trước khi lưu.
            </p>
            {adsPreview.replace && (
              <p className="text-[11px] text-amber-300">
                Đã có file tháng này (tải {new Date(adsPreview.replace.importedAt).toLocaleString("vi-VN")}) — lưu sẽ THAY file cũ, không cộng dồn.
              </p>
            )}
            {isPublished && adsPreview.parsed.periodStart?.startsWith(month) && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Report Tháng {fmtMonth(month)} đã phát hành: brand vẫn thấy số cũ tới khi thu hồi report và bấm Cập nhật số liệu.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={handleAdsConfirm} disabled={adsSaving} className="bg-[var(--accent)] text-white font-bold px-4 py-2 rounded-xl text-xs disabled:opacity-50">
                {adsSaving ? "Đang lưu..." : adsPreview.replace ? "Lưu, thay file cũ" : "Lưu file Ads"}
              </button>
              <button onClick={() => setAdsPreview(null)} className="bg-[var(--surface-hover)] text-[var(--text-muted)] font-bold px-4 py-2 rounded-xl text-xs">
                Huỷ
              </button>
            </div>
          </div>
        )}

        {adsLoading ? (
          <div className="flex items-center gap-2 text-[var(--text-faint)] text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đọc file Ads...
          </div>
        ) : !adsStats ? (
          <p className="text-xs text-[var(--text-faint)]">
            Chưa có file Ads tháng {fmtMonth(month)}. Brand không chạy Ads tháng này thì bỏ qua — Report Tháng chỉ không có phần Ads.
          </p>
        ) : (
          <>
            {adsImportOfMonth && (
              <p className="text-[11px] text-[var(--text-faint)]">
                File: {adsImportOfMonth.fileName ?? "—"} · tải {new Date(adsImportOfMonth.importedAt).toLocaleString("vi-VN")} · {adsStats.days.length} ngày (
                {fmtDateVn(adsStats.firstDate!, false)}–{fmtDateVn(adsStats.lastDate!, false)})
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-[11px] text-[var(--text-faint)]">Chi phí Ads</div>
                <div className="text-base font-black text-[var(--text)]">{fmtVndShort(adsStats.cost)}</div>
                <MomChip current={adsStats.cost} previous={adsPrevStats?.cost ?? null} tone="neutral" />
              </div>
              <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-[11px] text-[var(--text-faint)]">ROI</div>
                <div className="text-base font-black text-[var(--text)]">{adsStats.roi != null ? `${fmtFixed(adsStats.roi, 1)}x` : "—"}</div>
                <MomChip current={adsStats.roi} previous={adsPrevStats?.roi ?? null} />
              </div>
              <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-[11px] text-[var(--text-faint)]">Chi phí / đơn SKU ({fmtVndFull(adsStats.orders)} đơn)</div>
                <div className="text-base font-black text-[var(--text)]">{adsStats.costPerOrder != null ? fmtVndFull(adsStats.costPerOrder) : "—"}</div>
                <MomChip current={adsStats.costPerOrder} previous={adsPrevStats?.costPerOrder ?? null} tone="down" />
              </div>
              <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3">
                <div className="text-[11px] text-[var(--text-faint)]">Doanh thu gộp từ Ads</div>
                <div className="text-base font-black text-[var(--text)]">{fmtVndShort(adsStats.revenue)}</div>
                <MomChip current={adsStats.revenue} previous={adsPrevStats?.revenue ?? null} />
              </div>
            </div>
            {adsStats.zeroOrderDays.length > 0 && (
              <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/50 rounded-xl p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                {adsStats.zeroOrderDays.length} ngày tiêu tiền mà 0 đơn ({adsStats.zeroOrderDays.map((d) => fmtDateVn(d.date, false)).join(", ")}) — tổng{" "}
                {fmtVndFull(adsStats.zeroOrderDays.reduce((a, d) => a + d.cost, 0))}.
              </div>
            )}
            <p className="text-[11px] text-[var(--text-faint)]">
              Doanh thu gộp tính theo đơn gốc trước huỷ/hoàn nên có thể lớn hơn GMV của shop — đừng lấy số này chia GMV.
            </p>
            <details className="rounded-xl border border-[var(--border)]">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-[var(--text-muted)]">Số từng ngày ({adsStats.days.length} ngày)</summary>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--surface)]">
                    <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                      <th className="py-2 px-2">Ngày</th>
                      <th className="py-2 px-2 text-right">Chi phí</th>
                      <th className="py-2 px-2 text-right">Đơn SKU</th>
                      <th className="py-2 px-2 text-right">Doanh thu gộp</th>
                      <th className="py-2 px-2 text-right">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adsStats.days.map((d) => (
                      <tr key={d.date} className={`border-b border-[var(--border-muted)] ${d.cost > 0 && d.orders === 0 ? "text-amber-300" : ""}`}>
                        <td className="py-1.5 px-2 font-semibold">{fmtDateVn(d.date, false)}</td>
                        <td className="py-1.5 px-2 text-right">{fmtVndFull(d.cost)}</td>
                        <td className="py-1.5 px-2 text-right">{fmtVndFull(d.orders)}</td>
                        <td className="py-1.5 px-2 text-right">{fmtVndFull(d.revenue)}</td>
                        <td className="py-1.5 px-2 text-right">{d.cost > 0 ? `${fmtFixed(d.revenue / d.cost, 1)}x` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>

      )}

      {/* Khung camp của tháng chỉ nhập ở Kế Hoạch Tháng (gộp cấu hình 06/10 — trước đó tháng không có kế hoạch nhập ở đây). */}
    </div>
  );
};
