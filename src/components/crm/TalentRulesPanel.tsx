import React, { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Brand, Talent } from "../../types";
import { TALENT_RULE_LABEL, type BrandTalentRule, type TalentRuleKind } from "../../lib/commercial/terms";
import { deleteTalentRule, upsertTalentRule } from "../../lib/db/brandTerms";
import { errorMessage } from "../../lib/errorMessage";
import { Field, btnCls, inputCls } from "./fields";

// Điều khoản về HOST giữa YFB và brand: host brand muốn ưu tiên, host brand không nhận, host chỉ làm riêng cho brand này.
// Điều Phối Lịch Live đọc để cảnh báo khi xếp (lib/roster/rules.ts) và loại khỏi gợi ý.

interface Props {
  brand: Brand;
  talents: Talent[];
  rules: BrandTalentRule[];
  available: boolean;
  canEdit: boolean;
  onChanged: (next: BrandTalentRule[]) => void;
}

export const TalentRulesPanel: React.FC<Props> = ({ brand, talents, rules, available, canEdit, onChanged }) => {
  const mine = useMemo(() => rules.filter((r) => r.brandId === brand.id), [rules, brand.id]);
  const nameOf = (id: string) => talents.find((t) => t.id === id)?.name ?? "Host đã xoá";
  const free = useMemo(() => talents.filter((t) => !mine.some((r) => r.talentId === t.id)).sort((a, b) => a.name.localeCompare(b.name, "vi")), [talents, mine]);
  const [talentId, setTalentId] = useState("");
  const [kind, setKind] = useState<TalentRuleKind>("preferred");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!talentId) return;
    setBusy(true);
    setError(null);
    try {
      const row = await upsertTalentRule(brand.id, talentId, kind, note.trim());
      onChanged([...rules.filter((r) => !(r.brandId === brand.id && r.talentId === talentId)), row]);
      setTalentId("");
      setNote("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(r: BrandTalentRule) {
    setBusy(true);
    setError(null);
    try {
      await deleteTalentRule(r.id);
      onChanged(rules.filter((x) => x.id !== r.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!available) return <p className="text-[11px] text-amber-300">Chưa dùng được: migration 0191 chưa chạy.</p>;
  return (
    <div className="space-y-3">
      {mine.length === 0 ? (
        <p className="text-[11px] text-[var(--text-faint)]">Chưa có host nào.</p>
      ) : (
        <div className="space-y-1.5">
          {mine.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">
              <p className="text-xs text-[var(--text)]">
                <b>{nameOf(r.talentId)}</b> · {TALENT_RULE_LABEL[r.rule]}
                {r.note ? <span className="text-[var(--text-muted)]"> · {r.note}</span> : null}
              </p>
              {canEdit && <button type="button" onClick={() => remove(r)} disabled={busy} className="p-1.5 text-[var(--text-faint)] hover:text-rose-400" aria-label={`Bỏ điều khoản của ${nameOf(r.talentId)}`}><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <Field label="Host">
            <select value={talentId} onChange={(e) => setTalentId(e.target.value)} className={inputCls}>
              <option value="">— Chọn host —</option>
              {free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Điều khoản">
            <select value={kind} onChange={(e) => setKind(e.target.value as TalentRuleKind)} className={inputCls}>
              {(Object.keys(TALENT_RULE_LABEL) as TalentRuleKind[]).map((k) => <option key={k} value={k}>{TALENT_RULE_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Ghi chú (tuỳ chọn)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
          <button type="button" onClick={add} disabled={busy || !talentId} className={btnCls}>Thêm</button>
        </div>
      )}
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </div>
  );
};
