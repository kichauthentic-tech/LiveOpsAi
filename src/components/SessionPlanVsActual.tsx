import { FormEvent, useState } from "react";
import { Pencil } from "lucide-react";
import { LiveSession } from "../types";
import { fmtVndShort } from "../lib/format";
import { fmtCount, parseCount } from "../lib/handover";
import { setSessionActuals } from "../lib/db/sessions";
import { errorMessage } from "../lib/errorMessage";
import { metricHint } from "../lib/metricGlossary";

// "Kế hoạch vs thực tế" của Cửa sổ Ca Live: hai cột — Kế hoạch (giờ ca, target từ Kế Hoạch Tháng) và Thực tế (giờ live thật,
// GMV). Thực tế có hai đường vào: up file (Creator-Live-Performance / Live List / giao ca) tự ghi đè, hoặc ops gõ tay khi
// ca chưa có file (RPC set_session_actuals, 0152). Ca đã có số từ file thì ô nhập tay ẩn — file là bằng chứng.

interface Props {
  session: LiveSession;
  planHours: number;
  liveHours: number;
  /** Brand chưa được xem số (tháng chưa phát hành Report). */
  hideMetrics: boolean;
  isBrandView: boolean;
  /** Ops + ca chưa có số từ file/giao ca/đối soát + chưa huỷ. */
  canEnter: boolean;
  onSaved: (updated: LiveSession) => void;
}

const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "");
const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const fmtHours = (h: number) => (h > 0 ? `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h` : "—");
const fmtPct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;

const inputCls = "w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs";

