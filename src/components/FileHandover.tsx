import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { LiveSession } from "../types";
import { submitFileHandover } from "../lib/db/handovers";
import { errorMessage } from "../lib/errorMessage";
import { hasSnapshot } from "../lib/sessionLedger";
import { SessionLiveSnapshotUpload } from "./SessionLiveSnapshotUpload";
import { SessionRoomCase } from "./SessionRoomCase";
import { HandoverIncidents, incidentsFromReport, incidentValues } from "./HandoverIncidents";
import { fetchSnapshotParts } from "../lib/db/sessionRoomLinks";
import { suggestedRestartCount } from "../lib/liveSnapshot/roomCases";
import { profileOf } from "../lib/platforms/profiles";
import { durationDeviationInfo } from "../lib/sessionStatus";

// Giao ca, MỘT luồng cho cả hai sàn (TikTok user chốt 06/10 tối; Shopee chuyển sang file 08/10, migration 0154): (1) up file số liệu
// tải từ sàn ngay khi hết ca — TikTok Creator-Live-Performance, Shopee Live List — file giữ đúng ranh giới ca nối (số cộng dồn của
// phòng/phiên, app trừ lần up trước, 0078); (2) các lượt live + ca nối (11/10: nằm ngay trong giao ca — restart thì mỗi lượt up file riêng,
// room chạy qua giờ giao thì đề xuất sẵn ca sau để trợ xác nhận); (3) chạm chọn sự cố/OT rồi bấm Giao ca (DB từ chối khi chưa có file).

interface Props {
  session: LiveSession;
  /** Cho khối "Lượt live & ca nối": OPS được xác nhận nối từ ca trước; allSessions để vẽ chuỗi ca liền kề. */
  isOps?: boolean;
  allSessions?: LiveSession[];
  onSaved: (updated: LiveSession[]) => void;
  onCancel?: () => void;
}

export function FileHandover({ session: s, isOps = false, allSessions, onSaved, onCancel }: Props) {
  const [incidents, setIncidents] = useState(() => incidentsFromReport(s.report));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileDone = hasSnapshot(s);
  const prof = profileOf(s);

  // Ca bị ngắt room (0153): điền sẵn "Restart ×N" theo số lần ngắt đã ghi / số room − 1 — chỉ gợi ý, trợ vẫn sửa được. Không đụng
  // vào report đã có số restart hoặc khi trợ đã tự bật/tắt.
  const roomCount = s.liveRoomIds?.length ?? 0;
  useEffect(() => {
    if ((s.report?.restartCount ?? 0) > 0) return;
    let alive = true;
    fetchSnapshotParts(s.id)
      .then((parts) => {
        const n = suggestedRestartCount(parts.length, roomCount);
        if (!alive || n <= 0) return;
        setIncidents((cur) => (cur.on.includes("restart") ? cur : { ...cur, on: [...cur.on, "restart"], restarts: n }));
      })
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy theo ca + số room, không theo state sự cố đang gõ
  }, [s.id, roomCount]);

  // File cho thấy live ngắn hơn lịch (≥ 10 phút) mà ca chưa giao: hiện sẵn "Off sớm" đúng số phút để trợ chỉ cần chọn lý do (0180 —
  // Điều Phối Lịch Live đo giờ mất theo lý do). Gợi ý tính lúc vẽ; trợ đổi bất kỳ ô nào thì giữ đúng thứ trợ chọn.
  const [touched, setTouched] = useState(false);
  const early = durationDeviationInfo(s);
  const earlyMin = early?.kind === "early" ? early.minutes : 0;
  const shown =
    !touched && !s.report?.handoverAt && earlyMin > 0 && !incidents.on.includes("early") ? { ...incidents, on: [...incidents.on, "early" as const], earlyMinutes: earlyMin } : incidents;
  const changeIncidents = (v: typeof incidents) => {
    setTouched(true);
    setIncidents(v);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved([await submitFileHandover(s.id, incidentValues(shown))]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const stepState = (done: boolean, active: boolean): StepState => (done ? "done" : active ? "active" : "todo");
  return (
    <div className="space-y-4">
      <ol>
        <Step no={1} state={stepState(fileDone, !fileDone)} title={`Up file ${prof.reconciliationFile}`}>
          <SessionLiveSnapshotUpload session={s} onApplied={(u) => onSaved([u])} />
        </Step>
        <Step no={2} state={stepState(false, fileDone)} title="Lượt live & ca nối" hint="chỉ khi có restart / chạy sang ca sau">
          <SessionRoomCase key={s.id} session={s} canEdit isOps={isOps} allSessions={allSessions} onSessionsUpdated={onSaved} embedded restartFlagged={shown.on.includes("restart")} />
        </Step>
        <Step no={3} state={stepState(false, fileDone)} title="Ca này có gì?" last>
          <HandoverIncidents value={shown} onChange={changeIncidents} />
        </Step>
      </ol>
      {error && <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded-xl px-3 py-2">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-11 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-sm">
            Thôi
          </button>
        )}
        {/* Chưa có file: nút nói luôn lý do khoá (trước là nút xanh mờ + một dòng chú thích riêng bên dưới). */}
        <button
          type="button"
          onClick={submit}
          disabled={!fileDone || saving}
          className={`flex-1 min-h-11 rounded-xl font-black text-sm transition-colors ${
            fileDone ? "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white" : "bg-[var(--surface-elevated)] text-[var(--text-faint)] font-bold cursor-not-allowed"
          }`}
        >
          {!fileDone ? "Up file ở bước 1 trước để giao ca" : saving ? "Đang giao ca..." : s.report?.handoverAt ? "Cập nhật giao ca" : "Giao ca"}
        </button>
      </div>
    </div>
  );
}

// Bố cục 23/10: ba bước thành dải bước dọc (số tròn + vạch nối) — trước là ba tiêu đề chữ "1 · / 2 · / 3 ·" cùng cỡ với nội dung,
// không thấy bước nào xong, bước nào đang tới lượt.
type StepState = "done" | "active" | "todo";
const STEP_DOT: Record<StepState, string> = {
  done: "bg-emerald-600 border-emerald-600 text-white",
  active: "seg-on",
  todo: "border-[var(--border)] text-[var(--text-faint)]"
};

function Step({ no, state, title, hint, last = false, children }: { no: number; state: StepState; title: string; hint?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-3">
      {!last && <span aria-hidden className="absolute left-[13px] top-8 bottom-1 w-px bg-[var(--border)]" />}
      <span className={`relative z-[1] w-7 h-7 shrink-0 rounded-full border flex items-center justify-center text-xs font-black ${STEP_DOT[state]}`}>
        {state === "done" ? <Check className="w-4 h-4" /> : no}
      </span>
      <div className={`min-w-0 flex-1 space-y-2 ${last ? "" : "pb-5"}`}>
        <p className="min-h-7 flex flex-wrap items-baseline gap-x-2 pt-1 text-sm font-bold text-[var(--text)]">
          <span>
            <span className="sr-only">{no} · </span>
            {title}
          </span>
          {state === "done" && <span className="text-xs font-semibold text-emerald-400">đã có</span>}
          {hint && <span className="text-[11px] font-normal text-[var(--text-faint)]">{hint}</span>}
        </p>
        {children}
      </div>
    </li>
  );
}
