import React, { useState } from "react";
import { Talent, Brand, UserRole, LiveSession } from "../types";
import { Users, Sparkles, Award, Search, Plus, Edit3, Trash2, X, Phone, Loader2, AlertTriangle, KeyRound, ChevronDown } from "lucide-react";
import { authedFetch } from "../lib/authedFetch";
import { computeTalentRealTotals, computeTalentBrandPerf } from "../lib/metrics/avgGmv";
import { errorMessage } from "../lib/errorMessage";
import { useConfirm } from "../hooks/useConfirm";

import { fmtVndShort, fmtVndFull, fmtFixed } from "../lib/format";
import { statusLabel } from "../lib/statusLabels";
import { METRIC, metricHint } from "../lib/metricGlossary";
import { PageHeader } from "./common/PageHeader";
// Cột phụ: ở điện thoại bảng 11 cột rộng gấp mấy lần màn hình — giữ 4 cột trả lời "ai, vai gì,
// chạy bao nhiêu ca, ra bao nhiêu tiền", phần còn lại chỉ hiện từ sm (cùng cách Sổ Ca đã làm, M4).
const SUB_COL = "hidden sm:table-cell py-2.5 px-2";

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

  // Detail/performance view (read-only) — click vào thân card mở modal này thay vì đi thẳng
  // vào modal sửa; icon bút chì vẫn mở modal sửa như cũ.
  const [detailTalent, setDetailTalent] = useState<Talent | null>(null);

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
  const [formGmv, setFormGmv] = useState(150000000);
  const [formTotalGmv, setFormTotalGmv] = useState(0);
  const [formCvr, setFormCvr] = useState(5.0);
  const [formCtr, setFormCtr] = useState(8.0);
  const [formRate, setFormRate] = useState(5000000);
  const [formRateHour, setFormRateHour] = useState(0);
  const [formAssistantRateHour, setFormAssistantRateHour] = useState(0);
  const [formCommission, setFormCommission] = useState(3.5);
  const [formScore, setFormScore] = useState(90);
  // FIX L5 (audit 2026-08-21): trước đây mặc định số điện thoại/avatar demo cố định (nhìn như đã
  // nhập thật) và brandsWorkedWith luôn gán "Agency Network" (không phải brand nào trong hệ thống)
  // — dễ lưu nhầm vào DB nếu ops không để ý sửa. Để trống, input avatar đã có placeholder ví dụ.
  const [formPhone, setFormPhone] = useState("");
  const [formAvatar, setFormAvatar] = useState("");
  const [formStatus, setFormStatus] = useState<"Available" | "Busy" | "On Live">("Available");

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
    setFormRate(0);
    setFormRateHour(0);
    setFormAssistantRateHour(0);
    setFormCommission(0);
    setFormScore(0);
    setFormPhone("");
    setFormAvatar("");
    setFormStatus("Available");
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
    setFormRate(t.ratePerSession || 0);
    setFormRateHour(t.ratePerHour || 0);
    setFormAssistantRateHour(t.assistantRatePerHour || 0);
    setFormCommission(t.commissionRate || 0);
    setFormScore(t.overallScore || 0);
    setFormPhone(t.phone || "");
    setFormAvatar(t.avatar || "");
    setFormStatus(t.availabilityStatus || "Available");
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
      cvrAvg: Number(formCvr),
      overallScore: Number(formScore),
      availabilityStatus: formStatus,
      brandsWorkedWith: editingTalent?.brandsWorkedWith || [],
      phone: formPhone
    };

    if (editingTalent) {
      // Partial update — chỉ gửi rate/commissionRate nếu currentRole thấy được field này (form
      // không hiện input cho non-ceo/admin nên formRate/formCommission vẫn giữ giá trị cũ = 0 từ
      // view mask — gửi lên sẽ vô tình ghi đè rate thật thành 0 nếu không loại trừ ở đây).
      const patch: Partial<Talent> = { ...basePayload };
      if (canSeeRate) {
        patch.ratePerSession = Number(formRate);
        patch.ratePerHour = Number(formRateHour);
        patch.assistantRatePerHour = Number(formAssistantRateHour);
        patch.commissionRate = Number(formCommission);
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
          ratePerSession: Number(formRate),
          ratePerHour: Number(formRateHour),
          assistantRatePerHour: Number(formAssistantRateHour),
          commissionRate: Number(formCommission)
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
    const rawTalents = talents && talents.length > 0 ? talents : [];
    setIsMatching(true);
    setMatchingError(null);
    try {
      const res = await authedFetch("/api/gemini/match-talents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: activeBrand, targetCategory, talents: rawTalents })
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
  const filteredTalents = talents.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || (t.phone && t.phone.includes(searchTerm));
    const matchesRole = selectedRoleFilter === "All" || t.role === selectedRoleFilter;
    return matchesSearch && matchesRole;
  });

  // Xếp người đã chạy ca lên trước: 16/33 hồ sơ chưa gắn với ca nào, để xen kẽ theo thứ tự DB thì
  // phải lướt hết danh sách mới biết ai đang làm việc.
  const rosterRows = filteredTalents
    .map((t) => ({
      t,
      real: computeTalentRealTotals(sessions, t.id),
      rate: t.ratePerSession || 0
    }))
    .sort((a, b) => {
      // Tổng ca đã chạy trước (người trợ 86 ca làm việc nhiều hơn người host 3 ca), ca host là tiêu
      // chí phụ vì đó mới là vai gánh GMV.
      const total = (r: typeof a) => r.real.sessionCount + r.real.assistSessionCount;
      return total(b) - total(a) || b.real.sessionCount - a.real.sessionCount || a.t.name.localeCompare(b.t.name, "vi");
    });

  // Cột nào KHÔNG dòng nào mang thông tin thì ẩn hẳn và nói chỗ điền — chỗ trống rộng bằng chỗ có
  // số khiến người đọc tưởng đã nhập rồi mà bằng 0 (cùng luật với Dashboard agency, M3). Trạng thái
  // tính là "có thông tin" khi khác mặc định Available: cột này sinh ra để báo ai đang bận/đang live.
  const EDIT_HERE = "nút sửa ✏️ trên từng dòng";
  const hideableCols: { label: string; has: (r: (typeof rosterRows)[number]) => boolean; fix?: string }[] = [
    { label: "Ca trợ", has: (r) => r.real.assistSessionCount > 0 },
    { label: "GMV tích luỹ", has: (r) => r.real.totalGmv > 0 },
    // KHÔNG có cột GMV/giờ gộp mọi brand ở bảng: xem `computeTalentBrandPerf`. Bảng chỉ giữ thứ
    // cộng dồn được qua brand (ca, giờ, GMV); so hiệu suất thì mở ngăn chi tiết (tách theo brand).
    { label: "Giờ host", has: (r) => r.real.hours > 0 },
    { label: "Giờ trợ", has: (r) => r.real.assistHours > 0 },
    { label: "CVR TB", has: (r) => r.t.cvrAvg > 0, fix: EDIT_HERE },
    { label: "Rate card", has: (r) => canSeeRate && (!!r.t.rateHidden || r.rate > 0), fix: canSeeRate ? EDIT_HERE : undefined },
    { label: "Hoa hồng", has: (r) => canSeeRate && (!!r.t.rateHidden || (r.t.commissionRate || 0) > 0), fix: canSeeRate ? EDIT_HERE : undefined },
    { label: "SĐT", has: (r) => !!r.t.phone?.trim(), fix: EDIT_HERE },
    { label: "Trạng thái", has: (r) => !!r.t.availabilityStatus && r.t.availabilityStatus !== "Available", fix: EDIT_HERE }
  ];
  const show = Object.fromEntries(hideableCols.map((c) => [c.label, rosterRows.some(c.has)])) as Record<string, boolean>;
  const hiddenCols = hideableCols.filter((c) => !show[c.label] && (c.label !== "Rate card" || canSeeRate) && (c.label !== "Hoa hồng" || canSeeRate));
  const colFixes = [...new Set(hiddenCols.map((c) => c.fix).filter((f): f is string => !!f))];
  // Đếm cột thay vì gõ số: bảng này có 8 cột bật/tắt được (M4 đã dính 1 lần colSpan lệch).
  const colCount = 2 + hideableCols.filter((c) => show[c.label]).length + 1;
  // Số hồ sơ chưa gắn với ca nào — xếp cuối bảng, có dòng ngăn để mắt dừng lại thay vì lướt qua
  // một dải "—" dài không biết bắt đầu từ đâu.
  const idleCount = rosterRows.filter((r) => r.real.sessionCount + r.real.assistSessionCount === 0).length;
  const activeCount = rosterRows.length - idleCount;

  // id rỗng ⇒ trả về toàn 0, nên gọi được cả khi chưa mở ngăn chi tiết (tránh nhánh null trong JSX).
  const detailReal = computeTalentRealTotals(sessions, detailTalent?.id ?? "");
  const detailBrandPerf = computeTalentBrandPerf(sessions, detailTalent?.id ?? "", brands.map((b) => b.id));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Talent Pool"
        description="Host và trợ live của agency: vai trò, số ca, GMV và rate. Bấm vào dòng để xem chi tiết từng người."
      />

      {/* Danh sách talent — bảng, không phải lưới thẻ.
          M6 (audit UX lần 2): 33 thẻ × 224px = 3,7 màn, nhưng đo trên DB thật thì 4/6 ô dữ liệu
          của thẻ GIỐNG HỆT NHAU ở cả 33 người (rate 0, hoa hồng 0%, CVR —, SĐT N/A) và cả 33 dùng
          CHUNG một ảnh stock. Thẻ chỉ đáng bằng chỗ nó chiếm khi các ô trong thẻ phân biệt được
          người này với người kia. */}
      <div className="bg-[var(--surface)] p-4 sm:p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h3 className="font-bold text-[var(--text)] text-base">
              Host và trợ live ({filteredTalents.length}/{talents.length})
            </h3>
            <p className="text-xs text-[var(--text-muted)]">Số ca, giờ và GMV cộng <b>mọi tháng</b> đã chạy (Hiệu Suất Host mặc định chỉ xem 90 ngày gần nhất). Xếp theo số ca.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm theo tên/SĐT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs bg-[var(--surface-elevated)] text-[var(--text)] placeholder:text-[var(--text-faint)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-medium"
              />
            </div>

            {/* Role Filter */}
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="py-1.5 px-3 text-xs bg-[var(--surface-elevated)] text-[var(--text)] border border-[var(--border)] rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="All">Tất cả vai trò</option>
              <option value="Host">Host</option>
              <option value="Assistant">Trợ live (Assistant)</option>
            </select>

            {/* Add New Talent Button — tạo mới giờ kèm tạo account thật nên chỉ ceo/admin */}
            {canSeeRate && (
              <button
                onClick={openAddModal}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
              >
                <Plus className="w-4 h-4" /> Thêm talent
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[11px] tracking-wider">
                <th className="py-2.5 px-2">Tên</th>
                <th className="py-2.5 px-2 text-right">Ca host</th>
                {show["Ca trợ"] && <th className="py-2.5 px-2 text-right">Ca trợ</th>}
                {show["GMV tích luỹ"] && <th className="py-2.5 px-2 text-right">GMV tích luỹ</th>}
                {show["Giờ host"] && <th className={`${SUB_COL} text-right`}>Giờ host</th>}
                {show["Giờ trợ"] && <th className={`${SUB_COL} text-right`}>Giờ trợ</th>}
                {show["CVR TB"] && <th className={`${SUB_COL} text-right`}>CVR TB</th>}
                {show["Rate card"] && <th className={`${SUB_COL} text-right`}>Rate card</th>}
                {show["Hoa hồng"] && <th className={`${SUB_COL} text-right`}>Hoa hồng</th>}
                {show["SĐT"] && <th className={SUB_COL}>SĐT</th>}
                {show["Trạng thái"] && <th className={SUB_COL}>Trạng thái</th>}
                <th className="py-2.5 px-2" />
              </tr>
            </thead>
            <tbody>
              {rosterRows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="py-6 text-center text-[var(--text-faint)]">
                    Không có talent nào khớp bộ lọc.
                  </td>
                </tr>
              )}
              {rosterRows.map(({ t, real, rate }, i) => (
                <React.Fragment key={t.id}>
                {i === activeCount && idleCount > 0 && (
                  <tr className="bg-[var(--surface-elevated)]/50">
                    <td colSpan={colCount} className="py-1.5 px-2 text-[11px] font-bold text-[var(--text-muted)]">
                      {idleCount} hồ sơ chưa gắn với ca nào
                      <span className="text-[var(--text-faint)] font-normal"> — tài khoản mới hoặc chưa được xếp ca</span>
                    </td>
                  </tr>
                )}
                <tr
                  onClick={() => setDetailTalent(t)}
                  className="border-b border-[var(--border-muted)] cursor-pointer hover:bg-[var(--surface-elevated)]/40 transition-colors"
                  title="Xem chi tiết & hiệu suất"
                >
                  {/* Tên không xuống dòng (ở 375px "Huỳnh Thái Toàn · Thái Toàn" vỡ thành 5 dòng, dòng cao
                      150px) và vai trò nằm ngay cạnh tên thay vì thành một cột riêng — bỏ được ~70px bề ngang
                      để cột "Ca trợ" lọt vào màn điện thoại, vì với 8 người thì đó là con số DUY NHẤT họ có. Ở < sm còn ẩn
                      nốt nhãn vai trò: cột nào có số đã nói người đó chạy vai gì, ngăn chi tiết vẫn ghi đủ. */}
                  <td className="py-2.5 px-2 text-[var(--text)] font-bold whitespace-nowrap">
                    {t.name}
                    {t.nickname && <span className="hidden sm:inline font-normal text-[var(--text-muted)]"> · {t.nickname}</span>}
                    <span className="hidden sm:inline ml-1.5 bg-[var(--accent)]/50 text-[var(--accent-text)] text-[11px] font-bold px-1.5 py-0.5 rounded">
                      {t.role === "Assistant" ? "Trợ live" : t.role || "Host"}
                    </span>
                    {/* Vai trò gõ tay một lần, không đối chiếu ca thật (audit người mới 2026-10-04: "Host" mà 86 ca đều
                        là trợ live). Lệch thì nói ra để ops sửa hồ sơ — không tự đổi. */}
                    {roleMismatch(t.role, real) && (
                      <span className="ml-1.5 text-amber-300 text-[11px] font-bold" title="Vai trò trên hồ sơ khác với vai người này thật sự chạy trong ca — bấm ✏️ để sửa">
                        ⚠ chỉ chạy {t.role === "Assistant" ? "host" : "trợ live"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-[var(--text)]">{real.sessionCount || <Dash />}</td>
                  {show["Ca trợ"] && <td className="py-2.5 px-2 text-right font-mono text-[var(--text-muted)]">{real.assistSessionCount || <Dash />}</td>}
                  {show["GMV tích luỹ"] && (
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-[var(--text)]">
                      {real.totalGmv > 0 ? fmtVndShort(real.totalGmv) : <Dash />}
                    </td>
                  )}
                  {show["Giờ host"] && (
                    <td className={`${SUB_COL} text-right font-mono text-[var(--text-muted)]`}>
                      {real.hours > 0 ? `${fmtFixed(real.hours, 1)}h` : <Dash />}
                    </td>
                  )}
                  {show["Giờ trợ"] && (
                    <td className={`${SUB_COL} text-right font-mono text-[var(--text-muted)]`}>
                      {real.assistHours > 0 ? `${fmtFixed(real.assistHours, 1)}h` : <Dash />}
                    </td>
                  )}
                  {show["CVR TB"] && (
                    <td className={`${SUB_COL} text-right font-mono text-[var(--accent-text)]`}>{t.cvrAvg > 0 ? `${t.cvrAvg}%` : <Dash />}</td>
                  )}
                  {show["Rate card"] && (
                    <td className={`${SUB_COL} text-right font-mono text-[var(--text)]`}>
                      {t.rateHidden ? "ẩn" : rate > 0 ? fmtVndFull(rate) : <Dash />}
                    </td>
                  )}
                  {show["Hoa hồng"] && (
                    <td className={`${SUB_COL} text-right font-mono text-[var(--accent-text)]`}>
                      {t.rateHidden ? "ẩn" : t.commissionRate > 0 ? `${t.commissionRate}%` : <Dash />}
                    </td>
                  )}
                  {show["SĐT"] && <td className={`${SUB_COL} font-mono text-[var(--text-muted)]`}>{t.phone || <Dash />}</td>}
                  {show["Trạng thái"] && (
                    <td className={SUB_COL}>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                          t.availabilityStatus === "On Live"
                            ? "bg-red-900/80 text-red-300"
                            : t.availabilityStatus === "Busy"
                              ? "bg-amber-900/80 text-amber-300"
                              : "bg-emerald-900/80 text-emerald-300"
                        }`}
                      >
                        {statusLabel(t.availabilityStatus || "Available")}
                      </span>
                    </td>
                  )}
                  <td className="py-2.5 px-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(t);
                        }}
                        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--accent-hover)]/40 rounded-lg transition-all"
                        title="Chỉnh sửa Talent"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(t.id, t.name);
                        }}
                        className="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-950/80 rounded-lg transition-all"
                        title="Xóa Talent"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {hiddenCols.length > 0 && (
          <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">
            Ẩn {hiddenCols.length} cột vì chưa người nào có dữ liệu: <span className="text-[var(--text-muted)]">{hiddenCols.map((c) => c.label).join(", ")}</span>.
            {colFixes.length > 0 && ` Điền ở ${colFixes.join("; ")}.`}
          </p>
        )}
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
          <div className="grid md:grid-cols-3 gap-4 text-xs">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Vai Trò</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as Talent["role"])}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="Host">Host</option>
<option value="Assistant">Trợ live (Assistant)</option>
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
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Trạng Thái</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as "Available" | "Busy" | "On Live")}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="Available">Sẵn sàng</option>
                    <option value="Busy">Đang bận</option>
                    <option value="On Live">Đang live</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Ngành Hàng Khớp Nối (Phân cách bằng dấu phẩy)</label>
                <input
                  type="text"
                  value={formNiches}
                  onChange={(e) => setFormNiches(e.target.value)}
                  placeholder="VD: Mỹ phẩm, Skincare, Thời trang"
                  className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">GMV/session</label>
                  <input
                    type="number"
                    value={formGmv}
                    onChange={(e) => setFormGmv(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">GMV lũy kế</label>
                  <input
                    type="number"
                    value={formTotalGmv}
                    onChange={(e) => setFormTotalGmv(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
              </div>

              <div className={`grid grid-cols-1 gap-3 ${canSeeRate ? "sm:grid-cols-4" : "sm:grid-cols-1"}`}>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">CVR TB (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formCvr}
                    onChange={(e) => setFormCvr(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
                {/* Rate Card/Hoa hồng — trường bảo mật, chỉ ceo/admin sửa được (xem talents_secure). */}
                {canSeeRate && (
                  <>
                    <div>
                      <label className="font-bold text-[var(--text-muted)] block mb-1">Rate Card (/live)</label>
                      <input
                        type="number"
                        value={formRate}
                        onChange={(e) => setFormRate(Number(e.target.value))}
                        className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                      />
                    </div>
                    <div>
                      {/* Giai đoạn 3 — rate theo GIỜ, song song rate/phiên ở trên. Đặt > 0 thì
                          lương ca tính theo giờ công thực tế (giờ ca + OT − off sớm, xem
                          billableSessionHours ở lib/pnl.ts); để 0 thì giữ nguyên rate/phiên. */}
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
                    <div>
                      <label className="font-bold text-[var(--text-muted)] block mb-1">Hoa Hồng % (Commission)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={formCommission}
                        onChange={(e) => setFormCommission(Number(e.target.value))}
                        className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                      />
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

      {/* Detail/Performance Modal (read-only) — mở khi click thân card */}
      {detailTalent && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-lg rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[var(--surface)] text-[var(--text)] px-6 py-4 flex justify-between items-center border-b border-[var(--border)]">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-[var(--accent-text)]" />
                Chi Tiết & Hiệu Suất: {detailTalent.name}
              </h3>
              <button onClick={() => setDetailTalent(null)} className="p-1.5 -m-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="flex items-center gap-3">
                <TalentAvatar talent={detailTalent} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-[var(--text)] text-sm truncate">{detailTalent.name}</h4>
                    <span className="bg-[var(--accent)]/50 text-[var(--accent-text)] text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0">
                      {detailTalent.role === "Assistant" ? "Trợ live" : detailTalent.role || "Host"}
                    </span>
                  </div>
                  <p className="text-[var(--text-muted)]">
                    {[detailTalent.gender, (detailTalent.niches || []).join(", ")].filter(Boolean).join(" • ") || <Dash />}
                  </p>
                  <p className="text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" /> {detailTalent.phone || <Dash />}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[var(--surface-base)]/40 p-3 rounded-xl border border-[var(--border)]">
                <div>Ca host (có số): <strong className="text-[var(--text)] block text-sm font-bold">{detailReal.sessionCount}</strong></div>
                <div>Ca trợ (có số): <strong className="text-[var(--text)] block text-sm font-bold">{detailReal.assistSessionCount}</strong></div>
                <div>GMV lũy kế: <strong className="text-[var(--text)] block text-sm font-bold">{detailReal.totalGmv > 0 ? fmtVndShort(detailReal.totalGmv) : <Dash />}</strong></div>
                <div>Giờ host: <strong className="text-[var(--text)] block text-sm font-bold">{detailReal.hours > 0 ? `${fmtFixed(detailReal.hours, 1)}h` : <Dash />}</strong></div>
                <div>Giờ trợ: <strong className="text-[var(--text)] block text-sm font-bold">{detailReal.assistHours > 0 ? `${fmtFixed(detailReal.assistHours, 1)}h` : <Dash />}</strong></div>
                <div>CVR TB: <strong className="text-[var(--accent-text)] block text-sm font-bold">{detailTalent.cvrAvg > 0 ? `${detailTalent.cvrAvg}%` : <Dash />}</strong></div>
                <div>CTR TB: <strong className="text-[var(--accent-text)] block text-sm font-bold">{detailTalent.ctrAvg > 0 ? `${detailTalent.ctrAvg}%` : <Dash />}</strong></div>
                <div>Trạng Thái: <strong className="text-[var(--text)] block text-sm font-bold">{statusLabel(detailTalent.availabilityStatus || "Available")}</strong></div>
              </div>
              {detailReal.sessionCount === 0 && detailReal.assistSessionCount > 0 && (
                <p className="text-[11px] text-[var(--text-faint)]">
                  GMV của ca tính cho host, nên người chỉ chạy vai trợ không có GMV lũy kế — không phải chưa làm ca nào.
                </p>
              )}

              {/* GMV/giờ TÁCH THEO BRAND, không có số gộp: GMV/giờ phụ thuộc ngành hàng và giá bán của
                  brand nhiều hơn phụ thuộc người chạy, nên gộp lại rồi xếp hạng là so host bán giày với
                  host bán đồ lót. Ngưỡng "đủ mẫu" dùng chung với hostSuggestion (3 ca). */}
              <div className="space-y-1.5">
                <p className="font-bold text-[var(--text-muted)]" title={metricHint(METRIC.gmvPerHour)}>
                  {METRIC.gmvPerHour} theo brand
                </p>
                {detailBrandPerf.every((b) => b.sessions === 0) ? (
                  <p className="text-[11px] text-[var(--text-faint)]">Chưa chạy ca nào có số cho brand nào.</p>
                ) : (
                  <ul className="space-y-1">
                    {detailBrandPerf.map((b) => {
                      const brand = brands.find((x) => x.id === b.brandId);
                      return (
                        <li key={b.brandId} className="flex items-baseline justify-between gap-3 border-b border-[var(--border)]/60 pb-1">
                          <span className={b.sessions > 0 ? "text-[var(--text)] font-medium" : "text-[var(--text-faint)]"}>{brand?.name ?? b.brandId}</span>
                          {b.sessions === 0 ? (
                            <span className="text-[11px] text-[var(--text-faint)] shrink-0">chưa chạy ca nào</span>
                          ) : (
                            <span className="shrink-0 font-mono text-[var(--text)]">
                              <b className="text-emerald-400">{fmtVndShort(Math.round(b.gmvPerHour))}</b>/giờ
                              <span className="text-[var(--text-faint)] font-sans">
                                {" · "}{b.sessions} ca · {fmtFixed(b.hours, 1)}h · {b.confidence === "ok" ? "đủ mẫu" : "ít mẫu"}
                              </span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">
                  Không có số GMV/giờ gộp mọi brand: chỉ số này phụ thuộc ngành hàng và giá bán của brand hơn là người chạy.
                  Muốn xếp hạng host trong một brand thì mở Hiệu Suất Host (có lọc brand, thứ và khung giờ).
                </p>
              </div>

              {canSeeRate && (
                <div className="grid grid-cols-2 gap-2 bg-amber-950/30 p-3 rounded-xl border border-amber-500/30">
                  <div>Rate Card: <strong className="text-[var(--text)] block text-sm font-bold">{detailTalent.rateHidden ? "ẩn" : detailTalent.ratePerSession > 0 ? fmtVndFull(detailTalent.ratePerSession) : <span className="text-[var(--text-faint)] font-normal">chưa đặt</span>}</strong></div>
                  <div>Hoa Hồng: <strong className="text-[var(--accent-text)] block text-sm font-bold">{detailTalent.rateHidden ? "ẩn" : (detailTalent.commissionRate || 0) > 0 ? `${detailTalent.commissionRate}%` : <span className="text-[var(--text-faint)] font-normal">chưa đặt</span>}</strong></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
