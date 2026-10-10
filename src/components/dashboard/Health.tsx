import React from "react";
import { BrandLogo } from "../ui/BrandLogo";
import { addDays } from "../../lib/dateUtils";
import { inRange, monthEndOf, prevMonthOf } from "../../lib/performance/ceoBrief";
import { MAX_MONTH_HOURS, type PersonLoad } from "../../lib/performance/channelHealth";
import { hostReliability, isBorderline, reliabilityText, type HostReliability } from "../../lib/report/deepAnalysis";
import { isCountable, sessionHours } from "../../lib/performance/hostPerformance";
import { profileOf } from "../../lib/platforms/profiles";
import type { Brand } from "../../types";
import type { DashModel } from "./model";
import { Card, SectionTitle, ddmm, hrs, pct } from "./shared";

// Tab "Sức khoẻ" (10/10/2026 — thay tab Agency cũ): người, host/trợ so mặt bằng TRONG brand, xu hướng lưu lượng, cam kết giờ, kỷ luật
// dữ liệu. Bảng 20 chỉ số tháng qua tháng và bảng xếp host theo GMV/giờ thô qua brand đã bỏ: brand giải thích 81% độ chênh GMV/giờ giữa
// các ca (786 ca TikTok T6–T9) nên xếp thô là đang xếp brand. Chỉ số hiệu suất luôn trong MỘT sàn; giờ người cộng được qua hai sàn.

/** Chỉ số xu hướng: lưu lượng → chuyển đổi → giá trị đơn. Lấy từ bộ chỉ số của sàn (hồ sơ sàn), chỉ giữ chỉ số sàn đó có. */
const TREND_KEYS = ["gmvPerHour", "viewsPerHour", "viewersPerHour", "liveCtr", "ctor", "aov", "abs"];
/** Cửa sổ xét host/trợ so mặt bằng: đủ ca để có khoảng tin cậy, đủ gần để còn đúng người đúng kịch bản. */
export const STAFF_INDEX_DAYS = 90;

export const Health: React.FC<{
  m: DashModel;
  people: PersonLoad[];
  dayLimit: number;
  weekLimit: number;
  agencyTiles: React.ReactNode;
  finance: React.ReactNode;
}> = ({ m, people, dayLimit, weekLimit, agencyTiles, finance }) => (
  <div className="space-y-5 sm:space-y-7">
    {agencyTiles}
    <TrendTable m={m} />
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <PeopleCard people={people} dayLimit={dayLimit} weekLimit={weekLimit} month={m.month} />
      <StaffIndexCard m={m} />
    </div>
    <ContractAndData m={m} />
    {finance}
  </div>
);

// ---------------------------------------------------------------------------

