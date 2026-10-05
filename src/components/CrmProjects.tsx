import React, { useRef, useState } from "react";
import { Brand, BrandPlatformRate, BrandPlatformRateHistoryEntry, LiveSession, SystemUser, UserRole } from "../types";
import { Building2, Plus, Edit3, Trash2, X, Tag, DollarSign, Percent } from "lucide-react";
import { BrandLogo } from "./ui/BrandLogo";
import { BrandRateCard } from "./BrandRateCard";
import { useConfirm } from "../hooks/useConfirm";
import { statusLabel } from "../lib/statusLabels";
import { PageHeader } from "./common/PageHeader";

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
  onSaveCommissionRate: (brandId: string, platform: "TikTok" | "Shopee", commissionRate: number) => Promise<boolean>;
}

// Ngoài component: lint React Compiler coi Date.now() trong thân component là gọi hàm không thuần lúc render.
const newBrandId = () => `brand-${Date.now()}`;

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
  onSaveReturnRate,
  onSaveCommissionRate
}) => {
  const confirm = useConfirm();
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
  const [brandLogo, setBrandLogo] = useState("");
  const [brandIndustry, setBrandIndustry] = useState("");
  const [brandContactName, setBrandContactName] = useState("");
  const [brandPhone, setBrandPhone] = useState("");
  const [brandEmail, setBrandEmail] = useState("");
  const [brandOwner, setBrandOwner] = useState("");
  const [brandOwnerUserId, setBrandOwnerUserId] = useState<string>("");
    const [brandContractStatus, setBrandContractStatus] = useState<"Active" | "Pending" | "Completed">("Active");
  const [brandBillingModel, setBrandBillingModel] = useState<"gmv_commission" | "hourly">("gmv_commission");

  const kamName = (b: Brand) => (b.ownerUserId ? users.find((u) => u.id === b.ownerUserId)?.name ?? b.owner : b.owner);

  // Form thêm brand mở TRỐNG (audit người mới 2026-10-04): bản cũ điền sẵn SĐT "0909 123 456", email
  // "contact@brand.com", KAM "Lê Quốc Bảo (KAM Lead)", doanh thu 500.000.000 và để trống thì lưu "Nguyễn Văn A" —
  // Franklin + CROCS trên production mang đúng SĐT mẫu đó, cả 4 brand mang KAM mẫu (không có tài khoản nào tên đó).
  const openAddBrandModal = () => {
    setEditingBrand(null);
    setBrandName("");
    setBrandLogo("");
    setBrandIndustry("");
    setBrandContactName("");
    setBrandPhone("");
    setBrandEmail("");
    setBrandOwner("");
    setBrandOwnerUserId("");
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
    setBrandEmail(b.email || "");
    setBrandOwner(b.owner);
    setBrandOwnerUserId(b.ownerUserId || "");
    setBrandContractStatus(b.contractStatus);
    setBrandBillingModel(b.billingModel ?? "gmv_commission");
    setIsBrandModalOpen(true);
  };

  const handleBrandOwnerSelect = (userId: string) => {
    setBrandOwnerUserId(userId);
    const staff = staffUsers.find((u) => u.id === userId);
    setBrandOwner(staff ? `${staff.name} (${staff.customRoleTitle})` : "");
  };

  const handleSaveBrand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) return;
    if (isSavingBrandRef.current) return;
    isSavingBrandRef.current = true;

    const kam = staffUsers.find((u) => u.id === brandOwnerUserId);
    const brandPayload: Brand = {
      id: editingBrand ? editingBrand.id : newBrandId(),
      name: brandName,
      logo: brandLogo || "🏢",
      industry: brandIndustry,
      contactName: brandContactName.trim(),
      phone: brandPhone.trim(),
      email: brandEmail.trim(),
      // Cột "doanh thu tích luỹ" gõ tay đã bỏ khỏi form — GMV thật cộng từ ca. Giữ nguyên giá trị cũ khi sửa.
      totalGmv: editingBrand?.totalGmv ?? 0,
      contractStatus: brandContractStatus,
      // Có danh sách tài khoản thì chữ KAM luôn suy từ tài khoản đang chọn — không để chữ cũ lệch tài khoản gắn kèm.
      owner: staffUsers.length > 0 ? (kam ? `${kam.name} (${kam.customRoleTitle})` : "") : brandOwner,
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

  const handleDeleteBrand = async (id: string, name: string) => {
    if (await confirm(`Bạn có chắc chắn muốn xóa thương hiệu "${name}"?`, { danger: true })) {
      if (onDeleteBrand) onDeleteBrand(id);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title="CRM"
        description="Brand đang hợp tác: người liên hệ phía brand, KAM phụ trách và cách tính phí (theo giờ live hay % GMV)."
      />

      {/* Brand CRM Section */}
      <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-[var(--text)] text-base">Brand đang hợp tác ({brands.length})</h3>
          </div>
          <button
            onClick={openAddBrandModal}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
          >
            <Plus className="w-4 h-4" /> Thêm brand
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {brands.map((b) => (
            <div key={b.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)]/40 space-y-3 hover:border-[var(--accent)]/50 transition-all relative group">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <BrandLogo brand={b} size="md" className="bg-[var(--surface-elevated)] border border-[var(--border)] shadow-sm" />
                  <div>
                    <h4 className="font-bold text-[var(--text)] text-sm">{b.name}</h4>
                    <p className="text-xs text-[var(--accent-text)] font-medium">{b.industry}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    b.contractStatus === "Active" ? "bg-emerald-900/85 text-emerald-300" :
                    b.contractStatus === "Pending" ? "bg-amber-900/85 text-amber-300" : "bg-[var(--surface-hover)] text-[var(--text-muted)]"
                  }`}>
                    {statusLabel(b.contractStatus)}
                  </span>
                  <button
                    onClick={() => setExpandedRateCardBrandId((cur) => (cur === b.id ? null : b.id))}
                    className={`p-1.5 rounded transition-all ${expandedRateCardBrandId === b.id ? "text-blue-400" : "text-[var(--text-muted)] hover:text-blue-400"}`}
                    title="Rate Card"
                  >
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openEditBrandModal(b)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-text)] rounded transition-all"
                    title="Chỉnh sửa Brand"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteBrand(b.id, b.name)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-red-400 rounded transition-all"
                    title="Xóa Brand"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-[var(--surface-elevated)]/60 p-2.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)]">
                <div>Đại diện brand: <strong className="text-[var(--text)] block">{[b.contactName, b.phone].filter(Boolean).join(" · ") || <span className="font-normal text-[var(--text-faint)]">Chưa nhập</span>}</strong></div>
                {/* KAM = tài khoản đã chọn (một nguồn); chữ `owner` chỉ dùng khi không có danh sách tài khoản (form gõ tay). */}
                <div>KAM phụ trách: <strong className="text-[var(--text)] block">{kamName(b) || <span className="font-normal text-[var(--text-faint)]">Chưa chọn</span>}</strong></div>
              </div>

              <div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)] inline-flex items-center gap-1">
                  {b.billingModel === "hourly" ? (
                    <>
                      <DollarSign className="w-3 h-3" /> Thu phí theo giờ live
                    </>
                  ) : (
                    <>
                      <Percent className="w-3 h-3" /> Thu phí theo % doanh số
                    </>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rate Card — set tập trung tại đây cho mọi Brand, không cần vào từng Brand Workspace */}
      {expandedRateCardBrandId && (
        <div className="bg-[var(--surface)] p-6 rounded-2xl border border-blue-500/40 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
              <Tag className="w-4 h-4 text-blue-400" />
              Rate Card — {brands.find((b) => b.id === expandedRateCardBrandId)?.name}
            </h3>
            <button
              onClick={() => setExpandedRateCardBrandId(null)}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] rounded transition-all"
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
            onSaveCommissionRate={onSaveCommissionRate}
          />
        </div>
      )}

      {/* Brand Form Modal */}
      {isBrandModalOpen && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-lg rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[var(--surface)] text-[var(--text)] px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[var(--accent-text)]" />
                {editingBrand ? `Sửa brand: ${editingBrand.name}` : "Thêm brand"}
              </h3>
              <button onClick={() => setIsBrandModalOpen(false)} className="p-1.5 -m-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBrand} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Tên brand *</label>
                  <input
                    type="text"
                    required
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="VD: CROCS"
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Logo / Emoji</label>
                  <input
                    type="text"
                    value={brandLogo}
                    onChange={(e) => setBrandLogo(e.target.value)}
                    placeholder="🌿"
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl text-center font-bold text-lg bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Ngành hàng</label>
                  <input
                    type="text"
                    value={brandIndustry}
                    onChange={(e) => setBrandIndustry(e.target.value)}
                    placeholder="VD: Mỹ Phẩm Skincare"
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Trạng thái hợp tác</label>
                  <select
                    value={brandContractStatus}
                    onChange={(e) => setBrandContractStatus(e.target.value as "Active" | "Pending" | "Completed")}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)]"
                  >
                    <option value="Active">Đang chạy</option>
                    <option value="Pending">Đang đàm phán</option>
                    <option value="Completed">Đã dừng</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Cách thu phí</label>
                <select
                  value={brandBillingModel}
                  onChange={(e) => setBrandBillingModel(e.target.value as "gmv_commission" | "hourly")}
                  className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)]"
                >
                  <option value="gmv_commission">Theo % doanh số (hoa hồng)</option>
                  <option value="hourly">Theo giờ live (đơn giá/giờ)</option>
                </select>
                <p className="text-[11px] text-[var(--text-faint)] mt-1">
                  Quyết định cách Finance & P&L tính doanh thu agency. Đơn giá/giờ và % hoa hồng nhập ở nút Rate Card (biểu tượng nhãn) trên thẻ brand. Số giờ cam kết mỗi tháng nhập ở Cam Kết Hợp Đồng.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Người đại diện phía brand</label>
                  <input
                    type="text"
                    value={brandContactName}
                    onChange={(e) => setBrandContactName(e.target.value)}
                    placeholder="VD: Nguyễn Thị Lan"
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">SĐT người đại diện</label>
                  <input
                    type="text"
                    value={brandPhone}
                    onChange={(e) => setBrandPhone(e.target.value)}
                    placeholder="Số điện thoại"
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
              </div>

              <div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">KAM phụ trách</label>
                  {staffUsers.length > 0 ? (
                    <select
                      value={brandOwnerUserId}
                      onChange={(e) => handleBrandOwnerSelect(e.target.value)}
                      className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)]"
                    >
                      <option value="">Chưa chọn</option>
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
                      placeholder="Tên nhân sự phụ trách"
                      className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                    />
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsBrandModalOpen(false)}
                  className="px-4 py-2 text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)] rounded-xl transition-all"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl shadow transition-all"
                >
                  {editingBrand ? "Lưu" : "Thêm brand"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
