import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, MessageSquareText } from "lucide-react";
import type { Brand, BrandChannel, BrandMonthPlan, BrandPlatformRate, BrandStudio, LiveSession, ShiftSlot, Talent, UserRole } from "../types";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "../lib/scheduling/engineParams";
import { effectiveCamp, resolveCampBucketType } from "../lib/campaignDays";
import { platformsOfBrand } from "../lib/channels";
import { errorMessage } from "../lib/errorMessage";
import { planStatusesRead } from "../lib/db/monthPlans";
import { recordForecastSnapshots } from "../lib/db/forecastSnapshots";
import { acceptSessionDraft, createSessionDrafts, dismissSessionDrafts, fetchSessionDrafts, DRAFTS_MISSING_TEXT, type SessionDraft } from "../lib/db/sessionDrafts";
import { todayVn } from "../lib/performance/brandCommitment";
import { monthEndOf, monthTargetOf, prevMonthOf } from "../lib/performance/ceoBrief";
import { peopleLoad } from "../lib/performance/channelHealth";
import { autoPlan, buildChannelRoom, hostSkillTable, monthBridge, pWithAdds, sandboxCandidates, type Candidate, type PlanObjective, type PlannedSession } from "../lib/performance/controlRoom";
import { buildAskContext } from "../lib/performance/askContext";
import { isCountable } from "../lib/performance/hostPerformance";
import { brandMonthKey, brandPlatformKey, channelTitle, platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { sessionDurationHours } from "../lib/pnl";
import { findBrandStudioId } from "../lib/db/brandStudios";
import { MAX_RECOMMENDED_HOURS } from "./scheduling/TalentLoadTimeline";
import { useToast } from "../hooks/useToast";
import { PageHeader } from "./common/PageHeader";
import { Card, SectionTitle, money, pct, useTooltip } from "./dashboard/shared";
import { MonthMap } from "./control-room/MonthMap";
import { LandingGrid } from "./control-room/LandingGrid";
import { Sandbox } from "./control-room/Sandbox";
import { DraftsPanel } from "./control-room/DraftsPanel";
import { BridgeChart, ChannelChips, HostSkillTable, PeopleLoadTable, SwingList } from "./control-room/Panels";
import { AskPanel } from "./control-room/AskPanel";
import type { RoomChannel } from "./control-room/types";

// PHÒNG ĐIỀU HÀNH (11/10/2026) — đề xuất + bản thử: https://claude.ai/artifact/Hu2U23dfazeNpkbfJ518n9. User chốt 11/10: thêm như MỘT
// mục mới (không thay Dashboard / Run-rate); sa bàn chỉ tạo CA NHÁP để OP xác nhận; brand thấy khả năng về đích (ở Dashboard brand,
// không có bộ thương lượng target); "Hỏi số liệu" dùng cả Claude và Gemini, tự chọn bên nào trước.
// Hai lớp: "Sếp" (nhịp agency, bản đồ tháng, cục diện từng kênh, hộp việc, cầu GMV tháng trước) và "Vận hành" (sa bàn + tự xếp,
// ca nháp chờ xác nhận, ca xoay chuyển, tay nghề host, tải người). Mọi số từ lib/performance/controlRoom.ts (engine v3) —
// mỗi kênh brand × sàn đứng riêng, không cộng hiệu suất hai sàn.

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
  brandPlatformRates: BrandPlatformRate[];
  engineParams?: EngineParams;
  currentRole: UserRole;
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
  /** Nạp lại ca + ca chờ đăng ký sau khi OP xác nhận ca nháp. */
  onSessionsChanged: () => Promise<void>;
}

type Layer = "boss" | "ops";
const HEAVY_WEEK_HOURS = 40;

