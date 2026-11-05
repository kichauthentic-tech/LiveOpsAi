import React from "react";
import { fmtFixed, fmtVndShort } from "../../lib/format";
import type { PersonLoad } from "../../lib/roster/monthPlanner";

// Khối lượng từng host/trợ theo lịch hiện có + nháp (Điều Phối Lịch Live, 01/11): giờ so với tối thiểu (đảm bảo thu nhập) / tối đa.

const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace(".", ",");
const STATUS_TEXT: Record<PersonLoad["status"], string> = { below: "Dưới tối thiểu", ok: "Trong khoảng", over: "Vượt tối đa", idle: "Chưa có ca" };
const STATUS_CLASS: Record<PersonLoad["status"], string> = {
  below: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  ok: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  over: "text-red-300 border-red-500/30 bg-red-500/10",
  idle: "text-[var(--text-faint)] border-[var(--border)]"
};

export const WorkloadTable: React.FC<{ load: readonly PersonLoad[]; nameOf: (id: string) => string; showCost: boolean; maxHeightClass?: string; hideRole?: boolean; emptyText?: string }> = ({ load, nameOf, showCost, maxHeightClass = "max-h-[460px]", hideRole = false, emptyText = "Chưa có ca hay đăng ký nào trong tháng này." }) => {
  const maxScale = Math.max(1, ...load.map((l) => Math.max(l.max, l.hours)));
  const pct = (h: number) => `${(h / maxScale) * 100}%`;
  return (
    <div className={`overflow-auto rounded-xl border border-[var(--border)] ${maxHeightClass}`}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-[var(--surface-base)] text-[var(--text-muted)]">
          <tr>
            <th className="px-3 py-2 text-left font-bold">Người</th>
            <th className="px-3 py-2 text-left font-bold w-[36%]">Giờ trong tháng</th>
            <th className="px-3 py-2 text-right font-bold">Số ca</th>
            <th className="px-3 py-2 text-right font-bold">Đăng ký</th>
            <th className="px-3 py-2 text-right font-bold">Chi phí</th>
            <th className="px-3 py-2 text-right font-bold">Chỉ số</th>
            <th className="px-3 py-2 text-left font-bold">Tình trạng</th>
          </tr>
        </thead>
        <tbody>
          {load.map((l) => {
            const real = Math.max(0, l.fixedHours - l.draftHours);
            const draft = l.draftHours + l.plannedHours;
            return (
              <tr key={l.talentId} className="border-t border-[var(--border)]">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="font-bold text-[var(--text)]">{nameOf(l.talentId)}</span>{!hideRole && <> <span className="text-[var(--text-faint)]">{l.role === "host" ? "Host" : "Trợ"}</span></>}
                </td>
                <td className="px-3 py-1.5">
                  <div className="relative h-2.5 rounded-full bg-[var(--surface-base)] overflow-hidden" title={`${fmtH(l.hours)}h · tối thiểu ${fmtH(l.min)}h · tối đa ${fmtH(l.max)}h`}>
                    <i className="absolute inset-y-0 left-0 bg-[var(--success)]" style={{ width: pct(real) }} />
                    <i className="absolute inset-y-0 bg-[var(--success)] opacity-45" style={{ left: pct(real), width: pct(draft) }} />
                    <i className="absolute inset-y-0 w-px bg-[var(--text)]" style={{ left: pct(l.min) }} />
                  </div>
                  <div className="mt-0.5 tabular-nums text-2xs text-[var(--text-muted)]">
                    {fmtH(l.hours)}h <span className="text-[var(--text-faint)]">· {fmtH(l.min)}–{fmtH(l.max)}h</span>
                    {draft > 0 && <span className="text-[var(--text-faint)]"> · {fmtH(draft)}h nháp</span>}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.shifts}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{l.registered}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{showCost ? (l.costMissing ? "thiếu rate" : fmtVndShort(l.cost)) : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums" title={l.perf ? `${l.perf.n} ca làm căn cứ` : "Chưa có ca host có GMV trong 90 ngày"}>
                  {l.role === "host" ? (l.perf ? `${fmtFixed(l.perf.index, 2)} (${l.perf.n})` : "—") : "—"}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block rounded-md border px-1.5 py-0.5 text-2xs font-bold ${STATUS_CLASS[l.status]}`}>{STATUS_TEXT[l.status]}</span>
                </td>
              </tr>
            );
          })}
          {load.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-3 text-[var(--text-muted)]">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
