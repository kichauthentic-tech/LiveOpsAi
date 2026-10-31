import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, ShoppingBag, Trash2, Upload } from "lucide-react";
import type { BrandDataRawImport } from "../../types";
import { parseShopeeShopAuto, preloadSpreadsheetReader, type ParsedDataRawImport } from "../../lib/dataraw/parseDataRawExcel";
import {
  SHOPEE_SHOP_KINDS, SHOPEE_SHOP_KIND_HINT, SHOPEE_SHOP_KIND_LABEL, reconcileShopLive, shopeeShopData,
  type ShopeeShopKind
} from "../../lib/dataraw/shopeeShop";
import { readShopeeDays } from "../../lib/dataraw/shopeeFiles";
import { fetchOverlappingBatchRows } from "../../lib/dataraw/monthlyProductSlice";
import { createOrReplaceDataRawImport, deleteDataRawImport, fetchDataRawImports, findExistingImportForMonth } from "../../lib/db/brandDataRaw";
import { useConfirm } from "../../hooks/useConfirm";
import { errorMessage } from "../../lib/errorMessage";
import { fmtFixed, fmtMonth, fmtVndShort } from "../../lib/format";
import { MonthPicker } from "../common/MonthPicker";
import { SHOPEE_SHOP } from "../../lib/metricGlossary";
import { StatTile } from "../common/StatTile";

// Dữ liệu cả shop — sàn Shopee, cho brand dùng dịch vụ whole shop (0193). 5 file Seller Centre cho CẢ THÁNG; thả cả 5 vào một ô, app tự nhận
// loại theo tên sheet / cột. Mỗi loại 1 file / brand / tháng (tải lại thì thay). Report Shopee đọc lại qua bản chụp. Brand chỉ dùng dịch vụ
// LIVE không cần nhóm này.

interface Props {
  brandId: string;
  brandName: string;
  canManage: boolean;
}

interface Pending {
  kind: ShopeeShopKind;
  parsed: ParsedDataRawImport;
  fileName: string;
  replace?: BrandDataRawImport;
}

type Rows = Record<string, unknown>[];
type Loaded = Partial<Record<ShopeeShopKind, Rows>> & { daily?: Rows };

