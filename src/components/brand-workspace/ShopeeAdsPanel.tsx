import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, Target, Trash2, Upload } from "lucide-react";
import type { BrandDataRawImport } from "../../types";
import { parseShopeeAdsAuto, preloadSpreadsheetReader, type ParsedDataRawImport } from "../../lib/dataraw/parseDataRawExcel";
import {
  SHOPEE_ADS_KINDS, SHOPEE_ADS_KIND_LABEL, hasShopeeAds, shopeeAdsStats, shopeeAdsTotals, shopeeProductAdsGroup, shopeeSearchAdsGroup,
  type ShopeeAdsKind, type ShopeeAdsSuite
} from "../../lib/dataraw/shopeeAds";
import { fetchOverlappingBatchRows } from "../../lib/dataraw/monthlyProductSlice";
import { createOrReplaceDataRawImport, deleteDataRawImport, fetchDataRawImports, findExistingImportForMonth } from "../../lib/db/brandDataRaw";
import { useConfirm } from "../../hooks/useConfirm";
import { errorMessage } from "../../lib/errorMessage";
import { fmtFixed, fmtMonth, fmtVndFull, fmtVndShort } from "../../lib/format";
import { METRIC } from "../../lib/metricGlossary";
import { StatTile } from "../common/StatTile";

// Nhập Ads — sàn Shopee. Brand chạy tới 3 loại Ads, mỗi loại một file Seller Centre cho CẢ THÁNG (một dòng / chiến dịch hoặc
// sản phẩm, không theo ngày): Livestream Ads (shopee_ads, 0142), Shop+ Ads và Product Ads (0192). Thả cả 3 file vào một ô — app
// nhận loại theo tên cột. Mỗi loại 1 file / brand / tháng; Report Shopee đọc lại qua bản chụp.

interface Props {
  brandId: string;
  brandName: string;
  month: string; // YYYY-MM
  canManage: boolean;
  /** Report Shopee của tháng đã phát hành — lưu file vẫn được, brand thấy số mới khi thu hồi + cập nhật. */
  isPublished: boolean;
  onMonthChange: (m: string) => void;
}

interface Pending {
  kind: ShopeeAdsKind;
  parsed: ParsedDataRawImport;
  fileName: string;
  replace?: BrandDataRawImport;
}

const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

const suiteOf = (rows: Partial<Record<ShopeeAdsKind, { rows: Record<string, unknown>[]; hasAnyBatch: boolean }>>): ShopeeAdsSuite => ({
  live: rows.shopee_ads?.hasAnyBatch ? shopeeAdsStats(rows.shopee_ads.rows) : null,
  shop: rows.shopee_shop_ads?.hasAnyBatch ? shopeeSearchAdsGroup(rows.shopee_shop_ads.rows) : null,
  product: rows.shopee_product_ads?.hasAnyBatch ? shopeeProductAdsGroup(rows.shopee_product_ads.rows) : null
});

/** Một dòng tóm tắt cho từng loại: số dòng, chi phí, doanh số, ROAS. */
function summaryOf(kind: ShopeeAdsKind, s: ShopeeAdsSuite): { count: string; expense: number; gmv: number } | null {
  if (kind === "shopee_ads" && s.live) return { count: `${s.live.campaigns.length} chiến dịch`, expense: s.live.expense, gmv: s.live.gmv };
  if (kind === "shopee_shop_ads" && s.shop) return { count: `${s.shop.rows.length} chiến dịch`, expense: s.shop.expense, gmv: s.shop.gmv };
  if (kind === "shopee_product_ads" && s.product) return { count: `${s.product.rows.length} sản phẩm`, expense: s.product.expense, gmv: s.product.gmv };
  return null;
}

