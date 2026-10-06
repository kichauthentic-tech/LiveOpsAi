import { useMemo, useState } from "react";
import { UserCheck, Users } from "lucide-react";
import { LiveSession, SystemUser, Talent } from "../types";
import { GrantResult, talentsWithoutAccount } from "../lib/talentAccounts";
import { aliasEmail, isAliasEmail, resolveLoginInput, suggestLoginName } from "../lib/loginName";
import { BulkCredentialsDialog, CredentialDialog, IssuedCredential } from "./CredentialDialog";
import { useConfirm } from "../hooks/useConfirm";
import { todayVn } from "../lib/performance/brandCommitment";
import { fmtDateVn } from "../lib/format";
import { talentRoleLabel } from "../lib/talentName";

// Phân Quyền & Role → khối "Host / trợ chưa có tài khoản" (Đợt 3 lịch 2 sàn, 06/10). Gắn tài khoản vào ĐÚNG hồ sơ có sẵn
// để người đó mở Ca Của Tôi thấy ngay ca của mình và giao ca được. Mật khẩu tạm server sinh, hiện một lần kèm lời nhắn
// dán Zalo; lần đầu đăng nhập bị bắt đổi (must_change_password). Chưa có email thì để trống ⇒ đăng nhập bằng tên (lib/loginName.ts),
// admin "Thêm email" sau ở danh sách tài khoản. "Cấp cho tất cả người có ca" = cùng việc cho mọi dòng có ca từ hôm nay một lượt
// (ô trống ⇒ tên gợi ý), kết quả hiện một bảng mật khẩu tạm (một lần) với nút copy lời nhắn từng người.

interface Props {
  talents: Talent[];
  users: SystemUser[];
  sessions: LiveSession[];
  onGrant: (items: { talentId: string; email: string }[], onProgress?: (done: number) => void) => Promise<GrantResult[]>;
}

export function TalentAccountGrants({ talents, users, sessions, onGrant }: Props) {
  const rows = useMemo(() => talentsWithoutAccount(talents, users, sessions, todayVn()), [talents, users, sessions]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showIdle, setShowIdle] = useState(false);
  const [reveal, setReveal] = useState<IssuedCredential | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [bulkResults, setBulkResults] = useState<GrantResult[] | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const confirm = useConfirm();
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

  const dialogs = (
    <>
      {reveal && <CredentialDialog cred={reveal} onClose={() => setReveal(null)} />}
      {bulkResults && <BulkCredentialsDialog results={bulkResults} onClose={() => setBulkResults(null)} />}
    </>
  );
  // Hết hồ sơ chưa có tài khoản (vừa cấp người cuối) thì ẩn khối nhưng GIỮ hộp mật khẩu đang mở.
  if (rows.length === 0) return dialogs;
  const withShifts = rows.filter((r) => r.upcoming > 0);
  const idle = rows.filter((r) => r.upcoming === 0);
  const shown = showIdle ? rows : withShifts;

  const working = busy !== null || bulk !== null;

  const grant = async (t: Talent) => {
    const r = resolveLoginInput(emails[t.id] ?? "", suggested[t.id]);
    if ("error" in r) {
      setErrors((e) => ({ ...e, [t.id]: r.error }));
      return;
    }
    setBusy(t.id);
    setErrors((e) => ({ ...e, [t.id]: "" }));
    try {
      const [res] = await onGrant([{ talentId: t.id, email: r.email }]);
      if (res.error) {
        setErrors((e) => ({ ...e, [t.id]: res.error! }));
        return;
      }
      if (res.password) setReveal({ name: t.name, email: r.email, password: res.password, kind: "new" });
      setEmails((m) => ({ ...m, [t.id]: "" }));
    } finally {
      setBusy(null);
    }
  };

  const grantAll = async () => {
    setBulkError(null);
    const items: { talentId: string; email: string }[] = [];
    const bad: Record<string, string> = {};
    for (const { talent: t } of withShifts) {
      const r = resolveLoginInput(emails[t.id] ?? "", suggested[t.id]);
      if ("error" in r) bad[t.id] = r.error;
      else items.push({ talentId: t.id, email: r.email });
    }
    setErrors(bad);
    if (Object.keys(bad).length > 0) {
      setBulkError(`Sửa ${Object.keys(bad).length} ô báo đỏ bên dưới (hoặc xoá trắng để dùng tên gợi ý) rồi bấm lại.`);
      return;
    }
    const byName = items.filter((it) => isAliasEmail(it.email)).length;
    const ok = await confirm(
      `Cấp ${items.length} tài khoản cho người có ca từ hôm nay? ${byName} người đăng nhập bằng tên (ô email trống), ${items.length - byName} người bằng email. ` +
        `Mật khẩu tạm hiện MỘT lần ở bảng kết quả — copy gửi Zalo từng người trước khi đóng.`
    );
    if (!ok) return;
    setBulk({ done: 0, total: items.length });
    try {
      const results = await onGrant(items, (done) => setBulk({ done, total: items.length }));
      setBulkResults(results);
      setEmails({});
      setErrors(Object.fromEntries(results.filter((r) => r.error).map((r) => [r.talentId, r.error!])));
    } finally {
      setBulk(null);
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
        {withShifts.length > 0 && (
          <button
            type="button"
            disabled={working}
            onClick={grantAll}
            className="mt-2 w-full sm:w-auto min-h-10 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-2"
          >
            <Users className="w-4 h-4" />
            {bulk ? `Đang cấp ${bulk.done}/${bulk.total}…` : `Cấp cho tất cả ${withShifts.length} người có ca`}
          </button>
        )}
        {bulkError && <p className="mt-2 text-xs font-bold text-red-500">{bulkError}</p>}
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
                disabled={working}
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

      {dialogs}
    </div>
  );
}
