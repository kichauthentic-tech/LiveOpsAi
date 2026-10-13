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
  agency: "Chia đúng theo snapshot trợ live up lúc giao ca; ca cuối không up thì nhận phần sau mốc cuối.",
  review: "Có ca chưa up snapshot hoặc up trễ — phần không có mốc chia theo giờ (ô ≈), phần có mốc vẫn chia đúng. Nên nhắc trợ up đúng lúc giao ca.",
  unassigned: "Không nằm trong khung giờ ca nào của agency. Không ảnh hưởng số liệu ca, chỉ cần gán nhãn để còn so hiệu suất agency với inhouse.",
  inhouse: "Đã xác nhận là brand tự live, không tính vào ca nào của agency."
};

const BUCKET_TONE: Record<ReconciliationBucket, string> = {
  agency: "border-emerald-800 bg-emerald-950/30",
  review: "border-amber-700 bg-amber-950/30",
  unassigned: "border-[var(--border)] bg-[var(--surface-base)]",
  inhouse: "border-sky-800 bg-sky-950/30"
};

// Chỉ hai rổ này được ghi vào ca khi Áp dụng — nên chỉ ở đây mới chọn phiên nào đối soát.
const APPLIED_BUCKETS: ReconciliationBucket[] = ["agency", "review"];

const ORDER: ReconciliationBucket[] = ["agency", "review", "unassigned", "inhouse"];