export default function ControlRoom(props: ControlRoomProps) {
  const { sessions, brands, brandChannels, shiftSlots, talents, studios, brandStudios, planSlotTargets, planMonthTotals, brandPlatformRates, currentRole, onOpenMonthPlan, onSessionsChanged } = props;
  const params = props.engineParams ?? DEFAULT_ENGINE_PARAMS;
  const today = todayVn();
  const month = today.slice(0, 7);
  const { showToast } = useToast();
  const tooltip = useTooltip();
  const canSeeMoney = currentRole === "ceo" || currentRole === "admin";
  const [layer, setLayer] = useState<Layer>("boss");
  const [plans, setPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  const [plan, setPlan] = useState<PlannedSession[]>([]);
  const [budget, setBudget] = useState(8);
  const [objective, setObjective] = useState<PlanObjective>("probability");
  const [drafts, setDrafts] = useState<SessionDraft[]>([]);
  const [draftsMissing, setDraftsMissing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [pick, setPick] = useState<{ bridge?: string; host?: string; swing?: string }>({});

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
  const adds = useMemo(() => plan.map((p) => p.candidate), [plan]);
  const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
  const people = useMemo(() => peopleLoad(sessions, mStart, mEnd, (s) => nameOf(brandPlatformKey(s.brandId, platformOf(s))), MAX_RECOMMENDED_HOURS), [sessions, mStart, mEnd, nameOf]);

  // ---------- sổ dự báo: ghi dự phóng hôm nay để brand thấy khả năng về đích (0163 + RPC brand_landing_series 0170) ----------
  const written = useRef(new Set<string>());
  useEffect(() => {
    if (!["ceo", "operations", "admin"].includes(currentRole)) return;
    const rows = channels
      .filter((c) => c.room && c.target)
      .map((c) => ({ brandId: c.brand.id, platform: c.platform, month, asOf: today, kind: "daily" as const, p50: c.room!.now.projected, lo: c.room!.now.lo, hi: c.room!.now.hi, actual: c.room!.now.actual, target: c.target, ratio: c.room!.ratio }))
      .filter((r) => !written.current.has(`${r.brandId}|${r.platform}|${r.asOf}|${Math.round(r.p50)}`));
    if (rows.length === 0) return;
    rows.forEach((r) => written.current.add(`${r.brandId}|${r.platform}|${r.asOf}|${Math.round(r.p50)}`));
    recordForecastSnapshots(rows).catch((e) => console.warn("Ghi sổ dự báo không được:", e));
  }, [channels, currentRole, month, today]);

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
    if (p.length === 0) showToast(objective === "probability" ? "Không ca nào làm tăng khả năng về đích — các kênh còn cửa đã đủ, kênh còn lại đã ngã ngũ." : "Không còn khung trống có đủ người.");
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

  // ---------- nhịp agency ----------
  const pulse = useMemo(() => {
    // GMV đã có của MỌI kênh trên sàn, kể cả kênh chưa đủ lịch sử để chiếu (room null) — trước đây thiếu Franklin Shopee
    // nên "GMV Shopee tháng này" nhỏ hơn số Dashboard.
    const gmvOf = (p: ReportPlatform) =>
      channels.filter((c) => c.platform === p).reduce((a, c) => a + (c.room ? c.room.now.actual : c.sessions.filter((s) => s.date >= mStart && s.date <= mEnd && s.date <= today && s.status !== "Cancelled" && isCountable(s)).reduce((x, s) => x + (s.actualGmv ?? 0), 0)), 0);
    const ratioOf = (p: ReportPlatform) => {
      let a = 0, e = 0;
      for (const c of channels) if (c.platform === p && c.room) for (const s of c.room.sessions) if (s.actual != null) { a += s.actual; e += s.expected; }
      return e > 0 ? a / e : null;
    };
    const monthSessions = sessions.filter((s) => s.date >= mStart && s.date <= mEnd && s.status !== "Cancelled");
    const hoursDone = monthSessions.filter((s) => s.date <= today && isCountable(s)).reduce((a, s) => a + sessionDurationHours(s.startTime, s.endTime), 0);
    const hoursAll = monthSessions.reduce((a, s) => a + sessionDurationHours(s.startTime, s.endTime), 0) + adds.reduce((a, c) => a + sessionDurationHours(c.startTime, c.endTime), 0);
    const withTarget = channels.filter((c) => c.room?.target);
    const alive = withTarget.filter((c) => {
      const mine = adds.filter((a) => a.channelKey === c.key);
      return (pWithAdds(c.room!, mine).pHit ?? 0) >= 0.2;
    });
    let revenue = 0, priced = 0;
    for (const c of channels) {
      const r = brandPlatformRates.find((x) => x.brandId === c.brand.id && x.platform === c.platform);
      if (!r || !(r.ratePerHour > 0 || (r.commissionRate ?? 0) > 0)) continue;
      priced++;
      const hrs = monthSessions.filter((s) => s.brandId === c.brand.id && platformOf(s) === c.platform).reduce((a, s) => a + sessionDurationHours(s.startTime, s.endTime), 0);
      const nmv = (c.room?.now.projected ?? 0) * (1 - (r.returnRate ?? 0) / 100);
      revenue += r.ratePerHour * hrs + ((r.commissionRate ?? 0) / 100) * nmv;
    }
    return { tt: gmvOf("TikTok"), sp: gmvOf("Shopee"), rTT: ratioOf("TikTok"), rSP: ratioOf("Shopee"), hoursDone, hoursAll, alive: alive.length, withTarget: withTarget.length, heavy: people.filter((p) => (p.peakWeek?.hours ?? 0) > HEAVY_WEEK_HOURS).length, revenue, priced };
  }, [channels, sessions, mStart, mEnd, today, adds, people, brandPlatformRates]);

  // ---------- hộp việc ----------
  type Item = { tone: string; title: string; detail: string; action: string; go: () => void };
  const inbox: Item[] = useMemo(() => {
    const items: Item[] = [];
    for (const c of channels) {
      const r = c.room;
      if (!r) continue;
      if (!r.target) {
        items.push({ tone: "var(--text-faint)", title: `${c.name}: chưa chốt Kế Hoạch Tháng`, detail: "Chưa có target nên chưa có khả năng về đích, run-rate, ca tăng cường.", action: "Mở Kế Hoạch Tháng", go: () => onOpenMonthPlan(c.brand.id, c.platform) });
        continue;
      }
      // Chỉ nhắc khi target vẫn còn khó: lúc đầu tháng đã thấp VÀ hiện chưa lên được mức giằng co.
      if ((r.start.pHit ?? 1) < 0.15 && (r.now.pHit ?? 1) < 0.2)
        items.push({ tone: "#e5484d", title: `${c.name}: target ${money(r.target)} khó đạt ngay từ đầu tháng`, detail: `Khả năng lúc đầu tháng ${pct(r.start.pHit)}, hiện ${pct(r.now.pHit)}. Mức có 50% khả năng là ${money(r.start.p50)}, 80% chắc là ${money(r.start.p80)}. Nên bàn lại target với brand.`, action: "Mở Kế Hoạch Tháng", go: () => onOpenMonthPlan(c.brand.id, c.platform) });
    }
    const best = channels
      .filter((c) => c.room?.target && !c.room.decided)
      .map((c) => {
        let top: { k: Candidate; dp: number } | null = null;
        for (const k of candidates) {
          if (k.channelKey !== c.key) continue;
          const dp = (pWithAdds(c.room!, [k]).pHit ?? 0) - (c.room!.now.pHit ?? 0);
          if (!top || dp > top.dp) top = { k, dp };
        }
        return { c, top };
      })
      .filter((x) => x.top && x.top.dp > 0.01)
      .sort((a, b) => b.top!.dp - a.top!.dp)
      .slice(0, 2);
    for (const { c, top } of best) {
      const k = top!.k;
      items.push({ tone: "var(--warning)", title: `${c.name}: thêm 1 ca ${k.date.slice(8)}/${k.date.slice(5, 7)} ${k.startTime} tăng ${(top!.dp * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm`, detail: `Kỳ vọng ${money(k.expected)}. Người rảnh: ${k.hosts[0]?.name} + ${k.assistants[0]?.name}.`, action: "Thử trong sa bàn", go: () => { toggle(k); setLayer("ops"); } });
    }
    if (drafts.length) items.push({ tone: "var(--accent)", title: `${drafts.length} ca nháp đang chờ OP xác nhận`, detail: "Tạo từ sa bàn — chưa giữ phòng, chưa báo ai.", action: "Mở ca nháp", go: () => setLayer("ops") });
    for (const p of people.filter((x) => (x.peakWeek?.hours ?? 0) > HEAVY_WEEK_HOURS).slice(0, 3))
      items.push({ tone: "var(--warning)", title: `${p.name}: ${Math.round(p.peakWeek!.hours)} giờ trong một tuần`, detail: `Cả tháng ${Math.round(p.hostHours + p.assistantHours)} giờ, ${p.channels.length} kênh. GMV chưa giảm đo được, nhưng đây là người dễ nghỉ đột xuất nhất.`, action: "Xem tải người", go: () => setLayer("ops") });
    return items.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggle chỉ đọc setPlan
  }, [channels, candidates, drafts.length, people, onOpenMonthPlan]);

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
  const bridgeKey = pick.bridge ?? channels.find((c) => c.bridge)?.key ?? "";
  const hostKey = pick.host ?? channels.find((c) => c.hosts.length)?.key ?? "";
  const swingKey = pick.swing ?? withRoom.find((c) => c.room?.target && !c.room.decided)?.key ?? withRoom[0]?.key ?? "";

  return (
    <div className="space-y-4" onMouseMove={tooltip.onMove} onMouseLeave={tooltip.onLeave}>
      {tooltip.node}
      <PageHeader
        icon={Crosshair}
        title="Phòng Điều Hành"
        description={`Tháng ${Number(month.slice(5))}/${month.slice(0, 4)} của cả agency: còn cửa về đích không, cái gì đang tạo khác biệt, giờ live tiếp theo nên đặt ở đâu. Số tới hôm nay.`}
        actions={
          <button type="button" onClick={() => setAskOpen(true)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border border-[var(--accent)] text-[var(--accent-text)] min-h-[40px]">
            <MessageSquareText className="w-4 h-4" />Hỏi số liệu
          </button>
        }
      >
        <div className="flex gap-1 rounded-xl border border-[var(--border)] p-1 w-fit" role="tablist" aria-label="Lớp">
          {([["boss", "Toàn cảnh"], ["ops", "Sa bàn & người"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={layer === k} onClick={() => setLayer(k)} className={`px-3 py-1.5 rounded-lg text-sm font-bold min-h-[32px] ${layer === k ? "seg-on" : "text-[var(--text-muted)]"}`}>{l}</button>
          ))}
        </div>
      </PageHeader>

      {layer === "boss" && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ["GMV TikTok tháng này", money(pulse.tt), `ca đã live đạt ${pct(pulse.rTT)} kỳ vọng`],
              ["GMV Shopee tháng này", money(pulse.sp), `ca đã live đạt ${pct(pulse.rSP)} kỳ vọng`],
              ["Kênh còn cửa về đích", `${pulse.alive}/${pulse.withTarget}`, "khả năng ≥ 20% (kênh có target)"],
              ["Giờ live", `${Math.round(pulse.hoursDone)} / ${Math.round(pulse.hoursAll)}`, plan.length ? `gồm ${plan.length} ca thử trong sa bàn` : "đã live có số / cả tháng trên lịch"],
              ["Người quá 40 giờ/tuần", String(pulse.heavy), pulse.heavy ? "xem Sa bàn & người" : "không có"],
              ...(canSeeMoney ? [["Doanh thu agency dự kiến", pulse.priced ? money(pulse.revenue) : "—", pulse.priced ? `theo giá ở CRM · ${pulse.priced}/${channels.length} kênh có giá` : "chưa kênh nào có giá ở CRM"]] : [])
            ].map(([k, v, s]) => (
              <Card key={k} className="!p-3.5 space-y-0.5 min-w-0">
                <div className="text-[11px] font-bold text-[var(--text-faint)]">{k}</div>
                <div className="text-xl font-black text-[var(--text)] tabular-nums truncate">{v}</div>
                <div className="text-[11px] text-[var(--text-faint)]">{s}</div>
              </Card>
            ))}
          </div>

          <Card className="space-y-3">
            <SectionTitle title="Bản đồ tháng · mỗi hàng một phòng live" note="Mỗi ô một ngày, mỗi vạch một ca theo giờ (9h trên, 24h dưới). Rê chuột để xem ca." />
            <MonthMap month={month} today={today} channels={channels} adds={adds} />
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <Card className="space-y-3">
              <SectionTitle title="Hộp việc" note="Tự sinh từ số liệu, mỗi việc một nút" />
              {inbox.length === 0 ? (
                <p className="text-sm text-[var(--text-faint)]">Không có việc gì cần quyết lúc này.</p>
              ) : (
                <div className="space-y-2">
                  {inbox.map((it) => (
                    <div key={it.title} className="flex flex-wrap sm:flex-nowrap items-center gap-3 rounded-xl bg-[var(--surface-muted)]/60 pr-3 overflow-hidden">
                      <i className="self-stretch w-1 shrink-0" style={{ background: it.tone }} />
                      <div className="min-w-0 flex-1 basis-40 py-2.5">
                        <div className="text-sm font-bold text-[var(--text)]">{it.title}</div>
                        <div className="text-xs text-[var(--text-muted)]">{it.detail}</div>
                      </div>
                      <button type="button" onClick={it.go} className="ml-4 sm:ml-0 mb-2.5 sm:mb-0 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap min-h-[30px]">{it.action}</button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="space-y-3">
              <SectionTitle title="Cục diện từng kênh" note="Khả năng đạt target theo ngày · chấm vàng: nếu áp dụng sa bàn" />
              <LandingGrid month={month} channels={channels} adds={adds} onPick={(k) => { setPick((x) => ({ ...x, swing: k })); setLayer("ops"); }} />
            </Card>
          </div>

          <Card className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionTitle title={`Vì sao tháng ${Number(prevMonthOf(month).slice(5))} khác tháng ${Number(prevMonthOf(prevMonthOf(month)).slice(5))}`} />
              <ChannelChips channels={channels} value={bridgeKey} onChange={(k) => setPick((x) => ({ ...x, bridge: k }))} filter={(c) => !!c.bridge} />
            </div>
            {channels.find((c) => c.key === bridgeKey) ? <BridgeChart channel={channels.find((c) => c.key === bridgeKey)!} /> : <p className="text-sm text-[var(--text-faint)]">Chưa kênh nào đủ 2 tháng có số.</p>}
          </Card>
        </>
      )}

      {layer === "ops" && (
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
              <PeopleLoadTable people={people} weekLimit={HEAVY_WEEK_HOURS} />
            </Card>
          </div>
        </>
      )}

      <AskPanel open={askOpen} onClose={() => setAskOpen(false)} buildContext={askContext} />
    </div>
  );
}
