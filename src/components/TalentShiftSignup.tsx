import { useEffect, useMemo, useState } from "react";
import { Check, Circle, Clock3 } from "lucide-react";
import type { Brand, LiveSession, ShiftRegistration, ShiftSlot } from "../types";
import { addDays, getTodayDate, isoWeekStart } from "../lib/dateUtils";
import { fetchRosterMonths, fetchRosterWeeks, signupDeadlineOf, type RosterMonth, type RosterWeek } from "../lib/db/roster";
import { fmtDateVn, fmtNum } from "../lib/format";
import { DAY_PART_LABEL, dayPartOf, openSlotsFrom, slotHours, type DayPart } from "../lib/talent/myShifts";
import { BrandLogo } from "./ui/BrandLogo";
import { PlatformLogo } from "./ui/PlatformLogo";

// Đăng Ký Ca của talent — màn riêng, tách khỏi Agency từ 08/10. OP vẫn là người chốt (user chốt 11/10 phương án B: chỉ đăng ký
// từng ca mở — không có khai giờ rảnh). Bản 2 (16/10, user: "giao diện rất khó dùng"): MỘT CA = MỘT Ô TO, CHẠM CẢ Ô LÀ BÁO RẢNH /
// HUỶ. Cùng ngày user chốt thêm: (1) ca mở là ca THÁNG SAU (mở khi chốt kế hoạch tháng) ⇒ lọc theo Tháng → Tuần trong tháng →
// Buổi → Brand, không phải "Tuần này / Tuần sau"; (2) ĐĂNG KÝ THOẢI MÁI, KHÔNG ÁP LUẬT — trùng giờ do trainer / OP xử lý lúc chốt
// (SlotDetailModal + DB 0143 chặn chốt trùng người), màn này không khoá ô nào vì trùng. Chỉ hạn báo rảnh của trainer (0176, DB
// chặn) là khoá. Ca đã chốt của mình chỉ là dòng "Bạn đã có: …" dưới tên ngày để tự cân nhắc.

interface Props {
  brands: Brand[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  myTalentId?: string;
  /** Ca đã chốt của CHÍNH người này — chỉ để hiện "Bạn đã có: …" dưới tên ngày (không chặn đăng ký). */
  myShifts: LiveSession[];
  onRegister: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregister: (slotId: string, talentId: string) => Promise<boolean>;
}

const WEEKDAY = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const weekday = (date: string) => WEEKDAY[new Date(`${date}T00:00:00`).getDay()];
const hoursText = (h: number) => `${fmtNum(h, 1)} giờ`;
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dm = (date: string) => `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;
const monthLabel = (ym: string) => `Tháng ${Number(ym.slice(5))}`;
const deadlineText = (iso: string) => {
  const d = new Date(iso);
  const left = d.getTime() - Date.now();
  const when = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${weekday(localDate(d))} ${fmtDateVn(localDate(d), false)}`;
  const leftText = left <= 0 ? "" : left < 36e5 * 24 ? ` — còn ${Math.max(1, Math.round(left / 36e5))} giờ` : ` — còn ${Math.round(left / (36e5 * 24))} ngày`;
  return when + leftText;
};
const PARTS: DayPart[] = ["morning", "afternoon", "evening"];
const pill = (on: boolean) =>
  `shrink-0 min-h-9 px-3 rounded-full text-sm font-bold border transition-colors ${
    on ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
  }`;