const TrendTable: React.FC<{ m: DashModel }> = ({ m }) => {
  const prof = profileOf(m.platform);
  const defs = prof.metrics.defs.filter((d) => TREND_KEYS.includes(d.key)).sort((a, z) => TREND_KEYS.indexOf(a.key) - TREND_KEYS.indexOf(z.key));
  const months = [prevMonthOf(prevMonthOf(prevMonthOf(m.month))), prevMonthOf(prevMonthOf(m.month)), prevMonthOf(m.month), m.month];
  const brands = m.brands.filter((b) => m.scopeIds.includes(b.id));
  const through = m.coverage.completeThrough;
  const th = "px-2.5 py-2 text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)] whitespace-nowrap text-right";
  const rows = brands
    .map((b) => {
      const bs = m.platformSessions.filter((s) => s.brandId === b.id && isCountable(s));
      const cols = months.map((mo) => {
        const end = mo === m.month && through && through.startsWith(mo) ? through : monthEndOf(`${mo}-01`);
        const xs = inRange(bs, `${mo}-01`, end);
        return xs.length ? prof.metrics.ofSessions(xs, sessionHours) : null;
      });
      return { b, cols };
    })
    .filter((r) => r.cols.some(Boolean));
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <SectionTitle title="Xu hướng lưu lượng và chuyển đổi" note={`3 tháng trước + tháng ${Number(m.month.slice(5))}${through ? ` tới ${ddmm(through)}` : ""} · đổ màu so với tháng đầu bảng`} />
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="border-b border-[var(--border)]">
            <tr>
              <th className={`${th} text-left`}>Kênh · chỉ số</th>
              {months.map((mo) => <th key={mo} className={th}>T{Number(mo.slice(5))}{mo === m.month ? "*" : ""}</th>)}
              <th className={th}>Đổi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, cols }) => (
              <React.Fragment key={b.id}>
                <tr className="border-t border-[var(--border)]">
                  <td colSpan={months.length + 2} className="px-2.5 pt-3 pb-1"><span className="flex items-center gap-2 font-bold text-[var(--text)]"><BrandLogo brand={b} size="xs" /> {m.channelName(b)}</span></td>
                </tr>
                {defs.map((d) => {
                  const vals = cols.map((c) => (c ? prof.metrics.value(c, d.key) : null));
                  const first = vals.find((v) => v != null && v > 0) ?? null;
                  const last = [...vals].reverse().find((v) => v != null) ?? null;
                  const ch = first && last != null ? last / first - 1 : null;
                  const tone = ch == null || d.goodWhenUp == null || Math.abs(ch) < 0.05 ? "text-[var(--text-muted)]" : ch > 0 === d.goodWhenUp ? "text-emerald-400" : "text-rose-400";
                  return (
                    <tr key={d.key}>
                      <td className="px-2.5 py-1 pl-8 text-xs text-[var(--text-muted)] whitespace-nowrap">{d.label}</td>
                      {vals.map((v, i) => <td key={i} className="px-2.5 py-1 text-right font-mono text-xs text-[var(--text)] whitespace-nowrap">{prof.metrics.fmt(d, v)}</td>)}
                      <td className={`px-2.5 py-1 text-right font-mono text-xs font-bold whitespace-nowrap ${tone}`}>{ch == null ? "—" : `${ch >= 0 ? "+" : "−"}${Math.round(Math.abs(ch) * 100)}%`}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-[var(--text-faint)] leading-snug px-1">
        * Tháng đang chạy, tới ngày đủ số — tỷ lệ ngày camp/ngày thường chưa đủ tháng nên đọc GMV/giờ thận trọng; Views/giờ và tỷ lệ chuyển đổi ít bị ảnh hưởng hơn.
        Views/giờ (Shopee: Viewers/giờ) giảm mà chuyển đổi giữ ⇒ đòn bẩy là lưu lượng (Ads, video kéo vào live, giờ phát), không phải thay host.
      </p>
    </section>
  );
};

const PeopleCard: React.FC<{ people: PersonLoad[]; dayLimit: number; weekLimit: number; month: string }> = ({ people, dayLimit, weekLimit, month }) => {
  const top = people.slice(0, 12);
  const max = Math.max(1, ...top.map((p) => p.hostHours + p.assistantHours));
  const over = people.filter((p) => (p.peakWeek?.hours ?? 0) > weekLimit || p.heavyDays > 0);
  return (
    <Card className="space-y-3">
      <div>
        <h4 className="font-black text-[var(--text)]">Tải người · tháng {Number(month.slice(5))}</h4>
        <p className="text-xs text-[var(--text-faint)] leading-snug mt-0.5">Giờ đứng ca theo đoạn (đổi người giữa ca chia đúng phút), gồm ca sắp tới, cả hai sàn. Ngưỡng: {weekLimit} giờ/tuần (AI Training Center) và {dayLimit} giờ/ngày (Tải lịch host).</p>
      </div>
      {top.length === 0 ? <p className="text-sm text-[var(--text-faint)]">Tháng này chưa có ca nào có người.</p> : (
        <>
          <div className="flex flex-wrap gap-3 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-2 rounded-sm bg-sky-500/80" /> Host</span>
            <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-2 rounded-sm bg-emerald-500/70" /> Trợ live</span>
          </div>
          <ul className="space-y-1.5">
            {top.map((p) => {
              const heavy = (p.peakWeek?.hours ?? 0) > weekLimit || p.heavyDays > 0;
              return (
                <li key={p.talentId} className="grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-2 text-xs" title={p.channels.join(", ")}>
                  <span className="truncate text-[var(--text)]">{p.name}</span>
                  <div className="flex h-3 rounded-sm overflow-hidden bg-[var(--surface-base)]">
                    <div className="h-full bg-sky-500/80" style={{ width: `${(p.hostHours / max) * 100}%` }} />
                    <div className="h-full bg-emerald-500/70 border-l-2 border-[var(--surface)]" style={{ width: `${(p.assistantHours / max) * 100}%` }} />
                  </div>
                  <span className={`font-mono whitespace-nowrap ${heavy ? "text-amber-300 font-bold" : "text-[var(--text-muted)]"}`}>{Math.round(p.hostHours + p.assistantHours)}h</span>
                </li>
              );
            })}
          </ul>
          {over.length > 0 ? (
            <ul className="text-xs text-amber-300 space-y-0.5">
              {over.slice(0, 5).map((p) => (
                <li key={p.talentId}>{p.name}: {p.peakWeek && p.peakWeek.hours > weekLimit ? `tuần ${ddmm(p.peakWeek.start)} ${hrs(p.peakWeek.hours)}` : ""}{p.peakWeek && p.peakWeek.hours > weekLimit && p.heavyDays > 0 ? " · " : ""}{p.heavyDays > 0 ? `${p.heavyDays} ngày quá ${dayLimit} giờ` : ""} · {p.channels.length} kênh</li>
              ))}
              {over.length > 5 && <li>… và {over.length - 5} người khác</li>}
            </ul>
          ) : <p className="text-xs text-emerald-400">Chưa ai vượt ngưỡng mệt.</p>}
        </>
      )}
    </Card>
  );
};

const StaffIndexCard: React.FC<{ m: DashModel }> = ({ m }) => {
  const through = m.coverage.completeThrough ?? m.today;
  const from = addDays(through, -(STAFF_INDEX_DAYS - 1));
  const rows: (HostReliability & { role: "Host" | "Trợ live"; b: Brand })[] = [];
  for (const b of m.brands.filter((x) => m.scopeIds.includes(x.id))) {
    const h = m.health.get(b.id);
    if (!h) continue;
    // Mặt bằng của ô = cả nhóm ca của KÊNH NÀY ở cùng tháng × loại ngày × buổi — không so người qua brand.
    const xs = inRange(m.platformSessions.filter((s) => s.brandId === b.id), from, through);
    for (const r of hostReliability(xs, h.bucketOf, "host")) rows.push({ ...r, role: "Host", b });
    for (const r of hostReliability(xs, h.bucketOf, "assistant")) rows.push({ ...r, role: "Trợ live", b });
  }
  const sure = rows.filter((r) => r.verdict !== "unclear").sort((a, z) => (a.verdict === z.verdict ? z.ratio - a.ratio : a.verdict === "above" ? -1 : 1));
  const unclear = rows.filter((r) => r.verdict === "unclear" && r.sessions >= 3).length;
  return (
    <Card className="space-y-3">
      <div>
        <h4 className="font-black text-[var(--text)]">Host và trợ live so mặt bằng</h4>
        <p className="text-xs text-[var(--text-faint)] leading-snug mt-0.5">{STAFF_INDEX_DAYS} ngày tới {ddmm(through)} · GMV thực ÷ GMV kỳ vọng ở cùng kênh × tháng × loại ngày × buổi. Chỉ ghi trên/dưới khi khoảng tin cậy 95% nằm hẳn một phía.</p>
      </div>
      {sure.length === 0 ? <p className="text-sm text-[var(--text-faint)]">Chưa ai đủ ca để kết luận trên hay dưới mặt bằng{unclear ? ` (${unclear} người có từ 3 ca nhưng khoảng tin cậy còn chạm 1,00)` : ""}.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[460px]">
            <thead>
              <tr className="text-[var(--text-faint)] text-left">
                <th className="pb-1.5 pr-3">Người</th><th className="pb-1.5 pr-3">Vai · kênh</th><th className="pb-1.5 pr-3 text-right">Ca</th><th className="pb-1.5 pr-3 text-right">So mặt bằng</th><th className="pb-1.5">Kết luận</th>
              </tr>
            </thead>
            <tbody>
              {sure.map((r) => (
                <tr key={`${r.role}|${r.b.id}|${r.key}`} className="border-t border-[var(--border)]/60">
                  <td className="py-1 pr-3 text-[var(--text)]">{r.name}</td>
                  <td className="py-1 pr-3 text-[var(--text-muted)] whitespace-nowrap">{r.role} · {m.channelName(r.b)}</td>
                  <td className="py-1 pr-3 text-right font-mono">{r.sessions}</td>
                  <td className="py-1 pr-3 text-right font-mono whitespace-nowrap">{reliabilityText(r)}</td>
                  <td className={`py-1 ${r.verdict === "above" ? "text-emerald-400" : "text-rose-400"}`}>{r.verdict === "above" ? "Trên mặt bằng" : "Dưới mặt bằng"}{isBorderline(r) ? " (sát ngưỡng)" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {unclear > 0 && <p className="text-[11px] text-[var(--text-faint)] mt-2">Thêm {unclear} người có từ 3 ca nhưng chưa kết luận được — chênh lệch của họ nằm trong dao động bình thường.</p>}
        </div>
      )}
    </Card>
  );
};

const ContractAndData: React.FC<{ m: DashModel }> = ({ m }) => {
  const brands = m.brands.filter((b) => m.scopeIds.includes(b.id) && m.health.get(b.id));
  if (brands.length === 0) return null;
  const th = "px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)] whitespace-nowrap";
  return (
    <section className="space-y-3">
      <SectionTitle title="Cam kết giờ và kỷ luật dữ liệu" note={`Tháng ${Number(m.month.slice(5))} · mỗi kênh một dòng`} />
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="border-b border-[var(--border)]">
            <tr>
              <th className={`${th} text-left`}>Kênh</th>
              <th className={`${th} text-left`}>Cam kết giờ</th>
              <th className={`${th} text-right`}>Số đủ tới</th>
              <th className={`${th} text-right`}>Ca chờ số</th>
              <th className={`${th} text-right`}>Số còn khai tay</th>
              <th className={`${th} text-left`}>Lỗi nhập</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {brands.map((b) => {
              const h = m.health.get(b.id)!;
              const c = h.commitment;
              const d = h.discipline;
              const bad = c && c.committedHours > MAX_MONTH_HOURS;
              return (
                <tr key={b.id} className="align-top">
                  <td className="px-3 py-2.5"><span className="flex items-center gap-2 font-bold text-[var(--text)] whitespace-nowrap"><BrandLogo brand={b} size="xs" /> {m.channelName(b)}</span></td>
                  <td className="px-3 py-2.5 text-xs min-w-[180px]">
                    {!c ? <span className="text-[var(--text-faint)]">Chưa có cam kết</span> : bad ? <span className="text-rose-400 font-bold">Số cam kết sai (xem lỗi nhập)</span> : (
                      <>
                        <span className="text-[var(--text)] font-bold">{Math.round(c.plannedTotalHours)}/{Math.round(c.committedHours)} giờ</span>
                        <span className="text-[var(--text-faint)]"> · đã giao {Math.round(c.deliveredHours)}h, trong lịch {Math.round(c.scheduledHours)}h</span>
                        {c.gapHours > 0 && <span className="block text-amber-300">còn thiếu {Math.round(c.gapHours)} giờ phải xếp</span>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-[var(--text-muted)]">{h.coverage.completeThrough ? ddmm(h.coverage.completeThrough) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right whitespace-nowrap ${d.lagDays > 3 ? "text-rose-400 font-bold" : d.missingSessions ? "text-amber-300 font-bold" : "text-[var(--text-faint)]"}`}>{d.missingSessions || "—"}{d.lagDays > 0 ? <span className="block text-[11px] font-normal">lâu nhất {d.lagDays} ngày</span> : null}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">{d.manualShare != null ? pct(d.manualShare) : "—"}</td>
                  <td className="px-3 py-2.5 text-xs min-w-[220px]">{d.errors.length === 0 ? <span className="text-[var(--text-faint)]">—</span> : <ul className="space-y-0.5 text-rose-400">{d.errors.map((e) => <li key={e}>{e}</li>)}</ul>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-[var(--text-faint)] leading-snug px-1">Ca chờ số đỏ khi ca cũ nhất đã chờ quá 3 ngày (trung vị đối soát đo 10/10 là 3 ngày). Cam kết giờ đếm giờ ca theo lịch của ca đã diễn ra + ca còn trong lịch (cùng luật màn Hợp Đồng). "Số còn khai tay" = phần ca có số mà số chưa qua file giao ca hay đối soát (nhãn Tạm tính). Sửa cam kết ở Kế Hoạch Tháng / CRM → Hợp đồng & giá.</p>
    </section>
  );
};
