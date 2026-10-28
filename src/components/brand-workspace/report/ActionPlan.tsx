import React, { useEffect, useRef, useState } from "react";
import {
  ACTION_AUTO_KEYS,
  ACTION_AUTO_LABEL,
  ACTION_STATUSES,
  ACTION_STATUS_LABEL,
  ACTION_STATUS_TEXT,
  newActionItem,
  trackLabel,
  type ActionGrade,
  type ActionGradeStatus,
  type ActionItem,
  type ActionStatus
} from "../../../lib/report/actionPlan";
import { errorMessage } from "../../../lib/errorMessage";

// Hai bảng cuối trang "Kế hoạch tháng sau" theo bản demo Report Tháng (#p9), cùng một khuôn cột:
// Action · Căn cứ · Chỉ tiêu · (Kết quả) · Deadline · Status · PIC · Note. Bấm vào ô để sửa, tự lưu vào cột action_plan (0182)
// của report tháng VIẾT ra plan — bảng "Đánh giá lại" sửa plan của tháng trước, bảng "Việc tháng sau" sửa plan của tháng này.

const PILL: Record<ActionGradeStatus, string> = { met: "g", missed: "r", tracking: "y", nodata: "m", awaiting: "y" };
const STATUS_PILL: Record<ActionStatus, string> = { todo: "m", following: "y", done: "g", late: "r" };

/** Ô sửa tại chỗ: nội dung đặt một lần khi gắn vào DOM, gõ không làm React vẽ lại (giữ con trỏ). */
const Ce: React.FC<{ init: string; ph: string; editable: boolean; onText: (v: string) => void }> = ({ init, ph, editable, onText }) => (
  <div
    className="ce"
    contentEditable={editable}
    suppressContentEditableWarning
    role="textbox"
    aria-label={ph}
    data-ph={ph}
    ref={(el) => {
      if (el && el.dataset.init !== "1") {
        el.textContent = init;
        el.dataset.init = "1";
      }
    }}
    onInput={(e) => onText((e.currentTarget.innerText ?? "").replace(/\u00a0/g, " ").trim())}
  />
);

const clean = (list: ActionItem[]): ActionItem[] =>
  list.filter((r) => r.action.trim()).map((i) => ({ ...i, action: i.action.trim(), basis: i.basis.trim(), pic: (i.pic ?? "").trim(), note: (i.note ?? "").trim(), deadline: (i.deadline ?? "").trim(), trackText: i.target ? "" : i.trackText.trim() }));

