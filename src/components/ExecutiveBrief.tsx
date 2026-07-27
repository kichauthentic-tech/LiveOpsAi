import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Layers,
  Database,
  CheckCircle2,
  Server,
  ShieldCheck,
  Zap,
  Target,
  ClipboardList,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Clock,
  UserCheck,
  MessageSquare,
  Edit3,
  Trash2,
  TrendingUp,
  X,
  Send,
  Building2,
  Check,
  Play,
  Radio,
  Eye,
  ShoppingBag,
  DollarSign,
  Activity,
  ArrowUpRight
} from "lucide-react";
import { LiveSession, StrategicDirective, UserRole } from "../types";
import { EndToEndFlowSimulator } from "./EndToEndFlowSimulator";
import { PerformanceMetricsWidget } from "./PerformanceMetricsWidget";

interface ExecutiveBriefProps {
  currentRole?: UserRole;
  sessions?: LiveSession[];
  directives?: StrategicDirective[];
  onAddDirective?: (newDir: StrategicDirective) => void;
  onUpdateDirective?: (dir: StrategicDirective) => void;
  onDeleteDirective?: (id: string) => void;
  onNavigateTab?: (tabId: string) => void;
}

export const ExecutiveBrief: React.FC<ExecutiveBriefProps> = ({
  currentRole = "ceo",
  sessions = [],
  directives: propDirectives = [],
  onAddDirective,
  onUpdateDirective,
  onDeleteDirective,
  onNavigateTab
}) => {
  const [activeTab, setActiveTab] = useState<"directives" | "simulator" | "blueprint">("directives");
  const [directives, setDirectives] = useState<StrategicDirective[]>(propDirectives);

  useEffect(() => {
    setDirectives(propDirectives);
  }, [propDirectives]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [selectedPriority, setSelectedPriority] = useState<string>("All");

  // Directives Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDirective, setEditingDirective] = useState<StrategicDirective | null>(null);

  // Feedback Modal State
  const [feedbackDirective, setFeedbackDirective] = useState<StrategicDirective | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  // Form State for New/Edit Directive
  const [formData, setFormData] = useState<Partial<StrategicDirective>>({
    code: `DIR-2026-0${directives.length + 1}`,
    title: "",
    description: "",
    department: "Operations",
    assignedRole: "operations",
    assigneeName: "",
    priority: "High",
    targetKpi: "",
    deadline: new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
    status: "Pending",
    progressPercent: 0,
    notesFromLead: ""
  });

  // Handle Save Directive
  const handleSaveDirective = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.assigneeName) return;

    if (editingDirective) {
      const updatedDir = {
        ...editingDirective,
        ...formData,
        progressPercent: Number(formData.progressPercent || 0)
      } as StrategicDirective;
      setDirectives((prev) => prev.map((d) => (d.id === editingDirective.id ? updatedDir : d)));
      onUpdateDirective?.(updatedDir);
    } else {
      const newDir: StrategicDirective = {
        id: `dir-${Date.now()}`,
        code: formData.code || `DIR-2026-${directives.length + 1}`,
        title: formData.title || "Chỉ đạo chiến lược mới",
        description: formData.description || "",
        department: (formData.department as any) || "Operations",
        assignedRole: (formData.assignedRole as any) || "operations",
        assigneeName: formData.assigneeName || "Trưởng bộ phận",
        priority: (formData.priority as any) || "High",
        targetKpi: formData.targetKpi || "Hoàn thành đúng tiến độ KPI",
        deadline: formData.deadline || "2026-08-15",
        status: (formData.status as any) || "Pending",
        progressPercent: Number(formData.progressPercent || 0),
        notesFromLead: formData.notesFromLead || "",
        createdAt: new Date().toISOString().substring(0, 10)
      };
      setDirectives((prev) => [newDir, ...prev]);
      onAddDirective?.(newDir);
    }

    setIsAddModalOpen(false);
    setEditingDirective(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      code: `DIR-2026-0${directives.length + 2}`,
      title: "",
      description: "",
      department: "Operations",
      assignedRole: "operations",
      assigneeName: "",
      priority: "High",
      targetKpi: "",
      deadline: new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
      status: "Pending",
      progressPercent: 0,
      notesFromLead: ""
    });
  };

  const handleEditClick = (dir: StrategicDirective) => {
    setEditingDirective(dir);
    setFormData(dir);
    setIsAddModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa chỉ đạo chiến lược này?")) {
      setDirectives((prev) => prev.filter((d) => d.id !== id));
      onDeleteDirective?.(id);
    }
  };

  const handleStatusChange = (id: string, newStatus: StrategicDirective["status"], newProgress?: number) => {
    const target = directives.find((d) => d.id === id);
    if (!target) return;
    const progress = newProgress !== undefined ? newProgress : newStatus === "Completed" ? 100 : target.progressPercent;
    const updatedDir = { ...target, status: newStatus, progressPercent: progress };
    setDirectives((prev) => prev.map((d) => (d.id === id ? updatedDir : d)));
    onUpdateDirective?.(updatedDir);
  };

  const handleSaveFeedback = () => {
    if (!feedbackDirective || !feedbackText.trim()) return;
    const updatedDir = {
      ...feedbackDirective,
      notesFromLead: `[Báo cáo mới ${new Date().toLocaleDateString("vi-VN")}]: ${feedbackText}`
    };
    setDirectives((prev) => prev.map((d) => (d.id === feedbackDirective.id ? updatedDir : d)));
    onUpdateDirective?.(updatedDir);
    setFeedbackDirective(null);
    setFeedbackText("");
  };

  // Filtered Directives
  const filteredDirectives = directives.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.assigneeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.targetKpi.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept = selectedDept === "All" || d.department === selectedDept;
    const matchesStatus = selectedStatus === "All" || d.status === selectedStatus;
    const matchesPriority = selectedPriority === "All" || d.priority === selectedPriority;

    return matchesSearch && matchesDept && matchesStatus && matchesPriority;
  });

  // Calculate statistics
  const totalDirectives = directives.length;
  const completedCount = directives.filter((d) => d.status === "Completed").length;
  const inProgressCount = directives.filter((d) => d.status === "In Progress").length;
  const needsSupportCount = directives.filter((d) => d.status === "Needs BOD Support").length;
  const avgProgress = totalDirectives > 0 ? Math.round(directives.reduce((acc, d) => acc + d.progressPercent, 0) / totalDirectives) : 0;

  // Real-Time Livestream Performance Calculations from `sessions` array
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
  };

  const liveNowSessions = sessions.filter((s) => s.status === "Live Now");
  const upcomingSessions = sessions.filter((s) => s.status === "Upcoming");
  const completedSessions = sessions.filter((s) => s.status === "Completed");

  const totalSessionsCount = sessions.length;
  const liveNowCount = liveNowSessions.length;

  const totalTargetGmv = sessions.reduce((sum, s) => sum + (s.targetGmv || 0), 0);
  const totalActualGmv = sessions.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
  const gmvTargetAchievement = totalTargetGmv > 0 ? Math.round((totalActualGmv / totalTargetGmv) * 100) : 0;

  const totalOrders = sessions.reduce((sum, s) => sum + (s.totalOrders || 0), 0);
  const totalViews = sessions.reduce((sum, s) => sum + (s.totalViews || 0), 0);
  const currentPeakViewers = liveNowSessions.length > 0
    ? liveNowSessions.reduce((sum, s) => sum + (s.peakViewers || 0), 0)
    : sessions.reduce((sum, s) => sum + (s.peakViewers || 0), 0);

  const avgCtr = sessions.length > 0
    ? (sessions.reduce((sum, s) => sum + (s.ctrAvg || 0), 0) / sessions.length).toFixed(1)
    : "0.0";
  const avgCvr = sessions.length > 0
    ? (sessions.reduce((sum, s) => sum + (s.cvrAvg || 0), 0) / sessions.length).toFixed(1)
    : "0.0";

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950 text-white p-8 rounded-3xl border border-purple-800/40 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-purple-500/20 text-purple-300 border border-purple-400/30 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" /> Executive Board Directives & Strategic Task Allocation
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold">
                LiveOps Agency BOD
              </span>
            </div>

            {/* Navigation Switcher Tabs */}
            <div className="flex items-center bg-slate-900/90 p-1.5 rounded-2xl border border-purple-500/30 gap-1">
              <button
                onClick={() => setActiveTab("directives")}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                  activeTab === "directives"
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Bảng Giao Nhiệm Vụ BOD</span>
                <span className="bg-purple-950 px-1.5 py-0.5 rounded-md text-[10px] text-purple-300 font-extrabold border border-purple-700">
                  {directives.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("simulator")}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                  activeTab === "simulator"
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Play className="w-4 h-4 text-emerald-400" />
                <span>End-To-End Simulator</span>
                <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded text-[9px] font-black border border-emerald-500/30">HOT</span>
              </button>

              <button
                onClick={() => setActiveTab("blueprint")}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                  activeTab === "blueprint"
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Blueprint 16 Module System</span>
              </button>
            </div>
          </div>

          <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight text-white">
            Định Hướng Chiến Lược & Phân Công Nhiệm Vụ BOD
          </h1>

          {/* BOD Quick Key Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-purple-900/50 text-xs">
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Tổng Chỉ Đạo</span>
              <strong className="text-white text-lg font-black">{totalDirectives}</strong>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
              <span className="text-emerald-400 block text-[11px]">Hoàn Thành</span>
              <strong className="text-emerald-400 text-lg font-black">{completedCount}</strong>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
              <span className="text-blue-400 block text-[11px]">Đang Thực Hiện</span>
              <strong className="text-blue-400 text-lg font-black">{inProgressCount}</strong>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
              <span className="text-amber-400 block text-[11px]">Cần CEO Hỗ Trợ</span>
              <strong className="text-amber-400 text-lg font-black">{needsSupportCount}</strong>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 col-span-2 sm:col-span-1">
              <span className="text-purple-300 block text-[11px]">Tiến Độ</span>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="grow bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-emerald-400 h-full transition-all duration-500"
                    style={{ width: `${avgProgress}%` }}
                  ></div>
                </div>
                <strong className="text-purple-200 text-sm font-black">{avgProgress}%</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics Widget at the top */}
      <PerformanceMetricsWidget sessions={sessions} onNavigateTab={onNavigateTab} />

      {/* TAB 1: BẢNG GIAO NHIỆM VỤ & CHỈ ĐẠO BAN GIÁM ĐỐC */}
      {activeTab === "directives" && (
        <div className="space-y-6">
          {/* Executive Message / Directive Announcement Box */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 p-6 rounded-2xl border border-slate-800 shadow-lg text-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Target className="w-5 h-5" />
                <span>CHỈ ĐẠO CHIẾN LƯỢC QUÝ 3</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">Cập nhật: 2026-07-23 by CEO Jun Dang</span>
            </div>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed italic bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              &quot;Mục tiêu Q3/2026: GMV toàn agency đạt <strong>15 Tỷ VNĐ</strong>. Trưởng bộ phận báo cáo tiến độ trước 17:00 hàng ngày.&quot;
            </p>
          </div>

          {/* Control Bar: Filters, Search & Add Button */}
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 grow">
              {/* Search input */}
              <div className="relative min-w-[220px] grow md:grow-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm chỉ đạo, mã DIR, người phụ trách..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 text-[11px]">Bộ phận:</span>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none text-xs font-semibold"
                >
                  <option value="All" className="bg-slate-900">Tất cả bộ phận</option>
                  <option value="Operations" className="bg-slate-900">Operations</option>
                  <option value="Content & AI" className="bg-slate-900">Content & AI</option>
                  <option value="Talent Management" className="bg-slate-900">Talent Management</option>
                  <option value="Brand Client" className="bg-slate-900">Brand Client</option>
                  <option value="Finance & Admin" className="bg-slate-900">Finance & Admin</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400 text-[11px]">Mức độ:</span>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none text-xs font-semibold"
                >
                  <option value="All" className="bg-slate-900">Tất cả mức độ</option>
                  <option value="Urgent" className="bg-slate-900">Cấp Bách (Urgent)</option>
                  <option value="High" className="bg-slate-900">Ưu Tiên Cao (High)</option>
                  <option value="Medium" className="bg-slate-900">Trung Bằng (Medium)</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400 text-[11px]">Trạng thái:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none text-xs font-semibold"
                >
                  <option value="All" className="bg-slate-900">Tất cả trạng thái</option>
                  <option value="Pending" className="bg-slate-900">Chưa bắt đầu</option>
                  <option value="In Progress" className="bg-slate-900">Đang thực hiện</option>
                  <option value="Needs BOD Support" className="bg-slate-900">Cần CEO Hỗ Trợ</option>
                  <option value="Completed" className="bg-slate-900">Đã hoàn thành</option>
                </select>
              </div>
            </div>

            {/* CEO Add Directive Button */}
            <button
              onClick={() => {
                resetForm();
                setEditingDirective(null);
                setIsAddModalOpen(true);
              }}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Giao Chỉ Đạo Mới</span>
            </button>
          </div>

          {/* Task Directives Cards Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {filteredDirectives.length === 0 ? (
              <div className="md:col-span-2 p-6 sm:p-12 text-center bg-slate-900/50 rounded-2xl border border-slate-800 space-y-3">
                <ClipboardList className="w-12 h-12 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm font-medium">Không tìm thấy chỉ đạo chiến lược nào phù hợp bộ lọc.</p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedDept("All");
                    setSelectedStatus("All");
                    setSelectedPriority("All");
                  }}
                  className="text-xs text-purple-400 font-bold hover:underline"
                >
                  Xóa bộ lọc tìm kiếm
                </button>
              </div>
            ) : (
              filteredDirectives.map((dir) => {
                const isUrgent = dir.priority === "Urgent";
                const isHigh = dir.priority === "High";

                return (
                  <div
                    key={dir.id}
                    className={`bg-slate-900 rounded-2xl border p-6 space-y-4 shadow-xl transition-all relative overflow-hidden flex flex-col justify-between ${
                      dir.status === "Completed"
                        ? "border-emerald-500/30 bg-slate-900/80"
                        : dir.status === "Needs BOD Support"
                        ? "border-amber-500/50 bg-amber-950/10"
                        : "border-slate-800 hover:border-purple-500/50"
                    }`}
                  >
                    {/* Top Header line */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-extrabold text-purple-400 bg-purple-950/80 px-2.5 py-1 rounded-lg border border-purple-800/80">
                            {dir.code}
                          </span>

                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                              isUrgent
                                ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                                : isHigh
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                : "bg-blue-500/20 text-blue-400 border-blue-500/40"
                            }`}
                          >
                            {dir.priority === "Urgent" ? "⚡ Cấp Bách" : dir.priority === "High" ? "🔥 Ưu Tiên Cao" : "📌 Trung Bằng"}
                          </span>

                          <span className="text-[11px] text-slate-400 font-semibold bg-slate-800/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-indigo-400" />
                            {dir.department}
                          </span>
                        </div>

                        {/* Actions for Edit/Delete */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditClick(dir)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                            title="Sửa chỉ đạo"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(dir.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Xóa chỉ đạo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h3 className="text-base font-bold text-white leading-snug">{dir.title}</h3>
                        <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{dir.description}</p>
                      </div>

                      {/* Target KPI Box */}
                      <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-400 flex items-center gap-1">
                          <Target className="w-3 h-3" /> Mục tiêu KPI Bắt Buộc:
                        </span>
                        <p className="text-xs font-semibold text-slate-200">{dir.targetKpi}</p>
                      </div>

                      {/* Assignee & Deadline */}
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div className="flex items-center gap-2 text-slate-300">
                          <UserCheck className="w-4 h-4 text-purple-400 shrink-0" />
                          <div>
                            <span className="text-[10px] text-slate-500 block">Trách nhiệm chính:</span>
                            <span className="font-semibold text-slate-200">{dir.assigneeName}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-slate-300">
                          <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                          <div>
                            <span className="text-[10px] text-slate-500 block">Hạn hoàn thành:</span>
                            <span className="font-semibold text-slate-200">{dir.deadline}</span>
                          </div>
                        </div>
                      </div>

                      {/* Lead Feedback Note */}
                      {dir.notesFromLead && (
                        <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-800/40 text-xs space-y-1">
                          <span className="text-[10px] text-indigo-300 font-bold uppercase flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> Báo cáo phản hồi từ Lead:
                          </span>
                          <p className="text-slate-300 italic text-[11px]">{dir.notesFromLead}</p>
                        </div>
                      )}
                    </div>

                    {/* Footer: Progress & Quick Status Selector */}
                    <div className="pt-4 border-t border-slate-800 space-y-3 mt-4">
                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-400 text-[11px]">Tiến độ thực thi:</span>
                          <span className="text-purple-400 font-bold">{dir.progressPercent}%</span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full transition-all duration-500 ${
                              dir.progressPercent === 100
                                ? "bg-emerald-500"
                                : dir.status === "Needs BOD Support"
                                ? "bg-amber-500"
                                : "bg-purple-600"
                            }`}
                            style={{ width: `${dir.progressPercent}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Status Update Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                          <button
                            onClick={() => handleStatusChange(dir.id, "In Progress", 50)}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                              dir.status === "In Progress"
                                ? "bg-blue-600 text-white font-bold"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            Đang chạy
                          </button>

                          <button
                            onClick={() => handleStatusChange(dir.id, "Needs BOD Support")}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                              dir.status === "Needs BOD Support"
                                ? "bg-amber-600 text-white font-bold"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            ⚠️ Cần CEO Hỗ Trợ
                          </button>

                          <button
                            onClick={() => handleStatusChange(dir.id, "Completed", 100)}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                              dir.status === "Completed"
                                ? "bg-emerald-600 text-white font-bold"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            ✓ Hoàn thành
                          </button>
                        </div>

                        {/* Send Feedback Button */}
                        <button
                          onClick={() => {
                            setFeedbackDirective(dir);
                            setFeedbackText(dir.notesFromLead || "");
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                          <span>Gửi báo cáo</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: END-TO-END FLOW SIMULATOR */}
      {activeTab === "simulator" && (
        <EndToEndFlowSimulator onNavigateTab={onNavigateTab} />
      )}

      {/* TAB 3: SYSTEM BLUEPRINT 16 MODULES */}
      {activeTab === "blueprint" && (
        <div className="space-y-8">
          {/* Section 1: Vision & The Problem */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4 text-white">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-400" /> 1. Product Vision & Bài Toán Thị Trường
            </h2>
            <div className="grid md:grid-cols-2 gap-6 text-sm leading-relaxed">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <h3 className="font-bold text-red-400 text-base flex items-center gap-1.5">
                  ⚠️ Thực trạng Agency Livestream hiện nay:
                </h3>
                <ul className="space-y-1.5 list-disc list-inside text-xs text-slate-300">
                  <li>Dùng <strong>Google Sheet</strong> quản lý lịch Studio & Booking Host (Dễ đè lịch, mất dấu).</li>
                  <li>Dùng <strong>Notion / ClickUp</strong> giao task cho Editor, Designer, Moderator (Thiếu liên kết dữ liệu bán hàng).</li>
                  <li>Dùng <strong>TikTok Seller Center / Compass</strong> xuất báo cáo thủ công bằng Excel sau live (Mất 2-3h/ngày).</li>
                  <li>Dùng <strong>Zalo / Telegram</strong> trao đổi với Brand (Thiếu lưu trữ kịch bản & quy trình SOP).</li>
                </ul>
              </div>
              <div className="bg-purple-950/40 p-4 rounded-xl border border-purple-800/50 space-y-2">
                <h3 className="font-bold text-purple-300 text-base flex items-center gap-1.5">
                  🚀 Giải pháp LiveOps AI OS:
                </h3>
                <p className="text-xs text-slate-200">
                  Biến toàn bộ hoạt động thành một **AI Operating System** duy nhất. Dữ liệu từ CRM, Lịch Studio, Thiết bị, Talent KOC, Kịch bản, Dữ liệu Bán hàng từng phút từ TikTok API cho đến P&L Tài chính đều chảy về 1 nguồn dữ liệu duy nhất (Single Source of Truth).
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: TikTok API Capabilities */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4 text-white">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" /> 2. Nghiên Cứu TikTok Shop Partner / Open API & Khả Năng Kết Nối
            </h2>
            <div className="space-y-3 text-sm text-slate-300">
              <p className="leading-relaxed">
                Dựa trên tài liệu TikTok Open API & TikTok Shop Partner Center, dữ liệu livestream có thể thu thập qua 3 cơ chế:
              </p>
              <div className="grid md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                    TỰ ĐỘNG API (Direct API)
                  </span>
                  <h4 className="font-bold text-sm text-emerald-400">TikTok Shop Open API Endpoints</h4>
                  <p className="text-slate-300">Đơn hàng, SKU, GMV, Voucher, Flash sale — lấy ngay khi session kết thúc.</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                    WEBHOOK / REAL-TIME
                  </span>
                  <h4 className="font-bold text-sm text-indigo-400">Live Stream Performance Webhooks</h4>
                  <p className="text-slate-300">Mắt xem, Like, Comment, Share, Retention — cập nhật real-time.</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                    FALLBACK IMPORT
                  </span>
                  <h4 className="font-bold text-sm text-amber-400">CSV/Excel Smart Ingestion</h4>
                  <p className="text-slate-300">Kéo thả file Compass để AI tự parse — dùng khi Shop chưa cấp OAuth API.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: 16 Core Modules Grid */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4 text-white">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" /> 3. Chi Tiết 16 Module Vận Hành Toàn Diện
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {[
                { num: "01", name: "CRM & Brand Lead", desc: "Quản lý Brand, Hợp đồng, Pipeline deal, AI tóm tắt meeting & gợi ý chốt đơn." },
                { num: "02", name: "Project Management", desc: "Gantt, Kanban, Deliverables, Phân bổ Team, Studio, Host & KPI target vs actual." },
                { num: "03", name: "Talent Management", desc: "Database Host/KOC/KOL, CVR/CTR track record, AI Matching Host phù hợp Brand." },
                { num: "04", name: "Studio Management", desc: "Lịch đặt phòng Live, Decor theme, Capacity, Phát hiện trùng lịch tự động." },
                { num: "05", name: "Equipment Management", desc: "Quản lý Camera, Mic, Đèn, Switcher bằng Mã QR, Lịch mượn trả & bảo trì." },
                { num: "06", name: "Livestream Session Hub", desc: "Trọng tâm hệ thống: Pre-live checklist, Script sync, OBS control, Live agenda." },
                { num: "07", name: "TikTok Live Analytics", desc: "Đồng bộ API TikTok Shop, GMV, Orders, Peak Viewers, Retention, Product CTR/CVR." },
                { num: "08", name: "AI Live Analyst & Coach", desc: "Phân tích biến động từng phút, chấm điểm Host (Closing, Năng lượng, Kiến thức)." },
                { num: "09", name: "AI Script Generator", desc: "Sinh kịch bản tự động: Hook 5s, Storytelling, Deal trigger, Xử lý từ chối, CTA." },
                { num: "10", name: "Content & Asset Library", desc: "Lưu trữ Layout OBS, Music, Design Banner, Video Replay, Prompt mẫu." },
                { num: "11", name: "Finance & Margin", desc: "P&L từng phiên live (GMV, Commission, Host payout, Studio cost, Net profit)." },
                { num: "12", name: "HR & Talent Payroll", desc: "Chấm công Host/KOC, Tương quan KPI/OKR, Tính hoa hồng commission tự động." },
                { num: "13", name: "Workflow Automation", desc: "Kích hoạt tự động: Ký HĐ -> Tạo Project; Live kết thúc -> Gọi API -> Email Brand." },
                { num: "14", name: "Multi-Role Dashboard", desc: "Dashboard riêng cho CEO, Ops Manager, Brand Client Portal & Talent Host Portal." },
                { num: "15", name: "Notification Center", desc: "Thông báo đa kênh Slack, Telegram, Zalo, Email khi có sự cố hoặc nhắc nhở Live." },
                { num: "16", name: "AI Multi-Agent Center", desc: "Hội đồng AI: CEO Agent, Host Coach, Script Agent, Data Analyst, Talent Matcher." }
              ].map((m) => (
                <div key={m.num} className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-purple-500/50 transition-all space-y-1">
                  <div className="flex items-center justify-between font-bold text-purple-400">
                    <span>Module {m.num}</span>
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  </div>
                  <h4 className="font-bold text-white text-sm">{m.name}</h4>
                  <p className="text-slate-400 leading-snug">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Operational Data Graph Model */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4 text-white">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-purple-400" /> 4. Mô Hình Dữ Liệu Trung Tâm: Operational Data Graph
            </h2>
            <div className="bg-slate-950 p-6 rounded-2xl text-xs space-y-4 font-mono border border-slate-800">
              <p className="text-purple-300 font-sans font-medium text-sm">
                Mọi Entity trong doanh nghiệp đều hướng về <strong>Livestream Session</strong> làm đỉnh trung tâm (Centroid):
              </p>
              <div className="grid md:grid-cols-3 gap-4 text-[11px] font-sans">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-indigo-400 font-bold block">INPUT ENTITIES</span>
                  <p className="text-slate-300">• Brand & Campaign SKUs</p>
                  <p className="text-slate-300">• Host/KOC (Rate & CVR history)</p>
                  <p className="text-slate-300">• Studio Room & QR Equipment</p>
                  <p className="text-slate-300">• AI Live Script & OBS Asset</p>
                </div>
                <div className="p-3 rounded-lg bg-purple-950/80 border border-purple-500/50 space-y-1 text-center">
                  <span className="text-purple-200 font-bold block text-sm">🔴 LIVESTREAM SESSION</span>
                  <span className="text-emerald-400 font-bold block">Real-time Minute Metrics Log</span>
                  <p className="text-slate-300 text-[10px]">TikTok API Webhook Sync (GMV, Peak Viewers, Retention, CTR, CVR)</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-emerald-400 font-bold block">OUTPUT & AI ENGINE</span>
                  <p className="text-slate-300">• AI Session Analyst Report</p>
                  <p className="text-slate-300">• Host Coaching Scorecard</p>
                  <p className="text-slate-300">• P&L Financial Profitability</p>
                  <p className="text-slate-300">• Talent Leaderboard Score Update</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT DIRECTIVE */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-2xl text-white space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold">
                  {editingDirective ? "Chỉnh Sửa Chỉ Đạo Chiến Lược" : "Ban Hành Chỉ Đạo Chiến Lược Mới (BOD)"}
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDirective} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Mã Chỉ Đạo (Directive Code):</label>
                  <input
                    type="text"
                    required
                    value={formData.code || ""}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                    placeholder="DIR-2026-06"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Mức Độ Ưu Tiên:</label>
                  <select
                    value={formData.priority || "High"}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold"
                  >
                    <option value="Urgent">⚡ Cấp Bách (Urgent)</option>
                    <option value="High">🔥 Ưu Tiên Cao (High)</option>
                    <option value="Medium">📌 Trung Bằng (Medium)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Tên Chỉ Đạo / Nhiệm Vụ Chiến Lược:</label>
                <input
                  type="text"
                  required
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm font-bold"
                  placeholder="Ví dụ: Đẩy mạnh kịch bản AI cho đợt Mega Sale 8.8"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Mô Tả Chi Tiết Yêu Cầu Từ Ban Giám Đốc:</label>
                <textarea
                  rows={3}
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white leading-relaxed"
                  placeholder="Nêu rõ mục đích, phạm vi và cách thức triển khai..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Bộ Phận Phụ Trách:</label>
                  <select
                    value={formData.department || "Operations"}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold"
                  >
                    <option value="Operations">Operations (Vận Hành)</option>
                    <option value="Content & AI">Content & AI (Kịch Bản)</option>
                    <option value="Talent Management">Talent Management (Host/KOC)</option>
                    <option value="Brand Client">Brand Client (Chăm Sóc Hợp Đồng)</option>
                    <option value="Finance & Admin">Finance & Admin (Tài Chính/Lương)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Người Nhận Trách Nhiệm Chính (Lead):</label>
                  <input
                    type="text"
                    required
                    value={formData.assigneeName || ""}
                    onChange={(e) => setFormData({ ...formData, assigneeName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    placeholder="Lê Quốc Bảo (Head of Ops)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Mục Tiêu KPI / Chỉ Số Đo Lường Bắt Buộc:</label>
                <input
                  type="text"
                  required
                  value={formData.targetKpi || ""}
                  onChange={(e) => setFormData({ ...formData, targetKpi: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-bold"
                  placeholder="Ví dụ: Tăng CVR ≥ 4.5% & GMV > 300M VNĐ/ca"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Hạn Hoàn Thành:</label>
                  <input
                    type="date"
                    required
                    value={formData.deadline || ""}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Trạng Thái Thực Hiện:</label>
                  <select
                    value={formData.status || "Pending"}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Pending">Chưa bắt đầu</option>
                    <option value="In Progress">Đang thực hiện</option>
                    <option value="Needs BOD Support">Cần CEO Hỗ Trợ</option>
                    <option value="Completed">Đã hoàn thành</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">% Tiến Độ ({formData.progressPercent || 0}%):</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={formData.progressPercent || 0}
                    onChange={(e) => setFormData({ ...formData, progressPercent: Number(e.target.value) })}
                    className="w-full accent-purple-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-extrabold shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingDirective ? "Cập Nhật Chỉ Đạo" : "Ban Hành Chỉ Đạo"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SEND LEAD FEEDBACK TO BOD */}
      {feedbackDirective && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg text-white space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold">Báo Cáo Phản Hồi Cho Ban Giám Đốc</h3>
              </div>
              <button
                onClick={() => setFeedbackDirective(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
              <span className="text-purple-400 font-mono font-bold">{feedbackDirective.code}</span>
              <p className="font-bold text-white">{feedbackDirective.title}</p>
            </div>

            <div className="space-y-1 text-xs">
              <label className="block text-slate-300 font-semibold">Nội dung báo cáo / Tiến độ chi tiết gửi CEO:</label>
              <textarea
                rows={4}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-xs leading-relaxed focus:outline-none focus:border-purple-500"
                placeholder="Nhập ghi chú kết quả đạt được, vướng mắc hoặc đề xuất hỗ trợ từ Ban Giám Đốc..."
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setFeedbackDirective(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveFeedback}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/30 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Gửi Báo Cáo Cho CEO</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
