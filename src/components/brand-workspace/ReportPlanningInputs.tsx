import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, Flame, Handshake, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { AffiliatePlanEntry, BrandMonthlyReport as BrandMonthlyReportType, LiveSession } from "../../types";
import { CAMP_DAY_BUCKET_ORDER, resolveCampBucketType, type CampDayBucket, type CampOverrides } from "../../lib/campaignDays";
import { fetchAffiliatePlans, replaceAffiliatePlans } from "../../lib/db/affiliatePlans";
import { MonthlyReportManualInput, upsertMonthlyReport } from "../../lib/db/monthlyReports";
import { errorMessage } from "../../lib/errorMessage";
import { fmtFixed, fmtVndShort } from "../../lib/format";

// Công cụ nhập liệu của Report Tháng (khung camp tháng này, kế hoạch phân bổ + affiliate tháng sau) — chuyển từ
// Phụ lục của Report Tháng sang tab Nhập Ads & Ghi Chú (Report Tháng chuyên sâu, 2026-09-26): report chỉ còn
// phần để đọc. Vẫn ghi cùng dòng brand_monthly_reports; dùng CHUNG `report` với BrandAdsReport (upsert ghi đè
// mọi cột — hai form tự tải riêng thì form lưu sau sẽ ghi đè số của form lưu trước).

interface Props {
  brandId: string;
  month: string; // YYYY-MM
  sessions: LiveSession[];
  report: BrandMonthlyReportType | null;
  onSaved: (row: BrandMonthlyReportType) => void;
  readOnly: boolean;
}

type EditablePlan = AffiliatePlanEntry & { _key: string };
let keySeq = 0;
const nextKey = () => `pl-${++keySeq}`;

function nextMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const BUCKET_LABEL: Record<CampDayBucket, string> = { daily: "Daily", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };
const CAMPS: { key: Exclude<CampDayBucket, "daily">; start: keyof BrandMonthlyReportType; end: keyof BrandMonthlyReportType; target: keyof BrandMonthlyReportType }[] = [
  { key: "dday", start: "campDdayStart", end: "campDdayEnd", target: "campDdayTargetGmv" },
  { key: "midmonth", start: "campMidmonthStart", end: "campMidmonthEnd", target: "campMidmonthTargetGmv" },
  { key: "payday", start: "campPaydayStart", end: "campPaydayEnd", target: "campPaydayTargetGmv" }
];
const PCT_FIELD: Record<CampDayBucket, keyof BrandMonthlyReportType> = { daily: "planPctDaily", dday: "planPctDday", midmonth: "planPctMidmonth", payday: "planPctPayday" };

const inputCls = "w-full p-2 border border-[var(--border)] rounded-lg font-semibold text-xs text-[var(--text)] bg-[var(--surface-base)] disabled:opacity-60";
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: string) => (v.trim() ? Number(v) : undefined);

