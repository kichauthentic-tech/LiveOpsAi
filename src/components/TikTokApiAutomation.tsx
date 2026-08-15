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

  const isCeo = currentRole === "ceo" || currentRole === "admin";

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
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl space-y-2">
        <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Server className="w-4 h-4 text-[var(--accent-text)]" /> Modules 07 & 13: TikTok Open API & Automation Engine
        </span>
        <h2 className="text-2xl font-black">TikTok Open API & Tự Động Hóa Workflow Agency</h2>
      </div>

      {/* Sub Tabs */}
      <div className="flex space-x-2 text-xs font-bold border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setActiveTab("api_status")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === "api_status" ? "bg-[var(--accent)] text-white shadow" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          }`}
        >
          🔗 TikTok Shop Partner API Status & Webhooks
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === "rules" ? "bg-[var(--accent)] text-white shadow" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          }`}
        >
          ⚡ Visual Workflow Automation Rules ({workflowRules.filter(r => r.enabled).length} Enabled)
        </button>
        <button
          onClick={() => setActiveTab("csv_import")}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === "csv_import" ? "bg-[var(--accent)] text-white shadow" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          }`}
        >
          📄 Smart Compass Excel / CSV Fallback Parser
        </button>
      </div>

      {/* API Status View */}
      {activeTab === "api_status" && (
        <div className="space-y-6">
          {actionError && (
            <div className="bg-red-950/30 border border-red-800/50 text-red-400 text-xs font-semibold p-3 rounded-xl">
              {actionError}
            </div>
          )}
          {tiktokStatusError && (
            <div className="bg-red-950/30 border border-red-800/50 text-red-400 text-xs font-semibold p-3 rounded-xl">
              {tiktokStatusError}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4 text-xs">
            <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-1">
              <span className="text-[var(--text-muted)] font-medium block">TikTok OAuth App Status</span>
              {tiktokStatusLoading ? (
                <div className="text-sm font-bold text-[var(--text-muted)] flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Đang kiểm tra...
                </div>
              ) : !tiktokStatus?.configured ? (
                <div className="text-sm font-bold text-[var(--text-muted)] flex items-center gap-1.5">
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
              <span className="text-[10px] text-[var(--text-muted)] block">
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
                      className="text-[11px] font-bold text-[var(--accent-text)] hover:opacity-80 flex items-center gap-1 disabled:text-[var(--text-muted)]"
                    >
                      <Link2 className="w-3.5 h-3.5" /> {connecting ? "Đang chuyển hướng..." : "Kết Nối TikTok Shop"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-1">
              <span className="text-[var(--text-muted)] font-medium block">Webhook Endpoint</span>
              <div className="text-sm font-bold text-[var(--accent-text)] flex items-center gap-1.5">
                <Activity className="w-4 h-4" /> /api/tiktok/webhook
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                Đăng ký URL này trong TikTok Shop Partner Center để nhận sự kiện live/order thật
              </span>
            </div>

            <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-1">
              <span className="text-[var(--text-muted)] font-medium block">Access Token Hết Hạn</span>
              <div className="text-sm font-bold text-[var(--text)]">
                {tiktokStatus?.accessTokenExpiresAt ? new Date(tiktokStatus.accessTokenExpiresAt).toLocaleString("vi-VN") : "—"}
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                {tiktokStatus?.scope ? `Scope: ${tiktokStatus.scope}` : "Chưa có phiên OAuth nào"}
              </span>
            </div>
          </div>

          {/* Webhook Event Log — dữ liệu thật từ bảng tiktok_webhook_events, không giả lập */}
          <div className="bg-[var(--surface-base)] text-[var(--text)] p-6 rounded-2xl font-mono text-xs space-y-4 shadow-xl border border-[var(--border)]">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${tiktokStatus?.connected ? "bg-emerald-400 animate-ping" : "bg-[var(--text-faint)]"}`}></span>
                <span className="font-bold text-emerald-400">Webhook Event Log (Thật)</span>
              </div>
              <button
                onClick={onRefreshTikTokStatus}
                className="bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] font-sans text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Làm Mới
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {webhookEvents.length === 0 ? (
                <p className="text-[var(--text-faint)]">
                  Chưa nhận sự kiện webhook nào{tiktokStatus?.connected ? " — chờ TikTok Shop gửi event." : " — cần kết nối TikTok Shop trước."}
                </p>
              ) : (
                webhookEvents.map((event) => (
                  <p key={event.id} className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
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
        <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-[var(--text)] text-base">Tự Động Hóa Workflow Vận Hành ({workflowRules.length} Quy Tắc)</h3>
            </div>
            <button
              onClick={openAddModal}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
            >
              <Plus className="w-4 h-4" /> Thêm Quy Tắc Mới
            </button>
          </div>

          <div className="space-y-3">
            {workflowRules.map((rule) => (
              <div key={rule.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)]/40 flex flex-wrap justify-between items-center gap-4 hover:border-[var(--accent)] transition-all">
                <div className="space-y-1 max-w-2xl">
                  <h4 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
                    {rule.name}
                    {rule.enabled ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded">Active</span>
                    ) : (
                      <span className="bg-[var(--surface-hover)] text-[var(--text-muted)] text-[9px] font-bold px-2 py-0.5 rounded">Off</span>
                    )}
                  </h4>
                  <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-2 font-mono">
                    <span className="bg-[var(--accent)]/20 text-[var(--accent-text)] px-2 py-0.5 rounded font-bold">TRIGGER: {rule.trigger}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">ACTION: {rule.action}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-[var(--text-muted)] mr-2">Đã chạy: {rule.executionsCount} lần</span>
                  <button
                    onClick={() => handleToggleRule(rule)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      rule.enabled ? "bg-emerald-600 text-white" : "bg-[var(--surface-hover)] text-[var(--text-muted)]"
                    }`}
                  >
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => openEditModal(rule)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-text)] rounded transition-all"
                    title="Chỉnh sửa quy tắc"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id, rule.name)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-red-600 rounded transition-all"
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
        <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
          <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Nhập Báo Cáo TikTok Compass Bằng File Excel / CSV
            <span className="bg-amber-950/30 text-amber-400 border border-amber-800/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Sắp Ra Mắt
            </span>
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Dành cho Shop chưa mở quyền OAuth API. Tính năng đang được phát triển.
          </p>

          <div className="border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)]/40 p-8 rounded-2xl text-center space-y-3 opacity-60 cursor-not-allowed">
            <FileSpreadsheet className="w-10 h-10 text-[var(--text-muted)] mx-auto" />
            <div>
              <p className="font-bold text-[var(--text-muted)] text-sm">Kéo & Thả File Excel/CSV Compass vào đây</p>
            </div>
            <button disabled className="bg-[var(--surface-hover)] text-[var(--text-muted)] font-bold px-4 py-2 rounded-xl text-xs cursor-not-allowed">
              Chọn File Từ Máy Tính
            </button>
          </div>
        </div>
      )}

      {/* Rule Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] text-[var(--text)] w-full max-w-lg rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[var(--surface)] text-[var(--text)] px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-[var(--accent-text)]" />
                {editingRule ? `Chỉnh Sửa Quy Tắc: ${editingRule.name}` : "Thêm Quy Tắc Tự Động Hóa Mới"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Tên Quy Tắc Automation *</label>
                <input
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="VD: Auto Pin Voucher 100k Khi View > 2000"
                  className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Sự Kiện Kích Hoạt (Trigger Event)</label>
                <input
                  type="text"
                  required
                  value={ruleTrigger}
                  onChange={(e) => setRuleTrigger(e.target.value)}
                  placeholder="VD: tiktok.orders.created_per_min > 50"
                  className="w-full p-2.5 border border-[var(--border)] rounded-xl font-mono bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Hành Động Tự Động Thực Thi (Action)</label>
                <input
                  type="text"
                  required
                  value={ruleAction}
                  onChange={(e) => setRuleAction(e.target.value)}
                  placeholder="VD: Gửi alert Telegram & Đổi Banner Studio"
                  className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)]"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="ruleEnabledCheckbox"
                  checked={ruleEnabled}
                  onChange={(e) => setRuleEnabled(e.target.checked)}
                  className="w-4 h-4 text-[var(--accent)] rounded focus:ring-[var(--accent)]"
                />
                <label htmlFor="ruleEnabledCheckbox" className="font-bold text-[var(--text-muted)] cursor-pointer">
                  Kích Hoạt Quy Tắc Này (Enabled)
                </label>
              </div>

              <div className="pt-4 border-t border-[var(--border)] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)] rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl shadow transition-all"
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
