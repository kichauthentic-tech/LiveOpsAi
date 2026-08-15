import React, { useState, useMemo } from "react";
import { LiveSession } from "../types";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  Bell,
  X,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Radio,
  Filter,
  Send,
  SlidersHorizontal,
  Info
} from "lucide-react";

interface PerformanceDeviationAlertsProps {
  sessions: LiveSession[];
  onSelectSession: (session: LiveSession) => void;
  isCompact?: boolean;
}

export interface SessionDeviationInfo {
  session: LiveSession;
  deviationPercent: number;
  type: "surge" | "lag"; // >20% or <-20%
  diffAmount: number;
  recommendations: string[];
}

export const PerformanceDeviationAlerts: React.FC<PerformanceDeviationAlertsProps> = ({
  sessions,
  onSelectSession,
  isCompact = false
}) => {
  const [filterType, setFilterType] = useState<"all" | "surge" | "lag">("all");
  const [notifiedSessionIds, setNotifiedSessionIds] = useState<string[]>([]);
  const [dismissedSessionIds, setDismissedSessionIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Calculate deviation for each session with actual GMV & target GMV
  const deviationData = useMemo(() => {
    const list: SessionDeviationInfo[] = [];

    sessions.forEach((s) => {
      // Ignore dismissed
      if (dismissedSessionIds.includes(s.id)) return;

      // Calculate deviation against target
      if (s.targetGmv > 0 && (s.actualGmv > 0 || s.status === "Live Now")) {
        const diff = s.actualGmv - s.targetGmv;
        const devPct = (diff / s.targetGmv) * 100;

        if (devPct >= 20) {
          list.push({
            session: s,
            deviationPercent: Math.round(devPct * 10) / 10,
            type: "surge",
            diffAmount: diff,
            recommendations: [
              "Gia hạn thời lượng phiên live thêm 60 phút để tận dụng luồng mắt xem peak",
              "Bổ sung ngân sách TikTok Live Ads (+2,000,000đ) để tiếp tục đẩy xu hướng",
              "Chuyển Host sang giới thiệu các Combo SKU giá trị cao (AOV Boost)"
            ]
          });
        } else if (devPct <= -20) {
          list.push({
            session: s,
            deviationPercent: Math.round(devPct * 10) / 10,
            type: "lag",
            diffAmount: Math.abs(diff),
            recommendations: [
              "Tung khẩn cấp Voucher Flash Sale 50,000đ giảm giá trực tiếp",
              "Yêu cầu Host đổi kịch bản chốt đơn: Tập trung ghim SKU Best-seller giá cực sốc",
              "Bật nhạc nền sôi động và đổi góc camera cận cảnh thị phạm sản phẩm"
            ]
          });
        }
      }
    });

    return list.sort((a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent));
  }, [sessions, dismissedSessionIds]);

  const filteredList = useMemo(() => {
    if (filterType === "surge") return deviationData.filter((d) => d.type === "surge");
    if (filterType === "lag") return deviationData.filter((d) => d.type === "lag");
    return deviationData;
  }, [deviationData, filterType]);

  const surgeCount = deviationData.filter((d) => d.type === "surge").length;
  const lagCount = deviationData.filter((d) => d.type === "lag").length;

  const handleAcknowledgeAlert = (sessionId: string, sessionTitle: string) => {
    setToastMessage(`Đã đánh dấu đã báo Ops cho phiên "${sessionTitle}"`);
    setNotifiedSessionIds((prev) => (prev.includes(sessionId) ? prev : [...prev, sessionId]));
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleDismissAlert = (sessionId: string) => {
    setDismissedSessionIds((prev) => [...prev, sessionId]);
  };

  if (deviationData.length === 0) {
    return (
      <div className="bg-emerald-950/80 border border-emerald-500/30 p-4 rounded-2xl flex items-center justify-between text-xs text-emerald-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>
            <strong>Hệ Thống Giám Sát Hiệu Suất (Performance Monitor):</strong> Tất cả {sessions.length} phiên livestream đang vận hành ổn định trong biên độ an toàn (Deviation &lt; ±20%).
          </span>
        </div>
        <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">
          All Normal
        </span>
      </div>
    );
  }

  if (isCompact) {
    return (
      <div className="bg-amber-950/80 border border-amber-500/50 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
          <span className="font-bold text-amber-200">
            Phát hiện {deviationData.length} phiên live lệch xu hướng &gt; 20%:
          </span>
          <div className="flex items-center gap-1.5 font-extrabold text-[11px]">
            {surgeCount > 0 && (
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                ⚡ {surgeCount} Vượt (+20%)
              </span>
            )}
            {lagCount > 0 && (
              <span className="bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-md">
                🚨 {lagCount} Cảnh báo sụt (-20%)
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => onSelectSession(deviationData[0].session)}
          className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-black px-3 py-1.5 rounded-xl text-xs transition-all shadow flex items-center gap-1"
        >
          Xem Cảnh Báo Khẩn →
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 text-[var(--text)] shadow-xl space-y-4">
      {/* Toast Notification Popup */}
      {toastMessage && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl text-xs font-bold shadow-lg flex justify-between items-center animate-bounce">
          <span className="flex items-center gap-2">
            <Send className="w-4 h-4" /> {toastMessage}
          </span>
          <button onClick={() => setToastMessage(null)} className="text-[var(--text)] hover:text-[var(--text)]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl relative">
            <Bell className="w-5 h-5 animate-bounce" />
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-[var(--border)]">
              {deviationData.length}
            </span>
          </div>
          <div>
            <h3 className="font-extrabold text-base text-[var(--text)] flex items-center gap-2">
              Cảnh Báo Lệch KPI GMV (&gt;20%)
            </h3>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-[var(--surface-elevated)]/80 p-1 rounded-xl text-xs border border-[var(--border)]">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${
              filterType === "all" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Tất Cả ({deviationData.length})
          </button>
          <button
            onClick={() => setFilterType("surge")}
            className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
              filterType === "surge" ? "bg-emerald-600 text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            ⚡ Vượt Chỉ Tiêu (+{surgeCount})
          </button>
          <button
            onClick={() => setFilterType("lag")}
            className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
              filterType === "lag" ? "bg-red-600 text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            🚨 Sụt Giảm (-{lagCount})
          </button>
        </div>
      </div>

      {/* List of Deviating Sessions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredList.length === 0 ? (
          <div className="col-span-1 md:col-span-2 p-8 bg-[var(--surface-base)]/50 border border-[var(--border)] rounded-xl text-center text-xs text-[var(--text-muted)] space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="font-bold text-[var(--text)]">Không có cảnh báo lệch KPI nào</p>
          </div>
        ) : (
          filteredList.map((item) => {
          const s = item.session;
          const isSurge = item.type === "surge";
          const isLive = s.status === "Live Now";

          return (
            <div
              key={s.id}
              className={`p-4 rounded-xl border transition-all space-y-3 relative overflow-hidden ${
                isSurge
                  ? "bg-emerald-950/80 border-emerald-500/40 hover:border-emerald-400"
                  : "bg-red-950/80 border-red-500/40 hover:border-red-400"
              }`}
            >
              {/* Top Row: Session Title & Deviation Badge */}
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[var(--text-muted)]">{s.brandName}</span>
                    {isLive && (
                      <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                        <Radio className="w-2.5 h-2.5" /> LIVE NOW
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-sm text-[var(--text)] line-clamp-1 mt-0.5">{s.title}</h4>
                </div>

                {/* Badge */}
                <div
                  className={`px-2.5 py-1 rounded-xl font-black text-xs shrink-0 flex items-center gap-1 border shadow ${
                    isSurge
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50"
                      : "bg-red-500/20 text-red-300 border-red-400/50"
                  }`}
                >
                  {isSurge ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  <span>{isSurge ? `+${item.deviationPercent}%` : `${item.deviationPercent}%`}</span>
                </div>
              </div>

              {/* GMV Target vs Actual Comparison */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-[var(--surface)]/80 p-2.5 rounded-lg border border-[var(--border)]">
                <div>
                  <span className="text-[var(--text-muted)] text-[10px] block">Mục tiêu Target:</span>
                  <span className="font-bold text-[var(--text)]">{(s.targetGmv / 1000000).toFixed(0)}M VNĐ</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] text-[10px] block">Thực Thu GMV:</span>
                  <span className={`font-black ${isSurge ? "text-emerald-400" : "text-red-400"}`}>
                    {(s.actualGmv / 1000000).toFixed(1)}M VNĐ ({isSurge ? "Thặng dư" : "Thiếu"}{" "}
                    {(item.diffAmount / 1000000).toFixed(1)}M)
                  </span>
                </div>
              </div>

              {/* Recommended Action Levers */}
              <div className="space-y-1.5 text-xs">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" /> Đề Xuất Xử Lý Thuật Toán:
                </span>
                <ul className="space-y-1 text-[var(--text-muted)] text-[11px]">
                  {item.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-[var(--accent-text)] font-bold">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-[var(--border)]/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => onSelectSession(s)}
                  className="text-xs font-bold text-[var(--accent-text)] hover:opacity-80 flex items-center gap-1"
                >
                  Mở Live Hub Control →
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAcknowledgeAlert(s.id, s.title)}
                    disabled={notifiedSessionIds.includes(s.id)}
                    className="p-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] disabled:opacity-50 disabled:hover:bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text)] rounded-lg transition-all text-xs flex items-center gap-1"
                    title={notifiedSessionIds.includes(s.id) ? "Đã báo Ops" : "Đánh dấu đã báo Ops"}
                  >
                    {notifiedSessionIds.includes(s.id) ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-blue-400" />
                    )}
                    <span className="hidden sm:inline text-[10px]">
                      {notifiedSessionIds.includes(s.id) ? "Đã Báo Ops" : "Alert Ops"}
                    </span>
                  </button>

                  <button
                    onClick={() => handleDismissAlert(s.id)}
                    className="p-1.5 text-[var(--text-faint)] hover:text-[var(--text-muted)] rounded-lg transition-all"
                    title="Bỏ qua cảnh báo này"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        }))}
      </div>
    </div>
  );
};
