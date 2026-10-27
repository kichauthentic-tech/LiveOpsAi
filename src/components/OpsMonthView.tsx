import { useCallback, useEffect, useMemo, useState } from "react";
import { FileClock, MessageSquareText } from "lucide-react";
import type { Brand, BrandChannel, BrandMonthPlan, BrandStudio, LiveSession, ShiftSlot } from "../types";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "../lib/scheduling/engineParams";
import { effectiveCamp, resolveCampBucketType } from "../lib/campaignDays";
import { platformsOfBrand } from "../lib/channels";
import { errorMessage } from "../lib/errorMessage";
import { planStatusesRead } from "../lib/db/monthPlans";
import { createSessionDrafts } from "../lib/db/sessionDrafts";
import { addDays } from "../lib/dateUtils";
import { todayVn } from "../lib/performance/brandCommitment";
import { monthEndOf, monthTargetOf, prevMonthOf } from "../lib/performance/ceoBrief";
import { peopleLoad } from "../lib/performance/channelHealth";
import { autoPlan, buildChannelRoom, monthBridge, pWithAdds, sandboxCandidates, type Candidate, type PlanObjective, type PlannedSession } from "../lib/performance/controlRoom";
import { hostOrder, suggestHosts } from "../lib/performance/hostSuggestion";
import { buildAskContext } from "../lib/performance/askContext";
import { isCountable } from "../lib/performance/hostPerformance";
import { brandMonthKey, brandPlatformKey, channelTitle, platformOf } from "../lib/reportPlatform";
import { sessionDurationHours } from "../lib/pnl";
import { findBrandStudioId } from "../lib/db/brandStudios";
import { MAX_RECOMMENDED_HOURS } from "./scheduling/TalentLoadTimeline";
import { useToast } from "../hooks/useToast";
import { Card, SectionTitle, useTooltip } from "./dashboard/shared";
import { Sandbox } from "./control-room/Sandbox";
import { ChannelChips, PeopleLoadTable, SwingList } from "./control-room/Panels";
import { AskPanel } from "./control-room/AskPanel";
import type { RoomChannel } from "./control-room/types";

// BẢNG VẬN HÀNH · CẢ THÁNG (24/10: gộp Phòng Điều Hành 11/10 vào Bảng Vận Hành — cùng người dùng, cùng "ca sắp tới", chỉ khác tầm
// nhìn). Còn: sa bàn + tự xếp (tạo ca NHÁP), ca xoay chuyển, MỘT bảng tải người, "Hỏi số liệu". Đã bỏ khi gộp: khối ca nháp riêng
// (nháp nay là việc cần làm + dòng trong danh sách ca của "Hôm nay & tuần"), bảng tay nghề host riêng (host gợi ý xếp theo đúng thứ tự
// của cửa sổ chốt ca — hostOrder). Khả năng đạt đi qua cùng engine (controlRoom.ts / pHitOf) và hiện bằng %.

interface OpsMonthViewProps {
  sessions: LiveSession[];
  brands: Brand[];
  brandChannels: BrandChannel[];
  shiftSlots: ShiftSlot[];
  brandStudios: BrandStudio[];
  planSlotTargets: Map<string, { date: string; target: number }[]>;
  planMonthTotals: Map<string, number>;
  engineParams?: EngineParams;
  /** Số ca nháp đang chờ (useSessionDrafts của App) — tạo nháp xong gọi `onDraftsCreated` để nạp lại. */
  draftCount: number;
  onDraftsCreated: () => void;
  /** Sang "Hôm nay & tuần", bộ lọc Ca nháp. */
  onShowDrafts: () => void;
}

