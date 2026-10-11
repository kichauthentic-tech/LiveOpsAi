import React, { useMemo, useState } from "react";
import { SystemUser, Talent, LiveSession, SessionFinance, TalentRateHistoryEntry } from "../types";
import { useAuth } from "../hooks/useAuth";
import { User, Phone, Cake, Mail, Loader2, Lock, ShieldAlert, Award, Wallet, CalendarDays, TrendingUp, KeyRound } from "lucide-react";
import { computeTalentRealTotals } from "../lib/metrics/avgGmv";
import { computeTalentMonthlyIncome } from "../lib/pnl";
import { todayVn } from "../lib/performance/brandCommitment";
import { errorMessage } from "../lib/errorMessage";

import { fmtDateVn, fmtFixed, fmtVndShort, fmtVndFull } from "../lib/format";
import { MonthPicker } from "./common/MonthPicker";
import { PageHeader } from "./common/PageHeader";
import { talentRoleLabel } from "../lib/talentName";
import { isAliasEmail, loginLabel } from "../lib/loginName";
import { getTodayDate } from "../lib/dateUtils";
import { monthSummary, myRole } from "../lib/talent/myShifts";
import { myChannelStanding, STANDING_DAYS } from "../lib/talent/standing";
import { isBorderline, reliabilityText } from "../lib/report/deepAnalysis";
import { PlatformChip } from "./common/PlatformChip";
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
const ROLE_LABEL: Record<"host" | "co_host", string> = { host: "Host", co_host: "Trợ live" };

const TILE = "bg-[var(--surface-base)]/40 border border-[var(--border)] rounded-xl p-3";

