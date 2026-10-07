import React, { useMemo, useState } from "react";
import { Talent, Brand, UserRole, LiveSession } from "../types";
import { Users, Sparkles, Search, Plus, Edit3, Trash2, X, Phone, Loader2, AlertTriangle, KeyRound, ChevronDown } from "lucide-react";
import { authedFetch } from "../lib/authedFetch";
import { computeTalentRealTotals, computeTalentBrandPerf } from "../lib/metrics/avgGmv";
import { REPORT_PLATFORMS, type ReportPlatform } from "../lib/reportPlatform";
import { PlatformChip } from "./common/PlatformChip";
import { errorMessage } from "../lib/errorMessage";
import { useConfirm } from "../hooks/useConfirm";

import { talentRateLabel } from "../lib/talentRate";
import { fmtVndShort, fmtVndFull, fmtFixed } from "../lib/format";
import { statusLabel } from "../lib/statusLabels";
import { METRIC, metricHint } from "../lib/metricGlossary";
import { PageHeader } from "./common/PageHeader";
import { talentRoleLabel } from "../lib/talentName";
const Dash: React.FC = () => <span className="text-[var(--text-faint)]">—</span>;

// Ảnh đại diện: 0/33 hồ sơ thật có ảnh, nên trước đây cả 33 người hiện CHUNG một ảnh stock
// Unsplash của một người lạ — mặt người là thứ dễ tin nhất trên thẻ, không được bịa. Không có ảnh
// thì hiện chữ cái đầu của tên.
const TalentAvatar: React.FC<{ talent: Talent; className?: string }> = ({ talent, className = "w-14 h-14" }) => {
  const src = talent.avatar || "";
  if (src) return <img src={src} alt={talent.name} className={`${className} rounded-full object-cover border-2 border-[var(--accent)] shadow-sm shrink-0`} />;
  const initials = talent.name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div
      aria-hidden
      className={`${className} rounded-full shrink-0 border-2 border-[var(--accent)] bg-[var(--surface-elevated)] text-[var(--accent-text)] font-bold flex items-center justify-center`}
    >
      {initials}
    </div>
  );
};

interface TalentMatchResult {
  talentId: string;
  name: string;
  matchScore: number;
  predictedGmv: string;
  reasoning: string;
}

export interface NewTalentAccountPayload {
  name: string;
  email: string;
  phone: string;
  role: Talent["role"];
  gender: string;
  niches: string[];
  avatar: string;
  avgGmvPerSession: number;
  totalGmv: number;
  ctrAvg: number;
  cvrAvg: number;
  overallScore: number;
  ratePerSession: number;
  ratePerHour: number;
  assistantRatePerHour: number;
  commissionRate: number;
  availabilityStatus: "Available" | "Busy" | "On Live";
}

interface TalentMatcherProps {
  currentRole: UserRole;
  talents: Talent[];
  brands: Brand[];
  // Số GMV/số ca của talent cộng từ ca thật, thay cho cột nhập tay trên hồ sơ (audit 2026-09-21).
  sessions: LiveSession[];
  onCreateTalentAccount?: (payload: NewTalentAccountPayload) => Promise<string | undefined>;
  onUpdateTalent?: (id: string, patch: Partial<Talent>) => void;
  onDeleteTalent?: (id: string) => void;
}

/** Hồ sơ ghi Host mà chỉ từng chạy trợ live (hoặc ngược lại). */
function roleMismatch(role: string | undefined, real: { sessionCount: number; assistSessionCount: number }): boolean {
  const isAssistant = role === "Assistant";
  return isAssistant ? real.sessionCount > 0 && real.assistSessionCount === 0 : real.assistSessionCount > 0 && real.sessionCount === 0;
}

// Màu thanh GMV theo sàn, cùng tông với nhãn sàn (PlatformChip) để nhận ra không cần đọc chữ.
const GMV_BAR: Record<ReportPlatform, string> = { TikTok: "bg-cyan-400/80", Shopee: "bg-orange-400/80" };

/** Tổng ca đã chạy (host + trợ): thước đo "ai đang làm việc" của danh sách. */
const totalCa = (r: { real: { sessionCount: number; assistSessionCount: number } }) => r.real.sessionCount + r.real.assistSessionCount;

