import React, { useState } from "react";
import { LiveSession, MinuteMetric, ProductSKU, Studio, Talent, Brand, SystemUser } from "../types";
import { Radio, Play, CheckCircle2, Clock, Sparkles, TrendingUp, Users, ShoppingBag, AlertCircle, RefreshCw, Layers, Plus, Edit3, Trash2, X, Building2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { authedFetch } from "../lib/authedFetch";
import { getTodayDate } from "../lib/dateUtils";

interface LiveSessionHubProps {
  sessions: LiveSession[];
  selectedSession: LiveSession;
  studios: Studio[];
  talents: Talent[];
  brands: Brand[];
  users: SystemUser[];
  onSelectSession: (session: LiveSession) => void;
  onAddSession?: (session: LiveSession) => void | Promise<boolean>;
  onUpdateSession?: (session: LiveSession) => void | Promise<boolean>;
  onDeleteSession?: (id: string) => void;
}

export const LiveSessionHub: React.FC<LiveSessionHubProps> = ({
  sessions,
  selectedSession,
  studios,
  talents,
  brands,
  users,
  onSelectSession,
  onAddSession,
  onUpdateSession,
  onDeleteSession
}) => {
  const moderators = users.filter((u) => u.role === "moderator");
  const [activeTab, setActiveTab] = useState<"analytics" | "checklist" | "products" | "ai_coach">("analytics");
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(selectedSession?.aiAnalysis || null);
  const [viewMode, setViewMode] = useState<"single" | "multi_grid">("single");

  // Session Modal State
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);
  const [sessTitle, setSessTitle] = useState("");
  const [sessBrandId, setSessBrandId] = useState("");
  const [sessShopHandle, setSessShopHandle] = useState("@cocoon.vietnam.official");
  const [sessStudioId, setSessStudioId] = useState("");
  const [sessHostId, setSessHostId] = useState("");
  const [sessAssistantId, setSessAssistantId] = useState("");
  const [sessDate, setSessDate] = useState(() => getTodayDate());
  const [sessStartTime, setSessStartTime] = useState("19:00");
  const [sessEndTime, setSessEndTime] = useState("21:00");
  const [sessStatus, setSessStatus] = useState<"Live Now" | "Upcoming" | "Completed" | "Cancelled">("Upcoming");
  const [sessTargetGmv, setSessTargetGmv] = useState(250000000);
  const [sessActualGmv, setSessActualGmv] = useState(0);
  // Giai đoạn B6 — trước đây các số này bị set cứng (1500/25000/8.5/4.2) mỗi khi lưu session
  // thay vì để trống chờ nhập tay thật, vi phạm nguyên tắc "không giả lập số liệu" của dự án.
  const [sessPeakViewers, setSessPeakViewers] = useState(0);
  const [sessTotalViews, setSessTotalViews] = useState(0);
  const [sessCtrAvg, setSessCtrAvg] = useState(0);
  const [sessCvrAvg, setSessCvrAvg] = useState(0);

  const openAddSessionModal = () => {
    setEditingSession(null);
    setSessTitle("Phiên Live Mỹ Phẩm Mùa Hè");
    setSessBrandId(brands[0]?.id || "");
    setSessShopHandle("@cocoon.vietnam.official");
    setSessStudioId(studios[0]?.id || "");
    setSessHostId(talents[0]?.id || "");
    setSessAssistantId(moderators[0]?.id || "");
    setSessDate("2026-07-24");
    setSessStartTime("20:00");
    setSessEndTime("22:00");
    setSessStatus("Upcoming");
    setSessTargetGmv(250000000);
    setSessActualGmv(0);
    setSessPeakViewers(0);
    setSessTotalViews(0);
    setSessCtrAvg(0);
    setSessCvrAvg(0);
    setIsSessionModalOpen(true);
  };

  const openEditSessionModal = (s: LiveSession) => {
    setEditingSession(s);
    setSessTitle(s.title || "Phiên Livestream");
    setSessBrandId(s.brandId || brands[0]?.id || "");
    setSessShopHandle(s.shopTikTokHandle);
    setSessStudioId(s.studioId || studios[0]?.id || "");
    setSessHostId(s.hostId || talents[0]?.id || "");
    setSessAssistantId(s.assistantId || "");
    setSessDate(s.date);
    setSessStartTime(s.startTime);
    setSessEndTime(s.endTime);
    setSessStatus(s.status);
    setSessTargetGmv(s.targetGmv);
    setSessActualGmv(s.actualGmv);
    setSessPeakViewers(s.peakViewers || 0);
    setSessTotalViews(s.totalViews || 0);
    setSessCtrAvg(s.ctrAvg || 0);
    setSessCvrAvg(s.cvrAvg || 0);
    setIsSessionModalOpen(true);
  };

  const [isSavingSession, setIsSavingSession] = useState(false);

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();

    const brandObj = brands.find((b) => b.id === sessBrandId);
    const studioObj = studios.find((s) => s.id === sessStudioId);
    const hostObj = talents.find((t) => t.id === sessHostId);
    const assistantObj = moderators.find((m) => m.id === sessAssistantId);

    const sessionPayload: LiveSession = {
      id: editingSession ? editingSession.id : `session-${Date.now()}`,
      title: sessTitle || `Live ${brandObj?.name || "Brand"}`,
      brandId: sessBrandId,
      brandName: brandObj?.name || "",
      shopTikTokHandle: sessShopHandle,
      studioId: sessStudioId,
      studioName: studioObj?.name || "",
      hostId: sessHostId,
      hostName: hostObj?.name || "",
      assistantId: sessAssistantId || undefined,
      assistantName: assistantObj?.name || "Chưa gán Trợ Lý",
      coHostId: editingSession?.coHostId,
      coHostName: editingSession?.coHostName || "",
      platform: editingSession?.platform || "TikTok",
      date: sessDate,
      startTime: sessStartTime,
      endTime: sessEndTime,
      status: sessStatus,
      targetGmv: Number(sessTargetGmv),
      actualGmv: Number(sessActualGmv),
      totalOrders: editingSession?.totalOrders || 0,
      avgWatchTimeSeconds: editingSession?.avgWatchTimeSeconds || 120,
      peakViewers: Number(sessPeakViewers),
      totalViews: Number(sessTotalViews),
      ctrAvg: Number(sessCtrAvg),
      cvrAvg: Number(sessCvrAvg),
      skus: editingSession?.skus || [],
      checklist: editingSession?.checklist || [],
      minuteMetrics: editingSession?.minuteMetrics || []
    };

    setIsSavingSession(true);
    try {
      // App.tsx's handlers already alert the user and return `false` on failure — only close
      // the modal (and lose the entered form data) once we know the save actually went through.
      const result = editingSession
        ? await onUpdateSession?.(sessionPayload)
        : await onAddSession?.(sessionPayload);
      if (result === false) return;
      setIsSessionModalOpen(false);
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleDeleteSession = (id: string, brandName: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa phiên live của "${brandName}"?`)) {
      if (onDeleteSession) onDeleteSession(id);
    }
  };

  const liveSessions = sessions.filter((s) => s.status === "Live Now");

  const handleRunAiAnalysis = async () => {
    setAnalyzingAi(true);
    try {
      const res = await authedFetch("/api/gemini/analyze-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionData: selectedSession })
      });
      const data = await res.json();
      if (data.success) {
        setAiAnalysisResult(data.insights);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Session Selector */}
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl space-y-5">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" /> Operational Data Graph Nexus
            </span>
            <h2 className="text-2xl font-black">Livestream Session Hub</h2>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            {liveSessions.length > 1 && (
              <div className="bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border)] flex items-center text-xs">
                <button
                  onClick={() => setViewMode("single")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    viewMode === "single" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  Giao Diện Đơn
                </button>
                <button
                  onClick={() => setViewMode("multi_grid")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                    viewMode === "multi_grid" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> So Sánh Multi-Live ({liveSessions.length})
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] font-medium">Chọn phiên live:</span>
              <select
                value={selectedSession?.id || ""}
                onChange={(e) => {
                  const found = sessions.find((s) => s.id === e.target.value);
                  if (found) {
                    onSelectSession(found);
                    setAiAnalysisResult(found.aiAnalysis || null);
                  }
                }}
                className="bg-[var(--surface-elevated)] text-[var(--text)] text-xs font-bold px-3 py-2 rounded-xl border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {sessions.length === 0 ? (
                  <option value="">Chưa có phiên live nào (Clean State)</option>
                ) : (
                  sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.status}] {s.brandName} - {s.date} ({s.startTime})
                    </option>
                  ))
                )}
              </select>

              {selectedSession && (
                <>
                  <button
                    onClick={() => openEditSessionModal(selectedSession)}
                    className="bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] p-2 rounded-xl border border-[var(--border)] transition-all"
                    title="Chỉnh sửa phiên live này"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteSession(selectedSession.id, selectedSession.brandName)}
                    className="bg-[var(--surface-elevated)] hover:bg-red-900/50 text-red-400 p-2 rounded-xl border border-[var(--border)] hover:border-red-500 transition-all"
                    title="Xóa phiên live này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              <button
                onClick={openAddSessionModal}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all ml-1"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm Phiên Live
              </button>
            </div>
          </div>
        </div>

        {/* MULTI-LIVE STREAM ACTIVE SELECTOR BAR */}
        {liveSessions.length > 0 && (
          <div className="bg-[var(--surface-base)]/90 border border-red-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                <span className="font-extrabold text-[var(--text)]">
                  Đang Có {liveSessions.length} Phiên Live Đang Phát Sóng Trực Tiếp
                </span>
                <span className="bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Concurrent Live Streams
                </span>
              </div>
              <span className="text-[var(--text-muted)] text-[11px] hidden sm:block">
                Nhấp vào thẻ phiên live bên dưới để chuyển đổi góc theo dõi dữ liệu thời gian thực
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {liveSessions.map((s) => {
                const isSelected = selectedSession?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      onSelectSession(s);
                      setAiAnalysisResult(s.aiAnalysis || null);
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-2 ${
                      isSelected
                        ? "bg-gradient-to-r from-[var(--accent)]/90 to-[var(--surface)] border-[var(--accent)] shadow-lg shadow-[var(--accent)]/30 ring-2 ring-[var(--accent)]/50"
                        : "bg-[var(--surface)]/80 border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--surface)]"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                          {s.studioName}
                        </span>
                        <h4 className="font-black text-sm text-[var(--text)] mt-0.5">{s.brandName}</h4>
                      </div>
                      <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                        <Radio className="w-3 h-3 animate-pulse" /> LIVE
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-[var(--border)]/80">
                      <div>
                        <span className="text-[var(--text-muted)] block">Thực Thu GMV:</span>
                        <strong className="text-emerald-400 font-bold">{s.actualGmv.toLocaleString()} đ</strong>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)] block">Peak Viewers:</span>
                        <strong className="text-[var(--accent-text)] font-bold">{s.peakViewers.toLocaleString()} người</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MULTI-GRID COMPARISON VIEW IF TOGGLED */}
        {viewMode === "multi_grid" && liveSessions.length > 1 && (
          <div className="bg-[var(--surface-base)] p-4 rounded-2xl border border-[var(--accent)]/40 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--accent-text)]" /> Bảng So Sánh Các Phiên Live Đang Phát Sóng
              </h3>
              <span className="text-xs text-[var(--text-muted)]">Song song {liveSessions.length} Studio</span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {liveSessions.map((s) => (
                <div key={s.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
                    <div>
                      <span className="text-xs font-bold text-[var(--accent-text)]">{s.studioName}</span>
                      <h4 className="font-black text-[var(--text)] text-base">{s.brandName}</h4>
                    </div>
                    <button
                      onClick={() => {
                        onSelectSession(s);
                        setViewMode("single");
                      }}
                      className="text-xs bg-[var(--accent)]/30 text-[var(--accent-text)] hover:bg-[var(--accent-hover)] hover:text-white px-2.5 py-1 rounded-lg border border-[var(--accent)]/40 transition-all"
                    >
                      Xem Chi Tiết →
                    </button>
                  </div>

                  <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 text-xs">
                    <div className="bg-[var(--surface-base)] p-2 rounded-lg">
                      <span className="text-[var(--text-muted)] text-[10px] block">GMV Hiện Tại</span>
                      <strong className="text-emerald-400 font-bold">{s.actualGmv.toLocaleString()} đ</strong>
                    </div>
                    <div className="bg-[var(--surface-base)] p-2 rounded-lg">
                      <span className="text-[var(--text-muted)] text-[10px] block">Mắt Xem Peak</span>
                      <strong className="text-[var(--accent-text)] font-bold">{s.peakViewers.toLocaleString()}</strong>
                    </div>
                    <div className="bg-[var(--surface-base)] p-2 rounded-lg">
                      <span className="text-[var(--text-muted)] text-[10px] block">Host phụ trách</span>
                      <strong className="text-[var(--text)] truncate block">{s.hostName}</strong>
                    </div>
                  </div>

                  {/* SKU Mini summary */}
                  <div className="text-[11px] text-[var(--text-muted)] space-y-1">
                    <div className="font-semibold text-[var(--text-muted)]">Sản phẩm nổi bật:</div>
                    {s.skus.slice(0, 2).map((sku) => (
                      <div key={sku.id} className="flex justify-between bg-[var(--surface-base)]/60 p-1.5 rounded-md">
                        <span className="truncate pr-2">{sku.name}</span>
                        <strong className="text-[var(--text)] shrink-0">{sku.livePrice.toLocaleString()} đ</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected Session Details or Empty State */}
        {!selectedSession ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-12 text-center space-y-4 my-4">
            <div className="w-16 h-16 bg-[var(--accent)]/10 text-[var(--accent-text)] rounded-full flex items-center justify-center mx-auto border border-[var(--accent)]/20">
              <Radio className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-[var(--text)]">Chưa Có Phiên Live Nào Trong Hệ Thống</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
              Hệ thống hiện đang ở trạng thái trống (Clean State). Bạn hãy nhấp vào nút bên dưới để tạo phiên live đầu tiên hoặc mở lại Mock Data từ thanh thông báo.
            </p>
            <button
              onClick={openAddSessionModal}
              className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl shadow-lg transition-all text-xs inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Tạo Phiên Live Mới Ngay
            </button>
          </div>
        ) : (
          <>
            {/* Selected Session Info Banner */}
            <div className="bg-[var(--surface-elevated)]/80 p-4 rounded-xl border border-[var(--border)]/80 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <span className="text-[var(--text-muted)] block">Thương hiệu:</span>
                <strong className="text-[var(--text)] text-sm font-bold">{selectedSession.brandName}</strong>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block">TikTok Handle:</span>
                <strong className="text-[var(--accent-text)] font-mono text-sm">{selectedSession.shopTikTokHandle}</strong>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block">Host:</span>
                <strong className="text-[var(--text)] font-bold">{selectedSession.hostName}</strong>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block">Studio:</span>
                <strong className="text-[var(--text)]">{selectedSession.studioName}</strong>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block">Thực Thu GMV:</span>
                <strong className="text-emerald-400 text-sm font-black">{selectedSession.actualGmv ? selectedSession.actualGmv.toLocaleString() : 0} đ</strong>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block">Peak Viewers:</span>
                <strong className="text-[var(--accent-text)] text-sm font-bold">{selectedSession.peakViewers ? selectedSession.peakViewers.toLocaleString() : 0} người</strong>
              </div>
            </div>

            {/* Tab Buttons */}
            <div className="flex space-x-2 pt-2 border-t border-[var(--border)] text-xs font-semibold overflow-x-auto">
              <button
                onClick={() => setActiveTab("analytics")}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${
                  activeTab === "analytics"
                    ? "bg-[var(--accent)] text-white shadow"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
                }`}
              >
                📊 Biến Động Từng Phút (Minute Metrics)
              </button>
              <button
                onClick={() => setActiveTab("checklist")}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${
                  activeTab === "checklist"
                    ? "bg-[var(--accent)] text-white shadow"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
                }`}
              >
                ✅ Pre-Live Checklist ({(selectedSession.checklist || []).filter(c => c.completed).length}/{(selectedSession.checklist || []).length})
              </button>
              <button
                onClick={() => setActiveTab("products")}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${
                  activeTab === "products"
                    ? "bg-[var(--accent)] text-white shadow"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
                }`}
              >
                🛍️ SKUs & Conversion ({(selectedSession.skus || []).length} sản phẩm)
              </button>
              <button
                onClick={() => setActiveTab("ai_coach")}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${
                  activeTab === "ai_coach"
                    ? "bg-[var(--accent)] text-white shadow"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
                }`}
              >
                ✨ AI Session Analyst & Host Coach
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tab Content 1: Analytics & Minute Metrics Recharts */}
      {selectedSession && activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-[var(--text)] text-base">
                  Biểu Đồ GMV & Lượt Người Xem (Viewers) Từng Phút Trong Live
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Dữ liệu được đồng bộ từ TikTok Live Performance API & Webhook
                </p>
              </div>
              <span className="text-xs font-bold text-[var(--accent-text)] bg-[var(--accent)]/30 px-3 py-1 rounded-full border border-[var(--accent)]/50">
                Live Duration: 60 Minutes
              </span>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={selectedSession.minuteMetrics || []}>
                  <XAxis dataKey="timeString" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis yAxisId="left" stroke="var(--accent)" fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--success)" fontSize={12} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as MinuteMetric;
                        return (
                          <div className="bg-[var(--surface)] text-[var(--text)] p-3 rounded-xl text-xs space-y-1 shadow-xl border border-[var(--border)]">
                            <p className="font-bold text-[var(--accent-text)]">{data.timeString} - Phút {data.minute}</p>
                            <p>👁️ Mắt xem: <strong className="text-[var(--text)]">{data.viewers.toLocaleString()}</strong></p>
                            <p>💰 GMV Tích lũy: <strong className="text-emerald-400">{data.gmvCumulative.toLocaleString()} đ</strong></p>
                            <p>🎯 CVR: <strong className="text-[var(--accent-text)]">{data.cvr}%</strong> | CTR: <strong className="text-[var(--accent-text)]">{data.ctr}%</strong></p>
                            {data.eventTrigger && (
                              <p className="text-amber-300 border-t border-[var(--border)] pt-1 mt-1 font-semibold">
                                📌 {data.eventTrigger}
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="viewers" stroke="var(--accent)" strokeWidth={3} name="Mắt xem (Viewers)" />
                  <Line yAxisId="right" type="monotone" dataKey="gmvCumulative" stroke="var(--success)" strokeWidth={3} name="GMV Tích Lũy" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Minute-by-Minute Key Events Timeline */}
          <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
            <h3 className="font-bold text-[var(--text)] text-base">Nhật Ký Sự Kiện Tác Động Doanh Thu Từng Phút</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(selectedSession.minuteMetrics || []).map((m) => (
                <div key={m.minute} className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/40 space-y-2 hover:border-[var(--accent)]/60 transition-all">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-black text-[var(--accent-text)] bg-[var(--accent)]/50 px-2 py-0.5 rounded">
                      {m.timeString} (Phút {m.minute})
                    </span>
                    <span className="text-emerald-400 font-bold">{m.gmvCumulative.toLocaleString()} đ</span>
                  </div>
                  <div className="text-xs font-semibold text-[var(--text)]">{m.eventTrigger || "Duy trì guồng nói kịch bản"}</div>
                  <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
                    <span>👁️ Viewers: {m.viewers}</span>
                    <span>CVR: {m.cvr}%</span>
                    <span>💬 Comment: {m.comments}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 2: Pre-Live Checklist */}
      {selectedSession && activeTab === "checklist" && (
        <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-[var(--text)] text-base">Pre-Live Operational Checklist</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Nhấp vào từng công việc để đánh dấu hoàn thành. Đảm bảo chuẩn bị đủ kỹ thuật & kịch bản trước khi Go Live.
              </p>
            </div>
            <span className="bg-emerald-900/85 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold">
              {(selectedSession.checklist || []).filter(c => c.completed).length}/{(selectedSession.checklist || []).length} Đã Hoàn Thành
            </span>
          </div>

          <div className="space-y-2">
            {(selectedSession.checklist || []).map((item) => (
              <div
                key={item.id}
                onClick={async () => {
                  if (!selectedSession) return;
                  const updatedSession = {
                    ...selectedSession,
                    checklist: (selectedSession.checklist || []).map((c) =>
                      c.id === item.id ? { ...c, completed: !c.completed } : c
                    ),
                  };
                  // Don't set `selectedSession` optimistically here — App.tsx's
                  // handleUpdateSession already sets it (from the DB-confirmed row) on
                  // success. Calling onSelectSession synchronously first meant a failed
                  // Supabase write left the checklist toggle "stuck" showing the new state
                  // forever, since `sessions` (source of truth) never actually changed.
                  if (onUpdateSession) await onUpdateSession(updatedSession);
                }}
                className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all hover:shadow-sm ${
                  item.completed ? "bg-emerald-950/80 border-emerald-800/50" : "bg-amber-950/80 border-amber-800/50"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    item.completed ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"
                  }`}>
                    {item.completed ? "✓" : "!"}
                  </span>
                  <div>
                    <h4 className={`font-bold text-xs ${item.completed ? "line-through text-[var(--text-faint)]" : "text-[var(--text)]"}`}>
                      {item.task}
                    </h4>
                    <span className="text-[10px] text-[var(--text-muted)]">Hạng mục: {item.category}</span>
                  </div>
                </div>
                <span className="text-xs font-medium text-[var(--text-muted)] bg-[var(--surface-elevated)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
                  Phụ trách: {item.assignedTo}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content 3: Product SKUs */}
      {selectedSession && activeTab === "products" && (
        <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
          <h3 className="font-bold text-[var(--text)] text-base">Danh Sách SKUs & Hiệu Quả Chuyển Đổi Trong Phiên Live</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-elevated)]/40 text-[var(--text-muted)]">
                  <th className="p-3">Mã SKU</th>
                  <th className="p-3">Tên Sản Phẩm</th>
                  <th className="p-3">Giá Niêm Yết</th>
                  <th className="p-3">Giá Live (Deal)</th>
                  <th className="p-3">Đã Bán</th>
                  <th className="p-3">Lượt Clicks</th>
                  <th className="p-3">Tỷ Lệ CTR</th>
                  <th className="p-3">Tỷ Lệ CVR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {(selectedSession.skus || []).map((sku) => (
                  <tr key={sku.id} className="hover:bg-[var(--surface-elevated)]">
                    <td className="p-3 font-mono font-bold text-[var(--accent-text)]">{sku.code}</td>
                    <td className="p-3 font-bold text-[var(--text)]">{sku.name}</td>
                    <td className="p-3 text-[var(--text-faint)] line-through">{sku.originalPrice.toLocaleString()} đ</td>
                    <td className="p-3 text-emerald-400 font-bold">{sku.livePrice.toLocaleString()} đ</td>
                    <td className="p-3 font-bold text-[var(--text)]">{sku.soldInSession} món</td>
                    <td className="p-3 text-[var(--text-muted)]">{sku.clickCount} clicks</td>
                    <td className="p-3 text-[var(--accent-text)] font-bold">{sku.ctr}%</td>
                    <td className="p-3 text-[var(--accent-text)] font-bold">{sku.cvr}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content 4: AI Analyst & Host Coach */}
      {selectedSession && activeTab === "ai_coach" && (
        <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-4 border-b border-[var(--border)] pb-4">
            <div>
              <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[var(--accent-text)]" /> AI Live Session Analyst & Host Coach
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Hệ thống AI tự động đọc dữ liệu biến động từng phút để đưa ra bài học kinh nghiệm và chấm điểm Host
              </p>
            </div>
            <button
              onClick={handleRunAiAnalysis}
              disabled={analyzingAi}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow"
            >
              {analyzingAi ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Đang phân tích Gemini AI...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Chạy Phân Tích Gemini AI Mới
                </>
              )}
            </button>
          </div>

          {aiAnalysisResult && (
            <div className="space-y-6">
              {/* Overall & GMV Summary */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[var(--accent)]/30 border border-[var(--accent)]/50 space-y-1">
                  <span className="text-xs text-[var(--accent-text)] font-semibold uppercase">Đánh Giá Tổng Thể:</span>
                  <div className="text-xl font-black text-[var(--accent-text)]">{aiAnalysisResult.overallRating}</div>
                  <p className="text-xs text-[var(--accent-text)]">{aiAnalysisResult.gmvSummary}</p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--surface)] text-[var(--text)] space-y-2">
                  <span className="text-xs text-[var(--text-muted)] font-semibold uppercase">Host Performance Scorecard:</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Chốt đơn: <strong className="text-emerald-400">{aiAnalysisResult.hostCoaching?.closingSkillScore}/100</strong></div>
                    <div>Năng lượng: <strong className="text-emerald-400">{aiAnalysisResult.hostCoaching?.energyScore}/100</strong></div>
                    <div>Kiến thức: <strong className="text-emerald-400">{aiAnalysisResult.hostCoaching?.productKnowledgeScore}/100</strong></div>
                    <div>Nhịp nói: <strong className="text-emerald-400">{aiAnalysisResult.hostCoaching?.speechRateScore}/100</strong></div>
                  </div>
                </div>
              </div>

              {/* Highlights & Mistakes */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-emerald-400 uppercase tracking-wider">🌟 Đột Biến Đáng Chú Ý (Highlights):</h4>
                  <ul className="space-y-1.5 list-disc list-inside text-xs text-[var(--text-muted)]">
                    {aiAnalysisResult.keyHighlights?.map((h: string, i: number) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-red-400 uppercase tracking-wider">⚠️ Sai Lầm & Điểm Thẽm Bị Drop (Top Mistakes):</h4>
                  <ul className="space-y-1.5 list-disc list-inside text-xs text-[var(--text-muted)]">
                    {aiAnalysisResult.topMistakes?.map((m: string, i: number) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Recommendations */}
              <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-800/50 space-y-2 text-xs">
                <h4 className="font-bold text-emerald-200 uppercase">💡 Khuyến Nghị Hành Động Cho Live Kế Tiếp:</h4>
                <ul className="space-y-1 list-disc list-inside text-emerald-100">
                  {aiAnalysisResult.actionableRecommendations?.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Session Modal */}
      {isSessionModalOpen && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] text-[var(--text)] w-full max-w-lg rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[var(--surface)] text-[var(--text)] px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Radio className="w-4 h-4 text-[var(--accent-text)]" />
                {editingSession ? `Chỉnh Sửa Phiên Live: ${editingSession.brandName}` : "Tạo Phiên Livestream Mới"}
              </h3>
              <button onClick={() => setIsSessionModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="p-6 space-y-4 text-xs overflow-y-auto">
              {/* Conflict Detection Banner */}
              {(() => {
                const studioConflictSession = sessions.find((s) => {
                  if (editingSession && s.id === editingSession.id) return false;
                  if (s.status === "Cancelled") return false;
                  const isSameDate = s.date === sessDate;
                  const isSameStudio = sessStudioId && s.studioId === sessStudioId;
                  return isSameDate && isSameStudio;
                });

                const hostConflictSession = sessions.find((s) => {
                  if (editingSession && s.id === editingSession.id) return false;
                  if (s.status === "Cancelled") return false;
                  const isSameDate = s.date === sessDate;
                  const isSameHost = sessHostId && s.hostId === sessHostId;
                  return isSameDate && isSameHost;
                });

                if (!studioConflictSession && !hostConflictSession) return null;

                return (
                  <div className="p-3 bg-amber-950/80 border border-amber-800/50 rounded-xl text-amber-200 space-y-1 text-xs animate-fade-in">
                    <div className="flex items-center gap-1.5 font-bold text-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>Cảnh Báo Xung Đột Lịch Vận Hành:</span>
                    </div>
                    {studioConflictSession && (
                      <p className="text-[11px] text-amber-300">
                        • <strong>Studio &quot;{studios.find((s) => s.id === sessStudioId)?.name}&quot;</strong> đã trùng lịch với phiên &quot;{studioConflictSession.title}&quot; vào ngày {sessDate} ({studioConflictSession.startTime} - {studioConflictSession.endTime}).
                      </p>
                    )}
                    {hostConflictSession && (
                      <p className="text-[11px] text-amber-300">
                        • <strong>Host &quot;{talents.find((t) => t.id === sessHostId)?.name}&quot;</strong> đã trùng lịch với phiên &quot;{hostConflictSession.title}&quot; vào ngày {sessDate} ({hostConflictSession.startTime} - {hostConflictSession.endTime}).
                      </p>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Thương Hiệu (Brand) *</label>
                <select
                  required
                  value={sessBrandId}
                  onChange={(e) => setSessBrandId(e.target.value)}
                  className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)]"
                >
                  <option value="">-- Chọn Brand --</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.logo} {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">TikTok Handle</label>
                  <input
                    type="text"
                    value={sessShopHandle}
                    onChange={(e) => setSessShopHandle(e.target.value)}
                    placeholder="@cocoon.vietnam"
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Tiêu Đề / Nội Dung Phiên Live</label>
                <input
                  type="text"
                  value={sessTitle}
                  onChange={(e) => setSessTitle(e.target.value)}
                  placeholder="VD: Mega Live 8/8 - Săn Deal Độc Quyền"
                  className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Trạng Thái Live</label>
                  <select
                    value={sessStatus}
                    onChange={(e) => setSessStatus(e.target.value as any)}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                  >
                    <option value="Live Now">🔴 Live Now</option>
                    <option value="Upcoming">📅 Upcoming</option>
                    <option value="Completed">✅ Completed</option>
                    <option value="Cancelled">❌ Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Ngày Diễn Ra</label>
                  <input
                    type="date"
                    value={sessDate}
                    onChange={(e) => setSessDate(e.target.value)}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Khung Giờ</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={sessStartTime}
                      onChange={(e) => setSessStartTime(e.target.value)}
                      placeholder="19:00"
                      className="w-1/2 p-2 border border-[var(--border)] rounded-lg text-center font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                    />
                    <span>-</span>
                    <input
                      type="text"
                      value={sessEndTime}
                      onChange={(e) => setSessEndTime(e.target.value)}
                      placeholder="21:00"
                      className="w-1/2 p-2 border border-[var(--border)] rounded-lg text-center font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Studio Phụ Trách *</label>
                  <select
                    required
                    value={sessStudioId}
                    onChange={(e) => setSessStudioId(e.target.value)}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)]"
                  >
                    <option value="">-- Chọn Studio --</option>
                    {studios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Host Chính *</label>
                  <select
                    required
                    value={sessHostId}
                    onChange={(e) => setSessHostId(e.target.value)}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)]"
                  >
                    <option value="">-- Chọn Host --</option>
                    {talents.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Trợ Lý Moderator</label>
                  <select
                    value={sessAssistantId}
                    onChange={(e) => setSessAssistantId(e.target.value)}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)]"
                  >
                    <option value="">-- Chưa gán Trợ Lý --</option>
                    {moderators.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">KPI Target GMV (VNĐ)</label>
                  <input
                    type="number"
                    value={sessTargetGmv}
                    onChange={(e) => setSessTargetGmv(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">GMV Thực Đạt (VNĐ)</label>
                  <input
                    type="number"
                    value={sessActualGmv}
                    onChange={(e) => setSessActualGmv(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
              </div>

              {/* Giai đoạn B6 — nhập tay thật (không giả lập), nguồn cho Brand Analytics.
                  Để trống/0 tới khi có số thật thay vì mặc định số đẹp như trước. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">PCU (Peak Viewers)</label>
                  <input
                    type="number"
                    value={sessPeakViewers}
                    onChange={(e) => setSessPeakViewers(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">Tổng Lượt Xem</label>
                  <input
                    type="number"
                    value={sessTotalViews}
                    onChange={(e) => setSessTotalViews(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">CTR TB (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sessCtrAvg}
                    onChange={(e) => setSessCtrAvg(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[var(--text-muted)] block mb-1">CVR TB (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sessCvrAvg}
                    onChange={(e) => setSessCvrAvg(Number(e.target.value))}
                    className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsSessionModalOpen(false)}
                  className="px-4 py-2 text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)] rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingSession}
                  className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow transition-all"
                >
                  {isSavingSession ? "Đang Lưu..." : editingSession ? "Cập Nhật Phiên Live" : "Lưu Phiên Live"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
