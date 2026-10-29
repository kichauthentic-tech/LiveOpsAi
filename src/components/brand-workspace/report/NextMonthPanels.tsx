import React, { useState } from "react";
import { Undo2 } from "lucide-react";
import { PAL } from "./theme";
import { Panel, ReportTable } from "./ui";
import { fmtFixed, fmtVndShort } from "../../../lib/format";
import { errorMessage } from "../../../lib/errorMessage";
import { noiseBand } from "../../../lib/report/brandReport";
import { parseRatePct, type RefundTrackRow } from "../../../lib/report/nextMonthPlan";

// Các khối của trang "Kế hoạch tháng sau" theo bản demo Report Tháng (#p9) — markup/class nguyên từ demo.css (tiền tố .rt):
// 1 · Target Live theo loại ngày, 2 · Booking Creator + Target Creator (đọc từ tab Affiliate → Kế hoạch). Chưa có kế hoạch thì vẫn hiện khung
// và ô nhập để xem cách tính (lưu trong trình duyệt này, không ghi vào dữ liệu). Việc tháng sau và đánh giá việc tháng trước ở ActionPlan.tsx.
// Số tính ở lib/report/nextMonthPlan.ts; khối theo dõi hoàn hủy (RefundTrackPanel) ở cuối file.

const rowStyle = (idx: number) => ({ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" });

const parseNum = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
};
const sd = (d: number | null) => (d == null ? "—" : `${d >= 0 ? "+" : "−"}${fmtFixed(Math.abs(d), 0)}%`);
const mvn = (v: number | null) => (v == null ? "—" : fmtVndShort(v));
/** Lưu/đọc nháp nhập tay trong trình duyệt này; mọi lỗi lưu trữ (chế độ riêng tư, bị chặn) đều bỏ qua. */
function useLocalDraft<T>(key: string, empty: T): [T, (v: T) => boolean] {
  const [v, setV] = useState<T>(() => {
    try {
      return (JSON.parse(localStorage.getItem(key) || "null") as T | null) ?? empty;
    } catch {
      return empty;
    }
  });
  const save = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  };
  return [v, save];
}
const SAVED = "Đã lưu trong trình duyệt này";
const NOT_SAVED = "Không lưu được (trình duyệt chặn lưu trữ)";

// ---------- 1 · Target Live ----------

export interface LivePlanRow {
  key: string;
  name: string;
  /** GMV/giờ đã đạt ở tháng report (VND); null = chưa có phiên. */
  achieved: number | null;
  sessionsCur: number;
  /** Có kế hoạch trong Kế Hoạch Tháng: giờ live + Target GMV (VND) + số phiên kế hoạch. */
  plan?: { hours: number; target: number; slots: number };
}

function liveVerdict(d: number | null, band: number | null) {
  if (d == null) return <span className="pill m">chưa nhập</span>;
  if (band == null || Math.abs(d) <= band) return <span className="pill g">trong ngưỡng dao động</span>;
  return d > 0 ? <span className="pill r">vượt ngưỡng: cần tăng hiệu suất</span> : <span className="pill y">thấp hơn đáng kể mức đã đạt</span>;
}

export type LiveTargetTyped = Record<string, { h?: string; t?: string }>;
export const LIVE_TARGET_MANUAL_KEY = "next_live_target";
export const encodeLiveTarget = (m: LiveTargetTyped): string | null => {
  const clean = Object.fromEntries(Object.entries(m).filter(([, v]) => v && (v.h?.trim() || v.t?.trim())));
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
};
export function decodeLiveTarget(text: string | undefined | null): LiveTargetTyped {
  try {
    const raw = JSON.parse(text || "null") as unknown;
    return raw && typeof raw === "object" ? (raw as LiveTargetTyped) : {};
  } catch {
    return {};
  }
}

