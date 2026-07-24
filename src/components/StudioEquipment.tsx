import React, { useState } from "react";
import { Studio, Equipment } from "../types";
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

interface StudioEquipmentProps {
  studios: Studio[];
  equipments: Equipment[];
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

  // Studio Handlers
  const openAddStudioModal = () => {
    setEditingStudio(null);
    setStudioName("");
    setStudioRoomNumber(`Room ${101 + studios.length}`);
    setStudioCapacity(6);
    setStudioTheme("Decor Hiện Đại, Ánh Sáng Tối Ưu Live Stream");
    setStudioStatus("Available");
    setStudioEquipmentCount(8);
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
      equipmentCount: Number(studioEquipmentCount)
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
        <p className="text-slate-400 text-xs">
          Thêm phòng Studio mới, quản lý thiết bị Camera, Đèn, Mic & kiểm soát mượn trả thiết bị thông qua mã QR
        </p>
      </div>

      {/* Sub Tabs */}
      <div className="flex space-x-2 text-xs font-bold border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab("studios")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === "studios" ? "bg-purple-600 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          🏢 Danh Sách Studio ({studios.length} Phòng)
        </button>
        <button
          onClick={() => setActiveSubTab("equipment")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeSubTab === "equipment" ? "bg-purple-600 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          📷 Kho Thiết Bị & Quét Mã QR Code ({equipments.length} Thiết bị)
        </button>
      </div>

      {/* Studio View */}
      {activeSubTab === "studios" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Danh Sách Studio Hợp Tác & Vận Hành</h3>
                <p className="text-xs text-slate-500">Quản lý không gian quay, decor phòng & trạng thái book lịch</p>
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
                <div key={s.id} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 relative group hover:border-purple-300 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-purple-700 font-bold bg-purple-100 px-2 py-0.5 rounded">{s.roomNumber}</span>
                      <h3 className="font-bold text-slate-900 text-base mt-1">{s.name}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        s.status === "Live Now" ? "bg-red-100 text-red-700 animate-pulse" :
                        s.status === "Booked" ? "bg-amber-100 text-amber-800" :
                        s.status === "Maintenance" ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {s.status}
                      </span>

                      <button
                        onClick={() => openEditStudioModal(s)}
                        className="p-1 text-slate-400 hover:text-purple-600 hover:bg-white rounded transition-all"
                        title="Chỉnh sửa Studio"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStudio(s.id, s.name)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded transition-all"
                        title="Xóa Studio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1 text-xs">
                    <span className="text-slate-400 font-semibold block">Chủ đề / Decor Studio:</span>
                    <p className="text-slate-800 font-medium">{s.theme}</p>
                  </div>

                  <div className="flex justify-between items-center text-xs text-slate-500 pt-2 border-t border-slate-200">
                    <span>Số thiết bị: <strong className="text-slate-900">{s.equipmentCount} món</strong></span>
                    <span>Sức chứa: <strong className="text-slate-900">{s.capacity} người</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual Booking Calendar */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-base">Lịch Đặt Phòng Studio Hôm Nay (Timeline Booking)</h3>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                0 Phát hiện đè lịch (No Conflicts)
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex justify-between items-center">
                <div>
                  <span className="font-bold text-purple-900">08:00 - 10:00 [Studio A]</span>
                  <p className="text-slate-600">Cocoon Vietnam Mega Live (Host Yến Nhi)</p>
                </div>
                <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded animate-pulse">LIVE NOW</span>
              </div>
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex justify-between items-center">
                <div>
                  <span className="font-bold text-indigo-900">14:00 - 17:00 [Studio B]</span>
                  <p className="text-slate-600">Coolmate Active Sportswear (Host Hoàng Nam)</p>
                </div>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">UPCOMING</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Equipment View */}
      {activeSubTab === "equipment" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-purple-600" /> Quản Lý Thiết Bị Bằng Mã QR Code ({filteredEquipments.length} Thiết bị)
                </h3>
                <p className="text-xs text-slate-500">Quét QR Code trên thân máy để check-in, check-out hoặc gửi báo hỏng</p>
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
                    className="pl-9 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                  />
                </div>

                {/* Category Filter */}
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className="py-1.5 px-3 text-xs bg-slate-100 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
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
              <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 flex justify-between items-center text-xs">
                <span className="text-purple-900 font-medium">
                  🔍 Đã quét mã QR: <strong className="font-mono text-purple-700">{simulatedQrScan}</strong>
                </span>
                <button
                  onClick={() => setSimulatedQrScan(null)}
                  className="text-purple-600 hover:underline font-bold"
                >
                  Xóa kết quả
                </button>
              </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredEquipments.map((eq) => (
                <div key={eq.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3 hover:border-purple-300 transition-all relative group">
                  <div className="flex justify-between items-start">
                    <span className="bg-purple-100 text-purple-800 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                      {eq.qrCode}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        eq.status === "In Use" ? "bg-indigo-100 text-indigo-800" :
                        eq.status === "Maintenance" ? "bg-amber-100 text-amber-800" :
                        eq.status === "Damaged" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {eq.status}
                      </span>
                      <button
                        onClick={() => openEditEquipmentModal(eq)}
                        className="p-1 text-slate-400 hover:text-purple-600 rounded transition-all"
                        title="Chỉnh sửa thiết bị"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEquipment(eq.id, eq.name)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-all"
                        title="Xóa thiết bị"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">{eq.name}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{eq.model}</p>
                    <span className="text-[9px] text-purple-700 font-semibold bg-purple-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                      {eq.category}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 border-t border-slate-200 pt-2 flex justify-between items-center">
                    <span>Kiểm tra: {eq.lastCheckDate}</span>
                    <button
                      onClick={() => handleScanQr(eq.qrCode)}
                      className="text-purple-600 font-bold hover:underline"
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
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400" />
                {editingStudio ? `Chỉnh Sửa Studio: ${editingStudio.name}` : "Thêm Studio Livestream Mới"}
              </h3>
              <button onClick={() => setIsStudioModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudio} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tên Studio *</label>
                  <input
                    type="text"
                    required
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                    placeholder="VD: Studio D - Beauty & Glam"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Số / Mã Phòng *</label>
                  <input
                    type="text"
                    required
                    value={studioRoomNumber}
                    onChange={(e) => setStudioRoomNumber(e.target.value)}
                    placeholder="VD: Room 104"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Chủ Đề & Decor Studio</label>
                <input
                  type="text"
                  value={studioTheme}
                  onChange={(e) => setStudioTheme(e.target.value)}
                  placeholder="VD: Phong cách đền Neon năng động, setup kệ mỹ phẩm"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Trạng Thái</label>
                  <select
                    value={studioStatus}
                    onChange={(e) => setStudioStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="Available">Available (Trống)</option>
                    <option value="Booked">Booked (Đã Đặt)</option>
                    <option value="Live Now">Live Now (Đang Phát)</option>
                    <option value="Maintenance">Maintenance (Bảo Trì)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Sức Chứa (Người)</label>
                  <input
                    type="number"
                    value={studioCapacity}
                    onChange={(e) => setStudioCapacity(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Số Thiết Bị</label>
                  <input
                    type="number"
                    value={studioEquipmentCount}
                    onChange={(e) => setStudioEquipmentCount(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsStudioModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
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
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Camera className="w-4 h-4 text-purple-400" />
                {editingEquipment ? `Chỉnh Sửa Thiết Bị: ${editingEquipment.name}` : "Thêm Thiết Bị Mới Vào Kho"}
              </h3>
              <button onClick={() => setIsEquipmentModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEquipment} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tên Thiết Bị *</label>
                  <input
                    type="text"
                    required
                    value={eqName}
                    onChange={(e) => setEqName(e.target.value)}
                    placeholder="VD: Sony A7IV 4K Camera"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mã QR Code *</label>
                  <input
                    type="text"
                    required
                    value={eqQrCode}
                    onChange={(e) => setEqQrCode(e.target.value)}
                    placeholder="VD: QR-CAM-005"
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Loại Thiết Bị</label>
                  <select
                    value={eqCategory}
                    onChange={(e) => setEqCategory(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="Camera">Camera</option>
                    <option value="Lighting">Lighting (Đèn)</option>
                    <option value="Audio">Audio (Micro/Loa)</option>
                    <option value="PC/Switcher">PC / Switcher</option>
                    <option value="Teleprompter">Teleprompter (Máy đọc)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Trạng Thái Kho</label>
                  <select
                    value={eqStatus}
                    onChange={(e) => setEqStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="In Stock">In Stock (Trong Kho)</option>
                    <option value="In Use">In Use (Đang Sử Dụng)</option>
                    <option value="Maintenance">Maintenance (Đang Bảo Trì)</option>
                    <option value="Damaged">Damaged (Báo Hỏng)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Model / Thông Số Kỹ Thuật</label>
                <input
                  type="text"
                  value={eqModel}
                  onChange={(e) => setEqModel(e.target.value)}
                  placeholder="VD: Lens 24-70mm GM II, Quay 4K 60FPS"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Studio Gán Mặc Định</label>
                  <select
                    value={eqAssignedStudioId}
                    onChange={(e) => setEqAssignedStudioId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  >
                    {studios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.roomNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Ngày Kiểm Tra Gần Nhất</label>
                  <input
                    type="date"
                    value={eqLastCheckDate}
                    onChange={(e) => setEqLastCheckDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEquipmentModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
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
