import { platformText } from "../lib/metricGlossary";
import { useRef, useState } from "react";
import { ArrowRightLeft, Upload } from "lucide-react";
import { LiveSession } from "../types";
import { checkpointAt, hostBoundaries, HostBoundary, missingCheckpoints } from "../lib/segmentCheckpoints";
import { applySegmentCheckpointFile, setSegmentCheckpointGmv } from "../lib/db/handovers";
import { parseSnapshotFile, type ParsedSnapshotFile } from "../lib/liveSnapshot/extractRooms";
import { SnapshotRoomPicker } from "./SnapshotRoomPicker";
import { errorMessage } from "../lib/errorMessage";
import { fmtVndFull } from "../lib/format";
import { profileOf } from "../lib/platforms/profiles";
import { platformOf } from "../lib/reportPlatform";
import { GmvEditor } from "./GmvEditor";

// Chỗ nhập report thứ nhất khi ĐỔI HOST giữa ca (0147; user chốt 06/10): host này xuống thì trợ live up NGAY file số liệu của sàn
// (TikTok Creator-Live-Performance 0148, Shopee Live List 0154 — trước đó Shopee gõ số dashboard). Report thứ hai là Giao ca cuối ca
// ở ngay bên dưới — host sau = số cuối − số lúc đổi.
// Không có số lúc đổi thì GMV của ca chia cho các host theo giờ (ước lượng), nên mỗi chỗ đổi chưa có số đều báo vàng.

interface Props {
  session: LiveSession;
  canSubmit: boolean;
  onSaved: (updated: LiveSession) => void;
}

function BoundaryCard({ session: s, boundary: b, canSubmit, onSaved }: { boundary: HostBoundary } & Props) {
  const done = checkpointAt(s, b.atMin);
  const prof = profileOf(s);
  const tooBig = !!done && (s.actualGmv ?? 0) > 0 && done.cumGmv - done.baseGmv > (s.actualGmv ?? 0);
  const [open, setOpen] = useState(!done);
  const [typing, setTyping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<{ fileName: string; parsed: ParsedSnapshotFile } | null>(null);

  // Bước 1: đọc file (cả ngày nhiều phòng). Bước 2: trợ tick phòng của ca rồi mới gửi.
  const readFile = async (file: File) => {
    setSaving(true);
    setError(null);
    try {
      setPending({ fileName: file.name, parsed: await parseSnapshotFile(file, platformOf(s)) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const confirmRooms = async (rows: ParsedSnapshotFile["rows"]) => {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await applySegmentCheckpointFile(s.id, b.atMin, pending.fileName, rows));
      setPending(null);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveTyped = async (gmv: number) => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await setSegmentCheckpointGmv(s.id, b.atMin, gmv));
      setTyping(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-xl border p-2.5 space-y-2 ${done ? "border-emerald-800 bg-emerald-950/30" : "border-amber-800 bg-amber-950/30"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-[var(--text)]">
          {b.fromName || "Host"} xuống · {b.toName || "host mới"} vào lúc <span className="font-mono">{b.clock}</span>
        </p>
        <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${done ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"}`}>
          {done ? (done.source === "typed" ? "đã gõ" : "đã có số") : "chưa có số"}
        </span>
      </div>

      {done && !open && !typing && (
        <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
          <p>
            {b.fromName || "Host trước"} làm: <b className="font-mono text-[var(--text)]">{platformText("GMV", prof.id)} {fmtVndFull(Math.max(done.cumGmv - done.baseGmv, 0))}</b>
            {done.source === "typed" ? " · gõ tay" : done.baseGmv > 0 ? " · đã trừ ca nối trước" : ""}
          </p>
          {tooBig && (
            <p className="text-2xs text-amber-300">
              Lớn hơn GMV cả ca ({fmtVndFull(s.actualGmv ?? 0)}) — file tải trễ, số này lẫn phần ca sau. Gõ số đúng lúc {b.fromName || "host"} xuống.
            </p>
          )}
          {canSubmit && (
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => setTyping(true)} className={`text-2xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${tooBig ? "bg-amber-950 text-amber-300 border-amber-800 hover:bg-amber-900" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]"}`}>
                Gõ GMV đúng
              </button>
              <button type="button" onClick={() => setOpen(true)} className="text-2xs font-bold px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors">
                Tải lại file
              </button>
            </div>
          )}
        </div>
      )}
      {typing && canSubmit && (
        <div className="space-y-1">
          <p className="text-2xs text-[var(--text-muted)]">GMV của {b.fromName || "host"} tới lúc xuống (số trên dashboard). Đơn, lượt xem tự chia theo %.</p>
          <GmvEditor initial={done ? Math.max(done.cumGmv - done.baseGmv, 0) : undefined} busy={saving} onSave={(v) => void saveTyped(v)} onCancel={() => { setTyping(false); setError(null); }} />
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </div>
      )}

      {open && !canSubmit && <p className="text-xs text-[var(--text-muted)]">Trợ live (hoặc OPS khi ca không có trợ) tải số liệu lên khi host xuống.</p>}
      {open && canSubmit && pending && (
        <div className="space-y-2">
          <SnapshotRoomPicker
            session={s}
            rows={pending.parsed.rows}
            fileName={pending.fileName}
            untilMin={b.atMin}
            confirmLabel={`Xác nhận ${prof.liveFileRowNoun} — lưu số lúc ${b.fromName || "host"} xuống`}
            busy={saving}
            onConfirm={(rows) => void confirmRooms(rows)}
            onCancel={() => { setPending(null); setError(null); }}
          />
          {error && <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded-xl px-3 py-2">{error}</p>}
        </div>
      )}
      {open && canSubmit && !pending && (
        <div className="space-y-2">
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-center">
            <Upload className="w-5 h-5 text-[var(--text-faint)] mx-auto mb-1.5" />
            <p className="text-2xs text-[var(--text-muted)] mb-2">
              Tải file <span className="font-bold">{prof.reconciliationFile}</span> ngay lúc <b>{b.fromName || "host"} xuống</b>. Tải trễ thì gõ GMV tay.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={saving} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] disabled:opacity-40">
              <Upload className="w-3.5 h-3.5" />
              {saving ? "Đang xử lý..." : "Chọn File Số Liệu"}
            </button>
          </div>
          {error && <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => { setTyping(true); setOpen(false); }} className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text)] font-bold text-sm">Gõ GMV tay</button>
          </div>
          {done && (
            <button type="button" onClick={() => setOpen(false)} className="min-h-10 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-sm">Thôi</button>
          )}
        </div>
      )}
    </div>
  );
}

export function HostChangeReports({ session: s, canSubmit, onSaved }: Props) {
  const bounds = hostBoundaries(s);
  if (bounds.length === 0) return null;
  const pending = missingCheckpoints(s).length;
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-base)]/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-[var(--text-muted)] flex items-center gap-1.5">
          <ArrowRightLeft className="w-3.5 h-3.5" /> Report lúc đổi host
        </h4>
        <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${pending === 0 ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"}`}>
          {pending === 0 ? "đủ số" : `còn ${pending} chỗ chưa có số`}
        </span>
      </div>
      {bounds.map((b) => (
        <BoundaryCard key={`${b.atMin}-${s.staffCheckpoints?.find((c) => c.atMin === b.atMin)?.reportedAt ?? "new"}`} session={s} boundary={b} canSubmit={canSubmit} onSaved={onSaved} />
      ))}
    </section>
  );
}
