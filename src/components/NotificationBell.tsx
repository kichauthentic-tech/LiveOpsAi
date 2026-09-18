import React, { useState } from "react";
import { Bell, Check, CalendarPlus, UserMinus, Clock, XCircle, Scale } from "lucide-react";
import { AppNotification, AppNotificationKind } from "../types";

interface Props {
  items: AppNotification[];
  unreadCount: number;
  onMarkRead: (ids?: string[]) => void;
  // Bấm vào 1 thông báo: đánh dấu đọc rồi nhảy tới màn liên quan (App quyết định tab nào).
  onOpen: (n: AppNotification) => void;
}

const ICON: Record<AppNotificationKind, React.ComponentType<{ className?: string }>> = {
  shift_assigned: CalendarPlus,
  shift_unassigned: UserMinus,
  shift_time_changed: Clock,
  shift_cancelled: XCircle,
  report_reconciled: Scale
};

const TONE: Record<AppNotificationKind, string> = {
  shift_assigned: "text-emerald-400",
  shift_unassigned: "text-amber-400",
  shift_time_changed: "text-sky-400",
  shift_cancelled: "text-red-400",
  report_reconciled: "text-violet-400"
};

// "5 phút trước" / "2 giờ trước" / "18/09" — chuông cần cảm giác mới/cũ hơn là dấu thời gian đủ.
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = new Date(iso);
  return `${`${d.getDate()}`.padStart(2, "0")}/${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

export const NotificationBell: React.FC<Props> = ({ items, unreadCount, onMarkRead, onOpen }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/80 hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all"
        title="Thông báo"
        aria-label={unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : "Thông báo"}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
              <span className="text-xs font-bold text-[var(--text)]">Thông báo</span>
              {unreadCount > 0 && (
                <button
                  onClick={() => onMarkRead()}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-text)] hover:underline"
                >
                  <Check className="w-3 h-3" /> Đánh dấu đã đọc hết
                </button>
              )}
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">Chưa có thông báo nào.</div>
              ) : (
                items.map((n) => {
                  const Icon = ICON[n.kind];
                  const unread = !n.readAt;
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        setOpen(false);
                        onOpen(n);
                      }}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-[var(--border)]/50 last:border-b-0 hover:bg-[var(--surface-elevated)]/80 transition-colors ${
                        unread ? "bg-[var(--surface-elevated)]/40" : ""
                      }`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${TONE[n.kind]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${unread ? "font-bold text-[var(--text)]" : "font-semibold text-[var(--text-muted)]"}`}>
                            {n.title}
                          </span>
                          {unread && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-0.5 break-words">{n.body}</div>
                        <div className="text-[10px] text-[var(--text-muted)]/70 mt-1">{relTime(n.createdAt)}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
