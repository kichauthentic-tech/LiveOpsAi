import { useEffect, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { LiveSession } from "../types";
import {
  SessionSnapshot,
  applySessionLiveSnapshot,
  deleteSessionLiveSnapshot,
  fetchSessionSnapshot
} from "../lib/db/sessionLiveSnapshots";
import { errorMessage } from "../lib/errorMessage";

interface SessionLiveSnapshotUploadProps {
  session: LiveSession;
  onApplied: (session: LiveSession) => void;
}

function fmtVnd(n: number): string {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + "₫";
}

function fmtTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—";
}

// Trợ live tải file "Creator-Live-Performance" từ TikTok Streamer (Creator Center) ngay khi hết ca rồi up
// vào đúng ca đang trực. Số của ca = hiệu so với lần up gần nhất của cùng Room ID (migration
// 0078) — nên up đúng lúc giao ca là bắt buộc với ca nối, không phải thủ tục cho có.
export function SessionLiveSnapshotUpload({ session, onApplied }: SessionLiveSnapshotUploadProps) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchSessionSnapshot(session.id)
      .then((s) => { if (alive) setSnapshot(s); })
      .catch((e) => { if (alive) setError(errorMessage(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [session.id]);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applySessionLiveSnapshot(session.id, file);
      onApplied(updated);
      setSnapshot(await fetchSessionSnapshot(session.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!window.confirm("Xoá file số liệu của ca này? Ca sẽ quay về số liệu trước khi up (kể cả bản host tự khai tay).")) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await deleteSessionLiveSnapshot(session.id);
      onApplied(updated);
      setSnapshot(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-[11px] text-[var(--text-faint)]">Đang tải số liệu ca...</p>;
  }

  return (
    <div className="space-y-2">
      {snapshot ? (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-2.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-300 truncate">{snapshot.fileName ?? "Đã nạp số liệu"}</p>
                <p className="text-[11px] text-[var(--text-faint)]">
                  Up lúc {fmtTime(snapshot.capturedAt)} · {snapshot.rowCount} phiên trong file
                </p>
              </div>
            </div>
            <button
              onClick={handleDelete}
              disabled={busy}
              title="Xoá nếu up nhầm ca"
              className="shrink-0 text-[var(--text-faint)] hover:text-rose-400 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-[var(--surface-base)] rounded-lg py-1.5">
              <p className="text-[10px] text-[var(--text-faint)]">GMV ca này</p>
              <p className="text-xs font-bold text-emerald-300">{fmtVnd(session.actualGmv ?? 0)}</p>
            </div>
            <div className="bg-[var(--surface-base)] rounded-lg py-1.5">
              <p className="text-[10px] text-[var(--text-faint)]">Đơn</p>
              <p className="text-xs font-bold text-[var(--text)]">{(session.totalOrders ?? 0).toLocaleString("vi-VN")}</p>
            </div>
            <div className="bg-[var(--surface-base)] rounded-lg py-1.5">
              <p className="text-[10px] text-[var(--text-faint)]">Lượt xem</p>
              <p className="text-xs font-bold text-[var(--text)]">{(session.totalViews ?? 0).toLocaleString("vi-VN")}</p>
            </div>
          </div>

          {(session.liveRoomIds?.length ?? 0) > 0 && (
            <p className="text-[11px] text-[var(--text-faint)]">
              Tính từ {session.liveRoomIds!.length} phiên live thuộc ca này
              {session.actualStartAt ? ` · live thật ${fmtTime(session.actualStartAt)} → ${fmtTime(session.actualEndAt)}` : ""}
            </p>
          )}

          {(session.liveRoomIds?.length ?? 0) === 0 && (
            <p className="text-[11px] text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              File không có phiên nào thuộc ca này. Có thể up nhầm ca, hoặc phiên live chưa phát sinh số liệu.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-center">
          <FileSpreadsheet className="w-5 h-5 text-[var(--text-faint)] mx-auto mb-1.5" />
          <p className="text-[11px] text-[var(--text-muted)] mb-2">
            Tải file <span className="font-bold">Creator-Live-Performance</span> từ TikTok Streamer rồi up vào ngay khi hết ca.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] disabled:opacity-40 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            {busy ? "Đang xử lý..." : "Chọn File Số Liệu"}
          </button>
        </div>
      )}

      {snapshot && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] underline disabled:opacity-40"
        >
          {busy ? "Đang xử lý..." : "Up lại file khác cho ca này"}
        </button>
      )}

      {error && (
        <p className="text-[11px] text-rose-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {error}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}
