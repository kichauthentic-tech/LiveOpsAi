import React, { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { LiveSession, Talent } from "../../types";
import { getBrandTheme } from "../../lib/brandTheme";
import { profileOf } from "../../lib/platforms/profiles";
import { effectiveSegments, segmentRange } from "../../lib/staffSegments";
import { talentRoleLabel, talentShortName } from "../../lib/talentName";

// Tab "Tải Lịch Host" trả lời hai câu hỏi trong MỘT ngày: (1) ai đang bị xếp trùng giờ / quá mức giờ khuyên dùng,
// (2) ai còn rảnh để lấp ca trống. Mỗi người một hàng trên trục giờ (cùng trục với "Phòng theo giờ") nên trùng giờ
// nhìn thấy ngay là hai thẻ chồng nhau; người rảnh cả ngày gom thành một dải chip thay vì mỗi người một thẻ lớn.
// Tính cả vai Trợ live và đổi người giữa ca (staffSegments) — trước 06/10 chỉ đếm ca làm HOST.
// Chia hai nhóm Host / Trợ live theo vai CHIẾM NHIỀU GIỜ HƠN trong ngày (hoà → Host). Một người làm cả hai vai trong ngày
// chỉ đứng MỘT hàng (ở nhóm vai chính) để thẻ host và thẻ trợ trùng giờ vẫn chồng lên nhau và giờ cộng dồn cho mức 6h.

/** Mức giờ đứng ca/ngày khuyên dùng — vượt thì báo. */
export const MAX_RECOMMENDED_HOURS = 6;
const HOUR_PX = 64;
const BAR_H = 40;
const BAR_GAP = 4;
const ROW_PAD = 8;

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

type DayRole = "host" | "trợ";
const ROLE_OF: Record<"host" | "co_host", DayRole> = { host: "host", co_host: "trợ" };

interface Bar {
  key: string;
  session: LiveSession;
  /** Phút kể từ 00:00 của ngày đang xem (có thể > 1440 nếu qua đêm). */
  s: number;
  e: number;
  role: DayRole;
  lane: number;
  clash: boolean;
}

interface PersonRow {
  talent: Talent;
  bars: Bar[];
  lanes: number;
  hours: number;
  /** Giờ theo từng vai trong ngày (phút → giờ làm tròn). */
  byRole: Record<DayRole, number>;
  /** Nhóm hiển thị = vai nhiều giờ hơn. */
  primary: DayRole;
  /** Làm cả hai vai trong ngày. */
  mixed: boolean;
  clash: boolean;
  over: boolean;
}

const fmtHour = (m: number) => `${`${Math.floor(m / 60) % 24}`.padStart(2, "0")}:00`;
const fmtHours = (h: number) => `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;

function Avatar({ talent, size = 32 }: { talent: Talent; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (talentShortName(talent).trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className="rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--accent-text)] font-bold flex items-center justify-center overflow-hidden shrink-0 text-xs"
      style={{ width: size, height: size }}
    >
      {talent.avatar && !broken ? (
        <img src={talent.avatar} alt="" className="w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initial
      )}
    </span>
  );
}

interface Props {
  date: string;
  /** Mọi ca (đã trừ ca huỷ ở đây) — số giờ và trùng giờ luôn tính trên TOÀN BỘ ca trong ngày, bộ lọc chỉ chọn người hiện ra. */
  sessions: LiveSession[];
  talents: Talent[];
  /** Chỉ hiện người này (bộ lọc talent trên đầu trang). */
  talentFilter: string;
  /** Chỉ hiện người có ít nhất một ca khớp (bộ lọc phòng/brand/ô tìm kiếm trên đầu trang). */
  sessionMatches: (s: LiveSession) => boolean;
  hasSessionFilter: boolean;
  searchQuery: string;
  onOpenSession: (s: LiveSession) => void;
}

export const TalentLoadTimeline: React.FC<Props> = ({ date, sessions, talents, talentFilter, sessionMatches, hasSessionFilter, searchQuery, onOpenSession }) => {
  const [showFree, setShowFree] = useState(true);

  const { busy, groups, free, axisStart, axisEnd, totals } = useMemo(() => {
    const day = sessions.filter((s) => s.date === date && s.status !== "Cancelled");
    const q = searchQuery.trim().toLowerCase();
    const rows: PersonRow[] = [];
    const freeList: Talent[] = [];

    for (const t of talents) {
      if (talentFilter !== "ALL" && t.id !== talentFilter) continue;
      const mine = day.filter((s) => effectiveSegments(s).some((g) => g.talentId === t.id));
      const matched = mine.some(sessionMatches) || (q !== "" && t.name.toLowerCase().includes(q));
      if (hasSessionFilter && !matched) continue;

      if (mine.length === 0) {
        freeList.push(t);
        continue;
      }

      // Mỗi đoạn đứng ca của người này là một thanh (ca đổi người giữa ca → chỉ vẽ đúng đoạn của người đó; làm cả host lẫn trợ
      // cùng ca → hai thanh).
      const raw: Omit<Bar, "lane" | "clash">[] = [];
      for (const s of mine) {
        for (const [i, g] of effectiveSegments(s).filter((x) => x.talentId === t.id).entries()) {
          const w = segmentRange(s, g);
          const off = w.date === date ? 0 : 24 * 60;
          const st = off + toMin(w.startTime);
          let en = off + toMin(w.endTime);
          if (en <= st) en += 24 * 60;
          raw.push({ key: `${s.id}_${g.role}_${i}`, session: s, s: st, e: en, role: ROLE_OF[g.role] });
        }
      }
      raw.sort((a, b) => a.s - b.s || a.e - b.e);
      const clashKeys = new Set<string>();
      raw.forEach((a, i) => {
        for (const b of raw.slice(i + 1)) {
          if (a.s < b.e && b.s < a.e) {
            clashKeys.add(a.key);
            clashKeys.add(b.key);
          }
        }
      });
      const laneEnds: number[] = [];
      const bars: Bar[] = raw.map((b) => {
        const free = laneEnds.findIndex((end) => end <= b.s);
        const lane = free >= 0 ? free : laneEnds.length;
        laneEnds[lane] = b.e;
        return { ...b, lane, clash: clashKeys.has(b.key) };
      });

      const mins: Record<DayRole, number> = { host: 0, trợ: 0 };
      for (const b of raw) mins[b.role] += b.e - b.s;
      const round1 = (m: number) => Math.round((m / 60) * 10) / 10;
      const hours = round1(mins.host + mins.trợ);
      rows.push({
        talent: t,
        bars,
        lanes: Math.max(1, laneEnds.length),
        hours,
        byRole: { host: round1(mins.host), trợ: round1(mins.trợ) },
        primary: mins.trợ > mins.host ? "trợ" : "host",
        mixed: mins.host > 0 && mins.trợ > 0,
        clash: clashKeys.size > 0,
        over: hours > MAX_RECOMMENDED_HOURS
      });
    }

    // Cần xử lý trước: trùng giờ, rồi quá giờ; còn lại người lên ca sớm nhất đứng trên.
    const sev = (r: PersonRow) => (r.clash ? 2 : r.over ? 1 : 0);
    rows.sort((a, b) => sev(b) - sev(a) || a.bars[0].s - b.bars[0].s || a.talent.name.localeCompare(b.talent.name, "vi"));
    freeList.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    const groups = (["host", "trợ"] as const).map((role) => ({ role, rows: rows.filter((r) => r.primary === role) }));

    const allBars = rows.flatMap((r) => r.bars);
    const axisStart = Math.min(8 * 60, ...allBars.map((b) => Math.floor(b.s / 60) * 60));
    const axisEnd = Math.max(23 * 60, ...allBars.map((b) => Math.ceil(b.e / 60) * 60));
    return {
      busy: rows,
      groups,
      free: freeList,
      axisStart,
      axisEnd,
      totals: { clash: rows.filter((r) => r.clash).length, over: rows.filter((r) => r.over && !r.clash).length }
    };
  }, [sessions, date, talents, talentFilter, sessionMatches, hasSessionFilter, searchQuery]);

  const span = axisEnd - axisStart;
  const hours: number[] = [];
  for (let m = axisStart; m <= axisEnd; m += 60) hours.push(m);
  const timelineMinWidth = (span / 60) * HOUR_PX;
  const pct = (m: number) => `${((m - axisStart) / span) * 100}%`;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div>
          <h3 className="font-bold text-[var(--text)] text-base">Ai đang đứng ca — ai còn rảnh</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {busy.length} người có ca · {free.length} người rảnh cả ngày. Chia nhóm theo vai chính trong ngày; người làm cả hai vai chỉ hiện một hàng, giờ cộng dồn; khuyên dùng tối đa {MAX_RECOMMENDED_HOURS} giờ/ngày.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold shrink-0">
          {totals.clash > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-800">
              <AlertTriangle className="w-3 h-3" /> {totals.clash} người trùng giờ
            </span>
          )}
          {totals.over > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
              <AlertTriangle className="w-3 h-3" /> {totals.over} người quá {MAX_RECOMMENDED_HOURS} giờ
            </span>
          )}
          {totals.clash === 0 && totals.over === 0 && busy.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">Không trùng giờ, không quá tải</span>
          )}
        </div>
      </div>

      {busy.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]/80 scrollbar-thin">
          <div style={{ minWidth: 208 + timelineMinWidth }}>
            <div className="flex border-b border-[var(--border)] bg-[var(--surface-base)] text-[11px] font-mono text-[var(--text-muted)]">
              <div className="w-52 shrink-0 p-2 font-bold uppercase tracking-wider border-r border-[var(--border)] sticky left-0 bg-[var(--surface-base)] z-10">Talent</div>
              <div className="relative flex-1 h-8" style={{ minWidth: timelineMinWidth }}>
                {hours.map((m) => (
                  <span key={m} className="absolute top-2 -translate-x-1/2" style={{ left: pct(m) }}>{fmtHour(m)}</span>
                ))}
              </div>
            </div>
            {groups.filter((g) => g.rows.length > 0).map((g) => (
              <React.Fragment key={g.role}>
                <div className="border-b border-[var(--border)] bg-[var(--surface-base)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <span className="sticky left-0 inline-block px-3 py-1.5">
                    {g.role === "host" ? "Host" : "Trợ live"} · {g.rows.length} người
                  </span>
                </div>
                {g.rows.map((r) => {
              const height = ROW_PAD * 2 + r.lanes * BAR_H + (r.lanes - 1) * BAR_GAP;
              const tone = r.clash ? "text-rose-300" : r.over ? "text-amber-300" : "text-emerald-400";
              return (
                <div key={r.talent.id} className={`flex border-b border-[var(--border)]/60 last:border-b-0 ${r.clash ? "bg-rose-950/10" : ""}`}>
                  <div className="w-52 shrink-0 p-2.5 border-r border-[var(--border)] sticky left-0 bg-[var(--surface)] z-10 flex items-center gap-2.5">
                    <Avatar talent={r.talent} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--text)] truncate" title={r.talent.name}>{talentShortName(r.talent)}</p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate" title={r.mixed ? "Làm cả hai vai trong ngày" : undefined}>
                        {r.mixed
                          ? `Host ${fmtHours(r.byRole.host)} + Trợ ${fmtHours(r.byRole["trợ"])}`
                          : talentRoleLabel(r.talent.role) === (r.primary === "host" ? "Host" : "Trợ live")
                            ? talentRoleLabel(r.talent.role)
                            : `${talentRoleLabel(r.talent.role)} · hôm nay làm ${r.primary}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold leading-none ${tone}`}>{fmtHours(r.hours)}</p>
                      {(r.clash || r.over) && (
                        <p className={`text-[11px] font-bold mt-1 ${tone}`}>{r.clash ? "Trùng giờ" : `Quá ${MAX_RECOMMENDED_HOURS}h`}</p>
                      )}
                    </div>
                  </div>
                  <div className="relative flex-1" style={{ height, minWidth: timelineMinWidth }}>
                    {hours.map((m) => (
                      <span key={m} className="absolute top-0 bottom-0 border-l border-[var(--border)]/40" style={{ left: pct(m) }} />
                    ))}
                    {r.bars.map((b) => {
                      const theme = getBrandTheme(b.session.brandName);
                      const platform = profileOf({ platform: b.session.platform }).label;
                      const start = `${`${Math.floor(b.s / 60) % 24}`.padStart(2, "0")}:${`${b.s % 60}`.padStart(2, "0")}`;
                      const end = `${`${Math.floor(b.e / 60) % 24}`.padStart(2, "0")}:${`${b.e % 60}`.padStart(2, "0")}`;
                      return (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() => onOpenSession(b.session)}
                          title={`${b.session.brandName} · ${platform} · ${b.role} · ${start}–${end}${b.clash ? " — trùng giờ với ca khác" : ""}. Bấm để mở ca.`}
                          className={`absolute rounded-lg px-2 py-1 text-left overflow-hidden leading-tight hover:brightness-110 transition ${b.clash ? "ring-2 ring-rose-500" : "ring-1 ring-black/20"} ${r.mixed && b.role !== r.primary ? "opacity-80 border-2 border-dashed border-white/70" : ""}`}
                          style={{
                            left: pct(b.s),
                            width: `calc(${((b.e - b.s) / span) * 100}% - 2px)`,
                            top: ROW_PAD + b.lane * (BAR_H + BAR_GAP),
                            height: BAR_H,
                            background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                            color: theme.onPrimary
                          }}
                        >
                          <span className="block text-xs font-bold truncate">
                            {b.session.brandName} <span className="font-medium opacity-80">· {platform}</span>
                          </span>
                          <span className="block text-[11px] font-mono truncate opacity-90">
                            {start}–{end}{r.mixed && <span className="font-sans"> · {b.role}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)] italic py-6 text-center">
          {hasSessionFilter || talentFilter !== "ALL" ? "Không có talent nào có ca khớp bộ lọc trong ngày này." : "Chưa có ai đứng ca trong ngày này."}
        </p>
      )}

      {free.length > 0 && (
        <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--surface-base)]">
          <button
            type="button"
            onClick={() => setShowFree((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            {showFree ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Rảnh cả ngày · {free.length} người
          </button>
          {showFree && (
            <div className="px-3 pb-3 space-y-2">
              {(["host", "trợ"] as const).map((role) => {
                const list = free.filter((t) => (t.role === "Assistant" ? "trợ" : "host") === role);
                if (list.length === 0) return null;
                return (
                  <div key={role} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)] w-16 shrink-0">
                      {role === "host" ? "Host" : "Trợ live"} · {list.length}
                    </span>
                    {list.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text)]" title={t.name}>
                        <Avatar talent={t} size={20} />
                        <span className="font-medium">{talentShortName(t)}</span>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
