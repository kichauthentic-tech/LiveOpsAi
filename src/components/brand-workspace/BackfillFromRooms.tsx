import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, Talent } from "../../types";
import { Layers, Scissors, Users, Wand2, CalendarDays, Save } from "lucide-react";
import { fetchCreatorLivePerfMonthSlice, CreatorLivePerfRow } from "../../lib/dataraw/creatorLivePerfSlice";
import { createBackfillSessions, bulkAssignSessionHosts, splitBackfillSession } from "../../lib/db/backfillSessions";
import {
  planBackfill, roomIdsLinkedToSessions, buildHostGrid, fillByWeekday, copyFromPreviousMonth,
  diffAssignments, currentAssignment, DraftAssignments, prevMonthOf, LONG_ROOM_MINUTES
} from "../../lib/backfill/roomsToSessions";
import { vnParts } from "../../lib/dataraw/liveAnalysisRows";
import { talentOptionLabel } from "../../lib/talentName";

// Nạp bù ca từ file Creator-Live-Performance (migration 0086) — 2 bước, nằm ngay dưới ô import
// của tab "Creator Live Performance" trong Dữ Liệu Gốc:
//   1. "Sinh ca từ file": mỗi room → 1 ca Completed đã đối soát, host trống.
//   2. Lưới ngày × Ca 1..N để gán host/trợ live hàng loạt — công cụ điền theo thứ / sao chép
//      tháng trước thay cho việc mở form từng ca.
// Dùng được cho cả tháng đang chạy: room trợ live quên up lúc giao ca sẽ ra ca ở bước 1.

interface Props {
  brandId: string;
  brandName: string;
  months: string[]; // "YYYY-MM" các tháng đã có batch Creator-Live-Performance, mới nhất trước
  sessions: LiveSession[];
  talents: Talent[];
  onSessionsChanged: () => Promise<void>;
}

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtMoney = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;
const monthLabel = (m: string) => `Tháng ${parseInt(m.slice(5), 10)}/${m.slice(0, 4)}`;
function monthBounds(m: string): [string, string] {
  const [y, mm] = m.split("-").map(Number);
  const last = new Date(y, mm, 0).getDate();
  return [`${m}-01`, `${m}-${String(last).padStart(2, "0")}`];
}

