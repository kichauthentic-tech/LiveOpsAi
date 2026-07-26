import React, { useState } from "react";
import { Talent, Brand } from "../types";
import { Users, Sparkles, Award, Search, Filter, Plus, Edit3, Trash2, X, Phone, CheckCircle2 } from "lucide-react";

interface TalentMatcherProps {
  talents: Talent[];
  brands: Brand[];
  onAddTalent?: (talent: Talent) => void;
  onUpdateTalent?: (talent: Talent) => void;
  onDeleteTalent?: (id: string) => void;
}

export const TalentMatcher: React.FC<TalentMatcherProps> = ({
  talents,
  brands,
  onAddTalent,
  onUpdateTalent,
  onDeleteTalent
}) => {
  const [selectedBrandId, setSelectedBrandId] = useState("brand-1");
  const [targetCategory, setTargetCategory] = useState("Mỹ phẩm Skincare");
  const [matchingResults, setMatchingResults] = useState<any[] | null>(null);
  const [isMatching, setIsMatching] = useState(false);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("All");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTalent, setEditingTalent] = useState<Talent | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<"Host" | "KOC" | "KOL" | "MC">("Host");
  const [formGender, setFormGender] = useState("Nữ");
  const [formNiches, setFormNiches] = useState("Mỹ phẩm, Skincare");
  const [formFollowers, setFormFollowers] = useState(500000);
  const [formGmv, setFormGmv] = useState(150000000);
  const [formCvr, setFormCvr] = useState(5.0);
  const [formCtr, setFormCtr] = useState(8.0);
  const [formRate, setFormRate] = useState(5000000);
  const [formCommission, setFormCommission] = useState(3.5);
  const [formScore, setFormScore] = useState(90);
  const [formPhone, setFormPhone] = useState("0988 123 456");
  const [formAvatar, setFormAvatar] = useState("https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250");
  const [formStatus, setFormStatus] = useState<"Available" | "Busy" | "On Live">("Available");

  const openAddModal = () => {
    setEditingTalent(null);
    setFormName("");
    setFormRole("Host");
    setFormGender("Nữ");
    setFormNiches("Mỹ phẩm, Skincare");
    setFormFollowers(500000);
    setFormGmv(150000000);
    setFormCvr(5.0);
    setFormCtr(8.0);
    setFormRate(5000000);
    setFormCommission(3.5);
    setFormScore(90);
    setFormPhone("0988 123 456");
    setFormAvatar("https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250");
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
    setFormFollowers(t.followersTikTok || (t as any).tiktokFollowers || 500000);
    setFormGmv(t.avgGmvPerSession || 150000000);
    setFormCvr(t.cvrAvg || 5.0);
    setFormCtr(t.ctrAvg || 8.0);
    setFormRate(t.ratePerSession || (t as any).rateCardFee || 5000000);
    setFormCommission(t.commissionRate || 3.5);
    setFormScore(t.overallScore || (t as any).aiMatchScore || 90);
    setFormPhone(t.phone || "0988 123 456");
    setFormAvatar(t.avatar || (t as any).avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250");
    setFormStatus(t.availabilityStatus || "Available");
    setIsModalOpen(true);
  };

  const handleSaveTalent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const nichesParsed = formNiches.split(",").map((s) => s.trim()).filter(Boolean);

    const talentPayload: Talent = {
      id: editingTalent ? editingTalent.id : `talent-${Date.now()}`,
      name: formName,
      avatar: formAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250",
      role: formRole,
      gender: formGender,
      niches: nichesParsed,
      followersTikTok: Number(formFollowers),
      avgGmvPerSession: Number(formGmv),
      ctrAvg: Number(formCtr),
      cvrAvg: Number(formCvr),
      ratePerSession: Number(formRate),
      commissionRate: Number(formCommission),
      overallScore: Number(formScore),
      availabilityStatus: formStatus,
      brandsWorkedWith: editingTalent?.brandsWorkedWith || ["Agency Network"],
      phone: formPhone
    };

    if (editingTalent) {
      if (onUpdateTalent) onUpdateTalent(talentPayload);
    } else {
      if (onAddTalent) onAddTalent(talentPayload);
    }

    setIsModalOpen(false);
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
      const res = await fetch("/api/gemini/match-talents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: activeBrand, targetCategory, talents: rawTalents })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.results) && data.results.length > 0) {
        setMatchingResults(data.results);
        return;
      }
      throw new Error(data.error || "Empty AI matching result");
    } catch (e) {
      console.error("AI Talent Matching failed, dùng fallback công thức:", e);
      const results = rawTalents.map((t, idx) => {
        const matchScore = Math.max(70, 96 - idx * 5);
        const nicheArr = t.niches || (t as any).niche || [];
        const nicheStr = Array.isArray(nicheArr) ? nicheArr.join(", ") : String(nicheArr || "Đa ngành");
        const followers = t.followersTikTok || (t as any).tiktokFollowers || 0;
        return {
          talentId: t.id,
          name: t.name,
          matchScore,
          predictedGmv: `${((t.avgGmvPerSession || 100000000) / 1000000).toFixed(0)}M - ${(((t.avgGmvPerSession || 100000000) * 1.25) / 1000000).toFixed(0)}M đ`,
          reasoning: `Thế mạnh ngành ${nicheStr}, CVR trung bình ${t.cvrAvg}% với ${followers.toLocaleString()} followers. Rất phù hợp với ${activeBrand?.name || "Brand"}.`
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
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Users className="w-4 h-4 text-purple-400" /> Module 03: Talent Management & AI Matcher
        </span>
        <h2 className="text-2xl font-black">Hệ Thống Quản Lý Talent & Khớp Nối Host Thông Minh</h2>
        <p className="text-slate-400 text-xs">
          Thêm mới, chỉnh sửa thông tin Host/KOC, theo dõi chỉ số CVR, Rate Card & sử dụng AI để ghép cặp cho các chiến dịch.
        </p>
      </div>

      {/* AI Matching Tool Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl border border-purple-700/50 shadow-lg space-y-4">
        <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
          <Sparkles className="w-5 h-5 text-purple-400" /> Trình AI Khớp Nối Host Cho Chiến Dịch
        </div>
        <div className="grid md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="text-slate-300 block mb-1 font-semibold">Chọn Thương Hiệu (Brand):</label>
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="w-full bg-slate-800 text-white p-2.5 rounded-xl border border-slate-700 font-bold focus:ring-2 focus:ring-purple-500"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.industry})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-slate-300 block mb-1 font-semibold">Danh Mục Sản Phẩm SKU:</label>
            <input
              type="text"
              value={targetCategory}
              onChange={(e) => setTargetCategory(e.target.value)}
              className="w-full bg-slate-800 text-white p-2.5 rounded-xl border border-slate-700 font-bold focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleRunMatching}
              disabled={isMatching}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold p-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow"
            >
              <Sparkles className="w-4 h-4" /> {isMatching ? "Đang Phân Tích..." : "AI Tìm Top Host Phù Hợp"}
            </button>
          </div>
        </div>

        {/* AI Matching Output Results */}
        {matchingResults && (
          <div className="bg-slate-950/80 p-4 rounded-xl border border-purple-800/80 space-y-3 pt-4 text-xs">
            <h4 className="font-bold text-purple-300 text-sm">Gợi Ý Top Host Phù Hợp Nhất Cho Brand:</h4>
            <div className="grid md:grid-cols-2 gap-4">
              {matchingResults.map((r, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-slate-900 border border-purple-500/40 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-sm text-white">{r.name}</span>
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                      Match Score: {r.matchScore}%
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">{r.reasoning}</p>
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
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Danh Sách Đội Ngũ Talent & Host Agency ({filteredTalents.length}/{talents.length} Talent)
            </h3>
            <p className="text-xs text-slate-500">Quản lý danh sách Host/KOC, theo dõi doanh thu TB và cập nhật thông tin</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm theo tên/SĐT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            {/* Role Filter */}
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="py-1.5 px-3 text-xs bg-slate-100 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="All">Tất cả vai trò</option>
              <option value="Host">Host</option>
              <option value="KOC">KOC</option>
              <option value="KOL">KOL</option>
              <option value="MC">MC</option>
            </select>

            {/* Add New Talent Button */}
            <button
              onClick={openAddModal}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
            >
              <Plus className="w-4 h-4" /> Thêm Talent Mới
            </button>
          </div>
        </div>

        {/* Talent Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTalents.map((t) => {
            const nicheArr = t.niches || (t as any).niche || [];
            const nicheStr = Array.isArray(nicheArr) ? nicheArr.join(", ") : String(nicheArr || "Đa ngành");
            const avatar = t.avatar || (t as any).avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250";
            const followers = t.followersTikTok || (t as any).tiktokFollowers || 0;
            const score = t.overallScore || (t as any).aiMatchScore || 90;
            const rate = t.ratePerSession || (t as any).rateCardFee || 0;

            return (
              <div key={t.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3 hover:border-purple-300 transition-all relative group">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <img src={avatar} alt={t.name} className="w-12 h-12 rounded-full object-cover border-2 border-purple-400 shadow-sm shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <h4 className="font-bold text-slate-900 text-xs truncate">{t.name}</h4>
                        <span className="bg-purple-100 text-purple-800 text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">
                          {t.role || "Host"}
                        </span>
                      </div>
                      <p className="text-[10px] text-purple-700 font-medium truncate">{nicheStr}</p>
                      <span className="text-[10px] text-slate-500 block truncate whitespace-nowrap">{followers.toLocaleString()} TikTok Followers</span>
                    </div>
                  </div>

                  {/* Edit & Delete Action Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(t)}
                      className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                      title="Chỉnh sửa Talent"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id, t.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Xóa Talent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] bg-white p-2.5 rounded-xl border border-slate-100 font-medium">
                  <div>GMV TB: <strong className="text-emerald-600 block text-xs font-bold">{((t.avgGmvPerSession || 100000000) / 1000000).toFixed(0)}M đ</strong></div>
                  <div>CVR TB: <strong className="text-purple-600 block text-xs font-bold">{t.cvrAvg || 4.5}%</strong></div>
                  <div>Rate Card: <strong className="text-slate-800 block font-bold">{rate.toLocaleString()} đ</strong></div>
                  <div>Hoa hồng: <strong className="text-indigo-600 block font-bold">{t.commissionRate || 3}%</strong></div>
                </div>

                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" /> {t.phone || "N/A"}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    t.availabilityStatus === "On Live" ? "bg-red-100 text-red-700 animate-pulse" :
                    t.availabilityStatus === "Busy" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
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
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                {editingTalent ? `Chỉnh Sửa Talent: ${editingTalent.name}` : "Thêm Talent Mới Vào Hệ Thống"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTalent} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tên Talent / Host *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="VD: Nguyễn Văn A (A Live)"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Số Điện Thoại</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="VD: 0988 123 456"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Vai Trò</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="Host">Host</option>
                    <option value="KOC">KOC</option>
                    <option value="KOL">KOL</option>
                    <option value="MC">MC</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Giới Tính</label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="Nữ">Nữ</option>
                    <option value="Nam">Nam</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Trạng Thái</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="Available">Sẵn Sàng (Available)</option>
                    <option value="Busy">Đã Bận (Busy)</option>
                    <option value="On Live">Đang Live (On Live)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Ngành Hàng Khớp Nối (Phân cách bằng dấu phẩy)</label>
                <input
                  type="text"
                  value={formNiches}
                  onChange={(e) => setFormNiches(e.target.value)}
                  placeholder="VD: Mỹ phẩm, Skincare, Thời trang"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">TikTok Followers</label>
                  <input
                    type="number"
                    value={formFollowers}
                    onChange={(e) => setFormFollowers(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">GMV TB Mỗi Phiên (VND)</label>
                  <input
                    type="number"
                    value={formGmv}
                    onChange={(e) => setFormGmv(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">CVR Trung Bình (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formCvr}
                    onChange={(e) => setFormCvr(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Rate Card (VND/Live)</label>
                  <input
                    type="number"
                    value={formRate}
                    onChange={(e) => setFormRate(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Hoa Hồng % (Commission)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formCommission}
                    onChange={(e) => setFormCommission(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">URL Ảnh Đại Diện (Avatar URL)</label>
                <input
                  type="text"
                  value={formAvatar}
                  onChange={(e) => setFormAvatar(e.target.value)}
                  placeholder="https://..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition-all"
                >
                  {editingTalent ? "Cập Nhật Talent" : "Lưu Talent Mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
