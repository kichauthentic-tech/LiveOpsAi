import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, UserRole, BrandMonthlyReport as BrandMonthlyReportType } from "../../types";
import { AlertTriangle, Loader2, Lock, Megaphone, Save, Target, TrendingUp } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { getTodayMonth } from "../../lib/dateUtils";
import { getCanonicalAdsCost } from "../../lib/metrics/adsCost";
import { isoWeekStart } from "../../lib/dataraw/weeklySlice";
import { fetchMonthlyReport, upsertMonthlyReport, MonthlyReportManualInput } from "../../lib/db/monthlyReports";

// Nhập Ads & Ghi Chú (tách khỏi Report Tháng 2026-09-21 theo yêu cầu user): phần ops nhập tay
// Ads Spend bổ sung / ROAS ghi đè / Promotion / Customer Insight / Account Health trước đây nằm
// cuối Report Tháng, lẫn với tài liệu gửi brand. Giờ là tab riêng trong Brand Workspace, chỉ
// ops thấy. Vẫn ghi vào cùng dòng `brand_monthly_reports` (0051) — Report Tháng chỉ còn phát hành.
// Khối "Ads Report Chi Tiết (TikTok)" (tính từ ads_cost trong Report Ca) đi theo sang đây để ops
// nhìn số máy tính được rồi mới nhập phần bổ sung.

const CAN_MANAGE_ROLES: UserRole[] = ["ceo", "operations", "admin"];

