import { platformText } from "../../lib/metricGlossary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { type ReportPlatform } from "../../lib/reportPlatform";
import { errorMessage } from "../../lib/errorMessage";
import { useConfirm } from "../../hooks/useConfirm";
import { fmtPeriodLabel, fmtVndFull, fmtVndShort } from "../../lib/format";
import { LiveSession } from "../../types";
import { suggestMergeGroups } from "../../lib/reconciliation/mergeRestarts";
import { checkReconGroups, type CheckKind } from "../../lib/reconciliation/groupCheck";
import { GmvEditor } from "../GmvEditor";
import { InfoDot } from "../common/InfoDot";

// Đối soát số liệu của MỘT brand + MỘT sàn, nằm ngay trong Dữ Liệu Gốc (gộp 07/10 — trước đây là màn riêng
// "Đối Soát Số Liệu" bắt up file lần hai). Lô đối soát được tạo từ chính lần up ở Dữ Liệu Gốc (hoặc từ một lần tải đã lưu);
// ở đây chỉ xem rổ khớp + Áp dụng. Logic khớp/chia số vẫn ở RPC import_live_reconciliation / apply_live_reconciliation.
//
// Đợt 14/11 (audit "điểm khó dùng", đo trên DB thật): 10 chỗ sửa, xem từng khối bên dưới —
//  (1) dải Độ chắc của số: 94% ca vắt nhiều ca không có snapshot ⇒ 62% GMV đi đường ước tính, trước đây giấu trong 1 chip nhỏ;
//  (2) Gõ số hàng loạt: 201 ô gõ tay trên DB đều do script ghi (3 cụm trong 3 phút) vì bấm từng ô quá lâu;
//  (3) rổ ngoài lịch 440 dòng chỉ hiện 20 + nút "cả rổ" ⇒ chưa ai dùng (0 dòng inhouse);
//  (4) lô FUJIWA 132 dòng / 0 khớp nằm chết 2 tuần vì màn không nói vì sao;
//  (5) 6 lô CROCS nhãn chỉ khác 2 chữ số cuối; (6) không xem được trước→sau; (7) còn lỗi vẫn Áp dụng được;
//  (8) gộp/xoá không hoàn tác mà cảnh báo như việc thường; (9) thứ tự khối (sửa ở BrandDataRaw); (10) chữ "ca ẩn".

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

const methodTitle = (platform: ReportPlatform): Record<ReconShare["method"], string> => ({
  whole: "Cả phiên thuộc ca này",
  snapshot: "Theo snapshot lúc giao ca",
  time: "Có phần ước lượng theo giờ — thiếu snapshot hoặc tải lên trễ",
  manual: `${platformText("GMV", platform)} gõ tay — phần còn lại của phiên chia cho các ca kia`
});

const ISSUE_TITLE: Record<CheckKind, string> = {
  sum_mismatch: "Tổng lệch file",
  chip_stale: "Số trên ca lệch",
  outside_shift: "Ngoài khung ca",
  gap: "Ca nối bị hở",
  no_room: "Ca không có phiên"
};

// Lỗi CHẶN Áp dụng: tổng các ca khác tổng file ⇒ ghi vào ca là ghi sai tiền. Các lỗi khác chỉ cảnh báo trong hộp xác nhận.
const BLOCKING: CheckKind[] = ["sum_mismatch"];

// Số lô hiện sẵn; còn lại nằm sau nút "xem thêm" (5: 6 lô CROCS cùng kỳ trông gần như hệt nhau).
const BATCHES_SHOWN = 3;
const OUTSIDE_PAGE = 50;

function fmtTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

