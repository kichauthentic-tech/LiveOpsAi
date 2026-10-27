import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { Brand, BrandChannel, BrandMonthPlan, BrandMonthlyCommitment, BrandMonthlyReport, BrandPlatformRate, LiveSession, ShiftSlot, Talent } from "../types";
import { buildTodos, groupTodos, Todo, TodoLevel, TodoRow } from "../lib/todoList";
import { PlanCoverage, fetchPlanCoverage, planStatusesRead } from "../lib/db/monthPlans";
import { commitmentsRead } from "../lib/db/brandContracts";
import { AffiliateTodoData, fetchAffiliateTodoData } from "../lib/db/affiliateActuals";
import { todayVn } from "../lib/performance/brandCommitment";
import { fetchShiftAcks, type ShiftAck } from "../lib/db/shiftAcks";

// Khối "Việc cần làm" ở đầu Bảng Vận Hành — màn đầu tiên của ops sau khi đăng nhập (audit người mới 2026-10-04).
// Trước đây màn đó chỉ có "Không có ca nào hôm nay" trong khi kế hoạch còn nháp, số liệu cũ 12 ngày, chưa brand nào
// có giá — người mới không biết bắt đầu từ đâu. Danh sách tự sinh ở lib/todoList.ts.
// 25/10 (audit Bảng Vận Hành, user chốt): hai phần — "Hôm nay phải xong" (hạn ≤ 48 giờ) luôn mở, "Việc tháng" gom theo loại và thu gọn
// (31 việc rời trước đây: 6 đỏ / 17 vàng, 20 việc tháng chen giữa việc phải làm ngay).

interface Props {
  brands: Brand[];
  channels: BrandChannel[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  rates: BrandPlatformRate[];
  monthlyReports: Map<string, BrandMonthlyReport>;
  talents: Talent[];
  canSeeMoney: boolean;
  /** Ca nháp sa bàn đang chờ (useSessionDrafts của App). */
  draftCount?: number;
  /** Màn nào người dùng mở được (theo quyền) — việc dẫn tới màn bị khoá thì không hiện. */
  canOpenTab: (tab: string) => boolean;
  onOpen: (todo: Todo) => void;
}

const LEVEL_DOT: Record<TodoLevel, string> = { high: "bg-rose-400", medium: "bg-amber-400", low: "bg-sky-400" };

function nextMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const TodoPanel: React.FC<Props> = ({ brands, channels, sessions, shiftSlots, rates, monthlyReports, talents, canSeeMoney, draftCount, canOpenTab, onOpen }) => {
  const today = todayVn();
  const month = today.slice(0, 7);
  const [plansThisMonth, setPlansThisMonth] = useState<Map<string, BrandMonthPlan> | null>(null);
  const [plansNextMonth, setPlansNextMonth] = useState<Map<string, BrandMonthPlan> | null>(null);
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[] | null>(null);
  // Kế hoạch Affiliate (0155): lỗi (DB chưa chạy 0155, mạng) ⇒ null = bỏ qua việc Affiliate chứ không chặn cả khối.
  const [affiliate, setAffiliate] = useState<AffiliateTodoData | null | undefined>(undefined);
  // Độ phủ kế hoạch (ca ngoài kế hoạch, ca tăng cường): lỗi ⇒ null = bỏ qua hai việc này chứ không chặn cả khối.
  const [coverage, setCoverage] = useState<PlanCoverage | null | undefined>(undefined);
  // "Đã nhận lịch" (0169): lỗi (DB chưa chạy 0169) ⇒ null = bỏ qua việc "chưa nhận lịch".
  const [acks, setAcks] = useState<ShiftAck[] | null | undefined>(undefined);
  const [monthOpen, setMonthOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    planStatusesRead.take(month).then((m) => alive && setPlansThisMonth(m)).catch(() => alive && setPlansThisMonth(new Map()));
    planStatusesRead.take(nextMonthOf(month)).then((m) => alive && setPlansNextMonth(m)).catch(() => alive && setPlansNextMonth(new Map()));
    fetchPlanCoverage(month).then((c) => alive && setCoverage(c)).catch(() => alive && setCoverage(null));
    commitmentsRead.take().then((c) => alive && setCommitments(c)).catch(() => alive && setCommitments([]));
    fetchAffiliateTodoData([prevMonthOf(month), month, nextMonthOf(month)]).then((a) => alive && setAffiliate(a)).catch(() => alive && setAffiliate(null));
    fetchShiftAcks(todayVn()).then((a) => alive && setAcks(a)).catch(() => alive && setAcks(null));
    return () => {
      alive = false;
    };
  }, [month]);

