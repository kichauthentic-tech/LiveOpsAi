import React, { useState } from "react";
import { BrandLogo } from "../ui/BrandLogo";
import { coneHalf, LANDING_LABEL } from "../../lib/performance/forecastCone";
import { applyWhatIf, type HandlingPlan, type Lever, type PlanMode } from "../../lib/performance/handlingPlan";
import type { Brand } from "../../types";
import type { MonthOutlook } from "../../lib/performance/ceoBrief";
import type { DashModel } from "./model";
import { LandingChip } from "./RunRate";
import { Card, SectionTitle, hrs, money, pct } from "./shared";

// Tab "Action": theo dự phóng, kênh nào hụt thì làm gì, kênh nào đang tốt thì scale thế nào. Mọi đòn bẩy ra số từ dữ liệu
// của chính kênh (lib/performance/handlingPlan.ts) và ghi căn cứ ngay bên dưới.

const MODE_TEXT: Record<PlanMode, (o: MonthOutlook, p: HandlingPlan) => string> = {
  no_target: () => "Chưa có target nên chưa biết hụt hay dư. Dưới đây là các việc làm cho số liệu và lịch đáng tin hơn.",
  no_forecast: () => "Chưa có GMV/giờ 28 ngày hay run-rate để chiếu, nên chưa có phương án theo dự phóng.",
  short: (o, p) => `Dự phóng thấp hơn target ${money(p.gap)} và khả năng đạt rất thấp — cần hành động ngay, không đủ nếu chỉ giữ nhịp.`,
  unlikely: (o, p) => `Dự phóng thấp hơn target ${money(p.gap)}; còn cơ hội nếu bù giờ hoặc nâng GMV/giờ các ca còn lại.`,
  likely: () => "Dự phóng chạm target nhưng dải tin cậy còn chạm dưới target — chưa chắc.",
  safe: (o, p) => `Dự phóng vượt target ${money(Math.abs(p.gap ?? 0))} và dải tin cậy nằm trên target — có thể nghĩ tới mở rộng.`
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
  const half = coneHalf(o.actual, r.projected);
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
        dự phóng <b className="text-[var(--text)]">{money(r.projected)}</b> (dải {money(r.projected - half)} – {money(r.projected + half)}), khả năng đạt target{" "}
        <b className="text-[var(--text)]">{r.landing.pHit != null ? pct(r.landing.pHit) : "—"}</b> — {LANDING_LABEL[r.landing.key].toLowerCase()}.
      </p>
      <p className="text-[11px] text-[var(--text-faint)] leading-snug">Giờ thêm được tính theo GMV/giờ × co giãn ({money(p.marginalRate)}/giờ), không phải GMV/giờ trung bình. Chi phí và lãi của giờ thêm chưa tính vì chưa nhập commission và rate.</p>
    </div>
  );
};

const ChannelPlan: React.FC<{ b: Brand; o: MonthOutlook; p: HandlingPlan; name: string }> = ({ b, o, p, name }) => (
  <Card className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-black text-[var(--text)] flex items-center gap-2"><BrandLogo brand={b} size="xs" /> {name}</h4>
      <LandingChip keyName={p.landing} />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      {[
        ["Dự phóng", o.projectionMethod === "none" ? "—" : money(o.projected)],
        ["Target", o.target ? money(o.target.total) : "chưa có"],
        ["Giờ còn trong lịch", hrs(p.remainingHours)],
        ["GMV/giờ cần", p.needRate != null ? money(p.needRate) : "—"]
      ].map(([k, v]) => (
        <div key={k} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-2.5">
          <p className="text-[11px] text-[var(--text-faint)]">{k}</p>
          <p className="font-black text-[var(--text)] text-sm mt-0.5">{v}</p>
        </div>
      ))}
    </div>
    <p className="text-sm text-[var(--text-muted)] leading-snug">{MODE_TEXT[p.mode](o, p)}</p>
    {p.levers.length === 0 ? (
      <p className="text-sm text-[var(--text-faint)]">Không có đòn bẩy nào nổi lên từ dữ liệu hiện có.</p>
    ) : (
      <ul className="space-y-2.5">
        {p.levers.map((l) => (
          <li key={l.id} className="flex gap-2.5">
            <span className={`shrink-0 mt-0.5 h-fit text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${TONE_CLS[l.tone]}`}>{TONE_LABEL[l.tone]}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text)] leading-snug">{l.title}</p>
              <p className="text-xs text-[var(--text-muted)] leading-snug">{l.detail}</p>
              <p className="text-[11px] text-[var(--text-faint)] leading-snug mt-0.5">Căn cứ: {l.basis}</p>
            </div>
          </li>
        ))}
      </ul>
    )}
    <WhatIfBox o={o} p={p} />
  </Card>
);

export const ActionPlan: React.FC<{ m: DashModel }> = ({ m }) => {
  const rows = m.brands
    .filter((b) => m.scopeIds.includes(b.id))
    .map((b) => ({ b, o: m.outlooks.get(b.id), p: m.handling.get(b.id) }))
    .filter((x): x is { b: Brand; o: MonthOutlook; p: HandlingPlan } => !!x.o && !!x.p && (x.o.actual > 0 || x.o.pending.length > 0));
  // Cần hành động nhất lên đầu: sẽ hụt → khó đạt → chưa chắc → chưa có target → chắc đạt.
  const rank: Record<string, number> = { short: 0, unlikely: 1, likely: 2, no_forecast: 3, no_target: 4, safe: 5 };
  rows.sort((a, z) => rank[a.p.mode] - rank[z.p.mode]);
  return (
    <div className="space-y-4">
      <SectionTitle title="Action theo dự phóng" note={`Tháng ${Number(m.month.slice(5))} · mỗi kênh một thẻ, kênh cần hành động nhất lên đầu`} />
      {rows.length === 0 ? <Card><p className="text-sm text-[var(--text-faint)]">Chưa có kênh nào có số hay lịch trong tháng này.</p></Card> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {rows.map(({ b, o, p }) => <ChannelPlan key={b.id} b={b} o={o} p={p} name={m.channelName(b)} />)}
        </div>
      )}
    </div>
  );
};
