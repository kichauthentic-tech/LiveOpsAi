import React, { useEffect, useState } from "react";
import { Flame, Loader2, Save } from "lucide-react";
import { BrandMonthPlan, BrandMonthPlanSlot, BrandMonthlyReport as BrandMonthlyReportType } from "../../types";
import { CAMP_DAY_BUCKET_LABEL, getCampaignDayInfo, type CampDayBucket } from "../../lib/campaignDays";
import { MonthlyReportManualInput, upsertMonthlyReport } from "../../lib/db/monthlyReports";
import { monthPlanRead } from "../../lib/db/monthPlans";
import { errorMessage } from "../../lib/errorMessage";
import { fmtDateVn, fmtMonth } from "../../lib/format";

// Khung camp + target từng khung cho tháng KHÔNG có Kế Hoạch Tháng (tháng lịch sử) — ở tab Nhập Ads. Tháng có Kế
// Hoạch Tháng thì khối này không hiện (khung camp sửa ở Kế Hoạch Tháng — "một thông tin, một chỗ nhập", 04/10).
// Gọn trang 05/10: gập thành một dòng, mặc định lịch cố định (đo production: 0/4 dòng report có khung nhập tay); bỏ
// khối "Target và lịch tháng sau" (chỉ là nút sang Kế Hoạch Tháng — Report phần 7 và Việc cần làm đã nhắc).
// Ghi cùng dòng brand_monthly_reports (upsert ghi đè mọi cột ⇒ chép nguyên `report`).

interface Props {
  brandId: string;
  month: string; // YYYY-MM
  report: BrandMonthlyReportType | null;
  onSaved: (row: BrandMonthlyReportType) => void;
  readOnly: boolean;
}

// Khối này chỉ mount SAU khi report tháng về (BrandAdsReport đợi `!loading`) — BrandAdsReport gọi hàm dưới CÙNG
// LÚC với lượt đọc report để kế hoạch tháng về song song.
export function prefetchReportPlanningInputs(brandId: string, month: string): void {
  monthPlanRead.prefetch(brandId, month);
}

const CAMPS: { key: Exclude<CampDayBucket, "daily">; start: keyof BrandMonthlyReportType; end: keyof BrandMonthlyReportType; target: keyof BrandMonthlyReportType }[] = [
  { key: "dday", start: "campDdayStart", end: "campDdayEnd", target: "campDdayTargetGmv" },
  { key: "midmonth", start: "campMidmonthStart", end: "campMidmonthEnd", target: "campMidmonthTargetGmv" },
  { key: "payday", start: "campPaydayStart", end: "campPaydayEnd", target: "campPaydayTargetGmv" }
];

const inputCls = "w-full p-2 border border-[var(--border)] rounded-lg font-semibold text-xs text-[var(--text)] bg-[var(--surface-base)] disabled:opacity-60";
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: string) => (v.trim() ? Number(v) : undefined);

type PlanRead = { plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null;

/** Ngày đầu–cuối của một khung theo lịch cố định trong tháng (D-Day = ngày trùng tháng, lùi 2 ngày). */
function fixedRange(month: string, key: Exclude<CampDayBucket, "daily">): string {
  const [y, m] = month.split("-").map(Number);
  const days: string[] = [];
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    if (getCampaignDayInfo(iso)?.type === key) days.push(iso);
  }
  return days.length ? `${fmtDateVn(days[0], false)}–${fmtDateVn(days[days.length - 1], false)}` : "—";
}

