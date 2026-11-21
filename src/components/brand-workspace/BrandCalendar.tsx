import { platformText } from "../../lib/metricGlossary";
import React, { useEffect, useMemo, useState } from "react";
import { inChannelScope, platformOf, schedulePlatformOf, type ChannelScope } from "../../lib/reportPlatform";

/** Phạm vi lịch: sàn có số liệu, "all", hoặc "Website" (sàn chỉ lịch — workspace riêng 20/11). */
type CalendarScope = ChannelScope | "Website";
const inCalendarScope = (x: { platform?: string | null }, scope: CalendarScope) =>
  scope === "Website" ? schedulePlatformOf(x) === "Website" : schedulePlatformOf(x) !== "Website" && inChannelScope(x, scope);
import { Brand, LiveSession, PromoScheme, ShiftSlot, ShiftRegistration, Studio, Talent, UserRole, AuditLogEntry, BrandChannel } from "../../types";
import { SessionWindow } from "../SessionWindow";
import { Building2, CalendarIcon, ChevronLeft, ChevronRight, Plus, Tag } from "lucide-react";
import { fmtDateVn, fmtMonth, fmtVndShort } from "../../lib/format";
import { schemesForDate } from "../../lib/schemeUtils";
import { CAMPAIGN_DAY_STYLES, getCampaignDayInfo } from "../../lib/campaignDays";
import { SlotDetailModal } from "../scheduling/SlotDetailModal";
import { PosterCalendarGrid, PosterDayCell } from "../ui/PosterCalendarGrid";
import { PageHeader } from "../common/PageHeader";
import { CampaignDayRibbon, CampaignDayBanner } from "../ui/CampaignDayRibbon";
import { SchemeWeekStrip } from "./SchemeWeekStrip";
import { SchemeDayPanel } from "./SchemeDayPanel";
import {
  SessionEventCard,
  SESSION_TONE,
  buildSessionMeta,
  buildDurationBadge,
  buildPctBadge,
  buildSlotMeta
} from "../ui/SessionEventCard";
import { getBrandTheme } from "../../lib/brandTheme";
import { metricsHiddenFor } from "../../lib/sessionLedger";
import { MonthPicker } from "../common/MonthPicker";
import { StatTile } from "../common/StatTile";
import { commitmentsRead, contractsRead } from "../../lib/db/brandContracts";
import { monthCommitmentOf } from "../../lib/performance/brandCommitment";
import { monthProgress, nowMinutesVn } from "../../lib/calendar/monthProgress";
import type { BrandContract, BrandMonthlyCommitment } from "../../types";

interface BrandCalendarProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  shiftSlots?: ShiftSlot[];
  /** Sàn đang xem (bộ chuyển sàn) — chỉ lọc ca/slot CỦA BRAND hiện trên lịch; `sessions` gốc vẫn đi xuống modal để kiểm trùng người cả hai sàn. */
  /** "all" = mọi kênh của brand (lịch hiện ca cả hai sàn, chip sàn trên thẻ ca). */
  platformScope: CalendarScope;
  shiftRegistrations?: ShiftRegistration[];
  studios: Studio[];
  /** Kênh brand × sàn (0149) — form mở ca chọn kênh. */
  channels: BrandChannel[];
  talents: Talent[];
  schemes?: PromoScheme[];
  onAddScheme?: (scheme: { title: string; description: string; startDate: string; endDate: string; brandId: string; category: string }) => Promise<void>;
  onUpdateScheme?: (id: string, patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate" | "category">>) => Promise<void>;
  onDeleteScheme?: (id: string) => Promise<void>;
  myTalentId?: string;
  canEdit?: boolean;
  onUpdateSession?: (s: LiveSession) => Promise<boolean>;
  /** Xếp người / mở ca chỉ ở Điều Phối Lịch Live (gom việc trên ca, 21/11): mở Điều Phối, có ngày + ca thì mở đúng tuần và chọn sẵn ca. */
  onOpenRoster?: (date?: string, slotId?: string) => void;
  onRegisterSlot?: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregisterSlot?: (slotId: string, talentId: string) => Promise<boolean>;
  // Cửa sổ Ca Live (2026-09-21): click ca đã có → cùng cửa sổ với agency; brand chỉ đọc.
  currentRole?: UserRole;
  onSessionsUpdated?: (sessions: LiveSession[]) => void;
  onDeleteSession?: (id: string) => Promise<void>;
  onCancelSession?: (id: string, reason: string, reopenSlot: boolean) => Promise<boolean>;
  onSetSessionExcluded?: (id: string, excluded: boolean, reason: string) => Promise<boolean>;
  onLogAudit?: (entry: { action: string; details: string; category: AuditLogEntry["category"] }) => Promise<void>;
}

