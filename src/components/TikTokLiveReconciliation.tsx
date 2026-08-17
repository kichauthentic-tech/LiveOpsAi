import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, TikTokLiveImport, TikTokLiveImportRow } from "../types";
import {
  parseLiveAnalysisExcel,
  createImport,
  fetchImports,
  fetchImportRows,
  matchImportRows,
  updateRowMatch,
  applyReconciliation,
  ParsedImportRow
} from "../lib/db/tiktokReconciliation";
import { FileSpreadsheet, CheckCircle2, AlertTriangle, RefreshCw, Upload } from "lucide-react";

interface TikTokLiveReconciliationProps {
  sessions: LiveSession[];
  onSessionUpdated: (session: LiveSession) => void;
}

const fmtMoney = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("vi-VN") + "đ");

function confidenceBadge(c: TikTokLiveImportRow["matchConfidence"]) {
  if (c === "time_overlap" || c === "manual" || c === "room_id") {
    return <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Đã Khớp</span>;
  }
  return <span className="bg-amber-950/60 text-amber-400 border border-amber-800/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Chưa Khớp</span>;
}

export const TikTokLiveReconciliation: React.FC<TikTokLiveReconciliationProps> = ({ sessions, onSessionUpdated }) => {
  const [imports, setImports] = useState<TikTokLiveImport[]>([]);
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const [rows, setRows] = useState<TikTokLiveImportRow[]>([]);
  const [parsedPreview, setParsedPreview] = useState<ParsedImportRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchImports().then(setImports).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!activeImportId) { setRows([]); return; }
    setLoading(true);
    fetchImportRows(activeImportId)
      .then((r) => setRows(matchImportRows(r, sessions)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeImportId, sessions]);

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const parsed = await parseLiveAnalysisExcel(file);
      if (parsed.length === 0) throw new Error("Không đọc được dòng dữ liệu nào từ file.");
      setParsedPreview(parsed);
    } catch (e: any) {
      setError(e.message || "Không đọc được file.");
      setParsedPreview(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedPreview) return;
    setLoading(true);
    setError(null);
    try {
      const dates = parsedPreview.map((r) => r.startTime.slice(0, 10)).sort();
      const periodStart = dates[0];
      const periodEnd = dates[dates.length - 1];
      const { batch, rows: created } = await createImport(periodStart, periodEnd, parsedPreview);
      setImports((prev) => [batch, ...prev]);
      setParsedPreview(null);
      setFileName("");
      setActiveImportId(batch.id);
      setRows(matchImportRows(created, sessions));
    } catch (e: any) {
      setError(e.message || "Không tạo được import.");
    } finally {
      setLoading(false);
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
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, matchConfidence: r.matchConfidence } : r)));
    } catch (e: any) {
      setError(e.message || "Không áp dụng được đối soát cho dòng này.");
    } finally {
      setApplyingId(null);
    }
  };

  const matchedCount = rows.filter((r) => r.matchedSessionId).length;
  const sessionOptionsByDate = useMemo(() => {
    const map: Record<string, LiveSession[]> = {};
    sessions.forEach((s) => {
      if (s.platform !== "TikTok") return;
      map[s.date] = map[s.date] || [];
      map[s.date].push(s);
    });
    return map;
  }, [sessions]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-950/40 border border-red-800/50 text-red-400 text-xs font-semibold p-3 rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Upload */}
      <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
        <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Đối Soát Số Liệu TikTok Cuối Tháng
        </h3>
        <p className="text-xs text-[var(--text-muted)]">
          Upload file "Live Analysis" export từ TikTok Shop. Hệ thống tự khớp theo ngày + tên host + giờ bắt đầu gần nhất (file không có Room ID nên luôn cần xác nhận lại trước khi áp dụng), sau đó ghi đè số liệu tạm tính bằng số chính thức từ TikTok.
        </p>

        {!parsedPreview ? (
          <label className="border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)]/40 p-8 rounded-2xl text-center space-y-3 cursor-pointer hover:bg-[var(--surface-hover)] block">
            <Upload className="w-10 h-10 text-[var(--text-muted)] mx-auto" />
            <p className="font-bold text-[var(--text)] text-sm">Kéo & Thả hoặc Chọn File Excel Live Analysis</p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[var(--text)]">
              Đã đọc <span className="text-emerald-500">{parsedPreview.length}</span> dòng từ <span className="italic">{fileName}</span>
            </p>
            <div className="max-h-52 overflow-y-auto border border-[var(--border)] rounded-xl">
              <table className="w-full text-[11px]">
                <thead className="bg-[var(--surface-elevated)] sticky top-0">
                  <tr className="text-left text-[var(--text-muted)]">
                    <th className="p-2">Host</th><th className="p-2">Bắt đầu</th><th className="p-2">GMV Live</th><th className="p-2">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedPreview.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-[var(--border-muted)]">
                      <td className="p-2">{r.creatorName || "—"}</td>
                      <td className="p-2">{new Date(r.startTime).toLocaleString("vi-VN")}</td>
                      <td className="p-2">{fmtMoney(r.gmv)}</td>
                      <td className="p-2">{r.views ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedPreview.length > 50 && <p className="text-[10px] text-[var(--text-faint)] p-2">...và {parsedPreview.length - 50} dòng khác</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={handleConfirmImport} disabled={loading} className="bg-[var(--accent)] text-[var(--accent-text)] font-bold px-4 py-2 rounded-xl text-xs disabled:opacity-50">
                {loading ? "Đang tạo..." : "Xác Nhận Import"}
              </button>
              <button onClick={() => { setParsedPreview(null); setFileName(""); }} className="bg-[var(--surface-hover)] text-[var(--text-muted)] font-bold px-4 py-2 rounded-xl text-xs">
                Huỷ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Import history */}
      {imports.length > 0 && (
        <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-2">
          <h4 className="font-bold text-[var(--text)] text-xs">Lịch Sử Import</h4>
          <div className="flex flex-wrap gap-2">
            {imports.map((imp) => (
              <button
                key={imp.id}
                onClick={() => setActiveImportId(imp.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-xl border ${
                  activeImportId === imp.id ? "bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                {imp.periodStart} → {imp.periodEnd}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Match & apply */}
      {activeImportId && (
        <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-[var(--text)] text-xs">
              Khớp Session ({matchedCount}/{rows.length} đã khớp)
            </h4>
            {loading && <RefreshCw className="w-4 h-4 animate-spin text-[var(--text-muted)]" />}
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
                  <th className="p-2">Trạng Thái</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowDate = row.startTime.slice(0, 10);
                  const candidates = sessionOptionsByDate[rowDate] || [];
                  const matchedSession = sessions.find((s) => s.id === row.matchedSessionId);
                  const alreadyReconciled = matchedSession?.dataSource === "tiktok_reconciled";
                  return (
                    <tr key={row.id} className="border-t border-[var(--border-muted)]">
                      <td className="p-2 font-semibold text-[var(--text)]">{row.creatorName || "—"}</td>
                      <td className="p-2 text-[var(--text-muted)]">{new Date(row.startTime).toLocaleString("vi-VN")}</td>
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
    </div>
  );
};
