import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Brand, LiveSession, ShiftSlot, Talent, UserRole } from "../../types";
import { addDays, getTodayDate } from "../../lib/dateUtils";
import { fmtDateVn } from "../../lib/format";
import { DAY_PART_LABEL, dayPartOf, isMine, type DayPart } from "../../lib/talent/myShifts";
import { TALENT_WIDE_QUERY } from "../../lib/talent/agenda";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { SessionWindow } from "../SessionWindow";
import { TalentSessionCard } from "./TalentSessionCard";

// Tab "Cả agency" của app talent (bản 2, 16/10; id `talent_calendar`): hôm nay ai live phòng nào. Bản 1 dùng thẳng LiveCalendar
// (Lịch Tuần) — đo trên app thật ở 375px: 4 hàng nút + chú giải 6 mục đứng trước, ca đầu tiên ở 901px, ngày không ca vẫn cao
// 160px. Ở đây: thanh 7 ngày + ca của ngày chia Sáng/Chiều/Tối, ca của mình có chip "Bạn". Lịch tuần/tháng đầy đủ vẫn mở được
// (`fullCalendar` = LiveCalendar cách nhìn talent, App truyền vào) cho máy tính ở phòng live. Talent xem lịch như ops (user chốt
// 11/10 phương án A). Laptop / PC (≥ 1024px): mở sẵn lịch tuần đầy đủ (lưới 7 cột vừa màn rộng); xem theo ngày thì Sáng / Chiều /
// Tối đứng cạnh nhau thay vì xếp dọc.

interface Props {
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  brands: Brand[];
  talents: Talent[];
  currentRole: UserRole;
  myTalentId?: string;
  onSessionsUpdated: (sessions: LiveSession[]) => void;
  onRequestDropout: (sessionId: string, reason: string) => Promise<boolean>;
  fullCalendar: () => React.ReactNode;
}

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const wd = (d: string) => WEEKDAY[new Date(`${d}T00:00:00`).getDay()];
const PARTS: DayPart[] = ["morning", "afternoon", "evening"];