/** `saved`/`onSave`: số tự điền lưu vào dữ liệu report (brand thấy, bản xuất có); thiếu thì chỉ nháp trong trình duyệt. `canEdit`=false: chỉ hiện số đã lưu. */
export const NextLivePlanPanel: React.FC<{ nextMonth: string; curLabel: string; nextLabel: string; rows: LivePlanRow[]; total: LivePlanRow; saved?: LiveTargetTyped; onSave?: (m: LiveTargetTyped) => Promise<void>; canEdit?: boolean }> = ({ nextMonth, curLabel, nextLabel, rows, total, saved, onSave, canEdit = true }) => {
  const [localTyped, saveLocal] = useLocalDraft<LiveTargetTyped>(`liveops-report-live-plan-${nextMonth}`, {});
  const [draft, setDraft] = useState<LiveTargetTyped | null>(null);
  const typed = onSave ? draft ?? saved ?? {} : localTyped;
  const saveTyped = (next: LiveTargetTyped) => {
    if (!onSave) return saveLocal(next);
    setDraft(next);
    return true;
  };
  const [status, setStatus] = useState("");
  const commit = async () => {
    if (!onSave || !draft) return;
    try {
      await onSave(draft);
      setDraft(null);
      setStatus("Đã lưu vào report");
    } catch (e) {
      setStatus(errorMessage(e, "Lưu target thất bại"));
    }
  };
  const fromApp = rows.some((r) => r.plan);
  const calc = (r: LivePlanRow, hours: number | null, target: number | null) => {
    const req = hours && target ? target / hours : null;
    const d = req != null && r.achieved ? (req / r.achieved - 1) * 100 : null;
    return { req, d, band: noiseBand(r.sessionsCur, r.plan?.slots ?? r.sessionsCur) };
  };
  const vals = (r: LivePlanRow) => (r.plan ? { hours: r.plan.hours, target: r.plan.target } : { hours: parseNum(typed[r.key]?.h), target: (parseNum(typed[r.key]?.t) ?? 0) * 1e6 || null });
  const body = rows.map((r) => ({ r, ...vals(r) })).map((x) => ({ ...x, ...calc(x.r, x.hours, x.target) }));
  const filled = body.filter((x) => x.hours && x.target);
  const all = filled.length === rows.length && rows.length > 0;
  const sumH = filled.reduce((a, x) => a + (x.hours ?? 0), 0);
  const sumT = filled.reduce((a, x) => a + (x.target ?? 0), 0);
  const totCalc = all ? calc(total, sumH, sumT) : null;
  const cls = (d: number | null, band: number | null) => (d == null || band == null || Math.abs(d) <= band ? "nt" : d > 0 ? "dn" : "up");
  const set = (key: string, f: "h" | "t", v: string) => {
    const ok = saveTyped({ ...typed, [key]: { ...typed[key], [f]: v } });
    if (!onSave) setStatus(ok ? SAVED : NOT_SAVED);
  };
  const cell = (key: string, f: "h" | "t", ph: string, label: string) =>
    canEdit ? <input className="rr" inputMode="decimal" placeholder={ph} value={typed[key]?.[f] ?? ""} onChange={(e) => set(key, f, e.target.value)} onBlur={commit} aria-label={label} /> : <>{typed[key]?.[f] || "—"}</>;
  const bands = [...body.map((x) => `${x.r.name} ±${x.band != null ? fmtFixed(x.band, 0) : "—"}%`), `cả tháng ±${totCalc?.band != null ? fmtFixed(totCalc.band, 0) : (noiseBand(total.sessionsCur, total.sessionsCur) != null ? fmtFixed(noiseBand(total.sessionsCur, total.sessionsCur)!, 0) : "—")}%`];
  // Brand chưa có kế hoạch Chốt và ops chưa lưu số tự điền nào ⇒ chỉ còn hàng "—" / "chưa nhập", không có gì để đọc.
  if (!fromApp && !canEdit && filled.length === 0) return null;
  // Chưa có kế hoạch tháng sau và ops chưa lưu số tự điền nào ⇒ chỉ còn hàng "—" / "chưa nhập", không có gì để đọc.
  if (!fromApp && !canEdit && filled.length === 0) return null;
  return (
    <div className="pn">
      <div className="pnh">1 · Kế hoạch Target Live (YFB vận hành)</div>
      <div className="pns">
        {fromApp ? `Giờ live và Target GMV cộng từ các phiên trong Kế Hoạch Tháng ${nextLabel}. ` : "Tự điền Giờ live và Target GMV cho từng loại ngày (chưa có Kế Hoạch Tháng chốt). "}
        Bảng tính GMV/giờ yêu cầu và so với GMV/giờ đã đạt tháng {curLabel}; đánh giá theo ngưỡng dao động của từng loại ngày.{fromApp ? "" : onSave ? " Số tự điền lưu cùng report." : " Giá trị nhập lưu trong trình duyệt này."}
      </div>
      <div className="tw">
        <table id="t11Tbl">
          <thead><tr><th>Loại ngày</th><th>GMV/giờ đạt T{curLabel}</th><th>Giờ live T{nextLabel}</th><th>Target GMV T{nextLabel} (triệu)</th><th>GMV/giờ yêu cầu</th><th>So với đạt T{curLabel}</th><th className="w">Đánh giá</th></tr></thead>
          <tbody>
            {body.map((x) => (
              <tr key={x.r.key}>
                <td><b>{x.r.name}</b></td>
                <td>{mvn(x.r.achieved)}</td>
                <td>{x.r.plan ? fmtFixed(x.r.plan.hours, 1) : cell(x.r.key, "h", "giờ", `Giờ live tháng ${nextLabel} ${x.r.name}`)}</td>
                <td>{x.r.plan ? fmtFixed(Math.round(x.r.plan.target / 1e6), 0) : cell(x.r.key, "t", "triệu đồng", `Target GMV tháng ${nextLabel} ${x.r.name}`)}</td>
                <td>{mvn(x.req)}</td>
                <td className={cls(x.d, x.band)}>{sd(x.d)}</td>
                <td className="w">{liveVerdict(x.d, x.band)}</td>
              </tr>
            ))}
            <tr className="hl">
              <td><b>Cả tháng</b></td>
              <td>{mvn(total.achieved)}</td>
              <td>{all ? fmtFixed(sumH, 1) : "—"}</td>
              <td>{all ? fmtFixed(Math.round(sumT / 1e6), 0) : "—"}</td>
              <td>{mvn(totCalc?.req ?? null)}</td>
              <td className={cls(totCalc?.d ?? null, totCalc?.band ?? null)}>{sd(totCalc?.d ?? null)}</td>
              <td className="w">{all ? liveVerdict(totCalc?.d ?? null, totCalc?.band ?? null) : <span className="pill m">nhập đủ {rows.length} loại ngày</span>}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span>{fromApp ? "" : "Target nhập theo triệu đồng (ví dụ 2300 = 2,3B). "}GMV/giờ yêu cầu = Target ÷ Giờ live. Ngưỡng dao động: {bands.join(", ")}.</span>
        <span className="st" aria-live="polite">{status}</span>
      </div>
    </div>
  );
};