// Tuần bắt đầu Thứ 2 như Lịch & Studio / Điều Phối Lịch Live / app talent (bố cục 18/10 — trước lịch brand là lịch duy nhất bắt đầu Chủ Nhật).
const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const WEEKEND_COLUMNS = [5, 6];

// Ngày hôm nay theo giờ local, format YYYY-MM-DD — cùng pattern LiveCalendar.tsx/ShiftScheduling.tsx.
const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  platformScope,
  shiftRegistrations = [],
  studios,
  channels,
  talents,
  schemes = [],
  onAddScheme,
  onUpdateScheme,
  onDeleteScheme,
  myTalentId,
  canEdit = true,
  onUpdateSession,
  onOpenRoster,
  onRegisterSlot,
  onUnregisterSlot,
  currentRole,
  onSessionsUpdated,
  onDeleteSession,
  onCancelSession,
  onSetSessionExcluded,
  onLogAudit
}) => {
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}`);
  // Audit UX lần 2 — M4: lưới tháng cố ý giữ 1.080px (ô hẹp hơn ~150px thì card ca không đọc được —
  // xem PosterCalendarGrid), nên ở 375px phải cuộn ngang 3,1× bề ngang máy mới xem hết một tuần. Màn
  // "Ngày" vốn đã vừa khít (0,9 màn, không cuộn ngang) nhưng không ai tới vì mặc định luôn mở "Tháng".
  // Trên điện thoại mở thẳng "Ngày"; từ 640px trở lên giữ nguyên "Tháng". Ba nút Tháng/Tuần/Ngày không đổi.
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? "day" : "month"
  );
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [selectedSlotDetail, setSelectedSlotDetail] = useState<ShiftSlot | null>(null);
  // Cả workspace này chỉ có 1 brand → 1 theme màu duy nhất, tính 1 lần thay vì mỗi card.
  const brandTheme = getBrandTheme(brandName);
  const canManage = canEdit && !!onUpdateSession;
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const openSession = openSessionId ? sessions.find((x) => x.id === openSessionId) ?? null : null;
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId && inCalendarScope(s, platformScope)), [sessions, brandId, platformScope]);
  const brandSchemes = useMemo(() => schemes.filter((s) => s.brandId === brandId), [schemes, brandId]);
  const canManageSchemes = canManage && !!onAddScheme && !!onUpdateScheme && !!onDeleteScheme;
  const brandOpenSlots = useMemo(
    () => shiftSlots.filter((sl) => sl.brandId === brandId && sl.status === "open" && inCalendarScope(sl, platformScope)),
    [shiftSlots, brandId, platformScope]
  );

  // Ô số tiến độ tháng: giờ đã live / đang live còn bao nhiêu / sắp tới / đã huỷ + GMV thực so target. Tháng đang xem theo chế độ (Tháng: ô chọn tháng; Tuần/Ngày: tháng của ngày đang chọn).
  const progMonth = viewMode === "month" ? month : selectedDate.slice(0, 7);
  const [cm, setCm] = useState<{ commitments: BrandMonthlyCommitment[]; contracts: BrandContract[] } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([commitmentsRead.take(), contractsRead.take()])
      .then(([commitments, contracts]) => alive && setCm({ commitments, contracts }))
      .catch(() => alive && setCm(null));
    return () => {
      alive = false;
    };
  }, []);
  const progress = useMemo(
    () => monthProgress(brandSessions, brandOpenSlots, progMonth, getTodayDateString(), nowMinutesVn(), (x) => currentRole === "brand" && metricsHiddenFor(x, "brand")),
    [brandSessions, brandOpenSlots, progMonth, currentRole]
  );
  const progPlatforms = useMemo(() => {
    const set = new Set<"TikTok" | "Shopee">();
    if (platformScope === "Website") return [] as ("TikTok" | "Shopee")[];
    if (platformScope !== "all") set.add(platformScope);
    else for (const c of channels) if (c.brandId === brandId && c.status === "active") set.add(platformOf(c));
    return (["TikTok", "Shopee"] as const).filter((pl) => set.has(pl));
  }, [platformScope, channels, brandId]);
  const commitFor = (pl: "TikTok" | "Shopee") => (cm ? monthCommitmentOf(cm.commitments, cm.contracts, brandId, pl, `${progMonth}-01`) : null);
  const committedHours = progPlatforms.reduce((a, pl) => a + (commitFor(pl)?.hours ?? 0), 0);
  const h1 = (v: number) => `${Math.round(v * 10) / 10}`.replace(".", ",");

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
  const talentLookup = (id: string | undefined) => (id ? talentById[id] : undefined);

  // Brand Workspace được ceo/admin/operations mở hộ qua switcher, nên "đang ở Brand Workspace"
  // KHÔNG đồng nghĩa "người xem là khách". Chỉ role brand thật mới bị giấu phần nội bộ.
  //
  // Audit 2026-09-22: trước đây lịch của brand truyền thẳng `targetGmv` xuống thẻ ca và in studio
  // vào tooltip, trong khi SessionWindow của cùng ca đó cố tình giấu cả hai với role brand
  // (`!isBrandView`). Chưa ai phát hiện vì `target_gmv` trên DB thật đang = 0 ở cả 218 ca — badge
  // không vẽ ra nên lỗi vô hình. Nó sẽ lộ ngay lần đầu ops chốt một Kế Hoạch Tháng có target.
  const brandViewer = currentRole === "brand";
  const metaViewer = brandViewer ? ("brand" as const) : ("agency" as const);
  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leadingBlanks = (firstDay.getDay() + 6) % 7;

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, LiveSession[]>();
    brandSessions
      .filter((s) => s.date.startsWith(month))
      .forEach((s) => {
        const list = map.get(s.date) ?? [];
        list.push(s);
        map.set(s.date, list);
      });
    // Sớm ở trên, muộn xuống dưới: `brandSessions` đọc DB mới nhất trước nên ngày 14/11 từng hiện 20:00 trên 10:00.
    for (const list of map.values()) list.sort((x, y) => x.startTime.localeCompare(y.startTime));
    return map;
  }, [brandSessions, month]);

  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  // Số tuần (hàng lưới tháng) chưa có chương trình khuyến mãi — ghi một lần trên lưới thay vì một câu mỗi tuần (09/11).
  let emptySchemeWeeks = 0;
  for (let r = 0; r < cells.length; r += 7) {
    const dates = cells.slice(r, r + 7).filter((d): d is number => d !== null).map((d) => `${month}-${`${d}`.padStart(2, "0")}`);
    if (dates.length > 0 && !brandSchemes.some((sc) => dates.some((d) => d >= sc.startDate && d <= sc.endDate))) emptySchemeWeeks += 1;
  }

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

  // 7 ngày Thứ 2→Chủ Nhật chứa `selectedDate` — dùng cho view Tuần (SchemeWeekStrip vốn đã
  // nhận thẳng mảng weekDates, tái dùng nguyên component/UI đã làm cho lưới tháng).
  const weekDates = useMemo(() => {
    const monday = shiftDay(selectedDate, -((new Date(selectedDate).getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
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
    return (
      <PosterDayCell
        day={day}
        isToday={dateStr === getTodayDateString()}
        isWeekend={WEEKEND_COLUMNS.includes(columnIndex)}
        title={campaignDay?.label}
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
        badge={
          daySchemes.length > 0 ? (
            <span
              title={`${daySchemes.length} chương trình khuyến mãi — xem chi tiết ở bảng dưới hàng tuần`}
              className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--warning)] text-white"
            >
              <Tag className="w-2.5 h-2.5" />
            </span>
          ) : undefined
        }
      >
        {daySessions.map((s) => (
          <SessionEventCard
            key={s.id}
            theme={brandTheme}
            brandName={s.brandName || brandName}
            platform={s.platform}
            startTime={s.startTime}
            endTime={s.endTime}
            meta={buildSessionMeta({ ...s, hostName: talentById[s.hostId]?.name ?? s.hostName, studioName: studioById[s.studioId]?.name ?? s.studioName }, talentLookup, metaViewer)}
            targetGmv={brandViewer ? undefined : s.targetGmv}
            durationBadge={buildDurationBadge(s, metaViewer)}
            pctBadge={buildPctBadge(s, metaViewer)}
            tone={SESSION_TONE[s.status]}
            tooltip={
              brandViewer
                ? `${s.title} · Host ${talentById[s.hostId]?.name ?? s.hostName}`
                : `${s.title} · ${studioById[s.studioId]?.name ?? s.studioName} · Host ${
                    talentById[s.hostId]?.name ?? s.hostName
                  }${s.coHostName ? ` · Trợ ${s.coHostName}` : ""}`
            }
            onClick={(e) => {
              e.stopPropagation();
              setOpenSessionId(s.id);
            }}
          />
        ))}
        {daySlots.map((sl) => (
          <SessionEventCard
            key={sl.id}
            theme={brandTheme}
            brandName={sl.brandName || brandName}
            platform={sl.platform}
            startTime={sl.startTime}
            endTime={sl.endTime}
            meta={buildSlotMeta(sl, metaViewer)}
            tone="pending"
            pending
            tooltip={brandViewer ? `Ca chờ đăng ký · ${sl.startTime}-${sl.endTime}` : `Ca chờ đăng ký · ${sl.startTime}-${sl.endTime} · ${sl.studioName}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedSlotDetail(sl);
            }}
          />
        ))}
      </PosterDayCell>
    );
  };

  return (
    <div className="space-y-5">
      {/* Bố cục 19/10: đầu trang chung PageHeader (trước là thẻ PosterCalendarHeader nền gradient — trang duy nhất còn thẻ tiêu đề
          kiểu cũ), chú giải màu nằm trong đầu trang thay vì một dải rời giữa tiêu đề và lưới. */}
      <PageHeader
        icon={CalendarIcon}
        title="Lịch Vận Hành"
        description="Chỉ hiện phiên live của riêng brand này."
        actions={
          <>
            <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-[var(--surface-base)]/60 border border-[var(--border)]">
              <button
                onClick={() => setViewMode("month")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  viewMode === "month" ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                Tháng
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  viewMode === "week" ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                Tuần
              </button>
              <button
                onClick={() => setViewMode("day")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  viewMode === "day" ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                Ngày
              </button>
            </div>
            {viewMode === "month" ? (
              <>
                <MonthPicker value={month} onChange={setMonth} />
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
            {canManage && onOpenRoster && (
              <button
                type="button"
                onClick={() => onOpenRoster()}
                title="Mở thêm ca làm ở một chỗ: Điều Phối Lịch Live"
                className="border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4" /> Mở ca ở Điều Phối Lịch Live
              </button>
            )}
          </>
        }
      />


      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label={`Tiến độ tháng ${progMonth}`}>
        {progPlatforms.map((pl) => {
          const target = commitFor(pl)?.gmv ?? 0;
          const actual = progress.gmv[pl];
          return (
            <StatTile
              key={pl}
              frame="card"
              label={`GMV ${pl} tháng ${progMonth.slice(5)}`}
              value={`${fmtVndShort(actual)}${target > 0 ? ` / ${fmtVndShort(target)}` : ""}`}
              hint={target > 0 ? `${Math.round((actual / target) * 100)}% target` : "chưa có target"}
              title="GMV thực của các ca đã live / target tháng. Không cộng hai sàn."
            />
          );
        })}
        <StatTile frame="card" label="Đã live" value={`${h1(progress.done)}h`} hint={committedHours > 0 ? `/ ${h1(committedHours)}h cam kết` : undefined} title="Giờ live thật đã giao trong tháng (ca đang live tính theo lịch)" />
        <StatTile
          frame="card"
          label="Sắp tới"
          value={`${h1(progress.upcoming)}h`}
          hint={`${progress.upcomingCount} ca đã chốt${progress.openCount > 0 ? ` · +${h1(progress.open)}h ca mở` : ""}`}
          title="Giờ các ca đã chốt chưa live, ca mở chờ đăng ký tính riêng"
        />
        <StatTile
          frame="card"
          label="Đã huỷ"
          value={`${progress.cancelledCount} ca`}
          tone={progress.cancelledCount > 0 ? "text-[var(--warning)]" : undefined}
          hint={`${h1(progress.cancelled)}h không tính vào giờ live`}
          title="Các ca đã huỷ trong tháng"
        />
      </div>

      {viewMode === "month" && emptySchemeWeeks > 0 && (
        <p className="text-2xs text-[var(--text-faint)] -mb-2">
          {emptySchemeWeeks} tuần chưa ghi khuyến mãi{canManageSchemes ? " · bấm “+ Khuyến mãi” ở tuần cần thêm" : ""}
        </p>
      )}
      {viewMode === "month" && (
      <PosterCalendarGrid weekdayLabels={WEEKDAY_LABELS} weekendIndices={WEEKEND_COLUMNS} minWidthClassName="min-w-[1080px] xl:min-w-0">
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
              compactEmpty
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
                "min-h-[110px] sm:min-h-[150px]"
              )}
              {weekStrip}
            </React.Fragment>
          );
        })}
      </PosterCalendarGrid>
      )}

      {viewMode === "week" && (
        <PosterCalendarGrid weekdayLabels={WEEKDAY_LABELS} weekendIndices={WEEKEND_COLUMNS} minWidthClassName="min-w-[1080px] xl:min-w-0">
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
                "min-h-[160px] sm:min-h-[220px]"
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

      {/* Bố cục 19/10: danh sách ca theo ngày dưới lưới tháng lặp lại đúng các ca đã có trên lưới (CROCS T10: 90 ca hai lần, trang
          8.300px) — gập lại, mở khi cần xem {platformText("GMV", platformOf(s))} từng ca theo hàng dài. */}
      {viewMode === "month" && (sessionsByDate.size === 0 || Array.from(sessionsByDate.values()).flat().length === 0) && (
        <p className="text-sm text-[var(--text-faint)] text-center py-6">Không có phiên live nào trong tháng {fmtMonth(month)}.</p>
      )}
      {viewMode === "month" && Array.from(sessionsByDate.values()).flat().length > 0 && (
      <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
        <summary className="list-none cursor-pointer px-4 py-3 flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <ChevronRight className="w-4 h-4 text-[var(--text-faint)] transition-transform group-open:rotate-90" />
          Danh sách ca theo ngày
          <span className="text-xs font-normal text-[var(--text-faint)]">{Array.from(sessionsByDate.values()).flat().length} ca · {fmtMonth(month)}</span>
        </summary>
        <div className="divide-y divide-[var(--border-muted)] border-t border-[var(--border)]">
        {Array.from(sessionsByDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, list]) => (
            <div key={date} className="px-4 py-3 space-y-1.5">
              <p className="text-xs font-bold text-[var(--text-muted)]">{getDayOfWeekName(date)}, {fmtDateVn(date)}</p>
              {list.map((s) => {
                // Cùng thẻ với lưới tháng/tuần (tầng "rộng" một hàng) — trước đây là dòng chữ + nhãn trạng thái riêng.
                const studioLabel = studioById[s.studioId]?.name ?? s.studioName;
                const meta = buildSessionMeta({ ...s, hostName: talentById[s.hostId]?.name ?? s.hostName, studioName: studioLabel }, talentLookup, metaViewer);
                if (!brandViewer && studioLabel) meta.push({ icon: Building2, label: studioLabel.split(" - ")[0], title: `Studio: ${studioLabel}` });
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <SessionEventCard
                        theme={brandTheme}
                        brandName={s.brandName || brandName}
                        platform={s.platform}
                        startTime={s.startTime}
                        endTime={s.endTime}
                        title={s.title}
                        meta={meta}
                        targetGmv={brandViewer ? undefined : s.targetGmv}
            durationBadge={buildDurationBadge(s, metaViewer)}
            pctBadge={buildPctBadge(s, metaViewer)}
                        tone={SESSION_TONE[s.status]}
                        onClick={() => setOpenSessionId(s.id)}
                      />
                    </div>
                    {/* Audit 2026-09-28 mục 9: chế độ Tháng (mặc định) từng in GMV cho role brand, GMV tháng chưa phát hành
                        bị view 0107 che thành 0 nên hiện "0" — nay vẫn ghi "chưa phát hành" khi bị che. */}
                    <span className="sc-actual shrink-0 w-24 text-right text-[var(--success)]" title={s.status === "Completed" ? `${platformText("GMV", platformOf(s))} đã ghi nhận` : undefined}>
                      {s.status !== "Completed" ? null : metricsHiddenFor(s, currentRole ?? "brand") ? <span className="font-normal text-[var(--text-faint)]">chưa phát hành</span> : fmtVndShort(s.actualGmv || 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </details>
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
                {getDayOfWeekName(selectedDate)}, {fmtDateVn(selectedDate)}
              </h3>

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
            platform={s.platform}
                        startTime={s.startTime}
                        endTime={s.endTime}
                        title={s.title}
                        meta={buildSessionMeta({
                          ...s,
                          hostName: talentById[s.hostId]?.name ?? s.hostName,
                          studioName: studioById[s.studioId]?.name ?? s.studioName
                        }, talentLookup, metaViewer)}
                        targetGmv={brandViewer ? undefined : s.targetGmv}
            durationBadge={buildDurationBadge(s, metaViewer)}
            pctBadge={buildPctBadge(s, metaViewer)}
                        tone={SESSION_TONE[s.status]}
                        tooltip={
                          brandViewer
                            ? `${s.title} · Host ${talentById[s.hostId]?.name ?? s.hostName}`
                            : `${s.title} · ${studioById[s.studioId]?.name ?? s.studioName} · Host ${
                                talentById[s.hostId]?.name ?? s.hostName
                              }`
                        }
                        onClick={() => setOpenSessionId(s.id)}
                      />
                    ))}
                  {daySlots.map((sl) => (
                    <SessionEventCard
                      key={sl.id}
                      theme={brandTheme}
                      brandName={sl.brandName || brandName}
            platform={sl.platform}
                      startTime={sl.startTime}
                      endTime={sl.endTime}
                      meta={buildSlotMeta(sl, metaViewer)}
                      tone="pending"
                      pending
                      tooltip={brandViewer ? `Ca chờ đăng ký · ${sl.startTime}-${sl.endTime}` : `Ca chờ đăng ký · ${sl.startTime}-${sl.endTime} · ${sl.studioName}`}
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

      {openSession && (
        <SessionWindow
          session={openSession}
          brand={{ name: brandName, logo: "" } as Brand}
          viewer={{ role: currentRole ?? "brand", myTalentId }}
          today={getTodayDateString()}
          allSessions={sessions}
          studios={canManage ? studios : undefined}
          talents={canManage ? talents : undefined}
          shiftSlots={shiftSlots}
          onClose={() => setOpenSessionId(null)}
          onSessionsUpdated={onSessionsUpdated}
          onUpdateSession={canManage ? onUpdateSession : undefined}
          onDeleteSession={canManage ? onDeleteSession : undefined}
          onCancelSession={canManage ? onCancelSession : undefined}
          onSetSessionExcluded={canManage ? onSetSessionExcluded : undefined}
          onLogAudit={canManage ? onLogAudit : undefined}
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
          onOpenRoster={onOpenRoster ? () => onOpenRoster(selectedSlotDetail.date, selectedSlotDetail.id) : undefined}
        />
      )}
    </div>
  );
};
