import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CalendarDays, CheckCircle2, Clock, Monitor, Sun, X } from "lucide-react";
import type { Brand, LiveSession, ShiftSlot, Talent, UserRole } from "../../types";
import { getTodayDate, addDays } from "../../lib/dateUtils";
import { fmtDateVn, fmtFixed, fmtVndShort } from "../../lib/format";
import { getBrandTheme } from "../../lib/brandTheme";
import { isHandoverPerson } from "../../lib/handover";
import { profileOf } from "../../lib/platforms/profiles";
import {
  BACK_TO_BACK_MIN,
  dayTimeline,
  handoverDue,
  heroShift,
  myClashes,
  myRole,
  mySessions,
  nextWeekLoad
} from "../../lib/talent/myShifts";
import { myPendingAcks, type PendingAck } from "../../lib/talent/acks";
import { shiftPrep } from "../../lib/talent/prep";
import type { ShiftAck } from "../../lib/db/shiftAcks";
import { PageHeader } from "../common/PageHeader";
import { PlatformChip } from "../common/PlatformChip";
import { BrandLogo } from "../ui/BrandLogo";
import { SessionWindow } from "../SessionWindow";
import { TalentSessionCard } from "./TalentSessionCard";

// Tab "Hôm nay" của app talent (T1, 11/10 — thay "Ca Của Tôi" = OpsBoard mode "mine"). Trả lời ba câu của người sắp lên live:
// ca tới là gì / ở phòng nào / đi cùng ai; ca nào mình còn phải giao; lịch có gì sai (trùng giờ) cần báo OP. Đo 11/10: 0 lượt mở
// màn của role talent, 67/92 ca tuần 05–11/10 "chưa giao ca", 56 lần ca nối ≤ 30 phút, 12 chỗ trùng người — xem
// https://claude.ai/artifact/KjJ4fQ9pVqd7WYAkyJqudk. Giao ca làm trên máy tính ở phòng live (user chốt 11/10, phương án D):
// điện thoại chỉ nhắc.

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
  /** Dòng "Đã nhận lịch" của người này (0169). null/vắng = DB chưa chạy 0169 hoặc chưa nạp ⇒ ẩn khối xác nhận. */
  acks?: ShiftAck[] | null;
  onAck?: (sessionIds: string[]) => Promise<boolean>;
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

/** Nhóm ca theo ngày, giữ thứ tự đầu vào. */
function groupByDay(xs: LiveSession[]): [string, LiveSession[]][] {
  const m = new Map<string, LiveSession[]>();
  for (const s of xs) m.set(s.date, [...(m.get(s.date) ?? []), s]);
  return [...m.entries()];
}

