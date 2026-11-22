import { platformText } from "../../lib/metricGlossary";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  setReconciliationRowsBucket,
  setReconciliationRowsExcluded
} from "../../lib/db/liveReconciliation";
import { fetchSessionsWithSnapshot } from "../../lib/db/sessionLiveSnapshots";
import { type ReportPlatform } from "../../lib/reportPlatform";
import { errorMessage } from "../../lib/errorMessage";
import { useConfirm } from "../../hooks/useConfirm";
import { fmtPeriodLabel, fmtVndFull, fmtVndShort } from "../../lib/format";
import { LiveSession } from "../../types";
import { suggestMergeGroups } from "../../lib/reconciliation/mergeRestarts";
import { checkReconGroups, type CheckKind } from "../../lib/reconciliation/groupCheck";
import { groupOutsideRows, OUTSIDE_BULK_OK, OUTSIDE_HINT, OUTSIDE_TITLE } from "../../lib/reconciliation/outsideRows";
import { BLOCKING, buildVerdict, type ReconTask, type Tone } from "../../lib/reconciliation/verdict";
import { GmvEditor } from "../GmvEditor";
import { InfoDot } from "../common/InfoDot";

// Đối soát số liệu của MỘT brand + MỘT sàn, trong Dữ Liệu Gốc (gộp 07/10). Logic khớp/chia số nằm ở RPC
// import_live_reconciliation / apply_live_reconciliation; màn này chỉ xem rổ khớp rồi Áp dụng.
//
// Bố cục 15/11 (bản 2, user duyệt qua demo): KẾT LUẬN trước — VIỆC CẦN QUYẾT sau — SỔ trong ngăn gập.
// Đo lô CROCS tháng 10: 70 dòng phiên + 4 khối phải mở, nhưng chỉ 2 việc thật sự phải quyết; bản cũ bắt tìm 2 việc đó
// giữa cuốn sổ. Rổ "ngoài lịch" (440 dòng trên DB thật) gom theo 3 nhóm có luật đo được, xem outsideRows.ts.

interface Props {
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  /** Ca của brand — gắn nhãn ngày + giờ cho ca khớp, và xét ca nào trong kỳ chưa có file giao ca. */
  sessions: LiveSession[];
  /** Đổi giá trị ⇒ nạp lại danh sách lô (sau khi tạo lô mới từ lần up/lần tải). */
  reloadKey: number;
  onApplied: () => Promise<void> | void;
}

// Chỉ hai rổ này được ghi vào ca khi Áp dụng — nên chỉ ở đây mới chọn phiên nào đối soát.
const APPLIED_BUCKETS: ReconciliationBucket[] = ["agency", "review"];

const methodTitle = (platform: ReportPlatform): Record<ReconShare["method"], string> => ({
  whole: "Cả phiên thuộc ca này",
  snapshot: "Theo snapshot lúc giao ca",
  time: "Có phần ước lượng theo giờ — thiếu snapshot hoặc tải lên trễ",
  manual: `${platformText("GMV", platform)} gõ tay — phần còn lại chia cho các ca kia`
});

const ISSUE_TITLE: Record<CheckKind, string> = {
  sum_mismatch: "Tổng lệch file",
  chip_stale: "Số trên ca lệch",
  outside_shift: "Ngoài khung ca",
  gap: "Ca nối bị hở",
  no_room: "Ca không có phiên"
};

const BATCHES_SHOWN = 3;
const OUTSIDE_PAGE = 50;
const ISSUES_SHOWN = 12;

const TONE_DOT: Record<Tone, string> = { ok: "bg-emerald-400", warn: "bg-amber-400", bad: "bg-rose-400" };
const TONE_EDGE: Record<Tone, string> = { ok: "border-l-emerald-500", warn: "border-l-amber-500", bad: "border-l-rose-500" };

function fmtTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

