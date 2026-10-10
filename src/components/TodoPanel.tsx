import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { Brand, BrandChannel, BrandMonthPlan, BrandMonthlyCommitment, BrandMonthlyReport, BrandPlatformRate, LiveSession, ShiftSlot, Talent } from "../types";
import { buildTodos, Todo, TodoLevel } from "../lib/todoList";
import { PlanCoverage, fetchPlanCoverage, planStatusesRead } from "../lib/db/monthPlans";
import { commitmentsRead } from "../lib/db/brandContracts";
import { AffiliateTodoData, fetchAffiliateTodoData } from "../lib/db/affiliateActuals";
import { todayVn } from "../lib/performance/brandCommitment";

// Khối "Việc cần làm" ở đầu Bảng Vận Hành — màn đầu tiên của ops sau khi đăng nhập (audit người mới 2026-10-04).
// Trước đây màn đó chỉ có "Không có ca nào hôm nay" trong khi kế hoạch còn nháp, số liệu cũ 12 ngày, chưa brand nào
// có giá — người mới không biết bắt đầu từ đâu. Danh sách tự sinh ở lib/todoList.ts.

interface Props {
  brands: Brand[];
  channels: BrandChannel[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  rates: BrandPlatformRate[];
  monthlyReports: Map<string, BrandMonthlyReport>;
  talents: Talent[];
  canSeeMoney: boolean;
  /** Màn nào người dùng mở được (theo quyền) — việc dẫn tới màn bị khoá thì không hiện. */
  canOpenTab: (tab: string) => boolean;
  onOpen: (todo: Todo) => void;
}

const LEVEL_DOT: Record<TodoLevel, string> = { high: "bg-rose-400", medium: "bg-amber-400", low: "bg-sky-400" };
const COLLAPSED_COUNT = 5;

function nextMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const TodoPanel: React.FC<Props> = ({ brands, channels, sessions, shiftSlots, rates, monthlyReports, talents, canSeeMoney, canOpenTab, onOpen }) => {
  const today = todayVn();
  const month = today.slice(0, 7);
  const [plansThisMonth, setPlansThisMonth] = useState<Map<string, BrandMonthPlan> | null>(null);
  const [plansNextMonth, setPlansNextMonth] = useState<Map<string, BrandMonthPlan> | null>(null);
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[] | null>(null);
  // Kế hoạch Affiliate (0155): lỗi (DB chưa chạy 0155, mạng) ⇒ null = bỏ qua việc Affiliate chứ không chặn cả khối.
  const [affiliate, setAffiliate] = useState<AffiliateTodoData | null | undefined>(undefined);
  // Độ phủ kế hoạch (ca ngoài kế hoạch, ca tăng cường): lỗi ⇒ null = bỏ qua hai việc này chứ không chặn cả khối.
  const [coverage, setCoverage] = useState<PlanCoverage | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    planStatusesRead.take(month).then((m) => alive && setPlansThisMonth(m)).catch(() => alive && setPlansThisMonth(new Map()));
    planStatusesRead.take(nextMonthOf(month)).then((m) => alive && setPlansNextMonth(m)).catch(() => alive && setPlansNextMonth(new Map()));
    fetchPlanCoverage(month).then((c) => alive && setCoverage(c)).catch(() => alive && setCoverage(null));
    commitmentsRead.take().then((c) => alive && setCommitments(c)).catch(() => alive && setCommitments([]));
    fetchAffiliateTodoData([prevMonthOf(month), month, nextMonthOf(month)]).then((a) => alive && setAffiliate(a)).catch(() => alive && setAffiliate(null));
    return () => {
      alive = false;
    };
  }, [month]);

  const todos = useMemo(() => {
    if (!plansThisMonth || !plansNextMonth || !commitments || affiliate === undefined || coverage === undefined) return null;
    return buildTodos({ today, brands, channels, sessions, shiftSlots, plansThisMonth, plansNextMonth, coverage: coverage ?? undefined, commitments, rates, monthlyReports, talents, canSeeMoney, affiliate: affiliate ?? undefined }).filter((t) => canOpenTab(t.tab));
  }, [today, brands, channels, sessions, shiftSlots, plansThisMonth, plansNextMonth, coverage, commitments, rates, monthlyReports, talents, canSeeMoney, affiliate, canOpenTab]);

  if (todos === null) return null; // đang tải — không vẽ khung rỗng rồi nhảy
  const shown = expanded ? todos : todos.slice(0, COLLAPSED_COUNT);

  return (
    <section className="@container bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-3" aria-label="Việc cần làm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-[var(--accent-text)]" /> Việc cần làm
          <span className="text-[11px] font-normal text-[var(--text-faint)]">tự sinh từ dữ liệu · đỏ trước</span>
        </h3>
        {todos.length > 0 && <span className="text-[11px] text-[var(--text-muted)]">{todos.length} việc</span>}
      </div>
      {todos.length === 0 ? (
        <p className="text-xs text-emerald-300">Không có việc nào đang thiếu: kế hoạch đã chốt, số liệu mới, report đã phát hành.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-muted)]">
          {shown.map((t) => (
            // Khung hẹp (cột phải Bảng Vận Hành ~400px): nút xuống dưới chữ thay vì ép chữ còn ~200px.
            <li key={t.id} className="py-2 flex flex-wrap @md:flex-nowrap items-start gap-x-3 gap-y-1.5">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[t.level]}`} aria-hidden />
              <div className="flex-1 min-w-0 basis-[calc(100%-1.25rem)] @md:basis-auto">
                <p className="text-xs font-bold text-[var(--text)]">{t.title}</p>
                {t.detail && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{t.detail}</p>}
              </div>
              <button
                onClick={() => onOpen(t)}
                className="shrink-0 ml-5 @md:ml-0 min-h-6 px-2.5 py-1 rounded-lg border border-[var(--border)] text-[11px] font-bold text-[var(--accent-text)] hover:border-[var(--accent)]"
              >
                {t.action} →
              </button>
            </li>
          ))}
        </ul>
      )}
      {todos.length > COLLAPSED_COUNT && (
        <button onClick={() => setExpanded((x) => !x)} className="text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1 min-h-6">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Thu gọn" : `Xem thêm ${todos.length - COLLAPSED_COUNT} việc`}
        </button>
      )}
    </section>
  );
};
