import React, { useMemo, useState } from "react";
import type { Brand, LiveSession, Talent } from "../types";
import { deleteTalentBrandRole, upsertTalentBrandRoles } from "../lib/db/talentBrandRoles";
import { roleHistoryByBrand, suggestRolesFromHistory, TALENT_BRAND_ROLE_LABEL, type TalentBrandRole, type TalentBrandRoleKind } from "../lib/roster/talentBrandRoles";
import { errorMessage } from "../lib/errorMessage";

// Vai được xếp theo brand của MỘT talent. Điều Phối Lịch Live (Tự fill, gợi ý người, cảnh báo lịch) đọc để không xếp host vào brand
// mà bạn chỉ làm trợ và ngược lại. Brand chưa cài = không hạn chế.

interface Props {
  talent: Talent;
  brands: Brand[];
  sessions: LiveSession[];
  roles: TalentBrandRole[];
  canEdit: boolean;
  onChanged: (next: TalentBrandRole[]) => void;
}

const OPTIONS: (TalentBrandRoleKind | "none")[] = ["none", "host", "assistant", "both"];
const optLabel = (o: TalentBrandRoleKind | "none") => (o === "none" ? "Chưa cài" : TALENT_BRAND_ROLE_LABEL[o]);

export const TalentBrandRolesPanel: React.FC<Props> = ({ talent, brands, sessions, roles, canEdit, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = useMemo(() => roles.filter((r) => r.talentId === talent.id), [roles, talent.id]);
  const history = useMemo(() => roleHistoryByBrand(sessions, talent.id), [sessions, talent.id]);
  const rows = useMemo(
    () => brands.filter((b) => b.contractStatus !== "Completed" || mine.some((r) => r.brandId === b.id) || history.has(b.id)).sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [brands, mine, history]
  );
  const current = (brandId: string): TalentBrandRoleKind | "none" => mine.find((r) => r.brandId === brandId)?.role ?? "none";

  async function save(brandId: string, next: TalentBrandRoleKind | "none") {
    setBusy(true);
    setError(null);
    try {
      const old = mine.find((r) => r.brandId === brandId);
      if (next === "none") {
        if (old) await deleteTalentBrandRole(old.id);
        onChanged(roles.filter((r) => !(r.talentId === talent.id && r.brandId === brandId)));
      } else {
        const [row] = await upsertTalentBrandRoles(talent.id, [{ brandId, role: next }]);
        onChanged([...roles.filter((r) => !(r.talentId === talent.id && r.brandId === brandId)), row]);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Cài sẵn từ lịch sử cho brand CHƯA cài (không đè cái đã chọn tay).
  const suggestions = useMemo(() => {
    const s = suggestRolesFromHistory(history);
    return [...s].filter(([brandId]) => !mine.some((r) => r.brandId === brandId) && brands.some((b) => b.id === brandId));
  }, [history, mine, brands]);
  async function applySuggestions() {
    setBusy(true);
    setError(null);
    try {
      const saved = await upsertTalentBrandRoles(talent.id, suggestions.map(([brandId, role]) => ({ brandId, role })));
      onChanged([...roles.filter((r) => !(r.talentId === talent.id && saved.some((x) => x.brandId === r.brandId))), ...saved]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-[var(--text-muted)]">
          Vai được xếp theo brand <span className="font-normal text-[var(--text-faint)]">(Tự fill lịch dựa vào đây)</span>
        </p>
        {canEdit && suggestions.length > 0 && (
          <button type="button" onClick={applySuggestions} disabled={busy} className="text-2xs font-bold text-[var(--accent-text)] hover:underline shrink-0">
            Cài theo lịch sử ({suggestions.length})
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {rows.map((b) => {
          const h = history.get(b.id);
          const cur = current(b.id);
          return (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--border)]/60 pb-1">
              <span className="text-[var(--text)] font-medium">
                {b.name}
                {h && <span className="font-normal text-2xs text-[var(--text-faint)]"> · {h.host} ca host · {h.assist} ca trợ</span>}
              </span>
              <span className="flex border border-[var(--border)] rounded-lg overflow-hidden text-2xs font-bold" role="group" aria-label={`Vai ở ${b.name}`}>
                {OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    disabled={!canEdit || busy}
                    aria-pressed={cur === o}
                    onClick={() => cur !== o && save(b.id, o)}
                    className={`px-2 py-1 ${cur === o ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                  >
                    {optLabel(o)}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-2xs text-[var(--text-faint)] leading-relaxed">
        Chưa cài = không hạn chế như trước. Cài "Host" thì Tự fill không xếp bạn làm trợ ở brand đó; cài "Trợ live" thì không xếp làm host. Xếp tay vẫn được nhưng lịch sẽ hiện cảnh báo.
      </p>
      {error && <p className="text-2xs text-rose-300">{error}</p>}
    </div>
  );
};
