import React, { useMemo, useState } from "react";
import { RecurringShiftTemplate, Brand, Studio, ShiftSlot } from "../../types";
import { Repeat, Trash2, Sparkles } from "lucide-react";
import { planMonthSlots } from "../../lib/scheduling/planMonthSlots";
import { SchedulingGap } from "../../lib/performance/brandCommitment";
import { GenerateSlotsResult } from "../../lib/db/shiftSlots";

const WEEKDAY_NAMES = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const fmtH = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

interface MonthSlotGeneratorProps {
  month: string; // "YYYY-MM"
  today: string;
  templates: RecurringShiftTemplate[];
  brands: Brand[];
  studios: Studio[];
  shiftSlots: ShiftSlot[];
  // Cam kết tháng đang xem (đã trừ ca mở chờ chốt) — để bảng xem trước nói "sau khi sinh còn
  // thiếu/thừa bao nhiêu giờ so với hợp đồng". Brand không có cam kết vẫn sinh được, chỉ không so.
  gaps: SchedulingGap[];
  currentUserId?: string;
  onCreateTemplate: (t: RecurringShiftTemplate) => Promise<boolean>;
  onToggleTemplate: (t: RecurringShiftTemplate) => Promise<boolean>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onGenerateSlots: (slots: ReturnType<typeof planMonthSlots>["toCreate"]) => Promise<GenerateSlotsResult | null>;
}