export default function OpsMonthView(props: OpsMonthViewProps) {
  const { sessions, brands, brandChannels, shiftSlots, brandStudios, planSlotTargets, planMonthTotals, draftCount, onDraftsCreated, onShowDrafts } = props;
  const params = props.engineParams ?? DEFAULT_ENGINE_PARAMS;
  const today = todayVn();
  const month = today.slice(0, 7);
  const since90 = addDays(today, -90);
  const { showToast } = useToast();
  const tooltip = useTooltip();
  const [plans, setPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  const [plan, setPlan] = useState<PlannedSession[]>([]);
  const [budget, setBudget] = useState(8);
  const [objective, setObjective] = useState<PlanObjective>("probability");
  const [creating, setCreating] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [swingPick, setSwingPick] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    planStatusesRead.take(month).then((m) => alive && setPlans(m)).catch(() => alive && setPlans(new Map()));
    return () => { alive = false; };
  }, [month]);

  // Mọi người từng đứng ca (host) — ứng viên cho thứ tự gợi ý; người lạ kênh tự xuống cuối (không có số brand).
  const hostIds = useMemo(() => [...new Set(sessions.map((s) => s.hostId).filter((x): x is string => !!x))], [sessions]);

  // ---------- kênh + mô hình ----------
  const channels: RoomChannel[] = useMemo(() => {
    const out: RoomChannel[] = [];
    const prev = prevMonthOf(month), prev2 = prevMonthOf(prev);
    const names = new Map(sessions.flatMap((s) => (s.hostId ? [[s.hostId, s.hostName ?? s.hostId] as const] : [])));
    for (const b of brands) {
      const ps = platformsOfBrand(brandChannels, b.id);
      for (const p of ps) {
        const key = brandPlatformKey(b.id, p);
        const camp = effectiveCamp(plans.get(key)?.campRanges);
        const bucketOf = (d: string) => resolveCampBucketType(d, camp);
        const chSessions = sessions.filter((s) => s.brandId === b.id && platformOf(s) === p);
        const t = monthTargetOf(month, planMonthTotals.get(brandMonthKey(b.id, month, p)), planSlotTargets.get(brandMonthKey(b.id, month, p)) ?? []);
        const open = shiftSlots.filter((sl) => sl.brandId === b.id && platformOf(sl) === p);
        const room = chSessions.length ? buildChannelRoom({ sessions: chSessions, month, today, target: t?.total ?? null, bucketOf, params, openSlots: open }) : null;
        // Tháng trước có thể có khung camp riêng — dùng lịch cố định cho tháng cũ (cùng cách engine xếp loại ngày lịch sử).
        const fixed = (d: string) => resolveCampBucketType(d);
        out.push({
          key,
          brand: b,
          platform: p,
          name: channelTitle(b.name, p, ps.length > 1),
          sessions: chSessions,
          bucketOf,
          room,
          target: t?.total ?? null,
          studioId: findBrandStudioId(brandStudios, b.id, p),
          // Cùng suggestHosts của cửa sổ chốt ca (90 ngày, cùng sàn) — chỉ người đã live cho brand này.
          hosts: chSessions.length ? suggestHosts(hostIds, names, sessions, b.id, 1, since90, { date: today, startTime: "00:00", endTime: "00:00", platform: p }).filter((h) => h.brandSessions > 0) : [],
          bridge: chSessions.length ? monthBridge(chSessions, prev2, prev, fixed, params) : null
        });
      }
    }
    return out;
  }, [brands, brandChannels, plans, sessions, month, today, planMonthTotals, planSlotTargets, shiftSlots, params, brandStudios, hostIds, since90]);
  const nameOf = useCallback((key: string) => channels.find((c) => c.key === key)?.name ?? key, [channels]);

  const candidates: Candidate[] = useMemo(() => {
    const out: Candidate[] = [];
    for (const c of channels) {
      if (!c.room) continue;
      const order = hostOrder(hostIds, sessions, c.brand.id, c.platform, since90);
      out.push(...sandboxCandidates({ channelKey: c.key, room: c.room, channelSessions: c.sessions, allSessions: sessions, shiftSlots, studioId: c.studioId, bucketOf: c.bucketOf, hostRankOf: (id) => order.get(id) ?? Number.MAX_SAFE_INTEGER }));
    }
    return out;
  }, [channels, sessions, shiftSlots, hostIds, since90]);
  const rooms = useMemo(() => new Map(channels.filter((c) => c.room).map((c) => [c.key, c.room!])), [channels]);
  const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
  const people = useMemo(() => peopleLoad(sessions, mStart, mEnd, (s) => nameOf(brandPlatformKey(s.brandId, platformOf(s))), MAX_RECOMMENDED_HOURS), [sessions, mStart, mEnd, nameOf]);

  // ---------- sa bàn ----------
  const toggle = (c: Candidate) => {
    setPlan((cur) => {
      if (cur.some((p) => p.candidate.key === c.key)) return cur.filter((p) => p.candidate.key !== c.key);
      const busy = new Set(cur.filter((p) => p.candidate.date === c.date && p.candidate.startTime === c.startTime).flatMap((p) => [p.host.id, p.assistant.id]));
      const host = c.hosts.find((h) => !busy.has(h.id));
      const assistant = c.assistants.find((a) => !busy.has(a.id) && a.id !== host?.id);
      if (!host || !assistant) {
        showToast("Khung giờ này không còn host/trợ quen kênh rảnh (đã xếp vào ca khác trong sa bàn).");
        return cur;
      }
      return [...cur, { candidate: c, host, assistant }];
    });
  };
  const runAuto = () => {
    const p = autoPlan(rooms, candidates, budget, objective);
    setPlan(p);
    if (p.length === 0) showToast(objective === "probability" ? "Không ca nào làm tăng xác suất đạt target — kênh còn lại thêm ca cũng không đổi được kết quả tháng." : "Không còn khung trống có đủ người.");
  };
  const createDrafts = async () => {
    setCreating(true);
    try {
      const items = plan.map((p) => {
        const room = rooms.get(p.candidate.channelKey);
        const before = room ? pWithAdds(room, plan.filter((x) => x.candidate.channelKey === p.candidate.channelKey && x !== p).map((x) => x.candidate)).pHit : null;
        const after = room ? pWithAdds(room, plan.filter((x) => x.candidate.channelKey === p.candidate.channelKey).map((x) => x.candidate)).pHit : null;
        const ch = channels.find((c) => c.key === p.candidate.channelKey)!;
        return {
          brandId: ch.brand.id,
          platform: ch.platform,
          date: p.candidate.date,
          startTime: p.candidate.startTime,
          endTime: p.candidate.endTime,
          hostId: p.host.id,
          coHostId: p.assistant.id,
          studioId: ch.studioId || null,
          expectedGmv: p.candidate.expected,
          reason: before != null && after != null && after - before > 0.0005 ? `+${((after - before) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm % xác suất đạt target` : "Thêm GMV"
        };
      });
      await createSessionDrafts(items);
      setPlan([]);
      onDraftsCreated();
      showToast(`Đã tạo ${items.length} ca nháp — xác nhận ở "Hôm nay & tuần" (việc cần làm / bộ lọc Ca nháp).`);
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const askContext = useCallback(
    () =>
      buildAskContext({
        today,
        month,
        channels: channels.map((c) => ({
          name: c.name,
          room: c.room,
          hosts: c.hosts,
          bridge: c.bridge,
          history: [prevMonthOf(prevMonthOf(prevMonthOf(month))), prevMonthOf(prevMonthOf(month)), prevMonthOf(month)].map((m) => {
            const xs = c.sessions.filter((s) => s.date.startsWith(m) && isCountable(s));
            return { month: m, sessions: xs.length, hours: xs.reduce((a, s) => a + sessionDurationHours(s.startTime, s.endTime), 0), gmv: xs.reduce((a, s) => a + (s.actualGmv ?? 0), 0) };
          })
        })),
        people,
        plan,
        channelNameOf: nameOf
      }),
    [today, month, channels, people, plan, nameOf]
  );

  const withRoom = channels.filter((c) => c.room);
  const swingKey = swingPick ?? withRoom.find((c) => c.room?.target && !c.room.decided)?.key ?? withRoom[0]?.key ?? "";

  return (
    <div className="space-y-4" onMouseMove={tooltip.onMove} onMouseLeave={tooltip.onLeave}>
      {tooltip.node}
      {/* Mô tả tháng nằm ở tiêu đề Bảng Vận Hành; hàng này chỉ còn nút. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {draftCount > 0 && (
            <button type="button" onClick={onShowDrafts} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border border-amber-500/50 text-amber-300 min-h-[40px]">
              <FileClock className="w-4 h-4" />{draftCount} ca nháp chờ xác nhận
            </button>
          )}
          <button type="button" onClick={() => setAskOpen(true)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border border-[var(--accent)] text-[var(--accent-text)] min-h-[40px]">
            <MessageSquareText className="w-4 h-4" />Hỏi số liệu
          </button>
        </div>
      </div>

      <Card className="space-y-3">
        <SectionTitle title="Sa bàn · thêm ca, xem tháng đổi ngay" note="Ô vàng nhạt: phòng còn trống và có host + trợ quen kênh còn rảnh. Host gợi ý theo cùng thứ tự của cửa sổ chốt ca." />
        <Sandbox month={month} today={today} channels={withRoom} candidates={candidates} plan={plan} onToggle={toggle} budget={budget} onBudget={setBudget} objective={objective} onObjective={setObjective} onAuto={runAuto} onClear={() => setPlan([])} onCreateDrafts={createDrafts} creating={creating} />
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle title="Ca tác động lớn nhất" />
            <ChannelChips channels={withRoom} value={swingKey} onChange={setSwingPick} />
          </div>
          {withRoom.find((c) => c.key === swingKey) && <SwingList channel={withRoom.find((c) => c.key === swingKey)!} />}
        </Card>
        <Card className="space-y-3">
          <SectionTitle title={`Tải người tháng ${Number(month.slice(5))}`} note="Host + trợ, mọi kênh, gồm ca sắp tới — cùng số giờ tuần với cảnh báo quá tải lúc chốt ca" />
          <PeopleLoadTable people={people} weekLimit={params.fatigueWeekHours} />
        </Card>
      </div>

      <AskPanel open={askOpen} onClose={() => setAskOpen(false)} buildContext={askContext} />
    </div>
  );
}
