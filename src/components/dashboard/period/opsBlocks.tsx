import React from "react";
import type { Brand, LiveSession } from "../../../types";
import { financeOf, type PnlFn } from "../../../lib/performance/ceoBrief";
import {
  aggregate,
  channelGph,
  coRows,
  heatKeyOf,
  hostRows,
  pairRows,
  indexBy,
  lateMinutes,
  LATE_MAX_MIN,
  LATE_MIN,
  SHIFT_LEN_LABELS,
  shiftLenOf,
  SLOT_BLOCKS,
  slotLabel,
  slotOf,
  WEAK_SESSIONS,
  type CoRow,
  type HostRow
} from "../../../lib/performance/periodCompare";
import { Card, money, pct } from "../shared";
import { BlockHead, Chg, IdxCell, IdxDelta, TD, Table } from "./ui";

// Khối "Vận hành" + "Đội live" của Dashboard so cùng kỳ (22/10/2026). Mỗi khối nhận ca ĐÃ CHẠY của kỳ này (`cur`) và kỳ so sánh
// (`prev`, null = không so) cùng nhãn kỳ — tự tính bằng lib/performance/periodCompare.ts, không tự đặt luật.

export interface Scope {
  cur: LiveSession[];
  prev: LiveSession[] | null;
  label: string;
  prevLabel: string;
}

const hrs = (h: number, d = 0) => `${h.toLocaleString("vi-VN", { maximumFractionDigits: d })}`;
const brandTag = (ids: string[], brands: Brand[], show: boolean) =>
  show && ids.length ? <span className="ml-1.5 text-[11px] font-normal text-[var(--text-faint)]">{ids.map((id) => brands.find((b) => b.id === id)?.name ?? "").filter(Boolean).join(" · ")}</span> : null;

// ---------------------------------------------------------------------------
// Lên sóng trễ
// ---------------------------------------------------------------------------

