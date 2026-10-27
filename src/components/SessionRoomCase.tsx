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
  fetchRoomLinksAmong,
  fetchSnapshotParts,
  isRoomLinksBackendMissing,
  linkSessionRoom,
  unlinkSessionRoom
} from "../lib/db/sessionRoomLinks";
import { SessionSnapshot, fetchSessionSnapshot } from "../lib/db/sessionLiveSnapshots";
import { parseSnapshotFile, type ParsedSnapshotFile } from "../lib/liveSnapshot/extractRooms";
import { BREAK_REASONS, BreakReason, adjacentShiftChain, breakReasonLabel, buildTurns, chainBoundaries, nextLinkStatus, roomGapMinutes, roomsFromPrev, runOverRoom } from "../lib/liveSnapshot/roomCases";
import { sessionWindow, shortRoomId } from "../lib/liveSnapshot/roomSelection";
import { hasSnapshot } from "../lib/sessionLedger";
import { preloadSpreadsheetReader } from "../lib/dataraw/parseDataRawExcel";
import { SnapshotRoomPicker } from "./SnapshotRoomPicker";
import { errorMessage } from "../lib/errorMessage";
import { useConfirm } from "../hooks/useConfirm";
import { profileOf } from "../lib/platforms/profiles";
import { platformOf } from "../lib/reportPlatform";

// "Room của ca này" (user chốt 08/10, migration 0153; mở cho Shopee ở 0154 — ở đó gọi là "phiên") — hai trường hợp room ≠ ca, đều do trợ/OPS xác nhận trong Cửa sổ Ca Live:
//  • CA NỐI: room chạy tiếp sang ca sau. Chọn ĐÚNG ca sau đã plan trên lịch; số ca sau = room cộng dồn − snapshot của ca này.
//  • CA BỊ NGẮT ROOM: tắt/bật lại stream ⇒ nhiều room trong 1 ca. Mỗi room là một LƯỢT live: lượt đầu = file đầu, mỗi lượt restart sau
//    đó có một mảnh + một lần up file riêng, kèm lý do; số ca = tổng mọi room.
// 11/10 (user duyệt): nằm TRONG bước Giao ca; app tự phát hiện room chạy qua giờ giao ⇒ đề xuất sẵn ca sau để trợ chỉ xác nhận; dải
// chuỗi ca trong ngày cho thấy ranh giới nối/không nối và ca đang bị khoá.

interface Props {
  session: LiveSession;
  /** Trợ/host của ca hoặc OPS. */
  canEdit: boolean;
  isOps: boolean;
  /** Các ca đã nạp — để vẽ dải chuỗi ca liền kề trong ngày và tìm ca trước. */
  allSessions?: LiveSession[];
  onSessionsUpdated: (sessions: LiveSession[]) => void;
  /** Nằm trong form Giao ca (đã có tiêu đề bước + khung) — không vẽ khung/tiêu đề riêng. */
  embedded?: boolean;
  /** Trong Giao ca: trợ đã chọn sự cố "Restart" ở bước 3 ⇒ hiện nút thêm lượt restart + chỉ đường dù chưa up file. */
  restartFlagged?: boolean;
}

const dismissKey = (id: string) => `liveops:no-room-link:${id}`;
function readDismissed(id: string): boolean {
  try { return localStorage.getItem(dismissKey(id)) === "1"; } catch { return false; }
}
function writeDismissed(id: string) {
  try { localStorage.setItem(dismissKey(id), "1"); } catch { /* chỉ là tiện lợi theo trình duyệt */ }
}

const fmtDay = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const vnTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "…");
const linkedLabel = (x: { date: string; startTime: string; endTime: string; hostName: string }) =>
  `${fmtDay(x.date)} ${x.startTime}–${x.endTime}${x.hostName ? ` · ${x.hostName}` : ""}`;

const chipBase = "text-[11px] font-bold px-2 py-0.5 rounded-full border";
const btnGhost = "inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] disabled:opacity-40 transition-colors";

