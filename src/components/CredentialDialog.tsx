import { useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { credentialMessage, GrantResult } from "../lib/talentAccounts";
import { loginLabel } from "../lib/loginName";
import { useConfirm } from "../hooks/useConfirm";

// Hộp hiện mật khẩu tạm MỘT lần (server không lưu lại) + lời nhắn dán Zalo. Dùng khi cấp tài khoản cho hồ sơ có sẵn
// (TalentAccountGrants) và khi admin "Đặt lại mật khẩu" (UserRoleSettings). BulkCredentialsDialog = bảng kết quả "Cấp cho tất cả".

export interface IssuedCredential {
  name: string;
  email: string;
  password: string;
  kind: "new" | "reset";
}

export function CredentialDialog({ cred, onClose }: { cred: IssuedCredential; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const message = credentialMessage(cred.name, cred.email, cred.password, window.location.origin, cred.kind);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const title = cred.kind === "new" ? `Đã cấp tài khoản cho ${cred.name}` : `Đã đặt lại mật khẩu cho ${cred.name}`;
  return (
    <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-[var(--surface)] w-full max-w-sm rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--accent-text)]" />
            {title}
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
          <button type="button" onClick={onClose} className="w-full min-h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl">
            Đã gửi cho họ — Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

/** Bảng kết quả "Cấp cho tất cả": mỗi người một dòng tên đăng nhập + mật khẩu tạm + nút copy lời nhắn; dòng lỗi hiện lý do.
 *  Đóng khi còn người chưa copy ⇒ hỏi lại (đóng là mất mật khẩu, phải "Đặt lại MK"). */
export function BulkCredentialsDialog({ results, onClose }: { results: GrantResult[]; onClose: () => void }) {
  const confirm = useConfirm();
  const ok = results.filter((r) => r.password);
  const failed = results.filter((r) => !r.password);
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const msg = (r: GrantResult) => credentialMessage(r.name, r.email, r.password!, window.location.origin, "new");
  const copy = async (ids: string[], text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied((c) => new Set([...c, ...ids]));
    } catch {
      // Trình duyệt chặn clipboard: vẫn đọc/chép tay được từ bảng.
    }
  };
  const close = async () => {
    const left = ok.filter((r) => !copied.has(r.talentId)).length;
    if (left > 0 && !(await confirm(`Còn ${left} người chưa copy lời nhắn. Đóng là mất mật khẩu của họ (phải Đặt lại MK). Vẫn đóng?`, { danger: true }))) return;
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label="Kết quả cấp tài khoản" className="bg-[var(--surface)] w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] space-y-2">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--accent-text)]" />
            Đã cấp {ok.length} tài khoản{failed.length > 0 ? ` · ${failed.length} lỗi` : ""}
          </h3>
          <p className="text-xs rounded-lg border border-amber-500/30 bg-amber-950/40 text-amber-200 px-3 py-2">
            Mật khẩu tạm chỉ hiện <strong>đúng 1 lần</strong> ở bảng này. Copy lời nhắn từng người gửi Zalo (hoặc "Copy tất cả" để lưu tạm) trước khi đóng.
          </p>
          {ok.length > 0 && (
            <button
              type="button"
              onClick={() => copy(ok.map((r) => r.talentId), ok.map(msg).join("\n\n———\n\n"))}
              className="w-full min-h-10 border border-[var(--accent)] text-[var(--accent-text)] font-bold rounded-xl text-xs flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" /> Copy tất cả {ok.length} lời nhắn
            </button>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-[var(--border)] px-5">
          {ok.map((r) => (
            <li key={r.talentId} className="py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--text)] truncate">{r.name}</p>
                <p className="text-xs text-[var(--text-muted)] font-mono break-all">
                  {loginLabel(r.email)} · <span className="font-bold text-[var(--text)]">{r.password}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => copy([r.talentId], msg(r))}
                aria-label={`Copy lời nhắn cho ${r.name}`}
                className={`shrink-0 min-h-9 px-3 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${copied.has(r.talentId) ? "border-emerald-500/50 text-emerald-500" : "border-[var(--accent)] text-[var(--accent-text)]"}`}
              >
                {copied.has(r.talentId) ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied.has(r.talentId) ? "Đã copy" : "Copy"}
              </button>
            </li>
          ))}
          {failed.map((r) => (
            <li key={r.talentId} className="py-2.5">
              <p className="text-sm font-bold text-[var(--text)]">{r.name}</p>
              <p className="text-xs font-bold text-red-500">Chưa cấp: {r.error}</p>
            </li>
          ))}
        </ul>
        <div className="px-5 py-4 border-t border-[var(--border)]">
          <button type="button" onClick={close} className="w-full min-h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl text-xs">
            Đã gửi hết — Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
