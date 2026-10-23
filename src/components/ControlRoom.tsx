import { useCallback, useEffect, useMemo, useState } from "react";
import { Crosshair, MessageSquareText } from "lucide-react";
import type { Brand, BrandChannel, BrandMonthPlan, BrandStudio, LiveSession, ShiftSlot, Talent } from "../types";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "../lib/scheduling/engineParams";
import { effectiveCamp, resolveCampBucketType } from "../lib/campaignDays";
import { platformsOfBrand } from "../lib/channels";
import { errorMessage } from "../lib/errorMessage";
import { planStatusesRead } from "../lib/db/monthPlans";
import { acceptSessionDraft, createSessionDrafts, dismissSessionDrafts, fetchSessionDrafts, DRAFTS_MISSING_TEXT, type SessionDraft } from "../lib/db/sessionDrafts";
import { todayVn } from "../lib/performance/brandCommitment";
import { monthEndOf, monthTargetOf, prevMonthOf } from "../lib/performance/ceoBrief";
import { peopleLoad } from "../lib/performance/channelHealth";
import { autoPlan, buildChannelRoom, hostSkillTable, monthBridge, pWithAdds, sandboxCandidates, type Candidate, type PlanObjective, type PlannedSession } from "../lib/performance/controlRoom";
import { buildAskContext } from "../lib/performance/askContext";
import { isCountable } from "../lib/performance/hostPerformance";
import { brandMonthKey, brandPlatformKey, channelTitle, platformOf } from "../lib/reportPlatform";
import { sessionDurationHours } from "../lib/pnl";
import { findBrandStudioId } from "../lib/db/brandStudios";
import { MAX_RECOMMENDED_HOURS } from "./scheduling/TalentLoadTimeline";
import { useToast } from "../hooks/useToast";
import { PageHeader } from "./common/PageHeader";
import { Card, SectionTitle, useTooltip } from "./dashboard/shared";
import { Sandbox } from "./control-room/Sandbox";
import { DraftsPanel } from "./control-room/DraftsPanel";
import { ChannelChips, HostSkillTable, PeopleLoadTable, SwingList } from "./control-room/Panels";
import { AskPanel } from "./control-room/AskPanel";
import type { RoomChannel } from "./control-room/types";

// PHÒNG ĐIỀU HÀNH (11/10/2026; 21/10 thu gọn — đề xuất "một thẻ kênh" https://claude.ai/artifact/8tca7KBXNqqdyMAqzTWcTG): chỉ còn
// lớp vận hành — sa bàn + tự xếp, ca nháp chờ OP xác nhận, ca xoay chuyển, tay nghề host, tải người — và "Hỏi số liệu". Tab "Toàn cảnh"
// cũ (nhịp agency, bản đồ tháng, cục diện từng kênh, hộp việc, cầu GMV) đã bỏ: nó trùng màn sếp của Dashboard và dùng thang nhãn riêng.
// Khả năng đạt ở đây đi qua cùng engine (controlRoom.ts / pHitOf) và hiện bằng % — không có chữ kết luận riêng.

interface ControlRoomProps {
  sessions: LiveSession[];
  brands: Brand[];
  brandChannels: BrandChannel[];
  shiftSlots: ShiftSlot[];
  talents: Talent[];
  studios: { id: string; name: string }[];
  brandStudios: BrandStudio[];
  planSlotTargets: Map<string, { date: string; target: number }[]>;
  planMonthTotals: Map<string, number>;
  engineParams?: EngineParams;
  /** Nạp lại ca + ca chờ đăng ký sau khi OP xác nhận ca nháp. */
  onSessionsChanged: () => Promise<void>;
}


