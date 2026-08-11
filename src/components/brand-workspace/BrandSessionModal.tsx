import React, { useState, useEffect } from "react";
import { LiveSession, ShiftSlot, Studio, Talent, SystemUser } from "../../types";
import { CalendarIcon, X, AlertTriangle } from "lucide-react";

interface BrandSessionModalProps {
  brandId: string;
  brandName: string;
  studios: Studio[];
  talents: Talent[];
  moderators: SystemUser[];
  sessions: LiveSession[]; // agency-wide — để check trùng lịch xuyên brand
  existingSession: LiveSession | null; // null = tạo mới, có giá trị = sửa
  initialDate?: string;
  currentUserId?: string;
  onClose: () => void;
  onAddSession: (s: LiveSession) => Promise<boolean>;
  onUpdateSession: (s: LiveSession) => Promise<boolean>;
  onCreateSlot: (s: ShiftSlot) => Promise<boolean>;
}

export const BrandSessionModal: React.FC<BrandSessionModalProps> = ({
  brandId,
  brandName,
  studios,
  talents,
  moderators,
  sessions,
  existingSession,
  initialDate,
  currentUserId,
  onClose,
  onAddSession,
  onUpdateSession,
  onCreateSlot
}) => {
  const isEdit = !!existingSession;
  const [mode, setMode] = useState<"session" | "slot">("session");
  const [title, setTitle] = useState(existingSession?.title || "");
  const [studioId, setStudioId] = useState(existingSession?.studioId || studios[0]?.id || "");
  const [hostId, setHostId] = useState(existingSession?.hostId || talents[0]?.id || "");
  const [coHostId, setCoHostId] = useState(existingSession?.coHostId || "");
  const [assistantId, setAssistantId] = useState(existingSession?.assistantId || "");
  const [date, setDate] = useState(existingSession?.date || initialDate || "");
  const [startTime, setStartTime] = useState(existingSession?.startTime || "14:00");
  const [endTime, setEndTime] = useState(existingSession?.endTime || "17:00");
  const [targetGmv, setTargetGmv] = useState(existingSession?.targetGmv || 100000000);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit && !studioId && studios[0]) setStudioId(studios[0].id);
  }, [studios, isEdit, studioId]);
  useEffect(() => {
    if (!isEdit && !hostId && talents[0]) setHostId(talents[0].id);
  }, [talents, isEdit, hostId]);

  const conflicts = (() => {
    const result = { studio: "", host: "" };
    sessions.forEach((s) => {
      if (existingSession && s.id === existingSession.id) return;
      if (s.date !== date || s.status === "Cancelled") return;
      if (s.startTime < endTime && s.endTime > startTime) {
        if (s.studioId === studioId) result.studio = `${s.title} (${s.brandName})`;
        if (s.hostId === hostId) result.host = `${s.hostName} — ${s.title} (${s.brandName})`;
      }
    });
    return result;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const studioObj = studios.find((s) => s.id === studioId);

    if (!isEdit && mode === "slot") {
      const slot: ShiftSlot = {
        id: `slot-${Date.now()}`,
        date,
        startTime,
        endTime,
        brandId,
        brandName,
        platform: "TikTok",
        studioId: studioId || undefined,
        studioName: studioObj?.name || "",
        notes: title,
        status: "open",
        createdBy: currentUserId
      };
      setSaving(true);
      const ok = await onCreateSlot(slot);
      setSaving(false);
      if (ok) onClose();
      return;
    }

    const hostObj = talents.find((t) => t.id === hostId);
    const coHostObj = talents.find((t) => t.id === coHostId);
    const assistantObj = moderators.find((m) => m.id === assistantId);

    if (isEdit && existingSession) {
      const updated: LiveSession = {
        ...existingSession,
        title,
        studioId,
        studioName: studioObj?.name || existingSession.studioName,
        hostId,
        hostName: hostObj?.name || existingSession.hostName,
        coHostId: coHostId || undefined,
        coHostName: coHostObj?.name || "",
        assistantId: assistantId || undefined,
        assistantName: assistantObj?.name || "Chưa gán Trợ Lý",
        date,
        startTime,
        endTime,
        targetGmv: Number(targetGmv)
      };
      setSaving(true);
      const ok = await onUpdateSession(updated);
      setSaving(false);
      if (ok) onClose();
      return;
    }

    const created: LiveSession = {
      id: `session-${Date.now()}`,
      title: title || `Phiên Live ${brandName} - ${startTime}`,
      brandId,
      brandName,
      shopTikTokHandle: `@${brandName.toLowerCase().replace(/\s+/g, "")}_official`,
      studioId,
      studioName: studioObj?.name || "",
      hostId,
      hostName: hostObj?.name || "",
      assistantId: assistantId || undefined,
      assistantName: assistantObj?.name || "Chưa gán Trợ Lý",
      coHostId: coHostId || undefined,
      coHostName: coHostObj?.name || "",
      platform: "TikTok",
      date,
      startTime,
      endTime,
      status: "Upcoming",
      targetGmv: Number(targetGmv),
      actualGmv: 0,
      totalOrders: 0,
      avgWatchTimeSeconds: 0,
      peakViewers: 0,
      totalViews: 0,
      ctrAvg: 0,
      cvrAvg: 0,
      skus: [],
      checklist: [],
      minuteMetrics: []
    };
    setSaving(true);
    const ok = await onAddSession(created);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[92vh]">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white text-base">{isEdit ? "Sửa Phiên Live" : "Đặt Lịch Phiên Live Mới"}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isEdit && (
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode("session")}
              className={`flex-1 px-3 py-2 rounded-lg transition-all ${mode === "session" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Tạo Trực Tiếp (đã có Host)
            </button>
            <button
              type="button"
              onClick={() => setMode("slot")}
              className={`flex-1 px-3 py-2 rounded-lg transition-all ${mode === "slot" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Mở Ca Chờ Đăng Ký
            </button>
          </div>
        )}
        {!isEdit && mode === "slot" && (
          <p className="text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
            Ca sẽ hiện ở "Đăng Ký & Chốt Lịch" bên Agency để host tự đăng ký, Ops chốt Host chính thức sau.
          </p>
        )}

        {(conflicts.studio || conflicts.host) && (
          <div className="p-3 bg-rose-950/80 border border-rose-700/80 rounded-xl text-[11px] space-y-1 text-rose-200 font-medium">
            <div className="flex items-center gap-1.5 font-bold text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0" /> XUNG ĐỘT LỊCH (xuyên toàn agency):
            </div>
            {conflicts.studio && <p>• Trùng Studio: {conflicts.studio}</p>}
            {conflicts.host && <p>• Trùng Host: {conflicts.host}</p>}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-300 block mb-1">Tiêu Đề Phiên Live:</label>
            <input
              type="text"
              required
              placeholder={`Ví dụ: Live ${brandName} Flash Sale`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-blue-500 font-medium"
            />
          </div>

          <div>
            <label className="font-bold text-slate-300 block mb-1">Phòng Studio:</label>
            <select
              value={studioId}
              onChange={(e) => setStudioId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-blue-500 font-medium"
            >
              {studios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {(isEdit || mode === "session") && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Host Chính:</label>
                <select
                  value={hostId}
                  onChange={(e) => setHostId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-blue-500 font-medium"
                >
                  {talents.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-300 block mb-1">Co-Host (tuỳ chọn):</label>
                <select
                  value={coHostId}
                  onChange={(e) => setCoHostId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">-- Không có --</option>
                  {talents.filter((t) => t.id !== hostId).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-bold text-slate-300 block mb-1">Ngày:</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="font-bold text-slate-300 block mb-1">Giờ bắt đầu:</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="font-bold text-slate-300 block mb-1">Giờ kết thúc:</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          {(isEdit || mode === "session") && (
            <div>
              <label className="font-bold text-slate-300 block mb-1">KPI Target GMV (VNĐ):</label>
              <input
                type="number"
                value={targetGmv}
                onChange={(e) => setTargetGmv(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold">
              Hủy Bỏ
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold shadow-lg shadow-blue-600/30">
              {saving ? "Đang lưu..." : isEdit ? "Lưu Thay Đổi" : "Xác Nhận"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
