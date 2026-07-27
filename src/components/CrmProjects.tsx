import React, { useRef, useState } from "react";
import { Brand, AgencyProject, SystemUser } from "../types";
import { Building2, Layers, DollarSign, Sparkles, Plus, Edit3, Trash2, X, CheckCircle2, Clock, Phone, UserCheck } from "lucide-react";
import { authedFetch } from "../lib/authedFetch";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";

interface CrmProjectsProps {
  brands: Brand[];
  projects: AgencyProject[];
  users?: SystemUser[];
  onAddBrand?: (brand: Brand) => void;
  onUpdateBrand?: (brand: Brand) => void;
  onDeleteBrand?: (id: string) => void;
  onAddProject?: (project: AgencyProject) => void;
  onUpdateProject?: (project: AgencyProject) => void;
  onDeleteProject?: (id: string) => void;
}

export const CrmProjects: React.FC<CrmProjectsProps> = ({
  brands,
  projects,
  users = [],
  onAddBrand,
  onUpdateBrand,
  onDeleteBrand,
  onAddProject,
  onUpdateProject,
  onDeleteProject
}) => {
  // Internal agency staff eligible to be KAM / Team Lead owners
  const staffUsers = users.filter((u) => u.role === "ceo" || u.role === "operations");
  const [meetingNotes, setMeetingNotes] = useState(
    "Cuộc họp trao đổi với Brand Cocoon ngày 22/07: Khách hàng đồng ý tăng ngân sách thêm 150 triệu cho đợt Mega Live 8/8 tới. Cần bổ sung 2 Host dự phòng cho ngành Haircare và ghim 10 Voucher 100k duy nhất từ 20h00 đến 21h00."
  );
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Guards against a rapid double-click firing two creates before React re-renders the
  // disabled button — refs (not state) because the check must be synchronous on the very
  // first line of the handler, before any state update has a chance to flush.
  const isSavingBrandRef = useRef(false);
  const isSavingProjectRef = useRef(false);

  // Brand Modal State
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("🌿");
  const [brandIndustry, setBrandIndustry] = useState("Mỹ Phẩm / Skincare");
  const [brandContactName, setBrandContactName] = useState("");
  const [brandPhone, setBrandPhone] = useState("");
  const [brandEmail, setBrandEmail] = useState("");
  const [brandOwner, setBrandOwner] = useState("Lê Quốc Bảo (KAM Lead)");
  const [brandOwnerUserId, setBrandOwnerUserId] = useState<string>("");
  const [brandActiveCampaigns, setBrandActiveCampaigns] = useState(2);
  const [brandTotalGmv, setBrandTotalGmv] = useState(1200000000);
  const [brandContractStatus, setBrandContractStatus] = useState<"Active" | "Pending" | "Completed">("Active");

  // Project Modal State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<AgencyProject | null>(null);
  const [projName, setProjName] = useState("");
  const [projBrandId, setProjBrandId] = useState(brands[0]?.id || "brand-1");
  const [projBudget, setProjBudget] = useState(150000000);
  const [projKpiGmv, setProjKpiGmv] = useState(800000000);
  const [projActualGmv, setProjActualGmv] = useState(450000000);
  const [projPlannedSessions, setProjPlannedSessions] = useState(10);
  const [projCompletedSessions, setProjCompletedSessions] = useState(5);
  const [projTeamLead, setProjTeamLead] = useState("Trần Hoàng (Project Lead)");
  const [projTeamLeadUserId, setProjTeamLeadUserId] = useState<string>("");
  const [projStatus, setProjStatus] = useState<"In Progress" | "Planning" | "Completed" | "Paused">("In Progress");

  const handleSummarizeMeeting = async () => {
    if (!meetingNotes.trim()) return;
    setIsSummarizing(true);
    try {
      const res = await authedFetch("/api/gemini/summarize-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingNotes })
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setAiSummary(data.summary);
        return;
      }
      throw new Error(data.error || "Empty AI summary result");
    } catch (e) {
      console.error("AI Meeting Summary failed:", e);
      setAiSummary("⚠️ Không thể tạo tóm tắt lúc này (lỗi kết nối AI). Vui lòng thử lại sau.");
    } finally {
      setIsSummarizing(false);
    }
  };

  // Brand Handlers
  const openAddBrandModal = () => {
    setEditingBrand(null);
    setBrandName("");
    setBrandLogo("✨");
    setBrandIndustry("Mỹ Phẩm / Thời Trang");
    setBrandContactName("");
    setBrandPhone("0909 123 456");
    setBrandEmail("contact@brand.com");
    setBrandOwner("Lê Quốc Bảo (KAM Lead)");
    setBrandOwnerUserId(staffUsers[0]?.id || "");
    setBrandActiveCampaigns(1);
    setBrandTotalGmv(500000000);
    setBrandContractStatus("Active");
    setIsBrandModalOpen(true);
  };

  const openEditBrandModal = (b: Brand) => {
    setEditingBrand(b);
    setBrandName(b.name);
    setBrandLogo(b.logo);
    setBrandIndustry(b.industry);
    setBrandContactName(b.contactName);
    setBrandPhone(b.phone);
    setBrandEmail(b.email || "contact@brand.com");
    setBrandOwner(b.owner);
    setBrandOwnerUserId(b.ownerUserId || "");
    setBrandActiveCampaigns(b.activeCampaigns);
    setBrandTotalGmv(b.totalGmv);
    setBrandContractStatus(b.contractStatus);
    setIsBrandModalOpen(true);
  };

  const handleBrandOwnerSelect = (userId: string) => {
    setBrandOwnerUserId(userId);
    const staff = staffUsers.find((u) => u.id === userId);
    if (staff) setBrandOwner(`${staff.name} (${staff.customRoleTitle})`);
  };

  const handleSaveBrand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) return;
    if (isSavingBrandRef.current) return;
    isSavingBrandRef.current = true;

    const brandPayload: Brand = {
      id: editingBrand ? editingBrand.id : `brand-${Date.now()}`,
      name: brandName,
      logo: brandLogo || "🏢",
      industry: brandIndustry,
      contactName: brandContactName || "Nguyễn Văn A",
      phone: brandPhone || "0909 123 456",
      email: brandEmail || "info@brand.com",
      activeCampaigns: Number(brandActiveCampaigns),
      totalGmv: Number(brandTotalGmv),
      contractStatus: brandContractStatus,
      owner: brandOwner,
      ownerUserId: brandOwnerUserId || undefined
    };

    if (editingBrand) {
      if (onUpdateBrand) onUpdateBrand(brandPayload);
    } else {
      if (onAddBrand) onAddBrand(brandPayload);
    }

    setIsBrandModalOpen(false);
    isSavingBrandRef.current = false;
  };

  const handleDeleteBrand = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa thương hiệu "${name}"?`)) {
      if (onDeleteBrand) onDeleteBrand(id);
    }
  };

  // Project Handlers
  const openAddProjectModal = () => {
    setEditingProject(null);
    setProjName("");
    setProjBrandId(brands[0]?.id || "brand-1");
    setProjBudget(150000000);
    setProjKpiGmv(800000000);
    setProjActualGmv(0);
    setProjPlannedSessions(8);
    setProjCompletedSessions(0);
    setProjTeamLead("Lê Quốc Bảo");
    setProjTeamLeadUserId(staffUsers[0]?.id || "");
    setProjStatus("In Progress");
    setIsProjectModalOpen(true);
  };

  const openEditProjectModal = (p: AgencyProject) => {
    setEditingProject(p);
    setProjName(p.name);
    setProjBrandId(p.brandId);
    setProjBudget(p.budget);
    setProjKpiGmv(p.kpiGmv);
    setProjActualGmv(p.actualGmv);
    setProjPlannedSessions(p.totalSessionsPlanned);
    setProjCompletedSessions(p.sessionsCompleted);
    setProjTeamLead(p.teamLead);
    setProjTeamLeadUserId(p.teamLeadUserId || "");
    setProjStatus(p.status);
    setIsProjectModalOpen(true);
  };

  const handleTeamLeadSelect = (userId: string) => {
    setProjTeamLeadUserId(userId);
    const staff = staffUsers.find((u) => u.id === userId);
    if (staff) setProjTeamLead(`${staff.name} (${staff.customRoleTitle})`);
  };

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim()) return;
    if (isSavingProjectRef.current) return;
    isSavingProjectRef.current = true;

    const selectedBrand = brands.find((b) => b.id === projBrandId);

    const projectPayload: AgencyProject = {
      id: editingProject ? editingProject.id : `proj-${Date.now()}`,
      name: projName,
      brandId: projBrandId,
      brandName: selectedBrand ? selectedBrand.name : "Thương Hiệu",
      budget: Number(projBudget),
      kpiGmv: Number(projKpiGmv),
      actualGmv: Number(projActualGmv),
      startDate: editingProject?.startDate || new Date().toISOString().split("T")[0],
      endDate: editingProject?.endDate || "2026-08-31",
      status: projStatus,
      totalSessionsPlanned: Number(projPlannedSessions),
      sessionsCompleted: Number(projCompletedSessions),
      teamLead: projTeamLead,
      teamLeadUserId: projTeamLeadUserId || undefined
    };

    if (editingProject) {
      if (onUpdateProject) onUpdateProject(projectPayload);
    } else {
      if (onAddProject) onAddProject(projectPayload);
    }

    setIsProjectModalOpen(false);
    isSavingProjectRef.current = false;
  };

  const handleDeleteProject = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa dự án "${name}"?`)) {
      if (onDeleteProject) onDeleteProject(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-purple-400" /> Modules 01 & 02: CRM & Project Management
        </span>
        <h2 className="text-2xl font-black">Quản Lý Khách Hàng (Brand CRM) & Dự Án Agency</h2>
      </div>

      {/* Brand CRM Section */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-100 text-base">Danh Sách Thương Hiệu Đối Tác ({brands.length} Brands)</h3>
          </div>
          <button
            onClick={openAddBrandModal}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
          >
            <Plus className="w-4 h-4" /> Thêm Thương Hiệu
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {brands.map((b) => (
            <div key={b.id} className="p-4 rounded-2xl border border-slate-800 bg-slate-800/40 space-y-3 hover:border-purple-500/50 transition-all relative group">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl p-2 bg-slate-800 rounded-xl border border-slate-700 shadow-sm">{b.logo}</span>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">{b.name}</h4>
                    <p className="text-xs text-purple-300 font-medium">{b.industry}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                    b.contractStatus === "Active" ? "bg-emerald-900/50 text-emerald-300" :
                    b.contractStatus === "Pending" ? "bg-amber-900/50 text-amber-300" : "bg-slate-700 text-slate-300"
                  }`}>
                    {b.contractStatus}
                  </span>
                  <button
                    onClick={() => openEditBrandModal(b)}
                    className="p-1 text-slate-400 hover:text-purple-400 rounded transition-all"
                    title="Chỉnh sửa Brand"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteBrand(b.id, b.name)}
                    className="p-1 text-slate-400 hover:text-red-400 rounded transition-all"
                    title="Xóa Brand"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-800/60 p-2.5 rounded-xl border border-slate-800 text-slate-400">
                <div>Đại diện Brand: <strong className="text-slate-100 block">{b.contactName} ({b.phone})</strong></div>
                <div>Phụ trách KAM: <strong className="text-slate-100 block">{b.owner}</strong></div>
              </div>

              <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800">
                <span className="text-slate-400">Chiến dịch active: <strong>{b.activeCampaigns} campaigns</strong></span>
                <span className="text-emerald-400 font-bold">Tổng GMV: {formatCurrencyAdaptive(b.totalGmv)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Meeting Summarizer */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-6 rounded-2xl border border-purple-700/50 shadow-lg space-y-4">
        <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
          <Sparkles className="w-5 h-5 text-purple-400" /> AI Brand Meeting Summarizer & Action Item Generator
        </div>
        <div className="space-y-3 text-xs">
          <textarea
            value={meetingNotes}
            onChange={(e) => setMeetingNotes(e.target.value)}
            rows={3}
            className="w-full bg-slate-800 text-white p-3 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleSummarizeMeeting}
            disabled={isSummarizing}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow"
          >
            <Sparkles className="w-4 h-4" /> {isSummarizing ? "Đang Tóm Tắt..." : "Gemini AI Tóm Tắt & Giao Task Tự Động"}
          </button>
          {aiSummary && (
            <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/50 text-slate-200 whitespace-pre-line leading-relaxed font-mono">
              {aiSummary}
            </div>
          )}
        </div>
      </div>

      {/* Projects Kanban / List */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-100 text-base">Tiến Độ Các Dự Án Livestream ({projects.length} Dự Án)</h3>
          </div>
          <button
            onClick={openAddProjectModal}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
          >
            <Plus className="w-4 h-4" /> Tạo Dự Án Mới
          </button>
        </div>

        <div className="space-y-3">
          {projects.map((p) => {
            const percentGmv = p.kpiGmv > 0 ? Math.min(100, Math.round((p.actualGmv / p.kpiGmv) * 100)) : 0;
            return (
              <div key={p.id} className="p-4 rounded-2xl border border-slate-800 bg-slate-800/40 space-y-3 hover:border-purple-500/50 transition-all relative group">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                      {p.name}
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                        p.status === "In Progress" ? "bg-purple-900/50 text-purple-300" :
                        p.status === "Completed" ? "bg-emerald-900/50 text-emerald-300" : "bg-amber-900/50 text-amber-300"
                      }`}>
                        {p.status}
                      </span>
                    </h4>
                    <span className="text-slate-400">Brand: {p.brandName} | Team Lead: {p.teamLead}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="bg-purple-900/50 text-purple-300 font-bold px-3 py-1 rounded-full text-xs">
                      {p.sessionsCompleted}/{p.totalSessionsPlanned} Phiên Live
                    </span>
                    <button
                      onClick={() => openEditProjectModal(p)}
                      className="p-1 text-slate-400 hover:text-purple-400 rounded transition-all"
                      title="Chỉnh sửa dự án"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteProject(p.id, p.name)}
                      className="p-1 text-slate-400 hover:text-red-400 rounded transition-all"
                      title="Xóa dự án"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-slate-400">Thực Thu GMV: {p.actualGmv.toLocaleString()} đ</span>
                    <span className="text-emerald-400">KPI Target: {p.kpiGmv.toLocaleString()} đ ({percentGmv}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-600 to-emerald-500 rounded-full" style={{ width: `${percentGmv}%` }}></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Brand Form Modal */}
      {isBrandModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400" />
                {editingBrand ? `Chỉnh Sửa Thương Hiệu: ${editingBrand.name}` : "Thêm Thương Hiệu Đối Tác Mới"}
              </h3>
              <button onClick={() => setIsBrandModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBrand} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-300 block mb-1">Tên Thương Hiệu (Brand Name) *</label>
                  <input
                    type="text"
                    required
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="VD: Maybelline Official"
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Logo / Emoji</label>
                  <input
                    type="text"
                    value={brandLogo}
                    onChange={(e) => setBrandLogo(e.target.value)}
                    placeholder="🌿"
                    className="w-full p-2.5 border border-slate-700 rounded-xl text-center font-bold text-lg bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Ngành Hàng (Industry)</label>
                  <input
                    type="text"
                    value={brandIndustry}
                    onChange={(e) => setBrandIndustry(e.target.value)}
                    placeholder="VD: Mỹ Phẩm Skincare"
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Trạng Thái Hợp Đồng</label>
                  <select
                    value={brandContractStatus}
                    onChange={(e) => setBrandContractStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100"
                  >
                    <option value="Active">Active (Đang Chạy)</option>
                    <option value="Pending">Pending (Đang Đàm Đạo)</option>
                    <option value="Completed">Completed (Đã Hoàn Thành)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Tên Người Đại Diện Brand</label>
                  <input
                    type="text"
                    value={brandContactName}
                    onChange={(e) => setBrandContactName(e.target.value)}
                    placeholder="VD: Nguyễn Thị Lan"
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Số Điện Thoại Đại Diện</label>
                  <input
                    type="text"
                    value={brandPhone}
                    onChange={(e) => setBrandPhone(e.target.value)}
                    placeholder="VD: 0909 123 456"
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Nhân Viên Phụ Trách (KAM Lead)</label>
                  {staffUsers.length > 0 ? (
                    <select
                      value={brandOwnerUserId}
                      onChange={(e) => handleBrandOwnerSelect(e.target.value)}
                      className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100"
                    >
                      <option value="">-- Chọn nhân sự phụ trách --</option>
                      {staffUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.customRoleTitle})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={brandOwner}
                      onChange={(e) => setBrandOwner(e.target.value)}
                      placeholder="VD: Lê Quốc Bảo"
                      className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                    />
                  )}
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Tổng Doanh Thu Tích Lũy (VNĐ)</label>
                  <input
                    type="number"
                    value={brandTotalGmv}
                    onChange={(e) => setBrandTotalGmv(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsBrandModalOpen(false)}
                  className="px-4 py-2 text-slate-400 font-bold hover:bg-slate-800 rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition-all"
                >
                  {editingBrand ? "Cập Nhật Brand" : "Lưu Brand Mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Form Modal */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                {editingProject ? `Chỉnh Sửa Dự Án: ${editingProject.name}` : "Tạo Dự Án Livestream Mới"}
              </h3>
              <button onClick={() => setIsProjectModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Tên Dự Án / Campaign *</label>
                <input
                  type="text"
                  required
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="VD: Mega Live 8/8 Brand Cocoon"
                  className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Thương Hiệu (Brand)</label>
                  <select
                    value={projBrandId}
                    onChange={(e) => setProjBrandId(e.target.value)}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.logo} {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Trạng Thái Dự Án</label>
                  <select
                    value={projStatus}
                    onChange={(e) => setProjStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100"
                  >
                    <option value="In Progress">In Progress (Đang Chạy)</option>
                    <option value="Planning">Planning (Lập Kế Hoạch)</option>
                    <option value="Completed">Completed (Hoàn Thành)</option>
                    <option value="Paused">Paused (Tạm Dừng)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Ngân Sách Campaign (VNĐ)</label>
                  <input
                    type="number"
                    value={projBudget}
                    onChange={(e) => setProjBudget(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">KPI Target GMV (VNĐ)</label>
                  <input
                    type="number"
                    value={projKpiGmv}
                    onChange={(e) => setProjKpiGmv(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">GMV Thực Đạt (VNĐ)</label>
                  <input
                    type="number"
                    value={projActualGmv}
                    onChange={(e) => setProjActualGmv(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Tổng Phiên Live Kế Hoạch</label>
                  <input
                    type="number"
                    value={projPlannedSessions}
                    onChange={(e) => setProjPlannedSessions(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Phiên Hoàn Thành</label>
                  <input
                    type="number"
                    value={projCompletedSessions}
                    onChange={(e) => setProjCompletedSessions(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Trưởng Nhóm Dự Án (Team Lead)</label>
                {staffUsers.length > 0 ? (
                  <select
                    value={projTeamLeadUserId}
                    onChange={(e) => handleTeamLeadSelect(e.target.value)}
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100"
                  >
                    <option value="">-- Chọn Team Lead --</option>
                    {staffUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.customRoleTitle})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={projTeamLead}
                    onChange={(e) => setProjTeamLead(e.target.value)}
                    placeholder="VD: Trần Hoàng"
                    className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(false)}
                  className="px-4 py-2 text-slate-400 font-bold hover:bg-slate-800 rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition-all"
                >
                  {editingProject ? "Cập Nhật Dự Án" : "Lưu Dự Án Mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
