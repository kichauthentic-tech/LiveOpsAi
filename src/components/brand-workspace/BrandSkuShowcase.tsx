import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../common/PageHeader";
import { BrandSku, UserRole } from "../../types";
import { Download, Package, Plus, Search, ShoppingBasket, Trash2, Star, X } from "lucide-react";
import { periodLabel, perfIn, skuKey, skusFor80, soldState, type SoldState, type SkuHistoryRow, type SkuPeriod, type SkuPlatform } from "../../lib/sku/skuHistory";
import { type TabPrefetchCtx } from "../../lib/db/prefetch";
import { planReorder } from "../../lib/sku/basketOrder";
import { prefetchSkuHistory, useSkuHistory } from "../../lib/sku/useSkuHistory";
import { fmtNum, fmtVndShort, fmtVndFull } from "../../lib/format";
import { platformOf } from "../../lib/reportPlatform";
import { salesTerm } from "../../lib/metricGlossary";
import { errorMessage } from "../../lib/errorMessage";

interface BrandSkuShowcaseProps {
  brandId: string;
  currentRole: UserRole;
  brandSkus: BrandSku[];
  /** Sàn đang chọn ở thanh trên cùng của workspace (?san=) — bảng đi theo, vẫn đổi tại chỗ được. */
  platformScope?: SkuPlatform | null;
  onAddSku: (sku: { brandId: string; platform: SkuPlatform; name: string; skuCode: string; flashPrice: number; originalPrice: number }) => Promise<void>;
  onImportSkus: (skus: Pick<BrandSku, "brandId" | "platform" | "name" | "flashPrice">[]) => Promise<number>;
  onUpdateSku: (
    id: string,
    patch: Partial<
      Pick<BrandSku, "name" | "skuCode" | "flashPrice" | "originalPrice" | "isHero" | "pinOrder" | "clearanceRate" | "status" | "notes">
    >
  ) => Promise<void>;
  onDeleteSku: (id: string) => Promise<void>;
}

const STATUS_LABEL: Record<BrandSku["status"], string> = {
  active: "Đang lên sóng",
  inactive: "Tạm ẩn"
};

const PAGE = 50;

// File Shopee chỉ có hàng bán trong live ⇒ không có nhóm "bán ngoài live".
const HAS_OFFLIVE: Record<SkuPlatform, boolean> = { TikTok: true, Shopee: false };

// Chỉ số hiệu suất của sản phẩm trong kỳ đã chọn. Mỗi sàn đo bằng bộ chỉ số khác nhau (TikTok có lượt hiển thị SP, Shopee có thêm giỏ) —
// Record theo sàn, không rẽ nhánh theo tên sàn.
type Cur = ReturnType<typeof perfIn>;
interface Metric { label: string; hint: string; cell: (c: Cur) => string }
const pct = (n: number, d: number) => (d > 0 ? `${fmtNum((n / d) * 100, 1)}%` : "—");
const avgPrice: Metric = { label: "Giá bán TB", hint: "Doanh số ÷ số món bán trong kỳ (giá thực tế, đã gồm giảm giá)", cell: (c) => (c.items > 0 ? fmtVndShort(c.sales / c.items) : "—") };
const METRICS: Record<SkuPlatform, Metric[]> = {
  TikTok: [
    { label: "CTR", hint: "Lượt nhấp ÷ lượt hiển thị sản phẩm", cell: (c) => pct(c.clicks, c.impressions ?? 0) },
    { label: "Chuyển đổi", hint: "Đơn ÷ lượt nhấp vào sản phẩm", cell: (c) => pct(c.orders, c.clicks) },
    avgPrice,
    { label: "% từ live", hint: "GMV LIVE ÷ GMV của sản phẩm — phần doanh số đến từ live", cell: (c) => pct(c.live, c.sales) }
  ],
  Shopee: [
    { label: "Lượt nhấp", hint: "Lượt nhấp vào sản phẩm trong live", cell: (c) => (c.clicks > 0 ? c.clicks.toLocaleString("vi-VN") : "—") },
    { label: "Thêm giỏ", hint: "Thêm giỏ ÷ lượt nhấp", cell: (c) => pct(c.atc ?? 0, c.clicks) },
    { label: "Chuyển đổi", hint: "Đơn ÷ lượt nhấp vào sản phẩm", cell: (c) => pct(c.orders, c.clicks) },
    avgPrice
  ]
};

