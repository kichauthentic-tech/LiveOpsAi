import React, { useState } from "react";
import { Talent, Brand, UserRole } from "../types";
import { Users, Sparkles, Award, Search, Filter, Plus, Edit3, Trash2, X, Phone, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { authedFetch } from "../lib/authedFetch";

export interface NewTalentAccountPayload {
  name: string;
  email: string;
  phone: string;
  role: "Host" | "KOC" | "KOL" | "MC";
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
  commissionRate: number;
  availabilityStatus: "Available" | "Busy" | "On Live";
}

interface TalentMatcherProps {
  currentRole: UserRole;
  talents: Talent[];
  brands: Brand[];
  onCreateTalentAccount?: (payload: NewTalentAccountPayload) => Promise<void>;
  onUpdateTalent?: (id: string, patch: Partial<Talent>) => void;
  onDeleteTalent?: (id: string) => void;
}

export const TalentMatcher: React.FC<TalentMatcherProps> = ({
  currentRole,
  talents,
  brands,
  onCreateTalentAccount,
  onUpdateTalent,
  onDeleteTalent
}) => {
  // Rate Card/Hoa hồng — chỉ ceo/admin xem được (đúng dữ liệu trả về từ view `talents_secure`,
  // vốn đã mask thành 0 cho role khác — ẩn luôn UI cho nhất quán thay vì hiện "0đ" gây hiểu lầm).
  // Tạo talent mới giờ luôn kèm tạo account thật (Supabase Admin API) nên cũng chỉ ceo/admin
  // làm được — dùng chung điều kiện này cho cả 2 mục đích.
  const canSeeRate = currentRole === "ceo" || currentRole === "admin";
  const [selectedBrandId, setSelectedBrandId] = useState("brand-1");
  const [targetCategory, setTargetCategory] = useState("Mỹ phẩm Skincare");
  const [matchingResults, setMatchingResults] = useState<any[] | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  // FIX L1 (audit 2026-08-21): server trả isMock khi chưa cấu hình GEMINI_API_KEY, nhưng nhánh
  // thành công trước đây bỏ qua cờ này — hiện y hệt kết quả AI thật. Theo dõi riêng để hiện banner
  // (cùng true khi rơi vào nhánh catch fallback công thức bên dưới).
  const [matchingIsMock, setMatchingIsMock] = useState(false);

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
  const [formEmail, setFormEmail] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  const [formRole, setFormRole] = useState<"Host" | "KOC" | "KOL" | "MC">("Host");
  const [formGender, setFormGender] = useState("Nữ");
  const [formNiches, setFormNiches] = useState("Mỹ phẩm, Skincare");
  const [formGmv, setFormGmv] = useState(150000000);
  const [formTotalGmv, setFormTotalGmv] = useState(0);
  const [formCvr, setFormCvr] = useState(5.0);
  const [formCtr, setFormCtr] = useState(8.0);
  const [formRate, setFormRate] = useState(5000000);
  const [formRateHour, setFormRateHour] = useState(0);
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
    setFormEmail("");
    setFormRole("Host");
    setFormGender("Nữ");
    setFormNiches("Mỹ phẩm, Skincare");
    setFormGmv(150000000);
    setFormTotalGmv(0);
    setFormCvr(5.0);
    setFormCtr(8.0);
    setFormRate(5000000);
    setFormCommission(3.5);
    setFormScore(90);
    setFormPhone("");
    setFormAvatar("");
    setFormStatus("Available");
    setIsModalOpen(true);
  };

  const openEditModal = (t: Talent) => {
    setEditingTalent(t);
    setFormName(t.name);
    setFormRole(t.role || "Host");
    setFormGender(t.gender || "Nữ");
    const nicheArr = t.niches || (t as any).niche || [];
    setFormNiches(Array.isArray(nicheArr) ? nicheArr.join(", ") : String(nicheArr));
    setFormGmv(t.avgGmvPerSession || 150000000);
    setFormTotalGmv(t.totalGmv || 0);
    setFormCvr(t.cvrAvg || 5.0);
    setFormCtr(t.ctrAvg || 8.0);
    setFormRate(t.ratePerSession || (t as any).rateCardFee || 5000000);
    setFormRateHour(t.ratePerHour || 0);
    setFormCommission(t.commissionRate || 3.5);
    setFormScore(t.overallScore || (t as any).aiMatchScore || 90);
    setFormPhone(t.phone || "");
    setFormAvatar(t.avatar || (t as any).avatarUrl || "");
    setFormStatus(t.availabilityStatus || "Available");
    setIsModalOpen(true);
  };

  const handleSaveTalent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const nichesParsed = formNiches.split(",").map((s) => s.trim()).filter(Boolean);

    const basePayload: Omit<Talent, "id" | "ratePerSession" | "ratePerHour" | "commissionRate"> = {
      name: formName,
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
        patch.commissionRate = Number(formCommission);
      }
      if (onUpdateTalent) onUpdateTalent(editingTalent.id, patch);
      setIsModalOpen(false);
      return;
    }

    // Tạo mới — luôn kèm tạo account thật (mật khẩu mặc định 000000), không còn tạo hồ sơ
    // Talent Pool đứng một mình nữa. Gọi server thật nên cần chờ + hiện lỗi nếu email trùng...
    if (!formEmail.trim()) return;
    setCreateAccountError(null);
    setIsCreatingAccount(true);
    try {
      if (onCreateTalentAccount) {
        await onCreateTalentAccount({
          ...basePayload,
          email: formEmail.trim(),
          ratePerSession: Number(formRate),
          ratePerHour: Number(formRateHour),
          commissionRate: Number(formCommission)
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setCreateAccountError(err?.message ?? "Không thể tạo tài khoản Talent mới.");
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa Talent "${name}" khỏi hệ thống?`)) {
      if (onDeleteTalent) onDeleteTalent(id);
    }
  };

  const handleRunMatching = async () => {
    const activeBrand = brands.find((b) => b.id === selectedBrandId) || brands[0];
    const rawTalents = talents && talents.length > 0 ? talents : [];
    setIsMatching(true);
    try {
      const res = await authedFetch("/api/gemini/match-talents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: activeBrand, targetCategory, talents: rawTalents })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.results) && data.results.length > 0) {
        setMatchingResults(data.results);
        setMatchingIsMock(!!data.isMock);
        return;
      }
      throw new Error(data.error || "Empty AI matching result");
    } catch (e) {
      console.error("AI Talent Matching failed, dùng fallback công thức:", e);
      setMatchingIsMock(true);
      const results = rawTalents.map((t) => {
        // FIX L1 (audit 2026-08-21): fallback cũ = 96 − index×5 — xếp hạng theo VỊ TRÍ TRONG MẢNG,
        // không phản ánh gì về talent, nhưng hiển thị y hệt điểm phù hợp AI thật khi API lỗi/không
        // có key. Dùng overallScore (điểm đánh giá thật đã lưu ở Talent Pool, 0-100) — vẫn không
        // phải điểm "phù hợp với brand này" như AI thật tính, nhưng ít nhất là tín hiệu thật của
        // đúng talent đó, không phải thứ tự ngẫu nhiên từ API trả về.
        const matchScore = t.overallScore || 0;
        const nicheArr = t.niches || (t as any).niche || [];
        const nicheStr = Array.isArray(nicheArr) ? nicheArr.join(", ") : String(nicheArr || "Đa ngành");
        return {
          talentId: t.id,
          name: t.name,
          matchScore,
          predictedGmv: `${((t.avgGmvPerSession || 100000000) / 1000000).toFixed(0)}M - ${(((t.avgGmvPerSession || 100000000) * 1.25) / 1000000).toFixed(0)}M đ`,
          reasoning: `Thế mạnh ngành ${nicheStr}, CVR trung bình ${t.cvrAvg}%, GMV tích lũy ${((t.totalGmv || 0) / 1000000).toFixed(0)}M đ. Rất phù hợp với ${activeBrand?.name || "Brand"}.`
        };
      });
      setMatchingResults(results);
    } finally {
      setIsMatching(false);
    }
  };

  const filteredTalents = talents.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || (t.phone && t.phone.includes(searchTerm));
    const matchesRole = selectedRoleFilter === "All" || t.role === selectedRoleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl space-y-2">
        <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Users className="w-4 h-4 text-[var(--accent-text)]" /> Module 03: Talent Management & AI Matcher
        </span>
        <h2 className="text-2xl font-black">Hệ Thống Quản Lý Talent & Khớp Nối Host Thông Minh</h2>
      </div>

      {/* AI Matching Tool Banner */}
      <div className="bg-gradient-to-r from-[var(--accent)]/25 to-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--accent)]/50 shadow-lg space-y-4">
        <div className="flex items-center gap-2 text-[var(--accent-text)] font-bold text-sm">
          <Sparkles className="w-5 h-5 text-[var(--accent-text)]" /> Trình AI Khớp Nối Host Cho Chiến Dịch
        </div>
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

        {/* AI Matching Output Results */}
        {matchingResults && (
          <div className="bg-[var(--surface-base)]/80 p-4 rounded-xl border border-[var(--accent)]/80 space-y-3 pt-4 text-xs">
            <h4 className="font-bold text-[var(--accent-text)] text-sm">Gợi Ý Top Host Phù Hợp Nhất Cho Brand:</h4>
            {matchingIsMock && (
              <div className="flex items-center gap-2 text-[11px] text-amber-400 bg-amber-950/40 border border-amber-500/40 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Chưa cấu hình Gemini API key (hoặc AI đang lỗi) — điểm phù hợp bên dưới tính bằng công thức đơn giản, không phải phân tích AI thật.
              </div>
            )}
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
                  <div className="text-right text-[10px] text-emerald-400 font-mono font-bold">
                    Dự đoán GMV: {r.predictedGmv}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Talent Roster Database Header & Action Controls */}
      <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h3 className="font-bold text-[var(--text)] text-base">
              Danh Sách Đội Ngũ Talent & Host Agency ({filteredTalents.length}/{talents.length} Talent)
            </h3>
            <p className="text-xs text-[var(--text-muted)]">Quản lý danh sách Host/KOC, theo dõi doanh thu TB và cập nhật thông tin</p>
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
              <option value="KOC">KOC</option>
              <option value="KOL">KOL</option>
              <option value="MC">MC</option>
            </select>

            {/* Add New Talent Button — tạo mới giờ kèm tạo account thật nên chỉ ceo/admin */}
            {canSeeRate && (
              <button
                onClick={openAddModal}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
              >
                <Plus className="w-4 h-4" /> Thêm Talent Mới
              </button>
            )}
          </div>
        </div>

        {/* Talent Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTalents.map((t) => {
            const nicheArr = t.niches || (t as any).niche || [];
            const nicheStr = Array.isArray(nicheArr) ? nicheArr.join(", ") : String(nicheArr || "Đa ngành");
            const avatar = t.avatar || (t as any).avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250";
            const score = t.overallScore || (t as any).aiMatchScore || 90;
            const rate = t.ratePerSession || (t as any).rateCardFee || 0;

            return (
              <div
                key={t.id}
                onClick={() => setDetailTalent(t)}
                className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)]/40 space-y-3 hover:border-[var(--accent)] transition-all relative group cursor-pointer"
                title="Xem chi tiết & hiệu suất"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <img src={avatar} alt={t.name} className="w-12 h-12 rounded-full object-cover border-2 border-[var(--accent)] shadow-sm shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <h4 className="font-bold text-[var(--text)] text-xs truncate">{t.name}</h4>
                        <span className="bg-[var(--accent)]/50 text-[var(--accent-text)] text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">
                          {t.role || "Host"}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--accent-text)] font-medium truncate">{nicheStr}</p>
                      <span className="text-[10px] text-[var(--text-muted)] block truncate whitespace-nowrap">GMV tích lũy {((t.totalGmv || 0) / 1000000).toFixed(0)}M đ</span>
                    </div>
                  </div>

                  {/* Edit & Delete Action Buttons */}
                  <div className="flex items-center gap-1">
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
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] text-[var(--text-muted)] bg-[var(--surface-base)]/40 p-2.5 rounded-xl border border-[var(--border)] font-medium">
                  <div>GMV TB: <strong className="text-emerald-400 block text-xs font-bold">{((t.avgGmvPerSession || 100000000) / 1000000).toFixed(0)}M đ</strong></div>
                  <div>CVR TB: <strong className="text-[var(--accent-text)] block text-xs font-bold">{t.cvrAvg || 4.5}%</strong></div>
                  {canSeeRate && (
                    <>
                      <div>Rate Card: <strong className="text-[var(--text)] block font-bold">{rate.toLocaleString()} đ</strong></div>
                      <div>Hoa hồng: <strong className="text-[var(--accent-text)] block font-bold">{t.commissionRate || 0}%</strong></div>
                    </>
                  )}
                </div>

                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1">
                    <Phone className="w-3 h-3 text-[var(--text-muted)]" /> {t.phone || "N/A"}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    t.availabilityStatus === "On Live" ? "bg-red-900/80 text-red-300 animate-pulse" :
                    t.availabilityStatus === "Busy" ? "bg-amber-900/80 text-amber-300" : "bg-emerald-900/80 text-emerald-300"
                  }`}>
                    {t.availabilityStatus || "Available"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Talent Form Modal (Add / Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-xl rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[var(--surface)] text-[var(--text)] px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--accent-text)]" />
                {editingTalent ? `Chỉnh Sửa Talent: ${editingTalent.name}` : "Thêm Talent Mới Vào Hệ Thống"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
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
                    placeholder="VD: Nguyễn Văn A (A Live)"
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
                  mặc định 000000, không gửi email mời (khác luồng "Tạo Tài Khoản Mới" ở Phân
                  Quyền & Role). Sửa hồ sơ đã có account rồi thì không cần nhập lại email. */}
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
                  <p className="text-[10px] text-[var(--text-faint)] mt-1">
                    Hệ thống tạo tài khoản đăng nhập với mật khẩu mặc định <strong>000000</strong> — báo talent đổi mật khẩu sau khi đăng nhập lần đầu.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Vai Trò</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="Host">Host</option>
                    <option value="KOC">KOC</option>
                    <option value="KOL">KOL</option>
                    <option value="MC">MC</option>
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
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="Available">Sẵn Sàng (Available)</option>
                    <option value="Busy">Đã Bận (Busy)</option>
                    <option value="On Live">Đang Live (On Live)</option>
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
                  <label className="font-bold text-[var(--text-muted)] block mb-1">GMV TB Mỗi Phiên (VND)</label>
                  <input
                    type="number"
                    value={formGmv}
                    onChange={(e) => setFormGmv(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">GMV Tích Lũy (VND)</label>
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
                  <label className="font-bold text-[var(--text-muted)] block mb-1">CVR Trung Bình (%)</label>
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
                      <label className="font-bold text-[var(--text-muted)] block mb-1">Rate Card (VND/Live)</label>
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
                      <label className="font-bold text-[var(--text-muted)] block mb-1">Rate Card (VND/Giờ)</label>
                      <input
                        type="number"
                        value={formRateHour}
                        onChange={(e) => setFormRateHour(Number(e.target.value))}
                        className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                      />
                      <p className="text-[10px] text-[var(--text-faint)] mt-1">
                        {Number(formRateHour) > 0 ? "Đang tính lương theo giờ — bỏ qua rate/live." : "Để 0 = tính theo rate/live."}
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

      {/* Detail/Performance Modal (read-only) — mở khi click thân card */}
      {detailTalent && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-lg rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[var(--surface)] text-[var(--text)] px-6 py-4 flex justify-between items-center border-b border-[var(--border)]">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-[var(--accent-text)]" />
                Chi Tiết & Hiệu Suất: {detailTalent.name}
              </h3>
              <button onClick={() => setDetailTalent(null)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="flex items-center gap-3">
                <img
                  src={detailTalent.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250"}
                  alt={detailTalent.name}
                  className="w-14 h-14 rounded-full object-cover border-2 border-[var(--accent)] shadow-sm shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-[var(--text)] text-sm truncate">{detailTalent.name}</h4>
                    <span className="bg-[var(--accent)]/50 text-[var(--accent-text)] text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">
                      {detailTalent.role || "Host"}
                    </span>
                  </div>
                  <p className="text-[var(--text-muted)]">{detailTalent.gender} • {(detailTalent.niches || []).join(", ") || "Đa ngành"}</p>
                  <p className="text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" /> {detailTalent.phone || "N/A"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[var(--surface-base)]/40 p-3 rounded-xl border border-[var(--border)]">
                <div>GMV Tích Lũy: <strong className="text-[var(--text)] block text-sm font-bold">{((detailTalent.totalGmv || 0) / 1000000).toFixed(0)}M đ</strong></div>
                <div>Điểm Tổng Hợp: <strong className="text-[var(--text)] block text-sm font-bold">{detailTalent.overallScore || 0}</strong></div>
                <div>GMV TB / Phiên: <strong className="text-emerald-400 block text-sm font-bold">{((detailTalent.avgGmvPerSession || 0) / 1000000).toFixed(0)}M đ</strong></div>
                <div>CVR TB: <strong className="text-[var(--accent-text)] block text-sm font-bold">{detailTalent.cvrAvg || 0}%</strong></div>
                <div>CTR TB: <strong className="text-[var(--accent-text)] block text-sm font-bold">{detailTalent.ctrAvg || 0}%</strong></div>
                <div>Trạng Thái: <strong className="text-[var(--text)] block text-sm font-bold">{detailTalent.availabilityStatus || "Available"}</strong></div>
              </div>

              {canSeeRate && (
                <div className="grid grid-cols-2 gap-2 bg-amber-950/30 p-3 rounded-xl border border-amber-500/30">
                  <div>Rate Card: <strong className="text-[var(--text)] block text-sm font-bold">{(detailTalent.ratePerSession || 0).toLocaleString()} đ</strong></div>
                  <div>Hoa Hồng: <strong className="text-[var(--accent-text)] block text-sm font-bold">{detailTalent.commissionRate || 0}%</strong></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
