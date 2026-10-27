import React, { useState } from "react";
import { ClipboardCheck, ListChecks, Plus, Trash2 } from "lucide-react";
import {
  ACTION_METRICS,
  ACTION_SCOPES,
  ACTION_SCOPE_LABEL,
  ACTION_STATUS_LABEL,
  gradeHeadline,
  newActionItem,
  parseThreshold,
  suggestThreshold,
  thresholdInputText,
  trackLabel,
  type ActionGrade,
  type ActionGradeContext,
  type ActionGradeStatus,
  type ActionItem,
  type ActionMetricKey,
  type ActionScope
} from "../../../lib/report/actionPlan";
import { errorMessage } from "../../../lib/errorMessage";
import { LINK_BTN, PAL } from "./theme";
import { Panel, ReportTable } from "./ui";

// Action plan tháng sau (0182) — 3 cột Hành động · Căn cứ · Chỉ tiêu theo dõi; report tháng sau tự chấm (lib/report/actionPlan.ts).

const rowStyle = (idx: number) => ({ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" });
const FIELD = "w-full rounded-lg px-2.5 py-1.5 text-[13px] min-h-[32px]";
const fieldStyle = { background: PAL.panel, border: `1px solid ${PAL.line}`, color: PAL.cream };

type DraftRow = ActionItem & { mode: "metric" | "text"; thresholdText: string };

const toDraft = (i: ActionItem): DraftRow => ({
  ...i,
  mode: i.target ? "metric" : "text",
  thresholdText: i.target ? thresholdInputText(i.target.metric, i.target.value) : ""
});
const kindOf = (k: ActionMetricKey) => ACTION_METRICS.find((m) => m.key === k)!.kind;

export const ActionPlanPanel: React.FC<{
  items: ActionItem[] | null;
  /** Việc tự sinh từ Insight — hiện khi chưa có plan, và là gợi ý khi lập plan. */
  fallbackLines: string[];
  nextMonthLabel: string;
  /** Số tháng này — để gợi ý ngưỡng khi chọn chỉ số. */
  ctx: ActionGradeContext;
  canManage: boolean;
  onSave: (items: ActionItem[]) => Promise<void>;
}> = ({ items, fallbackLines, nextMonthLabel, ctx, canManage, onSave }) => {
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft((items?.length ? items : fallbackLines.map((l) => newActionItem(l))).map(toDraft));
    setError(null);
  };
  const patch = (id: string, p: Partial<DraftRow>) => setDraft((d) => d && d.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const pickMetric = (r: DraftRow, metric: ActionMetricKey, scope: ActionScope) => {
    const sug = suggestThreshold(metric, scope, ctx);
    patch(r.id, { target: { metric, scope, op: r.target?.op ?? "gte", value: sug ?? r.target?.value ?? 0 }, thresholdText: sug != null ? thresholdInputText(metric, sug) : "" });
  };
  const save = async (rows: DraftRow[]) => {
    const out: ActionItem[] = [];
    for (const [i, r] of rows.entries()) {
      if (!r.action.trim()) continue;
      let target = null;
      if (r.mode === "metric") {
        const metric = r.target?.metric ?? "gmvPerHour";
        const value = parseThreshold(r.thresholdText, kindOf(metric));
        if (value == null) {
          setError(`Việc ${i + 1}: chưa đọc được ngưỡng "${r.thresholdText}" — gõ số như 19.900.000, 19,9M hoặc 1,25.`);
          return;
        }
        target = { metric, scope: r.target?.scope ?? "all", op: r.target?.op ?? "gte", value };
      }
      out.push({ id: r.id, action: r.action.trim(), basis: r.basis.trim(), target, trackText: target ? "" : r.trackText.trim(), manual: target ? null : r.manual });
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(out);
      setDraft(null);
    } catch (e) {
      const msg = errorMessage(e, "Lưu action plan thất bại");
      setError(/action_plan/.test(msg) ? "Chưa có cột action_plan — cần chạy migration 0182 trong SQL Editor." : msg);
    } finally {
      setSaving(false);
    }
  };

  if (draft) {
    return (
      <Panel title={`Action plan ${nextMonthLabel}`} icon={<ListChecks className="w-4 h-4" />} sub="Mỗi việc: hành động · căn cứ (số tháng này) · chỉ tiêu theo dõi. Chỉ tiêu bằng số thì report tháng sau tự chấm.">
        <div className="space-y-3">
          {draft.map((r, i) => (
            <div key={r.id} className="rounded-xl p-3 space-y-2" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
              <div className="flex items-start gap-2">
                <span className="text-xs font-black pt-2 w-5 shrink-0" style={{ color: PAL.gold }}>{i + 1}</span>
                <label className="flex-1 min-w-0 space-y-1">
                  <span className="text-[11px] font-semibold" style={{ color: PAL.muted }}>Hành động</span>
                  <textarea value={r.action} onChange={(e) => patch(r.id, { action: e.target.value })} rows={2} className={FIELD} style={fieldStyle} />
                </label>
                <button
                  onClick={() => setDraft((d) => d && d.filter((x) => x.id !== r.id))}
                  className="mt-6 p-1.5 rounded-lg min-w-[28px] min-h-[28px]"
                  style={{ color: PAL.muted, border: `1px solid ${PAL.line}` }}
                  aria-label={`Xoá việc ${i + 1}`}
                  title="Xoá việc này"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="pl-7 space-y-2">
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold" style={{ color: PAL.muted }}>Căn cứ</span>
                  <input value={r.basis} onChange={(e) => patch(r.id, { basis: e.target.value })} placeholder="Số của tháng này dẫn tới việc này" className={FIELD} style={fieldStyle} />
                </label>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: PAL.muted }}>Chỉ tiêu theo dõi</span>
                    {(["metric", "text"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => (m === "metric" && !r.target ? (patch(r.id, { mode: m }), pickMetric({ ...r, mode: m }, "gmvPerHour", "all")) : patch(r.id, { mode: m }))}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold min-h-[26px] ${r.mode === m ? "seg-on" : ""}`}
                        style={r.mode === m ? undefined : { color: PAL.muted, border: `1px solid ${PAL.line}` }}
                      >
                        {m === "metric" ? "App chấm bằng số" : "Ops tự chấm"}
                      </button>
                    ))}
                  </div>
                  {r.mode === "metric" ? (
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={r.target?.metric ?? "gmvPerHour"}
                        onChange={(e) => pickMetric(r, e.target.value as ActionMetricKey, r.target?.scope ?? "all")}
                        className={`${FIELD} flex-1 basis-40 min-w-0`}
                        style={fieldStyle}
                        aria-label="Chỉ số"
                      >
                        {ACTION_METRICS.map((m) => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                      <select
                        value={r.target?.scope ?? "all"}
                        onChange={(e) => pickMetric(r, r.target?.metric ?? "gmvPerHour", e.target.value as ActionScope)}
                        className={`${FIELD} w-32`}
                        style={fieldStyle}
                        aria-label="Phạm vi"
                      >
                        {ACTION_SCOPES.map((s) => (
                          <option key={s} value={s}>{ACTION_SCOPE_LABEL[s]}</option>
                        ))}
                      </select>
                      <select
                        value={r.target?.op ?? "gte"}
                        onChange={(e) => r.target && patch(r.id, { target: { ...r.target, op: e.target.value as "gte" | "lte" } })}
                        className={`${FIELD} w-16`}
                        style={fieldStyle}
                        aria-label="So sánh"
                      >
                        <option value="gte">≥</option>
                        <option value="lte">≤</option>
                      </select>
                      <input
                        value={r.thresholdText}
                        onChange={(e) => patch(r.id, { thresholdText: e.target.value })}
                        className={`${FIELD} w-36 font-mono`}
                        style={fieldStyle}
                        aria-label="Ngưỡng"
                      />
                    </div>
                  ) : (
                    <input value={r.trackText} onChange={(e) => patch(r.id, { trackText: e.target.value })} placeholder="vd. Số creator hoạt động; tỷ trọng creator lớn nhất" className={FIELD} style={fieldStyle} />
                  )}
                  {r.mode === "metric" && r.target && (
                    <p className="text-[11px]" style={{ color: PAL.muted }}>
                      Tháng này: {(() => {
                        const v = suggestThreshold(r.target.metric, r.target.scope, ctx);
                        return r.target.metric === "pctTarget" || v == null ? "—" : thresholdInputText(r.target.metric, v);
                      })()} · ô ngưỡng mặc định lấy số tháng này, sửa thành mức muốn đạt.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => setDraft((d) => [...(d ?? []), toDraft(newActionItem())])} className="flex items-center gap-1.5 text-xs font-bold min-h-[28px]" style={{ color: PAL.gold }}>
            <Plus className="w-3.5 h-3.5" /> Thêm việc
          </button>
          {error && <p className="text-xs font-semibold" style={{ color: PAL.red }}>{error}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => save(draft)} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-60" style={{ background: PAL.gold, color: "#1a1500" }}>
              {saving ? "Đang lưu…" : "Lưu action plan"}
            </button>
            <button onClick={() => setDraft(null)} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.muted }}>
              Huỷ
            </button>
            {items && items.length > 0 && (
              <button onClick={() => save([])} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ color: PAL.muted }}>
                Xoá action plan (dùng lại danh sách tự sinh)
              </button>
            )}
          </div>
        </div>
      </Panel>
    );
  }

  if (!items?.length) {
    return (
      <div className="rounded-xl p-4" style={{ background: PAL.panel, border: `1px solid ${PAL.gold}44` }}>
        <div className="text-xs mb-2 font-bold" style={{ color: PAL.gold }}>Hành động {nextMonthLabel}</div>
        <ol className="space-y-2 text-sm leading-relaxed list-decimal pl-5" style={{ color: PAL.cream }}>
          {fallbackLines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
        {canManage && (
          <div className="flex flex-wrap items-center gap-3 pt-3 mt-3 text-[11px]" style={{ borderTop: `1px solid ${PAL.line}`, color: PAL.muted }}>
            <span>Bản tự sinh từ Insight — chưa có căn cứ và chỉ tiêu theo dõi, report tháng sau không chấm được.</span>
            <button onClick={start} className={LINK_BTN} style={{ color: PAL.gold }}>
              Lập action plan
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Panel title={`Action plan ${nextMonthLabel}`} icon={<ListChecks className="w-4 h-4" />} sub={`Report ${nextMonthLabel} tự chấm các chỉ tiêu bằng số khi đủ số cả tháng`}>
      <ReportTable head={["#", "Hành động", "Căn cứ", "Chỉ tiêu theo dõi"]} leftCols={[1, 2, 3]}>
        {items.map((it, idx) => (
          <tr key={it.id} style={rowStyle(idx)}>
            <td className="py-2 px-3 font-mono align-top" style={{ color: PAL.gold }}>{idx + 1}</td>
            <td className="py-2 px-3 align-top text-left font-semibold w-[44%] min-w-[220px]" style={{ color: PAL.cream }}>{it.action}</td>
            <td className="py-2 px-3 align-top text-left w-[28%] min-w-[160px]" style={{ color: PAL.muted }}>{it.basis || "—"}</td>
            <td className="py-2 px-3 align-top text-left w-[28%] min-w-[160px]" style={{ color: PAL.cream }}>{trackLabel(it)}</td>
          </tr>
        ))}
      </ReportTable>
      {canManage && (
        <div className="pt-3 text-[11px]">
          <button onClick={start} className={LINK_BTN} style={{ color: PAL.gold }}>
            Sửa action plan
          </button>
        </div>
      )}
    </Panel>
  );
};

const STATUS_COLOR: Record<ActionGradeStatus, string> = { met: PAL.green, missed: PAL.red, tracking: PAL.blue, nodata: PAL.muted, awaiting: PAL.gold };

export const ActionResultsPanel: React.FC<{
  planMonthLabel: string;
  monthLabel: string;
  items: ActionItem[];
  grades: ActionGrade[];
  final: boolean;
  throughNote: string | null;
  canManage: boolean;
  onManual: (id: string, status: "met" | "missed" | null) => Promise<void>;
}> = ({ planMonthLabel, monthLabel, items, grades, final, throughNote, canManage, onManual }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mark = async (id: string, status: "met" | "missed" | null) => {
    setBusy(id);
    setError(null);
    try {
      await onManual(id, status);
    } catch (e) {
      setError(errorMessage(e, "Lưu kết quả thất bại"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel
      title={`Kết quả action plan ${planMonthLabel}`}
      icon={<ClipboardCheck className="w-4 h-4" />}
      sub={`Việc đặt ra ở report ${planMonthLabel} · chấm bằng số ${monthLabel}${throughNote ? ` (${throughNote})` : ""} · việc không đo bằng số do YFB chấm`}
    >
      <p className="text-sm font-black mb-3" style={{ color: PAL.cream }}>{gradeHeadline(monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), grades, final)}</p>
      <ReportTable head={["#", "Hành động", "Chỉ tiêu theo dõi", "Thực đạt", "Kết quả"]} leftCols={[1, 2]}>
        {items.map((it, idx) => {
          const g = grades[idx];
          const showOnTrack = g.status === "tracking" && g.onTrack != null;
          return (
            <tr key={it.id} style={rowStyle(idx)}>
              <td className="py-2 px-3 font-mono align-top" style={{ color: PAL.gold }}>{idx + 1}</td>
              <td className="py-2 px-3 align-top text-left w-[42%] min-w-[220px]" style={{ color: PAL.cream }}>{it.action}</td>
              <td className="py-2 px-3 align-top text-left min-w-[170px]" style={{ color: PAL.muted }}>{trackLabel(it)}</td>
              <td className="py-2 px-3 align-top text-right font-mono" style={{ color: PAL.cream }}>{g.actualText}</td>
              <td className="py-2 px-3 align-top text-right min-w-[120px]">
                <span className="font-bold" style={{ color: STATUS_COLOR[g.status] }}>
                  {ACTION_STATUS_LABEL[g.status]}
                  {showOnTrack ? ` · ${g.onTrack ? "đang ở mức đạt" : "đang dưới mức"}` : ""}
                </span>
                {canManage && g.manual && final && (
                  <div className="flex justify-end gap-2 mt-1 text-[11px]">
                    {(["met", "missed"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => mark(it.id, it.manual?.status === s ? null : s)}
                        disabled={busy === it.id}
                        className={`px-2 py-0.5 rounded-md min-h-[24px] ${it.manual?.status === s ? "seg-on" : ""}`}
                        style={it.manual?.status === s ? undefined : { color: PAL.muted, border: `1px solid ${PAL.line}` }}
                      >
                        {ACTION_STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </ReportTable>
      {error && <p className="text-xs font-semibold mt-2" style={{ color: PAL.red }}>{error}</p>}
    </Panel>
  );
};
