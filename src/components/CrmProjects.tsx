import React, { useEffect, useMemo, useRef, useState } from "react";
import { Brand, BrandContract, BrandMonthlyCommitment, BrandPlatformRate, BrandPlatformRateHistoryEntry, BrandStudio, LiveSession, Studio, SystemUser, UserRole } from "../types";
import { Building2, Plus, Edit3, Trash2, X, FileSignature } from "lucide-react";
import { BrandLogo } from "./ui/BrandLogo";
import { BrandConfigPanel } from "./BrandConfigPanel";
import { useConfirm } from "../hooks/useConfirm";
import { statusLabel } from "../lib/statusLabels";
import { PageHeader } from "./common/PageHeader";
import { commitmentsRead, contractsRead, fetchBrandContracts, fetchBrandMonthlyCommitments } from "../lib/db/brandContracts";
import type { TabPrefetchCtx } from "../lib/db/prefetch";
import { findBrandStudioId } from "../lib/db/brandStudios";
import { brandPriceLabel } from "../lib/brandPricing";
import { contractCovering, monthKeyOf, todayVn } from "../lib/performance/brandCommitment";
import { brandPlatformsOf, type ReportPlatform } from "../lib/reportPlatform";
import { takeCrmFocus } from "../lib/crmFocus";
import { errorMessage } from "../lib/errorMessage";
import { fmtMonth } from "../lib/format";

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
  studios: Studio[];
  brandStudios: BrandStudio[];
  onSetBrandStudio: (brandId: string, platform: "TikTok" | "Shopee", studioId: string) => Promise<boolean>;
  /** Sang Kế Hoạch Tháng của brand × sàn (sửa cam kết một tháng). */
  onOpenMonthPlan?: (brandId: string, platform: "TikTok" | "Shopee") => void;
}

