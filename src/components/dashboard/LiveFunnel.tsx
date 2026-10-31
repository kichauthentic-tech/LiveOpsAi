import React, { useState } from "react";
import { LEVER_OWNER, watchRate, type FunnelRate, type FunnelView, type LiveFunnelLite } from "../../lib/performance/channelHealth";

// Phễu LIVE của một kênh (TikTok: LIVE impressions → Views → Product clicks → Orders; Shopee: Viewers → ATC → Orders), số cộng từ ca
// live các trợ lý đã nhập. Hai cửa sổ: Luỹ kế tháng (mặc định, so cùng khoảng ngày tháng trước) và 7 ngày (cảnh báo sớm). Mức báo tính
// theo số ca của chính cửa sổ: vượt ngưỡng 95% = "gãy rõ" (đỏ, giảm) / "tốt rõ" (xanh, tăng) — chỉ "gãy rõ" vào Hành động đề xuất;
// vượt ngưỡng 80% = "chú ý" (vàng, chỉ để ý). Chỉ trình bày — số do thẻ kênh tính (ChannelCard.funnels).

const nf = (v: number) => Math.round(v).toLocaleString("vi-VN");
const rt = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("vi-VN", { maximumFractionDigits: 2, minimumFractionDigits: v < 10 ? 2 : 1 })}%`);
const sign = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(x) < 0.1 ? 1 : 0 })}%`);
const band = (b: number | null) => (b == null ? "—" : `±${(b * 100).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`);
const pill = (on: boolean) => `px-3 py-1.5 rounded-lg border text-xs font-bold min-h-[32px] ${on ? "border-[var(--accent)] bg-[var(--accent-soft,rgba(212,160,23,.15))] text-[var(--accent-text)]" : "border-[var(--border)] text-[var(--text-muted)]"}`;

const level = (r: FunnelRate): { text: string; cls: string } | null =>
  r.sig ? (r.change! < 0 ? { text: "gãy rõ", cls: "text-rose-400" } : { text: "tốt rõ", cls: "text-emerald-400" })
    : r.watch && r.change! < 0 ? { text: "chú ý", cls: "text-amber-300" } : null;

export const LiveFunnel: React.FC<{ views: FunnelView[]; showAction?: boolean }> = ({ views, showAction = true }) => {
  const [pick, setPick] = useState<FunnelView["key"]>("mtd");
  const view = views.find((v) => v.key === pick) ?? views[0];
  if (!view) return null;
  const f = view.funnel;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        {views.map((v) => <button key={v.key} type="button" className={pill(v.key === view.key)} onClick={() => setPick(v.key)}>{v.tab}</button>)}
        <span className="text-[11px] text-[var(--text-faint)]">{view.sub}{f ? ` · ${f.curSessions} ca so ${f.prevSessions} ca` : ""}</span>
      </div>
      {view.note && <p className="text-[11px] text-amber-300 leading-snug">{view.note}</p>}
      {f ? <FunnelBody funnel={f} showAction={showAction} windowTab={view.tab} /> : <p className="text-xs text-[var(--text-muted)]">Chưa đủ dữ liệu để kết luận: {view.empty}</p>}
    </div>
  );
};

const FunnelBody: React.FC<{ funnel: LiveFunnelLite; showAction: boolean; windowTab: string }> = ({ funnel, showAction, windowTab }) => {
  const { steps, rates, worst } = funnel;
  const watch = watchRate(funnel);
  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row items-stretch">
        {steps.map((s, i) => {
          const r = i > 0 ? rates[i - 1] : null;
          const lv = r ? level(r) : null;
          const c = s.prev > 0 ? s.cur / s.prev - 1 : null;
          return (
            <React.Fragment key={s.label}>
              {r && (
                <div className="md:flex-[0_0_132px] flex md:flex-col items-center justify-center text-center gap-x-2 gap-y-0.5 py-2 md:py-0 px-1 text-[11px] text-[var(--text-muted)]">
                  <b className="text-[var(--text)]">{r.label}</b>
                  <span className={`text-sm font-black tabular-nums ${lv?.cls ?? "text-[var(--text)]"}`}>{rt(r.cur)}</span>
                  <span className="text-lg leading-none text-[var(--accent-text)] rotate-90 md:rotate-0">→</span>
                  <span className="tabular-nums">Kỳ so: {rt(r.prev)}</span>
                  <b className={`tabular-nums ${lv?.cls ?? "text-[var(--text-muted)]"}`}>{sign(r.change)}{lv ? ` · ${lv.text}` : ""}</b>
                  <span className="text-[11px] text-[var(--text-faint)] tabular-nums">chú ý {band(r.watchBand)} · rõ {band(r.band)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-3 text-center">
                <p className="text-xs font-semibold text-[var(--text-muted)]">{s.label}</p>
                <p className="text-xl font-black tabular-nums text-[var(--text)] my-0.5">{nf(s.cur)}</p>
                <p className="text-[11px] text-[var(--text-muted)] tabular-nums">Kỳ so: {nf(s.prev)}</p>
                <p className="mt-1.5 text-xs tabular-nums text-[var(--text-muted)]">{sign(c)}</p>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {showAction && (
        <p className="text-xs text-[var(--text-muted)] leading-snug">
          {worst
            ? <>Gãy rõ ở <b className="text-rose-300">{worst.label} {sign(worst.change)}</b> (vượt ngưỡng {band(worst.band)} của {windowTab.toLowerCase()}) · đầu mối xử lý: {LEVER_OWNER[worst.label] ?? "xem chi tiết từng ca"}.</>
            : watch
              ? <>Cần chú ý <b className="text-amber-300">{watch.label} {sign(watch.change)}</b> — vượt ngưỡng chú ý {band(watch.watchBand)} nhưng chưa tới ngưỡng gãy rõ {band(watch.band)} của {windowTab.toLowerCase()}.</>
              : `Không tỷ lệ nào giảm vượt ngưỡng của ${windowTab.toLowerCase()} — chưa có chỗ gãy.`}
        </p>
      )}
    </div>
  );
};
