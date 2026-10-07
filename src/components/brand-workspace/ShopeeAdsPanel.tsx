import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, Target, Trash2, Upload } from "lucide-react";
import type { BrandDataRawImport, DataRawReportType } from "../../types";
import { parseDataRawExcel, type ParsedDataRawImport } from "../../lib/dataraw/parseDataRawExcel";
import { shopeeAdsStats, type ShopeeAdsStats } from "../../lib/dataraw/shopeeAds";
import { fetchOverlappingBatchRows } from "../../lib/dataraw/monthlyProductSlice";
import { createOrReplaceDataRawImport, deleteDataRawImport, fetchDataRawImports, findExistingImportForMonth } from "../../lib/db/brandDataRaw";
import { useConfirm } from "../../hooks/useConfirm";
import { errorMessage } from "../../lib/errorMessage";
import { fmtFixed, fmtMonth, fmtVndFull, fmtVndShort } from "../../lib/format";
import { METRIC, metricHint } from "../../lib/metricGlossary";

// Nhập Ads — sàn Shopee (06/10, user chốt: chi phí Shopee có file riêng). Tải file "Shopee Live Ads Report" (một dòng /
// chiến dịch cho cả tháng) vào kho Dữ Liệu Gốc loại shopee_ads (migration 0142), 1 file / brand / tháng; Report Shopee đọc
// lại qua bản chụp. Khác TikTok: không có số theo ngày, nên không có ROAS theo loại ngày camp.

const TYPE: DataRawReportType = "shopee_ads";

interface Props {
  brandId: string;
  brandName: string;
  month: string; // YYYY-MM
  canManage: boolean;
  /** Report Shopee của tháng đã phát hành — lưu file vẫn được, brand thấy số mới khi thu hồi + cập nhật. */
  isPublished: boolean;
  onMonthChange: (m: string) => void;
}

const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

function StatsGrid({ s }: { s: ShopeeAdsStats }) {
  const box = "bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3";
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className={box}>
        <div className="text-[11px] text-[var(--text-faint)]" title={metricHint(METRIC.expense)}>{METRIC.expense}</div>
        <div className="text-base font-black text-[var(--text)]">{fmtVndShort(s.expense)}</div>
      </div>
      <div className={box}>
        <div className="text-[11px] text-[var(--text-faint)]" title={metricHint(METRIC.roas)}>{METRIC.roas}</div>
        <div className="text-base font-black text-[var(--text)]">{s.roas != null ? `${fmtFixed(s.roas, 1)}x` : "—"}</div>
      </div>
      <div className={box}>
        <div className="text-[11px] text-[var(--text-faint)]">{METRIC.expense}/{METRIC.orders} ({fmtVndFull(s.orders)} {METRIC.orders})</div>
        <div className="text-base font-black text-[var(--text)]">{s.costPerOrder != null ? fmtVndFull(s.costPerOrder) : "—"}</div>
      </div>
      <div className={box}>
        <div className="text-[11px] text-[var(--text-faint)]">{METRIC.gmv} (file Ads)</div>
        <div className="text-base font-black text-[var(--text)]">{fmtVndShort(s.gmv)}</div>
      </div>
    </div>
  );
}

