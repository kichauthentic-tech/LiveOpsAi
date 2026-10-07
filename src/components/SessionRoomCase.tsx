import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Link2, Link2Off, Plus, Scissors, Trash2 } from "lucide-react";
import { LiveSession } from "../types";
import {
  RoomLinkCandidate,
  RoomLinks,
  SnapshotPart,
  applySessionSnapshotPart,
  deleteSessionSnapshotPart,
  estimateHandoverSplit,
  fetchRoomLinkCandidates,
  fetchRoomLinks,
  fetchSnapshotParts,
  isRoomLinksBackendMissing,
  linkSessionRoom,
  unlinkSessionRoom
} from "../lib/db/sessionRoomLinks";
import { SessionSnapshot, fetchSessionSnapshot } from "../lib/db/sessionLiveSnapshots";
import { parseSnapshotFile, type ParsedSnapshotFile } from "../lib/liveSnapshot/extractRooms";
import { BREAK_REASONS, BreakReason, breakReasonLabel, nextLinkStatus, roomGapMinutes } from "../lib/liveSnapshot/roomCases";
import { shortRoomId } from "../lib/liveSnapshot/roomSelection";
import { preloadSpreadsheetReader } from "../lib/dataraw/parseDataRawExcel";
import { SnapshotRoomPicker } from "./SnapshotRoomPicker";
import { errorMessage } from "../lib/errorMessage";
import { useConfirm } from "../hooks/useConfirm";
import { profileOf } from "../lib/platforms/profiles";
import { platformOf } from "../lib/reportPlatform";

// "Room của ca này" (user chốt 08/10, migration 0153; mở cho Shopee ở 0154 — ở đó gọi là "phiên") — hai trường hợp room ≠ ca, đều do trợ/OPS xác nhận trong Cửa sổ Ca Live:
//  • CA NỐI: room chạy tiếp sang ca sau. Chọn ĐÚNG ca sau đã plan trên lịch; số ca sau = room cộng dồn − snapshot của ca này.
//  • CA BỊ NGẮT ROOM: tắt/bật lại stream ⇒ nhiều room trong 1 ca. Mỗi lần ngắt là một mảnh kèm lý do; số ca = tổng mọi room.

interface Props {
  session: LiveSession;
  /** Trợ/host của ca hoặc OPS. */
  canEdit: boolean;
  isOps: boolean;
  onSessionsUpdated: (sessions: LiveSession[]) => void;
}

const fmtDay = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const vnTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "…");
const linkedLabel = (x: { date: string; startTime: string; endTime: string; hostName: string }) =>
  `${fmtDay(x.date)} ${x.startTime}–${x.endTime}${x.hostName ? ` · ${x.hostName}` : ""}`;

const chipBase = "text-[11px] font-bold px-2 py-0.5 rounded-full border";
const btnGhost = "inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] disabled:opacity-40 transition-colors";

