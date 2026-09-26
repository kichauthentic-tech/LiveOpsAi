import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, Trash2, Upload } from "lucide-react";
import {
  ReconciliationBatch,
  ReconciliationBucket,
  ReconciliationRow,
  applyReconciliation,
  deleteReconciliationBatch,
  fetchReconciliationBatches,
  fetchReconciliationRows,
  importReconciliationFile,
  setReconciliationBucket
} from "../lib/db/liveReconciliation";
import { errorMessage } from "../lib/errorMessage";
import { useConfirm } from "../hooks/useConfirm";

interface LiveReconciliationProps {
  onApplied: () => Promise<void> | void;
  // U7 (audit 2026-09-21): mở Cửa sổ Ca Live của ca khớp với phiên (xem số bị ghi đè ngay tại chỗ).
  onOpenSession?: (sessionId: string) => void;
}

const BUCKET_LABEL: Record<ReconciliationBucket, string> = {
  agency: "Khớp ca agency",
  review: "Cần xem lại — thiếu snapshot ranh giới",
  unassigned: "Chưa gán nhãn",
  inhouse: "Ca inhouse của brand"
};

const BUCKET_HINT: Record<ReconciliationBucket, string> = {
  agency: "Chia chính xác theo ranh giới snapshot mà trợ live đã up lúc giao ca.",
  review: "Có ca trong chuỗi ca nối chưa up snapshot nên mất ranh giới — chỉ chia ước lượng theo thời gian trùng nhau. Nên nhắc trợ up đúng lúc giao ca.",
  unassigned: "Không nằm trong khung giờ ca nào của agency. Không ảnh hưởng số liệu ca, chỉ cần gán nhãn để còn so hiệu suất agency với inhouse.",
  inhouse: "Đã xác nhận là brand tự live, không tính vào ca nào của agency."
};

const BUCKET_TONE: Record<ReconciliationBucket, string> = {
  agency: "border-emerald-800 bg-emerald-950/30",
  review: "border-amber-700 bg-amber-950/30",
  unassigned: "border-[var(--border)] bg-[var(--surface-base)]",
  inhouse: "border-sky-800 bg-sky-950/30"
};

const ORDER: ReconciliationBucket[] = ["agency", "review", "unassigned", "inhouse"];

function fmtVnd(n: number): string {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + "₫";
}

function fmtTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function LiveReconciliation({ onApplied, onOpenSession }: LiveReconciliationProps) {
  const confirm = useConfirm();
  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function reloadBatches(selectId?: string) {
    const list = await fetchReconciliationBatches();
    setBatches(list);
    const next = selectId ?? activeId ?? list[0]?.id ?? null;
    setActiveId(next);
    setRows(next ? await fetchReconciliationRows(next) : []);
  }

  useEffect(() => {
    reloadBatches().catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const active = batches.find((b) => b.id === activeId);
  const grouped = ORDER.map((bucket) => ({
    bucket,
    items: rows.filter((r) => r.bucket === bucket)
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-[var(--text)]">Đối Soát Số Liệu</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1 max-w-2xl">
              TikTok còn cập nhật GMV nhiều giờ sau khi tắt live, nên số chốt lúc giao ca chỉ là tạm tính. Tải lại file{" "}
              <span className="font-bold">Creator-Live-Performance</span> cho cả ngày/tuần/tháng rồi up một lần để chỉnh lại toàn bộ ca trong kỳ.
            </p>
          </div>
          <label className="shrink-0">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void run(async () => { const id = await importReconciliationFile(f); await reloadBatches(id); });
              }}
            />
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              {busy ? "Đang xử lý..." : "Up File Đối Soát"}
            </span>
          </label>
        </div>

        {batches.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => void run(async () => { setActiveId(b.id); setRows(await fetchReconciliationRows(b.id)); })}
                className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                  b.id === activeId ? "border-[var(--accent)] bg-[var(--surface-elevated)]" : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                <span className="font-bold text-[var(--text)] block truncate max-w-[220px]">{b.periodLabel ?? b.fileName ?? "Không rõ kỳ"}</span>
                <span className="text-[11px] text-[var(--text-faint)]">
                  {b.rowCount} phiên · {b.appliedAt ? `đã áp dụng ${fmtTime(b.appliedAt)}` : "chưa áp dụng"}
                </span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-400 flex items-start gap-1.5 mt-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
          </p>
        )}
        {note && (
          <p className="text-xs text-emerald-400 flex items-start gap-1.5 mt-3">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" /> {note}
          </p>
        )}
      </div>

      {!active && !busy && (
        <div className="bg-[var(--surface-card)] border border-dashed border-[var(--border)] rounded-2xl p-8 text-center">
          <FileSpreadsheet className="w-6 h-6 text-[var(--text-faint)] mx-auto mb-2" />
          <p className="text-xs text-[var(--text-muted)]">Chưa có lần đối soát nào. Up file để bắt đầu.</p>
        </div>
      )}

      {active && (
        <div className="space-y-3">
          {grouped.map(({ bucket, items }) => {
            const totalGmv = items.reduce((s, r) => s + r.gmv, 0);
            return (
              <div key={bucket} className={`border rounded-2xl p-4 ${BUCKET_TONE[bucket]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-[var(--text)]">
                      {BUCKET_LABEL[bucket]} · {items.length} phiên · {fmtVnd(totalGmv)}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 max-w-2xl">{BUCKET_HINT[bucket]}</p>
                  </div>
                  {bucket === "unassigned" && (
                    <button
                      onClick={() => void run(async () => {
                        const n = await setReconciliationBucket(active.id, "unassigned", "inhouse");
                        setRows(await fetchReconciliationRows(active.id));
                        setNote(`Đã gán ${n} phiên thành ca inhouse.`);
                      })}
                      disabled={busy}
                      className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-sky-900 hover:bg-sky-800 text-sky-200 disabled:opacity-40 transition-colors"
                    >
                      Toàn bộ rổ này là ca inhouse
                    </button>
                  )}
                  {bucket === "inhouse" && (
                    <button
                      onClick={() => void run(async () => {
                        await setReconciliationBucket(active.id, "inhouse", "unassigned");
                        setRows(await fetchReconciliationRows(active.id));
                      })}
                      disabled={busy}
                      className="shrink-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40"
                    >
                      Bỏ gán nhãn
                    </button>
                  )}
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-[11px] min-w-[520px]">
                    <thead>
                      <tr className="text-[var(--text-faint)] text-left">
                        <th className="font-bold pb-1.5 pr-3">Phiên live</th>
                        <th className="font-bold pb-1.5 pr-3">Thời gian</th>
                        <th className="font-bold pb-1.5 pr-3 text-right">GMV</th>
                        <th className="font-bold pb-1.5 pr-3 text-right">Orders</th>
                        <th className="font-bold pb-1.5 text-right">Số ca khớp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 20).map((r) => (
                        <tr key={r.id} className="border-t border-[var(--border)]/60">
                          <td className="py-1.5 pr-3 text-[var(--text-muted)] truncate max-w-[200px]">{r.roomTitle || r.roomId}</td>
                          <td className="py-1.5 pr-3 text-[var(--text-faint)] whitespace-nowrap">
                            {fmtTime(r.startedAt)} → {fmtTime(r.endedAt)}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-bold text-[var(--text)]">{fmtVnd(r.gmv)}</td>
                          <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{r.orders}</td>
                          <td className="py-1.5 text-right text-[var(--text-muted)]">
                            {r.matchedSessionIds.length === 0 ? "—" : onOpenSession ? (
                              <span className="inline-flex gap-1 justify-end flex-wrap">
                                {r.matchedSessionIds.map((id, i) => (
                                  <button key={id} onClick={() => onOpenSession(id)} className="px-1.5 py-0.5 rounded border border-sky-800 text-sky-300 hover:bg-sky-950 font-bold" title="Mở ca">
                                    ca {i + 1}
                                  </button>
                                ))}
                              </span>
                            ) : r.matchedSessionIds.length}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {items.length > 20 && (
                    <p className="text-[11px] text-[var(--text-faint)] mt-2">… và {items.length - 20} phiên nữa</p>
                  )}
                </div>
              </div>
            );
          })}

          <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-[var(--text-muted)] max-w-xl">
              Áp dụng sẽ ghi đè số liệu của các ca thuộc rổ "khớp ca agency" và "cần xem lại", đổi nguồn dữ liệu thành{" "}
              <span className="font-bold">đã đối soát</span>. Chạy lại nhiều lần được — mỗi lần tính lại từ đầu theo file này.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void run(async () => {
                  if (!(await confirm("Áp dụng đối soát và ghi đè số liệu các ca trong kỳ này?"))) return;
                  const n = await applyReconciliation(active.id);
                  await onApplied();
                  await reloadBatches(active.id);
                  setNote(`Đã cập nhật ${n} ca theo số liệu đối soát.`);
                })}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {active.appliedAt ? "Áp Dụng Lại" : "Áp Dụng Đối Soát"}
              </button>
              <button
                onClick={() => void run(async () => {
                  if (!(await confirm("Xoá lần đối soát này? Số liệu đã ghi vào các ca KHÔNG bị hoàn lại.", { danger: true }))) return;
                  await deleteReconciliationBatch(active.id);
                  setActiveId(null);
                  await reloadBatches();
                })}
                disabled={busy}
                className="text-[var(--text-faint)] hover:text-rose-400 disabled:opacity-40 transition-colors"
                title="Xoá lần đối soát này"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
