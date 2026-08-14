import React, { useRef, useState } from "react";
import { Brand, BrandPlatformRate, BrandPlatformRateHistoryEntry, LiveSession, SystemUser, UserRole } from "../types";
import { Building2, Plus, Edit3, Trash2, X, Tag } from "lucide-react";
import { BrandLogo } from "./ui/BrandLogo";
import { BrandRateCard } from "./BrandRateCard";

interface CrmProjectsProps {
  brands: Brand[];
  users?: SystemUser[];
  onAddBrand?: (brand: Brand) => void;
  onUpdateBrand?: (brand: Brand) => void;
  onDeleteBrand?: (id: string) => void;
  currentRole: UserRole;
  brandPlatformRates: BrandPlatformRate[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  sessions: LiveSession[];
  onSaveRate: (brandId: string, platform: "TikTok" | "Shopee", ratePerHour: number) => Promise<boolean>;
  onSaveReturnRate: (brandId: string, platform: "TikTok" | "Shopee", returnRate: number) => Promise<boolean>;
}

export const CrmProjects: React.FC<CrmProjectsProps> = ({
  brands,
  users = [],
  onAddBrand,
  onUpdateBrand,
  onDeleteBrand,
  currentRole,
  brandPlatformRates,
  brandPlatformRateHistory,
  sessions,
  onSaveRate,
  onSaveReturnRate
}) => {
  // Internal agency staff eligible to be KAM owners
  const staffUsers = users.filter((u) => u.role === "ceo" || u.role === "admin" || u.role === "operations");
  // Rate Card set tập trung ở đây (CRM) thay vì phải vào từng Brand Workspace — chỉ mở 1
  // brand tại 1 thời điểm, đóng lại khi chọn brand khác hoặc bấm đóng.
  const [expandedRateCardBrandId, setExpandedRateCardBrandId] = useState<string | null>(null);

  // Guards against a rapid double-click firing two creates before React re-renders the
  // disabled button — a ref (not state) because the check must be synchronous on the very
  // first line of the handler, before any state update has a chance to flush.
  const isSavingBrandRef = useRef(false);

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
  const [brandTotalGmv, setBrandTotalGmv] = useState(1200000000);
  const [brandContractStatus, setBrandContractStatus] = useState<"Active" | "Pending" | "Completed">("Active");
  const [brandBillingModel, setBrandBillingModel] = useState<"gmv_commission" | "hourly">("gmv_commission");

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
    setBrandTotalGmv(500000000);
    setBrandContractStatus("Active");
    setBrandBillingModel("gmv_commission");
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
    setBrandTotalGmv(b.totalGmv);
    setBrandContractStatus(b.contractStatus);
    setBrandBillingModel(b.billingModel ?? "gmv_commission");
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
      totalGmv: Number(brandTotalGmv),
      contractStatus: brandContractStatus,
      owner: brandOwner,
      ownerUserId: brandOwnerUserId || undefined,
      billingModel: brandBillingModel
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

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-purple-400" /> Module 01: CRM
        </span>
        <h2 className="text-2xl font-black">Quản Lý Khách Hàng (Brand CRM)</h2>
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
                  <BrandLogo brand={b} size="md" className="bg-slate-800 border border-slate-700 shadow-sm" />
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
                    onClick={() => setExpandedRateCardBrandId((cur) => (cur === b.id ? null : b.id))}
                    className={`p-1 rounded transition-all ${expandedRateCardBrandId === b.id ? "text-blue-400" : "text-slate-400 hover:text-blue-400"}`}
                    title="Rate Card"
                  >
                    <Tag className="w-3.5 h-3.5" />
                  </button>
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

              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {b.billingModel === "hourly" ? "💰 Thu Phí Theo Giờ Live" : "📊 Thu Phí Theo % GMV"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rate Card — set tập trung tại đây cho mọi Brand, không cần vào từng Brand Workspace */}
      {expandedRateCardBrandId && (
        <div className="bg-slate-900 p-6 rounded-2xl border border-blue-500/40 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
              <Tag className="w-4 h-4 text-blue-400" />
              Rate Card — {brands.find((b) => b.id === expandedRateCardBrandId)?.name}
            </h3>
            <button
              onClick={() => setExpandedRateCardBrandId(null)}
              className="p-1 text-slate-400 hover:text-white rounded transition-all"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <BrandRateCard
            brandId={expandedRateCardBrandId}
            currentRole={currentRole}
            brandPlatformRates={brandPlatformRates}
            brandPlatformRateHistory={brandPlatformRateHistory}
            sessions={sessions}
            onSaveRate={onSaveRate}
            onSaveReturnRate={onSaveReturnRate}
          />
        </div>
      )}

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

              <div>
                <label className="font-bold text-slate-300 block mb-1">Hình Thức Thu Phí (Billing Model)</label>
                <select
                  value={brandBillingModel}
                  onChange={(e) => setBrandBillingModel(e.target.value as "gmv_commission" | "hourly")}
                  className="w-full p-2.5 border border-slate-700 rounded-xl font-semibold bg-slate-950 text-slate-100"
                >
                  <option value="gmv_commission">Theo % GMV (Commission)</option>
                  <option value="hourly">Theo Giờ Live (Rate/Giờ)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Quyết định công thức tính Doanh Thu Agency ở tab Finance & HR. "Theo Giờ Live" dùng đơn giá cấu hình ở tab Đăng Ký &amp; Chốt Lịch Host.
                </p>
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
    </div>
  );
};
