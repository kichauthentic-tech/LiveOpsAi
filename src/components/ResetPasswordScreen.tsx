import React, { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import { Lock, Loader2, CheckCircle2 } from "lucide-react";

interface ResetPasswordScreenProps {
  // true = gate "bắt buộc đổi mật khẩu lần đầu" (profiles.must_change_password), khác với luồng
  // recovery/invite link thường (audit 2026-09-24, xem talent tạo mới ở TalentMatcher.tsx — mật
  // khẩu ngẫu nhiên server sinh phải bị ép đổi ngay lần đăng nhập đầu). Không có link hash ở luồng
  // này, chỉ có session hiện tại — xong thì tắt cờ trên chính profile rồi cho vào app luôn, không
  // bắt đăng nhập lại như recovery/invite.
  forceChange?: boolean;
}

// Shown instead of the normal app when Supabase fires a PASSWORD_RECOVERY auth event, when the
// user landed here via an invite link (which has no password yet and must set one), or when their
// profile has must_change_password=true — either way a valid session already exists, so this only
// needs to collect the new password.
export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({ forceChange = false }) => {
  const { updatePassword, clearPasswordRecovery, signOut, isInvite, profile, refreshProfile } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }
    if (forceChange && profile) {
      // Best-effort — RLS profiles_update_self_or_ceo cho phép tự update chính hàng của mình.
      // Lỡ lỗi (mất mạng...) thì talent vẫn qua được màn này lần sau vẫn bị hỏi lại, không kẹt.
      const { error: clearError } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", profile.id);
      if (clearError) console.error("Không tắt được cờ must_change_password:", clearError);
    }
    setSubmitting(false);
    setDone(true);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--surface-base)] text-[var(--text)] px-4">
      <div className="w-full max-w-sm bg-[var(--surface)]/80 border border-[var(--border)] rounded-2xl p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--accent-text)]">LIVEOPS AI</h1>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold">
            {forceChange ? "Bắt buộc đổi mật khẩu lần đầu" : isInvite ? "Đặt mật khẩu cho tài khoản" : "Đặt lại mật khẩu"}
          </p>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm text-[var(--text-muted)]">
              {forceChange
                ? "Mật khẩu đã được cập nhật thành công."
                : isInvite
                ? "Mật khẩu đã được thiết lập thành công."
                : "Mật khẩu đã được cập nhật thành công."}
            </p>
            {forceChange ? (
              <button
                onClick={() => refreshProfile()}
                className="w-full py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl text-sm transition-all"
              >
                Vào Ứng Dụng
              </button>
            ) : (
              <button
                onClick={async () => {
                  clearPasswordRecovery();
                  await signOut();
                }}
                className="w-full py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl text-sm transition-all"
              >
                Đăng nhập lại
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-[var(--text-faint)]">
              {forceChange
                ? "Tài khoản của bạn đang dùng mật khẩu tạm — đặt mật khẩu mới trước khi tiếp tục."
                : isInvite
                ? "Đặt mật khẩu để hoàn tất kích hoạt tài khoản."
                : "Nhập mật khẩu mới cho tài khoản của bạn."}
            </p>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Mật khẩu mới"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>

            {error && (
              <div className="text-xs text-red-300 bg-red-950/85 border border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Cập nhật mật khẩu
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
