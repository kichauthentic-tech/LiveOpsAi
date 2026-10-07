import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AffiliateActualEntry, AffiliateEntryStatus } from "../../types";
import { CampOverrides } from "../../lib/campaignDays";
import {
  AffiliateRow,
  CAMP_NAMES,
  dayLabelOf,
  entryStatus,
  parseDayLabel,
  planBudget,
  planGmvPerHour,
  planHours,
  planTotals,
  sortPlanRows,
  suggestCampName,
  toUsd
} from "../../lib/affiliate/plan";
import { fmtFixed, fmtVndFull, fmtVndShort } from "../../lib/format";

// Bảng KẾ HOẠCH Affiliate (migration 0155): mỗi phiên là một DÒNG, đúng bố cục sheet kế hoạch ops vẫn lập —
// Lịch live · Creator · Camp · Timeline · Duration · Target GMV · GMV/hour · Đơn vị $ · Budget Ads · Note — thêm Quy mô
// (Big/Medium), trạng thái, và 2 cột thực tế (Direct GMV, % Target) hiện khi phiên đã live. Cột tự tính (Duration từ
// Timeline, GMV/hour, $, Budget Ads) hiện số xám; gõ đè vào ô thì số gõ thắng.
//
// Component ở cấp module (không khai báo trong thân BrandAffiliateTable): xem "Component con KHÔNG khai báo trong
// thân component cha" ở WORKSPACE_HISTORY — remount mỗi lần render làm ô nhập mất focus.

// Quy mô camp do ops đặt (không file TikTok nào có). Màu bám theo file Excel gốc của ops.
export const CAMPAIGN_TYPES = ["Big", "Medium", "Brand Day", "Clearance"] as const;
export const CAMPAIGN_STYLE: Record<string, string> = {
  Big: "bg-red-700 text-white",
  Medium: "bg-sky-100 text-sky-800",
  "Brand Day": "bg-amber-500 text-white",
  Clearance: "bg-slate-500 text-white"
};
const CAMP_STYLE: Record<string, string> = {
  "D-Day": "bg-red-100 text-red-800",
  "Mid-Month": "bg-sky-100 text-sky-800",
  "Pay Day": "bg-amber-100 text-amber-800",
  Daily: "bg-[var(--surface-elevated)] text-[var(--text-faint)]"
};
export const STATUS_LABEL: Record<AffiliateEntryStatus, string> = { planned: "Kế hoạch", done: "Đã live", cancelled: "Huỷ / dời" };
const STATUS_STYLE: Record<AffiliateEntryStatus, string> = {
  planned: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-600"
};

// Căn lề đặt ở đây chứ không chồng thêm `text-left` lên lớp `text-right`: hai lớp Tailwind cùng nhóm thì lớp nào
// khai báo sau trong CSS thắng, không phải lớp viết sau trong className.
const cellBase = "px-2 py-1.5 border-b border-[var(--border)] whitespace-nowrap";
const cellR = `${cellBase} text-right`;
const cellL = `${cellBase} text-left`;
const headBase = "px-2 py-2 border-b border-[var(--border)] font-semibold text-[var(--text-faint)] whitespace-nowrap bg-[var(--surface-elevated)]";
const headR = `${headBase} text-right`;
const headL = `${headBase} text-left`;
const inputCls = "w-full min-h-6 bg-transparent outline-none focus:bg-[var(--surface-hover)] rounded px-1";
const autoCls = "text-[var(--text-faint)]";

