import { useMemo, useState } from "react";
import { KeyRound, UserCheck, Copy, Check } from "lucide-react";
import { LiveSession, SystemUser, Talent } from "../types";
import { credentialMessage, isEmail, talentsWithoutAccount } from "../lib/talentAccounts";
import { todayVn } from "../lib/performance/brandCommitment";
import { fmtDateVn } from "../lib/format";
import { talentRoleLabel } from "../lib/talentName";

// Phân Quyền & Role → khối "Host / trợ chưa có tài khoản" (Đợt 3 lịch 2 sàn, 06/10). Gắn tài khoản vào ĐÚNG hồ sơ có sẵn
// để người đó mở Ca Của Tôi thấy ngay ca của mình và giao ca được. Mật khẩu tạm server sinh, hiện một lần kèm lời nhắn
// dán Zalo; lần đầu đăng nhập bị bắt đổi (must_change_password).

interface Props {
  talents: Talent[];
  users: SystemUser[];
  sessions: LiveSession[];
  onGrant: (talentId: string, email: string) => Promise<string | undefined>;
}

export function TalentAccountGrants({ talents, users, sessions, onGrant }: Props) {
  const rows = useMemo(() => talentsWithoutAccount(talents, users, sessions, todayVn()), [talents, users, sessions]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showIdle, setShowIdle] = useState(false);
  const [reveal, setReveal] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (rows.length === 0) return null;
  const withShifts = rows.filter((r) => r.upcoming > 0);
  const idle = rows.filter((r) => r.upcoming === 0);
  const shown = showIdle ? rows : withShifts;

  const grant = async (t: Talent) => {
    const email = (emails[t.id] ?? "").trim();
    if (!isEmail(email)) {
      setErrors((e) => ({ ...e, [t.id]: email ? "Email chưa đúng dạng (vd: ten@gmail.com)." : "Nhập email đăng nhập của người này." }));
      return;
    }
    setBusy(t.id);
    setErrors((e) => ({ ...e, [t.id]: "" }));
    try {
      const password = await onGrant(t.id, email);
      if (password) setReveal({ name: t.name, email, password });
    } catch (err) {
      setErrors((e) => ({ ...e, [t.id]: err instanceof Error ? err.message : "Không cấp được tài khoản." }));
    } finally {
      setBusy(null);
    }
  };

  const message = reveal ? credentialMessage(reveal.name, reveal.email, reveal.password, window.location.origin) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="bg-[var(--surface)] border border-amber-500/40 rounded-2xl p-4 shadow-md space-y-3">
      <div>
        <h3 className="text-sm font-extrabold text-[var(--text)] flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-amber-500" />
          Host / trợ chưa có tài khoản ({rows.length})
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Gắn tài khoản vào đúng hồ sơ có sẵn — giữ nguyên ca, rate, lịch sử. {withShifts.length} người đang có ca từ hôm nay (xếp trên cùng):
          họ cần tài khoản để mở Ca Của Tôi và giao ca.
        </p>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {shown.map(({ talent: t, upcoming, nextDate }) => (
          <li key={t.id} className="py-2.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
            <div className="sm:w-56 shrink-0">
              <p className="text-sm font-bold text-[var(--text)]">{t.name}</p>
              <p className="text-[11px] text-[var(--text-muted)]">
                {talentRoleLabel(t.role)} ·{" "}
                {upcoming > 0 ? (
                  <span className="font-bold text-amber-600">
                    {upcoming} ca từ hôm nay · gần nhất {fmtDateVn(nextDate, false)}
                  </span>
                ) : (
                  "chưa có ca sắp tới"
                )}
              </p>
            </div>
            <div className="flex-1 flex gap-2">
              <input
                type="email"
                inputMode="email"
                autoComplete="off"
                aria-label={`Email đăng nhập cho ${t.name}`}
                placeholder="Email đăng nhập"
                value={emails[t.id] ?? ""}
                onChange={(e) => setEmails((m) => ({ ...m, [t.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && grant(t)}
                className="flex-1 min-w-0 min-h-10 px-3 bg-[var(--surface-base)] text-sm text-[var(--text)] rounded-xl border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => grant(t)}
                className="shrink-0 min-h-10 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-xl text-xs font-extrabold"
              >
                {busy === t.id ? "Đang cấp…" : "Cấp tài khoản"}
              </button>
            </div>
            {errors[t.id] && <p className="text-xs font-bold text-red-500 sm:basis-full">{errors[t.id]}</p>}
          </li>
        ))}
      </ul>
      {idle.length > 0 && (
        <button type="button" onClick={() => setShowIdle((v) => !v)} className="text-xs font-bold text-[var(--accent-text)]">
          {showIdle ? "Ẩn người chưa có ca sắp tới" : `+ ${idle.length} hồ sơ chưa có ca sắp tới`}
        </button>
      )}

      {reveal && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label="Tài khoản đã cấp" className="bg-[var(--surface)] w-full max-w-sm rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--accent-text)]" />
                Đã cấp tài khoản cho {reveal.name}
              </h3>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/40 text-amber-200 px-3 py-2">
                Mật khẩu tạm chỉ hiện <strong>đúng 1 lần</strong> ở đây. Copy lời nhắn gửi Zalo cho họ trước khi đóng.
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text)]">
                {message}
              </pre>
              <button
                type="button"
                onClick={copy}
                className="w-full min-h-10 border border-[var(--accent)] text-[var(--accent-text)] font-bold rounded-xl flex items-center justify-center gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Đã copy" : "Copy lời nhắn"}
              </button>
              <button
                type="button"
                onClick={() => setReveal(null)}
                className="w-full min-h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl"
              >
                Đã gửi cho họ — Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
