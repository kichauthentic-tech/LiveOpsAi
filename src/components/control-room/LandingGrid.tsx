import React from "react";
import type { Candidate } from "../../lib/performance/controlRoom";
import { pWithAdds } from "../../lib/performance/controlRoom";
import { money, pct } from "../dashboard/shared";
import { LandingCurve } from "./LandingCurve";
import { STATE_OF, type RoomChannel } from "./types";

// Cục diện từng kênh: đường khả năng về đích từ đầu tháng tới hôm nay + điểm "nếu áp dụng sa bàn". Kênh chưa có target / chưa đủ
// lịch sử nói rõ lý do thay vì vẽ số giả.

export const LandingGrid: React.FC<{ month: string; channels: RoomChannel[]; adds: Candidate[]; onPick?: (key: string) => void }> = ({ month, channels, adds, onPick }) => (
  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
    {channels.map((c) => {
      const r = c.room;
      const mine = adds.filter((a) => a.channelKey === c.key);
      const whatIf = r && mine.length ? pWithAdds(r, mine).pHit : null;
      // Kênh có target nhưng chưa đủ lịch sử để chiếu (Franklin Shopee T10): nhãn không được nói "Chưa có target".
      const st = !r && c.target ? { ...STATE_OF(null), label: "Chưa đủ lịch sử" } : STATE_OF(r?.now.pHit ?? null);
      return (
        <button key={c.key} type="button" onClick={() => onPick?.(c.key)} className="text-left rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 hover:border-[var(--accent)] p-3 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-sm text-[var(--text)] truncate">{c.name}</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
          </div>
          {!r ? (
            <p className="text-xs text-[var(--text-faint)]">{c.target ? <>Target {money(c.target)} · </> : null}Kênh chưa đủ lịch sử (dưới 15 ca có số) để chiếu cuối tháng.</p>
          ) : (
            <>
              <p className="text-xs text-[var(--text-muted)]">
                {r.target ? <>Target {money(r.target)} · </> : <>Chưa chốt Kế Hoạch Tháng · </>}{r.sessions.length ? <>dự kiến {money(r.now.projected)}</> : <>chưa có ca nào tháng này</>}
                {r.target != null && <> · <b className="text-[var(--text)]">{pct(r.now.pHit)}</b> <span className="text-[var(--text-faint)]">(đầu tháng {pct(r.start.pHit)})</span></>}
              </p>
              {r.target ? <LandingCurve month={month} points={r.curve} whatIf={whatIf} label={c.name} /> : <p className="text-xs text-[var(--text-faint)]">Có target khi chốt Kế Hoạch Tháng.</p>}
              {r.ratio != null && <p className="text-[11px] text-[var(--text-faint)]">Ca đã live đạt <b className={r.ratio != null && r.ratio >= 1 ? "text-emerald-400" : "text-rose-400"}>{pct(r.ratio)}</b> kỳ vọng của chính các ca đó</p>}
            </>
          )}
        </button>
      );
    })}
  </div>
);