function parseNumInput(raw: string): number | undefined {
  // Chấp nhận "700.000.000" (dán từ Excel) lẫn "7,5": bỏ dấu chấm/khoảng trắng/% rồi coi dấu phẩy là thập phân.
  const v = raw.replace(/[.\s%]/g, "").replace(",", ".");
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

interface NumCellProps {
  value?: number;
  /** Số tự tính hiện xám khi ô trống — ops gõ đè thì số gõ thắng. */
  placeholder?: string;
  ariaLabel: string;
  readOnly: boolean;
  onCommit: (n: number | undefined) => void;
}

// Ô số: khi KHÔNG focus hiện số đã format ("700.000.000"); lúc focus đổi về số thô để gõ/sửa không phải né dấu phân cách.
function NumCell({ value, placeholder, ariaLabel, readOnly, onCommit }: NumCellProps) {
  const [focused, setFocused] = useState(false);
  if (readOnly) return <span className={value == null ? autoCls : ""}>{value != null ? fmtVndFull(value) : placeholder ?? "—"}</span>;
  return (
    <input
      className={`${inputCls} text-right`}
      aria-label={ariaLabel}
      inputMode="decimal"
      value={focused ? value ?? "" : value == null ? "" : fmtVndFull(value)}
      placeholder={placeholder ?? ""}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(ev) => onCommit(parseNumInput(ev.target.value))}
    />
  );
}

interface AffiliatePlanTableProps {
  /** Các dòng của THÁNG đang lập (đã lọc tháng; chưa sắp). */
  rows: AffiliateRow[];
  /** "YYYY-MM" — giới hạn ô chọn ngày trong tháng. */
  month: string;
  fxRate: number;
  readOnly: boolean;
  campOverrides?: CampOverrides;
  /** KPI GMV CẢ SHOP của Kế Hoạch Tháng (0122); 0/undefined = chưa giao. */
  shopTarget?: number;
  onChange: (row: AffiliateRow, patch: Partial<AffiliateActualEntry>) => void;
  onRemove: (row: AffiliateRow) => void;
}

