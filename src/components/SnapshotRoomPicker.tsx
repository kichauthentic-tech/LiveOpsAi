import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { LiveSession } from "../types";
import type { SnapshotRoomRow } from "../lib/liveSnapshot/extractRooms";
import { classifyRooms, sessionWindow, shortRoomId, sumRooms } from "../lib/liveSnapshot/roomSelection";
import { roomsMissingFromPrev, type PrevBaseline } from "../lib/liveSnapshot/roomCases";
import { fmtCount } from "../lib/handover";
import { fmtVndFull } from "../lib/format";
import { profileOf } from "../lib/platforms/profiles";

// Bước "chọn đúng phòng/phiên" sau khi chọn file số liệu (TikTok Creator-Live-Performance, Shopee Live List): file là cả ngày nhiều dòng, trợ tick phòng ĐANG LIVE
// của ca mình rồi mới gửi (client chỉ gửi dòng đã tick). Dùng cho cả up file giao ca và up file lúc đổi host.

interface Props {
  session: LiveSession;
  rows: SnapshotRoomRow[];
  fileName: string;
  /** Cắt cửa sổ ca ở phút N (số lúc đổi host). */
  untilMin?: number;
  /** Phòng đã chọn ở lần up trước của ca này — tick sẵn lại. */
  previouslySelected?: string[];
  /** Ca nối từ ca trước: mốc trừ của ca trước — cảnh báo phòng đã tick mà ca trước không có (0153). */
  prevBaseline?: PrevBaseline & { label: string };
  /** Tiêu đề thay thế (vd mảnh sau của ca bị ngắt room). */
  heading?: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: (rows: SnapshotRoomRow[]) => void;
  onCancel: () => void;
}

const vnTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "…";
const dur = (m: number) => {
  const r = Math.round(m);
  return `${Math.floor(r / 60)}h${String(r % 60).padStart(2, "0")}`;
};

export function SnapshotRoomPicker({ session: s, rows, fileName, untilMin, previouslySelected, prevBaseline, heading, confirmLabel, busy, onConfirm, onCancel }: Props) {
  const prof = profileOf(s);
  const noun = prof.liveFileRowNoun; // "phòng" (TikTok) / "phiên" (Shopee)
  const viewsWord = prof.viewsLabel.toLowerCase();
  const win = useMemo(() => sessionWindow(s, untilMin), [s, untilMin]);
  const choices = useMemo(() => classifyRooms(rows, win), [rows, win]);
  const [picked, setPicked] = useState<Set<string>>(() => {
    const prev = new Set(previouslySelected ?? []);
    const fromPrev = choices.filter((c) => c.inWindow && prev.has(c.row.roomId));
    return new Set((fromPrev.length > 0 ? fromPrev : choices.filter((c) => c.suggested)).map((c) => c.row.roomId));
  });
  const selected = choices.filter((c) => picked.has(c.row.roomId)).map((c) => c.row);
  const totals = sumRooms(selected);
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const edgeTicked = choices.filter((c) => picked.has(c.row.roomId) && c.overlapShare < 0.5);
  const missingFromPrev = prevBaseline ? roomsMissingFromPrev(selected, prevBaseline) : [];
  const endClock = new Date(win.endMs).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-2.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--surface-base)] p-3">
      <div>
        <p className="text-xs font-bold text-[var(--text)]">{heading ?? `Chọn ${noun} live của ca này`}</p>
        <p className="text-[11px] text-[var(--text-muted)]">
          File <span className="font-mono">{fileName}</span> có <b>{rows.length}</b> {noun} (cả ngày). Tick đúng {noun} ca {s.startTime}–{s.endTime}
          {untilMin != null ? ` tính tới ${endClock}` : ""} đang live — ca bị tắt/bật lại stream sẽ có nhiều {noun} liền nhau.
        </p>
      </div>

      <ul className="space-y-1.5">
        {choices.map((c) => {
          const on = picked.has(c.row.roomId);
          return (
            <li key={c.row.roomId}>
              <label
                className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-xs ${
                  !c.inWindow ? "opacity-45 border-[var(--border)]" : on ? "border-emerald-700 bg-emerald-950/30 cursor-pointer" : "border-[var(--border)] cursor-pointer"
                }`}
              >
                <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0" checked={on} disabled={!c.inWindow} onChange={() => toggle(c.row.roomId)} />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block font-bold text-[var(--text)]">
                    {vnTime(c.row.startedAt)} → {c.row.endedAt ? vnTime(c.row.endedAt) : "đang live"} <span className="font-normal text-[var(--text-muted)]">({dur(c.row.durationMinutes)})</span>
                  </span>
                  <span className="block font-mono text-[11px] text-[var(--text-muted)]">
                    GMV {fmtVndFull(c.row.gmv)} · {fmtCount(c.row.orders)} đơn · {fmtCount(c.row.views)} {viewsWord} · {noun} {shortRoomId(c.row.roomId)}
                    {c.row.roomTitle ? ` · "${c.row.roomTitle}"` : ""}
                  </span>
                  {!c.inWindow && <span className="block text-[11px] text-[var(--text-faint)]">Ngoài giờ ca — không tính cho ca này.</span>}
                  {c.inWindow && c.overlapShare < 0.5 && (
                    <span className="block text-[11px] text-amber-300">Chỉ {Math.round(c.overlapShare * 100)}% {noun} nằm trong ca này — nhiều khả năng của ca kề bên.</span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className={`rounded-lg px-2.5 py-2 text-xs ${selected.length === 0 ? "bg-rose-950/50 text-rose-200 border border-rose-800" : "bg-emerald-950/40 text-emerald-200 border border-emerald-800"}`}>
        {selected.length === 0 ? (
          `Chưa tick ${noun} nào.`
        ) : (
          <>
            Ca này = <b>{totals.rooms} {noun}</b> · <b className="font-mono">GMV {fmtVndFull(totals.gmv)} · {fmtCount(totals.orders)} đơn · {fmtCount(totals.views)} {viewsWord}</b>
            <span className="text-[11px] opacity-80"> (số cộng dồn của {noun}; ca nối cùng {noun} app tự trừ lần up trước)</span>
          </>
        )}
      </div>
      {edgeTicked.length > 0 && (
        <p className="text-[11px] text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          Bạn đã tick {noun} chủ yếu nằm ngoài ca. Nếu ca kề bên chưa up file thì số cả {noun} sẽ bị tính cho ca này.
        </p>
      )}

      {prevBaseline && missingFromPrev.length > 0 && (
        <p className="text-[11px] text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {noun[0].toUpperCase() + noun.slice(1)} {missingFromPrev.map(shortRoomId).join(", ")} bắt đầu trước giờ hết ca {prevBaseline.label} nhưng ca đó không có {noun} này — ca này sẽ nhận CẢ {noun}. Nhờ trợ ca trước kiểm tra file của họ.
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-sm">
          Chọn file khác
        </button>
        <button
          type="button"
          onClick={() => onConfirm(selected)}
          disabled={busy || selected.length === 0}
          className="flex-1 min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm"
        >
          {busy ? "Đang lưu..." : confirmLabel}
        </button>
      </div>
    </div>
  );
}
