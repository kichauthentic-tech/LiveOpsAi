import React, { useEffect, useMemo, useState } from "react";
import { Brand, BrandMonthPlanSlot, CalendarEventRow, LiveSession, PromoScheme, ShiftSlot } from "../types";
import { BrainCircuit, RotateCcw, Save, Sparkles } from "lucide-react";
import { DEFAULT_ENGINE_PARAMS, ENGINE_GROUP_LABEL, ENGINE_PARAM_META, EngineParamGroup, EngineParams } from "../lib/scheduling/engineParams";
import { buildHistory } from "../lib/scheduling/suggestEngine";
import { buildCalibration, evaluatePlan } from "../lib/scheduling/planEvaluation";
import { fetchBrandLockedPlanSlots, fetchCalendarEvents } from "../lib/db/monthPlans";
import { todayVn } from "../lib/performance/brandCommitment";
import { useDefaultBrand } from "../hooks/useDefaultBrand";
import { errorMessage } from "../lib/errorMessage";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";

import { fmtFixed } from "../lib/format";
// AI Training Center — mục "Engine Kế Hoạch Tháng". Engine là thuật toán thuần, không phải LLM: không
// có prompt để sửa, chỉ có tham số để vặn và kết quả học để nhìn. Hai nửa của panel đi cùng nhau: đổi
// tham số bên trái → nửa "engine đã học gì" tính lại ngay (chưa cần lưu), để admin thấy nút vặn ảnh
// hưởng thế nào trước khi bấm Lưu.

interface Props {
  brands: Brand[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  promoSchemes: PromoScheme[];
  params: EngineParams;
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
  onSave: (params: EngineParams) => Promise<void>;
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const GROUPS: EngineParamGroup[] = ["history", "camp", "schedule", "target", "calibration", "host"];
const fmtM = (v: number) => formatCurrencyAdaptive(Math.round(v));

export const EngineTrainingPanel: React.FC<Props> = ({ brands, sessions, shiftSlots, promoSchemes, params, updatedAt, loading, error, onSave }) => {
  const [draft, setDraft] = useState<EngineParams>(params);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [lockedSlots, setLockedSlots] = useState<BrandMonthPlanSlot[]>([]);
  const today = todayVn();
  const [brandId, setBrandId] = useDefaultBrand(brands, sessions, today);

  // Tham số từ DB tới sau khi mount (hoặc lưu xong) → đồng bộ nháp nếu admin chưa sửa gì.
  useEffect(() => {
    if (!dirty) setDraft(params);
  }, [params, dirty]);
  useEffect(() => {
    fetchCalendarEvents().then(setEvents).catch(() => setEvents([]));
  }, []);
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    fetchBrandLockedPlanSlots(brandId).then((r) => alive && setLockedSlots(r)).catch(() => alive && setLockedSlots([]));
    return () => { alive = false; };
  }, [brandId]);

  const schemes = useMemo(() => promoSchemes.filter((sc) => sc.brandId === brandId).map((sc) => ({ start: sc.startDate, end: sc.endDate, label: sc.title })), [promoSchemes, brandId]);
  // Học lại với tham số ĐANG SỬA — đây là chỗ admin thấy nút vặn có tác dụng.
  const history = useMemo(() => (brandId ? buildHistory(sessions, brandId, today, { events, schemes, params: draft }) : null), [sessions, brandId, today, events, schemes, draft]);
  const evaluation = useMemo(() => {
    if (lockedSlots.length === 0) return null;
    const byMonth = new Map<string, BrandMonthPlanSlot[]>();
    for (const ps of lockedSlots) { const l = byMonth.get(ps.date.slice(0, 7)) ?? []; l.push(ps); byMonth.set(ps.date.slice(0, 7), l); }
    const evals = [...byMonth.entries()].map(([m, l]) => ({ month: m, ev: evaluatePlan(l, shiftSlots, sessions) }));
    const cal = buildCalibration(evals.map((e) => e.ev), draft);
    return { evals, cal };
  }, [lockedSlots, shiftSlots, sessions, draft]);

