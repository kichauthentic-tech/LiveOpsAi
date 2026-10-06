import { useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { credentialMessage } from "../lib/talentAccounts";

// Hộp hiện mật khẩu tạm MỘT lần (server không lưu lại) + lời nhắn dán Zalo. Dùng khi cấp tài khoản cho hồ sơ có sẵn
// (TalentAccountGrants) và khi admin "Đặt lại mật khẩu" (UserRoleSettings).

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
