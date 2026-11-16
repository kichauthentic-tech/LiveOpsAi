import React, { useMemo, useState } from "react";
import type { Brand, LiveSession, Talent } from "../types";
import { deleteTalentBrandRole, upsertTalentBrandRoles } from "../lib/db/talentBrandRoles";
import { roleHistoryByChannel, suggestRolesFromHistory, TALENT_BRAND_ROLE_LABEL, type TalentBrandRole, type TalentBrandRoleKind } from "../lib/roster/talentBrandRoles";
import { errorMessage } from "../lib/errorMessage";

// Vai được xếp theo brand × sàn của MỘT talent. Điều Phối Lịch Live (Tự fill, gợi ý người, cảnh báo lịch) đọc để không xếp host vào kênh
// mà bạn chỉ làm trợ và ngược lại. Kênh chưa cài = không hạn chế. Dòng cài chung cả hai sàn (0221, platform "all") vẫn có hiệu lực cho tới khi cài riêng.

type Platform = "TikTok" | "Shopee";
const PLATFORMS: Platform[] = ["TikTok", "Shopee"];

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
  const history = useMemo(() => roleHistoryByChannel(sessions, talent.id), [sessions, talent.id]);
  const find = (brandId: string, platform: Platform | "all") => mine.find((r) => r.brandId === brandId && r.platform === platform);

  // Mỗi brand: các sàn đã có ca hoặc đã có cài riêng; chưa có gì thì hiện cả hai sàn để cài trước.
  const rows = useMemo(() => {
    const out: { brand: Brand; platforms: Platform[] }[] = [];
    for (const b of [...brands].sort((x, y) => x.name.localeCompare(y.name, "vi"))) {
      const platforms = PLATFORMS.filter((p) => history.has(`${b.id}|${p}`) || find(b.id, p));
      const used = platforms.length > 0 || find(b.id, "all");
      if (b.contractStatus === "Completed" && !used) continue;
      out.push({ brand: b, platforms: platforms.length > 0 ? platforms : PLATFORMS });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands, history, mine]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const save = (brandId: string, platform: Platform, next: TalentBrandRoleKind | "none") =>
    run(async () => {
      const old = find(brandId, platform);
      if (next === "none") {
        if (old) await deleteTalentBrandRole(old.id);
        onChanged(roles.filter((r) => !(r.talentId === talent.id && r.brandId === brandId && r.platform === platform)));
      } else {
        const [row] = await upsertTalentBrandRoles(talent.id, [{ brandId, platform, role: next }]);
        onChanged([...roles.filter((r) => !(r.talentId === talent.id && r.brandId === brandId && r.platform === platform)), row]);
      }
    });
  const dropShared = (r: TalentBrandRole) =>
    run(async () => {
      await deleteTalentBrandRole(r.id);
      onChanged(roles.filter((x) => x.id !== r.id));
    });

  // Cài sẵn từ lịch sử cho kênh CHƯA cài riêng (không đè cái đã chọn tay).
  const suggestions = useMemo(
    () =>
      [...suggestRolesFromHistory(history)].flatMap(([key, role]) => {
        const [brandId, platform] = key.split("|") as [string, Platform];
        return brands.some((b) => b.id === brandId) && !find(brandId, platform) ? [{ brandId, platform, role }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, mine, brands]
  );
  const applySuggestions = () =>
    run(async () => {
      const saved = await upsertTalentBrandRoles(talent.id, suggestions);
      onChanged([...roles.filter((r) => !(r.talentId === talent.id && saved.some((x) => x.brandId === r.brandId && x.platform === r.platform))), ...saved]);
    });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-[var(--text-muted)]">
          Vai được xếp theo kênh <span className="font-normal text-[var(--text-faint)]">(brand × sàn, Tự fill lịch dựa vào đây)</span>
        </p>
        {canEdit && suggestions.length > 0 && (
          <button type="button" onClick={applySuggestions} disabled={busy} className="text-2xs font-bold text-[var(--accent-text)] hover:underline shrink-0">
            Cài theo lịch sử ({suggestions.length})
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {rows.map(({ brand, platforms }) => {
          const shared = find(brand.id, "all");
          return (
            <li key={brand.id} className="border-b border-[var(--border)]/60 pb-1.5 space-y-1">
              <p className="text-[var(--text)] font-medium">{brand.name}</p>
              {shared && (
                <p className="text-2xs text-amber-300">
                  Đang cài chung cả hai sàn: {TALENT_BRAND_ROLE_LABEL[shared.role]} (sàn nào cài riêng thì theo cài riêng)
                  {canEdit && (
                    <button type="button" onClick={() => dropShared(shared)} disabled={busy} className="ml-1.5 font-bold underline">
                      Bỏ cài chung
                    </button>
                  )}
                </p>
              )}
              {platforms.map((p) => {
                const h = history.get(`${brand.id}|${p}`);
                const cur = find(brand.id, p)?.role ?? "none";
                return (
                  <div key={p} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[var(--text-muted)]">
                      {p}
                      {h && <span className="text-2xs text-[var(--text-faint)]"> · {h.host} ca host · {h.assist} ca trợ</span>}
                    </span>
                    <span className="flex border border-[var(--border)] rounded-lg overflow-hidden text-2xs font-bold" role="group" aria-label={`Vai ở ${brand.name} ${p}`}>
                      {OPTIONS.map((o) => (
                        <button
                          key={o}
                          type="button"
                          disabled={!canEdit || busy}
                          aria-pressed={cur === o}
                          onClick={() => cur !== o && save(brand.id, p, o)}
                          className={`px-2 py-1 ${cur === o ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                        >
                          {optLabel(o)}
                        </button>
                      ))}
                    </span>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
      <p className="text-2xs text-[var(--text-faint)] leading-relaxed">
        Chưa cài = không hạn chế như trước. Cài "Host" thì Tự fill không xếp bạn làm trợ ở kênh đó; cài "Trợ live" thì không xếp làm host. Xếp tay vẫn được nhưng lịch sẽ hiện cảnh báo.
      </p>
      {error && <p className="text-2xs text-rose-300">{error}</p>}
    </div>
  );
};