export function AffiliatePlanTable({ rows, month, fxRate, readOnly, campOverrides, shopTarget, onChange, onRemove }: AffiliatePlanTableProps) {
  const sorted = sortPlanRows(rows);
  const totals = planTotals(sorted);
  // Hai cột thực tế chỉ hiện khi đã có phiên đã live — kế hoạch mới lập thì ẩn cho bảng bớt rộng.
  const showActuals = sorted.some((r) => entryStatus(r) === "done");
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const label = (r: AffiliateRow, what: string) => `${what} — ${r.creatorName || "phiên mới"} ${r.liveDateLabel ?? ""}`.trim();

  const onDate = (r: AffiliateRow, iso: string) => {
    if (!iso) return;
    const old = parseDayLabel(r.liveDateLabel);
    const patch: Partial<AffiliateActualEntry> = { liveDateLabel: dayLabelOf(iso), periodMonth: `${iso.slice(0, 7)}-01` };
    // Camp theo ngày chỉ là GỢI Ý: chỉ đổi theo khi ops chưa chọn tay (trống hoặc đang đúng gợi ý của ngày cũ).
    if (!r.campName || (old && r.campName === suggestCampName(old, campOverrides))) patch.campName = suggestCampName(iso, campOverrides);
    onChange(r, patch);
  };

  const kpi = (title: string, value: string, hint?: string) => (
    <div className="rounded-lg bg-[var(--surface-elevated)] px-3 py-2">
      <div className="text-xs text-[var(--text-faint)]">{title}</div>
      <div className="text-lg font-bold text-[var(--text)]">{value}</div>
      {hint && <div className="text-xs text-[var(--text-faint)]">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {kpi("Phiên kế hoạch", String(totals.sessions))}
        {kpi("Tổng target", fmtVndShort(totals.target), totals.hours > 0 ? `${fmtFixed(totals.hours, 1)} giờ live` : undefined)}
        {kpi("GMV/giờ kế hoạch", totals.hours > 0 ? fmtVndShort(totals.target / totals.hours) : "—")}
        {kpi(
          "Chiếm KPI cả shop",
          shopTarget && shopTarget > 0 ? `${fmtFixed((totals.target / shopTarget) * 100, 1)}%` : "—",
          shopTarget && shopTarget > 0 ? `KPI ${fmtVndShort(shopTarget)} (Kế Hoạch Tháng)` : "Chưa nhập KPI cả shop ở Kế Hoạch Tháng"
        )}
      </div>

      <div className="overflow-auto border border-[var(--border)] rounded-xl bg-[var(--surface-base)]">
        <table className="text-sm border-collapse w-full min-w-[980px]">
          <thead>
            <tr>
              <th className={headL}>Ngày</th>
              <th className={headL}>Creator</th>
              <th className={headL}>Camp</th>
              <th className={headL} title="Quy mô camp (Big/Medium…), khác với tên camp D-Day / Mid-Month / Pay Day">Quy mô</th>
              <th className={headR}>Timeline</th>
              <th className={headR} title="Tự tính từ Timeline; gõ số vào để đè">Duration</th>
              <th className={headR}>Target GMV</th>
              <th className={headR} title="Target ÷ Duration">GMV/hour</th>
              <th className={headR} title={`Target ÷ tỷ giá ${fmtVndFull(fxRate)}`}>Đơn vị $</th>
              <th className={headR} title="Mặc định 3% target (D-Day 3,5%); gõ số vào để đè">Budget Ads</th>
              <th className={headL}>Note</th>
              <th className={headL}>Trạng thái</th>
              {showActuals && <th className={headR}>Direct GMV</th>}
              {showActuals && <th className={headR}>% Target</th>}
              {!readOnly && <th className={headR} />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const st = entryStatus(r);
              const iso = parseDayLabel(r.liveDateLabel) ?? "";
              const hours = planHours(r);
              const gph = planGmvPerHour(r);
              const usd = toUsd(r.targetGmv, fxRate);
              const budget = planBudget(r);
              const hit = st === "done" && r.directGmv != null && r.targetGmv ? (r.directGmv / r.targetGmv) * 100 : undefined;
              return (
                <tr key={r._key} className={st === "cancelled" ? "opacity-60" : ""}>
                  <td className={cellL}>
                    {readOnly ? (
                      <span className="font-mono">{r.liveDateLabel ?? "—"}</span>
                    ) : (
                      <input
                        type="date"
                        className={`${inputCls} font-mono`}
                        aria-label={label(r, "Ngày live")}
                        value={iso}
                        min={`${month}-01`}
                        max={`${month}-${String(lastDay).padStart(2, "0")}`}
                        onChange={(ev) => onDate(r, ev.target.value)}
                      />
                    )}
                  </td>
                  <td className={`${cellL} font-semibold`}>
                    {readOnly ? (
                      r.creatorName
                    ) : (
                      <input className={`${inputCls} min-w-28`} aria-label={label(r, "Creator")} value={r.creatorName} onChange={(ev) => onChange(r, { creatorName: ev.target.value })} />
                    )}
                  </td>
                  <td className={cellL}>
                    {readOnly ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CAMP_STYLE[r.campName ?? ""] ?? ""}`}>{r.campName || "—"}</span>
                    ) : (
                      <select
                        aria-label={label(r, "Camp")}
                        value={r.campName ?? ""}
                        onChange={(ev) => onChange(r, { campName: ev.target.value || undefined })}
                        className={`min-h-6 rounded px-1.5 py-0.5 text-xs font-semibold outline-none ${CAMP_STYLE[r.campName ?? ""] ?? "bg-[var(--surface-elevated)]"}`}
                      >
                        <option value="">—</option>
                        {CAMP_NAMES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className={cellL}>
                    {readOnly ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CAMPAIGN_STYLE[r.campaignType ?? ""] ?? ""}`}>{r.campaignType || "—"}</span>
                    ) : (
                      <select
                        aria-label={label(r, "Quy mô")}
                        value={r.campaignType ?? ""}
                        onChange={(ev) => onChange(r, { campaignType: ev.target.value || undefined })}
                        className={`min-h-6 rounded px-1.5 py-0.5 text-xs font-semibold outline-none ${CAMPAIGN_STYLE[r.campaignType ?? ""] ?? "bg-[var(--surface-elevated)]"}`}
                      >
                        <option value="">—</option>
                        {CAMPAIGN_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className={cellR}>
                    {readOnly ? (
                      r.planTimelineLabel || "—"
                    ) : (
                      <input
                        className={`${inputCls} min-w-24 text-right`}
                        aria-label={label(r, "Timeline")}
                        placeholder="19h - 23h"
                        value={r.planTimelineLabel ?? ""}
                        onChange={(ev) => onChange(r, { planTimelineLabel: ev.target.value || undefined })}
                      />
                    )}
                  </td>
                  <td className={cellR}>
                    <NumCell
                      value={r.planDurationHours}
                      placeholder={hours != null ? fmtFixed(hours, hours % 1 ? 1 : 0) : undefined}
                      ariaLabel={label(r, "Duration")}
                      readOnly={readOnly}
                      onCommit={(n) => onChange(r, { planDurationHours: n })}
                    />
                  </td>
                  <td className={`${cellR} font-semibold`}>
                    <NumCell value={r.targetGmv} ariaLabel={label(r, "Target GMV")} readOnly={readOnly} onCommit={(n) => onChange(r, { targetGmv: n })} />
                  </td>
                  <td className={`${cellR} ${autoCls}`}>{gph != null ? fmtVndFull(gph) : "—"}</td>
                  <td className={`${cellR} ${autoCls}`}>{usd != null ? `$${fmtVndFull(usd)}` : "—"}</td>
                  <td className={cellR}>
                    <NumCell
                      value={r.planBudgetAds}
                      placeholder={budget != null ? fmtVndFull(budget) : undefined}
                      ariaLabel={label(r, "Budget Ads")}
                      readOnly={readOnly}
                      onCommit={(n) => onChange(r, { planBudgetAds: n })}
                    />
                  </td>
                  <td className={cellL}>
                    {readOnly ? (
                      r.note || ""
                    ) : (
                      <input className={`${inputCls} min-w-28`} aria-label={label(r, "Ghi chú")} value={r.note ?? ""} onChange={(ev) => onChange(r, { note: ev.target.value || undefined })} />
                    )}
                  </td>
                  <td className={cellL}>
                    {readOnly ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                    ) : (
                      <select
                        aria-label={label(r, "Trạng thái")}
                        value={st}
                        onChange={(ev) => onChange(r, { status: ev.target.value as AffiliateEntryStatus })}
                        className={`min-h-6 rounded px-1.5 py-0.5 text-xs font-semibold outline-none ${STATUS_STYLE[st]}`}
                      >
                        {(Object.keys(STATUS_LABEL) as AffiliateEntryStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  {showActuals && <td className={`${cellR} ${st === "done" ? "text-red-600 font-semibold" : autoCls}`}>{st === "done" && r.directGmv != null ? fmtVndFull(r.directGmv) : "—"}</td>}
                  {showActuals && <td className={cellR}>
                    {hit != null ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${hit >= 100 ? "bg-emerald-600 text-white" : hit >= 70 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {fmtFixed(hit, 1)}%
                      </span>
                    ) : (
                      <span className={autoCls}>—</span>
                    )}
                  </td>}
                  {!readOnly && (
                    <td className={cellR}>
                      <button
                        onClick={() => onRemove(r)}
                        title="Xoá phiên"
                        aria-label={label(r, "Xoá phiên")}
                        className="inline-flex items-center justify-center p-1.5 rounded text-red-500 hover:text-red-700 hover:bg-red-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {sorted.length > 0 && (
              <tr className="bg-[var(--surface-elevated)] font-semibold">
                <td className={cellL} colSpan={5}>Total</td>
                <td className={cellR}>{totals.hours > 0 ? fmtFixed(totals.hours, 1) : "—"}</td>
                <td className={cellR}>{fmtVndFull(totals.target)}</td>
                <td className={cellR}>{totals.hours > 0 ? fmtVndFull(totals.target / totals.hours) : "—"}</td>
                <td className={cellR}>{totals.target > 0 ? `$${fmtVndFull(totals.target / fxRate)}` : "—"}</td>
                <td className={cellR}>{fmtVndFull(totals.budgetAds)}</td>
                <td className={cellR} colSpan={(showActuals ? 2 : 0) + (readOnly ? 2 : 3)} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
