import { EarlyLeaveReason, LiveSessionReport } from "../types";
import { EARLY_REASON_LABEL, MINUTE_PRESETS, parseCount } from "../lib/handover";

// Phần "Ca này có gì?" của Giao ca — dùng chung cho ca TikTok (sau khi up file) và ca Shopee (sau 3 số). Mặc định là
// "Đúng giờ, không sự cố" (Working File T8–T9: ô sự cố trống 76–100%, không phân biệt được "không có" với "quên ghi").

export type Incident = "ot" | "early" | "restart" | "late";
const INCIDENT_LABEL: Record<Incident, string> = { ot: "OT", early: "Off sớm", restart: "Restart", late: "Host trễ" };

export interface IncidentState {
  on: Incident[];
  otMinutes: number;
  earlyMinutes: number;
  restarts: number;
  /** Lý do off sớm (0180) — Điều Phối Lịch Live tách phần giờ mất vì bán kém khỏi sự cố/người/brand. */
  earlyReason: EarlyLeaveReason | null;
  note: string;
}

export function incidentsFromReport(r: LiveSessionReport | undefined): IncidentState {
  const on: Incident[] = [];
  if (r?.otMinutes) on.push("ot");
  if (r?.earlyLeaveMinutes) on.push("early");
  if (r?.restartCount) on.push("restart");
  if (r?.hostLate) on.push("late");
  return { on, otMinutes: r?.otMinutes || 30, earlyMinutes: r?.earlyLeaveMinutes || 30, restarts: r?.restartCount || 1, earlyReason: r?.earlyLeaveReason ?? null, note: r?.statusNote ?? "" };
}

/** Giá trị gửi RPC: sự cố không chọn thì 0/false dù ô phút còn số cũ. */
export function incidentValues(v: IncidentState) {
  return {
    otMinutes: v.on.includes("ot") ? v.otMinutes : 0,
    earlyLeaveMinutes: v.on.includes("early") ? v.earlyMinutes : 0,
    earlyLeaveReason: v.on.includes("early") ? v.earlyReason : null,
    restartCount: v.on.includes("restart") ? v.restarts : 0,
    hostLate: v.on.includes("late"),
    statusNote: v.note.trim()
  };
}

const smallInput = "w-16 min-h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-mono";

export function HandoverIncidents({ value, onChange, label }: { value: IncidentState; onChange: (v: IncidentState) => void; label?: string }) {
  const toggle = (k: Incident) => onChange({ ...value, on: value.on.includes(k) ? value.on.filter((x) => x !== k) : [...value.on, k] });
  return (
    <div className="space-y-2">
      {label && <p className="block text-xs font-bold text-[var(--text-muted)] mb-1">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={value.on.length === 0}
          onClick={() => onChange({ ...value, on: [] })}
          className={`min-h-9 px-3 rounded-full text-xs font-bold border ${value.on.length === 0 ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)]"}`}
        >
          Đúng giờ, không sự cố
        </button>
        {(Object.keys(INCIDENT_LABEL) as Incident[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.on.includes(k)}
            onClick={() => toggle(k)}
            className={`min-h-9 px-3 rounded-full text-xs font-bold border ${value.on.includes(k) ? "bg-amber-600 text-white border-amber-600" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            {INCIDENT_LABEL[k]}
          </button>
        ))}
      </div>
      {(["ot", "early"] as const).filter((k) => value.on.includes(k)).map((k) => {
        const field = k === "ot" ? "otMinutes" : "earlyMinutes";
        const val = value[field];
        return (
          <div key={k} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold text-[var(--text-muted)] w-14">{INCIDENT_LABEL[k]}</span>
            {MINUTE_PRESETS.map((m) => (
              <button key={m} type="button" onClick={() => onChange({ ...value, [field]: m })} className={`min-h-8 px-2.5 rounded-lg border font-bold ${val === m ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
                {m}p
              </button>
            ))}
            <input aria-label={`${INCIDENT_LABEL[k]} (phút)`} inputMode="numeric" value={String(val)} onChange={(e) => onChange({ ...value, [field]: parseCount(e.target.value) ?? 0 })} className={smallInput} />
            <span className="text-[var(--text-faint)]">phút</span>
          </div>
        );
      })}
      {value.on.includes("early") && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Lý do off sớm">
          <span className="font-bold text-[var(--text-muted)] w-14">Vì sao</span>
          {(Object.keys(EARLY_REASON_LABEL) as EarlyLeaveReason[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={value.earlyReason === k}
              onClick={() => onChange({ ...value, earlyReason: value.earlyReason === k ? null : k })}
              className={`min-h-8 px-2.5 rounded-lg border font-bold ${value.earlyReason === k ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)]"}`}
            >
              {EARLY_REASON_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {value.on.includes("restart") && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-bold text-[var(--text-muted)] w-14">Restart</span>
          <input aria-label="Số lần restart" inputMode="numeric" value={String(value.restarts)} onChange={(e) => onChange({ ...value, restarts: parseCount(e.target.value) ?? 0 })} className={smallInput} />
          <span className="text-[var(--text-faint)]">lần</span>
        </div>
      )}
      <input
        value={value.note}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
        placeholder="Ghi chú (không bắt buộc)"
        className="w-full min-h-10 px-3 py-2 border border-[var(--border)] rounded-xl text-sm text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)] placeholder:font-normal"
      />
    </div>
  );
}
