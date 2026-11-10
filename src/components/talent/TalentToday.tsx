import { SwapInbox } from "../shiftSwap/SwapInbox";
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import type { Brand, LiveSession, ShiftSlot, Talent, UserRole } from "../../types";
import { getTodayDate } from "../../lib/dateUtils";
import { fmtDateVn, fmtFixed, fmtVndShort } from "../../lib/format";
import { getBrandTheme } from "../../lib/brandTheme";
import { heroShift, myClashes, myRole, mySessions, myWindow } from "../../lib/talent/myShifts";
import { TALENT_WIDE_QUERY, agendaDays, weekRange } from "../../lib/talent/agenda";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { myPendingAcks, type PendingAck } from "../../lib/talent/acks";
import { shiftPrep } from "../../lib/talent/prep";
import type { ShiftAck } from "../../lib/db/shiftAcks";
import { PlatformChip } from "../common/PlatformChip";
import { BrandLogo } from "../ui/BrandLogo";
import { SessionWindow } from "../SessionWindow";
import { CalendarFeedCard } from "./CalendarFeedCard";

// Tab "Ca của tôi" của app talent (bản 2, 16/10; id cũ `my_shifts` — thông báo + localStorage trỏ vào). Trả lời MỘT câu: ca tới
// lúc mấy giờ, phòng nào, đi với ai. Đo bản 1 trên app thật (375×812, host Huỳnh Tấn Khanh): màn dài 3.451px, ca kế tiếp bắt
// đầu ở 734px (dưới mép màn đầu) vì thẻ hướng dẫn + khối trùng giờ đứng trước; cùng một ca hiện ở 3 khối; chấm đỏ 26 = 23 ca
// chờ nhận từng ca + 3 ca "cần giao" mà host không làm được trên điện thoại. 1/39 tài khoản talent từng mở app.
// https://claude.ai/artifact/JVFAC43zih6h2AaS1anErA — user chốt 16/10: bỏ giao ca khỏi app talent (admin giao trên máy phòng
// live), nhận lịch một nút, giữ tab Đăng ký riêng, thêm link lịch điện thoại.
// Laptop / PC (≥ 1024px, user yêu cầu 16/10): bản điện thoại chỉ dùng 768/1184px bề ngang ở cửa sổ 1440px, ca xếp thành dải dài một
// cột ⇒ màn rộng: ca kế tiếp + việc cần làm cạnh nhau, ngày xếp 3 cột; từ 1280px tuần hiện thành lưới 7 cột T2–CN (như Lịch
// Tuần của agency).