export const TalentAgency: React.FC<Props> = ({ sessions, shiftSlots, brands, talents, currentRole, myTalentId, onSessionsUpdated, onRequestDropout, fullCalendar }) => {
  const today = getTodayDate();
  const wide = useMediaQuery(TALENT_WIDE_QUERY);
  // Chỉ là mặc định lúc mở tab — người dùng bấm đổi thì giữ lựa chọn đó dù kéo to/nhỏ cửa sổ.
  const [viewPick, setViewPick] = useState<"day" | "full" | null>(null);
  const view = viewPick ?? (wide ? "full" : "day");
  const setView = setViewPick;
  const [stripStart, setStripStart] = useState(today);
  const [day, setDay] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

  const live = useMemo(() => sessions.filter((s) => s.status !== "Cancelled" && !s.isBackfill), [sessions]);
  const strip = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(stripStart, i)), [stripStart]);
  const mineDays = useMemo(() => new Set(live.filter((s) => isMine(s, myTalentId)).map((s) => s.date)), [live, myTalentId]);
  const daySessions = useMemo(
    () => live.filter((s) => s.date === day).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.brandName.localeCompare(b.brandName, "vi")),
    [live, day]
  );
  const rooms = new Set(daySessions.map((s) => s.studioId || s.brandId)).size;
  const partsWithShifts = Math.max(1, PARTS.filter((p) => daySessions.some((s) => dayPartOf(s.startTime) === p)).length);
  const openSession = openId ? sessions.find((s) => s.id === openId) ?? null : null;
  const shiftStrip = (n: number) => {
    const next = addDays(stripStart, n);
    setStripStart(next);
    setDay(next);
  };

  const toggle = (
    <div className="flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-xs font-bold" role="group" aria-label="Cách xem">
      {(
        [
          ["day", "Theo ngày"],
          ["full", "Lịch tuần / tháng"]
        ] as const
      ).map(([k, l]) => (
        <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`flex-1 px-3 min-h-8 rounded-lg ${view === k ? "bg-[var(--surface-elevated)] text-[var(--text)]" : "text-[var(--text-faint)]"}`}>
          {l}
        </button>
      ))}
    </div>
  );

  if (view === "full")
    return (
      <div className="space-y-3">
        <div className="max-w-md space-y-3">
          <h2 className="text-lg font-black text-[var(--text)] px-1">Cả agency</h2>
          {toggle}
        </div>
        {fullCalendar()}
      </div>
    );

  return (
    <div className={`space-y-3 ${wide ? "" : "max-w-3xl"}`}>
      <div className="px-1">
        <h2 className="text-lg font-black text-[var(--text)]">Cả agency</h2>
        <p className="text-xs text-[var(--text-muted)]">Ai live phòng nào. Chấm vàng = ngày bạn có ca.</p>
      </div>
      <div className={wide ? "max-w-md" : ""}>{toggle}</div>

      <div className={`flex items-center gap-1 ${wide ? "max-w-2xl" : ""}`}>
        <button type="button" onClick={() => shiftStrip(-7)} aria-label="7 ngày trước" className="p-1.5 min-h-8 min-w-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 grid grid-cols-7 gap-1" role="group" aria-label="Chọn ngày">
          {strip.map((d) => {
            const on = d === day;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setDay(d)}
                className={`flex flex-col items-center gap-0.5 py-1.5 min-h-12 rounded-xl border text-[11px] ${on ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] bg-[var(--surface)]"}`}
              >
                <span className={d === today ? "font-bold text-[var(--accent-text)]" : "text-[var(--text-faint)]"}>{d === today ? "Nay" : wd(d)}</span>
                <b className="font-mono text-sm text-[var(--text)]">{d.slice(8)}</b>
                <span className={`w-1.5 h-1.5 rounded-full ${mineDays.has(d) ? "bg-[var(--accent)]" : "bg-transparent"}`} />
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => shiftStrip(7)} aria-label="7 ngày sau" className="p-1.5 min-h-8 min-w-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-xs font-black text-[var(--text)]">{day === today ? "Hôm nay" : wd(day)} · {fmtDateVn(day, false)}</h3>
        <span className="text-[11px] text-[var(--text-faint)]">{daySessions.length > 0 ? `${daySessions.length} ca · ${rooms} phòng` : ""}</span>
      </div>

      {daySessions.length === 0 ? (
        <p className="text-xs text-[var(--text-faint)] px-1">Chưa có ca nào trên lịch ngày này.</p>
      ) : (
        // Màn rộng: mỗi buổi có ca một cột (ngày không có ca chiều thì 2 cột, không chừa cột trống).
        <div className={wide ? "grid gap-3 items-start" : "space-y-3"} style={wide ? { gridTemplateColumns: `repeat(${partsWithShifts}, minmax(0, 1fr))` } : undefined}>
        {PARTS.map((p) => {
          const xs = daySessions.filter((s) => dayPartOf(s.startTime) === p);
          if (xs.length === 0) return null;
          return (
            <section key={p} className="space-y-1.5" aria-label={DAY_PART_LABEL[p]}>
              <p className="text-xs font-bold text-[var(--text-faint)] px-1">{DAY_PART_LABEL[p]} · {xs.length} ca</p>
              <div className={`grid gap-1.5 ${wide ? "" : "sm:grid-cols-2"}`}>
                {xs.map((s) => (
                  <TalentSessionCard key={s.id} session={s} brand={brandById.get(s.brandId)} talents={talents} meId={myTalentId} onOpen={setOpenId} />
                ))}
              </div>
            </section>
          );
        })}
        </div>
      )}

      {openSession && (
        <SessionWindow
          session={openSession}
          brand={brandById.get(openSession.brandId)}
          viewer={{ role: currentRole, myTalentId }}
          today={today}
          allSessions={sessions}
          shiftSlots={shiftSlots}
          onClose={() => setOpenId(null)}
          onSessionsUpdated={onSessionsUpdated}
          onRequestDropout={onRequestDropout}
        />
      )}
    </div>
  );
};
