import React, { useMemo, useState } from "react";
import { LiveSession, LiveStreamIncident, UserRole } from "../types";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";

interface LiveStreamIncidentLogProps {
  currentRole: UserRole;
  sessions: LiveSession[];
  incidents: LiveStreamIncident[];
  onAddIncident: (incident: {
    sessionId: string;
    category: LiveStreamIncident["category"];
    severity: LiveStreamIncident["severity"];
    description: string;
  }) => Promise<void>;
  onUpdateIncident: (
    id: string,
    patch: Partial<Pick<LiveStreamIncident, "category" | "severity" | "description" | "resolution" | "status">>
  ) => Promise<void>;
  onDeleteIncident: (id: string) => Promise<void>;
}

const CATEGORY_LABEL: Record<LiveStreamIncident["category"], string> = {
  network_drop: "Rớt mạng",
  cart_locked: "Khoá giỏ hàng",
  host_late: "Host trễ",
  voucher_exhausted: "Hết voucher",
  other: "Khác"
};

const SEVERITY_LABEL: Record<LiveStreamIncident["severity"], string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  critical: "Nghiêm trọng"
};

const SEVERITY_COLOR: Record<LiveStreamIncident["severity"], string> = {
  low: "text-slate-400",
  medium: "text-amber-400",
  high: "text-orange-400",
  critical: "text-red-400"
};

const STATUS_LABEL: Record<LiveStreamIncident["status"], string> = {
  open: "Đang mở",
  resolved: "Đã xử lý"
};

export const LiveStreamIncidentLog: React.FC<LiveStreamIncidentLogProps> = ({
  currentRole,
  sessions,
  incidents,
  onAddIncident,
  onUpdateIncident,
  onDeleteIncident
}) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [busy, setBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [newSessionId, setNewSessionId] = useState("");
  const [newCategory, setNewCategory] = useState<LiveStreamIncident["category"]>("network_drop");
  const [newSeverity, setNewSeverity] = useState<LiveStreamIncident["severity"]>("medium");
  const [newDescription, setNewDescription] = useState("");

  const sessionLabel = (id: string) => {
    const s = sessions.find((x) => x.id === id);
    return s ? `${s.title} (${s.date})` : "—";
  };

  const openCount = useMemo(() => incidents.filter((i) => i.status === "open").length, [incidents]);

  const filtered = useMemo(
    () => incidents.filter((i) => !filterStatus || i.status === filterStatus),
    [incidents, filterStatus]
  );

  const handleCreate = async () => {
    if (!newSessionId || !newDescription.trim()) return;
    setBusy(true);
    try {
      await onAddIncident({
        sessionId: newSessionId,
        category: newCategory,
        severity: newSeverity,
        description: newDescription.trim()
      });
      setNewSessionId("");
      setNewCategory("network_drop");
      setNewSeverity("medium");
      setNewDescription("");
    } finally {
      setBusy(false);
    }
  };

  const handlePatch = async (
    id: string,
    patch: Partial<Pick<LiveStreamIncident, "category" | "severity" | "description" | "resolution" | "status">>
  ) => {
    setBusy(true);
    try {
      await onUpdateIncident(id, patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-400" /> Live Stream Incident Log
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-orange-400">{openCount} sự cố đang mở</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">Tất cả trạng thái</option>
            {(Object.keys(STATUS_LABEL) as LiveStreamIncident["status"][]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canEdit && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <select
            value={newSessionId}
            onChange={(e) => setNewSessionId(e.target.value)}
            className="flex-1 min-w-[180px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">Chọn Live Session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.date})
              </option>
            ))}
          </select>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as LiveStreamIncident["category"])}
            className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            {(Object.keys(CATEGORY_LABEL) as LiveStreamIncident["category"][]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <select
            value={newSeverity}
            onChange={(e) => setNewSeverity(e.target.value as LiveStreamIncident["severity"])}
            className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            {(Object.keys(SEVERITY_LABEL) as LiveStreamIncident["severity"][]).map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Mô tả sự cố"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="flex-1 min-w-[160px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={busy || !newSessionId || !newDescription.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Ghi nhận sự cố
          </button>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2.5 px-4">Session</th>
                <th className="py-2.5 px-2">Loại sự cố</th>
                <th className="py-2.5 px-2">Mức độ</th>
                <th className="py-2.5 px-2">Mô tả</th>
                <th className="py-2.5 px-2">Xử lý khắc phục</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                {canEdit && <th className="py-2.5 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-b border-slate-800/60 align-middle">
                  <td className="py-2.5 px-4 text-slate-300">{sessionLabel(i.sessionId)}</td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <select
                        value={i.category}
                        onChange={(e) => handlePatch(i.id, { category: e.target.value as LiveStreamIncident["category"] })}
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                      >
                        {(Object.keys(CATEGORY_LABEL) as LiveStreamIncident["category"][]).map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-300">{CATEGORY_LABEL[i.category]}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <select
                        value={i.severity}
                        onChange={(e) => handlePatch(i.id, { severity: e.target.value as LiveStreamIncident["severity"] })}
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                      >
                        {(Object.keys(SEVERITY_LABEL) as LiveStreamIncident["severity"][]).map((s) => (
                          <option key={s} value={s}>
                            {SEVERITY_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`font-bold ${SEVERITY_COLOR[i.severity]}`}>{SEVERITY_LABEL[i.severity]}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-slate-300 max-w-[200px]">{i.description}</td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <input
                        type="text"
                        defaultValue={i.resolution}
                        placeholder="Chưa có ghi chú"
                        onBlur={(e) => handlePatch(i.id, { resolution: e.target.value })}
                        className="w-40 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
                      />
                    ) : (
                      <span className="text-slate-400">{i.resolution || "—"}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <select
                        value={i.status}
                        onChange={(e) => handlePatch(i.id, { status: e.target.value as LiveStreamIncident["status"] })}
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                      >
                        {(Object.keys(STATUS_LABEL) as LiveStreamIncident["status"][]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={i.status === "open" ? "text-orange-400 font-bold" : "text-emerald-400 font-bold"}>
                        {STATUS_LABEL[i.status]}
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => onDeleteIncident(i.id)}
                        className="text-red-400 hover:bg-red-950/40 p-1 rounded-lg"
                        title="Xoá sự cố"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="py-8 text-center text-slate-500 italic">
                    Chưa có sự cố nào được ghi nhận.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
