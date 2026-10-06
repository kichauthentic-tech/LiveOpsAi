import { useMemo, useState } from "react";
import { UserCheck } from "lucide-react";
import { LiveSession, SystemUser, Talent } from "../types";
import { talentsWithoutAccount } from "../lib/talentAccounts";
import { aliasEmail, resolveLoginInput, suggestLoginName } from "../lib/loginName";
import { CredentialDialog, IssuedCredential } from "./CredentialDialog";
import { todayVn } from "../lib/performance/brandCommitment";
import { fmtDateVn } from "../lib/format";
import { talentRoleLabel } from "../lib/talentName";

// Phân Quyền & Role → khối "Host / trợ chưa có tài khoản" (Đợt 3 lịch 2 sàn, 06/10). Gắn tài khoản vào ĐÚNG hồ sơ có sẵn
// để người đó mở Ca Của Tôi thấy ngay ca của mình và giao ca được. Mật khẩu tạm server sinh, hiện một lần kèm lời nhắn
// dán Zalo; lần đầu đăng nhập bị bắt đổi (must_change_password). Chưa có email thì để trống ⇒ đăng nhập bằng tên (lib/loginName.ts),
// admin "Thêm email" sau ở danh sách tài khoản.

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
  const [reveal, setReveal] = useState<IssuedCredential | null>(null);
  // Tên đăng nhập gợi ý, tính lần lượt để hai người trùng hai chữ cuối không cùng được gợi một tên.
  const suggested = useMemo(() => {
    const taken = users.map((u) => u.email);
    const out: Record<string, string> = {};
    for (const r of rows) {
      out[r.talent.id] = suggestLoginName(r.talent.name, taken);
      taken.push(aliasEmail(out[r.talent.id]));
    }
    return out;
  }, [rows, users]);

  if (rows.length === 0) return null;
  const withShifts = rows.filter((r) => r.upcoming > 0);
  const idle = rows.filter((r) => r.upcoming === 0);
  const shown = showIdle ? rows : withShifts;

  const grant = async (t: Talent) => {
    const r = resolveLoginInput(emails[t.id] ?? "", suggested[t.id]);
    if ("error" in r) {
      setErrors((e) => ({ ...e, [t.id]: r.error }));
      return;
    }
    setBusy(t.id);
    setErrors((e) => ({ ...e, [t.id]: "" }));
    try {
      const password = await onGrant(t.id, r.email);
      if (password) setReveal({ name: t.name, email: r.email, password, kind: "new" });
      setEmails((m) => ({ ...m, [t.id]: "" }));
    } catch (err) {
      setErrors((e) => ({ ...e, [t.id]: err instanceof Error ? err.message : "Không cấp được tài khoản." }));
    } finally {
      setBusy(null);
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
          họ cần tài khoản để mở Ca Của Tôi và giao ca. Chưa có email thì để trống: họ đăng nhập bằng tên, thêm email sau ở danh sách bên dưới.
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
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                aria-label={`Email hoặc tên đăng nhập cho ${t.name}`}
                placeholder={`Email — để trống: ${suggested[t.id]}`}
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
            {!errors[t.id] && !(emails[t.id] ?? "").trim() && (
              <p className="text-[11px] text-[var(--text-faint)] sm:basis-full sm:pl-[14.5rem]">
                Để trống ⇒ đăng nhập bằng tên <span className="font-mono font-bold text-[var(--text-muted)]">{suggested[t.id]}</span>
              </p>
            )}
            {errors[t.id] && <p className="text-xs font-bold text-red-500 sm:basis-full">{errors[t.id]}</p>}
          </li>
        ))}
      </ul>
      {idle.length > 0 && (
        <button type="button" onClick={() => setShowIdle((v) => !v)} className="text-xs font-bold text-[var(--accent-text)]">
          {showIdle ? "Ẩn người chưa có ca sắp tới" : `+ ${idle.length} hồ sơ chưa có ca sắp tới`}
        </button>
      )}

      {reveal && <CredentialDialog cred={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}
