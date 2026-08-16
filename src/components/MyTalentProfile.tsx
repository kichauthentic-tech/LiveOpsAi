import React, { useState } from "react";
import { SystemUser, Talent } from "../types";
import { useAuth } from "../hooks/useAuth";
import { User, Phone, Cake, Mail, Loader2, Lock, ShieldAlert, Award } from "lucide-react";

interface MyTalentProfileProps {
  activeUser: SystemUser;
  talents: Talent[];
  onUpdateTalent: (id: string, patch: Partial<Talent>) => void;
}

export const MyTalentProfile: React.FC<MyTalentProfileProps> = ({ activeUser, talents, onUpdateTalent }) => {
  const { reauthenticate, updateEmail } = useAuth();
  const myTalent = talents.find((t) => t.id === activeUser.assignedTalentId);

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
      await onUpdateTalent(myTalent.id, { phone, avatar, dateOfBirth: dateOfBirth || undefined });
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
            <div className="font-bold text-emerald-400 mt-0.5">{((myTalent.avgGmvPerSession || 0) / 1000000).toFixed(0)}M đ</div>
          </div>
          <div className="bg-[var(--surface-base)]/40 border border-[var(--border)] rounded-xl p-3">
            <div className="text-[var(--text-muted)]">CVR TB</div>
            <div className="font-bold text-[var(--accent-text)] mt-0.5">{myTalent.cvrAvg || 0}%</div>
          </div>
        </div>

        <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-amber-300/80">Rate Card</div>
            <div className="font-bold text-[var(--text)] mt-0.5">{(myTalent.ratePerSession || 0).toLocaleString()} đ</div>
          </div>
          <div>
            <div className="text-amber-300/80">Hoa Hồng</div>
            <div className="font-bold text-[var(--accent-text)] mt-0.5">{myTalent.commissionRate || 0}%</div>
          </div>
        </div>
        <p className="text-[10px] text-[var(--text-faint)]">Rate Card/Hoa hồng chỉ hiện cho chính bạn và CEO/Admin.</p>
      </div>
    </div>
  );
};