const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
const defaultMonth = () => {
  const d = new Date();
  if (d.getDate() <= 10) d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const pct = (a: number, b: number) => (b > 0 ? `${fmtFixed((a / b) * 100, 1)}%` : "—");

/** Một dòng tóm tắt cho từng loại file, từ các dòng đã đọc. */
function summaryOf(kind: ShopeeShopKind, rows: Rows): string | null {
  if (!rows.length) return null;
  if (kind === "shopee_shop_stats") {
    const d = shopeeShopData(rows);
    if (!d) return null;
    return `${d.days.length} ngày · ${SHOPEE_SHOP.totalSales} ${fmtVndShort(d.placed)} · ${SHOPEE_SHOP.salesConfirmed.toLowerCase()} ${fmtVndShort(d.confirmed)}${d.channels ? ` · ${SHOPEE_SHOP.sellerLive.toLowerCase()} ${pct(d.channels.live, d.channels.total)}` : ""}`;
  }
  if (kind === "shopee_voucher") {
    const t = rows.find((r) => r.t === "total");
    return t ? `${rows.filter((r) => r.t === "voucher").length} mã giảm giá · doanh số ${fmtVndShort(num(t.sales))} · ${SHOPEE_SHOP.cost.toLowerCase()} ${fmtVndShort(num(t.cost))}` : null;
  }
  if (kind === "shopee_discount") {
    const t = rows.find((r) => r.t === "type" && r.type === "Tất cả");
    return `${rows.filter((r) => r.t === "program").length} chương trình${t ? ` · doanh số ${fmtVndShort(num(t.sales))}` : ""}`;
  }
  if (kind === "shopee_composition") {
    const nw = rows.find((r) => r.t === "buyerGroup" && r.basis === "placed" && r.name === "new");
    return nw ? `người mua mới ${num(nw.buyers)} · ${fmtFixed(num(nw.share), 1)}% doanh số` : "đã lưu";
  }
  return `${rows.filter((r) => r.basis === "placed").length} sản phẩm`;
}

export function ShopeeShopPanel({ brandId, brandName, canManage }: Props) {
  const confirm = useConfirm();
  const [month, setMonth] = useState(defaultMonth);
  const [imports, setImports] = useState<Record<ShopeeShopKind, BrandDataRawImport[]>>({ shopee_shop_stats: [], shopee_voucher: [], shopee_discount: [], shopee_composition: [], shopee_shop_products: [] });
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; rows: Loaded } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const start = `${month}-01`, end = monthEnd(month);
  const key = `${brandId}|${month}|${version}`;

  useEffect(() => { preloadSpreadsheetReader(); }, []);
  useEffect(() => {
    let alive = true;
    Promise.all(SHOPEE_SHOP_KINDS.map((k) => fetchDataRawImports(brandId, k)))
      .then((ls) => alive && setImports(Object.fromEntries(SHOPEE_SHOP_KINDS.map((k, i) => [k, ls[i]])) as Record<ShopeeShopKind, BrandDataRawImport[]>))
      .catch((e) => alive && setError(errorMessage(e, "Không tải được danh sách file cả shop Shopee")));
    return () => { alive = false; };
  }, [brandId, version]);
  useEffect(() => {
    let alive = true;
    Promise.all([...SHOPEE_SHOP_KINDS, "shopee_daily" as const].map((k) => fetchOverlappingBatchRows(brandId, k, start, end)))
      .then((rs) => {
        if (!alive) return;
        const out: Loaded = {};
        SHOPEE_SHOP_KINDS.forEach((k, i) => { if (rs[i].hasAnyBatch) out[k] = rs[i].rows; });
        if (rs[SHOPEE_SHOP_KINDS.length].hasAnyBatch) out.daily = rs[SHOPEE_SHOP_KINDS.length].rows;
        setLoaded({ key, rows: out });
      })
      .catch((e) => {
        if (!alive) return;
        setError(errorMessage(e, "Không đọc được file cả shop Shopee"));
        setLoaded({ key, rows: {} });
      });
    return () => { alive = false; };
  }, [brandId, start, end, key]);

  const loading = loaded?.key !== key;
  const rows = loading ? null : loaded!.rows;
  const importOf = (k: ShopeeShopKind) => findExistingImportForMonth(imports[k], start);
  const data = useMemo(() => (rows?.shopee_shop_stats ? shopeeShopData(rows.shopee_shop_stats) : null), [rows]);
  const dailyLive = useMemo(() => (rows?.daily ? readShopeeDays(rows.daily).reduce((s, d) => s + d.salesPlaced, 0) : 0), [rows]);
  const liveWarning = useMemo(() => (data?.channels ? reconcileShopLive(data.channels.live, dailyLive) : null), [data, dailyLive]);

  const onFiles = async (files: File[]) => {
    setError(null);
    setPending([]);
    const out: Pending[] = [];
    const errs: string[] = [];
    for (const file of files) {
      try {
        const { kind, parsed } = await parseShopeeShopAuto(file);
        if (out.some((p) => p.kind === kind)) throw new Error(`Có 2 file ${SHOPEE_SHOP_KIND_LABEL[kind]} — mỗi loại chỉ một file cho một tháng.`);
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
      if (fileMonth && fileMonth !== month) setMonth(fileMonth);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e, "Không lưu được file cả shop Shopee."));
      setVersion((v) => v + 1);
    } finally {
      setSaving(false);
    }
  };
  const onDelete = async (k: ShopeeShopKind) => {
    const imp = importOf(k);
    if (!imp) return;
    if (!(await confirm(`Xoá file ${SHOPEE_SHOP_KIND_LABEL[k]} tháng ${fmtMonth(month)}? Report Shopee sẽ không còn phần này của tháng cho tới khi tải lại.`, { danger: true }))) return;
    try {
      await deleteDataRawImport(imp.id);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e, "Không xoá được file cả shop Shopee."));
    }
  };

  const missing = rows ? SHOPEE_SHOP_KINDS.filter((k) => !rows[k]) : [];
  const pendingWarnings = pending.flatMap((p) => ((p.parsed.summary as { warnings?: string[] } | undefined)?.warnings ?? []).map((w) => `${SHOPEE_SHOP_KIND_LABEL[p.kind]}: ${w}`));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[var(--accent-text)]" /> Dữ liệu cả shop Shopee · tháng {fmtMonth(month)}
          </h3>
          <p className="text-[11px] text-[var(--text-faint)] mt-1 max-w-3xl">
            Chỉ cần với brand dùng dịch vụ <b>whole shop</b>. Mỗi tháng tải 5 file từ Seller Centre (một tháng trọn, tải sau khi hết tháng, cùng một ngày): <b>Shop Stats</b>, <b>Voucher</b>, <b>Discount</b>,{" "}
            <b>Sales Composition</b>, <b>Sản phẩm cả shop</b>. Thả cả 5 file vào một ô, app tự nhận loại. Giao diện Seller Centre phải để tiếng Việt.
          </p>
        </div>
        <MonthPicker value={month} onChange={setMonth} size="sm" ariaLabel="Tháng" />
      </div>

      {error && <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{error}</div>}

      {canManage && pending.length === 0 && (
        <label className="border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)]/40 p-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-[var(--surface-hover)]">
          <Upload className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="font-bold text-[var(--text)] text-xs">Chọn file cả shop Shopee (.xlsx, được chọn nhiều file)</span>
          <input
            type="file"
            accept=".xlsx"
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
          {pending.map((p) => (
            <div key={p.kind} className="text-xs text-[var(--text-muted)]">
              <p className="font-semibold text-[var(--text)] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> {SHOPEE_SHOP_KIND_LABEL[p.kind]} · {p.fileName}
              </p>
              <p>
                Kỳ {p.parsed.periodStart} đến {p.parsed.periodEnd} · {summaryOf(p.kind, p.parsed.rows as Rows) ?? `${p.parsed.rows.length} dòng`}
              </p>
              {p.replace && <p className="text-[11px] text-amber-300">Đã có file {SHOPEE_SHOP_KIND_LABEL[p.kind]} tháng này (tải {new Date(p.replace.importedAt).toLocaleString("vi-VN")}) — lưu sẽ THAY file cũ, không cộng dồn.</p>}
            </div>
          ))}
          {pendingWarnings.map((w) => <p key={w} className="text-[11px] text-amber-300">{w}</p>)}
          <p className="text-[11px] text-amber-300">Kiểm lại đây đúng là shop Shopee của <b>{brandName}</b> trước khi lưu.</p>
          <div className="flex gap-2">
            <button onClick={onSave} disabled={saving} className="bg-[var(--accent)] text-white font-bold px-4 py-2 rounded-xl text-xs disabled:opacity-50">
              {saving ? "Đang lưu..." : `Lưu ${pending.length} file cả shop`}
            </button>
            <button onClick={() => setPending([])} className="bg-[var(--surface-hover)] text-[var(--text-muted)] font-bold px-4 py-2 rounded-xl text-xs">Huỷ</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-faint)] text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đọc file cả shop Shopee...
        </div>
      ) : (
        <>
          {data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label={`${SHOPEE_SHOP.totalSales} (Đơn đã đặt)`} value={fmtVndShort(data.placed)} />
              <StatTile label={SHOPEE_SHOP.salesConfirmed} value={fmtVndShort(data.confirmed)} />
              <StatTile label={`${SHOPEE_SHOP.sellerLive} / ${SHOPEE_SHOP.totalSales.toLowerCase()}`} value={data.channels ? pct(data.channels.live, data.channels.total) : "—"} />
              <StatTile label={`Qua ${SHOPEE_SHOP.shopeeAds} (chồng lên nguồn doanh số)`} value={data.channels ? pct(data.channels.ads, data.channels.total) : "—"} />
            </div>
          )}
          {liveWarning && <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl text-amber-300 text-xs font-semibold">{liveWarning}</div>}
          <div className="divide-y divide-[var(--border-muted)] border border-[var(--border)] rounded-xl">
            {SHOPEE_SHOP_KINDS.map((k) => {
              const imp = importOf(k);
              const sm = rows?.[k] ? summaryOf(k, rows[k]!) : null;
              return (
                <div key={k} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs">
                  <span className="font-bold text-[var(--text)] w-36">{SHOPEE_SHOP_KIND_LABEL[k]}</span>
                  {imp && sm ? (
                    <span className="text-[var(--text-muted)] flex-1 min-w-0">
                      {sm}
                      <span className="text-[var(--text-faint)]"> · {imp.fileName ?? "—"}, tải {new Date(imp.importedAt).toLocaleString("vi-VN")}</span>
                    </span>
                  ) : (
                    <span className="text-[var(--text-faint)] flex-1">Chưa có file tháng {fmtMonth(month)}. {SHOPEE_SHOP_KIND_HINT[k]}</span>
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
          {missing.length > 0 && missing.length < SHOPEE_SHOP_KINDS.length && (
            <p className="text-[11px] text-amber-300">Còn thiếu {missing.map((k) => SHOPEE_SHOP_KIND_LABEL[k]).join(", ")}: các trang dùng file đó trong report sẽ ẩn cho tới khi tải đủ.</p>
          )}
          <p className="text-[11px] text-[var(--text-faint)]">
            Bốn nguồn doanh số ({SHOPEE_SHOP.productCard}, {SHOPEE_SHOP.sellerLive}, {SHOPEE_SHOP.sellerVideo}, {SHOPEE_SHOP.affiliate}) cộng đúng tổng doanh số. Doanh số qua {SHOPEE_SHOP.shopeeAds} nằm trong tổng, không cộng thêm. {SHOPEE_SHOP.sellerLive} được đối chiếu với tổng ngày của file Daily cùng tháng.
          </p>
        </>
      )}
    </div>
  );
}