export function prefetchBrandSkuShowcase({ brandId, role }: TabPrefetchCtx): void {
  prefetchSkuHistory(brandId, role);
}

const Trend: React.FC<{ periods: SkuPeriod[]; row: SkuHistoryRow | undefined; platform: SkuPlatform }> = ({ periods, row, platform }) => {
  const vals = periods.map((p) => row?.perPeriod[p.key]?.sales ?? 0);
  const max = Math.max(...vals, 1);
  return (
    <div className="flex items-end gap-0.5 h-6" aria-label={`Xu hướng ${salesTerm(platform)} theo kỳ`}>
      {vals.map((v, i) => (
        <div
          key={periods[i].key}
          title={`${periodLabel(periods[i])}: ${fmtVndShort(v)}`}
          className={`w-2 rounded-sm ${v > 0 ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
          style={{ height: `${Math.max(v > 0 ? 12 : 4, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
};

export const BrandSkuShowcase: React.FC<BrandSkuShowcaseProps> = ({ brandId, currentRole, brandSkus, platformScope, onAddSku, onImportSkus, onUpdateSku, onDeleteSku }) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSkuCode, setNewSkuCode] = useState("");
  const [newFlashPrice, setNewFlashPrice] = useState("");
  const [newOriginalPrice, setNewOriginalPrice] = useState("");
  const [platform, setPlatform] = useState<SkuPlatform | null>(platformScope ?? null);
  useEffect(() => {
    if (platformScope) setPlatform(platformScope);
  }, [platformScope]);
  const [periodSel, setPeriodSel] = useState<string>("last"); // "last" | "all" | khoá kỳ
  const [stateFilter, setStateFilter] = useState<"all" | SoldState>("all");
  const [includeUnsold, setIncludeUnsold] = useState(true);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [importNote, setImportNote] = useState<string | null>(null);

  // Hiệu suất theo KỲ file Sản Phẩm (không chỉ tháng này), mỗi sàn một lịch sử riêng — GMV TikTok và Sales Shopee không cộng
  // chung. Chỉ ops đọc được (RLS Dữ Liệu Gốc 0052) nên phần hiệu suất CHỈ hiện với `canEdit`; không mở RLS ở đây.
  const { history, error: perfError } = useSkuHistory(brandId, canEdit);

  const brandOwn = useMemo(() => brandSkus.filter((s) => s.brandId === brandId), [brandSkus, brandId]);
  // Luôn đủ hai sàn để chọn — brand có thể bán ở cả hai, mỗi sàn một danh sách riêng.
  const platforms: SkuPlatform[] = ["TikTok", "Shopee"];
  const active: SkuPlatform = platform && platforms.includes(platform) ? platform : platformOf({ platform: platforms[0] });
  const hist = history?.[active];
  const allKeys = useMemo(() => hist?.periods.map((p) => p.key) ?? [], [hist]);
  const scopeKeys = useMemo(() => (periodSel === "all" ? allKeys : periodSel === "last" ? allKeys.slice(-1) : allKeys.filter((k) => k === periodSel)), [periodSel, allKeys]);
  const scopeLabel = periodSel === "all" ? "mọi kỳ" : hist ? periodLabel(hist.periods.find((p) => p.key === scopeKeys[0]) ?? hist.periods[hist.periods.length - 1]) : "";
  const rowByKey = useMemo(() => new Map((hist?.rows ?? []).map((r) => [r.key, r])), [hist]);
  const perfOf = (sku: BrandSku): SkuHistoryRow | undefined => rowByKey.get(skuKey(sku.name));

  const skus = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brandOwn
      .filter((s) => {
        if (s.platform !== active || (q && !s.name.toLowerCase().includes(q) && !s.skuCode.toLowerCase().includes(q))) return false;
        if (stateFilter === "all" || !hist) return true;
        return soldState(perfIn(rowByKey.get(skuKey(s.name)), scopeKeys)) === stateFilter;
      })
      .sort(
        (a, b) =>
          (a.pinOrder > 0 ? 0 : 1) - (b.pinOrder > 0 ? 0 : 1) ||
          a.pinOrder - b.pinOrder ||
          perfIn(rowByKey.get(skuKey(b.name)), scopeKeys).sales - perfIn(rowByKey.get(skuKey(a.name)), scopeKeys).sales ||
          a.name.localeCompare(b.name)
      );
  }, [brandOwn, active, query, rowByKey, scopeKeys, stateFilter, hist]);

  // Giỏ live = SKU có thứ tự ghim > 0; thêm mới vào cuối giỏ của đúng sàn đang xem.
  const nextPin = useMemo(() => Math.max(0, ...brandOwn.filter((s) => s.platform === active).map((s) => s.pinOrder)) + 1, [brandOwn, active]);
  const heroCount = useMemo(() => brandOwn.filter((s) => s.isHero && s.platform === active).length, [brandOwn, active]);

  // Sản phẩm CÓ BÁN trong các file đã tải mà chưa vào danh mục (so theo tên đã làm sạch, đúng sàn).
  const missing = useMemo(() => {
    if (!hist) return [];
    const have = new Set(brandOwn.filter((s) => s.platform === active).map((s) => skuKey(s.name)));
    return hist.rows.filter((r) => !have.has(r.key));
  }, [hist, brandOwn, active]);
  const missingSold = useMemo(() => missing.filter((r) => r.totalSales > 0), [missing]);
  const toImport = includeUnsold ? missing : missingSold;

  const handleImport = async () => {
    if (toImport.length === 0) return;
    setBusy(true);
    setImportNote(null);
    try {
      const n = await onImportSkus(toImport.map((r) => ({ brandId, platform: active, name: r.name, flashPrice: r.avgPrice })));
      setImportNote(`Đã thêm ${n.toLocaleString("vi-VN")} sản phẩm ${active} vào danh mục.`);
    } catch (e) {
      setImportNote(errorMessage(e, "Không nhập được — đã chạy migration 0196 chưa?"));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const flashPrice = Number(newFlashPrice);
    const originalPrice = Number(newOriginalPrice);
    if (!newName.trim() || !Number.isFinite(flashPrice) || flashPrice < 0) return;
    setBusy(true);
    try {
      await onAddSku({
        brandId,
        platform: active,
        name: newName.trim(),
        skuCode: newSkuCode.trim(),
        flashPrice,
        originalPrice: Number.isFinite(originalPrice) ? originalPrice : 0
      });
      setNewName("");
      setNewSkuCode("");
      setNewFlashPrice("");
      setNewOriginalPrice("");
    } finally {
      setBusy(false);
    }
  };

  // Gõ hạng mới trong giỏ ⇒ nhảy tới hạng đó, cả giỏ của sàn này đánh số lại (lib/sku/basketOrder.ts).
  const handleReorder = async (id: string, target: number) => {
    const basket = brandOwn.filter((x) => x.platform === active && x.pinOrder > 0);
    setBusy(true);
    try {
      await Promise.all(planReorder(basket, id, target).map((p) => onUpdateSku(p.id, { pinOrder: p.pinOrder })));
    } finally {
      setBusy(false);
    }
  };

  const handlePatch = async (
    id: string,
    patch: Partial<
      Pick<BrandSku, "name" | "skuCode" | "flashPrice" | "originalPrice" | "isHero" | "pinOrder" | "clearanceRate" | "status" | "notes">
    >
  ) => {
    setBusy(true);
    try {
      await onUpdateSku(id, patch);
    } finally {
      setBusy(false);
    }
  };

  const term = salesTerm(active);
  const colSpan = canEdit ? 13 : 8;
  const sel = "bg-[var(--surface-base)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Package}
        title="Sản phẩm lên live"
        description="Danh mục SKU host giới thiệu, nhập từ các file Sản Phẩm đã tải ở Dữ Liệu Gốc: hiệu suất từng sản phẩm qua các kỳ, thứ tự ghim, giá và sản phẩm chủ lực (hero). Mỗi sàn một danh sách, không cộng chung."
        actions={
          <span className="text-sm font-bold text-[var(--warning)] flex items-center gap-1">
            <Star className="w-3.5 h-3.5" /> {heroCount} sản phẩm chủ lực
          </span>
        }
      />

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-[var(--border)] flex flex-wrap items-center gap-2">
          {platforms.length > 1 && (
            <div className="flex gap-1 mr-2">
              {platforms.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPlatform(p);
                    setShown(PAGE);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${p === active ? "seg-on" : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="text"
              placeholder="Tìm tên hoặc mã SKU"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE);
              }}
              className={`w-full pl-8 p-2 text-xs ${sel}`}
            />
          </div>
          {hist && allKeys.length > 0 && (
            <select value={periodSel} onChange={(e) => setPeriodSel(e.target.value)} className={`p-2 text-xs font-bold ${sel}`} aria-label="Chọn kỳ">
              <option value="last">Kỳ gần nhất ({periodLabel(hist.periods[hist.periods.length - 1])})</option>
              {[...hist.periods].reverse().slice(1).map((p) => (
                <option key={p.key} value={p.key}>{periodLabel(p)}</option>
              ))}
              <option value="all">Tất cả {hist.periods.length} kỳ</option>
            </select>
          )}
          {hist && (
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as "all" | SoldState)} className={`p-2 text-xs font-bold ${sel}`} aria-label="Lọc theo đơn">
              <option value="all">Mọi sản phẩm</option>
              <option value="live">Có đơn từ live</option>
              {HAS_OFFLIVE[active] && <option value="offlive">Chỉ bán ngoài live</option>}
              <option value="none">Chưa có đơn nào</option>
            </select>
          )}
          {hist && (
            <span className="text-xs text-[var(--text-muted)] w-full">
              {scopeLabel}: {hist.rows.filter((r) => soldState(perfIn(r, scopeKeys)) === "live").length} SKU có đơn live
              {HAS_OFFLIVE[active] && <> · {hist.rows.filter((r) => soldState(perfIn(r, scopeKeys)) === "offlive").length} chỉ bán ngoài live</>}
              {" "}· {hist.rows.filter((r) => soldState(perfIn(r, scopeKeys)) === "none").length} chưa có đơn
              {scopeKeys.length === 1 && skusFor80(hist.rows, scopeKeys[0]) != null && <> · {skusFor80(hist.rows, scopeKeys[0])} SKU đầu bảng chiếm 80% {term}</>}
            </span>
          )}
        </div>

        {canEdit && (
          <div className="p-4 border-b border-[var(--border)] flex flex-wrap items-center gap-2">
            <input type="text" placeholder="Tên SKU" value={newName} onChange={(e) => setNewName(e.target.value)} className={`flex-1 min-w-[140px] p-2 text-xs ${sel}`} />
            <input type="text" placeholder="Mã SKU" value={newSkuCode} onChange={(e) => setNewSkuCode(e.target.value)} className={`w-28 p-2 text-xs ${sel}`} />
            <input type="number" placeholder="Giá deal" value={newFlashPrice} onChange={(e) => setNewFlashPrice(e.target.value)} className={`w-32 p-2 text-xs ${sel}`} />
            <input type="number" placeholder="Giá gốc" value={newOriginalPrice} onChange={(e) => setNewOriginalPrice(e.target.value)} className={`w-28 p-2 text-xs ${sel}`} />
            <button
              onClick={handleCreate}
              disabled={busy || !newName.trim() || !newFlashPrice}
              className="flex items-center gap-1 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm SKU {active}
            </button>
          </div>
        )}

        {canEdit && perfError && <div className="px-4 py-2.5 border-b border-[var(--border)] bg-red-950/60 text-red-300 text-xs font-semibold">{perfError}</div>}
        {canEdit && !perfError && history && Object.keys(history).length === 0 && (
          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-faint)] text-xs">
            Chưa có file Sản Phẩm nào của brand này — tải lên ở Dữ Liệu Gốc rồi quay lại đây để nhập danh mục và xem hiệu suất.
          </div>
        )}
        {canEdit && missing.length > 0 && toImport.length >= 0 && (
          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-base)] flex flex-wrap items-center gap-3 text-xs">
            <span className="text-[var(--text-muted)]">
              {missing.length.toLocaleString("vi-VN")} sản phẩm {active} trong {hist?.periods.length} kỳ file đã tải chưa vào danh mục ({missingSold.length.toLocaleString("vi-VN")} đã có đơn, {(missing.length - missingSold.length).toLocaleString("vi-VN")} chưa có đơn). Giá deal lấy theo giá bán thực tế trung bình.
            </span>
            <label className="flex items-center gap-1.5 text-[var(--text-muted)]">
              <input type="checkbox" checked={includeUnsold} onChange={(e) => setIncludeUnsold(e.target.checked)} /> Gồm cả sản phẩm chưa có đơn
            </label>
            <button
              onClick={handleImport}
              disabled={busy}
              className="flex items-center gap-1 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-lg font-bold"
            >
              <Download className="w-3.5 h-3.5" /> Nhập {toImport.length.toLocaleString("vi-VN")} sản phẩm
            </button>
          </div>
        )}
        {importNote && <div className="px-4 py-2.5 border-b border-[var(--border)] text-xs text-[var(--text-muted)]">{importNote}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                <th className="py-2.5 px-4" title="Thêm vào giỏ live; số là thứ tự ghim trong giỏ">Giỏ live</th>
                <th className="py-2.5 px-2">SKU</th>
                {canEdit && <th className="py-2.5 px-2" title={hist?.periods.map(periodLabel).join(" · ")}>{term} theo kỳ</th>}
                {canEdit && <th className="py-2.5 px-2 text-right">{term} {scopeLabel}</th>}
                {canEdit && <th className="py-2.5 px-2 text-right" title="Phần doanh số bán trong live">Từ live</th>}
                {canEdit && <th className="py-2.5 px-2 text-right">Tổng mọi kỳ</th>}
                {canEdit && METRICS[active].map((m) => <th key={m.label} className="py-2.5 px-2 text-right" title={m.hint}>{m.label}</th>)}
                {!canEdit && <th className="py-2.5 px-2 text-right">Giá deal</th>}
                {!canEdit && <th className="py-2.5 px-2 text-right">Giá gốc</th>}
                {!canEdit && <th className="py-2.5 px-2 text-right">Xả kho %</th>}
                <th className="py-2.5 px-2">Chủ lực</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                {canEdit && <th className="py-2.5 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {skus.slice(0, shown).map((s) => {
                const perf = perfOf(s);
                const cur = perfIn(perf, scopeKeys);
                return (
                  <tr key={s.id} className="border-b border-[var(--border-muted)] align-middle">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {canEdit ? (
                        s.pinOrder > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <input type="number" min={1} defaultValue={s.pinOrder} onBlur={(e) => Number(e.target.value) !== s.pinOrder && handleReorder(s.id, Number(e.target.value))} className={`w-14 ${sel} p-1.5 font-bold`} title="Thứ tự trong giỏ live" />
                            <button onClick={() => handlePatch(s.id, { pinOrder: 0 })} className="p-1 rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-elevated)]" title="Bỏ khỏi giỏ live"><X className="w-3.5 h-3.5" /></button>
                          </span>
                        ) : (
                          <button onClick={() => handlePatch(s.id, { pinOrder: nextPin })} disabled={busy} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)]" title="Thêm vào giỏ live — xem ở tab Giỏ live đề xuất">
                            <ShoppingBasket className="w-3.5 h-3.5" /> Giỏ
                          </button>
                        )
                      ) : (
                        <span className="text-[var(--text-muted)] font-mono">{s.pinOrder > 0 ? s.pinOrder : "—"}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 max-w-[320px]">
                      <div className="font-bold text-[var(--text-muted)] truncate" title={s.name}>{s.name}</div>
                      <div className="text-[var(--text-faint)] font-mono">{s.skuCode || "—"}</div>
                    </td>
                    {canEdit && (
                      <td className="py-2.5 px-2">
                        {!hist ? <span className="text-[var(--text-faint)]">…</span> : perf ? <Trend periods={hist.periods} row={perf} platform={active} /> : <span className="text-[var(--text-faint)] italic" title="Tên không khớp sản phẩm nào trong file đã tải — đổi tên trùng khớp sàn nếu muốn thấy số.">Chưa khớp</span>}
                      </td>
                    )}
                    {canEdit && (
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        {cur.sales > 0 ? <span className="text-emerald-400 font-bold">{fmtVndShort(cur.sales)} · {cur.orders.toLocaleString("vi-VN")} đơn</span> : <span className="text-[var(--text-faint)]">{perf ? "chưa có đơn" : "—"}</span>}
                      </td>
                    )}
                    {canEdit && <td className="py-2.5 px-2 text-right whitespace-nowrap text-[var(--text-muted)]">{cur.live > 0 ? fmtVndShort(cur.live) : "—"}</td>}
                    {canEdit && <td className="py-2.5 px-2 text-right font-bold text-[var(--text-muted)] whitespace-nowrap">{perf && perf.totalSales > 0 ? fmtVndShort(perf.totalSales) : "—"}</td>}
                    {canEdit && METRICS[active].map((m) => <td key={m.label} className="py-2.5 px-2 text-right text-[var(--text-muted)] whitespace-nowrap">{cur.present ? m.cell(cur) : "—"}</td>)}
                    {!canEdit && <td className="py-2.5 px-2 text-right text-[var(--success)] font-bold">{fmtVndFull(s.flashPrice)}</td>}
                    {!canEdit && <td className="py-2.5 px-2 text-right text-[var(--text-muted)] line-through">{fmtVndFull(s.originalPrice)}</td>}
                    {!canEdit && <td className="py-2.5 px-2 text-right text-[var(--text-muted)] font-bold">{s.clearanceRate}%</td>}
                    <td className="py-2.5 px-2">
                      <button
                        onClick={() => canEdit && handlePatch(s.id, { isHero: !s.isHero })}
                        disabled={!canEdit}
                        title={canEdit ? "Đặt/bỏ Hero SKU" : undefined}
                        className={`p-1.5 rounded-lg ${s.isHero ? "text-[var(--warning)]" : "text-[var(--text-faint)]"} ${canEdit ? "hover:bg-[var(--surface-elevated)]" : ""}`}
                      >
                        <Star className="w-4 h-4" fill={s.isHero ? "currentColor" : "none"} />
                      </button>
                    </td>
                    <td className="py-2.5 px-2">
                      {canEdit ? (
                        <select value={s.status} onChange={(e) => handlePatch(s.id, { status: e.target.value as BrandSku["status"] })} className={`p-1.5 font-bold ${sel}`}>
                          {(Object.keys(STATUS_LABEL) as BrandSku["status"][]).map((s2) => (
                            <option key={s2} value={s2}>{STATUS_LABEL[s2]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[var(--text-muted)] font-bold">{STATUS_LABEL[s.status]}</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="py-2.5 px-4">
                        <button onClick={() => onDeleteSku(s.id)} className="text-[var(--danger)] hover:bg-red-950/80 p-1.5 rounded-lg" title="Xoá SKU">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {skus.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="py-8 text-center text-[var(--text-faint)] italic">
                    {query ? "Không có SKU khớp tìm kiếm." : `Chưa có SKU ${active} nào lên sóng.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {skus.length > shown && (
          <div className="p-3 border-t border-[var(--border)] text-center">
            <button onClick={() => setShown((n) => n + PAGE)} className="text-xs font-bold text-[var(--accent)] hover:underline">
              Xem thêm {Math.min(PAGE, skus.length - shown)} / còn {(skus.length - shown).toLocaleString("vi-VN")} SKU
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
