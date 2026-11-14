import React, { useState } from "react";
import { MessageSquareQuote, X } from "lucide-react";
import type { ScenarioLine } from "../../types";
import { SCENARIO_PRESETS, scenarioFactor, scenarioLineError, scoreScenario } from "../../lib/scheduling/brandScenario";
import { saveBrandScenario } from "../../lib/db/monthPlans";
import { fmtFixed, fmtVndShort } from "../../lib/format";
import { FeatureOffNote } from "../common/FeatureOffNote";
import { InfoDot } from "../common/InfoDot";

// Kịch bản brand (07/11, thay đổi 2 của đề xuất dự báo, 0201) — CEO ghi sau buổi họp monthly những gì brand nói mà lịch sử ca không có.
// Dự báo cuối của Kế Hoạch Tháng = engine × Π(1 + %). Hết tháng khối này chấm lại từng dòng: bỏ dòng đó thì dự báo đúng hơn hay sai hơn.
// Logic ở lib/scheduling/brandScenario.ts.

interface Props {
  planId: string | null;
  /** undefined = DB chưa chạy 0201. */
  lines: ScenarioLine[] | undefined;
  /** Dự báo engine của lưới (chưa nhân kịch bản). */
  engineP50: number | null;
  /** Ceo/admin sửa được; vai khác chỉ xem. */
  canEdit: boolean;
  /** GMV thật của tháng khi tháng đã hết — để chấm. */
  actual: number | null;
  onSaved: (lines: ScenarioLine[]) => void;
}

const signPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtFixed(Math.abs(v) * 100, 1)}%`;
const INPUT = "bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] min-h-[30px]";

export const BrandScenarioPanel: React.FC<Props> = ({ planId, lines, engineP50, canEdit, actual, onSaved }) => {
  const [label, setLabel] = useState("");
  const [pctText, setPctText] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = lines ?? [];
  if (!canEdit && list.length === 0) return null;

  const factor = scenarioFactor(list);
  const score = actual !== null && engineP50 ? scoreScenario(engineP50, list, actual) : null;

  const persist = async (next: ScenarioLine[]) => {
    if (!planId) return;
    setBusy(true);
    setErr(null);
    try {
      onSaved(await saveBrandScenario(planId, next));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    const pct = Number(pctText.replace(",", ".")) / 100;
    const line = { label: label.trim(), pct, reason: reason.trim() };
    const bad = scenarioLineError(line);
    if (bad) {
      setErr(bad);
      return;
    }
    await persist([...list, { ...line, id: `${Date.now()}`, at: new Date().toISOString() }]);
    setLabel("");
    setPctText("");
    setReason("");
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2" aria-label="Kịch bản brand" data-testid="brand-scenario">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5"><MessageSquareQuote className="w-4 h-4 text-[var(--accent-text)]" /> Kịch bản brand</h3>
        {engineP50 ? (
          <span className="text-xs tabular-nums text-[var(--text-muted)]">
            engine {fmtVndShort(engineP50)}
            {list.length > 0 && <> × kịch bản {signPct(factor - 1)} = <b className="text-[var(--text)]">{fmtVndShort(engineP50 * factor)}</b></>}
          </span>
        ) : null}
      </div>
      <p className="text-2xs text-[var(--text-faint)]">
          Mỗi dòng một % và một lý do; hết tháng app chấm lại từng dòng.
          <InfoDot label="Ghi gì vào đây">
            Sau buổi họp monthly, ghi những gì brand nói mà lịch sử ca không có: Ads, voucher, hàng mới, hết hàng,
            mức tham gia campaign sàn, mùa vụ.
          </InfoDot>
        </p>

      {lines === undefined ? (
        <FeatureOffNote what="lưu Kịch bản brand" />
      ) : (
        <>
          {list.length > 0 && (
            <ul className="divide-y divide-[var(--border-muted)] text-xs">
              {list.map((l) => {
                const g = score?.perLine.find((p) => p.id === l.id);
                return (
                  <li key={l.id} className="flex items-start gap-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="text-[var(--text)]">{l.label}</span>
                      <span className="block text-2xs text-[var(--text-faint)]">{l.reason}</span>
                    </span>
                    <b className={`tabular-nums ${l.pct > 0 ? "text-emerald-400" : "text-rose-400"}`}>{signPct(l.pct)}</b>
                    {g && <span className={`text-2xs tabular-nums ${g.gainPts >= 0 ? "text-emerald-400" : "text-rose-400"}`} title="Bỏ riêng dòng này thì |lệch| đổi bao nhiêu điểm %">{g.gainPts >= 0 ? "giúp" : "hại"} {fmtFixed(Math.abs(g.gainPts), 1)} điểm</span>}
                    {canEdit && !score && (
                      <button type="button" disabled={busy} onClick={() => void persist(list.filter((x) => x.id !== l.id))} aria-label={`Bỏ dòng ${l.label}`} className="p-1 text-[var(--text-faint)] hover:text-rose-400">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {score && (
            <p className="text-2xs tabular-nums text-[var(--text-muted)]">
              Chấm cuối tháng: engine lệch <b className="text-[var(--text)]">{signPct(score.engineError)}</b>
              {list.length > 0 && <> · sau kịch bản <b className="text-[var(--text)]">{signPct(score.adjustedError)}</b> ⇒ kịch bản <b className={score.gainPts >= 0 ? "text-emerald-400" : "text-rose-400"}>{score.gainPts >= 0 ? "giúp" : "làm sai thêm"} {fmtFixed(Math.abs(score.gainPts), 1)} điểm</b></>}
            </p>
          )}
          {canEdit && !score && planId && (
            <div className="flex flex-wrap items-center gap-2">
              <input id="scenario-label" list="scenario-presets" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Brand nói gì (vd Ads tháng này)" aria-label="Nội dung" className={`${INPUT} flex-1 min-w-[180px]`} />
              <datalist id="scenario-presets">{SCENARIO_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
              <input id="scenario-pct" value={pctText} onChange={(e) => setPctText(e.target.value)} inputMode="decimal" placeholder="% (vd 6 hoặc -4)" aria-label="% ảnh hưởng" className={`${INPUT} w-28 tabular-nums`} />
              <input id="scenario-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do / nguồn" aria-label="Lý do" className={`${INPUT} flex-1 min-w-[160px]`} />
              <button type="button" disabled={busy} onClick={() => void add()} className="px-3 py-1.5 rounded-lg text-xs font-bold seg-on border min-h-[30px] disabled:opacity-60">Thêm dòng</button>
            </div>
          )}
          {!planId && canEdit && <p className="text-2xs text-[var(--text-faint)]">Lưu kế hoạch trước rồi mới ghi kịch bản.</p>}
        </>
      )}
      {err && <p role="alert" className="text-2xs text-rose-300">{err}</p>}
    </section>
  );
};
