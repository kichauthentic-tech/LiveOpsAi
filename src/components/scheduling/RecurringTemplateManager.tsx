import React, { useState } from "react";
import { RecurringShiftTemplate, Brand, Studio } from "../../types";
import { Repeat, Trash2 } from "lucide-react";

const WEEKDAY_NAMES = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

interface RecurringTemplateManagerProps {
  templates: RecurringShiftTemplate[];
  brands: Brand[];
  studios: Studio[];
  lockedBrandId?: string;
  lockedBrandName?: string;
  currentMonth: number;
  currentYear: number;
  currentUserId?: string;
  onCreateTemplate: (t: RecurringShiftTemplate) => Promise<boolean>;
  onToggleTemplate: (t: RecurringShiftTemplate) => Promise<boolean>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onGenerateMonthSlots: (month: string) => Promise<number>;
}

// Panel "Quy Tắc Lặp" dùng chung Agency (không khoá brand) và Brand Workspace
// (lockedBrandId cố định) — sinh hàng loạt ShiftSlot chờ đăng ký cho cả tháng
// từ mẫu lặp theo thứ trong tuần hoặc Hàng Ngày.
export const RecurringTemplateManager: React.FC<RecurringTemplateManagerProps> = ({
  templates,
  brands,
  studios,
  lockedBrandId,
  lockedBrandName,
  currentMonth,
  currentYear,
  currentUserId,
  onCreateTemplate,
  onToggleTemplate,
  onDeleteTemplate,
  onGenerateMonthSlots
}) => {
  const [expanded, setExpanded] = useState(false);
  const [tplWeekday, setTplWeekday] = useState(1);
  const [tplBrandId, setTplBrandId] = useState(lockedBrandId || brands[0]?.id || "");
  const [tplStudioId, setTplStudioId] = useState(studios[0]?.id || "");
  const [tplStartTime, setTplStartTime] = useState("14:00");
  const [tplEndTime, setTplEndTime] = useState("17:00");
  const [tplNotes, setTplNotes] = useState("");
  const [creatingTpl, setCreatingTpl] = useState(false);
  const [generatingSlots, setGeneratingSlots] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const handleCreateTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveBrandId = lockedBrandId || tplBrandId;
    const brandObj = brands.find((b) => b.id === effectiveBrandId);
    const studioObj = studios.find((s) => s.id === tplStudioId);
    const template: RecurringShiftTemplate = {
      id: `tpl-${Date.now()}`,
      weekday: tplWeekday === -1 ? 0 : tplWeekday,
      isDaily: tplWeekday === -1,
      brandId: effectiveBrandId || undefined,
      brandName: lockedBrandName || brandObj?.name || "",
      platform: "TikTok",
      startTime: tplStartTime,
      endTime: tplEndTime,
      studioId: tplStudioId || undefined,
      studioName: studioObj?.name || "",
      notes: tplNotes,
      active: true,
      createdBy: currentUserId
    };
    setCreatingTpl(true);
    await onCreateTemplate(template);
    setCreatingTpl(false);
    setTplNotes("");
  };

  const handleGenerateSlotsForMonth = async () => {
    setGeneratingSlots(true);
    const monthStr = `${currentYear}-${`${currentMonth}`.padStart(2, "0")}`;
    const count = await onGenerateMonthSlots(monthStr);
    setGeneratingSlots(false);
    setGenerateMsg(count > 0 ? `Đã sinh ${count} ca mới cho tháng ${monthStr}.` : "Không có ca mới nào để sinh (đã tồn tại hoặc chưa có mẫu active).");
  };

  return (
    <>
      <div className="flex items-center justify-end">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-bold text-[var(--accent-text)] hover:opacity-80 transition-colors flex items-center gap-1"
        >
          <Repeat className="w-3.5 h-3.5" /> {expanded ? "Ẩn Quy Tắc Lặp" : `Quy Tắc Lặp (${templates.length})`}
        </button>
      </div>
      {expanded && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
              <Repeat className="w-4 h-4 text-[var(--accent-text)]" /> Quy Tắc Lặp (Ca Cố Định Theo Tuần)
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Mẫu lặp dùng để sinh hàng loạt Ca chờ đăng ký cho cả tháng — không cần tạo tay từng ca.
            </p>
          </div>

          {templates.length > 0 && (
            <div className="space-y-1.5">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[var(--text)]">{t.isDaily ? "Hàng Ngày" : WEEKDAY_NAMES[t.weekday]}</span>
                    <span className="text-[var(--text-muted)] font-mono">{t.startTime}-{t.endTime}</span>
                    {!lockedBrandId && <span className="text-[var(--text-muted)]">{t.brandName || "— Không brand —"}</span>}
                    <span className="text-[var(--text-faint)]">{t.studioName}</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${t.active ? "bg-emerald-950 text-emerald-400" : "bg-[var(--surface-elevated)] text-[var(--text-faint)]"}`}>
                      {t.active ? "Active" : "Tắt"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleTemplate(t)}
                      className="text-[11px] font-bold text-blue-400 hover:text-blue-300"
                    >
                      {t.active ? "Tắt" : "Bật"}
                    </button>
                    <button type="button" onClick={() => onDeleteTemplate(t.id)} className="text-rose-400 hover:text-rose-300">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCreateTemplateSubmit} className={`grid grid-cols-2 ${lockedBrandId ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-2 text-xs bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-3`}>
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Thứ trong tuần:</label>
              <select value={tplWeekday} onChange={(e) => setTplWeekday(Number(e.target.value))} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)]">
                <option value={-1}>Hàng Ngày (mọi ngày trong tháng)</option>
                {WEEKDAY_NAMES.map((name, idx) => <option key={idx} value={idx}>{name}</option>)}
              </select>
            </div>
            {!lockedBrandId && (
              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Brand:</label>
                <select value={tplBrandId} onChange={(e) => setTplBrandId(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)]">
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Studio:</label>
              <select value={tplStudioId} onChange={(e) => setTplStudioId(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)]">
                {studios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Giờ bắt đầu:</label>
              <input type="time" value={tplStartTime} onChange={(e) => setTplStartTime(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono" />
            </div>
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Giờ kết thúc:</label>
              <input type="time" value={tplEndTime} onChange={(e) => setTplEndTime(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono" />
            </div>
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Ghi chú:</label>
              <input type="text" value={tplNotes} onChange={(e) => setTplNotes(e.target.value)} placeholder="Tuỳ chọn" className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)]" />
            </div>
            <div className="col-span-2 flex justify-end">
              <button type="submit" disabled={creatingTpl} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px]">
                {creatingTpl ? "Đang tạo..." : "+ Thêm Mẫu"}
              </button>
            </div>
          </form>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
            <p className="text-[11px] text-[var(--text-muted)]">
              {generateMsg || `Sinh Ca chờ đăng ký cho tháng ${currentMonth}/${currentYear} từ mọi mẫu đang Active — bỏ qua ngày đã sinh trước đó.`}
            </p>
            <button
              type="button"
              onClick={handleGenerateSlotsForMonth}
              disabled={generatingSlots}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px] flex items-center gap-1.5"
            >
              <Repeat className="w-3.5 h-3.5" /> {generatingSlots ? "Đang sinh..." : `Sinh Ca Cho Tháng ${currentMonth}/${currentYear}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
