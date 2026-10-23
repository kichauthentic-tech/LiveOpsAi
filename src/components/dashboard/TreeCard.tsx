import React from "react";
import { LEVER_OWNER, type GmvTree } from "../../lib/performance/channelHealth";
import { profileOf } from "../../lib/platforms/profiles";
import type { ReportPlatform } from "../../lib/reportPlatform";
import { money } from "./shared";

// Cây GMV/giờ ngày thường của một kênh (channelHealth.gmvTree, ngày thường tháng này ↔ ngày thường cùng thứ tự tháng trước).
// Chỉ trình bày — số do thẻ kênh tính (ChannelCard.tree). Không có "Giờ live" trong cây: giờ không phải nhánh của GMV/giờ, và
// trước 21/10 khối "Vì sao" cũ ghi "Giờ live −12,3%" (ngày thường) ngay cạnh ô KPI "+14,5%" (mọi ngày).

const sign = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(x) < 0.1 ? 1 : 0 })}%`);
const tone = (x: number | null) => (x == null || Math.abs(x) < 0.03 ? "text-[var(--text-muted)]" : x > 0 ? "text-emerald-400" : "text-rose-400");

export const TreeCard: React.FC<{ tree: GmvTree | null; platform: ReportPlatform }> = ({ tree: t, platform }) => {
  const prof = profileOf(platform);
  const mx = t ? Math.max(0.05, ...t.parts.map((p) => Math.abs(p.change))) : 1;
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-faint)] leading-snug">{prof.metrics.driverFormula.replace(/^GMV = [^×]+× /, "GMV/giờ = ")} · ngày Daily tháng này so ngày Daily cùng thứ tự tháng trước</p>
      {!t ? <p className="text-sm text-[var(--text-faint)]">Chưa đủ ca Daily có số liệu ở cả hai tháng (cần từ 3 ca mỗi bên) để phân rã.</p> : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-2xl font-black text-[var(--text)]">{money(t.gmvPerHour.cur)}/giờ</span>
            <span className={`text-sm font-bold ${tone(t.gmvPerHour.change)}`}>{sign(t.gmvPerHour.change)}</span>
            <span className="text-xs text-[var(--text-faint)]">tháng trước {money(t.gmvPerHour.prev)}/giờ · {t.curSessions} ca / {t.prevSessions} ca</span>
          </div>
          <div className="space-y-1.5">
            {t.parts.map((p) => {
              const worst = t.worst?.label === p.label && p.change < -0.03;
              const w = `${(Math.abs(p.change) / mx) * 32}%`;
              return (
                <div key={p.label} className="grid grid-cols-[110px_1fr] sm:grid-cols-[130px_1fr] items-center gap-2 text-xs">
                  <span className={worst ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}>{p.label}</span>
                  <div className="relative h-5">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border)]" />
                    <div className={`absolute inset-y-0.5 rounded ${p.change >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={p.change >= 0 ? { left: "50%", width: w } : { right: "50%", width: w }} />
                    <span className={`absolute top-0.5 font-mono text-[11px] ${p.change >= 0 ? "text-emerald-400" : "text-rose-400"}`} style={p.change >= 0 ? { left: `calc(50% + ${w} + 4px)` } : { right: `calc(50% + ${w} + 4px)` }}>{sign(p.change)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-snug">
            {t.worst && t.worst.change < -0.03 ? <>Yếu tố giảm mạnh nhất: <b className="text-[var(--text)]">{t.worst.label} {sign(t.worst.change)}</b>. Đầu mối xử lý: {LEVER_OWNER[t.worst.label] ?? "xem chi tiết từng ca"}.</> : "Không yếu tố nào giảm quá 3%."}
          </p>
        </>
      )}
    </div>
  );
};
