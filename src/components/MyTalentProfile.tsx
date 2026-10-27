import React, { useMemo, useState } from "react";
import { SystemUser, Talent, LiveSession, SessionFinance, TalentRateHistoryEntry } from "../types";
import { useAuth } from "../hooks/useAuth";
import { Loader2, Lock, ShieldAlert, KeyRound, ChevronRight } from "lucide-react";
import { computeTalentRealTotals } from "../lib/metrics/avgGmv";
import { computeTalentMonthlyIncome } from "../lib/pnl";
import { todayVn } from "../lib/performance/brandCommitment";
import { errorMessage } from "../lib/errorMessage";

import { fmtDateVn, fmtFixed, fmtVndShort, fmtVndFull } from "../lib/format";
import { MonthPicker } from "./common/MonthPicker";
import { talentRoleLabel } from "../lib/talentName";
import { isAliasEmail, loginLabel } from "../lib/loginName";
import { getTodayDate } from "../lib/dateUtils";
import { monthSummary, myRole } from "../lib/talent/myShifts";
import { myChannelStanding, STANDING_DAYS } from "../lib/talent/standing";
import { splitStanding, standingSentence } from "../lib/talent/agenda";
import { reliabilityText } from "../lib/report/deepAnalysis";
import { sessionMinutes } from "../lib/staffSegments";
import { PlatformChip } from "./common/PlatformChip";
import { CalendarFeedCard } from "./talent/CalendarFeedCard";

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
  onSaveMyProfile: (patch: { phone: string; avatar: string; dateOfBirth?: string }) => Promise<void>;
  /** Mở "Tài Khoản Của Tôi" (đổi mật khẩu) — màn đó vào từ menu người dùng, app talent đặt thêm nút ở đây. */
  onOpenAccount?: () => void;
}

const money = (n: number) => Math.round(n).toLocaleString("vi-VN");
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dayLabel = (d: string) => `${WEEKDAY[new Date(`${d}T00:00:00`).getDay()]} ${fmtDateVn(d, false)}`;
const h1 = (h: number) => `${fmtFixed(h, h % 1 ? 1 : 0)}h`;

const CARD = "bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3";
const SECTION_TITLE = "text-sm font-black text-[var(--text)]";
const INPUT = "mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]";
const LABEL = "text-xs font-semibold text-[var(--text-muted)] flex items-center gap-1";
const SETTING_ROW = "cursor-pointer list-none flex items-center justify-between gap-2 px-4 py-3 min-h-11 text-sm font-bold text-[var(--text)]";

// Ô trống phải nói VÌ SAO trống, không in số 0. Số 0 ở màn hồ sơ của chính mình đọc như "lương của bạn bằng 0" — ops CHƯA NHẬP
// rate ở 33/33 talent (30/09).
const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="font-normal text-[var(--text-faint)]">{children}</span>;

const Msg: React.FC<{ m: { type: "ok" | "err"; text: string } | null }> = ({ m }) =>
  m ? (
    <div className={`text-xs rounded-lg px-3 py-2 border ${m.type === "ok" ? "text-emerald-300 bg-emerald-950/60 border-emerald-500/30" : "text-red-300 bg-red-950/60 border-red-500/30"}`}>{m.text}</div>
  ) : null;

