import React, { useEffect, useMemo, useState } from "react";
import { BrainCircuit, RefreshCw, RotateCcw, Save, ShieldAlert, CheckCircle2 } from "lucide-react";
import { AiAgentPrompt } from "../types";

interface AiTrainingCenterProps {
  prompts: AiAgentPrompt[];
  loading: boolean;
  error: string | null;
  onUpdate: (agentKey: string, systemPrompt: string) => Promise<void>;
}

export const AiTrainingCenter: React.FC<AiTrainingCenterProps> = ({ prompts, loading, error, onUpdate }) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Seed local edit drafts from fetched prompts — only fills keys not already being edited,
  // so an in-progress edit isn't clobbered by a background refetch.
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      prompts.forEach((p) => {
        if (!(p.agentKey in next)) next[p.agentKey] = p.systemPrompt;
      });
      return next;
    });
  }, [prompts]);

  const groupedByCategory = useMemo<Record<string, AiAgentPrompt[]>>(() => {
    const groups: Record<string, AiAgentPrompt[]> = {};
    prompts.forEach((p) => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [prompts]);

  const handleSave = async (agentKey: string) => {
    const draft = drafts[agentKey];
    if (!draft || !draft.trim()) return;
    setSavingKey(agentKey);
    try {
      await onUpdate(agentKey, draft);
      setSavedKey(agentKey);
      setTimeout(() => setSavedKey((k) => (k === agentKey ? null : k)), 2000);
    } catch (e: any) {
      window.alert(`Không thể lưu system prompt: ${e.message ?? e}`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleResetDraft = (p: AiAgentPrompt) => {
    setDrafts((prev) => ({ ...prev, [p.agentKey]: p.defaultPrompt }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl space-y-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-rose-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
            <BrainCircuit className="w-4 h-4 text-rose-400" /> Độc Quyền Admin
          </span>
          <h2 className="text-2xl font-black">AI Training Center</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Cấu hình system prompt riêng cho từng AI Agent thật đang chạy trong hệ thống. Chỉ tài khoản Admin thấy và sửa được tab này.
          </p>
        </div>
        <div className="flex-shrink-0 bg-rose-950/85 border border-rose-500/40 rounded-xl px-3.5 py-2 text-right">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{prompts.length} Agent</span>
          </div>
          <p className="text-[10px] text-rose-400">Thay đổi có hiệu lực ngay ở lần gọi AI tiếp theo</p>
        </div>
      </div>

      {loading && (
        <div className="bg-[var(--surface)] p-8 rounded-2xl border border-[var(--border)] text-center text-[var(--text-muted)] text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Đang tải danh sách AI Agent...
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-950/80 border border-red-800/50 text-red-300 p-6 rounded-2xl text-sm flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Không tải được AI Training Center.</p>
            <p className="text-xs mt-1">{error}</p>
            <p className="text-xs mt-1 text-red-400">
              Có thể migration <code>0011_admin_role.sql</code>/<code>0012_admin_ai_training_setup.sql</code> chưa được áp dụng lên Supabase, hoặc tài khoản này chưa có role <code>admin</code>.
            </p>
          </div>
        </div>
      )}

      {!loading && !error && prompts.length === 0 && (
        <div className="bg-[var(--surface)] p-8 rounded-2xl border border-[var(--border)] text-center text-[var(--text-muted)] text-sm">
          Chưa có Agent nào được seed trong <code>ai_agent_prompts</code>.
        </div>
      )}

      {!loading &&
        !error &&
        Object.entries(groupedByCategory).map(([category, agents]: [string, AiAgentPrompt[]]) => (
          <div key={category} className="space-y-3">
            <h3 className="font-bold text-[var(--text)] text-sm uppercase tracking-wider border-b border-[var(--border)] pb-2">
              {category}
            </h3>
            <div className="grid lg:grid-cols-2 gap-4">
              {agents.map((p) => {
                const draft = drafts[p.agentKey] ?? p.systemPrompt;
                const isDirty = draft !== p.systemPrompt;
                const isDefault = draft === p.defaultPrompt;
                return (
                  <div key={p.agentKey} className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-sm space-y-3">
                    <div>
                      <h4 className="font-black text-[var(--text)] text-sm">{p.name}</h4>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{p.description}</p>
                    </div>
                    <textarea
                      value={draft}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [p.agentKey]: e.target.value }))}
                      rows={6}
                      className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium text-xs leading-relaxed"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleResetDraft(p)}
                        disabled={isDefault}
                        className="text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Khôi Phục Mặc Định
                      </button>
                      <button
                        onClick={() => handleSave(p.agentKey)}
                        disabled={!isDirty || savingKey === p.agentKey}
                        className="bg-rose-600 hover:bg-rose-500 disabled:bg-[var(--text-muted)] disabled:cursor-not-allowed text-white font-bold px-3.5 py-1.5 rounded-xl text-[11px] flex items-center gap-1.5 transition-all"
                      >
                        {savingKey === p.agentKey ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang lưu...
                          </>
                        ) : savedKey === p.agentKey ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Đã lưu
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" /> Lưu
                          </>
                        )}
                      </button>
                    </div>
                    {p.updatedAt && (
                      <p className="text-[10px] text-[var(--text-muted)]">Sửa lần cuối: {new Date(p.updatedAt).toLocaleString("vi-VN")}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
};