  const set = (key: keyof EngineParams, value: number | boolean) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };
  const resetAll = () => { setDraft(DEFAULT_ENGINE_PARAMS); setDirty(true); };
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await onSave(draft);
      setDirty(false);
      setMsg("Đã lưu — gợi ý lần sau dùng tham số này.");
    } catch (e) {
      setMsg(`Không lưu được: ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const changed = ENGINE_PARAM_META.filter((m) => draft[m.key] !== DEFAULT_ENGINE_PARAMS[m.key]).length;
  const strong = history ? history.cells.filter((c) => c.n >= 2).slice(0, 6) : [];
  const weak = history ? history.cells.filter((c) => c.tag === "weak").slice(-4) : [];

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-sky-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Không phải LLM — thuật toán thuần</span>
          <h2 className="text-2xl font-black">Engine Kế Hoạch Tháng</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-2xl">
            Engine gợi ý lịch học từ ca đã đối soát rồi xếp ca theo tham số bên dưới. Không có prompt để sửa: "huấn luyện" = xem engine học được gì theo brand, vặn tham số, thấy kết quả đổi ngay, rồi lưu. Kết quả lặp lại được và giải thích được — cần thế khi chốt lịch cho host.
          </p>
        </div>
        <div className="flex-shrink-0 bg-sky-950/60 border border-sky-500/40 rounded-xl px-3.5 py-2 text-right">
          <div className="text-xs font-bold text-sky-300">{changed} tham số khác mặc định</div>
          <p className="text-[11px] text-sky-400">{updatedAt ? `Lưu lần cuối ${new Date(updatedAt).toLocaleString("vi-VN")}` : "Đang dùng mặc định"}</p>
        </div>
      </div>

      {error && <div className="bg-rose-950/40 border border-rose-900 rounded-xl px-4 py-2.5 text-xs text-rose-200">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Nửa trái: engine đã học gì */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5"><BrainCircuit className="w-4 h-4 text-[var(--accent-text)]" /> Engine đã học gì</h3>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs font-bold text-[var(--text)]">
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {!history || history.sessions === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">Brand chưa có ca đối soát nào — không có gì để học. Đối soát ở Đối Soát Số Liệu hoặc nạp bù từ file.</p>
            ) : (
              <div className="text-xs space-y-3">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="text-[var(--text-muted)]">Ca đối soát</span><b className="text-[var(--text)] text-right">{history.sessions} · {history.months} tháng</b>
                  <span className="text-[var(--text-muted)]">Khoảng</span><b className="text-[var(--text)] text-right">{history.firstDate} → {history.lastDate}</b>
                  <span className="text-[var(--text-muted)]">GMV/giờ TB brand</span><b className="text-[var(--text)] text-right">{fmtM(history.brandGmvPerHour)}</b>
                  <span className="text-[var(--text-muted)]">Đủ dữ liệu để tin</span><b className={`text-right ${history.enough ? "text-emerald-400" : "text-amber-400"}`}>{history.enough ? "có" : `chưa (cần ≥ ${draft.minHistorySessions} ca, ${draft.minHistoryMonths} tháng)`}</b>
                </div>
                <div>
                  <p className="font-bold text-[var(--text-muted)] mb-1">Ngày camp</p>
                  {(["dday", "midmonth", "payday"] as const).map((b) => (
                    <div key={b} className="flex justify-between gap-2">
                      <span className="text-[var(--text)]">{{ dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" }[b]}</span>
                      <span className="text-[var(--text)]">GMV/giờ <b>×{fmtFixed(history.campMultipliers[b], 2)}</b> <span className="text-[11px] text-[var(--text-faint)]">{history.campLearned[b] ? "học" : "mặc định"}</span>{history.campHoursLearned[b] ? <> · <b>{fmtFixed(history.campHoursPerDay[b], 1)}h</b>/ngày</> : ""}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2"><span className="text-[var(--text)]">Ngày thường</span><span className="text-[var(--text)]">{history.campHoursLearned.daily ? <><b>{fmtFixed(history.campHoursPerDay.daily, 1)}h</b>/ngày</> : "—"}</span></div>
                  <div className="flex justify-between gap-2 mt-1"><span className="text-[var(--text)]">Ca thứ 2/3/4 trong ngày</span><b className="text-[var(--text)]">×{fmtFixed(history.diminishing[1], 2)} / ×{fmtFixed(history.diminishing[2], 2)} / ×{fmtFixed(history.diminishing[3], 2)}</b></div>
                </div>
                <div>
                  <p className="font-bold text-[var(--text-muted)] mb-1">Lễ / sự kiện / khuyến mãi</p>
                  {(["holiday", "mega_sale", "event"] as const).map((k) => (
                    <div key={k} className="flex justify-between gap-2"><span className="text-[var(--text)]">{{ holiday: "Ngày lễ", mega_sale: "Mega sale", event: "Sự kiện" }[k]}</span><b className="text-[var(--text)]">×{fmtFixed(history.eventMultipliers[k], 2)} <span className="text-[11px] font-normal text-[var(--text-faint)]">{history.eventLearned[k] ? "học" : "chưa đủ ca"}</span></b></div>
                  ))}
                  <div className="flex justify-between gap-2"><span className="text-[var(--text)]">Ngày trùng scheme KM</span><b className="text-[var(--text)]">×{fmtFixed(history.schemeMultiplier, 2)} <span className="text-[11px] font-normal text-[var(--text-faint)]">{history.schemeLearned ? "học" : "chưa đủ ca"}</span></b></div>
                </div>
                <div>
                  <p className="font-bold text-[var(--text-muted)] mb-1">Khung giờ mạnh (thứ × khối 2h)</p>
                  {strong.length === 0 && <p className="text-[var(--text-faint)]">chưa ô nào có ≥ 2 ca</p>}
                  {strong.map((c) => (
                    <div key={`${c.weekday}|${c.block}`} className="flex justify-between gap-2"><span className="text-[var(--text)]">{WD[c.weekday]} {c.block * 2}–{c.block * 2 + 2}h <span className="text-[11px] text-[var(--text-faint)]">({c.n} ca)</span></span><b className="text-emerald-400">{fmtM(c.gmvPerHour)}/h</b></div>
                  ))}
                  {weak.length > 0 && <p className="mt-1 text-[11px] text-[var(--text-faint)]">Yếu: {weak.map((c) => `${WD[c.weekday]} ${c.block * 2}h`).join(", ")}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-[var(--text)]">Kế hoạch vs thực tế (tự hiệu chỉnh)</h3>
            {!evaluation ? (
              <p className="text-xs text-[var(--text-muted)]">Brand chưa có kế hoạch tháng nào đã chốt → chưa có gì để so. Sau tháng đầu tiên chốt kế hoạch và đối soát, engine tự chỉnh GMV/giờ từng ô theo sai số.</p>
            ) : (
              <div className="text-xs space-y-1.5">
                {evaluation.evals.map(({ month, ev }) => (
                  <div key={month} className="flex justify-between gap-2">
                    <span className="text-[var(--text)]">{month}</span>
                    <span className="text-[var(--text-muted)]">{ev.doneCount}/{ev.rows.length} ca có số{ev.doneCount > 0 ? <> · dự báo {fmtM(ev.expectedDone)} → thực tế <b className="text-[var(--text)]">{fmtM(ev.actualDone)}</b>{ev.mape !== null ? ` · sai số ${Math.round(ev.mape * 100)}%` : ""}</> : ""}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-2 pt-1 border-t border-[var(--border)]">
                  <span className="text-[var(--text)]">Hệ số hiệu chỉnh</span>
                  <b className="text-[var(--text)]">{evaluation.cal.observations > 0 ? `${evaluation.cal.factors.size} ô · lệch chung ${evaluation.cal.overallBias !== null ? `${evaluation.cal.overallBias >= 0 ? "+" : ""}${Math.round(evaluation.cal.overallBias * 100)}%` : "—"}` : "chưa có ca nào có thực tế"}</b>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nửa phải: tham số */}
        <div className="xl:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--text)] flex-1">Tham số</h3>
            <span className="text-[11px] text-[var(--text-muted)]">{loading ? "Đang tải…" : msg ?? (dirty ? "Chưa lưu — nửa trái đang tính theo giá trị đang sửa." : "")}</span>
            <button onClick={resetAll} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Về mặc định tất cả</button>
            <button onClick={save} disabled={saving || !dirty} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> {saving ? "Đang lưu…" : "Lưu tham số"}</button>
          </div>
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="text-[11px] font-black uppercase tracking-wider text-[var(--text-faint)] mb-1.5">{ENGINE_GROUP_LABEL[g]}</p>
              <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden">
                {ENGINE_PARAM_META.filter((m) => m.group === g).map((m) => {
                  const v = draft[m.key];
                  const def = DEFAULT_ENGINE_PARAMS[m.key];
                  const isDef = v === def;
                  return (
                    <div key={m.key} className={`flex items-center gap-3 px-3 py-2 text-xs ${isDef ? "" : "bg-sky-950/20"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[var(--text)]">{m.label}</div>
                        {m.help && <div className="text-[11px] text-[var(--text-muted)] leading-snug">{m.help}</div>}
                      </div>
                      {m.kind === "boolean" ? (
                        <label className="flex items-center gap-1.5 text-[var(--text)]">
                          <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(m.key, e.target.checked)} />
                          {v ? "bật" : "tắt"}
                        </label>
                      ) : (
                        <input type="number" value={Number(v)} min={m.min} max={m.max} step={m.step} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set(m.key, n); }} className="w-24 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-right font-mono text-[var(--text)]" />
                      )}
                      <button onClick={() => set(m.key, def)} disabled={isDef} title={`Mặc định: ${String(def)}`} className="w-16 text-[11px] text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-30 text-right">↺ {String(def)}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
