import React, { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { RATE_LOCK_MAX_TRIES, cooldownLeftSec } from "../../lib/talent/rateLock";

// Cổng mật khẩu trước tab "Tôi" (rate + thu nhập). Xem lib/talent/rateLock.ts.
// Dùng `reauthenticate` của useAuth (signInWithPassword lại cùng tài khoản) — không tạo phiên thứ hai.
export const RateLockGate: React.FC<{ name: string; onUnlocked: () => void; onSignOut: () => void }> = ({ name, onUnlocked, onSignOut }) => {
  const { reauthenticate } = useAuth();
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fails, setFails] = useState(0);
  const [lastFailAt, setLastFailAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  const wait = cooldownLeftSec(fails, lastFailAt, now);
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [wait]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || checking || wait > 0) return;
    setChecking(true);
    setError(null);
    try {
      const r = await reauthenticate(password);
      if (r.error) {
        const t = Date.now();
        const next = fails + 1;
        setFails(next >= RATE_LOCK_MAX_TRIES ? 0 : next);
        setLastFailAt(next >= RATE_LOCK_MAX_TRIES ? t : null);
        setNow(t);
        setError(next >= RATE_LOCK_MAX_TRIES ? "Sai mật khẩu nhiều lần — chờ 30 giây rồi thử lại." : "Mật khẩu không đúng.");
        setPassword("");
        return;
      }
      setPassword("");
      onUnlocked();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-10 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--accent)]/15 text-[var(--accent-text)] flex items-center justify-center shrink-0">
          <Lock className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-black text-[var(--text)] leading-tight">Nhập mật khẩu để xem</h2>
          <p className="text-xs text-[var(--text-muted)] truncate">Trang này có rate và thu nhập của {name}</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input
          ref={inputRef}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu đăng nhập"
          aria-label="Mật khẩu đăng nhập"
          disabled={wait > 0}
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
        {(error || wait > 0) && (
          <p role="alert" className="text-xs text-red-400">
            {wait > 0 ? `Sai mật khẩu nhiều lần — chờ ${wait} giây rồi thử lại.` : error}
          </p>
        )}
        <button
          type="submit"
          disabled={!password || checking || wait > 0}
          className="w-full bg-[var(--accent)] text-[var(--on-accent,#fff)] rounded-lg py-2 text-sm font-bold disabled:opacity-40"
        >
          {checking ? "Đang kiểm tra…" : "Mở khoá"}
        </button>
      </form>
      <p className="text-xs text-[var(--text-faint)]">
        Không phải {name}?{" "}
        <button type="button" onClick={onSignOut} className="underline text-[var(--text-muted)]">
          Đăng xuất
        </button>
      </p>
    </div>
  );
};
