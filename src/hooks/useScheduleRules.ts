import { useCallback, useEffect, useMemo, useState } from "react";
import { cleanClauses, deleteScheduleRule, fetchScheduleRules, upsertScheduleRules } from "../lib/db/talentScheduleRules";
import { errorMessage } from "../lib/errorMessage";
import type { PersonRule } from "../lib/roster/placementRules";

// Quy luật đặt giờ từng người. Có bảng (0224) ⇒ lưu DB, cả team thấy; chưa chạy 0224 ⇒ lưu theo trình duyệt (`roster.scheduleRules`)
// để màn hình vẫn dùng được, banner báo "chưa lưu chung".
export type RulesBackend = "loading" | "db" | "local";
export interface ScheduleRules {
  rules: PersonRule[];
  byTalent: Record<string, PersonRule>;
  backend: RulesBackend;
  error: string | null;
  save: (rows: PersonRule[]) => Promise<void>;
  remove: (talentId: string) => Promise<void>;
}

const LS_KEY = "roster.scheduleRules";
const readLocal = (): PersonRule[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.talentId === "string").map((r) => ({ talentId: r.talentId, clauses: cleanClauses(r.clauses), night: !!r.night, note: typeof r.note === "string" ? r.note : "" })) : [];
  } catch {
    return [];
  }
};
const writeLocal = (rows: PersonRule[]) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {
    /* chỉ là tiện ích */
  }
};

export function useScheduleRules(): ScheduleRules {
  const [state, setState] = useState<{ rules: PersonRule[]; backend: RulesBackend }>({ rules: [], backend: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchScheduleRules()
      .then((rows) => {
        if (alive) setState(rows === null ? { rules: readLocal(), backend: "local" } : { rules: rows, backend: "db" });
      })
      .catch((e) => {
        if (!alive) return;
        setError(errorMessage(e));
        setState({ rules: readLocal(), backend: "local" });
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(
    async (incoming: PersonRule[]) => {
      setError(null);
      if (state.backend === "db") {
        try {
          await upsertScheduleRules(incoming);
        } catch (e) {
          setError(errorMessage(e));
          return;
        }
      }
      setState((s) => {
        const rules = [...s.rules.filter((r) => !incoming.some((n) => n.talentId === r.talentId)), ...incoming];
        if (s.backend !== "db") writeLocal(rules);
        return { ...s, rules };
      });
    },
    [state.backend]
  );

  const remove = useCallback(
    async (talentId: string) => {
      setError(null);
      if (state.backend === "db") {
        try {
          await deleteScheduleRule(talentId);
        } catch (e) {
          setError(errorMessage(e));
          return;
        }
      }
      setState((s) => {
        const rules = s.rules.filter((r) => r.talentId !== talentId);
        if (s.backend !== "db") writeLocal(rules);
        return { ...s, rules };
      });
    },
    [state.backend]
  );

  const byTalent = useMemo(() => Object.fromEntries(state.rules.map((r) => [r.talentId, r])), [state.rules]);
  return { rules: state.rules, byTalent, backend: state.backend, error, save, remove };
}
