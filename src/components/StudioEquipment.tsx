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
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-purple-400" /> Modules 04 & 05: Studio & QR Equipment Management
        </span>
        <h2 className="text-2xl font-black">Quản Lý Hệ Thống Studio & Thiết Bị Livestream</h2>
      </div>

      {/* Sub Tabs */}
      <div className="flex space-x-2 text-xs font-bold border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab("studios")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === "studios" ? "bg-purple-600 text-white shadow" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          🏢 Danh Sách Studio ({studios.length} Phòng)
        </button>
        <button
          onClick={() => setActiveSubTab("equipment")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === "equipment" ? "bg-purple-600 text-white shadow" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          📷 Kho Thiết Bị & Quét Mã QR Code ({equipments.length} Thiết bị)
        </button>
      </div>

      {/* Studio View */}
      {activeSubTab === "studios" && (
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Danh Sách Studio Hợp Tác & Vận Hành</h3>
                <p className="text-xs text-slate-400">Quản lý không gian quay, decor phòng & trạng thái book lịch</p>
              </div>
              <button
                onClick={openAddStudioModal}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
              >
                <Plus className="w-4 h-4" /> Thêm Studio Mới
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {studios.map((s) => (
                <div key={s.id} className="bg-slate-800/40 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4 relative group hover:border-purple-300 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-purple-300 font-bold bg-purple-950/30 px-2 py-0.5 rounded">{s.roomNumber}</span>
                      <h3 className="font-bold text-slate-100 text-base mt-1">{s.name}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        s.status === "Live Now" ? "bg-red-500/20 text-red-300 animate-pulse" :
                        s.status === "Booked" ? "bg-amber-500/20 text-amber-300" :
                        s.status === "Maintenance" ? "bg-slate-700 text-slate-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}>
                        {s.status}
                      </span>

                      <button
                        onClick={() => openEditStudioModal(s)}
                        className="p-1 text-slate-400 hover:text-purple-300 hover:bg-slate-700 rounded transition-all"
                        title="Chỉnh sửa Studio"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStudio(s.id, s.name)}
                        className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-all"
                        title="Xóa Studio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1 text-xs">
                    <span className="text-slate-400 font-semibold block">Chủ đề / Decor Studio:</span>
                    <p className="text-slate-200 font-medium">{s.theme}</p>
                  </div>

                  <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-slate-800">
                    <span>Số thiết bị: <strong className="text-slate-100">{s.equipmentCount} món</strong></span>
                    <span>Sức chứa: <strong className="text-slate-100">{s.capacity} người</strong></span>
                  </div>
                  <div className="text-xs text-slate-400">
                    <span>Giờ hoạt động: <strong className="text-slate-100">{s.dailyAvailableHours}h/ngày</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual Booking Calendar */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-100 text-base">Lịch Đặt Phòng Studio Hôm Nay</h3>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/30 px-3 py-1 rounded-full border border-emerald-800/50">
                {todaysBookings.length} Phiên hôm nay
              </span>
            </div>
            {todaysBookings.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Chưa có phiên live nào được đặt lịch hôm nay.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {todaysBookings.map((s) => (
                  <div
                    key={s.id}
                    className={`p-3 rounded-xl border flex justify-between items-center ${
                      s.status === "Live Now" ? "bg-purple-950/30 border-purple-800/50" : "bg-indigo-950/30 border-indigo-800/50"
                    }`}
                  >
                    <div>
                      <span className={`font-bold ${s.status === "Live Now" ? "text-purple-200" : "text-indigo-200"}`}>
                        {s.startTime} - {s.endTime} [{s.studioName}]
                      </span>
                      <p className="text-slate-400">{s.brandName} (Host {s.hostName})</p>
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
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-purple-400" /> Quản Lý Thiết Bị Bằng Mã QR Code ({filteredEquipments.length} Thiết bị)
                </h3>
                <p className="text-xs text-slate-400">Quét QR Code trên thân máy để check-in, check-out hoặc gửi báo hỏng</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Tìm tên/mã QR/model..."
                    value={equipmentSearch}
                    onChange={(e) => setEquipmentSearch(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                  />
                </div>

                {/* Category Filter */}
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className="py-1.5 px-3 text-xs bg-slate-950 text-slate-100 border border-slate-700 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
                >
                  <Plus className="w-4 h-4" /> Thêm Thiết Bị
                </button>
              </div>
            </div>

            {simulatedQrScan && (
              <div className="bg-purple-950/30 p-3 rounded-xl border border-purple-800/50 flex justify-between items-center text-xs">
                <span className="text-purple-200 font-medium">
                  🔍 Đã quét mã QR: <strong className="font-mono text-purple-400">{simulatedQrScan}</strong>
                </span>
                <button
                  onClick={() => setSimulatedQrScan(null)}
                  className="text-purple-400 hover:underline font-bold"
                >
                  Xóa kết quả
                </button>
              </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredEquipments.map((eq) => (
                <div key={eq.id} className="p-4 rounded-2xl border border-slate-800 bg-slate-800/40 space-y-3 hover:border-purple-300 transition-all relative group">
                  <div className="flex justify-between items-start">
                    <span className="bg-purple-950/30 text-purple-300 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                      {eq.qrCode}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        eq.status === "In Use" ? "bg-indigo-500/20 text-indigo-300" :
                        eq.status === "Maintenance" ? "bg-amber-500/20 text-amber-300" :
                        eq.status === "Damaged" ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}>
                        {eq.status}
                      </span>
                      <button
                        onClick={() => openEditEquipmentModal(eq)}
                        className="p-1 text-slate-400 hover:text-purple-300 rounded transition-all"
                        title="Chỉnh sửa thiết bị"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEquipment(eq.id, eq.name)}
                        className="p-1 text-slate-400 hover:text-red-400 rounded transition-all"
                        title="Xóa thiết bị"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-xs">{eq.name}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">{eq.model}</p>
                    <span className="text-[9px] text-purple-300 font-semibold bg-purple-950/30 px-1.5 py-0.5 rounded mt-1 inline-block">
                      {eq.category}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-2 flex justify-between items-center">
                    <span>Kiểm tra: {eq.lastCheckDate}</span>
                    <button
                      onClick={() => handleScanQr(eq.qrCode)}
                      className="text-purple-400 font-bold hover:underline"
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
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400" />
                {editingStudio ? `Chỉnh Sửa Studio: ${editingStudio.name}` : "Thêm Studio Livestream Mới"}
              </h3>
              <button onClick={() => setIsStudioModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudio} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Tên Studio *</label>
                  <input
                    type="text"
                    required
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                    placeholder="VD: Studio D - Beauty & Glam"
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Số / Mã Phòng *</label>
                  <input
                    type="text"
                    required
                    value={studioRoomNumber}
                    onChange={(e) => setStudioRoomNumber(e.target.value)}
                    placeholder="VD: Room 104"
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Chủ Đề & Decor Studio</label>
                <input
                  type="text"
                  value={studioTheme}
                  onChange={(e) => setStudioTheme(e.target.value)}
                  placeholder="VD: Phong cách đền Neon năng động, setup kệ mỹ phẩm"
                  className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Trạng Thái</label>
                  <select
                    value={studioStatus}
                    onChange={(e) => setStudioStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  >
                    <option value="Available">Available (Trống)</option>
                    <option value="Booked">Booked (Đã Đặt)</option>
                    <option value="Live Now">Live Now (Đang Phát)</option>
                    <option value="Maintenance">Maintenance (Bảo Trì)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Sức Chứa (Người)</label>
                  <input
                    type="number"
                    value={studioCapacity}
                    onChange={(e) => setStudioCapacity(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Số Thiết Bị</label>
                  <input
                    type="number"
                    value={studioEquipmentCount}
                    onChange={(e) => setStudioEquipmentCount(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Số Giờ Hoạt Động / Ngày</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={studioDailyHours}
                  onChange={(e) => setStudioDailyHours(Number(e.target.value))}
                  className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                />
                <p className="text-[10px] text-slate-500 mt-1">Dùng làm mẫu số tính tỷ lệ lấp đầy (Studio Utilization) — mặc định 16h/ngày (8:00-24:00)</p>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsStudioModalOpen(false)}
                  className="px-4 py-2 text-slate-400 font-bold hover:bg-slate-800 rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition-all"
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
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Camera className="w-4 h-4 text-purple-400" />
                {editingEquipment ? `Chỉnh Sửa Thiết Bị: ${editingEquipment.name}` : "Thêm Thiết Bị Mới Vào Kho"}
              </h3>
              <button onClick={() => setIsEquipmentModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEquipment} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Tên Thiết Bị *</label>
                  <input
                    type="text"
                    required
                    value={eqName}
                    onChange={(e) => setEqName(e.target.value)}
                    placeholder="VD: Sony A7IV 4K Camera"
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Mã QR Code *</label>
                  <input
                    type="text"
                    required
                    value={eqQrCode}
                    onChange={(e) => setEqQrCode(e.target.value)}
                    placeholder="VD: QR-CAM-005"
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Loại Thiết Bị</label>
                  <select
                    value={eqCategory}
                    onChange={(e) => setEqCategory(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  >
                    <option value="Camera">Camera</option>
                    <option value="Lighting">Lighting (Đèn)</option>
                    <option value="Audio">Audio (Micro/Loa)</option>
                    <option value="PC/Switcher">PC / Switcher</option>
                    <option value="Teleprompter">Teleprompter (Máy đọc)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Trạng Thái Kho</label>
                  <select
                    value={eqStatus}
                    onChange={(e) => setEqStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  >
                    <option value="In Stock">In Stock (Trong Kho)</option>
                    <option value="In Use">In Use (Đang Sử Dụng)</option>
                    <option value="Maintenance">Maintenance (Đang Bảo Trì)</option>
                    <option value="Damaged">Damaged (Báo Hỏng)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Model / Thông Số Kỹ Thuật</label>
                <input
                  type="text"
                  value={eqModel}
                  onChange={(e) => setEqModel(e.target.value)}
                  placeholder="VD: Lens 24-70mm GM II, Quay 4K 60FPS"
                  className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Studio Gán Mặc Định</label>
                  <select
                    value={eqAssignedStudioId}
                    onChange={(e) => setEqAssignedStudioId(e.target.value)}
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  >
                    {studios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.roomNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Ngày Kiểm Tra Gần Nhất</label>
                  <input
                    type="date"
                    value={eqLastCheckDate}
                    onChange={(e) => setEqLastCheckDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEquipmentModalOpen(false)}
                  className="px-4 py-2 text-slate-400 font-bold hover:bg-slate-800 rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition-all"
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