export const BackfillFromRooms: React.FC<Props> = ({ brandId, brandName, months, sessions, talents, onSessionsChanged }) => {
  const [month, setMonth] = useState<string>(months[0] ?? "");
  const [rows, setRows] = useState<CreatorLivePerfRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftAssignments>({});
  const [saving, setSaving] = useState(false);
  const [splitting, setSplitting] = useState<string | null>(null);
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
    fetchCreatorLivePerfMonthSlice(brandId, start, end)
      .then((slice) => { if (alive) setRows(slice.rows); })
      .catch((e: any) => { if (alive) setError(`Không đọc được batch tháng này: ${e.message ?? e}`); })
      .finally(() => { if (alive) setLoadingRows(false); });
    return () => { alive = false; };
  }, [brandId, month]);

  // Đổi tháng/brand thì bỏ nháp — nháp gắn với session id nên không lẫn, nhưng UI "N thay đổi" sẽ sai.
  useEffect(() => { setDraft({}); setMessage(null); }, [brandId, month]);

  const linked = useMemo(() => roomIdsLinkedToSessions(sessions, brandId), [sessions, brandId]);
  const plan = useMemo(() => planBackfill(rows, linked), [rows, linked]);
  const grid = useMemo(() => buildHostGrid(sessions, brandId, month), [sessions, brandId, month]);
  const prevGrid = useMemo(() => (month ? buildHostGrid(sessions, brandId, prevMonthOf(month)) : { rows: [], columns: 0 }), [sessions, brandId, month]);
  const monthSessions = useMemo(() => grid.rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c!.session)), [grid]);
  const pending = useMemo(() => diffAssignments(monthSessions, draft), [monthSessions, draft]);
  const unassigned = monthSessions.filter((s) => !(draft[s.id] ?? currentAssignment(s)).hostId).length;
  const hostOptions = useMemo(() => [...talents].sort((a, b) => a.name.localeCompare(b.name, "vi")), [talents]);

  const handleGenerate = async () => {
    if (plan.toCreate.length === 0) return;
    if (!window.confirm(`Sinh ${plan.toCreate.length} ca cho ${brandName} ${monthLabel(month)} từ file? Host để trống, gán ở lưới bên dưới.`)) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await createBackfillSessions(brandId, plan.toCreate);
      await onSessionsChanged();
      setMessage(`Đã sinh ${r.inserted} ca${r.skipped_existing ? `, bỏ qua ${r.skipped_existing} room đã có ca` : ""}${r.skipped_invalid ? `, ${r.skipped_invalid} dòng thiếu giờ` : ""}.`);
    } catch (e: any) {
      setError(`Không sinh được ca: ${e.message ?? e}`);
    } finally {
      setGenerating(false);
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
    } catch (e: any) {
      setError(`Không lưu được: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSplit = async (s: LiveSession) => {
    if (!s.actualStartAt || !s.actualEndAt) return;
    const startVn = vnParts(s.actualStartAt).time;
    const endVn = vnParts(s.actualEndAt).time;
    const input = window.prompt(`Tách ca ${s.date} (${startVn} → ${endVn}) tại mốc giờ nào? (HH:MM, giờ VN)`);
    if (!input) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
    if (!m) { window.alert("Nhập dạng HH:MM, ví dụ 22:00"); return; }
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
    } catch (e: any) {
      setError(`Không tách được: ${e.message ?? e}`);
    } finally {
      setSplitting(null);
    }
  };

  if (months.length === 0) return null;

  const selectCls = "bg-[var(--surface)] border border-[var(--border)] rounded-lg px-1.5 py-1 text-[11px] text-[var(--text)] w-full";

  return (
    <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-[var(--text)] text-xs flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--accent-text)]" /> Nạp bù ca từ file — {brandName}
        </h4>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)]">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {error && <p className="text-[11px] text-rose-500">{error}</p>}
      {message && <p className="text-[11px] text-emerald-600">{message}</p>}

      {/* Bước 1 — sinh ca */}
      <div className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] text-[var(--text-muted)] space-y-0.5">
          <p className="font-bold text-[var(--text)]">Bước 1 · Sinh ca từ room</p>
          {loadingRows ? (
            <p>Đang đọc file...</p>
          ) : (
            <p>
              File có <b className="text-[var(--text)]">{rows.length}</b> room · đã có ca <b className="text-[var(--text)]">{plan.existing}</b> · sẽ tạo{" "}
              <b className="text-[var(--text)]">{plan.toCreate.length}</b>
              {plan.invalid > 0 && <> · {plan.invalid} dòng thiếu giờ (bỏ qua)</>}
              {plan.longRooms.length > 0 && (
                <> · <span className="text-amber-600">{plan.longRooms.length} room ≥ {LONG_ROOM_MINUTES / 60}h</span> — sinh xong tách ở lưới bên dưới nếu là 2 ca</>
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
          <Wand2 className="w-3.5 h-3.5" /> {generating ? "Đang sinh..." : `Sinh ${plan.toCreate.length} ca`}
        </button>
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
          <p className="text-[11px] text-[var(--text-faint)]">Tháng này chưa có ca nào — sinh ca ở bước 1 trước.</p>
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
                      onClick={() => setToolWeekdays((prev) => { const n = new Set(prev); n.has(wd) ? n.delete(wd) : n.add(wd); return n; })}
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
                              {s.isBackfill && isLong && (
                                <button
                                  type="button"
                                  title="Room dài — tách thành 2 ca"
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
