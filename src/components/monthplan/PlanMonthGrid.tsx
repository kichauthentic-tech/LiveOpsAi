import { useEffect, useRef, useState } from "react";
import { Ban, Plus, X } from "lucide-react";
import type { PlanCampRanges } from "../../types";
import { CAMPAIGN_DAY_STYLES, resolveCampBucketType } from "../../lib/campaignDays";
import { fmtVndShort } from "../../lib/format";
import type { PlanDraftSlot } from "../../lib/scheduling/monthPlanGrid";
import { summarizePlanSpan, type SlotOutcome } from "../../lib/scheduling/planWeeks";

// Lưới ngày × ca của Kế Hoạch Tháng (đề xuất 27/10, user duyệt cả 4 quyết định):
// - mỗi ca là MỘT dòng rút gọn "20–23 · 62,6M"; bấm để sửa giờ/target trong khung nổi — trước đó 87 ca × 3 ô nhập luôn mở (281 ô);
// - kế hoạch đã chốt: ca tới hạn hiện thực đạt, xanh = đạt target ca, đỏ = dưới; đầu ô ngày + cột "Tuần" là % target tới nay (cùng luật
//   run-rate: ca huỷ / qua giờ chưa có số giữ target trong mẫu số);
// - ca tăng cường và ca live ngoài kế hoạch nằm ngay trong ô ngày (viền đứt), thay hai khối riêng phía trên lưới. Chúng KHÔNG thuộc
//   target tháng nên không vào % ngày/tuần.

export interface GridExtra {
  key: string;
  date: string;
  startTime: string;
  endTime: string;
  kind: "boost" | "offplan";
  /** Target đề xuất của ca tăng cường (không cộng vào target tháng); null = ca ngoài kế hoạch, không có target. */
  target: number | null;
  actual: number | null;
  pending?: boolean;
  /** Target tạm của DB (0186: target/giờ của kế hoạch × giờ ca), engine chưa tính dự báo riêng. */
  provisional?: boolean;
}

interface Props {
  cells: (string | null)[];
  draftsByDay: Map<string, PlanDraftSlot[]>;
  extrasByDay: Map<string, GridExtra[]>;
  campRanges: PlanCampRanges;
  today: string;
  locked: boolean;
  loading: boolean;
  maxSlotsPerDay: number;
  blackoutDates: string[];
  outcomeOf: (d: PlanDraftSlot) => SlotOutcome | undefined;
  clashOf: (key: string) => string | undefined;
  labelOf: (day: string) => string | undefined;
  isStaffed: (d: PlanDraftSlot) => boolean;
  timeLocked: (d: PlanDraftSlot) => boolean;
  /** Lý do khoá ô target của ca (undefined = sửa được). */
  targetLockReason: (d: PlanDraftSlot) => string | undefined;
  onUpdate: (key: string, patch: Partial<PlanDraftSlot>) => void;
  onRemove: (key: string) => void;
  onAdd: (day: string) => void;
  onToggleBlackout: (day: string) => void;
}

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const BUCKET_LABEL: Record<string, string> = { daily: "Daily", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };
const fmtH = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
/** "20:00" → "20", "20:30" → "20:30" — ca đa số tròn giờ, bỏ ":00" cho dòng ca vừa ô ngày. */
const hm = (t: string) => (t.slice(3, 5) === "00" ? String(Number(t.slice(0, 2))) : t.slice(0, 5));
const pctTone = (p: number) => (p >= 1 ? "text-emerald-400" : p >= 0.85 ? "text-amber-400" : "text-rose-400");