export function SessionRoomCase({ session: s, canEdit, isOps, allSessions, onSessionsUpdated, embedded = false, restartFlagged = false }: Props) {
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

  const [chainLinks, setChainLinks] = useState<{ prevId: string; nextId: string }[]>([]);
  const [dismissed, setDismissed] = useState(() => readDismissed(s.id));
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

  // Dải chuỗi ca liền kề trong ngày (cùng brand + sàn, cách nhau ≤ 30 phút).
  const chain = allSessions ? adjacentShiftChain(s, allSessions) : [s];
  const chainIds = chain.map((x) => x.id).join(",");
  useEffect(() => {
    if (chain.length < 2) return;
    let alive = true;
    fetchRoomLinksAmong(chainIds.split(",")).then((l) => { if (alive) setChainLinks(l); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy theo danh sách ca trong chuỗi + sau mỗi thao tác, không theo từng field
  }, [chainIds, tick, stamp]);

  // Room chạy qua giờ giao (chưa kết thúc / kết thúc sau giờ hết ca) mà chưa nối ⇒ tự mở danh sách ca sau để trợ chỉ xác nhận.
  const win = sessionWindow(s);
  const overRoom = snapshot && !snapshot.isEstimated ? runOverRoom(snapshot.rooms, win) : undefined;
  const suggestKey = overRoom && canEdit && !links.next && !dismissed && !loading ? overRoom.roomId : "";
  useEffect(() => {
    if (!suggestKey) return;
    let alive = true;
    fetchRoomLinkCandidates(s.id)
      .then((c) => {
        if (!alive) return;
        setChooser(c);
        const free = c.filter((x) => !x.takenBy);
        setPickedNext(free.length === 1 ? free[0].sessionId : "");
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [suggestKey, s.id]);

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
    if (!(await confirm(`Xác nhận: ${unit} của ca này chạy tiếp sang ca ${linkedLabel(cand)}? Số của ca sau = ${unit} cộng dồn trừ file ca này tải lên lúc giao ca.`))) return;
    if (await run(() => linkSessionRoom(s.id, cand.sessionId))) setChooser(null);
  };

  const doUnlink = async () => {
    if (!links.next) return;
    if (!(await confirm(`Gỡ liên kết nối ca? Ca sau quay về cách tính cũ (trừ snapshot gần nhất cùng ${unit}).`, { danger: true }))) return;
    const nextId = links.next.id;
    await run(() => unlinkSessionRoom(s.id, nextId));
  };

  const doEstimate = async (prevId: string, nextId: string, label: string) => {
    if (!(await confirm(`Chia ƯỚC LƯỢNG theo thời gian cho ca ${label} (vì không có file lúc giao ca)? Số của cả hai ca sẽ gắn nhãn ước lượng, tới khi trợ tải lên file thật.`, { danger: true }))) return;
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
    if (!(await confirm(`Xoá lượt ${p.partNo} (${breakReasonLabel(p.reason)})? Số của các ${prof.liveFileRowNoun} thuộc lượt này sẽ bị bỏ khỏi ca.`, { danger: true }))) return;
    await run(() => deleteSessionSnapshotPart(p.id, s.id));
  };

  if (unavailable) return null;
  // Bố cục 19/10: trong form Giao ca (bước "2 · Lượt live & ca nối") khối này không vẽ khung + tiêu đề riêng — trước đó tiêu đề
  // lặp hai lần và thêm một tầng hộp trong hộp Giao ca.
  const shell = (body: React.ReactNode) =>
    embedded ? (
      <div className="space-y-2">{body}</div>
    ) : (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)]/60 p-3 space-y-2">
        <h4 className="text-xs font-bold text-[var(--text-muted)]">Lượt live & ca nối</h4>
        {body}
      </section>
    );
  if (loading) return shell(<p className="text-[11px] text-[var(--text-faint)]">Đang tải thông tin {unit}...</p>);

  const rooms = snapshot?.rooms ?? [];
  const gap = roomGapMinutes(rooms);
  const multiRoom = rooms.length > 1 || parts.length > 0;
  const turns = buildTurns(rooms, parts);
  const nextTurnNo = (turns[turns.length - 1]?.no ?? 1) + 1;
  const fromPrevRooms = snapshot ? roomsFromPrev(rooms, win) : [];
  const myIdx = chain.findIndex((x) => x.id === s.id);
  const prevShift = myIdx > 0 ? chain[myIdx - 1] : undefined;
  const boundaries = chainBoundaries(chain, chainLinks, (id) => {
    const x = chain.find((c) => c.id === id);
    return !!x && hasSnapshot(x);
  });
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
          heading={`Lượt ${nextTurnNo} (${breakReasonLabel(partForm.reason)}) — chọn ${prof.liveFileRowNoun} của lượt này`}
          prevBaseline={prev?.boundaryAt ? { boundaryMs: Date.parse(prev.boundaryAt), roomIds: prev.roomIds, label: `${prev.startTime}–${prev.endTime}` } : undefined}
          confirmLabel={`Thêm lượt ${nextTurnNo} vào ca`}
          busy={busy}
          onConfirm={(r) => void savePart(r, pendingFile.fileName, pendingFile.parsed.periodLabel)}
          onCancel={() => { setPendingFile(null); setError(null); }}
        />
        {fresh.length < pendingFile.parsed.rows.length && (
          <p className="text-[11px] text-[var(--text-faint)]">Đã ẩn {pendingFile.parsed.rows.length - fresh.length} {prof.liveFileRowNoun} đã có ở lượt trước của ca này.</p>
        )}
        {error && <ErrorLine text={error} />}
      </div>
    );
  }

  return shell(
    <div className="space-y-3">
      {/* Trạng thái hiện tại — trong Giao ca (23/10) ca bình thường không vẽ viên "Bình thường — 1 room riêng": tiêu đề bước đã nói
          "chỉ khi có restart / chạy sang ca sau", viên đó chỉ là thêm một dòng. */}
      {(prev || next || multiRoom || !embedded || (s.liveRoomIds?.length ?? 0) > 1) && <div className="flex flex-wrap items-center gap-1.5">
        {!prev && !next && !multiRoom && (s.liveRoomIds?.length ?? 0) > 1 && (
          <span className={`${chipBase} bg-amber-950 text-amber-300 border-amber-800`}>{s.liveRoomIds!.length} {unit} theo số đã nạp — chưa có file giao ca để ghi lý do từng lượt</span>
        )}
        {!embedded && !prev && !next && !multiRoom && (s.liveRoomIds?.length ?? 0) <= 1 && <span className={`${chipBase} bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)]`}>Bình thường — 1 {unit} riêng</span>}
        {prev && <span className={`${chipBase} bg-sky-950 text-sky-300 border-sky-800`}>Nối từ ca {prev.startTime}–{prev.endTime}</span>}
        {next && <span className={`${chipBase} bg-sky-950 text-sky-300 border-sky-800`}>Nối sang ca {next.startTime}–{next.endTime}</span>}
        {multiRoom && <span className={`${chipBase} bg-amber-950 text-amber-300 border-amber-800`}>{rooms.length} {unit}{parts.length > 0 ? ` · bị ngắt ×${Math.max(parts.length, rooms.length - 1)}` : ""}</span>}
      </div>}

      {/* Ca này nối TỪ ca trước */}
      {prev && (
        <div className={`rounded-xl border p-2.5 text-xs space-y-1.5 ${waiting ? "border-amber-800 bg-amber-950/40" : "border-sky-900 bg-sky-950/30"}`}>
          <p className="text-[var(--text)]">
            <Link2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Ca này nối từ ca <b>{linkedLabel(prev)}</b>: số = {unit} cộng dồn <b>trừ</b> mốc ca đó đã tải lên lúc giao ca.
          </p>
          {waiting ? (
            <>
              <p className="text-amber-300 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                Ca trước chưa tải lên file lúc giao ca ⇒ số của ca này đang KHOÁ (chưa ghi). Nhờ trợ ca trước tải lên file.
              </p>
              {isOps && (
                <button onClick={() => void doEstimate(prev.id, s.id, `${prev.startTime}–${prev.endTime}`)} disabled={busy || !snapshot} className={btnGhost}>
                  Ca trước quên up — chia ước lượng theo thời gian
                </button>
              )}
              {isOps && !snapshot && <p className="text-[11px] text-[var(--text-faint)]">Cần tải lên file của ca này trước thì mới chia ước lượng được.</p>}
            </>
          ) : prev.isEstimated ? (
            <p className="text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Mốc của ca trước là ƯỚC LƯỢNG (chia theo thời gian). Khi trợ ca trước tải lên file thật, số của ca này tự cập nhật.
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
              Chưa tải lên file lúc giao ca — ca sau sẽ bị khoá số cho tới khi ca này tải lên file (đây chính là mốc để tách số hai ca).
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
                Quên tải lên file — chia ước lượng theo thời gian
              </button>
            )}
          </div>
        </div>
      )}

      {/* Chọn ca sau */}
      {chooser && (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--surface-base)] p-3 space-y-2">
          <p className="text-xs font-bold text-[var(--text)]">
            {overRoom ? <>{Unit} <span className="font-mono">{shortRoomId(overRoom.roomId)}</span> đang chạy qua giờ giao ca — chạy tiếp sang ca nào?</> : <>{Unit} này chạy tiếp sang ca nào?</>}
          </p>
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
            <button
              onClick={() => { setChooser(null); if (overRoom) { writeDismissed(s.id); setDismissed(true); } }}
              disabled={busy}
              className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-xs"
            >
              {overRoom ? `Không, ${unit} kết thúc ở ca này` : "Thôi"}
            </button>
            <button onClick={() => void confirmLink()} disabled={busy || !pickedNext} className="flex-1 min-h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs">
              {busy ? "Đang lưu..." : "Xác nhận ca nối này"}
            </button>
          </div>
        </div>
      )}

      {/* Các lượt live của ca: mỗi room = một lượt; lượt restart có lý do + file riêng */}
      {snapshot && !snapshot.isEstimated && (
        <div className="rounded-xl border border-amber-900 bg-amber-950/20 p-2.5 text-xs space-y-1.5">
          <p className="font-bold text-amber-200">
            <Scissors className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Các lượt live của ca{turns.length > 1 ? ` — restart ×${turns.length - 1}, số ca là tổng mọi ${unit}` : ""}
          </p>
          <ul className="space-y-1 text-[var(--text)]">
            {turns.map((t) => {
              const spans = t.rooms.map((r) => `${vnTime(r.startedAt)}→${r.endedAt ? vnTime(r.endedAt) : "đang live"} (${shortRoomId(r.roomId)})`).join(", ");
              const part = parts.find((p) => p.id === t.partId);
              return (
                <li key={t.partId ?? "first"} className="flex items-start justify-between gap-2">
                  <span>
                    <b>Lượt {t.no}</b>
                    {t.no > 1 ? ` · ${breakReasonLabel(t.reason ?? "other")}` : " · lượt đầu"}
                    {spans ? ` · ${spans}` : t.no > 1 ? ` · chỉ ghi nhận (${unit} đã nằm trong file lượt trước)` : ""}
                    {t.note ? <span className="text-[var(--text-muted)]"> — {t.note}</span> : null}
                  </span>
                  {canEdit && part && (
                    <button onClick={() => void removePart(part)} disabled={busy} title="Xoá lượt này" className="p-1.5 -m-1.5 shrink-0 text-[var(--text-faint)] hover:text-rose-400 disabled:opacity-40">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {multiRoom && (
            <p className="text-[11px] text-[var(--text-muted)]">
              Gián đoạn giữa các {unit}: <b>{gap} phút</b> · giờ live = cộng thời lượng từng {unit} (khoảng nghỉ không tính).
            </p>
          )}
        </div>
      )}

      {/* Room bắt đầu trước giờ vào ca mà ca này chưa được xác nhận nối từ ca trước ⇒ đang nhận CẢ room */}
      {!prev && fromPrevRooms.length > 0 && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-2.5 text-xs space-y-1.5">
          <p className="text-amber-300 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              {Unit} {fromPrevRooms.map((r) => shortRoomId(r.roomId)).join(", ")} bắt đầu TRƯỚC giờ vào ca nhưng ca này chưa được xác nhận nối từ ca trước ⇒ đang tính CẢ {unit} cho ca này.
              {prevShift ? ` Ca liền trước: ${linkedLabel(prevShift)}.` : " Chưa thấy ca liền trước trên lịch."}
            </span>
          </p>
          {isOps && prevShift && (
            <button
              onClick={async () => {
                if (!(await confirm(`Xác nhận: ${unit} của ca ${linkedLabel(prevShift)} chạy tiếp sang ca này? Số ca này = ${unit} cộng dồn trừ file ca đó tải lên lúc giao ca.`))) return;
                await run(() => linkSessionRoom(prevShift.id, s.id));
              }}
              disabled={busy}
              className={btnGhost}
            >
              <Link2 className="w-3.5 h-3.5" /> Xác nhận nối từ ca {prevShift.startTime.slice(0, 5)}–{prevShift.endTime.slice(0, 5)}
            </button>
          )}
        </div>
      )}

      {/* Dải chuỗi ca liền kề trong ngày */}
      {chain.length > 1 && (
        <div className="rounded-xl border border-[var(--border)] p-2.5 space-y-1.5">
          <p className="text-xs font-bold text-[var(--text-muted)]">Chuỗi ca liền kề trong ngày</p>
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            {chain.map((c, i) => {
              const bd = i > 0 ? boundaries[i - 1] : undefined;
              const here = c.id === s.id;
              return (
                <React.Fragment key={c.id}>
                  {bd && (
                    <span
                      title={bd.kind === "linked" ? `${Unit} chạy tiếp: ca sau trừ mốc ca trước${bd.locked ? " — ca trước CHƯA tải lên file ⇒ ca sau đang khoá số" : ""}` : `Chưa xác nhận nối — ${unit} mới ở ca sau`}
                      className={`font-bold px-1 ${bd.kind === "linked" ? (bd.locked ? "text-amber-300" : "text-sky-300") : "text-[var(--text-faint)]"}`}
                    >
                      {bd.kind === "linked" ? (bd.locked ? "⛓🔒" : "⛓") : "○"}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-lg border ${here ? "border-emerald-700 bg-emerald-950/40 text-emerald-200 font-bold" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
                    {c.startTime.slice(0, 5)}–{c.endTime.slice(0, 5)} {hasSnapshot(c) ? "✔" : "·"}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">⛓ {unit} chạy tiếp (ca sau trừ mốc ca trước) · ○ chưa xác nhận nối ({unit} mới) · 🔒 chờ file ca trước · ✔ đã có file</p>
        </div>
      )}

      {/* Thêm mảnh */}
      {partForm && !pendingFile && (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--surface-base)] p-3 space-y-2">
          <p className="text-xs font-bold text-[var(--text)]">Lượt {nextTurnNo}: vì sao {unit} bị ngắt?</p>
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
              {busy ? "Đang xử lý..." : `Tải lên file riêng của lượt ${nextTurnNo}`}
            </button>
            {rooms.length > 1 && (
              <button onClick={() => void savePart([], null)} disabled={busy} className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] font-bold text-xs" title={`Các ${unit} đã nằm sẵn trong file đã tải lên — chỉ ghi lý do`}>
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
          {/* Trong Giao ca: chưa up file thì chưa có lượt đầu ⇒ ẩn hẳn nút restart thay vì một nút xám + một dòng giải thích. */}
          {(snapshot || !embedded || restartFlagged) && (
            <button
              onClick={() => setPartForm({ reason: "network", note: "" })}
              disabled={busy || !snapshot}
              title={snapshot ? "Mỗi lượt restart có một lần tải lên file riêng" : "Tải lên file của lượt đầu trước, rồi mới thêm lượt restart"}
              className={btnGhost}
            >
              <Plus className="w-3.5 h-3.5" /> Thêm lượt restart (tải lên file riêng)
            </button>
          )}
        </div>
      )}
      {canEdit && embedded && restartFlagged && !chooser && !partForm && (
        <p className="text-[11px] text-amber-300/90">
          {snapshot
            ? `Lượt restart chưa có trong file vừa tải lên thì bấm "Thêm lượt restart" — mỗi lượt một file riêng.`
            : `Có restart: file ở bước 1 thường có đủ các lượt — chọn hết ${prof.liveFileRowNoun} của ca ở đó, app hỏi lý do từng lượt. Lượt nào không có trong file thì tải lên file riêng bằng "Thêm lượt restart" sau khi xong bước 1.`}
        </p>
      )}
      {canEdit && !embedded && !snapshot && !chooser && !partForm && <p className="text-[11px] text-[var(--text-faint)]">Restart giữa ca: tải lên file lượt đầu trước, rồi bấm "Thêm lượt restart" — mỗi lượt có một lần tải lên file riêng.</p>}

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
