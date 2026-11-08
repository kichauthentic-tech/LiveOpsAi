import { platformText } from "../lib/metricGlossary";
import { FormEvent, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { LiveSession } from "../types";
import { fmtVndShort } from "../lib/format";
import { fmtCount, parseCount } from "../lib/handover";
import { setSessionActuals } from "../lib/db/sessions";
import { fetchSnapshotAutoSplit } from "../lib/db/sessionLiveSnapshots";
import { isHandoverFile } from "../lib/dataSource";
import { errorMessage } from "../lib/errorMessage";
import { metricHint } from "../lib/metricGlossary";
import { platformOf } from "../lib/reportPlatform";

// Kết quả ca ở đầu Cửa sổ Ca Live (trước 08/11 là bảng "Kế hoạch vs thực tế"): GMV thực tế so với target từ Kế Hoạch Tháng, giờ live
// và GMV/giờ thực tế / kế hoạch. Thực tế có hai đường vào: up file (Creator-Live-Performance / Live List / giao ca) tự ghi đè, hoặc ops gõ tay khi
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
const fmtPct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: n < 10 ? 1 : 0 })}%`;

const inputCls = "w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs";

export function SessionPlanVsActual({ session: s, planHours, liveHours, hideMetrics, isBrandView, canEnter, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gmv, setGmv] = useState("");
  const [liveStart, setLiveStart] = useState("");
  const [liveEnd, setLiveEnd] = useState("");

  // 0203: file giao ca tải trễ khi room còn live sang ca nối ⇒ số đang chia tạm theo giờ — cột Thực tế ghi "≈".
  const [splitFor, setSplitFor] = useState<string | null>(null);
  const splitEligible = isHandoverFile(s) && !hideMetrics;
  useEffect(() => {
    if (!splitEligible) return;
    let alive = true;
    const key = `${s.id}:${s.actualGmv ?? 0}`;
    fetchSnapshotAutoSplit(s.id).then((v) => { if (alive) setSplitFor(v ? key : null); }).catch(() => undefined);
    return () => { alive = false; };
  }, [s.id, s.actualGmv, splitEligible]);
  const splitEstimate = splitEligible && splitFor === `${s.id}:${s.actualGmv ?? 0}`;

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
    if (gmvValue == null) { setError(`${platformText("GMV", platformOf(s))} chưa đúng — gõ số, không có chữ.`); return; }
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

  // Bố cục 08/11 (cửa sổ ca gọn, user duyệt demo): bảng 3 dòng Kế hoạch | Thực tế thành MỘT số GMV to + thanh % target, giờ live và
  // GMV/giờ là hai ô nhỏ "thực tế / kế hoạch". Bỏ câu chú thích nguồn số dưới bảng (nguồn số nằm ở "Chi tiết" của cửa sổ ca).
  const gmvLabel = platformText("GMV", platformOf(s));
  const showTarget = !isBrandView && s.targetGmv > 0;
  const pct = showTarget && actualGmv > 0 ? (actualGmv / s.targetGmv) * 100 : null;
  const tone = pct == null ? "" : pct >= 100 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
  const sub = "text-2xs font-normal text-[var(--text-faint)]";

  return (
    <section className="space-y-2">
      {hideMetrics ? (
        <p className="text-xs text-[var(--text-faint)] italic">Số liệu tháng {s.date.slice(0, 7)} sẽ hiện tại đây sau khi Report Tháng được phát hành.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-2xs text-[var(--text-muted)]" title={metricHint(gmvLabel)}>{gmvLabel}</p>
              <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                <span className={`text-3xl font-black leading-tight ${actualGmv > 0 ? "text-[var(--text)]" : "text-[var(--text-faint)]"}`}>
                  {actualGmv > 0 ? `${splitEstimate ? "≈ " : ""}${fmtVndShort(actualGmv)}` : "—"}
                </span>
                {pct != null && <span className="text-sm font-black" style={{ color: tone }}>{fmtPct(pct)}</span>}
                {showTarget ? (
                  <span className="text-xs text-[var(--text-muted)]" title={s.boostTarget ? "Ca tăng cường: target đề xuất, không thuộc target tháng" : undefined}>
                    {s.boostTarget ? "target đề xuất" : "target"} {fmtVndShort(s.targetGmv)}
                  </span>
                ) : (
                  !isBrandView && <span className="text-xs text-[var(--text-faint)]">chưa có target</span>
                )}
              </p>
            </div>
            {canEnter && !editing && (
              <button type="button" onClick={open} className="shrink-0 text-2xs font-bold text-[var(--accent-text)] px-2 py-1 rounded-lg border border-[var(--accent)]/40 flex items-center gap-1">
                <Pencil className="w-3 h-3" /> Nhập tay thực tế
              </button>
            )}
          </div>
          {pct != null && (
            <div className="h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="% target">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(2, pct))}%`, background: tone }} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 tabular-nums">
            <div className="rounded-lg bg-[var(--surface-elevated)] px-2.5 py-1.5 min-w-0">
              <p className="text-2xs text-[var(--text-muted)]">Giờ live</p>
              <p className="text-sm font-black text-[var(--text)]">
                {hasActualTime ? fmtHours(liveHours) : "—"} <span className={sub}>/ {fmtHours(planHours)}</span>
              </p>
              <p className={`${sub} truncate`}>{hasActualTime ? `${fmtTime(s.actualStartAt)}–${fmtTime(s.actualEndAt)}` : `${s.startTime}–${s.endTime}`}</p>
            </div>
            <div className="rounded-lg bg-[var(--surface-elevated)] px-2.5 py-1.5 min-w-0">
              <p className="text-2xs text-[var(--text-muted)]" title={metricHint(platformText("GMV/giờ", platformOf(s)))}>{platformText("GMV/giờ", platformOf(s))}</p>
              <p className="text-sm font-black text-[var(--text)]">
                {gmvPerHour > 0 ? fmtVndShort(gmvPerHour) : "—"}
                {!isBrandView && planGmvPerHour > 0 && <span className={sub}> / {fmtVndShort(planGmvPerHour)}</span>}
              </p>
              <p className={sub}>{!isBrandView && planGmvPerHour > 0 ? "thực tế / kế hoạch" : "\u00a0"}</p>
            </div>
          </div>
          {splitEstimate && !isBrandView && (
            <p className="text-2xs text-amber-300">≈ File tải trễ khi room còn live: số chia tạm theo giờ tới giờ hết ca — gõ số đúng ở bước tải file hoặc chờ đối soát.</p>
          )}
        </>
      )}

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
              <span className="font-bold text-[var(--text-muted)] block mb-1">{platformText("GMV", platformOf(s))} (đồng)</span>
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
          <p className="text-2xs text-[var(--text-faint)]">
            Số gõ tay là tạm tính. Khi tải lên file số liệu (Creator-Live-Performance / Live List) hoặc giao ca, số trong file tự thay các ô này. Giờ live để trống nếu chưa biết.
          </p>
          {error && <p className="text-2xs text-rose-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-2xs">Huỷ</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-2xs">{saving ? "Đang lưu..." : "Lưu thực tế"}</button>
          </div>
        </form>
      )}

    </section>
  );
}
