import React from "react";
import { LEVER_OWNER, type LiveFunnelLite } from "../../lib/performance/channelHealth";

// Phễu LIVE TikTok của một kênh: LIVE impressions → Views → Product clicks → Orders, ngày Daily tháng này so ngày Daily cùng thứ tự
// tháng trước (cùng tập ca với cây GMV/giờ). Chỉ trình bày — số do thẻ kênh tính (ChannelCard.funnel). Tỷ lệ giảm nhiều nhất tô đỏ = chỗ gãy.

const nf = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}M` : v >= 1e4 ? `${Math.round(v / 1e3).toLocaleString("vi-VN")}K` : Math.round(v).toLocaleString("vi-VN"));
const rt = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("vi-VN", { maximumFractionDigits: v < 10 ? 2 : 1 })}%`);
const sign = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(x) < 0.1 ? 1 : 0 })}%`);

export const LiveFunnel: React.FC<{ funnel: LiveFunnelLite; showAction?: boolean }> = ({ funnel, showAction = true }) => {
  const { steps, rates, worst } = funnel;
  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-1.5 overflow-x-auto">
        {steps.map((s, i) => {
          const r = i > 0 ? rates[i - 1] : null;
          const bad = !!r && r.label === worst?.label;
          const tone = r?.change == null || Math.abs(r.change) < 0.03 ? "text-[var(--text-muted)]" : r.change > 0 ? "text-emerald-400" : "text-rose-400";
          return (
            <React.Fragment key={s.label}>
              {r && (
                <div className={`flex flex-col items-center justify-center text-[11px] px-1.5 min-w-[88px] rounded-lg ${bad ? "bg-rose-500/10 border border-rose-500/40" : ""}`}>
                  <b className="text-[var(--text)]">{r.label}</b>
                  <span className="tabular-nums text-[var(--text)]">{rt(r.cur)}</span>
                  <span className="text-[var(--text-faint)] tabular-nums">tháng trước {rt(r.prev)}</span>
                  <b className={`tabular-nums ${tone}`}>{sign(r.change)}</b>
                </div>
              )}
              <div className="flex-1 min-w-[96px] rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-2.5 py-2 text-center">
                <p className="text-[11px] text-[var(--text-faint)]">{s.label}</p>
                <p className="text-base font-black tabular-nums text-[var(--text)]">{nf(s.cur)}</p>
                <p className="text-[11px] text-[var(--text-faint)] tabular-nums">tháng trước {nf(s.prev)} · <span className={s.cur >= s.prev ? "text-emerald-400" : "text-rose-400"}>{sign(s.prev > 0 ? s.cur / s.prev - 1 : null)}</span></p>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {showAction && (
        <p className="text-xs text-[var(--text-muted)] leading-snug">
          {worst ? <>Gãy ở <b className="text-rose-300">{worst.label} {sign(worst.change)}</b> · đầu mối xử lý: {LEVER_OWNER[worst.label] ?? "xem chi tiết từng ca"}.</> : "Không bậc nào của phễu giảm quá 3% so với tháng trước."}
        </p>
      )}
    </div>
  );
};
