import React, { useMemo, useState } from "react";
import type { Talent } from "../../types";
import SearchSelect from "../ui/SearchSelect";
import { InfoDot } from "../common/InfoDot";
import type { MonthCommitments } from "../../hooks/useMonthCommitments";
import type { ScheduleRules } from "../../hooks/useScheduleRules";
import type { AutoCap } from "../../lib/roster/autoCaps";
import { parseCommitmentSheet, type ParsedCommitment } from "../../lib/roster/commitmentSheet";
import { DAY_KINDS, DAY_KIND_LABEL, describeRule, hasRule, type PersonRule, type RuleClause } from "../../lib/roster/placementRules";

// LUẬT ĐẶT GIỜ TỪNG NGƯỜI (Điều Phối → Thêm → Luật đặt giờ từng người). Thay cột "MỨC CAST (ghi chú)" trong sheet TỶ LỆ LỊCH LÀM của chị Trainer:
// mỗi người một dòng — giờ cam kết của THÁNG (trần giờ) + luật đặt giờ (loại ngày, brand, ca đêm) áp mọi tháng.
// Chỉ nhập cho người có yêu cầu riêng: không có dòng = Tự fill dùng trần tự suy + không giới hạn loại ngày.

const numInput = "rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 tabular-nums";
const chip = (on: boolean) => `min-h-6 rounded-md border px-2 text-2xs font-bold ${on ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`;

type Brand = { id: string; name: string };

const ClauseRow: React.FC<{ clause: RuleClause; brands: readonly Brand[]; name: string; onChange: (c: RuleClause) => void; onRemove: () => void }> = ({ clause, brands, name, onChange, onRemove }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <select value={clause.brandId ?? ""} onChange={(e) => onChange({ ...clause, ...(e.target.value ? { brandId: e.target.value } : { brandId: undefined }) })} aria-label={`${name} brand`} className={numInput}>
      <option value="">mọi brand</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
    <div className="flex items-center gap-1" role="group" aria-label={`${name} loại ngày`}>
      {DAY_KINDS.map((d) => (
        <button key={d} type="button" aria-pressed={clause.days.includes(d)} onClick={() => onChange({ ...clause, days: clause.days.includes(d) ? clause.days.filter((x) => x !== d) : [...clause.days, d] })} className={chip(clause.days.includes(d))}>
          {DAY_KIND_LABEL[d]}
        </button>
      ))}
      {clause.days.length === 0 && <span className="text-2xs text-[var(--text-faint)]">mọi ngày</span>}
    </div>
    <button type="button" onClick={onRemove} className="min-h-6 rounded px-1.5 text-[var(--text-faint)] hover:text-[var(--text)]" aria-label={`${name} bỏ điều kiện`}>
      ×
    </button>
  </div>
);

interface PasteRow extends ParsedCommitment {
  pick: string | null;
  on: boolean;
}

