import { useEffect, useMemo, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import type { Brand, LiveSession, ShiftRegistration, ShiftSlot } from "../types";
import { addDays, getTodayDate, isoWeekStart } from "../lib/dateUtils";
import { fetchRosterMonths, fetchRosterWeeks, signupDeadlineOf, type RosterMonth, type RosterWeek } from "../lib/db/roster";
import { fmtDateVn, fmtNum } from "../lib/format";
import { DAY_PART_LABEL, dayPartOf, openSlotsFrom, slotHours, type DayPart } from "../lib/talent/myShifts";
import { BrandLogo } from "./ui/BrandLogo";
import { getBrandTheme } from "../lib/brandTheme";
import { PlatformLogo } from "./ui/PlatformLogo";

// Đăng Ký Ca của talent — màn riêng, tách khỏi Agency từ 08/10. OP vẫn là người chốt (user chốt 11/10 phương án B: chỉ đăng ký
// từng ca mở — không có khai giờ rảnh). Bản 2 (16/10, user: "giao diện rất khó dùng"): MỘT CA = MỘT Ô TO, CHẠM CẢ Ô LÀ BÁO RẢNH /
// HUỶ. Cùng ngày user chốt thêm: (1) ca mở là ca THÁNG SAU (mở khi chốt kế hoạch tháng) ⇒ lọc theo Tháng → Tuần trong tháng →
// Buổi → Brand, không phải "Tuần này / Tuần sau"; (2) ĐĂNG KÝ THOẢI MÁI, KHÔNG ÁP LUẬT — trùng giờ do trainer / OP xử lý lúc chốt
// (SlotDetailModal + DB 0143 chặn chốt trùng người), màn này không khoá ô nào vì trùng. Chỉ hạn báo rảnh của trainer (0176, DB
// chặn) là khoá. Ca đã chốt của mình chỉ là dòng "Bạn đã có: …" dưới tên ngày để tự cân nhắc.

// Bản 3 (05/11, user: cần "Lịch đang mở" và "lịch đã đăng ký" riêng): cùng một màn, hai chế độ — "open" = ca còn mở MÀ MÌNH CHƯA
// đăng ký (chạm để đăng ký, ca vừa đăng ký chuyển sang tab kia), "registered" = ca mình đã đăng ký và còn chờ trainer chốt (chạm để
// huỷ trước hạn). Ca được chốt thì không còn "mở" nữa ⇒ rời khỏi tab này, sang "Ca của tôi".
interface Props {
  mode: "open" | "registered";
  onOpenTab?: (tab: string) => void;
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

export default function TalentShiftSignup({ mode, onOpenTab, brands, shiftSlots, shiftRegistrations, myTalentId, myShifts, onRegister, onUnregister }: Props) {
  const today = getTodayDate();
  const [busy, setBusy] = useState<string | null>(null);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  // Hạn đăng ký do trainer đặt: theo THÁNG (0180, 24/10; 0200 tách 2 đợt) — hạn tuần cũ (0176) vẫn xét nếu còn dòng. Qua hạn thì DB chặn — màn khoá ô
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
  // Hạn theo ĐỢT của ngày ca (0200: ca 1–15 / 16–cuối có hạn riêng) hoặc hạn riêng của ca bổ sung.
  const deadlineOf = (slot: ShiftSlot) => signupDeadlineOf(slot, rosterMonths, weeks, isoWeekStart);
  const mineBySlot = useMemo(
    () => new Set(shiftRegistrations.filter((r) => !!myTalentId && r.talentId === myTalentId).map((r) => r.slotId)),
    [shiftRegistrations, myTalentId]
  );
  // 0226: qua hạn chỉ khoá SỬA/HUỶ ca mình đã đăng ký; ca còn mở thiếu người vẫn đăng ký thêm được.
  // 25/11: ca đã chốt / đã huỷ / đã qua ngày cũng khoá (chỉ để xem lại).
  const closed = (slot: ShiftSlot) => {
    if (!mineBySlot.has(slot.id)) return false;
    if (slot.status !== "open" || slot.date < today) return true;
    const d = deadlineOf(slot);
    return !!d && new Date(d) <= new Date();
  };
  const allOpen = useMemo(() => openSlotsFrom(shiftSlots, today), [shiftSlots, today]);
  // "Đã đăng ký" = MỌI ca mình đăng ký từ đầu tháng này (kể cả đã chốt/huỷ) để xem lại; "Đang mở" = ca còn mở chưa đăng ký.
  const openSlots = useMemo(() => {
    if (mode === "open") return allOpen.filter((s) => !mineBySlot.has(s.id));
    const from = `${today.slice(0, 7)}-01`;
    return shiftSlots
      .filter((s) => mineBySlot.has(s.id) && s.date >= from)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [allOpen, shiftSlots, mineBySlot, mode, today]);
  const sessionById = useMemo(() => new Map(myShifts.map((s) => [s.id, s])), [myShifts]);
  // Kết quả của ca đã khoá: chờ chốt (qua hạn) / đã xếp cho mình / chốt không có tên mình / huỷ.
  const outcomeOf = (slot: ShiftSlot): string => {
    if (slot.status === "cancelled") return "Ca đã huỷ";
    if (slot.status === "finalized") {
      const sess = slot.sessionId ? sessionById.get(slot.sessionId) : undefined;
      return sess && sess.status !== "Cancelled" ? "✓ Đã xếp cho bạn" : "Đã chốt, không có tên bạn";
    }
    return slot.date < today ? "Đã qua ngày" : "✓ Bạn đã đăng ký · hết hạn sửa, chờ chốt";
  };
  const booked = useMemo(() => myShifts.filter((s) => s.status !== "Cancelled"), [myShifts]);

  // ---- Bộ lọc: Tháng → Tuần trong tháng → Buổi → Brand. Mỗi nút đếm số ca còn lại sau các lọc khác. ----
  const months = useMemo(() => [...new Set(openSlots.map((s) => s.date.slice(0, 7)))].sort(), [openSlots]);
  const [monthPick, setMonthPick] = useState<string | null>(null);
  // Mặc định: tháng đầu tiên còn ca từ hôm nay (tab "Đã đăng ký" có thể còn cả ca tháng này đã qua).
  const defaultMonth = months.find((m) => openSlots.some((s) => s.date.startsWith(m) && s.date >= today)) ?? months[months.length - 1] ?? today.slice(0, 7);
  const month = monthPick && months.includes(monthPick) ? monthPick : defaultMonth;
  const [weekPick, setWeekPick] = useState<string>("all"); // "all" | weekStart (T2)
  const [part, setPart] = useState<DayPart | "all">("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const pickMonth = (m: string) => {
    setMonthPick(m);
    setWeekPick("all");
  };

  const inMonth = openSlots.filter((s) => s.date.startsWith(month));
  const byPart = (s: ShiftSlot) => part === "all" || dayPartOf(s.startTime) === part;
  // Website là sàn riêng (chỉ lịch): chip riêng "<brand> Website" để không lẫn với ca TikTok/Shopee của cùng brand.
  const brandKeyOf = (s: ShiftSlot) => (s.platform === "Website" ? `${s.brandName}|Website` : s.brandName);
  const byBrand = (s: ShiftSlot) => brandFilter === "all" || brandKeyOf(s) === brandFilter;
  const byWeek = (s: ShiftSlot) => weekPick === "all" || isoWeekStart(s.date) === weekPick;
  const monthWeeks = [...new Set(inMonth.map((s) => isoWeekStart(s.date)))].sort();
  const weekRange = (ws: string) => {
    const from = ws < `${month}-01` ? `${month}-01` : ws;
    const end = addDays(ws, 6);
    const to = end.slice(0, 7) === month ? end : inMonth.map((s) => s.date).filter((d) => isoWeekStart(d) === ws).sort().pop() ?? end;
    // Tuần chỉ dính một ngày của tháng (1/11 rơi vào CN): ghi "CN 1/11" thay vì "1/11 – 1/11".
    return from === to ? `${weekday(from).replace("Chủ nhật", "CN").replace("Thứ ", "T")} ${dm(from)}` : `${dm(from)} – ${dm(to)}`;
  };
  const brandNames = [...new Set(inMonth.map(brandKeyOf))].sort((a, b) => a.localeCompare(b, "vi"));
  const shown = inMonth.filter((s) => byWeek(s) && byPart(s) && byBrand(s));
  const dates = [...new Set(shown.map((s) => s.date))].sort();

  const monthAll = allOpen.filter((s) => s.date.startsWith(month));
  const registeredInMonth =
    mode === "registered" ? inMonth.filter((s) => s.status !== "cancelled") : monthAll.filter((s) => mineBySlot.has(s.id));
  const bulkTargets = mode === "open" ? shown.filter((s) => !closed(s)) : [];
  // Theo NGÀY của ca (không theo thứ Hai đầu tuần): tuần 27/10–02/11 có thứ Hai thuộc tháng trước, hạn tháng phải lấy theo tháng của ca.
  const deadlines = [...new Set(inMonth.filter(byWeek).map((s) => deadlineOf(s)).filter((d): d is string => !!d))].sort();
  const nextDeadline = deadlines.find((d) => new Date(d) > new Date());
  const filtered = weekPick !== "all" || part !== "all" || brandFilter !== "all";

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

  // Thẻ ca gọn (26/11, user: "làm nhỏ lại cho vừa vặn"): một hàng logo | giờ + brand | sàn, cao ~60px thay ~105px.
  const slotTile = (slot: ShiftSlot) => {
    const mine = mineBySlot.has(slot.id);
    const locked = closed(slot);
    const checked = mine && !!myTalentId && !locked;
    const note = !myTalentId ? "Tài khoản chưa gắn hồ sơ" : locked ? (mine ? outcomeOf(slot) : "Đã hết hạn đăng ký") : null;
    const body = (
      <div className="flex items-center gap-2.5 min-w-0">
        <BrandLogo brand={slot.brandId ? brandById.get(slot.brandId) : { name: slot.brandName, logo: "" }} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-base font-black leading-tight text-[var(--text)] whitespace-nowrap">
            {slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)}
            <span className="ml-1.5 font-sans text-2xs font-medium text-[var(--text-faint)]">{hoursText(slotHours(slot))}</span>
          </p>
          <p className="flex items-center gap-1.5 min-w-0 text-xs leading-tight">
            <span className="shrink-0 font-bold text-[var(--text-muted)]">{slot.brandName}</span>
            {/* 0207: ca đã có người nháp nhưng còn thiếu đúng vai này — không lộ tên người, chỉ vai cần. */}
            {slot.openNeed && (
              <span className="shrink-0 text-2xs font-bold px-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
                {slot.openNeed === "co_host" ? "Cần trợ live" : "Cần host"}
              </span>
            )}
            {note && (
              <span className={`min-w-0 truncate text-2xs ${note.startsWith("✓") ? "font-bold text-emerald-500" : "text-[var(--text-faint)]"}`}>· {note}</span>
            )}
          </p>
        </div>
        <PlatformLogo platform={slot.platform} size="sm" className="shrink-0" />
        {checked && (
          <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center" aria-label="Bạn đã đăng ký">
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
          </span>
        )}
      </div>
    );
    if (!myTalentId || locked)
      return (
        <div key={slot.id} className={`rounded-xl border px-2.5 py-2 ${mine ? (slot.status === "cancelled" ? "border-[var(--border)] bg-[var(--surface)] opacity-60" : "border-emerald-700 bg-emerald-500/5") : "border-[var(--border)] bg-[var(--surface)] opacity-60"}`}>
          {body}
        </div>
      );
    return (
      <button
        key={slot.id}
        type="button"
        onClick={() => toggle(slot)}
        disabled={!!busy}
        aria-pressed={mine}
        className={`group w-full text-left rounded-xl border-2 px-2.5 py-2 transition-colors disabled:cursor-wait ${
          mine
            ? "border-emerald-500 bg-emerald-500/10"
            : "border-dashed border-[var(--text-faint)]/40 bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5"
        } ${busy === slot.id ? "opacity-60" : ""}`}
      >
        {body}
        <span className="sr-only">{mine ? "Chạm để huỷ" : "Chạm để đăng ký"}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4 max-w-3xl lg:max-w-none">
      <div className="px-1">
        <h2 className="text-lg font-black text-[var(--text)]">{mode === "open" ? "Ca đang mở" : "Ca đã đăng ký"}</h2>
        <p className="text-sm text-[var(--text-muted)]">
          {mode === "open"
            ? "Chạm vào mọi ca bạn làm được — đăng ký càng nhiều càng dễ được xếp."
            : "Trước hạn chạm vào ca để huỷ; qua hạn chỉ xem."}
        </p>
      </div>

      {!myTalentId && (
        <div className="bg-amber-950/85 border border-amber-800 rounded-xl p-4 text-sm text-amber-200">
          Tài khoản của bạn chưa được gán hồ sơ host/trợ live — nhờ OP gán trước khi tự đăng ký ca.
        </div>
      )}

      {openSlots.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center text-sm text-[var(--text-faint)]">
          {mode === "open"
            ? allOpen.length > 0
              ? "Bạn đã đăng ký hết các ca đang mở."
              : "Hiện chưa có ca nào cần người. OP mở ca tháng sau khi chốt kế hoạch tháng — bạn sẽ nhận thông báo."
            : "Bạn chưa đăng ký ca nào trong tháng này."}
          {onOpenTab && allOpen.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenTab(mode === "open" ? "shift_registered" : "shift_scheduling")}
              className="block mx-auto mt-2 min-h-9 text-sm font-bold text-[var(--accent-text)]"
            >
              {mode === "open" ? "Xem ca đã đăng ký →" : "Xem ca đang mở →"}
            </button>
          )}
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
                  <span className="block text-xs text-[var(--text-faint)]">{openSlots.filter((s) => s.date.startsWith(m)).length} {mode === "open" ? "ca cần người" : "ca đã đăng ký"}</span>
                </button>
              ))}
            </div>
            {/* Tình trạng của tôi trong tháng + hạn gần nhất. */}
            <div className="flex-1 min-w-[14rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="text-sm text-[var(--text-muted)]">
                {monthLabel(month)} bạn đã đăng ký{" "}
                <b className="text-xl font-black text-[var(--text)]">{registeredInMonth.length}</b>
                {mode === "open" ? ` / ${monthAll.length}` : ""} ca
                <span className="text-[var(--text-faint)]"> · {hoursText(registeredInMonth.reduce((a, s) => a + slotHours(s), 0))}</span>
              </p>
              {!nextDeadline && deadlines.length > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-[var(--text)]">
                  <Clock3 className="w-4 h-4 shrink-0 text-amber-300" />
                  Đã hết hạn sửa
                </p>
              )}
              {nextDeadline && (
                <p className="flex items-center gap-1.5 text-sm text-[var(--text)]">
                  <Clock3 className="w-4 h-4 shrink-0 text-amber-300" />
                  Hạn sửa đăng ký: <b>{deadlineText(nextDeadline)}</b>
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
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc brand">
                  <button type="button" aria-pressed={brandFilter === "all"} onClick={() => setBrandFilter("all")} className={pill(brandFilter === "all")}>
                    Mọi brand
                  </button>
                  {brandNames.map((key) => {
                    const isWeb = key.endsWith("|Website");
                    const name = isWeb ? key.slice(0, -"|Website".length) : key;
                    const on = brandFilter === key;
                    const th = getBrandTheme(name);
                    const b = brands.find((x) => x.name === name);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setBrandFilter(on ? "all" : key)}
                        style={on ? { background: th.primary, borderColor: th.primary, color: th.onPrimary } : { borderColor: th.primary }}
                        className={`shrink-0 min-h-9 pl-1.5 pr-3 rounded-full text-sm font-bold border-2 flex items-center gap-1.5 transition-colors ${on ? "" : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-elevated)]"}`}
                      >
                        <BrandLogo brand={b ?? { name, logo: "" }} size="sm" />
                        {isWeb ? `${name} Website` : name}
                      </button>
                    );
                  })}
                </div>
              )}
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setWeekPick("all");
                    setPart("all");
                    setBrandFilter("all");
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
              Không có ca nào khớp bộ lọc.
            </div>
          ) : (
            // Mỗi ngày có ca một cột; cột không hẹp hơn 220px — màn rộng nhiều cột, điện thoại một cột.
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
              {dates.map((date) => {
                const xs = shown.filter((s) => s.date === date);
                const have = booked.filter((s) => s.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <section
                    key={date}
                    aria-label={`${weekday(date)} ${fmtDateVn(date, false)}`}
                    className={`min-w-0 flex flex-col overflow-hidden rounded-2xl border-2 bg-[var(--surface-elevated)] ${date === today ? "border-[var(--accent)]" : "border-[var(--text-faint)]/35"}`}
                  >
                    {/* Mỗi ngày là MỘT KHỐI có khung + thanh tiêu đề riêng (08/11, user: ca của hai ngày liền nhau khó phân biệt). */}
                    <div className={`px-3 py-2.5 border-b-2 ${date === today ? "bg-[var(--accent)]/20 border-[var(--accent)]/50" : "bg-[var(--text-faint)]/15 border-[var(--text-faint)]/35"}`}>
                      <h3 className="flex items-baseline gap-2">
                        <span className={`text-base font-black ${date === today ? "text-[var(--accent-text)]" : "text-[var(--text)]"}`}>{date === today ? "Hôm nay" : weekday(date)}</span>
                        <span className="text-sm font-bold text-[var(--text-muted)]">{fmtDateVn(date, false)}</span>
                        <span className="ml-auto text-xs font-bold text-[var(--text-faint)]">{xs.length} ca</span>
                      </h3>
                    </div>
                    <div className="p-1.5 space-y-1.5 flex-1">{xs.map(slotTile)}</div>
                    {have.length > 0 && (
                      <p className="border-t border-[var(--text-faint)]/25 px-3 py-2 text-xs text-[var(--text-faint)]">
                        <b className="font-bold text-[var(--text-muted)]">Bạn đã có:</b> {have.map((s) => `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)} ${s.brandName}`).join(" · ")}
                      </p>
                    )}
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
