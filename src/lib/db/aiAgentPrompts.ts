import { authedFetch } from "../authedFetch";
import { AiAgentPrompt } from "../../types";

// `ai_agent_prompts` has NO RLS policy usable by anon/authenticated except role 'admin'
// (see 0012_admin_ai_training_setup.sql) — but even for admin we go through the server
// (service_role) rather than the anon client, matching the pattern of other admin-only
// surfaces (`users.ts` invite/delete, `tiktokIntegration.ts` status/connect).

interface DbAiAgentPrompt {
  agent_key: string;
  name: string;
  description: string;
  category: string;
  system_prompt: string;
  default_prompt: string;
  updated_by: string | null;
  updated_at: string | null;
}

function fromDb(row: DbAiAgentPrompt): AiAgentPrompt {
  return {
    agentKey: row.agent_key,
    name: row.name,
    description: row.description,
    category: row.category,
    systemPrompt: row.system_prompt,
    defaultPrompt: row.default_prompt,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  };
}

export async function fetchAiAgentPrompts(): Promise<AiAgentPrompt[]> {
  const res = await authedFetch("/api/admin/ai-agent-prompts");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Không thể tải danh sách AI Agent Prompts.");
  }
  const body = await res.json();
  return (body.prompts as DbAiAgentPrompt[]).map(fromDb);
}

export async function updateAiAgentPrompt(agentKey: string, systemPrompt: string): Promise<AiAgentPrompt> {
  const res = await authedFetch(`/api/admin/ai-agent-prompts/${encodeURIComponent(agentKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Không thể cập nhật system prompt.");
  }
  const body = await res.json();
  return fromDb(body.prompt as DbAiAgentPrompt);
}
