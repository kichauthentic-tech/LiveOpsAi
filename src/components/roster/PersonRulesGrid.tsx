import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock } from "lucide-react";
import type { Talent } from "../../types";
import { contrastRatio, getBrandTheme } from "../../lib/brandTheme";
import { InfoDot } from "../common/InfoDot";
import { loadMonthRules, type MonthRules } from "../../hooks/useMonthRules";
import type { AutoCap } from "../../lib/roster/autoCaps";
import { parseCommitmentSheet } from "../../lib/roster/commitmentSheet";
import { copyRulesToMonth, emptyBrandRule, emptyMonthRule, isMonthLocked, type MonthRule, type NightRule, type RuleRole } from "../../lib/roster/monthRules";
import { DAY_KINDS, DAY_KIND_LABEL, type DayKind } from "../../lib/roster/placementRules";
import { addDays } from "../../lib/dateUtils";
import {
  applyCellText,
  buildGridCols,
  buildGridRows,
  canDoPlatform,
  cellText,
  cellView,
  clearCellRule,
  otherRole,
  visibleCols,
  type GridBrand,
  type GridCol,
  type GridCtx,
  type GridRow,
  type Tone
} from "../../lib/roster/rulesGrid";

// LƯỚI "LUẬT ĐẶT GIỜ TỪNG NGƯỜI" kiểu Excel (Điều Phối → Thêm). Mỗi người một dòng, mỗi cột là một luật; mỗi brand một nhóm cột
// (Cả brand = nhận / trần giờ / loại ngày riêng, rồi trần giờ từng sàn). Người làm 2 vai: bấm ▸ ở tên để mở dòng vai còn lại.
// Dữ liệu theo THÁNG (bảng talent_month_rules, 0229); tháng đã qua tự khoá. Bộ xếp tự fill đọc đúng bảng này.

const monthLabel = (m: string) => `T${Number(m.slice(5))}/${m.slice(0, 4)}`;
const addMonths = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

const TONE: Record<Tone, string> = {
  auto: "italic text-[var(--text-faint)]",
  manual: "text-[var(--text)]",
  x: "text-[var(--danger)]",
  na: "",
  ro: "text-[var(--text-muted)]",
  ok: "text-[var(--text-faint)]",
  bad: "text-[var(--danger)]"
};
const chip = (on: boolean) => `min-h-7 rounded-full border px-2.5 text-xs ${on ? "seg-on" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"}`;
const segBtn = (on: boolean) => `min-h-7 rounded-lg border px-2.5 text-xs ${on ? "seg-on" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"}`;
const NIGHT_OPTS: [NightRule, string][] = [
  ["any", "Không đặt"],
  ["only", "Chỉ ca đêm"],
  ["no", "Không ca đêm"]
];

interface UndoEntry {
  before: { key: string; rule: MonthRule | null }[];
}

