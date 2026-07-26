import React, { useState } from "react";
import { TikTokConnectionStatus, TikTokWebhookEvent, WorkflowRule } from "../types";
import { getTikTokAuthorizeUrl, disconnectTikTok } from "../lib/db/tiktokIntegration";
import { Server, Zap, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Link2, Unlink, ArrowRight, Activity, FileSpreadsheet, Plus, Edit3, Trash2, X } from "lucide-react";

interface TikTokApiAutomationProps {
  workflowRules: WorkflowRule[];
  onAddWorkflowRule?: (rule: WorkflowRule) => void;
  onUpdateWorkflowRule?: (rule: WorkflowRule) => void;
  onDeleteWorkflowRule?: (id: string) => void;
  currentRole: string;
  tiktokStatus: TikTokConnectionStatus | null;
  tiktokStatusLoading: boolean;
  tiktokStatusError: string | null;
  webhookEvents: TikTokWebhookEvent[];
  onRefreshTikTokStatus: () => void;
}

export const TikTokApiAutomation: React.FC<TikTokApiAutomationProps> = ({
  workflowRules,
  onAddWorkflowRule,
  onUpdateWorkflowRule,
  onDeleteWorkflowRule,
  currentRole,
  tiktokStatus,
  tiktokStatusLoading,
  tiktokStatusError,
  webhookEvents,
  onRefreshTikTokStatus
}) => {
  const [activeTab, setActiveTab] = useState<"api_status" | "rules" | "csv_import">("api_status");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [ruleTrigger, setRuleTrigger] = useState("");
  const [ruleAction, setRuleAction] = useState("");
  const [ruleEnabled, setRuleEnabled] = useState(true);

  const isCeo = currentRole === "ceo";

  const handleConnect = async () => {
    setActionError(null);
    setConnecting(true);
    try {
      const url = await getTikTokAuthorizeUrl();
      window.location.href = url;
    } catch (err: any) {
      setActionError(err.message || "Không thể kết nối TikTok Shop.");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Ngắt kết nối TikTok Shop hiện tại? Mọi webhook sẽ ngừng nhận sự kiện.")) return;
    setActionError(null);
    setDisconnecting(true);
    try {
      await disconnectTikTok();
      onRefreshTikTokStatus();
    } catch (err: any) {
      setActionError(err.message || "Không thể ngắt kết nối TikTok Shop.");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleToggleRule = (rule: WorkflowRule) => {
    const updated = { ...rule, enabled: !rule.enabled };
    if (onUpdateWorkflowRule) {
      onUpdateWorkflowRule(updated);
    }
  };

  const openAddModal = () => {
    setEditingRule(null);
    setRuleName("Tự Động Cảnh Báo Sụt Viết Peak");
    setRuleTrigger("tiktok.live.viewers < 500");
    setRuleAction("Telegram Alert & Kích hoạt Flash Sale 5 phút");
    setRuleEnabled(true);
    setIsModalOpen(true);
  };

  const openEditModal = (rule: WorkflowRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRuleTrigger(rule.trigger);
    setRuleAction(rule.action);
    setRuleEnabled(rule.enabled);
    setIsModalOpen(true);
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;

    const payload: WorkflowRule = {
      id: editingRule ? editingRule.id : `rule-${Date.now()}`,
      name: ruleName,
      trigger: ruleTrigger,
      action: ruleAction,
      enabled: ruleEnabled,
      executionsCount: editingRule ? editingRule.executionsCount : 0
    };

    if (editingRule) {
      if (onUpdateWorkflowRule) onUpdateWorkflowRule(payload);
    } else {
      if (onAddWorkflowRule) onAddWorkflowRule(payload);
    }

    setIsModalOpen(false);
  };

  const handleDeleteRule = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa quy tắc automation "${name}"?`)) {
      if (onDeleteWorkflowRule) onDeleteWorkflowRule(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Server className="w-4 h-4 text-purple-400" /> Modules 07 & 13: TikTok Open API & Automation Engine
        </span>
        <h2 className="text-2xl font-black">TikTok Open API & Tự Động Hóa Workflow Agency</h2>
        <p className="text-slate-400 text-xs">
          Kết nối trực tiếp TikTok Shop Partner API, lắng nghe Webhooks & tự động kích hoạt chuỗi tác vụ vận hành
        </p>
      </div>

      {/* Sub Tabs */}
      <div className="flex space-x-2 text-xs font-bold border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("api_status")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === "api_status" ? "bg-purple-600 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          🔗 TikTok Shop Partner API Status & Webhooks
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === "rules" ? "bg-purple-600 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          ⚡ Visual Workflow Automation Rules ({workflowRules.filter(r => r.enabled).length} Enabled)
        </button>
        <button
          onClick={() => setActiveTab("csv_import")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === "csv_import" ? "bg-purple-600 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          📄 Smart Compass Excel / CSV Fallback Parser
        </button>
      </div>

      {/* API Status View */}
      {activeTab === "api_status" && (
        <div className="space-y-6">
          {actionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-3 rounded-xl">
              {actionError}
            </div>
          )}
          {tiktokStatusError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-3 rounded-xl">
              {tiktokStatusError}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4 text-xs">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-slate-400 font-medium block">TikTok OAuth App Status</span>
              {tiktokStatusLoading ? (
                <div className="text-sm font-bold text-slate-400 flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Đang kiểm tra...
                </div>
              ) : !tiktokStatus?.configured ? (
                <div className="text-sm font-bold text-slate-500 flex items-center gap-1.5">
                  <ShieldX className="w-4 h-4" /> CHƯA CẤU HÌNH APP
                </div>
              ) : tiktokStatus.connected ? (
                <div className="text-sm font-bold text-emerald-600 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> ĐÃ KẾT NỐI
                </div>
              ) : (
                <div className="text-sm font-bold text-amber-600 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" /> CHƯA KẾT NỐI
                </div>
              )}
              <span className="text-[10px] text-slate-400 block">
                {tiktokStatus?.connected ? `Shop: ${tiktokStatus.shopName || tiktokStatus.shopId}` : "Không có shop nào đang kết nối"}
              </span>
              {isCeo && (
                <div className="pt-2">
                  {tiktokStatus?.connected ? (
                    <button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
                    >
                      <Unlink className="w-3.5 h-3.5" /> {disconnecting ? "Đang ngắt..." : "Ngắt Kết Nối"}
                    </button>
                  ) : (
                    <button
                      onClick={handleConnect}
                      disabled={connecting || !tiktokStatus?.configured}
                      className="text-[11px] font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 disabled:text-slate-300"
                    >
                      <Link2 className="w-3.5 h-3.5" /> {connecting ? "Đang chuyển hướng..." : "Kết Nối TikTok Shop"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-slate-400 font-medium block">Webhook Endpoint</span>
              <div className="text-sm font-bold text-indigo-600 flex items-center gap-1.5">
                <Activity className="w-4 h-4" /> /api/tiktok/webhook
              </div>
              <span className="text-[10px] text-slate-400">
                Đăng ký URL này trong TikTok Shop Partner Center để nhận sự kiện live/order thật
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-slate-400 font-medium block">Access Token Hết Hạn</span>
              <div className="text-sm font-bold text-slate-900">
                {tiktokStatus?.accessTokenExpiresAt ? new Date(tiktokStatus.accessTokenExpiresAt).toLocaleString("vi-VN") : "—"}
              </div>
              <span className="text-[10px] text-slate-400">
                {tiktokStatus?.scope ? `Scope: ${tiktokStatus.scope}` : "Chưa có phiên OAuth nào"}
              </span>
            </div>
          </div>

          {/* Webhook Event Log — dữ liệu thật từ bảng tiktok_webhook_events, không giả lập */}
          <div className="bg-slate-950 text-white p-6 rounded-2xl font-mono text-xs space-y-4 shadow-xl border border-slate-800">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${tiktokStatus?.connected ? "bg-emerald-400 animate-ping" : "bg-slate-600"}`}></span>
                <span className="font-bold text-emerald-400">Webhook Event Log (Thật)</span>
              </div>
              <button
                onClick={onRefreshTikTokStatus}
                className="bg-slate-800 hover:bg-slate-700 text-white font-sans text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Làm Mới
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {webhookEvents.length === 0 ? (
                <p className="text-slate-500">
                  Chưa nhận sự kiện webhook nào{tiktokStatus?.connected ? " — chờ TikTok Shop gửi event." : " — cần kết nối TikTok Shop trước."}
                </p>
              ) : (
                webhookEvents.map((event) => (
                  <p key={event.id} className="text-slate-300 hover:text-white transition-colors">
                    [{new Date(event.receivedAt).toLocaleString("vi-VN")}] EVENT: {event.eventType} | Shop: {event.shopId || "—"}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rules Engine View */}
      {activeTab === "rules" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Tự Động Hóa Workflow Vận Hành ({workflowRules.length} Quy Tắc)</h3>
              <p className="text-xs text-slate-500">Giảm thiểu thao tác thủ công của nhân sự bằng các quy tắc tự động</p>
            </div>
            <button
              onClick={openAddModal}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
            >
              <Plus className="w-4 h-4" /> Thêm Quy Tắc Mới
            </button>
          </div>

          <div className="space-y-3">
            {workflowRules.map((rule) => (
              <div key={rule.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-4 hover:border-purple-300 transition-all">
                <div className="space-y-1 max-w-2xl">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    {rule.name}
                    {rule.enabled ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded">Active</span>
                    ) : (
                      <span className="bg-slate-200 text-slate-600 text-[9px] font-bold px-2 py-0.5 rounded">Off</span>
                    )}
                  </h4>
                  <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2 font-mono">
                    <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold">TRIGGER: {rule.trigger}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">ACTION: {rule.action}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-400 mr-2">Đã chạy: {rule.executionsCount} lần</span>
                  <button
                    onClick={() => handleToggleRule(rule)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      rule.enabled ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-700"
                    }`}
                  >
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => openEditModal(rule)}
                    className="p-1.5 text-slate-400 hover:text-purple-600 rounded transition-all"
                    title="Chỉnh sửa quy tắc"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id, rule.name)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-all"
                    title="Xóa quy tắc"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSV / Excel Fallback Parser */}
      {activeTab === "csv_import" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Nhập Báo Cáo TikTok Compass Bằng File Excel / CSV
          </h3>
          <p className="text-xs text-slate-500">
            Dành cho các tài khoản Shop chưa mở quyền OAuth API. Kéo thả file Excel xuất từ Seller Center để AI parse dữ liệu tự động.
          </p>

          <div className="border-2 border-dashed border-purple-300 bg-purple-50/50 p-8 rounded-2xl text-center space-y-3 cursor-pointer hover:bg-purple-50 transition-all">
            <FileSpreadsheet className="w-10 h-10 text-purple-600 mx-auto" />
            <div>
              <p className="font-bold text-slate-900 text-sm">Kéo & Thả File Excel TikTok Live Report vào đây</p>
              <p className="text-xs text-slate-500 mt-1">Hỗ trợ định dạng .xlsx, .csv từ Compass Live Analytics</p>
            </div>
            <button className="bg-purple-600 text-white font-bold px-4 py-2 rounded-xl text-xs shadow hover:bg-purple-500 transition-all">
              Chọn File Từ Máy Tính
            </button>
          </div>
        </div>
      )}

      {/* Rule Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" />
                {editingRule ? `Chỉnh Sửa Quy Tắc: ${editingRule.name}` : "Thêm Quy Tắc Tự Động Hóa Mới"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tên Quy Tắc Automation *</label>
                <input
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="VD: Auto Pin Voucher 100k Khi View > 2000"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Sự Kiện Kích Hoạt (Trigger Event)</label>
                <input
                  type="text"
                  required
                  value={ruleTrigger}
                  onChange={(e) => setRuleTrigger(e.target.value)}
                  placeholder="VD: tiktok.orders.created_per_min > 50"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Hành Động Tự Động Thực Thi (Action)</label>
                <input
                  type="text"
                  required
                  value={ruleAction}
                  onChange={(e) => setRuleAction(e.target.value)}
                  placeholder="VD: Gửi alert Telegram & Đổi Banner Studio"
                  className="w-full p-2.5 border border-slate-200 rounded-xl font-semibold text-slate-800"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="ruleEnabledCheckbox"
                  checked={ruleEnabled}
                  onChange={(e) => setRuleEnabled(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <label htmlFor="ruleEnabledCheckbox" className="font-bold text-slate-700 cursor-pointer">
                  Kích Hoạt Quy Tắc Này (Enabled)
                </label>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition-all"
                >
                  {editingRule ? "Cập Nhật Quy Tắc" : "Lưu Quy Tắc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
