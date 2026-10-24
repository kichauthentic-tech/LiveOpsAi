import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Talent, TalentRateHistoryEntry } from "../../types";
import { PlatformChip } from "../common/PlatformChip";
import { fmtFixed, fmtVndShort } from "../../lib/format";
import { talentShortName } from "../../lib/talentName";
import { addDays } from "../../lib/dateUtils";
import { ISSUE_SEVERITY, shiftHours, worstSeverity, type IssueCode, type RosterAnalysis, type RosterRole, type RosterRules, type RosterShift } from "../../lib/roster/rules";
import { famOf, plannedCost, rankCandidates, shiftCost, type CostMove, type FamiliarityMap, type RankContext } from "../../lib/roster/candidates";
import { dayLabel } from "./ShiftPanel";
import type { RosterChange } from "../../lib/db/roster";
import type { LiveSession } from "../../types";

// Các tab con của Điều Phối Lịch Live. Chỉ vẽ + gọi callback; ghi DB ở RosterBoard.

export interface ChannelRow {
  key: string;
  brandId: string;
  brandName: string;
  platform: "TikTok" | "Shopee";
}

const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace(".", ",");
const CARD_BORDER: Record<string, string> = {
  block: "border-l-red-500 bg-red-500/10",
  hole: "border-l-red-500 bg-red-500/10",
  warn: "border-l-amber-500 bg-amber-500/10",
  ok: "border-l-emerald-500"
};

