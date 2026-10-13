import { useEffect, useMemo, useState } from "react";
import { CalendarClock, UserCheck, UserX } from "lucide-react";
import type { Brand, LiveSession, ShiftRegistration, ShiftSlot } from "../types";
import { getTodayDate, isoWeekStart } from "../lib/dateUtils";
import { fetchRosterWeeks, type RosterWeek } from "../lib/db/roster";
import { fmtDateVn, fmtFixed } from "../lib/format";
import { getBrandTheme } from "../lib/brandTheme";
import { DAY_PART_LABEL, dayPartOf, openSlotsFrom, slotClashWithMine, slotHours, type DayPart } from "../lib/talent/myShifts";
import { PageHeader } from "./common/PageHeader";
import { SessionEventCard, buildSlotMeta } from "./ui/SessionEventCard";

// Đăng Ký Ca của talent — màn riêng, tách khỏi Agency từ 08/10. T1 (11/10): ca mở hiện bằng ĐÚNG thẻ ca của lịch agency
// (viền đứt "chờ đăng ký"), nút "Tôi rảnh" dưới thẻ, lọc brand / buổi, đăng ký cả loạt. OP vẫn là người chốt (user chốt 11/10
// phương án B: chỉ đăng ký từng ca mở — không có khai giờ rảnh). Ca đã chốt cho mình xem ở Hôm nay / Lịch.

