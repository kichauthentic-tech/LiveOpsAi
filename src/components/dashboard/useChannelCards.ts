import { useEffect, useMemo, useRef, useState } from "react";
import type { Brand, BrandChannel, BrandContract, BrandMonthPlan, BrandMonthPlanSlot, BrandMonthlyCommitment, LiveSession, ShiftSlot, UserRole } from "../../types";
import type { EngineParams } from "../../lib/scheduling/engineParams";
import { platformsOfBrand } from "../../lib/channels";
import { monthPlanRead, planStatusesRead } from "../../lib/db/monthPlans";
import { commitmentsRead, contractsRead } from "../../lib/db/brandContracts";
import { fetchForecastSnapshots, recordForecastSnapshots, type ForecastSnapshot } from "../../lib/db/forecastSnapshots";
import { monthEndOf } from "../../lib/performance/ceoBrief";
import { computeCommitmentProgress, monthCommitmentOf } from "../../lib/performance/brandCommitment";
import { buildChannelCard, type ChannelCard } from "../../lib/performance/channelCard";
import { brandPlatformKey, channelTitle, platformOf, type ReportPlatform } from "../../lib/reportPlatform";

// Nạp đủ thứ để dựng thẻ kênh (lib/performance/channelCard.ts) cho một danh sách kênh brand × sàn trong một tháng:
// trạng thái kế hoạch tháng này + tháng sau, ca kế hoạch của kênh đã chốt, cam kết giờ, sổ dự báo. Mọi màn có thẻ kênh dùng hook này
// (màn sếp, Chi tiết kênh) — không màn nào tự nạp kế hoạch rồi tự tính lại.
// Ops xem tháng đang chạy thì ghi dự báo của hôm nay vào sổ (0163) — trước đây CeoBrief và Phòng Điều Hành cùng ghi, mỗi nơi một cách.

const OPS: UserRole[] = ["ceo", "operations", "admin"];

export interface ChannelRef {
  brand: Pick<Brand, "id" | "name" | "logo">;
  platform: ReportPlatform;
}

export function channelRefs(brands: Brand[], brandChannels: BrandChannel[], platforms?: ReportPlatform[]): ChannelRef[] {
  return brands.flatMap((b) => platformsOfBrand(brandChannels, b.id).filter((p) => !platforms || platforms.includes(p)).map((p) => ({ brand: b, platform: p })));
}

