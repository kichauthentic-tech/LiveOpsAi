import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, UserRole, BrandMonthlyReport as BrandMonthlyReportType } from "../../types";
import {
  FileText,
  TrendingUp,
  Users,
  ShoppingBag,
  AlertTriangle,
  CheckCircle2,
  Send,
  RotateCcw,
  Loader2,
  Clock
} from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { getTodayMonth } from "../../lib/dateUtils";
import {
  fetchMonthlyReport,
  upsertMonthlyReport,
  publishMonthlyReport,
  unpublishMonthlyReport,
  MonthlyReportManualInput
} from "../../lib/db/monthlyReports";

interface BrandMonthlyReportProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  currentRole: UserRole;
}

const CAN_MANAGE_ROLES: UserRole[] = ["ceo", "operations", "admin"];

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export const BrandMonthlyReport: React.FC<BrandMonthlyReportProps> = ({ brandId, brandName, sessions, currentRole }) => {
  const canManage = CAN_MANAGE_ROLES.includes(currentRole);
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

  const unreconciledSessions = useMemo(
    () => completedSessions.filter((s) => (s.dataSource ?? "manual") !== "tiktok_reconciled"),
    [completedSessions]
  );

  const overview = useMemo(() => {
    const targetGmv = completedSessions.reduce((sum, s) => sum + (s.targetGmv || 0), 0);
    const actualGmv = completedSessions.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
    const totalOrders = completedSessions.reduce((sum, s) => sum + (s.totalOrders || 0), 0);
    const withViewData = completedSessions.filter((s) => s.peakViewers > 0);
    const avgPeak = withViewData.length ? Math.round(withViewData.reduce((sum, s) => sum + s.peakViewers, 0) / withViewData.length) : 0;
    const withRateData = completedSessions.filter((s) => s.ctrAvg > 0 || s.cvrAvg > 0);
    const avgCtr = withRateData.length ? withRateData.reduce((sum, s) => sum + (s.ctrAvg || 0), 0) / withRateData.length : 0;
    const avgCvr = withRateData.length ? withRateData.reduce((sum, s) => sum + (s.cvrAvg || 0), 0) / withRateData.length : 0;
    return { targetGmv, actualGmv, totalOrders, avgPeak, avgCtr, avgCvr, sessionCount: completedSessions.length };
  }, [completedSessions]);

  const hostPerformance = useMemo(() => {
    const map = new Map<string, { hostName: string; sessionCount: number; gmv: number }>();
    for (const s of completedSessions) {
      const key = s.hostName || "Chưa gán";
      const entry = map.get(key) || { hostName: key, sessionCount: 0, gmv: 0 };
      entry.sessionCount += 1;
      entry.gmv += s.actualGmv || 0;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.gmv - a.gmv);
  }, [completedSessions]);

  const topSkus = useMemo(() => {
    const map = new Map<string, { code: string; name: string; sold: number; revenue: number }>();
    for (const s of completedSessions) {
      for (const sku of s.skus || []) {
        const key = sku.code || sku.name;
        const entry = map.get(key) || { code: sku.code, name: sku.name, sold: 0, revenue: 0 };
        entry.sold += sku.soldInSession || 0;
        entry.revenue += (sku.soldInSession || 0) * (sku.livePrice || 0);
        map.set(key, entry);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 10);
  }, [completedSessions]);

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
      const input: MonthlyReportManualInput = {
        adsSpend: adsSpend ? Number(adsSpend) : undefined,
        roas: roas ? Number(roas) : undefined,
        promotionNotes: promotionNotes || undefined,
        customerInsightNotes: customerInsightNotes || undefined,
        accountHealthNotes: accountHealthNotes || undefined
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
            Số liệu các phiên này vẫn là tạm tính do talent tự nhập, có thể lệch so với số TikTok chính thức (hoàn/hủy chưa chốt).
            Đối soát trước khi phát hành report cho khách để tránh sai số — vào tab "TikTok API → Đối Soát Số Liệu TikTok".
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
          {/* Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <div className="text-[11px] text-[var(--text-faint)]">Target vs Thực Đạt GMV</div>
              <div className="text-lg font-black text-[var(--text)]">{formatCurrencyAdaptive(overview.actualGmv)}</div>
              <div className="text-[10px] text-[var(--text-muted)]">/ {formatCurrencyAdaptive(overview.targetGmv)} target</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <div className="text-[11px] text-[var(--text-faint)]">Tổng Đơn Hàng</div>
              <div className="text-lg font-black text-[var(--text)]">{overview.totalOrders.toLocaleString("vi-VN")}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{overview.sessionCount} phiên live</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <div className="text-[11px] text-[var(--text-faint)]">PCU Trung Bình</div>
              <div className="text-lg font-black text-[var(--text)]">{overview.avgPeak.toLocaleString("vi-VN")}</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <div className="text-[11px] text-[var(--text-faint)]">CTR / CVR TB</div>
              <div className="text-lg font-black text-[var(--text)]">
                {overview.avgCtr.toFixed(1)}% / {overview.avgCvr.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Host Performance */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--accent-text)]" /> Host Performance
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">Host</th>
                    <th className="py-2 px-2 text-right">Số Phiên</th>
                    <th className="py-2 px-2 text-right">GMV</th>
                  </tr>
                </thead>
                <tbody>
                  {hostPerformance.map((h) => (
                    <tr key={h.hostName} className="border-b border-[var(--border-muted)]">
                      <td className="py-2 px-2 text-[var(--text)] font-semibold">{h.hostName}</td>
                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{h.sessionCount}</td>
                      <td className="py-2 px-2 text-right text-emerald-400 font-bold">{formatCurrencyAdaptive(h.gmv)}</td>
                    </tr>
                  ))}
                  {hostPerformance.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-[var(--text-faint)] italic">
                        Chưa có phiên Completed trong tháng.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assortment / SKU */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[var(--accent-text)]" /> Assortment / Top SKU
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">Mã SKU</th>
                    <th className="py-2 px-2">Tên Sản Phẩm</th>
                    <th className="py-2 px-2 text-right">Đã Bán</th>
                    <th className="py-2 px-2 text-right">Doanh Thu</th>
                  </tr>
                </thead>
                <tbody>
                  {topSkus.map((sku) => (
                    <tr key={sku.code || sku.name} className="border-b border-[var(--border-muted)]">
                      <td className="py-2 px-2 font-mono text-[var(--accent-text)]">{sku.code || "—"}</td>
                      <td className="py-2 px-2 text-[var(--text)] font-semibold">{sku.name}</td>
                      <td className="py-2 px-2 text-right text-[var(--text-muted)]">{sku.sold.toLocaleString("vi-VN")}</td>
                      <td className="py-2 px-2 text-right text-emerald-400 font-bold">{formatCurrencyAdaptive(sku.revenue)}</td>
                    </tr>
                  ))}
                  {topSkus.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-[var(--text-faint)] italic">
                        Chưa có dữ liệu SKU trong tháng.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
                <label className="font-bold text-[var(--text-muted)] block mb-1">Ads Spend (VNĐ)</label>
                <input
                  type="number"
                  value={adsSpend}
                  onChange={(e) => setAdsSpend(e.target.value)}
                  disabled={readOnlyForm}
                  className="w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] disabled:opacity-60"
                />
              </div>
              <div>
                <label className="font-bold text-[var(--text-muted)] block mb-1">ROAS</label>
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
    </div>
  );
};
