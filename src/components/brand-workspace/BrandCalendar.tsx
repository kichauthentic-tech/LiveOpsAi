import React, { useMemo, useState } from "react";
import { LiveSession, PromoScheme, ShiftSlot, ShiftRegistration, RecurringShiftTemplate, Studio, SystemUser, Talent } from "../../types";
import { CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { schemesForDate } from "../../lib/schemeUtils";
import { CAMPAIGN_DAY_STYLES, getCampaignDayInfo } from "../../lib/campaignDays";
import { BrandSessionModal } from "./BrandSessionModal";
import { RecurringTemplateManager } from "../scheduling/RecurringTemplateManager";
import { SlotDetailModal } from "../scheduling/SlotDetailModal";
import { PosterCalendarHeader, PosterCalendarGrid, PosterDayCell } from "../ui/PosterCalendarGrid";
import { EventPill, EventPillTier } from "../ui/EventPill";
import { CampaignDayRibbon } from "../ui/CampaignDayRibbon";
import {
  SessionEventCard,
  SESSION_TONE,
  SESSION_STATUS_LABEL,
  buildSessionMeta,
  buildSlotMeta
} from "../ui/SessionEventCard";
import { getBrandTheme } from "../../lib/brandTheme";

interface BrandCalendarProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  shiftSlots?: ShiftSlot[];
  shiftRegistrations?: ShiftRegistration[];
  studios: Studio[];
  talents: Talent[];
  users?: SystemUser[];
  schemes?: PromoScheme[];
  currentUserId?: string;
  myTalentId?: string;
  canEdit?: boolean;
  onAddSession?: (s: LiveSession) => Promise<boolean>;
  onUpdateSession?: (s: LiveSession) => Promise<boolean>;
  onCreateSlot?: (s: ShiftSlot) => Promise<boolean>;
  onDeleteSlot?: (id: string) => Promise<void>;
  onRegisterSlot?: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregisterSlot?: (slotId: string, talentId: string) => Promise<boolean>;
  onFinalizeSlot?: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  recurringShiftTemplates?: RecurringShiftTemplate[];
  onCreateTemplate?: (t: RecurringShiftTemplate) => Promise<boolean>;
  onToggleTemplate?: (t: RecurringShiftTemplate) => Promise<boolean>;
  onDeleteTemplate?: (id: string) => Promise<void>;
  onGenerateMonthSlots?: (month: string) => Promise<number>;
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// Ngày hôm nay theo giờ local, format YYYY-MM-DD — cùng pattern LiveCalendar.tsx/ShiftScheduling.tsx.
const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const STATUS_TIER: Record<LiveSession["status"], EventPillTier> = {
  "Live Now": "black_bold",
  Upcoming: "teal_gradient",
  Completed: "green_flag",
  Cancelled: "white_box"
};

// Card session cao hơn pill 1 dòng cũ nên phải giới hạn số card/ô, phần dư gộp thành "+N".
const CELL_MAX_SESSIONS = 2;
const CELL_MAX_SLOTS = 2;

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

export const BrandCalendar: React.FC<BrandCalendarProps> = ({
  brandId,
  brandName,
  sessions,
  shiftSlots = [],
  shiftRegistrations = [],
  studios,
  talents,
  users = [],
  schemes = [],
  currentUserId,
  myTalentId,
  canEdit = true,
  onAddSession,
  onUpdateSession,
  onCreateSlot,
  onDeleteSlot,
  onRegisterSlot,
  onUnregisterSlot,
  onFinalizeSlot,
  recurringShiftTemplates = [],
  onCreateTemplate,
  onToggleTemplate,
  onDeleteTemplate,
  onGenerateMonthSlots
}) => {
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}`);
  const [modalState, setModalState] = useState<{ open: boolean; session: LiveSession | null; initialDate?: string }>({
    open: false,
    session: null
  });
  const [selectedSlotDetail, setSelectedSlotDetail] = useState<ShiftSlot | null>(null);
  // Cả workspace này chỉ có 1 brand → 1 theme màu duy nhất, tính 1 lần thay vì mỗi card.
  const brandTheme = getBrandTheme(brandName);
  const moderators = users.filter((u) => u.role === "moderator");
  const canManage = canEdit && !!onAddSession && !!onUpdateSession && !!onCreateSlot;
  const canManageTemplates = canManage && !!onCreateTemplate && !!onToggleTemplate && !!onDeleteTemplate && !!onGenerateMonthSlots;
  const brandTemplates = useMemo(() => recurringShiftTemplates.filter((t) => t.brandId === brandId), [recurringShiftTemplates, brandId]);

  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);
  const brandOpenSlots = useMemo(
    () => shiftSlots.filter((sl) => sl.brandId === brandId && sl.status === "open"),
    [shiftSlots, brandId]
  );

  const studioById = useMemo(() => {
    const map: Record<string, Studio> = {};
    for (const s of studios) map[s.id] = s;
    return map;
  }, [studios]);
  const talentById = useMemo(() => {
    const map: Record<string, Talent> = {};
    for (const t of talents) map[t.id] = t;
    return map;
  }, [talents]);
  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leadingBlanks = firstDay.getDay();

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, LiveSession[]>();
    brandSessions
      .filter((s) => s.date.startsWith(month))
      .forEach((s) => {
        const list = map.get(s.date) ?? [];
        list.push(s);
        map.set(s.date, list);
      });
    return map;
  }, [brandSessions, month]);

  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const slotsByDate = useMemo(() => {
    const map = new Map<string, ShiftSlot[]>();
    brandOpenSlots
      .filter((sl) => sl.date.startsWith(month))
      .forEach((sl) => {
        const list = map.get(sl.date) ?? [];
        list.push(sl);
        map.set(sl.date, list);
      });
    return map;
  }, [brandOpenSlots, month]);

  return (
    <div className="space-y-5">
      <PosterCalendarHeader
        icon={CalendarIcon}
        title="Lịch Vận Hành"
        subtitle="Chỉ hiện phiên live của riêng brand này."
        actions={
          canManage && (
            <button
              onClick={() => setModalState({ open: true, session: null, initialDate: undefined })}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> Đặt Lịch Mới
            </button>
          )
        }
        nav={
          <>
            <button
              onClick={() => setMonth((mo) => shiftMonth(mo, -1))}
              className="p-2 rounded-xl bg-slate-950/60 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-slate-950/60 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => setMonth((mo) => shiftMonth(mo, 1))}
              className="p-2 rounded-xl bg-slate-950/60 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        }
      />

      {canManageTemplates && (
        <RecurringTemplateManager
          templates={brandTemplates}
          brands={[]}
          studios={studios}
          lockedBrandId={brandId}
          lockedBrandName={brandName}
          currentMonth={m}
          currentYear={y}
          currentUserId={currentUserId}
          onCreateTemplate={onCreateTemplate!}
          onToggleTemplate={onToggleTemplate!}
          onDeleteTemplate={onDeleteTemplate!}
          onGenerateMonthSlots={onGenerateMonthSlots!}
        />
      )}

      <PosterCalendarGrid weekdayLabels={WEEKDAY_LABELS} minWidthClassName="min-w-[1080px] xl:min-w-0">
        {cells.map((day, idx) => {
          if (day === null) return <PosterDayCell key={`b-${idx}`} day={null} />;
          const dateStr = `${month}-${`${day}`.padStart(2, "0")}`;
          const daySessions = sessionsByDate.get(dateStr) ?? [];
          const daySlots = slotsByDate.get(dateStr) ?? [];
          const daySchemes = schemesForDate(schemes, dateStr);
          const campaignDay = getCampaignDayInfo(dateStr);
          const eventCount = daySessions.length + daySlots.length + daySchemes.length;
          return (
            <PosterDayCell
              key={dateStr}
              day={day}
              isToday={dateStr === getTodayDateString()}
              isWeekend={idx % 7 === 0 || idx % 7 === 6}
              title={campaignDay?.label}
              onClick={canManage ? () => setModalState({ open: true, session: null, initialDate: dateStr }) : undefined}
              minHeight="min-h-[140px] sm:min-h-[215px]"
              toneClassName={campaignDay ? CAMPAIGN_DAY_STYLES[campaignDay.type].cell : undefined}
              ribbon={
                <CampaignDayRibbon
                  info={campaignDay}
                  columnIndex={idx % 7}
                  isGridStart={day === 1}
                  cellsRemainingInGrid={daysInMonth - day + 1}
                  variant="poster"
                />
              }
              footer={eventCount > 0 ? `${eventCount} sự kiện` : undefined}
            >
              {daySchemes.slice(0, 1).map((s) => (
                <EventPill
                  key={s.id}
                  tier="gold_gradient"
                  label={s.title}
                  title={`${s.title}${s.description ? ` — ${s.description}` : ""}`}
                />
              ))}
              {daySchemes.length > 1 && <span className="text-[9px] text-slate-500">+{daySchemes.length - 1} scheme khác</span>}
              {daySessions.slice(0, CELL_MAX_SESSIONS).map((s) => (
                <SessionEventCard
                  key={s.id}
                  theme={brandTheme}
                  brandName={s.brandName || brandName}
                  startTime={s.startTime}
                        endTime={s.endTime}
                  meta={buildSessionMeta({ ...s, hostName: talentById[s.hostId]?.name ?? s.hostName, studioName: studioById[s.studioId]?.name ?? s.studioName })}
                  metaLimit={3}
                  tone={SESSION_TONE[s.status]}
                  statusLabel={SESSION_STATUS_LABEL[s.status]}
                  tooltip={`${s.title} · ${studioById[s.studioId]?.name ?? s.studioName} · Host ${
                    talentById[s.hostId]?.name ?? s.hostName
                  }${s.coHostName ? ` · Co-Host ${s.coHostName}` : ""}`}
                  onClick={
                    canManage
                      ? (e) => {
                          e.stopPropagation();
                          setModalState({ open: true, session: s });
                        }
                      : undefined
                  }
                />
              ))}
              {daySessions.length > CELL_MAX_SESSIONS && (
                <span className="text-[9px] text-slate-500">+{daySessions.length - CELL_MAX_SESSIONS} khác</span>
              )}
              {daySlots.slice(0, CELL_MAX_SLOTS).map((sl) => (
                <SessionEventCard
                  key={sl.id}
                  theme={brandTheme}
                  brandName={sl.brandName || brandName}
                  startTime={sl.startTime}
                        endTime={sl.endTime}
                  meta={buildSlotMeta(sl)}
                  metaLimit={2}
                  tone="pending"
                  pending
                  tooltip={`Ca chờ đăng ký · ${sl.startTime}-${sl.endTime} · ${sl.studioName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSlotDetail(sl);
                  }}
                />
              ))}
              {daySlots.length > CELL_MAX_SLOTS && (
                <span className="text-[9px] text-amber-600 dark:text-amber-500">+{daySlots.length - CELL_MAX_SLOTS} ca chờ ĐK</span>
              )}
            </PosterDayCell>
          );
        })}
      </PosterCalendarGrid>

      <div className="space-y-2">
        {(sessionsByDate.size === 0 || Array.from(sessionsByDate.values()).flat().length === 0) && (
          <p className="text-sm text-slate-500 text-center py-6">Không có phiên live nào trong tháng {month}.</p>
        )}
        {Array.from(sessionsByDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, list]) => (
            <div key={date} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 space-y-1.5 shadow-sm">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">{date}</p>
              {list.map((s) => (
                <div
                  key={s.id}
                  onClick={() => canManage && setModalState({ open: true, session: s })}
                  className={`flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 ${canManage ? "cursor-pointer hover:text-slate-700 dark:hover:text-slate-200" : ""}`}
                >
                  <EventPill tier={STATUS_TIER[s.status]} label={s.status} />
                  <span>
                    {s.startTime}-{s.endTime}
                  </span>
                  <span>Host: {s.hostName}</span>
                  {s.coHostName && <span>Co-Host: {s.coHostName}</span>}
                  <span>Studio: {s.studioName}</span>
                  <span className="ml-auto font-bold text-emerald-600 dark:text-emerald-400">{formatCurrencyAdaptive(s.actualGmv || 0)}</span>
                </div>
              ))}
            </div>
          ))}
      </div>

      {brandOpenSlots.filter((sl) => sl.date.startsWith(month)).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Ca Chờ Đăng Ký</p>
          {Array.from(slotsByDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, list]) => (
              <div key={date} className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-900/40 rounded-xl px-4 py-3 space-y-1.5 shadow-sm">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">{date}</p>
                {list.map((sl) => (
                  <div
                    key={sl.id}
                    onClick={() => setSelectedSlotDetail(sl)}
                    className="flex flex-wrap items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300/90 cursor-pointer hover:text-amber-900 dark:hover:text-amber-200"
                  >
                    <EventPill tier="pastel_festival" label="Chờ ĐK" />
                    <span>{sl.startTime}-{sl.endTime}</span>
                    <span>Studio: {sl.studioName}</span>
                    {sl.notes && <span className="text-slate-500">· {sl.notes}</span>}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      {modalState.open && canManage && (
        <BrandSessionModal
          brandId={brandId}
          brandName={brandName}
          studios={studios}
          talents={talents}
          moderators={moderators}
          sessions={sessions}
          existingSession={modalState.session}
          initialDate={modalState.initialDate}
          currentUserId={currentUserId}
          onClose={() => setModalState({ open: false, session: null })}
          onAddSession={onAddSession!}
          onUpdateSession={onUpdateSession!}
          onCreateSlot={onCreateSlot!}
        />
      )}

      {selectedSlotDetail && (
        <SlotDetailModal
          slot={selectedSlotDetail}
          onClose={() => setSelectedSlotDetail(null)}
          talents={talents}
          registrations={shiftRegistrations}
          sessions={sessions}
          shiftSlots={shiftSlots}
          canManage={canManage}
          myTalentId={myTalentId}
          onRegister={onRegisterSlot}
          onUnregister={onUnregisterSlot}
          onFinalizeSlot={onFinalizeSlot}
          onDeleteSlot={onDeleteSlot}
        />
      )}
    </div>
  );
};