export function useChannelCards(opts: {
  month: string;
  today: string;
  refs: ChannelRef[];
  brandChannels: BrandChannel[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  engineParams: EngineParams;
  role: UserRole;
}): { cards: ChannelCard[]; loading: boolean; ledger: Map<string, ForecastSnapshot[]> } {
  const { month, today, refs, brandChannels, sessions, shiftSlots, engineParams, role } = opts;
  const isOps = OPS.includes(role);
  const [plans, setPlans] = useState<{ month: string; map: Map<string, BrandMonthPlan> } | null>(null);
  const [slots, setSlots] = useState<{ key: string; map: Map<string, BrandMonthPlanSlot[]> } | null>(null);
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[]>([]);
  const [contracts, setContracts] = useState<BrandContract[]>([]);
  const [ledger, setLedger] = useState<Map<string, ForecastSnapshot[]>>(new Map());
  const refKey = refs.map((r) => brandPlatformKey(r.brand.id, r.platform)).join(",");

  useEffect(() => {
    let alive = true;
    planStatusesRead.take(month).then((m) => alive && setPlans({ month, map: m })).catch(() => alive && setPlans({ month, map: new Map() }));
    return () => { alive = false; };
  }, [month]);

  const lockedKey = plans?.month === month ? refs.filter((r) => plans.map.get(brandPlatformKey(r.brand.id, r.platform))?.status === "locked").map((r) => brandPlatformKey(r.brand.id, r.platform)).join(",") : null;
  useEffect(() => {
    if (lockedKey == null) return;
    let alive = true;
    const locked = refs.filter((r) => lockedKey.split(",").includes(brandPlatformKey(r.brand.id, r.platform)));
    Promise.all(
      locked.map((r) =>
        monthPlanRead.take(r.brand.id, month, r.platform)
          .then((x): [string, BrandMonthPlanSlot[]] => [brandPlatformKey(r.brand.id, r.platform), x?.slots ?? []])
          .catch((): [string, BrandMonthPlanSlot[]] => [brandPlatformKey(r.brand.id, r.platform), []])
      )
    ).then((rows) => alive && setSlots({ key: `${month}|${lockedKey}`, map: new Map(rows) }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs đổi identity mỗi lần render; refKey/lockedKey là khoá thật
  }, [lockedKey, month, refKey]);

  useEffect(() => {
    if (!isOps) return;
    let alive = true;
    commitmentsRead.take().then((x) => alive && setCommitments(x)).catch(() => alive && setCommitments([]));
    contractsRead.take().then((x) => alive && setContracts(x)).catch(() => alive && setContracts([]));
    return () => { alive = false; };
  }, [isOps]);

  useEffect(() => {
    if (!isOps || refKey === "") return;
    let alive = true;
    Promise.all(
      refs.map((r) =>
        fetchForecastSnapshots(r.brand.id, r.platform)
          .then((x): [string, ForecastSnapshot[]] => [brandPlatformKey(r.brand.id, r.platform), x.rows])
          .catch((): [string, ForecastSnapshot[]] => [brandPlatformKey(r.brand.id, r.platform), []])
      )
    ).then((rows) => alive && setLedger(new Map(rows)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refKey là khoá của refs
  }, [isOps, refKey]);

  const plansReady = plans?.month === month;
  const slotsReady = lockedKey != null && slots?.key === `${month}|${lockedKey}`;
  const loading = !plansReady || !slotsReady;

  const cards = useMemo(() => {
    // Chưa có ca kế hoạch thì target chưa đúng — không vẽ thẻ "Chưa chốt target"/"Chờ số" nhấp nháy vài giây (22/10).
    if (!plansReady || !slotsReady) return [];
    const mStart = `${month}-01`;
    return refs.map((r) => {
      const key = brandPlatformKey(r.brand.id, r.platform);
      const plan = plans!.map.get(key) ?? null;
      const chSessions = sessions.filter((s) => s.brandId === r.brand.id && platformOf(s) === r.platform);
      const mc = isOps ? monthCommitmentOf(commitments, contracts, r.brand.id, r.platform, mStart) : null;
      const commitment = mc && mc.source !== "none" && mc.hours > 0
        ? computeCommitmentProgress({ id: mc.row?.id ?? "", brandId: r.brand.id, platform: r.platform, periodMonth: mStart, committedHours: mc.hours, committedGmv: mc.gmv, isOverride: mc.source === "month" }, r.brand.name, chSessions, today)
        : null;
      return buildChannelCard({
        brandId: r.brand.id,
        brandName: r.brand.name,
        brandLogo: r.brand.logo,
        platform: r.platform,
        name: channelTitle(r.brand.name, r.platform, platformsOfBrand(brandChannels, r.brand.id).length > 1),
        month,
        today,
        sessions: chSessions,
        shiftSlots,
        plan,
        planSlots: plan?.status === "locked" && slotsReady ? slots!.map.get(key) ?? [] : null,
        engineParams,
        commitment,
        ledger: ledger.get(key)
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refKey là khoá của refs
  }, [plansReady, plans, slotsReady, slots, refKey, sessions, shiftSlots, month, today, engineParams, commitments, contracts, ledger, brandChannels, isOps]);

  // Sổ dự báo: mỗi kênh có dự báo (engine v3) ghi một dòng cho hôm nay; DB ghi đè dòng của ngày. Mỗi (kênh, ngày, số) ghi một lần.
  const written = useRef(new Set<string>());
  useEffect(() => {
    if (!isOps || loading || month !== today.slice(0, 7) || today > monthEndOf(`${month}-01`)) return;
    const rows = cards
      .filter((c) => c.forecast && c.outlook.forecastModel === "shape")
      .map((c) => ({ brandId: c.brandId, platform: c.platform, month, asOf: today, kind: "daily" as const, p50: c.forecast!.p50, lo: c.forecast!.lo, hi: c.forecast!.hi, actual: c.outlook.actual, target: c.target, seenShare: c.outlook.shape?.seenShare ?? null, ratio: c.outlook.shape?.ratio ?? null }))
      .filter((r) => !written.current.has(`${r.brandId}|${r.platform}|${r.asOf}|${Math.round(r.p50)}`));
    if (rows.length === 0) return;
    rows.forEach((r) => written.current.add(`${r.brandId}|${r.platform}|${r.asOf}|${Math.round(r.p50)}`));
    recordForecastSnapshots(rows).catch((e) => console.warn("Ghi sổ dự báo không được:", e));
  }, [cards, isOps, loading, month, today]);

  return { cards, loading, ledger };
}
