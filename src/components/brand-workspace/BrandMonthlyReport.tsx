import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, UserRole, BrandMonthlyReport as BrandMonthlyReportType, BrandPlatformRate } from "../../types";
import {
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Send,
  RotateCcw,
  Loader2,
  Clock,
  Target,
  CalendarRange
} from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { getTodayMonth } from "../../lib/dateUtils";
import { getCanonicalAdsCost } from "../../lib/metrics/adsCost";
import { isoWeekStart } from "../../lib/dataraw/weeklySlice";
import {
  fetchMonthlyReport,
  upsertMonthlyReport,
  publishMonthlyReport,
  unpublishMonthlyReport,
  MonthlyReportManualInput
} from "../../lib/db/monthlyReports";
import { MonthlyReportTabs } from "./MonthlyReportTabs";
import { BrandWeeklyReport } from "./BrandWeeklyReport";

// Report Tuần không còn là tab riêng ở menu (2026-08-23) — gộp làm chế độ xem "Tuần" ngay trong
// Report Tháng qua toggle bên dưới, tái dùng nguyên BrandWeeklyReport.tsx (đã tự chặn quyền qua
// CAN_VIEW_ROLES của chính nó). Chỉ hiện toggle cho role thấy được Report Tuần, để brand không bấm
// vào rồi gặp màn chặn quyền.
const CAN_VIEW_WEEKLY_ROLES: UserRole[] = ["ceo", "operations", "admin"];

interface BrandMonthlyReportProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  currentRole: UserRole;
  brandPlatformRates: BrandPlatformRate[];
}

const CAN_MANAGE_ROLES: UserRole[] = ["ceo", "operations", "admin"];

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
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

