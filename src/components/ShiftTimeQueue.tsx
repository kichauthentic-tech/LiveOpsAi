import React, { useEffect, useMemo, useState } from "react";
import type { LiveSession } from "../types";
import { fetchSessionTimeChecksSince } from "../lib/db/sessionTimeChecks";
import { timeIssues, type SessionTimeCheck } from "../lib/shiftTime";
import { addDays } from "../lib/dateUtils";
import { fmtDateVn } from "../lib/format";

// Cần xử lý — giờ ca (0213, user 10/11): room bật trễ ≥ 30' (kiểm lý do: team trễ, sự cố hay lịch đổi — không mặc định lỗi team) và
// ca cuối chuỗi giờ live thật lệch giờ đã khai > 5'. Ghi lý do vào ghi chú giao ca của ca đó thì dòng tự tắt. 14 ngày gần nhất.

const DAYS = 14;

export const ShiftTimeQueue: React.FC<{ sessions: LiveSession[]; today: string; brandName: (id: string) => string; onOpen: (id: string) => void }> = ({
  sessions,
  today,
  brandName,
  onOpen
}) => {
  const [checks, setChecks] = useState<SessionTimeCheck[]>([]);
  useEffect(() => {
    let alive = true;
    fetchSessionTimeChecksSince(`${addDays(today, -DAYS)}T00:00:00+07:00`)
      .then((c) => alive && setChecks(c))
      .catch(() => undefined);
    return () => { alive = false; };
  }, [today, sessions]);
  const issues = useMemo(() => timeIssues(checks, sessions), [checks, sessions]);
  if (issues.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-3 sm:p-4 space-y-2" aria-label="Giờ ca cần kiểm">
      <h3 className="text-sm font-black text-[var(--text)]">Giờ ca cần kiểm <span className="tabular-nums text-amber-300">{issues.length}</span></h3>
      <ul className="space-y-1">
        {issues.map((x) => {
          const s = x.session;
          return (
            <li key={`${s.id}-${x.kind}`}>
              <button type="button" onClick={() => onOpen(s.id)} className="w-full text-left text-xs text-[var(--text-muted)] hover:text-[var(--text)] min-h-[32px] flex flex-wrap items-baseline gap-x-2">
                <b className="text-[var(--text)]">
                  {fmtDateVn(s.date, false)} · {brandName(s.brandId)} {s.platform} · {s.startTime.slice(0, 5)}
                </b>
                <span>
                  {x.kind === "late"
                    ? `room bật trễ ${x.minutes}' so với lịch: team trễ, sự cố hay lịch đã đổi?`
                    : x.minutes > 0
                      ? `file live dài hơn giờ đã khai ${x.minutes}': thiếu OT ở một ca trong chuỗi?`
                      : `file live ngắn hơn giờ đã khai ${-x.minutes}': thiếu Trễ / Kết thúc sớm ở một ca trong chuỗi?`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-2xs text-[var(--text-faint)]">Sửa khai báo ở Giao ca, hoặc ghi lý do để tắt dòng này.</p>
    </section>
  );
};
