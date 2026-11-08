import { platformText } from "../lib/metricGlossary";
import React, { useMemo, useState } from "react";
import { SystemUser, Talent, LiveSession, SessionFinance, TalentRateHistoryEntry } from "../types";
import { Settings, ShieldAlert, ChevronRight, Clock, Wallet, Clapperboard, TrendingUp } from "lucide-react";
import { computeTalentRealTotals } from "../lib/metrics/avgGmv";
import { computeTalentMonthlyIncome } from "../lib/pnl";
import { todayVn } from "../lib/performance/brandCommitment";

import { fmtDateVn, fmtFixed, fmtVndShort, fmtVndFull } from "../lib/format";
import { MonthPicker } from "./common/MonthPicker";
import { talentRoleLabel } from "../lib/talentName";
import { getTodayDate } from "../lib/dateUtils";
import { monthSummary, myRole } from "../lib/talent/myShifts";
import { myChannelStanding, STANDING_DAYS } from "../lib/talent/standing";
import { splitStanding, standingSentence } from "../lib/talent/agenda";
import { reliabilityText } from "../lib/report/deepAnalysis";
import { sessionMinutes } from "../lib/staffSegments";
import { PlatformChip } from "./common/PlatformChip";

// Tab "Tôi" của app talent (bản 2, 16/10). Người làm live vào đây để hỏi "tháng này tôi làm bao nhiêu giờ, được bao nhiêu" ⇒ giờ
// + thu nhập đứng đầu, rồi bảng công từng ca, rồi hiệu suất. Bản 1 dài 3.120px ở 375px; khối hiệu suất in khoảng tin cậy
// ("+16% (−16% … +48%)") cho mọi kênh — đo 16/10: 96/105 dòng là "trong dao động", 27/36 người không có dòng nào kết luận ⇒ chỉ
// hiện dòng có kết luận, nói bằng chữ. Thông tin cá nhân / email / mật khẩu thu vào cuối, gập sẵn.
// Thu nhập = rate × giờ (không có hoa hồng theo GMV — user chốt 06/10), cùng công thức Finance & P&L.

interface MyTalentProfileProps {
  activeUser: SystemUser;
  talents: Talent[];
  sessions: LiveSession[];
  /** Mảng cho Thu Nhập Tháng — cùng mảng Finance & P&L đọc (gồm ca đã loại khỏi báo cáo, vẫn tính công). */
  payrollSessions: LiveSession[];
  financeRecords: SessionFinance[];
  talentRateHistory: TalentRateHistoryEntry[];
  // KHÔNG dùng chung handleUpdateTalent của App: handler đó tự nuốt lỗi bằng window.alert rồi
  // trả void, nên try/catch dưới đây thành code chết và form luôn báo "Đã cập nhật" kể cả khi DB
  // không ghi được gì (bug C3). Handler riêng này bắt buộc phải để lỗi nổi lên.
  /** Mở màn Cài đặt (lịch điện thoại, thông tin cá nhân, mật khẩu, email). */
  onOpenSettings: () => void;
}

const money = (n: number) => Math.round(n).toLocaleString("vi-VN");
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dayLabel = (d: string) => `${WEEKDAY[new Date(`${d}T00:00:00`).getDay()]} ${fmtDateVn(d, false)}`;
const h1 = (h: number) => `${fmtFixed(h, h % 1 ? 1 : 0)}h`;

const CARD = "bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3";
const SECTION_TITLE = "text-sm font-black text-[var(--text)]";
const Tile: React.FC<{ icon: React.ReactNode; label: string; tone?: "accent" | "default"; children: React.ReactNode; sub?: React.ReactNode }> = ({ icon, label, tone = "default", children, sub }) => (
  <div className={`rounded-2xl border p-3.5 min-w-0 ${tone === "accent" ? "border-amber-500/30 bg-amber-950/30" : "border-[var(--border)] bg-[var(--surface)]"}`}>
    <div className="flex items-center gap-1.5 text-2xs font-bold text-[var(--text-muted)]">{icon}{label}</div>
    <div className="mt-1.5 text-xl font-black text-[var(--text)] tabular-nums leading-tight">{children}</div>
    {sub && <div className="mt-1 text-2xs text-[var(--text-faint)] leading-snug">{sub}</div>}
  </div>
);
const SETTING_ROW = "cursor-pointer list-none flex items-center justify-between gap-2 px-4 py-3 min-h-11 text-sm font-bold text-[var(--text)]";