interface BrandAdsReportProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  currentRole: UserRole;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function prevMonthStr(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m là 1-12, lùi 1 tháng
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface AdsReportSummary {
  totalAdsSpend: number;
  totalGmv: number; // GMV của đúng các phiên có Ads Spend, để ROAS phản ánh đúng cặp chi phí-doanh thu
  reportedCount: number;
  missingCount: number; // phiên TikTok Completed nhưng chưa nộp Report Ca -> không có ads_cost
  weekly: { weekStart: string; adsSpend: number; gmv: number }[];
}

// Chỉ session TikTok có Report Ca (live_session_reports) mới có ads_cost — Shopee không có field
// này trong Excel gốc (xem migration 0046), nên Ads Report chi tiết chỉ tính được cho TikTok.
function summarizeAdsReport(completed: LiveSession[]): AdsReportSummary {
  const tikTokSessions = completed.filter((s) => s.platform === "TikTok");
  const reported = tikTokSessions.filter((s) => s.report != null);
  const missing = tikTokSessions.filter((s) => s.report == null);

  const weeklyMap = new Map<string, { weekStart: string; adsSpend: number; gmv: number }>();
  let totalAdsSpend = 0;
  let totalGmv = 0;
  for (const s of reported) {
    const spend = getCanonicalAdsCost(s);
    totalAdsSpend += spend;
    totalGmv += s.actualGmv || 0;
    const weekStart = isoWeekStart(s.date);
    const entry = weeklyMap.get(weekStart) || { weekStart, adsSpend: 0, gmv: 0 };
    entry.adsSpend += spend;
    entry.gmv += s.actualGmv || 0;
    weeklyMap.set(weekStart, entry);
  }

  return {
    totalAdsSpend,
    totalGmv,
    reportedCount: reported.length,
    missingCount: missing.length,
    weekly: Array.from(weeklyMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  };
}

function momPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

const MomChip: React.FC<{ current: number | null; previous: number | null }> = ({ current, previous }) => {
  if (current == null || previous == null) return <div className="text-[10px] text-[var(--text-faint)] mt-0.5">MoM —</div>;
  const pct = momPct(current, previous);
  if (pct == null) return <div className="text-[10px] text-[var(--text-faint)] mt-0.5">MoM —</div>;
  const positive = pct >= 0;
  return (
    <div className={`text-[10px] font-bold mt-0.5 ${positive ? "text-emerald-400" : "text-red-400"}`}>
      MoM {positive ? "+" : ""}
      {pct.toFixed(1)}%
    </div>
  );
};

export const BrandAdsReport: React.FC<BrandAdsReportProps> = ({ brandId, brandName, sessions, currentRole }) => {
  const canManage = CAN_MANAGE_ROLES.includes(currentRole);
  const [month, setMonth] = useState(getTodayMonth());
  const [report, setReport] = useState<BrandMonthlyReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [adsSpend, setAdsSpend] = useState<string>("");
  const [roas, setRoas] = useState<string>("");
  const [promotionNotes, setPromotionNotes] = useState("");
  const [customerInsightNotes, setCustomerInsightNotes] = useState("");
  const [accountHealthNotes, setAccountHealthNotes] = useState("");

  const { start, end } = useMemo(() => monthRange(month), [month]);
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && s.status === "Completed"),
    [sessions, brandId, start, end]
  );
  const { start: prevStart, end: prevEnd } = useMemo(() => monthRange(prevMonthStr(month)), [month]);
  const prevCompletedSessions = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= prevStart && s.date <= prevEnd && s.status === "Completed"),
    [sessions, brandId, prevStart, prevEnd]
  );

  const adsReport = useMemo(() => summarizeAdsReport(completedSessions), [completedSessions]);
  const prevAdsReport = useMemo(() => summarizeAdsReport(prevCompletedSessions), [prevCompletedSessions]);
  const adsRoas = adsReport.totalAdsSpend > 0 ? adsReport.totalGmv / adsReport.totalAdsSpend : null;
  const prevAdsRoas = prevAdsReport.totalAdsSpend > 0 ? prevAdsReport.totalGmv / prevAdsReport.totalAdsSpend : null;
  const adsPctGmv = adsReport.totalGmv > 0 ? (adsReport.totalAdsSpend / adsReport.totalGmv) * 100 : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    setSavedAt(null);
    fetchMonthlyReport(brandId, `${month}-01`)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        setAdsSpend(r?.adsSpend != null ? String(r.adsSpend) : "");
        setRoas(r?.roas != null ? String(r.roas) : "");
        setPromotionNotes(r?.promotionNotes || "");
        setCustomerInsightNotes(r?.customerInsightNotes || "");
        setAccountHealthNotes(r?.accountHealthNotes || "");
      })
      .catch((e) => !cancelled && setErrorMsg(e.message || "Không tải được dữ liệu tháng"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, month]);

  const isPublished = report?.status === "published";
  const readOnly = !canManage || isPublished;

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      // Cùng 1 dòng brand_monthly_reports còn chứa kế hoạch tháng sau + mốc campaign (Tab 05 /
      // Tab 01 của Report Tháng) — pass-through nguyên giá trị đã tải, upsert ghi đè toàn bộ cột.
      const input: MonthlyReportManualInput = {
        ...(report ?? {}),
        adsSpend: adsSpend ? Number(adsSpend) : undefined,
        roas: roas ? Number(roas) : undefined,
        promotionNotes: promotionNotes || undefined,
        customerInsightNotes: customerInsightNotes || undefined,
        accountHealthNotes: accountHealthNotes || undefined
      };
      const saved = await upsertMonthlyReport(brandId, `${month}-01`, input);
      setReport(saved);
      setSavedAt(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
    } catch (e: any) {
      setErrorMsg(e.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] disabled:opacity-60";

  return (
    <div className="space-y-5">
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-[var(--accent-text)]" /> Nhập Ads & Ghi Chú
            </span>
            <h2 className="text-2xl font-black">{brandName} — {month}</h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="p-2 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)]"
            />
            {isPublished && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border bg-emerald-950 text-emerald-300 border-emerald-800">
                <Lock className="w-3.5 h-3.5" /> Report tháng đã phát hành
              </span>
            )}
          </div>
        </div>
        <p className="text-[var(--text-muted)] text-xs">
          Ads Spend/ROAS tính máy từ Report Ca ở trên; phần bổ sung và ghi chú nhập tay ở dưới (không có API TikTok Shop cho các
          phần này). Số lưu ở đây đi cùng Report Tháng {month} — khi report đã phát hành thì khoá, muốn sửa phải thu hồi ở Report Tháng.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{errorMsg}</div>
      )}

      {/* Ads Report chi tiết — tính từ ads_cost thật trong Report Ca (live_session_reports),
          chỉ có cho TikTok (Shopee không có field ads_cost trong Excel gốc, xem migration 0046). */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-[var(--accent-text)]" /> Ads Report Chi Tiết (TikTok)
        </h3>
        <p className="text-[11px] text-[var(--text-faint)]">
          Tính từ Ads Cost host/ops nhập trong Report Ca của các phiên TikTok Completed trong tháng, đối chiếu GMV cùng phiên để
          ra ROAS. So sánh MoM với tháng {prevMonthStr(month)}.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3">
            <div className="text-[11px] text-[var(--text-faint)]">Tổng Ads Spend</div>
            <div className="text-base font-black text-[var(--text)]">{formatCurrencyAdaptive(adsReport.totalAdsSpend)}</div>
            <MomChip current={adsReport.totalAdsSpend} previous={prevAdsReport.totalAdsSpend} />
          </div>
          <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3">
            <div className="text-[11px] text-[var(--text-faint)]">GMV Các Phiên Có Ads</div>
            <div className="text-base font-black text-[var(--text)]">{formatCurrencyAdaptive(adsReport.totalGmv)}</div>
            <MomChip current={adsReport.totalGmv} previous={prevAdsReport.totalGmv} />
          </div>
          <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3">
            <div className="text-[11px] text-[var(--text-faint)]">ROAS</div>
            <div className="text-base font-black text-[var(--text)]">{adsRoas != null ? `${adsRoas.toFixed(1)}x` : "—"}</div>
            <MomChip current={adsRoas} previous={prevAdsRoas} />
          </div>
          <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3">
            <div className="text-[11px] text-[var(--text-faint)]">% Ads / GMV</div>
            <div className="text-base font-black text-[var(--text)]">{adsPctGmv != null ? `${adsPctGmv.toFixed(1)}%` : "—"}</div>
          </div>
        </div>

        {adsReport.missingCount > 0 && (
          <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/50 rounded-xl p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            {adsReport.missingCount} phiên TikTok Completed trong tháng chưa nộp Report Ca (không có Ads Cost) — số Ads Spend/ROAS
            phía trên đang thấp hơn thực tế tương ứng.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                <th className="py-2 px-2">Tuần (bắt đầu Thứ Hai)</th>
                <th className="py-2 px-2 text-right">Ads Spend</th>
                <th className="py-2 px-2 text-right">GMV</th>
                <th className="py-2 px-2 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {adsReport.weekly.map((w) => (
                <tr key={w.weekStart} className="border-b border-[var(--border-muted)]">
                  <td className="py-2 px-2 text-[var(--text)] font-semibold">{new Date(`${w.weekStart}T00:00:00`).toLocaleDateString("vi-VN")}</td>
                  <td className="py-2 px-2 text-right text-[var(--text-muted)]">{formatCurrencyAdaptive(w.adsSpend)}</td>
                  <td className="py-2 px-2 text-right text-emerald-400 font-bold">{formatCurrencyAdaptive(w.gmv)}</td>
                  <td className="py-2 px-2 text-right text-[var(--text-muted)]">{w.adsSpend > 0 ? `${(w.gmv / w.adsSpend).toFixed(1)}x` : "—"}</td>
                </tr>
              ))}
              {adsReport.weekly.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[var(--text-faint)] italic">
                    Chưa có phiên TikTok nào có Report Ca trong tháng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-[var(--text-faint)]">
          Shopee chưa theo dõi Ads Cost theo phiên (không có field này trong Excel gốc) — dùng ô "Ads Spend Bổ Sung" bên dưới nếu
          cần cộng thêm chi phí Ads ngoài TikTok livestream.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--text-faint)] text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent-text)]" /> Ads/ROAS bổ sung, Promotion, Customer Insight, Account Health
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Ads Spend Bổ Sung (VNĐ)</label>
              <p className="text-[10px] text-[var(--text-faint)] mb-1">
                Chi phí Ads Shopee hoặc ads ngoài livestream, không tính được từ Report Ca (xem Ads Report Chi Tiết ở trên).
              </p>
              <input type="number" value={adsSpend} onChange={(e) => setAdsSpend(e.target.value)} disabled={readOnly} className={inputCls} />
            </div>
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">ROAS (Ghi Đè Tổng, Nếu Cần)</label>
              <input type="number" step="0.1" value={roas} onChange={(e) => setRoas(e.target.value)} disabled={readOnly} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="font-bold text-[var(--text-muted)] block mb-1">Promotion / Voucher</label>
            <textarea value={promotionNotes} onChange={(e) => setPromotionNotes(e.target.value)} disabled={readOnly} rows={3} className={`${inputCls} font-medium`} />
          </div>
          <div>
            <label className="font-bold text-[var(--text-muted)] block mb-1">Customer Insight (khách mới/quay lại, follower)</label>
            <textarea value={customerInsightNotes} onChange={(e) => setCustomerInsightNotes(e.target.value)} disabled={readOnly} rows={3} className={`${inputCls} font-medium`} />
          </div>
          <div>
            <label className="font-bold text-[var(--text-muted)] block mb-1">Account Health (warning/violation)</label>
            <textarea value={accountHealthNotes} onChange={(e) => setAccountHealthNotes(e.target.value)} disabled={readOnly} rows={3} className={`${inputCls} font-medium`} />
          </div>

          {canManage && !isPublished && (
            <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-3">
              {savedAt && <span className="text-[11px] text-emerald-400 font-semibold">Đã lưu lúc {savedAt}</span>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold rounded-xl shadow transition-all flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> {saving ? "Đang Lưu..." : "Lưu"}
              </button>
            </div>
          )}
          {canManage && isPublished && (
            <p className="pt-3 border-t border-[var(--border)] text-[11px] text-[var(--text-faint)]">
              Report tháng {month} đã phát hành nên phần này khoá. Cần sửa: vào Report Tháng → "Thu Hồi Về Bản Nháp".
            </p>
          )}
        </div>
      )}
    </div>
  );
};
