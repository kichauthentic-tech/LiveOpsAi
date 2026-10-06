import { useRef, useState } from "react";
import { ArrowRightLeft, Upload } from "lucide-react";
import { LiveSession } from "../types";
import { checkpointAt, hostBoundaries, HostBoundary, missingCheckpoints } from "../lib/segmentCheckpoints";
import { fmtCount, parseCount, parseDashboardLink } from "../lib/handover";
import { applySegmentCheckpointFile, submitSegmentCheckpoint } from "../lib/db/handovers";
import { parseSnapshotFile, type ParsedSnapshotFile } from "../lib/liveSnapshot/extractRooms";
import { SnapshotRoomPicker } from "./SnapshotRoomPicker";
import { errorMessage } from "../lib/errorMessage";
import { fmtVndFull } from "../lib/format";
import { profileOf } from "../lib/platforms/profiles";

// Chỗ nhập report thứ nhất khi ĐỔI HOST giữa ca (0147; user chốt 06/10): host này xuống thì trợ live up NGAY số TỔNG đang
// thấy trên dashboard. Report thứ hai là Giao ca cuối ca ở ngay bên dưới — host sau = số cuối − số lúc đổi.
// Không có số lúc đổi thì GMV của ca chia cho các host theo giờ (ước lượng), nên mỗi chỗ đổi chưa có số đều báo vàng.

interface Props {
  session: LiveSession;
  canSubmit: boolean;
  onSaved: (updated: LiveSession) => void;
}

const inputCls =
  "w-full min-h-11 px-3 py-2.5 border border-[var(--border)] rounded-xl text-base font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]";
const labelCls = "block text-xs font-bold text-[var(--text-muted)] mb-1";

