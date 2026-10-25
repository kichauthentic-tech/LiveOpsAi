import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { BrandContract, BrandMonthPlan, BrandMonthlyCommitment, LiveSession, ShiftSlot } from "../../types";
import { PlatformChip } from "../common/PlatformChip";
import { errorMessage } from "../../lib/errorMessage";
import { fetchBrandContracts, fetchBrandMonthlyCommitments, upsertMonthlyCommitment } from "../../lib/db/brandContracts";
import { fetchMonthPlan, fetchPlanStatuses, lockMonthPlan, lockMonthPlans, replacePlanSlots, upsertMonthPlan, type LockPlanResult, type PlanSettings } from "../../lib/db/monthPlans";
import { isRosterBackendMissing, setRosterMonthDeadline } from "../../lib/db/roster";
import { contractCovering, monthCommitmentOf } from "../../lib/performance/brandCommitment";
import { brandPlatformKey, type ReportPlatform } from "../../lib/reportPlatform";
import { addDays } from "../../lib/dateUtils";
import { hoursToSchedule } from "../../lib/roster/monthDesk";
import { expandPattern, fitToHours, parsePastedSchedule, totalHours, weekPattern, type TimeFrame } from "../../lib/roster/openMonth";

// "Mở lịch tháng sau" 3 bước (Điều Phối Lịch Live bản gọn — đợt 2, 25/10; user chốt: tháng 11 lập lịch TRONG APP, giờ cam kết
// nhập tại chỗ, target vẫn ở Kế Hoạch Tháng). Ghi qua ĐÚNG đường của Kế Hoạch Tháng để Dashboard / dự báo / chia target sau
// này không lệch: cam kết tháng (upsertMonthlyCommitment, cùng luật isOverride), lưới ca kế hoạch (upsertMonthPlan +
// replacePlanSlots, target ca = 0), chốt (lock_month_plan sinh ca mở), rồi đặt MỘT hạn đăng ký cho tháng (0180).
// Trainer ghi được cả 4 từ 0180. Kênh đã chốt kế hoạch thì bỏ qua; kênh có lưới nháp sẵn (CEO lập, có target) thì giữ lưới đó.

export interface WizardChannel {
  brandId: string;
  platform: ReportPlatform;
  brandName: string;
  shrink: number;
  /** Giờ cam kết tháng đang chạy (để "Điền như tháng này" — 5/7 kênh không có hợp đồng ở CRM, 25/10). */
  prevHours: number;
}

type Source = "plan" | "copy" | "paste";
interface Row extends WizardChannel {
  key: string;
  include: boolean;
  hours: string;
  contract?: BrandContract;
  current?: BrandMonthlyCommitment;
  plan?: BrandMonthPlan;
  planSlots: TimeFrame[];
  src: Source;
  paste: string;
}
type RunState = { key: string; ok: boolean; text: string };

const DEFAULT_SETTINGS: PlanSettings = { defaultSlotHours: 3, liveWindowStart: "09:00", liveWindowEnd: "23:00", maxSlotsPerDay: 3, notes: "", blackoutDates: [], targetGmv: 0, campRanges: {}, groupTargets: {}, shopTargetGmv: 0, adsBudget: 0 };
const vn = (v: number) => Math.round(v).toLocaleString("vi-VN");
const ddmm = (d: string) => `${+d.slice(8, 10)}/${+d.slice(5, 7)}`;
const FIELD = "px-2 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)] text-sm";

