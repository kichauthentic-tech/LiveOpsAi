import React, { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Lock, Mail, Loader2 } from "lucide-react";

export const Login: React.FC = () => {
  const { signIn, sendPasswordResetEmail } = useAuth();
  // Không còn ô "Tạo tài khoản": tự đăng ký đã tắt ở Supabase (Authentication → Email →
  // "Allow new users to sign up", tắt 2026-09-23) sau khi phát hiện `handle_new_user` cũ nhận
  // role do client gửi lên — xem migration 0110. Người dùng mới vào bằng đường mời ở màn hình
  // "Phân Quyền & Role". Giữ lại nút chỉ khiến nó bung lỗi GoTrue tiếng Anh, trông như app hỏng.
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    if (mode === "forgot") {
      const result = await sendPasswordResetEmail(email);
      setSubmitting(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setInfo("Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (kể cả mục Spam).");
      return;
    }

    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.error) setError(result.error);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--surface-base)] text-[var(--text)] px-4">
      <div className="w-full max-w-sm bg-[var(--surface)]/80 border border-[var(--border)] rounded-2xl p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--accent-text)]">LIVEOPS AI</h1>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold">
            Agency Operating System
          </p>
        </div>

        {mode === "forgot" && (
          <div className="mb-6">
            <h2 className="text-sm font-bold text-[var(--text)]">Quên mật khẩu</h2>
            <p className="text-xs text-[var(--text-faint)] mt-1">
              Nhập email đã đăng ký, hệ thống sẽ gửi liên kết đặt lại mật khẩu.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          {mode !== "forgot" && (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)]" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          {mode === "signin" && (
            <div className="text-right -mt-2">
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setInfo(null);
                }}
                className="text-[11px] text-[var(--text-faint)] hover:text-[var(--accent-text)] font-semibold transition-colors"
              >
                Quên mật khẩu?
              </button>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-300 bg-red-950/85 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {info && (
            <div className="text-xs text-emerald-300 bg-emerald-950/85 border border-emerald-500/30 rounded-lg px-3 py-2">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "signin" ? "Đăng nhập" : "Gửi liên kết đặt lại"}
          </button>

          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setInfo(null);
              }}
              className="w-full text-center text-[11px] text-[var(--text-faint)] hover:text-[var(--accent-text)] font-semibold transition-colors"
            >
              ← Quay lại đăng nhập
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