// Ô trống phải nói VÌ SAO trống, không in số 0. Số 0 ở màn hồ sơ của chính mình đọc như "lương của bạn bằng 0" — ops CHƯA NHẬP
// rate ở 33/33 talent (30/09).
const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="font-normal text-[var(--text-faint)]">{children}</span>;

export const MyTalentProfile: React.FC<MyTalentProfileProps> = ({
  activeUser,
  talents,
  sessions,
  payrollSessions,
  financeRecords,
  talentRateHistory,
  onOpenSettings
}) => {
  const myTalent = talents.find((t) => t.id === activeUser.assignedTalentId);

  const [incomeMonth, setIncomeMonth] = useState(() => todayVn().slice(0, 7));

  const financeBySessionId = useMemo(() => {
    const map: Record<string, SessionFinance> = {};
    for (const f of financeRecords) map[f.sessionId] = f;
    return map;
  }, [financeRecords]);

  const talentById = useMemo(() => {
    const map: Record<string, Talent> = {};
    for (const t of talents) map[t.id] = t;
    return map;
  }, [talents]);

  // rateHidden = rate của mình bị mask — tính thu nhập lúc này sẽ ra số SAI (rate đã bị zero-hoá), nên bỏ tính hẳn.
  const income = useMemo(() => {
    if (!myTalent || myTalent.rateHidden) return { rows: [], total: 0, missingRate: false };
    return computeTalentMonthlyIncome(payrollSessions, myTalent.id, incomeMonth, financeBySessionId, talentById, talentRateHistory);
  }, [payrollSessions, myTalent, incomeMonth, financeBySessionId, talentById, talentRateHistory]);
  const incomeBySession = useMemo(() => {
    const m = new Map<string, { hours: number; payout: number }>();
    for (const r of income.rows) {
      const cur = m.get(r.session.id) ?? { hours: 0, payout: 0 };
      m.set(r.session.id, { hours: cur.hours + r.billableHours, payout: cur.payout + r.payout });
    }
    return m;
  }, [income]);

  // id rỗng ⇒ trả về toàn 0, gọi được cả khi chưa gắn hồ sơ talent (tránh nhánh null trong JSX).
  const myReal = useMemo(() => computeTalentRealTotals(sessions, myTalent?.id ?? ""), [sessions, myTalent]);
  // Ca đã chạy đọc `payrollSessions` (gồm ca loại khỏi báo cáo — vẫn là giờ đã làm); hiệu suất đọc `sessions` (activeSessions).
  const month = useMemo(() => (myTalent ? monthSummary(payrollSessions, myTalent.id, incomeMonth) : null), [payrollSessions, myTalent, incomeMonth]);
  const monthDone = useMemo(
    () =>
      myTalent
        ? payrollSessions
            .filter((s) => s.date.startsWith(incomeMonth) && s.status === "Completed" && myRole(s, myTalent.id))
            .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
        : [],
    [payrollSessions, myTalent, incomeMonth]
  );
  const standing = useMemo(() => splitStanding(myChannelStanding(sessions, myTalent?.id, getTodayDate())), [sessions, myTalent]);

  if (!activeUser.assignedTalentId || !myTalent) {
    return (
      <div className="max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-[var(--text-muted)]">
          Tài khoản của bạn chưa được gán hồ sơ Talent (assigned_talent_id) — liên hệ CEO/Admin để gán trước khi dùng trang này.
        </div>
      </div>
    );
  }

  const doneHours = month ? month.done.hostHours + month.done.coHours : 0;
  const leftHours = month?.upcoming.hours ?? 0;
  const noRate = (myTalent.ratePerHour || 0) === 0 && (myTalent.ratePerSession || 0) === 0;
  const rateText = myTalent.rateHidden ? (
    <Empty>chưa xem được</Empty>
  ) : (myTalent.ratePerHour || 0) > 0 ? (
    `${fmtVndFull(myTalent.ratePerHour || 0)}/giờ`
  ) : (myTalent.ratePerSession || 0) > 0 ? (
    `${fmtVndFull(myTalent.ratePerSession || 0)}/live`
  ) : (
    <Empty>ops chưa nhập</Empty>
  );

  const initials = myTalent.name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const progress = doneHours + leftHours > 0 ? (doneHours / (doneHours + leftHours)) * 100 : 0;
  const tableHours = monthDone.reduce((a, s) => a + (incomeBySession.get(s.id)?.hours ?? sessionMinutes(s) / 60), 0);
  const incomeValue = myTalent.rateHidden ? (
    <span className="text-sm text-[var(--text-muted)]">chưa xem được</span>
  ) : income.rows.length === 0 ? (
    <span className="text-sm"><Empty>chưa có ca tính lương</Empty></span>
  ) : income.missingRate && income.total === 0 ? (
    <span className="text-sm"><Empty>ops chưa nhập rate</Empty></span>
  ) : (
    money(income.total)
  );
  const note = myTalent.rateHidden
    ? "Tài khoản của bạn chưa được liên kết đúng hồ sơ Talent nên chưa xem được Rate Card — báo Admin gán lại giúp."
    : noRate
      ? "Rate của bạn ops chưa nhập nên chưa tính được lương — nhờ ops nhập ở Talent Pool."
      : income.missingRate
        ? "Có ca trong tháng chưa được đặt rate, nên số thu nhập đang thiếu phần của những ca đó."
        : income.rows.length === 0 && monthDone.length > 0
          ? "Ca nạp bù từ file của tháng cũ không vào bảng lương ở đây — lương những tháng đó đã chốt ngoài app."
          : null;
  const standingLine =
    standing.clear.length + standing.unclear.length === 0
      ? "Chưa có số liệu"
      : standing.clear.length === 0
        ? `${standing.unclear.length} kênh · chưa đủ số để so`
        : `${standing.clear.filter((r) => r.verdict === "above").length} kênh trên · ${standing.clear.filter((r) => r.verdict === "below").length} dưới TB`;

  return (
    <div className="space-y-4 max-w-2xl lg:max-w-6xl">
      {/* 1. Danh tính + chọn tháng */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3 min-w-0">
          {myTalent.avatar ? (
            <img src={myTalent.avatar} alt="" className="w-11 h-11 rounded-full object-cover border border-[var(--border)]" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[var(--accent)]/15 text-[var(--accent-text)] font-black flex items-center justify-center text-sm">{initials}</div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[var(--text)] leading-tight truncate">{myTalent.name}</h2>
            <p className="text-xs text-[var(--text-muted)]">{talentRoleLabel(myTalent.role)} · rate {rateText}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker value={incomeMonth} onChange={setIncomeMonth} size="sm" />
          <button type="button" onClick={onOpenSettings} aria-label="Cài đặt" title="Cài đặt" className="min-h-9 px-3 flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]">
            <Settings className="w-4 h-4" /> Cài đặt
          </button>
        </div>
      </header>

      {/* Tháng này: 4 con số trả lời "tháng này tôi thế nào" trong một hàng */}
      {month && (
        <section aria-label="Tổng quan tháng" className="space-y-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Tile tone="accent" icon={<Wallet className="w-3.5 h-3.5" />} label="Thu nhập tạm tính">{incomeValue}</Tile>
            <Tile icon={<Clock className="w-3.5 h-3.5" />} label="Giờ đã làm" sub={month.upcoming.count > 0 ? `còn ${h1(leftHours)} · ${month.upcoming.count} ca đã chốt` : "không còn ca đã chốt"}>
              {h1(doneHours)}
            </Tile>
            <Tile icon={<Clapperboard className="w-3.5 h-3.5" />} label="Ca đã live" sub={month.done.count > 0 ? `${h1(month.done.hostHours)} host · ${h1(month.done.coHours)} trợ` : undefined}>
              {month.done.count > 0 ? `${month.done.count} ca` : <span className="text-sm"><Empty>chưa có</Empty></span>}
            </Tile>
            <Tile icon={<TrendingUp className="w-3.5 h-3.5" />} label="So với nhóm" sub={`${STANDING_DAYS} ngày gần nhất · chi tiết bên dưới`}>
              <span className="text-sm font-bold leading-snug block">{standingLine}</span>
            </Tile>
          </div>
          {doneHours + leftHours > 0 && (
            <div className="px-1">
              <div className="h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden" aria-hidden>
                <span className="block h-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-2xs text-[var(--text-faint)]">Tiến độ giờ công tháng: {h1(doneHours)} / {h1(doneHours + leftHours)} đã chốt</p>
            </div>
          )}
          {note && <p className="text-2xs text-[var(--text-faint)] px-1">{note}</p>}
        </section>
      )}

      {/* Bảng công (trái, rộng) + Hiệu suất / từ trước tới nay (phải) */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-4 lg:items-start">
        <section className={`${CARD} min-w-0`} aria-label="Bảng công tháng">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={SECTION_TITLE}>Bảng công{monthDone.length > 0 ? ` · ${monthDone.length} ca` : ""}</h3>
            <span className="text-2xs text-[var(--text-faint)]">thấy sai giờ thì báo OP</span>
          </div>
          {monthDone.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] py-6 text-center">Tháng này chưa có ca nào đã live.</p>
          ) : (
            <>
              <div className="hidden sm:grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_3.5rem_5.5rem] gap-2 px-1 text-2xs font-bold text-[var(--text-faint)] border-b border-[var(--border)] pb-1.5">
                <span>Ngày</span><span>Brand · sàn</span><span>Vai</span><span className="text-right">Giờ</span><span className="text-right">Thành tiền</span>
              </div>
              <div className="max-h-[28rem] lg:max-h-[60vh] overflow-y-auto -mx-1">
                {monthDone.map((s) => {
                  const pay = incomeBySession.get(s.id);
                  const asHost = myRole(s, myTalent.id) === "host";
                  return (
                    <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_3.5rem_5.5rem] items-center gap-x-2 gap-y-0.5 text-xs px-1 py-2 border-b border-[var(--border-muted)] last:border-0">
                      <div className="min-w-0 sm:contents">
                        <p className="text-[var(--text-muted)] tabular-nums sm:order-1">
                          {dayLabel(s.date)} <span className="text-[var(--text-faint)] sm:hidden">· {s.startTime}–{s.endTime}</span>
                        </p>
                        <p className="font-bold text-[var(--text)] flex flex-wrap items-center gap-1.5 sm:order-2 min-w-0">
                          {s.brandName} <PlatformChip platform={s.platform} />
                          <span className="hidden sm:inline text-2xs font-normal text-[var(--text-faint)]">{s.startTime}–{s.endTime}</span>
                        </p>
                        <p className="text-2xs text-[var(--text-faint)] sm:text-xs sm:text-[var(--text-muted)] sm:order-3">
                          {asHost ? "Host" : "Trợ live"}
                          {/* GMV chỉ ở ca mình làm HOST — GMV của ca tính cho host (cùng luật assistSessionCount ở Talent Pool). */}
                          {asHost && s.actualGmv > 0 ? ` · ${platformText("GMV", "all")} ${fmtVndShort(s.actualGmv)}` : ""}
                        </p>
                      </div>
                      <p className="font-mono font-bold text-[var(--text)] text-right sm:order-4">{h1(pay?.hours ?? sessionMinutes(s) / 60)}</p>
                      <p className="hidden sm:block font-mono text-right text-[var(--text-muted)] sm:order-5">{pay && pay.payout > 0 ? money(pay.payout) : ""}</p>
                      {pay && pay.payout > 0 && <p className="sm:hidden col-span-2 text-right text-2xs text-[var(--text-muted)]">{money(pay.payout)}</p>}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 px-1 text-xs font-black text-[var(--text)]">
                <span>Tổng tháng</span>
                <span className="font-mono">{h1(tableHours)}{!myTalent.rateHidden && income.total > 0 ? ` · ${money(income.total)}` : ""}</span>
              </div>
            </>
          )}
          <p className="text-2xs text-[var(--text-faint)]">Số tạm tính theo rate hiện tại — có thể đổi khi ca chưa đối soát xong hoặc rate vừa được cập nhật.</p>
        </section>

        <div className="space-y-4 min-w-0">
          {/* Hiệu suất: chỉ dòng có kết luận, nói bằng chữ */}
          <section className={CARD} aria-label="Hiệu suất so trung bình nhóm">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className={SECTION_TITLE}>Bạn so với trung bình nhóm</h3>
              <span className="text-2xs text-[var(--text-faint)]">{STANDING_DAYS} ngày gần nhất</span>
            </div>
            {standing.clear.length + standing.unclear.length === 0 ? (
              <p className="text-xs text-[var(--text-faint)]">Chưa có ca nào có số liệu trong {STANDING_DAYS} ngày gần nhất.</p>
            ) : (
              <>
                {standing.clear.map((r) => (
                  <p key={`${r.brandId}|${r.platform}|${r.role}`} className="text-xs text-[var(--text)]">
                    <b className="inline-flex items-center gap-1">{r.brandName} <PlatformChip platform={r.platform} /></b>, vai {r.role === "host" ? "Host" : "Trợ live"} ({r.sessions} ca):{" "}
                    <b className={r.verdict === "above" ? "text-emerald-400" : "text-rose-400"}>{platformText("GMV", "all")} {standingSentence(r)}</b>
                  </p>
                ))}
                {standing.unclear.length > 0 && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {standing.clear.length > 0 ? `${standing.unclear.length} kênh khác` : `Cả ${standing.unclear.length} kênh bạn đã live`} chưa đủ số để nói bạn cao hay thấp hơn trung bình nhóm.
                  </p>
                )}
                <details className="text-2xs text-[var(--text-faint)]">
                  <summary className="cursor-pointer font-bold min-h-6 flex items-center">Cách tính · xem từng kênh</summary>
                  <p className="mt-1">
                    {platformText("GMV", "all")} thực của ca bạn ÷ {platformText("GMV", "all")} nếu đạt bằng trung bình cả nhóm cùng kênh, cùng tháng, cùng loại ngày (lịch Campaign cố định) và buổi.
                    Chỉ kết luận cao/thấp khi khoảng tin cậy 95% nằm hẳn một phía.
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {[...standing.clear, ...standing.unclear].map((r) => (
                      <li key={`${r.brandId}|${r.platform}|${r.role}`} className="flex flex-wrap gap-x-2">
                        <span className="text-[var(--text-muted)]">{r.brandName} {r.platform} · {r.role === "host" ? "Host" : "Trợ"} · {r.sessions} ca</span>
                        <span className="font-mono">{reliabilityText(r)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </section>

          <details className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
            <summary className={SETTING_ROW}>
              Từ trước tới nay <ChevronRight className="w-4 h-4 text-[var(--text-faint)]" />
            </summary>
            <div className="grid grid-cols-3 gap-2 text-xs px-4 pb-4">
              <div>
                <div className="text-[var(--text-muted)]">Ca đã live</div>
                <div className="font-bold text-[var(--text)]">
                  {myReal.sessionCount + myReal.assistSessionCount > 0 ? `${myReal.sessionCount + myReal.assistSessionCount} ca` : <Empty>chưa có ca nào</Empty>}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-muted)]">Giờ live</div>
                <div className="font-bold text-[var(--text)]">{myReal.hours + myReal.assistHours > 0 ? `${fmtFixed(myReal.hours + myReal.assistHours, 1)}h` : <Empty>chưa có</Empty>}</div>
              </div>
              <div>
                {/* GMV lũy kế cộng từ live_sessions, tách theo sàn (không bao giờ cộng TikTok với Shopee — user chốt 07/10). */}
                <div className="text-[var(--text-muted)]">{platformText("GMV", "all")} khi làm host</div>
                <div className="font-bold text-emerald-400">
                  {myReal.perf.TikTok.gmv > 0 || myReal.perf.Shopee.gmv > 0 ? (
                    (["TikTok", "Shopee"] as const)
                      .filter((p) => myReal.perf[p].gmv > 0)
                      .map((p) => (
                        <span key={p} className="block">
                          {fmtVndShort(myReal.perf[p].gmv)} <span className="text-2xs font-normal text-[var(--text-faint)]">{p}</span>
                        </span>
                      ))
                  ) : (
                    <Empty>chưa có</Empty>
                  )}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};
