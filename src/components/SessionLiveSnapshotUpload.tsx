import { useEffect, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Trash2, AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { LiveSession } from "../types";
import {
  SessionSnapshot,
  applySessionLiveSnapshot,
  deleteSessionLiveSnapshot,
  fetchSessionSnapshot,
  setSessionSnapshotGmv
} from "../lib/db/sessionLiveSnapshots";
import { parseSnapshotFile, type ParsedSnapshotFile } from "../lib/liveSnapshot/extractRooms";
import { preloadSpreadsheetReader } from "../lib/dataraw/parseDataRawExcel";
import { applySessionSnapshotPart, fetchRoomLinks, fetchSnapshotParts, type RoomLinks } from "../lib/db/sessionRoomLinks";
import { sortTurns, type BreakReason } from "../lib/liveSnapshot/roomCases";
import { SnapshotRoomPicker } from "./SnapshotRoomPicker";
import { errorMessage } from "../lib/errorMessage";
import { useConfirm } from "../hooks/useConfirm";
import { fmtVndFull } from "../lib/format";
import { profileOf } from "../lib/platforms/profiles";
import { platformOf } from "../lib/reportPlatform";
import { dataSourceTier } from "../lib/dataSource";
import { GmvEditor } from "./GmvEditor";

interface SessionLiveSnapshotUploadProps {
  session: LiveSession;
  onApplied: (session: LiveSession) => void;
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

// Room còn live sau giờ hết ca (dung sai 5 phút) ⇒ số cộng dồn trong file có thể lẫn phần của ca sau (0174).
function runsPastBoundary(snap: SessionSnapshot): boolean {
  const limit = Date.parse(snap.boundaryAt) + 5 * 60_000;
  return snap.rooms.some((r) => !r.endedAt || Date.parse(r.endedAt) > limit);
}

function fmtTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—";
}

// Trợ live tải file số liệu của sàn ngay khi hết ca rồi up vào đúng ca đang trực — TikTok: "Creator-Live-Performance" (Streamer /
// Creator Center), Shopee: "Live List" (Seller Centre). Số của ca = hiệu so với lần up gần nhất của cùng Room ID / phiên (migration
// 0078, Shopee 0154) — nên up đúng lúc giao ca là bắt buộc với ca nối, không phải thủ tục cho có.
export function SessionLiveSnapshotUpload({ session, onApplied }: SessionLiveSnapshotUploadProps) {
  const confirm = useConfirm();
  const prof = profileOf(session);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 0153: ca nối từ ca trước (mốc trừ) và số mảnh của ca bị ngắt room — chỉ để cảnh báo, lỗi đọc thì bỏ qua.
  const [links, setLinks] = useState<RoomLinks>({});
  const [partCount, setPartCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // File đã đọc, đang chờ trợ tick đúng phòng của ca (file tải về là cả ngày nhiều phòng).
  const [pending, setPending] = useState<{ fileName: string; parsed: ParsedSnapshotFile } | null>(null);
  // Đang gõ GMV đúng của ca (0174) — tự mở ngay sau khi up nếu room còn live sau giờ hết ca.
  const [editingGmv, setEditingGmv] = useState(false);

  useEffect(() => { preloadSpreadsheetReader(); }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchRoomLinks(session.id).then((l) => { if (alive) setLinks(l); }).catch(() => undefined);
    fetchSnapshotParts(session.id).then((p) => { if (alive) setPartCount(p.length); }).catch(() => undefined);
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
      setPending({ fileName: file.name, parsed: await parseSnapshotFile(file, platformOf(session)) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Mỗi room tick = một LƯỢT live. Lượt đầu vào snapshot, các lượt sau (restart) vào thành từng mảnh kèm lý do — cùng cơ chế
  // với "Thêm lượt restart" nên về sau sửa/xoá từng lượt được. Một file cả ngày có thể chứa đủ các lượt; lượt nào chưa có
  // trong file thì thêm sau bằng file riêng.
  async function confirmRooms(rows: ParsedSnapshotFile["rows"], reasons: Record<string, BreakReason>) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const turns = sortTurns(rows);
      let updated = await applySessionLiveSnapshot(session.id, pending.fileName, pending.parsed.periodLabel, turns.slice(0, 1));
      onApplied(updated);
      for (const t of turns.slice(1)) {
        updated = await applySessionSnapshotPart(session.id, reasons[t.roomId] ?? "network", "", pending.fileName, pending.parsed.periodLabel, [t]);
        onApplied(updated);
      }
      fetchSnapshotParts(session.id).then((p) => setPartCount(p.length)).catch(() => undefined);
      const snap = await fetchSessionSnapshot(session.id);
      setSnapshot(snap);
      setPending(null);
      setEditingGmv(!!snap && runsPastBoundary(snap));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Gõ GMV đúng (null = bỏ số gõ, về số file). DB quy room còn live về giờ hết ca, đơn/lượt xem theo % GMV, phần dư sang ca sau.
  async function saveGmv(gmv: number | null) {
    setBusy(true);
    setError(null);
    try {
      onApplied(await setSessionSnapshotGmv(session.id, gmv));
      setSnapshot(await fetchSessionSnapshot(session.id));
      setEditingGmv(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!(await confirm("Xoá file số liệu của ca này? Ca sẽ quay về số liệu trước khi up (kể cả bản host tự khai tay).", { danger: true }))) return;
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

  if (pending) {
    return (
      <div className="space-y-2">
        <SnapshotRoomPicker
          session={session}
          rows={pending.parsed.rows}
          fileName={pending.fileName}
          previouslySelected={snapshot?.rooms.map((r) => r.roomId)}
          prevBaseline={links.prev?.boundaryAt ? { boundaryMs: Date.parse(links.prev.boundaryAt), roomIds: links.prev.roomIds, label: `${links.prev.startTime}–${links.prev.endTime}` } : undefined}
          confirmLabel="Xác nhận phòng của ca này"
          busy={busy}
          askRestartReasons
          onConfirm={(rows, reasons) => void confirmRooms(rows, reasons)}
          onCancel={() => { setPending(null); setError(null); }}
        />
        {error && (
          <p className="text-[11px] text-rose-400 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            {error}
          </p>
        )}
      </div>
    );
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
                  Up lúc {fmtTime(snapshot.capturedAt)} · {snapshot.rowCount} {prof.liveFileRowNoun} trong file
                </p>
              </div>
            </div>
            <button
              onClick={handleDelete}
              disabled={busy}
              title="Xoá nếu up nhầm ca"
              className="p-1.5 -m-1.5 rounded shrink-0 text-[var(--text-faint)] hover:text-rose-400 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-[var(--surface-base)] rounded-lg py-1.5">
              <p className="text-[11px] text-[var(--text-faint)]">GMV ca này</p>
              <p className="text-xs font-bold text-emerald-300">{fmtVndFull(session.actualGmv ?? 0)}</p>
            </div>
            <div className="bg-[var(--surface-base)] rounded-lg py-1.5">
              <p className="text-[11px] text-[var(--text-faint)]">Orders</p>
              <p className="text-xs font-bold text-[var(--text)]">{(session.totalOrders ?? 0).toLocaleString("vi-VN")}</p>
            </div>
            <div className="bg-[var(--surface-base)] rounded-lg py-1.5">
              <p className="text-[11px] text-[var(--text-faint)]">{prof.viewsLabel}</p>
              <p className="text-xs font-bold text-[var(--text)]">{(session.totalViews ?? 0).toLocaleString("vi-VN")}</p>
            </div>
          </div>

          {editingGmv ? (
            <div className="space-y-1">
              <p className="text-[11px] text-[var(--text-muted)]">
                {runsPastBoundary(snapshot)
                  ? `Room vẫn live sau giờ hết ca ${fmtClock(snapshot.boundaryAt)} khi tải file — số trên có thể lẫn phần của ca sau. Gõ GMV đúng của ca (số trên dashboard lúc giao ca):`
                  : "Gõ GMV đúng của ca:"}
              </p>
              <GmvEditor initial={snapshot.typedGmv ?? session.actualGmv} busy={busy} onSave={(v) => void saveGmv(v)} onCancel={() => setEditingGmv(false)} />
              <p className="text-[11px] text-[var(--text-faint)]">Đơn, lượt xem… tự chia theo % GMV; phần dư tự sang ca sau.</p>
            </div>
          ) : snapshot.typedGmv != null ? (
            <p className="text-[11px] text-violet-300 flex items-center gap-1.5 flex-wrap">
              <Pencil className="w-3.5 h-3.5 shrink-0" />
              GMV gõ tay {fmtVndFull(snapshot.typedGmv)} — đơn, lượt xem theo % GMV, phần dư đã sang ca sau.
              <button onClick={() => setEditingGmv(true)} disabled={busy} className="underline hover:text-violet-200 disabled:opacity-40">Sửa</button>
              <button onClick={() => void saveGmv(null)} disabled={busy} className="underline text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-40">Bỏ, dùng số file</button>
            </p>
          ) : (
            <div className="flex items-start gap-2 flex-wrap">
              {runsPastBoundary(snapshot) && (
                <p className="text-[11px] text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  Room vẫn live sau giờ hết ca {fmtClock(snapshot.boundaryAt)} khi tải file — GMV trên có thể lẫn phần của ca sau.
                </p>
              )}
              <button
                onClick={() => setEditingGmv(true)}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-300 hover:text-violet-200 disabled:opacity-40"
              >
                <Pencil className="w-3 h-3" /> Sửa GMV đúng của ca
              </button>
            </div>
          )}

          {(session.liveRoomIds?.length ?? 0) > 0 && (
            <p className="text-[11px] text-[var(--text-faint)]">
              Tính từ {session.liveRoomIds!.length} {prof.liveFileRowNoun} live thuộc ca này
              {session.actualStartAt ? ` · live thật ${fmtTime(session.actualStartAt)} → ${fmtTime(session.actualEndAt)}` : ""}
            </p>
          )}

          {(session.liveRoomIds?.length ?? 0) === 0 && (
            <p className="text-[11px] text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              File không có {prof.liveFileRowNoun} nào thuộc ca này. Có thể up nhầm ca, hoặc chưa phát sinh số liệu.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-center">
          <FileSpreadsheet className="w-5 h-5 text-[var(--text-faint)] mx-auto mb-1.5" />
          <p className="text-[11px] text-[var(--text-muted)] mb-2">
            Tải file <span className="font-bold">{prof.reconciliationFile}</span> từ {prof.liveFileWhere} rồi up vào ngay khi hết ca.
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

      {dataSourceTier(session) === "reconciled" && (
        <p className="text-[11px] text-sky-300 flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
          Ca đã đối soát bằng file sàn: up hay xoá file ở đây không đổi số của ca, chỉ dùng làm mốc khi bấm Áp dụng lại ở Đối soát.
        </p>
      )}

      {links.prev && !links.prev.hasSnapshot && (
        <p className="text-[11px] text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          Ca này nối từ ca {links.prev.startTime}–{links.prev.endTime} nhưng ca đó chưa up file lúc giao ca — số của ca này sẽ chưa hiện cho tới khi ca đó up.
        </p>
      )}

      {snapshot && (
        <button
          onClick={async () => {
            if (partCount > 0 && !(await confirm("Ca này đang có các mảnh room bị ngắt. Up lại file khác sẽ XOÁ hết mảnh (số + lý do ngắt) và tính lại từ file mới. Tiếp tục?", { danger: true }))) return;
            fileRef.current?.click();
          }}
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