// Nhãn nút lô: ngày trước, giờ sau ("01/11 01:16") — toLocaleString vi-VN đẩy giờ lên đầu nên đọc thành "01:16 01-11".
function fmtDayFirst(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

const pctOf = (part: number, total: number) => (total > 0 ? Math.round((part * 100) / total) : 0);

export function ReconciliationPanel({ brandId, brandName, platform, sessions, reloadKey, onApplied }: Props) {
  const confirm = useConfirm();
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const sessionLabel = (id: string) => {
    const s = sessionById.get(id);
    return s ? `${s.date.slice(8, 10)}/${s.date.slice(5, 7)} ${s.startTime}–${s.endTime}` : "ca không còn trong app";
  };
  // Ca đã xoá / đã chuyển brand–sàn / mảnh ca đã loại khỏi report: số chia cho nó không ghi vào đâu cả.
  const sessionTitle = (id: string) => (sessionById.get(id) ? "" : "Ca đã xoá hoặc đã chuyển brand/sàn — số này không ghi vào đâu.");

  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mergeOff, setMergeOff] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Map<string, ReconShare[]> | null>(null);
  const [editing, setEditing] = useState<{ rowId: string; sessionId: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [showOldBatches, setShowOldBatches] = useState(false);
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);
  const [bulkDraft, setBulkDraft] = useState<Map<string, string>>(new Map());
  const [outsideSel, setOutsideSel] = useState<Set<string>>(new Set());
  const [outsideShown, setOutsideShown] = useState(OUTSIDE_PAGE);
  const [showAllIssues, setShowAllIssues] = useState(false);
  // Ca trong kỳ của lô đã có file giao ca thật — null = chưa đọc được.
  const [snapSessions, setSnapSessions] = useState<Set<string> | null>(null);
  // Ngăn gập mở bằng nút trên thẻ việc.
  const ledgerRef = useRef<HTMLDetailsElement>(null);
  const outsideRef = useRef<HTMLDetailsElement>(null);
  const checksRef = useRef<HTMLDetailsElement>(null);
  const handoverRef = useRef<HTMLDetailsElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const reloadBatches = useCallback(async (selectId?: string) => {
    const list = await fetchReconciliationBatches(brandId, platform);
    setBatches(list);
    const next = selectId ?? list[0]?.id ?? null;
    setActiveId(next);
    setRows(next ? await fetchReconciliationRows(next) : []);
  }, [brandId, platform]);

  const reloadBatchList = useCallback(async () => {
    setBatches(await fetchReconciliationBatches(brandId, platform));
  }, [brandId, platform]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    reloadBatches()
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [reloadBatches, reloadKey]);

  const active = batches.find((b) => b.id === activeId);
  const appliedAt = active?.appliedAt;

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

  useEffect(() => {
    setOutsideSel(new Set());
    setOutsideShown(OUTSIDE_PAGE);
    setBulkDraft(new Map());
    setHighlightRowId(null);
    setShowAllIssues(false);
  }, [activeId]);

  // Ca đã diễn ra trong kỳ của lô — ca nào chưa có file giao ca thì phần của nó phải chia ước tính.
  const periodSessions = useMemo(() => sessions.filter((s) =>
    s.platform === platform
    && s.status === "Completed"
    && !s.isBackfill
    && (!active?.periodStart || s.date >= active.periodStart)
    && (!active?.periodEnd || s.date <= active.periodEnd)
  ), [sessions, platform, active]);

  const periodIds = useMemo(() => periodSessions.map((s) => s.id).join(","), [periodSessions]);
  useEffect(() => {
    if (!periodIds) { setSnapSessions(null); return; }
    let alive = true;
    fetchSessionsWithSnapshot(periodIds.split(","))
      .then((set) => alive && setSnapSessions(set))
      .catch(() => alive && setSnapSessions(null));
    return () => { alive = false; };
  }, [periodIds]);

  const missingHandover = useMemo(
    () => (snapSessions ? periodSessions.filter((s) => !snapSessions.has(s.id)) : []),
    [snapSessions, periodSessions]
  );

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

  async function saveOverride(rowId: string, sessionId: string, gmv: number | null) {
    await run(async () => {
      await setReconGmvOverride(rowId, sessionId, gmv);
      setEditing(null);
      setPreviewKey((k) => k + 1);
      setNote(gmv == null ? "Đã bỏ số gõ tay — ca chia tự động lại." : "Đã lưu số gõ tay. Bấm Áp Dụng Lại để ghi vào ca.");
    });
  }

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

  const mergeGroups = useMemo(() => suggestMergeGroups(rows), [rows]);
  const mergePicked = mergeGroups.filter((g) => !mergeOff.has(g.ids[0]));
  const applicable = useMemo(() => rows.filter((r) => APPLIED_BUCKETS.includes(r.bucket)), [rows]);
  const selectedCount = applicable.filter((r) => !r.excluded).length;
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
  const blockingIssues = check.issues.filter((i) => BLOCKING.includes(i.kind));
  const issueSessionIds = useMemo(() => new Set(check.issues.map((i) => i.sessionId).filter((x): x is string => !!x)), [check]);

  // Memo theo nguồn (lint React Compiler): trước đây mảng dựng lại mỗi lần vẽ ⇒ các useMemo phía dưới không bao giờ trúng.
  const listed = useMemo(() => applicable.slice().sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? "")), [applicable]);
  const listedPicked = useMemo(() => listed.filter((r) => !r.excluded), [listed]);
  const listedGmv = listedPicked.reduce((s, r) => s + r.gmv, 0);
  const otherRows = useMemo(() => rows.filter((r) => !APPLIED_BUCKETS.includes(r.bucket)), [rows]);
  const unassignedRows = useMemo(() => otherRows.filter((r) => r.bucket === "unassigned"), [otherRows]);
  const inhouseRows = otherRows.filter((r) => r.bucket === "inhouse");
  const outsideGroups = useMemo(() => groupOutsideRows(unassignedRows, sessions), [unassignedRows, sessions]);

  // Độ chắc của số: chia theo TIỀN, không theo số phiên.
  const trust = useMemo(() => {
    const fileGmv = listedPicked.reduce((s, r) => s + r.gmv, 0);
    if (!preview) return { fileGmv, thang: 0, uoc: 0, tay: 0, known: false };
    let thang = 0, uoc = 0, tay = 0;
    for (const r of listedPicked) {
      for (const sh of preview.get(r.id) ?? []) {
        if (sh.method === "time") uoc += sh.gmv;
        else if (sh.method === "manual") tay += sh.gmv;
        else thang += sh.gmv;
      }
    }
    return { fileGmv, thang, uoc, tay, known: true };
  }, [listedPicked, preview]);

  // Trước → sau, theo CA.
  const perSession = useMemo(() => {
    if (!preview) return null;
    const m = new Map<string, { next: number; current: number }>();
    for (const r of listedPicked) {
      for (const sh of preview.get(r.id) ?? []) {
        const e = m.get(sh.sessionId) ?? { next: 0, current: sh.currentGmv };
        e.next += sh.gmv;
        m.set(sh.sessionId, e);
      }
    }
    return m;
  }, [listedPicked, preview]);

  const applySummary = useMemo(() => {
    if (!perSession) return null;
    let up = 0, down = 0, same = 0, delta = 0;
    for (const { next, current } of perSession.values()) {
      const d = next - current;
      delta += d;
      if (Math.abs(d) <= Math.max(1000, Math.abs(current) * 0.01)) same++;
      else if (d > 0) up++;
      else down++;
    }
    return { sessions: perSession.size, up, down, same, delta };
  }, [perSession]);

  // Lô có phiên nhưng không khớp ca nào: nói thẳng vì sao.
  const deadReason = useMemo(() => {
    if (!active || rows.length === 0 || applicable.length > 0) return undefined;
    const inPeriod = sessions.filter((s) => s.platform === platform
      && (!active.periodStart || s.date >= active.periodStart)
      && (!active.periodEnd || s.date <= active.periodEnd));
    const live = inPeriod.filter((s) => s.status !== "Cancelled");
    const nearest = sessions.filter((s) => s.platform === platform && s.status !== "Cancelled").map((s) => s.date).sort();
    const vn = (d: string) => d.split("-").reverse().join("/");
    if (live.length === 0) {
      return nearest.length
        ? `Kỳ file không có ca ${platform} nào. Ca chỉ có từ ${vn(nearest[0])} đến ${vn(nearest[nearest.length - 1])}.`
        : `${brandName} chưa có ca nào trên sàn này.`;
    }
    return `Kỳ file có ${live.length} ca nhưng không ca nào trùng giờ phiên.`;
  }, [active, rows.length, applicable.length, sessions, platform, brandName]);

  const newestApplied = batches.filter((b) => b.appliedAt).sort((a, b) => (b.appliedAt ?? "").localeCompare(a.appliedAt ?? ""))[0];
  const activeIsOld = !!(active && newestApplied && active.id !== newestApplied.id
    && (active.periodEnd ?? "") < (newestApplied.periodEnd ?? ""));
  const shownBatches = showOldBatches ? batches : batches.slice(0, BATCHES_SHOWN);

  const verdict = useMemo(() => buildVerdict({
    deadReason,
    rowCount: rows.length,
    sessionCount: applySummary?.sessions ?? 0,
    check,
    mergeGroups,
    outsideGroups,
    missingHandover: missingHandover.length,
    isOldBatch: activeIsOld,
    applied: !!appliedAt
  }), [deadReason, rows.length, applySummary, check, mergeGroups, outsideGroups, missingHandover.length, activeIsOld, appliedAt]);

  // Bảng gõ số hàng loạt: mọi ca của phiên vắt ≥2 ca.
  const bulkRows = useMemo(
    () => (preview ? listedPicked.filter((r) => (preview.get(r.id)?.length ?? 0) > 1) : []),
    [listedPicked, preview]
  );
  const bulkKey = (rowId: string, sessionId: string) => `${rowId}|${sessionId}`;
  const bulkChanged = useMemo(() => {
    const out: Array<{ rowId: string; sessionId: string; gmv: number | null }> = [];
    for (const r of bulkRows) {
      for (const sh of preview?.get(r.id) ?? []) {
        const d = bulkDraft.get(bulkKey(r.id, sh.sessionId));
        if (d === undefined) continue;
        if (d === "") { if (sh.method === "manual") out.push({ rowId: r.id, sessionId: sh.sessionId, gmv: null }); continue; }
        const v = Number(d);
        if (Number.isFinite(v) && Math.round(v) !== Math.round(sh.gmv)) out.push({ rowId: r.id, sessionId: sh.sessionId, gmv: v });
      }
    }
    return out;
  }, [bulkRows, preview, bulkDraft]);

  async function saveBulk() {
    if (bulkChanged.length === 0) throw new Error("Chưa ô nào đổi số.");
    if (!(await confirm(`Lưu ${bulkChanged.length} ô gõ tay? Phần còn lại tự chia cho các ca kia.`))) return;
    for (const c of bulkChanged) await setReconGmvOverride(c.rowId, c.sessionId, c.gmv);
    setBulkDraft(new Map());
    setPreviewKey((k) => k + 1);
    setNote(`Đã lưu ${bulkChanged.length} ô — bấm Áp Dụng Lại để ghi vào ca.`);
  }

  async function clearAllTyped() {
    const typed = bulkRows.flatMap((r) => (preview?.get(r.id) ?? []).filter((sh) => sh.method === "manual").map((sh) => ({ rowId: r.id, sessionId: sh.sessionId })));
    if (typed.length === 0) throw new Error("Lô này không có ô nào gõ tay.");
    if (!(await confirm(`Bỏ ${typed.length} ô gõ tay của lô này? Các ca đó chia tự động lại.`, { danger: true }))) return;
    for (const t of typed) await setReconGmvOverride(t.rowId, t.sessionId, null);
    setBulkDraft(new Map());
    setPreviewKey((k) => k + 1);
    setNote(`Đã bỏ ${typed.length} ô gõ tay.`);
  }

  function openDetails(ref: React.RefObject<HTMLDetailsElement | null>) {
    const el = ref.current;
    if (!el) return;
    el.open = true;
    setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  }

  function jumpToRow(rowId?: string, sessionId?: string) {
    const id = rowId ?? (sessionId ? rows.find((r) => r.matchedSessionIds.includes(sessionId))?.id : undefined);
    if (!id) return;
    if (ledgerRef.current) ledgerRef.current.open = true;
    setHighlightRowId(id);
    setTimeout(() => rowRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }

  async function applyBatch() {
    if (!active) return;
    const skipped = applicable.length - selectedCount;
    if (selectedCount === 0) throw new Error("Chưa chọn phiên nào để đối soát — chọn ít nhất một phiên.");
    const lines = [
      active.appliedAt ? "Áp dụng lại lần đối soát này?" : "Áp dụng lần đối soát này?",
      "",
      `• Ghi vào ${applySummary?.sessions ?? "?"} ca, từ ${selectedCount} phiên${skipped > 0 ? `, bỏ ${skipped}` : ""}.`
    ];
    if (applySummary) {
      lines.push(`• ${applySummary.up} ca tăng, ${applySummary.down} ca giảm, ${applySummary.same} ca như cũ.`);
      lines.push(`• Tổng chênh lệch: ${applySummary.delta >= 0 ? "+" : "−"}${fmtVndFull(Math.abs(applySummary.delta))}.`);
    }
    if (trust.known && trust.uoc > 0) lines.push(`• Chia ước tính theo giờ: ${fmtVndFull(trust.uoc)} (${pctOf(trust.uoc, trust.fileGmv)}%).`);
    if (activeIsOld) lines.push("• CẢNH BÁO: lô cũ hơn lô đã áp dụng — số mới sẽ bị đè.");
    if (!(await confirm(lines.join("\n")))) return;
    const n = await applyReconciliation(active.id);
    await onApplied();
    await reloadBatches(active.id);
    setNote(`Đã cập nhật ${n} ca theo số liệu đối soát.`);
  }

  async function mergeAll() {
    if (!active) return;
    if (mergePicked.length === 0) throw new Error("Chưa chọn nhóm nào để gộp.");
    if (!(await confirm(
      `Gộp ${mergePicked.length} nhóm (${mergePicked.reduce((s, g) => s + g.ids.length, 0)} dòng thành ${mergePicked.length})?\n\n`
      + "KHÔNG HOÀN TÁC ĐƯỢC.\n"
      + "• Muốn tách lại phải xoá lô, tạo lại từ Lịch Sử Import.\n"
      + "• Tổng số của lô không đổi.",
      { danger: true, confirmLabel: "Gộp, không hoàn tác" }
    ))) return;
    const removed = await mergeReconciliationRows(active.id, mergePicked.map((g) => g.ids));
    setRows(await fetchReconciliationRows(active.id));
    await reloadBatchList();
    setMergeOff(new Set());
    setNote(`Đã gộp ${removed} dòng vào ${mergePicked.length} phiên.`);
  }

  async function assignRows(ids: string[], label: string) {
    if (!active || ids.length === 0) return;
    const n = await setReconciliationRowsBucket(active.id, ids, "inhouse");
    setRows(await fetchReconciliationRows(active.id));
    setOutsideSel(new Set());
    setNote(`Đã gán ${n} phiên ${label} thành ca inhouse.`);
  }

  async function assignGroup(ids: string[], count: number) {
    if (!(await confirm(`Gán ${count} phiên của nhóm này thành ca inhouse?`))) return;
    await assignRows(ids, "của nhóm");
  }

  // Nút của từng thẻ việc.
  const taskActions = (t: ReconTask) => {
    switch (t.kind) {
      case "dead":
        return <button onClick={() => void run(deleteBatch)} disabled={busy} className="btn-task-ghost">Xoá lô</button>;
      case "block":
      case "warn":
        return <button onClick={() => openDetails(checksRef)} className="btn-task-ghost">Xem lỗi</button>;
      case "merge":
        return (
          <>
            <button onClick={() => void run(mergeAll)} disabled={busy} className="btn-task">Gộp hết</button>
            <button onClick={() => openDetails(checksRef)} className="btn-task-ghost">Xem từng nhóm</button>
          </>
        );
      case "outside":
        return (
          <>
            {t.group && OUTSIDE_BULK_OK[t.group.kind] && (
              <button
                onClick={() => void run(() => assignGroup(t.group!.rows.map((r) => r.id), t.group!.rows.length))}
                disabled={busy}
                className="btn-task"
              >
                Gán cả nhóm
              </button>
            )}
            <button onClick={() => openDetails(outsideRef)} className="btn-task-ghost">Xem danh sách</button>
          </>
        );
      case "stale":
        return <button onClick={() => void run(applyBatch)} disabled={busy} className="btn-task">Áp dụng lại</button>;
      case "handover":
        return <button onClick={() => openDetails(handoverRef)} className="btn-task-ghost">Xem ca thiếu</button>;
      default:
        return null;
    }
  };

  async function deleteBatch() {
    if (!active) return;
    if (!(await confirm(
      `Xoá lô đối soát ${active.rowCount} phiên, kỳ ${active.periodLabel ? fmtPeriodLabel(active.periodLabel) : "không rõ"}?\n\n`
      + "KHÔNG HOÀN TÁC ĐƯỢC.\n"
      + "• Số đã ghi vào ca giữ nguyên, không trả về như trước.\n"
      + "• Muốn xem lại rổ khớp thì tạo lô mới từ Lịch Sử Import.",
      { danger: true, confirmLabel: "Xoá lô đối soát" }
    ))) return;
    await deleteReconciliationBatch(active.id);
    await reloadBatches();
  }

  const sessionChips = (r: ReconciliationRow) => {
    if (r.matchedSessionIds.length === 0) return "—";
    return (
      <span className="inline-flex gap-1 justify-end flex-wrap">
        {r.matchedSessionIds.map((id) => {
          const sh = preview?.get(r.id)?.find((x) => x.sessionId === id);
          const est = sh?.method === "time";
          const typed = sh?.method === "manual";
          const flagged = issueSessionIds.has(id);
          const ps = perSession?.get(id);
          const diff = ps ? ps.next - ps.current : 0;
          const moved = !!ps && Math.abs(diff) > Math.max(1000, Math.abs(ps.current) * 0.01);
          const editable = !!sh && APPLIED_BUCKETS.includes(r.bucket) && (preview?.get(r.id)?.length ?? 0) > 1;
          if (editing?.rowId === r.id && editing.sessionId === id) {
            return (
              <span key={id} className="inline-flex items-center gap-1 whitespace-nowrap">
                <span className="text-sky-300 font-bold">{sessionLabel(id)}</span>
                <GmvEditor initial={sh?.gmv} busy={busy} onSave={(v) => void saveOverride(r.id, id, v)} onCancel={() => setEditing(null)} />
                {typed && (
                  <button onClick={() => void saveOverride(r.id, id, null)} disabled={busy} className="text-2xs text-[var(--text-faint)] hover:text-[var(--text)] underline disabled:opacity-40">
                    Bỏ số gõ
                  </button>
                )}
              </span>
            );
          }
          const Tag = editable ? "button" : "span";
          const base = sh ? methodTitle(platform)[sh.method] : sessionTitle(id);
          const beforeAfter = ps && moved ? ` · ca này: ${fmtVndFull(ps.current)} → ${fmtVndFull(ps.next)}` : "";
          return (
            <Tag
              key={id}
              onClick={editable ? () => setEditing({ rowId: r.id, sessionId: id }) : undefined}
              disabled={editable ? busy : undefined}
              title={`${base}${sh ? ` · ${fmtVndFull(sh.gmv)}` : ""}${beforeAfter}`}
              className={`inline-flex items-center px-1.5 py-0.5 rounded border font-bold whitespace-nowrap ${
                flagged ? "border-rose-500 text-rose-300"
                  : typed ? "border-violet-500 text-violet-300"
                  : est ? "border-dashed border-amber-600 text-amber-300" : "border-sky-800 text-sky-300"
              } ${editable ? "hover:bg-[var(--surface-hover)] cursor-pointer" : ""}`}
            >
              {sessionLabel(id)}
              {sh && <span className="ml-1 font-normal">· {typed ? "✎ " : est ? "≈" : ""}{fmtVndShort(sh.gmv)}</span>}
              {moved && <span className={`ml-1 font-normal ${diff > 0 ? "text-emerald-400" : "text-rose-400"}`}>{diff > 0 ? "↑" : "↓"}</span>}
            </Tag>
          );
        })}
      </span>
    );
  };

  const roomTable = (items: ReconciliationRow[], opts: { pick?: boolean; select?: boolean } = {}) => (
    <div className="overflow-x-auto">
      <table className="w-full text-2xs min-w-[520px]">
        <thead>
          <tr className="text-[var(--text-faint)] text-left">
            {(opts.pick || opts.select) && <th className="font-bold pb-1.5 pr-2 w-6" aria-label={opts.pick ? "Đối soát phiên này" : "Chọn phiên"} />}
            <th className="font-bold pb-1.5 pr-3">Phiên live</th>
            <th className="font-bold pb-1.5 pr-3">Thời gian</th>
            <th className="font-bold pb-1.5 pr-3 text-right">{platformText("GMV", platform)}</th>
            <th className="font-bold pb-1.5 pr-3 text-right">Orders</th>
            <th className="font-bold pb-1.5 text-right">Ca khớp</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr
              key={r.id}
              ref={(el) => { if (el) rowRefs.current.set(r.id, el); else rowRefs.current.delete(r.id); }}
              className={`border-t border-[var(--border)]/60 ${r.excluded ? "opacity-50" : ""} ${
                highlightRowId === r.id ? "bg-amber-500/10 outline outline-1 outline-amber-500/60" : ""
              }`}
            >
              {opts.pick && (
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
              {opts.select && (
                <td className="py-1.5 pr-2">
                  <input
                    type="checkbox"
                    checked={outsideSel.has(r.id)}
                    onChange={(e) => setOutsideSel((prev) => { const n = new Set(prev); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })}
                    disabled={busy}
                    aria-label={`Chọn phiên ${r.roomTitle || r.roomId} ${fmtTime(r.startedAt)}`}
                    className="w-3.5 h-3.5 accent-sky-500 cursor-pointer"
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
        <h4 className="font-bold text-[var(--text)] text-xs">
          Đối soát số liệu — {brandName}
          <InfoDot label="Màn này làm gì">Mỗi file tải lên tạo một lần đối soát: số của từng ca phải khớp file sàn. Phiên chạy qua nhiều ca chia theo snapshot lúc giao ca, chưa có thì chia theo giờ — tổng luôn bằng file.</InfoDot>
        </h4>

        {batches.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 mt-3">
              {shownBatches.map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => void run(async () => { setActiveId(b.id); setRows(await fetchReconciliationRows(b.id)); })}
                  className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                    b.id === activeId ? "border-[var(--accent)] bg-[var(--surface-elevated)]" : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <span className="font-bold text-[var(--text)] flex items-center gap-1.5">
                    Tải {fmtDayFirst(b.createdAt)}
                    {i === 0 && !showOldBatches && <span className="text-2xs font-bold px-1.5 rounded bg-emerald-900 text-emerald-300">mới nhất</span>}
                  </span>
                  <span className="text-2xs text-[var(--text-faint)] block truncate max-w-[220px]">
                    kỳ {b.periodLabel ? fmtPeriodLabel(b.periodLabel) : b.fileName ?? "không rõ"}
                  </span>
                  <span className="text-2xs text-[var(--text-faint)]">
                    {b.rowCount} phiên · {b.appliedAt ? `đã áp dụng ${fmtTime(b.appliedAt)}` : "chưa áp dụng"}
                  </span>
                </button>
              ))}
            </div>
            {batches.length > BATCHES_SHOWN && (
              <button onClick={() => setShowOldBatches((v) => !v)} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline mt-2">
                {showOldBatches ? "Thu gọn lô cũ" : `Xem thêm ${batches.length - BATCHES_SHOWN} lô cũ`}
              </button>
            )}
          </>
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
          <p className="text-xs text-[var(--text-muted)]">Chưa có lần đối soát nào — tải file ở khối Import bên trên.</p>
        </div>
      )}

      {active && (
        <>
          {/* KẾT LUẬN — câu trả lời trước, số sau. */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-[var(--text)] flex items-start gap-2 max-w-xl">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${TONE_DOT[verdict.tone]}`} />
                  {verdict.line}
                </p>
                <p className="text-2xs text-[var(--text-muted)] mt-1 ml-4.5">
                  {rows.length} phiên trong file → {applySummary?.sessions ?? 0} ca · {fmtVndFull(listedGmv)}
                </p>
                {deadReason && <p className="text-2xs text-[var(--text-muted)] ml-4.5">{deadReason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void run(applyBatch)}
                  disabled={busy || !active.brandId || selectedCount === 0 || blockingIssues.length > 0}
                  title={blockingIssues.length > 0 ? "Còn nhóm có tổng khác file — sửa trước khi ghi" : undefined}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {applySummary?.sessions ? `Ghi vào ${applySummary.sessions} ca` : "Áp Dụng Đối Soát"}
                </button>
                <button
                  onClick={() => void run(deleteBatch)}
                  disabled={busy}
                  className="p-1.5 -m-1.5 rounded text-[var(--text-faint)] hover:text-rose-400 disabled:opacity-40 transition-colors"
                  title="Xoá lần đối soát này"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!deadReason && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2">
                    <p className="text-2xs text-[var(--text-faint)] font-bold">TỔNG KHỚP</p>
                    <p className="text-sm font-black text-[var(--text)]">{check.groups.length - blockingIssues.length}/{check.groups.length} nhóm</p>
                  </div>
                  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2">
                    <p className="text-2xs text-[var(--text-faint)] font-bold">SỐ CA ĐỔI</p>
                    <p className="text-sm font-black text-[var(--text)]">
                      <span className="text-emerald-400">{applySummary?.up ?? 0} ↑</span> · <span className="text-rose-400">{applySummary?.down ?? 0} ↓</span>
                    </p>
                  </div>
                  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2">
                    <p className="text-2xs text-[var(--text-faint)] font-bold">CHIA ƯỚC TÍNH</p>
                    <p className="text-sm font-black text-amber-300">{trust.known ? `${pctOf(trust.uoc, trust.fileGmv)}%` : "—"}</p>
                  </div>
                </div>

                {trust.known && trust.fileGmv > 0 && (
                  <div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-[var(--surface-base)]">
                      <div className="bg-emerald-600" style={{ width: `${pctOf(trust.thang, trust.fileGmv)}%` }} />
                      <div className="bg-violet-600" style={{ width: `${pctOf(trust.tay, trust.fileGmv)}%` }} />
                      <div className="bg-amber-600" style={{ width: `${pctOf(trust.uoc, trust.fileGmv)}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-2xs font-bold">
                      <span className="text-emerald-300">khớp thẳng {pctOf(trust.thang, trust.fileGmv)}% · {fmtVndShort(trust.thang)}</span>
                      {trust.tay > 0 && <span className="text-violet-300">gõ tay {pctOf(trust.tay, trust.fileGmv)}% · {fmtVndShort(trust.tay)}</span>}
                      <span className="text-amber-300">ước tính theo giờ {pctOf(trust.uoc, trust.fileGmv)}% · {fmtVndShort(trust.uoc)}</span>
                      <InfoDot label="Đọc dải này thế nào">Chia theo tiền, không theo số phiên. Khớp thẳng = ca nhận trọn phiên hoặc ranh giới ca có snapshot đúng giờ. Ước tính = thiếu snapshot nên rải đều theo thời lượng; tổng vẫn đúng file nhưng chia giữa các ca là phỏng đoán.</InfoDot>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeIsOld && (
              <p className="text-2xs text-amber-300 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                Lô này cũ hơn lô đã áp dụng ({fmtDayFirst(newestApplied?.createdAt)}) — áp dụng sẽ đè số mới.
              </p>
            )}
            {!active.brandId && (
              <p className="text-2xs text-amber-300">Lô nạp trước khi đối soát gắn brand — xoá rồi tạo lại từ Lịch Sử Import.</p>
            )}
          </div>

          {/* VIỆC CẦN QUYẾT */}
          {verdict.tasks.length > 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <h4 className="font-bold text-[var(--text)] text-xs">
                Việc cần quyết · {verdict.tasks.length}
                <InfoDot label="Khối này là gì">Mỗi việc một dòng, nút bấm nằm ngay tại dòng. Làm hết thì khối này biến mất.</InfoDot>
              </h4>
              <div className="space-y-2 mt-2">
                {verdict.tasks.map((t) => (
                  <div key={t.id} className={`flex flex-wrap items-center justify-between gap-2 bg-[var(--surface-base)] border border-[var(--border)] border-l-2 ${TONE_EDGE[t.tone]} rounded-xl px-3 py-2`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-2xs font-black text-[var(--text)]">{t.title}</p>
                      {t.detail && <p className="text-2xs text-[var(--text-muted)]">{t.detail}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">{taskActions(t)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SỔ CHI TIẾT */}
          <details ref={ledgerRef} className="border border-[var(--border)] bg-[var(--surface-base)] rounded-2xl p-4">
            <summary className="text-xs font-black text-[var(--text)] cursor-pointer">
              Sổ chi tiết · {listed.length} phiên khớp ca · đối soát {listedPicked.length}/{listed.length}
            </summary>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-2xs text-[var(--text-muted)]">
                  Bấm ô ca (✎) để gõ số đúng.
                  <InfoDot label="Gõ số đúng cho một ca">Biết số đúng của một ca trong phiên nhiều ca thì gõ vào ô ca đó — phần còn lại tự chia cho các ca kia.</InfoDot>
                </p>
                <div className="flex items-center gap-3 text-2xs">
                  <button onClick={() => void setExcluded(listed.filter((r) => r.excluded).map((r) => r.id), false)} disabled={busy || listedPicked.length === listed.length} className="font-bold text-emerald-300 hover:text-emerald-200 underline disabled:opacity-40 disabled:no-underline">
                    Chọn tất cả
                  </button>
                  <button onClick={() => void setExcluded(listedPicked.map((r) => r.id), true)} disabled={busy || listedPicked.length === 0} className="text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40 disabled:no-underline">
                    Bỏ chọn tất cả
                  </button>
                </div>
              </div>
              {listed.length > 0 ? roomTable(listed, { pick: true }) : <p className="text-2xs text-[var(--text-faint)]">Không phiên nào khớp ca.</p>}
            </div>

            {bulkRows.length > 0 && (
              <div className="mt-3 border border-violet-800 bg-violet-950/20 rounded-xl p-3">
                <p className="text-2xs font-black text-[var(--text)]">
                  Gõ số hàng loạt · {bulkRows.length} phiên vắt nhiều ca
                  <InfoDot label="Bảng này để làm gì">Mỗi dòng là một ca của một phiên nhiều ca. Gõ số đúng vào ô nào thì ca đó lấy số đó; ô để trống quay về cách chia tự động. Lưu một lần cho tất cả.</InfoDot>
                </p>
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-2xs min-w-[520px]">
                    <thead>
                      <tr className="text-[var(--text-faint)] text-left">
                        <th className="font-bold pb-1.5 pr-3">Phiên</th>
                        <th className="font-bold pb-1.5 pr-3">Ca</th>
                        <th className="font-bold pb-1.5 pr-3">Cách chia</th>
                        <th className="font-bold pb-1.5 pr-3 text-right">App chia</th>
                        <th className="font-bold pb-1.5 text-right">{platformText("GMV", platform)} đúng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((r) => (preview?.get(r.id) ?? []).map((sh, i) => {
                        const k = bulkKey(r.id, sh.sessionId);
                        const draft = bulkDraft.get(k);
                        const shown = draft !== undefined ? draft : sh.method === "manual" ? String(Math.round(sh.gmv)) : "";
                        return (
                          <tr key={k} className="border-t border-[var(--border)]/60">
                            <td className="py-1.5 pr-3 text-[var(--text-faint)] whitespace-nowrap">{i === 0 ? `${fmtTime(r.startedAt)} → ${fmtTime(r.endedAt)}` : ""}</td>
                            <td className="py-1.5 pr-3 text-[var(--text)] font-bold whitespace-nowrap" title={sessionTitle(sh.sessionId)}>{sessionLabel(sh.sessionId)}</td>
                            <td className={`py-1.5 pr-3 ${sh.method === "time" ? "text-amber-300" : sh.method === "manual" ? "text-violet-300" : "text-[var(--text-muted)]"}`}>
                              {sh.method === "time" ? "ước tính theo giờ" : sh.method === "manual" ? "gõ tay" : sh.method === "snapshot" ? "theo snapshot" : "trọn phiên"}
                            </td>
                            <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{fmtVndFull(sh.gmv)}</td>
                            <td className="py-1.5 text-right">
                              <input
                                inputMode="numeric"
                                aria-label={`GMV đúng của ca ${sessionLabel(sh.sessionId)}`}
                                placeholder="tự chia"
                                value={shown ? Number(shown).toLocaleString("vi-VN") : ""}
                                onChange={(e) => {
                                  const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
                                  setBulkDraft((prev) => new Map(prev).set(k, digits));
                                }}
                                disabled={busy}
                                className="w-32 px-2 py-1 rounded-md bg-[var(--surface-base)] border border-[var(--border)] text-2xs font-bold text-right text-[var(--text)] focus:outline-none focus:border-violet-500"
                              />
                            </td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <button onClick={() => void run(saveBulk)} disabled={busy || bulkChanged.length === 0} className="btn-task disabled:opacity-40">
                    Lưu {bulkChanged.length} ô đã đổi
                  </button>
                  <button onClick={() => setBulkDraft(new Map())} disabled={busy || bulkDraft.size === 0} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40">
                    Hoàn tác các ô đang gõ
                  </button>
                  <button onClick={() => void run(clearAllTyped)} disabled={busy} className="text-2xs text-[var(--text-muted)] hover:text-rose-300 underline disabled:opacity-40">
                    Bỏ hết số gõ tay
                  </button>
                </div>
              </div>
            )}
          </details>

          {/* PHIÊN NGOÀI LỊCH — theo nhóm */}
          {(unassignedRows.length > 0 || inhouseRows.length > 0) && (
            <details ref={outsideRef} className="border border-[var(--border)] bg-[var(--surface-base)] rounded-2xl p-4">
              <summary className="text-xs font-black text-[var(--text)] cursor-pointer">
                Phiên ngoài lịch ca · {unassignedRows.length + inhouseRows.length} phiên · {fmtVndFull(otherRows.reduce((s, r) => s + r.gmv, 0))}
              </summary>
              <p className="text-2xs text-[var(--text-muted)] mt-1">
                Không nằm trong khung giờ ca nào — không ảnh hưởng số ca.
                <InfoDot label="Vì sao chia 3 nhóm">Đo 440 dòng ngoài lịch trên dữ liệu thật: ngày brand không có ca nào (31% tiền) gần như chắc là brand tự live; sát ca dưới 30 phút (30%) thường là ca bị lệch giờ nên phải xem; còn lại là ngoài giờ làm.</InfoDot>
              </p>
              {outsideGroups.map((g) => (
                <div key={g.kind} className="mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <p className="text-2xs font-bold text-[var(--text)]">
                      {OUTSIDE_TITLE[g.kind]} · {g.rows.length} phiên · {fmtVndShort(g.gmv)}
                      <span className="block font-normal text-[var(--text-muted)]">{OUTSIDE_HINT[g.kind]}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {OUTSIDE_BULK_OK[g.kind] && (
                        <button
                          onClick={() => void run(() => assignGroup(g.rows.map((r) => r.id), g.rows.length))}
                          disabled={busy}
                          className="btn-task disabled:opacity-40"
                        >
                          Gán cả nhóm là inhouse
                        </button>
                      )}
                      <button
                        onClick={() => void run(async () => {
                          const ids = g.rows.filter((r) => outsideSel.has(r.id)).map((r) => r.id);
                          if (ids.length === 0) throw new Error("Chưa chọn phiên nào.");
                          await assignRows(ids, "đã chọn");
                        })}
                        disabled={busy || !g.rows.some((r) => outsideSel.has(r.id))}
                        className="btn-task-ghost disabled:opacity-40"
                      >
                        Gán phiên đã chọn
                      </button>
                    </div>
                  </div>
                  {roomTable(g.rows.slice(0, outsideShown), { select: true })}
                  {g.rows.length > outsideShown && (
                    <button onClick={() => setOutsideShown((n) => n + OUTSIDE_PAGE)} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline mt-2">
                      Xem thêm {Math.min(OUTSIDE_PAGE, g.rows.length - outsideShown)} phiên
                    </button>
                  )}
                </div>
              ))}
              {inhouseRows.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-2xs font-bold text-[var(--text)]">Ca inhouse của brand · {inhouseRows.length}</p>
                    <button
                      onClick={() => void run(async () => {
                        await setReconciliationBucket(active.id, "inhouse", "unassigned");
                        setRows(await fetchReconciliationRows(active.id));
                      })}
                      disabled={busy}
                      className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40"
                    >
                      Bỏ gán nhãn
                    </button>
                  </div>
                  {roomTable(inhouseRows.slice(0, outsideShown), {})}
                </div>
              )}
            </details>
          )}

          {/* CA THIẾU FILE GIAO CA */}
          {missingHandover.length > 0 && (
            <details ref={handoverRef} className="border border-[var(--border)] bg-[var(--surface-base)] rounded-2xl p-4">
              <summary className="text-xs font-black text-[var(--text)] cursor-pointer">
                Ca chưa có file giao ca · {missingHandover.length}/{periodSessions.length}
              </summary>
              <p className="text-2xs text-[var(--text-muted)] mt-1">
                Phần của các ca này phải chia ước tính theo giờ.
                <InfoDot label="Vì sao quan trọng">File giao ca đặt mốc số lúc đổi ca. Có mốc thì phiên vắt nhiều ca chia đúng từng ca; không có thì app rải đều theo thời lượng — tổng vẫn đúng file nhưng chia là phỏng đoán.</InfoDot>
              </p>
              <ul className="mt-2 space-y-0.5">
                {missingHandover.slice(0, 20).map((s) => (
                  <li key={s.id} className="text-2xs text-[var(--text-muted)]">
                    <span className="text-[var(--text)] font-bold">{s.date.slice(8, 10)}/{s.date.slice(5, 7)} {s.startTime}–{s.endTime}</span>
                    {s.hostName ? ` · ${s.hostName}` : ""}{s.assistantName ? ` · trợ ${s.assistantName}` : ""}
                  </li>
                ))}
              </ul>
              {missingHandover.length > 20 && <p className="text-2xs text-[var(--text-faint)] mt-1">… và {missingHandover.length - 20} ca nữa</p>}
            </details>
          )}

          {/* KIỂM TRA + GỘP RESTART */}
          <details ref={checksRef} className="border border-[var(--border)] bg-[var(--surface-base)] rounded-2xl p-4">
            <summary className="text-xs font-black text-[var(--text)] cursor-pointer">
              Kiểm tra theo nhóm ca–phiên · {check.groups.length} nhóm{check.issues.length > 0 ? ` · ${check.issues.length} chỗ lệch` : " · không chỗ nào lệch"}
            </summary>
            <p className="text-2xs text-[var(--text-muted)] mt-1">
              Tổng các ca của nhóm phải bằng tổng phiên trong file. Bấm một dòng lỗi để nhảy tới phiên.
              <InfoDot label="Nhóm liên thông là gì">Ca nối, restart và ngắt giữa chừng dính nhau qua cùng một phiên nên gom thành một nhóm, kiểm một phép duy nhất cho cả nhóm.</InfoDot>
            </p>
            {check.issues.length === 0 ? (
              <p className="text-2xs text-emerald-300 mt-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Tổng các ca khớp file ở mọi nhóm.</p>
            ) : (
              <>
                <ul className="mt-2 space-y-1">
                  {(showAllIssues ? check.issues : check.issues.slice(0, ISSUES_SHOWN)).map((i, idx) => (
                    <li key={`${i.kind}-${i.sessionId ?? ""}-${i.rowId ?? ""}-${idx}`}>
                      <button
                        onClick={() => jumpToRow(i.rowId, i.sessionId)}
                        disabled={!i.rowId && !i.sessionId}
                        className="w-full text-left text-2xs text-[var(--text-muted)] flex items-start gap-2 hover:bg-[var(--surface-hover)] rounded px-1 py-0.5 disabled:hover:bg-transparent"
                      >
                        <span className={`shrink-0 font-bold w-28 ${BLOCKING.includes(i.kind) ? "text-rose-300" : "text-amber-300"}`}>{ISSUE_TITLE[i.kind]}</span>
                        {i.sessionId && <span className="shrink-0 text-[var(--text)] font-bold whitespace-nowrap">{sessionLabel(i.sessionId)}</span>}
                        <span>{i.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {check.issues.length > ISSUES_SHOWN && (
                  <button onClick={() => setShowAllIssues((v) => !v)} className="text-2xs text-[var(--text-muted)] underline mt-2">
                    {showAllIssues ? "Thu gọn" : `Xem thêm ${check.issues.length - ISSUES_SHOWN} mục`}
                  </button>
                )}
              </>
            )}

            {mergeGroups.length > 0 && (
              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <p className="text-2xs font-black text-[var(--text)]">Ca bị restart / ngắt giữa chừng · {mergeGroups.length} nhóm</p>
                <p className="text-2xs text-[var(--text-muted)]">
                  Gộp các mảnh của cùng một ca thành một phiên; tổng không đổi.
                  <InfoDot label="Vì sao có mảnh thừa">Mỗi lần tắt bật stream, sàn sinh thêm một phiên mới — có khi chỉ 1–2 phút và không bán được gì.</InfoDot>
                </p>
                <ul className="mt-2 space-y-1">
                  {mergeGroups.map((g) => {
                    const key = g.ids[0];
                    return (
                      <li key={key}>
                        <label className="flex items-center gap-2 text-2xs text-[var(--text-muted)] cursor-pointer">
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
                <button onClick={() => void run(mergeAll)} disabled={busy || mergePicked.length === 0} className="mt-2 btn-task disabled:opacity-40">
                  Gộp {mergePicked.length} nhóm đã chọn
                </button>
              </div>
            )}
          </details>
        </>
      )}
    </div>
  );
}
