import React, { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { fetchTabUsageSummary, TabUsageRow } from "../lib/db/tabViews";
import { AGENCY_TAB_LABELS, BRAND_TAB_LABELS, tabLabel } from "../lib/tabLabels";
import { errorMessage } from "../lib/errorMessage";
import { fmtNum } from "../lib/format";

// Lượt mở từng tab (0123) — số liệu để quyết gộp/bỏ mục menu (audit UX 2026-09-26, P2). Chỉ ceo/admin
// (RLS trả rỗng cho role khác). Gộp theo (workspace, tab); chia theo role vì cùng một tab, ops mở hằng ngày
// nhưng CEO không mở thì vẫn là tab cần giữ — ngược lại tab 0 lượt ở mọi role là ứng viên gộp/bỏ.

const DAY_OPTIONS = [7, 30, 90] as const;

// Tab chỉ talent thấy — không tính là "chưa ai mở" với agency khi talent chưa dùng app.
const TALENT_ONLY = new Set(["my_shifts", "my_talent_profile"]);

interface Grouped {
  key: string;
  workspace: "agency" | "brand";
  tab: string;
  label: string;
  opens: number;
  users: number;
  byRole: { role: string; opens: number }[];
  lastViewed: string;
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const TabUsagePanel: React.FC = () => {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<TabUsageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTabUsageSummary(days)
      .then((r) => { if (!cancelled) { setRows(r); setError(null); } })
      .catch((e) => { if (!cancelled) { setRows([]); setError(errorMessage(e)); } });
    return () => { cancelled = true; };
  }, [days]);

  const { grouped, unused, since, totalOpens } = useMemo(() => {
    const map = new Map<string, Grouped>();
    let first: string | null = null;
    for (const r of rows ?? []) {
      const key = `${r.workspace}:${r.tab}`;
      const g = map.get(key) ?? {
        key,
        workspace: r.workspace,
        tab: r.tab,
        label: tabLabel(r.workspace, r.tab),
        opens: 0,
        users: 0,
        byRole: [],
        lastViewed: r.lastViewed
      };
      g.opens += r.opens;
      g.users += r.users; // mỗi người chỉ có 1 role nên cộng qua các role không đếm trùng
      g.byRole.push({ role: r.role, opens: r.opens });
      if (r.lastViewed > g.lastViewed) g.lastViewed = r.lastViewed;
      map.set(key, g);
      if (!first || r.firstViewed < first) first = r.firstViewed;
    }
    const grouped = [...map.values()].sort((a, b) => b.opens - a.opens);
    for (const g of grouped) g.byRole.sort((a, b) => b.opens - a.opens);
    const seen = new Set(map.keys());
    const unused = [
      ...Object.keys(AGENCY_TAB_LABELS).filter((t) => !TALENT_ONLY.has(t) && !seen.has(`agency:${t}`)).map((t) => tabLabel("agency", t)),
      ...Object.keys(BRAND_TAB_LABELS).filter((t) => !seen.has(`brand:${t}`)).map((t) => `${tabLabel("brand", t)} (brand)`)
    ];
    return { grouped, unused, since: first, totalOpens: grouped.reduce((a, g) => a + g.opens, 0) };
  }, [rows]);

  const maxOpens = grouped[0]?.opens ?? 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-black text-base text-[var(--text)] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--accent-text)]" />
              Lượt mở từng tab
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Mỗi lần ai đó mở một tab là 1 lượt. Dùng để quyết gộp hay bỏ mục menu — tab nhiều tuần không ai mở là ứng viên.
              {since && <> Bắt đầu đếm từ {new Date(since).toLocaleDateString("vi-VN")}.</>}
            </p>
          </div>
          <div className="flex items-center bg-[var(--surface-base)] p-1 rounded-xl border border-[var(--border)] text-xs font-bold gap-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  days === d ? "bg-[var(--accent)] text-white font-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {d} ngày
              </button>
            ))}
          </div>
        </div>

        {rows === null ? (
          <div className="h-40 rounded-xl bg-[var(--surface-elevated)]/60 animate-pulse" aria-busy="true" />
        ) : error ? (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
            Chưa đọc được số liệu: {error}. Nếu báo không tìm thấy hàm <code>tab_usage_summary</code> thì migration 0123 chưa chạy.
          </p>
        ) : grouped.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Chưa có lượt mở nào trong {days} ngày.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="py-2 pr-3 font-bold">Tab</th>
                  <th className="py-2 pr-3 font-bold text-right">Lượt mở</th>
                  <th className="py-2 pr-3 font-bold text-right">Người</th>
                  <th className="py-2 pr-3 font-bold">Theo role</th>
                  <th className="py-2 font-bold text-right whitespace-nowrap">Gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => (
                  <tr key={g.key} className="border-b border-[var(--border)]/50">
                    <td className="py-2 pr-3">
                      <div className="font-bold text-[var(--text)] whitespace-nowrap">
                        {g.label}
                        {g.workspace === "brand" && (
                          <span className="ml-1.5 text-[11px] font-bold text-[var(--text-faint)]">brand</span>
                        )}
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-elevated)] w-40 max-w-full">
                        <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${maxOpens ? (g.opens / maxOpens) * 100 : 0}%` }} />
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right font-black text-[var(--text)] tabular-nums">{fmtNum(g.opens, 0)}</td>
                    <td className="py-2 pr-3 text-right text-[var(--text-muted)] tabular-nums">{fmtNum(g.users, 0)}</td>
                    <td className="py-2 pr-3 text-[var(--text-muted)]">
                      {g.byRole.map((r) => `${r.role} ${fmtNum(r.opens, 0)}`).join(" · ")}
                    </td>
                    <td className="py-2 text-right text-[var(--text-muted)] whitespace-nowrap tabular-nums">{fmtDateTime(g.lastViewed)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-2 font-bold text-[var(--text-muted)]">Tổng</td>
                  <td className="pt-2 pr-3 text-right font-black text-[var(--text)] tabular-nums">{fmtNum(totalOpens, 0)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {rows !== null && !error && unused.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-2">
          <h3 className="font-black text-sm text-[var(--text)]">Chưa ai mở trong {days} ngày ({unused.length})</h3>
          <p className="text-xs text-[var(--text-muted)]">{unused.join(" · ")}</p>
        </div>
      )}
    </div>
  );
};