const ONBOARD_KEY = (uid: string) => `talent_onboarding_done:${uid}`;
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
  onAck
}) => {
  const today = getTodayDate();
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
  const [onboardDone, setOnboardDone] = useState(() => readFlag(ONBOARD_KEY(currentUserId)));
  const closeOnboarding = () => {
    setOnboardDone(true);
    try {
      localStorage.setItem(ONBOARD_KEY(currentUserId), "1");
    } catch {
      /* chế độ riêng tư: chỉ ẩn trong phiên này */
    }
  };

  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const mine = useMemo(() => mySessions(sessions, myTalentId), [sessions, myTalentId]);
  const hero = useMemo(() => heroShift(mine, nowMs), [mine, nowMs]);
  const due = useMemo(() => handoverDue(sessions, myTalentId, today), [sessions, myTalentId, today]);
  const clashes = useMemo(() => myClashes(sessions, myTalentId, today), [sessions, myTalentId, today]);
  const clashIds = useMemo(() => new Set(clashes.flatMap((c) => [c.session.id, c.other?.id].filter((x): x is string => !!x))), [clashes]);
  const timeline = useMemo(() => dayTimeline(mine, today), [mine, today]);
  const pendingAcks = useMemo(() => (acks ? myPendingAcks(sessions, myTalentId, acks, nowMs) : []), [acks, sessions, myTalentId, nowMs]);
  const week = useMemo(() => (myTalentId ? nextWeekLoad(mine, myTalentId, today) : { count: 0, hours: 0 }), [mine, myTalentId, today]);
  const weekDays = useMemo(() => {
    const out: [string, LiveSession[]][] = [];
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i);
      const xs = mine.filter((s) => s.date === d && s.status !== "Cancelled");
      if (xs.length) out.push([d, xs]);
    }
    return out;
  }, [mine, today]);

  const card = (s: LiveSession) => (
    <TalentSessionCard key={s.id} session={s} brand={brandById.get(s.brandId)} talents={talents} meId={myTalentId} clash={clashIds.has(s.id)} onOpen={setOpenId} />
  );
  const openSession = openId ? sessions.find((s) => s.id === openId) ?? null : null;
  const roleText = (s: LiveSession) => (myTalentId && myRole(s, myTalentId) === "host" ? "Host" : "Trợ live");

  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader icon={Sun} title="Hôm Nay" description={`${dayLabel(today)} · ca đang chạy, ca sắp tới và ca bạn còn phải giao.`} />

      {!myTalentId && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/50 p-3 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Tài khoản này chưa gắn với hồ sơ host/trợ live nào — nhờ OP gắn ở Phân Quyền & Role để thấy ca của bạn.</span>
        </div>
      )}

      {!onboardDone && (
        <section className="bg-[var(--surface)] border border-[var(--accent)]/50 rounded-2xl p-4 space-y-3" aria-label="Hướng dẫn">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-black text-[var(--text)]">Chào bạn — app có 4 phần</h3>
            <button type="button" onClick={closeOnboarding} aria-label="Đóng hướng dẫn" className="p-1.5 -m-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] min-h-8 min-w-8 flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ol className="text-xs text-[var(--text-muted)] space-y-1.5 list-decimal pl-4">
            <li><b className="text-[var(--text)]">Hôm nay</b>: ca tới của bạn, ca còn phải giao, ca bị xếp trùng giờ.</li>
            <li><b className="text-[var(--text)]">Lịch</b>: lịch của bạn và của cả agency — cùng lịch OP đang xếp.</li>
            <li><b className="text-[var(--text)]">Đăng ký ca</b>: khi OP mở ca, bấm "Tôi rảnh" cho ca bạn làm được.</li>
            <li><b className="text-[var(--text)]">Hồ sơ</b>: giờ đã làm, thu nhập tạm tính, hiệu suất, thông tin cá nhân.</li>
          </ol>
          <p className="text-xs text-[var(--text-muted)]">
            Hết ca, trợ live giao ca trên <b className="text-[var(--text)]">máy tính ở phòng live</b>: mở app, vào Hôm nay → Cần giao ca. Muốn mở nhanh trên điện thoại: trình duyệt → Chia sẻ (iPhone) hoặc menu ⋮ (Android) → <b className="text-[var(--text)]">Thêm vào màn hình chính</b>.
          </p>
          <button type="button" onClick={closeOnboarding} className="px-3 py-2 min-h-8 rounded-lg bg-[var(--accent)] text-white text-xs font-bold">Đã hiểu</button>
        </section>
      )}

      {clashes.length > 0 && (
        <section className="rounded-2xl border border-rose-800 bg-rose-950/40 p-3 sm:p-4 space-y-2" aria-label="Ca trùng giờ">
          <h3 className="text-sm font-black text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Bạn bị xếp hai ca cùng giờ ({clashes.length})
          </h3>
          <p className="text-xs text-rose-200/80">Một người chỉ đứng được một ca. Mở ca → "Không đi được ca này" để báo OP đổi người.</p>
          <ul className="space-y-1.5">
            {clashes.map((c) => (
              <li key={`${c.session.id}|${c.other?.id ?? ""}`} className="flex flex-wrap items-center gap-1.5 text-xs text-rose-100">
                <span className="font-bold">{dayLabel(c.session.date)}</span>
                <ClashChip s={c.session} role={roleText(c.session)} onOpen={setOpenId} />
                {c.other ? <><span>và</span><ClashChip s={c.other} role={roleText(c.other)} onOpen={setOpenId} /></> : <span>— vừa Host vừa Trợ live của cùng ca</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hero ? (
        <HeroCard hero={hero} sessions={sessions} brand={brandById.get(hero.session.brandId)} roleText={roleText(hero.session)} myTalentId={myTalentId} today={today} onOpen={setOpenId} />
      ) : (
        myTalentId && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 text-sm text-[var(--text-muted)]">
            {mine.length === 0 ? "Bạn chưa có ca nào trên lịch." : "Bạn không có ca nào trong 7 ngày tới."}
            <button type="button" onClick={() => onOpenTab("shift_scheduling")} className="block mt-2 text-xs font-bold text-[var(--accent-text)]">Xem ca đang mở đăng ký →</button>
          </div>
        )
      )}

      {/* Sau thẻ ca kế tiếp: lần đầu mở app có thể tới ~20 ca chờ nhận — đặt trên thì đẩy "ca tới là gì" xuống quá màn đầu. */}
      {pendingAcks.length > 0 && onAck && <AckBlock pending={pendingAcks} card={card} onAck={onAck} />}

      {due.length > 0 && (
        <section className="bg-[var(--surface)] border border-amber-800/70 rounded-2xl p-3 sm:p-4 space-y-2" aria-label="Cần giao ca">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-black text-[var(--text)] flex items-center gap-2">
              Cần giao ca <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">{due.length}</span>
            </h3>
            <span className="text-[11px] text-[var(--text-faint)] flex items-center gap-1"><Monitor className="w-3.5 h-3.5" /> giao trên máy tính ở phòng live</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Bạn là trợ live của các ca này. Mở ca → Giao ca: up file số liệu của sàn (TikTok: Creator-Live-Performance, Shopee: Live List) rồi chọn sự cố.</p>
          {groupByDay(due.slice(0, 8)).map(([d, xs]) => (
            <div key={d} className="space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text-faint)]">{d === today ? "Hôm nay" : dayLabel(d)}</p>
              <div className="grid gap-2 sm:grid-cols-2">{xs.map(card)}</div>
            </div>
          ))}
          {due.length > 8 && <p className="text-[11px] text-[var(--text-faint)]">và {due.length - 8} ca cũ hơn — mở Lịch để xem hết.</p>}
        </section>
      )}

      {timeline.length > 0 && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 space-y-2" aria-label="Lịch hôm nay">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-black text-[var(--text)]">Lịch hôm nay của bạn</h3>
            <span className="text-[11px] text-[var(--text-faint)]">{timeline.length} ca</span>
          </div>
          <div className="space-y-1.5">
            {timeline.map(({ session: s, gapMin }, i) => (
              <React.Fragment key={s.id}>
                {gapMin != null && <GapLine gapMin={gapMin} handoverFirst={isHandoverPerson(timeline[i - 1].session, myTalentId)} />}
                {card(s)}
              </React.Fragment>
            ))}
          </div>
        </section>
      )}

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 space-y-2" aria-label="7 ngày tới">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-black text-[var(--text)]">7 ngày tới</h3>
          <span className="text-[11px] text-[var(--text-faint)]">{week.count} ca · {hrs(week.hours)}</span>
        </div>
        {weekDays.length === 0 ? (
          <p className="text-xs text-[var(--text-faint)] italic">Chưa có ca nào được chốt cho bạn trong 7 ngày tới.</p>
        ) : (
          weekDays.map(([d, xs]) => (
            <div key={d} className="space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text-faint)]">{dayLabel(d)}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">{xs.map(card)}</div>
            </div>
          ))
        )}
        <button type="button" onClick={() => onOpenTab("talent_calendar")} className="px-3 py-2 min-h-8 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)] flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" /> Mở lịch
        </button>
      </section>

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

const ClashChip: React.FC<{ s: LiveSession; role: string; onOpen: (id: string) => void }> = ({ s, role, onOpen }) => (
  <button type="button" onClick={() => onOpen(s.id)} className="inline-flex items-center gap-1 px-2 py-1 min-h-6 rounded-lg border border-rose-800/70 bg-[var(--surface-base)] hover:border-rose-500 text-[var(--text)]">
    <span className="font-bold">{s.brandName}</span>
    <PlatformChip platform={s.platform} />
    <span className="font-mono">{s.startTime}–{s.endTime}</span>
    <span className="text-[var(--text-faint)]">· {role}</span>
  </button>
);

const GapLine: React.FC<{ gapMin: number; handoverFirst: boolean }> = ({ gapMin, handoverFirst }) => {
  if (gapMin < 0) return <p className="text-[11px] font-bold text-rose-300 pl-3 border-l-2 border-rose-700 ml-3">Chồng {duration(-gapMin)} với ca trước — báo OP</p>;
  if (gapMin <= BACK_TO_BACK_MIN)
    return (
      <p className="text-[11px] font-bold text-amber-300 pl-3 border-l-2 border-amber-700 ml-3">
        Nối ca · nghỉ {gapMin} phút{handoverFirst ? " — giao ca trước rồi vào ca sau" : ""}
      </p>
    );
  return <p className="text-[11px] text-[var(--text-faint)] pl-3 border-l-2 border-dotted border-[var(--border)] ml-3">Nghỉ {duration(gapMin)}</p>;
};

const HeroCard: React.FC<{
  hero: NonNullable<ReturnType<typeof heroShift>>;
  sessions: LiveSession[];
  brand?: Brand;
  roleText: string;
  myTalentId?: string;
  today: string;
  onOpen: (id: string) => void;
}> = ({ hero, sessions, brand, roleText, myTalentId, today, onOpen }) => {
  const s = hero.session;
  const prep = hero.live ? null : shiftPrep(s, sessions);
  const prev = prep?.prevSameChannel;
  const theme = getBrandTheme(s.brandName);
  const partner = roleText === "Host" ? (s.coHostName ? `Trợ live: ${s.coHostName}` : "Không có trợ — OP giao ca") : `Host: ${s.hostName || "chưa có"}`;
  const handover = isHandoverPerson(s, myTalentId);
  return (
    <section
      aria-label={hero.live ? "Ca đang live" : "Ca kế tiếp"}
      style={{ "--b": theme.accent } as React.CSSProperties}
      className={`rounded-2xl p-4 space-y-3 border-[1.5px] bg-[color-mix(in_srgb,var(--b)_16%,var(--surface))] ${hero.live ? "border-rose-500" : "border-[color-mix(in_srgb,var(--b)_60%,var(--surface))]"}`}
    >
      <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text-muted)] flex flex-wrap items-center gap-1.5">
        {hero.live ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-600 text-white"><span className="w-1.5 h-1.5 rounded-full bg-white" />LIVE</span>
        ) : (
          <Clock className="w-3.5 h-3.5" />
        )}
        {hero.live ? `Bạn đang trong ca · còn ${duration(hero.minutesLeft)}` : `Ca kế tiếp · ${s.date === today ? "" : `${dayLabel(s.date)} · `}vào ca sau ${duration(hero.minutesLeft)}`}
      </p>
      <div className="flex items-center gap-3">
        <BrandLogo brand={brand ?? { name: s.brandName, logo: "" }} size="md" className="rounded-lg bg-white" />
        <div className="min-w-0">
          <p className="font-mono text-2xl sm:text-3xl font-black text-[var(--text)] leading-none">{s.startTime}–{s.endTime}</p>
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
        <dt className="text-[var(--text-faint)]">Đi cùng</dt><dd className="font-bold text-[var(--text)]">{partner}</dd>
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
      {hero.live && handover && (
        <p className="text-xs text-[var(--text-muted)] flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Hết ca lúc {s.endTime}: tải file {profileOf(s).reconciliationFile} trên máy phòng live rồi giao ca.
        </p>
      )}
      <button type="button" onClick={() => onOpen(s.id)} className="px-3 py-2 min-h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)]">
        Mở ca
      </button>
    </section>
  );
};

