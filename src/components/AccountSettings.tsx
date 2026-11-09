import React, { useState } from "react";
import { SystemUser, Talent } from "../types";
import { useAuth } from "../hooks/useAuth";
import { ChevronDown, Loader2, CheckCircle2, User } from "lucide-react";
import { errorMessage } from "../lib/errorMessage";
import { isAliasEmail, loginLabel } from "../lib/loginName";
import { talentRoleLabel } from "../lib/talentName";
import { PageHeader } from "./common/PageHeader";
import { CalendarFeedCard } from "./talent/CalendarFeedCard";

// Trang "Tài khoản" — MỘT chỗ duy nhất (user duyệt 09/11), vào từ thẻ tên ở góc trái dưới thanh bên. Trước đó có hai trang:
// "Cài đặt" (talent: lịch điện thoại, số điện thoại/ngày sinh/ảnh, email) và "Tài Khoản Của Tôi" (tên, mật khẩu) nối nhau bằng
// một dòng "Đổi mật khẩu", 5 thẻ khung rời nhau. Nay: cột trái = danh tính + lịch ca (chỉ talent), cột phải = các dòng mở tại
// chỗ (mỗi lần một dòng): Thông tin cá nhân (một form, một nút Lưu) / Email đăng nhập / Mật khẩu (kèm "quên mật khẩu").
// Phần dành riêng cho talent (số điện thoại, ngày sinh, ảnh, lịch, đổi email) chỉ hiện khi truyền `myTalent` + `onSaveMyProfile`.

interface AccountSettingsProps {
  activeUser: SystemUser;
  onUpdateUser: (user: SystemUser) => Promise<void>;
  /** Hồ sơ talent của chính mình — chỉ truyền khi role talent. */
  myTalent?: Talent;
  /** Không dùng handleUpdateTalent chung của App (nuốt lỗi bằng alert) — lỗi phải nổi lên đây để báo đỏ tại chỗ (bug C3). */
  onSaveMyProfile?: (patch: { phone: string; avatar: string; dateOfBirth?: string }) => Promise<void>;
}

type RowId = "info" | "email" | "password";
type Msg = { type: "ok" | "err"; text: string } | null;

const INPUT = "mt-1 w-full min-h-10 px-3 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] text-[var(--text)]";
const LABEL = "text-xs font-semibold text-[var(--text-muted)] block";
const BTN_PRIMARY = "px-4 min-h-9 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--accent-contrast)] font-bold rounded-xl text-xs flex items-center gap-2";
const LINK_BTN = "min-h-7 text-xs font-semibold text-[var(--accent-text)] underline underline-offset-2 disabled:opacity-50";
const GROUP_TITLE = "px-4 pt-3 pb-1 text-xs font-bold text-[var(--text-muted)]";

const Notice: React.FC<{ m: Msg }> = ({ m }) =>
  m ? (
    <div className={`text-xs rounded-lg px-3 py-2 border ${m.type === "ok" ? "text-emerald-300 bg-emerald-950/85 border-emerald-500/30" : "text-red-300 bg-red-950/85 border-red-500/30"}`}>{m.text}</div>
  ) : null;

const Row: React.FC<{ id: RowId; open: RowId | null; onToggle: (id: RowId) => void; label: string; value: React.ReactNode; children: React.ReactNode }> = ({ id, open, onToggle, label, value, children }) => {
  const isOpen = open === id;
  return (
    <div className="border-t border-[var(--border-muted)] first:border-t-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] items-center gap-3 min-h-[3.25rem] px-4 text-left hover:bg-[var(--surface-elevated)]"
      >
        <span className="text-sm font-bold text-[var(--text)]">{label}</span>
        <span className="hidden sm:block text-sm text-[var(--text-muted)] truncate">{value}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--text-faint)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
};