export function SessionRoomCase({ session: s, canEdit, isOps, onSessionsUpdated }: Props) {
  const confirm = useConfirm();
  // TikTok gọi là room, Shopee gọi là phiên (một dòng trong file Live List) — cùng cơ chế snapshot nên cùng màn.
  const prof = profileOf(s);
  const unit = prof.liveUnitWord;
  const Unit = unit[0].toUpperCase() + unit.slice(1);
  const [links, setLinks] = useState<RoomLinks>({});
  const [parts, setParts] = useState<SnapshotPart[]>([]);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chooser, setChooser] = useState<RoomLinkCandidate[] | null>(null);
  const [pickedNext, setPickedNext] = useState("");

  const [partForm, setPartForm] = useState<{ reason: BreakReason; note: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<{ fileName: string; parsed: ParsedSnapshotFile } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { preloadSpreadsheetReader(); }, []);

  // Nạp lại khi số liệu của chính ca đổi (trợ vừa up file / ca khác tính lại) hoặc sau mỗi thao tác của component này.
  // Đổi sang ca khác: SessionWindow đặt key={s.id} nên component dựng lại từ đầu.
  const [tick, setTick] = useState(0);
  const stamp = `${s.id}|${s.dataSource ?? ""}|${s.actualGmv}|${(s.liveRoomIds ?? []).join(",")}`;
  useEffect(() => {
    let alive = true;
    Promise.all([fetchRoomLinks(s.id), fetchSnapshotParts(s.id), fetchSessionSnapshot(s.id)])
      .then(([l, p, snap]) => {
        if (!alive) return;
        setLinks(l);
        setParts(p);
        setSnapshot(snap);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        if (isRoomLinksBackendMissing(e)) setUnavailable(true);
        else setError(errorMessage(e));
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy theo dấu vết số liệu `stamp`, không theo từng field của ca
  }, [stamp, tick]);

  const run = async (fn: () => Promise<LiveSession[] | LiveSession>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      onSessionsUpdated(Array.isArray(res) ? res : [res]);
      setTick((n) => n + 1);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openChooser = async () => {
    setBusy(true);
    setError(null);
    try {
      setChooser(await fetchRoomLinkCandidates(s.id));
      setPickedNext("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmLink = async () => {
    const cand = chooser?.find((c) => c.sessionId === pickedNext);
    if (!cand) return;
    if (!(await confirm(`Xác nhận: ${unit} của ca này chạy tiếp sang ca ${linkedLabel(cand)}? Số của ca sau = ${unit} cộng dồn trừ file ca này up lúc giao ca.`))) return;
    if (await run(() => linkSessionRoom(s.id, cand.sessionId))) setChooser(null);
  };

  const doUnlink = async () => {
    if (!links.next) return;
    if (!(await confirm(`Gỡ liên kết nối ca? Ca sau quay về cách tính cũ (trừ snapshot gần nhất cùng ${unit}).`, { danger: true }))) return;
    const nextId = links.next.id;
    await run(() => unlinkSessionRoom(s.id, nextId));
  };

  const doEstimate = async (prevId: string, nextId: string, label: string) => {
    if (!(await confirm(`Chia ƯỚC LƯỢNG theo thời gian cho ca ${label} (vì không có file lúc giao ca)? Số của cả hai ca sẽ gắn nhãn ước lượng, tới khi trợ up file thật.`, { danger: true }))) return;
    await run(() => estimateHandoverSplit(prevId, nextId));
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      setPendingFile({ fileName: file.name, parsed: await parseSnapshotFile(file, platformOf(s)) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const savePart = async (rows: ParsedSnapshotFile["rows"], fileName: string | null, periodLabel?: string) => {
    if (!partForm) return;
    const ok = await run(() => applySessionSnapshotPart(s.id, partForm.reason, partForm.note.trim(), fileName, periodLabel, rows));
    if (ok) { setPartForm(null); setPendingFile(null); }
  };

  const removePart = async (p: SnapshotPart) => {
    if (!(await confirm(`Xoá mảnh ${p.partNo} (${breakReasonLabel(p.reason)})? Số của các ${prof.liveFileRowNoun} thuộc mảnh này sẽ bị bỏ khỏi ca.`, { danger: true }))) return;
    await run(() => deleteSessionSnapshotPart(p.id, s.id));
  };

  if (unavailable) return null;
  const shell = (body: React.ReactNode) => (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)]/60 p-3 space-y-2">
      <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold">{Unit} của ca này</h4>
      {body}
    </section>
  );
  if (loading) return shell(<p className="text-[11px] text-[var(--text-faint)]">Đang tải thông tin {unit}...</p>);

  const rooms = snapshot?.rooms ?? [];
  const gap = roomGapMinutes(rooms);
  const multiRoom = rooms.length > 1 || parts.length > 0;
  const prev = links.prev;
  const next = links.next;
  const waiting = nextLinkStatus(!!prev, !!prev?.hasSnapshot) === "waiting";
  const knownRoomIds = new Set(rooms.map((r) => r.roomId));

  if (pendingFile && partForm) {
    const fresh = pendingFile.parsed.rows.filter((r) => !knownRoomIds.has(r.roomId));
    return shell(
      <div className="space-y-2">
        <SnapshotRoomPicker
          session={s}
          rows={fresh}
          fileName={pendingFile.fileName}
          heading={`Chọn ${prof.liveFileRowNoun} của mảnh sau (${breakReasonLabel(partForm.reason)})`}
          prevBaseline={prev?.boundaryAt ? { boundaryMs: Date.parse(prev.boundaryAt), roomIds: prev.roomIds, label: `${prev.startTime}–${prev.endTime}` } : undefined}
          confirmLabel="Thêm mảnh này vào ca"
          busy={busy}
          onConfirm={(r) => void savePart(r, pendingFile.fileName, pendingFile.parsed.periodLabel)}
          onCancel={() => { setPendingFile(null); setError(null); }}
        />
        {fresh.length < pendingFile.parsed.rows.length && (
          <p className="text-[11px] text-[var(--text-faint)]">Đã ẩn {pendingFile.parsed.rows.length - fresh.length} {prof.liveFileRowNoun} đã có ở mảnh trước của ca này.</p>
        )}
        {error && <ErrorLine text={error} />}
      </div>
    );
  }

  return shell(
    <div className="space-y-3">
      {/* Trạng thái hiện tại */}
      <div className="flex flex-wrap items-center gap-1.5">
        {!prev && !next && !multiRoom && <span className={`${chipBase} bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)]`}>Bình thường — 1 {unit} riêng</span>}
        {prev && <span className={`${chipBase} bg-sky-950 text-sky-300 border-sky-800`}>Nối từ ca {prev.startTime}–{prev.endTime}</span>}
        {next && <span className={`${chipBase} bg-sky-950 text-sky-300 border-sky-800`}>Nối sang ca {next.startTime}–{next.endTime}</span>}
        {multiRoom && <span className={`${chipBase} bg-amber-950 text-amber-300 border-amber-800`}>{rooms.length} {unit}{parts.length > 0 ? ` · bị ngắt ×${Math.max(parts.length, rooms.length - 1)}` : ""}</span>}
      </div>

      {/* Ca này nối TỪ ca trước */}
      {prev && (
        <div className={`rounded-xl border p-2.5 text-xs space-y-1.5 ${waiting ? "border-amber-800 bg-amber-950/40" : "border-sky-900 bg-sky-950/30"}`}>
          <p className="text-[var(--text)]">
            <Link2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Ca này nối từ ca <b>{linkedLabel(prev)}</b>: số = {unit} cộng dồn <b>trừ</b> mốc ca đó đã up lúc giao ca.
          </p>
          {waiting ? (
            <>
              <p className="text-amber-300 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                Ca trước chưa up file lúc giao ca ⇒ số của ca này đang KHOÁ (chưa ghi). Nhờ trợ ca trước up file.
              </p>
              {isOps && (
                <button onClick={() => void doEstimate(prev.id, s.id, `${prev.startTime}–${prev.endTime}`)} disabled={busy || !snapshot} className={btnGhost}>
                  Ca trước quên up — chia ước lượng theo thời gian
                </button>
              )}
              {isOps && !snapshot && <p className="text-[11px] text-[var(--text-faint)]">Cần up file của ca này trước thì mới chia ước lượng được.</p>}
            </>
          ) : prev.isEstimated ? (
            <p className="text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Mốc của ca trước là ƯỚC LƯỢNG (chia theo thời gian). Khi trợ ca trước up file thật, số của ca này tự cập nhật.
            </p>
          ) : (
            <p className="text-sky-200/80">Ca trước đã có mốc — số của ca này đã trừ chính xác.</p>
          )}
        </div>
      )}

      {/* Ca này nối SANG ca sau */}
      {next && (
        <div className="rounded-xl border border-sky-900 bg-sky-950/30 p-2.5 text-xs space-y-1.5">
          <p className="text-[var(--text)]">
            <Link2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            {Unit} chạy tiếp sang ca <b>{linkedLabel(next)}</b>.
          </p>
          {!snapshot ? (
            <p className="text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Chưa up file lúc giao ca — ca sau sẽ bị khoá số cho tới khi ca này up file (đây chính là mốc để tách số hai ca).
            </p>
          ) : (
            <p className="text-sky-200/80">Đã có mốc giao ca — ca sau trừ đúng file này.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button onClick={() => void doUnlink()} disabled={busy} className={btnGhost}>
                <Link2Off className="w-3.5 h-3.5" /> Gỡ liên kết
              </button>
            )}
            {isOps && !snapshot && next.hasSnapshot && (
              <button onClick={() => void doEstimate(s.id, next.id, `${s.startTime}–${s.endTime}`)} disabled={busy} className={btnGhost}>
                Quên up file — chia ước lượng theo thời gian
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chọn ca sau */}
      {chooser && (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--surface-base)] p-3 space-y-2">
          <p className="text-xs font-bold text-[var(--text)]">{Unit} này chạy tiếp sang ca nào?</p>
          <p className="text-[11px] text-[var(--text-muted)]">Chỉ liệt kê ca {s.platform} cùng brand đã có trên lịch, bắt đầu sau ca này và trong vòng 2 giờ sau khi ca này hết.</p>
          {chooser.length === 0 ? (
            <p className="text-xs text-amber-300">Chưa có ca nào trên lịch phù hợp. Nhờ OPS thêm ca sau vào lịch trước, rồi quay lại đây.</p>
          ) : (
            <ul className="space-y-1.5">
              {chooser.map((c) => (
                <li key={c.sessionId}>
                  <label className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-xs ${c.takenBy ? "opacity-45 border-[var(--border)]" : pickedNext === c.sessionId ? "border-emerald-700 bg-emerald-950/30 cursor-pointer" : "border-[var(--border)] cursor-pointer"}`}>
                    <input type="radio" name="next-session" className="mt-0.5 w-4 h-4 shrink-0" disabled={!!c.takenBy} checked={pickedNext === c.sessionId} onChange={() => setPickedNext(c.sessionId)} />
                    <span className="min-w-0">
                      <span className="block font-bold text-[var(--text)]">{fmtDay(c.date)} · {c.startTime}–{c.endTime}</span>
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        Host {c.hostName || "chưa gán"}{c.coHostName ? ` · Trợ ${c.coHostName}` : ""}{c.studioName ? ` · ${c.studioName}` : ""}
                      </span>
                      {c.takenBy && <span className="block text-[11px] text-[var(--text-faint)]">Đã được nối từ một ca khác.</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button onClick={() => setChooser(null)} disabled={busy} className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-xs">Thôi</button>
            <button onClick={() => void confirmLink()} disabled={busy || !pickedNext} className="flex-1 min-h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs">
              {busy ? "Đang lưu..." : "Xác nhận ca nối này"}
            </button>
          </div>
        </div>
      )}

      {/* Ca bị ngắt room: các mảnh */}
      {multiRoom && (
        <div className="rounded-xl border border-amber-900 bg-amber-950/20 p-2.5 text-xs space-y-1.5">
          <p className="font-bold text-amber-200"><Scissors className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Ca bị ngắt {unit} — số ca là tổng mọi {unit}</p>
          <ul className="space-y-1 text-[var(--text)]">
            <li>
              <b>Mảnh 1</b> · {rooms.filter((r) => !r.partId).map((r) => `${vnTime(r.startedAt)}→${vnTime(r.endedAt)} (${shortRoomId(r.roomId)})`).join(", ") || "file đầu"}
            </li>
            {parts.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-2">
                <span>
                  <b>Mảnh {p.partNo}</b> · {breakReasonLabel(p.reason)}
                  {p.roomIds.length > 0 ? ` · ${rooms.filter((r) => r.partId === p.id).map((r) => `${vnTime(r.startedAt)}→${vnTime(r.endedAt)} (${shortRoomId(r.roomId)})`).join(", ") || p.roomIds.map(shortRoomId).join(", ")}` : ` · chỉ ghi nhận (${unit} đã nằm trong file đầu)`}
                  {p.note ? <span className="text-[var(--text-muted)]"> — {p.note}</span> : null}
                </span>
                {canEdit && (
                  <button onClick={() => void removePart(p)} disabled={busy} title="Xoá mảnh" className="p-1.5 -m-1.5 shrink-0 text-[var(--text-faint)] hover:text-rose-400 disabled:opacity-40">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-[var(--text-muted)]">
            Gián đoạn giữa các {unit}: <b>{gap} phút</b> · giờ live = cộng thời lượng từng {unit} (khoảng nghỉ không tính).
          </p>
        </div>
      )}

      {/* Thêm mảnh */}
      {partForm && !pendingFile && (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--surface-base)] p-3 space-y-2">
          <p className="text-xs font-bold text-[var(--text)]">Vì sao {unit} bị ngắt?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {BREAK_REASONS.map((r) => (
              <label key={r.key} className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer ${partForm.reason === r.key ? "border-emerald-700 bg-emerald-950/30" : "border-[var(--border)]"}`}>
                <input type="radio" name="break-reason" className="mt-0.5" checked={partForm.reason === r.key} onChange={() => setPartForm({ ...partForm, reason: r.key })} />
                <span><span className="block font-bold text-[var(--text)]">{r.label}</span><span className="block text-[11px] text-[var(--text-faint)]">{r.hint}</span></span>
              </label>
            ))}
          </div>
          <input
            value={partForm.note}
            onChange={(e) => setPartForm({ ...partForm, note: e.target.value })}
            placeholder="Ghi chú thêm (không bắt buộc)"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setPartForm(null); setError(null); }} disabled={busy} className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-xs">Thôi</button>
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="min-h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs">
              {busy ? "Đang xử lý..." : `Up file có ${unit} mảnh sau`}
            </button>
            {rooms.length > 1 && (
              <button onClick={() => void savePart([], null)} disabled={busy} className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] font-bold text-xs" title={`Các ${unit} đã nằm sẵn trong file đã up — chỉ ghi lý do`}>
                Chỉ ghi nhận lý do ({unit} đã có trong file)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nút hành động */}
      {canEdit && !chooser && !partForm && (
        <div className="flex flex-wrap gap-2">
          {!next && (
            <button onClick={() => void openChooser()} disabled={busy} className={btnGhost}>
              <Link2 className="w-3.5 h-3.5" /> Ca nối: {unit} chạy tiếp sang ca sau
            </button>
          )}
          <button
            onClick={() => setPartForm({ reason: "network", note: "" })}
            disabled={busy || !snapshot}
            title={snapshot ? undefined : "Up file của ca (mảnh đầu) ở bước Giao ca trước"}
            className={btnGhost}
          >
            <Plus className="w-3.5 h-3.5" /> Ca bị ngắt: thêm mảnh {unit} sau
          </button>
        </div>
      )}
      {canEdit && !snapshot && !chooser && !partForm && <p className="text-[11px] text-[var(--text-faint)]">Ca bị ngắt {unit}: up file mảnh đầu ở bước Giao ca trước, rồi mới thêm mảnh sau.</p>}

      {error && <ErrorLine text={error} />}
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="text-[11px] text-rose-400 flex items-start gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
      {text}
    </p>
  );
}
