import React, { useState } from "react";
import { ArrowLeft, ChevronRight, KeyRound, Loader2, Lock } from "lucide-react";
import type { SystemUser, Talent } from "../types";
import { useAuth } from "../hooks/useAuth";
import { errorMessage } from "../lib/errorMessage";
import { isAliasEmail, loginLabel } from "../lib/loginName";
import { CalendarFeedCard } from "./talent/CalendarFeedCard";

// Màn "Cài đặt" của app talent (tách khỏi tab "Tôi" 08/11): tab "Tôi" chỉ còn số liệu (giờ, thu nhập, bảng công, hiệu suất);
// mọi thứ chỉnh sửa tài khoản — lịch điện thoại, thông tin cá nhân, mật khẩu, email — gom về đây. Vào từ nút Cài đặt ở tab "Tôi".

interface Props {
  activeUser: SystemUser;
  myTalent?: Talent;
  /** Không dùng handleUpdateTalent chung của App (nuốt lỗi bằng alert) — xem ghi chú ở MyTalentProfile cũ (bug C3). */
  onSaveMyProfile: (patch: { phone: string; avatar: string; dateOfBirth?: string }) => Promise<void>;
  onOpenAccount?: () => void;
  onBack: () => void;
}

const INPUT = "mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]";
const LABEL = "text-xs font-semibold text-[var(--text-muted)] flex items-center gap-1";
const SETTING_ROW = "cursor-pointer list-none flex items-center justify-between gap-2 px-4 py-3 min-h-11 text-sm font-bold text-[var(--text)]";

const Msg: React.FC<{ m: { type: "ok" | "err"; text: string } | null }> = ({ m }) =>
  m ? (
    <div className={`text-xs rounded-lg px-3 py-2 border ${m.type === "ok" ? "text-emerald-300 bg-emerald-950/60 border-emerald-500/30" : "text-red-300 bg-red-950/60 border-red-500/30"}`}>{m.text}</div>
  ) : null;

export const TalentSettings: React.FC<Props> = ({ activeUser, myTalent, onSaveMyProfile, onOpenAccount, onBack }) => {
  const { reauthenticate, updateEmail } = useAuth();
  const [phone, setPhone] = useState(myTalent?.phone ?? "");
  const [avatar, setAvatar] = useState(myTalent?.avatar ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(myTalent?.dateOfBirth ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [sendingEmailChange, setSendingEmailChange] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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

  return (
    <div className="space-y-4 max-w-2xl">
      <header className="flex items-center gap-2 px-1">
        <button type="button" onClick={onBack} aria-label="Quay lại" className="min-h-9 min-w-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-lg font-black text-[var(--text)] leading-tight">Cài đặt</h2>
          <p className="text-xs text-[var(--text-muted)]">Lịch điện thoại, thông tin cá nhân, mật khẩu, email</p>
        </div>
      </header>

      <section className="space-y-2" aria-label="Lịch điện thoại">
        <h3 className="text-2xs font-black text-[var(--text-faint)] px-1">Lịch ca</h3>
        <CalendarFeedCard />
      </section>

      <section className="space-y-2" aria-label="Tài khoản">
        <h3 className="text-2xs font-black text-[var(--text-faint)] px-1">Tài khoản</h3>
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
        {onOpenAccount && (
          <button type="button" onClick={onOpenAccount} className={`w-full ${SETTING_ROW} bg-[var(--surface)] border border-[var(--border)] rounded-2xl hover:border-[var(--accent)]`}>
            <span className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-[var(--accent-text)]" /> Đổi mật khẩu</span>
            <ChevronRight className="w-4 h-4 text-[var(--text-faint)]" />
          </button>
        )}
      </section>
    </div>
  );
};
