import React from "react";
import { PlanGroupTargets as GroupTargets } from "../types";
import { CampDayBucket } from "../lib/campaignDays";
import { GROUP_BUCKETS, GROUP_LABEL, GroupBreakdownRow, sumGroupTargets } from "../lib/scheduling/monthPlanGrid";
import { fmtFixed, fmtVndShort } from "../lib/format";

// Kế Hoạch Tháng — ô nhập target theo nhóm ngày (0161). Ops chốt trước target D-Day / Mid-Month / Pay Day / ngày thường; mỗi
// nhóm chia xuống ca theo trọng số engine (allocateDraftTargets). Nhóm bỏ trống chia chung phần còn lại của Target tháng.
// Bên cạnh mỗi nhóm hiện target/giờ và so với GMV/giờ lịch sử của chính nhóm đó — chỗ để thấy một target nhóm đang "tham vọng"
// hơn lịch sử bao nhiêu TRƯỚC khi chốt (D-Day lịch sử CROCS cao hơn ngày thường 1,1–1,45 lần).

interface Props {
  rows: GroupBreakdownRow[];
  targets: GroupTargets;
  targetTotal: number;
  /** GMV/giờ lịch sử từng nhóm (mô hình cũ, 92 ngày gần nhất); null = brand chưa đủ lịch sử. */
  historyRate: Record<CampDayBucket, number> | null;
  editable: boolean;
  locked: boolean;
  onChange: (next: GroupTargets) => void;
}

export const PlanGroupTargetsBlock: React.FC<Props> = ({ rows, targets, targetTotal, historyRate, editable, locked, onChange }) => {
  const given = GROUP_BUCKETS.filter((b) => (targets[b] ?? 0) > 0);
  const all = given.length === GROUP_BUCKETS.length;
  const remain = targetTotal - sumGroupTargets(targets);
  const restWithSlots = rows.filter((r) => !r.given && r.slots > 0);
  const set = (b: CampDayBucket, v: number) => {
    const next = { ...targets };
    if (v > 0) next[b] = v;
    else delete next[b];
    onChange(next);
  };
  return (
    <details className="text-xs" open={given.length > 0}>
      <summary className="cursor-pointer font-bold text-[var(--text-muted)] min-h-6">
        Target theo nhóm ngày <span className="font-normal text-[var(--text-faint)]">(tuỳ chọn{given.length > 0 ? ` — đã nhập ${given.length}/4 nhóm` : ""})</span>
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-[11px] text-[var(--text-faint)] leading-snug">
          Nhập target từng nhóm thì ca của nhóm đó chia đúng số này; nhóm bỏ trống chia chung phần còn lại của Target tháng{all ? ". Đã nhập đủ 4 nhóm: Target tháng = tổng 4 nhóm." : "."}
        </p>
        {rows.map((r) => {
          const perHour = r.hours > 0 ? r.slotTarget / r.hours : 0;
          const rate = historyRate?.[r.bucket] ?? 0;
          return (
            <div key={r.bucket} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[var(--text)]">{GROUP_LABEL[r.bucket]} <span className="font-normal text-[var(--text-faint)]">· {r.slots} ca · {fmtFixed(r.hours, 1)}h</span></span>
                <input
                  type="number" min="0" step="1000000" disabled={!editable || locked}
                  aria-label={`Target ${GROUP_LABEL[r.bucket]}`}
                  value={targets[r.bucket] || ""} placeholder="tự chia"
                  onChange={(e) => set(r.bucket, Math.max(0, Number(e.target.value) || 0))}
                  className="w-36 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-1.5 text-right text-[var(--text)] font-mono disabled:opacity-60"
                />
              </div>
              <div className="text-[11px] text-[var(--text-faint)] text-right">
                {r.slots === 0 ? "chưa có ca" : <>Σ ca <b className="text-[var(--text-muted)]">{fmtVndShort(r.slotTarget)}</b> · {fmtVndShort(perHour)}/giờ{rate > 0 && perHour > 0 ? <> · <b className="text-[var(--text-muted)]">×{fmtFixed(perHour / rate, 2)}</b> lịch sử</> : null}</>}
              </div>
              {r.orphaned && <p className="text-[11px] text-amber-300 text-right">Đã nhập target nhưng lưới chưa có ca {GROUP_LABEL[r.bucket]} — phần này chưa chia đi đâu.</p>}
            </div>
          );
        })}
        {!all && given.length > 0 && restWithSlots.length > 0 && (
          remain > 0
            ? <p className="text-[11px] text-[var(--text-faint)]">Phần còn lại {fmtVndShort(remain)} chia cho {restWithSlots.map((r) => GROUP_LABEL[r.bucket]).join(", ")}.</p>
            : <p className="text-[11px] text-amber-300">Các nhóm đã nhập đã dùng hết Target tháng — {restWithSlots.map((r) => GROUP_LABEL[r.bucket]).join(", ")} không còn phần nào (target ca = 0). Nhập thêm target nhóm đó hoặc tăng Target tháng.</p>
        )}
        {given.length > 0 && editable && !locked && (
          <button onClick={() => onChange({})} className="min-h-6 px-1 text-[11px] text-[var(--text-faint)] hover:text-rose-400 underline">Bỏ target nhóm, chia theo Target tháng</button>
        )}
      </div>
    </details>
  );
};
