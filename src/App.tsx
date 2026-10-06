import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, Suspense } from "react";
import { rememberBrandId } from "./lib/defaultBrand";
import { requestCrmFocus } from "./lib/crmFocus";
import { todayVn } from "./lib/performance/brandCommitment";
import { UserRole, LiveSession, PermissionKey, RolePermissionsMap, SystemUser, AuditLogEntry, Talent, Studio, Equipment, Brand, SessionFinance, ShiftSlot, RecurringShiftTemplate, BrandSku, PromoScheme, AppNotification } from "./types";
import { TabErrorFallback } from "./components/common/TabErrorFallback";
import { ErrorBoundary } from "./lib/errorReporting";
import { fetchTalents, updateTalent, updateMyTalentProfile, deleteTalent } from "./lib/db/talents";
import { createStudio, updateStudio, deleteStudio } from "./lib/db/studios";
import { createEquipment, updateEquipment, deleteEquipment } from "./lib/db/equipments";
import { fetchSessions, finalizeShiftSlot, updateSession, deleteSession, cancelSession, setSessionExcluded, setSessionStaffSegments } from "./lib/db/sessions";
import { SessionActionsContext } from "./lib/sessionActionsContext";
import { submitSessionReport, SessionReportInput } from "./lib/db/sessionReports";
import { createBrand, updateBrand, deleteBrand } from "./lib/db/brands";
import { fetchUsers, updateUserProfile, inviteUser, deleteUserAccount, InviteUserPayload } from "./lib/db/users";
import { createAuditLog } from "./lib/db/auditLogs";
import { updateRolePermissions } from "./lib/db/rolePermissions";
import { upsertSessionFinance, setSessionFinanceApproval } from "./lib/db/finance";
import { updateAiAgentPrompt } from "./lib/db/aiAgentPrompts";
import { upsertBrandPlatformCommissionRate, upsertBrandPlatformRate, upsertBrandPlatformReturnRate } from "./lib/db/brandPlatformRates";
import { setBrandStudio } from "./lib/db/brandStudios";
import { fetchShiftSlots, createShiftSlot, deleteShiftSlot } from "./lib/db/shiftSlots";
import { registerForSlot, unregisterFromSlot } from "./lib/db/shiftRegistrations";
import { createRecurringShiftTemplate, updateRecurringShiftTemplate, deleteRecurringShiftTemplate } from "./lib/db/recurringShiftTemplates";
import { fetchTalentRateHistory } from "./lib/db/talentRateHistory";
import { fetchBrandPlatformRateHistory } from "./lib/db/brandPlatformRateHistory";
import { createBrandSku, updateBrandSku, deleteBrandSku } from "./lib/db/brandSkus";
import { createPromoScheme, updatePromoScheme, deletePromoScheme } from "./lib/db/promoSchemes";
import { fetchAllMonthlyReports } from "./lib/db/monthlyReports";
import { fetchLockedPlanTargets } from "./lib/db/monthPlans";
import { errorMessage } from "./lib/errorMessage";
import { requestShiftDropout } from "./lib/db/notifications";
import {
  Menu,
  ShieldCheck,
  Lock,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { AppSidebar } from "./components/AppSidebar";
import { Header, WorkspaceContext } from "./components/Header";
import { Login } from "./components/Login";
import { ResetPasswordScreen } from "./components/ResetPasswordScreen";
import { useAuth } from "./hooks/useAuth";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useToast } from "./hooks/useToast";
import { useNotifications } from "./hooks/useNotifications";
import type { NewTalentAccountPayload } from "./components/TalentMatcher";
import { saveEngineParams } from "./lib/db/engineParams";
import { logTabView } from "./lib/db/tabViews";
import { findBrandBySlug, parsePath, parsePlatformParam, routeToPath, withPlatformParam } from "./lib/routes";
import { brandPlatformsOf, type PlatformScope, type ReportPlatform } from "./lib/reportPlatform";
import { PlatformScopeBar } from "./components/common/PlatformScopeBar";
import { lazyNamed } from "./lib/lazyNamed";
import { dropPrefetched, type TabPrefetchCtx } from "./lib/db/prefetch";
import { useWorkspaceData } from "./hooks/useWorkspaceData";
import {
  CALENDAR_TABS,
  TABS_WITHOUT_CORE_DATA,
  TABS_WITHOUT_NAV_ITEM,
  agencyNavGroups,
  brandNavGroups,
  getDefaultTabForRole
} from "./lib/appNav";


// Mỗi tab một chunk riêng, tải khi mở tab (xem src/lib/lazyNamed.ts). Chỉ dùng bên trong <Suspense> của khu nội dung tab.
const BrandCalendar = lazyNamed(() => import("./components/brand-workspace/BrandCalendar"), "BrandCalendar");
const BrandSkuShowcase = lazyNamed(() => import("./components/brand-workspace/BrandSkuShowcase"), "BrandSkuShowcase");
const BrandMonthlyReport = lazyNamed(() => import("./components/brand-workspace/BrandMonthlyReport"), "BrandMonthlyReport");
const BrandDashboard = lazyNamed(() => import("./components/brand-workspace/BrandDashboard"), "default");
const BrandAdsReport = lazyNamed(() => import("./components/brand-workspace/BrandAdsReport"), "BrandAdsReport");
const BrandCommitmentView = lazyNamed(() => import("./components/brand-workspace/BrandCommitmentView"), "BrandCommitmentView");
const BrandAffiliateTable = lazyNamed(() => import("./components/brand-workspace/BrandAffiliateTable"), "BrandAffiliateTable");
const BrandNextMonthPlan = lazyNamed(() => import("./components/brand-workspace/BrandNextMonthPlan"), "BrandNextMonthPlan");
const BrandDataRaw = lazyNamed(() => import("./components/brand-workspace/BrandDataRaw"), "BrandDataRaw");
const AccountSettings = lazyNamed(() => import("./components/AccountSettings"), "AccountSettings");
const MyTalentProfile = lazyNamed(() => import("./components/MyTalentProfile"), "MyTalentProfile");
const SessionLedger = lazyNamed(() => import("./components/SessionLedger"), "SessionLedger");
const LiveCalendar = lazyNamed(() => import("./components/LiveCalendar"), "LiveCalendar");
const TalentMatcher = lazyNamed(() => import("./components/TalentMatcher"), "TalentMatcher");
const StudioEquipment = lazyNamed(() => import("./components/StudioEquipment"), "StudioEquipment");
const CrmProjects = lazyNamed(() => import("./components/CrmProjects"), "CrmProjects");
const TikTokApiAutomation = lazyNamed(() => import("./components/TikTokApiAutomation"), "TikTokApiAutomation");
const FinanceHr = lazyNamed(() => import("./components/FinanceHr"), "FinanceHr");
const UserRoleSettings = lazyNamed(() => import("./components/UserRoleSettings"), "UserRoleSettings");
const AiTrainingCenter = lazyNamed(() => import("./components/AiTrainingCenter"), "AiTrainingCenter");
const EngineTrainingPanel = lazyNamed(() => import("./components/EngineTrainingPanel"), "EngineTrainingPanel");
const OpsBoard = lazyNamed(() => import("./components/OpsBoard"), "OpsBoard");
const TodoPanel = lazyNamed(() => import("./components/TodoPanel"), "TodoPanel");
const GlossaryDialog = lazyNamed(() => import("./components/GlossaryDialog"), "GlossaryDialog");
const LiveReconciliation = lazyNamed(() => import("./components/LiveReconciliation"), "LiveReconciliation");
const HostPerformance = lazyNamed(() => import("./components/HostPerformance"), "HostPerformance");
const BrandsOverview = lazyNamed(() => import("./components/BrandsOverview"), "BrandsOverview");
const ReportPublishBoard = lazyNamed(() => import("./components/ReportPublishBoard"), "ReportPublishBoard");
const ShiftScheduling = lazyNamed(() => import("./components/ShiftScheduling"), "default");
const MonthPlan = lazyNamed(() => import("./components/MonthPlan"), "default");
const CeoBrief = lazyNamed(() => import("./components/CeoBrief"), "default");

// Chunk của từng tab — để tải SONG SONG với đợt nạp dữ liệu (xem `preload` ở lib/lazyNamed.ts). Phải
// khớp với khối render tab bên dưới; thiếu một tab thì tab đó chỉ chậm như trước, không hỏng.
const TAB_CHUNKS: Record<string, { preload: () => void }[]> = {
  sessions: [SessionLedger],
  my_shifts: [OpsBoard],
  shift_scheduling: [ShiftScheduling],
  month_plan: [MonthPlan],
  live_reconciliation: [LiveReconciliation],
  agency_overview: [CeoBrief],
  host_performance: [HostPerformance],
  brands_overview: [BrandsOverview],
  report_publish_board: [ReportPublishBoard],
  brand_dashboard: [BrandDashboard],
  brand_calendar: [BrandCalendar],
  brand_sessions: [SessionLedger],
  brand_skus: [BrandSkuShowcase],
  brand_monthly_report: [BrandMonthlyReport],
  brand_commitment_view: [BrandCommitmentView],
  brand_next_month_plan: [BrandNextMonthPlan],
  brand_affiliate: [BrandAffiliateTable],
  brand_ads_report: [BrandAdsReport],
  brand_dataraw: [BrandDataRaw],
  talents: [TalentMatcher],
  my_talent_profile: [MyTalentProfile],
  studios: [StudioEquipment],
  crm: [CrmProjects],
  tiktok_api: [TikTokApiAutomation],
  finance: [FinanceHr],
  ai_training: [AiTrainingCenter, EngineTrainingPanel],
  user_settings: [UserRoleSettings],
  account_settings: [AccountSettings]
};

// Màn có lượt đọc riêng lúc mount (sau cổng `coreDataReady`) — gọi hàm nạp trước của chính màn đó trong
// lúc đợt nạp chung còn chạy (src/lib/db/prefetch.ts). import() trùng với chunk ở TAB_CHUNKS, không tải hai lần.
// Tab brand có số theo sàn ⇒ hiện bộ chuyển sàn. "all" = có nút "Tổng 2 sàn"; "single" = chỉ từng sàn (report, Ads độc lập).
const PLATFORM_TABS: Record<string, "all" | "single"> = {
  brand_dashboard: "all",
  brand_calendar: "all",
  brand_sessions: "all",
  brand_monthly_report: "single",
  brand_next_month_plan: "single",
  brand_commitment_view: "single",
  brand_ads_report: "single"
};

const TAB_DATA_PREFETCH: Record<string, (ctx: TabPrefetchCtx) => Promise<void>> = {
  agency_overview: (ctx) => import("./components/CeoBrief").then((m) => m.prefetchCeoBrief(ctx)),
  brand_dashboard: (ctx) => import("./components/brand-workspace/BrandDashboard").then((m) => m.prefetchBrandDashboard(ctx)),
  brand_monthly_report: (ctx) => import("./components/brand-workspace/BrandMonthlyReport").then((m) => m.prefetchBrandMonthlyReport(ctx)),
  brand_ads_report: (ctx) => import("./components/brand-workspace/BrandAdsReport").then((m) => m.prefetchBrandAdsReport(ctx)),
  shift_scheduling: (ctx) => import("./components/ShiftScheduling").then((m) => m.prefetchShiftScheduling(ctx)),
  month_plan: (ctx) => import("./components/MonthPlan").then((m) => m.prefetchMonthPlan(ctx)),
  brands_overview: (ctx) => import("./components/BrandsOverview").then((m) => m.prefetchBrandsOverview(ctx)),
  crm: (ctx) => import("./components/CrmProjects").then((m) => m.prefetchCrm(ctx)),
  brand_commitment_view: (ctx) => import("./components/brand-workspace/BrandCommitmentView").then((m) => m.prefetchBrandCommitmentView(ctx)),
  brand_next_month_plan: (ctx) => import("./components/brand-workspace/BrandNextMonthPlan").then((m) => m.prefetchBrandNextMonthPlan(ctx)),
  brand_skus: (ctx) => import("./components/brand-workspace/BrandSkuShowcase").then((m) => m.prefetchBrandSkuShowcase(ctx)),
  brand_dataraw: (ctx) => import("./components/brand-workspace/BrandDataRaw").then((m) => m.prefetchBrandDataRaw(ctx))
};

const STORAGE_PREFIX = "liveops_os_v2_";

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(STORAGE_PREFIX + key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error("Failed to save state to localStorage:", e);
  }
}