// P1 module tạo ca (0088): "Mở ca tháng" gom về Đăng Ký & Chốt Lịch — nơi duy nhất ops mở ca hàng
// loạt. Quy tắc lặp (0015) giữ nguyên bảng, chỉ đổi cách sinh: lập kế hoạch thuần → xem trước
// theo brand so với cam kết → RPC sinh (server dedupe theo brand|ngày|giờ|nền tảng).
export const MonthSlotGenerator: React.FC<MonthSlotGeneratorProps> = ({
  month,
  today,
  templates,
  brands,
  studios,
  shiftSlots,
  gaps,
  currentUserId,
  onCreateTemplate,
  onToggleTemplate,
  onDeleteTemplate,
  onGenerateSlots
}) => {
  const [expanded, setExpanded] = useState(false);
  const [tplWeekday, setTplWeekday] = useState(1);
  const [tplBrandId, setTplBrandId] = useState(brands[0]?.id || "");
  const [tplStudioId, setTplStudioId] = useState(studios[0]?.id || "");
  const [tplStartTime, setTplStartTime] = useState("14:00");
  const [tplEndTime, setTplEndTime] = useState("17:00");
  const [tplNotes, setTplNotes] = useState("");
  const [creatingTpl, setCreatingTpl] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const [y, m] = month.split("-").map(Number);
  const monthLabel = `${m}/${y}`;

  const plan = useMemo(() => planMonthSlots(templates, shiftSlots, month, today), [templates, shiftSlots, month, today]);
  const gapByBrand = useMemo(() => new Map(gaps.map((g) => [g.brandId, g])), [gaps]);
  const activeCount = templates.filter((t) => t.active).length;

  const handleCreateTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const brandObj = brands.find((b) => b.id === tplBrandId);
    if (!brandObj) {
      window.alert("Chọn brand cho quy tắc — ca không gắn brand thì không so được cam kết.");
      return;
    }
    const studioObj = studios.find((s) => s.id === tplStudioId);
    const template: RecurringShiftTemplate = {
      id: `tpl-${Date.now()}`,
      weekday: tplWeekday === -1 ? 0 : tplWeekday,
      isDaily: tplWeekday === -1,
      brandId: brandObj.id,
      brandName: brandObj.name,
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

  const handleGenerate = async () => {
    if (plan.toCreate.length === 0) return;
    const lines = plan.perBrand.map((b) => `• ${b.brandName}: ${b.newCount} ca (${fmtH(b.newHours)}h)`).join("\n");
    if (!window.confirm(`Mở ${plan.toCreate.length} ca chờ đăng ký cho tháng ${monthLabel}?\n\n${lines}`)) return;
    setGenerating(true);
    setResultMsg(null);
    const r = await onGenerateSlots(plan.toCreate);
    setGenerating(false);
    if (!r) return;
    setResultMsg(
      r.skippedExisting > 0
        ? `Đã mở ${r.inserted.length} ca cho tháng ${monthLabel}; ${r.skippedExisting} ca đã có sẵn (ai đó vừa tạo) nên bỏ qua.`
        : `Đã mở ${r.inserted.length} ca cho tháng ${monthLabel}.`
    );
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent-text)]" />
          <h3 className="text-sm font-bold text-[var(--text)]">Mở ca tháng {monthLabel} từ quy tắc lặp</h3>
          <span className="text-[11px] text-[var(--text-muted)]">
            {activeCount} quy tắc active · {plan.toCreate.length > 0 ? `sẽ mở ${plan.toCreate.length} ca` : "không có ca mới"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-bold text-[var(--accent-text)] hover:opacity-80 transition-colors flex items-center gap-1"
        >
          <Repeat className="w-3.5 h-3.5" /> {expanded ? "Ẩn quy tắc" : `Quy tắc lặp (${templates.length})`}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3">
          {templates.length > 0 && (
            <div className="space-y-1.5">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[var(--text)]">{t.isDaily ? "Hàng Ngày" : WEEKDAY_NAMES[t.weekday]}</span>
                    <span className="text-[var(--text-muted)] font-mono">{t.startTime}-{t.endTime}</span>
                    <span className={t.brandId ? "text-[var(--text-muted)]" : "text-rose-400"}>{t.brandName || "— Không brand: không sinh —"}</span>
                    <span className="text-[var(--text-faint)]">{t.studioName}</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${t.active ? "bg-emerald-950 text-emerald-400" : "bg-[var(--surface-elevated)] text-[var(--text-faint)]"}`}>
                      {t.active ? "Active" : "Tắt"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => onToggleTemplate(t)} className="text-[11px] font-bold text-blue-400 hover:text-blue-300">
                      {t.active ? "Tắt" : "Bật"}
                    </button>
                    <button type="button" onClick={() => onDeleteTemplate(t.id)} className="text-rose-400 hover:text-rose-300" title="Xoá quy tắc (ca đã sinh giữ nguyên)">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCreateTemplateSubmit} className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-3">
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Thứ trong tuần:</label>
              <select value={tplWeekday} onChange={(e) => setTplWeekday(Number(e.target.value))} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)]">
                <option value={-1}>Hàng Ngày (mọi ngày trong tháng)</option>
                {WEEKDAY_NAMES.map((name, idx) => <option key={idx} value={idx}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Brand:</label>
              <select value={tplBrandId} onChange={(e) => setTplBrandId(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)]">
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
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
            <div className="col-span-2 sm:col-span-3 flex justify-end">
              <button type="submit" disabled={creatingTpl || brands.length === 0} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px]">
                {creatingTpl ? "Đang tạo..." : "+ Thêm quy tắc"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Xem trước theo brand — so với cam kết TRƯỚC khi ghi. Số "sau khi mở" âm = vượt cam kết. */}
      {plan.perBrand.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                <th className="text-left py-1 pr-3 font-bold">Brand</th>
                <th className="text-right py-1 pr-3 font-bold">Sẽ mở</th>
                <th className="text-right py-1 pr-3 font-bold">Đang mở</th>
                <th className="text-right py-1 pr-3 font-bold">Cam kết</th>
                <th className="text-right py-1 font-bold">Còn thiếu sau khi mở</th>
              </tr>
            </thead>
            <tbody>
              {plan.perBrand.map((b) => {
                const g = gapByBrand.get(b.brandId);
                const after = g ? g.hoursStillToOpen - b.newHours : null;
                return (
                  <tr key={b.brandId} className="border-t border-[var(--border)]">
                    <td className="py-1.5 pr-3 font-bold text-[var(--text)]">{b.brandName}</td>
                    <td className="py-1.5 pr-3 text-right text-[var(--text)]">{b.newCount} ca · {fmtH(b.newHours)}h</td>
                    <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{g ? `${g.openSlotCount} ca · ${fmtH(g.openSlotHours)}h` : "—"}</td>
                    <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">{g ? `${fmtH(g.committedHours)}h` : "chưa nhập"}</td>
                    <td className={`py-1.5 text-right font-bold ${after === null ? "text-[var(--text-faint)]" : after > 0.01 ? "text-rose-400" : after < -0.01 ? "text-amber-400" : "text-emerald-400"}`}>
                      {after === null ? "—" : after > 0.01 ? `thiếu ${fmtH(after)}h` : after < -0.01 ? `vượt ${fmtH(-after)}h` : "vừa đủ"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-[var(--text-muted)]">
          {resultMsg ??
            (plan.toCreate.length === 0
              ? activeCount === 0
                ? "Chưa có quy tắc lặp nào active — thêm quy tắc ở trên rồi mở ca."
                : "Mọi ca theo quy tắc đã có sẵn trong tháng này."
              : [
                  plan.skippedExisting > 0 ? `${plan.skippedExisting} ca đã có sẵn, bỏ qua` : null,
                  plan.skippedPast > 0 ? `${plan.skippedPast} ngày đã qua, không mở` : null,
                  plan.skippedNoBrand > 0 ? `${plan.skippedNoBrand} quy tắc không gắn brand, không sinh` : null
                ]
                  .filter(Boolean)
                  .join(" · ") || "Chưa có ca nào trùng.")}
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || plan.toCreate.length === 0}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px] flex items-center gap-1.5"
        >
          <Repeat className="w-3.5 h-3.5" /> {generating ? "Đang mở..." : `Mở ${plan.toCreate.length} ca tháng ${monthLabel}`}
        </button>
      </div>
    </div>
  );
};