export const BrandMonthlyReport: React.FC<BrandMonthlyReportProps> = ({ brandId, brandName, sessions, currentRole, brandPlatformRates }) => {
  const canManage = CAN_MANAGE_ROLES.includes(currentRole);
  const canViewWeekly = CAN_VIEW_WEEKLY_ROLES.includes(currentRole);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [month, setMonth] = useState(getTodayMonth());
  const [report, setReport] = useState<BrandMonthlyReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [adsSpend, setAdsSpend] = useState<string>("");
  const [roas, setRoas] = useState<string>("");
  const [promotionNotes, setPromotionNotes] = useState("");
  const [customerInsightNotes, setCustomerInsightNotes] = useState("");
  const [accountHealthNotes, setAccountHealthNotes] = useState("");

  const { start, end } = useMemo(() => monthRange(month), [month]);

  const sessionsInPeriod = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end),
    [sessions, brandId, start, end]
  );

  const completedSessions = useMemo(() => sessionsInPeriod.filter((s) => s.status === "Completed"), [sessionsInPeriod]);

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

  const unreconciledSessions = useMemo(
    () => completedSessions.filter((s) => (s.dataSource ?? "manual") !== "tiktok_reconciled"),
    [completedSessions]
  );
  // Từ 0078 có bậc giữa: số đọc từ file lúc giao ca — chưa chốt nhưng không còn là "tự nhập".
  // Gộp chung với ca tự khai thì cảnh báo nói sai về phần lớn ca, ops sẽ học cách bỏ qua nó.
  const manualOnly = useMemo(() => unreconciledSessions.filter((s) => (s.dataSource ?? "manual") === "manual"), [unreconciledSessions]);
  const snapshotOnly = unreconciledSessions.length - manualOnly.length;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    setConfirmForce(false);
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
      .catch((e) => !cancelled && setErrorMsg(e.message || "Không tải được report"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, month]);

  const handleSaveDraft = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      // Form này không có input cho các field kế hoạch tháng sau (sống ở Tab 05 trong
      // MonthlyReportTabs, fetch/lưu độc lập cùng 1 row brand_monthly_reports) — pass-through
      // nguyên giá trị đã tải để không bị ghi đè về null khi lưu form Ads/Notes.
      const input: MonthlyReportManualInput = {
        adsSpend: adsSpend ? Number(adsSpend) : undefined,
        roas: roas ? Number(roas) : undefined,
        promotionNotes: promotionNotes || undefined,
        customerInsightNotes: customerInsightNotes || undefined,
        accountHealthNotes: accountHealthNotes || undefined,
        planTargetGmv: report?.planTargetGmv,
        planTargetHours: report?.planTargetHours,
        planPctDaily: report?.planPctDaily,
        planPctDday: report?.planPctDday,
        planPctMidmonth: report?.planPctMidmonth,
        planPctPayday: report?.planPctPayday
      };
      const saved = await upsertMonthlyReport(brandId, `${month}-01`, input);
      setReport(saved);
    } catch (e: any) {
      setErrorMsg(e.message || "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!report) return;
    setPublishing(true);
    setErrorMsg(null);
    try {
      const published = await publishMonthlyReport(report.id, unreconciledSessions.length > 0 && confirmForce);
      setReport(published);
      setConfirmForce(false);
    } catch (e: any) {
      const msg: string = e.message || "";
      if (msg.includes("unreconciled_sessions")) {
        setErrorMsg("Vẫn còn session chưa đối soát trong kỳ — tick xác nhận rủi ro để phát hành, hoặc đối soát trước.");
      } else {
        setErrorMsg(msg || "Phát hành thất bại");
      }
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!report) return;
    if (!window.confirm("Thu hồi report đã phát hành về bản nháp?")) return;
    setPublishing(true);
    setErrorMsg(null);
    try {
      const draft = await unpublishMonthlyReport(report.id);
      setReport(draft);
    } catch (e: any) {
      setErrorMsg(e.message || "Thu hồi thất bại");
    } finally {
      setPublishing(false);
    }
  };

  const isPublished = report?.status === "published";
  const readOnlyForm = !canManage || isPublished;

  return (
    <div className="space-y-5">
      {canViewWeekly && (
        <div className="inline-flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1">
          <button
            onClick={() => setViewMode("month")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === "month" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Tháng
          </button>
          <button
            onClick={() => setViewMode("week")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === "week" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5" /> Tuần
          </button>
        </div>
      )}

      {viewMode === "week" ? (
        <BrandWeeklyReport brandId={brandId} brandName={brandName} sessions={sessions} currentRole={currentRole} />
      ) : (
        <>
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[var(--accent-text)]" /> Report Tháng
            </span>
            <h2 className="text-2xl font-black">Báo Cáo {brandName} — {month}</h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="p-2 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)]"
            />
            {report && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                  isPublished
                    ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                    : "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)]"
                }`}
              >
                {isPublished ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {isPublished ? `Đã Phát Hành ${report.publishedAt ? new Date(report.publishedAt).toLocaleDateString("vi-VN") : ""}` : "Bản Nháp"}
              </span>
            )}
          </div>
        </div>
        <p className="text-[var(--text-muted)] text-xs">
          Số liệu vận hành (GMV, Host, Assortment) tính live từ các phiên live Completed trong tháng. Phần Ads/ROAS, Promotion,
          Customer Insight, Account Health nhập tay (không có API TikTok Shop cho các phần này).
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{errorMsg}</div>
      )}

      {/* FIX L4 (audit 2026-08-21): banner này là cảnh báo cho Ops tự đối soát trước khi phát hành,
          không phải nội dung cho brand — trước đây hiện cho mọi role kể cả brand, khiến brand đọc
          nhầm câu "đối soát trước khi phát hành report cho khách" như đang nói với chính họ. */}
      {canManage && unreconciledSessions.length > 0 && (
        <div className="p-4 bg-amber-950/80 border border-amber-800/50 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-amber-200 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            {unreconciledSessions.length} Phiên Live Completed Trong Tháng Chưa Đối Soát Với TikTok
          </div>
          <p className="text-[11px] text-amber-300">
            {manualOnly.length > 0 && `${manualOnly.length} phiên là số talent tự khai, chưa có gì bảo chứng. `}
            {snapshotOnly > 0 && `${snapshotOnly} phiên đã có số từ file lúc giao ca nhưng TikTok còn cập nhật hoàn/huỷ trễ. `}
            Đối soát trước khi phát hành report cho khách — vào "Vận Hành Live → Đối Soát Số Liệu".
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unreconciledSessions.slice(0, 12).map((s) => (
              <span key={s.id} className="text-[10px] font-mono bg-amber-900/60 text-amber-200 px-2 py-0.5 rounded border border-amber-800/50">
                {s.date} · {s.hostName}
              </span>
            ))}
            {unreconciledSessions.length > 12 && (
              <span className="text-[10px] text-amber-300">+{unreconciledSessions.length - 12} khác</span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--text-faint)] text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải report...
        </div>
      ) : (
        <>
          {/* FIX L4 (audit 2026-08-21): GMV/Host Performance/Top SKU tính live từ session, không theo
              trạng thái report — trước đây brand mở tab là thấy số liệu vận hành ngay cả khi report
              còn là bản nháp chưa phát hành. Ops/CEO/Admin vẫn cần xem live để soát trước khi phát hành,
              chỉ chặn với brand cho tới khi report được phát hành chính thức. */}
          {canManage || isPublished ? (
            <>
          {/* Report Tháng redesign (2026-08-22) — tabbed, skin đen-vàng cố định cho tài liệu gửi
              brand, thay toàn bộ khối Overview/Host Performance/Top SKU/Deep Dive cũ. Xem note thiết
              kế trong MonthlyReportTabs.tsx (nguồn dữ liệu từng tab, giới hạn phạm vi). */}
          <MonthlyReportTabs brandId={brandId} month={month} sessions={sessions} canManage={canManage} brandPlatformRates={brandPlatformRates} />

          {/* Ads Report chi tiết — tính từ ads_cost thật trong Report Ca (live_session_reports),
              chỉ có cho TikTok (Shopee không có field ads_cost trong Excel gốc, xem migration 0046). */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-[var(--accent-text)]" /> Ads Report Chi Tiết (TikTok)
            </h3>
            <p className="text-[11px] text-[var(--text-faint)]">
              Tính từ Ads Cost host/ops nhập trong Report Ca của các phiên TikTok Completed trong tháng, đối chiếu GMV cùng phiên
              để ra ROAS. So sánh MoM với tháng {prevMonthStr(month)}.
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
                      <td className="py-2 px-2 text-[var(--text)] font-semibold">
                        {new Date(`${w.weekStart}T00:00:00`).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{formatCurrencyAdaptive(w.adsSpend)}</td>
                      <td className="py-2 px-2 text-right text-emerald-400 font-bold">{formatCurrencyAdaptive(w.gmv)}</td>
                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">
                        {w.adsSpend > 0 ? `${(w.gmv / w.adsSpend).toFixed(1)}x` : "—"}
                      </td>
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
              Shopee chưa theo dõi Ads Cost theo phiên (không có field này trong Excel gốc) — dùng ô "Ads Spend Bổ Sung" bên dưới
              nếu cần cộng thêm chi phí Ads ngoài TikTok livestream.
            </p>
          </div>
            </>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text-faint)] text-sm">
              Report tháng {month} chưa được phát hành. Số liệu vận hành sẽ hiển thị khi Ops/CEO/Admin phát hành report.
            </div>
          )}

          {/* Manual entry sections */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent-text)]" /> Ads/ROAS, Promotion, Customer Insight, Account Health
            </h3>
            <p className="text-[11px] text-[var(--text-faint)]">
              Không có API TikTok Shop cho các phần này (đã xác nhận qua tài liệu chính thức) — nhập tay bởi Ops/CEO/Admin.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">Ads Spend Bổ Sung (VNĐ)</label>
                <p className="text-[10px] text-[var(--text-faint)] mb-1">
                  Chi phí Ads Shopee hoặc ads ngoài livestream, không tính được từ Report Ca (xem Ads Report Chi Tiết ở trên).
                </p>
                <input
                  type="number"
                  value={adsSpend}
                  onChange={(e) => setAdsSpend(e.target.value)}
                  disabled={readOnlyForm}
                  className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] disabled:opacity-60"
                />
              </div>
              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">ROAS (Ghi Đè Tổng, Nếu Cần)</label>
                <input
                  type="number"
                  step="0.1"
                  value={roas}
                  onChange={(e) => setRoas(e.target.value)}
                  disabled={readOnlyForm}
                  className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] disabled:opacity-60"
                />
              </div>
            </div>
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Promotion / Voucher</label>
              <textarea
                value={promotionNotes}
                onChange={(e) => setPromotionNotes(e.target.value)}
                disabled={readOnlyForm}
                rows={3}
                className="w-full p-2.5 border border-[var(--border)] rounded-xl font-medium text-[var(--text)] bg-[var(--surface-base)] disabled:opacity-60"
              />
            </div>
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Customer Insight (khách mới/quay lại, follower)</label>
              <textarea
                value={customerInsightNotes}
                onChange={(e) => setCustomerInsightNotes(e.target.value)}
                disabled={readOnlyForm}
                rows={3}
                className="w-full p-2.5 border border-[var(--border)] rounded-xl font-medium text-[var(--text)] bg-[var(--surface-base)] disabled:opacity-60"
              />
            </div>
            <div>
              <label className="font-bold text-[var(--text-muted)] block mb-1">Account Health (warning/violation)</label>
              <textarea
                value={accountHealthNotes}
                onChange={(e) => setAccountHealthNotes(e.target.value)}
                disabled={readOnlyForm}
                rows={3}
                className="w-full p-2.5 border border-[var(--border)] rounded-xl font-medium text-[var(--text)] bg-[var(--surface-base)] disabled:opacity-60"
              />
            </div>

            {canManage && !isPublished && (
              <div className="pt-3 border-t border-[var(--border)] space-y-3">
                {unreconciledSessions.length > 0 && (
                  <label className="flex items-start gap-2 text-[11px] text-amber-300 font-semibold">
                    <input type="checkbox" checked={confirmForce} onChange={(e) => setConfirmForce(e.target.checked)} className="mt-0.5" />
                    Tôi xác nhận đã biết còn {unreconciledSessions.length} session chưa đối soát, vẫn muốn phát hành report này.
                  </label>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="px-4 py-2 text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)] rounded-xl transition-all disabled:opacity-60"
                  >
                    {saving ? "Đang Lưu..." : "Lưu Bản Nháp"}
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={!report || publishing || (unreconciledSessions.length > 0 && !confirmForce)}
                    className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow transition-all flex items-center gap-2"
                    title={!report ? "Lưu bản nháp trước khi phát hành" : undefined}
                  >
                    <Send className="w-4 h-4" /> {publishing ? "Đang Phát Hành..." : "Phát Hành Report"}
                  </button>
                </div>
              </div>
            )}

            {canManage && isPublished && (
              <div className="pt-3 border-t border-[var(--border)] flex justify-end">
                <button
                  onClick={handleUnpublish}
                  disabled={publishing}
                  className="px-4 py-2 text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)] rounded-xl transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Thu Hồi Về Bản Nháp
                </button>
              </div>
            )}
          </div>

        </>
      )}
        </>
      )}
    </div>
  );
};