export const ReportPlanningInputs: React.FC<Props> = ({ brandId, month, report, onSaved, readOnly }) => {
  // Giá trị ban đầu lấy từ dòng report lúc dựng; BrandAdsReport đặt `key` theo tháng + id dòng nên đổi tháng thì
  // component dựng lại (không phải chép lại form trong effect), lưu xong thì không xoá chữ ops đang gõ.
  const [camp, setCamp] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    for (const x of CAMPS) {
      c[`${x.key}.start`] = str(report?.[x.start]);
      c[`${x.key}.end`] = str(report?.[x.end]);
      c[`${x.key}.target`] = str(report?.[x.target]);
    }
    return c;
  });
  // undefined = đang đọc; null = tháng đó chưa có Kế Hoạch Tháng.
  const [curPlan, setCurPlan] = useState<PlanRead | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    monthPlanRead.take(brandId, month).then((r) => alive && setCurPlan(r)).catch(() => alive && setCurPlan(null));
    return () => {
      alive = false;
    };
  }, [brandId, month]);

  const saveCamp = async () => {
    setSaving(true);
    setError(null);
    try {
      const input: MonthlyReportManualInput = { ...(report ?? {}) };
      for (const c of CAMPS) {
        (input as Record<string, unknown>)[c.start] = camp[`${c.key}.start`] || undefined;
        (input as Record<string, unknown>)[c.end] = camp[`${c.key}.end`] || undefined;
        (input as Record<string, unknown>)[c.target] = num(camp[`${c.key}.target`] ?? "");
      }
      const saved = await upsertMonthlyReport(brandId, `${month}-01`, input);
      setSavedAt(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e, "Lưu thất bại"));
    } finally {
      setSaving(false);
    }
  };

  // Tháng có Kế Hoạch Tháng (hoặc đang đọc) ⇒ không có gì để nhập ở đây.
  if (curPlan !== null) return null;

  // Khung đang dùng: khoảng đã lưu (dòng report) thắng lịch cố định — cùng luật effectiveCamp.
  const saved = (c: (typeof CAMPS)[number]) => (report?.[c.start] && report?.[c.end] ? `${fmtDateVn(String(report[c.start]), false)}–${fmtDateVn(String(report[c.end]), false)}` : null);
  const anyCustom = CAMPS.some((c) => saved(c) || report?.[c.target] != null);
  const summary = CAMPS.map((c) => `${CAMP_DAY_BUCKET_LABEL[c.key].split(" (")[0]} ${saved(c) ?? fixedRange(month, c.key)}`).join(" · ");

  return (
    <details open={anyCustom} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
      <summary className="cursor-pointer text-sm font-bold text-[var(--text)] flex flex-wrap items-center gap-2">
        <Flame className="w-4 h-4 text-[var(--accent-text)]" /> Khung camp tháng {fmtMonth(month)}
        <span className="font-normal text-[11px] text-[var(--text-muted)]">
          {anyCustom ? "đã sửa" : "lịch cố định"}: {summary} — bấm để sửa nếu camp lệch
        </span>
      </summary>
      <p className="text-[11px] text-[var(--text-faint)] mt-3">
        Tháng này không có Kế Hoạch Tháng nên khung camp lấy theo lịch cố định. Chỉ sửa khi brand chạy camp lệch ngày: khung nào nhập thì
        khung đó chỉ tính đúng khoảng nhập (Report Tháng, Dashboard, Bản Tin CEO cùng dùng). Target từng khung để so trong bảng Campaign của
        Report — bỏ trống nếu brand không giao.
      </p>
      {error && <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{error}</div>}
      {CAMPS.map((c) => (
        <div key={c.key} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
          <span className="text-xs font-bold text-[var(--text)]">{CAMP_DAY_BUCKET_LABEL[c.key]}</span>
          {(["start", "end"] as const).map((f) => (
            <input
              key={f}
              id={`camp-${c.key}-${f}`}
              type="date"
              aria-label={`${CAMP_DAY_BUCKET_LABEL[c.key]} — ${f === "start" ? "từ ngày" : "đến ngày"}`}
              value={camp[`${c.key}.${f}`] ?? ""}
              onChange={(e) => setCamp((x) => ({ ...x, [`${c.key}.${f}`]: e.target.value }))}
              disabled={readOnly}
              className={inputCls}
            />
          ))}
          <input
            id={`camp-${c.key}-target`}
            type="number"
            placeholder="Target GMV"
            value={camp[`${c.key}.target`] ?? ""}
            onChange={(e) => setCamp((x) => ({ ...x, [`${c.key}.target`]: e.target.value }))}
            disabled={readOnly}
            className={inputCls}
          />
        </div>
      ))}
      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          {savedAt && <span className="text-[11px] text-emerald-400 font-semibold">Đã lưu lúc {savedAt}</span>}
          <button
            onClick={saveCamp}
            disabled={saving}
            className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu khung camp
          </button>
        </div>
      )}
    </details>
  );
};