export default function TalentShiftSignup({ brands, shiftSlots, shiftRegistrations, myTalentId, myShifts, onRegister, onUnregister }: Props) {
  const today = getTodayDate();
  const [busy, setBusy] = useState<string | null>(null);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  // Hạn đăng ký do trainer đặt: theo THÁNG (0180, 24/10) — hạn tuần cũ (0176) vẫn xét nếu còn dòng. Qua hạn thì DB chặn — màn khoá ô
  // trước cho khỏi bấm vô ích. Chưa chạy migration ⇒ không có hạn.
  const [weeks, setWeeks] = useState<RosterWeek[]>([]);
  const [rosterMonths, setRosterMonths] = useState<RosterMonth[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchRosterWeeks(isoWeekStart(today))
      .then((w) => !cancelled && setWeeks(w))
      .catch(() => undefined);
    fetchRosterMonths(today.slice(0, 7))
      .then((m) => !cancelled && setRosterMonths(m))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [today]);
  const deadlineOf = (date: string) => signupDeadlineOf(date, rosterMonths, weeks, isoWeekStart);
  const closed = (date: string) => {
    const d = deadlineOf(date);
    return !!d && new Date(d) <= new Date();
  };

  const mineBySlot = useMemo(
    () => new Set(shiftRegistrations.filter((r) => !!myTalentId && r.talentId === myTalentId).map((r) => r.slotId)),
    [shiftRegistrations, myTalentId]
  );
  const openSlots = useMemo(() => openSlotsFrom(shiftSlots, today), [shiftSlots, today]);
  const booked = useMemo(() => myShifts.filter((s) => s.status !== "Cancelled"), [myShifts]);

  // ---- Bộ lọc: Tháng → Tuần trong tháng → Buổi → Brand. Mỗi nút đếm số ca còn lại sau các lọc khác. ----
  const months = useMemo(() => [...new Set(openSlots.map((s) => s.date.slice(0, 7)))].sort(), [openSlots]);
  const [monthPick, setMonthPick] = useState<string | null>(null);
  const month = monthPick && months.includes(monthPick) ? monthPick : months[0] ?? today.slice(0, 7);
  const [weekPick, setWeekPick] = useState<string>("all"); // "all" | weekStart (T2)
  const [part, setPart] = useState<DayPart | "all">("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [onlyTodo, setOnlyTodo] = useState(false);
  const pickMonth = (m: string) => {
    setMonthPick(m);
    setWeekPick("all");
  };

  const inMonth = openSlots.filter((s) => s.date.startsWith(month));
  const byPart = (s: ShiftSlot) => part === "all" || dayPartOf(s.startTime) === part;
  const byBrand = (s: ShiftSlot) => brandFilter === "all" || s.brandName === brandFilter;
  const byWeek = (s: ShiftSlot) => weekPick === "all" || isoWeekStart(s.date) === weekPick;
  const byTodo = (s: ShiftSlot) => !onlyTodo || !mineBySlot.has(s.id);
  const monthWeeks = [...new Set(inMonth.map((s) => isoWeekStart(s.date)))].sort();
  const weekRange = (ws: string) => {
    const from = ws < `${month}-01` ? `${month}-01` : ws;
    const end = addDays(ws, 6);
    const to = end.slice(0, 7) === month ? end : inMonth.map((s) => s.date).filter((d) => isoWeekStart(d) === ws).sort().pop() ?? end;
    // Tuần chỉ dính một ngày của tháng (1/11 rơi vào CN): ghi "CN 1/11" thay vì "1/11 – 1/11".
    return from === to ? `${weekday(from).replace("Chủ nhật", "CN").replace("Thứ ", "T")} ${dm(from)}` : `${dm(from)} – ${dm(to)}`;
  };
  const brandNames = [...new Set(inMonth.map((s) => s.brandName))].sort((a, b) => a.localeCompare(b, "vi"));
  const shown = inMonth.filter((s) => byWeek(s) && byPart(s) && byBrand(s) && byTodo(s));
  const dates = [...new Set(shown.map((s) => s.date))].sort();

  const registeredInMonth = inMonth.filter((s) => mineBySlot.has(s.id));
  const bulkTargets = shown.filter((s) => !mineBySlot.has(s.id) && !closed(s.date));
  // Theo NGÀY của ca (không theo thứ Hai đầu tuần): tuần 27/10–02/11 có thứ Hai thuộc tháng trước, hạn tháng phải lấy theo tháng của ca.
  const deadlines = [...new Set(inMonth.filter(byWeek).map((s) => deadlineOf(s.date)).filter((d): d is string => !!d))].sort();
  const nextDeadline = deadlines.find((d) => new Date(d) > new Date());
  const filtered = weekPick !== "all" || part !== "all" || brandFilter !== "all" || onlyTodo;

  const toggle = async (slot: ShiftSlot) => {
    if (!myTalentId || busy) return;
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

  const slotTile = (slot: ShiftSlot) => {
    const mine = mineBySlot.has(slot.id);
    const locked = closed(slot.date);
    const head = (
      <>
        <div className="flex items-center gap-2 min-w-0">
          <BrandLogo brand={slot.brandId ? brandById.get(slot.brandId) : { name: slot.brandName, logo: "" }} size="sm" />
          <span className="font-bold text-sm text-[var(--text)] truncate">{slot.brandName}</span>
          <PlatformLogo platform={slot.platform} size="sm" className="ml-auto shrink-0" />
        </div>
        <p className="mt-2 font-mono text-lg font-black leading-none text-[var(--text)]">
          {slot.startTime.slice(0, 5)} – {slot.endTime.slice(0, 5)}
          <span className="ml-2 font-sans text-xs font-medium text-[var(--text-faint)]">{hoursText(slotHours(slot))}</span>
        </p>
      </>
    );
    if (!myTalentId || locked)
      return (
        <div key={slot.id} className={`rounded-2xl border p-3 ${mine ? "border-emerald-700 bg-emerald-500/5" : "border-[var(--border)] bg-[var(--surface)] opacity-60"}`}>
          {head}
          <p className="mt-3 text-xs text-[var(--text-muted)]">{!myTalentId ? "Tài khoản chưa gắn hồ sơ" : mine ? "✓ Bạn đã đăng ký · đã hết hạn sửa" : "Đã hết hạn đăng ký"}</p>
        </div>
      );
    return (
      <button
        key={slot.id}
        type="button"
        onClick={() => toggle(slot)}
        disabled={!!busy}
        aria-pressed={mine}
        className={`group w-full text-left rounded-2xl border-2 p-3 transition-colors disabled:cursor-wait ${
          mine
            ? "border-emerald-500 bg-emerald-500/10"
            : "border-dashed border-[var(--text-faint)]/40 bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5"
        } ${busy === slot.id ? "opacity-60" : ""}`}
      >
        {head}
        {mine ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-emerald-400">
            <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            </span>
            Bạn đã đăng ký
            <span className="ml-auto text-[11px] font-medium text-[var(--text-faint)] group-hover:text-rose-300">Chạm để huỷ</span>
          </p>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[var(--accent-text)]">
            <Circle className="w-5 h-5" />
            Chạm để đăng ký
          </p>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4 max-w-3xl lg:max-w-none">
      <div className="px-1">
        <h2 className="text-lg font-black text-[var(--text)]">Đăng ký ca</h2>
        <p className="text-sm text-[var(--text-muted)]">Chạm vào mọi ca bạn làm được để đăng ký — đăng ký càng nhiều càng dễ được xếp. Trainer / OP sẽ chốt người, ca chốt hiện ở "Ca của tôi".</p>
      </div>

      {!myTalentId && (
        <div className="bg-amber-950/85 border border-amber-800 rounded-xl p-4 text-sm text-amber-200">
          Tài khoản của bạn chưa được gán hồ sơ host/trợ live — nhờ OP gán trước khi tự đăng ký ca.
        </div>
      )}

      {openSlots.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center text-sm text-[var(--text-faint)]">
          Hiện chưa có ca nào cần người. OP mở ca tháng sau khi chốt kế hoạch tháng — bạn sẽ nhận thông báo.
        </div>
      ) : (
        <>
          {/* Tháng: thường chỉ có tháng sau; tháng nào có ca mở thì có nút. */}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="flex gap-2" role="group" aria-label="Chọn tháng">
              {months.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={m === month}
                  onClick={() => pickMonth(m)}
                  className={`px-4 py-2 min-h-12 rounded-2xl border text-left ${m === month ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] bg-[var(--surface)]"}`}
                >
                  <span className={`block text-base font-black ${m === month ? "text-[var(--accent-text)]" : "text-[var(--text)]"}`}>{monthLabel(m)}</span>
                  <span className="block text-xs text-[var(--text-faint)]">{openSlots.filter((s) => s.date.startsWith(m)).length} ca cần người</span>
                </button>
              ))}
            </div>
            {/* Tình trạng của tôi trong tháng + hạn gần nhất. */}
            <div className="flex-1 min-w-[14rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-sm text-[var(--text-muted)]">
                {monthLabel(month)} bạn đã đăng ký{" "}
                <b className="text-xl font-black text-[var(--text)]">{registeredInMonth.length}</b> / {inMonth.length} ca
                <span className="text-[var(--text-faint)]"> · {hoursText(registeredInMonth.reduce((a, s) => a + slotHours(s), 0))}</span>
              </p>
              {nextDeadline && (
                <p className="flex items-center gap-1.5 text-sm text-[var(--text)]">
                  <Clock3 className="w-4 h-4 shrink-0 text-amber-300" />
                  Hạn đăng ký: <b>{deadlineText(nextDeadline)}</b>
                </p>
              )}
            </div>
          </div>

          {/* Lọc: tuần trong tháng · buổi · brand · chỉ ca chưa báo. */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2.5">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Tuần trong tháng">
              <button type="button" aria-pressed={weekPick === "all"} onClick={() => setWeekPick("all")} className={pill(weekPick === "all")}>
                Cả tháng
              </button>
              {monthWeeks.map((ws) => (
                <button key={ws} type="button" aria-pressed={weekPick === ws} onClick={() => setWeekPick(ws)} className={pill(weekPick === ws)}>
                  {weekRange(ws)} <span className="font-medium opacity-75">({inMonth.filter((s) => isoWeekStart(s.date) === ws && byPart(s) && byBrand(s)).length})</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex gap-1.5" role="group" aria-label="Buổi">
                {(["all", ...PARTS] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={part === p} onClick={() => setPart(p)} className={pill(part === p)}>
                    {p === "all" ? "Cả ngày" : DAY_PART_LABEL[p]}
                  </button>
                ))}
              </div>
              {brandNames.length > 1 && (
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  aria-label="Lọc brand"
                  className="min-h-9 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-sm font-bold text-[var(--text)]"
                >
                  <option value="all">Mọi brand</option>
                  {brandNames.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-2 min-h-9 px-2 text-sm text-[var(--text-muted)] cursor-pointer">
                <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
                Chỉ ca chưa đăng ký
              </label>
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setWeekPick("all");
                    setPart("all");
                    setBrandFilter("all");
                    setOnlyTodo(false);
                  }}
                  className="min-h-9 px-2 text-sm text-[var(--text-faint)] underline hover:text-[var(--text)]"
                >
                  Bỏ lọc
                </button>
              )}
              {myTalentId && bulkTargets.length > 1 && (
                <button
                  type="button"
                  onClick={registerAll}
                  disabled={!!busy}
                  className="ml-auto px-4 min-h-9 rounded-full border border-[var(--accent)] text-[var(--accent-text)] text-sm font-bold hover:bg-[var(--accent)]/10 disabled:opacity-50"
                >
                  Đăng ký hết {bulkTargets.length} ca đang hiện
                </button>
              )}
            </div>
          </div>

          {dates.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--text-muted)]">
              {onlyTodo && shown.length === 0 && inMonth.some((s) => mineBySlot.has(s.id)) ? "Bạn đã đăng ký hết các ca đang lọc." : "Không có ca nào khớp bộ lọc."}
            </div>
          ) : (
            // Mỗi ngày có ca một cột; cột không hẹp hơn 220px — màn rộng nhiều cột, điện thoại một cột.
            <div className="grid gap-4 items-start [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
              {dates.map((date) => {
                const xs = shown.filter((s) => s.date === date);
                const have = booked.filter((s) => s.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <section key={date} aria-label={`${weekday(date)} ${fmtDateVn(date, false)}`} className="space-y-2 min-w-0">
                    <div className="px-1">
                      <h3 className="flex items-baseline gap-2">
                        <span className={`text-base font-black ${date === today ? "text-[var(--accent-text)]" : "text-[var(--text)]"}`}>{date === today ? "Hôm nay" : weekday(date)}</span>
                        <span className="text-sm text-[var(--text-muted)]">{fmtDateVn(date, false)}</span>
                        <span className="ml-auto text-xs text-[var(--text-faint)]">{xs.length} ca</span>
                      </h3>
                      {have.length > 0 && (
                        <p className="text-xs text-[var(--text-faint)]">Bạn đã có: {have.map((s) => `${s.startTime}–${s.endTime} ${s.brandName}`).join(", ")}</p>
                      )}
                    </div>
                    {xs.map(slotTile)}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