// Nhãn nút lô: ngày trước, giờ sau ("01/11 01:16") — `toLocaleString` vi-VN đẩy giờ lên đầu nên đọc thành "01:16 01-11".
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
    // (10) Không thấy trong danh sách ca của brand = ca đã xoá, đã đổi brand/sàn, hoặc là mảnh ca bị loại khỏi report.
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
  // Nhóm gộp restart đang bị bỏ tick (mặc định gợi ý nào cũng được tick); khoá theo id dòng đầu của nhóm.
  const [mergeOff, setMergeOff] = useState<Set<string>>(new Set());
  // Bản chia Áp dụng sẽ ghi (0171), theo dòng. null = DB chưa có 0171 ⇒ màn như cũ.
  const [preview, setPreview] = useState<Map<string, ReconShare[]> | null>(null);
  // Ô ca đang gõ GMV tay (0174) + bộ đếm để nạp lại bản chia sau khi lưu.
  const [editing, setEditing] = useState<{ rowId: string; sessionId: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [showOldBatches, setShowOldBatches] = useState(false);
  // (7) Bấm một lỗi ở "Cần check" ⇒ nhảy về bảng Kết quả và tô dòng đó.
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  // (2) Bảng gõ số hàng loạt: digits theo khoá `rowId|sessionId`.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<Map<string, string>>(new Map());
  // (3) Dòng ngoài lịch đang chọn + số dòng đang hiện.
  const [outsideSel, setOutsideSel] = useState<Set<string>>(new Set());
  const [outsideShown, setOutsideShown] = useState(OUTSIDE_PAGE);

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

  // Đổi lô ⇒ bỏ mọi lựa chọn/nháp của lô cũ.
  useEffect(() => {
    setOutsideSel(new Set());
    setOutsideShown(OUTSIDE_PAGE);
    setBulkDraft(new Map());
    setBulkOpen(false);
    setHighlightRowId(null);
  }, [activeId]);

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
      setNote(gmv == null ? "Đã bỏ số gõ tay — ca chia tự động lại." : "Đã lưu số gõ tay. Bấm Áp Dụng Lại để ghi vào ca.");
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
  const blockingIssues = check.issues.filter((i) => BLOCKING.includes(i.kind));
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

  // ---- (1) Độ chắc của số: bao nhiêu TIỀN đang khớp thẳng từ file, bao nhiêu là ước tính theo giờ ----
  const trust = useMemo(() => {
    const picked = listedPicked;
    const fileGmv = picked.reduce((s, r) => s + r.gmv, 0);
    if (!preview) return { fileGmv, thang: 0, uoc: 0, tay: 0, known: false };
    let thang = 0, uoc = 0, tay = 0;
    for (const r of picked) {
      for (const sh of preview.get(r.id) ?? []) {
        if (sh.method === "time") uoc += sh.gmv;
        else if (sh.method === "manual") tay += sh.gmv;
        else thang += sh.gmv;
      }
    }
    return { fileGmv, thang, uoc, tay, known: true };
  }, [listedPicked, preview]);

  // ---- (6) Trước → sau, theo CA: số đang nằm trên ca vs số lần Áp dụng này sẽ ghi ----
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

  // ---- (4) Lô không khớp ca nào: nói thẳng vì sao, thay vì để màn trống ----
  const diagnosis = useMemo(() => {
    if (!active || rows.length === 0 || applicable.length > 0) return null;
    const inPeriod = sessions.filter(
      (s) => s.platform === platform
        && (!active.periodStart || s.date >= active.periodStart)
        && (!active.periodEnd || s.date <= active.periodEnd)
    );
    const live = inPeriod.filter((s) => s.status !== "Cancelled");
    const done = live.filter((s) => s.status === "Completed");
    const nearest = sessions
      .filter((s) => s.platform === platform && s.status !== "Cancelled")
      .map((s) => s.date)
      .sort();
    if (live.length === 0) {
      return {
        why: `Kỳ file ${fmtPeriodLabel(`${active.periodStart ?? "?"} ~ ${active.periodEnd ?? "?"}`)}: ${brandName} không có ca ${platform} nào.`,
        fix: nearest.length
          ? `Ca ${platform} chỉ có từ ${nearest[0].split("-").reverse().join("/")} đến ${nearest[nearest.length - 1].split("-").reverse().join("/")} — tải file đúng kỳ đó.`
          : "Brand chưa có ca nào trên sàn này — tạo lịch ca trước."
      };
    }
    if (done.length === 0) {
      return {
        why: `Kỳ file có ${live.length} ca, chưa ca nào Hoàn thành — file và lịch ca lệch giờ.`,
        fix: "So giờ phiên với giờ ca ở rổ “Phiên ngoài lịch ca” bên dưới."
      };
    }
    return {
      why: `Kỳ file có ${live.length} ca (${done.length} hoàn thành), không ca nào trùng giờ phiên.`,
      fix: "Thường là file của tài khoản khác hoặc lệch ngày — so giờ ở rổ bên dưới."
    };
  }, [active, rows.length, applicable.length, sessions, platform, brandName]);

  // ---- (5) Lô cũ hơn lô đã áp dụng gần nhất ⇒ áp dụng sẽ đè số mới bằng số cũ ----
  const newestApplied = batches.filter((b) => b.appliedAt).sort((a, b) => (b.appliedAt ?? "").localeCompare(a.appliedAt ?? ""))[0];
  const activeIsOld = !!(active && newestApplied && active.id !== newestApplied.id
    && (active.periodEnd ?? "") < (newestApplied.periodEnd ?? "") );
  const shownBatches = showOldBatches ? batches : batches.slice(0, BATCHES_SHOWN);

  // ---- (2) Gõ số hàng loạt: mọi ca của các phiên vắt ≥2 ca, mỗi ca một ô ----
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
    await run(async () => {
      if (bulkChanged.length === 0) throw new Error("Chưa ô nào đổi số.");
      if (!(await confirm(`Lưu ${bulkChanged.length} ô gõ tay? Phần còn lại tự chia cho các ca kia.`))) return;
      for (const c of bulkChanged) await setReconGmvOverride(c.rowId, c.sessionId, c.gmv);
      setBulkDraft(new Map());
      setPreviewKey((k) => k + 1);
      setNote(`Đã lưu ${bulkChanged.length} ô — bấm Áp Dụng Lại để ghi vào ca.`);
    });
  }

  async function clearAllTyped() {
    await run(async () => {
      const typed = bulkRows.flatMap((r) => (preview?.get(r.id) ?? []).filter((sh) => sh.method === "manual").map((sh) => ({ rowId: r.id, sessionId: sh.sessionId })));
      if (typed.length === 0) throw new Error("Lô này không có ô nào gõ tay.");
      if (!(await confirm(`Bỏ ${typed.length} ô gõ tay của lô này? Các ca đó chia tự động lại.`, { danger: true }))) return;
      for (const t of typed) await setReconGmvOverride(t.rowId, t.sessionId, null);
      setBulkDraft(new Map());
      setPreviewKey((k) => k + 1);
      setNote(`Đã bỏ ${typed.length} ô gõ tay.`);
    });
  }

  function jumpToRow(rowId?: string, sessionId?: string) {
    const id = rowId ?? (sessionId ? rows.find((r) => r.matchedSessionIds.includes(sessionId))?.id : undefined);
    if (!id) return;
    setView("ketqua");
    setHighlightRowId(id);
    // Bảng mới render ở tab vừa chuyển ⇒ đợi một nhịp rồi mới cuộn.
    setTimeout(() => rowRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }

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
          const ps = perSession?.get(id);
          // (6) Ca đổi số sau khi áp dụng: mũi tên + số cũ trong tooltip.
          const diff = ps ? ps.next - ps.current : 0;
          const moved = !!ps && Math.abs(diff) > Math.max(1000, Math.abs(ps.current) * 0.01);
          // Gõ tay chỉ có nghĩa khi phiên chia cho ≥ 2 ca (1 ca thì nhận trọn số file).
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
          const beforeAfter = ps && moved ? ` · ca này: ${fmtVndFull(ps.current)} → ${fmtVndFull(ps.next)}` : ps ? " · số trên ca không đổi" : "";
          return (
            <Tag
              key={id}
              onClick={editable ? () => setEditing({ rowId: r.id, sessionId: id }) : undefined}
              disabled={editable ? busy : undefined}
              title={`${base}${sh ? ` · ${fmtVndFull(sh.gmv)}` : ""}${beforeAfter}${editable ? ` · bấm để gõ ${platformText("GMV", platform)} đúng của ca` : ""}`}
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

  const roomTable = (
    items: ReconciliationRow[],
    opts: { pick?: boolean; select?: boolean } = {}
  ) => (
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
        <h4 className="font-bold text-[var(--text)] text-xs">Đối soát số liệu — {brandName}</h4>
        <p className="text-2xs text-[var(--text-muted)] mt-1 max-w-3xl">
          Mỗi file tải lên tạo một lần đối soát: số của từng ca phải khớp file {platform}. Phiên chạy qua nhiều ca chia theo snapshot, chưa có thì chia theo giờ (≈) — tổng luôn bằng file.
        </p>

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
                  {/* (5) Nhãn lô: ngày TẢI lên đứng trước (khác nhau rõ), kỳ của file xuống dòng dưới — 6 lô cùng kỳ
                      trước đây chỉ khác 2 chữ số cuối của một chuỗi bị cắt ngang. */}
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
        {activeIsOld && (
          <p className="text-xs text-amber-300 flex items-start gap-1.5 mt-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            Lô này cũ hơn lô đã áp dụng gần nhất (tải {fmtDayFirst(newestApplied?.createdAt)}) — áp dụng sẽ ghi đè số của lô mới bằng số của file cũ.
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
          <p className="text-xs text-[var(--text-muted)]">Chưa có lần đối soát nào — tải file ở khối Import bên trên.</p>
        </div>
      )}

      {/* (4) Lô có phiên nhưng không khớp ca nào: nói thẳng vì sao + làm gì tiếp, thay vì để tab Kết quả trống. */}
      {active && diagnosis && (
        <div className="border border-amber-700 bg-amber-950/20 rounded-2xl p-4">
          <p className="text-xs font-black text-amber-200 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            File có {rows.length} phiên nhưng không phiên nào khớp ca — lô này áp dụng sẽ không đổi số của ca nào.
          </p>
          <p className="text-2xs text-[var(--text-muted)] mt-1.5">{diagnosis.why}</p>
          <p className="text-2xs text-[var(--text-muted)] mt-1">{diagnosis.fix}</p>
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
                  // (6) Hộp xác nhận nói rõ ghi vào bao nhiêu ca, bao nhiêu ca đổi số, lệch bao nhiêu tiền.
                  const lines = [
                    active.appliedAt ? "Áp dụng lại lần đối soát này?" : "Áp dụng lần đối soát này?",
                    "",
                    `• Ghi vào ${applySummary?.sessions ?? "?"} ca, từ ${selectedCount} phiên${skipped > 0 ? `, bỏ ${skipped}` : ""}.`
                  ];
                  if (applySummary) {
                    lines.push(`• ${applySummary.up} ca tăng, ${applySummary.down} ca giảm, ${applySummary.same} ca như cũ.`);
                    lines.push(`• Tổng chênh lệch so với số đang hiển thị: ${applySummary.delta >= 0 ? "+" : "−"}${fmtVndFull(Math.abs(applySummary.delta))}.`);
                  }
                  if (trust.known && trust.uoc > 0) {
                    lines.push(`• Chia ước tính theo giờ: ${fmtVndFull(trust.uoc)} (${pctOf(trust.uoc, trust.fileGmv)}%).`);
                  }
                  if (activeIsOld) lines.push("• CẢNH BÁO: lô cũ hơn lô đã áp dụng — số mới sẽ bị đè.");
                  const warn = check.issues.filter((i) => !BLOCKING.includes(i.kind)).length;
                  if (warn > 0) lines.push(`• Còn ${warn} mục ở tab Cần check chưa xử lý.`);
                  if (!(await confirm(lines.join("\n")))) return;
                  const n = await applyReconciliation(active.id);
                  await onApplied();
                  await reloadBatches(active.id);
                  setNote(`Đã cập nhật ${n} ca theo số liệu đối soát.`);
                })}
                disabled={busy || !active.brandId || selectedCount === 0 || blockingIssues.length > 0}
                title={
                  blockingIssues.length > 0
                    ? "Còn lỗi tổng các ca khác tổng file — sửa ở tab Cần check trước, nếu áp dụng sẽ ghi sai tiền vào ca"
                    : active.brandId
                      ? "Ghi đè số các ca khớp bằng số file; chạy lại nhiều lần được, mỗi lần tính lại từ file"
                      : "Lô nạp trước khi đối soát gắn brand — xoá lô rồi tạo lại từ Lịch Sử Import"
                }
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {active.appliedAt ? "Áp Dụng Lại" : "Áp Dụng Đối Soát"}
              </button>
              <button
                onClick={() => void run(async () => {
                  if (!(await confirm(
                    `Xoá lô đối soát ${active.rowCount} phiên, kỳ ${active.periodLabel ? fmtPeriodLabel(active.periodLabel) : "không rõ"}?\n\n`
                    + "KHÔNG HOÀN TÁC ĐƯỢC.\n"
                    + "• Số đã ghi vào ca giữ nguyên, không trả về như trước.\n"
                    + "• Muốn xem lại rổ khớp thì tạo lô mới từ Lịch Sử Import.",
                    { danger: true, confirmLabel: "Xoá lô đối soát" }
                  ))) return;
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
          {blockingIssues.length > 0 && (
            <p className="text-2xs text-rose-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Áp dụng đang bị khoá: {blockingIssues.length} nhóm có tổng các ca khác tổng phiên trong file.{" "}
              <button onClick={() => setView("cancheck")} className="underline font-bold">Xem ở tab Cần check</button>
            </p>
          )}
          {!active.brandId && (
            <p className="text-2xs text-amber-300">
              Lô này nạp khi đối soát còn khớp ca theo giờ với MỌI brand — không áp dụng được nữa. Xoá lô rồi tạo lại từ lần tải ở Lịch Sử Import.
            </p>
          )}

          {view === "ketqua" && (
            <div className="space-y-3">
              {/* (1) Độ chắc của số — theo TIỀN, không theo số nhóm: phần ước tính là phần dễ sai nhất. */}
              {trust.known && trust.fileGmv > 0 && (
                <div className="border border-[var(--border)] bg-[var(--surface)] rounded-2xl p-4">
                  <p className="text-xs font-black text-[var(--text)]">
                    Độ chắc của số
                    <InfoDot label="Đọc dải này thế nào">Chia theo TIỀN, không theo số phiên. “Khớp thẳng từ file” = ca nhận trọn phiên, hoặc ranh giới ca có snapshot đúng giờ. “Ước tính theo giờ” = thiếu snapshot nên rải đều theo thời lượng — tổng vẫn đúng file, nhưng chia giữa các ca là phỏng đoán.</InfoDot>
                  </p>
                  <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-[var(--surface-base)]">
                    <div className="bg-emerald-600" style={{ width: `${pctOf(trust.thang, trust.fileGmv)}%` }} />
                    <div className="bg-violet-600" style={{ width: `${pctOf(trust.tay, trust.fileGmv)}%` }} />
                    <div className="bg-amber-600" style={{ width: `${pctOf(trust.uoc, trust.fileGmv)}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-2xs">
                    <span className="text-emerald-300 font-bold">Khớp thẳng từ file {pctOf(trust.thang, trust.fileGmv)}% · {fmtVndShort(trust.thang)}</span>
                    {trust.tay > 0 && <span className="text-violet-300 font-bold">Gõ tay {pctOf(trust.tay, trust.fileGmv)}% · {fmtVndShort(trust.tay)}</span>}
                    <span className="text-amber-300 font-bold">Ước tính theo giờ {pctOf(trust.uoc, trust.fileGmv)}% · {fmtVndShort(trust.uoc)}</span>
                  </div>
                  {pctOf(trust.uoc, trust.fileGmv) >= 30 && (
                    <p className="text-2xs text-amber-300 mt-2">
                      Phần lớn tiền đang chia bằng phỏng đoán theo giờ. Muốn chắc: tải file giao ca đúng giờ, hoặc gõ số đúng bên dưới.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-2xs">
                <span className="px-2 py-1 rounded-lg border border-emerald-800 text-emerald-300">Nhóm khớp thẳng · {check.counts.chuan} · {fmtVndShort(check.gmv.chuan)}</span>
                <span className="px-2 py-1 rounded-lg border border-dashed border-amber-600 text-amber-300" title="Phiên chạy qua nhiều ca, chưa có snapshot lúc hết ca nên chia theo giờ. Tổng vẫn đúng file.">Nhóm chia ước tính · {check.counts.uocTinh} · {fmtVndShort(check.gmv.uocTinh)}</span>
                <button onClick={() => setView("cancheck")} className={`px-2 py-1 rounded-lg border ${attention > 0 ? "border-rose-500 text-rose-300" : "border-[var(--border)] text-[var(--text-faint)]"}`}>Cần check · {attention}</button>
              </div>

              <div className="border border-[var(--border)] bg-[var(--surface)] rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-black text-[var(--text)]">
                    Phiên khớp ca · đối soát {listedPicked.length}/{listed.length} · {fmtVndFull(listedGmv)}
                    {listedPicked.length < listed.length && <span className="text-amber-300 font-normal"> · phiên bỏ chọn giữ nguyên số hiện có</span>}
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
                {applySummary && applySummary.sessions > 0 && (
                  <p className="text-2xs text-[var(--text-muted)] mb-2">
                    Áp dụng sẽ ghi vào <span className="font-bold text-[var(--text)]">{applySummary.sessions} ca</span>:{" "}
                    <span className="text-emerald-300 font-bold">{applySummary.up} ↑</span> ·{" "}
                    <span className="text-rose-300 font-bold">{applySummary.down} ↓</span> ·{" "}
                    {applySummary.same} không đổi · tổng lệch {applySummary.delta >= 0 ? "+" : "−"}{fmtVndFull(Math.abs(applySummary.delta))}
                    <InfoDot label="Trước → sau">Mũi tên trên ô ca so số sẽ ghi với số ĐANG hiển thị trên ca đó. Rê chuột vào ô ca để thấy cả hai số.</InfoDot>
                  </p>
                )}
                {listed.length > 0 ? roomTable(listed, { pick: true }) : <p className="text-2xs text-[var(--text-faint)]">Không phiên nào khớp ca.</p>}
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <p className="text-2xs text-[var(--text-faint)]">
                    Bấm ô ca (✎) để gõ số đúng.
                    <InfoDot label="Gõ số đúng cho một ca">Biết số đúng của một ca trong phiên nhiều ca thì gõ vào ô ca đó — phần còn lại tự chia cho các ca kia.</InfoDot>
                  </p>
                  {bulkRows.length > 0 && (
                    <button onClick={() => setBulkOpen((v) => !v)} className="text-2xs font-bold text-violet-300 hover:text-violet-200 underline">
                      {bulkOpen ? "Đóng bảng gõ hàng loạt" : `Gõ số hàng loạt (${bulkRows.length} phiên nhiều ca)`}
                    </button>
                  )}
                </div>
              </div>

              {/* (2) Gõ số hàng loạt: mọi ca của phiên vắt nhiều ca trong MỘT bảng, lưu một lần. */}
              {bulkOpen && bulkRows.length > 0 && (
                <div className="border border-violet-800 bg-violet-950/20 rounded-2xl p-4">
                  <p className="text-xs font-black text-[var(--text)]">
                    Gõ số hàng loạt · {bulkRows.length} phiên vắt nhiều ca
                    <InfoDot label="Bảng này để làm gì">Mỗi dòng là một ca của một phiên nhiều ca. Gõ số đúng vào ô nào thì ca đó lấy số đó; ô để trống quay về cách chia tự động. Lưu một lần cho tất cả.</InfoDot>
                  </p>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-2xs min-w-[560px]">
                      <thead>
                        <tr className="text-[var(--text-faint)] text-left">
                          <th className="font-bold pb-1.5 pr-3">Phiên</th>
                          <th className="font-bold pb-1.5 pr-3">Ca</th>
                          <th className="font-bold pb-1.5 pr-3">Cách chia</th>
                          <th className="font-bold pb-1.5 pr-3 text-right">App chia</th>
                          <th className="font-bold pb-1.5 text-right">{platformText("GMV", platform)} đúng của ca</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((r) => {
                          const shs = preview?.get(r.id) ?? [];
                          return shs.map((sh, i) => {
                            const k = bulkKey(r.id, sh.sessionId);
                            const draft = bulkDraft.get(k);
                            const shown = draft !== undefined ? draft : sh.method === "manual" ? String(Math.round(sh.gmv)) : "";
                            return (
                              <tr key={k} className="border-t border-[var(--border)]/60">
                                <td className="py-1.5 pr-3 text-[var(--text-faint)] whitespace-nowrap">
                                  {i === 0 ? `${fmtTime(r.startedAt)} → ${fmtTime(r.endedAt)}` : ""}
                                </td>
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
                                    className="w-36 px-2 py-1 rounded-md bg-[var(--surface-base)] border border-[var(--border)] text-2xs font-bold text-right text-[var(--text)] focus:outline-none focus:border-violet-500"
                                  />
                                </td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <button
                      onClick={() => void saveBulk()}
                      disabled={busy || bulkChanged.length === 0}
                      className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors"
                    >
                      Lưu {bulkChanged.length} ô đã đổi
                    </button>
                    <button onClick={() => setBulkDraft(new Map())} disabled={busy || bulkDraft.size === 0} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40">
                      Hoàn tác các ô đang gõ
                    </button>
                    <button onClick={() => void clearAllTyped()} disabled={busy} className="text-2xs text-[var(--text-muted)] hover:text-rose-300 underline disabled:opacity-40">
                      Bỏ hết số gõ tay của lô này
                    </button>
                  </div>
                </div>
              )}

              {(unassignedRows.length > 0 || inhouseRows.length > 0) && (
                <details className="border border-[var(--border)] bg-[var(--surface-base)] rounded-2xl p-4">
                  <summary className="text-xs font-black text-[var(--text)] cursor-pointer">
                    Phiên ngoài lịch ca · {unassignedRows.length + inhouseRows.length} phiên · {fmtVndFull(otherRows.reduce((s, r) => s + r.gmv, 0))}
                  </summary>
                  <p className="text-2xs text-[var(--text-muted)] mt-1">Không nằm trong khung giờ ca nào của agency — không ảnh hưởng số ca. Gán inhouse nếu là brand tự live.</p>
                  {unassignedRows.length > 0 && (
                    <div className="mt-3">
                      {/* (3) Tick từng dòng rồi gán, thay vì chỉ có nút "cả rổ"; hiện 50 dòng một lần thay vì cứng 20. */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <p className="text-2xs font-bold text-[var(--text)]">
                          Chưa gán nhãn · {unassignedRows.length}
                          {outsideSel.size > 0 && <span className="text-sky-300 font-normal"> · đang chọn {outsideSel.size}</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => setOutsideSel(new Set(unassignedRows.slice(0, outsideShown).map((r) => r.id)))}
                            disabled={busy}
                            className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40"
                          >
                            Chọn các dòng đang hiện
                          </button>
                          <button
                            onClick={() => setOutsideSel(new Set())}
                            disabled={busy || outsideSel.size === 0}
                            className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40"
                          >
                            Bỏ chọn
                          </button>
                          <button
                            onClick={() => void run(async () => {
                              const ids = unassignedRows.filter((r) => outsideSel.has(r.id)).map((r) => r.id);
                              if (ids.length === 0) throw new Error("Chưa chọn phiên nào.");
                              const n = await setReconciliationRowsBucket(active.id, ids, "inhouse");
                              setRows(await fetchReconciliationRows(active.id));
                              setOutsideSel(new Set());
                              setNote(`Đã gán ${n} phiên đã chọn thành ca inhouse.`);
                            })}
                            disabled={busy || outsideSel.size === 0}
                            className="text-2xs font-bold px-3 py-1.5 rounded-lg bg-sky-900 hover:bg-sky-800 text-sky-200 disabled:opacity-40 transition-colors"
                          >
                            Gán {outsideSel.size || ""} phiên đã chọn là inhouse
                          </button>
                          <button
                            onClick={() => void run(async () => {
                              if (!(await confirm(`Gán cả ${unassignedRows.length} phiên chưa gán nhãn thành ca inhouse của brand?`))) return;
                              const n = await setReconciliationBucket(active.id, "unassigned", "inhouse");
                              setRows(await fetchReconciliationRows(active.id));
                              setNote(`Đã gán ${n} phiên thành ca inhouse.`);
                            })}
                            disabled={busy}
                            className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40"
                          >
                            Gán cả rổ
                          </button>
                        </div>
                      </div>
                      {roomTable(unassignedRows.slice(0, outsideShown), { select: true })}
                      {unassignedRows.length > outsideShown && (
                        <button onClick={() => setOutsideShown((n) => n + OUTSIDE_PAGE)} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline mt-2">
                          Xem thêm {Math.min(OUTSIDE_PAGE, unassignedRows.length - outsideShown)} phiên (còn {unassignedRows.length - outsideShown})
                        </button>
                      )}
                    </div>
                  )}
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
            </div>
          )}

          {view === "cancheck" && (
            <div className="space-y-3">
              <div className={`border rounded-2xl p-4 ${check.counts.canCheck > 0 ? "border-rose-800 bg-rose-950/20" : "border-emerald-800 bg-emerald-950/20"}`}>
                <p className="text-xs font-black text-[var(--text)]">Kiểm tra theo nhóm ca–phiên · {check.groups.length} nhóm</p>
                <p className="text-2xs text-[var(--text-muted)] mt-0.5 max-w-2xl">
                  Tổng các ca của nhóm phải bằng tổng phiên trong file. Bấm một dòng lỗi để nhảy tới đúng phiên ở tab Kết quả.
                  <InfoDot label="Nhóm liên thông là gì">Ca nối, restart và ngắt giữa chừng dùng chung một phép kiểm này.</InfoDot>
                </p>
                {check.issues.length === 0 ? (
                  <p className="text-2xs text-emerald-300 mt-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Tổng các ca khớp file ở mọi nhóm, không ca nào lệch hay thiếu phiên.</p>
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
              </div>

              {mergeGroups.length > 0 && (
                <div className="border border-violet-800 bg-violet-950/30 rounded-2xl p-4">
                  <p className="text-xs font-black text-[var(--text)]">Ca bị restart / ngắt giữa chừng · {mergeGroups.length} nhóm</p>
                  <p className="text-2xs text-[var(--text-muted)] mt-0.5 max-w-2xl">
                    Mỗi lần tắt bật stream sàn sinh thêm một phiên (có khi chỉ 1–2 phút, {platformText("GMV", platform)} 0). Gộp lại thành một phiên: giờ từ đầu tới cuối, {platformText("GMV", platform)}/đơn/lượt xem cộng lại (tổng không đổi). Chưa ghi gì vào ca cho tới khi bạn bấm Áp dụng.
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
                  <button
                    onClick={() => void run(async () => {
                      if (mergePicked.length === 0) throw new Error("Chưa chọn nhóm nào để gộp.");
                      // (8) Gộp không tách lại được ⇒ hộp đỏ, nói rõ hệ quả, nút ghi đúng việc.
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
