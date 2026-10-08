import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, Talent } from "../../types";
import { Layers, Scissors, Users, Wand2, CalendarDays, Save, ChevronDown, ChevronUp, Home, Trash2 } from "lucide-react";
import { fetchBackfillPayloads } from "../../lib/dataraw/backfillRooms";
import { type ReportPlatform } from "../../lib/reportPlatform";
import { profileOf } from "../../lib/platforms/profiles";
import { createBackfillSessions, bulkAssignSessionHosts, splitBackfillSession, deleteBackfillSession } from "../../lib/db/backfillSessions";
import { fetchInhouseRooms, markInhouseRooms, unmarkInhouseRooms, type InhouseRoom } from "../../lib/db/inhouseRooms";
import {
  planBackfillPayloads, roomIdsLinkedToSessions, BackfillRoomPayload, sessionWindows, hasOverlappingSession, buildHostGrid, fillByWeekday, copyFromPreviousMonth,
  diffAssignments, currentAssignment, DraftAssignments, prevMonthOf, LONG_ROOM_MINUTES, groupByStartHour
} from "../../lib/backfill/roomsToSessions";
import { vnParts } from "../../lib/dataraw/liveAnalysisRows";
import { talentOptionLabel } from "../../lib/talentName";
import { errorMessage } from "../../lib/errorMessage";
import { useToast } from "../../hooks/useToast";
import { useConfirm, usePrompt } from "../../hooks/useConfirm";
import { fmtVndFull } from "../../lib/format";

// Nạp bù ca từ file số liệu theo ca của sàn — TikTok: Creator-Live-Performance (migration 0086), Shopee: Live List (0156, 08/10).
// 2 bước, nằm ngay trên ô import của tab file đó trong Dữ Liệu Gốc:
//   1. "Sinh ca từ file": mỗi room → 1 ca Completed đã đối soát, host trống. Trước khi sinh, Ops phân loại từng room:
//      "agency" (mặc định, sẽ thành ca) hay "inhouse" (brand tự live — chỉ ghi nhãn vào brand_inhouse_rooms, 0157, không thành ca).
//   2. Lưới ngày × Ca 1..N để gán host/trợ live hàng loạt — công cụ điền theo thứ / sao chép
//      tháng trước thay cho việc mở form từng ca.
// Dùng được cho cả tháng đang chạy: room trợ live quên up lúc giao ca sẽ ra ca ở bước 1.

interface Props {
  platform: ReportPlatform;
  brandId: string;
  brandName: string;
  months: string[]; // "YYYY-MM" các tháng đã có batch file số liệu theo ca của sàn, mới nhất trước
  sessions: LiveSession[];
  talents: Talent[];
  onSessionsChanged: () => Promise<void>;
}

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtMoney = fmtVndFull;
const monthLabel = (m: string) => `Tháng ${parseInt(m.slice(5), 10)}/${m.slice(0, 4)}`;
function monthBounds(m: string): [string, string] {
  const [y, mm] = m.split("-").map(Number);
  const last = new Date(y, mm, 0).getDate();
  return [`${m}-01`, `${m}-${String(last).padStart(2, "0")}`];
}

// Ẩn/hiện khối này — nhớ theo trình duyệt (chỉ là tiện lợi cho người xem, không ảnh hưởng dữ liệu).
const HIDE_KEY = "liveops.backfillFromRooms.hidden";
function readHidden(): boolean {
  try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
}

