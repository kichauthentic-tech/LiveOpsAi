import React, { useMemo, useState } from "react";
import { ClipboardCopy, Target } from "lucide-react";
import type { Brand, LiveSession } from "../types";
import { SESSION_TONE, SessionEventCard, buildSessionMeta } from "./ui/SessionEventCard";
import { getBrandTheme } from "../lib/brandTheme";
import { briefToText, buildDailyTargetBrief } from "../lib/dailyTargetBrief";
import { fmtVndShort } from "../lib/format";
import { salesTerm } from "../lib/metricGlossary";
import { PlatformChip } from "./common/PlatformChip";

// Bản tin target ngày (03/11): sếp cần mỗi ngày một trang cho team live biết phiên nào cần đạt bao nhiêu để chạy số.
// Cùng nguồn target với Kế Hoạch Tháng (planTargetOf) — không nhập thêm ở đây. "Chép tin Zalo" ra đúng các số trên màn.
export const DailyTargetBriefCard: React.FC<{ sessions: LiveSession[]; date: string; brands: Brand[]; /** Ca đang chọn ở phễu benchmark + bộ đổi: bấm chip ⇒ phễu bên dưới chuyển sang ca đó. */ pickedId?: string; onPick?: (id: string) => void }> = ({ sessions, date, brands, pickedId, onPick }) => {
  const brief = useMemo(() => buildDailyTargetBrief(sessions, date), [sessions, date]);
  const [msg, setMsg] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(briefToText(brief));
      setMsg("Đã chép tin — dán vào nhóm Zalo của team live.");
    } catch {
      setMsg("Trình duyệt không cho chép — chụp màn hình khối này gửi nhóm.");
    }
  };
  const dm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const t = brief.dayTargetByPlatform;
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 space-y-3" aria-label="Bản tin target ngày">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-[var(--text)] flex items-center gap-2"><Target className="w-4 h-4 text-[var(--accent-text)]" /> Bản tin target {dm}{onPick && <span className="font-medium text-xs text-[var(--text-muted)]"> · bấm vào ca để xem phễu</span>}</h3>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-[var(--text-muted)]">{msg}</span>}
          <button type="button" onClick={copy} disabled={brief.totalSessions === 0} className="inline-flex items-center gap-1.5 min-h-[30px] px-3 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40">
            <ClipboardCopy className="w-3.5 h-3.5" /> Chép tin Zalo
          </button>
        </div>
      </div>
      {brief.totalSessions === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Ngày này không có phiên live.</p>
      ) : (
        <>
          <p className="text-xs text-[var(--text-muted)]">
            <b className="text-[var(--text)]">{brief.totalSessions}</b> phiên · target TikTok <b className="text-[var(--text)] tabular-nums">{fmtVndShort(t.TikTok)}</b> · Shopee <b className="text-[var(--text)] tabular-nums">{fmtVndShort(t.Shopee)}</b>
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {brief.channels.map((c) => {
              const gap = Math.max(0, c.monthTarget - c.monthActual);
              const pct = c.monthTarget > 0 ? Math.min(100, Math.round((c.monthActual / c.monthTarget) * 100)) : 0;
              return (
                <div key={c.key} className="rounded-xl border border-[var(--border)] p-3 space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0 text-sm font-bold text-[var(--text)]"><span className="truncate">{c.brandName}</span><PlatformChip platform={c.platform} /></span>
                    <span className="sc-brief-day shrink-0"><span>target ngày</span><b>{fmtVndShort(c.dayTarget)}</b></span>
                  </div>
                  <div className="sc-brief grid gap-1.5 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
                    {c.sessions.map((s) => (
                      <SessionEventCard
                        key={s.id}
                        theme={getBrandTheme(s.brandName)}
                        brand={brands.find((b) => b.id === s.brandId)}
                        brandName={s.brandName}
                        platform={s.platform}
                        startTime={s.startTime}
                        endTime={s.endTime}
                        meta={buildSessionMeta(s)}
                        targetGmv={s.targetGmv}
                        tone={SESSION_TONE[s.status]}
                        className={pickedId === s.id ? "ring-2 ring-[var(--accent)]" : ""}
                        tooltip={onPick ? "Bấm để xem phễu benchmark của ca này" : undefined}
                        onClick={onPick ? () => onPick(s.id) : undefined}
                      />
                    ))}
                  </div>
                  {c.monthTarget > 0 && (
                    <div className="space-y-1">
                      <div className="h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} /></div>
                      <p className="text-[11px] text-[var(--text-muted)]">Tháng: {salesTerm(c.platform)} <b className="text-[var(--text)] tabular-nums">{fmtVndShort(c.monthActual)}</b> / {fmtVndShort(c.monthTarget)} · còn thiếu <b className="text-[var(--text)] tabular-nums">{fmtVndShort(gap)}</b> trong {c.remainingDays} ngày</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};
