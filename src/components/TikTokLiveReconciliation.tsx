import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, LiveSessionReconciliation, ReconciliationFlagReason, TikTokLiveImport, TikTokLiveImportRow } from "../types";
import {
  createImportFromDataRaw,
  fetchImports,
  fetchImportRows,
  fetchDataRawLiveAnalysisBatches,
  isFullMonthPeriod,
  matchImportRows,
  vnParts,
  compareSessionTimes,
  fetchReconciliationsForSessions,
  RECONCILE_THRESHOLDS,
  updateRowMatch,
  applyReconciliation,
  DataRawLiveAnalysisOption
} from "../lib/db/tiktokReconciliation";
import { FileSpreadsheet, CheckCircle2, AlertTriangle, RefreshCw, Database, Download, Clock } from "lucide-react";

interface TikTokLiveReconciliationProps {
  sessions: LiveSession[];
  onSessionUpdated: (session: LiveSession) => void;
}

const fmtMoney = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("vi-VN") + "đ");

// "2026-08-01" + "2026-08-31" -> "Tháng 08/2026" (đủ tháng) hoặc "01/08 → 18/08/2026" (chưa đủ)
function fmtPeriod(periodStart?: string, periodEnd?: string): string {
  if (!periodStart || !periodEnd) return "—";
  if (isFullMonthPeriod(periodStart, periodEnd)) return `Tháng ${periodStart.slice(5, 7)}/${periodStart.slice(0, 4)}`;
  const d = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return `${d(periodStart)} → ${d(periodEnd)}/${periodEnd.slice(0, 4)}`;
}

// "+95p" / "-12p" — dấu giữ nguyên để ops đọc được chiều lệch (dương = TikTok muộn/dài hơn khai báo)
const fmtDelta = (n: number | undefined) => (n === undefined ? "—" : `${n > 0 ? "+" : ""}${n}p`);

const FLAG_LABELS: Record<ReconciliationFlagReason, string> = {
  gmv: "Lệch GMV",
  start_time: "Lệch giờ bắt đầu",
  duration: "Lệch thời lượng"
};

function confidenceBadge(c: TikTokLiveImportRow["matchConfidence"]) {
  if (c === "time_overlap" || c === "manual" || c === "room_id") {
    return <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Đã Khớp</span>;
  }
  return <span className="bg-amber-950/60 text-amber-400 border border-amber-800/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Chưa Khớp</span>;
}

