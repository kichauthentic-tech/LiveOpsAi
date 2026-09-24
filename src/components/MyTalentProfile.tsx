import React, { useMemo, useState } from "react";
import { SystemUser, Talent, LiveSession, SessionFinance, TalentRateHistoryEntry } from "../types";
import { useAuth } from "../hooks/useAuth";
import { User, Phone, Cake, Mail, Loader2, Lock, ShieldAlert, Award, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import { computeRealAvgGmvPerSession } from "../lib/metrics/avgGmv";
import { computeTalentMonthlyIncome } from "../lib/pnl";
import { todayVn } from "../lib/performance/brandCommitment";

interface MyTalentProfileProps {
  activeUser: SystemUser;
  talents: Talent[];
  sessions: LiveSession[];
  financeRecords: SessionFinance[];
  talentRateHistory: TalentRateHistoryEntry[];
  // KHÔNG dùng chung handleUpdateTalent của App: handler đó tự nuốt lỗi bằng window.alert rồi
  // trả void, nên try/catch dưới đây thành code chết và form luôn báo "Đã cập nhật" kể cả khi DB
  // không ghi được gì (bug C3). Handler riêng này bắt buộc phải để lỗi nổi lên.
  onSaveMyProfile: (patch: { phone: string; avatar: string; dateOfBirth?: string }) => Promise<void>;
}

const money = (n: number) => Math.round(n).toLocaleString("vi-VN");
const ROLE_LABEL: Record<"host" | "co_host", string> = { host: "Host", co_host: "Trợ live" };

export const MyTalentProfile: React.FC<MyTalentProfileProps> = ({
  activeUser,
  talents,
  sessions,
  financeRecords,
  talentRateHistory,
  onSaveMyProfile
}) => {
  const { reauthenticate, updateEmail } = useAuth();
  const myTalent = talents.find((t) => t.id === activeUser.assignedTalentId);

  const [incomeMonth, setIncomeMonth] = useState(() => todayVn().slice(0, 7));
  const shiftIncomeMonth = (delta: number) => {
    const [y, m] = incomeMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setIncomeMonth(`${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`);
  };

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
    return computeTalentMonthlyIncome(sessions, myTalent.id, incomeMonth, financeBySessionId, talentById, talentRateHistory);
  }, [sessions, myTalent, incomeMonth, financeBySessionId, talentById, talentRateHistory]);

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
    } catch (e: any) {
      setProfileMessage({ type: "err", text: e.message ?? "Không thể cập nhật hồ sơ." });
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
      <div>
        <h1 className="text-xl font-black text-[var(--text)]">Hồ Sơ Của Tôi</h1>
        <p className="text-xs text-[var(--text-faint)] mt-1">Xem hiệu suất, thù lao của bạn và tự cập nhật thông tin liên hệ.</p>
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

      {/* Đổi email đăng nhập */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <Mail className="w-4 h-4 text-[var(--accent-text)]" />
          Đổi Email Đăng Nhập
        </div>
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
      </div>

      {/* Hiệu suất & thông tin chỉ xem */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <Award className="w-4 h-4 text-[var(--accent-text)]" />
          Hiệu Suất & Thù Lao
        </div>
        <p className="text-[11px] text-[var(--text-faint)] -mt-2">
          Số liệu hiệu suất được tính tự động từ báo cáo phiên live, không thể tự sửa ở đây.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-[var(--surface-base)]/40 border border-[var(--border)] rounded-xl p-3">
            <div className="text-[var(--text-muted)]">Vai trò</div>
            <div className="font-bold text-[var(--text)] mt-0.5">{myTalent.role}</div>
          </div>
          <div className="bg-[var(--surface-base)]/40 border border-[var(--border)] rounded-xl p-3">
            <div className="text-[var(--text-muted)]">Giới tính</div>
            <div className="font-bold text-[var(--text)] mt-0.5">{myTalent.gender || "—"}</div>
          </div>
          <div className="bg-[var(--surface-base)]/40 border border-[var(--border)] rounded-xl p-3">
            <div className="text-[var(--text-muted)]">Trạng thái</div>
            <div className="font-bold text-[var(--text)] mt-0.5">{myTalent.availabilityStatus}</div>
          </div>
          <div className="bg-[var(--surface-base)]/40 border border-[var(--border)] rounded-xl p-3">
            <div className="text-[var(--text-muted)]">GMV Tích Lũy</div>
            <div className="font-bold text-emerald-400 mt-0.5">{((myTalent.totalGmv || 0) / 1000000).toFixed(0)}M đ</div>
          </div>
          <div className="bg-[var(--surface-base)]/40 border border-[var(--border)] rounded-xl p-3">
            <div className="text-[var(--text-muted)]">GMV TB / Phiên</div>
            <div className="font-bold text-emerald-400 mt-0.5">{(computeRealAvgGmvPerSession(sessions, myTalent.id) / 1000000).toFixed(0)}M đ</div>
          </div>
          <div className="bg-[var(--surface-base)]/40 border border-[var(--border)] rounded-xl p-3">
            <div className="text-[var(--text-muted)]">CVR TB</div>
            <div className="font-bold text-[var(--accent-text)] mt-0.5">{myTalent.cvrAvg || 0}%</div>
          </div>
        </div>

        <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-amber-300/80">Rate Card</div>
            {/* rateHidden = view `talents_secure` mask cột lương với người đang đăng nhập. Phải hiện
                "chưa xem được" chứ KHÔNG hiện 0 đ — số 0 đọc như "lương của bạn bằng 0"
                (audit 2026-09-21). Talent đặt rate/giờ > 0 thì lương ca tính theo giờ công thực tế
                (giờ ca + OT − off sớm) — hiện đúng loại rate đang áp dụng. */}
            {myTalent.rateHidden ? (
              <div className="font-bold text-[var(--text-muted)] mt-0.5">chưa xem được</div>
            ) : (myTalent.ratePerHour || 0) > 0 ? (
              <div className="font-bold text-[var(--text)] mt-0.5">{(myTalent.ratePerHour || 0).toLocaleString()} đ<span className="text-amber-300/80 font-semibold">/giờ</span></div>
            ) : (
              <div className="font-bold text-[var(--text)] mt-0.5">{(myTalent.ratePerSession || 0).toLocaleString()} đ<span className="text-amber-300/80 font-semibold">/live</span></div>
            )}
            {!myTalent.rateHidden && (myTalent.assistantRatePerHour || 0) > 0 && (
              <div className="text-[10px] text-amber-300/80 mt-0.5">Trợ live: {(myTalent.assistantRatePerHour || 0).toLocaleString()} đ/giờ</div>
            )}
          </div>
          <div>
            <div className="text-amber-300/80">Hoa Hồng</div>
            <div className="font-bold text-[var(--accent-text)] mt-0.5">
              {myTalent.rateHidden ? <span className="text-[var(--text-muted)]">chưa xem được</span> : `${myTalent.commissionRate || 0}%`}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-[var(--text-faint)]">
          {myTalent.rateHidden
            ? "Tài khoản của bạn chưa được liên kết đúng hồ sơ Talent nên chưa xem được Rate Card/Hoa hồng — báo Admin gán lại giúp."
            : "Rate Card/Hoa hồng chỉ hiện cho chính bạn và CEO/Admin."}
        </p>
      </div>

      {/* Thu nhập tháng — tái dùng đúng công thức hostPayout/coHostPayout của Finance & P&L
          (computeTalentMonthlyIncome trong lib/pnl.ts) để không bao giờ ra 2 số khác nhau cho
          cùng 1 ca giữa màn của talent và màn của ops. */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <Wallet className="w-4 h-4 text-[var(--accent-text)]" />
            Thu Nhập Tháng Này
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftIncomeMonth(-1)} className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)]">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-bold text-[var(--text)] w-20 text-center">{incomeMonth}</span>
            <button onClick={() => shiftIncomeMonth(1)} className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)]">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {myTalent.rateHidden ? (
          <p className="text-xs text-[var(--text-muted)]">Chưa xem được — tài khoản của bạn chưa được liên kết đúng hồ sơ Talent.</p>
        ) : (
          <>
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4">
              <div className="text-amber-300/80 text-[11px]">Tổng thu nhập tạm tính</div>
              <div className="font-black text-2xl text-[var(--text)] mt-0.5">{money(income.total)} đ</div>
            </div>

            {/* Đ3: rate chưa nhập ra payout 0đ, giống hệt "tháng này không có ca" — với người vừa
                chạy ca thật thì đó là câu trả lời sai. Nói thẳng là thiếu rate, đừng in số 0. */}
            {income.missingRate && (
              <div className="text-xs rounded-xl px-3 py-2 border border-rose-800/60 bg-rose-950/40 text-rose-200">
                Có ca trong tháng chưa được đặt rate, nên số trên đang thiếu phần của những ca đó. Nhờ ops nhập rate ở Talent Pool.
              </div>
            )}

            {income.rows.length === 0 ? (
              <p className="text-xs text-[var(--text-faint)] italic">Chưa có ca nào tính lương trong tháng này.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[10px] tracking-wider">
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
                        <td className="py-1.5 px-1 whitespace-nowrap">{r.session.date}</td>
                        <td className="py-1.5 px-1 whitespace-nowrap">{r.session.brandName}</td>
                        <td className="py-1.5 px-1 whitespace-nowrap">{ROLE_LABEL[r.role]}</td>
                        <td className="py-1.5 px-1 text-right whitespace-nowrap">{r.billableHours.toFixed(1)}h</td>
                        <td className="py-1.5 px-1 text-right font-bold text-[var(--text)] whitespace-nowrap">{money(r.payout)} đ</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-[var(--text-faint)]">
              Tính tự động từ các ca Completed trong tháng theo rate card hiện tại — số tạm tính, có thể đổi nếu ca chưa
              đối soát xong hoặc Rate Card của bạn vừa được cập nhật.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
