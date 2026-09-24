import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, ShiftSlot, UserRole, BrandMonthlyReport as BrandMonthlyReportType, BrandPlatformRate } from "../../types";
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Send,
  RotateCcw,
  Loader2,
  Clock,
  CalendarRange,
  Megaphone
} from "lucide-react";
import { getTodayMonth } from "../../lib/dateUtils";
import { fetchMonthlyReport, upsertMonthlyReport, publishMonthlyReport, unpublishMonthlyReport } from "../../lib/db/monthlyReports";
import { MonthlyReportTabs } from "./MonthlyReportTabs";
import { BrandWeeklyReport } from "./BrandWeeklyReport";
import { errorMessage } from "../../lib/errorMessage";
import { useConfirm } from "../../hooks/useConfirm";

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
  shiftSlots?: ShiftSlot[]; // Report Tuần: ca mở chưa có người tuần tới
  // "brandId|YYYY-MM" → tổng target Kế Hoạch Tháng đã chốt (Đ5) — chỉ chuyển tiếp xuống
  // MonthlyReportTabs, màn này không tự dùng.
  planMonthTotals?: Map<string, number>;
  // Nhảy sang tab "Nhập Ads & Ghi Chú" (ops-only, tab bị ẩn với brand nên chỉ truyền/dùng khi
  // canManage) — thay 2 chỗ trước đây chỉ NHẮC TÊN TAB bằng chữ, ops phải tự tìm trong sidebar.
  onOpenAdsReport?: () => void;
}

const CAN_MANAGE_ROLES: UserRole[] = ["ceo", "operations", "admin"];

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

// Phần nhập tay Ads/ROAS/Promotion/Customer Insight/Account Health + Ads Report Chi Tiết (TikTok)
// đã tách sang tab riêng "Nhập Ads & Ghi Chú" (BrandAdsReport.tsx, 2026-09-21) — Report Tháng chỉ
// còn tài liệu 6 tab + phát hành/thu hồi (tab 05 "Phân Tích Sâu" gộp vào 2026-09-23, ops-only).

export const BrandMonthlyReport: React.FC<BrandMonthlyReportProps> = ({ brandId, brandName, sessions, currentRole, brandPlatformRates, shiftSlots, onOpenAdsReport, planMonthTotals }) => {
  const confirm = useConfirm();
  const canManage = CAN_MANAGE_ROLES.includes(currentRole);
  const canViewWeekly = CAN_VIEW_WEEKLY_ROLES.includes(currentRole);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [month, setMonth] = useState(getTodayMonth());
  const [report, setReport] = useState<BrandMonthlyReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { start, end } = useMemo(() => monthRange(month), [month]);

  const sessionsInPeriod = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end),
    [sessions, brandId, start, end]
  );

  const completedSessions = useMemo(() => sessionsInPeriod.filter((s) => s.status === "Completed"), [sessionsInPeriod]);

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
      })
      .catch((e) => !cancelled && setErrorMsg(e.message || "Không tải được report"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, month]);

  const handlePublish = async () => {
    setPublishing(true);
    setErrorMsg(null);
    try {
      // Tháng chưa có dòng brand_monthly_reports (chưa nhập Ads/kế hoạch gì) → tạo dòng nháp trống
      // ngay đây rồi phát hành, ops không phải đi vòng qua tab Nhập Ads chỉ để "Lưu" cho có dòng.
      const row = report ?? (await upsertMonthlyReport(brandId, `${month}-01`, {}));
      const published = await publishMonthlyReport(row.id, unreconciledSessions.length > 0 && confirmForce);
      setReport(published);
      setConfirmForce(false);
    } catch (e) {
      const msg = errorMessage(e, "Phát hành thất bại");
      if (msg.includes("unreconciled_sessions")) {
        setErrorMsg("Vẫn còn session chưa đối soát trong kỳ — tick xác nhận rủi ro để phát hành, hoặc đối soát trước.");
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!report) return;
    if (!(await confirm("Thu hồi report đã phát hành về bản nháp?"))) return;
    setPublishing(true);
    setErrorMsg(null);
    try {
      const draft = await unpublishMonthlyReport(report.id);
      setReport(draft);
    } catch (e) {
      setErrorMsg(errorMessage(e, "Thu hồi thất bại"));
    } finally {
      setPublishing(false);
    }
  };

  const isPublished = report?.status === "published";

  // canManage && onOpenAdsReport: tab "Nhập Ads & Ghi Chú" bị ẩn khỏi sidebar với role brand
  // (App.tsx), nên chỉ hiện nút nhảy tab khi chắc chắn tới được — brand vẫn thấy đúng tên tab
  // bằng chữ như trước, không phải nút bấm rồi đập vào Access Restricted.
  const adsReportLink =
    canManage && onOpenAdsReport ? (
      <button onClick={onOpenAdsReport} className="font-semibold underline text-[var(--accent-text)] hover:opacity-80">
        Nhập Ads & Ghi Chú
      </button>
    ) : (
      <>"Nhập Ads & Ghi Chú"</>
    );

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
        <BrandWeeklyReport brandId={brandId} brandName={brandName} sessions={sessions} currentRole={currentRole} shiftSlots={shiftSlots} />
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
          Số liệu vận hành tính từ các ca có số trong tháng (Dữ Liệu Gốc chỉ dự phòng). Ads/ROAS, Promotion, Customer Insight,
          Account Health nhập tay ở tab {adsReportLink}.
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
          <MonthlyReportTabs brandId={brandId} brandName={brandName} month={month} sessions={sessions} canManage={canManage} brandPlatformRates={brandPlatformRates} planMonthTotals={planMonthTotals} />

            </>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text-faint)] text-sm">
              Report tháng {month} chưa được phát hành. Số liệu vận hành sẽ hiển thị khi Ops/CEO/Admin phát hành report.
            </div>
          )}

          {/* Phát hành / thu hồi — chỉ ops. Phần nhập tay Ads & ghi chú đã sang tab riêng. */}
          {canManage && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
                <Send className="w-4 h-4 text-[var(--accent-text)]" /> Phát Hành Report
              </h3>
              <p className="text-[11px] text-[var(--text-faint)] flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5" /> Ads Spend bổ sung, ROAS, Promotion, Customer Insight, Account Health nhập ở tab
                {adsReportLink} — phát hành xong thì phần đó khoá theo report.
              </p>
              {!isPublished ? (
                <div className="space-y-3">
                  {unreconciledSessions.length > 0 && (
                    <label className="flex items-start gap-2 text-[11px] text-amber-300 font-semibold">
                      <input type="checkbox" checked={confirmForce} onChange={(e) => setConfirmForce(e.target.checked)} className="mt-0.5" />
                      Tôi xác nhận đã biết còn {unreconciledSessions.length} session chưa đối soát, vẫn muốn phát hành report này.
                    </label>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={handlePublish}
                      disabled={publishing || (unreconciledSessions.length > 0 && !confirmForce)}
                      className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow transition-all flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" /> {publishing ? "Đang Phát Hành..." : "Phát Hành Report"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
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
          )}

        </>
      )}
        </>
      )}
    </div>
  );
};