// Ô trống phải nói VÌ SAO trống, không in số 0. Số 0 ở màn hồ sơ của chính mình đọc như
// "GMV của bạn bằng 0" / "lương của bạn bằng 0" — file này đã áp luật đó cho `rateHidden` từ
// audit 2026-09-21, nhưng chưa áp cho trường hợp ops CHƯA NHẬP (rate/CVR = 0 ở 33/33 talent).
const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-normal text-[var(--text-faint)]">{children}</span>
);

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

  // rateHidden = rate của mình bị mask (xem khối Rate Card bên dưới) — tính thu nhập lúc này sẽ
  // ra số SAI (dùng rate đã bị zero-hoá) chứ không phải số đúng nhưng thiếu, nên bỏ tính hẳn.
  const income = useMemo(() => {
    if (!myTalent || myTalent.rateHidden) return { rows: [], total: 0, missingRate: false };
    return computeTalentMonthlyIncome(payrollSessions, myTalent.id, incomeMonth, financeBySessionId, talentById, talentRateHistory);
  }, [payrollSessions, myTalent, incomeMonth, financeBySessionId, talentById, talentRateHistory]);

  // id rỗng ⇒ trả về toàn 0, gọi được cả khi chưa gắn hồ sơ talent (tránh nhánh null trong JSX).
  const myReal = useMemo(() => computeTalentRealTotals(sessions, myTalent?.id ?? ""), [sessions, myTalent]);
  // App talent T1 (11/10): số của tháng đang chọn (cùng tháng với Thu Nhập) + hiệu suất so mặt bằng cùng kênh (user chốt
  // phương án C: chỉ số của mình, không tên người khác). Ca đã chạy đọc `payrollSessions` (gồm ca loại khỏi báo cáo — vẫn là
  // giờ đã làm); hiệu suất đọc `sessions` (activeSessions) như mọi màn phân tích.
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
  const standing = useMemo(() => myChannelStanding(sessions, myTalent?.id, getTodayDate()), [sessions, myTalent]);

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
      setEmailMessage({
        type: "ok",
        text: "Đã gửi email xác nhận tới địa chỉ mới — email đăng nhập chỉ đổi sau khi bạn xác nhận qua link trong email đó."
      });
      setNewEmail("");
      setEmailPassword("");
    } finally {
      setSendingEmailChange(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        icon={User}
        title="Hồ Sơ Của Tôi"
        description="Giờ đã làm, thu nhập tạm tính, hiệu suất của bạn và thông tin cá nhân."
        actions={<MonthPicker value={incomeMonth} onChange={setIncomeMonth} size="sm" />}
      />

      {month && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <CalendarDays className="w-4 h-4 text-[var(--accent-text)]" />
            Ca và giờ làm
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className={TILE}>
              <div className="text-[var(--text-muted)]">Ca đã chạy</div>
              <div className="font-bold text-[var(--text)] mt-0.5 text-base">{month.done.count > 0 ? `${month.done.count} ca` : <Empty>chưa có</Empty>}</div>
              {month.done.hostCount > 0 && month.done.coCount > 0 && (
                <div className="text-[11px] text-[var(--text-faint)]">{month.done.hostCount} host · {month.done.coCount} trợ</div>
              )}
            </div>
            <div className={TILE}>
              <div className="text-[var(--text-muted)]">Giờ đã làm (theo lịch)</div>
              <div className="font-bold text-[var(--text)] mt-0.5 text-base">
                {month.done.hostHours + month.done.coHours > 0 ? `${fmtFixed(month.done.hostHours + month.done.coHours, 1)}h` : <Empty>chưa có</Empty>}
              </div>
              {month.done.hostHours > 0 && month.done.coHours > 0 && (
                <div className="text-[11px] text-[var(--text-faint)]">{fmtFixed(month.done.hostHours, 1)}h host · {fmtFixed(month.done.coHours, 1)}h trợ</div>
              )}
            </div>
            <div className={TILE}>
              <div className="text-[var(--text-muted)]">Ca đã chốt còn lại</div>
              <div className="font-bold text-[var(--text)] mt-0.5 text-base">{month.upcoming.count > 0 ? `${month.upcoming.count} ca` : <Empty>không còn</Empty>}</div>
            </div>
            <div className={TILE}>
              <div className="text-[var(--text-muted)]">Giờ còn lại</div>
              <div className="font-bold text-[var(--text)] mt-0.5 text-base">{month.upcoming.hours > 0 ? `${fmtFixed(month.upcoming.hours, 1)}h` : <Empty>—</Empty>}</div>
            </div>
          </div>
          {monthDone.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-bold text-[var(--accent-text)] min-h-6 flex items-center">Xem {monthDone.length} ca đã chạy</summary>
              <div className="mt-2 max-h-80 overflow-y-auto">
                {monthDone.map((s) => {
                  const asHost = myRole(s, myTalent.id) === "host";
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-[var(--border-muted)] last:border-0">
                      <span className="font-mono text-[var(--text-muted)] shrink-0">{s.date.slice(8)}/{s.date.slice(5, 7)}</span>
                      <span className="font-bold text-[var(--text)] truncate min-w-0">{s.brandName}</span>
                      <PlatformChip platform={s.platform} />
                      <span className="text-[11px] text-[var(--text-faint)] shrink-0">{asHost ? "host" : "trợ"}</span>
                      <span className="font-mono text-[var(--text-muted)] shrink-0 ml-auto">{s.startTime}–{s.endTime}</span>
                      {/* GMV chỉ ở ca mình làm HOST — GMV của ca tính cho host (cùng luật assistSessionCount ở Talent Pool). */}
                      <span className="w-[56px] shrink-0 text-right font-bold text-emerald-400">{asHost && s.actualGmv ? fmtVndShort(s.actualGmv) : ""}</span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <TrendingUp className="w-4 h-4 text-[var(--accent-text)]" />
          Hiệu suất so mặt bằng
        </div>
        <p className="text-[11px] text-[var(--text-faint)] -mt-1">
          {STANDING_DAYS} ngày gần nhất, mỗi kênh brand × sàn một dòng: GMV thực của ca bạn ÷ GMV nếu bán bằng trung bình cả nhóm ở cùng tháng,
          loại ngày (lịch camp cố định) và buổi. Chỉ ghi trên/dưới khi khoảng tin cậy 95% nằm hẳn một phía.
        </p>
        {standing.length === 0 ? (
          <p className="text-xs text-[var(--text-faint)]">Chưa có ca nào có số trong {STANDING_DAYS} ngày gần nhất.</p>
        ) : (
          <div className="space-y-2">
            {standing.map((r) => (
              <div key={`${r.brandId}|${r.platform}|${r.role}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs border-b border-[var(--border-muted)] pb-2 last:border-0 last:pb-0">
                <span className="font-bold text-[var(--text)] flex items-center gap-1.5">{r.brandName} <PlatformChip platform={r.platform} /></span>
                <span className="text-[var(--text-faint)]">{r.role === "host" ? "Host" : "Trợ live"} · {r.sessions} ca</span>
                <span className="ml-auto font-mono font-bold text-[var(--text)]">{reliabilityText(r)}</span>
                <span className={`w-full sm:w-auto text-[11px] font-bold ${r.verdict === "above" ? "text-emerald-400" : r.verdict === "below" ? "text-rose-400" : "text-[var(--text-faint)]"}`}>
                  {r.verdict === "above" ? "Trên mặt bằng" : r.verdict === "below" ? "Dưới mặt bằng" : r.sessions < 3 ? "Chưa đủ 3 ca để kết luận" : "Trong dao động bình thường"}
                  {r.verdict !== "unclear" && isBorderline(r) ? " (sát ngưỡng)" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thứ tự khối (audit UX lần 2 — màn talent, 2026-09-30): SỐ trước, FORM sau. Trước đây hai form
          ghi (đổi SĐT, đổi email đăng nhập) chiếm 507/900px màn đầu ở desktop và TRỌN màn đầu 812px ở
          375px — talent mở "Hồ Sơ Của Tôi" trên điện thoại chỉ thấy ô nhập số điện thoại, còn hiệu suất
          và lương nằm ngoài màn. Người ta vào đây để XEM số của mình; sửa SĐT là việc vài tháng một lần. */}
      {/* Hiệu suất & thông tin chỉ xem */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <Award className="w-4 h-4 text-[var(--accent-text)]" />
          Từ trước tới nay & Rate
        </div>
        <p className="text-[11px] text-[var(--text-faint)] -mt-2">
          Số liệu hiệu suất được tính tự động từ báo cáo phiên live, không thể tự sửa ở đây.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className={TILE}>
            <div className="text-[var(--text-muted)]">Ca đã chạy</div>
            <div className="font-bold text-[var(--text)] mt-0.5">
              {myReal.sessionCount + myReal.assistSessionCount > 0 ? (
                `${myReal.sessionCount + myReal.assistSessionCount} ca`
              ) : (
                <Empty>chưa có ca nào</Empty>
              )}
              {myReal.sessionCount > 0 && myReal.assistSessionCount > 0 && (
                <span className="block text-[11px] font-normal text-[var(--text-faint)]">
                  {myReal.sessionCount} host · {myReal.assistSessionCount} trợ
                </span>
              )}
            </div>
          </div>
          <div className={TILE}>
            {/* GMV lũy kế cộng từ live_sessions, KHÔNG đọc cột nhập tay `talents.total_gmv`: trên DB
                thật 33/33 talent đều = 0, nên host đã chạy 59 ca (7,31 tỷ) mở hồ sơ ra thấy "0". Talent
                Pool đã bỏ cột nhập tay từ audit 2026-09-21 — hai màn phải nói cùng một số về cùng một
                người (xem đầu file src/lib/metrics/avgGmv.ts). */}
            {/* Tách theo sàn (user chốt 07/10): không bao giờ cộng GMV TikTok với Shopee. */}
            <div className="text-[var(--text-muted)]">GMV lũy kế</div>
            <div className="font-bold text-emerald-400 mt-0.5">
              {myReal.perf.TikTok.gmv > 0 || myReal.perf.Shopee.gmv > 0 ? (
                (["TikTok", "Shopee"] as const)
                  .filter((p) => myReal.perf[p].gmv > 0)
                  .map((p) => (
                    <span key={p} className="block">
                      {fmtVndShort(myReal.perf[p].gmv)} <span className="text-[11px] font-normal text-[var(--text-faint)]">{p}</span>
                    </span>
                  ))
              ) : myReal.assistSessionCount > 0 ? (
                <Empty>GMV ca trợ tính cho host</Empty>
              ) : (
                <Empty>chưa có</Empty>
              )}
            </div>
          </div>
          <div className={TILE}>
            {/* Giờ live chứ không phải GMV/giờ gộp: GMV/giờ phụ thuộc ngành hàng của brand hơn là người
                chạy, gộp mọi brand thành một số là số không so được với ai (xem computeTalentBrandPerf).
                Talent Pool cũng bỏ số gộp — hai màn phải nói cùng một thứ về cùng một người. */}
            <div className="text-[var(--text-muted)]">Giờ live</div>
            <div className="font-bold text-[var(--text)] mt-0.5">
              {myReal.hours + myReal.assistHours > 0 ? `${fmtFixed(myReal.hours + myReal.assistHours, 1)}h` : <Empty>chưa có</Empty>}
              {/* Chỉ tách khi làm CẢ HAI vai — người chỉ chạy vai trợ thì dòng "0,0h host · 360,1h trợ"
                  chỉ lặp lại con số ở trên kèm một số 0 vô nghĩa. */}
              {myReal.hours > 0 && myReal.assistHours > 0 && (
                <span className="block text-[11px] font-normal text-[var(--text-faint)]">
                  {fmtFixed(myReal.hours, 1)}h host · {fmtFixed(myReal.assistHours, 1)}h trợ
                </span>
              )}
            </div>
          </div>
          <div className={TILE}>
            <div className="text-[var(--text-muted)]">CVR TB</div>
            <div className="font-bold text-[var(--accent-text)] mt-0.5">
              {(myTalent.cvrAvg || 0) > 0 ? `${myTalent.cvrAvg}%` : <Empty>ops chưa nhập</Empty>}
            </div>
          </div>
          <div className={TILE}>
            <div className="text-[var(--text-muted)]">Vai trò</div>
            <div className="font-bold text-[var(--text)] mt-0.5">{talentRoleLabel(myTalent.role)}</div>
          </div>
          <div className={TILE}>
            <div className="text-[var(--text-muted)]">Trạng thái</div>
            <div className="font-bold text-[var(--text)] mt-0.5">{myTalent.availabilityStatus}</div>
          </div>
        </div>

        <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 text-xs">
          <div>
            <div className="text-amber-300/80">Rate Card</div>
            {/* rateHidden = view `talents_secure` mask cột lương với người đang đăng nhập. Phải hiện
                "chưa xem được" chứ KHÔNG hiện 0 đ — số 0 đọc như "lương của bạn bằng 0"
                (audit 2026-09-21). Talent đặt rate/giờ > 0 thì lương ca tính theo giờ công thực tế
                (giờ ca + OT − off sớm) — hiện đúng loại rate đang áp dụng. */}
            {myTalent.rateHidden ? (
              <div className="font-bold text-[var(--text-muted)] mt-0.5">chưa xem được</div>
            ) : (myTalent.ratePerHour || 0) > 0 ? (
              <div className="font-bold text-[var(--text)] mt-0.5">{fmtVndFull(myTalent.ratePerHour || 0)}<span className="text-amber-300/80 font-semibold">/giờ</span></div>
            ) : (myTalent.ratePerSession || 0) > 0 ? (
              <div className="font-bold text-[var(--text)] mt-0.5">{fmtVndFull(myTalent.ratePerSession || 0)}<span className="text-amber-300/80 font-semibold">/live</span></div>
            ) : (
              // Cả hai rate = 0 nghĩa là ops CHƯA NHẬP (33/33 talent trên DB thật, 2026-09-30) chứ không
              // phải "lương bằng 0" — in "0 đ/live" ở đây là câu trả lời sai cho người vừa chạy 59 ca.
              <div className="font-bold mt-0.5"><Empty>ops chưa nhập</Empty></div>
            )}
            {!myTalent.rateHidden && (myTalent.assistantRatePerHour || 0) > 0 && (
              <div className="text-[11px] text-amber-300/80 mt-0.5">Trợ live: {fmtVndFull(myTalent.assistantRatePerHour || 0)}/giờ</div>
            )}
          </div>
        </div>
        <p className="text-[11px] text-[var(--text-faint)]">
          {myTalent.rateHidden
            ? "Tài khoản của bạn chưa được liên kết đúng hồ sơ Talent nên chưa xem được Rate Card — báo Admin gán lại giúp."
            : (myTalent.ratePerHour || 0) === 0 && (myTalent.ratePerSession || 0) === 0
              ? "Rate Card của bạn chưa được nhập nên chưa tính được lương — nhờ ops nhập ở Talent Pool."
              : "Rate Card chỉ hiện cho chính bạn và CEO/Admin."}
        </p>
      </div>

      {/* Thu nhập tháng — tái dùng đúng công thức hostPayout/coHostPayout của Finance & P&L
          (computeTalentMonthlyIncome trong lib/pnl.ts) để không bao giờ ra 2 số khác nhau cho
          cùng 1 ca giữa màn của talent và màn của ops. */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <Wallet className="w-4 h-4 text-[var(--accent-text)]" />
            Thu nhập tạm tính
          </div>
        </div>

        {myTalent.rateHidden ? (
          <p className="text-xs text-[var(--text-muted)]">Chưa xem được — tài khoản của bạn chưa được liên kết đúng hồ sơ Talent.</p>
        ) : (
          <>
            {/* Không có dòng nào thì KHÔNG in ô "Tổng thu nhập tạm tính: 0" — số 0 to đùng ở màn lương
                của chính mình đọc như "tháng này bạn không được trả đồng nào", trong khi lý do thật là
                ca nạp bù không vào bảng lương (isPnlSession includeBackfill:false). Trên DB thật
                2026-09-30 cả 229 ca đều là ca nạp bù, nên mọi talent đều rơi vào nhánh này. */}
            {income.rows.length === 0 ? (
              <p className="text-xs text-[var(--text-faint)]">
                Chưa có ca nào tính lương trong tháng này. Ca nạp bù từ file của tháng cũ không vào bảng
                lương ở đây — lương những tháng đó đã chốt ngoài app.
              </p>
            ) : (
              <>
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4">
              <div className="text-amber-300/80 text-[11px]">Tổng thu nhập tạm tính</div>
              {/* Rate chưa nhập ⇒ mọi dòng 0: in "0" là nói "tháng này bạn không được trả đồng nào" — sai. */}
              <div className="font-black text-2xl text-[var(--text)] mt-0.5">
                {income.missingRate && income.total === 0 ? <span className="text-base font-bold text-[var(--text-muted)]">chưa tính được — ops chưa nhập rate</span> : money(income.total)}
              </div>
            </div>

            {/* Đ3: rate chưa nhập ra payout 0đ, giống hệt "tháng này không có ca" — với người vừa
                chạy ca thật thì đó là câu trả lời sai. Nói thẳng là thiếu rate, đừng in số 0. */}
            {income.missingRate && (
              <div className="text-xs rounded-xl px-3 py-2 border border-rose-800/60 bg-rose-950/40 text-rose-200">
                Có ca trong tháng chưa được đặt rate, nên số trên đang thiếu phần của những ca đó. Nhờ ops nhập rate ở Talent Pool.
              </div>
            )}

            {(
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[11px] tracking-wider">
                      <th className="py-1.5 px-1">Ngày</th>
                      <th className="py-1.5 px-1">Brand</th>
                      <th className="py-1.5 px-1">Vai trò</th>
                      <th className="py-1.5 px-1 text-right">Giờ công</th>
                      <th className="py-1.5 px-1 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {income.rows.map((r) => (
                      <tr key={`${r.session.id}:${r.role}`} className="border-b border-[var(--border-muted)]">
                        <td className="py-1.5 px-1 whitespace-nowrap">{fmtDateVn(r.session.date, false)}</td>
                        <td className="py-1.5 px-1 whitespace-nowrap">{r.session.brandName}</td>
                        <td className="py-1.5 px-1 whitespace-nowrap">{ROLE_LABEL[r.role]}</td>
                        <td className="py-1.5 px-1 text-right whitespace-nowrap">{fmtFixed(r.billableHours, 1)}h</td>
                        <td className="py-1.5 px-1 text-right font-bold text-[var(--text)] whitespace-nowrap">{r.payout === 0 && income.missingRate ? <Empty>—</Empty> : money(r.payout)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-[var(--text-faint)]">
              Tính tự động từ các ca đã xong trong tháng theo rate card hiện tại — số tạm tính, có thể đổi nếu ca chưa
              đối soát xong hoặc Rate Card của bạn vừa được cập nhật.
            </p>
              </>
            )}
          </>
        )}
      </div>
      {/* Thông tin tự sửa */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <User className="w-4 h-4 text-[var(--accent-text)]" />
          Thông Tin Liên Hệ
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide flex items-center gap-1">
                <Phone className="w-3 h-3" /> Số điện thoại
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide flex items-center gap-1">
                <Cake className="w-3 h-3" /> Ngày tháng năm sinh
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">URL Ảnh Đại Diện</label>
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)] font-mono"
            />
          </div>

          {profileMessage && (
            <div
              className={`text-xs rounded-lg px-3 py-2 border ${
                profileMessage.type === "ok"
                  ? "text-emerald-300 bg-emerald-950/60 border-emerald-500/30"
                  : "text-red-300 bg-red-950/60 border-red-500/30"
              }`}
            >
              {profileMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2"
          >
            {savingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Lưu Thông Tin
          </button>
        </form>
      </div>

      {onOpenAccount && (
        <button
          type="button"
          onClick={onOpenAccount}
          className="w-full sm:w-auto px-4 py-2.5 min-h-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] text-xs font-bold text-[var(--text)] flex items-center justify-center gap-2"
        >
          <KeyRound className="w-4 h-4 text-[var(--accent-text)]" /> Đổi mật khẩu
        </button>
      )}

      {/* Đổi email đăng nhập */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <Mail className="w-4 h-4 text-[var(--accent-text)]" />
          Đổi Email Đăng Nhập
        </div>
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
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Email mới</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide flex items-center gap-1">
                <Lock className="w-3 h-3" /> Mật khẩu hiện tại
              </label>
              <input
                type="password"
                required
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]"
              />
            </div>
          </div>

          {emailMessage && (
            <div
              className={`text-xs rounded-lg px-3 py-2 border ${
                emailMessage.type === "ok"
                  ? "text-emerald-300 bg-emerald-950/60 border-emerald-500/30"
                  : "text-red-300 bg-red-950/60 border-red-500/30"
              }`}
            >
              {emailMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={sendingEmailChange}
            className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2"
          >
            {sendingEmailChange && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Gửi Yêu Cầu Đổi Email
          </button>
        </form>
        </>
        )}
      </div>

    </div>
  );
};