function BoundaryCard({ session: s, boundary: b, canSubmit, onSaved }: { boundary: HostBoundary } & Props) {
  const done = checkpointAt(s, b.atMin);
  const prof = profileOf(s);
  const third3 = prof.handoverThird;
  const [open, setOpen] = useState(!done);
  const [link, setLink] = useState(done?.link ?? s.report?.dashboardLink1 ?? s.staffCheckpoints?.find((c) => c.link)?.link ?? "");
  const [gmv, setGmv] = useState(fmtCount(done?.cumGmv));
  const [views, setViews] = useState(fmtCount(done?.cumViews));
  const [third, setThird] = useState(fmtCount(third3.key === "atc" ? done?.cumAtc : done?.cumOrders));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const byFile = prof.segmentCheckpoint === "file";

  const [pending, setPending] = useState<{ fileName: string; parsed: ParsedSnapshotFile } | null>(null);

  // Bước 1: đọc file (cả ngày nhiều phòng). Bước 2: trợ tick phòng của ca rồi mới gửi.
  const readFile = async (file: File) => {
    setSaving(true);
    setError(null);
    try {
      setPending({ fileName: file.name, parsed: await parseSnapshotFile(file) });
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

  const parsed = parseDashboardLink(link);
  const wrongPlatform = !!parsed && parsed.platform !== s.platform;
  const cumGmv = parseCount(gmv);
  const cumViews = parseCount(views);
  const cumThird = parseCount(third);
  const missing: string[] = [];
  if (!parsed) missing.push("link dashboard");
  if (cumGmv == null) missing.push("GMV");
  if (cumViews == null) missing.push("lượt xem");
  if (third3.required && cumThird == null) missing.push(`số ${third3.label.toLowerCase()}`);
  const ready = missing.length === 0 && !wrongPlatform && !saving;

  const submit = async () => {
    if (!ready || cumGmv == null) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await submitSegmentCheckpoint(s.id, {
          atMin: b.atMin,
          link,
          cumGmv,
          cumViews,
          cumOrders: third3.key === "orders" ? cumThird : null,
          cumAtc: third3.key === "atc" ? cumThird : null
        })
      );
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const numField = (id: string, label: string, value: string, set: (v: string) => void, hint?: string) => (
    <label className="block" htmlFor={id}>
      <span className={labelCls}>{label}</span>
      <input id={id} inputMode="numeric" autoComplete="off" value={value} onChange={(e) => set(e.target.value)} onBlur={() => set(fmtCount(parseCount(value)))} placeholder={hint} className={`${inputCls} font-mono tabular-nums`} />
    </label>
  );

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
            {done.source === "file" ? `Từ file ${done.fileName ?? "Creator-Live-Performance"} — số của ca tính tới lúc đổi: ` : "Số TỔNG lúc đổi: "}<span className="font-mono text-[var(--text)]">GMV {fmtVndFull(done.cumGmv)} · {fmtCount(done.cumViews ?? 0)} lượt xem{third3.key === "atc" ? (done.cumAtc != null ? ` · ${fmtCount(done.cumAtc)} ATC` : "") : ` · ${fmtCount(done.cumOrders ?? 0)} đơn`}</span>
          </p>
          <p>
            {b.fromName || "Host trước"} làm: <b className="font-mono text-[var(--text)]">GMV {fmtVndFull(Math.max(done.cumGmv - done.baseGmv, 0))}</b>
            {done.baseGmv > 0 ? " (đã trừ ca nối trước)" : ""}
          </p>
          {canSubmit && (
            <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors">
              {byFile ? "Up lại file" : "Sửa số"}
            </button>
          )}
        </div>
      )}

      {open && !canSubmit && <p className="text-xs text-[var(--text-muted)]">Trợ live (hoặc OPS khi ca không có trợ) up số khi host xuống.</p>}
      {open && canSubmit && byFile && pending && (
        <div className="space-y-2">
          <SnapshotRoomPicker
            session={s}
            rows={pending.parsed.rows}
            fileName={pending.fileName}
            untilMin={b.atMin}
            confirmLabel={`Xác nhận phòng — lưu số lúc ${b.fromName || "host"} xuống`}
            busy={saving}
            onConfirm={(rows) => void confirmRooms(rows)}
            onCancel={() => { setPending(null); setError(null); }}
          />
          {error && <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded-xl px-3 py-2">{error}</p>}
        </div>
      )}
      {open && canSubmit && byFile && !pending && (
        <div className="space-y-2">
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-center">
            <Upload className="w-5 h-5 text-[var(--text-faint)] mx-auto mb-1.5" />
            <p className="text-[11px] text-[var(--text-muted)] mb-2">
              Tải file <span className="font-bold">Creator-Live-Performance</span> từ TikTok Streamer <b>ngay lúc {b.fromName || "host"} xuống</b> rồi up vào đây — đừng đợi hết ca, vì lúc đó không còn tách được phần của từng host.
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
      {open && canSubmit && !byFile && (
        <div className="space-y-2">
          <p className="text-[11px] text-[var(--text-muted)]">
            Mở dashboard, chụp số <b>TỔNG đang thấy ngay lúc {b.fromName || "host"} xuống</b> rồi nhập — đừng đợi hết ca, vì lúc đó không còn tách được phần của từng host.
          </p>
          <label className="block" htmlFor={`cp-link-${b.atMin}`}>
            <span className={labelCls}>Link dashboard của phòng live</span>
            <input id={`cp-link-${b.atMin}`} type="url" inputMode="url" autoComplete="off" value={link} onChange={(e) => setLink(e.target.value)} className={`${inputCls} text-sm font-mono`} placeholder={prof.dashboardLinkExample} />
          </label>
          {link.trim() !== "" && !parsed && <p className="text-[11px] text-amber-300">Chưa đọc được link.</p>}
          {wrongPlatform && <p className="text-[11px] text-rose-300 font-bold">Ca này là ca {s.platform}, kiểm lại link.</p>}
          {numField(`cp-gmv-${b.atMin}`, "GMV", gmv, setGmv, "vd 11.513.359")}
          <div className="grid grid-cols-2 gap-2">
            {numField(`cp-third-${b.atMin}`, third3.label, third, setThird, third3.required ? undefined : "không bắt buộc")}
            {numField(`cp-views-${b.atMin}`, "Lượt xem", views, setViews)}
          </div>
          {error && <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2">
            {done && (
              <button type="button" onClick={() => setOpen(false)} className="min-h-12 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-sm">
                Thôi
              </button>
            )}
            <button type="button" onClick={submit} disabled={!ready} title={missing.length ? `Còn thiếu: ${missing.join(", ")}` : undefined} className="flex-1 min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm">
              {saving ? "Đang lưu..." : done ? "Cập nhật số" : `Lưu số lúc ${b.fromName || "host"} xuống`}
            </button>
          </div>
          {missing.length > 0 && <p className="text-[11px] text-[var(--text-faint)]">Còn thiếu: {missing.join(", ")}.</p>}
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
        Ca đổi host có HAI chỗ nhập report: số lúc host xuống (ở đây — ca TikTok up file Creator-Live-Performance, ca Shopee nhập số dashboard) và Giao ca cuối ca (bên dưới). Thiếu số lúc đổi thì GMV của ca chỉ chia cho các host theo giờ — không đúng người bán.
      </p>
      {bounds.map((b) => (
        <BoundaryCard key={`${b.atMin}-${s.staffCheckpoints?.find((c) => c.atMin === b.atMin)?.reportedAt ?? "new"}`} session={s} boundary={b} canSubmit={canSubmit} onSaved={onSaved} />
      ))}
    </section>
  );
}
