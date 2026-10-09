import React from "react";
import type { LiveSession } from "../../types";
import { assistantRows, hostRows, pairRows } from "../../lib/performance/ceoBrief";
import { fmtVndShort } from "../../lib/format";
import { Card, Delta, SectionTitle, hrs, money, niceMax, pct } from "./shared";

// Cột bảng xếp hạng nhân sự. < sm (điện thoại) bỏ cột thanh GMV/giờ: 6 cột tối thiểu cộng 382px, rộng hơn
// thẻ ở 375px ⇒ cả trang tràn ngang 36px (audit UX 2026-09-29). Tiêu đề cột trên điện thoại không viết hoa
// giãn chữ — "SESSIONS" viết hoa rộng ~56px, đè sang cột bên cạnh.
const STAFF_COLS =
  "grid-cols-[minmax(0,1fr)_52px_40px_52px_44px] gap-1.5 sm:gap-2 sm:grid-cols-[minmax(90px,1.3fr)_32px_44px_minmax(60px,1.6fr)_52px_64px]";

const StaffList: React.FC<{ title: string; data: ReturnType<typeof hostRows>; unassignedLabel: string }> = ({ title, data, unassignedLabel }) => {
  const max = niceMax(Math.max(data.average ?? 0, ...data.rows.map((r) => r.totals.gmvPerHour ?? 0)));
  const avg = data.average ?? 0;
  return (
    <Card>
      <h4 className="font-black text-[var(--text)] mb-2">{title}</h4>
      {data.rows.length === 0 ? (
        <p className="text-sm text-[var(--text-faint)]">Không có ca nào trong kỳ.</p>
      ) : (
        <div className="text-xs">
          <div className={`grid ${STAFF_COLS} pb-1 text-[11px] sm:uppercase sm:tracking-wider font-bold text-[var(--text-faint)]`}>
            <span>Tên</span><span className="text-right">Số ca</span><span className="text-right">Giờ live</span><span className="hidden sm:block">GMV/giờ</span><span className="text-right sm:invisible">GMV/giờ</span><span className="text-right">Kỳ trước</span>
          </div>
          {data.rows.map((r) => {
            const g = r.totals.gmvPerHour ?? 0;
            return (
              <div key={r.key} className={`grid ${STAFF_COLS} items-center py-1.5 border-t border-[var(--border)]`}
                data-tip={`${r.name}\n${r.totals.sessions} ca · ${hrs(r.totals.hours)} (${pct(r.hoursShare)} giờ kỳ)\nGMV ${money(r.totals.gmv)} · ${money(g)}/giờ\nTrung bình: ${money(avg)}/giờ`}>
                <span className="truncate text-[var(--text)] font-bold">{r.name}{r.hoursShare > 0.3 && <span className="ml-1 text-amber-300 text-[11px]">! {pct(r.hoursShare)} giờ</span>}</span>
                <span className="text-right text-[var(--text-muted)]">{r.totals.sessions}</span>
                <span className="text-right text-[var(--text-muted)]">{Math.round(r.totals.hours)}h</span>
                <span className="relative h-4 hidden sm:block">
                  <span className="absolute left-0 top-[3px] h-2.5 rounded-r" style={{ width: `${(g / max) * 100}%`, background: g >= avg ? "var(--accent)" : "var(--text-faint)" }} />
                  <span className="absolute top-0 bottom-0 w-px bg-[var(--text-muted)]" style={{ left: `${(avg / max) * 100}%` }} />
                </span>
                <span className="text-right font-bold text-[var(--text)]">{fmtVndShort(g)}</span>
                <span className="text-right">{r.prevGmvPerHour != null ? <Delta cur={g} prev={r.prevGmvPerHour} /> : <span className="text-[var(--text-faint)]">mới</span>}</span>
              </div>
            );
          })}
          {data.unassigned && (
            <p className="pt-2 border-t border-[var(--border)] text-[11px] text-[var(--text-faint)]">
              {unassignedLabel}: {data.unassigned.sessions} ca · {Math.round(data.unassigned.hours)}h · {money(data.unassigned.gmvPerHour)}/giờ — không xếp hạng.
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

export const StaffSection: React.FC<{ cur: LiveSession[]; prev: LiveSession[] }> = ({ cur, prev }) => {
  const pairs = pairRows(cur).slice(0, 5);
  return (
    <section className="space-y-3">
      <SectionTitle title="Hiệu suất nhân sự" note="GMV/giờ trong kỳ · vạch đứng = trung bình · so với kỳ trước cùng độ dài" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <StaffList title="Host" data={hostRows(cur, prev)} unassignedLabel="Chưa ghi host" />
        <StaffList title="Trợ live" data={assistantRows(cur, prev)} unassignedLabel="Không có trợ live" />
      </div>
      <Card className="!p-0 overflow-x-auto">
        <p className="px-4 pt-3 pb-1 font-black text-[var(--text)] text-sm">Cặp host + trợ live bán tốt nhất <span className="font-normal text-[var(--text-faint)] text-xs">(từ 3 ca chung trở lên)</span></p>
        {pairs.length === 0 ? (
          <p className="px-4 pb-3 text-sm text-[var(--text-faint)]">Kỳ này chưa có cặp nào chạy chung từ 3 ca — chọn kỳ dài hơn.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--border)]">
              {pairs.map((p) => (
                <tr key={`${p.host}|${p.assistant}`}>
                  <td className="px-4 py-2 text-[var(--text)]">{p.host} <span className="text-[var(--text-faint)]">+</span> {p.assistant}</td>
                  <td className="px-4 py-2 text-right text-[var(--text-muted)] whitespace-nowrap">{p.totals.sessions} ca · {Math.round(p.totals.hours)}h</td>
                  <td className="px-4 py-2 text-right text-[var(--text-muted)] whitespace-nowrap">{money(p.totals.gmv)}</td>
                  <td className="px-4 py-2 text-right font-bold text-[var(--text)] whitespace-nowrap">{money(p.totals.gmvPerHour)}/giờ</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
};