interface Props {
  brands: Brand[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  myTalentId?: string;
  /** Ca đã chốt của CHÍNH người này — chỉ để chặn đăng ký ca trùng giờ (DB 0143 cũng không cho OP chốt trùng người). */
  myShifts: LiveSession[];
  onRegister: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregister: (slotId: string, talentId: string) => Promise<boolean>;
}

const WEEKDAY = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const dayLabel = (date: string) => `${WEEKDAY[new Date(`${date}T00:00:00`).getDay()]} ${fmtDateVn(date, false)}`;
const PARTS: (DayPart | "all")[] = ["all", "morning", "afternoon", "evening"];
const fmtDeadline = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getDate()}/${d.getMonth() + 1}`;
};
const chip = (on: boolean) =>
  `shrink-0 px-3 py-1.5 min-h-8 rounded-full text-xs font-bold border transition-colors ${
    on ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
  }`;

export default function TalentShiftSignup({ brands, shiftSlots, shiftRegistrations, myTalentId, myShifts, onRegister, onUnregister }: Props) {
  const today = getTodayDate();
  const [busy, setBusy] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState("all");
  const [part, setPart] = useState<DayPart | "all">("all");
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  // Hạn báo rảnh theo tuần do trainer đặt (0174). Qua hạn thì DB chặn — màn khoá nút trước cho khỏi bấm vô ích. Chưa chạy 0174 ⇒ không có hạn.
  const [weeks, setWeeks] = useState<RosterWeek[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchRosterWeeks(isoWeekStart(today))
      .then((w) => !cancelled && setWeeks(w))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [today]);
  const deadlineOf = (date: string) => weeks.find((w) => w.weekStart === isoWeekStart(date))?.signupDeadline;
  const closed = (date: string) => {
    const d = deadlineOf(date);
    return !!d && new Date(d) <= new Date();
  };

  const mineBySlot = useMemo(
    () => new Set(shiftRegistrations.filter((r) => !!myTalentId && r.talentId === myTalentId).map((r) => r.slotId)),
    [shiftRegistrations, myTalentId]
  );
  const openSlots = useMemo(() => openSlotsFrom(shiftSlots, today), [shiftSlots, today]);
  const brandNames = useMemo(() => [...new Set(openSlots.map((s) => s.brandName))].sort((a, b) => a.localeCompare(b, "vi")), [openSlots]);
  const visible = useMemo(
    () => openSlots.filter((s) => (brandFilter === "all" || s.brandName === brandFilter) && (part === "all" || dayPartOf(s.startTime) === part)),
    [openSlots, brandFilter, part]
  );
  const clashOf = useMemo(() => new Map(openSlots.map((s) => [s.id, slotClashWithMine(s, myShifts, myTalentId)])), [openSlots, myShifts, myTalentId]);
  const byDay = useMemo(() => {
    const m = new Map<string, ShiftSlot[]>();
    for (const s of visible) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return [...m.entries()];
  }, [visible]);
  const registered = openSlots.filter((s) => mineBySlot.has(s.id));
  const bulkTargets = visible.filter((s) => !mineBySlot.has(s.id) && !clashOf.get(s.id) && !closed(s.date));

  const toggle = async (slot: ShiftSlot) => {
    if (!myTalentId) return;
    setBusy(slot.id);
    if (mineBySlot.has(slot.id)) await onUnregister(slot.id, myTalentId);
    else await onRegister(slot.id, myTalentId);
    setBusy(null);
  };
  const registerAll = async () => {
    if (!myTalentId) return;
    setBusy("all");
    for (const s of bulkTargets) if (!(await onRegister(s.id, myTalentId))) break;
    setBusy(null);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader
        icon={CalendarClock}
        title="Đăng Ký Ca"
        description='Ca OP đang mở. Bấm "Tôi rảnh" cho ca bạn làm được — OP chốt người từ danh sách đăng ký, bạn nhận thông báo và ca hiện ở Hôm nay / Lịch.'
      >
        {openSlots.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Lọc brand">
              <button type="button" aria-pressed={brandFilter === "all"} onClick={() => setBrandFilter("all")} className={chip(brandFilter === "all")}>Mọi brand</button>
              {brandNames.map((b) => (
                <button key={b} type="button" aria-pressed={brandFilter === b} onClick={() => setBrandFilter(b)} className={chip(brandFilter === b)}>{b}</button>
              ))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Lọc buổi">
              {PARTS.map((p) => (
                <button key={p} type="button" aria-pressed={part === p} onClick={() => setPart(p)} className={chip(part === p)}>{p === "all" ? "Cả ngày" : DAY_PART_LABEL[p]}</button>
              ))}
            </div>
          </div>
        )}
      </PageHeader>

      {!myTalentId && (
        <div className="bg-amber-950/85 border border-amber-800 rounded-xl p-4 text-sm text-amber-200">
          Tài khoản của bạn chưa được gán hồ sơ host/trợ live — nhờ OP gán trước khi tự đăng ký ca.
        </div>
      )}

      {openSlots.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center text-sm text-[var(--text-faint)]">
          Hiện chưa có ca nào đang mở để đăng ký. OP mở ca khi chốt kế hoạch tháng — bạn sẽ nhận thông báo.
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-20 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shadow-lg">
            <span className="text-[var(--text-muted)]">
              Đã đăng ký <b className="text-[var(--text)]">{registered.length}</b> ca · <b className="text-[var(--text)]">{fmtFixed(registered.reduce((a, s) => a + slotHours(s), 0), 1)}</b> giờ
              <span className="text-[var(--text-faint)]"> / {openSlots.length} ca đang mở</span>
            </span>
            {myTalentId && bulkTargets.length > 0 && (
              <button type="button" onClick={registerAll} disabled={!!busy} className="px-3 py-1.5 min-h-8 rounded-lg bg-[var(--accent)] text-white font-bold disabled:opacity-50">
                Rảnh cả {bulkTargets.length} ca đang lọc
              </button>
            )}
          </div>

          {byDay.length === 0 && <p className="text-sm text-[var(--text-faint)] italic px-1">Không có ca mở nào khớp bộ lọc.</p>}
          {byDay.map(([date, slots]) => (
            <section key={date} className="space-y-2" aria-label={dayLabel(date)}>
              <p className={`text-[11px] font-black uppercase tracking-wide ${date === today ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"}`}>
                {dayLabel(date)}{date === today ? " · hôm nay" : ""} · {slots.filter((s) => mineBySlot.has(s.id)).length}/{slots.length} đã đăng ký
                {deadlineOf(date) && (
                  <span className={closed(date) ? "text-amber-300" : "text-emerald-300"}>
                    {" "}· {closed(date) ? "đã đóng đăng ký" : `hạn báo rảnh ${fmtDeadline(deadlineOf(date)!)}`}
                  </span>
                )}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {slots.map((slot) => {
                  const mine = mineBySlot.has(slot.id);
                  const clash = clashOf.get(slot.id);
                  return (
                    <div key={slot.id} className="space-y-1.5">
                      <SessionEventCard
                        theme={getBrandTheme(slot.brandName)}
                        brand={slot.brandId ? brandById.get(slot.brandId) : undefined}
                        brandName={slot.brandName}
                        platform={slot.platform}
                        startTime={slot.startTime.slice(0, 5)}
                        endTime={slot.endTime.slice(0, 5)}
                        meta={buildSlotMeta(slot)}
                        tone="pending"
                        pending
                      />
                      {myTalentId && (
                        closed(slot.date) ? (
                          <p className="text-[11px] text-amber-300 px-1">{mine ? "Bạn đã báo rảnh · đã" : "Đã"} đóng đăng ký tuần này — trainer đang xếp lịch.</p>
                        ) : clash && !mine ? (
                          <p className="text-[11px] text-rose-300 px-1">Trùng ca bạn đã có: {clash.brandName} {clash.startTime}–{clash.endTime}</p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggle(slot)}
                            disabled={!!busy}
                            aria-pressed={mine}
                            className={`w-full flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 min-h-8 rounded-lg transition-colors disabled:opacity-50 border ${
                              mine
                                ? "bg-emerald-950 text-emerald-300 border-emerald-800 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-800"
                                : "bg-blue-950 text-blue-300 border-blue-800 hover:bg-blue-900"
                            }`}
                          >
                            {mine ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            {mine ? "Đã đăng ký · Huỷ" : "Tôi rảnh ca này"}
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
