import React, { useState } from "react";
import { coneHalf, LANDING_LABEL } from "../../lib/performance/forecastCone";
import { applyWhatIf, type HandlingPlan, type Lever, type PlanMode } from "../../lib/performance/handlingPlan";
import { CHECKPOINT_LABEL } from "../../lib/performance/monthForecast";
import type { MonthOutlook } from "../../lib/performance/ceoBrief";
import { Card, hrs, money, pct } from "./shared";

// Phương án của MỘT kênh (đòn bẩy, mốc điều chỉnh giờ, thử kịch bản) — 21/10 nằm ở Chi tiết kênh (Dashboard brand của ops), dưới thẻ kênh. Mọi đòn bẩy ra số từ dữ liệu của chính kênh (lib/performance/handlingPlan.ts), căn cứ ghi ngay bên dưới.

const MODE_TEXT: Record<PlanMode, (o: MonthOutlook, p: HandlingPlan) => string> = {
  no_target: () => "Chưa có target nên chưa biết hụt hay dư. Dưới đây là các việc làm cho số liệu và lịch đáng tin hơn.",
  no_forecast: () => "Chưa có GMV/giờ 28 ngày hay Run-rate để dự báo, nên chưa có phương án theo dự báo.",
  short: (o, p) => `Dự báo thấp hơn target ${money(p.gap)} và xác suất đạt rất thấp — cần hành động ngay, giữ tiến độ hiện tại là không đủ.`,
  unlikely: (o, p) => `Dự báo thấp hơn target ${money(p.gap)}; còn cơ hội nếu bù giờ hoặc nâng GMV/giờ các ca còn lại.`,
  likely: () => "Dự báo đạt target nhưng vùng tin cậy vẫn xuống dưới target — chưa chắc chắn.",
  safe: (o, p) => `Dự báo vượt target ${money(Math.abs(p.gap ?? 0))} và vùng tin cậy nằm trên target — có thể cân nhắc mở rộng.`
};

const TONE_LABEL: Record<Lever["tone"], string> = { fix: "Sửa trước", grow: "Tăng doanh thu", info: "Lưu ý" };
const TONE_CLS: Record<Lever["tone"], string> = {
  fix: "bg-rose-500/15 text-rose-400",
  grow: "bg-sky-500/15 text-sky-300",
  info: "bg-[var(--surface-elevated)] text-[var(--text-faint)]"
};