export const OpenMonthWizard: React.FC<{
  month: string;
  today: string;
  channels: WizardChannel[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  deadline?: string;
  onClose: () => void;
  /** Sau khi tạo: nạp lại ca/ca mở + hạn tháng. */
  onDone: () => Promise<void>;
}> = ({ month, today, channels, sessions, shiftSlots, deadline, onClose, onDone }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [fit, setFit] = useState(true);
  const monthStart = `${month}-01`;
  const defDeadline = deadline ? new Date(deadline) : null;
  const [dlDate, setDlDate] = useState(defDeadline ? `${defDeadline.getFullYear()}-${String(defDeadline.getMonth() + 1).padStart(2, "0")}-${String(defDeadline.getDate()).padStart(2, "0")}` : addDays(monthStart, -3) > today ? addDays(monthStart, -3) : addDays(today, 1));
  const [dlTime, setDlTime] = useState(defDeadline ? `${String(defDeadline.getHours()).padStart(2, "0")}:${String(defDeadline.getMinutes()).padStart(2, "0")}` : "17:00");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunState[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [commitments, contracts, plans] = await Promise.all([fetchBrandMonthlyCommitments(), fetchBrandContracts(), fetchPlanStatuses(month)]);
        const out: Row[] = [];
        for (const ch of channels) {
          const plan = plans.get(brandPlatformKey(ch.brandId, ch.platform));
          const c = monthCommitmentOf(commitments, contracts, ch.brandId, ch.platform, monthStart);
          let planSlots: TimeFrame[] = [];
          if (plan && plan.status === "draft") {
            const r = await fetchMonthPlan(ch.brandId, month, ch.platform);
            planSlots = (r?.slots ?? []).map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime }));
          }
          const hasPattern = weekPattern(sessions, shiftSlots, ch.brandId, ch.platform, today).frames.length > 0;
          out.push({
            ...ch,
            key: `${ch.brandId}|${ch.platform}`,
            include: plan?.status !== "locked" && (c.source !== "none" || hasPattern || planSlots.length > 0),
            hours: c.source === "none" ? "" : String(c.hours || ""),
            contract: contractCovering(contracts, ch.brandId, ch.platform, monthStart),
            current: c.row,
            plan,
            planSlots,
            src: planSlots.length > 0 ? "plan" : "copy",
            paste: ""
          });
        }
        if (alive) setRows(out);
      } catch (e) {
        if (alive) setLoadErr(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [channels, month, monthStart, sessions, shiftSlots, today]);

  const patterns = useMemo(() => new Map(channels.map((c) => [`${c.brandId}|${c.platform}`, weekPattern(sessions, shiftSlots, c.brandId, c.platform, today)])), [channels, sessions, shiftSlots, today]);
  const hoursOf = (r: Row) => {
    const v = Number(r.hours.replace(",", "."));
    return r.hours.trim() === "" || !Number.isFinite(v) ? null : v;
  };
  const needOf = (r: Row) => {
    const h = hoursOf(r);
    return h && h > 0 ? hoursToSchedule(h, r.shrink) : 0;
  };
  const framesOf = (r: Row): { frames: TimeFrame[]; skipped: number } => {
    if (r.src === "plan") return { frames: r.planSlots, skipped: 0 };
    if (r.src === "paste") return parsePastedSchedule(r.paste, month);
    const p = patterns.get(r.key) ?? { frames: [] };
    const base = expandPattern(p, month);
    return { frames: fit ? fitToHours(base, needOf(r), p, month) : base, skipped: 0 };
  };
  const patch = (key: string, v: Partial<Row>) => setRows((prev) => prev && prev.map((r) => (r.key === key ? { ...r, ...v } : r)));
  const active = (rows ?? []).filter((r) => r.include && r.plan?.status !== "locked");
  const hourErr = active.find((r) => {
    const h = hoursOf(r);
    return r.hours.trim() !== "" && (h == null || h < 0 || h > 2000);
  });
  const summary = active.map((r) => ({ r, ...framesOf(r) }));
  const totalSlots = summary.reduce((a, x) => a + x.frames.length, 0);
  const totalH = summary.reduce((a, x) => a + totalHours(x.frames), 0);
  const deadlineIso = dlDate && dlTime ? new Date(`${dlDate}T${dlTime}:00`).toISOString() : null;
  const deadlineChanged = !!deadlineIso && (!deadline || new Date(deadline).getTime() !== new Date(deadlineIso).getTime());

  const run = async () => {
    if (!rows || !deadlineIso) return;
    setRunning(true);
    const res: RunState[] = [];
    const toLock: { key: string; planId: string }[] = [];
    for (const { r, frames } of summary) {
      try {
        const h = hoursOf(r);
        const curHours = r.current?.committedHours ?? (r.contract ? r.contract.monthlyHours : null);
        if (h != null && h !== curHours) {
          await upsertMonthlyCommitment({
            brandId: r.brandId,
            periodMonth: monthStart,
            platform: r.platform,
            committedHours: h,
            committedGmv: r.current?.committedGmv ?? r.contract?.monthlyGmv,
            contractId: r.contract?.id,
            isOverride: !r.contract || h !== r.contract.monthlyHours
          });
        }
        if (frames.length === 0) {
          res.push({ key: r.key, ok: false, text: "không có ca nào để mở — bỏ qua" });
          continue;
        }
        let planId = r.plan?.id;
        if (r.src !== "plan" || !planId) {
          const perDay = new Map<string, number>();
          for (const f of frames) perDay.set(f.date, (perDay.get(f.date) ?? 0) + 1);
          const overnight = frames.some((f) => f.endTime <= f.startTime);
          const base: PlanSettings = r.plan
            ? { defaultSlotHours: r.plan.defaultSlotHours, liveWindowStart: r.plan.liveWindowStart, liveWindowEnd: r.plan.liveWindowEnd, maxSlotsPerDay: r.plan.maxSlotsPerDay, notes: r.plan.notes, blackoutDates: r.plan.blackoutDates, targetGmv: r.plan.targetGmv, campRanges: r.plan.campRanges, groupTargets: r.plan.groupTargets, shopTargetGmv: r.plan.shopTargetGmv, adsBudget: r.plan.adsBudget }
            : DEFAULT_SETTINGS;
          const ends = frames.filter((f) => f.endTime > f.startTime).map((f) => f.endTime);
          const plan = await upsertMonthPlan(
            r.brandId,
            month,
            {
              ...base,
              maxSlotsPerDay: Math.min(8, Math.max(base.maxSlotsPerDay, ...perDay.values())),
              liveWindowStart: [base.liveWindowStart, ...frames.map((f) => f.startTime)].sort()[0],
              liveWindowEnd: [base.liveWindowEnd, ...ends, ...(overnight ? ["23:59"] : [])].sort().at(-1) ?? base.liveWindowEnd
            },
            r.platform
          );
          planId = plan.id;
          await replacePlanSlots(planId, frames.map((f) => ({ date: f.date, startTime: f.startTime, endTime: f.endTime, targetGmv: 0, note: "" })));
        }
        toLock.push({ key: r.key, planId });
      } catch (e) {
        res.push({ key: r.key, ok: false, text: errorMessage(e) });
      }
      setResults([...res]);
    }
    // Chốt tất cả trong MỘT transaction (0181): không dội 1 tin/kênh. Đặt hạn ngay sau ⇒ tin hạn đăng ký là tin duy nhất.
    const lockText = (lr: LockPlanResult | undefined) => (lr ? `${lr.created} ca mở chờ đăng ký${lr.linked ? `, gắn ${lr.linked} ca có sẵn` : ""}` : "đã chốt");
    if (toLock.length > 0) {
      try {
        const out = await lockMonthPlans(toLock.map((x) => x.planId), !deadlineChanged);
        for (const x of toLock) res.push({ key: x.key, ok: true, text: lockText(out.plans[x.planId]) });
      } catch (e) {
        if (!isRosterBackendMissing(e)) {
          for (const x of toLock) res.push({ key: x.key, ok: false, text: `chưa chốt: ${errorMessage(e)}` });
        } else {
          // DB chưa chạy 0181: chốt từng kênh (mỗi kênh một tin cho mỗi talent, như Kế Hoạch Tháng).
          for (const x of toLock) {
            try {
              res.push({ key: x.key, ok: true, text: `${lockText(await lockMonthPlan(x.planId))} (DB chưa có 0181: talent nhận 1 tin/kênh)` });
            } catch (e2) {
              res.push({ key: x.key, ok: false, text: `chưa chốt: ${errorMessage(e2)}` });
            }
          }
        }
      }
      setResults([...res]);
    }
    try {
      if (deadlineChanged) {
        const d = await setRosterMonthDeadline(month, deadlineIso);
        res.push({ key: "deadline", ok: true, text: `Hạn đăng ký ${dlTime} ${ddmm(dlDate)} — đã báo ${d.notified} host/trợ` });
      }
    } catch (e) {
      res.push({ key: "deadline", ok: false, text: `Chưa đặt được hạn: ${errorMessage(e)}` });
    }
    setResults([...res]);
    await onDone();
    setRunning(false);
  };

  const m = Number(month.slice(5));
  const stepper = ["Giờ cam kết", "Khung giờ", "Hạn đăng ký"].map((t, i) => (
    <span key={t} className={`text-xs px-2.5 py-1 rounded-full border ${i + 1 === step ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)] font-bold" : i + 1 < step ? "border-emerald-500/40 text-emerald-400" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
      {i + 1 < step ? "✓ " : `${i + 1} · `}
      {t}
    </span>
  ));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Mở lịch tháng ${m}`}>
      <div className="w-full max-w-4xl max-h-full flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="px-4 sm:px-5 py-3 border-b border-[var(--border)] space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black text-[var(--text)]">Mở lịch tháng {m}</h2>
            <button type="button" onClick={onClose} disabled={running} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Đóng">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">{stepper}</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
          {loadErr && <p className="text-sm text-rose-400">Không tải được cam kết / kế hoạch: {loadErr}</p>}
          {!rows && !loadErr && <p className="text-sm text-[var(--text-muted)]">Đang tải cam kết và kế hoạch tháng {m}…</p>}

          {rows && step === 1 && (
            <>
              <p className="text-xs text-[var(--text-muted)]">Giờ live cam kết với brand trong tháng {m}. Mặc định lấy từ hợp đồng ở CRM; gõ số khác là cam kết riêng của tháng. Target GMV vẫn đặt ở Kế Hoạch Tháng.</p>
              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-[var(--text-muted)] text-left border-b border-[var(--border)] whitespace-nowrap">
                      <th className="px-3 py-2 font-medium">Mở</th>
                      <th className="px-3 py-2 font-medium">Kênh</th>
                      <th className="px-3 py-2 font-medium text-right">Hợp đồng</th>
                      <th className="px-3 py-2 font-medium text-right">Tháng {m === 1 ? 12 : m - 1}</th>
                      <th className="px-3 py-2 font-medium text-right">Giờ tháng {m}</th>
                      <th className="px-3 py-2 font-medium text-right">Hao hụt</th>
                      <th className="px-3 py-2 font-medium text-right">Cần mở</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const locked = r.plan?.status === "locked";
                      const need = needOf(r);
                      return (
                        <tr key={r.key} className="border-b border-[var(--border)]/60">
                          <td className="px-3 py-2">
                            <input type="checkbox" aria-label={`Mở lịch ${r.brandName} ${r.platform}`} disabled={locked} checked={r.include && !locked} onChange={(e) => patch(r.key, { include: e.target.checked })} />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="flex items-center gap-2 font-bold text-[var(--text)]">
                              {r.brandName} <PlatformChip platform={r.platform} />
                            </span>
                            {locked && <span className="text-[11px] text-emerald-400">đã chốt kế hoạch — sửa ở Kế Hoạch Tháng</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.contract ? `${vn(r.contract.monthlyHours)} giờ` : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.prevHours > 0 ? `${vn(r.prevHours)} giờ` : "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <input id={`hr-${r.key}`} inputMode="decimal" disabled={locked || !r.include} value={r.hours} placeholder="không cam kết" onChange={(e) => patch(r.key, { hours: e.target.value })} className={`${FIELD} w-28 text-right tabular-nums`} />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{(r.shrink * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {need > 0 ? (
                              <>
                                <b className="text-[var(--text)]">{vn(Math.ceil(need))}</b> <span className="text-[11px] text-[var(--text-faint)]">(+{vn(Math.ceil(need - (hoursOf(r) ?? 0)))} phòng hờ)</span>
                              </>
                            ) : (
                              <span className="text-[var(--text-faint)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hourErr && <p className="text-xs text-rose-400">Giờ {hourErr.brandName} {hourErr.platform} không hợp lệ (0–2.000 giờ; số lớn hơn thường là tiền gõ nhầm ô).</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev && prev.map((r) => (r.hours.trim() === "" && r.contract ? { ...r, hours: String(r.contract.monthlyHours) } : r)))}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Điền ô trống theo hợp đồng
                </button>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev && prev.map((r) => (r.hours.trim() === "" && r.prevHours > 0 ? { ...r, hours: String(r.prevHours) } : r)))}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Điền ô trống như tháng {m === 1 ? 12 : m - 1}
                </button>
              </div>
            </>
          )}

          {rows && step === 2 && (
            <>
              <p className="text-xs text-[var(--text-muted)]">
                Mỗi kênh chọn nguồn khung giờ. "Chép tuần mẫu" lấy mọi ca của tuần gần nhất đông ca nhất rồi trải theo thứ ra cả tháng; "Dán từ Sheet" dán mỗi dòng "ngày/tháng giờ-giờ". Chỉ chép giờ, không chép người — người do talent đăng ký + Tự lấp.
              </p>
              <label className="flex items-center gap-2 text-xs text-[var(--text)]">
                <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} /> Khớp vừa giờ cần mở (bỏ bớt ở ngày đông ca / thêm khung hay dùng vào ngày ít ca)
              </label>
              <div className="space-y-2">
                {active.map((r) => {
                  const p = patterns.get(r.key);
                  const { frames, skipped } = framesOf(r);
                  const h = totalHours(frames), need = needOf(r);
                  const ok = !need || Math.abs(h - need) < 3.01 || h >= need;
                  return (
                    <div key={r.key} className="rounded-xl border border-[var(--border)] px-3 py-2.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-bold text-[var(--text)] text-sm">
                          {r.brandName} <PlatformChip platform={r.platform} />
                        </span>
                        <span className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-0.5 text-xs font-bold" role="group" aria-label={`Nguồn khung giờ ${r.brandName} ${r.platform}`}>
                          {r.planSlots.length > 0 && (
                            <button type="button" aria-pressed={r.src === "plan"} onClick={() => patch(r.key, { src: "plan" })} className={`px-2.5 py-1 rounded-lg ${r.src === "plan" ? "seg-on" : "text-[var(--text-muted)]"}`}>
                              Lưới Kế Hoạch Tháng ({r.planSlots.length} ca)
                            </button>
                          )}
                          <button type="button" aria-pressed={r.src === "copy"} onClick={() => patch(r.key, { src: "copy" })} className={`px-2.5 py-1 rounded-lg ${r.src === "copy" ? "seg-on" : "text-[var(--text-muted)]"}`}>
                            {p?.weekStart ? `Chép tuần ${ddmm(p.weekStart)}` : "Khung mặc định"}
                          </button>
                          <button type="button" aria-pressed={r.src === "paste"} onClick={() => patch(r.key, { src: "paste" })} className={`px-2.5 py-1 rounded-lg ${r.src === "paste" ? "seg-on" : "text-[var(--text-muted)]"}`}>
                            Dán từ Sheet
                          </button>
                        </span>
                      </div>
                      {r.src === "paste" && (
                        <textarea
                          aria-label={`Lịch dán từ Sheet ${r.brandName} ${r.platform}`}
                          value={r.paste}
                          onChange={(e) => patch(r.key, { paste: e.target.value })}
                          placeholder={`02/${String(m).padStart(2, "0")} 19:00-22:00\n03/${String(m).padStart(2, "0")} 10:00-13:00`}
                          rows={4}
                          className={`${FIELD} w-full font-mono text-xs`}
                        />
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                        <span className="relative h-2 w-32 rounded-full bg-[var(--surface-base)] overflow-hidden">
                          <i className={`absolute inset-y-0 left-0 ${ok ? "bg-[var(--success)]" : "bg-[var(--warning)]"}`} style={{ width: `${need ? Math.min(100, (h / need) * 100) : h ? 100 : 0}%` }} />
                        </span>
                        <span className="text-[var(--text)]">
                          {frames.length} ca · {vn(h)}
                          {need ? ` / ${vn(Math.ceil(need))}` : ""} giờ
                        </span>
                        {need > 0 && h + 0.5 < need && <span className="text-amber-300 font-bold">thiếu ~{vn(need - h)} giờ</span>}
                        {r.src === "plan" && <span className="text-[var(--text-faint)]">giữ nguyên lưới + target CEO đã lập</span>}
                        {skipped > 0 && <span className="text-[var(--text-faint)]">bỏ qua {skipped} dòng không đọc được hoặc khác tháng</span>}
                      </div>
                    </div>
                  );
                })}
                {active.length === 0 && <p className="text-sm text-[var(--text-muted)]">Không có kênh nào cần mở thêm (đã chốt hoặc chưa chọn ở bước 1). Bước tiếp chỉ đặt hạn đăng ký.</p>}
              </div>
            </>
          )}

          {rows && step === 3 && (
            <>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2">
                  <p className="text-lg font-black tabular-nums text-[var(--text)]">{vn(totalSlots)}</p>
                  <p className="text-xs text-[var(--text-muted)]">ca mở sẽ tạo</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2">
                  <p className="text-lg font-black tabular-nums text-[var(--text)]">{vn(totalH)} giờ</p>
                  <p className="text-xs text-[var(--text-muted)]">tổng giờ</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2">
                  <p className="text-lg font-black tabular-nums text-[var(--text)]">{active.length} kênh</p>
                  <p className="text-xs text-[var(--text-muted)]">chốt kế hoạch</p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3 text-xs">
                <label className="flex flex-col gap-1 text-[var(--text-muted)]">
                  Hạn đăng ký (một hạn cho cả tháng)
                  <input type="date" value={dlDate} min={today} max={addDays(monthStart, 27)} onChange={(e) => setDlDate(e.target.value)} className={FIELD} />
                </label>
                <label className="flex flex-col gap-1 text-[var(--text-muted)]">
                  Giờ
                  <input type="time" value={dlTime} onChange={(e) => setDlTime(e.target.value)} className={FIELD} />
                </label>
              </div>
              <ul className="text-xs text-[var(--text-muted)] space-y-1 list-disc pl-4">
                <li>Mỗi kênh: lưu giờ cam kết, lưu lưới ca vào Kế Hoạch Tháng rồi chốt — ca mở hiện ở app talent (Đăng ký ca).</li>
                <li>Đặt hạn xong mỗi host/trợ nhận một tin. Qua hạn talent không đăng ký thêm được; bạn vẫn xếp hộ.</li>
                <li>Target GMV: CEO/admin vào Kế Hoạch Tháng đặt target rồi bấm "Chia lại target" (ca mới có target 0 tới lúc đó).</li>
              </ul>
              {results && (
                <ul className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)] text-sm">
                  {results.map((x) => {
                    const r = rows.find((y) => y.key === x.key);
                    return (
                      <li key={x.key} className="px-3 py-2 flex flex-wrap gap-x-2">
                        <span className={x.ok ? "text-emerald-400" : "text-rose-400"}>{x.ok ? "✓" : "✗"}</span>
                        <b className="text-[var(--text)]">{r ? `${r.brandName} ${r.platform}` : "Hạn đăng ký"}</b>
                        <span className="text-[var(--text-muted)]">{x.text}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
          {step > 1 && !results ? (
            <button type="button" disabled={running} onClick={() => setStep(step - 1)} className="text-xs font-bold px-3 py-2 rounded-xl border border-[var(--border)] text-[var(--text)]">
              Quay lại
            </button>
          ) : (
            <span />
          )}
          {step < 3 && (
            <button type="button" disabled={!rows || !!hourErr} onClick={() => setStep(step + 1)} className="text-xs font-black px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-40">
              {step === 1 ? "Tiếp: khung giờ" : "Tiếp: hạn đăng ký"}
            </button>
          )}
          {step === 3 &&
            (results && !running ? (
              <button type="button" onClick={onClose} className="text-xs font-black px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)]">
                Xong
              </button>
            ) : (
              <button type="button" disabled={running || !deadlineIso || (totalSlots === 0 && !deadlineChanged)} onClick={() => void run()} className="text-xs font-black px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-40">
                {running ? "Đang tạo…" : totalSlots > 0 ? `Tạo ${vn(totalSlots)} ca mở + báo talent` : "Đặt hạn đăng ký + báo talent"}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
};
