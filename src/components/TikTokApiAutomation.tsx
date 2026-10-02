import React, { useState } from "react";
import { TikTokConnectionStatus, TikTokWebhookEvent } from "../types";
import { getTikTokAuthorizeUrl, disconnectTikTok } from "../lib/db/tiktokIntegration";
import { Server, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Link2, Unlink, Activity } from "lucide-react";
import { errorMessage } from "../lib/errorMessage";
import { useConfirm } from "../hooks/useConfirm";
import { PageHeader } from "./common/PageHeader";

// Tab "Visual Workflow Automation Rules" đã gỡ 2026-10-02: chỉ lưu chữ mô tả trigger/action vào bảng
// `workflow_rules`, không có engine nào thực thi — nhưng UI vẫn in "Đã chạy: N lần" và nút "Enabled",
// tức hứa một tự động hoá không tồn tại. Cần lại thì dựng cùng với phần thực thi thật.
interface TikTokApiAutomationProps {
  currentRole: string;
  tiktokStatus: TikTokConnectionStatus | null;
  tiktokStatusLoading: boolean;
  tiktokStatusError: string | null;
  webhookEvents: TikTokWebhookEvent[];
  onRefreshTikTokStatus: () => void;
}

export const TikTokApiAutomation: React.FC<TikTokApiAutomationProps> = ({
  currentRole,
  tiktokStatus,
  tiktokStatusLoading,
  tiktokStatusError,
  webhookEvents,
  onRefreshTikTokStatus
}) => {
  const confirm = useConfirm();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isCeo = currentRole === "ceo" || currentRole === "admin";

  const handleConnect = async () => {
    setActionError(null);
    setConnecting(true);
    try {
      const url = await getTikTokAuthorizeUrl();
      window.location.href = url;
    } catch (err) {
      setActionError(errorMessage(err, "Không thể kết nối TikTok Shop."));
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!tiktokStatus?.shopId) return;
    if (!(await confirm("Ngắt kết nối TikTok Shop hiện tại? Mọi webhook sẽ ngừng nhận sự kiện.", { danger: true }))) return;
    setActionError(null);
    setDisconnecting(true);
    try {
      await disconnectTikTok(tiktokStatus.shopId);
      onRefreshTikTokStatus();
    } catch (err) {
      setActionError(errorMessage(err, "Không thể ngắt kết nối TikTok Shop."));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Server}
        title="TikTok API"
        description="Trạng thái kết nối TikTok Shop Partner API và nhật ký webhook nhận về."
      />

      {actionError && (
        <div className="bg-red-950/80 border border-red-800/50 text-red-400 text-xs font-semibold p-3 rounded-xl">
          {actionError}
        </div>
      )}
      {tiktokStatusError && (
        <div className="bg-red-950/80 border border-red-800/50 text-red-400 text-xs font-semibold p-3 rounded-xl">
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
          <span className="text-[11px] text-[var(--text-muted)] block">
            {tiktokStatus?.connected ? `Shop: ${tiktokStatus.shopName || tiktokStatus.shopId}` : "Không có shop nào đang kết nối"}
          </span>
          {isCeo && (
            <div className="pt-2">
              {tiktokStatus?.connected ? (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="min-h-6 -mx-1.5 px-1.5 rounded text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <Unlink className="w-3.5 h-3.5" /> {disconnecting ? "Đang ngắt..." : "Ngắt Kết Nối"}
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={connecting || !tiktokStatus?.configured}
                  className="min-h-6 -mx-1.5 px-1.5 rounded text-[11px] font-bold text-[var(--accent-text)] hover:opacity-80 flex items-center gap-1 disabled:text-[var(--text-muted)]"
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
          <span className="text-[11px] text-[var(--text-muted)]">
            Đăng ký URL này trong TikTok Shop Partner Center để nhận sự kiện live/order thật
          </span>
        </div>

        <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-1">
          <span className="text-[var(--text-muted)] font-medium block">Access Token Hết Hạn</span>
          <div className="text-sm font-bold text-[var(--text)]">
            {tiktokStatus?.accessTokenExpiresAt ? new Date(tiktokStatus.accessTokenExpiresAt).toLocaleString("vi-VN") : "—"}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
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
  );
};