const WhatIfBox: React.FC<{ o: MonthOutlook; p: HandlingPlan }> = ({ o, p }) => {
  const [hours, setHours] = useState(0);
  const [ratePct, setRatePct] = useState(0);
  if (!o.target || p.marginalRate == null) return null;
  const r = applyWhatIf(o, p, { addHours: hours, ratePct });
  const changed = hours !== 0 || ratePct !== 0;
  const half = coneHalf(o.actual, r.projected, o.coneCoef);
  const slider = "w-full accent-[var(--accent)]";
  return (
    <div className="border-t border-[var(--border)] pt-3 space-y-2">
      <p className="text-xs font-bold text-[var(--text)]">Thử kịch bản</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-[var(--text-muted)] space-y-1 block">
          <span className="flex justify-between"><span>Thêm giờ live</span><b className="text-[var(--text)]">{hours > 0 ? `+${hours}h` : "0h"}</b></span>
          <input type="range" min={0} max={80} step={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={slider} aria-label="Thêm giờ live" />
        </label>
        <label className="text-xs text-[var(--text-muted)] space-y-1 block">
          <span className="flex justify-between"><span>GMV/giờ các ca còn lại</span><b className="text-[var(--text)]">{ratePct > 0 ? `+${ratePct}%` : ratePct < 0 ? `${ratePct}%` : "giữ nguyên"}</b></span>
          <input type="range" min={-20} max={30} step={1} value={ratePct} onChange={(e) => setRatePct(Number(e.target.value))} className={slider} aria-label="Đổi GMV/giờ các ca còn lại" />
        </label>
      </div>
      <p className="text-xs text-[var(--text-muted)] leading-snug">
        {changed ? "Với kịch bản này: " : "Hiện tại: "}
        dự báo <b className="text-[var(--text)]">{money(r.projected)}</b> (vùng tin cậy 80%: {money(r.projected - half)} – {money(r.projected + half)}), xác suất đạt target{" "}
        <b className="text-[var(--text)]">{r.landing.pHit != null ? pct(r.landing.pHit) : "—"}</b> — {LANDING_LABEL[r.landing.key].toLowerCase()}.
      </p>
      <p className="text-[11px] text-[var(--text-faint)] leading-snug">Giờ thêm được tính theo GMV/giờ × hệ số co giãn ({money(p.marginalRate)}/giờ), không phải GMV/giờ trung bình. Chi phí và lãi của giờ thêm chưa tính vì chưa nhập commission và rate.</p>
    </div>
  );
};

// Ba mốc điều chỉnh giờ (engine target v3): mốc đã qua mờ đi, mốc đang hiệu lực đậm; dưới là số giờ cần đổi cho phần còn lại.
const CheckpointStrip: React.FC<{ o: MonthOutlook; p: HandlingPlan; today: string }> = ({ o, p, today }) => {
  if (!o.target || p.checkpoints.length === 0) return null;
  const active = p.checkpoint?.checkpoint.key;
  const c = p.checkpoint;
  const dm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  return (
    <div className="border-t border-[var(--border)] pt-3 space-y-2">
      <p className="text-xs font-bold text-[var(--text)]">Mốc điều chỉnh giờ</p>
      <ol className="flex flex-wrap gap-1.5">
        {p.checkpoints.map((k) => (
          <li key={k.key} className={`text-[11px] px-2 py-1 rounded-lg border ${k.key === active ? "border-[var(--accent)] text-[var(--text)] font-bold" : k.date < today ? "border-[var(--border)] text-[var(--text-faint)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
            {CHECKPOINT_LABEL[k.key]} · {dm(k.date)}{k.date > today ? " (sắp tới)" : ""}
          </li>
        ))}
      </ol>
      {c && (
        <p className="text-xs text-[var(--text-muted)] leading-snug">
          {c.gap <= 0
            ? <>Dự báo đã đạt target — không cần thêm giờ ở mốc này.</>
            : <>Thiếu <b className="text-[var(--text)]">{money(c.gap)}</b> ⇒ cần <b className="text-[var(--text)]">+{Math.round(c.needPct * 100)}%</b> giờ của phần còn lại{c.capped ? <> (vượt giới hạn, đề xuất <b className="text-[var(--text)]">+{Math.round(c.pct * 100)}%</b> ≈ {hrs(c.extraHours)} và báo brand sớm)</> : <> ≈ <b className="text-[var(--text)]">{hrs(c.extraHours)}</b></>}; thêm đủ thì dự báo ≈ {money(c.projectedAfter)}.</>}
        </p>
      )}
      <p className="text-[11px] text-[var(--text-faint)] leading-snug">Mô phỏng T7–T9 trên số thật: làm đủ 3 mốc (bù tối đa +30% giờ còn lại) thì 9/9 tháng CROCS + VERA đạt ≥ 95% target; không điều chỉnh chỉ 3/9.</p>
    </div>
  );
};

/** Phương án của một kênh. Đầu khối không lặp nhãn / dự phóng / GMV/giờ cần — thẻ kênh ngay trên đã nói (21/10: một số một chỗ). */
export const ChannelPlan: React.FC<{ o: MonthOutlook; p: HandlingPlan; today: string; extra?: React.ReactNode }> = ({ o, p, today, extra }) => (
  <Card className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-black text-[var(--text)]">Phương án</h4>
      {extra}
    </div>
    <p className="text-sm text-[var(--text-muted)] leading-snug">{MODE_TEXT[p.mode](o, p)}</p>
    {p.levers.length === 0 ? (
      <p className="text-sm text-[var(--text-faint)]">Chưa có phương án nào nổi bật từ dữ liệu hiện có.</p>
    ) : (
      <ul className="space-y-2.5">
        {p.levers.map((l) => (
          <li key={l.id} className="flex gap-2.5">
            <span className={`shrink-0 mt-0.5 h-fit text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${TONE_CLS[l.tone]}`}>{TONE_LABEL[l.tone]}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text)] leading-snug">{l.title}</p>
              <p className="text-xs text-[var(--text-muted)] leading-snug">{l.detail}</p>
              <p className="text-[11px] text-[var(--text-faint)] leading-snug mt-0.5">Cơ sở tính: {l.basis}</p>
            </div>
          </li>
        ))}
      </ul>
    )}
    <CheckpointStrip o={o} p={p} today={today} />
    <WhatIfBox o={o} p={p} />
  </Card>
);