export const PersonRulesGrid: React.FC<{
  month: string;
  onMonth: (m: string) => void;
  today: string;
  talents: readonly Talent[];
  brands: readonly GridBrand[];
  nameOf: (id: string) => string;
  rules: MonthRules;
  autoCaps: Readonly<Record<string, AutoCap>>;
  readOnly?: boolean;
}> = ({ month, onMonth, today, talents, brands, nameOf, rules, autoCaps, readOnly }) => {
  const locked = isMonthLocked(month, today);
  const canEdit = !locked && !readOnly;
  const [role, setRole] = useState<"all" | RuleRole>("all");
  const [brandF, setBrandF] = useState("all");
  const [platF, setPlatF] = useState("all");
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [colMenu, setColMenu] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState({ r: 0, c: 2 });
  const [anchor, setAnchor] = useState({ r: 0, c: 2 });
  const [editing, setEditing] = useState<{ r: number; c: number; init: string } | null>(null);
  const [pop, setPop] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const brandName = useCallback((id: string) => brands.find((b) => b.id === id)?.name ?? "brand", [brands]);
  const cols = useMemo(() => buildGridCols(brands), [brands]);
  const autoInfo = useMemo(() => Object.fromEntries(Object.entries(autoCaps).map(([id, c]) => [id, { monthMax: c.monthMax, avg: c.avg }])), [autoCaps]);
  const allRows = useMemo(() => buildGridRows(talents, rules.rules, month, nameOf, autoInfo), [talents, rules.rules, month, nameOf, autoInfo]);
  const ctx: GridCtx = useMemo(() => ({ brandName, brandIds: brands.map((b) => b.id), siblings: (id) => rules.forTalent(id), locked: !canEdit }), [brandName, brands, rules, canEdit]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allRows.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      if (role !== "all") return r.role === role;
      return r.primary || expanded.has(r.talentId);
    });
  }, [allRows, q, role, expanded]);
  const vCols = useMemo(() => visibleCols(cols, { brand: brandF, platform: platF, role, hidden }), [cols, brandF, platF, role, hidden]);
  const groups = useMemo(() => {
    const out: { name: string; span: number }[] = [];
    for (const c of vCols) {
      const last = out[out.length - 1];
      if (last && last.name === c.group) last.span++;
      else out.push({ name: c.group, span: 1 });
    }
    return out;
  }, [vCols]);
  // Mỗi nhóm brand đúng màu thương hiệu để phân biệt cột; nhóm chung (giờ, luật, kiểm) để trung tính.
  const groupTint = useMemo(() => {
    const m = new Map<string, string>();
    // Màu chủ đạo trên logo brand (brandTheme). Brand wordmark đen (Jockey/Franklin) dùng màu accent để không ra xám đục.
    for (const b of brands) {
      const t = getBrandTheme(b.name);
      m.set(b.name, contrastRatio(t.primary, "#000000") < 3 ? t.accent : t.primary);
    }
    return m;
  }, [brands]);
  const tintOf = (group: string, pct: number, base: string) => {
    const c = groupTint.get(group);
    return c ? `color-mix(in srgb, ${c} ${pct}%, ${base})` : undefined;
  };
  const allGroups = useMemo(() => [...new Set(cols.map((c) => c.group))].filter((g) => g !== "Người"), [cols]);

  useEffect(() => {
    setSel((s) => ({ r: Math.min(s.r, Math.max(0, rows.length - 1)), c: Math.min(s.c, Math.max(0, vCols.length - 1)) }));
  }, [rows.length, vCols.length]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(t);
  }, [note]);

  // ---- ghi ---------------------------------------------------------------------------------------------------------------
  const commit = useCallback(
    (changes: { row: GridRow; next: MonthRule }[], record = true) => {
      if (!canEdit || changes.length === 0) return;
      if (record) setUndo((u) => [...u.slice(-40), { before: changes.map((c) => ({ key: c.row.key, rule: c.row.stored ? c.row.rule : null })) }]);
      void rules.save(changes.map((c) => c.next));
    },
    [canEdit, rules]
  );
  const doUndo = useCallback(() => {
    const last = undo[undo.length - 1];
    if (!last || !canEdit) return;
    setUndo((u) => u.slice(0, -1));
    const restore = last.before.filter((b) => b.rule).map((b) => b.rule!);
    const drop = last.before.filter((b) => !b.rule);
    if (restore.length) void rules.save(restore);
    for (const d of drop) {
      const [id, rl] = d.key.split("|");
      void rules.remove(id, rl as RuleRole);
    }
    setNote("Đã hoàn tác");
  }, [undo, canEdit, rules]);

  const setCell = (row: GridRow, col: GridCol, text: string) => {
    const next = applyCellText(row.rule, col, text);
    if (!next) {
      setNote("Giá trị không hợp lệ, ô giữ nguyên");
      return;
    }
    commit([{ row, next }]);
  };

  // ---- chọn / di chuyển -------------------------------------------------------------------------------------------------
  const range = { r0: Math.min(anchor.r, sel.r), r1: Math.max(anchor.r, sel.r), c0: Math.min(anchor.c, sel.c), c1: Math.max(anchor.c, sel.c) };
  const move = (dr: number, dc: number, ext = false) => {
    const r = Math.max(0, Math.min(rows.length - 1, sel.r + dr));
    const c = Math.max(0, Math.min(vCols.length - 1, sel.c + dc));
    setSel({ r, c });
    if (!ext) setAnchor({ r, c });
  };
  const openPop = (r: number, c: number) => {
    const el = boxRef.current?.querySelector(`[data-cell="${r}:${c}"]`) as HTMLElement | null;
    const b = el?.getBoundingClientRect();
    setPop({ r, c, x: Math.max(8, Math.min((b?.left ?? 100), window.innerWidth - 300)), y: Math.min((b?.bottom ?? 100) + 4, window.innerHeight - 260) });
  };
  const activate = (r: number, c: number, init?: string) => {
    const row = rows[r];
    const col = vCols[c];
    if (!row || !col) return;
    const v = cellView(row, col, ctx);
    if (!v.editable) return;
    if (v.popover) openPop(r, c);
    else setEditing({ r, c, init: init ?? cellText(row, col, ctx) });
  };

  const forRange = (fn: (row: GridRow, col: GridCol) => void) => {
    for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) if (rows[r] && vCols[c]) fn(rows[r], vCols[c]);
  };
  const applyMany = (fn: (row: GridRow, col: GridCol, cur: MonthRule) => MonthRule | null) => {
    const acc = new Map<string, { row: GridRow; next: MonthRule }>();
    forRange((row, col) => {
      if (!cellView(row, col, ctx).editable) return;
      const base = acc.get(row.key)?.next ?? row.rule;
      const next = fn(row, col, base);
      if (next) acc.set(row.key, { row, next });
    });
    commit([...acc.values()]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || pop) return;
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (k === "ArrowDown") (e.preventDefault(), move(1, 0, e.shiftKey));
    else if (k === "ArrowUp") (e.preventDefault(), move(-1, 0, e.shiftKey));
    else if (k === "ArrowRight") (e.preventDefault(), move(0, 1, e.shiftKey));
    else if (k === "ArrowLeft") (e.preventDefault(), move(0, -1, e.shiftKey));
    else if (k === "Tab") (e.preventDefault(), move(0, e.shiftKey ? -1 : 1));
    else if (k === "Enter" || k === "F2") (e.preventDefault(), activate(sel.r, sel.c));
    else if (k === "Delete" || k === "Backspace") (e.preventDefault(), applyMany((_r, col, cur) => clearCellRule(cur, col)));
    else if (mod && k.toLowerCase() === "z") (e.preventDefault(), doUndo());
    else if (mod && k.toLowerCase() === "d") {
      e.preventDefault();
      const first = rows[range.r0];
      if (!first) return;
      applyMany((row, col, cur) => (row.key === first.key ? null : applyCellText(cur, col, cellText(first, col, ctx))));
      setNote(`Đã điền xuống ${range.r1 - range.r0} dòng`);
    } else if (k.length === 1 && !mod && !e.altKey) {
      const row = rows[sel.r];
      const col = vCols[sel.c];
      if (row && col) {
        const v = cellView(row, col, ctx);
        if (v.editable && !v.popover) (e.preventDefault(), setEditing({ r: sel.r, c: sel.c, init: k }));
      }
    }
  };
  const onCopy = (e: React.ClipboardEvent) => {
    const lines: string[] = [];
    for (let r = range.r0; r <= range.r1; r++) lines.push(vCols.slice(range.c0, range.c1 + 1).map((c) => (rows[r] ? cellText(rows[r], c, ctx) : "")).join("\t"));
    e.clipboardData.setData("text/plain", lines.join("\n"));
    e.preventDefault();
    setNote(`Đã chép ${lines.length} dòng`);
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (editing) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    if (!canEdit) return setNote(locked ? "Tháng đã khoá, chỉ để xem" : "Bạn chỉ có quyền xem");
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l !== "");
    const acc = new Map<string, { row: GridRow; next: MonthRule }>();
    let n = 0;
    lines.forEach((line, i) => {
      const row = rows[sel.r + i];
      if (!row) return;
      line.split("\t").forEach((cellTxt, j) => {
        const col = vCols[sel.c + j];
        if (!col || !cellView(row, col, ctx).editable) return;
        const next = applyCellText(acc.get(row.key)?.next ?? row.rule, col, cellTxt);
        if (next) {
          acc.set(row.key, { row, next });
          n++;
        }
      });
    });
    commit([...acc.values()]);
    setNote(`Đã dán ${n} ô`);
  };

  // ---- dán từ sheet TỶ LỆ LỊCH LÀM ---------------------------------------------------------------------------------------
  const applySheet = () => {
    const parsed = parseCommitmentSheet(pasteText, talents as Talent[], brands);
    const changes: { row: GridRow; next: MonthRule }[] = [];
    const miss: string[] = [];
    for (const p of parsed.rows) {
      if (p.status !== "matched" || !p.talentId || p.duplicate) {
        miss.push(p.nameRaw);
        continue;
      }
      const row = allRows.find((r) => r.talentId === p.talentId && r.primary);
      if (!row) continue;
      const next: MonthRule = { ...row.rule, brands: { ...row.rule.brands }, maxHours: p.hours, note: p.note || row.rule.note };
      if (p.rule) {
        const general = p.rule.clauses.filter((c) => !c.brandId).flatMap((c) => c.days);
        if (general.length) next.dayKinds = [...new Set(general)] as DayKind[];
        for (const c of p.rule.clauses.filter((x) => x.brandId)) next.brands[c.brandId!] = { ...(next.brands[c.brandId!] ?? emptyBrandRule()), days: c.days };
        if (p.rule.night) next.night = "only";
      }
      changes.push({ row, next });
    }
    commit(changes);
    setNote(`Đã điền ${changes.length} người${miss.length ? `; không khớp tên: ${miss.slice(0, 4).join(", ")}${miss.length > 4 ? "…" : ""}` : ""}`);
    if (changes.length) setPasteText("");
  };

  // ---- chép luật sang tháng mới ------------------------------------------------------------------------------------------
  const copyFrom = async (mode: "copy" | "reset") => {
    const prev = await loadMonthRules(addMonths(month, -1));
    if (prev.length === 0) return setNote(`${monthLabel(addMonths(month, -1))} chưa có luật nào để chép`);
    await rules.replaceAll(copyRulesToMonth(prev, month, mode));
    setNote(mode === "copy" ? `Đã chép luật từ ${monthLabel(addMonths(month, -1))}, sửa tiếp trong bảng` : "Đã mở tháng mới, mọi người theo trần tự suy");
  };

  const months = useMemo(() => {
    const base = addDays(today, 0).slice(0, 7);
    const list = [-2, -1, 0, 1, 2].map((n) => addMonths(base, n));
    return list.includes(month) ? list : [...list, month].sort();
  }, [today, month]);

  // ---- popover -----------------------------------------------------------------------------------------------------------
  const popRow = pop ? rows[pop.r] : undefined;
  const popCol = pop ? vCols[pop.c] : undefined;
  const popBody = () => {
    if (!popRow || !popCol) return null;
    const r = popRow.rule;
    const upd = (next: MonthRule) => commit([{ row: popRow, next }]);
    const toggleDay = (cur: readonly DayKind[], d: DayKind) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
    if (popCol.kind === "role") {
      const other = otherRole(popRow.role);
      const hasOther = rules.forTalent(popRow.talentId).some((x) => x.role === other);
      return (
        <div className="space-y-2">
          <b>{nameOf(popRow.talentId)}</b>
          {!hasOther ? (
            <button type="button" className={chip(false)} onClick={() => (commit([{ row: { ...popRow, key: `${popRow.talentId}|${other}`, role: other, rule: emptyMonthRule(month, popRow.talentId, other), stored: false }, next: { ...emptyMonthRule(month, popRow.talentId, other), maxHours: r.maxHours, firstHalfMax: r.firstHalfMax } }]), setPop(null), setExpanded((s) => new Set(s).add(popRow.talentId)))}>
              Thêm vai {other === "assistant" ? "Trợ" : "Host"}
            </button>
          ) : !popRow.primary ? (
            <button type="button" className={chip(false)} onClick={() => (void rules.remove(popRow.talentId, popRow.role), setPop(null))}>
              Bỏ luật vai này
            </button>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">Có 2 vai: bấm ▸ ở tên để mở dòng vai còn lại.</span>
          )}
        </div>
      );
    }
    if (popCol.kind === "days")
      return (
        <div className="space-y-2">
          <b>Loại ngày nhận (chung)</b>
          <span className="block text-xs text-[var(--text-muted)]">Không chọn = mọi ngày</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_KINDS.map((d) => (
              <button key={d} type="button" className={chip(r.dayKinds.includes(d))} onClick={() => upd({ ...r, dayKinds: toggleDay(r.dayKinds, d) })}>
                {DAY_KIND_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
      );
    if (popCol.kind === "night")
      return (
        <div className="space-y-2">
          <b>Ca đêm (kết thúc sau 23:00)</b>
          <div className="flex flex-wrap gap-1.5">
            {NIGHT_OPTS.map(([v, l]) => (
              <button key={v} type="button" className={chip(r.night === v)} onClick={() => (upd({ ...r, night: v }), setPop(null))}>
                {l}
              </button>
            ))}
          </div>
        </div>
      );
    if (popCol.kind === "brand") {
      const id = popCol.brandId!;
      const b = r.brands[id] ?? emptyBrandRule();
      const set = (nb: typeof b) => {
        const brandsNext = { ...r.brands };
        if (nb.hours === null && nb.days === null && nb.night === null) delete brandsNext[id];
        else brandsNext[id] = nb;
        upd({ ...r, brands: brandsNext });
      };
      return (
        <div className="space-y-2">
          <b>{brandName(id)}</b>
          <div className="flex gap-1.5">
            <button type="button" className={chip(b.hours !== "x")} onClick={() => set({ ...b, hours: b.hours === "x" ? null : b.hours })}>
              ✓ Nhận
            </button>
            <button type="button" className={chip(b.hours === "x")} onClick={() => set({ ...b, hours: "x" })}>
              ✕ Không nhận
            </button>
          </div>
          {b.hours !== "x" && (
            <>
              <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                Trần giờ cả brand
                <input
                  type="number"
                  min={0}
                  defaultValue={typeof b.hours === "number" ? b.hours : ""}
                  aria-label={`Trần giờ ${brandName(id)}`}
                  className="w-20 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 tabular-nums text-[var(--text)]"
                  onBlur={(e) => {
                    const n = e.target.value === "" ? null : Math.round(Number(e.target.value));
                    if (n !== (typeof b.hours === "number" ? b.hours : null)) set({ ...b, hours: n });
                  }}
                />
                h
              </label>
              <span className="block text-xs text-[var(--text-muted)]">Loại ngày riêng (không chọn = theo chung)</span>
              <div className="flex flex-wrap gap-1.5">
                {DAY_KINDS.map((d) => (
                  <button key={d} type="button" className={chip(!!b.days?.includes(d))} onClick={() => { const next = toggleDay(b.days ?? [], d); set({ ...b, days: next.length ? next : null }); }}>
                    {DAY_KIND_LABEL[d]}
                  </button>
                ))}
              </div>
              <span className="block text-xs text-[var(--text-muted)]">Ca đêm riêng</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={chip(b.night === null)} onClick={() => set({ ...b, night: null })}>= Theo chung</button>
                {NIGHT_OPTS.map(([v, l]) => (
                  <button key={v} type="button" className={chip(b.night === v)} onClick={() => set({ ...b, night: v })}>
                    {l}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  const cell = (row: GridRow, col: GridCol, ri: number, ci: number) => {
    const v = cellView(row, col, ctx);
    const inRange = ri >= range.r0 && ri <= range.r1 && ci >= range.c0 && ci <= range.c1;
    const isSel = ri === sel.r && ci === sel.c;
    const isDualToggle = col.kind === "name" && row.dual && row.primary && role === "all";
    const text = isDualToggle ? `${expanded.has(row.talentId) ? "▾" : "▸"} ${v.text}` : v.text;
    const sticky = ci === 0 ? "sticky left-0 z-[2] bg-[var(--surface)]" : ci === 1 ? "sticky z-[2] bg-[var(--surface)] shadow-[2px_0_0_var(--border)]" : "";
    const hatch = v.tone === "na" ? "bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--surface-hover)_5px_10px)] cursor-not-allowed" : "";
    return (
      <td
        key={col.id}
        data-cell={`${ri}:${ci}`}
        style={{
          ...(ci === 1 ? { left: vCols[0]?.w } : {}),
          ...(!isSel && !inRange && !sticky && !hatch ? { backgroundColor: tintOf(col.group, 7, "var(--surface)") } : {})
        }}
        className={`relative max-w-[240px] cursor-cell truncate border-b border-r border-[var(--border)] px-2.5 ${col.kind === "max" || col.kind === "half" || col.kind === "roleHours" || col.kind === "avg" || col.kind === "auto" ? "text-right" : ""} ${TONE[v.tone]} ${sticky} ${hatch} ${isSel ? "outline outline-2 -outline-offset-2 outline-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]" : inRange ? "bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]" : ""} ${isDualToggle ? "cursor-pointer font-semibold" : ""}`}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          setPop(null);
          if (isDualToggle && !e.shiftKey) {
            setExpanded((s) => {
              const n = new Set(s);
              if (n.has(row.talentId)) n.delete(row.talentId);
              else n.add(row.talentId);
              return n;
            });
          }
          setSel({ r: ri, c: ci });
          if (!e.shiftKey) setAnchor({ r: ri, c: ci });
          boxRef.current?.focus({ preventScroll: true });
        }}
        onClick={(e) => {
          if (!e.shiftKey && v.popover && v.editable && !isDualToggle) openPop(ri, ci);
        }}
        onDoubleClick={() => activate(ri, ci)}
      >
        {editing && editing.r === ri && editing.c === ci ? (
          <input
            autoFocus
            defaultValue={editing.init}
            aria-label={col.label}
            className="absolute inset-0 w-full border-2 border-[var(--accent)] bg-[var(--surface-elevated)] px-2.5 text-[var(--text)] outline-none"
            onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") setEditing(null);
              else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                setCell(row, col, e.currentTarget.value);
                setEditing(null);
                if (e.key === "Enter") move(1, 0);
                else move(0, e.shiftKey ? -1 : 1);
                boxRef.current?.focus({ preventScroll: true });
              }
            }}
            onBlur={(e) => {
              if (editing) {
                setCell(row, col, e.currentTarget.value);
                setEditing(null);
              }
            }}
          />
        ) : (
          text
        )}
      </td>
    );
  };

  const dimmed = (row: GridRow) => platF !== "all" && !canDoPlatform(row.rule, brands, platF, brandF);
  const total = new Set(allRows.map((r) => r.talentId)).size;
  const storedCount = rules.rules.length;

  return (
    <div className="space-y-2 text-xs" data-testid="person-rules-grid">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-0.5" role="group" aria-label="Tháng">
          {months.map((m) => (
            <button key={m} type="button" aria-pressed={m === month} className={segBtn(m === month)} onClick={() => onMonth(m)}>
              {monthLabel(m)}
              {isMonthLocked(m, today) && <Lock size={10} aria-label="đã khoá" className="ml-1 inline" />}
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-0.5" role="group" aria-label="Vai trò">
          {([["all", "Tất cả"], ["host", "Host"], ["assistant", "Trợ"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={role === v} className={segBtn(role === v)} onClick={() => setRole(v)}>
              {l}
            </button>
          ))}
        </div>
        <select value={brandF} onChange={(e) => setBrandF(e.target.value)} aria-label="Brand" className="min-h-7 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-[var(--text)]">
          <option value="all">Brand: tất cả</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={platF} onChange={(e) => setPlatF(e.target.value)} aria-label="Sàn" className="min-h-7 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-[var(--text)]">
          <option value="all">Sàn: tất cả</option>
          {["TikTok", "Shopee", "Website"].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên…" aria-label="Tìm tên" className="min-h-7 w-32 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-[var(--text)]" />
        <span className="flex-1" />
        <button type="button" className={chip(false)} disabled={undo.length === 0 || !canEdit} onClick={doUndo}>
          Hoàn tác{undo.length ? ` (${undo.length})` : ""}
        </button>
        {canEdit && (
          <button type="button" aria-pressed={pasteOpen} className={chip(pasteOpen)} onClick={() => setPasteOpen((v) => !v)}>
            Dán từ sheet
          </button>
        )}
        <div className="relative">
          <button type="button" className={chip(colMenu)} aria-expanded={colMenu} onClick={() => setColMenu((v) => !v)}>
            Nhóm cột ▾
          </button>
          {colMenu && (
            <div className="absolute right-0 top-8 z-20 min-w-[200px] rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-lg">
              {allGroups.map((g) => (
                <label key={g} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-[var(--surface-hover)]">
                  <input type="checkbox" checked={!hidden.has(g)} onChange={() => setHidden((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; })} />
                  {g}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-[var(--text-muted)]">
        <span>{total} người · {storedCount} dòng có luật riêng</span>
        <InfoDot label="Bảng luật">
          Mỗi người một dòng, mỗi cột là một luật. Mọi số là trần TỐI ĐA. Brand / sàn gõ x = không nhận. Chữ nghiêng xám là hệ thống tự suy, chấm là bạn đã đặt tay. Tự fill lịch của tháng này đọc đúng bảng này.
        </InfoDot>
        {locked && (
          <span className="inline-flex items-center gap-1 font-bold">
            <Lock size={11} aria-hidden /> Đã khoá: {monthLabel(month)} đã kết thúc nên tự khoá, chỉ để xem
          </span>
        )}
        {rules.backend === "local" && <span>· Chưa lưu chung (cần chạy 0229)</span>}
        {!locked && !readOnly && storedCount === 0 && rules.backend !== "loading" && (
          <span className="inline-flex items-center gap-2">
            <b>{monthLabel(month)} chưa có luật riêng</b>
            <button type="button" className={chip(true)} onClick={() => void copyFrom("copy")}>
              Chép luật từ {monthLabel(addMonths(month, -1))}
            </button>
          </span>
        )}
        {rules.error && <span role="alert" className="text-[var(--danger)]">{rules.error}</span>}
      </div>

      {pasteOpen && canEdit && (
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <b>Dán từ sheet TỶ LỆ LỊCH LÀM</b>
          <span className="block text-[var(--text-muted)]">Mỗi dòng: tên, ô mức cast. Hệ thống đọc giờ và phần trong ngoặc, rồi điền vào lưới (vai chính của người đó). Dòng không khớp tên sẽ báo lại.</span>
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} aria-label="Dán từ sheet" placeholder="B.Thy	60h /tháng (6-7-CN, camp)" className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-base)] p-2 text-[var(--text)]" />
          <button type="button" className={chip(true)} disabled={!pasteText.trim()} onClick={applySheet}>
            Điền vào lưới
          </button>
        </div>
      )}

      <div
        ref={boxRef}
        tabIndex={0}
        role="grid"
        aria-label="Bảng luật đặt giờ"
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPaste={onPaste}
        className="max-h-[68vh] overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <table className="min-w-full border-separate border-spacing-0 tabular-nums">
          <thead>
            <tr>
              {groups.map((g, i) => (
                <th
                  key={`${g.name}-${i}`}
                  colSpan={g.span}
                  style={{ backgroundColor: tintOf(g.name, 30, "var(--surface-elevated)"), boxShadow: groupTint.get(g.name) ? `inset 0 3px 0 ${groupTint.get(g.name)}` : undefined }}
                  className="sticky top-0 z-[3] h-7 border-b border-r border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 text-left font-bold text-[var(--text)]"
                >
                  {g.name}
                </th>
              ))}
            </tr>
            <tr>
              {vCols.map((c, i) => (
                <th
                  key={c.id}
                  style={{ minWidth: c.w, ...(i === 1 ? { left: vCols[0]?.w } : {}), backgroundColor: tintOf(c.group, 16, "var(--surface-elevated)") }}
                  className={`sticky top-7 h-7 border-b border-r border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 text-left font-semibold text-[var(--text-muted)] ${i === 0 ? "left-0 z-[4]" : i === 1 ? "z-[4]" : "z-[3]"} ${platF !== "all" && c.platform && c.platform !== platF ? "opacity-40" : ""}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.key} className={`h-8 ${dimmed(row) ? "opacity-35" : ""}`}>
                {vCols.map((col, ci) => cell(row, col, ri, ci))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, vCols.length)} className="px-3 py-6 text-center text-[var(--text-muted)]">
                  Không có ai khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-[var(--text-faint)]">
        <span>↑↓←→ di chuyển</span>
        <span>Enter / gõ để sửa</span>
        <span>Shift+bấm chọn vùng</span>
        <span>Ctrl+C / V chép dán từ Excel, Google Sheet</span>
        <span>Ctrl+D điền xuống</span>
        <span>Del xoá về tự suy</span>
        <span>Ctrl+Z hoàn tác</span>
      </p>
      {note && (
        <div role="status" className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2 text-xs text-[var(--text)] shadow-lg">
          {note}
        </div>
      )}
      {pop && popRow && popCol && (
        <>
          <div className="fixed inset-0 z-20" onMouseDown={() => setPop(null)} aria-hidden />
          <div role="dialog" aria-label={popCol.label} style={{ left: pop.x, top: pop.y }} className="fixed z-30 min-w-[240px] max-w-[300px] space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-xs text-[var(--text)] shadow-xl" onKeyDown={(e) => e.key === "Escape" && setPop(null)}>
            {popBody()}
            <button type="button" className="text-2xs text-[var(--text-faint)] underline" onClick={() => setPop(null)}>
              Đóng
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// Để các chỗ khác (test, RosterBoard) dùng chung kiểu cột / dòng.
export type { GridBrand } from "../../lib/roster/rulesGrid";