export const TalentMatcher: React.FC<TalentMatcherProps> = ({
  currentRole,
  talents,
  brands,
  sessions,
  onCreateTalentAccount,
  onUpdateTalent,
  onDeleteTalent
}) => {
  const confirm = useConfirm();
  // Rate Card/Hoa hồng — chỉ ceo/admin xem được (đúng dữ liệu trả về từ view `talents_secure`,
  // vốn đã mask thành 0 cho role khác — ẩn luôn UI cho nhất quán thay vì hiện "0đ" gây hiểu lầm).
  // Tạo talent mới giờ luôn kèm tạo account thật (Supabase Admin API) nên cũng chỉ ceo/admin
  // làm được — dùng chung điều kiện này cho cả 2 mục đích.
  const canSeeRate = currentRole === "ceo" || currentRole === "admin";
  const [selectedBrandId, setSelectedBrandId] = useState("brand-1");
  const [targetCategory, setTargetCategory] = useState("Mỹ phẩm Skincare");
  // Sàn của ca cần ghép host: số GMV gửi AI chỉ của sàn này (user chốt 07/10: không gộp hiệu suất hai sàn).
  const [matchPlatform, setMatchPlatform] = useState<ReportPlatform>("TikTok");
  const [matchingResults, setMatchingResults] = useState<TalentMatchResult[] | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  // 2026-10-01: bỏ hẳn bảng xếp hạng thay thế khi AI không chạy được. Hai bản trước đều là số bịa
  // đội lốt "Match Score": server trả `96 − index×5` (tức VỊ TRÍ TRONG MẢNG) và client rơi về
  // `overallScore` (điểm chung của talent, không phải độ hợp với brand này) — cả hai đều kèm
  // predictedGmv = GMV trung bình × 1,25. Không có AI thì KHÔNG có xếp hạng độ phù hợp; nói thẳng
  // là chưa bật, đừng hiện một bảng để người dùng xếp ca theo nó.
  const [matchingError, setMatchingError] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("All");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTalent, setEditingTalent] = useState<Talent | null>(null);

  // Hồ sơ bên phải: người đang chọn. `sheetOpen` chỉ có nghĩa ở < xl, nơi hồ sơ mở thành tấm phủ màn hình.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Form State
  const [formName, setFormName] = useState("");
  const [formNickname, setFormNickname] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  // Mật khẩu ngẫu nhiên server vừa sinh cho tài khoản talent mới — chỉ giữ trong state client
  // (không lưu đâu khác), hiện 1 lần cho ops copy rồi đóng modal là mất, không xem lại được
  // (audit 2026-09-24, thay "000000" hardcode).
  const [revealCreds, setRevealCreds] = useState<{ email: string; password: string } | null>(null);
  const [formRole, setFormRole] = useState<Talent["role"]>("Host");
  const [formGender, setFormGender] = useState("Nữ");
  const [formNiches, setFormNiches] = useState("Mỹ phẩm, Skincare");
  const [formGmv, setFormGmv] = useState(0);
  const [formTotalGmv, setFormTotalGmv] = useState(0);
  const [formCvr, setFormCvr] = useState(0);
  const [formCtr, setFormCtr] = useState(0);
  const [formRateHour, setFormRateHour] = useState(0);
  const [formAssistantRateHour, setFormAssistantRateHour] = useState(0);
  const [formScore, setFormScore] = useState(0);
  // FIX L5 (audit 2026-08-21): trước đây mặc định số điện thoại/avatar demo cố định (nhìn như đã
  // nhập thật) và brandsWorkedWith luôn gán "Agency Network" (không phải brand nào trong hệ thống)
  // — dễ lưu nhầm vào DB nếu ops không để ý sửa. Để trống, input avatar đã có placeholder ví dụ.
  const [formPhone, setFormPhone] = useState("");
  const [formAvatar, setFormAvatar] = useState("");

  const openAddModal = () => {
    setEditingTalent(null);
    setCreateAccountError(null);
    setFormName("");
    setFormNickname("");
    setFormEmail("");
    setFormRole("Host");
    setFormGender("Nữ");
    setFormNiches("");
    // Tạo mới: mọi số về 0 — hiệu suất tự tính từ ca thật, rate ops nhập tay (không còn số demo).
    setFormGmv(0);
    setFormTotalGmv(0);
    setFormCvr(0);
    setFormCtr(0);
    setFormRateHour(0);
    setFormAssistantRateHour(0);
    setFormScore(0);
    setFormPhone("");
    setFormAvatar("");
    setIsModalOpen(true);
  };

  const openEditModal = (t: Talent) => {
    setEditingTalent(t);
    setFormName(t.name);
    setFormNickname(t.nickname ?? "");
    setFormRole(t.role || "Host");
    setFormGender(t.gender || "Nữ");
    setFormNiches((t.niches ?? []).join(", "));
    // Không điền số demo thay cho 0 (bug thời mock: talent thật rate = 0 mở form là thấy 5tr/live,
    // 3.5% hoa hồng, GMV 150tr, điểm 90 — bấm Lưu là ghi thẳng vào DB). 0 là 0.
    setFormGmv(t.avgGmvPerSession || 0);
    setFormTotalGmv(t.totalGmv || 0);
    setFormCvr(t.cvrAvg || 0);
    setFormCtr(t.ctrAvg || 0);
    setFormRateHour(t.ratePerHour || 0);
    setFormAssistantRateHour(t.assistantRatePerHour || 0);
    setFormScore(t.overallScore || 0);
    setFormPhone(t.phone || "");
    setFormAvatar(t.avatar || "");
    setIsModalOpen(true);
  };

  const handleSaveTalent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const nichesParsed = formNiches.split(",").map((s) => s.trim()).filter(Boolean);

    const basePayload: Omit<Talent, "id" | "ratePerSession" | "ratePerHour" | "assistantRatePerHour" | "commissionRate"> = {
      name: formName,
      nickname: formNickname.trim(),
      avatar: formAvatar,
      role: formRole,
      gender: formGender,
      niches: nichesParsed,
      avgGmvPerSession: Number(formGmv),
      totalGmv: Number(formTotalGmv),
      ctrAvg: Number(formCtr),
      cvrAvg: Number(formCvr), // 4 số trên không còn ô nhập: giữ nguyên giá trị cũ của hồ sơ (0 khi tạo mới)
      overallScore: Number(formScore),
      // Trạng thái (sẵn sàng / có ca / đang live) app tự suy từ lịch (App.activeTalents — hồ sơ ở màn này là bản ĐÃ suy).
      // Ô gõ tay bỏ 06/10 (đo: 39/39 hồ sơ = Available) — lưu nền "Sẵn sàng", không ghi trạng thái suy ra xuống DB.
      availabilityStatus: "Available",
      brandsWorkedWith: editingTalent?.brandsWorkedWith || [],
      phone: formPhone
    };

    if (editingTalent) {
      // Partial update — chỉ gửi rate/commissionRate nếu currentRole thấy được field này (form
      // không hiện input cho non-ceo/admin nên formRateHour/formCommission vẫn giữ giá trị cũ = 0 từ
      // view mask — gửi lên sẽ vô tình ghi đè rate thật thành 0 nếu không loại trừ ở đây).
      const patch: Partial<Talent> = { ...basePayload };
      if (canSeeRate) {
        patch.ratePerHour = Number(formRateHour);
        patch.assistantRatePerHour = Number(formAssistantRateHour);
      }
      if (onUpdateTalent) onUpdateTalent(editingTalent.id, patch);
      setIsModalOpen(false);
      return;
    }

    // Tạo mới — luôn kèm tạo account thật (server tự sinh mật khẩu ngẫu nhiên, xem
    // handleCreateTalentAccount/App.tsx), không còn tạo hồ sơ Talent Pool đứng một mình nữa.
    // Gọi server thật nên cần chờ + hiện lỗi nếu email trùng...
    if (!formEmail.trim()) return;
    setCreateAccountError(null);
    setIsCreatingAccount(true);
    try {
      if (onCreateTalentAccount) {
        const email = formEmail.trim();
        const generatedPassword = await onCreateTalentAccount({
          ...basePayload,
          email,
          ratePerSession: 0,
          ratePerHour: Number(formRateHour),
          assistantRatePerHour: Number(formAssistantRateHour),
          // Không có hoa hồng theo GMV cho talent (user chốt 06/10) — ô nhập đã bỏ.
          commissionRate: 0
        });
        if (generatedPassword) {
          setRevealCreds({ email, password: generatedPassword });
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      setCreateAccountError(errorMessage(err, "Không thể tạo tài khoản Talent mới."));
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (await confirm(`Bạn có chắc chắn muốn xóa Talent "${name}" khỏi hệ thống?`, { danger: true })) {
      if (onDeleteTalent) onDeleteTalent(id);
    }
  };

  const handleRunMatching = async () => {
    const activeBrand = brands.find((b) => b.id === selectedBrandId) || brands[0];
    // Gửi số THẬT cộng từ ca, không phải số gõ tay trong hồ sơ (phần lớn = 0) — server chỉ giữ id/tên/ngành/GMV.
    const rawTalents = (talents ?? []).map((t) => {
      const p = computeTalentRealTotals(sessions, t.id).perf[matchPlatform];
      return { id: t.id, name: t.name, niches: t.niches, avgGmvPerSession: Math.round(p.avgGmvPerSession), totalGmv: Math.round(p.gmv) };
    });
    setIsMatching(true);
    setMatchingError(null);
    try {
      const res = await authedFetch("/api/gemini/match-talents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: activeBrand, targetCategory, platform: matchPlatform, talents: rawTalents })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.results) && data.results.length > 0) {
        setMatchingResults(data.results);
        return;
      }
      throw new Error(data.error || "AI không trả về gợi ý nào.");
    } catch (e) {
      setMatchingResults(null);
      setMatchingError(errorMessage(e, "Không gọi được AI ghép host."));
    } finally {
      setIsMatching(false);
    }
  };
  // Số cộng từ ca thật tính MỘT lần cho cả danh sách (gõ ô tìm kiếm không tính lại). Xếp người đã chạy ca lên trước:
  // 16/33 hồ sơ chưa gắn với ca nào, để xen kẽ theo thứ tự DB thì phải lướt hết danh sách mới biết ai đang làm việc.
  // Tổng ca đã chạy trước (người trợ 86 ca làm việc nhiều hơn người host 3 ca), ca host là tiêu chí phụ vì đó mới là vai gánh GMV.
  const allRows = useMemo(
    () =>
      talents
        .map((t) => ({ t, real: computeTalentRealTotals(sessions, t.id), rate: talentRateLabel(t) }))
        .sort((a, b) => totalCa(b) - totalCa(a) || b.real.sessionCount - a.real.sessionCount || a.t.name.localeCompare(b.t.name, "vi")),
    [talents, sessions]
  );
  const query = searchTerm.trim().toLowerCase();
  const rosterRows = allRows.filter(
    ({ t }) =>
      (selectedRoleFilter === "All" || t.role === selectedRoleFilter) &&
      (!query || t.name.toLowerCase().includes(query) || (t.nickname ?? "").toLowerCase().includes(query) || (t.phone ?? "").includes(query))
  );
  const activeRows = rosterRows.filter((r) => totalCa(r) > 0);
  const idleRows = rosterRows.filter((r) => totalCa(r) === 0);
  // Dải tổng quan và số đếm trên nút lọc tính trên TOÀN BỘ talent, không đổi theo ô tìm kiếm.
  const overview = {
    all: allRows.length,
    active: allRows.filter((r) => totalCa(r) > 0).length,
    hours: allRows.reduce((s, r) => s + r.real.hours + r.real.assistHours, 0),
    hosts: talents.filter((t) => t.role !== "Assistant").length,
    assistants: talents.filter((t) => t.role === "Assistant").length
  };
  const maxCa = Math.max(1, ...allRows.map(totalCa));

  // Hồ sơ bên phải: người đang chọn, hoặc người đầu danh sách khi chưa chọn / người đã chọn bị lọc mất.
  const selected = rosterRows.find((r) => r.t.id === selectedId) ?? rosterRows[0] ?? null;
  const selectedBrandPerf = selected ? computeTalentBrandPerf(sessions, selected.t.id, brands.map((b) => b.id)) : [];
  const selectedGmvMax = selected ? Math.max(...REPORT_PLATFORMS.map((p) => selected.real.perf[p].gmv)) : 0;

  const renderRow = (r: (typeof allRows)[number]) => {
    const { t, real } = r;
    const isSel = selected?.t.id === t.id;
    const n = totalCa(r);
    const parts = [
      real.sessionCount > 0 && `${real.sessionCount} ca host${real.hours > 0 ? ` · ${fmtFixed(real.hours, 0)}h` : ""}`,
      real.assistSessionCount > 0 && `${real.assistSessionCount} ca trợ${real.assistHours > 0 ? ` · ${fmtFixed(real.assistHours, 0)}h` : ""}`
    ].filter(Boolean);
    return (
      <button
        key={t.id}
        type="button"
        aria-pressed={isSel}
        onClick={() => {
          setSelectedId(t.id);
          setSheetOpen(true);
        }}
        className={`w-full text-left grid grid-cols-[2.25rem_minmax(0,1fr)_2rem] sm:grid-cols-[2.25rem_minmax(0,1fr)_5.5rem_2rem] items-center gap-3 px-3 py-2.5 border-b border-l-2 border-b-[var(--border-muted)] transition-colors ${
          isSel ? "bg-[var(--accent)]/15 border-l-[var(--accent-text)]" : "border-l-transparent hover:bg-[var(--surface-elevated)]/50"
        }`}
      >
        <TalentAvatar talent={t} className="w-9 h-9 text-xs" />
        <span className="min-w-0 block">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-[var(--text)] text-[13px] truncate">{t.name}</span>
            {/* Vai trò gõ tay một lần, không đối chiếu ca thật (audit người mới 2026-10-04: "Host" mà 86 ca đều
                là trợ live). Lệch thì nói ra để ops sửa hồ sơ — không tự đổi. */}
            {roleMismatch(t.role, real) && (
              <span className="text-amber-300 shrink-0" title={`Vai trò trên hồ sơ khác với vai người này thật sự chạy trong ca (chỉ chạy ${t.role === "Assistant" ? "host" : "trợ live"}) — mở hồ sơ để sửa`}>
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)] min-w-0">
            <span className="bg-[var(--accent)]/50 text-[var(--accent-text)] font-bold px-1.5 py-0.5 rounded shrink-0">{talentRoleLabel(t.role)}</span>
            <span className="truncate">{parts.length ? parts.join(" · ") : "Chưa gắn với ca nào"}</span>
          </span>
        </span>
        <span className="hidden sm:block h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden" title="Tổng ca so với người chạy nhiều nhất">
          <span className="block h-full rounded-full bg-[var(--accent-text)]/70" style={{ width: `${Math.round((n / maxCa) * 100)}%` }} />
        </span>
        <span className="text-right font-mono text-[13px] font-bold text-[var(--text)]">{n || <Dash />}</span>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Talent Pool"
        description="Host và trợ live của agency: vai trò, số ca, GMV và rate. Chọn một người để xem hồ sơ bên cạnh."
      />

      {/* Dải tổng quan — trả lời "đội đang ở trạng thái nào" trước khi lướt danh sách. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Talent", value: String(overview.all) },
          { label: "Đã chạy ca", value: String(overview.active) },
          { label: "Giờ host + trợ", value: `${fmtFixed(overview.hours, 0)}h` },
          { label: "Chưa gắn ca", value: String(overview.all - overview.active) }
        ].map((k) => (
          <div key={k.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <p className="text-[11px] text-[var(--text-faint)] font-semibold">{k.label}</p>
            <p className="text-xl font-bold text-[var(--text)] font-mono">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Danh sách (trái) + hồ sơ (phải).
          M6 (audit UX lần 2): 33 thẻ × 224px = 3,7 màn, mà 4/6 ô dữ liệu của thẻ GIỐNG HỆT NHAU ở cả 33 người — nên danh sách
          chỉ giữ thứ phân biệt được người này với người kia (vai trò, số ca, giờ, khối lượng), còn chi tiết nằm ở hồ sơ bên phải.
          Ở < xl hồ sơ mở thành tấm trượt phủ màn hình khi bấm một dòng. */}
      <div className="grid xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
          <div className="p-3 sm:p-4 space-y-3 border-b border-[var(--border)]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[10rem]">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo tên hoặc SĐT"
                  aria-label="Tìm talent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--text-faint)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-medium"
                />
              </div>
              {/* Thêm talent — tạo mới kèm tạo account thật nên chỉ ceo/admin */}
              {canSeeRate && (
                <button
                  onClick={openAddModal}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
                >
                  <Plus className="w-4 h-4" /> Thêm talent
                </button>
              )}
            </div>
            <div className="flex border border-[var(--border)] rounded-xl overflow-hidden text-xs font-bold" role="group" aria-label="Lọc theo vai trò">
              {[
                { v: "All", label: "Tất cả", n: overview.all },
                { v: "Host", label: "Host", n: overview.hosts },
                { v: "Assistant", label: "Trợ live", n: overview.assistants }
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={selectedRoleFilter === o.v}
                  onClick={() => setSelectedRoleFilter(o.v)}
                  className={`flex-1 py-2 transition-colors ${
                    selectedRoleFilter === o.v ? "bg-[var(--accent)]/30 text-[var(--accent-text)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
                  }`}
                >
                  {o.label} <span className="font-mono font-normal">{o.n}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-faint)]">
              Số ca và giờ cộng <b>mọi tháng</b> đã chạy (Hiệu Suất Host mặc định chỉ xem 90 ngày gần nhất). Xếp theo tổng ca.
            </p>
          </div>

          {rosterRows.length === 0 && <p className="py-8 text-center text-xs text-[var(--text-faint)]">Không có talent nào khớp bộ lọc.</p>}
          {activeRows.map(renderRow)}
          {idleRows.length > 0 && (
            <>
              {/* Dòng ngăn để mắt dừng lại thay vì lướt qua một dải "—" dài không biết bắt đầu từ đâu. */}
              {activeRows.length > 0 && (
                <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--text-muted)] bg-[var(--surface-elevated)]/50 border-b border-[var(--border-muted)]">
                  {idleRows.length} hồ sơ chưa gắn với ca nào
                  <span className="text-[var(--text-faint)] font-normal"> — tài khoản mới hoặc chưa được xếp ca</span>
                </div>
              )}
              {idleRows.map(renderRow)}
            </>
          )}
        </div>

        {/* Hồ sơ talent đang chọn */}
        {sheetOpen && <div className="xl:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setSheetOpen(false)} />}
        <aside
          className={`${
            sheetOpen ? "fixed inset-x-0 bottom-0 top-14 z-50 rounded-t-2xl" : "hidden"
          } xl:block xl:sticky xl:inset-x-auto xl:bottom-auto xl:top-4 xl:z-auto xl:rounded-2xl xl:max-h-[calc(100vh-2rem)] overflow-y-auto bg-[var(--surface)] border border-[var(--border)] shadow-sm`}
        >
          {!selected ? (
            <p className="p-8 text-center text-xs text-[var(--text-faint)]">Chọn một talent để xem hồ sơ.</p>
          ) : (
            <div className="p-4 sm:p-5 space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <TalentAvatar talent={selected.t} className="w-14 h-14 text-lg" />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-[var(--text)] text-base leading-tight">{selected.t.name}</h4>
                  <p className="text-[var(--text-muted)] mt-0.5 flex flex-wrap items-center gap-x-1.5">
                    {selected.t.nickname && <span>{selected.t.nickname} ·</span>}
                    <span className="bg-[var(--accent)]/50 text-[var(--accent-text)] text-[11px] font-bold px-1.5 py-0.5 rounded">{talentRoleLabel(selected.t.role)}</span>
                    {selected.t.availabilityStatus && selected.t.availabilityStatus !== "Available" && (
                      <span
                        className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                          selected.t.availabilityStatus === "On Live" ? "bg-red-900/80 text-red-300" : "bg-amber-900/80 text-amber-300"
                        }`}
                      >
                        {statusLabel(selected.t.availabilityStatus)}
                      </span>
                    )}
                  </p>
                  <p className="text-[var(--text-muted)] flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3 shrink-0" /> {selected.t.phone || <span className="text-[var(--text-faint)]">Chưa có SĐT</span>}
                  </p>
                  <p className="text-[var(--text-faint)] mt-0.5">
                    {[selected.t.gender, (selected.t.niches || []).join(", ")].filter(Boolean).join(" • ") || <Dash />}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditModal(selected.t)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--accent-hover)]/40 rounded-lg transition-all"
                    title="Chỉnh sửa Talent"
                    aria-label="Chỉnh sửa Talent"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(selected.t.id, selected.t.name)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-950/80 rounded-lg transition-all"
                    title="Xóa Talent"
                    aria-label="Xóa Talent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSheetOpen(false)}
                    className="xl:hidden p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] rounded-lg"
                    aria-label="Đóng hồ sơ"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {roleMismatch(selected.t.role, selected.real) && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Hồ sơ ghi {talentRoleLabel(selected.t.role)} nhưng người này chỉ chạy {selected.t.role === "Assistant" ? "host" : "trợ live"} trong ca — bấm ✏️ để sửa vai trò.
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Ca host", value: selected.real.sessionCount || null },
                  { label: "Ca trợ", value: selected.real.assistSessionCount || null },
                  { label: "Giờ host", value: selected.real.hours > 0 ? `${fmtFixed(selected.real.hours, 1)}h` : null },
                  { label: "Giờ trợ", value: selected.real.assistHours > 0 ? `${fmtFixed(selected.real.assistHours, 1)}h` : null }
                ].map((k) => (
                  <div key={k.label} className="bg-[var(--surface-base)]/40 border border-[var(--border)] rounded-xl px-3 py-2">
                    <p className="text-[11px] text-[var(--text-faint)]">{k.label}</p>
                    <p className="text-base font-bold text-[var(--text)] font-mono">{k.value ?? <Dash />}</p>
                  </div>
                ))}
              </div>
              {selected.real.sessionCount === 0 && selected.real.assistSessionCount > 0 && (
                <p className="text-[11px] text-[var(--text-faint)]">
                  GMV của ca tính cho host, nên người chỉ chạy vai trợ không có GMV lũy kế — không phải chưa làm ca nào.
                </p>
              )}

              {/* GMV TÁCH THEO SÀN (user chốt 07/10: không bao giờ cộng hiệu suất TikTok với Shopee) — mỗi sàn một thanh, không có tổng. */}
              <div className="space-y-2">
                <p className="font-bold text-[var(--text-muted)]">GMV theo sàn <span className="font-normal text-[var(--text-faint)]">(mỗi sàn một thanh, không cộng gộp)</span></p>
                {selectedGmvMax > 0 ? (
                  REPORT_PLATFORMS.map((p) => {
                    const g = selected.real.perf[p].gmv;
                    return (
                      <div key={p} className="flex items-center gap-2">
                        <span className="w-16 shrink-0"><PlatformChip platform={p} /></span>
                        <span className="flex-1 h-2 rounded-full bg-[var(--surface-elevated)] overflow-hidden">
                          <span className={`block h-full rounded-full ${GMV_BAR[p]}`} style={{ width: `${Math.round((g / selectedGmvMax) * 100)}%` }} />
                        </span>
                        <span className="w-16 text-right font-mono font-bold text-[var(--text)]">{g > 0 ? fmtVndShort(g) : <Dash />}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[11px] text-[var(--text-faint)]">Chưa có GMV ở sàn nào.</p>
                )}
              </div>

              {/* GMV/giờ TÁCH THEO BRAND, không có số gộp: GMV/giờ phụ thuộc ngành hàng và giá bán của
                  brand nhiều hơn phụ thuộc người chạy, nên gộp lại rồi xếp hạng là so host bán giày với
                  host bán đồ lót. Ngưỡng "đủ mẫu" dùng chung với hostSuggestion (3 ca). */}
              <div className="space-y-1.5">
                <p className="font-bold text-[var(--text-muted)]" title={metricHint(METRIC.gmvPerHour)}>
                  {METRIC.gmvPerHour} theo kênh (brand × sàn)
                </p>
                {selectedBrandPerf.every((b) => b.sessions === 0) ? (
                  <p className="text-[11px] text-[var(--text-faint)]">Chưa chạy ca nào có số cho kênh nào.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedBrandPerf.filter((b) => b.sessions > 0).map((b) => {
                      const brand = brands.find((x) => x.id === b.brandId);
                      return (
                        <li key={`${b.brandId}|${b.platform}`} className="flex items-baseline justify-between gap-3 border-b border-[var(--border)]/60 pb-1">
                          <span className="text-[var(--text)] font-medium">{brand?.name ?? b.brandId} <PlatformChip platform={b.platform} /></span>
                          <span className="shrink-0 font-mono text-[var(--text)] text-right">
                            <b className="text-emerald-400">{fmtVndShort(Math.round(b.gmvPerHour))}</b>/giờ
                            <span className="text-[var(--text-faint)] font-sans block sm:inline">
                              {" · "}{b.sessions} ca · {fmtFixed(b.hours, 1)}h · {b.confidence === "ok" ? "đủ mẫu" : "ít mẫu"}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">
                  Không có số GMV/giờ gộp mọi brand hay gộp hai sàn: chỉ số này phụ thuộc ngành hàng, giá bán và sàn hơn là người chạy.
                  Muốn xếp hạng host trong một brand thì mở Hiệu Suất Host (có lọc brand, thứ và khung giờ).
                </p>
              </div>

              {canSeeRate && (
                <div className="grid grid-cols-2 gap-2 bg-amber-950/30 p-3 rounded-xl border border-amber-500/30">
                  <div>Rate Card: <strong className="text-[var(--text)] block text-sm font-bold">{selected.t.rateHidden ? "ẩn" : selected.rate ?? <span className="text-[var(--text-faint)] font-normal">chưa đặt</span>}</strong></div>
                  <div>Rate trợ live: <strong className="text-[var(--text)] block text-sm font-bold">{selected.t.rateHidden ? "ẩn" : (selected.t.assistantRatePerHour || 0) > 0 ? `${fmtVndFull(selected.t.assistantRatePerHour || 0)}/giờ` : <span className="text-[var(--text-faint)] font-normal">theo rate host</span>}</strong></div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      {/* Trình AI khớp nối — công cụ phụ, xếp sau danh sách và gập lại.
          Trước đây chiếm 144px đầu trang, mặc định brand đầu danh sách (Franklin, 0 ca). */}
      <details className="group bg-gradient-to-r from-[var(--accent)]/25 to-[var(--surface)] text-[var(--text)] rounded-2xl border border-[var(--accent)]/50 shadow-lg">
        <summary className="list-none cursor-pointer px-6 py-4 flex items-center gap-2 text-[var(--accent-text)] font-bold text-sm">
          <Sparkles className="w-5 h-5 text-[var(--accent-text)] shrink-0" />
          Gợi ý host bằng AI
          <ChevronDown className="w-4 h-4 ml-auto shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-6 pb-6 space-y-4">
          <div className="grid md:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="text-[var(--text-muted)] block mb-1 font-semibold">Chọn Thương Hiệu (Brand):</label>
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="w-full bg-[var(--surface-elevated)] text-[var(--text)] p-2.5 rounded-xl border border-[var(--border)] font-bold focus:ring-2 focus:ring-[var(--accent)]"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.industry})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="match-platform" className="text-[var(--text-muted)] block mb-1 font-semibold">Sàn của ca:</label>
              <select
                id="match-platform"
                value={matchPlatform}
                onChange={(e) => setMatchPlatform(e.target.value as ReportPlatform)}
                className="w-full bg-[var(--surface-elevated)] text-[var(--text)] p-2.5 rounded-xl border border-[var(--border)] font-bold focus:ring-2 focus:ring-[var(--accent)]"
              >
                {REPORT_PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[var(--text-muted)] block mb-1 font-semibold">Danh Mục Sản Phẩm SKU:</label>
              <input
                type="text"
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value)}
                className="w-full bg-[var(--surface-elevated)] text-[var(--text)] p-2.5 rounded-xl border border-[var(--border)] font-bold focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleRunMatching}
                disabled={isMatching}
                className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold p-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow"
              >
                <Sparkles className="w-4 h-4" /> {isMatching ? "Đang Phân Tích..." : "AI Tìm Top Host Phù Hợp"}
              </button>
            </div>
          </div>

          {matchingError && (
            <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-950/40 border border-amber-500/40 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {matchingError}
                <br />
                Không có kết quả AI thì màn này không xếp hạng độ phù hợp — bảng Talent Pool bên dưới vẫn có GMV, số ca và giờ live thật của từng người.
              </span>
            </div>
          )}

          {/* AI Matching Output Results */}
          {matchingResults && (
            <div className="bg-[var(--surface-base)]/80 p-4 rounded-xl border border-[var(--accent)]/80 space-y-3 pt-4 text-xs">
              <h4 className="font-bold text-[var(--accent-text)] text-sm">Gợi Ý Top Host Phù Hợp Nhất Cho Brand:</h4>
              <div className="grid md:grid-cols-2 gap-4">
                {matchingResults.map((r, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--accent)]/40 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-sm text-[var(--text)]">{r.name}</span>
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                        Match Score: {r.matchScore}%
                      </span>
                    </div>
                    <p className="text-[var(--text-muted)] text-[11px] leading-relaxed">{r.reasoning}</p>
                    <div className="text-right text-[11px] text-emerald-400 font-mono font-bold">Dự đoán GMV: {r.predictedGmv}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      {/* Talent Form Modal (Add / Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-xl rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[var(--surface)] text-[var(--text)] px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--accent-text)]" />
                {editingTalent ? `Sửa talent: ${editingTalent.name}` : "Thêm talent"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 -m-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTalent} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Tên Talent / Host *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="VD: Nguyễn Thị Kim Vân"
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Tên ngắn trên lịch</label>
                  <input
                    type="text"
                    value={formNickname}
                    onChange={(e) => setFormNickname(e.target.value)}
                    placeholder="VD: Vân Kim — để trống thì lấy 2 từ cuối"
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Số Điện Thoại</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="VD: 0988 123 456"
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>

              {/* Chỉ hiện khi tạo mới — tạo mới giờ luôn kèm tạo account đăng nhập thật, mật khẩu
                  NGẪU NHIÊN do server sinh (không gửi email mời, khác luồng "Tạo Tài Khoản Mới" ở
                  Phân Quyền & Role). Sửa hồ sơ đã có account rồi thì không cần nhập lại email. */}
              {!editingTalent && (
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Email Đăng Nhập *</label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="host@liveops.ai"
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <p className="text-[11px] text-[var(--text-faint)] mt-1">
                    Hệ thống tự sinh mật khẩu ngẫu nhiên, hiện 1 lần ngay sau khi tạo xong — talent BẮT BUỘC phải đổi mật khẩu khi đăng nhập lần đầu.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Vai Trò</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as Talent["role"])}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="Host">Host</option>
<option value="Assistant">Trợ live</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Giới Tính</label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value)}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="Nữ">Nữ</option>
                    <option value="Nam">Nam</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Ngành hàng hợp (phân cách bằng dấu phẩy)</label>
                <input
                  type="text"
                  value={formNiches}
                  onChange={(e) => setFormNiches(e.target.value)}
                  placeholder="VD: Mỹ phẩm, Skincare, Thời trang"
                  className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                />
              </div>

              {/* Ô GMV trung bình mỗi ca, GMV luỹ kế, CVR gõ tay đã bỏ (audit người mới 2026-10-04): bảng và chi tiết luôn hiện số TỰ CỘNG
                  từ ca, còn ô gõ tay vẫn lưu và còn được gửi cho AI ghép host — hai con số cho một người. */}
              <div className={`grid grid-cols-1 gap-3 ${canSeeRate ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
                {/* Rate Card/Hoa hồng — trường bảo mật, chỉ ceo/admin sửa được (xem talents_secure). */}
                {canSeeRate && (
                  <>
                    <div>
                      {/* Rate theo GIỜ: lương ca = rate × giờ công thực tế (giờ ca + OT − off sớm, xem
                          billableSessionHours ở lib/pnl.ts). Ô rate/phiên đã ẩn (06/10) — pnl.ts vẫn
                          đọc giá trị cũ làm dự phòng khi rate giờ = 0. */}
                      <label className="font-bold text-[var(--text-muted)] block mb-1">Rate Card (/giờ)</label>
                      <input
                        type="number"
                        value={formRateHour}
                        onChange={(e) => setFormRateHour(Number(e.target.value))}
                        className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                      />
                      <p className="text-[11px] text-[var(--text-faint)] mt-1">
                        {Number(formRateHour) > 0 ? "Đang tính lương theo giờ — bỏ qua rate/live." : "Để 0 = tính theo rate/live."}
                      </p>
                    </div>
                    <div>
                      {/* 0089 — rate khi làm TRỢ LIVE, tách khỏi rate host: cùng người hôm nay host mai trợ
                          ăn 2 mức khác nhau. Để 0 thì ca làm trợ vẫn tính theo rate host như cũ. */}
                      <label className="font-bold text-[var(--text-muted)] block mb-1">Rate Trợ Live (/giờ)</label>
                      <input
                        type="number"
                        value={formAssistantRateHour}
                        onChange={(e) => setFormAssistantRateHour(Number(e.target.value))}
                        className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                      />
                      <p className="text-[11px] text-[var(--text-faint)] mt-1">
                        {Number(formAssistantRateHour) > 0 ? "Ca làm trợ live tính theo rate này × giờ." : "Để 0 = ca làm trợ tính theo rate host ở trên."}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">URL Ảnh Đại Diện (Avatar URL)</label>
                <input
                  type="text"
                  value={formAvatar}
                  onChange={(e) => setFormAvatar(e.target.value)}
                  placeholder="https://..."
                  className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] rounded-xl text-xs font-mono"
                />
              </div>

              {createAccountError && (
                <div className="text-xs rounded-lg px-3 py-2 border text-red-300 bg-red-950/60 border-red-500/30">
                  {createAccountError}
                </div>
              )}

              <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)] rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAccount}
                  className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold rounded-xl shadow transition-all flex items-center gap-2"
                >
                  {isCreatingAccount && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingTalent ? "Cập Nhật Talent" : "Tạo Talent + Tài Khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reveal mật khẩu 1 lần sau khi tạo tài khoản talent — server chỉ trả về đúng 1 lần trong
          response tạo tài khoản (audit 2026-09-24), đóng modal này là mất, không xem lại được.
          Talent sẽ bị bắt đổi mật khẩu ngay lần đăng nhập đầu (must_change_password). */}
      {revealCreds && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-sm rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--accent-text)]" />
                Tài Khoản Đã Tạo — Giao Mật Khẩu Cho Talent
              </h3>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/40 text-amber-200 px-3 py-2">
                Mật khẩu này chỉ hiện <strong>đúng 1 lần</strong>, ngay tại đây — không lưu lại được
                nữa. Copy/giao ngay cho talent trước khi đóng. Họ sẽ bị bắt đổi mật khẩu khi đăng
                nhập lần đầu.
              </div>
              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Email đăng nhập</label>
                <div className="font-mono text-sm bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2">
                  {revealCreds.email}
                </div>
              </div>
              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Mật khẩu tạm</label>
                <div className="font-mono text-base font-bold tracking-wide bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2">
                  {revealCreds.password}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRevealCreds(null)}
                className="w-full py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl transition-all"
              >
                Đã Giao Cho Talent — Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
