import React, { useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import type { Brand, LiveSession, Talent, TalentRateHistoryEntry } from "../types";
import type { EngineParams } from "../lib/scheduling/engineParams";
import { buildComplianceReport, type RuleLine } from "../lib/roster/ruleCompliance";
import { useMonthRules } from "../hooks/useMonthRules";
import { plannerInputsFromRules } from "../lib/roster/monthRules";
import { DEFAULT_ROSTER_RULES } from "../lib/roster/rules";
import { fetchRosterRules } from "../lib/db/roster";
import { addDays } from "../lib/dateUtils";
import { todayVn } from "../lib/performance/brandCommitment";
import { talentShortName } from "../lib/talentName";
import { fmtFixed, fmtVndShort } from "../lib/format";
import { InfoDot } from "./common/InfoDot";

// AI Training Center — "Tuân thủ luật Tự fill": lịch THẬT của một tháng có theo các luật của chị Trainer không, và giờ thực tế so với giờ cam kết.
// Chỉ đọc. Đo trên ca thực tế (kể cả ca xếp tay), nên đây là thước đo cho cả quy trình chứ không riêng bộ xếp. Phép đo ở lib/roster/ruleCompliance.ts.

interface Props {
  sessions: readonly LiveSession[];
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  brands: readonly Brand[];
  params: EngineParams;
}

const lastMonths = (today: string, n: number) => {
  const out: string[] = [];
  let d = `${today.slice(0, 7)}-01`;
  for (let i = 0; i < n; i++) {
    out.push(d.slice(0, 7));
    d = addDays(d, -1).slice(0, 7) + "-01";
  }
  return out;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export const RuleComplianceCard: React.FC<Props> = ({ sessions, talents, history, brands, params }) => {
  const today = todayVn();
  const months = useMemo(() => lastMonths(today, 4), [today]);
  const [month, setMonth] = useState(months[1] ?? months[0]);
  const monthRules = useMonthRules(month);
  const [lateEnd, setLateEnd] = useState(DEFAULT_ROSTER_RULES.lateEndTime);
  useEffect(() => {
    let alive = true;
    fetchRosterRules()
      .then((r) => alive && setLateEnd(r.lateEndTime))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const brandNames = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const caps = useMemo(() => plannerInputsFromRules(monthRules.rules).personCaps, [monthRules.rules]);
  const report = useMemo(() => buildComplianceReport({ month, sessions, talents, history, brandNames, params, lateEnd, caps }), [month, sessions, talents, history, brandNames, params, lateEnd, caps]);
  const nameOf = (id: string) => talentShortName(talents.find((t) => t.id === id), id);
  const ended = `${month}-31` < today;

  const label: Record<RuleLine["id"], string> = {
    cast_tiktok_regular: `Cast ≤${fmtVndShort(params.rosterRegularCastCap)} · ca Daily TikTok`,
    cast_shopee: `Cast ≤${fmtVndShort(params.rosterShopeeCastCap)} · ca Shopee`,
    male_sport: "Trợ nam · Franklin, CROCS",
    male_night: "Trợ nam · ca đêm"
  };

  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-6" data-testid="rule-compliance">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 data-section="Tuân thủ luật" className="text-lg font-black text-[var(--text)] flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-[var(--accent-text)]" /> Tuân thủ luật Tự fill
          <InfoDot label="Cách đo">Đo trên lịch thực tế của tháng, gồm cả ca Trainer xếp tay. Giờ tính theo giờ ca; ca chưa có rate hoặc giới tính không vào mẫu số. Khung cao điểm và PFM tính từ dữ liệu trước tháng đó.</InfoDot>
        </h2>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Tháng đo" className="rounded-lg border border-[var(--border)] bg-[var(--surface-base)] px-2 py-1 text-xs font-bold text-[var(--text)]">
          {months.map((m) => (
            <option key={m} value={m}>
              {m.slice(5)}/{m.slice(0, 4)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          {report.lines.map((l) => {
            const p = pct(l.okHours, l.hours);
            return (
              <div key={l.id} className="text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--text)] font-bold">{label[l.id]}</span>
                  <span className="text-[var(--text-muted)]">
                    {p === null ? "chưa có ca" : <><b className="text-[var(--text)]">{p}%</b> của {fmtFixed(l.hours, 0)}h</>}
                    {l.unknownHours > 0 && <span className="text-[var(--text-faint)]"> · {fmtFixed(l.unknownHours, 0)}h không đo được</span>}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden" role="img" aria-label={`${label[l.id]}: ${p ?? 0}%`}>
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${p ?? 0}%` }} />
                </div>
              </div>
            );
          })}
          <div className="flex justify-between gap-2 text-xs pt-2 border-t border-[var(--border)]">
            <span className="text-[var(--text)] font-bold">PFM host · camp/cao điểm so với thường</span>
            <span className="text-[var(--text-muted)]">
              <b className="text-[var(--text)]">{report.perf.peak === null ? "—" : fmtFixed(report.perf.peak, 2)}</b> so với <b className="text-[var(--text)]">{report.perf.regular === null ? "—" : fmtFixed(report.perf.regular, 2)}</b>
            </span>
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <h3 className="text-sm font-bold text-[var(--text)] mb-2">
            Giờ cam kết so với thực tế
            <InfoDot label="Đọc bảng">Cam kết là trần giờ tháng ở Điều Phối. Nửa đầu = giờ ngày 1–15 so với trần nửa đầu. “Dồn nửa đầu” khi vượt trần nửa đầu; “thiếu” khi tháng đã hết mà dưới 80% cam kết.</InfoDot>
          </h3>
          {report.people.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Tháng này chưa đặt giờ cam kết cho ai.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="text-left font-bold py-1">Người</th>
                  <th className="text-right font-bold">Cam kết</th>
                  <th className="text-right font-bold">Thực tế</th>
                  <th className="text-right font-bold">Nửa đầu</th>
                  <th className="text-left font-bold pl-3">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {report.people.map((r) => {
                  const over = r.actual > r.cap + 1e-6;
                  const front = r.actualHalf > r.halfCap + 1e-6;
                  const short = ended && r.actual < r.cap * 0.8;
                  const tone = over || front ? "text-rose-300" : short ? "text-amber-300" : "text-emerald-400";
                  return (
                    <tr key={r.talentId} className="border-t border-[var(--border)]">
                      <td className="py-1 text-[var(--text)] font-bold">{nameOf(r.talentId)}</td>
                      <td className="text-right tabular-nums">{fmtFixed(r.cap, 0)}h</td>
                      <td className="text-right tabular-nums text-[var(--text)]">{fmtFixed(r.actual, 1)}h</td>
                      <td className="text-right tabular-nums">
                        {fmtFixed(r.actualHalf, 1)} / {fmtFixed(r.halfCap, 1)}h
                      </td>
                      <td className={`pl-3 font-bold ${tone}`}>{over ? "vượt cam kết" : front ? "dồn nửa đầu" : short ? "thiếu giờ" : "ổn"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