export const LateCard: React.FC<{ s: Scope }> = ({ s }) => {
  const c = aggregate(s.cur), b = s.prev ? aggregate(s.prev) : null;
  const max = Math.max(0.1, c.lateRate ?? 0, b?.lateRate ?? 0);
  const col = (v: number | null) => (v == null ? "var(--text-faint)" : v > 0.06 ? "var(--danger)" : v > 0.03 ? "var(--warning)" : "var(--text-muted)");
  const rows: [string, typeof c | null][] = [[`Kỳ này · ${s.label}`, c], [`Kỳ so sánh · ${s.prevLabel}`, b]];
  // Host trễ nhiều nhất (ca làm host, bỏ ca lệch quá 3 tiếng).
  const byHost = (xs: LiveSession[] | null) => {
    const m = new Map<string, { name: string; n: number; late: number; sum: number }>();
    for (const x of xs ?? []) {
      const l = lateMinutes(x);
      if (l == null || l > LATE_MAX_MIN || !x.hostName) continue;
      const k = x.hostId || x.hostName;
      const o = m.get(k) ?? { name: x.hostName, n: 0, late: 0, sum: 0 };
      o.n++;
      if (l > LATE_MIN) { o.late++; o.sum += l; }
      m.set(k, o);
    }
    return m;
  };
  const mc = byHost(s.cur), mb = byHost(s.prev);
  const worst = [...mc].filter(([, p]) => p.late > 0).sort((x, y) => y[1].late - x[1].late || y[1].sum - x[1].sum).slice(0, 6);
  return (
    <Card>
      <BlockHead title="Lên sóng trễ" sub={`% ca lên sóng trễ quá ${LATE_MIN} phút so với giờ xếp`} />
      <div className="space-y-2">
        {rows.map(([lab, a]) => (
          <div key={lab} className="grid grid-cols-[minmax(0,1fr)_minmax(60px,140px)_48px] items-center gap-3 text-xs">
            <span className="text-[var(--text-muted)] truncate">{lab}{a && <span className="text-[var(--text-faint)]"> · {a.lateMeasured} ca có giờ lên sóng</span>}</span>
            <span className="h-2 rounded-full bg-[var(--surface-base)] overflow-hidden"><i className="block h-full rounded-full" style={{ width: `${a?.lateRate == null ? 0 : (a.lateRate / max) * 100}%`, background: col(a?.lateRate ?? null) }} /></span>
            <b className="text-right tabular-nums" style={{ color: col(a?.lateRate ?? null) }}>{a ? pct(a.lateRate, 1) : "—"}</b>
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--text-faint)] mt-3 leading-snug">
        <Chg cur={c.lateRate} prev={b?.lateRate} points inv /> · các ca trễ, trung bình trễ <b className="text-[var(--text-muted)]">{c.lateAvgMin == null ? "—" : `${Math.round(c.lateAvgMin)} phút`}</b>
        {b?.lateAvgMin != null && ` (kỳ trước ${Math.round(b.lateAvgMin)} phút)`}.
        {c.lateOdd > 0 && ` Bỏ ra ${c.lateOdd} ca lệch giờ trên 3 tiếng: gần như chắc là giờ xếp ghi sai, cần sửa ở Sổ Ca.`}
      </p>
      {worst.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-[var(--text)] mb-1">Trễ nhiều nhất {s.label}</p>
          <Table head={["Host", "Sessions", "Trễ >5p", "Trễ TB", "Kỳ trước"]}>
            {worst.map(([k, p]) => {
              const q = mb.get(k);
              return (
                <tr key={k}>
                  <td className={TD}>{p.name}</td>
                  <td className={TD}>{p.n}</td>
                  <td className={TD} style={{ color: p.late >= 3 ? "var(--danger)" : undefined }}>{p.late}</td>
                  <td className={TD}>{Math.round(p.sum / p.late)} phút</td>
                  <td className={`${TD} text-[var(--text-faint)]`}>{q ? `${q.late}/${q.n} ca` : "không có ca"}</td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// GMV/giờ theo độ dài ca + lưới khung giờ (chỉ số so với chính kênh)
// ---------------------------------------------------------------------------

export const ShiftLenCard: React.FC<{ s: Scope }> = ({ s }) => {
  const ic = indexBy(s.cur, shiftLenOf), ib = s.prev ? indexBy(s.prev, shiftLenOf) : new Map();
  const max = Math.max(130, ...[...ic.values()].map((x) => x.index));
  return (
    <Card>
      <BlockHead title="GMV/giờ theo độ dài ca" sub={`${s.label} · mỗi ca so với GMV/giờ trung bình của chính kênh đó (100 = bằng kênh), nên brand bán to không kéo lệch`} />
      <div className="space-y-2">
        {SHIFT_LEN_LABELS.map((lab, i) => {
          const x = ic.get(i);
          if (!x) return null;
          const y = ib.get(i);
          const color = x.n < WEAK_SESSIONS ? "var(--text-faint)" : x.index >= 105 ? "var(--success)" : x.index <= 95 ? "var(--danger)" : "var(--text-muted)";
          return (
            <div key={lab} className="grid grid-cols-[minmax(0,1fr)_minmax(60px,160px)_36px] items-center gap-3 text-xs">
              <span className="text-[var(--text-muted)] truncate">{lab} <span className="text-[var(--text-faint)]">· {x.n} ca{y ? ` · kỳ trước ${y.index}` : ""}</span></span>
              <span className="relative h-2 rounded-full bg-[var(--surface-base)]">
                <i className="absolute inset-y-0 left-0 rounded-full opacity-80" style={{ width: `${(x.index / max) * 100}%`, background: color }} />
                <b className="absolute -top-0.5 -bottom-0.5 w-px bg-[var(--text-faint)]" style={{ left: `${(100 / max) * 100}%` }} />
              </span>
              <b className="text-right tabular-nums" style={{ color }}>{x.index}</b>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[var(--text-faint)] mt-3">Vạch xám = 100. Số nhỏ "kỳ trước" = chỉ số của {s.prevLabel}.</p>
    </Card>
  );
};

const WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const HEAT_BLOCKS = [4, 5, 6, 7, 8, 9, 10, 11];

export const HeatCard: React.FC<{ s: Scope }> = ({ s }) => {
  const mc = indexBy(s.cur, heatKeyOf), mb = s.prev ? indexBy(s.prev, heatKeyOf) : new Map();
  return (
    <Card>
      <BlockHead title="GMV/giờ theo khung giờ" sub={`${s.label} · mỗi ca so với chính kênh của nó (100 = bằng kênh) · rê chuột để xem chỉ số ${s.prevLabel}`} />
      <div className="overflow-x-auto">
        <div className="grid gap-1 min-w-[420px]" style={{ gridTemplateColumns: `28px repeat(${HEAT_BLOCKS.length}, minmax(0,1fr))` }}>
          <span />
          {HEAT_BLOCKS.map((x) => <span key={x} className="text-[11px] text-center text-[var(--text-faint)]">{String(x * 2).padStart(2, "0")}h</span>)}
          {WD.map((w, wi) => (
            <React.Fragment key={w}>
              <span className="text-[11px] text-[var(--text-faint)] self-center">{w}</span>
              {HEAT_BLOCKS.map((x) => {
                const v = mc.get(`${wi}|${x}`), q = mb.get(`${wi}|${x}`);
                if (!v || v.hours < 3) return <span key={x} className="h-7 rounded text-center text-[var(--text-faint)] text-xs leading-7" title={`${w} ${x * 2}h: ${v ? hrs(v.hours, 1) : 0} giờ live`}>·</span>;
                const t = Math.max(-1, Math.min(1, (v.index - 100) / 40));
                const bg = Math.abs(v.index - 100) < 5 ? "var(--surface-base)" : `color-mix(in srgb, ${t > 0 ? "var(--success)" : "var(--danger)"} ${Math.round((0.1 + Math.abs(t) * 0.65) * 100)}%, transparent)`;
                return (
                  <span key={x} className="h-7 rounded text-center text-xs font-bold leading-7 tabular-nums text-[var(--text)]" style={{ background: bg }}
                    title={`${w} ${x * 2}–${x * 2 + 2}h: chỉ số ${v.index}, ${hrs(v.hours)} giờ live${q && q.hours >= 3 ? ` · kỳ trước ${q.index}` : " · kỳ trước chưa đủ giờ"}`}>
                    {v.index}
                  </span>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Đội live: host (GMV) | trợ live (giờ)
// ---------------------------------------------------------------------------

export const HostTable: React.FC<{ s: Scope; brands: Brand[]; showBrand: boolean; minSessions?: number; title?: string }> = ({ s, brands, showBrand, minSessions = 3, title = "Host" }) => {
  const rows = hostRows(s.cur).filter((r) => r.n >= minSessions);
  const prev = new Map((s.prev ? hostRows(s.prev) : []).map((r): [string, HostRow] => [r.id, r]));
  return (
    <Card>
      <BlockHead title={title} sub={`${s.label} · ${minSessions > 1 ? `host từ ${minSessions} ca` : "mọi host có ca, dưới 3 ca để xám"} · GMV = các ca người đó làm host · chỉ số 100 = GMV/giờ trung bình của chính kênh đó · so với ${s.prevLabel}`} />
      <Table head={["Host", "Sessions", "Giờ live", "GMV", "Chỉ số", "vs kỳ trước"]} empty={rows.length ? undefined : minSessions > 1 ? `Chưa host nào có từ ${minSessions} ca trong kỳ này.` : `Chưa có ca có số trong ${s.label}.`}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={`${TD} font-semibold text-[var(--text)]`}>{r.name}{brandTag(r.brandIds, brands, showBrand)}</td>
            <td className={TD}>{r.n}</td>
            <td className={TD}>{hrs(r.hours)}</td>
            <td className={TD}>{money(r.gmv)}</td>
            <td className={TD}><IdxCell index={r.index} weak={r.n < 3} /></td>
            <td className={TD}><IdxDelta cur={r} prev={prev.get(r.id)} /></td>
          </tr>
        ))}
      </Table>
    </Card>
  );
};

export const CoTable: React.FC<{ s: Scope; brands: Brand[]; showBrand: boolean }> = ({ s, brands, showBrand }) => {
  const rows = coRows(s.cur);
  const prev = new Map((s.prev ? coRows(s.prev) : []).map((r): [string, CoRow] => [r.id, r]));
  const tot = rows.reduce((a, r) => a + r.hours, 0), totB = s.prev ? [...prev.values()].reduce((a, r) => a + r.hours, 0) : null;
  return (
    <Card>
      <BlockHead title="Trợ live" sub={<>{s.label} · chỉ tính ca và giờ (trợ không tính GMV) · tổng <b className="text-[var(--text-muted)]">{hrs(tot)} giờ</b> {totB != null && <Chg cur={tot} prev={totB} weak />}</>} />
      <Table head={["Trợ live", "Sessions", "Giờ live", "vs kỳ trước"]} empty={rows.length ? undefined : "Không có ca nào có trợ live trong kỳ này."}>
        {rows.map((r) => {
          const o = prev.get(r.id);
          return (
            <tr key={r.id}>
              <td className={`${TD} font-semibold text-[var(--text)]`}>{r.name}{brandTag(r.brandIds, brands, showBrand)}</td>
              <td className={TD}>{r.n}</td>
              <td className={TD}>{hrs(r.hours, 1)}</td>
              <td className={TD}>{o ? <><Chg cur={r.hours} prev={o.hours} weak /> <span className="text-[var(--text-faint)]">({hrs(o.hours, 1)})</span></> : <span className="text-[var(--text-faint)]">mới</span>}</td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
};

/** Cặp host + trợ live từ 2 ca chạy chung — tham khảo cách ghép người; chỉ số theo ca của cặp, không chấm riêng trợ live. */
export const PairTable: React.FC<{ s: Scope; brands: Brand[] }> = ({ s, brands }) => {
  const rows = pairRows(s.cur).filter((r) => r.n >= 2).slice(0, 15);
  const prev = new Map((s.prev ? pairRows(s.prev) : []).map((r) => [r.id, r]));
  return (
    <Card>
      <BlockHead title="Cặp host + trợ live" sub={`${s.label} · cặp chạy chung từ 2 ca · chỉ số 100 = GMV/giờ trung bình của kênh · so với ${s.prevLabel} · chỉ để xem cách ghép, trợ live không chịu trách nhiệm GMV`} />
      <Table head={["Cặp", "Brand", "Sessions", "Giờ live", "GMV", "Chỉ số", "vs kỳ trước"]} empty={rows.length ? undefined : "Chưa cặp nào có từ 2 ca chạy chung trong kỳ này."}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={`${TD} font-semibold text-[var(--text)]`}>{r.name}</td>
            <td className={`${TD} text-[var(--text-muted)]`}>{r.brandIds.map((id) => brands.find((b) => b.id === id)?.name ?? "").filter(Boolean).join(" · ")}</td>
            <td className={TD}>{r.n}</td>
            <td className={TD}>{hrs(r.hours)}</td>
            <td className={TD}>{money(r.gmv)}</td>
            <td className={TD}><IdxCell index={r.index} weak={r.n < 3} /></td>
            <td className={TD}><IdxDelta cur={r} prev={prev.get(r.id)} /></td>
          </tr>
        ))}
      </Table>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Khung giờ của MỘT kênh (Brand): GMV/giờ theo giờ bắt đầu ca
// ---------------------------------------------------------------------------

export const SlotTable: React.FC<{ s: Scope; within?: string }> = ({ s, within = "kỳ" }) => {
  const base = channelGph(s.cur), baseB = s.prev ? channelGph(s.prev) : new Map<string, number>();
  const sc = indexBy(s.cur, (x) => (slotOf(x) >= 0 ? slotOf(x) : null), base);
  const sb = s.prev ? indexBy(s.prev, (x) => (slotOf(x) >= 0 ? slotOf(x) : null), baseB) : new Map();
  const rows = SLOT_BLOCKS.map((bl, i) => ({ bl, x: sc.get(i), y: sb.get(i) })).filter((r) => r.x);
  const ok = rows.filter((r) => r.x!.n >= WEAK_SESSIONS);
  const best = [...ok].sort((p, q) => q.x!.index - p.x!.index)[0], worst = [...ok].sort((p, q) => p.x!.index - q.x!.index)[0];
  return (
    <Card>
      <BlockHead title="Khung giờ của kênh" sub={`${s.label} so với ${s.prevLabel} · theo giờ bắt đầu ca · chỉ số 100 = GMV/giờ trung bình của kênh trong ${within} · dưới 5 ca để xám`} />
      <Table head={["Khung giờ", "Sessions", "Giờ live", "GMV/giờ", "Chỉ số", "vs kỳ trước"]} empty={rows.length ? undefined : `Không có ca có số trong ${s.label}.`}>
        {rows.map((r) => {
          const weak = r.x!.n < WEAK_SESSIONS || !r.y || r.y.n < WEAK_SESSIONS;
          return (
            <tr key={r.bl[0]} className={r.x!.n < WEAK_SESSIONS ? "opacity-70" : ""}>
              <td className={TD}>{slotLabel(r.bl)}</td>
              <td className={TD}>{r.x!.n}</td>
              <td className={TD}>{hrs(r.x!.hours)}</td>
              <td className={TD}>{money(r.x!.gph)}</td>
              <td className={TD}><IdxCell index={r.x!.index} weak={r.x!.n < WEAK_SESSIONS} /></td>
              <td className={TD}>{r.y ? <><Chg cur={r.x!.gph} prev={r.y.gph} weak={weak} /> <span className="text-[var(--text-faint)]">({money(r.y.gph)})</span></> : <span className="text-[var(--text-faint)]">kỳ trước không có ca</span>}</td>
            </tr>
          );
        })}
      </Table>
      {rows.length > 0 && (
        <p className="text-xs text-[var(--text-faint)] mt-3 leading-snug">
          {best && worst && best !== worst
            ? <><b className="text-[var(--text-muted)]">{slotLabel(best.bl)}</b> đang bán tốt nhất (chỉ số {best.x!.index}, {best.x!.n} ca); <b className="text-[var(--text-muted)]">{slotLabel(worst.bl)}</b> thấp nhất (chỉ số {worst.x!.index}, {hrs(worst.x!.hours)} giờ). Chỉ so các khung từ 5 ca.</>
            : "Chưa đủ khung nào có từ 5 ca để so khung tốt / khung yếu."}
        </p>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Lãi gộp mỗi giờ (CEO/admin) — chỉ cộng ca đủ dữ liệu tính tiền, luôn ghi "tính được X/Y ca" (luật Finance & P&L)
// ---------------------------------------------------------------------------

/** Cùng luật Finance & P&L (financeOf): chỉ cộng ca đủ dữ liệu, "mỗi giờ" chia giờ của chính các ca đó. */
function profitOf(xs: LiveSession[] | null, pnl: PnlFn) {
  if (!xs) return null;
  const f = financeOf(xs, pnl), h = f.pricedHours;
  return { n: f.sessions, priced: f.priced, rph: h ? f.revenue / h : null, cph: h ? f.cost / h : null, pph: h ? f.profit / h : null };
}

export const ProfitCard: React.FC<{ s: Scope; pnl: PnlFn }> = ({ s, pnl }) => {
  const c = profitOf(s.cur, pnl), b = profitOf(s.prev, pnl);
  if (!c || c.priced === 0) return null;
  const rows: [string, number | null, number | null | undefined, boolean][] = [
    ["Doanh thu agency/giờ", c.rph, b?.rph, false],
    ["Chi phí host + phòng/giờ", c.cph, b?.cph, true],
    ["Lãi gộp/giờ", c.pph, b?.pph, false]
  ];
  return (
    <Card>
      <BlockHead title="Lãi gộp mỗi giờ" sub={`${s.label} · doanh thu agency/giờ − chi phí/giờ · tính được ${c.priced}/${c.n} ca (ca thiếu giá hoặc rate không tính) · so với ${s.prevLabel}`} />
      <div className="grid grid-cols-3 gap-3">
        {rows.map(([l, v, p, inv]) => (
          <div key={l} className="min-w-0">
            <p className="text-xs text-[var(--text-muted)] truncate">{l}</p>
            <p className="text-lg font-black tabular-nums text-[var(--text)]">{money(v)}</p>
            <p className="text-[11px]"><Chg cur={v} prev={p} inv={inv} weak={!b || b.priced < WEAK_SESSIONS || c.priced < WEAK_SESSIONS} /></p>
          </div>
        ))}
      </div>
    </Card>
  );
};
