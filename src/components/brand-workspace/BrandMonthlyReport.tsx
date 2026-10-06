import React, { Suspense, useEffect, useMemo, useState } from "react";
import { defaultReportMonth } from "../../lib/defaultMonth";
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
  RefreshCw,
  Database
} from "lucide-react";
import { getTodayMonth } from "../../lib/dateUtils";
import { monthlyReportRead, upsertMonthlyReport, publishMonthlyReport, unpublishMonthlyReport } from "../../lib/db/monthlyReports";
import { BrandWeeklyReport } from "./BrandWeeklyReport";
import { errorMessage } from "../../lib/errorMessage";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast } from "../../hooks/useToast";
import { fetchMonthlyReportSnapshot, saveMonthlyReportSnapshot, StoredMonthlyReportSnapshot } from "../../lib/db/monthlyReportSnapshots";
import { DataRawImportStamp, fetchDataRawImportStamps } from "../../lib/db/brandDataRaw";
import { type MonthlyReportSnapshot } from "../../lib/report/monthlySnapshot";
import { type ShopeeReportSnapshot } from "../../lib/report/shopeeSnapshot";
import { REPORT_ENGINES, type AnySnapshot } from "../../lib/report/reportEngines";
import { channelTitle, LEGACY_PLATFORM, type ReportPlatform } from "../../lib/reportPlatform";
import { fmtDateVn, fmtMonth } from "../../lib/format";
import { prefetchable, type TabPrefetchCtx } from "../../lib/db/prefetch";
import { lazyNamed } from "../../lib/lazyNamed";

// 7 phần của Report Tháng kéo theo recharts + d3 + redux = 364 KB, chiếm 2/3 chunk của tab này (đo
// 2026-10-01: chunk BrandMonthlyReport 534 KB, riêng thư viện biểu đồ 364 KB). Phần đó chỉ render khi
// tháng ĐÃ có report chốt và người xem được phép đọc — mọi trạng thái còn lại (chưa tạo report, brand
// chưa được phát hành, đang tải) không dùng tới một biểu đồ nào. Tách ra thì các trạng thái đó vẽ ngay
// thay vì đợi tải hết thư viện biểu đồ. `Suspense` phải đặt ngay đây: không có nó thì lazy này rơi lên
// `Suspense` của App.tsx và làm trắng cả khu vực tab, mất luôn phần đầu trang đã vẽ xong.
const MonthlyReportTabs = lazyNamed(() => import("./MonthlyReportTabs"), "MonthlyReportTabs");
const ShopeeMonthlyReportTabs = lazyNamed(() => import("./ShopeeMonthlyReportTabs"), "ShopeeMonthlyReportTabs");

interface ReportViewProps {
  brandId: string;
  brandName: string;
  month: string;
  snapshot: AnySnapshot;
  report: BrandMonthlyReportType | null;
  canManage: boolean;
  onReportChange: (r: BrandMonthlyReportType) => void;
  liveSessions: LiveSession[];
  shiftSlots?: ShiftSlot[];
}
// Khung hiển thị report của từng sàn (cùng khoá với REPORT_ENGINES) — thêm sàn mà quên khung là lỗi compile.
const REPORT_VIEWS: Record<ReportPlatform, { preload: () => void; Render: React.FC<ReportViewProps> }> = {
  TikTok: {
    preload: () => void MonthlyReportTabs.preload(),
    Render: (p) => <MonthlyReportTabs brandId={p.brandId} brandName={p.brandName} month={p.month} snapshot={p.snapshot as MonthlyReportSnapshot} liveSessions={p.liveSessions} shiftSlots={p.shiftSlots} canManage={p.canManage} />
  },
  Shopee: {
    preload: () => void ShopeeMonthlyReportTabs.preload(),
    Render: (p) => <ShopeeMonthlyReportTabs brandId={p.brandId} brandName={p.brandName} month={p.month} snapshot={p.snapshot as ShopeeReportSnapshot} report={p.report} canManage={p.canManage} onReportChange={p.onReportChange} />
  }
};
import { MonthPicker } from "../common/MonthPicker";
import { PageHeader } from "../common/PageHeader";

