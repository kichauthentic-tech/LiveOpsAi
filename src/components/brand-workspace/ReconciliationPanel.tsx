import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, Trash2 } from "lucide-react";
import {
  ReconciliationBatch,
  ReconciliationBucket,
  ReconciliationRow,
  applyReconciliation,
  deleteReconciliationBatch,
  fetchReconciliationBatches,
  fetchReconciliationRows,
  setReconciliationBucket
} from "../../lib/db/liveReconciliation";
import { type ReportPlatform } from "../../lib/reportPlatform";
import { errorMessage } from "../../lib/errorMessage";
import { useConfirm } from "../../hooks/useConfirm";
import { fmtPeriodLabel, fmtVndFull } from "../../lib/format";
import { LiveSession } from "../../types";

// Đối soát số liệu của MỘT brand + MỘT sàn, nằm ngay trong Dữ Liệu Gốc (gộp 07/10 — trước đây là màn riêng
// "Đối Soát Số Liệu" bắt up file lần hai). Lô đối soát được tạo từ chính lần up ở Dữ Liệu Gốc (hoặc từ một lần tải đã lưu);
// ở đây chỉ xem rổ khớp + Áp dụng. Logic khớp/chia số vẫn ở RPC import_live_reconciliation / apply_live_reconciliation.

interface Props {
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  /** Ca của brand — chỉ để gắn nhãn ngày + giờ cho ca khớp với từng phiên. */
  sessions: LiveSession[];
  /** Đổi giá trị ⇒ nạp lại danh sách lô (sau khi tạo lô mới từ lần up/lần tải). */
  reloadKey: number;
  onApplied: () => Promise<void> | void;
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

function fmtTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function ReconciliationPanel({ brandId, brandName, platform, sessions, reloadKey, onApplied }: Props) {
  const confirm = useConfirm();
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const sessionLabel = (id: string) => {
    const s = sessionById.get(id);
    return s ? `${s.date.slice(8, 10)}/${s.date.slice(5, 7)} ${s.startTime}–${s.endTime}` : "ca";
  };
  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reloadBatches = useCallback(async (selectId?: string) => {
    const list = await fetchReconciliationBatches(brandId, platform);
    setBatches(list);
    const next = selectId ?? list[0]?.id ?? null;
    setActiveId(next);
    setRows(next ? await fetchReconciliationRows(next) : []);
  }, [brandId, platform]);

  // Mở màn / đổi brand / có lô mới (reloadKey) ⇒ nạp lại, chọn lô mới nhất.
  useEffect(() => {
    let alive = true;
    setBusy(true);
    reloadBatches()
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [reloadBatches, reloadKey]);

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
    <div className="space-y-3">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
        <h4 className="font-bold text-[var(--text)] text-xs">Đối soát số liệu — {brandName}</h4>
        <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-3xl">
          Mỗi lần up file ở dưới tự tạo một lần đối soát: app khớp từng phiên live với ca CÓ SẴN của brand theo giờ, bạn xem rổ rồi bấm Áp dụng để thay số tạm bằng số cuối của sàn.
          Phiên dài chạy xuyên 2 ca (chưa có số lúc giao ca) vẫn chia được cho cả hai ca — chia ước lượng theo thời gian, tổng đúng bằng file.
        </p>

        {batches.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => void run(async () => { setActiveId(b.id); setRows(await fetchReconciliationRows(b.id)); })}
                className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                  b.id === activeId ? "border-[var(--accent)] bg-[var(--surface-elevated)]" : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                <span className="font-bold text-[var(--text)] block truncate max-w-[220px]">{b.periodLabel ? fmtPeriodLabel(b.periodLabel) : b.fileName ?? "Không rõ kỳ"}</span>
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
        <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl p-8 text-center">
          <FileSpreadsheet className="w-6 h-6 text-[var(--text-faint)] mx-auto mb-2" />
          <p className="text-xs text-[var(--text-muted)]">Chưa có lần đối soát nào của brand này. Up file ở trên (hoặc bấm "Đối soát" ở một lần tải trong Lịch Sử Import) để bắt đầu.</p>
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
                      {BUCKET_LABEL[bucket]} · {items.length} phiên · {fmtVndFull(totalGmv)}
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
                        <th className="font-bold pb-1.5 text-right">Ca khớp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 20).map((r) => (
                        <tr key={r.id} className="border-t border-[var(--border)]/60">
                          <td className="py-1.5 pr-3 text-[var(--text-muted)] truncate max-w-[200px]">{r.roomTitle || r.roomId}</td>
                          <td className="py-1.5 pr-3 text-[var(--text-faint)] whitespace-nowrap">
                            {fmtTime(r.startedAt)} → {fmtTime(r.endedAt)}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-bold text-[var(--text)]">{fmtVndFull(r.gmv)}</td>
                          <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{r.orders}</td>
                          <td className="py-1.5 text-right text-[var(--text-muted)]">
                            {r.matchedSessionIds.length === 0 ? "—" : (
                              <span className="inline-flex gap-1 justify-end flex-wrap">
                                {r.matchedSessionIds.map((id) => (
                                  <span key={id} className="inline-flex items-center px-1.5 py-0.5 rounded border border-sky-800 text-sky-300 font-bold whitespace-nowrap">
                                    {sessionLabel(id)}
                                  </span>
                                ))}
                              </span>
                            )}
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

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-[var(--text-muted)] max-w-xl">
              {active.brandId ? (
                <>
                  File {active.platform} của <span className="font-bold">{brandName}</span> — chỉ khớp với ca {active.platform} của brand này. Áp dụng sẽ ghi đè số
                  liệu của các ca thuộc rổ "khớp ca agency" và "cần xem lại", đổi nguồn dữ liệu thành <span className="font-bold">đã đối soát</span>.
                  Chạy lại nhiều lần được — mỗi lần tính lại từ đầu theo file này.
                </>
              ) : (
                <span className="text-amber-300">
                  Lô này nạp khi đối soát còn khớp ca theo giờ với MỌI brand (có thể chia nhầm GMV sang brand khác cùng giờ) — không áp dụng
                  được nữa. Xoá lô rồi tạo lại từ lần tải ở Lịch Sử Import.
                </span>
              )}
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
                disabled={busy || !active.brandId}
                title={active.brandId ? undefined : "Lô nạp trước khi đối soát gắn brand — xoá lô rồi tạo lại từ Lịch Sử Import"}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {active.appliedAt ? "Áp Dụng Lại" : "Áp Dụng Đối Soát"}
              </button>
              <button
                onClick={() => void run(async () => {
                  if (!(await confirm("Xoá lần đối soát này? Số liệu đã ghi vào các ca KHÔNG bị hoàn lại.", { danger: true }))) return;
                  await deleteReconciliationBatch(active.id);
                  await reloadBatches();
                })}
                disabled={busy}
                className="p-1.5 -m-1.5 rounded text-[var(--text-faint)] hover:text-rose-400 disabled:opacity-40 transition-colors"
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
