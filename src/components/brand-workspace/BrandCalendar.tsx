import React, { useMemo, useState } from "react";
import { LiveSession, PromoScheme, ShiftSlot, ShiftRegistration, RecurringShiftTemplate, Studio, SystemUser, Talent } from "../../types";
import { CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { schemesForDate } from "../../lib/schemeUtils";
import { CAMPAIGN_DAY_STYLES, getCampaignDayInfo } from "../../lib/campaignDays";
import { BrandSessionModal } from "./BrandSessionModal";
import { RecurringTemplateManager } from "../scheduling/RecurringTemplateManager";
import { SlotDetailModal } from "../scheduling/SlotDetailModal";

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

const STATUS_STYLES: Record<LiveSession["status"], string> = {
  "Live Now": "bg-red-600 text-white",
  Upcoming: "bg-amber-600 text-white",
  Completed: "bg-emerald-700 text-white",
  Cancelled: "bg-slate-700 text-slate-300"
};

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" /> Lịch Vận Hành
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Chỉ hiện phiên live của riêng brand này.</p>
        </div>
        <div className="flex items-center gap-1.5">
          {canManage && (
            <button
              onClick={() => setModalState({ open: true, session: null, initialDate: undefined })}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> Đặt Lịch Mới
            </button>
          )}
          <button
            onClick={() => setMonth((mo) => shiftMonth(mo, -1))}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setMonth((mo) => shiftMonth(mo, 1))}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="grid grid-cols-7 gap-1.5 text-[10px] font-bold text-slate-500 uppercase mb-1.5">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="text-center py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`b-${idx}`} className="min-h-[84px]" />;
            const dateStr = `${month}-${`${day}`.padStart(2, "0")}`;
            const daySessions = sessionsByDate.get(dateStr) ?? [];
            const daySlots = slotsByDate.get(dateStr) ?? [];
            const daySchemes = schemesForDate(schemes, dateStr);
            const campaignDay = getCampaignDayInfo(dateStr);
            return (
              <div
                key={dateStr}
                title={campaignDay?.label}
                onClick={() => {
                  if (canManage) setModalState({ open: true, session: null, initialDate: dateStr });
                }}
                className={`min-h-[84px] bg-slate-950/80 border border-slate-800 rounded-lg p-1.5 space-y-1 ${
                  canManage ? "cursor-pointer hover:border-blue-500/50" : ""
                } ${campaignDay ? CAMPAIGN_DAY_STYLES[campaignDay.type].ring : ""}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-mono">{day}</span>
                    {daySchemes.length > 0 && (
                      <span
                        title={daySchemes.map((s) => `${s.title}${s.description ? ` — ${s.description}` : ""}`).join("\n")}
                        className="text-[9px] leading-none"
                      >
                        🏷️
                      </span>
                    )}
                  </div>
                  {campaignDay && (
                    <span
                      className={`text-[8px] font-bold px-1 rounded leading-tight ${CAMPAIGN_DAY_STYLES[campaignDay.type].badge}`}
                    >
                      {campaignDay.shortLabel}
                    </span>
                  )}
                </div>
                {daySessions.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    title={`${s.startTime}-${s.endTime} • ${studioById[s.studioId]?.name ?? s.studioName} • Host ${
                      talentById[s.hostId]?.name ?? s.hostName
                    }`}
                    onClick={(e) => {
                      if (!canManage) return;
                      e.stopPropagation();
                      setModalState({ open: true, session: s });
                    }}
                    className={`text-[9px] font-bold px-1 py-0.5 rounded truncate ${STATUS_STYLES[s.status]} ${canManage ? "hover:opacity-80" : ""}`}
                  >
                    {s.startTime} {s.hostName}
                  </div>
                ))}
                {daySessions.length > 3 && <span className="text-[9px] text-slate-500">+{daySessions.length - 3} khác</span>}
                {daySlots.slice(0, 2).map((sl) => (
                  <div
                    key={sl.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSlotDetail(sl);
                    }}
                    title={`Ca chờ đăng ký · ${sl.startTime}-${sl.endTime} · ${sl.studioName}`}
                    className="text-[9px] font-bold px-1 py-0.5 rounded truncate bg-amber-950/50 text-amber-300 border border-dashed border-amber-700/60 hover:opacity-80 cursor-pointer"
                  >
                    {sl.startTime} Chờ ĐK
                  </div>
                ))}
                {daySlots.length > 2 && <span className="text-[9px] text-amber-500">+{daySlots.length - 2} ca chờ ĐK</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        {(sessionsByDate.size === 0 || Array.from(sessionsByDate.values()).flat().length === 0) && (
          <p className="text-sm text-slate-500 text-center py-6">Không có phiên live nào trong tháng {month}.</p>
        )}
        {Array.from(sessionsByDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, list]) => (
            <div key={date} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-bold text-slate-300 font-mono">{date}</p>
              {list.map((s) => (
                <div
                  key={s.id}
                  onClick={() => canManage && setModalState({ open: true, session: s })}
                  className={`flex flex-wrap items-center gap-2 text-[11px] text-slate-400 ${canManage ? "cursor-pointer hover:text-slate-200" : ""}`}
                >
                  <span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                  <span>
                    {s.startTime}-{s.endTime}
                  </span>
                  <span>Host: {s.hostName}</span>
                  {s.coHostName && <span>Co-Host: {s.coHostName}</span>}
                  <span>Studio: {s.studioName}</span>
                  <span className="ml-auto font-bold text-emerald-400">{formatCurrencyAdaptive(s.actualGmv || 0)}</span>
                </div>
              ))}
            </div>
          ))}
      </div>

      {brandOpenSlots.filter((sl) => sl.date.startsWith(month)).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">Ca Chờ Đăng Ký</p>
          {Array.from(slotsByDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, list]) => (
              <div key={date} className="bg-slate-900 border border-amber-900/40 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-xs font-bold text-slate-300 font-mono">{date}</p>
                {list.map((sl) => (
                  <div
                    key={sl.id}
                    onClick={() => setSelectedSlotDetail(sl)}
                    className="flex flex-wrap items-center gap-2 text-[11px] text-amber-300/90 cursor-pointer hover:text-amber-200"
                  >
                    <span className="px-2 py-0.5 rounded-full font-bold bg-amber-950/60 border border-amber-700/50 text-amber-400">
                      Chờ ĐK
                    </span>
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