export function ShopeeAdsPanel({ brandId, brandName, month, canManage, isPublished, onMonthChange }: Props) {
  const confirm = useConfirm();
  const [imports, setImports] = useState<Record<ShopeeAdsKind, BrandDataRawImport[]>>({ shopee_ads: [], shopee_shop_ads: [], shopee_product_ads: [] });
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; suite: ShopeeAdsSuite } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const start = `${month}-01`, end = monthEnd(month);
  const key = `${brandId}|${month}|${version}`;

  useEffect(() => { preloadSpreadsheetReader(); }, []);
  useEffect(() => {
    let alive = true;
    Promise.all(SHOPEE_ADS_KINDS.map((k) => fetchDataRawImports(brandId, k)))
      .then((ls) => alive && setImports({ shopee_ads: ls[0], shopee_shop_ads: ls[1], shopee_product_ads: ls[2] }))
      .catch((e) => alive && setError(errorMessage(e, "Không tải được danh sách file Ads Shopee")));
    return () => {
      alive = false;
    };
  }, [brandId, version]);
  useEffect(() => {
    let alive = true;
    Promise.all(SHOPEE_ADS_KINDS.map((k) => fetchOverlappingBatchRows(brandId, k, start, end)))
      .then((rs) => alive && setLoaded({ key, suite: suiteOf({ shopee_ads: rs[0], shopee_shop_ads: rs[1], shopee_product_ads: rs[2] }) }))
      .catch((e) => {
        if (!alive) return;
        setError(errorMessage(e, "Không đọc được file Ads Shopee"));
        setLoaded({ key, suite: { live: null, shop: null, product: null } });
      });
    return () => {
      alive = false;
    };
  }, [brandId, start, end, key]);

  const loading = loaded?.key !== key;
  const suite = loading ? null : loaded!.suite;
  const totals = useMemo(() => (suite && hasShopeeAds(suite) ? shopeeAdsTotals(suite) : null), [suite]);
  const importOf = (k: ShopeeAdsKind) => findExistingImportForMonth(imports[k], start);

  const onFiles = async (files: File[]) => {
    setError(null);
    setPending([]);
    const out: Pending[] = [];
    const errs: string[] = [];
    for (const file of files) {
      try {
        const { kind, parsed } = await parseShopeeAdsAuto(file);
        if (out.some((p) => p.kind === kind)) throw new Error(`Có 2 file ${SHOPEE_ADS_KIND_LABEL[kind]} — mỗi loại chỉ một file cho một tháng.`);
        out.push({ kind, parsed, fileName: file.name, replace: findExistingImportForMonth(imports[kind], parsed.periodStart) });
      } catch (e) {
        errs.push(errorMessage(e, `Không đọc được ${file.name}.`));
      }
    }
    const months = new Set(out.map((p) => p.parsed.periodStart?.slice(0, 7)));
    if (months.size > 1) errs.push("Các file thuộc nhiều tháng khác nhau — tải từng tháng một.");
    else setPending(out);
    if (errs.length) setError(errs.join(" "));
  };
  const onSave = async () => {
    if (!pending.length) return;
    setSaving(true);
    setError(null);
    try {
      for (const p of pending) await createOrReplaceDataRawImport(brandId, p.kind, p.fileName, p.parsed, p.replace?.id);
      const fileMonth = pending[0].parsed.periodStart?.slice(0, 7);
      setPending([]);
      if (fileMonth && fileMonth !== month) onMonthChange(fileMonth);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e, "Không lưu được file Ads Shopee."));
      setVersion((v) => v + 1);
    } finally {
      setSaving(false);
    }
  };
  const onDelete = async (k: ShopeeAdsKind) => {
    const imp = importOf(k);
    if (!imp) return;
    if (!(await confirm(`Xoá file ${SHOPEE_ADS_KIND_LABEL[k]} tháng ${fmtMonth(month)}? Report Shopee sẽ không còn phần này của tháng cho tới khi tải lại.`, { danger: true }))) return;
    try {
      await deleteDataRawImport(imp.id);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e, "Không xoá được file Ads Shopee."));
    }
  };

  const previewSuite = useMemo(
    () => suiteOf(Object.fromEntries(pending.map((p) => [p.kind, { rows: p.parsed.rows as Record<string, unknown>[], hasAnyBatch: true }]))),
    [pending]
  );
  const shopNames = Array.from(new Set(pending.map((p) => `${(p.parsed.summary as { shopName?: string } | undefined)?.shopName ?? "—"}${(p.parsed.summary as { shopId?: string } | undefined)?.shopId ? ` (Shop ID ${(p.parsed.summary as { shopId?: string }).shopId})` : ""}`)));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-[var(--accent-text)]" /> Ads Shopee · tháng {fmtMonth(month)}
        </h3>
        <p className="text-[11px] text-[var(--text-faint)] mt-1">
          Tới 3 file, mỗi loại Ads một file (Seller Centre → Quảng cáo Shopee → xuất dữ liệu, chọn đúng một tháng): <b>Livestream Ads</b>, <b>Shop+ Ads</b> (tìm kiếm từ khoá / ngành hàng), <b>Product Ads</b> (CPC / GMV Max).
          Thả cả 3 file vào một ô, app tự nhận loại. File là tổng cả tháng theo chiến dịch hoặc sản phẩm, không có số theo ngày.
        </p>
      </div>

      {error && <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{error}</div>}

      {canManage && pending.length === 0 && (
        <label className="border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)]/40 p-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-[var(--surface-hover)]">
          <Upload className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="font-bold text-[var(--text)] text-xs">Chọn file Ads Shopee (.csv, được chọn nhiều file)</span>
          <input
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (fs.length) void onFiles(fs);
            }}
          />
        </label>
      )}

      {pending.length > 0 && (
        <div className="space-y-3 border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-elevated)]/40">
          {pending.map((p) => {
            const sm = summaryOf(p.kind, previewSuite);
            return (
              <div key={p.kind} className="text-xs text-[var(--text-muted)]">
                <p className="font-semibold text-[var(--text)] flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> {SHOPEE_ADS_KIND_LABEL[p.kind]} · {p.fileName}
                </p>
                {sm && (
                  <p>
                    Tháng <b className="text-[var(--text)]">{fmtMonth(p.parsed.periodStart!.slice(0, 7))}</b> · {sm.count} · {METRIC.expense} <b className="text-[var(--text)]">{fmtVndFull(sm.expense)}</b> · Doanh số{" "}
                    <b className="text-[var(--text)]">{fmtVndFull(sm.gmv)}</b> · {METRIC.roas} {sm.expense > 0 ? `${fmtFixed(sm.gmv / sm.expense, 2)}x` : "—"}
                  </p>
                )}
                {p.replace && <p className="text-[11px] text-amber-300">Đã có file {SHOPEE_ADS_KIND_LABEL[p.kind]} tháng này (tải {new Date(p.replace.importedAt).toLocaleString("vi-VN")}) — lưu sẽ THAY file cũ, không cộng dồn.</p>}
              </div>
            );
          })}
          <p className="text-[11px] text-amber-300">
            File ghi shop <b>{shopNames.join("; ")}</b> — kiểm lại đây đúng là shop Shopee của <b>{brandName}</b> trước khi lưu.
          </p>
          {isPublished && pending[0].parsed.periodStart?.startsWith(month) && (
            <p className="text-[11px] text-[var(--text-muted)]">Report Shopee tháng {fmtMonth(month)} đã phát hành: brand vẫn thấy số cũ tới khi thu hồi report và bấm Cập nhật số liệu.</p>
          )}
          <div className="flex gap-2">
            <button onClick={onSave} disabled={saving} className="bg-[var(--accent)] text-white font-bold px-4 py-2 rounded-xl text-xs disabled:opacity-50">
              {saving ? "Đang lưu..." : `Lưu ${pending.length} file Ads Shopee`}
            </button>
            <button onClick={() => setPending([])} className="bg-[var(--surface-hover)] text-[var(--text-muted)] font-bold px-4 py-2 rounded-xl text-xs">
              Huỷ
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-faint)] text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đọc file Ads Shopee...
        </div>
      ) : (
        <>
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label={METRIC.expense} value={fmtVndShort(totals.expense)} />
              <StatTile label={`Doanh số từ Ads (ROAS ${totals.roas != null ? `${fmtFixed(totals.roas, 1)}x` : "—"})`} title="" value={fmtVndShort(totals.gmv)} />
              <StatTile label={`${METRIC.acos}`} value={totals.acos != null ? `${fmtFixed(totals.acos, 1)}%` : "—"} />
              <StatTile label={`${METRIC.expense} / lượt chuyển đổi (${fmtVndFull(totals.conversions)} lượt)`} title="" value={totals.costPerConversion != null ? fmtVndFull(totals.costPerConversion) : "—"} />
            </div>
          )}
          <div className="divide-y divide-[var(--border-muted)] border border-[var(--border)] rounded-xl">
            {SHOPEE_ADS_KINDS.map((k) => {
              const imp = importOf(k);
              const sm = suite ? summaryOf(k, suite) : null;
              return (
                <div key={k} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs">
                  <span className="font-bold text-[var(--text)] w-28">{SHOPEE_ADS_KIND_LABEL[k]}</span>
                  {sm && imp ? (
                    <span className="text-[var(--text-muted)] flex-1 min-w-0">
                      {sm.count} · {METRIC.expense} {fmtVndShort(sm.expense)} · Doanh số {fmtVndShort(sm.gmv)} · {METRIC.roas} {sm.expense > 0 ? `${fmtFixed(sm.gmv / sm.expense, 1)}x` : "—"}
                      <span className="text-[var(--text-faint)]"> · {imp.fileName ?? "—"}, tải {new Date(imp.importedAt).toLocaleString("vi-VN")}</span>
                    </span>
                  ) : (
                    <span className="text-[var(--text-faint)] flex-1">Chưa có file tháng {fmtMonth(month)}. Brand không chạy loại Ads này thì bỏ qua.</span>
                  )}
                  {imp && canManage && (
                    <button onClick={() => void onDelete(k)} className="text-[11px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded-lg">
                      <Trash2 className="w-3.5 h-3.5" /> Xoá
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">
            Doanh số trong file Ads là số Shopee quy cho quảng cáo, một phần của GMV shop — không cộng thêm vào GMV live. Shop+ Ads và Product Ads có thể cùng nhận công một đơn nên tổng doanh số có thể cao hơn thực tế; report luôn kèm ROAS đơn trực tiếp.
          </p>
        </>
      )}
    </div>
  );
}
