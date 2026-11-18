import React, { useState } from "react";
import { BrainCircuit } from "lucide-react";
import { PageHeader } from "./common/PageHeader";
import { SectionNav } from "./common/SectionNav";

/**
 * Khung trang AI Training (18/11): trước đó 5 khối xếp dọc một cột (prompt agent → danh bạ logic → tuân thủ luật →
 * cơ cấu làn → engine + 38 tham số) — 4 loại việc khác nhau trộn trong một trang dài. Nay mỗi tab một mục đích, chỉ
 * khối của tab đang chọn được dựng (khối nặng không tính khi không xem). Nội dung từng tab do App truyền vào.
 */
export type AiTrainingTab = "prompts" | "logic" | "check" | "engine";

const TABS: { key: AiTrainingTab; label: string; hint: string }[] = [
  { key: "prompts", label: "Prompt AI", hint: "Sửa system prompt từng AI Agent" },
  { key: "logic", label: "Logic đang chạy", hint: "Danh bạ luật app đang áp dụng" },
  { key: "check", label: "Kiểm tra lịch thật", hint: "Đo lịch đã xếp có theo luật không" },
  { key: "engine", label: "Engine & tham số", hint: "Engine học gì + vặn tham số" },
];

export const AiTrainingHub: React.FC<{ agentCount: number; panels: Record<AiTrainingTab, React.ReactNode> }> = ({ agentCount, panels }) => {
  const [tab, setTab] = useState<AiTrainingTab>("prompts");
  return (
    <div className="space-y-6">
      <PageHeader
        icon={BrainCircuit}
        title="AI Training"
        description="Chỉ Admin thấy. Prompt AI đổi có hiệu lực ở lần gọi AI kế tiếp; tham số engine có hiệu lực sau khi bấm Lưu."
        tabs={
          <div role="tablist" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                title={t.hint}
                onClick={() => setTab(t.key)}
                className={`min-h-6 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${tab === t.key ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
              >
                {t.label}
                {t.key === "prompts" && <span className="ml-1.5 text-2xs font-semibold opacity-70">{agentCount}</span>}
              </button>
            ))}
          </div>
        }
      />
      {tab === "check" || tab === "engine" ? <SectionNav /> : null}
      <div key={tab} className="space-y-8">{panels[tab]}</div>
    </div>
  );
};