// Report Tuần không còn là tab riêng ở menu (2026-08-23) — gộp làm chế độ xem "Tuần" ngay trong
// Report Tháng qua toggle bên dưới, tái dùng nguyên BrandWeeklyReport.tsx (đã tự chặn quyền qua
// CAN_VIEW_ROLES của chính nó). Chỉ hiện toggle cho role thấy được Report Tuần, để brand không bấm
// vào rồi gặp màn chặn quyền.
const CAN_VIEW_WEEKLY_ROLES: UserRole[] = ["ceo", "operations", "admin"];

interface BrandMonthlyReportProps {
  brandId: string;
  brandName: string;
  /** Sàn của report — App giữ (bộ chuyển sàn của Brand workspace). */
  platform: ReportPlatform;
  sessions: LiveSession[];
  currentRole: UserRole;
  brandPlatformRates: BrandPlatformRate[];
  shiftSlots?: ShiftSlot[]; // Report Tuần: ca mở chưa có người tuần tới
  // "brandId|YYYY-MM" → tổng target Kế Hoạch Tháng đã chốt (Đ5) — chỉ chuyển tiếp xuống
  // MonthlyReportTabs, màn này không tự dùng.
  planMonthTotals?: Map<string, number>;
  // Nhảy sang tab "Nhập Ads" (ops-only, tab bị ẩn với brand nên chỉ truyền/dùng khi
  // canManage) — thay 2 chỗ trước đây chỉ NHẮC TÊN TAB bằng chữ, ops phải tự tìm trong sidebar.
  onOpenAdsReport?: () => void;
}

const CAN_MANAGE_ROLES: UserRole[] = ["ceo", "operations", "admin"];

// Lượt đọc lúc mở màn — nạp trước trong lúc chờ đợt nạp chung (lib/db/prefetch.ts), cùng chunk biểu đồ.
const snapshotRead = prefetchable("reportSnapshot", fetchMonthlyReportSnapshot);
const importStampsRead = prefetchable("importStamps", fetchDataRawImportStamps);
export function prefetchBrandMonthlyReport({ brandId, role }: TabPrefetchCtx): void {
  if (!brandId) return;
  const month = defaultReportMonth(`${getTodayMonth()}-01`, []); // = tháng trước; brand có ca tháng đó là trùng key mount
  monthlyReportRead.prefetch(brandId, `${month}-01`);
  snapshotRead.prefetch(brandId, month);
  MonthlyReportTabs.preload();
  if (!role || CAN_MANAGE_ROLES.includes(role)) importStampsRead.prefetch(brandId);
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

const fmtStamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};


// Phần nhập Ads (từ 05/10 là file TikTok Ads; ghi chú Promotion/Customer Insight/Account Health đã bỏ)
// đã tách sang tab riêng "Nhập Ads" (BrandAdsReport.tsx, 2026-09-21) — Report Tháng chỉ
// còn tài liệu 6 tab + phát hành/thu hồi (tab 05 "Phân Tích Sâu" gộp vào 2026-09-23, ops-only).