export default function ControlRoom(props: ControlRoomProps) {
  const { sessions, brands, brandChannels, shiftSlots, talents, studios, brandStudios, planSlotTargets, planMonthTotals, onSessionsChanged } = props;
  const params = props.engineParams ?? DEFAULT_ENGINE_PARAMS;
  const today = todayVn();
  const month = today.slice(0, 7);
  const { showToast } = useToast();
  const tooltip = useTooltip();
  const [plans, setPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  const [plan, setPlan] = useState<PlannedSession[]>([]);
  const [budget, setBudget] = useState(8);
  const [objective, setObjective] = useState<PlanObjective>("probability");
  const [drafts, setDrafts] = useState<SessionDraft[]>([]);
  const [draftsMissing, setDraftsMissing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [pick, setPick] = useState<{ host?: string; swing?: string }>({});

  useEffect(() => {
    let alive = true;
    planStatusesRead.take(month).then((m) => alive && setPlans(m)).catch(() => alive && setPlans(new Map()));
    return () => { alive = false; };
  }, [month]);
  const loadDrafts = useCallback(async () => {
    try {
      const r = await fetchSessionDrafts(today);
      setDrafts(r.drafts);
      setDraftsMissing(r.missing);
    } catch (e) {
      showToast(`Không đọc được ca nháp: ${errorMessage(e)}`);
    }
  }, [today, showToast]);
  useEffect(() => {
    let alive = true;
    fetchSessionDrafts(today)
      .then((r) => {
        if (!alive) return;
        setDrafts(r.drafts);
        setDraftsMissing(r.missing);
      })
      .catch((e) => alive && showToast(`Không đọc được ca nháp: ${errorMessage(e)}`));
    return () => { alive = false; };
  }, [today, showToast]);

  // ---------- kênh + mô hình ----------
  const channels: RoomChannel[] = useMemo(() => {
    const out: RoomChannel[] = [];
    const prev = prevMonthOf(month), prev2 = prevMonthOf(prev), prev3 = prevMonthOf(prev2);
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
          hosts: chSessions.length ? hostSkillTable(chSessions, [prev3, prev2, prev], () => fixed, params) : [],
          bridge: chSessions.length ? monthBridge(chSessions, prev2, prev, fixed, params) : null
        });
      }
    }
    return out;
  }, [brands, brandChannels, plans, sessions, month, today, planMonthTotals, planSlotTargets, shiftSlots, params, brandStudios]);
  const nameOf = useCallback((key: string) => channels.find((c) => c.key === key)?.name ?? key, [channels]);

  const candidates: Candidate[] = useMemo(() => {
    const skill = new Map<string, number>();
    const out: Candidate[] = [];
    for (const c of channels) {
      if (!c.room) continue;
      for (const h of c.hosts) skill.set(`${c.key}|${h.talentId}`, h.skill);
      out.push(...sandboxCandidates({ channelKey: c.key, room: c.room, channelSessions: c.sessions, allSessions: sessions, shiftSlots, studioId: c.studioId, bucketOf: c.bucketOf, skillOf: (id) => skill.get(`${c.key}|${id}`) ?? 0 }));
    }
    return out;
  }, [channels, sessions, shiftSlots]);
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
    if (p.length === 0) showToast(objective === "probability" ? "Không ca nào làm tăng khả năng đạt target — kênh còn lại thêm ca cũng không đổi được kết quả tháng." : "Không còn khung trống có đủ người.");
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
          reason: before != null && after != null && after - before > 0.0005 ? `+${((after - before) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm khả năng về đích` : "Thêm GMV"
        };
      });
      await createSessionDrafts(items);
      setPlan([]);
      await loadDrafts();
      showToast(`Đã tạo ${items.length} ca nháp — OP xác nhận ở khối "Ca nháp chờ xác nhận".`);
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
  const hostKey = pick.host ?? channels.find((c) => c.hosts.length)?.key ?? "";
  const swingKey = pick.swing ?? withRoom.find((c) => c.room?.target && !c.room.decided)?.key ?? withRoom[0]?.key ?? "";

  return (
    <div className="space-y-4" onMouseMove={tooltip.onMove} onMouseLeave={tooltip.onLeave}>
      {tooltip.node}
      <PageHeader
        icon={Crosshair}
        title="Phòng Điều Hành"
        description={`Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}: thử thêm ca trên sa bàn, xác nhận ca nháp, xem ai đang gánh nhiều giờ. Tình hình từng kênh ở Dashboard.`}
        actions={
          <button type="button" onClick={() => setAskOpen(true)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border border-[var(--accent)] text-[var(--accent-text)] min-h-[40px]">
            <MessageSquareText className="w-4 h-4" />Hỏi số liệu
          </button>
        }
      />

      <>
          <Card className="space-y-3">
            <SectionTitle title="Sa bàn · thêm ca, xem tháng đổi ngay" note="Ô vàng nhạt: phòng còn trống và có host + trợ quen kênh còn rảnh" />
            <Sandbox month={month} today={today} channels={withRoom} candidates={candidates} plan={plan} onToggle={toggle} budget={budget} onBudget={setBudget} objective={objective} onObjective={setObjective} onAuto={runAuto} onClear={() => setPlan([])} onCreateDrafts={createDrafts} creating={creating} />
          </Card>
          <Card className="space-y-3">
            <SectionTitle title={`Ca nháp chờ xác nhận${drafts.length ? ` · ${drafts.length}` : ""}`} note="Xác nhận = tạo ca thật, chốt người; trùng người/phòng bị chặn như ca thường" />
            {draftsMissing ? (
              <p className="text-sm text-amber-400">{DRAFTS_MISSING_TEXT}</p>
            ) : (
              <DraftsPanel
                drafts={drafts}
                channels={channels}
                talents={talents}
                studios={studios}
                today={today}
                onAccept={async (d, e) => {
                  await acceptSessionDraft({ id: d.id, date: e.date, startTime: e.startTime, endTime: e.endTime, hostId: e.hostId || null, coHostId: e.coHostId || null, studioId: e.studioId || null });
                  showToast("Đã tạo ca. Kênh đã chốt Kế Hoạch Tháng thì ca vào mục ca tăng cường.");
                  await Promise.all([loadDrafts(), onSessionsChanged()]);
                }}
                onDismiss={async (ids) => {
                  await dismissSessionDrafts(ids);
                  await loadDrafts();
                }}
              />
            )}
          </Card>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionTitle title="Ca xoay chuyển cục diện" />
              <ChannelChips channels={withRoom} value={swingKey} onChange={(k) => setPick((x) => ({ ...x, swing: k }))} />
            </div>
            {withRoom.find((c) => c.key === swingKey) && <SwingList channel={withRoom.find((c) => c.key === swingKey)!} />}
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionTitle title="Host: tay nghề hay được xếp ca tốt" />
                <ChannelChips channels={channels} value={hostKey} onChange={(k) => setPick((x) => ({ ...x, host: k }))} filter={(c) => c.hosts.length > 0} />
              </div>
              {channels.find((c) => c.key === hostKey) ? <HostSkillTable channel={channels.find((c) => c.key === hostKey)!} /> : <p className="text-sm text-[var(--text-faint)]">Chưa kênh nào có host đủ 8 ca.</p>}
            </Card>
            <Card className="space-y-3">
              <SectionTitle title={`Tải người tháng ${Number(month.slice(5))}`} note="Host + trợ, mọi kênh, gồm ca sắp tới" />
              <PeopleLoadTable people={people} weekLimit={params.fatigueWeekHours} />
            </Card>
          </div>
      </>

      <AskPanel open={askOpen} onClose={() => setAskOpen(false)} buildContext={askContext} />
    </div>
  );
}