export const TikTokLiveReconciliation: React.FC<TikTokLiveReconciliationProps> = ({ sessions, onSessionUpdated }) => {
  const [imports, setImports] = useState<TikTokLiveImport[]>([]);
  const [datarawOptions, setDatarawOptions] = useState<DataRawLiveAnalysisOption[]>([]);
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const [rows, setRows] = useState<TikTokLiveImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDataRawId, setLoadingDataRawId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [reconciliations, setReconciliations] = useState<LiveSessionReconciliation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const activeImport = imports.find((i) => i.id === activeImportId);

  useEffect(() => {
    fetchImports().then(setImports).catch((e) => setError(e.message));
    fetchDataRawLiveAnalysisBatches().then(setDatarawOptions).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!activeImportId) { setRows([]); return; }
    const brandId = imports.find((i) => i.id === activeImportId)?.brandId;
    setLoading(true);
    fetchImportRows(activeImportId)
      .then((r) => setRows(matchImportRows(r, sessions, brandId)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeImportId, sessions, imports]);

  // Bản đối soát đã ghi của các session trong batch — nguồn cho bảng "Cảnh Báo Lệch". Tách khỏi
  // effect trên vì còn phải gọi lại sau mỗi lần apply (RPC vừa sinh thêm bản ghi mới).
  const refreshReconciliations = React.useCallback(async (currentRows: TikTokLiveImportRow[]) => {
    const ids = Array.from(new Set(currentRows.map((r) => r.matchedSessionId).filter(Boolean) as string[]));
    try {
      setReconciliations(await fetchReconciliationsForSessions(ids));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { refreshReconciliations(rows); }, [rows, refreshReconciliations]);

  const handleLoadFromDataRaw = async (option: DataRawLiveAnalysisOption) => {
    setLoadingDataRawId(option.id);
    setError(null);
    try {
      const { batch, rows: created } = await createImportFromDataRaw(option);
      setImports((prev) => [batch, ...prev.filter((i) => i.id !== batch.id)]);
      setActiveImportId(batch.id);
      setRows(matchImportRows(created, sessions, batch.brandId));
    } catch (e: any) {
      setError(e.message || "Không nạp được batch từ Dữ Liệu Gốc.");
    } finally {
      setLoadingDataRawId(null);
    }
  };

  const handleOverrideMatch = async (rowId: string, sessionId: string) => {
    const confidence = sessionId ? "manual" : undefined;
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, matchedSessionId: sessionId || undefined, matchConfidence: confidence } : r)));
    try {
      await updateRowMatch(rowId, sessionId || null, confidence);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleApply = async (row: TikTokLiveImportRow) => {
    if (!row.matchedSessionId) return;
    setApplyingId(row.id);
    setError(null);
    try {
      const updated = await applyReconciliation(row.id, row.matchedSessionId);
      onSessionUpdated(updated);
      await refreshReconciliations(rows);
    } catch (e: any) {
      setError(e.message || "Không áp dụng được đối soát cho dòng này.");
    } finally {
      setApplyingId(null);
    }
  };

  // Áp dụng hàng loạt cho các dòng đã khớp & chưa đối soát. Chạy tuần tự (không Promise.all) vì
  // mỗi lần apply là 1 RPC ghi đè live_sessions — chạy song song dễ vượt rate limit và khó báo
  // đúng dòng nào lỗi; số dòng 1 tháng chỉ vài chục nên tuần tự vẫn nhanh.
  const handleBulkApply = async () => {
    const pending = rows.filter((r) => r.matchedSessionId && sessions.find((s) => s.id === r.matchedSessionId)?.dataSource !== "tiktok_reconciled");
    if (pending.length === 0) return;
    setError(null);
    let done = 0;
    const failed: string[] = [];
    for (const row of pending) {
      setBulkProgress(`Đang áp dụng ${done + 1}/${pending.length}...`);
      try {
        const updated = await applyReconciliation(row.id, row.matchedSessionId!);
        onSessionUpdated(updated);
        done++;
      } catch (e: any) {
        failed.push(`${row.creatorName || "?"} ${vnParts(row.startTime).label}: ${e.message ?? e}`);
      }
    }
    setBulkProgress(null);
    await refreshReconciliations(rows);
    if (failed.length > 0) setError(`Áp dụng xong ${done}/${pending.length} dòng. Lỗi: ${failed.join(" | ")}`);
  };

  const matchedCount = rows.filter((r) => r.matchedSessionId).length;
  const pendingApplyCount = rows.filter(
    (r) => r.matchedSessionId && sessions.find((s) => s.id === r.matchedSessionId)?.dataSource !== "tiktok_reconciled"
  ).length;

  const sessionOptionsByDate = useMemo(() => {
    const map: Record<string, LiveSession[]> = {};
    sessions.forEach((s) => {
      if (s.platform !== "TikTok") return;
      if (activeImport?.brandId && s.brandId !== activeImport.brandId) return;
      map[s.date] = map[s.date] || [];
      map[s.date].push(s);
    });
    return map;
  }, [sessions, activeImport?.brandId]);

  const flaggedList = useMemo(() => reconciliations.filter((r) => r.flagged), [reconciliations]);

  const loadedDataRawIds = useMemo(
    () => new Set(imports.map((i) => i.datarawImportId).filter(Boolean) as string[]),
    [imports]
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-950/40 border border-red-800/50 text-red-400 text-xs font-semibold p-3 rounded-xl flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Nguồn dữ liệu: kho Dữ Liệu Gốc của từng brand */}
      <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-3">
        <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Đối Soát Số Liệu TikTok
        </h3>
        <p className="text-xs text-[var(--text-muted)]">
          Dữ liệu lấy từ report <b>Live Analysis</b> đã lưu trong module <b>Dữ Liệu Gốc</b> của từng brand — không upload file ở đây nữa.
          Chọn batch cần đối soát bên dưới, hệ thống tự khớp theo ngày + tên host + giờ bắt đầu gần nhất trong phạm vi brand đó,
          sau đó ghi đè số liệu tạm tính bằng số chính thức từ TikTok.
        </p>

        {datarawOptions.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)] bg-[var(--surface-elevated)]/40 border border-dashed border-[var(--border)] rounded-xl p-4 flex items-center gap-2">
            <Database className="w-4 h-4 shrink-0" />
            Chưa có brand nào upload report "Live Analysis" vào Dữ Liệu Gốc. Vào Brand Workspace → Dữ Liệu Gốc → tab Live Analysis để upload trước.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {datarawOptions.map((opt) => {
              const full = isFullMonthPeriod(opt.periodStart, opt.periodEnd);
              const alreadyLoaded = loadedDataRawIds.has(opt.id);
              return (
                <div key={opt.id} className="border border-[var(--border)] bg-[var(--surface-elevated)]/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-[var(--text)] text-xs truncate">{opt.brandName}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{fmtPeriod(opt.periodStart, opt.periodEnd)} · {opt.rowCount} phiên</p>
                    </div>
                    {full ? (
                      <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0">Đủ Cả Tháng</span>
                    ) : (
                      <span className="bg-amber-950/60 text-amber-400 border border-amber-800/50 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0">Chưa Đủ Tháng</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleLoadFromDataRaw(opt)}
                    disabled={loadingDataRawId === opt.id}
                    className="w-full bg-[var(--accent)] text-[var(--accent-text)] font-bold px-3 py-1.5 rounded-lg text-[11px] disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {loadingDataRawId === opt.id ? "Đang nạp..." : alreadyLoaded ? "Nạp Lại" : "Nạp Vào Đối Soát"}
                  </button>
                  {alreadyLoaded && (
                    <p className="text-[10px] text-[var(--text-faint)]">Nạp lại sẽ dựng lại danh sách khớp từ đầu (mất các match đã sửa tay), session đã đối soát không bị ảnh hưởng.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Import history */}
      {imports.length > 0 && (
        <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-2">
          <h4 className="font-bold text-[var(--text)] text-xs">Batch Đã Nạp</h4>
          <div className="flex flex-wrap gap-2">
            {imports.map((imp) => (
              <button
                key={imp.id}
                onClick={() => setActiveImportId(imp.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-xl border ${
                  activeImportId === imp.id ? "bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                {imp.brandName ? `${imp.brandName} · ` : ""}{fmtPeriod(imp.periodStart, imp.periodEnd)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Match & apply */}
      {activeImportId && (
        <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-bold text-[var(--text)] text-xs flex items-center gap-2">
              Khớp Session ({matchedCount}/{rows.length} đã khớp)
              {activeImport?.brandName && <span className="text-[var(--text-muted)] font-semibold">· {activeImport.brandName}</span>}
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />}
            </h4>
            <button
              onClick={handleBulkApply}
              disabled={pendingApplyCount === 0 || bulkProgress !== null}
              className="bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {bulkProgress ?? `Áp Dụng Tất Cả Đã Khớp (${pendingApplyCount})`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-[var(--surface-elevated)]">
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="p-2">Host (TikTok)</th>
                  <th className="p-2">Bắt đầu</th>
                  <th className="p-2">GMV TikTok</th>
                  <th className="p-2">Session Khớp</th>
                  <th className="p-2">GMV Hiện Tại (Manual)</th>
                  <th className="p-2">Lệch Giờ (TikTok − Khai Báo)</th>
                  <th className="p-2">Trạng Thái</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowVn = vnParts(row.startTime);
                  const candidates = sessionOptionsByDate[rowVn.date] || [];
                  const matchedSession = sessions.find((s) => s.id === row.matchedSessionId);
                  const alreadyReconciled = matchedSession?.dataSource === "tiktok_reconciled";
                  const delta = matchedSession ? compareSessionTimes(row, matchedSession) : undefined;
                  return (
                    <tr key={row.id} className="border-t border-[var(--border-muted)]">
                      <td className="p-2 font-semibold text-[var(--text)]">{row.creatorName || "—"}</td>
                      <td className="p-2 text-[var(--text-muted)]">{rowVn.label}</td>
                      <td className="p-2 font-semibold text-[var(--text)]">{fmtMoney(row.gmv)}</td>
                      <td className="p-2">
                        <select
                          value={row.matchedSessionId || ""}
                          onChange={(e) => handleOverrideMatch(row.id, e.target.value)}
                          className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] text-[var(--text)]"
                        >
                          <option value="">— Chưa chọn —</option>
                          {candidates.map((s) => (
                            <option key={s.id} value={s.id}>{s.hostName} — {s.startTime} ({s.brandName})</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-[var(--text-muted)]">{matchedSession ? fmtMoney(matchedSession.actualGmv) : "—"}</td>
                      <td className="p-2">
                        {!delta ? (
                          <span className="text-[var(--text-faint)]">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 font-semibold ${delta.startFlagged || delta.durationFlagged ? "text-amber-500" : "text-[var(--text-muted)]"}`}>
                            {(delta.startFlagged || delta.durationFlagged) && <AlertTriangle className="w-3 h-3 shrink-0" />}
                            Bắt đầu {fmtDelta(delta.startDeltaMinutes)} · Thời lượng {fmtDelta(delta.durationDeltaMinutes)}
                          </span>
                        )}
                      </td>
                      <td className="p-2">{alreadyReconciled ? <span className="inline-flex items-center gap-1 text-emerald-500 font-bold text-[10px]"><CheckCircle2 className="w-3.5 h-3.5" /> Đã Đối Soát</span> : confidenceBadge(row.matchConfidence)}</td>
                      <td className="p-2">
                        <button
                          onClick={() => handleApply(row)}
                          disabled={!row.matchedSessionId || applyingId === row.id || alreadyReconciled}
                          className="bg-[var(--accent)] text-[var(--accent-text)] font-bold px-3 py-1 rounded-lg text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {applyingId === row.id ? "..." : alreadyReconciled ? "Xong" : "Áp Dụng"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cảnh báo sau đối soát — bản ghi live_session_reconciliations bị gắn cờ (migration 0054).
          Lệch giờ KHÔNG tự sửa giờ công: lương vẫn theo số host khai + ops duyệt, đây chỉ là
          danh sách để ops rà lại xem host khai sai hay match sai session. */}
      {activeImportId && flaggedList.length > 0 && (
        <div className="bg-[var(--surface)] p-4 rounded-2xl border border-amber-800/40 shadow-sm space-y-3">
          <h4 className="font-bold text-amber-500 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Cảnh Báo Lệch Sau Đối Soát ({flaggedList.length})
          </h4>
          <p className="text-[11px] text-[var(--text-muted)]">
            Ngưỡng gắn cờ: GMV lệch &gt;{RECONCILE_THRESHOLDS.gmvPct}%, giờ bắt đầu lệch &gt;{RECONCILE_THRESHOLDS.startMinutes} phút,
            thời lượng lệch &gt;{RECONCILE_THRESHOLDS.durationMinutes} phút. Giờ công tính lương <b>không bị ghi đè</b> — vẫn theo số host khai + ops duyệt.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-[var(--surface-elevated)]">
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="p-2">Session</th>
                  <th className="p-2">Lý Do</th>
                  <th className="p-2">GMV Khai → TikTok</th>
                  <th className="p-2">Bắt Đầu Khai → TikTok</th>
                  <th className="p-2">Thời Lượng Khai → TikTok</th>
                </tr>
              </thead>
              <tbody>
                {flaggedList.map((rc) => {
                  const s = sessions.find((x) => x.id === rc.sessionId);
                  return (
                    <tr key={rc.id} className="border-t border-[var(--border-muted)]">
                      <td className="p-2 font-semibold text-[var(--text)]">
                        {s ? `${s.hostName} — ${s.date} ${s.startTime}` : rc.sessionId.slice(0, 8)}
                      </td>
                      <td className="p-2">
                        <span className="flex flex-wrap gap-1">
                          {rc.flagReasons.map((r) => (
                            <span key={r} className="bg-amber-950/60 text-amber-400 border border-amber-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                              {FLAG_LABELS[r]}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="p-2 text-[var(--text-muted)]">
                        {fmtMoney(rc.manualActualGmv)} → {fmtMoney(rc.tiktokActualGmv)}
                        {rc.gmvDeltaPct !== undefined && <span className="text-amber-500 font-semibold"> ({rc.gmvDeltaPct > 0 ? "+" : ""}{rc.gmvDeltaPct}%)</span>}
                      </td>
                      <td className="p-2 text-[var(--text-muted)]">
                        {rc.manualStartTime ? vnParts(rc.manualStartTime).label : "—"} → {rc.tiktokStartTime ? vnParts(rc.tiktokStartTime).label : "—"}
                        <span className="text-amber-500 font-semibold"> ({fmtDelta(rc.startDeltaMinutes)})</span>
                      </td>
                      <td className="p-2 text-[var(--text-muted)]">
                        {rc.manualDurationMinutes ?? "—"}p → {rc.tiktokDurationMinutes ?? "—"}p
                        <span className="text-amber-500 font-semibold"> ({fmtDelta(rc.durationDeltaMinutes)})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