const AckBlock: React.FC<{ pending: PendingAck[]; card: (s: LiveSession) => React.ReactNode; onAck: (ids: string[]) => Promise<boolean> }> = ({ pending, card, onAck }) => {
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const shown = all ? pending : pending.slice(0, 4);
  const changed = pending.filter((p) => p.state.kind === "changed").length;
  const submit = async () => {
    setBusy(true);
    await onAck(pending.map((p) => p.session.id));
    setBusy(false);
  };
  return (
    <section className="bg-[var(--surface)] border border-[var(--accent)]/60 rounded-2xl p-3 sm:p-4 space-y-2" aria-label="Lịch mới cần xác nhận">
      <h3 className="text-sm font-black text-[var(--text)] flex items-center gap-2">
        <BellRing className="w-4 h-4 text-[var(--accent-text)] shrink-0" /> Lịch mới cần bạn xác nhận
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)] text-white">{pending.length}</span>
      </h3>
      <p className="text-xs text-[var(--text-muted)]">
        OP {changed > 0 ? `đã xếp ca mới hoặc đổi giờ ${changed} ca` : "đã xếp các ca dưới đây cho bạn"}. Bấm "Đã nhận" để OP biết bạn đã xem lịch. Ca nào không đi được: mở ca → "Không đi được ca này".
      </p>
      {groupByDay(shown.map((p) => p.session)).map(([d, xs]) => (
        <div key={d} className="space-y-1.5">
          <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text-faint)]">{dayLabel(d)}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {xs.map((s) => {
              const st = pending.find((p) => p.session.id === s.id)?.state;
              return (
                <div key={s.id} className="space-y-1">
                  {card(s)}
                  {st?.kind === "changed" && (
                    <p className="text-[11px] font-bold text-amber-300 px-1">
                      Đổi giờ · trước: {st.before.date === s.date ? "" : `${dayLabel(st.before.date)} `}{st.before.startTime}–{st.before.endTime}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" onClick={submit} disabled={busy} className="px-4 py-2 min-h-9 rounded-lg bg-[var(--accent)] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Đã nhận {pending.length > 1 ? `cả ${pending.length} ca` : "ca này"}
        </button>
        {pending.length > 4 && (
          <button type="button" onClick={() => setAll((x) => !x)} className="px-3 py-2 min-h-8 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)]">
            {all ? "Thu gọn" : `Xem cả ${pending.length} ca`}
          </button>
        )}
      </div>
    </section>
  );
};
