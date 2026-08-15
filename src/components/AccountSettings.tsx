import React, { useState } from "react";
import { SystemUser } from "../types";
import { useAuth } from "../hooks/useAuth";
import { User, Lock, Mail, Loader2, CheckCircle2, KeyRound } from "lucide-react";

interface AccountSettingsProps {
  activeUser: SystemUser;
  onUpdateUser: (user: SystemUser) => Promise<void>;
}

export const AccountSettings: React.FC<AccountSettingsProps> = ({ activeUser, onUpdateUser }) => {
  const { reauthenticate, updatePassword, sendPasswordResetEmail, refreshProfile } = useAuth();

  // Đổi tên hiển thị
  const [name, setName] = useState(activeUser.name);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameMessage(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMessage({ type: "err", text: "Tên hiển thị không được để trống." });
      return;
    }
    setSavingName(true);
    try {
      await onUpdateUser({ ...activeUser, name: trimmed });
      await refreshProfile();
      setNameMessage({ type: "ok", text: "Đã cập nhật tên hiển thị." });
    } catch (e: any) {
      setNameMessage({ type: "err", text: e.message ?? "Không thể cập nhật tên." });
    } finally {
      setSavingName(false);
    }
  };

  // Đổi mật khẩu (yêu cầu xác nhận mật khẩu hiện tại)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage({ type: "err", text: "Mật khẩu mới phải có ít nhất 6 ký tự." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "err", text: "Mật khẩu mới nhập lại không khớp." });
      return;
    }

    setSavingPassword(true);
    try {
      const reauth = await reauthenticate(currentPassword);
      if (reauth.error) {
        setPasswordMessage({ type: "err", text: "Mật khẩu hiện tại không đúng." });
        return;
      }
      const result = await updatePassword(newPassword);
      if (result.error) {
        setPasswordMessage({ type: "err", text: result.error });
        return;
      }
      setPasswordMessage({ type: "ok", text: "Đã đổi mật khẩu thành công." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setSavingPassword(false);
    }
  };

  // Quên mật khẩu — gửi email đặt lại (hữu ích khi không nhớ mật khẩu hiện tại để đổi ở trên)
  const [sendingReset, setSendingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleSendResetEmail = async () => {
    setResetMessage(null);
    setSendingReset(true);
    try {
      const result = await sendPasswordResetEmail(activeUser.email);
      setResetMessage(
        result.error ? result.error : "Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư."
      );
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-black text-[var(--text)]">Tài Khoản Của Tôi</h1>
        <p className="text-xs text-[var(--text-faint)] mt-1">Quản lý tên hiển thị và mật khẩu đăng nhập của bạn.</p>
      </div>

      {/* Thông tin cơ bản */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <User className="w-4 h-4 text-[var(--accent-text)]" />
          Thông Tin Hiển Thị
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
          <Mail className="w-3.5 h-3.5" />
          <span>{activeUser.email}</span>
          <span className="text-[var(--text-faint)]">(email đăng nhập, không thể tự đổi ở đây)</span>
        </div>

        <form onSubmit={handleSaveName} className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Tên hiển thị</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]"
            />
          </div>

          {nameMessage && (
            <div
              className={`text-xs rounded-lg px-3 py-2 border ${
                nameMessage.type === "ok"
                  ? "text-emerald-300 bg-emerald-950/85 border-emerald-500/30"
                  : "text-red-300 bg-red-950/85 border-red-500/30"
              }`}
            >
              {nameMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={savingName || name.trim() === activeUser.name}
            className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2"
          >
            {savingName && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Lưu Tên Hiển Thị
          </button>
        </form>
      </div>

      {/* Đổi mật khẩu */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <Lock className="w-4 h-4 text-[var(--accent-text)]" />
          Đổi Mật Khẩu
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Mật khẩu hiện tại
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Mật khẩu mới
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Nhập lại mật khẩu mới
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]"
              />
            </div>
          </div>

          {passwordMessage && (
            <div
              className={`text-xs rounded-lg px-3 py-2 border ${
                passwordMessage.type === "ok"
                  ? "text-emerald-300 bg-emerald-950/85 border-emerald-500/30"
                  : "text-red-300 bg-red-950/85 border-red-500/30"
              }`}
            >
              {passwordMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={savingPassword}
            className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2"
          >
            {savingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Đổi Mật Khẩu
          </button>
        </form>
      </div>

      {/* Quên mật khẩu hiện tại */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <KeyRound className="w-4 h-4 text-[var(--accent-text)]" />
          Quên Mật Khẩu Hiện Tại?
        </div>
        <p className="text-xs text-[var(--text-faint)]">
          Không nhớ mật khẩu hiện tại để đổi ở trên? Gửi một email đặt lại mật khẩu tới{" "}
          <span className="text-[var(--text-muted)] font-semibold">{activeUser.email}</span>.
        </p>

        {resetMessage && (
          <div className="text-xs text-[var(--text-muted)] bg-[var(--surface-base)]/60 border border-[var(--border)]/60 rounded-lg px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {resetMessage}
          </div>
        )}

        <button
          type="button"
          onClick={handleSendResetEmail}
          disabled={sendingReset}
          className="px-4 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] disabled:opacity-50 text-[var(--text)] border border-[var(--border)] font-bold rounded-xl text-xs transition-all flex items-center gap-2"
        >
          {sendingReset && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Gửi Email Đặt Lại Mật Khẩu
        </button>
      </div>
    </div>
  );
};
