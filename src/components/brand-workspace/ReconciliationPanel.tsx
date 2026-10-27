import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, Trash2 } from "lucide-react";
import {
  ReconciliationBatch,
  ReconciliationBucket,
  ReconciliationRow,
  ReconShare,
  applyReconciliation,
  deleteReconciliationBatch,
  fetchReconciliationBatches,
  fetchReconciliationPreview,
  setReconGmvOverride,
  fetchReconciliationRows,
  mergeReconciliationRows,
  setReconciliationBucket,
  setReconciliationRowsExcluded
} from "../../lib/db/liveReconciliation";
import { type ReportPlatform } from "../../lib/reportPlatform";
import { errorMessage } from "../../lib/errorMessage";
import { useConfirm } from "../../hooks/useConfirm";
import { fmtPeriodLabel, fmtVndFull, fmtVndShort } from "../../lib/format";
import { LiveSession } from "../../types";
import { suggestMergeGroups } from "../../lib/reconciliation/mergeRestarts";
import { checkReconGroups, type CheckKind } from "../../lib/reconciliation/groupCheck";
import { GmvEditor } from "../GmvEditor";

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

// Chỉ hai rổ này được ghi vào ca khi Áp dụng — nên chỉ ở đây mới chọn phiên nào đối soát.
const APPLIED_BUCKETS: ReconciliationBucket[] = ["agency", "review"];

const METHOD_TITLE: Record<ReconShare["method"], string> = {
  whole: "Cả phiên thuộc ca này",
  snapshot: "Theo snapshot lúc giao ca",
  time: "Có phần ước lượng theo giờ — thiếu snapshot hoặc tải lên trễ",
  manual: "GMV gõ tay — phần còn lại của phiên chia cho các ca kia"
};

const ISSUE_TITLE: Record<CheckKind, string> = {
  sum_mismatch: "Tổng lệch file",
  chip_stale: "Số trên ca lệch",
  outside_shift: "Ngoài khung ca",
  gap: "Ca nối bị hở",
  no_room: "Ca không có phiên"
};

function fmtTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function ReconciliationPanel({ brandId, brandName, platform, sessions, reloadKey, onApplied }: Props) {
  const confirm = useConfirm();
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const sessionLabel = (id: string) => {
    const s = sessionById.get(id);
    // Không thấy trong danh sách = ca đã loại khỏi report (vd mảnh restart 2 phút của ca nạp bù) hoặc đã xoá.
    return s ? `${s.date.slice(8, 10)}/${s.date.slice(5, 7)} ${s.startTime}–${s.endTime}` : "ca ẩn";
  };
  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Nhóm gộp restart đang bị bỏ tick (mặc định gợi ý nào cũng được tick); khoá theo id dòng đầu của nhóm.
  const [mergeOff, setMergeOff] = useState<Set<string>>(new Set());
  // Bản chia Áp dụng sẽ ghi (0171), theo dòng. null = DB chưa có 0171 ⇒ màn như cũ.
  const [preview, setPreview] = useState<Map<string, ReconShare[]> | null>(null);
  // Ô ca đang gõ GMV tay (0174) + bộ đếm để nạp lại bản chia sau khi lưu.
  const [editing, setEditing] = useState<{ rowId: string; sessionId: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const reloadBatches = useCallback(async (selectId?: string) => {
    const list = await fetchReconciliationBatches(brandId, platform);
    setBatches(list);
    const next = selectId ?? list[0]?.id ?? null;
    setActiveId(next);
    setRows(next ? await fetchReconciliationRows(next) : []);
  }, [brandId, platform]);

  // Số phiên của lô đổi sau khi gộp — nạp lại danh sách lô nhưng giữ lô đang xem.
  const reloadBatchList = useCallback(async () => {
    setBatches(await fetchReconciliationBatches(brandId, platform));
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

  // Gộp dòng / Áp dụng / đổi lô đều nạp lại rows ⇒ tính lại bản chia (snapshot up sau cũng hiện ra ở đây).
  const appliedAt = batches.find((b) => b.id === activeId)?.appliedAt;
  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    fetchReconciliationPreview(activeId)
      .then((list) => {
        if (!alive) return;
        if (!list) { setPreview(null); return; }
        const byRow = new Map<string, ReconShare[]>();
        for (const sh of list) byRow.set(sh.rowId, [...(byRow.get(sh.rowId) ?? []), sh]);
        setPreview(byRow);
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => { alive = false; };
  }, [activeId, rows.length, appliedAt, previewKey]);

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

  // Gõ / bỏ GMV tay của một ca trong phiên khớp nhiều ca; lưu xong nạp lại bản chia.
  async function saveOverride(rowId: string, sessionId: string, gmv: number | null) {
    await run(async () => {
      await setReconGmvOverride(rowId, sessionId, gmv);
      setEditing(null);
      setPreviewKey((k) => k + 1);
      setNote(gmv == null ? "Đã bỏ số gõ tay — ca quay về cách chia tự động." : "Đã lưu GMV gõ tay. Lô đã áp dụng thì bấm Áp Dụng Lại để ghi vào ca.");
    });
  }

  // Chọn / bỏ chọn phiên: cập nhật ngay trên màn rồi mới ghi DB; ghi lỗi thì nạp lại để màn khớp DB.
  async function setExcluded(ids: string[], excluded: boolean) {
    if (!activeId || ids.length === 0) return;
    const idSet = new Set(ids);
    setRows((prev) => prev.map((r) => (idSet.has(r.id) ? { ...r, excluded } : r)));
    setError(null);
    setNote(null);
    try {
      await setReconciliationRowsExcluded(activeId, ids, excluded);
    } catch (e) {
      setError(errorMessage(e));
      setRows(await fetchReconciliationRows(activeId));
    }
  }

  const active = batches.find((b) => b.id === activeId);
  const mergeGroups = useMemo(() => suggestMergeGroups(rows), [rows]);
  const mergePicked = mergeGroups.filter((g) => !mergeOff.has(g.ids[0]));
  const applicable = rows.filter((r) => APPLIED_BUCKETS.includes(r.bucket));
  const selectedCount = applicable.filter((r) => !r.excluded).length;
  // Kiểm tra theo nhóm liên thông (ca nối / restart / ngắt dùng chung một phép kiểm): tổng ca = tổng phiên trong file, số trên ca = số đúng
  // theo file (ca mà lần đối soát gần nhất là lô này — lô cũ ghi sau lô mới sẽ đè số mới, đo 13/10), phiên ngoài khung ca, ca không có phiên.
  const check = useMemo(() => checkReconGroups({
    rows,
    shares: preview,
    sessions,
    appliedAt,
    periodStart: active?.periodStart,
    periodEnd: active?.periodEnd,
    batchCreatedAt: active?.createdAt,
    appliedBuckets: APPLIED_BUCKETS
  }), [rows, preview, sessions, appliedAt, active]);
  const staleSessions = check.issues.filter((i) => i.kind === "chip_stale").length;
  const issueSessionIds = useMemo(() => new Set(check.issues.map((i) => i.sessionId).filter((x): x is string => !!x)), [check]);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const ISSUES_SHOWN = 12;

  const [view, setView] = useState<"ketqua" | "cancheck">("ketqua");
  const attention = check.counts.canCheck + mergeGroups.length;
  const listed = applicable.slice().sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  const listedPicked = listed.filter((r) => !r.excluded);
  const listedGmv = listedPicked.reduce((s, r) => s + r.gmv, 0);
  const otherRows = rows.filter((r) => !APPLIED_BUCKETS.includes(r.bucket));
  const unassignedRows = otherRows.filter((r) => r.bucket === "unassigned");
  const inhouseRows = otherRows.filter((r) => r.bucket === "inhouse");

  // Ô ca khớp của một phiên: ≈ ước tính theo giờ, ✎ gõ tay, viền đỏ = ca đang có lỗi ở "Cần check".
  const sessionChips = (r: ReconciliationRow) => {
    if (r.matchedSessionIds.length === 0) return "—";
    return (
      <span className="inline-flex gap-1 justify-end flex-wrap">
        {r.matchedSessionIds.map((id) => {
          const sh = preview?.get(r.id)?.find((x) => x.sessionId === id);
          const est = sh?.method === "time";
          const typed = sh?.method === "manual";
          const flagged = issueSessionIds.has(id);
          // Gõ tay chỉ có nghĩa khi phiên chia cho ≥ 2 ca (1 ca thì nhận trọn số file).
          const editable = !!sh && APPLIED_BUCKETS.includes(r.bucket) && (preview?.get(r.id)?.length ?? 0) > 1;
          if (editing?.rowId === r.id && editing.sessionId === id) {
            return (
              <span key={id} className="inline-flex items-center gap-1 whitespace-nowrap">
                <span className="text-sky-300 font-bold">{sessionLabel(id)}</span>
                <GmvEditor initial={sh?.gmv} busy={busy} onSave={(v) => void saveOverride(r.id, id, v)} onCancel={() => setEditing(null)} />
                {typed && (
                  <button onClick={() => void saveOverride(r.id, id, null)} disabled={busy} className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text)] underline disabled:opacity-40">
                    Bỏ số gõ
                  </button>
                )}
              </span>
            );
          }
          const Tag = editable ? "button" : "span";
          return (
            <Tag
              key={id}
              onClick={editable ? () => setEditing({ rowId: r.id, sessionId: id }) : undefined}
              disabled={editable ? busy : undefined}
              title={sh ? `${METHOD_TITLE[sh.method]} · ${fmtVndFull(sh.gmv)}${editable ? " · bấm để gõ GMV đúng của ca" : ""}` : undefined}
              className={`inline-flex items-center px-1.5 py-0.5 rounded border font-bold whitespace-nowrap ${
                flagged ? "border-rose-500 text-rose-300"
                  : typed ? "border-violet-500 text-violet-300"
                  : est ? "border-dashed border-amber-600 text-amber-300" : "border-sky-800 text-sky-300"
              } ${editable ? "hover:bg-[var(--surface-hover)] cursor-pointer" : ""}`}
            >
              {sessionLabel(id)}
              {sh && <span className="ml-1 font-normal">· {typed ? "✎ " : est ? "≈" : ""}{fmtVndShort(sh.gmv)}</span>}
            </Tag>
          );
        })}
      </span>
    );
  };

  const roomTable = (items: ReconciliationRow[], selectable: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] min-w-[520px]">
        <thead>
          <tr className="text-[var(--text-faint)] text-left">
            {selectable && <th className="font-bold pb-1.5 pr-2 w-6" aria-label="Đối soát phiên này" />}
            <th className="font-bold pb-1.5 pr-3">Phiên live</th>
            <th className="font-bold pb-1.5 pr-3">Thời gian</th>
            <th className="font-bold pb-1.5 pr-3 text-right">GMV</th>
            <th className="font-bold pb-1.5 pr-3 text-right">Orders</th>
            <th className="font-bold pb-1.5 text-right">Ca khớp</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className={`border-t border-[var(--border)]/60 ${r.excluded ? "opacity-50" : ""}`}>
              {selectable && (
                <td className="py-1.5 pr-2">
                  <input
                    type="checkbox"
                    checked={!r.excluded}
                    onChange={(e) => void setExcluded([r.id], !e.target.checked)}
                    disabled={busy}
                    aria-label={`Đối soát phiên ${r.roomTitle || r.roomId} ${fmtTime(r.startedAt)}`}
                    className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                  />
                </td>
              )}
              <td className="py-1.5 pr-3 text-[var(--text-muted)] truncate max-w-[200px]">{r.roomTitle || r.roomId}</td>
              <td className="py-1.5 pr-3 text-[var(--text-faint)] whitespace-nowrap">{fmtTime(r.startedAt)} → {fmtTime(r.endedAt)}</td>
              <td className="py-1.5 pr-3 text-right font-bold text-[var(--text)]">{fmtVndFull(r.gmv)}</td>
              <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{r.orders}</td>
              <td className="py-1.5 text-right text-[var(--text-muted)]">{sessionChips(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
        <h4 className="font-bold text-[var(--text)] text-xs">Đối soát số liệu — {brandName}</h4>
        <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-3xl">
          Mỗi file tải lên tạo một lần đối soát: số của từng ca phải khớp file {platform}. Phiên chạy qua nhiều ca chia theo snapshot, chưa có thì chia theo giờ (≈) — tổng luôn bằng file.
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
        {staleSessions > 0 && (
          <p className="text-xs text-amber-300 flex items-start gap-1.5 mt-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {staleSessions} ca đang khác bản chia mới (lệch quá 1%) — bấm Áp Dụng Lại để cập nhật.
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
          <p className="text-xs text-[var(--text-muted)]">Chưa có lần đối soát nào của brand này. Tải lên file ở trên (hoặc bấm "Đối soát" ở một lần tải trong Lịch Sử Import) để bắt đầu.</p>
        </div>
      )}

      {active && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5" role="tablist">
              <button role="tab" aria-selected={view === "ketqua"} onClick={() => setView("ketqua")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${view === "ketqua" ? "seg-on" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"}`}>
                Kết quả
              </button>
              <button role="tab" aria-selected={view === "cancheck"} onClick={() => setView("cancheck")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${view === "cancheck" ? "seg-on" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"}`}>
                Cần check{attention > 0 && <span className="ml-1.5 px-1.5 rounded-full bg-rose-600 text-white">{attention}</span>}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void run(async () => {
                  const skipped = applicable.length - selectedCount;
                  if (selectedCount === 0) throw new Error("Chưa chọn phiên nào để đối soát — chọn ít nhất một phiên.");
                  const ask = skipped > 0
                    ? `Áp dụng đối soát ${selectedCount} phiên đã chọn (bỏ qua ${skipped} phiên) và ghi đè số liệu các ca khớp?`
                    : "Áp dụng đối soát và ghi đè số liệu các ca trong kỳ này?";
                  if (!(await confirm(ask))) return;
                  const n = await applyReconciliation(active.id);
                  await onApplied();
                  await reloadBatches(active.id);
                  setNote(`Đã cập nhật ${n} ca theo số liệu đối soát.`);
                })}
                disabled={busy || !active.brandId || selectedCount === 0}
                title={active.brandId ? "Ghi đè số các ca khớp bằng số file; chạy lại nhiều lần được, mỗi lần tính lại từ file" : "Lô nạp trước khi đối soát gắn brand — xoá lô rồi tạo lại từ Lịch Sử Import"}
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
          {!active.brandId && (
            <p className="text-[11px] text-amber-300">
              Lô này nạp khi đối soát còn khớp ca theo giờ với MỌI brand — không áp dụng được nữa. Xoá lô rồi tạo lại từ lần tải ở Lịch Sử Import.
            </p>
          )}

          {view === "ketqua" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-1 rounded-lg border border-emerald-800 text-emerald-300">Chuẩn · {check.counts.chuan} nhóm · {fmtVndShort(check.gmv.chuan)}</span>
                <span className="px-2 py-1 rounded-lg border border-dashed border-amber-600 text-amber-300" title="Phiên chạy qua nhiều ca, chưa có snapshot lúc hết ca nên chia theo giờ. Tổng vẫn đúng file.">Ước tính theo giờ · {check.counts.uocTinh} nhóm · {fmtVndShort(check.gmv.uocTinh)}</span>
                <button onClick={() => setView("cancheck")} className={`px-2 py-1 rounded-lg border ${attention > 0 ? "border-rose-500 text-rose-300" : "border-[var(--border)] text-[var(--text-faint)]"}`}>Cần check · {attention}</button>
              </div>

              <div className="border border-[var(--border)] bg-[var(--surface)] rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-black text-[var(--text)]">
                    Phiên khớp ca · đối soát {listedPicked.length}/{listed.length} · {fmtVndFull(listedGmv)}
                    {listedPicked.length < listed.length && <span className="text-amber-300 font-normal"> · phiên bỏ chọn giữ nguyên số hiện có</span>}
                  </p>
                  <div className="flex items-center gap-3 text-[11px]">
                    <button onClick={() => void setExcluded(listed.filter((r) => r.excluded).map((r) => r.id), false)} disabled={busy || listedPicked.length === listed.length} className="font-bold text-emerald-300 hover:text-emerald-200 underline disabled:opacity-40 disabled:no-underline">
                      Chọn tất cả
                    </button>
                    <button onClick={() => void setExcluded(listedPicked.map((r) => r.id), true)} disabled={busy || listedPicked.length === 0} className="text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40 disabled:no-underline">
                      Bỏ chọn tất cả
                    </button>
                  </div>
                </div>
                {listed.length > 0 ? roomTable(listed, true) : <p className="text-[11px] text-[var(--text-faint)]">Không phiên nào khớp ca.</p>}
                <p className="text-[11px] text-[var(--text-faint)] mt-2">Biết số đúng của một ca trong phiên nhiều ca? Bấm vào ô ca để gõ (✎): phần còn lại tự chia cho các ca kia.</p>
              </div>

              {(unassignedRows.length > 0 || inhouseRows.length > 0) && (
                <details className="border border-[var(--border)] bg-[var(--surface-base)] rounded-2xl p-4">
                  <summary className="text-xs font-black text-[var(--text)] cursor-pointer">
                    Phiên ngoài lịch ca · {unassignedRows.length + inhouseRows.length} phiên · {fmtVndFull(otherRows.reduce((s, r) => s + r.gmv, 0))}
                  </summary>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">Không nằm trong khung giờ ca nào của agency — không ảnh hưởng số ca. Gán inhouse nếu là brand tự live.</p>
                  {unassignedRows.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[11px] font-bold text-[var(--text)]">Chưa gán nhãn · {unassignedRows.length}</p>
                        <button
                          onClick={() => void run(async () => {
                            const n = await setReconciliationBucket(active.id, "unassigned", "inhouse");
                            setRows(await fetchReconciliationRows(active.id));
                            setNote(`Đã gán ${n} phiên thành ca inhouse.`);
                          })}
                          disabled={busy}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-sky-900 hover:bg-sky-800 text-sky-200 disabled:opacity-40 transition-colors"
                        >
                          Toàn bộ rổ này là ca inhouse
                        </button>
                      </div>
                      {roomTable(unassignedRows.slice(0, 20), false)}
                      {unassignedRows.length > 20 && <p className="text-[11px] text-[var(--text-faint)] mt-2">… và {unassignedRows.length - 20} phiên nữa</p>}
                    </div>
                  )}
                  {inhouseRows.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[11px] font-bold text-[var(--text)]">Ca inhouse của brand · {inhouseRows.length}</p>
                        <button
                          onClick={() => void run(async () => {
                            await setReconciliationBucket(active.id, "inhouse", "unassigned");
                            setRows(await fetchReconciliationRows(active.id));
                          })}
                          disabled={busy}
                          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40"
                        >
                          Bỏ gán nhãn
                        </button>
                      </div>
                      {roomTable(inhouseRows.slice(0, 20), false)}
                    </div>
                  )}
                </details>
              )}
            </div>
          )}

          {view === "cancheck" && (
            <div className="space-y-3">
              <div className={`border rounded-2xl p-4 ${check.counts.canCheck > 0 ? "border-rose-800 bg-rose-950/20" : "border-emerald-800 bg-emerald-950/20"}`}>
                <p className="text-xs font-black text-[var(--text)]">Kiểm tra theo nhóm ca–phiên · {check.groups.length} nhóm</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 max-w-2xl">Ca nối, restart, ngắt giữa chừng dùng chung một phép kiểm: tổng các ca của nhóm phải bằng tổng phiên trong file.</p>
                {check.issues.length === 0 ? (
                  <p className="text-[11px] text-emerald-300 mt-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Tổng các ca khớp file ở mọi nhóm, không ca nào lệch hay thiếu phiên.</p>
                ) : (
                  <>
                    <ul className="mt-2 space-y-1">
                      {(showAllIssues ? check.issues : check.issues.slice(0, ISSUES_SHOWN)).map((i, idx) => (
                        <li key={`${i.kind}-${i.sessionId ?? ""}-${i.rowId ?? ""}-${idx}`} className="text-[11px] text-[var(--text-muted)] flex items-start gap-2">
                          <span className="shrink-0 font-bold text-rose-300 w-28">{ISSUE_TITLE[i.kind]}</span>
                          {i.sessionId && <span className="shrink-0 text-[var(--text)] font-bold whitespace-nowrap">{sessionLabel(i.sessionId)}</span>}
                          <span>{i.text}</span>
                        </li>
                      ))}
                    </ul>
                    {check.issues.length > ISSUES_SHOWN && (
                      <button onClick={() => setShowAllIssues((v) => !v)} className="text-[11px] text-[var(--text-muted)] underline mt-2">
                        {showAllIssues ? "Thu gọn" : `Xem thêm ${check.issues.length - ISSUES_SHOWN} mục`}
                      </button>
                    )}
                  </>
                )}
              </div>

              {mergeGroups.length > 0 && (
                <div className="border border-violet-800 bg-violet-950/30 rounded-2xl p-4">
                  <p className="text-xs font-black text-[var(--text)]">Ca bị restart / ngắt giữa chừng · {mergeGroups.length} nhóm</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5 max-w-2xl">
                    Mỗi lần tắt bật stream sàn sinh thêm một phiên (có khi chỉ 1–2 phút, GMV 0). Gộp lại thành một phiên: giờ từ đầu tới cuối, GMV/đơn/lượt xem cộng lại (tổng không đổi). Chưa ghi gì vào ca cho tới khi bạn bấm Áp dụng.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {mergeGroups.map((g) => {
                      const key = g.ids[0];
                      return (
                        <li key={key}>
                          <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!mergeOff.has(key)}
                              onChange={(e) => setMergeOff((prev) => { const next = new Set(prev); if (e.target.checked) next.delete(key); else next.add(key); return next; })}
                              disabled={busy}
                              className="w-3.5 h-3.5 accent-violet-500 cursor-pointer"
                            />
                            <span className="whitespace-nowrap text-[var(--text)]">{fmtTime(g.startedAt)} → {fmtTime(g.endedAt)}</span>
                            <span>· {g.ids.length} phiên{g.blips > 0 ? ` (${g.blips} mảnh ngắn)` : ""} · {fmtVndFull(g.gmv)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    onClick={() => void run(async () => {
                      if (mergePicked.length === 0) throw new Error("Chưa chọn nhóm nào để gộp.");
                      if (!(await confirm(`Gộp ${mergePicked.length} nhóm (${mergePicked.reduce((s, g) => s + g.ids.length, 0)} dòng thành ${mergePicked.length})? Lần gộp này không hoàn lại được — muốn tách lại thì tạo lại lần đối soát từ file.`))) return;
                      const removed = await mergeReconciliationRows(active.id, mergePicked.map((g) => g.ids));
                      setRows(await fetchReconciliationRows(active.id));
                      await reloadBatchList();
                      setMergeOff(new Set());
                      setNote(`Đã gộp ${removed} dòng vào ${mergePicked.length} phiên.`);
                    })}
                    disabled={busy || mergePicked.length === 0}
                    className="mt-3 text-xs font-bold px-3 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors"
                  >
                    Gộp {mergePicked.length} nhóm đã chọn
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
