import React, { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { BrandMonthPlan, BrandMonthPlanSlot, UserRole } from "../../types";
import { confirmMonthPlan, fetchMonthPlan } from "../../lib/db/monthPlans";
import { sessionDurationHours } from "../../lib/pnl";
import { todayVn } from "../../lib/performance/brandCommitment";
import { errorMessage } from "../../lib/errorMessage";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";

// Kế hoạch tháng sau cho Brand Workspace — bản CHỈ ĐỌC + một nút "xác nhận đã xem" (Đợt C/2,
// migration 0110). Khác hẳn "Kế Hoạch Tháng" bên Agency (MonthPlan.tsx): bên đó ops dựng lưới,
// gợi ý từ lịch sử, chỉnh tay từng ca rồi CHỐT (sinh ca thật). Màn này không sửa được gì — chỉ trả
// lời "tháng sau agency định lên lịch thế nào" và ghi lại brand đã xem qua.
//
// "Xác nhận" KHÔNG chặn ops chốt kế hoạch — chốt vẫn làm được dù brand chưa xác nhận (xem migration).
// Nó chỉ là một dấu mốc để 2 bên biết nhau đã cùng nhìn một lịch, tự RỚT nếu ops sửa gì sau đó
// (trigger phía DB) — brand mở lại thấy "đã xác nhận" thì chắc chắn lịch chưa đổi từ lúc đó.

interface BrandNextMonthPlanProps {
  brandId: string;
  brandName: string;
  // Xác nhận chỉ là hành động của chính tài khoản brand (guard trong RPC confirm_month_plan).
  // Ops mở Brand Workspace hộ khách vẫn thấy đúng lịch nhưng không có nút — bấm sẽ luôn bị DB từ
  // chối, hiện nút cho họ chỉ gây nhầm "mình xác nhận thay được".
  currentRole: UserRole;
}

const nextMonthOf = (ymd: string): string => {
  const [y, m] = ymd.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m, 1); // m (1-indexed hiện tại) làm tháng cho Date 0-indexed = tháng sau
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};
const fmtMonthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `Tháng ${Number(mm)}/${y}`;
};
const fmtHours = (h: number) => `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const BrandNextMonthPlan: React.FC<BrandNextMonthPlanProps> = ({ brandId, brandName, currentRole }) => {
  const nextMonth = useMemo(() => nextMonthOf(todayVn()), []);
  const [plan, setPlan] = useState<BrandMonthPlan | null>(null);
  const [slots, setSlots] = useState<BrandMonthPlanSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = () => {
    setLoading(true);
    setErrorMsg(null);
    fetchMonthPlan(brandId, nextMonth)
      .then((r) => {
        setPlan(r?.plan ?? null);
        setSlots(r?.slots ?? []);
      })
      .catch((e) => {
        const code = (e as { code?: string } | null)?.code;
        setErrorMsg(
          code === "PGRST205"
            ? "Mục này đang được thiết lập, sẽ có dữ liệu sau ít phút."
            : errorMessage(e, "Không tải được kế hoạch tháng sau")
        );
        if (code === "PGRST205") {
          console.warn("[LiveOps] Đọc brand_month_plans lỗi PGRST205 — kiểm tra đã chạy đủ migration.");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [brandId, nextMonth]);

  const totalHours = useMemo(() => slots.reduce((s, sl) => s + Math.max(sessionDurationHours(sl.startTime, sl.endTime), 0), 0), [slots]);
  const sortedSlots = useMemo(() => [...slots].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)), [slots]);

  const handleConfirm = async () => {
    if (!plan) return;
    setConfirming(true);
    try {
      const updated = await confirmMonthPlan(plan.id);
      setPlan(updated);
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      setErrorMsg(
        code === "PGRST202"
          ? "Mục xác nhận đang được thiết lập, thử lại sau ít phút."
          : errorMessage(e, "Không xác nhận được, thử lại")
      );
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--text-faint)] text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải kế hoạch…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xl space-y-2">
        <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
          <CalendarCheck2 className="w-4 h-4" /> Kế Hoạch Tháng Sau
        </span>
        <h2 className="text-2xl font-black text-[var(--text)]">
          {brandName} · {fmtMonthLabel(nextMonth)}
        </h2>
        <p className="text-xs text-[var(--text-muted)] max-w-3xl">
          Lịch lên sóng agency dự kiến xếp cho tháng sau. Xem qua rồi bấm xác nhận — nếu agency đổi gì sau đó, mục xác nhận
          sẽ tự mất để bạn biết lịch đã khác.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{errorMsg}</div>
      )}

      {!plan && !errorMsg && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text-faint)] text-sm">
          Agency chưa lập kế hoạch cho {fmtMonthLabel(nextMonth)}. Ghé lại sau nhé.
        </div>
      )}

      {plan && (
        <div className="bg-[var(--surface)] border border-[var(--accent)]/40 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                  plan.status === "locked"
                    ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                    : "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
                }`}
              >
                {plan.status === "locked" ? "Đã chốt lịch" : "Đang soạn"}
              </span>
              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {fmtHours(totalHours)} · {slots.length} ca
              </span>
              {plan.targetGmv > 0 && (
                <span className="text-xs text-[var(--text-muted)]">Target: {formatCurrencyAdaptive(plan.targetGmv, "")}</span>
              )}
            </div>

            {plan.brandConfirmedAt ? (
              <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã xác nhận lúc {fmtDateTime(plan.brandConfirmedAt)}
              </span>
            ) : currentRole === "brand" ? (
              <button
                onClick={handleConfirm}
                disabled={confirming || slots.length === 0}
                className="text-xs font-bold px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-50 flex items-center gap-1.5"
              >
                {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Xác nhận đã xem lịch
              </button>
            ) : (
              <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-faint)] border border-[var(--border)]">
                Chờ brand xác nhận
              </span>
            )}
          </div>

          {slots.length === 0 ? (
            <div className="text-center text-[var(--text-faint)] text-sm py-6">Agency chưa xếp ca nào cho tháng này.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Ngày</th>
                    <th className="py-2.5 px-2">Giờ live</th>
                    <th className="py-2.5 px-2 text-right">Target</th>
                    <th className="py-2.5 px-3">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSlots.map((s) => (
                    <tr key={s.id} className="border-b border-[var(--border-muted)]">
                      <td className="py-2 px-3 font-bold text-[var(--text)] whitespace-nowrap">{fmtDate(s.date)}</td>
                      <td className="py-2 px-2 text-[var(--text-muted)] whitespace-nowrap">
                        {s.startTime}–{s.endTime}
                      </td>
                      <td className="py-2 px-2 text-right text-[var(--text-muted)] whitespace-nowrap">
                        {s.targetGmv > 0 ? formatCurrencyAdaptive(s.targetGmv, "") : "—"}
                      </td>
                      <td className="py-2 px-3 text-[var(--text-faint)]">{s.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
