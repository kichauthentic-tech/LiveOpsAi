import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, ShoppingBasket, Star, X } from "lucide-react";
import { PageHeader } from "../common/PageHeader";
import { BrandSku, UserRole } from "../../types";
import { periodLabel, perfIn, skuKey, type SkuHistoryRow, type SkuPlatform } from "../../lib/sku/skuHistory";
import { planReorder } from "../../lib/sku/basketOrder";
import { prefetchSkuHistory, useSkuHistory } from "../../lib/sku/useSkuHistory";
import type { TabPrefetchCtx } from "../../lib/db/prefetch";
import { fmtNum, fmtVndShort } from "../../lib/format";
import { platformOf } from "../../lib/reportPlatform";
import { salesTerm } from "../../lib/metricGlossary";

interface Props {
  brandId: string;
  currentRole: UserRole;
  brandSkus: BrandSku[];
  /** Sàn đang chọn ở thanh trên cùng của workspace. */
  platformScope?: SkuPlatform | null;
  onUpdateSku: (id: string, patch: Partial<Pick<BrandSku, "pinOrder">>) => Promise<void>;
}

export function prefetchBrandLiveBasket({ brandId, role }: TabPrefetchCtx): void {
  prefetchSkuHistory(brandId, role);
}

const SUGGEST_LIMIT = 10;
const pct = (n: number, d: number) => (d > 0 ? `${fmtNum((n / d) * 100, 1)}%` : "—");