export const AccountSettings: React.FC<AccountSettingsProps> = ({ activeUser, onUpdateUser, myTalent, onSaveMyProfile }) => {
  const { reauthenticate, updatePassword, updateEmail, sendPasswordResetEmail, refreshProfile } = useAuth();
  const isTalent = !!myTalent && !!onSaveMyProfile;
  const aliasLogin = isAliasEmail(activeUser.email);
  const [open, setOpen] = useState<RowId | null>("info");
  const toggle = (id: RowId) => setOpen((cur) => (cur === id ? null : id));

  // ---- Thông tin cá nhân: tên hiển thị (+ số điện thoại, ngày sinh, ảnh với talent) — một form, một nút Lưu ----
  const [name, setName] = useState(activeUser.name);
  const [phone, setPhone] = useState(myTalent?.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(myTalent?.dateOfBirth ?? "");
  const [avatar, setAvatar] = useState(myTalent?.avatar ?? "");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState<Msg>(null);
  const nameChanged = name.trim() !== activeUser.name;
  const profileChanged = isTalent && (phone !== (myTalent?.phone ?? "") || dateOfBirth !== (myTalent?.dateOfBirth ?? "") || avatar !== (myTalent?.avatar ?? ""));

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoMessage(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setInfoMessage({ type: "err", text: "Tên hiển thị không được để trống." });
      return;
    }
    setSavingInfo(true);
    try {
      if (nameChanged) {
        await onUpdateUser({ ...activeUser, name: trimmed });
        await refreshProfile();
      }
      if (profileChanged && onSaveMyProfile) await onSaveMyProfile({ phone, avatar, dateOfBirth: dateOfBirth || undefined });
      setInfoMessage({ type: "ok", text: "Đã lưu." });
    } catch (err) {
      setInfoMessage({ type: "err", text: errorMessage(err, "Không thể lưu thông tin.") });
    } finally {
      setSavingInfo(false);
    }
  };

  // ---- Email đăng nhập (talent; vai khác chỉ xem) ----
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState<Msg>(null);
  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMessage(null);
    if (!newEmail.trim()) return;
    setSendingEmail(true);
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
      setSendingEmail(false);
    }
  };

  // ---- Mật khẩu (xác nhận mật khẩu hiện tại) + quên mật khẩu ----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<Msg>(null);
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
  const [sendingReset, setSendingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const handleSendResetEmail = async () => {
    setResetMessage(null);
    setSendingReset(true);
    try {
      const result = await sendPasswordResetEmail(activeUser.email);
      setResetMessage(result.error ? result.error : "Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.");
    } finally {
      setSendingReset(false);
    }
  };

  const avatarUrl = myTalent?.avatar || activeUser.avatar;
  const roleText = myTalent ? talentRoleLabel(myTalent.role) : activeUser.customRoleTitle;
  const summary = [activeUser.name, myTalent?.phone, myTalent?.dateOfBirth ? myTalent.dateOfBirth.split("-").reverse().join("/") : ""].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader icon={User} title="Tài khoản" />

      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-4 lg:items-start">
        {/* Cột trái: danh tính + lịch ca */}
        <div className="space-y-4 min-w-0">
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-3.5" aria-label="Danh tính">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover border border-[var(--border)] shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[var(--accent)]/15 text-[var(--accent-text)] font-black flex items-center justify-center text-lg shrink-0">{activeUser.name.charAt(0) || "?"}</div>
            )}
            <div className="min-w-0 space-y-1">
              <h3 className="text-base font-black text-[var(--text)] leading-tight break-words">{activeUser.name}</h3>
              {roleText && <span className="inline-flex items-center h-5 px-2 rounded-full border text-2xs font-bold seg-on">{roleText}</span>}
              <p className="text-xs text-[var(--text-muted)] break-all">Đăng nhập: {loginLabel(activeUser.email)}</p>
            </div>
          </section>
          {isTalent && <CalendarFeedCard />}
        </div>

        {/* Cột phải: các dòng mở tại chỗ */}
        <div className="space-y-4 min-w-0">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
            <h3 className={GROUP_TITLE}>Hồ sơ</h3>
            <Row id="info" open={open} onToggle={toggle} label="Thông tin cá nhân" value={summary}>
              <form onSubmit={handleSaveInfo} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block sm:col-span-2">
                    <span className={LABEL}>Tên hiển thị</span>
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
                  </label>
                  {isTalent && (
                    <>
                      <label className="block">
                        <span className={LABEL}>Số điện thoại</span>
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} />
                      </label>
                      <label className="block">
                        <span className={LABEL}>Ngày sinh</span>
                        <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={INPUT} />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className={LABEL}>Link ảnh đại diện</span>
                        <input type="text" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://..." className={`${INPUT} font-mono`} />
                      </label>
                    </>
                  )}
                </div>
                <Notice m={infoMessage} />
                <button type="submit" disabled={savingInfo || !(nameChanged || profileChanged)} className={BTN_PRIMARY}>
                  {savingInfo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Lưu thông tin
                </button>
              </form>
            </Row>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
            <h3 className={GROUP_TITLE}>Đăng nhập và bảo mật</h3>
            <Row id="email" open={open} onToggle={toggle} label="Email đăng nhập" value={aliasLogin ? "chưa có email" : activeUser.email}>
              {!isTalent ? (
                <p className="text-xs text-[var(--text-faint)]">
                  {aliasLogin ? "Tài khoản đăng nhập bằng tên, chưa có email — nhờ quản lý thêm." : "Email đăng nhập không tự đổi ở đây — nhờ quản lý đổi giúp."}
                </p>
              ) : aliasLogin ? (
                // Tài khoản đăng nhập bằng tên (lib/loginName.ts): Supabase đòi xác nhận ở địa chỉ cũ — địa chỉ nội bộ không nhận thư được
                // ⇒ quản lý thêm email ở Phân Quyền & Role (đổi bằng service_role, không cần xác nhận).
                <p className="text-xs text-[var(--text-faint)]">
                  Bạn đang đăng nhập bằng tên <span className="font-mono font-bold text-[var(--text-muted)]">{loginLabel(activeUser.email)}</span>, chưa có email. Gửi email của bạn cho quản lý để họ thêm vào tài khoản.
                </p>
              ) : (
                <form onSubmit={handleChangeEmail} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className={LABEL}>Email mới</span>
                      <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={INPUT} />
                    </label>
                    <label className="block">
                      <span className={LABEL}>Mật khẩu hiện tại</span>
                      <input type="password" required value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} className={INPUT} />
                    </label>
                  </div>
                  <Notice m={emailMessage} />
                  <button type="submit" disabled={sendingEmail} className={BTN_PRIMARY}>
                    {sendingEmail && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Gửi yêu cầu đổi email
                  </button>
                  <p className="text-2xs text-[var(--text-faint)]">Email chỉ đổi sau khi bạn xác nhận qua link gửi tới địa chỉ mới.</p>
                </form>
              )}
            </Row>
            <Row id="password" open={open} onToggle={toggle} label="Mật khẩu" value="••••••••">
              <form onSubmit={handleChangePassword} className="space-y-3">
                <label className="block">
                  <span className={LABEL}>Mật khẩu hiện tại</span>
                  <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={INPUT} />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className={LABEL}>Mật khẩu mới</span>
                    <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={INPUT} />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Nhập lại mật khẩu mới</span>
                    <input type="password" required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={INPUT} />
                  </label>
                </div>
                <Notice m={passwordMessage} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <button type="submit" disabled={savingPassword} className={BTN_PRIMARY}>
                    {savingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Đổi mật khẩu
                  </button>
                  {!aliasLogin && (
                    <button type="button" onClick={handleSendResetEmail} disabled={sendingReset} className={LINK_BTN}>
                      Quên mật khẩu hiện tại? Gửi email đặt lại
                    </button>
                  )}
                </div>
                {resetMessage && (
                  <div className="text-xs text-[var(--text-muted)] bg-[var(--surface-base)]/60 border border-[var(--border)]/60 rounded-lg px-3 py-2 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    {resetMessage}
                  </div>
                )}
                {/* Tài khoản chưa có email (tên đăng nhập) không nhận thư được: nhờ quản lý đặt lại. */}
                {aliasLogin && (
                  <p className="text-2xs text-[var(--text-faint)]">
                    Quên mật khẩu hiện tại? Tài khoản này chưa có email nên không gửi thư đặt lại được — nhờ quản lý bấm "Đặt lại mật khẩu" ở Phân Quyền & Role rồi gửi mật khẩu tạm cho bạn.
                  </p>
                )}
              </form>
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
};
