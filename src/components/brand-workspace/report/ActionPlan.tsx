import React, { useEffect, useRef, useState } from "react";
import {
  ACTION_STATUS_LABEL,
  newActionItem,
  trackLabel,
  type ActionGrade,
  type ActionGradeStatus,
  type ActionItem
} from "../../../lib/report/actionPlan";
import type { TodoMetaMap } from "../../../lib/report/nextMonthPlan";
import { errorMessage } from "../../../lib/errorMessage";

// Hai khối cuối trang "Kế hoạch tháng sau" theo bản demo Report Tháng (#p9): "Đánh giá lại việc đề ra ở report tháng trước" (doneTbl)
// và "Việc tháng sau" (todoTbl: bấm vào ô để sửa, Deadline, PIC chính, thêm/xoá việc). Markup/class nguyên từ demo.css.
// Lưu: action plan ở cột action_plan (0182), Deadline + PIC ở section_notes (lib/report/nextMonthPlan.ts).

const PILL: Record<ActionGradeStatus, string> = { met: "g", missed: "r", tracking: "y", nodata: "m", awaiting: "y" };

export const ActionResultsPanel: React.FC<{
  planMonthLabel: string;
  monthLabel: string;
  items: ActionItem[];
  grades: ActionGrade[];
  final: boolean;
  throughNote: string | null;
  canManage: boolean;
  onManual: (id: string, status: "met" | "missed" | null) => Promise<void>;
}> = ({ planMonthLabel, monthLabel, items, grades, final, throughNote, canManage, onManual }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mark = async (id: string, status: "met" | "missed" | null) => {
    setBusy(id);
    setError(null);
    try {
      await onManual(id, status);
    } catch (e) {
      setError(errorMessage(e, "Lưu kết quả thất bại"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="pn">
      <div className="pnh">Đánh giá lại việc đề ra ở report {planMonthLabel}</div>
      <div className="pns">Việc đặt ra ở report {planMonthLabel}, chấm bằng số {monthLabel}{throughNote ? ` (${throughNote})` : ""}. Việc không đo bằng số do YFB đánh giá.</div>
      <div className="tw">
        <table id="doneTbl">
          <thead><tr><th className="w">Việc</th><th className="w">Chỉ tiêu</th><th className="w">Kết quả {monthLabel}</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {items.map((it, idx) => {
              const g = grades[idx];
              const onTrack = g.status === "tracking" && g.onTrack != null ? ` · ${g.onTrack ? "đang ở mức đạt" : "đang dưới mức"}` : "";
              return (
                <tr key={it.id}>
                  <td className="w">{it.action}</td>
                  <td className="w">{trackLabel(it)}</td>
                  <td className="w">{g.actualText}</td>
                  <td>
                    <span className={`pill ${PILL[g.status]}`}>{ACTION_STATUS_LABEL[g.status].toLowerCase()}{onTrack}</span>
                    {canManage && g.manual && final && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                        {(["met", "missed"] as const).map((s) => (
                          <button key={s} type="button" className={`addbk ${it.manual?.status === s ? "seg-on" : ""}`} disabled={busy === it.id} onClick={() => mark(it.id, it.manual?.status === s ? null : s)}>
                            {ACTION_STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <div className="legend"><span className="dn">{error}</span></div>}
    </div>
  );
};

// ---------- Việc tháng sau ----------

interface Row extends ActionItem {
  deadline: string;
  pic: string;
  /** Chỉ tiêu bằng số gốc — giữ lại để chuyển "Ops đánh giá" rồi quay về "App đánh giá" không mất. */
  origTarget: ActionItem["target"];
}
const toRow = (i: ActionItem, meta: TodoMetaMap): Row => ({ ...i, deadline: meta[i.id]?.deadline ?? "", pic: meta[i.id]?.pic ?? "", origTarget: i.target });
const today = () => new Date().toISOString().slice(0, 10);

/** Ô sửa tại chỗ: nội dung đặt một lần khi gắn vào DOM, gõ không làm React vẽ lại (giữ con trỏ). */
const Ce: React.FC<{ init: string; ph: string; field: string; editable: boolean; onText: (v: string) => void }> = ({ init, ph, field, editable, onText }) => (
  <div
    className="ce"
    contentEditable={editable}
    suppressContentEditableWarning
    role="textbox"
    aria-label={ph}
    data-f={field}
    data-ph={ph}
    ref={(el) => {
      if (el && el.dataset.init !== "1") {
        el.textContent = init;
        el.dataset.init = "1";
      }
    }}
    onInput={(e) => onText((e.currentTarget.innerText ?? "").replace(/ /g, " ").trim())}
  />
);

export const ActionPlanPanel: React.FC<{
  items: ActionItem[] | null;
  /** Việc tự sinh từ Insight — hiện khi chưa có plan, và là bản gốc khi bấm Khôi phục. */
  fallbackLines: string[];
  nextMonthLabel: string;
  canManage: boolean;
  /** Deadline + PIC chính theo id việc — lưu ở section_notes (lib/report/nextMonthPlan.ts), không nằm trong action_plan. */
  meta?: TodoMetaMap;
  onSave: (items: ActionItem[], meta: TodoMetaMap) => Promise<void>;
}> = ({ items, fallbackLines, nextMonthLabel, canManage, meta = {}, onSave }) => {
  const fallbackKey = fallbackLines.join("\n");
  const build = (): Row[] => (items?.length ? items : fallbackLines.map((l) => newActionItem(l))).map((i) => toRow(i, meta));
  const [rows, setRows] = useState<Row[]>(build);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  // Nạp lại khi plan đã lưu đổi từ nơi khác (chưa có sửa dở).
  useEffect(() => {
    if (!dirty.current) setRows(build());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, fallbackKey]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const persist = async (list: Row[]) => {
    const out: ActionItem[] = list.filter((r) => r.action.trim()).map(({ deadline: _d, pic: _p, origTarget: _o, ...i }) => ({ ...i, action: i.action.trim(), basis: i.basis.trim(), trackText: i.target ? "" : i.trackText.trim() }));
    const m: TodoMetaMap = Object.fromEntries(list.filter((r) => out.some((o) => o.id === r.id) && (r.deadline || r.pic.trim())).map((r) => [r.id, { deadline: r.deadline, pic: r.pic.trim() }]));
    try {
      await onSave(out, m);
      dirty.current = false;
      setStatus("Đã lưu");
    } catch (e) {
      const msg = errorMessage(e, "Lưu action plan thất bại");
      setStatus(/action_plan/.test(msg) ? "Chưa có cột action_plan — cần chạy migration 0182 trong SQL Editor." : msg);
    }
  };
  const queue = (list: Row[], now = false) => {
    rowsRef.current = list;
    dirty.current = true;
    clearTimeout(timer.current);
    setStatus("Đang lưu…");
    if (now) void persist(list);
    else timer.current = setTimeout(() => void persist(rowsRef.current), 700);
  };
  // Sửa chữ: đổi ref không vẽ lại, chỉ hẹn lưu.
  const text = (id: string, f: "action" | "basis" | "trackText", v: string) => queue(rowsRef.current.map((r) => (r.id === id ? { ...r, [f]: v } : r)));
  const patch = (id: string, p: Partial<Row>) => {
    const list = rowsRef.current.map((r) => (r.id === id ? { ...r, ...p } : r));
    setRows(list);
    queue(list);
  };
  const withD = rows.filter((r) => r.deadline).length;
  const withP = rows.filter((r) => r.pic.trim()).length;
  const late = rows.filter((r) => r.deadline && r.deadline < today()).length;
  const n = rows.length;
  return (
    <div className="pn">
      <div className="pnh">Việc {nextMonthLabel}</div>
      <div className="pns">
        {canManage
          ? `Việc và căn cứ là bản tự sinh của app khi chưa lưu; cột chỉ tiêu là đề xuất. Bấm vào ô để sửa nội dung, đặt Deadline và PIC chính, thêm hoặc xoá việc. Nội dung sửa được lưu vào report ${nextMonthLabel}.`
          : "Việc, căn cứ và chỉ tiêu theo dõi cho tháng sau; report tháng sau tự đánh giá các chỉ tiêu đo bằng số."}
      </div>
      <div className="tw">
        <table id="todoTbl">
          <thead><tr><th className="w">Việc</th><th className="w">Căn cứ</th><th className="w">Chỉ tiêu đề xuất</th><th>Deadline</th><th>PIC chính</th><th>Đánh giá</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="w"><Ce init={r.action} ph="Việc cần làm" field="a" editable={canManage} onText={(v) => text(r.id, "action", v)} /></td>
                <td className="w"><Ce init={r.basis} ph="Căn cứ" field="b" editable={canManage} onText={(v) => text(r.id, "basis", v)} /></td>
                <td className="w">
                  {r.target ? (
                    <div className="ce" title="Chỉ tiêu bằng số — app tự chấm ở report tháng sau">{trackLabel(r)}</div>
                  ) : (
                    <Ce key="t" init={r.trackText} ph="Chỉ tiêu" field="t" editable={canManage} onText={(v) => text(r.id, "trackText", v)} />
                  )}
                </td>
                <td><input className="rr" type="date" style={{ width: 118 }} value={r.deadline} disabled={!canManage} aria-label="Deadline" onChange={(e) => patch(r.id, { deadline: e.target.value })} /></td>
                <td><input className="rr" style={{ width: 88 }} placeholder="tên PIC" value={r.pic} disabled={!canManage} aria-label="PIC chính" onChange={(e) => patch(r.id, { pic: e.target.value })} /></td>
                <td>
                  <select
                    className="rr"
                    style={{ width: 112 }}
                    aria-label="Ai đánh giá"
                    disabled={!canManage}
                    value={r.target ? "app" : "ops"}
                    onChange={(e) => (e.target.value === "app" ? r.origTarget && patch(r.id, { target: r.origTarget, trackText: "" }) : patch(r.id, { target: null, trackText: r.trackText || trackLabel(r) }))}
                  >
                    <option value="app" disabled={!r.origTarget}>App đánh giá</option>
                    <option value="ops">Ops đánh giá</option>
                  </select>
                </td>
                <td>{canManage && <button type="button" className="delbk" aria-label="Xoá việc" onClick={() => { const list = rowsRef.current.filter((x) => x.id !== r.id); setRows(list); queue(list, true); }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        {canManage && <button type="button" className="addbk" onClick={() => { const list = [...rowsRef.current, toRow(newActionItem(), {})]; setRows(list); queue(list); }}>+ Thêm việc</button>}
        {canManage && items?.length ? <button type="button" className="addbk" style={{ color: "var(--muted)", borderColor: "var(--line)", background: "transparent" }} onClick={async () => { clearTimeout(timer.current); dirty.current = false; try { await onSave([], {}); setRows(fallbackLines.map((l) => toRow(newActionItem(l), {}))); setStatus("Đã khôi phục bản gốc"); } catch (e) { setStatus(errorMessage(e, "Khôi phục thất bại")); } }}>Khôi phục bản gốc</button> : null}
        <span><b style={{ color: "var(--cream)" }}>{n} việc</b> · có Deadline {withD}/{n} · có PIC {withP}/{n}{late ? <> · <span className="dn">quá hạn {late}</span></> : null}</span>
        <span className="st" aria-live="polite">{status}</span>
      </div>
    </div>
  );
};
