import React from "react";
import { WAVE_NAME } from "../../lib/performance/channelHealth";
import { Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { eachDay } from "../../lib/dateUtils";
import { pWithAdds, type Candidate, type PlanObjective, type PlannedSession } from "../../lib/performance/controlRoom";
import { ddmm, money, pct } from "../dashboard/shared";
import type { RoomChannel } from "./types";

// Sa bàn: lưới ô ca 3 giờ còn trống (phòng của kênh rảnh + có host và trợ quen kênh rảnh) từ ngày mai tới cuối tháng. Bấm để thử,
// "Tự xếp" chọn N ca tăng nhiều nhất, xác suất từng kênh đổi ngay. "Tạo ca nháp" ghi NHÁP (0170) — OP xác nhận mới thành ca thật.

const STARTS = ["10:00", "14:00", "20:00"];

export const Sandbox: React.FC<{
  month: string;
  today: string;
  channels: RoomChannel[];
  candidates: Candidate[];
  plan: PlannedSession[];
  onToggle: (c: Candidate) => void;
  budget: number;
  onBudget: (n: number) => void;
  objective: PlanObjective;
  onObjective: (o: PlanObjective) => void;
  onAuto: () => void;
  onClear: () => void;
  onCreateDrafts: () => void;
  creating: boolean;
}> = ({ month, today, channels, candidates, plan, onToggle, budget, onBudget, objective, onObjective, onAuto, onClear, onCreateDrafts, creating }) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const from = today >= last ? null : new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8)) + 1)).toISOString().slice(0, 10);
  const days = from && from <= last ? eachDay(from, last) : [];
  const picked = new Set(plan.map((p) => p.candidate.key));
  const byKey = new Map(candidates.map((c) => [`${c.channelKey}|${c.date}|${c.startTime}`, c]));
  if (days.length === 0) return <p className="text-sm text-[var(--text-faint)]">Tháng này đã hết ngày để thêm ca.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]" htmlFor="cr-budget">
          Số ca thêm tối đa
          <input id="cr-budget" type="range" min={1} max={30} value={budget} onChange={(e) => onBudget(Number(e.target.value))} className="accent-[var(--accent)] w-32" />
          <b className="text-[var(--text)] tabular-nums w-6">{budget}</b>
        </label>
        <div className="flex gap-1 rounded-xl border border-[var(--border)] p-1" role="group" aria-label="Mục tiêu tự xếp">
          {([["probability", "Tối đa xác suất về đích"], ["gmv", "Tối đa GMV"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={objective === k} onClick={() => onObjective(k)} className={`px-2.5 py-1 rounded-lg text-xs font-bold min-h-[28px] ${objective === k ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-muted)]"}`}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={onAuto} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-[var(--accent)] text-[var(--accent-contrast)] min-h-[34px]"><Wand2 className="w-4 h-4" />Tự xếp</button>
        <button type="button" onClick={onClear} disabled={plan.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border border-[var(--border)] text-[var(--text-muted)] disabled:opacity-40 min-h-[34px]"><Trash2 className="w-4 h-4" />Xoá hết</button>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="grid gap-[3px] text-[11px]" style={{ gridTemplateColumns: `140px repeat(${days.length}, minmax(26px, 1fr))`, minWidth: 140 + days.length * 29 }}>
          <div />
          {days.map((d) => (
            <div key={d} className={`text-center ${channels[0]?.bucketOf(d) !== "daily" ? "text-amber-400 font-bold" : "text-[var(--text-faint)]"}`}>{Number(d.slice(8))}</div>
          ))}
          {channels.map((c) => (
            <React.Fragment key={c.key}>
              <div className="text-xs font-bold text-[var(--text)] truncate flex items-center" title={c.name}>{c.name}</div>
              {days.map((d) => (
                <div key={d} className="grid gap-[2px]">
                  {STARTS.map((st) => {
                    const cand = byKey.get(`${c.key}|${d}|${st}`);
                    if (!cand) return <span key={st} className="h-4" aria-hidden="true" />;
                    const on = picked.has(cand.key);
                    return (
                      <button
                        key={st}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${c.name} ${ddmm(d)} ${st}`}
                        onClick={() => onToggle(cand)}
                        data-tip={`${c.name} · ${ddmm(d)} ${st}–${cand.endTime} · ${WAVE_NAME[cand.bucket]}\nKỳ vọng ${money(cand.expected)} (đã tính giờ thêm)\nHost rảnh: ${cand.hosts.map((h) => h.name).join(", ")}\nTrợ rảnh: ${cand.assistants.map((a) => a.name).join(", ")}`}
                        className={`h-4 min-h-[16px] rounded-[4px] border ${on ? "bg-amber-400 border-amber-400" : "border-dashed border-amber-400/50 hover:bg-amber-400/20"}`}
                      />
                    );
                  })}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[var(--text-faint)]">Mỗi ngày 3 ô: 10h · 14h · 20h (ca 3 giờ). Ô trống: phòng đã có ca, hoặc không còn host/trợ quen kênh rảnh. Ca thêm tính 0,8 lần kỳ vọng vì giờ thêm thường kém giờ sẵn có; khung 14h ít lịch sử nên cân nhắc trước khi tin.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-[var(--text-faint)] text-left"><th className="py-1.5 pr-2">Kênh</th><th className="py-1.5 pr-2 text-right">Ca thêm</th><th className="py-1.5 pr-2 text-right">GMV thêm</th><th className="py-1.5 text-right">Khả năng về đích</th></tr></thead>
            <tbody>
              {channels.map((c) => {
                const mine = plan.filter((p) => p.candidate.channelKey === c.key).map((p) => p.candidate);
                const r = c.room;
                const after = r ? pWithAdds(r, mine).pHit : null;
                return (
                  <tr key={c.key} className="border-t border-[var(--border)]">
                    <td className="py-1.5 pr-2 text-[var(--text)]">{c.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{mine.length}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{mine.length ? `+${money(mine.reduce((a, x) => a + x.expected, 0))}` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{r?.now.pHit == null ? "—" : <>{pct(r.now.pHit)} → <b className={after != null && after > r.now.pHit + 0.005 ? "text-emerald-400" : "text-[var(--text)]"}>{pct(after)}</b></>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[var(--text-faint)]">Ca đề xuất · host tay nghề cao nhất đang rảnh, trợ ít giờ nhất tháng</span>
            <button type="button" onClick={onCreateDrafts} disabled={plan.length === 0 || creating} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-40 min-h-[34px]">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Tạo {plan.length} ca nháp cho OP
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {plan.length === 0 ? (
              <p className="text-sm text-[var(--text-faint)]">Chưa có ca nào. Bấm "Tự xếp" hoặc bấm ô trên lưới.</p>
            ) : (
              [...plan].sort((a, b) => (a.candidate.date + a.candidate.startTime).localeCompare(b.candidate.date + b.candidate.startTime)).map((p) => (
                <div key={p.candidate.key} className="flex items-start justify-between gap-2 rounded-lg bg-[var(--surface-muted)]/60 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <b className="text-[var(--text)]">{channels.find((c) => c.key === p.candidate.channelKey)?.name} · {ddmm(p.candidate.date)} {p.candidate.startTime}–{p.candidate.endTime}</b>{" "}
                    <span className="text-[var(--text-faint)]">{WAVE_NAME[p.candidate.bucket]}</span>
                    <div className="text-[var(--text-muted)]">{p.host.name} + {p.assistant.name}</div>
                  </div>
                  <span className="tabular-nums text-[var(--text)] whitespace-nowrap">+{money(p.candidate.expected)}</span>
                </div>
              ))
            )}
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">Ca thêm là giờ brand mua thêm (hoặc agency tặng) — bàn với brand trước. Ca nháp chưa giữ phòng, chưa báo ai; OP xác nhận ở khối "Ca nháp chờ xác nhận" mới thành ca thật và tự thành ca tăng cường (không cộng vào target tháng).</p>
        </div>
      </div>
    </div>
  );
};