/** Bảng sửa được dùng chung. `result` = cột Kết quả (chỉ bảng đánh giá lại). */
const ActionEditor: React.FC<{
  id: string;
  items: ActionItem[];
  canManage: boolean;
  resultTitle?: string;
  result?: (item: ActionItem, idx: number) => React.ReactNode;
  onSave: (items: ActionItem[]) => Promise<void>;
  extra?: React.ReactNode;
  onReset?: () => Promise<void>;
}> = ({ id, items, canManage, resultTitle, result, onSave, extra, onReset }) => {
  const [rows, setRows] = useState<ActionItem[]>(items);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  // Nạp lại khi plan đã lưu đổi từ nơi khác (chưa có sửa dở).
  useEffect(() => {
    if (!dirty.current) setRows(items);
  }, [items]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const persist = async (list: ActionItem[]) => {
    try {
      await onSave(clean(list));
      dirty.current = false;
      setStatus("Đã lưu");
    } catch (e) {
      const msg = errorMessage(e, "Lưu action plan thất bại");
      setStatus(/action_plan/.test(msg) ? "Chưa có cột action_plan — cần chạy migration 0182 trong SQL Editor." : msg);
    }
  };
  const queue = (list: ActionItem[], now = false) => {
    rowsRef.current = list;
    dirty.current = true;
    clearTimeout(timer.current);
    setStatus("Đang lưu…");
    if (now) void persist(list);
    else timer.current = setTimeout(() => void persist(rowsRef.current), 700);
  };
  const text = (rid: string, f: "action" | "basis" | "trackText" | "pic" | "note" | "deadline", v: string) => queue(rowsRef.current.map((r) => (r.id === rid ? { ...r, [f]: v } : r)));
  const patch = (rid: string, p: Partial<ActionItem>) => {
    const list = rowsRef.current.map((r) => (r.id === rid ? { ...r, ...p } : r));
    setRows(list);
    queue(list);
  };
  const n = rows.length;
  const done = rows.filter((r) => r.status === "done").length;
  const following = rows.filter((r) => r.status === "following").length;
  return (
    <>
      <div className="tw">
        <table id={id}>
          <thead>
            <tr>
              <th>#</th>
              <th className="w">Action</th>
              <th className="w">Căn cứ</th>
              <th className="w">Chỉ tiêu theo dõi</th>
              {result && <th className="w">{resultTitle}</th>}
              <th>Deadline</th>
              <th>Status</th>
              <th>PIC</th>
              <th className="w">Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id}>
                <td className="nt">{idx + 1}</td>
                <td className="w"><Ce init={r.action} ph="Việc cần làm" editable={canManage} onText={(v) => text(r.id, "action", v)} /></td>
                <td className="w"><Ce init={r.basis} ph="Căn cứ" editable={canManage} onText={(v) => text(r.id, "basis", v)} /></td>
                <td className="w">
                  {r.target ? (
                    <div className="ce" title="Chỉ tiêu bằng số — app tự chấm khi hết tháng">{trackLabel(r)}</div>
                  ) : (
                    <Ce init={r.trackText} ph="Chỉ tiêu" editable={canManage} onText={(v) => text(r.id, "trackText", v)} />
                  )}
                  {canManage && !r.target && result && (
                    <select className="rr" style={{ width: "100%", marginTop: 4 }} aria-label="Số tự điền" value={r.autoKey ?? ""} onChange={(e) => patch(r.id, { autoKey: (e.target.value || null) as ActionItem["autoKey"] })}>
                      <option value="">Kết quả nhập tay</option>
                      {ACTION_AUTO_KEYS.map((k) => <option key={k} value={k}>Tự điền: {ACTION_AUTO_LABEL[k]}</option>)}
                    </select>
                  )}
                </td>
                {result && <td className="w">{result(r, idx)}</td>}
                <td><div style={{ width: 96 }}><Ce init={r.deadline ?? ""} ph="Deadline" editable={canManage} onText={(v) => text(r.id, "deadline", v)} /></div></td>
                <td>
                  {canManage ? (
                    <select className="rr" style={{ width: 92, color: r.status ? `var(--${r.status === "done" ? "green" : r.status === "late" ? "red" : r.status === "following" ? "gold" : "muted"})` : undefined }} aria-label="Status" value={r.status ?? ""} onChange={(e) => patch(r.id, { status: (e.target.value || null) as ActionStatus | null })}>
                      <option value="">—</option>
                      {ACTION_STATUSES.map((s) => <option key={s} value={s}>{ACTION_STATUS_TEXT[s]}</option>)}
                    </select>
                  ) : r.status ? (
                    <span className={`pill ${STATUS_PILL[r.status]}`}>{ACTION_STATUS_TEXT[r.status]}</span>
                  ) : "—"}
                </td>
                <td><div style={{ width: 80 }}><Ce init={r.pic ?? ""} ph="PIC" editable={canManage} onText={(v) => text(r.id, "pic", v)} /></div></td>
                <td className="w"><Ce init={r.note ?? ""} ph="Note" editable={canManage} onText={(v) => text(r.id, "note", v)} /></td>
                <td>{canManage && <button type="button" className="delbk" aria-label="Xoá việc" onClick={() => { const list = rowsRef.current.filter((x) => x.id !== r.id); setRows(list); queue(list, true); }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        {canManage && <button type="button" className="addbk" onClick={() => { const list = [...rowsRef.current, newActionItem()]; setRows(list); queue(list); }}>+ Thêm việc</button>}
        {canManage && onReset && <button type="button" className="addbk" style={{ color: "var(--muted)", borderColor: "var(--line)", background: "transparent" }} onClick={async () => { clearTimeout(timer.current); dirty.current = false; try { await onReset(); setStatus("Đã khôi phục bản gốc"); } catch (e) { setStatus(errorMessage(e, "Khôi phục thất bại")); } }}>Khôi phục bản gốc</button>}
        <span><b style={{ color: "var(--cream)" }}>{n} việc</b> · Done {done}/{n} · Following {following}</span>
        {extra}
        <span className="st" aria-live="polite">{status}</span>
      </div>
    </>
  );
};

export const ActionResultsPanel: React.FC<{
  planMonthLabel: string;
  monthLabel: string;
  items: ActionItem[];
  grades: ActionGrade[];
  final: boolean;
  throughNote: string | null;
  canManage: boolean;
  onSave: (items: ActionItem[]) => Promise<void>;
}> = ({ planMonthLabel, monthLabel, items, grades, throughNote, canManage, onSave }) => (
  <div className="pn">
    <div className="pnh">Đánh giá lại việc đề ra ở report {planMonthLabel}</div>
    <div className="pns">Kết quả {monthLabel}{throughNote ? ` (${throughNote})` : ""} do app điền từ số trong report; Deadline, Status, PIC, Note do YFB nhập. Bấm vào ô để sửa.</div>
    <ActionEditor
      id="doneTbl"
      items={items}
      canManage={canManage}
      resultTitle={`Kết quả ${monthLabel}`}
      onSave={onSave}
      result={(it) => {
        const g = grades[items.findIndex((x) => x.id === it.id)];
        if (!g) return "—";
        const onTrack = g.status === "tracking" && g.onTrack != null ? ` · ${g.onTrack ? "đang ở mức đạt" : "đang dưới mức"}` : "";
        return (
          <>
            <div>{g.actualText}</div>
            {it.target && <span className={`pill ${PILL[g.status]}`} style={{ marginTop: 4 }}>{ACTION_STATUS_LABEL[g.status].toLowerCase()}{onTrack}</span>}
          </>
        );
      }}
    />
  </div>
);

export const ActionPlanPanel: React.FC<{
  items: ActionItem[] | null;
  /** Việc tự sinh từ Insight — hiện khi chưa có plan, và là bản gốc khi bấm Khôi phục. */
  fallbackLines: string[];
  nextMonthLabel: string;
  canManage: boolean;
  onSave: (items: ActionItem[]) => Promise<void>;
}> = ({ items, fallbackLines, nextMonthLabel, canManage, onSave }) => {
  const fallbackKey = fallbackLines.join("\n");
  const base = React.useMemo(() => (items?.length ? items : fallbackLines.map((l) => newActionItem(l))), [items, fallbackKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pn">
      <div className="pnh">Việc {nextMonthLabel}</div>
      <div className="pns">
        {canManage
          ? `Việc và căn cứ là bản tự sinh khi chưa lưu. Bấm vào ô để sửa nội dung, đặt Deadline, Status, PIC, Note, thêm hoặc xoá việc; report ${nextMonthLabel} tự điền kết quả khi chỉ tiêu đo được bằng số.`
          : "Việc, căn cứ và chỉ tiêu theo dõi cho tháng sau; report tháng sau tự điền kết quả các chỉ tiêu đo bằng số."}
      </div>
      <ActionEditor id="todoTbl" items={base} canManage={canManage} onSave={onSave} onReset={items?.length ? async () => onSave([]) : undefined} />
    </div>
  );
};