// ---------------- Lưới tuần ----------------
export const WeekGrid: React.FC<{
  weekStart: string;
  channels: ChannelRow[];
  shifts: RosterShift[];
  analysis: RosterAnalysis;
  nameOf: (id: string) => string;
  selectedKey: string | null;
  canAdd: boolean;
  onSelect: (key: string) => void;
  onAdd: (channel: ChannelRow, date: string) => void;
  /** Bản gọn 25/10: giờ tháng + một kết luận dưới tên kênh (thay chế độ "Tháng này"). */
  channelMeta?: (channel: ChannelRow) => React.ReactNode;
}> = ({ weekStart, channels, shifts, analysis, nameOf, selectedKey, canAdd, onSelect, onAdd, channelMeta }) => {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <div className="grid min-w-[1060px]" style={{ gridTemplateColumns: `${channelMeta ? 168 : 140}px repeat(7, minmax(126px, 1fr))` }}>
          <div className="sticky left-0 z-10 bg-[var(--surface-elevated)] px-2 py-2 text-xs font-bold text-[var(--text-muted)] border-b border-r border-[var(--border)]">Kênh</div>
          {days.map((d) => (
            <div key={d} className="bg-[var(--surface-elevated)] px-2 py-2 text-xs font-bold text-[var(--text)] border-b border-r border-[var(--border)]">
              {dayLabel(d)}
            </div>
          ))}
          {channels.map((ch) => (
            <React.Fragment key={ch.key}>
              <div className="sticky left-0 z-10 bg-[var(--surface-elevated)] px-2 py-2 border-b border-r border-[var(--border)] text-xs">
                <p className="font-black text-[var(--text)]">{ch.brandName}</p>
                <PlatformChip platform={ch.platform} />
                {channelMeta?.(ch)}
              </div>
              {days.map((d) => {
                const list = shifts.filter((s) => s.channelKey === ch.key && s.date === d);
                return (
                  <div key={d} className="p-1.5 border-b border-r border-[var(--border)] space-y-1.5 min-w-0">
                    {list.map((s) => {
                      const sev = worstSeverity(analysis.byShift.get(s.key)) ?? "ok";
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => onSelect(s.key)}
                          // Bố cục 19/10: thẻ ca chỉ còn vạch màu bên trái (đỏ/vàng/xanh) + nền nhạt — trước mỗi thẻ thêm viền đủ 4 cạnh
                          // trong ô lưới cũng có viền (~90 hộp lồng một tuần). Ca mở vẫn viền đứt để khác ca đã có người.
                          className={`block w-full text-left rounded-md border-l-[3px] px-1.5 py-1 text-[11px] leading-snug hover:bg-[var(--surface-hover)] ${sev === "ok" ? "bg-[var(--surface-elevated)]/50" : ""} ${CARD_BORDER[sev]} ${selectedKey === s.key ? "ring-2 ring-[var(--accent)]" : ""} ${s.kind === "open" ? "border border-dashed border-[var(--border)]" : ""}`}
                        >
                          <span className="font-mono font-bold text-[var(--text)]">
                            {s.startTime}–{s.endTime}
                          </span>
                          {s.kind === "open" && <span className="ml-1 text-[11px] font-bold text-sky-300">{s.drafted ? "nháp" : "mở"}</span>}
                          <span className="block truncate text-[var(--text)]">{s.hostId ? nameOf(s.hostId) : <span className="text-red-300 font-bold">thiếu host</span>}</span>
                          <span className="block truncate text-[var(--text-muted)]">{s.coHostId ? nameOf(s.coHostId) : <span className="text-amber-300">thiếu trợ</span>}</span>
                          {s.kind === "open" && s.registrants.length > 0 && <span className="block text-[11px] text-emerald-300">{s.registrants.length} báo rảnh</span>}
                        </button>
                      );
                    })}
                    {canAdd && (
                      <button type="button" onClick={() => onAdd(ch, d)} className="w-full min-h-6 flex items-center justify-center gap-1 rounded-md py-1 text-[11px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]/60" aria-label={`Thêm ca ${ch.brandName} ${dayLabel(d)}`}>
                        <Plus className="w-3 h-3" /> ca
                      </button>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
        <span>Viền đỏ = lỗi chặn công bố hoặc ca thiếu host</span>
        <span>Viền vàng = cảnh báo</span>
        <span>Viền đứt = ca mở (nháp / chưa xếp), talent chưa thấy người</span>
      </p>
    </div>
  );
};

// ---------------- Kiểm lịch ----------------
const RULE_ORDER: [IssueCode, string][] = [
  ["clash", "Trùng người (một người hai ca cùng lúc)"],
  ["week_over", "Quá giờ tối đa/tuần"],
  ["draft_no_host", "Nháp có trợ nhưng chưa có host"],
  ["no_host", "Ca chưa có host"],
  ["no_co", "Ca chưa có trợ live"],
  ["rest", "Nghỉ ít sau ca khuya"],
  ["room", "Nối ca sát giờ nhưng phải đổi phòng"],
  ["day", "Quá giờ trong một ngày"],
  ["streak", "Làm nhiều ngày liền"],
  ["week_warn", "Gần chạm giờ tối đa/tuần"],
  ["new_channel", "Host chưa quen kênh (0 ca trong 90 ngày)"]
];

export const ChecksPanel: React.FC<{ analysis: RosterAnalysis; shifts: RosterShift[]; onSelect: (key: string) => void }> = ({ analysis, shifts, onSelect }) => {
  const byKey = new Map(shifts.map((s) => [s.key, s]));
  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-muted)]">Chạy lại sau mỗi lần đổi người. Lỗi đỏ chặn "Công bố tuần"; ca thiếu host không chặn (ca vẫn mở sau công bố); mục vàng là cảnh báo, trainer tự quyết. Luật nghỉ / ngày liền tính cả tuần trước.</p>
      {RULE_ORDER.map(([code, label]) => {
        const items = analysis.issues.filter((i) => i.code === code);
        // Màu theo mục thật sự có (trùng người giữa hai ca đã lên lịch chỉ là cảnh báo), không theo mức mặc định của luật.
        const sev = items.length > 0 ? worstSeverity(items) ?? ISSUE_SEVERITY[code] : ISSUE_SEVERITY[code];
        return (
          <details key={code} open={items.length > 0 && sev === "block"} className="rounded-xl border border-[var(--border)]">
            <summary className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer text-sm">
              <span className="text-[var(--text)] font-bold">{label}</span>
              <span className={`font-mono font-black ${items.length === 0 ? "text-emerald-400" : sev === "warn" ? "text-amber-400" : "text-red-400"}`}>{items.length}</span>
            </summary>
            {items.length > 0 && (
              <ul className="px-3 pb-3 space-y-1 text-xs">
                {items.slice(0, 60).map((i, idx) => {
                  const s = byKey.get(i.shiftKey);
                  return (
                    <li key={idx}>
                      <button type="button" onClick={() => onSelect(i.shiftKey)} className="underline underline-offset-2 text-[var(--accent-text)]">
                        {s ? `${s.brandName} ${s.platform} · ${dayLabel(s.date)} ${s.startTime}–${s.endTime}` : "ca"}
                      </button>{" "}
                      <span className="text-[var(--text-muted)]">— {i.text}</span>
                    </li>
                  );
                })}
                {items.length > 60 && <li className="text-[var(--text-muted)]">… và {items.length - 60} mục nữa</li>}
              </ul>
            )}
          </details>
        );
      })}
    </div>
  );
};

// ---------------- Báo nghỉ ----------------
export const AbsencePanel: React.FC<{
  weekStart: string;
  shifts: RosterShift[];
  analysis: RosterAnalysis;
  ctx: RankContext;
  talents: readonly Talent[];
  showCost: boolean;
  readOnly: boolean;
  busy: boolean;
  onAssign: (shift: RosterShift, role: RosterRole, talentId: string | undefined, reason?: string) => void;
}> = ({ weekStart, shifts, analysis, ctx, talents, showCost, readOnly, busy, onAssign }) => {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const people = useMemo(() => {
    const ids = new Set<string>();
    for (const s of shifts) if (s.date >= weekStart && s.date <= days[6]) [s.hostId, s.coHostId].forEach((x) => x && ids.add(x));
    return talents.filter((t) => ids.has(t.id)).sort((a, b) => talentShortName(a).localeCompare(talentShortName(b), "vi"));
  }, [shifts, talents, weekStart, days]);
  const [who, setWho] = useState("");
  const [day, setDay] = useState(days[0]);
  const person = who || people[0]?.id || "";
  const mine = shifts.filter((s) => s.date === day && (s.hostId === person || s.coHostId === person));
  const nm = (id: string) => talentShortName(talents.find((t) => t.id === id));
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">Một người báo không đi được một ngày: các ca của họ hiện ra, mỗi vai kèm 3 người thay hợp nhất (rảnh giờ đó, quen kênh, giờ tuần còn thấp, không phạm luật nghỉ). Ca đã lên lịch thì đổi người có ghi lý do "Báo nghỉ" và DB báo cho người mới + người bị rút.</p>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1">
          Người báo nghỉ
          <select value={person} onChange={(e) => setWho(e.target.value)} className="px-2 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)] min-w-40">
            {people.map((t) => (
              <option key={t.id} value={t.id}>
                {talentShortName(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Ngày
          <select value={day} onChange={(e) => setDay(e.target.value)} className="px-2 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)]">
            {days.map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {mine.length === 0 && <p className="text-sm text-[var(--text-muted)]">{person ? `${nm(person)} không có ca ngày này.` : "Tuần này chưa có ai được xếp."}</p>}
      {mine.map((s) => {
        const role: RosterRole = s.hostId === person ? "host" : "co_host";
        // Bỏ người báo nghỉ khỏi ca để xếp hạng như ca trống (người đó không được gợi ý lại).
        const freed: RosterShift = { ...s, [role === "host" ? "hostId" : "coHostId"]: undefined };
        const list = rankCandidates(freed, role, ctx, analysis)
          .filter((c) => !c.blocked && c.talentId !== person)
          .slice(0, 3);
        const locked = readOnly || s.segmented;
        return (
          <div key={s.key} className="rounded-xl border border-[var(--border)] p-3 space-y-2">
            <p className="text-sm font-bold text-[var(--text)]">
              {s.brandName} <PlatformChip platform={s.platform} /> <span className="font-mono">{s.startTime}–{s.endTime}</span> · thiếu {role === "host" ? "host" : "trợ live"}
              {s.kind === "open" && <span className="text-xs text-sky-300"> (nháp)</span>}
            </p>
            {s.segmented && <p className="text-xs text-[var(--text-muted)]">Ca đã chia đoạn người — đổi ở Cửa sổ Ca Live.</p>}
            {!locked &&
              list.map((c) => (
                <div key={c.talentId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text)]">
                    <b>{nm(c.talentId)}</b> · {c.famHost} ca host / {c.famCo} ca trợ ở kênh · {fmtH(c.weekHours)}h tuần
                    {showCost && !c.cost.missing && ` · ca ${fmtVndShort(c.cost.amount)}`}
                    {c.issues.length > 0 && <span className="text-amber-300"> · {c.issues.join(", ")}</span>}
                  </span>
                  <button type="button" disabled={busy} onClick={() => onAssign(s, role, c.talentId, `Báo nghỉ: ${nm(person)}`)} className="shrink-0 px-3 py-1 rounded-lg border border-[var(--border)] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40">
                    Xếp
                  </button>
                </div>
              ))}
            {!locked && list.length === 0 && <p className="text-xs text-red-300">Không còn ai rảnh và đủ điều kiện.</p>}
          </div>
        );
      })}
    </div>
  );
};

// ---------------- Ma trận kênh ----------------
export const MatrixPanel: React.FC<{ channels: ChannelRow[]; fam: FamiliarityMap; talents: readonly Talent[] }> = ({ channels, fam, talents }) => {
  const people = talents
    .map((t) => ({ t, total: channels.reduce((s, ch) => s + famOf(fam, t.id, ch.key).host + famOf(fam, t.id, ch.key).co, 0) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
  const bench = channels.map((ch) => talents.filter((t) => famOf(fam, t.id, ch.key).host >= 3).length);
  const suggestions = channels
    .map((ch, i) => {
      if (bench[i] >= 4) return null;
      const sister = channels.find((x) => x.brandId === ch.brandId && x.key !== ch.key);
      const pool = talents
        .filter((t) => famOf(fam, t.id, ch.key).host < 3 && (t.role === "Host" || [...(fam.get(t.id)?.values() ?? [])].some((f) => f.host > 0)))
        .map((t) => ({ t, sis: sister ? famOf(fam, t.id, sister.key).host + famOf(fam, t.id, sister.key).co : 0, own: famOf(fam, t.id, ch.key).host * 2 + famOf(fam, t.id, ch.key).co }))
        .filter((x) => x.sis + x.own > 0)
        .sort((a, b) => b.sis + b.own - (a.sis + a.own))
        .slice(0, 3);
      return { ch, n: bench[i], sister, pool };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.pool.length > 0);
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">Số ca 90 ngày (trước tuần đang xem) của từng người ở từng kênh, dạng "host / trợ". Dòng cuối: số host đã đứng ≥ 3 ca. Kênh dưới 3 là kênh mỏng: một người nghỉ là thiếu.</p>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--surface-elevated)] text-[var(--text-muted)]">
              <th className="text-left px-2 py-2 sticky left-0 bg-[var(--surface-elevated)]">Người</th>
              {channels.map((ch) => (
                <th key={ch.key} className="px-2 py-2 text-center whitespace-nowrap">
                  {ch.brandName} {ch.platform}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map(({ t }) => (
              <tr key={t.id} className="border-t border-[var(--border)]">
                <td className="px-2 py-1.5 sticky left-0 bg-[var(--surface)] text-[var(--text)] whitespace-nowrap">
                  {talentShortName(t)} <span className="text-[var(--text-muted)]">{t.role === "Assistant" ? "trợ" : "host"}</span>
                </td>
                {channels.map((ch) => {
                  const f = famOf(fam, t.id, ch.key);
                  const n = f.host + f.co;
                  return (
                    <td key={ch.key} className="px-2 py-1.5 text-center font-mono" style={n > 0 ? { background: `color-mix(in srgb, var(--accent) ${Math.min(60, 8 + n * 2)}%, transparent)` } : undefined}>
                      {n > 0 ? `${f.host} / ${f.co}` : <span className="text-[var(--text-muted)]">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t border-[var(--border)] bg-[var(--surface-elevated)] font-bold">
              <td className="px-2 py-2 sticky left-0 bg-[var(--surface-elevated)] text-[var(--text)]">Host ≥ 3 ca</td>
              {bench.map((n, i) => (
                <td key={channels[i].key} className={`px-2 py-2 text-center ${n < 3 ? "text-red-400" : "text-emerald-400"}`}>
                  {n}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {suggestions.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-black text-[var(--text)]">Gợi ý đào tạo chéo</h4>
          <ul className="text-xs text-[var(--text)] space-y-1 list-disc pl-5">
            {suggestions.map(({ ch, n, sister, pool }) => (
              <li key={ch.key}>
                <b>
                  {ch.brandName} {ch.platform}
                </b>{" "}
                chỉ có {n} host chính. Có thể kèm:{" "}
                {pool
                  .map(({ t, sis }) => `${talentShortName(t)} (${sister && sis > 0 ? `${sis} ca ở ${sister.brandName} ${sister.platform}, ` : ""}${famOf(fam, t.id, ch.key).host + famOf(fam, t.id, ch.key).co} ca ở kênh này)`)
                  .join(", ")}
                . Cho đi 2–3 ca trợ rồi 2 ca host có người kèm.
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-[var(--text-muted)]">Ưu tiên người đã quen cùng brand ở sàn còn lại (cùng sản phẩm, khác sàn) — mỗi người một kênh chính + một kênh phụ là đủ để kênh nào cũng có người thay.</p>
        </div>
      )}
    </div>
  );
};

// ---------------- Giờ & chi phí ----------------
export const HoursCostPanel: React.FC<{
  weekStart: string;
  channels: ChannelRow[];
  shifts: RosterShift[];
  analysis: RosterAnalysis;
  rules: RosterRules;
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  showCost: boolean;
  readOnly: boolean;
  busy: boolean;
  costLimit: number;
  onCostLimit: (n: number) => void;
  costPlan: { moves: CostMove[]; save: number } | null;
  onFindCost: () => void;
  onApplyCost: () => void;
  onDropCost: () => void;
  nameOf: (id: string) => string;
}> = ({ weekStart, channels, shifts, analysis, rules, talents, history, showCost, readOnly, busy, costLimit, onCostLimit, costPlan, onFindCost, onApplyCost, onDropCost, nameOf }) => {
  const weekEnd = addDays(weekStart, 6);
  const wk = shifts.filter((s) => s.date >= weekStart && s.date <= weekEnd);
  const rows = [...analysis.weekHours.entries()]
    .map(([tid, h]) => {
      const es = (analysis.entries.get(tid) ?? []).filter((e) => e.shift.date >= weekStart && e.shift.date <= weekEnd);
      const pay = es.reduce((sum, e) => {
        const c = plannedCost(talents.find((t) => t.id === tid), history, e.role, e.shift.date, e.minutes / 60);
        return sum + (c.missing ? 0 : c.amount);
      }, 0);
      const missing = es.some((e) => plannedCost(talents.find((t) => t.id === tid), history, e.role, e.shift.date, e.minutes / 60).missing);
      const late = es.filter((e) => {
        const [lh, lm] = rules.lateEndTime.split(":").map(Number);
        return e.shift.endTime <= e.shift.startTime || e.shift.endTime >= `${String(lh).padStart(2, "0")}:${String(lm).padStart(2, "0")}`;
      }).length;
      return { tid, h, n: es.length, days: new Set(es.map((e) => e.shift.date)).size, late, pay, missing };
    })
    .sort((a, b) => b.h - a.h);
  const max = Math.max(rules.maxWeekHours + 4, ...rows.map((r) => r.h));
  const totalCost = wk.reduce((s, x) => s + shiftCost(x, talents, history).amount, 0);
  const openDrafts = wk.filter((s) => s.kind === "open" && s.drafted).length;
  return (
    <div className="space-y-5">
      {showCost && (
        <section className="rounded-xl border border-[var(--border)] p-3 space-y-2">
          <h4 className="text-sm font-black text-[var(--text)]">Giảm chi phí trên nháp tuần này</h4>
          <p className="text-xs text-[var(--text-muted)]">
            Thử đổi người ở {openDrafts} ca nháp sang người rẻ hơn ít nhất 15% trong nhóm đủ điều kiện: rảnh giờ đó, đã đứng kênh ≥ 3 ca, không phạm luật, tuần ≤ 36 giờ sau khi xếp, mỗi người nhận thêm tối đa 9 giờ. Ưu tiên lần đổi gỡ được lỗi lịch. Ca đã công bố không tự đổi (đổi phải có lý do). Đổi host không làm GMV đổi đo được (±5%, không lặp lại tháng sau) nên khoản tiết kiệm này không đổi bằng doanh thu.
          </p>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="flex flex-col gap-1">
              Tối đa số lần đổi
              <select value={costLimit} onChange={(e) => onCostLimit(Number(e.target.value))} className="px-2 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)]">
                {[5, 10, 20, 40].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={readOnly || busy || openDrafts === 0} onClick={onFindCost} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white font-bold disabled:opacity-40">
              Tìm cách giảm chi phí
            </button>
            {costPlan && (
              <>
                <button type="button" disabled={busy || costPlan.moves.length === 0} onClick={onApplyCost} className="px-3 py-1.5 rounded-lg border border-[var(--border)] font-bold text-[var(--text)] disabled:opacity-40">
                  Áp dụng {costPlan.moves.length} lần đổi vào nháp
                </button>
                <button type="button" onClick={onDropCost} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)]">
                  Bỏ
                </button>
              </>
            )}
          </div>
          {costPlan && costPlan.moves.length === 0 && <p className="text-xs text-[var(--text-muted)]">Không có lần đổi nào rẻ hơn ≥ 15% mà vẫn đủ điều kiện.</p>}
          {costPlan && costPlan.moves.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm text-[var(--text)]">
                Tiết kiệm <b className="text-emerald-400">{fmtVndShort(costPlan.save)}</b> tuần này ({totalCost > 0 ? `${fmtFixed((costPlan.save / totalCost) * 100, 1)}%` : "—"} chi phí người theo lịch).
              </p>
              <ul className="text-xs space-y-0.5">
                {costPlan.moves.map((m) => {
                  const s = wk.find((x) => x.key === m.shiftKey);
                  return (
                    <li key={`${m.shiftKey}|${m.role}`} className="text-[var(--text-muted)]">
                      {s ? `${s.brandName} ${dayLabel(s.date)} ${s.startTime}–${s.endTime}` : "ca"} · {m.role === "host" ? "Host" : "Trợ"}: {nameOf(m.from)} → <b className="text-[var(--text)]">{nameOf(m.to)}</b> · −{fmtVndShort(m.save)}
                      {m.fixes && <span className="text-emerald-300"> · gỡ cả cảnh báo</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}
      <section className="space-y-2">
        <h4 className="text-sm font-black text-[var(--text)]">Giờ từng người tuần này</h4>
        <p className="text-xs text-[var(--text-muted)]">Giờ theo lịch, cả vai host và trợ (ca đổi người giữa ca chỉ tính phần người đó đứng). Vạch đỏ = {rules.maxWeekHours} giờ (chặn công bố), vạch mờ = {rules.warnWeekHours} giờ.{showCost ? " Tiền công = rate × giờ theo lịch, chưa có OT/off sớm." : ""}</p>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--surface-elevated)] text-[var(--text-muted)]">
                <th className="text-left px-2 py-2">Người</th>
                <th className="text-left px-2 py-2 min-w-40">Giờ tuần</th>
                <th className="text-right px-2 py-2">Giờ</th>
                <th className="text-right px-2 py-2">Ca</th>
                <th className="text-right px-2 py-2">Ngày làm</th>
                <th className="text-right px-2 py-2">Ca khuya</th>
                {showCost && <th className="text-right px-2 py-2">Tiền công</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tid} className="border-t border-[var(--border)]">
                  <td className="px-2 py-1.5 text-[var(--text)] whitespace-nowrap">{nameOf(r.tid)}</td>
                  <td className="px-2 py-1.5">
                    <div className="relative h-3.5 rounded bg-[var(--surface-elevated)]">
                      <div className={`absolute inset-y-0 left-0 rounded ${r.h > rules.maxWeekHours ? "bg-red-500" : r.h > rules.warnWeekHours ? "bg-amber-500" : "bg-[var(--accent)]"}`} style={{ width: `${(r.h / max) * 100}%` }} />
                      <div className="absolute -inset-y-0.5 w-px bg-[var(--text-muted)] opacity-60" style={{ left: `${(rules.warnWeekHours / max) * 100}%` }} />
                      <div className="absolute -inset-y-0.5 w-0.5 bg-red-500" style={{ left: `${(rules.maxWeekHours / max) * 100}%` }} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[var(--text)]">{fmtH(r.h)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.n}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.days}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.late}</td>
                  {showCost && <td className="px-2 py-1.5 text-right font-mono">{r.pay > 0 ? fmtVndShort(r.pay) : "—"}{r.missing ? " *" : ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showCost && rows.some((r) => r.missing) && <p className="text-[11px] text-[var(--text-muted)]">* có ca chưa tính được vì người đó chưa có rate — nhập ở Talent Pool.</p>}
      </section>
      {showCost && (
        <section className="space-y-2">
          <h4 className="text-sm font-black text-[var(--text)]">Chi phí người theo kênh</h4>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--surface-elevated)] text-[var(--text-muted)]">
                  <th className="text-left px-2 py-2">Kênh</th>
                  <th className="text-right px-2 py-2">Ca</th>
                  <th className="text-right px-2 py-2">Giờ</th>
                  <th className="text-right px-2 py-2">Chi phí người</th>
                  <th className="text-right px-2 py-2">Mỗi giờ live</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => {
                  const list = wk.filter((s) => s.channelKey === ch.key);
                  if (list.length === 0) return null;
                  const c = list.reduce((s, x) => s + shiftCost(x, talents, history).amount, 0);
                  const h = list.reduce((s, x) => s + shiftHours(x), 0);
                  return (
                    <tr key={ch.key} className="border-t border-[var(--border)]">
                      <td className="px-2 py-1.5 text-[var(--text)]">
                        {ch.brandName} <PlatformChip platform={ch.platform} />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{list.length}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{fmtH(h)}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{c > 0 ? fmtVndShort(c) : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{c > 0 && h > 0 ? fmtVndShort(c / h) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

// ---------------- Luật ----------------
export const RulesPanel: React.FC<{ rules: RosterRules; readOnly: boolean; busy: boolean; onSave: (r: RosterRules) => void }> = ({ rules, readOnly, busy, onSave }) => {
  // RosterBoard gắn `key` theo ngưỡng đã lưu ⇒ lưu xong / nạp lại là form khởi tạo lại, không cần effect đồng bộ.
  const [draft, setDraft] = useState<RosterRules>(rules);
  const num = (k: keyof RosterRules, label: string, hint: string, step = 1) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-bold text-[var(--text)]">{label}</span>
      <input type="number" step={step} min={0} value={draft[k] as number} disabled={readOnly} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} className="px-2 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)] w-32" />
      <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>
    </label>
  );
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">Ngưỡng dùng chung cho cả agency. Giờ tối đa/tuần là luật CHẶN (không công bố, không đổi người được nếu vượt — Bộ luật Lao động 2019: giờ làm bình thường ≤ 48 giờ/tuần). Các ngưỡng còn lại chỉ cảnh báo.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {num("maxWeekHours", "Giờ tối đa / tuần (chặn)", "Quá ngưỡng thì không công bố được.", 0.5)}
        {num("warnWeekHours", "Giờ cảnh báo / tuần", "Vượt thì tô vàng.", 0.5)}
        {num("minRestHours", "Nghỉ tối thiểu sau ca khuya (giờ)", "Tan ca khuya rồi vào ca sớm hơn số giờ này thì cảnh báo.", 0.5)}
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-bold text-[var(--text)]">Ca khuya = kết thúc từ</span>
          <input type="time" value={draft.lateEndTime} disabled={readOnly} onChange={(e) => setDraft({ ...draft, lateEndTime: e.target.value })} className="px-2 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)] w-32" />
          <span className="text-[11px] text-[var(--text-muted)]">Ca qua nửa đêm luôn là ca khuya.</span>
        </label>
        {num("maxDayHours", "Giờ tối đa / ngày", "Vượt thì cảnh báo.", 0.5)}
        {num("maxStreakDays", "Số ngày làm liền tối đa", "Ngày thứ (ngưỡng + 1) liền thì cảnh báo.")}
        {num("minRoomChangeMinutes", "Phút tối thiểu khi đổi phòng", "Hai ca nối khác phòng mà nghỉ ít hơn thì cảnh báo.")}
      </div>
      <button type="button" disabled={readOnly || busy || JSON.stringify(draft) === JSON.stringify(rules)} onClick={() => onSave(draft)} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold disabled:opacity-40">
        Lưu ngưỡng
      </button>
    </div>
  );
};

// ---------------- Nhật ký đổi lịch sau công bố ----------------
export const ChangeLogPanel: React.FC<{ changes: RosterChange[] | null; sessions: readonly LiveSession[]; nameOf: (id: string) => string }> = ({ changes, sessions, nameOf }) => {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const who = (o: Record<string, unknown>, k: "host" | "co_host") => {
    const id = str(o[`${k}_id`]);
    return id ? nameOf(id) : str(o[`${k}_name`]) || "—";
  };
  return (
    <section className="space-y-2 border-t border-[var(--border)] pt-4">
      <h4 className="text-sm font-black text-[var(--text)]">Nhật ký đổi lịch (30 ngày)</h4>
      <p className="text-xs text-[var(--text-muted)]">Mỗi lần đổi người / dời giờ một ca đã lên lịch từ Điều Phối Lịch Live, kèm lý do. Đổi ở màn khác (Lịch & Studio, Cửa sổ Ca Live) không ghi vào đây.</p>
      {changes === null && <p className="text-xs text-[var(--text-muted)]">Đang tải…</p>}
      {changes && changes.length === 0 && <p className="text-xs text-[var(--text-muted)]">Chưa có lần đổi nào.</p>}
      {changes && changes.length > 0 && (
        <ul className="space-y-1 text-xs">
          {changes.map((c) => {
            const s = c.sessionId ? byId.get(c.sessionId) : undefined;
            const when = new Date(c.changedAt);
            return (
              <li key={c.id} className="text-[var(--text-muted)]">
                <span className="font-mono">{`${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")} ${when.getDate()}/${when.getMonth() + 1}`}</span> ·{" "}
                <span className="text-[var(--text)]">{s ? `${s.brandName} ${s.platform} ${dayLabel(s.date)} ${s.startTime}` : "ca đã xoá"}</span> ·{" "}
                {c.kind === "reassign"
                  ? `Host ${who(c.before, "host")} → ${who(c.after, "host")}, trợ ${who(c.before, "co_host")} → ${who(c.after, "co_host")}`
                  : `Dời ${dayLabel(str(c.before.date))} ${str(c.before.start_time).slice(0, 5)} → ${dayLabel(str(c.after.date))} ${str(c.after.start_time).slice(0, 5)}–${str(c.after.end_time).slice(0, 5)}`}{" "}
                · <i>{c.reason}</i>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
