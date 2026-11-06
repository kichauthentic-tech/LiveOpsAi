import React from "react";
import { halfRange, milestoneError, type Half, type MilestoneDraft } from "../../lib/roster/milestones";

// 4 mốc lịch tháng sau (06/11, user chốt): mỗi đợt một hạn đăng ký + một ngày chốt lịch. Dùng ở "Mở lịch tháng sau" (bước 3) và mục
// Tháng sau của Điều Phối. Chỉ là ô nhập — ghi qua setRosterMonthMilestones ở nơi gọi.

const FIELD = "px-2 py-1 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)] text-sm";

export const MilestonesEditor: React.FC<{ month: string; value: MilestoneDraft; onChange: (v: MilestoneDraft) => void; disabled?: boolean }> = ({ month, value, onChange, disabled }) => {
  const err = milestoneError(value);
  const row = (half: Half) => {
    const [dk, tk, pk] = half === 1 ? (["d1Date", "d1Time", "p1"] as const) : (["d2Date", "d2Time", "p2"] as const);
    return (
      <div key={half} className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] items-end py-2">
        <div className="text-xs">
          <b className="text-[var(--text)]">Đợt {half}</b>
          <span className="block text-[var(--text-muted)] tabular-nums">ca ngày {halfRange(month, half)}</span>
        </div>
        <label className="flex flex-col gap-1 text-2xs text-[var(--text-muted)]">
          Hạn đăng ký
          <span className="flex flex-wrap gap-1.5">
            <input type="date" aria-label={`Ngày hạn đăng ký đợt ${half}`} disabled={disabled} value={value[dk]} onChange={(e) => onChange({ ...value, [dk]: e.target.value })} className={FIELD} />
            <input type="time" aria-label={`Giờ hạn đăng ký đợt ${half}`} disabled={disabled} value={value[tk]} onChange={(e) => onChange({ ...value, [tk]: e.target.value })} className={FIELD} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-2xs text-[var(--text-muted)]">
          Chốt lịch (công bố)
          <input type="date" aria-label={`Ngày chốt lịch đợt ${half}`} disabled={disabled} value={value[pk]} onChange={(e) => onChange({ ...value, [pk]: e.target.value })} className={FIELD} />
        </label>
      </div>
    );
  };
  return (
    <div className="space-y-1">
      <div className="divide-y divide-[var(--border)]">{[1, 2].map((h) => row(h as Half))}</div>
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </div>
  );
};