export const MyTalentProfile: React.FC<MyTalentProfileProps> = ({
  activeUser,
  talents,
  sessions,
  payrollSessions,
  financeRecords,
  talentRateHistory,
  onSaveMyProfile,
  onOpenAccount
}) => {
  const { reauthenticate, updateEmail } = useAuth();
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

  const [phone, setPhone] = useState(myTalent?.phone ?? "");
  const [avatar, setAvatar] = useState(myTalent?.avatar ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(myTalent?.dateOfBirth ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [sendingEmailChange, setSendingEmailChange] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);
    setSavingProfile(true);
    try {
      await onSaveMyProfile({ phone, avatar, dateOfBirth: dateOfBirth || undefined });
      setProfileMessage({ type: "ok", text: "Đã cập nhật hồ sơ." });
    } catch (e) {
      setProfileMessage({ type: "err", text: errorMessage(e, "Không thể cập nhật hồ sơ.") });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMessage(null);
    if (!newEmail.trim()) return;
    setSendingEmailChange(true);
    try {
      const reauth = await reauthenticate(emailPassword);
      if (reauth.error) {
        setEmailMessage({ type: "err", text: "Mật khẩu hiện tại không đúng." });
        return;
      }
      const result = await updateEmail(newEmail.trim());
      if (result.error) {
        setEmailMessage({ type: "err", text: result.error });
        return;
      }
      setEmailMessage({ type: "ok", text: "Đã gửi email xác nhận tới địa chỉ mới — email đăng nhập chỉ đổi sau khi bạn xác nhận qua link trong email đó." });
      setNewEmail("");
      setEmailPassword("");
    } finally {
      setSendingEmailChange(false);
    }
  };

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

  return (
    <div className="space-y-3 max-w-2xl lg:max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-[var(--text)]">{myTalent.name}</h2>
          <p className="text-xs text-[var(--text-muted)]">{talentRoleLabel(myTalent.role)} · rate {rateText}</p>
        </div>
        <MonthPicker value={incomeMonth} onChange={setIncomeMonth} size="sm" />
      </div>

      {/* Laptop / PC (≥ 1024px): 2 cột — trái giờ, thu nhập, hiệu suất, cài đặt; phải bảng công cao hết cột. Thứ tự nguồn giữ
          đúng thứ tự đọc trên điện thoại (một cột). */}
      <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start lg:[grid-template-rows:auto_1fr]">
      <div className="space-y-3 min-w-0 lg:col-start-1 lg:row-start-1">
      {/* Tháng này: giờ + thu nhập (Hiệu suất & thông tin chỉ xem đứng trước mọi form) */}
      {month && (
        <section className={CARD} aria-label="Giờ và thu nhập tháng">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-[var(--text)]">
              <b className="font-mono text-xl">{doneHours > 0 ? h1(doneHours) : "0h"}</b> <span className="text-[var(--text-muted)]">đã làm</span>
            </p>
            <p className="text-xs text-[var(--text-muted)]">{month.upcoming.count > 0 ? `còn ${h1(leftHours)} · ${month.upcoming.count} ca đã chốt` : "không còn ca đã chốt"}</p>
          </div>
          {doneHours + leftHours > 0 && (
            <div className="h-2.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden flex" aria-hidden>
              <span className="h-full bg-[var(--accent)]" style={{ width: `${(doneHours / (doneHours + leftHours)) * 100}%` }} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-[var(--surface-base)]/40 border border-[var(--border)] p-3">
              <div className="text-[var(--text-muted)]">Ca đã live</div>
              <div className="font-bold text-[var(--text)] text-base">{month.done.count > 0 ? `${month.done.count} ca` : <Empty>chưa có</Empty>}</div>
              {month.done.count > 0 && <div className="text-[11px] text-[var(--text-faint)]">{h1(month.done.hostHours)} host · {h1(month.done.coHours)} trợ</div>}
            </div>
            {/* Thu nhập tháng — đúng công thức hostPayout/coHostPayout của Finance & P&L (computeTalentMonthlyIncome) */}
            <div className="rounded-xl bg-amber-950/30 border border-amber-500/30 p-3">
              <div className="text-amber-300/80">Thu nhập tạm tính</div>
              {myTalent.rateHidden ? (
                <div className="font-bold text-[var(--text-muted)]">chưa xem được</div>
              ) : income.rows.length === 0 ? (
                <div className="font-bold"><Empty>chưa có ca tính lương</Empty></div>
              ) : income.missingRate && income.total === 0 ? (
                <div className="font-bold"><Empty>ops chưa nhập rate</Empty></div>
              ) : (
                <div className="font-black text-base text-[var(--text)]">{money(income.total)}</div>
              )}
            </div>
          </div>
          {myTalent.rateHidden ? (
            <p className="text-[11px] text-[var(--text-faint)]">Tài khoản của bạn chưa được liên kết đúng hồ sơ Talent nên chưa xem được Rate Card — báo Admin gán lại giúp.</p>
          ) : noRate ? (
            <p className="text-[11px] text-[var(--text-faint)]">Rate của bạn ops chưa nhập nên chưa tính được lương — nhờ ops nhập ở Talent Pool.</p>
          ) : income.missingRate ? (
            <p className="text-[11px] text-rose-300">Có ca trong tháng chưa được đặt rate, nên số trên đang thiếu phần của những ca đó.</p>
          ) : income.rows.length === 0 && monthDone.length > 0 ? (
            <p className="text-[11px] text-[var(--text-faint)]">Ca nạp bù từ file của tháng cũ không vào bảng lương ở đây — lương những tháng đó đã chốt ngoài app.</p>
          ) : null}
        </section>
      )}

      </div>

      <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
      {/* Bảng công: từng ca đã chạy của tháng, giờ công + thành tiền */}
      {monthDone.length > 0 && (
        <section className={CARD} aria-label="Bảng công tháng">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={SECTION_TITLE}>Bảng công · {monthDone.length} ca</h3>
            <span className="text-[11px] text-[var(--text-faint)]">thấy sai giờ thì báo OP</span>
          </div>
          <div className="max-h-96 lg:max-h-[70vh] overflow-y-auto -mx-1">
            {monthDone.map((s) => {
              const pay = incomeBySession.get(s.id);
              const asHost = myRole(s, myTalent.id) === "host";
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs px-1 py-2 border-b border-[var(--border-muted)] last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[var(--text)] flex flex-wrap items-center gap-1.5">
                      {s.brandName} <PlatformChip platform={s.platform} />
                    </p>
                    <p className="text-[11px] text-[var(--text-faint)]">
                      {dayLabel(s.date)} · {s.startTime}–{s.endTime} · {asHost ? "Host" : "Trợ live"}
                      {/* GMV chỉ ở ca mình làm HOST — GMV của ca tính cho host (cùng luật assistSessionCount ở Talent Pool). */}
                      {asHost && s.actualGmv > 0 ? ` · GMV ${fmtVndShort(s.actualGmv)}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-[var(--text)]">{h1(pay?.hours ?? sessionMinutes(s) / 60)}</p>
                    {pay && pay.payout > 0 && <p className="text-[11px] text-[var(--text-muted)]">{money(pay.payout)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">Số tạm tính theo rate hiện tại — có thể đổi khi ca chưa đối soát xong hoặc rate vừa được cập nhật.</p>
        </section>
      )}

      </div>

      <div className="space-y-3 min-w-0 lg:col-start-1 lg:row-start-2">
      {/* Hiệu suất: chỉ dòng có kết luận, nói bằng chữ */}
      <section className={CARD} aria-label="Hiệu suất so trung bình nhóm">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={SECTION_TITLE}>Bạn so với trung bình nhóm</h3>
          <span className="text-[11px] text-[var(--text-faint)]">{STANDING_DAYS} ngày gần nhất</span>
        </div>
        {standing.clear.length + standing.unclear.length === 0 ? (
          <p className="text-xs text-[var(--text-faint)]">Chưa có ca nào có số liệu trong {STANDING_DAYS} ngày gần nhất.</p>
        ) : (
          <>
            {standing.clear.map((r) => (
              <p key={`${r.brandId}|${r.platform}|${r.role}`} className="text-xs text-[var(--text)]">
                <b className="inline-flex items-center gap-1">{r.brandName} <PlatformChip platform={r.platform} /></b>, vai {r.role === "host" ? "Host" : "Trợ live"} ({r.sessions} ca):{" "}
                <b className={r.verdict === "above" ? "text-emerald-400" : "text-rose-400"}>GMV {standingSentence(r)}</b>
              </p>
            ))}
            {standing.unclear.length > 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                {standing.clear.length > 0 ? `${standing.unclear.length} kênh khác` : `Cả ${standing.unclear.length} kênh bạn đã live`} chưa đủ số để nói bạn cao hay thấp hơn trung bình nhóm.
              </p>
            )}
            <details className="text-[11px] text-[var(--text-faint)]">
              <summary className="cursor-pointer font-bold min-h-6 flex items-center">Cách tính · xem từng kênh</summary>
              <p className="mt-1">
                GMV thực của ca bạn ÷ GMV nếu đạt bằng trung bình cả nhóm cùng kênh, cùng tháng, cùng loại ngày (lịch Campaign cố định) và buổi.
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

      <CalendarFeedCard />

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
            <div className="text-[var(--text-muted)]">GMV khi làm host</div>
            <div className="font-bold text-emerald-400">
              {myReal.perf.TikTok.gmv > 0 || myReal.perf.Shopee.gmv > 0 ? (
                (["TikTok", "Shopee"] as const)
                  .filter((p) => myReal.perf[p].gmv > 0)
                  .map((p) => (
                    <span key={p} className="block">
                      {fmtVndShort(myReal.perf[p].gmv)} <span className="text-[11px] font-normal text-[var(--text-faint)]">{p}</span>
                    </span>
                  ))
              ) : (
                <Empty>chưa có</Empty>
              )}
            </div>
          </div>
        </div>
      </details>

      {/* Thông tin tự sửa */}
      <details className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
        <summary className={SETTING_ROW}>
          Số điện thoại, ngày sinh, ảnh <ChevronRight className="w-4 h-4 text-[var(--text-faint)]" />
        </summary>
        <form onSubmit={handleSaveProfile} className="space-y-3 px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>Số điện thoại</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className={LABEL}>Ngày tháng năm sinh</span>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={INPUT} />
            </label>
          </div>
          <label className="block">
            <span className={LABEL}>URL ảnh đại diện</span>
            <input type="text" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://..." className={`${INPUT} font-mono`} />
          </label>
          <Msg m={profileMessage} />
          <button type="submit" disabled={savingProfile} className="px-4 py-2 min-h-9 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-2">
            {savingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Lưu thông tin
          </button>
        </form>
      </details>

      {onOpenAccount && (
        <button type="button" onClick={onOpenAccount} className={`w-full ${SETTING_ROW} bg-[var(--surface)] border border-[var(--border)] rounded-2xl hover:border-[var(--accent)]`}>
          <span className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-[var(--accent-text)]" /> Đổi mật khẩu</span>
          <ChevronRight className="w-4 h-4 text-[var(--text-faint)]" />
        </button>
      )}

      {/* Đổi email đăng nhập */}
      <details className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
        <summary className={SETTING_ROW}>
          Email đăng nhập <ChevronRight className="w-4 h-4 text-[var(--text-faint)]" />
        </summary>
        <div className="px-4 pb-4 space-y-3">
          {isAliasEmail(activeUser.email) ? (
            // Tài khoản đăng nhập bằng tên (lib/loginName.ts): Supabase đòi xác nhận ở địa chỉ cũ — địa chỉ nội bộ không nhận thư
            // được ⇒ quản lý thêm email ở Phân Quyền & Role (đổi bằng service_role, không cần xác nhận).
            <p className="text-xs text-[var(--text-faint)]">
              Bạn đang đăng nhập bằng tên <span className="font-mono font-bold text-[var(--text-muted)]">{loginLabel(activeUser.email)}</span>, chưa có email.
              Gửi email của bạn cho quản lý để họ thêm vào tài khoản.
            </p>
          ) : (
            <>
              <p className="text-xs text-[var(--text-faint)]">Email hiện tại: <span className="text-[var(--text-muted)] font-semibold">{activeUser.email}</span></p>
              <form onSubmit={handleChangeEmail} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className={LABEL}>Email mới</span>
                    <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={INPUT} />
                  </label>
                  <label className="block">
                    <span className={LABEL}><Lock className="w-3 h-3" /> Mật khẩu hiện tại</span>
                    <input type="password" required value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} className={INPUT} />
                  </label>
                </div>
                <Msg m={emailMessage} />
                <button type="submit" disabled={sendingEmailChange} className="px-4 py-2 min-h-9 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-2">
                  {sendingEmailChange && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Gửi yêu cầu đổi email
                </button>
              </form>
            </>
          )}
        </div>
      </details>
      </div>
      </div>
    </div>
  );
};