// Giỏ live = SKU của brand × sàn có thứ tự ghim > 0 (cột brand_skus.pin_order, 0 = chưa vào giỏ) — cùng nguồn với tab "Sản phẩm lên
// live", không có bảng riêng. Đề xuất chỉ dựa trên hiệu suất LIVE kỳ file gần nhất của đúng sàn: không cộng chéo TikTok/Shopee.
export const BrandLiveBasket: React.FC<Props> = ({ brandId, currentRole, brandSkus, platformScope, onUpdateSku }) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const platform = platformOf({ platform: platformScope });
  const term = salesTerm(platform);
  const { history, error } = useSkuHistory(brandId, canEdit);
  const hist = history?.[platform];
  const [busy, setBusy] = useState(false);

  const last = hist?.periods[hist.periods.length - 1];
  const prev = hist && hist.periods.length > 1 ? hist.periods[hist.periods.length - 2] : undefined;
  const rowByKey = useMemo(() => new Map((hist?.rows ?? []).map((r) => [r.key, r])), [hist]);
  const lastKeys = useMemo(() => (last ? [last.key] : []), [last]);
  const perfOf = (s: BrandSku, keys: string[]) => perfIn(rowByKey.get(skuKey(s.name)), keys);

  const own = useMemo(() => brandSkus.filter((s) => s.brandId === brandId && s.platform === platform), [brandSkus, brandId, platform]);
  const basket = useMemo(() => own.filter((s) => s.pinOrder > 0).sort((a, b) => a.pinOrder - b.pinOrder || a.name.localeCompare(b.name)), [own]);

  // Độ phủ: phần doanh số live của kỳ gần nhất mà giỏ hiện tại đã gồm.
  const liveTotal = useMemo(() => (hist && last ? hist.rows.reduce((a, r) => a + (r.perPeriod[last.key]?.live ?? 0), 0) : 0), [hist, last]);
  const basketLive = basket.reduce((a, s) => a + perfOf(s, lastKeys).live, 0);

  // Đề xuất thêm: SKU đang bán, chưa ở trong giỏ, đã có đơn live kỳ gần nhất — xếp theo doanh số live; lý do là các luật đo được.
  const suggestions = useMemo(() => {
    if (!hist || !last) return [];
    const cvrOf = (r: SkuHistoryRow) => {
      const p = r.perPeriod[last.key];
      return p && p.clicks > 0 ? p.orders / p.clicks : null;
    };
    const cvrs = hist.rows.filter((r) => (r.perPeriod[last.key]?.live ?? 0) > 0).map(cvrOf).filter((v): v is number => v != null).sort((a, b) => a - b);
    const medianCvr = cvrs.length ? cvrs[Math.floor(cvrs.length / 2)] : 0;
    const ranked = hist.rows.filter((r) => (r.perPeriod[last.key]?.live ?? 0) > 0).sort((a, b) => (b.perPeriod[last.key]?.live ?? 0) - (a.perPeriod[last.key]?.live ?? 0));
    const rankOf = new Map(ranked.map((r, i) => [r.key, i + 1]));
    return own
      .filter((s) => s.pinOrder <= 0 && s.status === "active" && rankOf.has(skuKey(s.name)))
      .map((s) => {
        const row = rowByKey.get(skuKey(s.name))!;
        const reasons: string[] = [];
        const rank = rankOf.get(row.key)!;
        if (rank <= SUGGEST_LIMIT * 2) reasons.push(`Top ${rank} ${term} live`);
        const c = cvrOf(row);
        if (c != null && medianCvr > 0 && c > medianCvr * 1.2) reasons.push(`Chuyển đổi ${pct(c, 1)} (TB ${pct(medianCvr, 1)})`);
        const before = prev ? row.perPeriod[prev.key]?.live ?? 0 : 0;
        const now = row.perPeriod[last.key]?.live ?? 0;
        if (before > 0 && now >= before * 1.2) reasons.push(`Tăng ${pct(now - before, before)} so với ${periodLabel(prev!)}`);
        return { sku: s, rank, reasons };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, SUGGEST_LIMIT);
  }, [hist, last, prev, own, rowByKey, term]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const add = (s: BrandSku) => run(() => onUpdateSku(s.id, { pinOrder: Math.max(0, ...basket.map((b) => b.pinOrder)) + 1 }));
  const remove = (s: BrandSku) => run(() => onUpdateSku(s.id, { pinOrder: 0 }));
  // Gõ số thứ tự mới ⇒ sản phẩm nhảy tới đúng hạng đó, cả giỏ đánh số lại 1..n (lib/sku/basketOrder.ts).
  const reorder = (s: BrandSku, target: number) =>
    run(async () => {
      await Promise.all(planReorder(basket, s.id, target).map((p) => onUpdateSku(p.id, { pinOrder: p.pinOrder })));
    });
  const move = (i: number, dir: -1 | 1) => reorder(basket[i], i + 1 + dir);

  const card = "bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl";
  const lastLabel = last ? periodLabel(last) : "";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShoppingBasket}
        title="Giỏ live đề xuất"
        description={`Giỏ sản phẩm ${platform} host ghim khi lên live — thứ tự trong giỏ là thứ tự ghim. Đề xuất thêm dựa trên hiệu suất live kỳ gần nhất của sàn này.`}
        actions={<span className="text-sm font-bold text-[var(--text-muted)]">{basket.length} sản phẩm trong giỏ</span>}
      />

      {error && <div className="px-4 py-2.5 rounded-xl bg-red-950/60 text-red-300 text-xs font-semibold">{error}</div>}
      {own.length === 0 && (
        <div className="px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-faint)]">
          Chưa có sản phẩm {platform} nào trong danh mục — vào tab "Sản phẩm lên live" bấm nhập từ file Sản Phẩm đã tải, rồi quay lại đây.
        </div>
      )}

      <div className={card}>
        <div className="p-4 border-b border-[var(--border)] flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-bold text-[var(--text)] text-sm">Giỏ hiện tại</span>
          {canEdit && last && liveTotal > 0 && basket.length > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              Giỏ phủ {pct(basketLive, liveTotal)} {term} live {lastLabel} ({fmtVndShort(basketLive)} / {fmtVndShort(liveTotal)})
            </span>
          )}
        </div>
        <ul>
          {basket.map((s, i) => {
            const cur = perfOf(s, lastKeys);
            const known = canEdit && !!rowByKey.get(skuKey(s.name));
            return (
              <li key={s.id} className="px-4 py-2.5 border-b border-[var(--border-muted)] last:border-b-0 flex items-center gap-3 text-xs">
                {canEdit ? (
                  <input
                    key={`${s.id}-${i}`}
                    type="number"
                    min={1}
                    max={basket.length}
                    defaultValue={i + 1}
                    disabled={busy}
                    title="Gõ số thứ tự mới rồi Enter — sản phẩm nhảy tới hạng đó"
                    onBlur={(e) => Number(e.target.value) !== i + 1 && reorder(s, Number(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    className="w-12 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-mono font-bold text-center"
                  />
                ) : (
                  <span className="w-6 text-center font-mono font-bold text-[var(--text-muted)]">{i + 1}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[var(--text-muted)] truncate flex items-center gap-1" title={s.name}>
                    {s.isHero && <Star className="w-3 h-3 text-[var(--warning)] shrink-0" fill="currentColor" />}
                    {s.name}
                  </div>
                  {known && (
                    <div className="text-[var(--text-faint)]">
                      {cur.live > 0 ? (
                        <>
                          {lastLabel}: {fmtVndShort(cur.live)} live · {cur.orders.toLocaleString("vi-VN")} đơn · chuyển đổi {pct(cur.orders, cur.clicks)}
                        </>
                      ) : (
                        <span className="text-[var(--warning)]">Chưa có đơn live {lastLabel} — cân nhắc thay bằng sản phẩm khác</span>
                      )}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-0.5">
                    <button disabled={busy || i === 0} onClick={() => move(i, -1)} className="p-1.5 rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-elevated)] disabled:opacity-30" title="Đẩy lên"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button disabled={busy || i === basket.length - 1} onClick={() => move(i, 1)} className="p-1.5 rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-elevated)] disabled:opacity-30" title="Đẩy xuống"><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button disabled={busy} onClick={() => remove(s)} className="p-1.5 rounded-lg text-[var(--danger)] hover:bg-red-950/80" title="Bỏ khỏi giỏ"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </li>
            );
          })}
          {basket.length === 0 && <li className="px-4 py-8 text-center text-xs italic text-[var(--text-faint)]">Giỏ trống — thêm từ danh sách đề xuất bên dưới hoặc từ tab "Sản phẩm lên live".</li>}
        </ul>
      </div>

      {canEdit && (
        <div className={card}>
          <div className="p-4 border-b border-[var(--border)] flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-bold text-[var(--text)] text-sm">Đề xuất thêm vào giỏ</span>
            <span className="text-xs text-[var(--text-faint)]">
              {last ? `Sản phẩm đã có đơn live ${lastLabel}, chưa trong giỏ, xếp theo ${term} live` : "Chưa có file Sản Phẩm của sàn này ở Dữ Liệu Gốc"}
            </span>
          </div>
          <ul>
            {suggestions.map(({ sku, rank, reasons }) => {
              const cur = perfOf(sku, lastKeys);
              return (
                <li key={sku.id} className="px-4 py-2.5 border-b border-[var(--border-muted)] last:border-b-0 flex items-center gap-3 text-xs">
                  <span className="w-6 text-center font-mono text-[var(--text-faint)]">#{rank}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[var(--text-muted)] truncate" title={sku.name}>{sku.name}</div>
                    <div className="text-[var(--text-faint)]">
                      {fmtVndShort(cur.live)} live · {cur.orders.toLocaleString("vi-VN")} đơn
                      {reasons.length > 0 && <> · {reasons.join(" · ")}</>}
                    </div>
                  </div>
                  <button disabled={busy} onClick={() => add(sku)} className="flex items-center gap-1 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-lg font-bold">
                    <Plus className="w-3.5 h-3.5" /> Thêm vào giỏ
                  </button>
                </li>
              );
            })}
            {suggestions.length === 0 && <li className="px-4 py-6 text-center text-xs italic text-[var(--text-faint)]">Không còn sản phẩm nào đủ điều kiện đề xuất.</li>}
          </ul>
        </div>
      )}
    </div>
  );
};