export const BackfillFromRooms: React.FC<Props> = ({ platform, brandId, brandName, months, sessions, talents, onSessionsChanged }) => {
  const prof = profileOf(platform);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [month, setMonth] = useState<string>(months[0] ?? "");
  const [hidden, setHidden] = useState<boolean>(readHidden);
  const [rows, setRows] = useState<(BackfillRoomPayload | null)[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [inhouseSaved, setInhouseSaved] = useState<InhouseRoom[]>([]);
  const [inhouseDraft, setInhouseDraft] = useState<Set<string>>(new Set());
  const [showClassify, setShowClassify] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftAssignments>({});
  const [saving, setSaving] = useState(false);
  const [splitting, setSplitting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Công cụ "Điền theo thứ"
  const [toolWeekdays, setToolWeekdays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6, 0]));
  const [toolCol, setToolCol] = useState(0);
  const [toolHost, setToolHost] = useState("");
  const [toolCoHost, setToolCoHost] = useState("");
  const [toolOnlyEmpty, setToolOnlyEmpty] = useState(true);

  useEffect(() => {
    if (!month && months[0]) setMonth(months[0]);
  }, [months, month]);

  useEffect(() => {
    if (!month) return;
    let alive = true;
    setLoadingRows(true);
    setError(null);
    const [start, end] = monthBounds(month);
    fetchBackfillPayloads(brandId, platform, start, end)
      .then((payloads) => { if (alive) setRows(payloads); })
      .catch((e) => { if (alive) setError(`Không đọc được batch tháng này: ${errorMessage(e)}`); })
      .finally(() => { if (alive) setLoadingRows(false); });
    return () => { alive = false; };
  }, [brandId, platform, month]);

  // Room đã đánh dấu inhouse (0157) — tải theo brand+sàn, không theo tháng (room_id là duy nhất nên không lẫn tháng).
  useEffect(() => {
    let alive = true;
    fetchInhouseRooms(brandId, platform)
      .then((r) => { if (alive) setInhouseSaved(r); })
      .catch((e) => { if (alive) setError(`Không đọc được nhãn inhouse: ${errorMessage(e)}`); });
    return () => { alive = false; };
  }, [brandId, platform]);

  useEffect(() => { setInhouseDraft(new Set()); }, [brandId, platform, month]);

  // Đổi tháng/brand thì bỏ nháp — nháp gắn với session id nên không lẫn, nhưng UI "N thay đổi" sẽ sai.
  useEffect(() => { setDraft({}); setMessage(null); }, [brandId, month]);

  const linked = useMemo(() => roomIdsLinkedToSessions(sessions, brandId), [sessions, brandId]);
  const windows = useMemo(() => sessionWindows(sessions, brandId), [sessions, brandId]);
  const inhouseSavedIds = useMemo(() => new Set(inhouseSaved.map((r) => r.roomId)), [inhouseSaved]);
  const plan = useMemo(() => planBackfillPayloads(rows, linked, windows, inhouseSavedIds), [rows, linked, windows, inhouseSavedIds]);
  const draftInhouse = useMemo(() => plan.toCreate.filter((p) => inhouseDraft.has(p.room_id)), [plan, inhouseDraft]);
  const agencyCount = plan.toCreate.length - draftInhouse.length;
  const hourGroups = useMemo(() => groupByStartHour(plan.toCreate), [plan]);
  const savedInThisMonth = useMemo(() => {
    const [start, end] = month ? monthBounds(month) : ["", ""];
    return inhouseSaved.filter((r) => r.startedAt && vnParts(r.startedAt).date >= start && vnParts(r.startedAt).date <= end);
  }, [inhouseSaved, month]);
  const grid = useMemo(() => buildHostGrid(sessions, brandId, month), [sessions, brandId, month]);
  const prevGrid = useMemo(() => (month ? buildHostGrid(sessions, brandId, prevMonthOf(month)) : { rows: [], columns: 0 }), [sessions, brandId, month]);
  const monthSessions = useMemo(() => grid.rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c!.session)), [grid]);
  const pending = useMemo(() => diffAssignments(monthSessions, draft), [monthSessions, draft]);
  const unassigned = monthSessions.filter((s) => !(draft[s.id] ?? currentAssignment(s)).hostId).length;
  const hostOptions = useMemo(() => [...talents].sort((a, b) => a.name.localeCompare(b.name, "vi")), [talents]);

  const toggleInhouse = (ids: string[], on: boolean) =>
    setInhouseDraft((prev) => {
      const n = new Set(prev);
      for (const id of ids) { if (on) n.add(id); else n.delete(id); }
      return n;
    });

  const handleGenerate = async () => {
    if (plan.toCreate.length === 0) return;
    const agencyRows = plan.toCreate.filter((p) => !inhouseDraft.has(p.room_id));
    const inhouseRows = draftInhouse;
    const parts = [
      agencyRows.length > 0 ? `sinh ${agencyRows.length} ca agency (host để trống, gán ở lưới bên dưới)` : "",
      inhouseRows.length > 0 ? `ghi nhận ${inhouseRows.length} ${prof.liveUnitWord} là brand tự live (inhouse), không tạo ca` : ""
    ].filter(Boolean);
    if (!(await confirm(`${brandName} ${monthLabel(month)}: ${parts.join("; ")}?`))) return;
    setGenerating(true);
    setError(null);
    try {
      // Ghi nhãn inhouse trước: nếu bước sinh ca lỗi thì lần bấm lại không còn hỏi lại các room đã phân loại.
      const marked = await markInhouseRooms(brandId, platform, inhouseRows);
      if (inhouseRows.length > 0) setInhouseSaved(await fetchInhouseRooms(brandId, platform));
      setInhouseDraft(new Set());
      const r = agencyRows.length > 0 ? await createBackfillSessions(brandId, agencyRows, platform) : { inserted: 0, skipped_existing: 0, skipped_invalid: 0 };
      await onSessionsChanged();
      setMessage(
        [
          r.inserted > 0 || agencyRows.length > 0 ? `Đã sinh ${r.inserted} ca${r.skipped_existing ? `, bỏ qua ${r.skipped_existing} ${prof.liveUnitWord} đã có ca` : ""}${r.skipped_invalid ? `, ${r.skipped_invalid} dòng thiếu giờ` : ""}` : "",
          marked > 0 ? `đã ghi nhận ${marked} ${prof.liveUnitWord} inhouse` : ""
        ].filter(Boolean).join("; ") + "."
      );
    } catch (e) {
      setError(`Không sinh được ca: ${errorMessage(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleUnmark = async (roomIds: string[]) => {
    setError(null);
    try {
      await unmarkInhouseRooms(brandId, roomIds);
      setInhouseSaved(await fetchInhouseRooms(brandId, platform));
      setMessage(`Đã bỏ nhãn inhouse của ${roomIds.length} ${prof.liveUnitWord} — chúng quay lại danh sách chờ sinh ca.`);
    } catch (e) {
      setError(`Không bỏ được nhãn: ${errorMessage(e)}`);
    }
  };

  const setCell = (sessionId: string, patch: Partial<{ hostId: string; coHostId: string }>) => {
    setDraft((prev) => {
      const s = monthSessions.find((x) => x.id === sessionId)!;
      return { ...prev, [sessionId]: { ...(prev[sessionId] ?? currentAssignment(s)), ...patch } };
    });
  };

  const handleSave = async () => {
    if (pending.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const n = await bulkAssignSessionHosts(pending);
      await onSessionsChanged();
      setDraft({});
      setMessage(`Đã gán host cho ${n} ca.`);
    } catch (e) {
      setError(`Không lưu được: ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: LiveSession) => {
    const hostNote = s.hostId ? " Host đã gán cho ca này cũng mất." : "";
    if (!(await confirm(`Xoá ca ${s.date} ${s.startTime}–${s.endTime} (${fmtMoney(s.actualGmv)})?${hostNote} ${prof.liveUnitWord[0].toUpperCase()}${prof.liveUnitWord.slice(1)} trong file sẽ quay lại danh sách chờ phân loại.`, { danger: true }))) return;
    setDeleting(s.id);
    setError(null);
    try {
      await deleteBackfillSession(s.id);
      setDraft((prev) => { const n = { ...prev }; delete n[s.id]; return n; });
      await onSessionsChanged();
      setMessage(`Đã xoá ca ${s.date} ${s.startTime}–${s.endTime}.`);
    } catch (e) {
      setError(`Không xoá được ca: ${errorMessage(e)}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleSplit = async (s: LiveSession) => {
    if (!s.actualStartAt || !s.actualEndAt) return;
    const startVn = vnParts(s.actualStartAt).time;
    const endVn = vnParts(s.actualEndAt).time;
    const input = await prompt(`Tách ca ${s.date} (${startVn} → ${endVn}) tại mốc giờ nào? (giờ VN)`, {
      inputType: "time",
      confirmLabel: "Tách ca"
    });
    if (!input) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
    if (!m) { showToast("Nhập dạng HH:MM, ví dụ 22:00"); return; }
    // Mốc tách theo ngày VN của giờ bắt đầu; ca qua đêm mà mốc nhỏ hơn giờ bắt đầu thì hiểu là ngày hôm sau.
    const startDate = vnParts(s.actualStartAt).date;
    let splitMs = new Date(`${startDate}T${m[1].padStart(2, "0")}:${m[2]}:00+07:00`).getTime();
    if (splitMs <= new Date(s.actualStartAt).getTime()) splitMs += 24 * 3600 * 1000;
    setSplitting(s.id);
    setError(null);
    try {
      await splitBackfillSession(s.id, new Date(splitMs).toISOString());
      await onSessionsChanged();
      setMessage(`Đã tách ca ${s.date} tại ${input.trim()}.`);
    } catch (e) {
      setError(`Không tách được: ${errorMessage(e)}`);
    } finally {
      setSplitting(null);
    }
  };

  if (months.length === 0) return null;

  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    try { localStorage.setItem(HIDE_KEY, next ? "1" : "0"); } catch { /* trình duyệt chặn lưu — bỏ qua */ }
  };

  if (hidden) {
    return (
      <div className="bg-[var(--surface)] px-4 py-2.5 rounded-2xl border border-[var(--border)] flex items-center justify-between gap-2">
        <span className="font-bold text-[var(--text-muted)] text-xs flex items-center gap-2">
          <Layers className="w-4 h-4" /> Nạp bù ca từ file {platform} — {brandName}
        </span>
        <button type="button" onClick={toggleHidden} className="text-[11px] font-bold text-[var(--accent-text)] flex items-center gap-1">
          Hiện <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const selectCls = "bg-[var(--surface)] border border-[var(--border)] rounded-lg px-1.5 py-1 text-[11px] text-[var(--text)] w-full";

  return (
    <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-[var(--text)] text-xs flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--accent-text)]" /> Nạp bù ca từ file {platform} — {brandName}
        </h4>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)]">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button type="button" onClick={toggleHidden} className="text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1">
            Ẩn <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && <p className="text-[11px] text-rose-500">{error}</p>}
      {message && <p className="text-[11px] text-emerald-600">{message}</p>}

      {/* Bước 1 — phân loại + sinh ca */}
      <div className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--text-muted)] space-y-0.5">
            <p className="font-bold text-[var(--text)]">Bước 1 · Phân loại và sinh ca từ {prof.liveUnitWord}</p>
            {loadingRows ? (
              <p>Đang đọc file...</p>
            ) : (
              <p>
                File có <b className="text-[var(--text)]">{rows.length}</b> {prof.liveUnitWord} · đã có ca <b className="text-[var(--text)]">{plan.existing}</b>
                {plan.inhouse > 0 && <> · inhouse <b className="text-sky-500">{plan.inhouse}</b></>}
                {" "}· chờ phân loại <b className="text-[var(--text)]">{plan.toCreate.length}</b>
                {plan.toCreate.length > 0 && (
                  <> → ca agency <b className="text-[var(--text)]">{agencyCount}</b>{draftInhouse.length > 0 && <>, inhouse <b className="text-sky-500">{draftInhouse.length}</b></>}</>
                )}
                {plan.overlapping > 0 && (
                  <> · <span className="text-amber-600">{plan.overlapping} {prof.liveUnitWord} chồng giờ ca đã có trong lịch</span> — không sinh thêm, dùng Đối soát số liệu ở trên để chia số vào ca đó</>
                )}
                {plan.invalid > 0 && <> · {plan.invalid} dòng thiếu giờ (bỏ qua)</>}
                {plan.longRooms.length > 0 && (
                  <> · <span className="text-amber-600">{plan.longRooms.length} {prof.liveUnitWord} ≥ {LONG_ROOM_MINUTES / 60}h</span> — sinh xong tách ở lưới bên dưới nếu là 2 ca</>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || loadingRows || plan.toCreate.length === 0}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold text-[11px] flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" /> {generating ? "Đang lưu..." : agencyCount > 0 ? `Sinh ${agencyCount} ca` : draftInhouse.length > 0 ? `Ghi nhận ${draftInhouse.length} inhouse` : "Sinh 0 ca"}
          </button>
        </div>

        {plan.toCreate.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-[var(--text-muted)]">
              Mỗi {prof.liveUnitWord} chưa có ca có thể là <b className="text-[var(--text)]">agency live bị thiếu ca</b> hoặc <b className="text-sky-500">brand tự live (inhouse)</b>.
              Mặc định tất cả là agency — đánh dấu inhouse những {prof.liveUnitWord} không phải của agency trước khi sinh ca.
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-bold text-[var(--text-muted)]">Theo giờ bắt đầu:</span>
              {hourGroups.map((g) => {
                const allOn = g.roomIds.every((id) => inhouseDraft.has(id));
                return (
                  <button
                    key={g.hour}
                    type="button"
                    onClick={() => toggleInhouse(g.roomIds, !allOn)}
                    title={allOn ? "Bỏ đánh dấu inhouse cả cụm" : "Đánh dấu inhouse cả cụm"}
                    className={`px-2 py-0.5 rounded font-bold border ${allOn ? "bg-sky-600 text-white border-sky-600" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                  >
                    {g.label} · {g.roomIds.length}
                  </button>
                );
              })}
              <button type="button" onClick={() => setShowClassify((v) => !v)} className="ml-auto font-bold text-[var(--accent-text)] flex items-center gap-1">
                {showClassify ? "Ẩn danh sách" : `Xem ${plan.toCreate.length} ${prof.liveUnitWord}`}
                {showClassify ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
            {showClassify && (
              <div className="max-h-72 overflow-y-auto border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
                {plan.toCreate.map((p) => {
                  const on = inhouseDraft.has(p.room_id);
                  return (
                    <div key={p.room_id} className="flex items-center gap-3 px-2.5 py-1.5 text-[11px]">
                      <span className="w-28 font-mono text-[var(--text)]">{vnParts(p.started_at).label}</span>
                      <span className="w-24 text-[var(--text-muted)]">→ {vnParts(p.ended_at).time} · {Math.round(p.duration_minutes)}p</span>
                      <span className="w-28 text-right font-bold text-[var(--text)]">{fmtMoney(p.gmv)}</span>
                      <span className="w-12 text-right text-[var(--text-muted)]">{p.orders} đơn</span>
                      <span className="ml-auto flex rounded-md overflow-hidden border border-[var(--border)] font-bold">
                        <button type="button" onClick={() => toggleInhouse([p.room_id], false)} className={`px-2 py-0.5 ${!on ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)]"}`}>Agency</button>
                        <button type="button" onClick={() => toggleInhouse([p.room_id], true)} className={`px-2 py-0.5 ${on ? "bg-sky-600 text-white" : "text-[var(--text-muted)]"}`}>Inhouse</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {savedInThisMonth.length > 0 && (
          <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-2">
            <Home className="w-3.5 h-3.5 text-sky-500" />
            <span>Đã ghi nhận inhouse tháng này: <b className="text-sky-500">{savedInThisMonth.length}</b> {prof.liveUnitWord} · GMV {fmtMoney(savedInThisMonth.reduce((a, r) => a + r.gmv, 0))} — không tính vào ca agency</span>
            <button
              type="button"
              onClick={async () => { if (await confirm(`Bỏ nhãn inhouse của ${savedInThisMonth.length} ${prof.liveUnitWord} tháng này? Chúng sẽ quay lại danh sách chờ sinh ca.`)) await handleUnmark(savedInThisMonth.map((r) => r.roomId)); }}
              className="font-bold text-[var(--accent-text)]"
            >
              Bỏ nhãn
            </button>
          </div>
        )}
      </div>

      {/* Bước 2 — gán host */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-[var(--text)] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[var(--accent-text)]" /> Bước 2 · Gán host / trợ live
            <span className="font-normal text-[var(--text-muted)]">— {monthSessions.length} ca trong tháng, {unassigned} chưa có host</span>
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || pending.length === 0}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[11px] flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? "Đang lưu..." : `Lưu ${pending.length} thay đổi`}
          </button>
        </div>

        {monthSessions.length === 0 ? (
          <p className="text-[11px] text-[var(--text-faint)]">Tháng này chưa có ca {platform} nào — sinh ca ở bước 1 trước.</p>
        ) : (
          <>
            {/* Công cụ điền */}
            <div className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-3 space-y-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[var(--text-muted)]">Điền theo thứ:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                    <button
                      key={wd}
                      type="button"
                      onClick={() => setToolWeekdays((prev) => { const n = new Set(prev); if (n.has(wd)) n.delete(wd); else n.add(wd); return n; })}
                      className={`px-1.5 py-0.5 rounded font-bold border ${toolWeekdays.has(wd) ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}
                    >
                      {WEEKDAY_SHORT[wd]}
                    </button>
                  ))}
                </div>
                <select value={toolCol} onChange={(e) => setToolCol(Number(e.target.value))} className={`${selectCls} !w-auto`}>
                  {Array.from({ length: grid.columns }, (_, i) => <option key={i} value={i}>Ca {i + 1}</option>)}
                </select>
                <select value={toolHost} onChange={(e) => setToolHost(e.target.value)} className={`${selectCls} !w-auto`}>
                  <option value="">Host: giữ nguyên</option>
                  {hostOptions.map((t) => <option key={t.id} value={t.id}>Host: {talentOptionLabel(t)}</option>)}
                </select>
                <select value={toolCoHost} onChange={(e) => setToolCoHost(e.target.value)} className={`${selectCls} !w-auto`}>
                  <option value="">Trợ: giữ nguyên</option>
                  <option value="__none__">Trợ: không có</option>
                  {hostOptions.map((t) => <option key={t.id} value={t.id}>Trợ: {talentOptionLabel(t)}</option>)}
                </select>
                <label className="flex items-center gap-1 text-[var(--text-muted)]">
                  <input type="checkbox" checked={toolOnlyEmpty} onChange={(e) => setToolOnlyEmpty(e.target.checked)} /> chỉ ô trống
                </label>
                <button
                  type="button"
                  disabled={!toolHost && !toolCoHost}
                  onClick={() =>
                    setDraft((prev) =>
                      fillByWeekday(grid, prev, {
                        weekdays: toolWeekdays, col: toolCol,
                        hostId: toolHost || undefined,
                        coHostId: toolCoHost === "__none__" ? "" : toolCoHost || undefined,
                        onlyEmpty: toolOnlyEmpty
                      })
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold"
                >
                  Điền
                </button>
                <span className="text-[var(--text-faint)]">·</span>
                <button
                  type="button"
                  disabled={prevGrid.rows.length === 0}
                  title={prevGrid.rows.length === 0 ? `Chưa có ca ${monthLabel(prevMonthOf(month))}` : `Khớp theo thứ + Ca từ ${monthLabel(prevMonthOf(month))}`}
                  onClick={() => setDraft((prev) => copyFromPreviousMonth(grid, prevGrid, prev, toolOnlyEmpty))}
                  className="px-2.5 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-50 text-[var(--text)] font-bold flex items-center gap-1"
                >
                  <CalendarDays className="w-3 h-3" /> Sao chép {monthLabel(prevMonthOf(month))}
                </button>
                {Object.keys(draft).length > 0 && (
                  <button type="button" onClick={() => setDraft({})} className="text-[var(--text-muted)] hover:text-[var(--text)] underline">
                    Bỏ nháp
                  </button>
                )}
              </div>
            </div>

            {/* Lưới */}
            <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
              <table className="w-full text-[11px]">
                <thead className="bg-[var(--surface-elevated)]/60 text-[var(--text-muted)]">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-bold whitespace-nowrap">Ngày</th>
                    {Array.from({ length: grid.columns }, (_, i) => (
                      <th key={i} className="text-left px-2 py-1.5 font-bold whitespace-nowrap">Ca {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => (
                    <tr key={row.date} className={`border-t border-[var(--border-muted)] ${row.weekday === 0 ? "bg-rose-50/40 dark:bg-rose-950/20" : ""}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap font-bold text-[var(--text)]">
                        {WEEKDAY_SHORT[row.weekday]} {row.date.slice(8)}/{row.date.slice(5, 7)}
                      </td>
                      {row.cells.map((cell, i) => {
                        if (!cell) return <td key={i} className="px-2 py-1.5 text-[var(--text-faint)]">—</td>;
                        const s = cell.session;
                        const a = draft[s.id] ?? currentAssignment(s);
                        const changed = !!draft[s.id] && (draft[s.id].hostId !== (s.hostId ?? "") || draft[s.id].coHostId !== (s.coHostId ?? ""));
                        const isLong = (s.liveDurationMinutes ?? 0) >= LONG_ROOM_MINUTES;
                        return (
                          <td key={i} className={`px-2 py-1.5 align-top min-w-[180px] ${changed ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                            <div className="flex items-center justify-between gap-1 text-[var(--text-muted)] font-mono mb-1">
                              <span>
                                {s.startTime}–{s.endTime}
                                <span className="font-sans ml-1.5 text-[var(--text-faint)]">{fmtMoney(s.actualGmv)}</span>
                              </span>
                              {s.isBackfill && isLong && hasOverlappingSession(s, windows) && (
                                <span className="text-[var(--text-faint)] font-sans" title="Đã có ca khác chồng giờ ca này — tách sẽ tạo ca thừa. Dùng Đối soát số liệu để chia số vào các ca có sẵn.">đã có ca chồng giờ</span>
                              )}
                              {s.isBackfill && (
                                <button
                                  type="button"
                                  title="Xoá ca nạp bù này (nạp nhầm, hoặc là ca inhouse)"
                                  disabled={deleting === s.id}
                                  onClick={() => handleDelete(s)}
                                  className="ml-auto p-1.5 -m-1.5 text-[var(--text-faint)] hover:text-rose-500 disabled:opacity-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                              {s.isBackfill && isLong && !hasOverlappingSession(s, windows) && (
                                <button
                                  type="button"
                                  title={`${prof.liveUnitWord[0].toUpperCase()}${prof.liveUnitWord.slice(1)} dài — tách thành 2 ca`}
                                  disabled={splitting === s.id}
                                  onClick={() => handleSplit(s)}
                                  className="text-amber-600 hover:text-amber-500 disabled:opacity-50 flex items-center gap-0.5"
                                >
                                  <Scissors className="w-3 h-3" /> tách
                                </button>
                              )}
                            </div>
                            <div className="space-y-1">
                              <select value={a.hostId} onChange={(e) => setCell(s.id, { hostId: e.target.value })} className={`${selectCls} ${!a.hostId ? "border-rose-300 dark:border-rose-800" : ""}`}>
                                <option value="">— Host —</option>
                                {hostOptions.map((t) => <option key={t.id} value={t.id}>{talentOptionLabel(t)}</option>)}
                              </select>
                              <select value={a.coHostId} onChange={(e) => setCell(s.id, { coHostId: e.target.value })} className={selectCls}>
                                <option value="">— Trợ live —</option>
                                {hostOptions.filter((t) => t.id !== a.hostId).map((t) => <option key={t.id} value={t.id}>{talentOptionLabel(t)}</option>)}
                              </select>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
