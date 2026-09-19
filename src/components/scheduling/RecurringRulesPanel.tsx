import React, { useState } from "react";
import { RecurringShiftTemplate, Studio } from "../../types";
import { Repeat, Trash2 } from "lucide-react";

const WEEKDAY_NAMES = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

interface RecurringRulesPanelProps {
  brandId: string;
  brandName: string;
  templates: RecurringShiftTemplate[]; // đã lọc theo brand
  studios: Studio[];
  currentUserId?: string;
  defaultHours: number;
  onCreateTemplate: (t: RecurringShiftTemplate) => Promise<boolean>;
  onToggleTemplate: (t: RecurringShiftTemplate) => Promise<boolean>;
  onDeleteTemplate: (id: string) => Promise<void>;
}

const addHours = (hhmm: string, h: number) => {
  const [hh, mm] = hhmm.split(":").map(Number);
  const total = (hh * 60 + mm + Math.round(h * 60)) % (24 * 60);
  return `${`${Math.floor(total / 60)}`.padStart(2, "0")}:${`${total % 60}`.padStart(2, "0")}`;
};

// Quy tắc lặp của MỘT brand (bảng 0015) — sống trong Kế Hoạch Tháng từ giai đoạn A: là "khung
// mặc định" để nạp nhanh lưới kế hoạch, không còn tự sinh ca nữa (sinh ca = bước Chốt kế hoạch).
export const RecurringRulesPanel: React.FC<RecurringRulesPanelProps> = ({
  brandId,
  brandName,
  templates,
  studios,
  currentUserId,
  defaultHours,
  onCreateTemplate,
  onToggleTemplate,
  onDeleteTemplate
}) => {
  const [weekday, setWeekday] = useState(-1);
  const [studioId, setStudioId] = useState(studios[0]?.id || "");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState(addHours("19:00", defaultHours));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const studio = studios.find((s) => s.id === studioId);
    setBusy(true);
    await onCreateTemplate({
      id: `tpl-${Date.now()}`,
      weekday: weekday === -1 ? 0 : weekday,
      isDaily: weekday === -1,
      brandId,
      brandName,
      platform: "TikTok",
      startTime,
      endTime,
      studioId: studioId || undefined,
      studioName: studio?.name || "",
      notes,
      active: true,
      createdBy: currentUserId
    });
    setBusy(false);
    setNotes("");
  };

  return (
    <div className="space-y-3">
      {templates.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">Chưa có quy tắc nào cho {brandName}. Thêm khung giờ cố định bên dưới, rồi bấm "Nạp từ quy tắc" để điền nhanh cả tháng.</p>
      ) : (
        <div className="space-y-1.5">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-[var(--text)]">{t.isDaily ? "Hàng Ngày" : WEEKDAY_NAMES[t.weekday]}</span>
                <span className="text-[var(--text-muted)] font-mono">{t.startTime}-{t.endTime}</span>
                <span className="text-[var(--text-faint)]">{t.studioName}</span>
                {t.notes && <span className="text-[var(--text-faint)]">· {t.notes}</span>}
                <span className={`px-1.5 py-0.5 rounded font-bold ${t.active ? "bg-emerald-950 text-emerald-400" : "bg-[var(--surface-elevated)] text-[var(--text-faint)]"}`}>
                  {t.active ? "Active" : "Tắt"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => onToggleTemplate(t)} className="text-[11px] font-bold text-blue-400 hover:text-blue-300">
                  {t.active ? "Tắt" : "Bật"}
                </button>
                <button type="button" onClick={() => onDeleteTemplate(t.id)} className="text-rose-400 hover:text-rose-300" title="Xoá quy tắc">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-3">
        <div>
          <label className="font-bold text-[var(--text-muted)] block mb-1">Thứ</label>
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)]">
            <option value={-1}>Hàng Ngày</option>
            {WEEKDAY_NAMES.map((name, idx) => <option key={idx} value={idx}>{name}</option>)}
          </select>
        </div>
        <div>
          <label className="font-bold text-[var(--text-muted)] block mb-1">Bắt đầu</label>
          <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setEndTime(addHours(e.target.value, defaultHours)); }} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono" />
        </div>
        <div>
          <label className="font-bold text-[var(--text-muted)] block mb-1">Kết thúc</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono" />
        </div>
        <div>
          <label className="font-bold text-[var(--text-muted)] block mb-1">Studio</label>
          <select value={studioId} onChange={(e) => setStudioId(e.target.value)} className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)]">
            <option value="">—</option>
            {studios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú" className="flex-1 min-w-0 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)]" />
          <button type="submit" disabled={busy} className="shrink-0 px-3 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px] flex items-center gap-1">
            <Repeat className="w-3 h-3" /> Thêm
          </button>
        </div>
      </form>
    </div>
  );
};
