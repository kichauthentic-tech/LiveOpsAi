import { useRef, useState } from "react";
import { ArrowRightLeft, Upload } from "lucide-react";
import { LiveSession } from "../types";
import { checkpointAt, hostBoundaries, HostBoundary, missingCheckpoints } from "../lib/segmentCheckpoints";
import { fmtCount } from "../lib/handover";
import { applySegmentCheckpointFile } from "../lib/db/handovers";
import { parseSnapshotFile, type ParsedSnapshotFile } from "../lib/liveSnapshot/extractRooms";
import { SnapshotRoomPicker } from "./SnapshotRoomPicker";
import { errorMessage } from "../lib/errorMessage";
import { fmtVndFull } from "../lib/format";
import { profileOf } from "../lib/platforms/profiles";
import { platformOf } from "../lib/reportPlatform";
import { METRIC } from "../lib/metricGlossary";

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
  const [open, setOpen] = useState(!done);
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

  return (
    <div className={`rounded-xl border p-2.5 space-y-2 ${done ? "border-emerald-800 bg-emerald-950/30" : "border-amber-800 bg-amber-950/30"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-[var(--text)]">
          {b.fromName || "Host"} xuống · {b.toName || "host mới"} vào lúc <span className="font-mono">{b.clock}</span>
        </p>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${done ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"}`}>
          {done ? "đã up số" : "chưa up số"}
        </span>
      </div>

      {done && !open && (
        <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
          <p>
            {done.source === "file" ? `Từ file ${done.fileName ?? prof.reconciliationFile} — số của ca tính tới lúc đổi: ` : "Số TỔNG lúc đổi (gõ tay, bản cũ): "}<span className="font-mono text-[var(--text)]">GMV {fmtVndFull(done.cumGmv)} · {fmtCount(done.cumViews ?? 0)} {prof.viewsLabel}{done.cumAtc != null ? ` · ${fmtCount(done.cumAtc)} ${METRIC.atc}` : ""} · {fmtCount(done.cumOrders ?? 0)} {METRIC.orders}</span>
          </p>
          <p>
            {b.fromName || "Host trước"} làm: <b className="font-mono text-[var(--text)]">GMV {fmtVndFull(Math.max(done.cumGmv - done.baseGmv, 0))}</b>
            {done.baseGmv > 0 ? " (đã trừ ca nối trước)" : ""}
          </p>
          {canSubmit && (
            <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors">
              Up lại file
            </button>
          )}
        </div>
      )}

      {open && !canSubmit && <p className="text-xs text-[var(--text-muted)]">Trợ live (hoặc OPS khi ca không có trợ) up số khi host xuống.</p>}
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
            <p className="text-[11px] text-[var(--text-muted)] mb-2">
              Tải file <span className="font-bold">{prof.reconciliationFile}</span> từ {prof.liveFileWhere} <b>ngay lúc {b.fromName || "host"} xuống</b> rồi up vào đây — đừng đợi hết ca, vì lúc đó không còn tách được phần của từng host.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={saving} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] disabled:opacity-40">
              <Upload className="w-3.5 h-3.5" />
              {saving ? "Đang xử lý..." : "Chọn File Số Liệu"}
            </button>
          </div>
          {error && <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded-xl px-3 py-2">{error}</p>}
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
        <h4 className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold flex items-center gap-1.5">
          <ArrowRightLeft className="w-3.5 h-3.5" /> Report lúc đổi host
        </h4>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${pending === 0 ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"}`}>
          {pending === 0 ? "đủ số" : `còn ${pending} chỗ chưa up`}
        </span>
      </div>
      <p className="text-[11px] text-[var(--text-faint)]">
        Ca đổi host có HAI chỗ nhập report: số lúc host xuống (ở đây — up file {profileOf(s).reconciliationFile} của sàn) và Giao ca cuối ca (bên dưới). Thiếu số lúc đổi thì GMV của ca chỉ chia cho các host theo giờ — không đúng người bán.
      </p>
      {bounds.map((b) => (
        <BoundaryCard key={`${b.atMin}-${s.staffCheckpoints?.find((c) => c.atMin === b.atMin)?.reportedAt ?? "new"}`} session={s} boundary={b} canSubmit={canSubmit} onSaved={onSaved} />
      ))}
    </section>
  );
}
