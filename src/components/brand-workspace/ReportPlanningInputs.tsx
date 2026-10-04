import React, { useEffect, useState } from "react";
import { CalendarClock, CalendarRange, Flame, Loader2, Save } from "lucide-react";
import { BrandMonthPlan, BrandMonthPlanSlot, BrandMonthlyReport as BrandMonthlyReportType } from "../../types";
import { CAMP_DAY_BUCKET_LABEL, type CampDayBucket } from "../../lib/campaignDays";
import { MonthlyReportManualInput, upsertMonthlyReport } from "../../lib/db/monthlyReports";
import { monthPlanRead } from "../../lib/db/monthPlans";
import { planCampAllocation } from "../../lib/report/monthlyReportInsights";
import { errorMessage } from "../../lib/errorMessage";
import { fmtDateVn, fmtFixed, fmtMonth, fmtVndShort } from "../../lib/format";

// Phần nhập liệu phụ của Report Tháng ở tab Nhập Ads & Ghi Chú: khung camp + target từng khung, CHỈ cho tháng
// KHÔNG có Kế Hoạch Tháng (audit người mới 2026-10-04, Nhóm 1 — "một thông tin, một chỗ nhập").
//
// Trước đây khối này còn: (1) khung camp tháng này dù tháng đã có Kế Hoạch Tháng (hai ô sửa cùng một khung, ô ở
// đây thắng) và (2) "Kế hoạch phân bổ target tháng sau" + "Kế hoạch affiliate tháng sau" — trùng Kế Hoạch Tháng
// (Report Tháng phần 7 và Dashboard brand đọc Kế Hoạch Tháng; kế hoạch affiliate không màn nào đọc). Nay tháng có
// kế hoạch thì khối này chỉ hiện để đọc + nút sang Kế Hoạch Tháng; tháng sau luôn chỉ sang Kế Hoạch Tháng.
// Ghi cùng dòng brand_monthly_reports với BrandAdsReport (dùng CHUNG `report` — upsert ghi đè mọi cột).

interface Props {
  brandId: string;
  month: string; // YYYY-MM
  report: BrandMonthlyReportType | null;
  onSaved: (row: BrandMonthlyReportType) => void;
  readOnly: boolean;
  onOpenMonthPlan?: () => void;
}

function nextMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Khối này chỉ mount SAU khi report tháng về (BrandAdsReport đợi `!loading`) — BrandAdsReport gọi hàm dưới CÙNG
// LÚC với lượt đọc report để hai kế hoạch tháng về song song.
export function prefetchReportPlanningInputs(brandId: string, month: string): void {
  monthPlanRead.prefetch(brandId, month);
  monthPlanRead.prefetch(brandId, nextMonthOf(month));
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
const PLAN_STATUS: Record<BrandMonthPlan["status"], string> = { draft: "nháp, chưa chốt", locked: "đã chốt" };

export const ReportPlanningInputs: React.FC<Props> = ({ brandId, month, report, onSaved, readOnly, onOpenMonthPlan }) => {
  const nextMonth = nextMonthOf(month);
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
  const [nextPlan, setNextPlan] = useState<PlanRead | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    monthPlanRead.take(brandId, month).then((r) => alive && setCurPlan(r)).catch(() => alive && setCurPlan(null));
    monthPlanRead.take(brandId, nextMonth).then((r) => alive && setNextPlan(r)).catch(() => alive && setNextPlan(null));
    return () => {
      alive = false;
    };
  }, [brandId, month, nextMonth]);

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

  const openPlanBtn = (label: string) =>
    onOpenMonthPlan && (
      <button onClick={onOpenMonthPlan} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--accent-text)] hover:border-[var(--accent)] flex items-center gap-1.5">
        <CalendarRange className="w-3.5 h-3.5" /> {label}
      </button>
    );

  const planSummary = (r: NonNullable<PlanRead>) => {
    const alloc = planCampAllocation(r.slots, r.plan.campRanges);
    const total = alloc.reduce((a, x) => a + x.target, 0);
    const hours = alloc.reduce((a, x) => a + x.hours, 0);
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-[var(--text-muted)]">
          Kế hoạch {PLAN_STATUS[r.plan.status]} · {r.slots.length} ca · {fmtFixed(hours, 1)} giờ · target {total > 0 ? fmtVndShort(total) : "chưa đặt"}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                <th className="py-1.5 px-2">Khung</th>
                <th className="py-1.5 px-2">Ngày</th>
                <th className="py-1.5 px-2 text-right">Target</th>
                <th className="py-1.5 px-2 text-right">Giờ</th>
              </tr>
            </thead>
            <tbody>
              {alloc.map((a) => {
                const range = a.key === "daily" ? null : r.plan.campRanges[a.key];
                return (
                  <tr key={a.key} className="border-b border-[var(--border-muted)]">
                    <td className="py-1.5 px-2 font-semibold text-[var(--text)]">{CAMP_DAY_BUCKET_LABEL[a.key]}</td>
                    <td className="py-1.5 px-2 text-[var(--text-muted)]">
                      {a.key === "daily" ? "ngày còn lại" : range ? `${fmtDateVn(range.start, false)} – ${fmtDateVn(range.end, false)}` : "lịch cố định"}
                    </td>
                    <td className="py-1.5 px-2 text-right font-bold text-[var(--text)]">{a.target > 0 ? fmtVndShort(a.target) : "—"}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{fmtFixed(a.hours, 1)}h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {error && <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{error}</div>}
      {savedAt && <p className="text-[11px] text-emerald-400 font-semibold">Đã lưu lúc {savedAt}</p>}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
            <Flame className="w-4 h-4 text-[var(--accent-text)]" /> Khung camp và target tháng {fmtMonth(month)}
          </h3>
          {curPlan && openPlanBtn("Sửa ở Kế Hoạch Tháng")}
        </div>
        {curPlan === undefined ? (
          <div className="flex items-center gap-2 text-[var(--text-faint)] text-xs py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
          </div>
        ) : curPlan ? (
          <>
            <p className="text-[11px] text-[var(--text-faint)]">
              Tháng này đã có Kế Hoạch Tháng nên khung camp và target lấy từ đó — sửa ở Kế Hoạch Tháng (sửa được cả khi đã chốt).
              Report Tháng, Dashboard và Lịch dùng đúng các ngày này.
            </p>
            {planSummary(curPlan)}
          </>
        ) : (
          <>
            <p className="text-[11px] text-[var(--text-faint)]">
              Tháng này không có Kế Hoạch Tháng, nên khung camp và target từng khung cho Report Tháng nhập ở đây. Để trống thì dùng lịch cố
              định (Mid-Month 13–15, Pay Day 23–25, D-Day ngày trùng tháng). Đã nhập khung nào thì khung đó chỉ tính đúng khoảng nhập.
            </p>
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
              <div className="flex justify-end">
                <button
                  onClick={saveCamp}
                  disabled={saving}
                  className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu khung camp
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[var(--accent-text)]" /> Target và lịch tháng {fmtMonth(nextMonth)}
          </h3>
          {openPlanBtn(nextPlan ? "Mở Kế Hoạch Tháng" : "Lập Kế Hoạch Tháng")}
        </div>
        <p className="text-[11px] text-[var(--text-faint)]">
          Target, số ca, khung camp tháng sau đặt ở <b>Kế Hoạch Tháng</b>. Report Tháng phần 7 "Tháng sau" và Dashboard đọc từ đó.
        </p>
        {nextPlan === undefined ? null : nextPlan ? planSummary(nextPlan) : <p className="text-xs text-amber-300">Chưa có Kế Hoạch Tháng {fmtMonth(nextMonth)}.</p>}
      </div>
    </div>
  );
};