export function PlanMonthGrid(p: Props) {
  const [edit, setEdit] = useState<{ key: string; x: number; y: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!edit) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEdit(null); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (popRef.current?.contains(t) || t.closest("[data-plan-chip]")) return;
      setEdit(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [edit]);

  const allDrafts = [...p.draftsByDay.values()].flat();
  const editing = edit ? allDrafts.find((d) => d.key === edit.key) : undefined;
  const openEdit = (d: PlanDraftSlot, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setEdit({ key: d.key, x: Math.max(8, Math.min(window.innerWidth - 268, r.left)), y: Math.min(window.innerHeight - 290, r.bottom + 6) });
  };

  const rows: (string | null)[][] = [];
  for (let i = 0; i < p.cells.length; i += 7) rows.push(p.cells.slice(i, i + 7));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 overflow-x-auto">
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(96px,0.8fr)] gap-1.5 min-w-[1000px]">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={w} className={`text-center text-[11px] font-bold py-1 rounded-lg ${i >= 5 ? "text-rose-300 bg-rose-950/30" : "text-[var(--text-faint)] bg-[var(--surface-base)]"}`}>{w}</div>
        ))}
        <div className="text-center text-[11px] font-bold py-1 rounded-lg text-[var(--text-faint)] bg-[var(--surface-base)]">Tuần</div>
        {rows.map((row, ri) => {
          const days = row.filter((d): d is string => !!d);
          return [
            ...row.map((day, ci) => (day ? <DayCell key={day} day={day} p={p} onEdit={openEdit} editingKey={edit?.key} /> : <div key={`e${ri}-${ci}`} className="min-h-[84px] rounded-xl bg-[var(--surface-base)]/40" />)),
            <WeekCell key={`w${ri}`} days={days} p={p} />
          ];
        })}
      </div>
      {allDrafts.length === 0 && !p.loading && (
        <p className="text-center text-xs text-[var(--text-muted)] py-6">Lưới trống — bấm "Gợi ý phân bổ", "Dựng từ ca đã nhập", hoặc "+" ở từng ngày.</p>
      )}
      {editing && edit && (
        <SlotEditor
          key={editing.key}
          ref={popRef}
          d={editing}
          x={edit.x}
          y={edit.y}
          p={p}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function DayCell({ day, p, onEdit, editingKey }: { day: string; p: Props; onEdit: (d: PlanDraftSlot, el: HTMLElement) => void; editingKey?: string }) {
  const list = p.draftsByDay.get(day) ?? [];
  const extras = p.extrasByDay.get(day) ?? [];
  const bucket = resolveCampBucketType(day, p.campRanges);
  const style = bucket !== "daily" ? CAMPAIGN_DAY_STYLES[bucket] : null;
  const past = day < p.today;
  const isBlackout = p.blackoutDates.includes(day);
  const sum = summarizePlanSpan([day], list, p.outcomeOf);
  const label = p.labelOf(day);
  return (
    <div className={`min-h-[84px] rounded-xl border p-1.5 flex flex-col gap-1 ${isBlackout ? "bg-[var(--surface-base)] border-dashed border-rose-800 opacity-70" : style ? style.cell : "bg-[var(--surface-base)] border-[var(--border)]"}`}>
      <div className="flex items-center justify-between gap-1">
        <span className={`text-xs font-black ${style ? style.text : "text-[var(--text)]"}`}>{Number(day.slice(-2))}{style ? ` · ${BUCKET_LABEL[bucket]}` : ""}</span>
        <span className="text-[11px] text-[var(--text-faint)] flex items-center gap-1 tabular-nums" title={list.length > 0 ? `${list.length} ca · ${fmtH(sum.hours)}h · target ${fmtVndShort(sum.target)}` : undefined}>
          {p.locked && sum.pct !== null ? <b className={pctTone(sum.pct)}>{Math.round(sum.pct * 100)}%</b> : sum.target > 0 ? fmtVndShort(sum.target) : ""}
          {/* -m-1.5 p-1.5: vùng bấm 24×24 (sàn WCAG 2.5.8) mà không đẩy cao dòng ngày — M5. */}
          {!past && (
            <button onClick={() => p.onToggleBlackout(day)} className={`-m-1.5 p-1.5 ${isBlackout ? "text-rose-400" : "text-[var(--text-faint)] hover:text-rose-400"}`} title={isBlackout ? "Bỏ cấm live ngày này" : "Cấm live ngày này (engine bỏ qua)"} aria-label={isBlackout ? "Bỏ cấm live" : "Cấm live ngày này"}>
              <Ban className="w-3 h-3" />
            </button>
          )}
        </span>
      </div>
      {label && <div className="text-[11px] text-[var(--accent-text)] truncate" title={label}>{label}</div>}
      {isBlackout && <div className="text-[11px] text-rose-400 font-bold">cấm live</div>}
      {list.map((d) => <SlotChip key={d.key} d={d} p={p} active={d.key === editingKey} onEdit={onEdit} />)}
      {extras.map((x) => <ExtraChip key={x.key} x={x} />)}
      {!past && !isBlackout && list.length < p.maxSlotsPerDay && (
        <button onClick={() => p.onAdd(day)} className="mt-auto min-h-6 text-[11px] font-bold text-[var(--text-faint)] hover:text-[var(--accent-text)] flex items-center justify-center gap-1 border border-dashed border-[var(--border)] rounded-lg" aria-label={`Thêm ca ngày ${Number(day.slice(-2))}`}>
          <Plus className="w-3 h-3" /> ca
        </button>
      )}
    </div>
  );
}

function SlotChip({ d, p, active, onEdit }: { d: PlanDraftSlot; p: Props; active: boolean; onEdit: (d: PlanDraftSlot, el: HTMLElement) => void }) {
  const o = p.outcomeOf(d);
  const clash = p.clashOf(d.key);
  const staffed = p.isStaffed(d);
  const unsynced = p.locked && !d.slotId;
  let right: React.ReactNode;
  let border = "border-[var(--border)]";
  let title = `${d.startTime}–${d.endTime} · target ${fmtVndShort(d.targetGmv)}`;
  if (o?.state === "done") {
    const ok = o.actual >= d.targetGmv;
    right = <b className={ok ? "text-emerald-400" : "text-rose-400"}>{fmtVndShort(o.actual)}</b>;
    border = ok ? "border-emerald-800" : "border-rose-800";
    title += ` → thực đạt ${fmtVndShort(o.actual)}${d.targetGmv > 0 ? ` (${Math.round((o.actual / d.targetGmv) * 100)}%)` : ""}`;
  } else if (o?.state === "cancelled") {
    right = <span className="text-[var(--text-faint)]">huỷ</span>;
    title += " · ca đã huỷ — vẫn giữ target trong run-rate";
  } else if (o?.state === "no_data") {
    right = <span className="text-amber-400 font-bold">chưa số liệu</span>;
    border = "border-amber-800";
    title += " · đã qua giờ, chưa có số liệu";
  } else {
    right = <span className={d.highExpectation ? "text-amber-400 font-bold" : "text-[var(--text)]"}>{d.targetGmv > 0 ? fmtVndShort(d.targetGmv) : "0"}</span>;
    if (d.expectedGmv !== undefined) title += ` · dự báo ${fmtVndShort(d.expectedGmv)}`;
    if (d.highExpectation) title += " · target cao hơn dự báo";
  }
  if (clash) { border = "border-rose-600"; title += ` · trùng phòng: ${clash}`; }
  if (staffed) title += " · đã chốt người";
  if (unsynced) title += " · chưa mở ca — bấm Chốt lại";
  if (d.reason) title += `\n${d.reason}`;
  return (
    <button
      type="button"
      data-plan-chip
      onClick={(e) => onEdit(d, e.currentTarget)}
      title={title}
      className={`w-full min-h-6 flex items-center justify-between gap-1 rounded-md border px-1.5 text-[11px] tabular-nums ${unsynced ? "border-dashed border-[var(--accent)]/70" : border} ${active ? "ring-1 ring-[var(--accent)]" : ""} ${o?.state === "cancelled" ? "opacity-60 line-through" : ""} bg-[var(--surface)] hover:bg-[var(--surface-hover)]`}
    >
      <span className="text-[var(--text-muted)] flex items-center gap-1">
        {staffed && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden />}
        {hm(d.startTime)}–{hm(d.endTime)}
      </span>
      {right}
    </button>
  );
}

function ExtraChip({ x }: { x: GridExtra }) {
  const ok = x.actual !== null && x.target !== null && x.actual >= x.target;
  const title =
    x.kind === "boost"
      ? `Ca tăng cường ${x.startTime}–${x.endTime}: ${x.pending ? "chờ target đề xuất" : x.provisional ? `target tạm ${fmtVndShort(x.target ?? 0)} (target/giờ của kế hoạch × giờ ca, engine chưa tính)` : `đề xuất ${fmtVndShort(x.target ?? 0)}`}${x.actual !== null ? ` → thực đạt ${fmtVndShort(x.actual)}` : ""}. Không cộng vào target tháng; GMV vẫn cộng vào thực đạt.`
      : `Ca live ngoài kế hoạch ${x.startTime}–${x.endTime}: target 0, GMV ${fmtVndShort(x.actual ?? 0)} vẫn cộng vào thực đạt ⇒ run-rate cao hơn thực. Đưa vào kế hoạch: "Chia lại theo lịch hiện có…".`;
  return (
    <div title={title} className="w-full min-h-6 flex items-center justify-between gap-1 rounded-md border border-dashed border-sky-700 px-1.5 text-[11px] tabular-nums bg-sky-950/20">
      <span className="text-sky-300">{hm(x.startTime)}–{hm(x.endTime)} {x.kind === "boost" ? "+" : "ngoài kế hoạch"}</span>
      {x.actual !== null ? (
        <b className={x.target === null ? "text-sky-200" : ok ? "text-emerald-400" : "text-rose-400"}>{fmtVndShort(x.actual)}</b>
      ) : (
        <span className="text-sky-200">{x.pending ? "chờ" : fmtVndShort(x.target ?? 0)}</span>
      )}
    </div>
  );
}

function WeekCell({ days, p }: { days: string[]; p: Props }) {
  const drafts = days.flatMap((d) => p.draftsByDay.get(d) ?? []);
  const s = summarizePlanSpan(days, drafts, p.outcomeOf);
  const showPct = p.locked && s.pct !== null;
  return (
    <div className="min-h-[84px] rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 flex flex-col justify-center gap-0.5 text-[11px] tabular-nums">
      {showPct ? (
        <>
          <span className={`text-lg font-black leading-none ${pctTone(s.pct!)}`}>{Math.round(s.pct! * 100)}%</span>
          <span className="text-[var(--text-muted)]">{fmtVndShort(s.actual)} / {fmtVndShort(s.targetToDate)}</span>
          {s.dueCount < s.slots && <span className="text-[var(--text-faint)]">còn {s.slots - s.dueCount} ca chưa tới</span>}
          {s.noDataCount > 0 && <span className="text-amber-400">{s.noDataCount} ca chưa số liệu</span>}
        </>
      ) : (
        <>
          <span className="text-lg font-black leading-none text-[var(--text)]">{s.target > 0 ? fmtVndShort(s.target) : "—"}</span>
          <span className="text-[var(--text-faint)]">target tuần</span>
        </>
      )}
      <span className="text-[var(--text-faint)]">{s.slots} ca · {fmtH(s.hours)}h</span>
    </div>
  );
}

const SlotEditor = ({ d, x, y, p, onClose, ref }: { d: PlanDraftSlot; x: number; y: number; p: Props; onClose: () => void; ref: React.Ref<HTMLDivElement> }) => {
  const tLocked = p.timeLocked(d);
  const targetReason = p.targetLockReason(d);
  // Bấm sang ca khác khi khung còn mở: nơi gọi đặt key = ca ⇒ khung dựng lại, ô target theo ca mới.
  const [targetText, setTargetText] = useState(String(d.targetGmv || ""));
  const commitTarget = () => {
    const n = Number(targetText.replace(/[^\d]/g, "")) || 0;
    if (n !== d.targetGmv) p.onUpdate(d.key, { targetGmv: n });
  };
  const o = p.outcomeOf(d);
  const clash = p.clashOf(d.key);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Ca ${d.date.slice(8)}/${d.date.slice(5, 7)} ${d.startTime}–${d.endTime}`}
      style={{ left: x, top: y }}
      className="fixed z-50 w-[260px] rounded-xl border border-[var(--accent)]/60 bg-[var(--surface)] shadow-2xl p-3 space-y-2 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <b className="text-[var(--text)]">Ngày {Number(d.date.slice(8))}/{Number(d.date.slice(5, 7))}</b>
        <button onClick={onClose} className="-m-1 p-1 text-[var(--text-faint)] hover:text-[var(--text)]" aria-label="Đóng"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="font-medium text-[var(--text-muted)] block mb-1">Bắt đầu</span>
          <input type="time" disabled={tLocked} value={d.startTime} onChange={(e) => p.onUpdate(d.key, { startTime: e.target.value })} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 font-mono text-[var(--text)] disabled:opacity-60" />
        </label>
        <label className="block">
          <span className="font-medium text-[var(--text-muted)] block mb-1">Kết thúc</span>
          <input type="time" disabled={tLocked} value={d.endTime} onChange={(e) => p.onUpdate(d.key, { endTime: e.target.value })} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 font-mono text-[var(--text)] disabled:opacity-60" />
        </label>
      </div>
      <label className="block">
        <span className="font-medium text-[var(--text-muted)] block mb-1">Target GMV của ca</span>
        <input
          inputMode="numeric"
          disabled={!!targetReason}
          title={targetReason}
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
          onBlur={commitTarget}
          onKeyDown={(e) => { if (e.key === "Enter") { commitTarget(); onClose(); } }}
          className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 font-mono text-[var(--text)] disabled:opacity-60"
        />
        {/* Số 8 chữ số gõ tay dễ thừa/thiếu một số 0 — dạng rút gọn ngay dưới để thấy sai bậc. */}
        <span className="text-[11px] text-[var(--text-faint)] block mt-0.5">
          = {fmtVndShort(Number(targetText.replace(/[^\d]/g, "")) || 0)}
          {d.expectedGmv !== undefined ? ` · dự báo ${fmtVndShort(d.expectedGmv)}` : ""}
        </span>
      </label>
      {o?.state === "done" && <p className="text-[var(--text-muted)]">Thực đạt <b className={o.actual >= d.targetGmv ? "text-emerald-400" : "text-rose-400"}>{fmtVndShort(o.actual)}</b>{d.targetGmv > 0 ? ` · ${Math.round((o.actual / d.targetGmv) * 100)}% target` : ""}</p>}
      {targetReason && <p className="text-[11px] text-[var(--text-faint)]">{targetReason}</p>}
      {tLocked && <p className="text-[11px] text-[var(--text-faint)]">{p.isStaffed(d) ? "Đã chốt người: đổi giờ / bỏ ca ở Cửa sổ Ca Live." : "Ca ngày đã qua giữ nguyên giờ như lúc chốt."}</p>}
      {clash && <p className="text-[11px] text-rose-300 font-bold">Trùng phòng với {clash}</p>}
      {d.reason && <p className="text-[11px] text-[var(--text-faint)] leading-snug">{d.reason}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => { commitTarget(); onClose(); }} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold">Xong</button>
        {!tLocked && <button onClick={() => { onClose(); p.onRemove(d.key); }} className="px-3 py-1.5 rounded-lg border border-rose-900 text-rose-400 font-bold hover:bg-rose-950/40">Bỏ ca</button>}
      </div>
    </div>
  );
};