export function SessionPlanVsActual({ session: s, planHours, liveHours, hideMetrics, isBrandView, canEnter, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gmv, setGmv] = useState("");
  const [liveStart, setLiveStart] = useState("");
  const [liveEnd, setLiveEnd] = useState("");

  const hasActualTime = !!s.actualStartAt && !!s.actualEndAt;
  const actualGmv = s.actualGmv ?? 0;
  const gmvPerHour = liveHours > 0 ? actualGmv / liveHours : planHours > 0 ? actualGmv / planHours : 0;
  const planGmvPerHour = s.targetGmv > 0 && planHours > 0 ? s.targetGmv / planHours : 0;

  const open = () => {
    setGmv(actualGmv > 0 ? fmtCount(actualGmv) : "");
    setLiveStart(hasActualTime ? clock(s.actualStartAt) : s.startTime);
    setLiveEnd(hasActualTime ? clock(s.actualEndAt) : s.endTime);
    setError(null);
    setEditing(true);
  };

  const gmvValue = gmv.trim() === "" ? 0 : parseCount(gmv);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (gmvValue == null) { setError("GMV chưa đúng — gõ số, không có chữ."); return; }
    setSaving(true);
    setError(null);
    try {
      onSaved(await setSessionActuals(s.id, { gmv: gmvValue, liveStart: liveStart || undefined, liveEnd: liveEnd || undefined }));
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const muted = "text-[var(--text-faint)] font-normal italic";
  const cell = "px-2.5 py-2 text-xs font-bold text-[var(--text)]";
  const label = "px-2.5 py-2 text-[11px] text-[var(--text-faint)]";
  const row = "grid grid-cols-[84px_1fr_1fr] items-baseline border-t border-[var(--border)] first:border-t-0";

  const none = (text: string) => <span className={muted}>{text}</span>;

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold">Kế hoạch vs thực tế</h4>
        {canEnter && !editing && !hideMetrics && (
          <button type="button" onClick={open} className="text-[11px] font-bold text-[var(--accent-text)] px-2 py-1 rounded-lg border border-[var(--accent)]/40 flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Nhập tay thực tế
          </button>
        )}
      </div>

      <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="grid grid-cols-[84px_1fr_1fr] bg-[var(--surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <span className="px-2.5 py-1.5" />
          <span className="px-2.5 py-1.5">Kế hoạch</span>
          <span className="px-2.5 py-1.5">Thực tế</span>
        </div>

        <div className={row}>
          <span className={label}>Giờ live</span>
          <span className={cell}>{s.startTime}–{s.endTime} ({fmtHours(planHours)})</span>
          <span className={cell}>
            {hideMetrics ? none("chưa phát hành") : hasActualTime ? `${fmtTime(s.actualStartAt)}–${fmtTime(s.actualEndAt)} (${fmtHours(liveHours)})` : none("chưa có")}
          </span>
        </div>

        {/* Brand không thấy target — ô Kế hoạch của hai dòng dưới để trống, không ẩn cả dòng để cột Thực tế vẫn thẳng hàng. */}
        <div className={row}>
          <span className={label} title={metricHint("GMV")}>GMV</span>
          <span className={cell}>
            {isBrandView ? none("—") : s.targetGmv > 0 ? <>{fmtVndShort(s.targetGmv)}<span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">target</span></> : none("chưa có target")}
          </span>
          <span className={`${cell} ${!hideMetrics && actualGmv > 0 ? "!text-[var(--success)]" : ""}`}>
            {hideMetrics ? none("chưa phát hành") : actualGmv > 0 ? fmtVndShort(actualGmv) : none("—")}
            {!hideMetrics && !isBrandView && s.targetGmv > 0 && actualGmv > 0 && (
              <span className="ml-1.5 text-[11px] font-bold text-[var(--text-muted)]">· {fmtPct((actualGmv / s.targetGmv) * 100)} target</span>
            )}
          </span>
        </div>

        <div className={row}>
          <span className={label} title={metricHint("GMV/giờ")}>GMV/giờ</span>
          <span className={cell}>{isBrandView || planGmvPerHour <= 0 ? none("—") : fmtVndShort(planGmvPerHour)}</span>
          <span className={cell}>{hideMetrics ? none("chưa phát hành") : gmvPerHour > 0 ? fmtVndShort(gmvPerHour) : none("—")}</span>
        </div>
      </div>

      {editing && (
        <form onSubmit={submit} className="mt-2 space-y-2 text-xs bg-[var(--surface-base)] p-3 rounded-xl border border-[var(--border)]">
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="font-bold text-[var(--text-muted)] block mb-1">Live từ</span>
              <input type="time" value={liveStart} onChange={(e) => setLiveStart(e.target.value)} className={`${inputCls} font-mono`} />
            </label>
            <label className="block">
              <span className="font-bold text-[var(--text-muted)] block mb-1">Live đến</span>
              <input type="time" value={liveEnd} onChange={(e) => setLiveEnd(e.target.value)} className={`${inputCls} font-mono`} />
            </label>
            <label className="block">
              <span className="font-bold text-[var(--text-muted)] block mb-1">GMV (đồng)</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                value={gmv}
                onChange={(e) => setGmv(e.target.value)}
                onBlur={() => setGmv(gmv.trim() === "" ? "" : fmtCount(parseCount(gmv)))}
                placeholder="0"
                className={`${inputCls} font-mono tabular-nums`}
              />
            </label>
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">
            Số gõ tay là tạm tính. Khi up file số liệu (Creator-Live-Performance / Live List) hoặc giao ca, số trong file tự thay các ô này. Giờ live để trống nếu chưa biết.
          </p>
          {error && <p className="text-[11px] text-rose-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-[11px]">Huỷ</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px]">{saving ? "Đang lưu..." : "Lưu thực tế"}</button>
          </div>
        </form>
      )}

      {hideMetrics ? (
        <p className="mt-2 text-[11px] text-[var(--text-faint)] italic">Số liệu tháng {s.date.slice(0, 7)} sẽ hiện tại đây sau khi Report Tháng được phát hành.</p>
      ) : (
        !isBrandView && !editing && (
          <p className="mt-2 text-[11px] text-[var(--text-faint)]">
            {canEnter ? "Cột Thực tế tự cập nhật khi up file số liệu; chưa có file thì nhập tay." : "Cột Thực tế lấy từ file số liệu / giao ca / đối soát."}
          </p>
        )
      )}
    </section>
  );
}