  const todos = useMemo(() => {
    if (!plansThisMonth || !plansNextMonth || !commitments || affiliate === undefined || coverage === undefined || acks === undefined) return null;
    return buildTodos({ today, draftCount, acks: acks ?? undefined, brands, channels, sessions, shiftSlots, plansThisMonth, plansNextMonth, coverage: coverage ?? undefined, commitments, rates, monthlyReports, talents, canSeeMoney, affiliate: affiliate ?? undefined }).filter((t) => canOpenTab(t.tab));
  }, [today, acks, brands, channels, sessions, shiftSlots, plansThisMonth, plansNextMonth, coverage, commitments, rates, monthlyReports, talents, canSeeMoney, affiliate, canOpenTab, draftCount]);

  if (todos === null) return null; // đang tải — không vẽ khung rỗng rồi nhảy
  const { today: dayRows, month: monthGroups } = groupTodos(todos);
  const monthCount = monthGroups.reduce((n, g) => n + g.items.length, 0);

  const actionBtn = (t: Todo) => (
    <button
      onClick={() => onOpen(t)}
      className="shrink-0 -my-0.5 min-h-6 px-2.5 py-1 rounded-lg border border-[var(--border)] text-[11px] font-bold text-[var(--accent-text)] hover:border-[var(--accent)] whitespace-nowrap"
    >
      {t.action} →
    </button>
  );
  const row = (t: TodoRow) => (
    // Bố cục 18/10: nút đứng cùng hàng với tiêu đề việc, cách làm 1 dòng — bấm vào chữ để đọc hết.
    <li key={t.id} className="py-2.5 flex items-start gap-x-2.5">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[t.level]}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-bold text-[var(--text)] min-w-0">{t.title}</p>
          {actionBtn(t)}
        </div>
        {t.detail && (
          <button
            type="button"
            onClick={() => setOpenDetail((id) => (id === t.id ? null : t.id))}
            aria-expanded={openDetail === t.id}
            title={openDetail === t.id ? undefined : t.detail}
            className={`w-full text-left text-[11px] text-[var(--text-muted)] mt-0.5 hover:text-[var(--text)] ${openDetail === t.id ? "" : "line-clamp-1"}`}
          >
            {t.detail}
          </button>
        )}
        {t.children && openDetail === t.id && (
          <ul className="mt-1.5 space-y-1">
            {t.children.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                <span className="min-w-0">{c.title}</span>
                {actionBtn(c)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-2" aria-label="Việc cần làm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-[var(--accent-text)]" /> Hôm nay phải xong
          <span className="text-[11px] font-normal text-[var(--text-faint)]">hạn trong 48 giờ</span>
        </h3>
        {dayRows.length > 0 && <span className="text-[11px] text-[var(--text-muted)]">{dayRows.length} việc</span>}
      </div>
      {dayRows.length === 0 ? (
        <p className="text-xs text-emerald-300">Không có việc gấp: ca đã qua đều có số liệu, 48 giờ tới đủ người và phòng.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-muted)]">{dayRows.map(row)}</ul>
      )}
      {monthGroups.length > 0 && (
        <div className="border-t border-[var(--border-muted)] pt-2">
          <button onClick={() => setMonthOpen((x) => !x)} aria-expanded={monthOpen} className="w-full flex items-center justify-between gap-2 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] min-h-7">
            <span>Việc tháng · {monthGroups.length} nhóm, {monthCount} việc</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${monthOpen ? "rotate-180" : ""}`} />
          </button>
          {monthOpen && (
            <ul className="divide-y divide-[var(--border-muted)]">
              {monthGroups.map((g) =>
                g.items.length === 1 ? (
                  row(g.items[0])
                ) : (
                  <li key={g.key} className="py-2.5">
                    <button type="button" onClick={() => setOpenGroup((k) => (k === g.key ? null : g.key))} aria-expanded={openGroup === g.key} className="w-full flex items-start gap-x-2.5 text-left">
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[g.level]}`} aria-hidden />
                      <span className="flex-1 min-w-0 text-xs font-bold text-[var(--text)]">{g.label}</span>
                      <span className="text-[11px] font-bold text-[var(--text-muted)] tabular-nums">{g.items.length}</span>
                      <ChevronDown className={`w-3.5 h-3.5 mt-0.5 text-[var(--text-muted)] transition-transform ${openGroup === g.key ? "rotate-180" : ""}`} />
                    </button>
                    {openGroup === g.key && (
                      <ul className="mt-1.5 ml-4.5 space-y-1.5">
                        {g.items.map((t) => (
                          <li key={t.id} className="flex items-start justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                            <span className="min-w-0">{t.title}</span>
                            {actionBtn(t)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
