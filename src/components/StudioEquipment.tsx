import React, { useState } from "react";
import { Studio, Equipment, LiveSession } from "../types";
import { Building2, Camera, QrCode, Plus, Edit3, Trash2, X, Search } from "lucide-react";
import { getTodayDate } from "../lib/dateUtils";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { statusLabel } from "../lib/statusLabels";
import { SESSION_STATUS_LABEL_VI } from "../lib/sessionStatusUi";
import { PageHeader } from "./common/PageHeader";

interface StudioEquipmentProps {
  studios: Studio[];
  equipments: Equipment[];
  sessions?: LiveSession[];
  onAddStudio?: (studio: Studio) => void;
  onUpdateStudio?: (studio: Studio) => void;
  onDeleteStudio?: (id: string) => void;
  onAddEquipment?: (equipment: Equipment) => void;
  onUpdateEquipment?: (equipment: Equipment) => void;
  onDeleteEquipment?: (id: string) => void;
}

// FIX M7 (audit 2026-08-21): QR-EQ-${100-999} chỉ có 900 giá trị khả dĩ trong khi qr_code là
// UNIQUE (0001_init.sql) — theo nghịch lý ngày sinh, ~35 thiết bị đã có 50% khả năng trùng, và
// insert lúc đó ném thẳng lỗi Postgres thô cho người dùng (không kiểm tra trùng trước khi gợi ý).
// Nới không gian lên 9000 giá trị + generate-rồi-đối-chiếu với danh sách thiết bị đang có, thử lại
// tới khi ra mã chưa dùng.
const generateUniqueQrCode = (existingCodes: Set<string>): string => {
  let code = "";
  for (let attempt = 0; attempt < 50; attempt++) {
    code = `QR-EQ-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!existingCodes.has(code)) return code;
  }
  return code;
};

export const StudioEquipment: React.FC<StudioEquipmentProps> = ({
  studios,
  equipments,
  sessions = [],
  onAddStudio,
  onUpdateStudio,
  onDeleteStudio,
  onAddEquipment,
  onUpdateEquipment,
  onDeleteEquipment
}) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [activeSubTab, setActiveSubTab] = useState<"studios" | "equipment">("studios");

  // Filters for Equipment
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");

  // Studio Modal State
  const [isStudioModalOpen, setIsStudioModalOpen] = useState(false);
  const [editingStudio, setEditingStudio] = useState<Studio | null>(null);
  const [studioName, setStudioName] = useState("");
  const [studioRoomNumber, setStudioRoomNumber] = useState("");
  const [studioCapacity, setStudioCapacity] = useState(6);
  const [studioTheme, setStudioTheme] = useState("");
  const [studioStatus, setStudioStatus] = useState<"Available" | "Maintenance">("Available");

  // Equipment Modal State
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [eqName, setEqName] = useState("");
  const [eqCategory, setEqCategory] = useState<"Camera" | "Lighting" | "Audio" | "PC/Switcher" | "Teleprompter">("Camera");
  const [eqModel, setEqModel] = useState("");
  const [eqQrCode, setEqQrCode] = useState("");
  const [eqAssignedStudioId, setEqAssignedStudioId] = useState("");
  const [eqStatus, setEqStatus] = useState<"In Use" | "In Stock" | "Maintenance" | "Damaged">("In Stock");
  const [eqLastCheckDate, setEqLastCheckDate] = useState("");

  const todayStr = getTodayDate();
  // Trạng thái phòng HIỂN THỊ = suy từ lịch (gộp cấu hình 06/10): đang có ca "Live Now" ở phòng ⇒ đang live; ô gõ tay chỉ
  // còn "Sẵn sàng / Bảo trì". Trước đó nhãn LIVE NOW đọc thẳng cột status gõ tay (đo 06/10: 5/5 phòng = Available) nên
  // không bao giờ bật dù phòng đang live.
  const liveStudioIds = new Set(sessions.filter((x) => x.status === "Live Now" && x.studioId).map((x) => x.studioId));
  const shownStatus = (st: Studio): Studio["status"] => (st.status === "Maintenance" ? "Maintenance" : liveStudioIds.has(st.id) ? "Live Now" : "Available");

  const todaysBookings = sessions
    .filter((s) => s.date === todayStr && s.status !== "Cancelled")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Studio Handlers
  const openAddStudioModal = () => {
    setEditingStudio(null);
    setStudioName("");
    setStudioRoomNumber(`Room ${101 + studios.length}`);
    setStudioCapacity(6);
    setStudioTheme("");
    setStudioStatus("Available");
    setIsStudioModalOpen(true);
  };

  const openEditStudioModal = (s: Studio) => {
    setEditingStudio(s);
    setStudioName(s.name);
    setStudioRoomNumber(s.roomNumber);
    setStudioCapacity(s.capacity);
    setStudioTheme(s.theme);
    // Chỉ "Bảo trì" là trạng thái gõ tay; còn lại lưu "Sẵn sàng" (đang live do lịch quyết, không lưu).
    setStudioStatus(s.status === "Maintenance" ? "Maintenance" : "Available");
    setIsStudioModalOpen(true);
  };

  const handleSaveStudio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studioName.trim()) return;

    const studioPayload: Studio = {
      id: editingStudio ? editingStudio.id : `studio-${Date.now()}`,
      name: studioName,
      roomNumber: studioRoomNumber,
      capacity: Number(studioCapacity),
      theme: studioTheme,
      status: studioStatus,
      // Hai ô gõ tay đã bỏ khỏi form (audit người mới 2026-10-04): "Số thiết bị" giờ đếm từ Kho Thiết Bị, "giờ
      // hoạt động" hứa tính "tỷ lệ lấp đầy" mà không màn nào tính. Giữ nguyên giá trị cũ khi sửa.
      equipmentCount: editingStudio?.equipmentCount ?? 0,
      dailyAvailableHours: editingStudio?.dailyAvailableHours ?? 24
    };

    if (editingStudio) {
      if (onUpdateStudio) onUpdateStudio(studioPayload);
    } else {
      if (onAddStudio) onAddStudio(studioPayload);
    }

    setIsStudioModalOpen(false);
  };

  const handleDeleteStudio = async (id: string, name: string) => {
    if (await confirm(`Bạn có chắc chắn muốn xóa Studio "${name}"?`, { danger: true })) {
      if (onDeleteStudio) onDeleteStudio(id);
    }
  };

  // Equipment Handlers
  const openAddEquipmentModal = () => {
    setEditingEquipment(null);
    setEqName("");
    setEqCategory("Camera");
    setEqModel("");
    setEqQrCode(generateUniqueQrCode(new Set(equipments.map((eq) => eq.qrCode))));
    setEqAssignedStudioId(studios[0]?.id ?? "");
    setEqStatus("In Stock");
    setEqLastCheckDate(getTodayDate());
    setIsEquipmentModalOpen(true);
  };

  const openEditEquipmentModal = (eq: Equipment) => {
    setEditingEquipment(eq);
    setEqName(eq.name);
    setEqCategory(eq.category);
    setEqModel(eq.model);
    setEqQrCode(eq.qrCode);
    setEqAssignedStudioId(eq.assignedStudioId ?? "");
    setEqStatus(eq.status);
    setEqLastCheckDate(eq.lastCheckDate);
    setIsEquipmentModalOpen(true);
  };

  const handleSaveEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eqName.trim()) return;

    // Mã QR gợi ý ban đầu đã tránh trùng (generateUniqueQrCode), nhưng field này cho sửa tay
    // (placeholder "VD: QR-CAM-005") — chặn trùng ở đây để báo lỗi tiếng Việt rõ ràng thay vì để
    // insert ném lỗi unique_violation thô của Postgres (audit M7).
    const trimmedQrCode = eqQrCode.trim();
    const isDuplicateQrCode = equipments.some(
      (eq) => eq.qrCode.toLowerCase() === trimmedQrCode.toLowerCase() && eq.id !== editingEquipment?.id
    );
    if (isDuplicateQrCode) {
      showToast(`Mã QR "${trimmedQrCode}" đã được dùng cho thiết bị khác — vui lòng đổi mã khác.`);
      return;
    }

    const equipmentPayload: Equipment = {
      id: editingEquipment ? editingEquipment.id : `eq-${Date.now()}`,
      qrCode: eqQrCode || `QR-${Date.now().toString().slice(-4)}`,
      name: eqName,
      category: eqCategory,
      model: eqModel,
      assignedStudioId: eqAssignedStudioId,
      status: eqStatus,
      lastCheckDate: eqLastCheckDate
    };

    if (editingEquipment) {
      if (onUpdateEquipment) onUpdateEquipment(equipmentPayload);
    } else {
      if (onAddEquipment) onAddEquipment(equipmentPayload);
    }

    setIsEquipmentModalOpen(false);
  };

  const handleDeleteEquipment = async (id: string, name: string) => {
    if (await confirm(`Bạn có chắc muốn xóa thiết bị "${name}"?`, { danger: true })) {
      if (onDeleteEquipment) onDeleteEquipment(id);
    }
  };

  const filteredEquipments = equipments.filter((eq) => {
    const matchesSearch =
      eq.name.toLowerCase().includes(equipmentSearch.toLowerCase()) ||
      eq.model.toLowerCase().includes(equipmentSearch.toLowerCase()) ||
      eq.qrCode.toLowerCase().includes(equipmentSearch.toLowerCase());
    const matchesCategory = selectedCategoryFilter === "All" || eq.category === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title="Studios & Gear"
        description="Phòng live và thiết bị của agency: trạng thái phòng, sức chứa, giờ hoạt động và thiết bị đang gắn vào từng phòng."
      />

      {/* Sub Tabs */}
      <div className="flex space-x-2 text-xs font-bold border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setActiveSubTab("studios")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === "studios" ? "bg-[var(--accent)] text-white shadow" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          }`}
        >
          <span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Phòng live ({studios.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab("equipment")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === "equipment" ? "bg-[var(--accent)] text-white shadow" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          }`}
        >
          <span className="inline-flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Thiết bị ({equipments.length})</span>
        </button>
      </div>

      {/* Studio View — sắp lại 10/10: ca hôm nay nằm ngay trong thẻ từng phòng (trước là danh sách 24 dòng riêng dưới lưới phòng,
          phải dò tên phòng trong ngoặc vuông để biết phòng nào bận). */}
      {activeSubTab === "studios" && (() => {
        const knownStudio = new Set(studios.map((st) => st.id));
        const noRoomToday = todaysBookings.filter((b) => !b.studioId || !knownStudio.has(b.studioId));
        const BookingLine = ({ b }: { b: LiveSession }) => (
          <li className="flex items-center gap-2 text-xs min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.status === "Live Now" ? "bg-red-400 animate-pulse" : b.status === "Completed" ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden />
            <span className="font-mono font-bold text-[var(--text)] shrink-0">{b.startTime}–{b.endTime}</span>
            <span className="text-[var(--text-muted)] truncate" title={`${b.brandName}${b.hostName ? ` · Host ${b.hostName}` : ""} · ${SESSION_STATUS_LABEL_VI[b.status] ?? b.status}`}>
              {b.brandName}{b.hostName ? ` · ${b.hostName}` : ""}
            </span>
            {b.status === "Live Now" && <span className="ml-auto shrink-0 text-[11px] font-bold text-red-300">{SESSION_STATUS_LABEL_VI[b.status]}</span>}
          </li>
        );
        return (
        <div className="bg-[var(--surface)] p-4 sm:p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="font-bold text-[var(--text)] text-base flex flex-wrap items-center gap-2">
                Phòng live
                <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800/50">
                  {todaysBookings.length} ca hôm nay
                </span>
              </h3>
              <p className="text-xs text-[var(--text-muted)]">Mỗi brand gắn với một phòng ở Kế Hoạch Tháng; ca chốt ra sẽ dùng phòng đó. Dưới mỗi phòng là các ca hôm nay.</p>
            </div>
            <button
              onClick={openAddStudioModal}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
            >
              <Plus className="w-4 h-4" /> Thêm phòng
            </button>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {studios.map((s) => {
              const today = todaysBookings.filter((b) => b.studioId === s.id);
              return (
                <div key={s.id} className="bg-[var(--surface-elevated)]/40 p-4 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col gap-3 hover:border-[var(--accent)] transition-all">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <span className="text-xs text-[var(--accent-text)] font-bold bg-[var(--accent)]/30 px-2 py-0.5 rounded">{s.roomNumber}</span>
                      <h3 className="font-bold text-[var(--text)] text-base mt-1 truncate">{s.name}</h3>
                      {s.theme && <p className="text-[11px] text-[var(--text-muted)] truncate" title={s.theme}>Ghi chú: {s.theme}</p>}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        shownStatus(s) === "Live Now" ? "bg-red-500/20 text-red-300 animate-pulse" :
                        shownStatus(s) === "Maintenance" ? "bg-[var(--surface-hover)] text-[var(--text-muted)]" : "bg-emerald-500/20 text-emerald-300"
                      }`}>
                        {statusLabel(shownStatus(s))}
                      </span>

                      <button
                        onClick={() => openEditStudioModal(s)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--surface-hover)] rounded transition-all"
                        title="Chỉnh sửa Studio"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStudio(s.id, s.name)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--surface-hover)] rounded transition-all"
                        title="Xóa Studio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-3 flex-1">
                    <p className="text-[11px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-1.5">Ca hôm nay · {today.length}</p>
                    {today.length === 0 ? (
                      <p className="text-xs text-[var(--text-faint)] italic">Trống cả ngày.</p>
                    ) : (
                      <ul className="space-y-1">{today.map((b) => <BookingLine key={b.id} b={b} />)}</ul>
                    )}
                  </div>

                  <div className="flex justify-between items-center text-xs text-[var(--text-muted)]">
                    <span>Thiết bị: <strong className="text-[var(--text)]">{equipments.filter((e) => e.assignedStudioId === s.id).length} món</strong></span>
                    <span>Sức chứa: <strong className="text-[var(--text)]">{s.capacity > 0 ? `${s.capacity} người` : "chưa nhập"}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>

          {noRoomToday.length > 0 && (
            <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-3">
              <p className="text-[11px] font-bold text-amber-300 mb-1.5">{noRoomToday.length} ca hôm nay chưa có phòng — mở ca ở Bảng Vận Hành → Sửa để gán phòng</p>
              <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1">{noRoomToday.map((b) => <BookingLine key={b.id} b={b} />)}</ul>
            </div>
          )}
        </div>
        );
      })()}

      {/* Equipment View */}
      {activeSubTab === "equipment" && (
        <div className="space-y-6">
          <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[var(--accent-text)]" /> Quản Lý Thiết Bị Bằng Mã QR Code ({filteredEquipments.length} Thiết bị)
                </h3>
                <p className="text-xs text-[var(--text-muted)]">Mỗi thiết bị một mã QR dán trên thân máy, kèm studio đang gán và tình trạng.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Tìm tên/mã QR/model..."
                    value={equipmentSearch}
                    onChange={(e) => setEquipmentSearch(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-medium"
                  />
                </div>

                {/* Category Filter */}
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className="py-1.5 px-3 text-xs bg-[var(--surface-base)] text-[var(--text)] border border-[var(--border)] rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  <option value="All">Tất cả hạng mục</option>
                  <option value="Camera">Camera</option>
                  <option value="Lighting">Đèn chiếu sáng</option>
                  <option value="Audio">Micro & Âm thanh</option>
                  <option value="PC/Switcher">Bàn Trộn & PC</option>
                  <option value="Teleprompter">Máy Đọc Kịch Bản</option>
                </select>

                <button
                  onClick={openAddEquipmentModal}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
                >
                  <Plus className="w-4 h-4" /> Thêm Thiết Bị
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredEquipments.map((eq) => (
                <div key={eq.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)]/40 space-y-3 hover:border-[var(--accent)] transition-all relative group">
                  <div className="flex justify-between items-start">
                    <span className="bg-[var(--accent)]/30 text-[var(--accent-text)] font-mono text-[11px] font-bold px-2 py-0.5 rounded">
                      {eq.qrCode}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        eq.status === "In Use" ? "bg-[var(--accent)]/20 text-[var(--accent-text)]" :
                        eq.status === "Maintenance" ? "bg-amber-500/20 text-amber-300" :
                        eq.status === "Damaged" ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}>
                        {statusLabel(eq.status)}
                      </span>
                      <button
                        onClick={() => openEditEquipmentModal(eq)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-text)] rounded transition-all"
                        title="Chỉnh sửa thiết bị"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEquipment(eq.id, eq.name)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-red-400 rounded transition-all"
                        title="Xóa thiết bị"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-[var(--text)] text-xs">{eq.name}</h4>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{eq.model}</p>
                    <span className="text-[11px] text-[var(--accent-text)] font-semibold bg-[var(--accent)]/30 px-1.5 py-0.5 rounded mt-1 inline-block">
                      {eq.category}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] border-t border-[var(--border)] pt-2">
                    Kiểm tra: {eq.lastCheckDate}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Studio Form Modal */}
      {isStudioModalOpen && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-lg rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[var(--surface)] text-[var(--text)] px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[var(--accent-text)]" />
                {editingStudio ? `Chỉnh Sửa Studio: ${editingStudio.name}` : "Thêm Studio Livestream Mới"}
              </h3>
              <button onClick={() => setIsStudioModalOpen(false)} className="p-1.5 -m-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudio} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Tên phòng *</label>
                  <input
                    type="text"
                    required
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                    placeholder="VD: CROCS"
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Mã phòng *</label>
                  <input
                    type="text"
                    required
                    value={studioRoomNumber}
                    onChange={(e) => setStudioRoomNumber(e.target.value)}
                    placeholder="VD: Room 104"
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Ghi chú (không bắt buộc)</label>
                <input
                  type="text"
                  value={studioTheme}
                  onChange={(e) => setStudioTheme(e.target.value)}
                  placeholder="VD: phòng nhỏ, ánh sáng ấm"
                  className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Trạng thái</label>
                  <select
                    value={studioStatus}
                    onChange={(e) => setStudioStatus(e.target.value as "Available" | "Maintenance")}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="Available">Sẵn sàng</option>
                    <option value="Maintenance">Bảo trì</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Sức chứa (người)</label>
                  <input
                    type="number"
                    value={studioCapacity}
                    onChange={(e) => setStudioCapacity(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
              </div>


              <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsStudioModalOpen(false)}
                  className="px-4 py-2 text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)] rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl shadow transition-all"
                >
                  {editingStudio ? "Cập Nhật Studio" : "Lưu Studio Mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Equipment Form Modal */}
      {isEquipmentModalOpen && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] w-full max-w-lg rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[var(--surface)] text-[var(--text)] px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Camera className="w-4 h-4 text-[var(--accent-text)]" />
                {editingEquipment ? `Chỉnh Sửa Thiết Bị: ${editingEquipment.name}` : "Thêm Thiết Bị Mới Vào Kho"}
              </h3>
              <button onClick={() => setIsEquipmentModalOpen(false)} className="p-1.5 -m-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEquipment} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Tên Thiết Bị *</label>
                  <input
                    type="text"
                    required
                    value={eqName}
                    onChange={(e) => setEqName(e.target.value)}
                    placeholder="VD: Sony A7IV 4K Camera"
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Mã QR Code *</label>
                  <input
                    type="text"
                    required
                    value={eqQrCode}
                    onChange={(e) => setEqQrCode(e.target.value)}
                    placeholder="VD: QR-CAM-005"
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Loại Thiết Bị</label>
                  <select
                    value={eqCategory}
                    onChange={(e) => setEqCategory(e.target.value as "Camera" | "Lighting" | "Audio" | "PC/Switcher" | "Teleprompter")}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="Camera">Camera</option>
                    <option value="Lighting">Lighting (Đèn)</option>
                    <option value="Audio">Audio (Micro/Loa)</option>
                    <option value="PC/Switcher">PC / Switcher</option>
                    <option value="Teleprompter">Teleprompter (Máy đọc)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Trạng Thái Kho</label>
                  <select
                    value={eqStatus}
                    onChange={(e) => setEqStatus(e.target.value as "In Use" | "In Stock" | "Maintenance" | "Damaged")}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="In Stock">Trong kho</option>
                    <option value="In Use">Đang dùng</option>
                    <option value="Maintenance">Bảo trì</option>
                    <option value="Damaged">Hỏng</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Model / Thông Số Kỹ Thuật</label>
                <input
                  type="text"
                  value={eqModel}
                  onChange={(e) => setEqModel(e.target.value)}
                  placeholder="VD: Lens 24-70mm GM II, Quay 4K 60FPS"
                  className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Studio Gán Mặc Định</label>
                  <select
                    value={eqAssignedStudioId}
                    onChange={(e) => setEqAssignedStudioId(e.target.value)}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="">— Chưa gán studio —</option>
                    {studios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.roomNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Ngày Kiểm Tra Gần Nhất</label>
                  <input
                    type="date"
                    value={eqLastCheckDate}
                    onChange={(e) => setEqLastCheckDate(e.target.value)}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEquipmentModalOpen(false)}
                  className="px-4 py-2 text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)] rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl shadow transition-all"
                >
                  {editingEquipment ? "Cập Nhật Thiết Bị" : "Lưu Thiết Bị Mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