const METHOD_TITLE: Record<ReconShare["method"], string> = {
  whole: "Cả phiên thuộc ca này",
  snapshot: "Theo snapshot lúc giao ca",
  time: "Có phần ước lượng theo giờ — thiếu snapshot hoặc up trễ"
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
  }, [activeId, rows.length, appliedAt]);

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
  // Rổ hiển thị của dòng agency/review theo bản chia thật (có ô ước lượng hay không) — snapshot up sau lúc nạp lô đổi được rổ.
  const shownBucket = (r: ReconciliationRow): ReconciliationBucket => {
    const shares = preview?.get(r.id);
    if (!APPLIED_BUCKETS.includes(r.bucket) || !shares?.length) return r.bucket;
    return shares.some((sh) => sh.method === "time") ? "review" : "agency";
  };
  const grouped = ORDER.map((bucket) => ({
    bucket,
    items: rows.filter((r) => shownBucket(r) === bucket)
  })).filter((g) => g.items.length > 0);
  // Lô đã Áp dụng mà ca đã đối soát đang khác bản chia mới (snapshot up/xoá sau lần Áp dụng) ⇒ nhắc Áp dụng lại.
  // Chỉ tính ca mà lần đối soát GẦN NHẤT là lô này: ca đã được lô mới hơn ghi đè (file tải sau, số mới hơn) mà nhắc Áp dụng
  // lại lô cũ thì sẽ đè số mới bằng số cũ (đo 13/10: CROCS 01–09/10 báo 13 ca "lệch" chỉ vì lô 01–10/10 đã ghi sau).
  const staleSessions = useMemo(() => {
    if (!preview || !appliedAt) return 0;
    const appliedMs = Date.parse(appliedAt);
    const lastByThisBatch = (id: string) => {
      const at = sessionById.get(id)?.reconciledAt;
      return !!at && Date.parse(at) <= appliedMs + 60_000;
    };
    const want = new Map<string, { gmv: number; current: number; source?: string }>();
    for (const r of rows) {
      if (r.excluded) continue;
      for (const sh of preview.get(r.id) ?? []) {
        if (!lastByThisBatch(sh.sessionId)) continue;
        const w = want.get(sh.sessionId) ?? { gmv: 0, current: sh.currentGmv, source: sh.currentSource };
        w.gmv += sh.gmv;
        want.set(sh.sessionId, w);
      }
    }
    // Lệch dưới 1% = hai cách ước lượng theo giờ khác nhau chút ít (vd ca nạp bù tách theo giờ ca, 0171 theo giờ live thật —
    // CROCS T9 13/10: 27 ca lệch ≤ 0,6%) ⇒ không nhắc; chênh do mốc snapshot mới thì lớn hơn nhiều (VERA Shopee 09/10: 3,6–6%).
    return [...want.values()].filter((w) => w.source === "tiktok_reconciled" && Math.abs(w.gmv - w.current) > Math.max(1, Math.abs(w.current) * 0.01)).length;
  }, [preview, rows, appliedAt, sessionById]);

  return (
    <div className="space-y-3">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
        <h4 className="font-bold text-[var(--text)] text-xs">Đối soát số liệu — {brandName}</h4>
        <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-3xl">
          Mỗi lần up file ở dưới tự tạo một lần đối soát: app khớp từng phiên live với ca CÓ SẴN của brand theo giờ, bạn xem rổ rồi bấm Áp dụng để thay số tạm bằng số cuối của sàn.
          Phiên chạy xuyên nhiều ca: chia theo các mốc snapshot (tính theo giờ up thật), chỉ phần không có mốc mới chia theo giờ (≈) — tổng luôn đúng bằng file.
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
          <p className="text-xs text-[var(--text-muted)]">Chưa có lần đối soát nào của brand này. Up file ở trên (hoặc bấm "Đối soát" ở một lần tải trong Lịch Sử Import) để bắt đầu.</p>
        </div>
      )}

      {active && mergeGroups.length > 0 && (
        <div className="border border-violet-800 bg-violet-950/30 rounded-2xl p-4">
          <p className="text-xs font-black text-[var(--text)]">Ca bị restart / ngắt giữa chừng · {mergeGroups.length} nhóm</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 max-w-2xl">
            Mỗi lần tắt bật stream sàn sinh thêm một phiên (có khi chỉ 1–2 phút, GMV 0) nên một ca bị tách thành nhiều dòng. Gộp lại thành một phiên: giờ lấy từ đầu tới cuối,
            GMV/đơn/lượt xem cộng lại (tổng không đổi), bỏ ca đã loại khỏi nhãn "Ca khớp". Chưa ghi gì vào ca cho tới khi bạn bấm Áp dụng.
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

      {active && (
        <div className="space-y-3">
          {grouped.map(({ bucket, items }) => {
            const totalGmv = items.reduce((s, r) => s + r.gmv, 0);
            const selectable = APPLIED_BUCKETS.includes(bucket);
            const picked = items.filter((r) => !r.excluded);
            const pickedGmv = picked.reduce((s, r) => s + r.gmv, 0);
            const shown = selectable ? items : items.slice(0, 20);
            return (
              <div key={bucket} className={`border rounded-2xl p-4 ${BUCKET_TONE[bucket]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-[var(--text)]">
                      {BUCKET_LABEL[bucket]} · {items.length} phiên · {fmtVndFull(totalGmv)}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 max-w-2xl">{BUCKET_HINT[bucket]}</p>
                    {selectable && (
                      <p className="text-[11px] mt-1 text-[var(--text)]">
                        Đối soát <span className="font-bold">{picked.length}/{items.length}</span> phiên · {fmtVndFull(pickedGmv)}
                        {picked.length < items.length && <span className="text-amber-300"> · {items.length - picked.length} phiên bị bỏ qua, ca khớp giữ nguyên số hiện có</span>}
                      </p>
                    )}
                  </div>
                  {selectable && (
                    <div className="shrink-0 flex items-center gap-3 text-[11px]">
                      <button
                        onClick={() => void setExcluded(items.filter((r) => r.excluded).map((r) => r.id), false)}
                        disabled={busy || picked.length === items.length}
                        className="font-bold text-emerald-300 hover:text-emerald-200 underline disabled:opacity-40 disabled:no-underline"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        onClick={() => void setExcluded(picked.map((r) => r.id), true)}
                        disabled={busy || picked.length === 0}
                        className="text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40 disabled:no-underline"
                      >
                        Bỏ chọn tất cả
                      </button>
                    </div>
                  )}
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
                        {selectable && <th className="font-bold pb-1.5 pr-2 w-6" aria-label="Đối soát phiên này" />}
                        <th className="font-bold pb-1.5 pr-3">Phiên live</th>
                        <th className="font-bold pb-1.5 pr-3">Thời gian</th>
                        <th className="font-bold pb-1.5 pr-3 text-right">GMV</th>
                        <th className="font-bold pb-1.5 pr-3 text-right">Orders</th>
                        <th className="font-bold pb-1.5 text-right">Ca khớp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
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
                          <td className="py-1.5 pr-3 text-[var(--text-faint)] whitespace-nowrap">
                            {fmtTime(r.startedAt)} → {fmtTime(r.endedAt)}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-bold text-[var(--text)]">{fmtVndFull(r.gmv)}</td>
                          <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{r.orders}</td>
                          <td className="py-1.5 text-right text-[var(--text-muted)]">
                            {r.matchedSessionIds.length === 0 ? "—" : (
                              <span className="inline-flex gap-1 justify-end flex-wrap">
                                {r.matchedSessionIds.map((id) => {
                                  const sh = preview?.get(r.id)?.find((x) => x.sessionId === id);
                                  const est = sh?.method === "time";
                                  return (
                                    <span
                                      key={id}
                                      title={sh ? `${METHOD_TITLE[sh.method]} · ${fmtVndFull(sh.gmv)}` : undefined}
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded border font-bold whitespace-nowrap ${
                                        est ? "border-dashed border-amber-600 text-amber-300" : "border-sky-800 text-sky-300"
                                      }`}
                                    >
                                      {sessionLabel(id)}
                                      {sh && <span className="ml-1 font-normal">· {est ? "≈" : ""}{fmtVndShort(sh.gmv)}</span>}
                                    </span>
                                  );
                                })}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {shown.length < items.length && (
                    <p className="text-[11px] text-[var(--text-faint)] mt-2">… và {items.length - shown.length} phiên nữa</p>
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
                  Chỉ các phiên được tick mới được ghi; phiên bỏ tick không đụng tới số của ca. Bỏ tick sau khi đã áp dụng thì số đã ghi KHÔNG tự hoàn lại.
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
                  const skipped = applicable.length - selectedCount;
                  if (selectedCount === 0) throw new Error("Chưa chọn phiên nào để đối soát — tick ít nhất một phiên.");
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