// Lượt đọc lúc mở màn — nạp trước trong lúc chờ đợt nạp chung (lib/db/prefetch.ts).
export function prefetchCrm(_ctx: TabPrefetchCtx): void {
  contractsRead.prefetch();
  commitmentsRead.prefetch();
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
  onSaveCommissionRate,
  studios,
  brandStudios,
  onSetBrandStudio,
  onOpenMonthPlan
}) => {
  const confirm = useConfirm();
  const today = todayVn();
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  // Internal agency staff eligible to be KAM owners
  const staffUsers = users.filter((u) => u.role === "ceo" || u.role === "admin" || u.role === "operations");
  // "Hợp đồng & giá" — mở 1 brand × sàn tại 1 thời điểm. Nút "Sửa ở CRM" của màn khác bung sẵn đúng brand (crmFocus).
  const [focus, setFocus] = useState<{ brandId: string; platform: ReportPlatform } | null>(() => takeCrmFocus());
  const [contracts, setContracts] = useState<BrandContract[]>([]);
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Khối sửa nằm dưới lưới thẻ brand — bấm mở (hoặc tới từ nút "Sửa ở CRM") thì cuộn tới, không thì trên điện thoại
  // người dùng bấm mà tưởng không có gì xảy ra.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus?.brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([contractsRead.take(), commitmentsRead.take()])
      .then(([c, m]) => {
        setContracts(c);
        setCommitments(m);
      })
      .catch((e) => setLoadError(errorMessage(e, "Không tải được hợp đồng")));
  }, []);
  const reloadContracts = async () => {
    const [c, m] = await Promise.all([fetchBrandContracts(), fetchBrandMonthlyCommitments()]);
    setContracts(c);
    setCommitments(m);
  };

  // Sàn hiện trên thẻ: sàn brand có ca/phòng, cộng sàn đã có hợp đồng hoặc giá.
  const platformsOf = useMemo(() => {
    const extra = [...brandStudios, ...contracts, ...brandPlatformRates];
    return (brandId: string) => brandPlatformsOf(brandId, sessions, extra);
  }, [sessions, brandStudios, contracts, brandPlatformRates]);
  const thisMonth = monthKeyOf(today);

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
      // Cách thu phí đặt ở "Hợp đồng & giá" (cùng chỗ với đơn giá/hoa hồng) — form brand giữ nguyên giá trị đang có.
      billingModel: editingBrand?.billingModel ?? "gmv_commission"
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
        description="Brand đang hợp tác và MỌI điều khoản với từng brand: người liên hệ, KAM, cách thu phí, giá, hợp đồng + giờ cam kết, phòng live mặc định — theo từng sàn. Đây là chỗ nhập duy nhất; màn khác chỉ đọc."
      />
      {loadError && <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-900 rounded-lg px-3 py-2">{loadError}</p>}

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

              {/* Tóm tắt hợp đồng & giá theo sàn — bấm để mở khối sửa (chỗ nhập duy nhất). */}
              <div className="space-y-1.5">
                {platformsOf(b.id).map((p) => {
                  const contract = contractCovering(contracts, b.id, p, thisMonth);
                  const price = brandPriceLabel(b, brandPlatformRates, p);
                  const studio = studios.find((x) => x.id === findBrandStudioId(brandStudios, b.id, p));
                  const open = focus?.brandId === b.id && focus.platform === p;
                  const missing = <span className="text-amber-300">chưa có</span>;
                  return (
                    <button
                      key={p}
                      onClick={() => setFocus(open ? null : { brandId: b.id, platform: p })}
                      aria-expanded={open}
                      className={`w-full text-left text-[11px] rounded-xl border px-2.5 py-2 transition-all ${open ? "border-blue-500/60 bg-blue-950/20" : "border-[var(--border)] hover:border-blue-500/40"}`}
                    >
                      <span className="font-bold text-[var(--text)] flex items-center gap-1.5">
                        <FileSignature className="w-3 h-3 text-blue-400" /> Hợp đồng & giá · {p}
                        <span className="ml-auto font-normal text-[var(--accent-text)]">{open ? "Đóng" : canEdit ? "Sửa" : "Xem"}</span>
                      </span>
                      <span className="block text-[var(--text-muted)] mt-0.5">
                        Cam kết {fmtMonth(thisMonth.slice(0, 7))}: {contract ? <b className="text-[var(--text)]">{contract.monthlyHours.toLocaleString("vi-VN")}h/tháng</b> : missing}
                        {" · "}Giá ({b.billingModel === "hourly" ? "theo giờ" : "theo %"}): {price ? <b className="text-[var(--text)]">{price}</b> : missing}
                        {" · "}Phòng: {studio ? <b className="text-[var(--text)]">{studio.name}</b> : missing}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {focus && brands.some((b) => b.id === focus.brandId) && (() => {
        const b = brands.find((x) => x.id === focus.brandId)!;
        return (
          <div ref={panelRef} className="bg-[var(--surface)] p-4 sm:p-6 rounded-2xl border border-blue-500/40 shadow-sm space-y-4 scroll-mt-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-blue-400" />
                Hợp đồng & giá — {b.name}
              </h3>
              <button onClick={() => setFocus(null)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] rounded transition-all" title="Đóng">
                <X className="w-4 h-4" />
              </button>
            </div>
            <BrandConfigPanel
              brand={b}
              platform={focus.platform}
              onPlatformChange={(p) => setFocus({ brandId: b.id, platform: p })}
              canEdit={canEdit}
              rates={brandPlatformRates}
              rateHistory={brandPlatformRateHistory}
              contracts={contracts}
              commitments={commitments}
              studios={studios}
              brandStudios={brandStudios}
              onUpdateBrand={(next) => onUpdateBrand?.(next)}
              onSaveRate={onSaveRate}
              onSaveReturnRate={onSaveReturnRate}
              onSaveCommissionRate={onSaveCommissionRate}
              onSetBrandStudio={onSetBrandStudio}
              onContractsChanged={reloadContracts}
              onOpenMonthPlan={onOpenMonthPlan && ((p) => onOpenMonthPlan(b.id, p))}
            />
          </div>
        );
      })()}

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

              <p className="text-[11px] text-[var(--text-faint)]">
                Cách thu phí, giá, hợp đồng + giờ cam kết và phòng live mặc định nhập ở khối “Hợp đồng & giá” trên thẻ brand (sau khi lưu brand).
              </p>

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