interface Props {
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  brands: Brand[];
  talents: Talent[];
  currentRole: UserRole;
  myTalentId?: string;
  currentUserId: string;
  onSessionsUpdated: (sessions: LiveSession[]) => void;
  onRequestDropout: (sessionId: string, reason: string) => Promise<boolean>;
  onOpenTab: (tab: string) => void;
  /** Bấm thông báo → App đặt id ca cần mở; màn mở Cửa sổ Ca Live rồi báo lại để App xoá yêu cầu. */
  requestOpenSessionId?: string | null;
  onOpenRequestHandled?: () => void;
  /** Dòng "Đã nhận lịch" của người này (0169). null/vắng = DB chưa chạy 0169 hoặc chưa nạp ⇒ ẩn thanh xác nhận. */
  acks?: ShiftAck[] | null;
  onAck?: (sessionIds: string[]) => Promise<boolean>;
  /** Lịch & Studio (LiveCalendar) cách nhìn talent — App dựng sẵn. */
  calendar?: React.ReactNode;
}

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dayLabel = (d: string) => `${WEEKDAY[new Date(`${d}T00:00:00`).getDay()]} ${fmtDateVn(d, false)}`;
const hrs = (h: number) => `${fmtFixed(h, h % 1 ? 1 : 0)} giờ`;
function duration(min: number): string {
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} giờ ${String(m).padStart(2, "0")} phút` : `${h} giờ`;
}

const TIP_KEY = (uid: string) => `talent_calendar_tip_done:${uid}`;
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export const TalentToday: React.FC<Props> = ({
  sessions,
  shiftSlots,
  brands,
  talents,
  currentRole,
  myTalentId,
  currentUserId,
  onSessionsUpdated,
  onRequestDropout,
  onOpenTab,
  requestOpenSessionId = null,
  onOpenRequestHandled,
  acks = null,
  onAck,
  calendar
}) => {
  const today = getTodayDate();
  const wide = useMediaQuery(TALENT_WIDE_QUERY);
  // Đồng hồ riêng của màn (đếm ngược tới giờ vào ca) — trạng thái ca đã được App tự đổi theo giờ (withEffectiveStatus).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  // Ca mở từ thông báo (App giữ id tới khi đóng) — đọc thẳng prop, không chép vào state bằng effect.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const openId = pickedId ?? requestOpenSessionId;
  const setOpenId = (id: string | null) => {
    setPickedId(id);
    if (id === null) onOpenRequestHandled?.();
  };
  const [tipDone, setTipDone] = useState(() => readFlag(TIP_KEY(currentUserId)));
  const closeTip = () => {
    setTipDone(true);
    try {
      localStorage.setItem(TIP_KEY(currentUserId), "1");
    } catch {
      /* chế độ riêng tư: chỉ ẩn trong phiên này */
    }
  };

  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const mine = useMemo(() => mySessions(sessions, myTalentId), [sessions, myTalentId]);
  const hero = useMemo(() => heroShift(mine, nowMs, 7, myTalentId), [mine, nowMs, myTalentId]);
  const clashes = useMemo(() => myClashes(sessions, myTalentId, today), [sessions, myTalentId, today]);
  const pendingAcks = useMemo(() => (acks ? myPendingAcks(sessions, myTalentId, acks, nowMs) : []), [acks, sessions, myTalentId, nowMs]);

  const thisWeek = weekRange(today, 0);
  const thisWeekDays = useMemo(() => (myTalentId ? agendaDays(mine, myTalentId, thisWeek.from, thisWeek.to) : []), [mine, myTalentId, thisWeek.from, thisWeek.to]);
  const thisWeekCount = thisWeekDays.reduce((a, d) => a + d.items.length, 0);
  const thisWeekHours = thisWeekDays.reduce((a, d) => a + d.hours, 0);

  // Bấm cảnh báo trùng giờ ⇒ mở Cửa sổ Ca của ca đó (lịch bên dưới là Lịch & Studio, có viền đỏ cho ca trùng).
  const jumpTo = (s: LiveSession) => setOpenId(s.id);

  const openSession = openId ? sessions.find((s) => s.id === openId) ?? null : null;
  const roleText = (s: LiveSession) => (myTalentId && myRole(s, myTalentId) === "host" ? "Host" : "Trợ live");
  const firstClash = clashes[0]?.session;

  return (
    <div className={`space-y-3 ${wide ? "" : "max-w-3xl"}`}>
      <div className="px-1">
        <h2 className="text-lg font-black text-[var(--text)]">Ca của tôi</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {dayLabel(today)}
          {myTalentId && thisWeekCount > 0 && ` · tuần này còn ${thisWeekCount} ca · ${hrs(thisWeekHours)}`}
        </p>
      </div>

      {!myTalentId && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/50 p-3 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Tài khoản này chưa gắn với hồ sơ host/trợ live nào — nhờ OP gắn ở Phân Quyền & Role để thấy ca của bạn.</span>
        </div>
      )}

      {/* Màn rộng: ca kế tiếp bên trái, việc cần làm (trùng giờ / lịch mới / thêm lịch) bên phải — cùng một màn đầu. */}
      <div className={wide ? "grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 items-start" : "space-y-3"}>
        {hero ? (
          <HeroCard hero={hero} mine={mine} sessions={sessions} brand={brandById.get(hero.session.brandId)} roleText={roleText(hero.session)} today={today} myTalentId={myTalentId} onOpen={setOpenId} />
        ) : (
          myTalentId && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 text-sm text-[var(--text-muted)]">
              {mine.length === 0 ? "Bạn chưa có ca nào trên lịch." : "Bạn không có ca nào trong 7 ngày tới."}
              <button type="button" onClick={() => onOpenTab("shift_scheduling")} className="block mt-2 min-h-6 text-xs font-bold text-[var(--accent-text)]">Xem ca đang mở đăng ký →</button>
            </div>
          )
        )}

        <div className="space-y-3 empty:hidden">
          {firstClash && (
            <button
              type="button"
              onClick={() => jumpTo(firstClash)}
              className="w-full text-left rounded-xl border border-rose-800 bg-rose-950/40 px-3 py-2.5 min-h-10 flex items-start gap-2 text-xs text-rose-100 hover:border-rose-500"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
              <span>
                <b className="text-rose-50">Bạn bị xếp {clashes.length} chỗ trùng giờ</b> · {[...new Set(clashes.map((c) => `${dayLabel(c.session.date)} ${c.session.startTime}`))].slice(0, 3).join(", ")}.
                Một người chỉ đứng được một ca — bấm để xem, mở ca → "Không đi được ca này" để OP đổi người.
              </span>
            </button>
          )}

          <SwapInbox sessions={sessions} myTalentId={myTalentId} />

          {pendingAcks.length > 0 && onAck && <AckBar pending={pendingAcks} onAck={onAck} />}

          {pendingAcks.length === 0 && myTalentId && mine.length > 0 && !tipDone && (
            <div className="relative">
              <CalendarFeedCard compact />
              <button type="button" onClick={closeTip} aria-label="Ẩn gợi ý" className="absolute top-2 right-2 p-1.5 min-h-8 min-w-8 flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)]">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lịch = ĐÚNG module Lịch & Studio (LiveCalendar, cách nhìn talent: chỉ đọc, "Của tôi" / "Toàn agency") — user 08/11: "làm
          y chang Lịch & Studio cho talent". App truyền vào để dùng chung dữ liệu phòng/kênh/lịch mở ca. */}
      {calendar}

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



const HeroCard: React.FC<{
  hero: NonNullable<ReturnType<typeof heroShift>>;
  mine: LiveSession[];
  sessions: LiveSession[];
  brand?: Brand;
  roleText: string;
  today: string;
  myTalentId?: string;
  onOpen: (id: string) => void;
}> = ({ hero, mine, sessions, brand, roleText, today, myTalentId, onOpen }) => {
  const s = hero.session;
  const prep = hero.live ? null : shiftPrep(s, sessions);
  const prev = prep?.prevSameChannel;
  const theme = getBrandTheme(s.brandName);
  const partner = roleText === "Host" ? s.coHostName || "không có trợ live" : s.hostName || "chưa có host";
  // Ca kế tiếp CÙNG NGÀY sau ca này — để biết nghỉ bao lâu giữa hai ca.
  const after = mine
    .filter((o) => o.id !== s.id && o.date === s.date && o.status !== "Cancelled" && myWindow(o, myTalentId).startMs > hero.window.startMs)
    .sort((a, b) => myWindow(a, myTalentId).startMs - myWindow(b, myTalentId).startMs)[0];
  return (
    <section
      aria-label={hero.live ? "Ca đang live" : "Ca kế tiếp"}
      style={{ "--b": theme.accent } as React.CSSProperties}
      className={`rounded-2xl p-4 space-y-3 border-[1.5px] bg-[color-mix(in_srgb,var(--b)_16%,var(--surface))] ${hero.live ? "border-rose-500" : "border-[color-mix(in_srgb,var(--b)_60%,var(--surface))]"}`}
    >
      <p className="text-xs font-bold text-[var(--text-muted)] flex flex-wrap items-center gap-1.5">
        {hero.live ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-600 text-white"><span className="w-1.5 h-1.5 rounded-full bg-white" />LIVE</span>
        ) : (
          <Clock className="w-3.5 h-3.5" />
        )}
        {hero.live ? `Bạn đang trong ca · còn ${duration(hero.minutesLeft)}` : `Ca kế tiếp · ${s.date === today ? "hôm nay · " : `${dayLabel(s.date)} · `}còn ${duration(hero.minutesLeft)}`}
      </p>
      <div className="flex items-center gap-3">
        <BrandLogo brand={brand ?? { name: s.brandName, logo: "" }} size="md" className="rounded-lg bg-white" />
        <div className="min-w-0">
          <p className="font-mono text-2xl sm:text-3xl font-black text-[var(--text)] leading-none">{hero.window.startTime}–{hero.window.endTime}</p>
          {hero.window.partial && <p className="text-2xs text-[var(--text-muted)] mt-1">Bạn đứng một đoạn · cả ca {s.startTime}–{s.endTime}</p>}
          <p className="text-sm font-bold text-[var(--text)] mt-1 flex flex-wrap items-center gap-1.5">{s.brandName} <PlatformChip platform={s.platform} /></p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-[var(--text-faint)]">Phòng</dt>
        <dd className="font-bold text-[var(--text)]">
          {s.studioName || "chưa có phòng — hỏi OP"}
          {prep?.roomBefore && <span className="font-normal text-[var(--text-muted)]"> · có ca {prep.roomBefore.brandName} tới {prep.roomBefore.endTime}</span>}
        </dd>
        <dt className="text-[var(--text-faint)]">Vai của bạn</dt><dd className="font-bold text-[var(--text)]">{roleText}</dd>
        <dt className="text-[var(--text-faint)]">{roleText === "Host" ? "Trợ live" : "Host"}</dt><dd className="font-bold text-[var(--text)]">{partner}</dd>
        {prep?.campDay && <><dt className="text-[var(--text-faint)]">Ngày</dt><dd className="font-bold text-[var(--text)]">{prep.campDay}</dd></>}
        {!hero.live && s.targetGmv > 0 && <><dt className="text-[var(--text-faint)]">Target ca</dt><dd className="font-bold text-[var(--text)]">{fmtVndShort(s.targetGmv)}</dd></>}
        {prev && (
          <>
            <dt className="text-[var(--text-faint)]">Ca trước</dt>
            <dd className="text-[var(--text)]">
              <span className="font-bold">{fmtVndShort(prev.actualGmv)}</span>
              {prev.totalOrders > 0 && <> · {prev.totalOrders} đơn</>}
              <span className="text-[var(--text-muted)]"> · {dayLabel(prev.date)} {prev.startTime}–{prev.endTime}{prev.hostName ? ` · host ${prev.hostName}` : ""}</span>
            </dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={() => onOpen(s.id)} className="px-3 py-2 min-h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)]">
          Chi tiết ca
        </button>
        {after && <span className="text-2xs text-[var(--text-muted)]">Sau đó: {myWindow(after, myTalentId).startTime} {after.brandName}</span>}
      </div>
    </section>
  );
};

/** Một nút cho cả loạt ca mới — từng ca được đánh dấu "Ca mới" / "Đổi giờ" ngay trên dòng của nó ở danh sách bên dưới. */
const AckBar: React.FC<{ pending: PendingAck[]; onAck: (ids: string[]) => Promise<boolean> }> = ({ pending, onAck }) => {
  const [busy, setBusy] = useState(false);
  const changed = pending.filter((p) => p.state.kind === "changed").length;
  const fresh = pending.length - changed;
  const last = pending[pending.length - 1].session.date;
  const submit = async () => {
    setBusy(true);
    await onAck(pending.map((p) => p.session.id));
    setBusy(false);
  };
  return (
    <section className="rounded-xl border border-[var(--accent)]/60 bg-[var(--surface)] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2" aria-label="Lịch mới cần xác nhận">
      <p className="text-xs text-[var(--text)] flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
        <span>
          <b>{[fresh > 0 ? `${fresh} ca mới` : "", changed > 0 ? `${changed} ca đổi giờ` : ""].filter(Boolean).join(" · ")}</b>
          <span className="text-[var(--text-muted)]"> tới {fmtDateVn(last, false)} — có chấm vàng ở dưới</span>
        </span>
      </p>
      <button type="button" onClick={submit} disabled={busy} className="px-4 py-2 min-h-9 rounded-lg bg-[var(--accent)] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4" /> Đã xem
      </button>
    </section>
  );
};
