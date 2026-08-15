import React, { useMemo, useState } from "react";
import { LiveSession, PromoScheme, ShiftSlot, ShiftRegistration, RecurringShiftTemplate, Studio, SystemUser, Talent } from "../../types";
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Tag } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { schemesForDate } from "../../lib/schemeUtils";
import { CAMPAIGN_DAY_STYLES, getCampaignDayInfo } from "../../lib/campaignDays";
import { BrandSessionModal } from "./BrandSessionModal";
import { RecurringTemplateManager } from "../scheduling/RecurringTemplateManager";
import { SlotDetailModal } from "../scheduling/SlotDetailModal";
import { PosterCalendarHeader, PosterCalendarGrid, PosterDayCell } from "../ui/PosterCalendarGrid";
import { EventPill, EventPillTier } from "../ui/EventPill";
import { CampaignDayRibbon, CampaignDayBanner } from "../ui/CampaignDayRibbon";
import { SchemeWeekStrip } from "./SchemeWeekStrip";
import { SchemeDayPanel } from "./SchemeDayPanel";
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
  onAddScheme?: (scheme: { title: string; description: string; startDate: string; endDate: string; brandId: string; category: string }) => Promise<void>;
  onUpdateScheme?: (id: string, patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate" | "category">>) => Promise<void>;
  onDeleteScheme?: (id: string) => Promise<void>;
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

const shiftDay = (dateStr: string, delta: number) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + delta);
  return `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, "0")}-${`${next.getDate()}`.padStart(2, "0")}`;
};