export function ShopeeAdsPanel({ brandId, brandName, month, canManage, isPublished, onMonthChange }: Props) {
  const confirm = useConfirm();
  const [imports, setImports] = useState<BrandDataRawImport[]>([]);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; stats: ShopeeAdsStats | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ parsed: ParsedDataRawImport; fileName: string; replace?: BrandDataRawImport } | null>(null);
  const [saving, setSaving] = useState(false);
  const start = `${month}-01`, end = monthEnd(month);
  const key = `${brandId}|${month}|${version}`;

  useEffect(() => {
    let alive = true;
    fetchDataRawImports(brandId, TYPE)
      .then((l) => alive && setImports(l))
      .catch((e) => alive && setError(errorMessage(e, "Không tải được danh sách file Ads Shopee")));
    return () => {
      alive = false;
    };
  }, [brandId, version]);
  useEffect(() => {
    let alive = true;
    fetchOverlappingBatchRows(brandId, TYPE, start, end)
      .then((r) => alive && setLoaded({ key, stats: r.hasAnyBatch ? shopeeAdsStats(r.rows) : null }))
      .catch((e) => {
        if (!alive) return;
        setError(errorMessage(e, "Không đọc được file Ads Shopee"));
        setLoaded({ key, stats: null });
      });
    return () => {
      alive = false;
    };
  }, [brandId, start, end, key]);

  const loading = loaded?.key !== key;
  const stats = loading ? null : loaded!.stats;
  const importOfMonth = useMemo(() => findExistingImportForMonth(imports, start), [imports, start]);
  const previewStats = useMemo(() => (preview ? shopeeAdsStats(preview.parsed.rows, preview.parsed.summary) : null), [preview]);

  const onFile = async (file: File) => {
    setError(null);
    setPreview(null);
    try {
      const parsed = await parseDataRawExcel(file, TYPE);
      setPreview({ parsed, fileName: file.name, replace: findExistingImportForMonth(imports, parsed.periodStart) });
    } catch (e) {
      setError(errorMessage(e, "Không đọc được file."));
    }
  };
  const onSave = async () => {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      await createOrReplaceDataRawImport(brandId, TYPE, preview.fileName, preview.parsed, preview.replace?.id);
      const fileMonth = preview.parsed.periodStart?.slice(0, 7);
      setPreview(null);
      if (fileMonth && fileMonth !== month) onMonthChange(fileMonth);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e, "Không lưu được file Ads Shopee."));
    } finally {
      setSaving(false);
    }
  };
  const onDelete = async () => {
    if (!importOfMonth) return;
    if (!(await confirm(`Xoá file Ads Shopee tháng ${fmtMonth(month)}? Report Shopee sẽ không còn phần Ads của tháng này cho tới khi tải lại.`, { danger: true }))) return;
    try {
      await deleteDataRawImport(importOfMonth.id);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e, "Không xoá được file Ads Shopee."));
    }
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--accent-text)]" /> Ads Shopee Live · tháng {fmtMonth(month)}
          </h3>
          <p className="text-[11px] text-[var(--text-faint)] mt-1">
            Nguồn: file &quot;Shopee Live Ads Report&quot; (Quảng cáo Shopee → Quảng cáo Livestream → xuất dữ liệu, chọn đúng một tháng). File là
            tổng cả tháng theo từng chiến dịch — không có số theo ngày. ROAS = GMV từ Ads ÷ chi phí, cùng cách Shopee tính.
          </p>
        </div>
        {importOfMonth && canManage && (
          <button onClick={onDelete} className="text-[11px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded-lg">
            <Trash2 className="w-3.5 h-3.5" /> Xoá file tháng này
          </button>
        )}
      </div>

      {error && <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{error}</div>}

      {canManage && !preview && (
        <label className="border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)]/40 p-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-[var(--surface-hover)]">
          <Upload className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="font-bold text-[var(--text)] text-xs">{importOfMonth ? "Tải file mới để thay file tháng này" : "Chọn file Ads Shopee (.csv)"}</span>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onFile(f);
            }}
          />
        </label>
      )}

      {preview && previewStats && (
        <div className="space-y-3 border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-elevated)]/40">
          <p className="text-xs font-semibold text-[var(--text)] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> {preview.fileName}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Tháng <b className="text-[var(--text)]">{fmtMonth(preview.parsed.periodStart!.slice(0, 7))}</b> · {previewStats.campaigns.length} chiến dịch · {METRIC.expense}{" "}
            <b className="text-[var(--text)]">{fmtVndFull(previewStats.expense)}</b> · {METRIC.gmv} <b className="text-[var(--text)]">{fmtVndFull(previewStats.gmv)}</b> · {METRIC.roas}{" "}
            {previewStats.roas != null ? `${fmtFixed(previewStats.roas, 2)}x` : "—"}
          </p>
          <p className="text-[11px] text-amber-300">
            File ghi shop <b>{previewStats.shopName ?? "—"}</b>
            {previewStats.shopId ? ` (Shop ID ${previewStats.shopId})` : ""} — kiểm lại đây đúng là shop Shopee của <b>{brandName}</b> trước khi lưu.
          </p>
          {preview.replace && (
            <p className="text-[11px] text-amber-300">
              Đã có file tháng này (tải {new Date(preview.replace.importedAt).toLocaleString("vi-VN")}) — lưu sẽ THAY file cũ, không cộng dồn.
            </p>
          )}
          {isPublished && preview.parsed.periodStart?.startsWith(month) && (
            <p className="text-[11px] text-[var(--text-muted)]">Report Shopee tháng {fmtMonth(month)} đã phát hành: brand vẫn thấy số cũ tới khi thu hồi report và bấm Cập nhật số liệu.</p>
          )}
          <div className="flex gap-2">
            <button onClick={onSave} disabled={saving} className="bg-[var(--accent)] text-white font-bold px-4 py-2 rounded-xl text-xs disabled:opacity-50">
              {saving ? "Đang lưu..." : preview.replace ? "Lưu, thay file cũ" : "Lưu file Ads Shopee"}
            </button>
            <button onClick={() => setPreview(null)} className="bg-[var(--surface-hover)] text-[var(--text-muted)] font-bold px-4 py-2 rounded-xl text-xs">
              Huỷ
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-faint)] text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đọc file Ads Shopee...
        </div>
      ) : !stats ? (
        <p className="text-xs text-[var(--text-faint)]">Chưa có file Ads Shopee tháng {fmtMonth(month)}. Brand không chạy Ads Shopee tháng này thì bỏ qua — Report Shopee chỉ không có phần Ads.</p>
      ) : (
        <>
          {importOfMonth && (
            <p className="text-[11px] text-[var(--text-faint)]">
              File: {importOfMonth.fileName ?? "—"} · tải {new Date(importOfMonth.importedAt).toLocaleString("vi-VN")}
              {importOfMonth.periodLabel ? ` · ${importOfMonth.periodLabel}` : ""}
            </p>
          )}
          <StatsGrid s={stats} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="py-2 px-2">Campaign Name</th>
                  <th className="py-2 px-2 text-right">{METRIC.budget}</th>
                  <th className="py-2 px-2 text-right">{METRIC.views}</th>
                  <th className="py-2 px-2 text-right">{METRIC.orders}</th>
                  <th className="py-2 px-2 text-right">{METRIC.conversionRate}</th>
                  <th className="py-2 px-2 text-right">{METRIC.gmv}</th>
                  <th className="py-2 px-2 text-right">{METRIC.expense}</th>
                  <th className="py-2 px-2 text-right">{METRIC.roas}</th>
                </tr>
              </thead>
              <tbody>
                {stats.campaigns.map((c) => (
                  <tr key={c.id || c.name} className="border-b border-[var(--border-muted)]">
                    <td className="py-1.5 px-2 font-semibold">{c.name}</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(c.budget)}</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(c.views)}</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(c.orders)}</td>
                    <td className="py-1.5 px-2 text-right">{fmtFixed(c.conversionPct, 2)}%</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(c.gmv)}</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(c.expense)}</td>
                    <td className="py-1.5 px-2 text-right">{c.roas != null ? `${fmtFixed(c.roas, 1)}x` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">GMV trong file Ads là số Shopee quy cho quảng cáo (trước huỷ/hoàn) — một phần của GMV live, không cộng thêm vào.</p>
        </>
      )}
    </div>
  );
}