export const ReportPlanningInputs: React.FC<Props> = ({ brandId, month, sessions, report, onSaved, readOnly }) => {
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
  // % gợi ý = tỷ trọng GMV thực đạt theo khung của tháng này + tháng trước (ca có số). Không có số ⇒ chia đều, ghi rõ.
  const suggested = useMemo(() => {
    const overrides: CampOverrides = {};
    for (const c of CAMPS) {
      const s = report?.[c.start] as string | undefined, e = report?.[c.end] as string | undefined;
      if (s && e) overrides[c.key] = { start: s, end: e };
    }
    const gmv: Record<CampDayBucket, number> = { daily: 0, dday: 0, midmonth: 0, payday: 0 };
    const months = new Set([month, prevMonthOf(month)]);
    for (const s of sessions) {
      if (s.brandId !== brandId || s.status !== "Completed" || !months.has(s.date.slice(0, 7))) continue;
      gmv[resolveCampBucketType(s.date, s.date.startsWith(month) ? overrides : undefined)] += s.actualGmv || 0;
    }
    const total = CAMP_DAY_BUCKET_ORDER.reduce((a, k) => a + gmv[k], 0);
    const pct = Object.fromEntries(CAMP_DAY_BUCKET_ORDER.map((k) => [k, total > 0 ? (gmv[k] / total) * 100 : 25])) as Record<CampDayBucket, number>;
    return { pct, fallback: total <= 0 };
  }, [sessions, brandId, month, report]);
  const [plan, setPlan] = useState<Record<string, string>>(() => {
    const p: Record<string, string> = { targetGmv: str(report?.planTargetGmv), targetNmv: str(report?.planTargetNmv), targetHours: str(report?.planTargetHours) };
    for (const k of CAMP_DAY_BUCKET_ORDER) p[k] = report?.[PCT_FIELD[k]] != null ? str(report[PCT_FIELD[k]]) : String(Math.round(suggested.pct[k] * 10) / 10);
    return p;
  });
  const [rows, setRows] = useState<EditablePlan[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [saving, setSaving] = useState<"camp" | "plan" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAffiliatePlans(brandId, `${nextMonth}-01`)
      .then((entries) => !cancelled && setRows(entries.map((e) => ({ ...e, _key: nextKey() }))))
      .catch((e) => !cancelled && setError(errorMessage(e, "Không tải được kế hoạch affiliate")))
      .finally(() => !cancelled && setLoadingRows(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, nextMonth]);

  const save = async (which: "camp" | "plan") => {
    setSaving(which);
    setError(null);
    try {
      const input: MonthlyReportManualInput = { ...(report ?? {}) };
      if (which === "camp") {
        for (const c of CAMPS) {
          (input as Record<string, unknown>)[c.start] = camp[`${c.key}.start`] || undefined;
          (input as Record<string, unknown>)[c.end] = camp[`${c.key}.end`] || undefined;
          (input as Record<string, unknown>)[c.target] = num(camp[`${c.key}.target`] ?? "");
        }
      } else {
        input.planTargetGmv = num(plan.targetGmv ?? "");
        input.planTargetNmv = num(plan.targetNmv ?? "");
        input.planTargetHours = num(plan.targetHours ?? "");
        for (const k of CAMP_DAY_BUCKET_ORDER) (input as Record<string, unknown>)[PCT_FIELD[k]] = num(plan[k] ?? "");
      }
      const saved = await upsertMonthlyReport(brandId, `${month}-01`, input);
      if (which === "plan") {
        const savedRows = await replaceAffiliatePlans(brandId, `${nextMonth}-01`, rows);
        setRows(savedRows.map((e) => ({ ...e, _key: nextKey() })));
      }
      setSavedAt(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
      // Báo cha SAU CÙNG: lần lưu đầu của tháng tạo dòng mới ⇒ `key` đổi ⇒ component dựng lại và đọc lại kế hoạch affiliate.
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e, "Lưu thất bại"));
    } finally {
      setSaving(null);
    }
  };

  const totalGmv = Number(plan.targetGmv) || 0;
  const totalHours = Number(plan.targetHours) || 0;
  const pctTotal = CAMP_DAY_BUCKET_ORDER.reduce((a, k) => a + (Number(plan[k]) || 0), 0);
  const updateRow = (key: string, patch: Partial<AffiliatePlanEntry>) => setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  const saveBtn = (which: "camp" | "plan", label: string) =>
    !readOnly && (
      <button
        onClick={() => save(which)}
        disabled={saving != null}
        className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
      >
        {saving === which ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {label}
      </button>
    );

  return (
    <div className="space-y-5">
      {error && <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{error}</div>}
      {savedAt && <p className="text-[11px] text-emerald-400 font-semibold">Đã lưu lúc {savedAt}</p>}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
          <Flame className="w-4 h-4 text-[var(--accent-text)]" /> Khung camp tháng {month.slice(5)} (cho Report Tháng)
        </h3>
        <p className="text-[11px] text-[var(--text-faint)]">
          Ghi đè khoảng ngày D-Day / Mid-Month / Pay Day và target từng khung. Để trống thì dùng khoảng của Kế Hoạch Tháng, rồi tới
          lịch mặc định (Mid-Month 13–15, Pay Day 23–25, D-Day ngày trùng tháng). Đã nhập khung nào thì khung đó chỉ tính đúng khoảng nhập.
        </p>
        {CAMPS.map((c) => (
          <div key={c.key} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
            <span className="text-xs font-bold text-[var(--text)]">{BUCKET_LABEL[c.key]}</span>
            {(["start", "end"] as const).map((f) => (
              <input
                key={f}
                id={`camp-${c.key}-${f}`}
                type="date"
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
        <div className="flex justify-end">{saveBtn("camp", "Lưu khung camp")}</div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[var(--accent-text)]" /> Kế hoạch phân bổ target tháng {nextMonth.slice(5)}
        </h3>
        <p className="text-[11px] text-[var(--text-faint)]">
          Kế hoạch cho tháng chưa diễn ra, nhập tay (phân bổ target xuống ca đọc % ở đây). % đã điền sẵn theo tỷ trọng GMV thực đạt{" "}
          {suggested.fallback ? "— chưa có số lịch sử nên đang chia đều 25%" : "của tháng này và tháng trước"}; sửa tự do trước khi lưu.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              ["targetGmv", "Target GMV (LIVE)"],
              ["targetNmv", "Target NMV tổng"],
              ["targetHours", "Tổng giờ live kế hoạch"]
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block">
              <span className="text-[11px] font-bold text-[var(--text-muted)] block mb-1">{label}</span>
              <input id={`plan-${k}`} type="number" value={plan[k] ?? ""} onChange={(e) => setPlan((x) => ({ ...x, [k]: e.target.value }))} disabled={readOnly} className={inputCls} />
            </label>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                <th className="py-2 px-2">Khung</th>
                <th className="py-2 px-2 text-right">Phân bổ (%)</th>
                <th className="py-2 px-2 text-right">Target GMV</th>
                <th className="py-2 px-2 text-right">Giờ live</th>
                <th className="py-2 px-2 text-right">GMV/giờ</th>
              </tr>
            </thead>
            <tbody>
              {CAMP_DAY_BUCKET_ORDER.map((k) => {
                const p = Number(plan[k]) || 0;
                const g = (totalGmv * p) / 100, h = (totalHours * p) / 100;
                return (
                  <tr key={k} className="border-b border-[var(--border-muted)]">
                    <td className="py-2 px-2 font-semibold text-[var(--text)]">{BUCKET_LABEL[k]}</td>
                    <td className="py-2 px-2 text-right">
                      <input id={`plan-pct-${k}`} type="number" value={plan[k] ?? ""} onChange={(e) => setPlan((x) => ({ ...x, [k]: e.target.value }))} disabled={readOnly} className={`${inputCls} w-20 text-right`} />
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-[var(--text)]">{fmtVndShort(g)}</td>
                    <td className="py-2 px-2 text-right text-[var(--text-muted)]">{fmtFixed(h, 1)}h</td>
                    <td className="py-2 px-2 text-right text-[var(--text-muted)]">{h > 0 ? fmtVndShort(g / h) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={`text-[11px] mt-1 text-right ${Math.abs(pctTotal - 100) > 0.5 ? "text-red-400" : "text-[var(--text-faint)]"}`}>
            Tổng phân bổ: {fmtFixed(pctTotal, 1)}%{Math.abs(pctTotal - 100) > 0.5 ? " (nên bằng 100%)" : ""}
          </p>
        </div>

        <h4 className="font-bold text-[var(--text)] text-xs flex items-center gap-2 pt-2">
          <Handshake className="w-4 h-4 text-[var(--accent-text)]" /> Kế hoạch affiliate tháng {nextMonth.slice(5)}
        </h4>
        {loadingRows ? (
          <div className="flex items-center gap-2 text-[var(--text-faint)] text-xs py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                  {["Lịch live", "Creator", "Camp", "Timeline", "Giờ live", "Target GMV", "GMV/giờ kỳ vọng", "Budget Ads", ""].map((h) => (
                    <th key={h} className="py-2 px-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._key} className="border-b border-[var(--border-muted)]">
                    {(
                      [
                        ["scheduleLabel", "6-7.8"],
                        ["creatorName", "Tên creator"],
                        ["campTag", "D-Day"],
                        ["timelineLabel", "19h - 9h"]
                      ] as [keyof AffiliatePlanEntry, string][]
                    ).map(([f, ph]) => (
                      <td key={f} className="py-1.5 px-2">
                        <input value={(r[f] as string) ?? ""} placeholder={ph} onChange={(e) => updateRow(r._key, { [f]: e.target.value })} disabled={readOnly} className={inputCls} />
                      </td>
                    ))}
                    {(["durationHours", "targetGmv"] as (keyof AffiliatePlanEntry)[]).map((f) => (
                      <td key={f} className="py-1.5 px-2">
                        <input
                          type="number"
                          value={(r[f] as number) ?? ""}
                          onChange={(e) => updateRow(r._key, { [f]: e.target.value ? Number(e.target.value) : undefined })}
                          disabled={readOnly}
                          className={`${inputCls} w-24 text-right`}
                        />
                      </td>
                    ))}
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.targetGmv && r.durationHours ? fmtVndShort(r.targetGmv / r.durationHours) : "—"}</td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        value={r.budgetAds ?? ""}
                        onChange={(e) => updateRow(r._key, { budgetAds: e.target.value ? Number(e.target.value) : undefined })}
                        disabled={readOnly}
                        className={`${inputCls} w-24 text-right`}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      {!readOnly && (
                        <button onClick={() => setRows((rs) => rs.filter((x) => x._key !== r._key))} className="text-red-400" title="Xoá dòng" aria-label="Xoá dòng">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-[var(--text-faint)] italic">
                      Chưa có kế hoạch affiliate nào cho tháng {nextMonth.slice(5)}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {!readOnly ? (
            <button
              onClick={() => setRows((rs) => [...rs, { _key: nextKey(), brandId, periodMonth: `${nextMonth}-01`, creatorName: "", campTag: "", scheduleLabel: "", timelineLabel: "" }])}
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--accent-text)]"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm dòng
            </button>
          ) : (
            <span />
          )}
          {saveBtn("plan", `Lưu kế hoạch tháng ${nextMonth.slice(5)}`)}
        </div>
      </div>
    </div>
  );
};
