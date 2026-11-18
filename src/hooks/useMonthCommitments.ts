import { useCallback, useEffect, useMemo, useState } from "react";
import { capsOf, deleteMonthCommitment, fetchMonthCommitments, upsertMonthCommitments, type CommitmentRow } from "../lib/db/talentMonthCommitments";
import { errorMessage } from "../lib/errorMessage";
import type { PersonCap } from "../lib/roster/monthPlanner";

// Giờ cam kết (trần giờ) của tháng đang xếp. Có bảng (0223) ⇒ lưu DB, cả team thấy; chưa chạy 0223 ⇒ lưu theo trình duyệt (`roster.commitments.<tháng>`)
// để màn hình vẫn dùng được, banner báo "chưa lưu chung".
export type CommitBackend = "loading" | "db" | "local";
export interface MonthCommitments {
  month: string;
  rows: CommitmentRow[];
  caps: Record<string, PersonCap>;
  backend: CommitBackend;
  error: string | null;
  save: (rows: CommitmentRow[]) => Promise<void>;
  remove: (talentId: string) => Promise<void>;
}

const lsKey = (month: string) => `roster.commitments.${month}`;
const readLocal = (month: string): CommitmentRow[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(lsKey(month)) ?? "[]");
    return Array.isArray(raw) ? (raw as CommitmentRow[]) : [];
  } catch {
    return [];
  }
};
const writeLocal = (month: string, rows: CommitmentRow[]) => {
  try {
    localStorage.setItem(lsKey(month), JSON.stringify(rows));
  } catch {
    /* chỉ là tiện ích */
  }
};

export function useMonthCommitments(month: string): MonthCommitments {
  const [state, setState] = useState<{ month: string; rows: CommitmentRow[]; backend: CommitBackend }>({ month, rows: [], backend: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMonthCommitments(month)
      .then((rows) => {
        if (!alive) return;
        setState(rows === null ? { month, rows: readLocal(month), backend: "local" } : { month, rows, backend: "db" });
      })
      .catch((e) => {
        if (!alive) return;
        setError(errorMessage(e));
        setState({ month, rows: readLocal(month), backend: "local" });
      });
    return () => {
      alive = false;
    };
  }, [month]);

  const save = useCallback(
    async (incoming: CommitmentRow[]) => {
      setError(null);
      const merge = (prev: CommitmentRow[]) => [...prev.filter((r) => !incoming.some((n) => n.talentId === r.talentId)), ...incoming];
      if (state.backend === "db") {
        try {
          await upsertMonthCommitments(month, incoming);
        } catch (e) {
          setError(errorMessage(e));
          return;
        }
      }
      setState((s) => {
        const rows = merge(s.rows);
        if (s.backend !== "db") writeLocal(month, rows);
        return { ...s, rows };
      });
    },
    [month, state.backend]
  );

  const remove = useCallback(
    async (talentId: string) => {
      setError(null);
      if (state.backend === "db") {
        try {
          await deleteMonthCommitment(month, talentId);
        } catch (e) {
          setError(errorMessage(e));
          return;
        }
      }
      setState((s) => {
        const rows = s.rows.filter((r) => r.talentId !== talentId);
        if (s.backend !== "db") writeLocal(month, rows);
        return { ...s, rows };
      });
    },
    [month, state.backend]
  );

  const rows = useMemo(() => (state.month === month ? state.rows : []), [state.month, state.rows, month]);
  const caps = useMemo(() => capsOf(rows), [rows]);
  return { month, rows, caps, backend: state.month === month ? state.backend : "loading", error, save, remove };
}