// Cùng pattern getDayOfWeekName lặp lại ở LiveCalendar.tsx/ShiftScheduling.tsx — component nhỏ,
// không đáng tách file chung riêng cho 1 hàm.
const getDayOfWeekName = (dateStr: string) => {
  const names = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  return names[new Date(dateStr).getDay()];
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
  onAddScheme,
  onUpdateScheme,
  onDeleteScheme,
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
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
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
  const brandSchemes = useMemo(() => schemes.filter((s) => s.brandId === brandId), [schemes, brandId]);
  const canManageSchemes = canManage && !!onAddScheme && !!onUpdateScheme && !!onDeleteScheme;
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

  // 7 ngày Chủ Nhật→Thứ 7 chứa `selectedDate` — dùng cho view Tuần (SchemeWeekStrip vốn đã
  // nhận thẳng mảng weekDates, tái dùng nguyên component/UI đã làm cho lưới tháng).
  const weekDates = useMemo(() => {
    const sunday = shiftDay(selectedDate, -new Date(selectedDate).getDay());
    return Array.from({ length: 7 }, (_, i) => shiftDay(sunday, i));
  }, [selectedDate]);

  // Render 1 ô ngày (PosterDayCell + card phiên/ca bên trong) — dùng chung cho cả lưới Tháng (7
  // cột × N hàng) lẫn lưới Tuần (7 cột × 1 hàng), tránh lặp lại JSX. `daySessions`/`daySlots` do
  // caller tính sẵn vì Tháng dùng map đã memo theo tháng (nhanh hơn cho ~31 ô), còn Tuần lọc trực
  // tiếp từ `brandSessions`/`brandOpenSlots` (đúng cả khi tuần vắt qua 2 tháng).
  const renderDayCell = (
    dateStr: string,
    day: number,
    columnIndex: number,
    isGridStart: boolean,
    cellsRemainingInGrid: number,
    daySessions: LiveSession[],
    daySlots: ShiftSlot[],
    minHeight: string
  ) => {
    const daySchemes = schemesForDate(brandSchemes, dateStr);
    const campaignDay = getCampaignDayInfo(dateStr);
    const eventCount = daySessions.length + daySlots.length + daySchemes.length;
    return (
      <PosterDayCell
        day={day}
        isToday={dateStr === getTodayDateString()}
        isWeekend={columnIndex === 0 || columnIndex === 6}
        title={campaignDay?.label}
        onClick={canManage ? () => setModalState({ open: true, session: null, initialDate: dateStr }) : undefined}
        minHeight={minHeight}
        toneClassName={campaignDay ? CAMPAIGN_DAY_STYLES[campaignDay.type].cell : undefined}
        ribbon={
          <CampaignDayRibbon
            info={campaignDay}
            columnIndex={columnIndex}
            isGridStart={isGridStart}
            cellsRemainingInGrid={cellsRemainingInGrid}
            variant="poster"
          />
        }
        footer={eventCount > 0 ? `${eventCount} sự kiện` : undefined}
        badge={
          daySchemes.length > 0 ? (
            <span
              title={`${daySchemes.length} scheme khuyến mãi — xem chi tiết ở bảng dưới hàng tuần`}
              className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--warning)] text-white"
            >
              <Tag className="w-2.5 h-2.5" />
            </span>
          ) : undefined
        }
      >
        {daySessions.slice(0, CELL_MAX_SESSIONS).map((s) => (
          <SessionEventCard
            key={s.id}
            theme={brandTheme}
            brandName={s.brandName || brandName}
            startTime={s.startTime}
            endTime={s.endTime}
            meta={buildSessionMeta({ ...s, hostName: talentById[s.hostId]?.name ?? s.hostName, studioName: studioById[s.studioId]?.name ?? s.studioName })}
            targetGmv={s.targetGmv}
            metaLimit={4}
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
          <span className="text-[9px] text-[var(--text-faint)]">+{daySessions.length - CELL_MAX_SESSIONS} khác</span>
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
          <span className="text-[9px] text-[var(--warning)]">+{daySlots.length - CELL_MAX_SLOTS} ca chờ ĐK</span>
        )}
      </PosterDayCell>
    );
  };

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
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> Đặt Lịch Mới
            </button>
          )
        }
        nav={
          <>
            <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-[var(--surface-base)]/60 border border-[var(--border)]">
              <button
                onClick={() => setViewMode("month")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  viewMode === "month" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                Tháng
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  viewMode === "week" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                Tuần
              </button>
              <button
                onClick={() => setViewMode("day")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  viewMode === "day" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                Ngày
              </button>
            </div>
            {viewMode === "month" ? (
              <>
                <button
                  onClick={() => setMonth((mo) => shiftMonth(mo, -1))}
                  className="p-2 rounded-xl bg-[var(--surface-base)]/60 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-faint)] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text)] font-mono text-sm focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => setMonth((mo) => shiftMonth(mo, 1))}
                  className="p-2 rounded-xl bg-[var(--surface-base)]/60 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-faint)] transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setSelectedDate((d) => shiftDay(d, viewMode === "week" ? -7 : -1))}
                  className="p-2 rounded-xl bg-[var(--surface-base)]/60 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-faint)] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text)] font-mono text-sm focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => setSelectedDate((d) => shiftDay(d, viewMode === "week" ? 7 : 1))}
                  className="p-2 rounded-xl bg-[var(--surface-base)]/60 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-faint)] transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </>
        }
      />

      {viewMode === "month" && canManageTemplates && (
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

      {viewMode === "month" && (
      <PosterCalendarGrid weekdayLabels={WEEKDAY_LABELS} minWidthClassName="min-w-[1080px] xl:min-w-0">
        {cells.map((day, idx) => {
          const rowStart = idx - (idx % 7);
          const isRowEnd = idx % 7 === 6 || idx === cells.length - 1;
          const weekStrip = isRowEnd && (
            <SchemeWeekStrip
              key={`scheme-week-${rowStart}`}
              brandId={brandId}
              weekDates={Array.from({ length: 7 }, (_, ci) => {
                const cellDay = cells[rowStart + ci];
                return cellDay ? `${month}-${`${cellDay}`.padStart(2, "0")}` : null;
              })}
              schemes={brandSchemes}
              canManage={canManageSchemes}
              onAdd={onAddScheme}
              onUpdate={onUpdateScheme}
              onDelete={onDeleteScheme}
            />
          );

          if (day === null) {
            return (
              <React.Fragment key={`b-${idx}`}>
                <PosterDayCell day={null} />
                {weekStrip}
              </React.Fragment>
            );
          }
          const dateStr = `${month}-${`${day}`.padStart(2, "0")}`;
          const daySessions = sessionsByDate.get(dateStr) ?? [];
          const daySlots = slotsByDate.get(dateStr) ?? [];
          return (
            <React.Fragment key={dateStr}>
              {renderDayCell(
                dateStr,
                day,
                idx % 7,
                day === 1,
                daysInMonth - day + 1,
                daySessions,
                daySlots,
                "min-h-[160px] sm:min-h-[240px]"
              )}
              {weekStrip}
            </React.Fragment>
          );
        })}
      </PosterCalendarGrid>
      )}

      {viewMode === "week" && (
        <PosterCalendarGrid weekdayLabels={WEEKDAY_LABELS} minWidthClassName="min-w-[1080px] xl:min-w-0">
          {weekDates.map((dateStr, idx) => (
            <React.Fragment key={dateStr}>
              {renderDayCell(
                dateStr,
                Number(dateStr.slice(8, 10)),
                idx,
                idx === 0,
                7 - idx,
                brandSessions.filter((s) => s.date === dateStr),
                brandOpenSlots.filter((sl) => sl.date === dateStr),
                "min-h-[200px] sm:min-h-[280px]"
              )}
            </React.Fragment>
          ))}
          <SchemeWeekStrip
            brandId={brandId}
            weekDates={weekDates}
            schemes={brandSchemes}
            canManage={canManageSchemes}
            onAdd={onAddScheme}
            onUpdate={onUpdateScheme}
            onDelete={onDeleteScheme}
          />
        </PosterCalendarGrid>
      )}

      {viewMode === "month" && (
      <div className="space-y-2">
        {(sessionsByDate.size === 0 || Array.from(sessionsByDate.values()).flat().length === 0) && (
          <p className="text-sm text-[var(--text-faint)] text-center py-6">Không có phiên live nào trong tháng {month}.</p>
        )}
        {Array.from(sessionsByDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, list]) => (
            <div key={date} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 space-y-1.5 shadow-sm">
              <p className="text-xs font-bold text-[var(--text-muted)] font-mono">{date}</p>
              {list.map((s) => (
                <div
                  key={s.id}
                  onClick={() => canManage && setModalState({ open: true, session: s })}
                  className={`flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-faint)] ${canManage ? "cursor-pointer hover:text-[var(--text)]" : ""}`}
                >
                  <EventPill tier={STATUS_TIER[s.status]} label={s.status} />
                  <span>
                    {s.startTime}-{s.endTime}
                  </span>
                  <span>Host: {s.hostName}</span>
                  {s.coHostName && <span>Co-Host: {s.coHostName}</span>}
                  <span>Studio: {s.studioName}</span>
                  <span className="ml-auto font-bold text-[var(--success)]">{formatCurrencyAdaptive(s.actualGmv || 0)}</span>
                </div>
              ))}
            </div>
          ))}
      </div>
      )}

      {viewMode === "day" && (
        <div className="space-y-4">
          {(() => {
            const campaignDay = getCampaignDayInfo(selectedDate);
            return campaignDay ? <CampaignDayBanner info={campaignDay} className="w-full !rounded-xl justify-center py-1.5" /> : null;
          })()}

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2 mb-3">
              <h3 className="font-bold text-[var(--text)] text-sm">
                {getDayOfWeekName(selectedDate)}, {selectedDate}
              </h3>
              {canManage && (
                <button
                  onClick={() => setModalState({ open: true, session: null, initialDate: selectedDate })}
                  className="flex items-center gap-1 text-xs font-bold text-[var(--accent-text)] hover:opacity-80"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm phiên
                </button>
              )}
            </div>

            {(() => {
              const daySessions = (sessionsByDate.get(selectedDate) ?? brandSessions.filter((s) => s.date === selectedDate)).slice();
              const daySlots = brandOpenSlots.filter((sl) => sl.date === selectedDate);
              if (daySessions.length === 0 && daySlots.length === 0) {
                return <p className="text-sm text-[var(--text-faint)] text-center py-6">Không có phiên live nào ngày này.</p>;
              }
              return (
                <div className="flex flex-col gap-2">
                  {daySessions
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((s) => (
                      <SessionEventCard
                        key={s.id}
                        theme={brandTheme}
                        brandName={s.brandName || brandName}
                        startTime={s.startTime}
                        endTime={s.endTime}
                        title={s.title}
                        meta={buildSessionMeta({
                          ...s,
                          hostName: talentById[s.hostId]?.name ?? s.hostName,
                          studioName: studioById[s.studioId]?.name ?? s.studioName
                        })}
                        targetGmv={s.targetGmv}
                        size="md"
                        tone={SESSION_TONE[s.status]}
                        statusLabel={SESSION_STATUS_LABEL[s.status]}
                        tooltip={`${s.title} · ${studioById[s.studioId]?.name ?? s.studioName} · Host ${
                          talentById[s.hostId]?.name ?? s.hostName
                        }`}
                        onClick={canManage ? () => setModalState({ open: true, session: s }) : undefined}
                      />
                    ))}
                  {daySlots.map((sl) => (
                    <SessionEventCard
                      key={sl.id}
                      theme={brandTheme}
                      brandName={sl.brandName || brandName}
                      startTime={sl.startTime}
                      endTime={sl.endTime}
                      meta={buildSlotMeta(sl)}
                      size="md"
                      tone="pending"
                      pending
                      tooltip={`Ca chờ đăng ký · ${sl.startTime}-${sl.endTime} · ${sl.studioName}`}
                      onClick={() => setSelectedSlotDetail(sl)}
                    />
                  ))}
                </div>
              );
            })()}
          </div>

          <SchemeDayPanel
            brandId={brandId}
            date={selectedDate}
            schemes={brandSchemes}
            canManage={canManageSchemes}
            onAdd={onAddScheme}
            onUpdate={onUpdateScheme}
            onDelete={onDeleteScheme}
          />
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