export default function App() {
  const { session, profile, profileError, loading: authLoading, signOut, passwordRecovery, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const currentRole: UserRole = profile?.role ?? "talent";

  // Audit 2026-09-22 (#2.10): mọi effect nạp dữ liệu dưới đây chạy cho MỌI role đã đăng nhập, kể cả
  // talent và brand — app kéo về danh sách tài khoản, audit log, thiết bị, tham số engine... cho
  // những người không có màn hình nào hiện chúng. Sau migration 0105 thì RLS đã trả 0 dòng nên
  // không còn là lỗ dữ liệu, nhưng vẫn là request thừa mỗi lần đăng nhập. Gate ở client là lớp
  // thứ hai, KHÔNG phải lớp bảo vệ — lớp bảo vệ là RLS.
  //
  // `profile` lúc đầu là null nên currentRole rơi về "talent"; vì vậy mọi effect gate theo cờ này
  // phải có `currentRole` trong mảng dependency để chạy lại khi profile nạp xong.
  const isOpsRole = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [helpOpen, setHelpOpen] = useState(false);

  // Chuông thông báo (migration 0083) — gate theo PHIÊN, không theo `profile`; đổi user thì hook tự
  // nạp lại vì RLS lọc theo auth.uid() của phiên hiện tại.
  //
  // Vì sao không phải `!!profile` (đổi 2026-10-02): `fetchMyNotifications` KHÔNG dùng gì từ hồ sơ —
  // "RLS đã lọc theo auth.uid(), không cần truyền user" (lib/db/notifications.ts). Nhưng `profile`
  // chỉ có sau một round-trip (`useAuth.loadProfile`), nên gate theo nó đẩy lượt đọc chuông xuống
  // CHẶNG 2 của đợt nạp: đo 2026-10-02 trên bản build, `notifications` luôn khởi hành sau khi đợt 1
  // xong, ở mọi màn. `session` thì có ngay từ localStorage, không cần mạng.
  //
  // Phạm vi đúng của cái lợi — đừng phóng đại: nó làm CHUÔNG hiện sớm hơn ~1 round-trip (sàn mạng
  // đo được 2026-10-02 là 354–1.660 ms/request), KHÔNG làm nội dung chính của màn ra sớm hơn, vì
  // chuông không nằm trên đường găng của màn nào.
  //
  // An toàn: lớp bảo vệ là RLS phía server theo JWT, nên thời điểm client gọi không thay đổi được
  // kết quả. Phiên có mà hồ sơ chưa về (hoặc nạp lỗi) thì cùng lắm là một request vô ích, và hook đã
  // tự chịu lỗi ("chuông hỏng không được làm hỏng app"). Đăng xuất ⇒ `session` null ⇒ hook xoá items
  // như trước.
  const notifications = useNotifications(!!session);
  // "shift_scheduling" chỉ là fallback cho lần đầu mở app khi chưa biết role (localStorage rỗng);
  // role thật được set lại ngay bằng getDefaultTabForRole() khi profile load xong (bên dưới).
  // Link riêng cho từng trang (lib/routes.ts, audit UX 2026-09-26): mở app bằng một link cụ thể thì link
  // thắng localStorage. Brand chỉ biết slug lúc này — đối chiếu khi danh sách brand nạp xong (bên dưới).
  const [initialRoute] = useState(() => parsePath(window.location.pathname));
  const [activeTab, setActiveTab] = useState<string>(() =>
    initialRoute ? initialRoute.tab ?? "brand_calendar" : loadStorage("activeTab", "shift_scheduling")
  );
  // Bảng Vận Hành (2026-09-21): "board" = hôm nay/tuần + việc còn thiếu; "calendar" = Lịch & Studio cũ.
  const [opsView, setOpsView] = useState<"board" | "calendar">(() => loadStorage("opsView", "board"));
  // Q4: ca cần mở sau khi bấm thông báo (OpsBoard tiêu thụ rồi xoá).
  const [notifOpenSessionId, setNotifOpenSessionId] = useState<string | null>(null);
  useEffect(() => saveStorage("opsView", opsView), [opsView]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Thu gọn sidebar thành thanh icon (w-16) để nhường không gian ngang cho nội dung.
  // Chỉ áp dụng từ breakpoint md trở lên — dưới md sidebar vẫn là drawer trượt như cũ.
  //
  // 3 mảnh state:
  //  - `sidebarPref`: lựa chọn tay của user ở màn rộng (persist).
  //  - `sidebarCollapsed`: trạng thái thật đang render = tự thu gọn ở màn hẹp, ngoài ra đúng `sidebarPref`.
  //
  // Quy tắc CHỈ theo bề ngang màn, KHÔNG theo tab (audit UX 2026-09-29, Đợt 0 #3): trước đây Nhân sự
  // ca / Bảng Vận Hành / Lịch brand tự thu gọn còn tab khác thì không ⇒ đi Kế Hoạch Tháng → Nhân sự
  // ca → Bảng Vận Hành → Sổ Ca thì nội dung nhảy 1.184 ↔ 1.376px và chữ menu mất/hiện liên tục.
  // Ngưỡng 1440px: từ đó lịch còn ≥ 1.136px khi menu mở (đủ 7 cột tháng / lưới phòng theo giờ).
  const [sidebarPref, setSidebarPref] = useState<boolean>(() => loadStorage("sidebarCollapsed", false));
  useEffect(() => saveStorage("sidebarCollapsed", sidebarPref), [sidebarPref]);
  // Lựa chọn tay RIÊNG cho màn hẹp (< 1440px), mặc định thu gọn như cũ. Trước đây mở menu ở màn hẹp chỉ có tác dụng
  // tới lần tải lại — laptop 1.280–1.440px (phổ biến) luôn về ~20 biểu tượng không chữ, người mới phải rê chuột từng
  // cái (audit người mới 2026-10-04, Nhóm 4). Nay mở một lần là nhớ.
  const [sidebarNarrowPref, setSidebarNarrowPref] = useState<boolean>(() => loadStorage("sidebarCollapsedNarrow", true));
  useEffect(() => saveStorage("sidebarCollapsedNarrow", sidebarNarrowPref), [sidebarNarrowPref]);

  const isCalendarModule = CALENDAR_TABS.has(activeTab);
  const isWideScreen = useMediaQuery("(min-width: 1440px)");
  const autoCollapse = !isWideScreen;

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(sidebarPref);
  // Màn hẹp → lựa chọn của màn hẹp (mặc định thu gọn); rộng ra → lựa chọn của màn rộng.
  useEffect(() => {
    setSidebarCollapsed(autoCollapse ? sidebarNarrowPref : sidebarPref);
  }, [autoCollapse, sidebarPref, sidebarNarrowPref]);

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      // Màn rộng và màn hẹp nhớ lựa chọn riêng — mở menu ở laptop không làm đổi mặc định ở màn rộng.
      if (autoCollapse) setSidebarNarrowPref(next);
      else setSidebarPref(next);
      return next;
    });
  }, [autoCollapse]);

  // Phím tắt Cmd/Ctrl + B — chuẩn quen thuộc của các app có sidebar (VSCode, Notion...).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  // Giai đoạn A — Workspace Agency ↔ Brand (xem docs/WORKSPACE_HISTORY.md). Chỉ có ý nghĩa với
  // ceo/admin/operations (những role được phép nhìn xuyên brand); role "brand" tự khoá vào
  // đúng 1 brand của họ ở effectiveWorkspace bên dưới, không dùng state raw này.
  const [workspace, setWorkspace] = useState<WorkspaceContext>(() =>
    initialRoute?.type === "agency" ? { type: "agency" } : loadStorage<WorkspaceContext>("workspace", { type: "agency" })
  );
  const [pendingBrandSlug, setPendingBrandSlug] = useState<string | null>(() =>
    initialRoute?.type === "brand" ? initialRoute.brandSlug : null
  );
  useEffect(() => saveStorage("workspace", workspace), [workspace]);

  // Dữ liệu nghiệp vụ + các đợt nạp: src/hooks/useWorkspaceData.ts. Trả về state KÈM setter vì các
  // handler bên dưới ghi lạc quan vào state ngay sau khi RPC trả về, không nạp lại cả bảng.
  const {
    rolePermissions,
    setRolePermissions,
    phase6Loading,
    phase6Error,
    financeRecords,
    setFinanceRecords,
    phase7Error,
    tiktokStatus,
    tiktokStatusLoading,
    tiktokStatusError,
    tiktokWebhookEvents,
    aiAgentPrompts,
    setAiAgentPrompts,
    aiAgentPromptsLoading,
    aiAgentPromptsError,
    auditLogs,
    setAuditLogs,
    phase5Error,
    users,
    setUsers,
    phase4Error,
    talents,
    setTalents,
    studios,
    setStudios,
    equipments,
    setEquipments,
    phase1Error,
    setSessions,
    monthlyReports,
    setMonthlyReports,
    shiftSlots,
    setShiftSlots,
    setPlanTargetsBySlotId,
    planMonthTotals,
    setPlanMonthTotals,
    planSlotTargets,
    setPlanSlotTargets,
    engineParams,
    setEngineParams,
    engineParamsUpdatedAt,
    setEngineParamsUpdatedAt,
    engineParamsError,
    engineParamsLoading,
    sessionsError,
    brands,
    setBrands,
    brandsLoaded,
    phase3Error,
    brandPlatformRates,
    setBrandPlatformRates,
    brandStudios,
    setBrandStudios,
    shiftRegistrations,
    setShiftRegistrations,
    recurringShiftTemplates,
    setRecurringShiftTemplates,
    phase14Error,
    talentRateHistory,
    setTalentRateHistory,
    brandPlatformRateHistory,
    setBrandPlatformRateHistory,
    phase19Error,
    brandSkus,
    setBrandSkus,
    phaseB1Error,
    promoSchemes,
    setPromoSchemes,
    phaseC3Error,
    sessions,
    coreDataReady,
    reloadRolePermissions,
    refreshTikTokStatus
  } = useWorkspaceData({ session, currentRole, isOpsRole, activeTab });
  // Tải chunk tab ngay, không đợi cổng `coreDataReady` ở khối render (cổng đó giữ chunk lại tới khi
  // đợt nạp dữ liệu về xong ⇒ thêm một vòng mạng nối tiếp mỗi lần mở app / đổi tab).
  useEffect(() => {
    const chunks = activeTab === "calendar" ? (opsView === "calendar" ? [LiveCalendar] : [OpsBoard, TodoPanel]) : TAB_CHUNKS[activeTab];
    chunks?.forEach((c) => c.preload());
  }, [activeTab, opsView]);
  // Previously these fetch errors were only stored in state and never rendered anywhere — a
  // failed fetch left a tab silently empty forever with no indication anything went wrong.
  const [dismissedDataErrorSignature, setDismissedDataErrorSignature] = useState<string | null>(null);
  async function handleUpdateAiAgentPrompt(agentKey: string, systemPrompt: string) {
    const updated = await updateAiAgentPrompt(agentKey, systemPrompt);
    setAiAgentPrompts((prev) => prev.map((p) => (p.agentKey === agentKey ? updated : p)));
  }


  async function handleUpdateSessionFinance(
    sessionId: string,
    patch: Partial<Pick<SessionFinance, "studioCost" | "notes">>
  ) {
    try {
      const updated = await upsertSessionFinance(sessionId, patch);
      setFinanceRecords((prev) => {
        const others = prev.filter((f) => f.sessionId !== sessionId);
        return [...others, updated];
      });
    } catch (e) {
      showToast(`Không thể cập nhật Finance & HR: ${errorMessage(e)}`);
    }
  }

  async function handleSetSessionFinanceApproval(sessionId: string, status: SessionFinance["approvalStatus"]) {
    try {
      const updated = await setSessionFinanceApproval(sessionId, status);
      setFinanceRecords((prev) => {
        const others = prev.filter((f) => f.sessionId !== sessionId);
        return [...others, updated];
      });
    } catch (e) {
      showToast(`Không thể cập nhật trạng thái duyệt: ${errorMessage(e)}`);
    }
  }

  async function handleAddBrandSku(sku: { brandId: string; name: string; skuCode: string; flashPrice: number; originalPrice: number }) {
    const created = await createBrandSku({ ...sku, createdBy: profile?.id });
    setBrandSkus((prev) => [...prev, created]);
  }

  async function handleUpdateBrandSku(
    id: string,
    patch: Partial<
      Pick<BrandSku, "name" | "skuCode" | "flashPrice" | "originalPrice" | "isHero" | "pinOrder" | "clearanceRate" | "status" | "notes">
    >
  ) {
    const updated = await updateBrandSku(id, patch);
    setBrandSkus((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleDeleteBrandSku(id: string) {
    await deleteBrandSku(id);
    setBrandSkus((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleAddPromoScheme(scheme: {
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    brandId?: string;
    category?: string;
  }) {
    const created = await createPromoScheme({ ...scheme, createdBy: profile?.id });
    setPromoSchemes((prev) => [...prev, created]);
  }

  async function handleUpdatePromoScheme(
    id: string,
    patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate" | "category">>
  ) {
    const updated = await updatePromoScheme(id, patch);
    setPromoSchemes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function handleDeletePromoScheme(id: string) {
    await deletePromoScheme(id);
    setPromoSchemes((prev) => prev.filter((s) => s.id !== id));
  }

  // LocalStorage sync effects
  useEffect(() => saveStorage("activeTab", activeTab), [activeTab]);

  // activeTab và workspace được lưu localStorage nhưng KHÔNG tách theo user, nên trên máy dùng
  // chung chúng đi thẳng từ phiên đăng nhập này sang phiên khác. Cả hai đều mang ý nghĩa phân
  // quyền (tab nào được mở, đang đứng ở brand nào), nên phải reset khi chủ sở hữu đổi.
  // sidebarCollapsed thì không đụng — thuần thẩm mỹ, dùng chung vô hại.
  useEffect(() => {
    if (!profile?.id) return;
    if (loadStorage<string | null>("uiStateOwner", null) === profile.id) return;
    saveStorage("uiStateOwner", profile.id);
    // Mở bằng link cụ thể thì giữ đúng trang của link (quyền vẫn do isTabAllowed/effectiveWorkspace chặn).
    setActiveTab(initialRoute?.tab ?? getDefaultTabForRole(profile.role));
    if (initialRoute?.type !== "brand") setWorkspace({ type: "agency" });
  }, [profile?.id, profile?.role, initialRoute]);

  // 2. DERIVED DATA: Studio equipment count calculated directly from equipment list assignments
  const activeStudios = useMemo(() => {
    return studios.map((s) => {
      const assignedEquips = equipments.filter(
        (e) => e.assignedStudioId === s.id || e.assignedStudioName?.toLowerCase() === s.name?.toLowerCase()
      );
      return {
        ...s,
        equipmentCount: assignedEquips.length
      };
    });
  }, [studios, equipments]);

  // 3. DERIVED DATA: Talent availability status dynamically updated based on active live sessions
  const activeTalents = useMemo(() => {
    return talents.map((t) => {
      const isLiveNow = sessions.some(
        (s) => (s.hostId === t.id || s.hostName?.toLowerCase() === t.name?.toLowerCase()) && s.status === "Live Now"
      );
      // "Đang bận" = có ca chưa diễn ra TRONG HÔM NAY. Trước 06/10 là bất kỳ ca Upcoming nào (kể cả tuần sau) cộng với
      // ô trạng thái gõ tay ở Talent Pool — ô đó đã bỏ, trạng thái chỉ còn suy từ lịch.
      const today = todayVn();
      const isUpcoming = sessions.some(
        (s) => (s.hostId === t.id || s.hostName?.toLowerCase() === t.name?.toLowerCase()) && s.status === "Upcoming" && s.date === today
      );
      let derivedStatus: "Available" | "Busy" | "On Live" = t.availabilityStatus || "Available";
      if (isLiveNow) {
        derivedStatus = "On Live";
      } else if (isUpcoming && derivedStatus === "Available") {
        derivedStatus = "Busy";
      }
      return {
        ...t,
        availabilityStatus: derivedStatus
      };
    });
  }, [talents, sessions]);

  // Đ10/0114: ca đã "loại khỏi báo cáo" bị chặn ĐÚNG MỘT LẦN ở đây. Mọi màn cộng số (Report Tháng,
  // Hiệu Suất Host, cam kết giờ, P&L, Toàn Cảnh Brand…) nhận `activeSessions`, nên không màn nào
  // phải tự nhớ lọc — đúng loại lỗi sẽ quên ở màn thứ tư. Chỉ Sổ Ca nhận mảng thô (`sessions`) để
  // ops còn tìm lại và bỏ cờ; không có đường đó thì cờ là một chiều.
  const activeSessions = useMemo(() => sessions.filter((s) => !s.excludedFromReports), [sessions]);
  // Chỉ Sổ Ca nhận danh sách này (prop riêng, không trộn vào `sessions`) — xem SessionLedger.
  const excludedSessions = useMemo(() => sessions.filter((s) => s.excludedFromReports), [sessions]);

  const dataLoadErrors = useMemo(
    () =>
      [
        phase1Error && { key: "phase1", message: phase1Error },
        sessionsError && { key: "sessions", message: sessionsError },
        phase3Error && { key: "phase3", message: phase3Error },
        phase4Error && { key: "phase4", message: phase4Error },
        phase5Error && { key: "phase5", message: phase5Error },
        phase6Error && { key: "phase6", message: phase6Error },
        phase7Error && { key: "phase7", message: phase7Error },
        phase14Error && { key: "phase14", message: phase14Error },
        phase19Error && { key: "phase19", message: phase19Error },
        phaseB1Error && { key: "phaseB1", message: phaseB1Error },
        phaseC3Error && { key: "phaseC3", message: phaseC3Error }
      ].filter((e): e is { key: string; message: string } => Boolean(e)),
    [
      phase1Error,
      sessionsError,
      phase3Error,
      phase4Error,
      phase5Error,
      phase6Error,
      phase7Error,
      phase14Error,
      phase19Error,
      phaseB1Error,
      phaseC3Error
    ]
  );
  const dataLoadErrorSignature = dataLoadErrors.map((e) => e.key + ":" + e.message).join("|");
  const showDataLoadErrorBanner = dataLoadErrors.length > 0 && dismissedDataErrorSignature !== dataLoadErrorSignature;

  // Active User object — derived from the real authenticated Supabase profile, not a fake switcher
  const activeUser: SystemUser = profile
    ? {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        customRoleTitle: profile.custom_role_title,
        avatar: profile.avatar,
        status: profile.status,
        assignedBrandId: profile.assigned_brand_id ?? undefined,
        assignedTalentId: profile.assigned_talent_id ?? undefined,
        customPermissionOverrides: profile.custom_permission_overrides ?? undefined
      }
    : {
        id: "unknown",
        name: "—",
        email: "",
        role: "talent",
        customRoleTitle: "",
        avatar: "",
        status: "Active",
      };

  // Workspace thật đang áp dụng — role "brand" bị ép cứng vào brand của chính họ (không cho
  // chọn lại); ceo/admin/operations dùng state `workspace` từ switcher; các role khác
  // (talent) luôn ở Agency Workspace vì chưa có nhu cầu nghiệp vụ nhìn theo brand.
  const effectiveWorkspace: WorkspaceContext = useMemo(() => {
    if (currentRole === "brand") {
      return activeUser.assignedBrandId ? { type: "brand", brandId: activeUser.assignedBrandId } : { type: "agency" };
    }
    if (currentRole === "ceo" || currentRole === "admin" || currentRole === "operations") {
      // Audit Module 2 (2026-09-18): `workspace` sống trong localStorage, brand thì có thể đã bị
      // xoá — trước đây Header hiện chữ "Brand" trống, sidebar vẫn là Brand Workspace với dữ liệu
      // rỗng và không có cách nào thoát ngoài mở switcher. Brand đã nạp xong mà không có id đó
      // thì về Agency. Chỉ xét sau khi brands nạp xong, nếu không lần mở đầu (brands = []) sẽ
      // luôn văng về Agency dù workspace hợp lệ.
      if (workspace.type === "brand" && brandsLoaded && !brands.some((b) => b.id === workspace.brandId)) {
        return { type: "agency" };
      }
      return workspace;
    }
    return { type: "agency" };
  }, [currentRole, workspace, activeUser.assignedBrandId, brandsLoaded, brands]);
  const currentBrandId = effectiveWorkspace.type === "brand" ? effectiveWorkspace.brandId : undefined;
  const currentBrandName = brands.find((b) => b.id === currentBrandId)?.name || "Brand";

  // Sàn đang xem trong Brand workspace (06/10, user chốt: mỗi brand × sàn có kế hoạch, target, report, hợp đồng riêng;
  // brand xem được riêng từng sàn lẫn tổng). Nhớ theo brand; link `?san=` thắng lần mở đầu. Brand một sàn ⇒ không có thanh.
  const [platformScopeByBrand, setPlatformScopeByBrand] = useState<Record<string, PlatformScope>>({});
  const [urlPlatform] = useState(() => parsePlatformParam(window.location.search));
  const currentBrandPlatforms: ReportPlatform[] = useMemo(
    () => (currentBrandId ? brandPlatformsOf(currentBrandId, sessions, [...shiftSlots, ...brandStudios]) : ["TikTok"]),
    [currentBrandId, sessions, shiftSlots, brandStudios]
  );
  const multiPlatform = currentBrandPlatforms.length > 1;
  const rawPlatformScope: PlatformScope =
    (currentBrandId && platformScopeByBrand[currentBrandId]) || urlPlatform || (multiPlatform ? "all" : currentBrandPlatforms[0]);
  const platformScope: PlatformScope = !multiPlatform
    ? currentBrandPlatforms[0]
    : rawPlatformScope === "all" || currentBrandPlatforms.includes(rawPlatformScope)
      ? rawPlatformScope
      : "all";
  // Tab chỉ có từng sàn (report, Ads, kế hoạch) thì "Tổng" quy về sàn đầu.
  const singlePlatform: ReportPlatform = platformScope === "all" ? currentBrandPlatforms[0] : platformScope;
  const setPlatformScope = (v: PlatformScope) => currentBrandId && setPlatformScopeByBrand((m) => ({ ...m, [currentBrandId]: v }));

  // Nạp trước lượt đọc riêng của tab đang mở — CHỈ trong lúc chờ đợt nạp chung (màn chưa mount nên chưa
  // ai `take`; sau đó màn mount ngay và tự đọc, nạp trước chỉ đẻ request thừa). Không đợi `profile`: đo
  // 2026-10-03, có lượt `profiles` về SAU cả đợt chung, chờ nó là mất luôn phần lợi. Chưa có profile thì
  // role là "chưa biết" và brand lấy từ `workspace` thô (ops; role brand bị ép brand theo profile sau).
  // Đổi tab thì bỏ mọi bản nạp trước chưa ai lấy — trong useLayoutEffect: React chạy effect của con TRƯỚC
  // cha, nên xoá trong useEffect sẽ xoá luôn bản mà màn mới vừa nạp trước cho khối con của nó (đo
  // 2026-10-04: Nhập Ads đọc brand_affiliate_plans 2 lần khi đổi tab). Layout effect chạy trước mọi effect thường.
  useLayoutEffect(() => {
    dropPrefetched();
  }, [activeTab]);
  const prefetchBrandId = profile ? currentBrandId : workspace.type === "brand" ? workspace.brandId : undefined;
  useEffect(() => {
    if (!session || coreDataReady) return;
    TAB_DATA_PREFETCH[activeTab]?.({ brandId: prefetchBrandId, role: profile ? currentRole : undefined }).catch(() => {});
    // `session` chỉ cần có/không — object mới mỗi lần làm mới token không đổi gì ở đây.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, !!session, !!profile, coreDataReady, prefetchBrandId, currentRole]);

  // Link /brand/<slug>/… mở lúc brand chưa nạp: đối chiếu slug một lần khi đã nạp xong. Điều chỉnh
  // state ngay trong render (không qua effect) để lần vẽ đầu sau khi nạp đã đúng brand, không nháy Agency.
  if (pendingBrandSlug && brandsLoaded) {
    const b = findBrandBySlug(brands, pendingBrandSlug);
    setPendingBrandSlug(null);
    if (b) setWorkspace({ type: "brand", brandId: b.id });
    else {
      // Link tới brand đã xoá/gõ sai: về trang mặc định thay vì kẹt ở màn "không có quyền".
      setWorkspace({ type: "agency" });
      setActiveTab(getDefaultTabForRole(currentRole));
    }
  }

  // State → URL. Lần đầu dùng replaceState (không đẻ thêm một bước Back vô nghĩa), sau đó mỗi lần đổi
  // tab/brand là một bước trong lịch sử trình duyệt. Chưa dựng được link (brand chưa nạp, tab không có
  // slug) thì giữ nguyên URL.
  const routeSyncedRef = useRef(false);
  useEffect(() => {
    if (pendingBrandSlug) return;
    const path = routeToPath(effectiveWorkspace, activeTab, brands);
    if (!path) return;
    const search = withPlatformParam(window.location.search, effectiveWorkspace.type === "brand" && multiPlatform && PLATFORM_TABS[activeTab] ? platformScope : null);
    if (path !== window.location.pathname || search !== window.location.search) {
      const url = path + search + window.location.hash;
      if (routeSyncedRef.current && path !== window.location.pathname) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    }
    routeSyncedRef.current = true;
  }, [effectiveWorkspace, activeTab, brands, pendingBrandSlug, multiPlatform, platformScope]);

  // URL → state khi bấm Back/Forward.
  useEffect(() => {
    const onPop = () => {
      const r = parsePath(window.location.pathname);
      if (!r) return;
      if (r.type === "agency") {
        setWorkspace({ type: "agency" });
        setActiveTab(r.tab);
        return;
      }
      const b = findBrandBySlug(brands, r.brandSlug);
      if (!b) return;
      setWorkspace({ type: "brand", brandId: b.id });
      setActiveTab(r.tab ?? "brand_calendar");
      const san = parsePlatformParam(window.location.search);
      if (san) setPlatformScopeByBrand((m) => ({ ...m, [b.id]: san }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [brands]);

  // Helper to check permission for a specific key under current role/user
  const checkPermission = (permKey: PermissionKey): boolean => {
    if (activeUser && activeUser.customPermissionOverrides?.[permKey] !== undefined) {
      return !!activeUser.customPermissionOverrides[permKey];
    }
    return !!rolePermissions[currentRole]?.[permKey];
  };

  // Handlers for Users & Permissions
  const pushAuditLog = async (entry: {
    action: string;
    details: string;
    category: AuditLogEntry["category"];
  }) => {
    try {
      const created = await createAuditLog({
        performedByUserId: profile?.id,
        performedByName: `${activeUser.name} (${currentRole.toUpperCase()})`,
        action: entry.action,
        details: entry.details,
        category: entry.category
      });
      setAuditLogs((prev) => [created, ...prev]);
    } catch (e) {
      console.error("Không thể ghi audit log:", e);
    }
  };

  const handleUpdateRolePermissions = async (newMap: RolePermissionsMap) => {
    try {
      const saved = await updateRolePermissions(newMap);
      setRolePermissions(saved);
      await pushAuditLog({
        action: `Cập nhật Ma Trận Phân Quyền Role`,
        details: `Thay đổi cấu hình quyền truy cập tính năng cho các vai trò trong hệ thống.`,
        category: "Permission Change"
      });
    } catch (e) {
      showToast(`Không thể lưu Ma Trận Phân Quyền: ${errorMessage(e)}`);
    }
  };

  const handleAddUser = async (newUser: InviteUserPayload) => {
    try {
      await inviteUser(newUser);
      const refreshed = await fetchUsers();
      setUsers(refreshed);
      await pushAuditLog({
        action: `Tạo tài khoản người dùng mới`,
        details: `Đã gửi lời mời tạo tài khoản ${newUser.name} (${newUser.email}) với role ${newUser.role.toUpperCase()}`,
        category: "User Status"
      });
    } catch (e) {
      showToast(`Không thể tạo tài khoản: ${errorMessage(e)}`);
      throw e;
    }
  };

  const handleUpdateUser = async (updatedUser: SystemUser) => {
    try {
      const saved = await updateUserProfile(updatedUser);
      setUsers((prev) => prev.map((u) => (u.id === saved.id ? saved : u)));
      await pushAuditLog({
        action: `Cập nhật thông tin/quyền người dùng`,
        details: `Chỉnh sửa tài khoản ${updatedUser.name} (${updatedUser.email})`,
        category: "User Status"
      });
    } catch (e) {
      showToast(`Không thể cập nhật tài khoản: ${errorMessage(e)}`);
      throw e;
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    try {
      await deleteUserAccount(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      if (target) {
        await pushAuditLog({
          action: `Xóa tài khoản người dùng`,
          details: `Đã xóa tài khoản ${target.name} (${target.email}) khỏi hệ thống`,
          category: "User Status"
        });
      }
    } catch (e) {
      showToast(`Không thể xóa tài khoản: ${errorMessage(e)}`);
    }
  };

  // Handlers for Talents — persisted to Supabase
  // Tạo talent mới giờ luôn kèm tạo account đăng nhập thật (mật khẩu NGẪU NHIÊN do server sinh,
  // bắt đổi ngay lần đăng nhập đầu — audit 2026-09-24, xem TalentMatcher.tsx "Thêm Talent Mới")
  // — đi qua endpoint invite thay vì insert `talents` trực tiếp, nên phải refetch cả talents lẫn
  // users sau khi xong. Không catch+alert ở đây — để lỗi propagate lên cho TalentMatcher hiện
  // inline trong modal (tránh double dialog). Trả lại mật khẩu vừa sinh để TalentMatcher hiện
  // 1 lần cho ops (server không lưu lại ở đâu khác).
  const handleCreateTalentAccount = async (payload: NewTalentAccountPayload): Promise<string | undefined> => {
    const { generatedPassword } = await inviteUser({
      name: payload.name,
      email: payload.email,
      role: "talent",
      customRoleTitle: "Talent Host",
      generatePassword: true,
      newTalentProfile: {
        name: payload.name,
        phone: payload.phone,
        role: payload.role,
        gender: payload.gender,
        niches: payload.niches,
        avatar: payload.avatar,
        avgGmvPerSession: payload.avgGmvPerSession,
        totalGmv: payload.totalGmv,
        ctrAvg: payload.ctrAvg,
        cvrAvg: payload.cvrAvg,
        overallScore: payload.overallScore,
        ratePerSession: payload.ratePerSession,
        ratePerHour: payload.ratePerHour,
        assistantRatePerHour: payload.assistantRatePerHour,
        commissionRate: payload.commissionRate,
        availabilityStatus: payload.availabilityStatus
      }
    });
    const [refreshedTalents, refreshedUsers] = await Promise.all([fetchTalents(), fetchUsers()]);
    setTalents(refreshedTalents);
    setUsers(refreshedUsers);
    return generatedPassword;
  };
  const handleUpdateTalent = async (id: string, patch: Partial<Talent>) => {
    try {
      const saved = await updateTalent(id, patch);
      setTalents(prev => prev.map(t => t.id === saved.id ? saved : t));
      // Đổi rate sẽ khiến DB trigger (migration 0018/0055) mở version mới trong
      // talent_rate_history. State history chỉ nạp 1 lần lúc mở app, nên không nạp lại thì P&L
      // (lib/pnl.ts tra rate theo NGÀY session qua history) vẫn tính bằng rate cũ cho tới khi
      // user F5 — đúng lỗi đã gặp khi verify Giai đoạn 3.
      if (patch.ratePerSession !== undefined || patch.ratePerHour !== undefined || patch.assistantRatePerHour !== undefined || patch.commissionRate !== undefined) {
        setTalentRateHistory(await fetchTalentRateHistory());
      }
    } catch (e) {
      showToast(`Không thể cập nhật Talent: ${errorMessage(e)}`);
    }
  };
  // Talent tự sửa hồ sơ của mình — cố ý KHÔNG bọc try/catch như handleUpdateTalent: lỗi phải
  // nổi lên tới form để hiện đúng thông báo đỏ tại chỗ, thay vì nuốt rồi báo thành công (bug C3).
  const handleSaveMyTalentProfile = async (patch: { phone: string; avatar: string; dateOfBirth?: string }) => {
    const saved = await updateMyTalentProfile(patch);
    setTalents(prev => prev.map(t => t.id === saved.id ? saved : t));
  };
  const handleDeleteTalent = async (id: string) => {
    try {
      await deleteTalent(id);
      setTalents(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      showToast(`Không thể xóa Talent: ${errorMessage(e)}`);
    }
  };

  // Handlers for Studios — persisted to Supabase
  const handleAddStudio = async (newStudio: Studio) => {
    try {
      const created = await createStudio(newStudio);
      setStudios(prev => [created, ...prev]);
    } catch (e) {
      showToast(`Không thể tạo Studio: ${errorMessage(e)}`);
    }
  };
  const handleUpdateStudio = async (updatedStudio: Studio) => {
    try {
      const saved = await updateStudio(updatedStudio);
      setStudios(prev => prev.map(s => s.id === saved.id ? saved : s));
    } catch (e) {
      showToast(`Không thể cập nhật Studio: ${errorMessage(e)}`);
    }
  };
  const handleDeleteStudio = async (id: string) => {
    try {
      await deleteStudio(id);
      setStudios(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      showToast(`Không thể xóa Studio: ${errorMessage(e)}`);
    }
  };

  // Handlers for Equipments — persisted to Supabase
  const handleAddEquipment = async (newEquipment: Equipment) => {
    try {
      const created = await createEquipment(newEquipment);
      setEquipments(prev => [created, ...prev]);
    } catch (e) {
      // Race hiếm: 2 người cùng thêm thiết bị trùng mã QR giữa lúc StudioEquipment đã kiểm tra
      // trùng ở state cục bộ và lúc insert thật chạy tới DB — DB vẫn là nguồn chặn trùng cuối
      // cùng (qr_code unique, 0001_init.sql). Dịch lỗi Postgres thô thành thông báo dễ hiểu (M7).
      if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") {
        showToast(`Mã QR "${newEquipment.qrCode}" vừa bị thiết bị khác dùng mất — vui lòng đổi mã khác rồi thử lại.`);
      } else {
        showToast(`Không thể tạo thiết bị: ${errorMessage(e)}`);
      }
    }
  };
  const handleUpdateEquipment = async (updatedEquipment: Equipment) => {
    try {
      const saved = await updateEquipment(updatedEquipment);
      setEquipments(prev => prev.map(e => e.id === saved.id ? saved : e));
    } catch (e) {
      showToast(`Không thể cập nhật thiết bị: ${errorMessage(e)}`);
    }
  };
  const handleDeleteEquipment = async (id: string) => {
    try {
      await deleteEquipment(id);
      setEquipments(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      showToast(`Không thể xóa thiết bị: ${errorMessage(e)}`);
    }
  };

  // Handlers for Brands — persisted to Supabase
  const handleAddBrand = async (newBrand: Brand) => {
    try {
      const created = await createBrand(newBrand);
      setBrands(prev => [created, ...prev]);
    } catch (e) {
      showToast(`Không thể tạo Brand: ${errorMessage(e)}`);
    }
  };
  const handleUpdateBrand = async (updatedBrand: Brand) => {
    try {
      const saved = await updateBrand(updatedBrand);
      setBrands(prev => prev.map(b => b.id === saved.id ? saved : b));
    } catch (e) {
      showToast(`Không thể cập nhật Brand: ${errorMessage(e)}`);
    }
  };
  const handleDeleteBrand = async (id: string) => {
    try {
      await deleteBrand(id);
      setBrands(prev => prev.filter(b => b.id !== id));
    } catch (e) {
      showToast(`Không thể xóa Brand: ${errorMessage(e)}`);
    }
  };

  // Handlers for Live Sessions — persisted to Supabase. Return a success boolean so callers that
  // manage their own UI state (e.g. the calendars' session modal) know whether to close/reset — only
  // dismiss on caught errors below, not on an unconditional "we sent the request" assumption.
  const handleUpdateSession = async (updatedSession: LiveSession): Promise<boolean> => {
    try {
      const saved = await updateSession(updatedSession);
      setSessions(prev => prev.map(s => s.id === saved.id ? saved : s));
      return true;
    } catch (e) {
      showToast(`Không thể cập nhật Live Session: ${errorMessage(e)}`);
      return false;
    }
  };
  // Đổi người giữa ca (0138): ghi đoạn giờ từng người, RPC tự đồng bộ người chính của ca → state lấy lại bản ca đầy đủ.
  const handleSetStaffSegments = async (session: LiveSession, segments: Parameters<typeof setSessionStaffSegments>[1], reason: string): Promise<boolean> => {
    try {
      const saved = await setSessionStaffSegments(session.id, segments);
      setSessions((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      await pushAuditLog({
        action: "Đổi người giữa ca",
        details: `Ca ${session.date} ${session.startTime}-${session.endTime} (${session.brandName}): ${segments.length === 0 ? "bỏ chia đoạn, host/trợ làm cả ca" : `${segments.length} đoạn giờ`}. Lý do: ${reason.trim() || "Không ghi lý do"}.`,
        category: "Security Alert"
      });
      return true;
    } catch (e) {
      showToast(`Không thể lưu người theo đoạn giờ: ${errorMessage(e)}`);
      return false;
    }
  };
  const handleSubmitSessionReport = async (sessionId: string, input: SessionReportInput): Promise<boolean> => {
    try {
      const saved = await submitSessionReport(sessionId, input);
      setSessions((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      return true;
    } catch (e) {
      showToast(`Không thể lưu report ca live: ${errorMessage(e)}`);
      return false;
    }
  };
  // Đối soát ghi đè nhiều ca cùng lúc trong 1 RPC nên không có danh sách session trả về — nạp lại
  // toàn bộ thay vì cố suy ra ca nào đã đổi.
  const handleReconciliationApplied = async () => {
    setSessions(await fetchSessions());
  };
  // Snapshot upload trả về đúng LiveSession vừa tính lại — chỉ cần thay 1 phần tử trong state.
  const handleSessionReconciled = (updated: LiveSession) => {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };
  const handleDeleteSession = async (id: string) => {
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      // 0097: trigger DB đã trả slot đã chốt về 'open' — đồng bộ lại state slot.
      setShiftSlots((prev) => prev.map((sl) => (sl.sessionId === id ? { ...sl, status: "open", sessionId: undefined } : sl)));
    } catch (e) {
      showToast(`Không thể xóa Live Session: ${errorMessage(e)}`);
    }
  };
  // Huỷ ca (0097): RPC đổi ca + slot trong 1 transaction; trigger 0083 tự báo host/trợ nếu ca chưa diễn ra.
  const handleCancelSession = async (id: string, reason: string, reopenSlot = false): Promise<boolean> => {
    try {
      const updated = await cancelSession(id, reason, reopenSlot);
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      // 0113: "mở lại" nhả luôn session_id ở DB — state phải theo, nếu không card vẫn hiện nhưng
      // bấm Chốt sẽ gắn nhầm ca vừa huỷ.
      setShiftSlots((prev) =>
        prev.map((sl) =>
          sl.sessionId === id && sl.status === "finalized"
            ? reopenSlot
              ? { ...sl, status: "open", sessionId: undefined }
              : { ...sl, status: "cancelled" }
            : sl
        )
      );
      return true;
    } catch (e) {
      showToast(`Không huỷ được ca: ${errorMessage(e)}`);
      return false;
    }
  };

  // Loại ca khỏi báo cáo / đưa trở lại (0114). Không sinh audit riêng: DB đã ghi excluded_by +
  // excluded_at + lý do trên chính dòng ca, đó là nơi người đọc report sẽ tìm.
  const handleSetSessionExcluded = async (id: string, excluded: boolean, reason: string): Promise<boolean> => {
    try {
      const updated = await setSessionExcluded(id, excluded, reason);
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      return true;
    } catch (e: unknown) {
      showToast(`${excluded ? "Không loại được ca" : "Không đưa lại được ca"}: ${errorMessage(e)}`);
      return false;
    }
  };

  // Đ7 (0116): talent báo không đi được ca đã chốt → thông báo cho ops. KHÔNG đổi lịch gì cả, nên
  // không có state nào phải cập nhật ở đây.
  const handleRequestDropout = async (sessionId: string, reason: string): Promise<boolean> => {
    try {
      await requestShiftDropout(sessionId, reason);
      return true;
    } catch (e: unknown) {
      showToast(`Không gửi được: ${errorMessage(e)}`);
      return false;
    }
  };

  // Handlers for "Đăng Ký & Chốt Lịch Host" (Giai đoạn 14a)
  const handleCreateShiftSlot = async (slot: ShiftSlot): Promise<boolean> => {
    try {
      const created = await createShiftSlot(slot);
      setShiftSlots((prev) => [...prev, created]);
      return true;
    } catch (e) {
      showToast(`Không thể mở ca mới: ${errorMessage(e)}`);
      return false;
    }
  };

  const handleDeleteShiftSlot = async (id: string) => {
    try {
      await deleteShiftSlot(id);
      setShiftSlots((prev) => prev.filter((s) => s.id !== id));
      setShiftRegistrations((prev) => prev.filter((r) => r.slotId !== id));
    } catch (e) {
      showToast(`Không thể xoá ca: ${errorMessage(e)}`);
    }
  };

  const handleCreateRecurringTemplate = async (t: RecurringShiftTemplate): Promise<boolean> => {
    try {
      const created = await createRecurringShiftTemplate(t);
      setRecurringShiftTemplates((prev) => [...prev, created]);
      return true;
    } catch (e) {
      showToast(`Không thể tạo quy tắc lặp: ${errorMessage(e)}`);
      return false;
    }
  };

  const handleToggleRecurringTemplate = async (t: RecurringShiftTemplate): Promise<boolean> => {
    try {
      const updated = await updateRecurringShiftTemplate({ ...t, active: !t.active });
      setRecurringShiftTemplates((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      return true;
    } catch (e) {
      showToast(`Không thể cập nhật quy tắc lặp: ${errorMessage(e)}`);
      return false;
    }
  };

  const handleDeleteRecurringTemplate = async (id: string) => {
    try {
      await deleteRecurringShiftTemplate(id);
      setRecurringShiftTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      showToast(`Không thể xoá quy tắc lặp: ${errorMessage(e)}`);
    }
  };

  // Kế Hoạch Tháng chốt xong (RPC lock_month_plan sinh shift_slots phía server) → nạp lại danh sách
  // ca để Đăng Ký & Chốt Lịch / lịch thấy ngay, không cần F5.
  const reloadShiftSlots = async () => {
    try {
      const [slots, planTargets] = await Promise.all([fetchShiftSlots(), fetchLockedPlanTargets()]);
      setShiftSlots(slots);
      setPlanTargetsBySlotId(planTargets.bySlotId);
      setPlanMonthTotals(planTargets.monthTotals);
      setPlanSlotTargets(planTargets.slotTargets);
    } catch (e) {
      showToast(`Không nạp lại được danh sách ca: ${errorMessage(e)}`);
    }
  };

  const handleRegisterSlot = async (slotId: string, talentId: string): Promise<boolean> => {
    try {
      const created = await registerForSlot(slotId, talentId);
      setShiftRegistrations((prev) => [...prev, created]);
      return true;
    } catch (e) {
      showToast(`Không thể đăng ký ca: ${errorMessage(e)}`);
      return false;
    }
  };

  const handleUnregisterSlot = async (slotId: string, talentId: string): Promise<boolean> => {
    try {
      await unregisterFromSlot(slotId, talentId);
      setShiftRegistrations((prev) => prev.filter((r) => !(r.slotId === slotId && r.talentId === talentId)));
      return true;
    } catch (e) {
      showToast(`Không thể huỷ đăng ký: ${errorMessage(e)}`);
      return false;
    }
  };

  const handleSetBrandStudio = async (brandId: string, platform: "TikTok" | "Shopee", studioId: string): Promise<boolean> => {
    try {
      await setBrandStudio(brandId, platform, studioId);
      setBrandStudios((prev) => {
        const next = prev.filter((b) => !(b.brandId === brandId && b.platform === platform));
        return studioId ? [...next, { brandId, platform, studioId }] : next;
      });
      return true;
    } catch (e) {
      showToast(`Không lưu được phòng mặc định: ${errorMessage(e)}`);
      return false;
    }
  };

  const handleSaveBrandPlatformRate = async (
    brandId: string,
    platform: "TikTok" | "Shopee",
    ratePerHour: number
  ): Promise<boolean> => {
    try {
      const saved = await upsertBrandPlatformRate(brandId, platform, ratePerHour);
      setBrandPlatformRates((prev) => {
        const next = prev.filter((r) => !(r.brandId === brandId && r.platform === platform));
        return [...next, saved];
      });
      // Cùng lỗi đã sửa ở handleUpdateTalent (H2): đổi rate mở version mới trong
      // brand_platform_rate_history (trigger 0018-style), nhưng state history chỉ nạp 1 lần lúc
      // mở app. Không nạp lại thì pnl.ts:106 (findBrandRateAsOf) vẫn trả rate cũ cho session mới
      // tới khi F5 (audit H1).
      setBrandPlatformRateHistory(await fetchBrandPlatformRateHistory());
      return true;
    } catch (e) {
      showToast(`Không thể lưu rate: ${errorMessage(e)}`);
      return false;
    }
  };

  const handleSaveBrandPlatformReturnRate = async (
    brandId: string,
    platform: "TikTok" | "Shopee",
    returnRate: number
  ): Promise<boolean> => {
    try {
      const saved = await upsertBrandPlatformReturnRate(brandId, platform, returnRate);
      setBrandPlatformRates((prev) => {
        const next = prev.filter((r) => !(r.brandId === brandId && r.platform === platform));
        return [...next, saved];
      });
      // Cùng lý do với handleSaveBrandPlatformRate ở trên (audit H1).
      setBrandPlatformRateHistory(await fetchBrandPlatformRateHistory());
      return true;
    } catch (e) {
      showToast(`Không thể lưu tỷ lệ hoàn hủy: ${errorMessage(e)}`);
      return false;
    }
  };

  const handleSaveBrandPlatformCommissionRate = async (
    brandId: string,
    platform: "TikTok" | "Shopee",
    commissionRate: number
  ): Promise<boolean> => {
    try {
      const saved = await upsertBrandPlatformCommissionRate(brandId, platform, commissionRate);
      setBrandPlatformRates((prev) => [...prev.filter((r) => !(r.brandId === brandId && r.platform === platform)), saved]);
      setBrandPlatformRateHistory(await fetchBrandPlatformRateHistory());
      return true;
    } catch (e) {
      showToast(`Không thể lưu % hoa hồng: ${errorMessage(e)}`);
      return false;
    }
  };

  // Chốt lịch: RPC finalize_shift_slot (0133) tạo live_session + đánh dấu slot "finalized" trong một
  // transaction và từ chối nếu slot không còn mở (người khác vừa chốt/huỷ) — trước đó là 2 bước ghi từ
  // client kèm xoá bù khi bước 2 lỗi, và 2 người bấm cùng lúc sinh 2 ca. Target ghi 0: target đổ từ Kế
  // Hoạch Tháng đã chốt xuống từng ca lúc đọc (applyAllocatedTargets), không gán theo phong độ host.
  const handleFinalizeShiftSlot = async (slot: ShiftSlot, hostId: string, coHostId: string | null): Promise<boolean> => {
    try {
      const created = await finalizeShiftSlot(slot.id, hostId, coHostId);
      setSessions((prev) => [created, ...prev]);
      setShiftSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, status: "finalized", sessionId: created.id } : s)));
      return true;
    } catch (e) {
      showToast(`Không thể chốt lịch: ${errorMessage(e)}`);
      return false;
    }
  };

  const AGENCY_NAV_GROUPS = agencyNavGroups(currentRole);
  const BRAND_NAV_GROUPS = brandNavGroups(currentRole);

  const navGroups = effectiveWorkspace.type === "brand" ? BRAND_NAV_GROUPS : AGENCY_NAV_GROUPS;
  const navItems = navGroups.flatMap((g) => g.items);

  // Phần lớn thông báo là về MỘT CA của chính người nhận (xếp/rút/đổi giờ/huỷ/đối soát). Q4 (audit
  // 2026-09-21): talent → Ca Của Tôi, ops → Bảng Vận Hành, và mở luôn Cửa sổ Ca Live của ca đó
  // (notification.session_id). Talent luôn ở Agency Workspace, không cần đổi workspace.
  //
  // 0116/Đ9 thêm `shift_open` — thông báo DUY NHẤT không gắn với ca nào (ca chờ đăng ký chưa phải
  // live_session, và bản tổng cả tháng thì nói về 60 ca). Đích của nó là Đăng Ký Ca, không phải
  // Ca Của Tôi: gửi tới "Ca Của Tôi" thì talent mở ra thấy trống và không hiểu mình vừa bấm gì.
  const handleOpenNotification = (n: AppNotification) => {
    void notifications.markRead([n.id]);
    if (n.kind === "shift_open") setActiveTab("shift_scheduling");
    else if (currentRole === "talent") setActiveTab("my_shifts");
    else {
      setOpsView("board");
      setActiveTab("calendar");
    }
    if (n.sessionId) setNotifOpenSessionId(n.sessionId);
    setMobileMenuOpen(false);
  };

  // Màn này người dùng mở được không (agency theo quyền; màn của Brand Workspace thì ops luôn mở được).
  const myPermissionOverrides = activeUser?.customPermissionOverrides;
  const canOpenTab = React.useCallback(
    (tab: string) => {
      const groups = [...agencyNavGroups(currentRole), ...(isOpsRole ? brandNavGroups(currentRole) : [])];
      const item = groups.flatMap((g) => g.items).find((n) => n.id === tab);
      if (!item) return false;
      if (!item.perm) return true;
      const own = myPermissionOverrides?.[item.perm]; // cùng luật checkPermission
      return own !== undefined ? !!own : !!rolePermissions[currentRole]?.[item.perm];
    },
    [currentRole, isOpsRole, rolePermissions, myPermissionOverrides]
  );

  // Mở một màn từ nút "việc cần làm" của màn khác: brandId có ⇒ vào Brand Workspace của brand đó.
  const navigateTo = (tab: string, brandId?: string) => {
    setWorkspace(brandId ? { type: "brand", brandId } : { type: "agency" });
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handleWorkspaceChange = (next: WorkspaceContext) => {
    setWorkspace(next);
    const nextGroups = next.type === "brand" ? BRAND_NAV_GROUPS : AGENCY_NAV_GROUPS;
    const firstTab = nextGroups.flatMap((g) => g.items)[0]?.id;
    if (firstTab) setActiveTab(firstTab);
  };

  // Helper to determine if current tab is allowed.
  //
  // Trước đây là `!currentTabNavItem?.perm || checkPermission(...)` — tab KHÔNG có trong navItems
  // sẽ cho `currentTabNavItem === undefined`, `!undefined` là true, nên MỌI tab lạ đều được coi
  // là hợp lệ. Ba nav item được tạo có điều kiện theo role (my_talent_profile / finance /
  // ai_training) nên với role không đủ quyền chúng biến mất khỏi navItems, rơi đúng vào lỗ này.
  // Chỉ `finance` là còn render thật (2 tab kia có guard `&& currentRole === ...` riêng), và
  // activeTab thì được lưu localStorage KHÔNG tách theo user — nên máy dùng chung: ceo mở tab
  // Finance rồi đăng xuất, người sau đăng nhập là vào thẳng Finance & P&L.
  //
  // Nay đảo lại mặc định: không tìm thấy nav item = không được phép. Cách này bảo vệ luôn mọi
  // nav item tạo-có-điều-kiện thêm về sau, không phải nhớ thêm guard ở chỗ render.
  const currentTabNavItem = navItems.find((n) => n.id === activeTab);
  const isTabAllowed =
    TABS_WITHOUT_NAV_ITEM.has(activeTab) ||
    (!!currentTabNavItem && (!currentTabNavItem.perm || checkPermission(currentTabNavItem.perm)));

  // Tab hợp lệ ĐẦU TIÊN của role hiện tại — lưới an toàn cho getDefaultTabForRole().
  //
  // Audit 2026-09-22: getDefaultTabForRole() trả tab CỐ ĐỊNH theo role, nhưng tab đó lại gate bằng
  // PermissionKey đọc từ `role_permissions` — một bảng CEO sửa được ở Ma Trận Phân Quyền. Hai nguồn
  // sự thật này lệch nhau là người dùng vừa đăng nhập đã đập vào màn "Quyền Truy Cập Bị Hạn Chế",
  // không có lối ra nào ngoài bấm nút "về trang mặc định" — vốn trỏ đúng về cái tab đang bị cấm.
  // Đã xảy ra 2 lần: role talent (sửa 2026-09-18 bằng cách đổi hằng số) và role moderator (mặc định
  // rơi vào "calendar" gate `manage_calendar` = false, tức moderator CHƯA BAO GIỜ đăng nhập được).
  // Sửa hằng số chỉ vá được đúng role vừa phát hiện; CEO tắt `manage_calendar` của operations ở Ma
  // Trận là lỗi quay lại ngay. Nên vá bằng lưới an toàn tính từ chính navItems.
  const firstAllowedTab = navItems.find((n) => !n.perm || checkPermission(n.perm))?.id;

  // Màn đầu đã hiện ⇒ lúc trình duyệt rảnh tải sẵn chunk của các tab được phép, để bấm menu không phải đợi
  // tải chunk và không đi qua Suspense (fallback bị React giữ tối thiểu 300 ms — xem lib/lazyNamed.ts).
  // Mỗi chunk chỉ tải một lần (import() trả cùng promise); file có hash + cache immutable nên lần sau lấy từ đĩa.
  // Ops chuyển qua lại Agency ↔ Brand bằng switcher, nên tải sẵn cả màn của hai workspace.
  const preloadNavItems = isOpsRole ? [...AGENCY_NAV_GROUPS, ...BRAND_NAV_GROUPS].flatMap((g) => g.items) : navItems;
  const allowedTabsKey = phase6Loading ? "" : preloadNavItems.filter((n) => !n.perm || checkPermission(n.perm)).map((n) => n.id).join(",");
  useEffect(() => {
    if (!coreDataReady || !allowedTabsKey) return;
    const run = () =>
      allowedTabsKey.split(",").forEach((id) => {
        if (id === "calendar") [OpsBoard, LiveCalendar].forEach((c) => c.preload());
        else TAB_CHUNKS[id]?.forEach((c) => c.preload());
      });
    // Safari chưa có requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") {
      const h = window.requestIdleCallback(run, { timeout: 5000 });
      return () => window.cancelIdleCallback(h);
    }
    const t = setTimeout(run, 2000);
    return () => clearTimeout(t);
  }, [coreDataReady, allowedTabsKey]);

  // Chỉ tự chuyển khi người dùng CHƯA tự chọn tab nào — tức activeTab vẫn đúng bằng mặc định theo
  // role. Người dùng tự bấm vào một tab bị cấm (qua localStorage cũ, hoặc link) thì vẫn phải thấy
  // màn Access Restricted, không im lặng đẩy đi chỗ khác.
  useEffect(() => {
    if (phase6Loading) return; // chưa nạp xong Ma Trận thì checkPermission() nào cũng false
    if (isTabAllowed) return;
    if (activeTab !== getDefaultTabForRole(currentRole)) return;
    if (!firstAllowedTab) return;
    setActiveTab(firstAllowedTab);
  }, [phase6Loading, isTabAllowed, activeTab, currentRole, firstAllowedTab]);

  // Đếm lượt mở tab (0123) — chỉ khi tab thật sự hiện nội dung (có quyền, brand đã đối chiếu xong), mỗi lần
  // đổi tab/brand ghi 1 dòng. Bỏ lượt trùng liền kề (StrictMode chạy effect 2 lần ở dev, nạp lại quyền).
  const lastTabViewRef = useRef("");
  useEffect(() => {
    if (!session || !profile || profile.must_change_password || pendingBrandSlug || !isTabAllowed) return;
    const brandId = effectiveWorkspace.type === "brand" ? effectiveWorkspace.brandId : null;
    const key = `${session.user.id}|${effectiveWorkspace.type}|${brandId ?? ""}|${activeTab}`;
    if (key === lastTabViewRef.current) return;
    lastTabViewRef.current = key;
    logTabView(effectiveWorkspace.type, activeTab, brandId);
  }, [session, profile, pendingBrandSlug, isTabAllowed, effectiveWorkspace, activeTab]);

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-base)] text-[var(--text-muted)] text-sm">
        Đang tải phiên đăng nhập...
      </div>
    );
  }

  if (passwordRecovery) {
    return <ResetPasswordScreen />;
  }

  if (!session) {
    return <Login />;
  }

  if (!profile) {
    // FIX M8 (audit 2026-08-21): trước đây màn này không có nhánh lỗi — session hợp lệ nhưng
    // fetch profiles lỗi mạng/RLS thì kẹt mãi ở đây, không lối thoát. profileError (useAuth.tsx)
    // phân biệt "đang tải" (chưa có lỗi) với "đã thử và lỗi" — có lỗi thì cho thử lại hoặc đăng
    // xuất thay vì màn hình chết.
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-[var(--surface-base)] text-[var(--text-muted)] text-sm px-6 text-center">
        {profileError ? (
          <>
            <div className="text-[var(--text)] font-semibold">Không tải được hồ sơ người dùng</div>
            <div className="max-w-md text-xs text-[var(--text-muted)]">{profileError}</div>
            <div className="flex gap-3">
              <button
                onClick={() => refreshProfile()}
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-bold text-xs"
              >
                Thử lại
              </button>
              <button
                onClick={() => signOut()}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text)] font-bold text-xs"
              >
                Đăng xuất
              </button>
            </div>
          </>
        ) : (
          "Đang tải hồ sơ người dùng..."
        )}
      </div>
    );
  }

  // Talent tạo mới từ Talent Pool nhận mật khẩu ngẫu nhiên do server sinh (audit 2026-09-24, thay
  // "000000" hardcode) — bắt đổi mật khẩu ngay lần đăng nhập đầu trước khi cho vào app.
  if (profile.must_change_password) {
    return <ResetPasswordScreen forceChange />;
  }

  return (
    <SessionActionsContext.Provider value={{ setStaffSegments: handleSetStaffSegments }}>
    <div className="flex h-screen w-full bg-[var(--surface-base)] text-[var(--text)] overflow-hidden font-sans antialiased selection:bg-[var(--accent)] selection:text-white">
      {/* Left Sidebar Navigation */}
      <AppSidebar
        navGroups={navGroups}
        activeTab={activeTab}
        onSelectTab={(tabId) => {
          setActiveTab(tabId);
          setMobileMenuOpen(false);
        }}
        checkPermission={checkPermission}
        permissionsLoading={phase6Loading}
        sidebarCollapsed={sidebarCollapsed}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
        activeUser={activeUser}
        currentRole={currentRole}
      />

      {/* Main Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center border-b border-[var(--border)] bg-[var(--surface)]/30 pr-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-4 md:hidden text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={toggleSidebar}
            className="hidden md:flex p-2 ml-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/80 hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all"
            title={
              sidebarCollapsed
                ? autoCollapse
                  ? "Mở rộng menu (Ctrl/Cmd + B) — menu tự thu gọn khi cửa sổ hẹp hơn 1440px"
                  : "Mở rộng menu (Ctrl/Cmd + B)"
                : "Thu gọn menu cho rộng chỗ nội dung (Ctrl/Cmd + B)"
            }
            aria-label={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
          <div className="flex-1">
            {helpOpen && (
              <React.Suspense fallback={null}>
                <GlossaryDialog currentRole={currentRole} onClose={() => setHelpOpen(false)} />
              </React.Suspense>
            )}
            <Header
              onOpenHelp={() => setHelpOpen(true)}
              currentRole={currentRole}
              activeUserName={activeUser.name}
              activeUserTitle={activeUser.customRoleTitle}
              onSignOut={signOut}
              // Switcher chỉ hiện cho role được phép nhìn xuyên brand — role "brand" đã bị ép
              // cứng vào effectiveWorkspace của họ (không truyền props này xuống thì Header
              // tự ẩn switcher, xem Header.tsx).
              workspace={
                currentRole === "ceo" || currentRole === "admin" || currentRole === "operations" ? effectiveWorkspace : undefined
              }
              onWorkspaceChange={
                currentRole === "ceo" || currentRole === "admin" || currentRole === "operations"
                  ? handleWorkspaceChange
                  : undefined
              }
              brands={brands}
              notifications={{
                items: notifications.items,
                unreadCount: notifications.unreadCount,
                onMarkRead: notifications.markRead,
                onOpen: handleOpenNotification
              }}
            />
          </div>
        </div>

        {/* Data Load Error Banner — surfaces fetch failures that used to be captured in state
            and never shown anywhere, leaving affected tabs silently empty with no explanation. */}
        {showDataLoadErrorBanner && (
          <div className="bg-red-950/80 border-b border-red-500/30 px-6 py-2.5 text-xs text-red-200 flex flex-wrap items-start justify-between gap-3 shadow-md backdrop-blur-md">
            <div className="flex items-start gap-2">
              <span className="p-1 bg-red-500/20 rounded-lg text-red-400 mt-0.5">
                <ShieldAlert className="w-4 h-4" />
              </span>
              <div>
                <strong className="text-red-300 font-extrabold uppercase block mb-1">
                  Lỗi Tải Dữ Liệu Từ Supabase:
                </strong>
                <ul className="list-disc list-inside space-y-0.5">
                  {dataLoadErrors.map((e) => (
                    <li key={e.key}>{e.message}</li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              onClick={() => setDismissedDataErrorSignature(dataLoadErrorSignature)}
              className="px-3 py-1 bg-red-900/80 hover:bg-red-800 text-red-200 border border-red-500/40 font-bold rounded-lg text-[11px] transition-all shrink-0"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Dynamic View Content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 scrollbar-thin">
          <div className={`mx-auto space-y-6 ${isCalendarModule ? "max-w-none" : "max-w-7xl"}`}>
            {!isTabAllowed && (phase6Loading || pendingBrandSlug) ? (
              /* Mở bằng link /brand/<slug>/… mà brand chưa nạp: tab là của Brand Workspace nhưng workspace
                 chưa đổi — cũng là "chưa biết", chờ như dưới.
                 Ma Trận Phân Quyền CHƯA về — `rolePermissions` còn là {} nên checkPermission()
                 nào cũng false và isTabAllowed false theo. Trước bản vá này người dùng đập thẳng
                 vào màn "Access Restricted ... Status: DENIED" mỗi lần tải trang, kéo dài đúng
                 bằng RTT tới Supabase (đo được ~580ms trên localhost, tệ hơn nhiều trên 4G của
                 host ngoài studio). Đó là một lời nói dối về phân quyền, không phải chậm vô hại.
                 Chưa biết thì im lặng chờ, đừng kết tội. */
              <div className="max-w-2xl mx-auto my-12 space-y-4">
                <div className="h-8 w-1/3 rounded-xl bg-[var(--surface-elevated)]/60 animate-pulse" />
                <div className="h-40 rounded-2xl bg-[var(--surface-elevated)]/60 animate-pulse" />
                <p className="text-xs text-[var(--text-faint)] text-center">Đang kiểm tra quyền truy cập...</p>
              </div>
            ) : !isTabAllowed && phase6Error ? (
              /* Nạp Ma Trận HỎNG THẬT (mất mạng, token hết hạn, RLS đổi). Cũng ra isTabAllowed =
                 false, nhưng nguyên nhân khác hẳn "role bạn không được cấp quyền" — nói đúng
                 nguyên nhân, và cho đường thử lại tại chỗ. Nút "Về Trang Mặc Định" của màn cấm
                 bên dưới vô dụng ở đây: firstAllowedTab cũng tính từ rolePermissions rỗng. */
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center max-w-2xl mx-auto my-12 space-y-5 text-[var(--text)] shadow-2xl">
                <div className="w-16 h-16 bg-red-500/20 text-red-400 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-black text-[var(--text)]">Không tải được Ma Trận Phân Quyền</h2>
                  <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                    Đây KHÔNG phải là bạn bị thu quyền — app chưa đọc được bảng phân quyền nên chưa
                    biết bạn mở được tab nào. Thử lại, hoặc đăng nhập lại nếu phiên đã hết hạn.
                  </p>
                </div>
                <div className="p-4 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-left text-xs font-mono text-[var(--text-muted)] break-words">
                  {phase6Error}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={reloadRolePermissions}
                    className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-black shadow-lg shadow-[var(--accent)]/30 transition-all"
                  >
                    Thử lại
                  </button>
                  <button
                    onClick={() => void signOut()}
                    className="px-4 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] rounded-xl text-xs font-bold transition-all"
                  >
                    Đăng xuất
                  </button>
                </div>
              </div>
            ) : !isTabAllowed ? (
              /* Access Guard Fallback — tới đây thì Ma Trận ĐÃ nạp xong và đúng là role này
                 không được cấp quyền. Chỉ lúc này mới được nói "DENIED". */
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center max-w-2xl mx-auto my-12 space-y-5 text-[var(--text)] shadow-2xl">
                <div className="w-16 h-16 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-8 h-8 animate-bounce" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl font-black text-[var(--text)]">Quyền Truy Cập Bị Hạn Chế (Access Restricted)</h2>
                  <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                    Role hiện tại của bạn (<span className="text-amber-400 font-bold uppercase">{currentRole}</span>) chưa được cấp quyền truy cập tính năng{" "}
                    <strong className="text-[var(--text)]">&quot;{currentTabNavItem?.label ?? activeTab}&quot;</strong>.
                  </p>
                </div>

                <div className="p-4 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-left text-xs font-mono space-y-1 text-[var(--text-muted)]">
                  <div className="text-[var(--text-faint)] font-sans text-[11px] uppercase font-bold">Chi tiết yêu cầu an ninh:</div>
                  {/* Tab không có nav item cho role này thì không có perm key nào để in — nói thẳng là do role,
                      thay vì in "undefined". */}
                  <div>• Permission Required: <span className="text-blue-400">{currentTabNavItem?.perm ?? "không khả dụng cho role này"}</span></div>
                  <div>• Current Role: <span className="text-amber-400">{currentRole}</span></div>
                  <div>• Status: <span className="text-red-400">DENIED</span></div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setActiveTab(firstAllowedTab ?? getDefaultTabForRole(currentRole))}
                    className="px-4 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] rounded-xl text-xs font-bold transition-all"
                  >
                    Về Trang Mặc Định Cho Role
                  </button>

                  {currentRole === "ceo" || currentRole === "admin" ? (
                    <button
                      onClick={() => {
                        setActiveTab("user_settings");
                      }}
                      className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-black shadow-lg shadow-[var(--accent)]/30 transition-all flex items-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Quản Lý Phân Quyền Hợp Lệ (Role Settings)</span>
                    </button>
                  ) : (
                    <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl text-[11px] font-semibold flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Tài khoản hiện tại không thể tự cấp quyền. Vui lòng liên hệ Ban Giám Đốc (CEO).</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // ErrorBoundary riêng cho khu vực nội dung tab (trước đây chỉ có 1 ErrorBoundary ở
              // gốc, main.tsx — lỗi render ở BẤT KỲ tab nào làm trắng cả app, mất luôn sidebar/
              // header). `key={activeTab}` mount lại ErrorBoundary từ đầu mỗi khi đổi tab, nên
              // chuyển sang tab khác luôn thoát khỏi trạng thái lỗi mà không cần logic reset riêng.
              <ErrorBoundary
                key={activeTab}
                fallback={({ resetError }) => (
                  <TabErrorFallback
                    tabLabel={currentTabNavItem?.label ?? activeTab}
                    onRetry={resetError}
                    onGoHome={() => setActiveTab(firstAllowedTab ?? getDefaultTabForRole(currentRole))}
                  />
                )}
              >
              <Suspense fallback={<TabLoading />}>
                {!coreDataReady && !TABS_WITHOUT_CORE_DATA.has(activeTab) ? (
                  <TabLoading />
                ) : (
                <>
                {activeTab === "sessions" && (
                  <SessionLedger
                    variant="agency"
                    sessions={activeSessions}
                    shiftSlots={shiftSlots}
                    excludedSessions={excludedSessions}
                    brands={brands}
                    currentRole={currentRole}
                    myTalentId={activeUser.assignedTalentId}
                    studios={activeStudios}
                    talents={activeTalents}
                    onSubmitSessionReport={handleSubmitSessionReport}
                    onSessionSnapshotApplied={handleSessionReconciled}
                    onUpdateSession={handleUpdateSession}
                    onDeleteSession={handleDeleteSession}
                    onCancelSession={handleCancelSession}
                    onSetSessionExcluded={handleSetSessionExcluded}
                    onRequestDropout={handleRequestDropout}
                    onLogAudit={pushAuditLog}
                  />
                )}

                {activeTab === "calendar" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 w-fit">
                      <button onClick={() => setOpsView("board")} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${opsView === "board" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>Bảng hôm nay / tuần</button>
                      <button onClick={() => setOpsView("calendar")} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${opsView === "calendar" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>Lịch & Studio</button>
                    </div>
                    {/* Việc cần làm — tự sinh từ dữ liệu, mỗi việc một nút tới đúng màn (audit người mới 2026-10-04). */}
                    {opsView === "board" && isOpsRole && (
                      <TodoPanel
                        brands={brands}
                        sessions={activeSessions}
                        shiftSlots={shiftSlots}
                        rates={brandPlatformRates}
                        monthlyReports={monthlyReports}
                        talents={activeTalents}
                        canSeeMoney={currentRole === "ceo" || currentRole === "admin"}
                        canOpenTab={canOpenTab}
                        onOpen={(t) => { if (t.rememberBrandId) { if (t.tab === "crm") requestCrmFocus(t.rememberBrandId, t.rememberPlatform); else rememberBrandId(t.rememberBrandId, t.rememberPlatform); } navigateTo(t.tab, t.brandId); }}
                      />
                    )}
                    {opsView === "board" && (
                      <OpsBoard
                        mode="ops"
                        sessions={activeSessions}
                        shiftSlots={shiftSlots}
                        shiftRegistrations={shiftRegistrations}
                        brands={brands}
                        studios={activeStudios}
                        talents={activeTalents}
                        currentRole={currentRole}
                        myTalentId={activeUser.assignedTalentId}
                        onSubmitSessionReport={handleSubmitSessionReport}
                        onSessionSnapshotApplied={handleSessionReconciled}
                        onUpdateSession={handleUpdateSession}
                        onDeleteSession={handleDeleteSession}
                    onCancelSession={handleCancelSession}
                    onSetSessionExcluded={handleSetSessionExcluded}
                    onRequestDropout={handleRequestDropout}
                    onLogAudit={pushAuditLog}
                        onOpenScheduling={() => setActiveTab("shift_scheduling")}
                        requestOpenSessionId={notifOpenSessionId}
                        onOpenRequestHandled={() => setNotifOpenSessionId(null)}
                      />
                    )}
                    {opsView === "calendar" && (
                  <LiveCalendar
                    sessions={activeSessions}
                    shiftSlots={shiftSlots}
                    shiftRegistrations={shiftRegistrations}
                    studios={activeStudios}
                    talents={activeTalents}
                    brands={brands}
                    brandStudios={brandStudios}
                    onUpdateSession={handleUpdateSession}
                    onCreateSlot={handleCreateShiftSlot}
                    onDeleteSlot={handleDeleteShiftSlot}
                    onRegisterSlot={handleRegisterSlot}
                    onUnregisterSlot={handleUnregisterSlot}
                    onFinalizeSlot={handleFinalizeShiftSlot}
                    myTalentId={activeUser.assignedTalentId}
                    currentUserId={activeUser.id}
                    currentRole={currentRole}
                    schemes={promoSchemes}
                    onSubmitSessionReport={handleSubmitSessionReport}
                    onSessionSnapshotApplied={handleSessionReconciled}
                    onDeleteSession={handleDeleteSession}
                    onCancelSession={handleCancelSession}
                    onSetSessionExcluded={handleSetSessionExcluded}
                    onRequestDropout={handleRequestDropout}
                    onLogAudit={pushAuditLog}
                  />
                    )}
                  </div>
                )}

                {activeTab === "my_shifts" && currentRole === "talent" && (
                  <OpsBoard
                    mode="mine"
                    sessions={activeSessions}
                    shiftSlots={shiftSlots}
                    shiftRegistrations={shiftRegistrations}
                    brands={brands}
                    studios={activeStudios}
                    talents={activeTalents}
                    currentRole={currentRole}
                    myTalentId={activeUser.assignedTalentId}
                    onSubmitSessionReport={handleSubmitSessionReport}
                    onSessionSnapshotApplied={handleSessionReconciled}
                    onOpenScheduling={() => setActiveTab("shift_scheduling")}
                    requestOpenSessionId={notifOpenSessionId}
                    onOpenRequestHandled={() => setNotifOpenSessionId(null)}
                    onRequestDropout={handleRequestDropout}
                  />
                )}

                {activeTab === "shift_scheduling" && (
                  <ShiftScheduling
                    currentRole={currentRole}
                    activeUser={activeUser}
                    sessions={activeSessions}
                    talents={activeTalents}
                    brands={brands}
                    studios={activeStudios}
                    shiftSlots={shiftSlots}
                    shiftRegistrations={shiftRegistrations}
                    onDeleteSlot={handleDeleteShiftSlot}
                    onRegister={handleRegisterSlot}
                    onUnregister={handleUnregisterSlot}
                    onFinalizeSlot={handleFinalizeShiftSlot}
                    onSubmitSessionReport={handleSubmitSessionReport}
                    onUpdateSession={handleUpdateSession}
                    onLogAudit={pushAuditLog}
                    onSessionSnapshotApplied={handleSessionReconciled}
                    onOpenMonthPlan={() => setActiveTab("month_plan")}
                    fatigueWeekHours={engineParams.fatigueWeekHours}
                    onCancelSession={handleCancelSession}
                    onSetSessionExcluded={handleSetSessionExcluded}
                    onRequestDropout={handleRequestDropout}
                  />
                )}

                {activeTab === "month_plan" && (
                  <MonthPlan
                    brands={brands}
                    studios={activeStudios}
                    sessions={activeSessions}
                    shiftSlots={shiftSlots}
                    promoSchemes={promoSchemes}
                    currentUserId={activeUser.id}
                    recurringShiftTemplates={recurringShiftTemplates}
                    onCreateTemplate={handleCreateRecurringTemplate}
                    onToggleTemplate={handleToggleRecurringTemplate}
                    onDeleteTemplate={handleDeleteRecurringTemplate}
                    onPlanLocked={reloadShiftSlots}
                    engineParams={engineParams}
                    brandStudios={brandStudios}
                    onOpenCrm={(brandId, platform) => { requestCrmFocus(brandId, platform); navigateTo("crm"); }}
                    talents={talents}
                  />
                )}

                {activeTab === "live_reconciliation" && (
                  <LiveReconciliation
                    brands={brands}
                    sessions={sessions}
                    onApplied={handleReconciliationApplied}
                    onOpenSession={(id) => { setOpsView("board"); setActiveTab("calendar"); setNotifOpenSessionId(id); }}
                  />
                )}

                {activeTab === "agency_overview" && (
                  <CeoBrief
                    sessions={activeSessions}
                    brands={brands}
                    talents={talents}
                    shiftSlots={shiftSlots}
                    planSlotTargets={planSlotTargets}
                    planMonthTotals={planMonthTotals}
                    financeRecords={financeRecords}
                    brandPlatformRates={brandPlatformRates}
                    brandPlatformRateHistory={brandPlatformRateHistory}
                    talentRateHistory={talentRateHistory}
                    currentRole={currentRole}
                    onNavigate={setActiveTab}
                  />
                )}

                {activeTab === "host_performance" && (
                  <HostPerformance sessions={activeSessions} brands={brands} />
                )}

                {activeTab === "brands_overview" && (
                  <BrandsOverview
                    brands={brands}
                    sessions={activeSessions}
                    brandPlatformRates={brandPlatformRates}
                    monthlyReports={monthlyReports}
                    onNavigate={navigateTo}
                  />
                )}

                {activeTab === "report_publish_board" && (
                  <ReportPublishBoard
                    brands={brands}
                    sessions={activeSessions}
                    brandPlatformRates={brandPlatformRates}
                    planMonthTotals={planMonthTotals}
                    monthlyReports={monthlyReports}
                    onReportsChanged={() => {
                      fetchAllMonthlyReports().then(setMonthlyReports).catch(() => {});
                    }}
                  />
                )}


                {/* Brand Workspace (Giai đoạn A) — mọi tab dưới đây chỉ render khi effectiveWorkspace
                    đang scope theo đúng 1 brand; component con nhận thẳng brandId + data đã lọc sẵn
                    (giữ nguyên pattern fetch-1-lần-ở-App/filter-bằng-useMemo hiện có). */}
                {effectiveWorkspace.type === "brand" && multiPlatform && PLATFORM_TABS[activeTab] && (
                  <PlatformScopeBar platforms={currentBrandPlatforms} value={platformScope} allowAll={PLATFORM_TABS[activeTab] === "all"} onChange={setPlatformScope} />
                )}

                {activeTab === "brand_dashboard" && effectiveWorkspace.type === "brand" && (
                  <BrandDashboard
                    brandId={currentBrandId!}
                    brandName={currentBrandName}
                    platform={platformScope}
                    platforms={currentBrandPlatforms}
                    onPickPlatform={setPlatformScope}
                    sessions={activeSessions}
                    shiftSlots={shiftSlots}
                    promoSchemes={promoSchemes}
                    engineParams={engineParams}
                    currentRole={currentRole}
                    onOpenMonthPlan={() => { rememberBrandId(currentBrandId!, singlePlatform); setWorkspace({ type: "agency" }); setActiveTab("month_plan"); }}
                    onOpenSession={(id) => { setWorkspace({ type: "agency" }); setOpsView("board"); setActiveTab("calendar"); setNotifOpenSessionId(id); }}
                    onOpenSessions={() => setActiveTab("brand_sessions")}
                  />
                )}

                {activeTab === "brand_calendar" && effectiveWorkspace.type === "brand" && (
                  <BrandCalendar
                    brandId={currentBrandId!}
                    brandName={currentBrandName}
                    sessions={activeSessions}
                    platformScope={platformScope}
                    shiftSlots={shiftSlots}
                    shiftRegistrations={shiftRegistrations}
                    studios={activeStudios}
                    brandStudios={brandStudios}
                    talents={activeTalents}
                    schemes={promoSchemes}
                    onAddScheme={handleAddPromoScheme}
                    onUpdateScheme={handleUpdatePromoScheme}
                    onDeleteScheme={handleDeletePromoScheme}
                    currentUserId={activeUser.id}
                    myTalentId={activeUser.assignedTalentId}
                    // P1 (0088): chỉ ops tạo/sửa ca — brand xem lịch, không có nút tạo (RLS 0035 đã gỡ).
                    canEdit={currentRole === "ceo" || currentRole === "operations" || currentRole === "admin"}
                    currentRole={currentRole}
                    onSubmitSessionReport={handleSubmitSessionReport}
                    onSessionSnapshotApplied={handleSessionReconciled}
                    onDeleteSession={handleDeleteSession}
                    onCancelSession={handleCancelSession}
                    onSetSessionExcluded={handleSetSessionExcluded}
                    onLogAudit={pushAuditLog}
                    onUpdateSession={handleUpdateSession}
                    onCreateSlot={handleCreateShiftSlot}
                    onDeleteSlot={handleDeleteShiftSlot}
                    onRegisterSlot={handleRegisterSlot}
                    onUnregisterSlot={handleUnregisterSlot}
                    onFinalizeSlot={handleFinalizeShiftSlot}
                  />
                )}

                {activeTab === "brand_sessions" && effectiveWorkspace.type === "brand" && (
                  <SessionLedger
                    variant="brand"
                    brandId={currentBrandId!}
                    sessions={activeSessions}
                    platformScope={platformScope}
                    shiftSlots={shiftSlots}
                    brands={brands}
                    currentRole={currentRole}
                    onSubmitSessionReport={handleSubmitSessionReport}
                    onSessionSnapshotApplied={handleSessionReconciled}
                  />
                )}

                {activeTab === "brand_skus" && effectiveWorkspace.type === "brand" && (
                  <BrandSkuShowcase
                    brandId={currentBrandId!}
                    currentRole={currentRole}
                    brandSkus={brandSkus}
                    onAddSku={handleAddBrandSku}
                    onUpdateSku={handleUpdateBrandSku}
                    onDeleteSku={handleDeleteBrandSku}
                  />
                )}

                {activeTab === "brand_monthly_report" && effectiveWorkspace.type === "brand" && (
                  <BrandMonthlyReport
                    brandId={currentBrandId!}
                    brandName={currentBrandName}
                    platform={singlePlatform}
                    sessions={activeSessions}
                    currentRole={currentRole}
                    brandPlatformRates={brandPlatformRates}
                    shiftSlots={shiftSlots}
                    planMonthTotals={planMonthTotals}
                    onOpenAdsReport={() => setActiveTab("brand_ads_report")}
                  />
                )}

                {activeTab === "brand_commitment_view" && effectiveWorkspace.type === "brand" && (
                  <BrandCommitmentView
                    brandId={currentBrandId!}
                    brandName={currentBrandName}
                    platform={singlePlatform}
                    multiPlatform={multiPlatform}
                    sessions={activeSessions}
                    currentRole={currentRole}
                    brand={brands.find((b) => b.id === currentBrandId) ?? { id: currentBrandId!, billingModel: "gmv_commission" }}
                    rates={brandPlatformRates}
                    rateHistory={brandPlatformRateHistory}
                  />
                )}

                {activeTab === "brand_next_month_plan" && effectiveWorkspace.type === "brand" && (
                  <BrandNextMonthPlan
                    brandId={currentBrandId!}
                    brandName={currentBrandName}
                    platform={singlePlatform}
                    multiPlatform={multiPlatform}
                    currentRole={currentRole}
                  />
                )}

                {activeTab === "brand_affiliate" && effectiveWorkspace.type === "brand" && (
                  <BrandAffiliateTable
                    brandId={currentBrandId!}
                    brandName={currentBrandName}
                    sessions={activeSessions}
                    currentRole={currentRole}
                    onOpenDataRaw={() => setActiveTab("brand_dataraw")}
                  />
                )}

                {activeTab === "brand_ads_report" && effectiveWorkspace.type === "brand" && currentRole !== "brand" && (
                  <BrandAdsReport
                    brandId={currentBrandId!}
                    brandName={currentBrandName}
                    platform={singlePlatform}
                    multiPlatform={multiPlatform}
                    sessions={activeSessions}
                    currentRole={currentRole}
                  />
                )}

                {activeTab === "brand_dataraw" && effectiveWorkspace.type === "brand" && (
                  <BrandDataRaw
                    brandId={currentBrandId!}
                    brandName={currentBrandName}
                    currentRole={currentRole}
                    sessions={activeSessions}
                    talents={activeTalents}
                    onSessionsChanged={handleReconciliationApplied}
                  />
                )}

                {activeTab === "talents" && (
                  <TalentMatcher
                    currentRole={currentRole}
                    talents={activeTalents}
                    brands={brands}
                    sessions={activeSessions}
                    onCreateTalentAccount={handleCreateTalentAccount}
                    onUpdateTalent={handleUpdateTalent}
                    onDeleteTalent={handleDeleteTalent}
                  />
                )}

                {activeTab === "my_talent_profile" && currentRole === "talent" && (
                  <MyTalentProfile
                    activeUser={activeUser}
                    talents={talents}
                    sessions={activeSessions}
                    /* Thu nhập tháng: CÙNG mảng với Finance & P&L (`sessions`, gồm ca đã loại khỏi báo cáo — vẫn
                       tính công, pnl.ts bỏ phần theo GMV) để hai màn không bao giờ ra hai số. Phần GMV/số ca lũy
                       kế của hồ sơ vẫn đọc activeSessions. */
                    payrollSessions={sessions}
                    financeRecords={financeRecords}
                    talentRateHistory={talentRateHistory}
                    onSaveMyProfile={handleSaveMyTalentProfile}
                  />
                )}

                {activeTab === "studios" && (
                  <StudioEquipment
                    studios={activeStudios}
                    equipments={equipments}
                    sessions={activeSessions}
                    onAddStudio={handleAddStudio}
                    onUpdateStudio={handleUpdateStudio}
                    onDeleteStudio={handleDeleteStudio}
                    onAddEquipment={handleAddEquipment}
                    onUpdateEquipment={handleUpdateEquipment}
                    onDeleteEquipment={handleDeleteEquipment}
                  />
                )}

                {activeTab === "crm" && (
                  <CrmProjects
                    brands={brands}
                    users={users}
                    onAddBrand={handleAddBrand}
                    onUpdateBrand={handleUpdateBrand}
                    onDeleteBrand={handleDeleteBrand}
                    currentRole={currentRole}
                    brandPlatformRates={brandPlatformRates}
                    brandPlatformRateHistory={brandPlatformRateHistory}
                    sessions={activeSessions}
                    onSaveRate={handleSaveBrandPlatformRate}
                    onSaveReturnRate={handleSaveBrandPlatformReturnRate}
                    onSaveCommissionRate={handleSaveBrandPlatformCommissionRate}
                    studios={activeStudios}
                    brandStudios={brandStudios}
                    onSetBrandStudio={handleSetBrandStudio}
                    onOpenMonthPlan={(brandId, platform) => { rememberBrandId(brandId, platform); navigateTo("month_plan"); }}
                  />
                )}

                {activeTab === "tiktok_api" && (
                  <TikTokApiAutomation
                    currentRole={currentRole}
                    tiktokStatus={tiktokStatus}
                    tiktokStatusLoading={tiktokStatusLoading}
                    tiktokStatusError={tiktokStatusError}
                    webhookEvents={tiktokWebhookEvents}
                    onRefreshTikTokStatus={refreshTikTokStatus}
                  />
                )}

                {/* Guard trùng với điều kiện tạo nav item ở nhóm "Tài Chính" — cố ý lặp lại
                    thay vì chỉ dựa vào isTabAllowed, cùng khuôn với ai_training bên dưới. */}
                {activeTab === "finance" && (currentRole === "ceo" || currentRole === "admin") && (
                  <FinanceHr
                    // Audit workflow 2026-10-04 #6: ca "loại khỏi báo cáo" vẫn là ca đã làm — vào lương (pnl.ts tự
                    // bỏ phần theo GMV của nó). Mọi màn phân tích/brand vẫn đọc activeSessions như cũ.
                    sessions={sessions}
                    talents={talents}
                    financeRecords={financeRecords}
                    users={users}
                    brands={brands}
                    brandPlatformRates={brandPlatformRates}
                    talentRateHistory={talentRateHistory}
                    brandPlatformRateHistory={brandPlatformRateHistory}
                    onUpdateFinance={handleUpdateSessionFinance}
                    onSetFinanceApproval={handleSetSessionFinanceApproval}
                  />
                )}


                {activeTab === "ai_training" && currentRole === "admin" && (
                  <div className="space-y-8">
                    <AiTrainingCenter
                      prompts={aiAgentPrompts}
                      loading={aiAgentPromptsLoading}
                      error={aiAgentPromptsError}
                      onUpdate={handleUpdateAiAgentPrompt}
                    />
                    <EngineTrainingPanel
                      brands={brands}
                      sessions={activeSessions}
                      shiftSlots={shiftSlots}
                      promoSchemes={promoSchemes}
                      params={engineParams}
                      updatedAt={engineParamsUpdatedAt}
                      loading={engineParamsLoading}
                      error={engineParamsError}
                      onSave={async (p) => {
                        const r = await saveEngineParams(p, activeUser.id);
                        setEngineParams(r.params);
                        setEngineParamsUpdatedAt(r.updatedAt);
                      }}
                    />
                  </div>
                )}

                {activeTab === "user_settings" && (
                  <UserRoleSettings
                    currentRole={currentRole}
                    currentUserId={activeUser.id}
                    rolePermissions={rolePermissions}
                    onUpdateRolePermissions={handleUpdateRolePermissions}
                    users={users}
                    onAddUser={handleAddUser}
                    onUpdateUser={handleUpdateUser}
                    onDeleteUser={handleDeleteUser}
                    auditLogs={auditLogs}
                    brands={brands}
                    talents={activeTalents}
                  />
                )}

                {activeTab === "account_settings" && (
                  <AccountSettings activeUser={activeUser} onUpdateUser={handleUpdateUser} />
                )}
                </>
                )}
              </Suspense>
              </ErrorBoundary>
            )}
          </div>
        </main>
      </div>
    </div>
    </SessionActionsContext.Provider>
  );
}


// Khung chờ trong lúc tải chunk của tab (lần đầu mở tab; lần sau trình duyệt đã có sẵn).
function TabLoading() {
  return (
    <div className="max-w-5xl mx-auto my-6 space-y-4" aria-busy="true">
      <div className="h-8 w-1/3 rounded-xl bg-[var(--surface-elevated)]/60 animate-pulse" />
      <div className="h-64 rounded-2xl bg-[var(--surface-elevated)]/60 animate-pulse" />
    </div>
  );
}
