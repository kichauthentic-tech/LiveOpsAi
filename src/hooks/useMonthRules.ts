import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteMonthRule, fetchMonthRules, upsertMonthRules } from "../lib/db/talentMonthRules";
import { errorMessage } from "../lib/errorMessage";
import { isMonthLocked, ruleKey, type MonthRule, type RuleRole } from "../lib/roster/monthRules";
import { getTodayDate } from "../lib/dateUtils";

// Luật đặt giờ của MỘT tháng. Có bảng (0229) ⇒ lưu DB, cả team thấy; chưa chạy 0229 ⇒ lưu theo trình duyệt
// (`roster.monthRules.<tháng>`), banner báo "chưa lưu chung". Tháng đã qua bị khoá: hook từ chối ghi (DB cũng chặn bằng trigger).
export type RulesBackend = "loading" | "db" | "local";
export interface MonthRules {
  month: string;
  rules: MonthRule[];
  byKey: Record<string, MonthRule>;
  /** Luật của một người (cả hai vai nếu có). */
  forTalent: (talentId: string) => MonthRule[];
  backend: RulesBackend;
  locked: boolean;
  error: string | null;
  /** Lưu nhiều dòng; trần tháng + nửa đầu tự đồng bộ sang vai còn lại của cùng người. */
  save: (rows: MonthRule[]) => Promise<void>;
  remove: (talentId: string, role: RuleRole) => Promise<void>;
  /** Ghi đè cả tháng bằng danh sách này (chép từ tháng trước / bắt đầu trống). */
  replaceAll: (rows: MonthRule[]) => Promise<void>;
}

const lsKey = (month: string) => `roster.monthRules.${month}`;
const readLocal = (month: string): MonthRule[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(lsKey(month)) ?? "[]");
    return Array.isArray(raw) ? (raw.filter((r) => r && typeof r.talentId === "string" && (r.role === "host" || r.role === "assistant")) as MonthRule[]) : [];
  } catch {
    return [];
  }
};
const writeLocal = (month: string, rows: MonthRule[]) => {
  try {
    localStorage.setItem(lsKey(month), JSON.stringify(rows));
  } catch {
    /* chỉ là tiện ích */
  }
};

/** Đồng bộ trần tháng + nửa đầu giữa các vai của một người: dòng vừa sửa thắng. */
export function syncShared(all: readonly MonthRule[], changed: readonly MonthRule[]): MonthRule[] {
  const byKey = new Map(all.map((r) => [ruleKey(r.talentId, r.role), r]));
  for (const c of changed) byKey.set(ruleKey(c.talentId, c.role), c);
  for (const c of changed) {
    for (const role of ["host", "assistant"] as const) {
      const k = ruleKey(c.talentId, role);
      const o = byKey.get(k);
      if (o && role !== c.role) byKey.set(k, { ...o, maxHours: c.maxHours, firstHalfMax: c.firstHalfMax });
    }
  }
  return [...byKey.values()];
}

export function useMonthRules(month: string): MonthRules {
  const [state, setState] = useState<{ month: string; rules: MonthRule[]; backend: RulesBackend }>({ month, rules: [], backend: "loading" });
  const [error, setError] = useState<string | null>(null);
  const locked = isMonthLocked(month, getTodayDate());

  useEffect(() => {
    let alive = true;
    setState({ month, rules: [], backend: "loading" });
    fetchMonthRules(month)
      .then((rows) => {
        if (alive) setState(rows === null ? { month, rules: readLocal(month), backend: "local" } : { month, rules: rows, backend: "db" });
      })
      .catch((e) => {
        if (!alive) return;
        setError(errorMessage(e));
        setState({ month, rules: readLocal(month), backend: "local" });
      });
    return () => {
      alive = false;
    };
  }, [month]);

  const save = useCallback(
    async (incoming: MonthRule[]) => {
      if (locked || state.month !== month) return;
      setError(null);
      const merged = syncShared(state.rules, incoming);
      const touched = merged.filter((r) => incoming.some((i) => i.talentId === r.talentId));
      if (state.backend === "db") {
        try {
          await upsertMonthRules(touched);
        } catch (e) {
          setError(errorMessage(e));
          return;
        }
      } else writeLocal(month, merged);
      setState((s) => ({ ...s, rules: merged }));
    },
    [state.backend, state.rules, state.month, month, locked]
  );

  const remove = useCallback(
    async (talentId: string, role: RuleRole) => {
      if (locked) return;
      setError(null);
      if (state.backend === "db") {
        try {
          await deleteMonthRule(month, talentId, role);
        } catch (e) {
          setError(errorMessage(e));
          return;
        }
      }
      setState((s) => {
        const rules = s.rules.filter((r) => !(r.talentId === talentId && r.role === role));
        if (s.backend !== "db") writeLocal(month, rules);
        return { ...s, rules };
      });
    },
    [state.backend, month, locked]
  );

  const replaceAll = useCallback(
    async (rows: MonthRule[]) => {
      if (locked) return;
      setError(null);
      if (state.backend === "db") {
        try {
          await upsertMonthRules(rows);
        } catch (e) {
          setError(errorMessage(e));
          return;
        }
      } else writeLocal(month, rows);
      setState((s) => ({ ...s, rules: rows }));
    },
    [state.backend, month, locked]
  );

  const byKey = useMemo(() => Object.fromEntries(state.rules.map((r) => [ruleKey(r.talentId, r.role), r])), [state.rules]);
  const forTalent = useCallback((id: string) => state.rules.filter((r) => r.talentId === id), [state.rules]);
  return { month, rules: state.rules, byKey, forTalent, backend: state.backend, locked, error, save, remove, replaceAll };
}

/** Đọc luật của một tháng khác (để chép sang tháng mới): DB nếu có bảng, không thì bản lưu theo trình duyệt. */
export async function loadMonthRules(month: string): Promise<MonthRule[]> {
  try {
    const rows = await fetchMonthRules(month);
    return rows ?? readLocal(month);
  } catch {
    return readLocal(month);
  }
}