// ---------- 2 · Booking Creator ----------

export interface BookingRow {
  date: string | null;
  creator: string;
  camp?: string;
  timeline?: string;
  hours: number | null;
  target: number | null;
  budgetAds: number | null;
  /** GMV/giờ tốt nhất của creator ở tháng report (VND). */
  ref: number | null;
}
interface TypedBooking { d?: string; c?: string; camp?: string; tl?: string; h?: string; t?: string; a?: string }
const CAMPS = ["Daily", "D-Day", "Mid-Month", "Pay Day"];

export const BookingPlanPanel: React.FC<{
  nextMonth: string;
  curLabel: string;
  nextLabel: string;
  planRows: BookingRow[];
  /** Tháng report: số phiên, giờ, Direct GMV, GMV/giờ, ROAS của các phiên creator đã live. */
  cur: { sessions: number; hours: number; gmv: number; gmvPerHour: number | null; roas: number | null };
  /** Gợi ý GMV/giờ theo creator (khoá viết thường) cho ô nhập tay. */
  refByCreator: Record<string, number>;
  draftNote?: string;
  /** false (brand / file xuất gửi brand): không có phiên nào trong tab Affiliate thì ẩn khối — bảng nhập tay chỉ để ops tính thử. */
  canEdit: boolean;
}> = ({ nextMonth, curLabel, nextLabel, planRows, cur, refByCreator, draftNote, canEdit }) => {
  const fromApp = planRows.length > 0;
  const [typed, saveTyped] = useLocalDraft<TypedBooking[]>(`liveops-report-booking-${nextMonth}`, [{}, {}, {}]);
  const [status, setStatus] = useState("");
  const commit = (next: TypedBooking[]) => setStatus(saveTyped(next.length ? next : [{}]) ? SAVED : NOT_SAVED);
  const rows: (BookingRow & { idx: number })[] = fromApp
    ? planRows.map((r, idx) => ({ ...r, idx }))
    : typed.map((r, idx) => ({ idx, date: r.d || null, creator: r.c ?? "", camp: r.camp, timeline: r.tl, hours: parseNum(r.h), target: r.t ? (parseNum(r.t) ?? 0) * 1e6 || null : null, budgetAds: r.a ? (parseNum(r.a) ?? 0) * 1e6 || null : null, ref: refByCreator[(r.c ?? "").trim().toLowerCase()] ?? null }));
  const withTarget = rows.filter((r) => r.target);
  const n = withTarget.length;
  const hours = withTarget.reduce((a, r) => a + (r.hours ?? 0), 0);
  const target = withTarget.reduce((a, r) => a + (r.target ?? 0), 0);
  const ads = withTarget.reduce((a, r) => a + (r.budgetAds ?? 0), 0);
  const gph = hours ? target / hours : null;
  const roas = ads ? target / ads : null;
  const vs = (a: number | null, b: number | null) => (a != null && b ? (a / b - 1) * 100 : null);
  const patch = (i: number, p: TypedBooking) => commit(typed.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const dmy = (d: string | null) => (d ? `${d.slice(8)}/${d.slice(5, 7)}` : "—");
  if (!fromApp && !canEdit) return null;
  if (!fromApp && !canEdit) return null;
  return (
    <div className="pn">
      <div className="pnh">2 · Kế hoạch Booking Creator và Target Creator</div>
      <div className="pns">
        <b style={{ color: "var(--gold)" }}>Nguồn trong app: tab Affiliate → Kế hoạch (dán từ Google Sheet), không nhập lại.</b>{" "}
        {fromApp ? `Tháng ${nextLabel} có ${planRows.length} phiên trong tab Affiliate. ` : `Tháng ${nextLabel} hiện chưa có kế hoạch nào trong tab Affiliate; bảng dưới cho nhập tay chỉ để xem cách tính. `}
        Target Creator của tháng là tổng Target các phiên. GMV/giờ và ROAS yêu cầu tự tính; cột tham chiếu là GMV/giờ tốt nhất của creator trong tháng {curLabel} (nếu có); dòng tổng so với tháng {curLabel} ({cur.sessions} phiên, {fmtFixed(cur.hours, 1)} giờ, {mvn(cur.gmv)}, {mvn(cur.gmvPerHour)}/giờ, ROAS {cur.roas != null ? `${fmtFixed(cur.roas, 1)}x` : "—"}).
      </div>
      <div className="tw">
        <table id="bkTbl">
          <thead><tr><th>Ngày</th><th>Creator</th><th>Loại ngày</th><th>Khung giờ</th><th>Giờ live</th><th>Target GMV (triệu)</th><th>Budget Ads (triệu)</th><th>GMV/giờ yêu cầu</th><th>ROAS yêu cầu</th><th>GMV/giờ T{curLabel} (so)</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const g = r.hours && r.target ? r.target / r.hours : null;
              const ro = r.target && r.budgetAds ? r.target / r.budgetAds : null;
              const d = g != null && r.ref ? (g / r.ref - 1) * 100 : null;
              const t = fromApp ? null : typed[r.idx];
              return (
                <tr key={r.idx}>
                  <td>{fromApp ? dmy(r.date) : <input className="rr wd" type="date" value={t?.d ?? ""} onChange={(e) => patch(r.idx, { d: e.target.value })} aria-label="Ngày live" />}</td>
                  <td>{fromApp ? r.creator : <input className="rr wd" inputMode="text" placeholder="creator" value={t?.c ?? ""} onChange={(e) => patch(r.idx, { c: e.target.value })} aria-label="Creator" />}</td>
                  <td>{fromApp ? r.camp || "—" : <select className="rr" value={t?.camp ?? "Daily"} onChange={(e) => patch(r.idx, { camp: e.target.value })} aria-label="Loại ngày">{CAMPS.map((x) => <option key={x}>{x}</option>)}</select>}</td>
                  <td>{fromApp ? r.timeline || "—" : <input className="rr" placeholder="19h–24h" value={t?.tl ?? ""} onChange={(e) => patch(r.idx, { tl: e.target.value })} aria-label="Khung giờ" />}</td>
                  <td>{fromApp ? (r.hours != null ? fmtFixed(r.hours, 1) : "—") : <input className="rr" inputMode="decimal" placeholder="giờ" value={t?.h ?? ""} onChange={(e) => patch(r.idx, { h: e.target.value })} aria-label="Giờ live" />}</td>
                  <td>{fromApp ? mvn(r.target) : <input className="rr" inputMode="decimal" placeholder="triệu" value={t?.t ?? ""} onChange={(e) => patch(r.idx, { t: e.target.value })} aria-label="Target GMV" />}</td>
                  <td>{fromApp ? mvn(r.budgetAds) : <input className="rr" inputMode="decimal" placeholder="triệu" value={t?.a ?? ""} onChange={(e) => patch(r.idx, { a: e.target.value })} aria-label="Budget Ads" />}</td>
                  <td>{mvn(g)}</td>
                  <td>{ro == null ? "—" : `${fmtFixed(ro, 1)}x`}</td>
                  <td className={g != null && r.ref ? (g / r.ref > 1 ? "dn" : "up") : "nt"}>{r.ref ? `${mvn(r.ref)}${d != null ? ` (${sd(d)})` : ""}` : "—"}</td>
                  <td>{fromApp ? null : <button type="button" className="delbk" aria-label="Xoá phiên" onClick={() => commit(typed.filter((_, k) => k !== r.idx))}>×</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="legend">
        {!fromApp && <button type="button" className="addbk" onClick={() => commit([...typed, {}])}>+ Thêm phiên</button>}
        <span>
          {n ? (
            <>
              <b style={{ color: "var(--cream)" }}>{n} phiên · {fmtFixed(hours, 1)} giờ · Target {mvn(target)} · Ads {mvn(ads)}{roas != null ? ` · ROAS ${fmtFixed(roas, 1)}x` : ""}</b>
              {gph != null && <> · GMV/giờ yêu cầu {mvn(gph)} <span className={cur.gmvPerHour && gph > cur.gmvPerHour ? "dn" : "up"}>({sd(vs(gph, cur.gmvPerHour))} so với tháng {curLabel}: {mvn(cur.gmvPerHour)})</span></>}
              {roas != null && cur.roas != null && <> · ROAS <span className={roas > cur.roas ? "up" : "dn"}>{sd(vs(roas, cur.roas))}</span> so với {fmtFixed(cur.roas, 1)}x</>}
            </>
          ) : "Chưa có phiên nào có Target"}
        </span>
        <span className="st" aria-live="polite">{status}</span>
        {draftNote && <span style={{ color: "var(--gold)" }}>{draftNote}</span>}
      </div>
    </div>
  );
};

/** Theo dõi hoàn hủy theo tháng: tạm tính (từ file) vs chốt (ops nhập). Mẫu số Refund rate là GMV; NMV chưa chốt luôn là ước tính. */
export const RefundTrackPanel: React.FC<{
  rows: RefundTrackRow[];
  monthLabel: (m: string) => string;
  canManage: boolean;
  onSaveFinal: (month: string, rate: number | null) => Promise<void>;
}> = ({ rows, monthLabel, canManage, onSaveFinal }) => {
  const [text, setText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async (month: string, clear = false) => {
    const raw = text[month] ?? "";
    const v = clear ? null : parseRatePct(raw);
    if (!clear && v == null) {
      setError(`Chưa đọc được tỷ lệ "${raw}" — gõ số 0–100, ví dụ 37,5.`);
      return;
    }
    setBusy(month);
    setError(null);
    try {
      await onSaveFinal(month, v);
      setText((t) => ({ ...t, [month]: "" }));
    } catch (e) {
      const msg = errorMessage(e, "Lưu tỷ lệ chốt thất bại");
      setError(/section_notes/.test(msg) ? "Chưa có cột section_notes — cần chạy migration 0121 trong SQL Editor." : msg);
    } finally {
      setBusy(null);
    }
  };
  const anyOld = rows.some((r) => r.needsReupload);
  return (
    <Panel title="Theo dõi hoàn hủy theo tháng" icon={<Undo2 className="w-4 h-4" />} sub="Refund rate = Refunds ÷ Total GMV (file Shop Analytics). Tạm tính = từ file; Chốt = tỷ lệ ops nhập sau khi sàn chốt (cuối tháng + 15 ngày).">
      <ReportTable head={["Tháng", "Mẫu file", "Refund rate từ file", "Trạng thái", "Refund rate chốt", "NMV"]} leftCols={[1, 3]}>
        {rows.map((r, idx) => (
          <tr key={r.month} style={rowStyle(idx)}>
            <td className="py-2 px-3 font-semibold whitespace-nowrap" style={{ color: PAL.cream }}>{monthLabel(r.month)}</td>
            <td className="py-2 px-3 text-left whitespace-nowrap" style={{ color: r.needsReupload ? PAL.gold : PAL.muted }}>
              {r.template === "new" ? "mẫu mới" : r.template === "old" ? "mẫu cũ" : "chưa rõ"}
              {r.exportedAt ? <span className="block text-[11px]" style={{ color: PAL.muted }}>xuất {r.exportedAt.slice(8)}/{r.exportedAt.slice(5, 7)}</span> : null}
            </td>
            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{r.fileRate != null ? `${fmtFixed(r.fileRate, 1)}%` : "—"}</td>
            <td className="py-2 px-3 text-left font-semibold whitespace-nowrap" style={{ color: r.status === "final" ? PAL.green : PAL.gold }}>{r.status === "final" ? "chốt" : "tạm tính"}</td>
            <td className="py-2 px-3 text-right">
              {canManage ? (
                <div className="flex items-center justify-end gap-1.5">
                  <input
                    value={text[r.month] ?? ""}
                    onChange={(e) => setText((t) => ({ ...t, [r.month]: e.target.value }))}
                    placeholder={r.finalRate != null ? `${fmtFixed(r.finalRate, 1)}%` : "vd. 37,5"}
                    aria-label={`Refund rate chốt ${monthLabel(r.month)}`}
                    className="w-20 rounded-lg px-2 py-1 text-xs font-mono text-right min-h-[28px]"
                    style={{ background: PAL.panel, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                  />
                  <button onClick={() => save(r.month)} disabled={busy === r.month || !(text[r.month] ?? "").trim()} className="px-2 py-1 rounded-lg text-[11px] font-bold min-h-[28px] disabled:opacity-50" style={{ background: PAL.gold, color: "#1a1500" }}>
                    Lưu
                  </button>
                  {r.finalRate != null && (
                    <button onClick={() => save(r.month, true)} disabled={busy === r.month} className="px-2 py-1 rounded-lg text-[11px] font-semibold min-h-[28px]" style={{ color: PAL.muted, border: `1px solid ${PAL.line}` }} title="Bỏ tỷ lệ chốt, quay về tạm tính">
                      Bỏ
                    </button>
                  )}
                </div>
              ) : (
                <span className="font-mono" style={{ color: PAL.cream }}>{r.finalRate != null ? `${fmtFixed(r.finalRate, 1)}%` : "—"}</span>
              )}
            </td>
            <td className="py-2 px-3 text-right whitespace-nowrap font-semibold" style={{ color: r.status === "final" ? PAL.green : PAL.gold }}>{r.status === "final" ? "số thật" : "ước tính"}</td>
          </tr>
        ))}
      </ReportTable>
      {error && <p className="text-xs font-semibold mt-2" style={{ color: PAL.red }}>{error}</p>}
      <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
        NMV của tháng chưa chốt luôn là ước tính (LIVE GMV × (1 − Refund rate)); khi ops nhập tỷ lệ chốt, tháng đó chuyển sang số thật và các tháng sau dùng tỷ lệ này để ước tính.
        {anyOld && " Các tháng mẫu cũ (28 cột, thiếu cột Tổng doanh thu) chưa so sánh được với mẫu mới cho tới khi tải lại file Shop Analytics của tháng đó."}
      </p>
    </Panel>
  );
};
