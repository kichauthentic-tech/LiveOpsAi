import React, { useState } from "react";
import { Studio, Equipment, LiveSession } from "../types";
import {
  Building2,
  Camera,
  QrCode,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Plus,
  Edit3,
  Trash2,
  X,
  Search,
  Filter
} from "lucide-react";
import { getTodayDate } from "../lib/dateUtils";

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
  const [activeSubTab, setActiveSubTab] = useState<"studios" | "equipment">("studios");
  const [simulatedQrScan, setSimulatedQrScan] = useState<string | null>(null);

  // Filters for Equipment
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");

  // Studio Modal State
  const [isStudioModalOpen, setIsStudioModalOpen] = useState(false);
  const [editingStudio, setEditingStudio] = useState<Studio | null>(null);
  const [studioName, setStudioName] = useState("");
  const [studioRoomNumber, setStudioRoomNumber] = useState("");
  const [studioCapacity, setStudioCapacity] = useState(6);
  const [studioTheme, setStudioTheme] = useState("Decor Hiện Đại, Ánh Sáng Ấm");
  const [studioStatus, setStudioStatus] = useState<"Live Now" | "Booked" | "Available" | "Maintenance">("Available");
  const [studioEquipmentCount, setStudioEquipmentCount] = useState(10);
  const [studioDailyHours, setStudioDailyHours] = useState(16);

  // Equipment Modal State
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [eqName, setEqName] = useState("");
  const [eqCategory, setEqCategory] = useState<"Camera" | "Lighting" | "Audio" | "PC/Switcher" | "Teleprompter">("Camera");
  const [eqModel, setEqModel] = useState("");
  const [eqQrCode, setEqQrCode] = useState("");
  const [eqAssignedStudioId, setEqAssignedStudioId] = useState("std-a");
  const [eqStatus, setEqStatus] = useState<"In Use" | "In Stock" | "Maintenance" | "Damaged">("In Stock");
  const [eqLastCheckDate, setEqLastCheckDate] = useState("2026-07-20");

  const handleScanQr = (code: string) => {
    setSimulatedQrScan(code);
  };

  const todayStr = getTodayDate();
  const todaysBookings = sessions
    .filter((s) => s.date === todayStr && s.status !== "Cancelled")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Studio Handlers
  const openAddStudioModal = () => {
    setEditingStudio(null);
    setStudioName("");
    setStudioRoomNumber(`Room ${101 + studios.length}`);
    setStudioCapacity(6);
    setStudioTheme("Decor Hiện Đại, Ánh Sáng Tối Ưu Live Stream");
    setStudioStatus("Available");
    setStudioEquipmentCount(8);
    setStudioDailyHours(16);
    setIsStudioModalOpen(true);
  };

  const openEditStudioModal = (s: Studio) => {
    setEditingStudio(s);
    setStudioName(s.name);
    setStudioRoomNumber(s.roomNumber);
    setStudioCapacity(s.capacity);
    setStudioTheme(s.theme);
    setStudioStatus(s.status);
    setStudioEquipmentCount(s.equipmentCount);
    setStudioDailyHours(s.dailyAvailableHours ?? 16);
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
      equipmentCount: Number(studioEquipmentCount),
      dailyAvailableHours: Number(studioDailyHours)
    };

    if (editingStudio) {
      if (onUpdateStudio) onUpdateStudio(studioPayload);
    } else {
      if (onAddStudio) onAddStudio(studioPayload);
    }

    setIsStudioModalOpen(false);
  };

  const handleDeleteStudio = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa Studio "${name}"?`)) {
      if (onDeleteStudio) onDeleteStudio(id);
    }
  };

  // Equipment Handlers
  const openAddEquipmentModal = () => {
    setEditingEquipment(null);
    setEqName("");
    setEqCategory("Camera");
    setEqModel("Sony A7IV / Lens 24-70mm f2.8");
    setEqQrCode(`QR-EQ-${Math.floor(100 + Math.random() * 900)}`);
    setEqAssignedStudioId(studios[0]?.id || "std-a");
    setEqStatus("In Stock");
    setEqLastCheckDate(new Date().toISOString().split("T")[0]);
    setIsEquipmentModalOpen(true);
  };

  const openEditEquipmentModal = (eq: Equipment) => {
    setEditingEquipment(eq);
    setEqName(eq.name);
    setEqCategory(eq.category);
    setEqModel(eq.model);
    setEqQrCode(eq.qrCode);
    setEqAssignedStudioId(eq.assignedStudioId || "std-a");
    setEqStatus(eq.status);
    setEqLastCheckDate(eq.lastCheckDate);
    setIsEquipmentModalOpen(true);
  };

  const handleSaveEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eqName.trim()) return;

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

  const handleDeleteEquipment = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa thiết bị "${name}"?`)) {
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
      {/* Top Banner */}
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl space-y-2">
        <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-[var(--accent-text)]" /> Modules 04 & 05: Studio & QR Equipment Management
        </span>
        <h2 className="text-2xl font-black">Quản Lý Hệ Thống Studio & Thiết Bị Livestream</h2>
      </div>

      {/* Sub Tabs */}
      <div className="flex space-x-2 text-xs font-bold border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setActiveSubTab("studios")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === "studios" ? "bg-[var(--accent)] text-white shadow" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          }`}
        >
          🏢 Danh Sách Studio ({studios.length} Phòng)
        </button>
        <button
          onClick={() => setActiveSubTab("equipment")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === "equipment" ? "bg-[var(--accent)] text-white shadow" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          }`}
        >
          📷 Kho Thiết Bị & Quét Mã QR Code ({equipments.length} Thiết bị)
        </button>
      </div>

      {/* Studio View */}
      {activeSubTab === "studios" && (
        <div className="space-y-6">
          <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-[var(--text)] text-base">Danh Sách Studio Hợp Tác & Vận Hành</h3>
                <p className="text-xs text-[var(--text-muted)]">Quản lý không gian quay, decor phòng & trạng thái book lịch</p>
              </div>
              <button
                onClick={openAddStudioModal}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
              >
                <Plus className="w-4 h-4" /> Thêm Studio Mới
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {studios.map((s) => (
                <div key={s.id} className="bg-[var(--surface-elevated)]/40 p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 relative group hover:border-[var(--accent)] transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-[var(--accent-text)] font-bold bg-[var(--accent)]/30 px-2 py-0.5 rounded">{s.roomNumber}</span>
                      <h3 className="font-bold text-[var(--text)] text-base mt-1">{s.name}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        s.status === "Live Now" ? "bg-red-500/20 text-red-300 animate-pulse" :
                        s.status === "Booked" ? "bg-amber-500/20 text-amber-300" :
                        s.status === "Maintenance" ? "bg-[var(--surface-hover)] text-[var(--text-muted)]" : "bg-emerald-500/20 text-emerald-300"
                      }`}>
                        {s.status}
                      </span>

                      <button
                        onClick={() => openEditStudioModal(s)}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:bg-[var(--surface-hover)] rounded transition-all"
                        title="Chỉnh sửa Studio"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStudio(s.id, s.name)}
                        className="p-1 text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--surface-hover)] rounded transition-all"
                        title="Xóa Studio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)] space-y-1 text-xs">
                    <span className="text-[var(--text-muted)] font-semibold block">Chủ đề / Decor Studio:</span>
                    <p className="text-[var(--text)] font-medium">{s.theme}</p>
                  </div>

                  <div className="flex justify-between items-center text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">
                    <span>Số thiết bị: <strong className="text-[var(--text)]">{s.equipmentCount} món</strong></span>
                    <span>Sức chứa: <strong className="text-[var(--text)]">{s.capacity} người</strong></span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    <span>Giờ hoạt động: <strong className="text-[var(--text)]">{s.dailyAvailableHours}h/ngày</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual Booking Calendar */}
          <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-[var(--text)] text-base">Lịch Đặt Phòng Studio Hôm Nay</h3>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-800/50">
                {todaysBookings.length} Phiên hôm nay
              </span>
            </div>
            {todaysBookings.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-4 text-center">Chưa có phiên live nào được đặt lịch hôm nay.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {todaysBookings.map((s) => (
                  <div
                    key={s.id}
                    className={`p-3 rounded-xl border flex justify-between items-center ${
                      s.status === "Live Now" ? "bg-rose-500/10 border-rose-500/40" : "bg-[var(--accent)]/10 border-[var(--accent)]/30"
                    }`}
                  >
                    <div>
                      <span className={`font-bold ${s.status === "Live Now" ? "text-rose-400" : "text-[var(--accent-text)]"}`}>
                        {s.startTime} - {s.endTime} [{s.studioName}]
                      </span>
                      <p className="text-[var(--text-muted)]">{s.brandName} (Host {s.hostName})</p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        s.status === "Live Now"
                          ? "bg-red-500/20 text-red-300 animate-pulse"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {s.status === "Live Now" ? "LIVE NOW" : s.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Equipment View */}
      {activeSubTab === "equipment" && (
        <div className="space-y-6">
          <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[var(--accent-text)]" /> Quản Lý Thiết Bị Bằng Mã QR Code ({filteredEquipments.length} Thiết bị)
                </h3>
                <p className="text-xs text-[var(--text-muted)]">Quét QR Code trên thân máy để check-in, check-out hoặc gửi báo hỏng</p>
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

            {simulatedQrScan && (
              <div className="bg-[var(--accent)]/30 p-3 rounded-xl border border-[var(--accent)]/50 flex justify-between items-center text-xs">
                <span className="text-[var(--accent-text)] font-medium">
                  🔍 Đã quét mã QR: <strong className="font-mono text-[var(--accent-text)]">{simulatedQrScan}</strong>
                </span>
                <button
                  onClick={() => setSimulatedQrScan(null)}
                  className="text-[var(--accent-text)] hover:underline font-bold"
                >
                  Xóa kết quả
                </button>
              </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredEquipments.map((eq) => (
                <div key={eq.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)]/40 space-y-3 hover:border-[var(--accent)] transition-all relative group">
                  <div className="flex justify-between items-start">
                    <span className="bg-[var(--accent)]/30 text-[var(--accent-text)] font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                      {eq.qrCode}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        eq.status === "In Use" ? "bg-[var(--accent)]/20 text-[var(--accent-text)]" :
                        eq.status === "Maintenance" ? "bg-amber-500/20 text-amber-300" :
                        eq.status === "Damaged" ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}>
                        {eq.status}
                      </span>
                      <button
                        onClick={() => openEditEquipmentModal(eq)}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-text)] rounded transition-all"
                        title="Chỉnh sửa thiết bị"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEquipment(eq.id, eq.name)}
                        className="p-1 text-[var(--text-muted)] hover:text-red-400 rounded transition-all"
                        title="Xóa thiết bị"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-[var(--text)] text-xs">{eq.name}</h4>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{eq.model}</p>
                    <span className="text-[9px] text-[var(--accent-text)] font-semibold bg-[var(--accent)]/30 px-1.5 py-0.5 rounded mt-1 inline-block">
                      {eq.category}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] border-t border-[var(--border)] pt-2 flex justify-between items-center">
                    <span>Kiểm tra: {eq.lastCheckDate}</span>
                    <button
                      onClick={() => handleScanQr(eq.qrCode)}
                      className="text-[var(--accent-text)] font-bold hover:underline"
                    >
                      Giả lập Quét QR
                    </button>
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
              <button onClick={() => setIsStudioModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudio} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Tên Studio *</label>
                  <input
                    type="text"
                    required
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                    placeholder="VD: Studio D - Beauty & Glam"
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Số / Mã Phòng *</label>
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
                <label className="font-bold text-[var(--text-muted)] block mb-1">Chủ Đề & Decor Studio</label>
                <input
                  type="text"
                  value={studioTheme}
                  onChange={(e) => setStudioTheme(e.target.value)}
                  placeholder="VD: Phong cách đền Neon năng động, setup kệ mỹ phẩm"
                  className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Trạng Thái</label>
                  <select
                    value={studioStatus}
                    onChange={(e) => setStudioStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="Available">Available (Trống)</option>
                    <option value="Booked">Booked (Đã Đặt)</option>
                    <option value="Live Now">Live Now (Đang Phát)</option>
                    <option value="Maintenance">Maintenance (Bảo Trì)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Sức Chứa (Người)</label>
                  <input
                    type="number"
                    value={studioCapacity}
                    onChange={(e) => setStudioCapacity(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Số Thiết Bị</label>
                  <input
                    type="number"
                    value={studioEquipmentCount}
                    onChange={(e) => setStudioEquipmentCount(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Số Giờ Hoạt Động / Ngày</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={studioDailyHours}
                  onChange={(e) => setStudioDailyHours(Number(e.target.value))}
                  className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                />
                <p className="text-[10px] text-[var(--text-faint)] mt-1">Dùng làm mẫu số tính tỷ lệ lấp đầy (Studio Utilization) — mặc định 16h/ngày (8:00-24:00)</p>
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
              <button onClick={() => setIsEquipmentModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
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
                    onChange={(e) => setEqCategory(e.target.value as any)}
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
                    onChange={(e) => setEqStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-[var(--border)] bg-[var(--surface-base)] rounded-xl font-semibold text-[var(--text)]"
                  >
                    <option value="In Stock">In Stock (Trong Kho)</option>
                    <option value="In Use">In Use (Đang Sử Dụng)</option>
                    <option value="Maintenance">Maintenance (Đang Bảo Trì)</option>
                    <option value="Damaged">Damaged (Báo Hỏng)</option>
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