export const PersonRulesDesk: React.FC<{
  month: string;
  talents: readonly Talent[];
  brands: readonly Brand[];
  nameOf: (id: string) => string;
  commitments: MonthCommitments;
  scheduleRules: ScheduleRules;
  autoCaps: Readonly<Record<string, AutoCap>>;
  readOnly?: boolean;
}> = ({ month, talents, brands, nameOf, commitments, scheduleRules, autoCaps, readOnly }) => {
  const [pick, setPick] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PasteRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const brandName = useMemo(() => {
    const m = new Map(brands.map((b) => [b.id, b.name]));
    return (id: string) => m.get(id) ?? "brand";
  }, [brands]);

  const hoursBy = useMemo(() => new Map(commitments.rows.map((r) => [r.talentId, r])), [commitments.rows]);
  const ids = useMemo(() => {
    const set = new Set<string>([...scheduleRules.rules.filter(hasRule).map((r) => r.talentId), ...commitments.rows.map((r) => r.talentId)]);
    return [...set].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "vi"));
  }, [scheduleRules.rules, commitments.rows, nameOf]);
  const people = useMemo(() => talents.filter((t) => (t.role === "Host" || t.role === "Assistant") && !ids.includes(t.id)).sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id), "vi")), [talents, ids, nameOf]);
  const roleOf = useMemo(() => new Map(talents.map((t) => [t.id, t.role])), [talents]);

  const ruleOf = (id: string): PersonRule => scheduleRules.byTalent[id] ?? { talentId: id, clauses: [], night: false, note: "" };
  const saveRule = (r: PersonRule) => void scheduleRules.save([r]);
  const commitHours = (id: string, raw: string, half: string | undefined) => {
    const cur = hoursBy.get(id);
    if (raw.trim() === "") {
      if (cur) void commitments.remove(id);
      return;
    }
    const m = Number(raw);
    const h = half === undefined || half.trim() === "" ? undefined : Number(half);
    if (!(m > 0) || (h !== undefined && !(h >= 0))) return;
    if (!cur || cur.maxHours !== m || cur.firstHalfMax !== h) void commitments.save([{ talentId: id, maxHours: m, firstHalfMax: h, note: cur?.note }]);
  };

  const read = () => {
    const r = parseCommitmentSheet(text, talents, brands);
    setPreview(r.rows.map((x) => ({ ...x, pick: x.talentId ?? null, on: x.status === "matched" && !x.duplicate })));
  };
  const importable = (preview ?? []).filter((r) => r.on && r.pick);
  const doImport = async () => {
    setBusy(true);
    const byId = new Map<string, PasteRow>();
    for (const r of importable) if (!byId.has(r.pick!)) byId.set(r.pick!, r);
    const list = [...byId.values()];
    await commitments.save(list.map((r) => ({ talentId: r.pick!, maxHours: r.hours, note: r.note, firstHalfMax: hoursBy.get(r.pick!)?.firstHalfMax })));
    const withRule = list.filter((r) => r.rule && (r.rule.night || r.rule.clauses.length > 0));
    if (withRule.length > 0) await scheduleRules.save(withRule.map((r) => ({ talentId: r.pick!, clauses: r.rule!.clauses, night: r.rule!.night, note: r.note })));
    setBusy(false);
    setPreview(null);
    setText("");
    setPasteOpen(false);
  };

  const local = commitments.backend === "local" || scheduleRules.backend === "local";
  const err = commitments.error ?? scheduleRules.error;

  return (
    <div className="space-y-2 text-xs" data-testid="person-rules">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-[var(--text)]">
          Giờ & luật từng người · T{month.slice(5)}/{month.slice(0, 4)}
        </span>
        <InfoDot label="Luật đặt giờ">
          Một dòng một người, như cột “MỨC CAST” của sheet TỶ LỆ LỊCH LÀM. Giờ/tháng là trần giờ của tháng này (ngày 1–15 chỉ nhận ≈ nửa). Ngày nhận, brand, ca đêm là luật áp mọi tháng: Tự fill trừ điểm ca ngoài luật nhưng vẫn lấp khi không còn ai. Người không có dòng: trần tự suy từ giờ 3 tháng trước, không giới hạn loại ngày. “Thứ 6-7-CN” là thứ 6, thứ 7, Chủ nhật; “Campaign” là D-Day, Mid-Month, Pay Day; “Ngày thường” là ngày không Campaign (daily).
        </InfoDot>
        <span className="text-2xs text-[var(--text-muted)]">{Object.keys(autoCaps).length} người đã có trần tự suy</span>
        {!readOnly && (
          <>
            <SearchSelect value={pick} onChange={setPick} ariaLabel="Chọn người đặt luật" emptyLabel="Thêm người…" options={people.map((t) => ({ value: t.id, label: `${nameOf(t.id)} · ${t.role === "Host" ? "host" : "trợ"}` }))} className={numInput} />
            <button
              type="button"
              disabled={!pick}
              onClick={() => {
                saveRule({ talentId: pick, clauses: [{ days: [] }], night: false, note: "" });
                setPick("");
              }}
              className="min-h-6 rounded-md border border-[var(--border)] px-2 font-bold text-[var(--text)] disabled:opacity-40"
            >
              Thêm
            </button>
            <button type="button" onClick={() => setPasteOpen((v) => !v)} aria-pressed={pasteOpen} className={`min-h-6 rounded-md border px-2 font-bold ${pasteOpen ? "seg-on" : "border-[var(--border)] text-[var(--text)]"}`}>
              Dán từ sheet
            </button>
          </>
        )}
        {local && <span className="text-2xs text-amber-300">Chưa lưu chung (cần chạy 0223 + 0224)</span>}
      </div>
      {err && <p className="text-2xs text-rose-300">{err}</p>}

      {pasteOpen && (
        <div className="space-y-1.5 rounded-lg border border-[var(--border)] p-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Dán các dòng từ sheet: tên host + ô MỨC CAST, vd “30h /tháng (6-7-CN, camp)”" aria-label="Dán từ sheet" className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1" />
          <div className="flex items-center gap-2">
            <button type="button" disabled={!text.trim()} onClick={read} className="min-h-6 rounded-md border border-[var(--border)] px-2 font-bold text-[var(--text)] disabled:opacity-40">
              Đọc
            </button>
            {preview && (
              <span className="text-2xs text-[var(--text-muted)]">
                {preview.length} dòng · {importable.length} sẽ nhập · {preview.filter((r) => r.status === "unmatched").length} không khớp tên
              </span>
            )}
          </div>
          {preview && preview.length > 0 && (
            <>
              <div className="max-h-56 overflow-y-auto divide-y divide-[var(--border)]">
                {preview.map((r, i) => {
                  const rule: PersonRule | undefined = r.rule ? { talentId: r.pick ?? "", clauses: r.rule.clauses, night: r.rule.night } : undefined;
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 py-1">
                      <input type="checkbox" checked={r.on} disabled={!r.pick} onChange={(e) => setPreview((p) => p!.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label={`Nhập ${r.nameRaw}`} className="w-5 h-5 accent-[var(--accent)]" />
                      <span className="w-40 truncate text-[var(--text)]" title={r.nameRaw}>
                        {r.nameRaw}
                      </span>
                      <b className="tabular-nums text-[var(--text)]">{r.hours}h</b>
                      <span className="text-2xs text-[var(--text-muted)]">{describeRule(rule, brandName)}</span>
                      {r.rule && r.rule.unknown.length > 0 && <span className="text-2xs text-amber-300">chưa hiểu: {r.rule.unknown.join(", ")}</span>}
                      {r.status === "matched" && (
                        <span className="text-2xs text-emerald-400">
                          → {nameOf(r.pick!)}
                          {r.duplicate ? " · trùng dòng trước" : ""}
                        </span>
                      )}
                      {r.status === "ambiguous" && (
                        <select value={r.pick ?? ""} onChange={(e) => setPreview((p) => p!.map((x, j) => (j === i ? { ...x, pick: e.target.value || null, on: !!e.target.value } : x)))} aria-label={`Chọn người cho ${r.nameRaw}`} className={numInput}>
                          <option value="">Trùng tên — chọn người…</option>
                          {r.candidates.map((id) => (
                            <option key={id} value={id}>
                              {nameOf(id)}
                            </option>
                          ))}
                        </select>
                      )}
                      {r.status === "unmatched" && <span className="text-2xs text-amber-300">không khớp ai</span>}
                    </div>
                  );
                })}
              </div>
              <button type="button" disabled={busy || importable.length === 0} onClick={() => void doImport()} className="min-h-6 rounded-md bg-[var(--accent)] px-3 font-bold text-white disabled:opacity-40">
                {busy ? "Đang nhập…" : `Nhập ${importable.length} người`}
              </button>
            </>
          )}
        </div>
      )}

      {ids.length === 0 && (scheduleRules.backend !== "loading" ? <p className="text-[var(--text-faint)]">Chưa có luật riêng cho ai — Tự fill đang xếp theo luật chung.</p> : null)}

      <div className="divide-y divide-[var(--border)]">
        {ids.map((id) => {
          const r = ruleOf(id);
          const hrs = hoursBy.get(id);
          const auto = autoCaps[id];
          const label = roleOf.get(id) === "Assistant" ? "trợ" : "host";
          return (
            <div key={`${id}|${hrs?.maxHours ?? ""}|${hrs?.firstHalfMax ?? ""}`} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2">
              <div className="w-40 shrink-0">
                <div className="truncate font-bold text-[var(--text)]" title={nameOf(id)}>
                  {nameOf(id)}
                </div>
                <div className="text-2xs text-[var(--text-faint)]">{label}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[var(--text-muted)]">giờ/tháng</span>
                <input type="number" min={1} defaultValue={hrs?.maxHours ?? ""} placeholder={auto ? String(auto.monthMax) : "tự suy"} disabled={readOnly} onBlur={(e) => commitHours(id, e.target.value, hrs?.firstHalfMax === undefined ? "" : String(hrs.firstHalfMax))} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={`w-16 ${numInput}`} aria-label={`${nameOf(id)} giờ mỗi tháng`} />
                {hrs && (
                  <>
                    <span className="text-[var(--text-muted)]">nửa đầu</span>
                    <input type="number" min={0} defaultValue={hrs.firstHalfMax ?? ""} placeholder="tự tính" disabled={readOnly} onBlur={(e) => commitHours(id, String(hrs.maxHours), e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={`w-16 ${numInput}`} aria-label={`${nameOf(id)} giờ nửa đầu`} />
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                {r.clauses.map((c, i) => (
                  <ClauseRow
                    key={i}
                    clause={c}
                    brands={brands}
                    name={nameOf(id)}
                    onChange={(n) => !readOnly && saveRule({ ...r, clauses: r.clauses.map((x, j) => (j === i ? n : x)) })}
                    onRemove={() => !readOnly && saveRule({ ...r, clauses: r.clauses.filter((_, j) => j !== i) })}
                  />
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  {!readOnly && (
                    <button type="button" onClick={() => saveRule({ ...r, clauses: [...r.clauses, { days: [] }] })} className="min-h-6 rounded-md border border-dashed border-[var(--border)] px-2 text-2xs font-bold text-[var(--text-muted)] hover:text-[var(--text)]">
                      + điều kiện ngày / brand
                    </button>
                  )}
                  <label className="flex items-center gap-1 text-[var(--text-muted)]">
                    <input type="checkbox" checked={r.night} disabled={readOnly} onChange={(e) => saveRule({ ...r, night: e.target.checked })} className="accent-[var(--accent)]" /> chỉ ca đêm
                  </label>
                  {r.clauses.length === 0 && !r.night && <span className="text-2xs text-[var(--text-faint)]">không giới hạn loại ngày / brand</span>}
                  {r.note && <span className="text-2xs text-[var(--text-faint)]">sheet: {r.note}</span>}
                </div>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    void scheduleRules.remove(id);
                    if (hrs) void commitments.remove(id);
                  }}
                  className="min-h-6 rounded px-1.5 text-[var(--text-faint)] hover:text-[var(--text)]"
                >
                  Bỏ
                </button>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(autoCaps).length > 0 && (
        <details>
          <summary className="cursor-pointer text-2xs text-[var(--text-muted)]">Xem trần tự suy của từng người</summary>
          <div className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2 text-2xs text-[var(--text-muted)]">
            {Object.entries(autoCaps)
              .sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0]), "vi"))
              .map(([id, c]) => (
                <span key={id} className={hoursBy.has(id) ? "text-[var(--text-faint)] line-through" : ""}>
                  <b className="text-[var(--text)]">{nameOf(id)}</b>: TB {Math.round(c.avg)}h ({c.months} tháng) → trần {c.monthMax}h
                </span>
              ))}
          </div>
        </details>
      )}
    </div>
  );
};