export const BrandMonthlyReport: React.FC<BrandMonthlyReportProps> = ({ brandId, brandName, platform, sessions, currentRole, brandPlatformRates, shiftSlots, onOpenAdsReport, planMonthTotals }) => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const canManage = CAN_MANAGE_ROLES.includes(currentRole);
  const canViewWeekly = CAN_VIEW_WEEKLY_ROLES.includes(currentRole);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  // Sàn của report (0139): TikTok và Shopee là hai report độc lập — phát hành, thu hồi, đóng sổ riêng, mỗi sàn một engine
  // (lib/report/reportEngines.ts) và một khung hiển thị (REPORT_VIEWS). Sàn chọn ở workspace (App) — một chỗ cho mọi tab.
  const engine = REPORT_ENGINES[platform];
  const View = REPORT_VIEWS[platform];
  // Mở THÁNG ĐÃ HẾT gần nhất có ca của brand — report chỉ phát hành được sau khi hết tháng (0133); mở tháng đang
  // chạy là gặp ngay "chưa tạo report" (audit người mới 2026-10-04). Xem tháng này: chọn ở bộ chọn tháng.
  const [month, setMonth] = useState(() => defaultReportMonth(`${getTodayMonth()}-01`, sessions.filter((s) => s.brandId === brandId)));
  const monthNowVn = getTodayMonth();
  const [report, setReport] = useState<BrandMonthlyReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bản chụp số liệu (0119) — Report Tháng chỉ đọc bản này. Chưa có thì ops bấm "Tạo report" (quyết
  // định 2026-09-25: không tự dựng khi mở, ai bấm mới tốn tài nguyên).
  // Bản chụp gắn khoá (brand, tháng, sàn) của lượt đọc: đổi brand/sàn thì lần vẽ đầu tiên KHÔNG được đọc bản chụp của kênh cũ
  // (07/10: chuyển Report VERA·Shopee → CROCS từng sập vì engine TikTok đọc bản chụp Shopee còn trong state).
  const snapKey = `${brandId}|${month}|${platform}`;
  const [storedState, setStoredState] = useState<{ key: string; value: StoredMonthlyReportSnapshot | null }>({ key: "", value: null });
  const stored = storedState.key === snapKey ? storedState.value : null;
  const setStored = (value: StoredMonthlyReportSnapshot | null) => setStoredState({ key: snapKey, value });
  const [snapLoading, setSnapLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  // Dấu batch Dữ Liệu Gốc hiện tại (vài trăm byte/batch) — chỉ ops, để biết bản chụp đã cũ chưa.
  const [importStamps, setImportStamps] = useState<DataRawImportStamp[] | null>(null);

  const { start, end } = useMemo(() => monthRange(month), [month]);

  const sessionsInPeriod = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.platform === platform && s.date >= start && s.date <= end),
    [sessions, brandId, start, end, platform]
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
    // Chỉ truyền sàn khi là Shopee — TikTok giữ đúng khoá nạp-trước (prefetch) đã có.
    monthlyReportRead.take(brandId, `${month}-01`, platform === LEGACY_PLATFORM ? undefined : platform)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
      })
      .catch((e) => !cancelled && setErrorMsg(e.message || "Không tải được report"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, month, platform]);

  useEffect(() => {
    let cancelled = false;
    setSnapLoading(true);
    setStored(null);
    // Chunk biểu đồ tải cùng lúc với bản chụp, không đợi bản chụp về rồi mới bắt đầu (một vòng mạng nối tiếp).
    View.preload();
    snapshotRead.take(brandId, month, platform === LEGACY_PLATFORM ? undefined : platform)
      .then((r) => !cancelled && setStoredState({ key: `${brandId}|${month}|${platform}`, value: r }))
      .catch((e) => !cancelled && setErrorMsg(errorMessage(e, "Không tải được số liệu report")))
      .finally(() => !cancelled && setSnapLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, month, platform]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshImportStamps = () =>
    fetchDataRawImportStamps(brandId)
      .then(setImportStamps)
      .catch(() => setImportStamps(null));
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    importStampsRead.take(brandId)
      .then((r) => !cancelled && setImportStamps(r))
      .catch(() => !cancelled && setImportStamps(null));
    return () => {
      cancelled = true;
    };
  }, [brandId, canManage]);

  // Ca sống đã có sẵn trong app (0 egress), dấu batch nhỏ ⇒ biết ngay bản chụp cũ tới đâu mà không tải
  // lại file nào.
  const freshness = useMemo(
    () => (stored && importStamps ? engine.freshness(stored.snapshot as AnySnapshot, { sessions, planMonthTotals, brandPlatformRates, stamps: importStamps, month }) : null),
    [engine, stored, importStamps, sessions, planMonthTotals, brandPlatformRates, month]
  );
  const upToDate = freshness?.upToDate;

  const buildSnapshot = async (): Promise<{ snapshot: MonthlyReportSnapshot; fetched: string[]; reused: string[] }> => {
    const r = await engine.build({ brandId, month, sessions, planMonthTotals, brandPlatformRates, previous: (stored?.snapshot as AnySnapshot | undefined) ?? null });
    // Bảng bản chụp lưu jsonb — mỗi sàn một hình dạng; lớp db gõ theo bản TikTok.
    return { ...r, snapshot: r.snapshot as MonthlyReportSnapshot };
  };

  const saveSnapshot = async (snapshot: MonthlyReportSnapshot) => {
    const computedAt = await saveMonthlyReportSnapshot(brandId, month, snapshot, platform);
    setStored({ snapshot, computedAt });
    await refreshImportStamps();
  };

  const handleCreateOrRefresh = async () => {
    setErrorMsg(null);
    if (stored && upToDate) {
      showToast("Số liệu đã mới nhất — không có ca hay file nào đổi từ lần chốt trước, không cần tải lại.", "info");
      return;
    }
    setBuilding(true);
    try {
      const { snapshot, fetched, reused } = await buildSnapshot();
      if (stored && isPublished) {
        const ok = await confirm(
          `Report ${platform} tháng ${fmtMonth(month)} ĐÃ PHÁT HÀNH — cập nhật xong brand thấy ngay số mới.\n\n${
            engine.headlineChange(stored.snapshot as AnySnapshot, snapshot as AnySnapshot)
          }\n\nCập nhật và phát hành lại?`,
          { confirmLabel: "Cập nhật & phát hành lại" }
        );
        if (!ok) return;
      }
      await saveSnapshot(snapshot);
      showToast(
        `Đã chốt số liệu report ${platform} tháng ${fmtMonth(month)}` + (reused.length ? ` — tải ${fetched.length} phần, dùng lại ${reused.length} phần không đổi.` : "."),
        "success"
      );
    } catch (e) {
      setErrorMsg(errorMessage(e, "Không dựng được số liệu report"));
    } finally {
      setBuilding(false);
    }
  };

  // Phát hành = gửi report cho brand xem ⇒ luôn hỏi lại. Trước đây nút nằm cuối trang (y≈9.200px ở CROCS T9) kèm ô tick
  // "đã biết còn ca chưa đối soát"; nay nút ở thẻ đầu trang, cảnh báo (số cũ / ca chưa đối soát) nằm trong hộp xác nhận.
  const handlePublish = async () => {
    const warnings = [
      stored && freshness && !upToDate
        ? `• Số liệu chốt lúc ${fmtStamp(stored.computedAt)} và đã có thay đổi sau đó — phát hành bây giờ là gửi số đã chốt. Huỷ rồi bấm "Cập nhật số liệu" nếu muốn gửi số mới nhất.`
        : null,
      !stored ? "• Chưa có số liệu chốt — phát hành sẽ tự tổng hợp số trước." : null,
      unreconciledSessions.length > 0
        ? `• Còn ${unreconciledSessions.length} ca chưa đối soát với ${platform} (${manualOnly.length} ca talent tự khai). Phát hành vẫn gửi số hiện có.`
        : null
    ].filter(Boolean);
    const ok = await confirm(
      `Phát hành Report ${platform} tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)} cho ${brandName}? Brand xem được ngay sau khi phát hành.${warnings.length ? `\n\n${warnings.join("\n")}` : ""}\n\nPhát hành = ĐÓNG SỔ ${platform} của tháng: sau đó không sửa/đối soát/loại/huỷ ca ${platform} của tháng này được nữa cho tới khi thu hồi report (ca của sàn kia không bị ảnh hưởng).`,
      { confirmLabel: "Phát hành" }
    );
    if (!ok) return;
    setPublishing(true);
    setErrorMsg(null);
    try {
      // Phát hành mà chưa có bản chụp thì brand mở ra sẽ trống — dựng luôn ở đây.
      if (!stored) await saveSnapshot((await buildSnapshot()).snapshot);
      // Tháng chưa có dòng brand_monthly_reports (chưa nhập Ads/kế hoạch gì) → tạo dòng nháp trống
      // ngay đây rồi phát hành, ops không phải đi vòng qua tab Nhập Ads chỉ để "Lưu" cho có dòng.
      const row = report ?? (await upsertMonthlyReport(brandId, `${month}-01`, platform));
      // Đã xác nhận trong hộp thoại ở trên (kể cả phần ca chưa đối soát) ⇒ force khi còn ca chưa đối soát.
      const published = await publishMonthlyReport(row.id, unreconciledSessions.length > 0);
      setReport(published);
    } catch (e) {
      setErrorMsg(errorMessage(e, "Phát hành thất bại"));
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!report) return;
    if (!(await confirm(`Thu hồi report ${platform} đã phát hành về bản nháp?`))) return;
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

  // canManage && onOpenAdsReport: tab "Nhập Ads" bị ẩn khỏi sidebar với role brand
  // (App.tsx), nên chỉ hiện nút nhảy tab khi chắc chắn tới được — brand vẫn thấy đúng tên tab
  // bằng chữ như trước, không phải nút bấm rồi đập vào Access Restricted.
  const adsReportLink =
    canManage && onOpenAdsReport ? (
      <button onClick={onOpenAdsReport} className="min-h-6 -mx-1 px-1 rounded font-semibold underline text-[var(--accent-text)] hover:opacity-80">
        Nhập Ads
      </button>
    ) : (
      <>"Nhập Ads"</>
    );

  // Chuyển Tháng / Tuần — nằm trong thẻ đầu trang của cả hai chế độ (Report Tuần nhận qua `headerExtra`).
  const modeSwitch = canViewWeekly ? (
    <div className="inline-flex items-center gap-1 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-1">
      {(["month", "week"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setViewMode(m)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
            viewMode === m ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
          }`}
        >
          {m === "month" ? <FileText className="w-3.5 h-3.5" /> : <CalendarRange className="w-3.5 h-3.5" />}
          {m === "month" ? "Tháng" : "Tuần"}
        </button>
      ))}
    </div>
  ) : null;

  // Audit UX 2026-09-29 (M1): trước đây 3 khối chồng nhau trước nội dung — thanh Tháng/Tuần, thẻ tiêu đề 24px, thanh
  // "Số liệu chốt lúc…" — mục lục report ở y=309px. Gộp về MỘT PageHeader: tiêu đề + chế độ + tháng + trạng thái + phát hành,
  // dòng bản chụp là hàng phụ bên dưới.
  const [monthY, monthM] = month.split("-");
  return (
    <div className="space-y-5">
      {viewMode === "week" ? (
        <BrandWeeklyReport brandId={brandId} brandName={brandName} platform={platform} sessions={sessions} currentRole={currentRole} shiftSlots={shiftSlots} headerExtra={modeSwitch} />
      ) : (
        <>
      <PageHeader
        icon={FileText}
        title={`Report Tháng ${Number(monthM)}/${monthY} · ${channelTitle(brandName, platform, false)}`}
        description={
          <>
            {engine.description.split("{ads}").map((part, i, all) => (
              <React.Fragment key={i}>
                {part}
                {i < all.length - 1 && adsReportLink}
              </React.Fragment>
            ))}
          </>
        }
        actions={
          <>
            {modeSwitch}
            <MonthPicker value={month} onChange={setMonth} />
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
            {canManage &&
              (isPublished ? (
                <button
                  onClick={handleUnpublish}
                  disabled={publishing}
                  className="px-3 py-2 rounded-xl text-xs font-bold border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] flex items-center gap-1.5 disabled:opacity-60"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Thu hồi về nháp
                </button>
              ) : (
                <button
                  onClick={handlePublish}
                  // 0133: phát hành = đóng sổ ⇒ chỉ sau khi hết tháng (DB cũng chặn).
                  disabled={publishing || building || month >= monthNowVn}
                  title={month >= monthNowVn ? "Phát hành là đóng sổ số của tháng — chỉ làm sau khi hết tháng." : undefined}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" /> {publishing ? "Đang phát hành..." : "Phát hành"}
                </button>
              ))}
          </>
        }
      >
        {/* Số liệu chốt tới đâu + (ops) còn mới không — nói rõ report đang là ảnh chụp lúc nào. */}
        {stored && (canManage || isPublished) && !loading && !snapLoading && (
          <div className="border-t border-[var(--border)] pt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="flex items-center gap-1.5 text-[var(--text)] font-semibold">
              <Database className="w-3.5 h-3.5 text-[var(--accent-text)]" /> Số liệu chốt lúc {fmtStamp(stored.computedAt)}
            </span>
            <span className="text-[var(--text-muted)]">{engine.coverage(stored.snapshot as AnySnapshot)}</span>
            {canManage && (
              <span className="ml-auto flex items-center gap-3">
                {freshness &&
                  (upToDate ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã mới nhất
                    </span>
                  ) : (
                    <span className="text-amber-300 font-semibold">
                      Có thay đổi từ lần chốt: {freshness.changes.join(" · ")}
                    </span>
                  ))}
                <button
                  onClick={handleCreateOrRefresh}
                  disabled={building}
                  className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 disabled:opacity-60 ${
                    freshness && !upToDate
                      ? "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white"
                      : "border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${building ? "animate-spin" : ""}`} />
                  {building ? "Đang cập nhật..." : isPublished ? "Cập nhật & phát hành lại" : "Cập nhật số liệu"}
                </button>
              </span>
            )}
          </div>
        )}
      </PageHeader>

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
            {unreconciledSessions.length} Phiên Live Completed Trong Tháng Chưa Đối Soát Với {platform}
          </div>
          <p className="text-[11px] text-amber-300">
            {manualOnly.length > 0 && `${manualOnly.length} phiên là số talent tự khai, chưa có gì bảo chứng. `}
            {snapshotOnly > 0 && `${snapshotOnly} phiên đã có số từ file lúc giao ca nhưng ${platform} còn cập nhật hoàn/huỷ trễ. `}
            Đối soát trước khi phát hành report cho khách — vào "Vận Hành Live → Đối Soát Số Liệu" và chọn sàn {platform}.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unreconciledSessions.slice(0, 12).map((s) => (
              <span key={s.id} className="text-[11px] font-mono bg-amber-900/60 text-amber-200 px-2 py-0.5 rounded border border-amber-800/50">
                {fmtDateVn(s.date)} {s.startTime.slice(0, 5)} · {s.hostName || "chưa gán host"}
              </span>
            ))}
            {unreconciledSessions.length > 12 && (
              <span className="text-[11px] text-amber-300">+{unreconciledSessions.length - 12} khác</span>
            )}
          </div>
        </div>
      )}

      {loading || snapLoading ? (
        <div className="flex items-center justify-center py-12 text-[var(--text-faint)] text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải report...
        </div>
      ) : (
        <>
          {/* FIX L4 (audit 2026-08-21): GMV/Host Performance/Top SKU tính live từ session, không theo
              trạng thái report — trước đây brand mở tab là thấy số liệu vận hành ngay cả khi report
              còn là bản nháp chưa phát hành. Ops/CEO/Admin vẫn cần xem live để soát trước khi phát hành,
              chỉ chặn với brand cho tới khi report được phát hành chính thức. */}
          {canManage && !stored ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center space-y-3">
              <Database className="w-8 h-8 mx-auto text-[var(--text-faint)]" />
              <div className="text-sm font-bold text-[var(--text)]">Tháng {fmtMonth(month)} chưa tạo report {platform}</div>
              <p className="text-xs text-[var(--text-muted)] max-w-xl mx-auto">
                {engine.createHint} Sau đó mở report chỉ đọc số đã chốt; khi có ca đối soát
                thêm hay file mới, bấm "Cập nhật số liệu".
              </p>
              <button
                onClick={handleCreateOrRefresh}
                disabled={building}
                className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold rounded-xl shadow inline-flex items-center gap-2"
              >
                {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                {building ? "Đang tổng hợp..." : "Tạo report"}
              </button>
            </div>
          ) : (canManage || isPublished) && stored ? (
            <>
          {/* Report Tháng redesign (2026-08-22) — tabbed, skin đen-vàng cố định cho tài liệu gửi
              brand, thay toàn bộ khối Overview/Host Performance/Top SKU/Deep Dive cũ. Xem note thiết
              kế trong MonthlyReportTabs.tsx (nguồn dữ liệu từng tab, giới hạn phạm vi). */}
          <Suspense
            fallback={
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-12 flex items-center justify-center gap-3 text-[var(--text-muted)]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-xs font-bold">Đang tải biểu đồ báo cáo...</span>
              </div>
            }
          >
            <View.Render
              brandId={brandId}
              brandName={brandName}
              month={month}
              snapshot={stored.snapshot as AnySnapshot}
              report={report}
              canManage={canManage}
              onReportChange={setReport}
              liveSessions={sessions}
              shiftSlots={shiftSlots}
            />
          </Suspense>

            </>
          ) : isPublished ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text-faint)] text-sm">
              Report {platform} tháng {fmtMonth(month)} đã phát hành nhưng chưa có số liệu chốt — liên hệ Ops để cập nhật.
            </div>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text-faint)] text-sm">
              Report {platform} tháng {fmtMonth(month)} chưa được phát hành. Số liệu vận hành sẽ hiển thị khi Ops/CEO/Admin phát hành report.
            </div>
          )}

        </>
      )}
        </>
      )}
    </div>
  );
};
