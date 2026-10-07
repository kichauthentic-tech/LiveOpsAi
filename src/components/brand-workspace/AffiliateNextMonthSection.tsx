import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { AffiliateActualEntry, AffiliatePlanMonth } from "../../types";
import { fetchAffiliateActuals } from "../../lib/db/affiliateActuals";
import { fetchAffiliatePlanMonth } from "../../lib/db/affiliatePlanMonths";
import { DEFAULT_FX_RATE, entryStatus } from "../../lib/affiliate/plan";
import { fmtMonth } from "../../lib/format";
import { AffiliatePlanTable } from "./AffiliatePlanTable";

// Kế hoạch Affiliate của THÁNG SAU, hiện ở tab "Kế Hoạch Tháng Sau" (chỉ đọc) — nguồn là bảng kế hoạch ở tab Affiliate, không có chỗ
// nhập thứ hai. Brand chỉ thấy khi ops đã Chốt (RLS 0155 lọc theo tháng đã chốt nên brand chưa chốt = không có dòng nào ⇒ khối ẩn);
// ops thấy cả bản nháp, kèm nhãn để biết brand đã thấy hay chưa. Không có dòng nào thì không vẽ gì (brand không dùng Affiliate).

interface Props {
  brandId: string;
  /** "YYYY-MM" */
  month: string;
  /** Ops (không phải role brand): thấy cả bản nháp và nhãn trạng thái chốt. */
  isOps: boolean;
  /** KPI GMV cả shop của kế hoạch tháng sau (brand_month_plans.shop_target_gmv) — để hiện "chiếm bao nhiêu %". */
  shopTarget?: number;
}

export function AffiliateNextMonthSection({ brandId, month, isOps, shopTarget }: Props) {
  const [rows, setRows] = useState<(AffiliateActualEntry & { _key: string })[] | null>(null);
  const [meta, setMeta] = useState<AffiliatePlanMonth | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchAffiliateActuals(brandId, `${month}-01`),
      fetchAffiliatePlanMonth(brandId, `${month}-01`).catch(() => null) // DB chưa chạy 0155 ⇒ coi như chưa có trạng thái
    ])
      .then(([list, m]) => {
        if (!alive) return;
        setRows(list.filter((e) => entryStatus(e) !== "cancelled").map((e, i) => ({ ...e, _key: e.id ?? `n${i}` })));
        setMeta(m);
      })
      .catch(() => alive && setRows([])); // khối phụ: lỗi đọc thì ẩn, không làm hỏng tab Kế Hoạch Tháng Sau
    return () => {
      alive = false;
    };
  }, [brandId, month]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-600" /> Affiliate — kế hoạch {fmtMonth(month)}
        </h3>
        {isOps && (
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${meta?.publishedAt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {meta?.publishedAt ? "Đã chốt, brand đang thấy" : "Nháp, brand chưa thấy — chốt ở tab Affiliate"}
          </span>
        )}
      </div>
      <AffiliatePlanTable rows={rows} month={month} fxRate={meta?.fxRate ?? DEFAULT_FX_RATE} readOnly shopTarget={shopTarget} onChange={() => {}} onRemove={() => {}} />
    </div>
  );
}
