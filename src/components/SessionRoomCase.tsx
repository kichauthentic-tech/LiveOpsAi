import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
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
import { SessionSnapshot, fetchSessionSnapshot, setSessionHandoverTime } from "../lib/db/sessionLiveSnapshots";
import { parseSnapshotFile, type ParsedSnapshotFile } from "../lib/liveSnapshot/extractRooms";
import { BREAK_REASONS, BreakReason, adjacentShiftChain, breakReasonLabel, breakReasonShort, nextLinkStatus, roomsFromPrev, runOverRoom } from "../lib/liveSnapshot/roomCases";
import { CROSS_TOL_MS, flexWindow, timelineLayout, vnClock } from "../lib/liveSnapshot/timeline";
import { SessionTimeline } from "./SessionTimeline";
import { MoreMenu, type MoreMenuItem } from "./ui/MoreMenu";
import { sessionWindow, shortRoomId } from "../lib/liveSnapshot/roomSelection";
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

const btnGhost = "inline-flex items-center gap-1.5 text-2xs font-bold px-2.5 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] disabled:opacity-40 transition-colors";

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

  const [dismissed, setDismissed] = useState(() => readDismissed(s.id));
  const [chooser, setChooser] = useState<RoomLinkCandidate[] | null>(null);
  const [pickedNext, setPickedNext] = useState("");

  const [partForm, setPartForm] = useState<{ reason: BreakReason; note: string } | null>(null);
  // Giờ giao ca thực (0205): HH:MM đang gõ, null = form đóng.
  const [handoverTime, setHandoverTime] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ fileName: string; parsed: ParsedSnapshotFile } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { preloadSpreadsheetReader(); }, []);

  // Nạp lại khi số liệu của chính ca đổi (trợ vừa up file / ca khác tính lại) hoặc sau mỗi thao tác của component này.
  // Đổi sang ca khác: SessionWindow đặt key={s.id} nên component dựng lại từ đầu.
  const [tick, setTick] = useState(0);
  const [openedAt] = useState(() => Date.now());
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

  // Ca liền kề trong ngày (cùng brand + sàn, cách nhau ≤ 30 phút) — để vẽ ca trước/ca sau trên dòng thời gian.
  const chain = allSessions ? adjacentShiftChain(s, allSessions) : [s];

  // Room chạy qua giờ giao (chưa kết thúc / kết thúc sau giờ hết ca) mà chưa nối ⇒ tự mở danh sách ca sau để trợ chỉ xác nhận.
  // Cửa sổ ca trượt theo giờ live thật: host vào trễ rồi bù đủ giờ kế hoạch ⇒ ca và các ca nối sau trượt cùng lượng, không bị coi là lấn sang ca sau.
  const planWin = sessionWindow(s);
  const chainStartsMs = chain.map((x) => sessionWindow(x).startMs);
  const manualEndMs = snapshot?.boundaryManual && !snapshot.isEstimated ? Date.parse(snapshot.boundaryAt) : undefined;
  // 0209: ca KHÔNG có ca nối sau (khớp private.session_has_next_shift: liên kết room, hoặc ca cùng brand + sàn bắt đầu đúng giờ hết ca ±5')
  // thì giờ giao ca kéo theo giờ room tắt (tối đa +90'). Ca đã gõ GMV khác số file giữ mốc cũ (người gõ chủ động cắt số).
  const hasNextShift = !!links.next || chain.some((x) => x.id !== s.id && Math.abs(sessionWindow(x).startMs - planWin.endMs) <= 5 * 60000);
  const fileGmvSum = (snapshot?.rooms ?? []).reduce((a, r) => a + (r.fileGmv ?? r.gmv), 0);
  const typedCut = snapshot?.typedGmv != null && Math.abs(snapshot.typedGmv - fileGmvSum) > 0.5;
  const noNextShift = !hasNextShift && !typedCut;
  const win = flexWindow(planWin, snapshot?.rooms ?? [], chainStartsMs, manualEndMs, noNextShift);
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
    // Chạm "Đúng, nối" đã là xác nhận (08/11) — không hỏi lại bằng hộp thoại một câu dài.
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

  // HH:MM (giờ VN) → thời điểm gần giờ hết ca kế hoạch nhất (ca qua nửa đêm: 00:10 thuộc hôm sau).
  const handoverIsoFrom = (hm: string): string | null => {
    if (!/^\d{2}:\d{2}$/.test(hm)) return null;
    const day = new Date(planWin.endMs + 7 * 3600000).toISOString().slice(0, 10);
    const base = Date.parse(`${day}T${hm}:00+07:00`);
    if (!Number.isFinite(base)) return null;
    const best = [base - 86400000, base, base + 86400000].sort((a, b) => Math.abs(a - planWin.endMs) - Math.abs(b - planWin.endMs))[0];
    return new Date(best).toISOString();
  };
  const saveHandoverTime = async (hm: string | null) => {
    const iso = hm === null ? null : handoverIsoFrom(hm);
    if (hm !== null && !iso) { setError("Giờ giao ca không hợp lệ (HH:MM)."); return; }
    if (await run(() => setSessionHandoverTime(s.id, iso))) setHandoverTime(null);
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
  // Cửa sổ ca gọn (08/11, user duyệt demo): khối này là MỘT dòng thời gian (room, khoảng nghỉ, giờ giao ca, ca kề bên) thay cho các
  // viên + hộp chữ "nối sang ca", "Các lượt live", "Chuỗi ca liền kề" + chú giải. Chữ chỉ còn khi có việc phải làm (ca bị khoá số,
  // room chưa nối); câu hỏi trả lời bằng ô chạm; thao tác ít dùng vào menu ⋯. Trong form Giao ca không vẽ khung/tiêu đề riêng.
  const shell = (body: React.ReactNode, menu?: React.ReactNode) =>
    embedded ? (
      <div className="space-y-2">{body}{menu && <div className="flex justify-end">{menu}</div>}</div>
    ) : (
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-[var(--text-muted)]">Dòng thời gian</h4>
          {menu}
        </div>
        {body}
      </section>
    );
  // Đang tải: ca đã có room thì giữ chỗ bằng một thanh mờ cùng cỡ để cửa sổ không giật khi dòng thời gian hiện ra.
  if (loading) {
    if (embedded) return shell(<p className="text-2xs text-[var(--text-faint)]">Đang tải thông tin {unit}...</p>);
    return (s.liveRoomIds?.length ?? 0) > 0 ? shell(<div className="h-10 rounded-md bg-[var(--surface-elevated)] animate-pulse" aria-label={`Đang tải ${unit}`} />) : null;
  }

  const rooms = snapshot?.rooms ?? [];
  const fromPrevRooms = snapshot ? roomsFromPrev(rooms, win) : [];
  const myIdx = chain.findIndex((x) => x.id === s.id);
  const prevShift = myIdx > 0 ? chain[myIdx - 1] : undefined;
  const nextShift = myIdx >= 0 && myIdx < chain.length - 1 ? chain[myIdx + 1] : undefined;
  const prev = links.prev;
  const next = links.next;
  const waiting = nextLinkStatus(!!prev, !!prev?.hasSnapshot) === "waiting";
  const knownRoomIds = new Set(rooms.map((r) => r.roomId));
  const nextTurnNo = Math.max(1, rooms.length, ...parts.map((p) => p.partNo)) + 1;

  if (pendingFile && partForm) {
    const fresh = pendingFile.parsed.rows.filter((r) => !knownRoomIds.has(r.roomId));
    return shell(
      <div className="space-y-2">
        <SnapshotRoomPicker
          session={s}
          rows={fresh}
          fileName={pendingFile.fileName}
          heading={`Lượt ${nextTurnNo} (${breakReasonShort(partForm.reason)}) — chọn ${prof.liveFileRowNoun} của lượt này`}
          prevBaseline={prev?.boundaryAt ? { boundaryMs: Date.parse(prev.boundaryAt), roomIds: prev.roomIds, label: `${prev.startTime}–${prev.endTime}` } : undefined}
          confirmLabel={`Thêm lượt ${nextTurnNo} vào ca`}
          busy={busy}
          onConfirm={(r) => void savePart(r, pendingFile.fileName, pendingFile.parsed.periodLabel)}
          onCancel={() => { setPendingFile(null); setError(null); }}
        />
        {error && <ErrorLine text={error} />}
      </div>
    );
  }

  // Ca kề bên trên trục: ca đã nối luôn vẽ; ca liền kề chưa nối chỉ vẽ khi có room chạy sang phía đó (để thấy room đang lấn ca nào).
  const shiftOf = (x: { date: string; startTime: string; endTime: string; hostName?: string }, linked: boolean) => {
    const w = sessionWindow(x);
    return { startMs: w.startMs, endMs: w.endMs, label: `${x.startTime.slice(0, 5)}–${x.endTime.slice(0, 5)}${x.hostName ? ` ${x.hostName}` : ""}`, linked };
  };
  const timed = rooms.filter((r) => r.startedAt);
  const crossesStart = timed.some((r) => Date.parse(r.startedAt!) < win.startMs - CROSS_TOL_MS);
  const crossesEnd = timed.some((r) => !r.endedAt || Date.parse(r.endedAt) > win.endMs + CROSS_TOL_MS);
  const layout =
    snapshot && !snapshot.isEstimated && timed.length > 0
      ? timelineLayout({
          win: planWin, // timelineLayout tự trượt theo lượng trễ (cả chuỗi ca nối)
          chainStartsMs,
          manualEndMs,
          noNextShift,
          rooms,
          parts,
          prev: prev ? shiftOf(prev, true) : prevShift && crossesStart ? shiftOf(prevShift, false) : undefined,
          next: next ? shiftOf(next, true) : nextShift && crossesEnd ? shiftOf(nextShift, false) : undefined,
          nowMs: openedAt
        })
      : null;

  // Trong Giao ca mà chưa tải file: chưa có gì để nối / thêm lượt ⇒ không chào nút ⋯ trơ trọi.
  const menuItems: MoreMenuItem[] = canEdit && !chooser && !partForm && (snapshot || !embedded)
    ? [
        ...(!next ? [{ label: `Nối sang ca sau (${unit} chạy tiếp)`, onClick: () => void openChooser(), disabled: busy }] : []),
        ...(next ? [{ label: "Gỡ nối với ca sau", onClick: () => void doUnlink(), disabled: busy, danger: true }] : []),
        ...(snapshot && !snapshot.isEstimated ? [{ label: snapshot.boundaryManual ? "Sửa giờ giao ca thực" : "Nhập giờ giao ca thực", onClick: () => setHandoverTime(vnClock(win.endMs)), disabled: busy }] : []),
        ...(snapshot ? [{ label: "Thêm lượt restart (tải file riêng)", onClick: () => setPartForm({ reason: "network", note: "" }), disabled: busy }] : []),
        ...parts.map((p) => ({ label: `Xoá lượt ${p.partNo} (${breakReasonShort(p.reason)})`, onClick: () => void removePart(p), disabled: busy, danger: true }))
      ]
    : [];
  const menu = menuItems.length > 0 ? <MoreMenu items={menuItems} label="Thao tác ca nối / restart" /> : undefined;

  const warn = (children: React.ReactNode, action?: React.ReactNode) => (
    <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-2.5 text-xs space-y-1.5">
      <p className="text-amber-300 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /><span>{children}</span></p>
      {action}
    </div>
  );

  const body = (
    <div className="space-y-3">
      {layout && <SessionTimeline layout={layout} unit={unit} />}
      {snapshot?.boundaryManual && handoverTime === null && (
        <p className="text-2xs text-[var(--text-muted)]">
          Giờ giao ca {vnClock(Date.parse(snapshot.boundaryAt))} do OPS nhập (thay số tự tính).
          {canEdit && <button onClick={() => void saveHandoverTime(null)} disabled={busy} className="ml-1.5 underline hover:text-[var(--text)] disabled:opacity-40">Dùng số tự tính</button>}
        </p>
      )}
      {handoverTime !== null && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2.5 space-y-2">
          <p className="text-2xs text-[var(--text-muted)]">
            Giờ giao ca thực = lúc host này thôi và ca sau nhận. Chỉ cần nhập khi app tính chưa đúng (vd room chạy liên tục, chỉ đổi người). Giờ này quyết định phần số liệu và giờ live của mỗi ca.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="time" value={handoverTime} onChange={(e) => setHandoverTime(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm tabular-nums" />
            <button onClick={() => void saveHandoverTime(handoverTime)} disabled={busy || !handoverTime} className={btnGhost}>Lưu giờ giao ca</button>
            <button onClick={() => setHandoverTime(null)} disabled={busy} className={btnGhost}>Đóng</button>
          </div>
        </div>
      )}
      {embedded && !snapshot && <p className="text-2xs text-[var(--text-faint)]">Hiện ra sau khi tải file ở bước 1.</p>}
      {snapshot?.isEstimated && <p className="text-2xs text-amber-300">Số ca này đang chia ước lượng theo thời gian — tự cập nhật khi có file thật.</p>}
      {!snapshot && !embedded && (s.liveRoomIds?.length ?? 0) > 1 && (
        <p className="text-2xs text-[var(--text-muted)]">{s.liveRoomIds!.length} {unit} theo số đã nạp.</p>
      )}

      {/* Chỉ còn chữ khi có việc phải làm. */}
      {prev && waiting &&
        warn(
          <>Ca trước ({prev.startTime}–{prev.endTime}) chưa tải file ⇒ số ca này đang khoá. Nhờ trợ ca trước tải file.</>,
          isOps && (
            <button onClick={() => void doEstimate(prev.id, s.id, `${prev.startTime}–${prev.endTime}`)} disabled={busy || !snapshot} className={btnGhost}>
              {snapshot ? "Chia ước lượng theo thời gian" : "Tải file ca này trước rồi mới chia ước lượng được"}
            </button>
          )
        )}
      {prev && !waiting && prev.isEstimated && <p className="text-2xs text-amber-300">Mốc ca trước là ước lượng — tự cập nhật khi ca trước tải file.</p>}
      {next && !snapshot &&
        warn(
          <>Chưa tải file ⇒ ca sau ({next.startTime}–{next.endTime}) đang khoá số.</>,
          isOps && next.hasSnapshot && (
            <button onClick={() => void doEstimate(s.id, next.id, `${s.startTime}–${s.endTime}`)} disabled={busy} className={btnGhost}>
              Quên tải file — chia ước lượng theo thời gian
            </button>
          )
        )}
      {!prev && fromPrevRooms.length > 0 &&
        warn(
          <>{Unit} {fromPrevRooms.map((r) => shortRoomId(r.roomId)).join(", ")} bắt đầu trước giờ vào ca nhưng chưa nối từ ca trước ⇒ đang tính cả {unit} cho ca này.</>,
          isOps && prevShift && (
            <button onClick={() => void run(() => linkSessionRoom(prevShift.id, s.id))} disabled={busy} className={btnGhost}>
              <Link2 className="w-3.5 h-3.5" /> Nối từ ca {prevShift.startTime.slice(0, 5)}–{prevShift.endTime.slice(0, 5)}
            </button>
          )
        )}

      {/* Nhắc nối ca LUÔN hiện (10/11): room còn live quá giờ hết ca mà chưa nối ⇒ ca sau mất số. Bấm "Không" chỉ đóng hộp hỏi,
          dòng nhắc này vẫn ở đó cho tới khi nối (không còn chỉ nằm trong ⋯). */}
      {canEdit && !next && !chooser && !partForm && snapshot && (overRoom || rooms.some((r) => !r.endedAt)) &&
        warn(
          <>{Unit} còn live quá giờ hết ca nhưng CHƯA nối sang ca sau ⇒ ca sau sẽ thiếu số / bị khoá.</>,
          <button onClick={() => void openChooser()} disabled={busy} className={btnGhost}>
            <Link2 className="w-3.5 h-3.5" /> Nối sang ca sau
          </button>
        )}

      {/* Câu hỏi nối ca: chạm chọn ca sau rồi Đúng / Không. */}
      {chooser && (
        <div className="rounded-xl border-[1.5px] border-[var(--accent)]/45 p-3 space-y-2">
          <p className="text-sm font-bold text-[var(--text)]">
            {overRoom ? `${Unit} còn live lúc ${s.endTime.slice(0, 5)}. Nối sang ca sau?` : `${Unit} chạy tiếp sang ca nào?`}
          </p>
          {chooser.length === 0 ? (
            <p className="text-xs text-amber-300">Chưa có ca sau trên lịch — nhờ OPS thêm ca rồi quay lại.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {chooser.map((c) => (
                <button
                  key={c.sessionId}
                  type="button"
                  disabled={!!c.takenBy}
                  aria-pressed={pickedNext === c.sessionId}
                  title={c.takenBy ? "Đã được nối từ một ca khác" : undefined}
                  onClick={() => setPickedNext(c.sessionId)}
                  className={`min-h-10 px-3 rounded-xl border text-xs font-bold text-left disabled:opacity-40 ${pickedNext === c.sessionId ? "seg-on" : "border-[var(--border)] text-[var(--text)]"}`}
                >
                  {c.date !== s.date ? `${fmtDay(c.date)} · ` : ""}{c.startTime.slice(0, 5)}–{c.endTime.slice(0, 5)}
                  <span className="block text-2xs font-normal text-[var(--text-muted)]">{c.hostName || "chưa gán host"}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setChooser(null); if (overRoom) { writeDismissed(s.id); setDismissed(true); } }}
              disabled={busy}
              className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-xs"
            >
              Không
            </button>
            {chooser.length > 0 && (
              <button onClick={() => void confirmLink()} disabled={busy || !pickedNext} className="flex-1 min-h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs">
                {busy ? "Đang lưu..." : "Đúng, nối"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Thêm lượt restart (từ menu ⋯): chạm lý do → tải file riêng của lượt. */}
      {partForm && !pendingFile && (
        <div className="rounded-xl border-[1.5px] border-[var(--accent)]/45 p-3 space-y-2">
          <p className="text-sm font-bold text-[var(--text)]">Lượt {nextTurnNo} vì sao?</p>
          <div className="flex flex-wrap gap-1.5">
            {BREAK_REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                title={r.hint}
                aria-pressed={partForm.reason === r.key}
                onClick={() => setPartForm({ ...partForm, reason: r.key })}
                className={`min-h-9 px-3 rounded-xl border text-xs font-bold ${partForm.reason === r.key ? "seg-on" : "border-[var(--border)] text-[var(--text)]"}`}
              >
                {r.short}
              </button>
            ))}
          </div>
          <input
            value={partForm.note}
            onChange={(e) => setPartForm({ ...partForm, note: e.target.value })}
            placeholder="Ghi chú (không bắt buộc)"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setPartForm(null); setError(null); }} disabled={busy} className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-xs">Thôi</button>
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="min-h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs">
              {busy ? "Đang xử lý..." : `Tải file lượt ${nextTurnNo}`}
            </button>
            {rooms.length > 1 && (
              <button onClick={() => void savePart([], null)} disabled={busy} className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] font-bold text-xs" title={`Các ${unit} đã nằm sẵn trong file đã tải lên — chỉ ghi lý do`}>
                Chỉ ghi lý do
              </button>
            )}
          </div>
        </div>
      )}

      {/* Trong Giao ca: trợ báo có restart mà file chưa có lượt sau ⇒ chỉ đường một dòng. */}
      {canEdit && embedded && restartFlagged && !chooser && !partForm && rooms.length < 2 && (
        <p className="text-2xs text-amber-300/90">
          {snapshot ? `Có restart mà file chỉ có 1 ${unit}: bấm ⋯ → "Thêm lượt restart".` : `Có restart: chọn hết ${prof.liveFileRowNoun} của ca khi tải file ở bước 1.`}
        </p>
      )}

      {error && <ErrorLine text={error} />}
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
    </div>
  );

  // Ngoài Giao ca: ca chưa có file, không nối, không cảnh báo ⇒ không vẽ gì (ô trống chỉ thêm một tiêu đề).
  const hasContent = !!layout || !!chooser || !!partForm || !!error || waiting || (!!next && !snapshot) || fromPrevRooms.length > 0 || !!snapshot?.isEstimated || (s.liveRoomIds?.length ?? 0) > 1;
  if (!embedded && !hasContent) return null;
  return shell(body, menu);
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="text-2xs text-rose-400 flex items-start gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
      {text}
    </p>
  );
}
