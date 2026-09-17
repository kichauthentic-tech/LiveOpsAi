import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Layers, Loader2, X } from "lucide-react";
import { LiveSession, ShiftRegistration, ShiftSlot } from "../types";
import {
  BulkPlanRow,
  hasAnyConflict,
  planBulkFinalize,
  recheckPlan,
  rowsReadyToFinalize
} from "../lib/performance/bulkFinalize";
import { headlineFor } from "../lib/performance/hostSuggestion";

interface BulkFinalizePanelProps {
  slots: ShiftSlot[];
  registrationsBySlot: Map<string, ShiftRegistration[]>;
  sessions: LiveSession[];
  talentNameById: Map<string, string>;
  month: string; // "YYYY-MM"
  today: string;
  perfSince: string;
  onFinalizeSlot: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  onClose: () => void;
}

type RunState =
  | { phase: "editing" }
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; ok: string[]; failed: string[] };

const fmtPerHour = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr/h`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k/h`;
  return `${Math.round(n)}đ/h`;
};

function conflictText(r: BulkPlanRow): string | null {
  const c = r.conflicts;
  const parts: string[] = [];
  if (c.hostExisting) parts.push("host trùng ca đã có");
  if (c.hostInBatch) parts.push("host trùng ca khác trong mẻ này");
  if (c.studioExisting) parts.push("studio trùng ca đã có");
  if (c.studioInBatch) parts.push("studio trùng ca khác trong mẻ này");
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function BulkFinalizePanel({
  slots,
  registrationsBySlot,
  sessions,
  talentNameById,
  month,
  today,
  perfSince,
  onFinalizeSlot,
  onClose
}: BulkFinalizePanelProps) {
  // Lập kế hoạch MỘT LẦN lúc mở panel. Không tính lại theo `sessions` đang đổi: mỗi ca chốt xong
  // là App nạp lại sessions, tính lại giữa chừng sẽ xoá sạch phần ops vừa sửa tay.
  const [rows, setRows] = useState<BulkPlanRow[]>(() =>
    planBulkFinalize(slots, registrationsBySlot, sessions, talentNameById, { month, today, perfSince })
  );
  const [state, setState] = useState<RunState>({ phase: "editing" });

  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const ready = useMemo(() => rowsReadyToFinalize(rows), [rows]);
  const blocked = useMemo(() => rows.filter((r) => r.include && hasAnyConflict(r.conflicts)), [rows]);
  const noCandidate = useMemo(() => rows.filter((r) => r.hostId === ""), [rows]);

  function patch(slotId: string, next: Partial<BulkPlanRow>) {
    // Mọi sửa đổi đều quét lại cả mẻ: đổi 1 dòng có thể giải phóng hoặc gây trùng ở dòng bất kỳ.
    setRows((prev) => recheckPlan(prev.map((r) => (r.slotId === slotId ? { ...r, ...next } : r)), sessions));
  }

  function setAllIncluded(include: boolean) {
    setRows((prev) =>
      recheckPlan(
        prev.map((r) => ({ ...r, include: include ? r.hostId !== "" : false })),
        sessions
      )
    );
  }

  async function run() {
    const batch = rowsReadyToFinalize(rows);
    if (batch.length === 0) return;
    if (
      !window.confirm(
        `Chốt ${batch.length} ca?\n\nMỗi ca sẽ tạo một phiên live thật và gán Host đã chọn. Các dòng đang báo trùng lịch hoặc chưa có Host sẽ được bỏ qua.`
      )
    )
      return;

    setState({ phase: "running", done: 0, total: batch.length });
    const ok: string[] = [];
    const failed: string[] = [];
    // Chạy tuần tự chứ không Promise.all: mỗi lần chốt ghi DB rồi App nạp lại state, bắn song song
    // sẽ đua nhau và ops không biết ca nào hỏng.
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i];
      const slot = slotById.get(r.slotId);
      const label = `${r.date} ${r.startTime} · ${r.brandName}`;
      if (!slot) {
        failed.push(label);
      } else {
        try {
          const done = await onFinalizeSlot(slot, r.hostId, r.coHostId || null);
          (done ? ok : failed).push(label);
        } catch {
          failed.push(label);
        }
      }
      setState({ phase: "running", done: i + 1, total: batch.length });
    }
    setState({ phase: "done", ok, failed });
  }

  if (state.phase === "done") {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Chốt hàng loạt xong
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-base)] text-[var(--text-faint)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-emerald-400 mt-2 font-bold">Đã chốt {state.ok.length} ca.</p>
        {state.failed.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-rose-400 font-bold">{state.failed.length} ca KHÔNG chốt được:</p>
            <ul className="mt-1 space-y-0.5">
              {state.failed.map((f) => (
                <li key={f} className="text-[11px] text-rose-300">· {f}</li>
              ))}
            </ul>
            <p className="text-[10px] text-[var(--text-faint)] mt-1">
              Các ca này vẫn đang mở, chốt lại từng ca ở danh sách bên dưới để xem lỗi cụ thể.
            </p>
          </div>
        )}
      </div>
    );
  }

  const running = state.phase === "running";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" /> Chốt Lịch Hàng Loạt — tháng {month}
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-3xl">
            Mỗi ca được gợi ý Host xếp hạng cao nhất mà <strong>đang rảnh khung giờ đó</strong> — xét cả ca đã có trong hệ thống
            lẫn các ca khác trong chính mẻ này, nên không ai bị xếp 2 ca trùng giờ. Đây chỉ là đề xuất: sửa hoặc bỏ tick dòng nào
            cũng được trước khi chốt.
          </p>
        </div>
        <button onClick={onClose} disabled={running} className="p-1.5 rounded-lg hover:bg-[var(--surface-base)] text-[var(--text-faint)] disabled:opacity-40">
          <X className="w-4 h-4" />
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)] mt-4">
          Không có ca nào để chốt trong tháng này — ca phải đang mở, chưa tới ngày, và có ít nhất 1 người đăng ký.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs text-[var(--text-muted)]">
              <strong className="text-emerald-400">{ready.length}</strong> ca sẵn sàng
              {blocked.length > 0 && <> · <strong className="text-rose-400">{blocked.length}</strong> vướng trùng lịch</>}
              {noCandidate.length > 0 && <> · <strong className="text-amber-400">{noCandidate.length}</strong> không còn ai rảnh</>}
            </span>
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={() => setAllIncluded(true)} disabled={running} className="px-2.5 py-1 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40">
                Tick tất cả
              </button>
              <button onClick={() => setAllIncluded(false)} disabled={running} className="px-2.5 py-1 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40">
                Bỏ tick tất cả
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-[var(--text-faint)] text-left text-[11px]">
                  <th className="font-bold pb-2 pr-2 w-8"></th>
                  <th className="font-bold pb-2 pr-3">Ca</th>
                  <th className="font-bold pb-2 pr-3">Brand</th>
                  <th className="font-bold pb-2 pr-3">Host đề xuất</th>
                  <th className="font-bold pb-2">Trợ live</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const conflict = conflictText(r);
                  const headline = r.hostId ? r.candidates.find((c) => c.talentId === r.hostId) : undefined;
                  const h = headline ? headlineFor(headline) : undefined;
                  return (
                    <tr
                      key={r.slotId}
                      className={`border-t border-[var(--border)]/60 ${conflict && r.include ? "bg-rose-950/20" : ""}`}
                    >
                      <td className="py-2 pr-2 align-top">
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={running || r.hostId === ""}
                          onChange={(e) => patch(r.slotId, { include: e.target.checked })}
                          className="accent-emerald-500 disabled:opacity-30"
                        />
                      </td>
                      <td className="py-2 pr-3 align-top whitespace-nowrap text-[var(--text)]">
                        {r.date}
                        <div className="text-[10px] text-[var(--text-faint)]">
                          {r.startTime}–{r.endTime}
                          {r.studioName && ` · ${r.studioName}`}
                        </div>
                      </td>
                      <td className="py-2 pr-3 align-top text-[var(--text-muted)]">{r.brandName}</td>
                      <td className="py-2 pr-3 align-top">
                        <select
                          value={r.hostId}
                          disabled={running}
                          onChange={(e) => patch(r.slotId, { hostId: e.target.value, coHostId: r.coHostId === e.target.value ? "" : r.coHostId })}
                          className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:border-blue-500 disabled:opacity-50"
                        >
                          <option value="">— chưa chọn —</option>
                          {r.candidates.map((c) => (
                            <option key={c.talentId} value={c.talentId}>{c.name}</option>
                          ))}
                        </select>
                        {h && h.scope !== "none" && (
                          <div className="text-[10px] text-emerald-400 mt-0.5">
                            {fmtPerHour(h.value)} ({h.scope === "brand" ? "brand này" : "chung"}, {h.sessions} ca)
                          </div>
                        )}
                        {r.noFreeCandidate && (
                          <div className="text-[10px] text-amber-400 mt-0.5 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                            Cả {r.candidates.length} người đăng ký đều đã bận khung này
                          </div>
                        )}
                        {conflict && (
                          <div className="text-[10px] text-rose-400 mt-0.5 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                            {conflict}
                          </div>
                        )}
                      </td>
                      <td className="py-2 align-top">
                        <select
                          value={r.coHostId}
                          disabled={running}
                          onChange={(e) => patch(r.slotId, { coHostId: e.target.value })}
                          className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:border-blue-500 disabled:opacity-50"
                        >
                          <option value="">— không —</option>
                          {r.candidates.filter((c) => c.talentId !== r.hostId).map((c) => (
                            <option key={c.talentId} value={c.talentId}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={run}
              disabled={running || ready.length === 0}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {running
                ? `Đang chốt ${state.done}/${state.total}…`
                : `Chốt ${ready.length} ca`}
            </button>
            {blocked.length > 0 && (
              <span className="text-[11px] text-rose-400">
                {blocked.length} dòng đang tick nhưng vướng trùng lịch — sẽ bị bỏ qua, sửa Host hoặc bỏ tick để hết cảnh báo.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
