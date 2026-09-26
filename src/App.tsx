import React, { useState, useEffect, useMemo } from "react";
import * as Sentry from "@sentry/react";
import { UserRole, LiveSession, PermissionKey, RolePermissionsMap, SystemUser, AuditLogEntry, WorkflowRule, Talent, Studio, Equipment, Brand, SessionFinance, TikTokConnectionStatus, TikTokWebhookEvent, AiAgentPrompt, BrandPlatformRate, BrandStudio, ShiftSlot, ShiftRegistration, RecurringShiftTemplate, TalentRateHistoryEntry, BrandPlatformRateHistoryEntry, BrandSku, PromoScheme, AppNotification, BrandMonthlyReport as BrandMonthlyReportRow } from "./types";
import { TabErrorFallback } from "./components/common/TabErrorFallback";
import { ALL_PERMISSION_DEFINITIONS } from "./data/mockData";
import { fetchTalents, updateTalent, updateMyTalentProfile, deleteTalent } from "./lib/db/talents";
import { fetchStudios, createStudio, updateStudio, deleteStudio } from "./lib/db/studios";
import { fetchEquipments, createEquipment, updateEquipment, deleteEquipment } from "./lib/db/equipments";
import { fetchSessions, createSession, updateSession, deleteSession, completePastSessions, cancelSession, setSessionExcluded } from "./lib/db/sessions";
import { submitSessionReport, SessionReportInput } from "./lib/db/sessionReports";
import { fetchBrands, createBrand, updateBrand, deleteBrand } from "./lib/db/brands";
import { fetchUsers, updateUserProfile, inviteUser, deleteUserAccount, InviteUserPayload } from "./lib/db/users";
import { fetchWorkflowRules, createWorkflowRule, updateWorkflowRule, deleteWorkflowRule } from "./lib/db/workflowRules";
import { fetchAuditLogs, createAuditLog } from "./lib/db/auditLogs";
import { fetchRolePermissions, updateRolePermissions } from "./lib/db/rolePermissions";
import { fetchSessionFinances, upsertSessionFinance, setSessionFinanceApproval } from "./lib/db/finance";
import { fetchTikTokStatus, fetchTikTokWebhookEvents } from "./lib/db/tiktokIntegration";
import { fetchAiAgentPrompts, updateAiAgentPrompt } from "./lib/db/aiAgentPrompts";
import { fetchBrandPlatformRates, upsertBrandPlatformCommissionRate, upsertBrandPlatformRate, upsertBrandPlatformReturnRate } from "./lib/db/brandPlatformRates";
import { fetchBrandStudios, setBrandStudio } from "./lib/db/brandStudios";
import { fetchShiftSlots, createShiftSlot, updateShiftSlot, deleteShiftSlot } from "./lib/db/shiftSlots";
import { fetchShiftRegistrations, registerForSlot, unregisterFromSlot } from "./lib/db/shiftRegistrations";
import {
  fetchRecurringShiftTemplates,
  createRecurringShiftTemplate,
  updateRecurringShiftTemplate,
  deleteRecurringShiftTemplate
} from "./lib/db/recurringShiftTemplates";
import { fetchTalentRateHistory } from "./lib/db/talentRateHistory";
import { fetchBrandPlatformRateHistory } from "./lib/db/brandPlatformRateHistory";
import { fetchBrandSkus, createBrandSku, updateBrandSku, deleteBrandSku } from "./lib/db/brandSkus";
import { fetchPromoSchemes, createPromoScheme, updatePromoScheme, deletePromoScheme } from "./lib/db/promoSchemes";
import { applyAllocatedTargets } from "./lib/performance/targetAllocation";
import { withEffectiveStatus } from "./lib/sessionStatus";
import { fetchAllMonthlyReports } from "./lib/db/monthlyReports";
import { fetchLockedPlanTargets } from "./lib/db/monthPlans";
import { errorMessage } from "./lib/errorMessage";
import { requestShiftDropout } from "./lib/db/notifications";
import {
  BookOpen,
  FileText,
  Users,
  Building2,
  Briefcase,
  Link2,
  DollarSign,
  Menu,
  X,
  Calendar as CalendarIcon,
  ShieldCheck,
  Lock,
  ShieldAlert,
  BrainCircuit,
  UserCog,
  CalendarClock,
  CalendarRange,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Database,
  ClipboardCheck,
  TrendingUp,
  LayoutDashboard,
  Gauge,
  FileSignature,
  Radio,
  Megaphone,
  CalendarCheck2,
  Tag,
  LayoutGrid,
  Send
} from "lucide-react";
import { Header, WorkspaceContext } from "./components/Header";
import { BrandCalendar } from "./components/brand-workspace/BrandCalendar";
import { BrandSkuShowcase } from "./components/brand-workspace/BrandSkuShowcase";
import { BrandMonthlyReport } from "./components/brand-workspace/BrandMonthlyReport";
import { BrandAdsReport } from "./components/brand-workspace/BrandAdsReport";
import { BrandCommitmentView } from "./components/brand-workspace/BrandCommitmentView";
import { BrandAffiliateTable } from "./components/brand-workspace/BrandAffiliateTable";
import { BrandNextMonthPlan } from "./components/brand-workspace/BrandNextMonthPlan";
import { BrandRateCard } from "./components/BrandRateCard";
import { BrandDataRaw } from "./components/brand-workspace/BrandDataRaw";
import { Login } from "./components/Login";
import { ResetPasswordScreen } from "./components/ResetPasswordScreen";
import { AccountSettings } from "./components/AccountSettings";
import { MyTalentProfile } from "./components/MyTalentProfile";
import { useAuth } from "./hooks/useAuth";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useToast } from "./hooks/useToast";
import { useNotifications } from "./hooks/useNotifications";
import { SessionLedger } from "./components/SessionLedger";
import { LiveCalendar } from "./components/LiveCalendar";
import { TalentMatcher, NewTalentAccountPayload } from "./components/TalentMatcher";
import { StudioEquipment } from "./components/StudioEquipment";
import { CrmProjects } from "./components/CrmProjects";
import { TikTokApiAutomation } from "./components/TikTokApiAutomation";
import { FinanceHr } from "./components/FinanceHr";
import { AiMultiAgent } from "./components/AiMultiAgent";
import { UserRoleSettings } from "./components/UserRoleSettings";
import { AiTrainingCenter } from "./components/AiTrainingCenter";
import { EngineTrainingPanel } from "./components/EngineTrainingPanel";
import { OpsBoard } from "./components/OpsBoard";
import { fetchEngineParams, saveEngineParams } from "./lib/db/engineParams";
import { DEFAULT_ENGINE_PARAMS, EngineParams } from "./lib/scheduling/engineParams";
import ShiftScheduling from "./components/ShiftScheduling";
import MonthPlan from "./components/MonthPlan";
import OpsSupport from "./components/OpsSupport";
import { LiveReconciliation } from "./components/LiveReconciliation";
import { HostPerformance } from "./components/HostPerformance";
import { BrandsOverview } from "./components/BrandsOverview";
import CeoBrief from "./components/CeoBrief";
import { ReportPublishBoard } from "./components/ReportPublishBoard";
import { BrandCommitment } from "./components/BrandCommitment";

const STORAGE_PREFIX = "liveops_os_v2_";

// Các tab mà nội dung chính là lưới lịch — vào là tự thu gọn sidebar để lấy chiều ngang
// (lưới 7 cột / ma trận 5 khung giờ cần ~150px mỗi ô, xem WORKSPACE_DESIGN.md).
const CALENDAR_TABS = new Set(["calendar", "brand_calendar", "shift_scheduling"]);

// Tab render được nhưng cố ý KHÔNG nằm trong sidebar (vào từ menu user ở Header). Phải khai
// báo ở đây vì isTabAllowed coi "không có nav item" là không được phép.
const TABS_WITHOUT_NAV_ITEM = new Set(["account_settings"]);

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

// Tab mặc định khi đăng nhập/đổi user, theo role — module Dashboard đã bị xoá (chờ chốt
// cấu trúc data raw để build lại), nên không còn tab "dashboard"/"brand_dashboard" nào để về.
//
// Talent KHÔNG về "sessions": tab đó gate bằng manage_sessions mà talent không có, nên tài khoản
// talent vừa đăng nhập đã đập ngay vào màn "Quyền Truy Cập Bị Hạn Chế" (bắt được khi verify chuông
// thông báo bằng tài khoản talent thật, 2026-09-18). Về "shift_scheduling" — màn duy nhất talent
// thật sự làm việc, và cũng là nơi mọi thông báo trỏ tới.
//
// ceo/admin/operations về "Đăng Ký & Chốt Lịch" (audit Module 2, 2026-09-18): vòng việc hằng ngày
// của ops — mở ca, chốt, cam kết còn thiếu bao nhiêu giờ, up snapshot, report — đều nằm ở đó.
// "Sổ Ca" (SessionLedger, thay Live Sessions Hub thời demo ngày 2026-09-19) là màn tra cứu từng
// ca đã chạy + việc còn thiếu để chốt tháng — không phải màn "hôm nay phải làm gì".
interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm: PermissionKey | undefined;
  badge?: string;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

function getDefaultTabForRole(role: UserRole): string {
  if (role === "brand") return "brand_calendar";
  if (role === "talent") return "my_shifts";
  return "calendar";
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

  // Chuông thông báo (migration 0083) — chỉ poll khi đã có profile; đổi user thì hook tự nạp lại
  // vì RLS lọc theo auth.uid() của phiên hiện tại.
  const notifications = useNotifications(!!profile);
  // "shift_scheduling" chỉ là fallback cho lần đầu mở app khi chưa biết role (localStorage rỗng);
  // role thật được set lại ngay bằng getDefaultTabForRole() khi profile load xong (bên dưới).
  const [activeTab, setActiveTab] = useState<string>(() => loadStorage("activeTab", "shift_scheduling"));
  // Bảng Vận Hành (2026-09-21): "board" = hôm nay/tuần + việc còn thiếu; "calendar" = Lịch & Studio cũ.
  const [opsView, setOpsView] = useState<"board" | "calendar">(() => loadStorage("opsView", "board"));
  // Q4: ca cần mở sau khi bấm thông báo (OpsBoard tiêu thụ rồi xoá).
  const [notifOpenSessionId, setNotifOpenSessionId] = useState<string | null>(null);
  useEffect(() => saveStorage("opsView", opsView), [opsView]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Thu gọn sidebar thành thanh icon (w-16) để nhường không gian ngang cho calendar.
  // Chỉ áp dụng từ breakpoint md trở lên — dưới md sidebar vẫn là drawer trượt như cũ.
  //
  // 3 mảnh state:
  //  - `sidebarPref`: lựa chọn tay của user cho các module KHÔNG có lịch (persist).
  //  - `sidebarCollapsed`: trạng thái thật đang render = tự thu gọn trong module có lịch,
  //    ngoài ra trả về đúng `sidebarPref`.
  const [sidebarPref, setSidebarPref] = useState<boolean>(() => loadStorage("sidebarCollapsed", false));
  useEffect(() => saveStorage("sidebarCollapsed", sidebarPref), [sidebarPref]);

  const isCalendarModule = CALENDAR_TABS.has(activeTab);
  // Màn 768–1279px (laptop nhỏ, chia đôi màn hình): sidebar mở 256px ăn ~1/3 bề ngang, bảng bị cắt
  // (audit UX 2026-09-26: ở ~800px nội dung còn ~535px). Tự thu gọn như module lịch.
  const isWideScreen = useMediaQuery("(min-width: 1280px)");
  const autoCollapse = isCalendarModule || !isWideScreen;

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(sidebarPref);
  // Vào module có lịch (hoặc màn hẹp) → tự thu gọn; rời đi → trả lại đúng lựa chọn tay của user.
  // Nếu user tự mở lại sidebar khi đang tự thu gọn thì effect này không chạy
  // (deps không đổi) nên tôn trọng thao tác đó cho tới lần chuyển module/cỡ màn kế tiếp.
  useEffect(() => {
    setSidebarCollapsed(autoCollapse ? true : sidebarPref);
  }, [autoCollapse, sidebarPref]);

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      // Chỉ ghi đè lựa chọn mặc định khi không ở chế độ tự thu gọn — thao tác tay trong
      // module lịch / màn hẹp chỉ có tác dụng tạm thời, không đổi mặc định của user.
      if (!autoCollapse) setSidebarPref(next);
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

  // Giai đoạn A — Workspace Agency ↔ Brand (xem WORKSPACE_DESIGN.md). Chỉ có ý nghĩa với
  // ceo/admin/operations (những role được phép nhìn xuyên brand); role "brand" tự khoá vào
  // đúng 1 brand của họ ở effectiveWorkspace bên dưới, không dùng state raw này.
  const [workspace, setWorkspace] = useState<WorkspaceContext>(() =>
    loadStorage<WorkspaceContext>("workspace", { type: "agency" })
  );
  useEffect(() => saveStorage("workspace", workspace), [workspace]);

  // Role Permissions Matrix — real data from Supabase `role_permissions` (Phase 6), no mock/localStorage fallback
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>({} as RolePermissionsMap);
  const [phase6Loading, setPhase6Loading] = useState(true);
  const [phase6Error, setPhase6Error] = useState<string | null>(null);

  // Session Finance (P&L per completed session) — real data from Supabase `session_finance` (Phase 7), no mock fallback
  const [financeRecords, setFinanceRecords] = useState<SessionFinance[]>([]);
  const [phase7Error, setPhase7Error] = useState<string | null>(null);

  // TikTok Shop Partner API connection status + webhook log (Phase 9), no mock fallback
  const [tiktokStatus, setTiktokStatus] = useState<TikTokConnectionStatus | null>(null);
  const [tiktokStatusLoading, setTiktokStatusLoading] = useState(true);
  const [tiktokStatusError, setTiktokStatusError] = useState<string | null>(null);
  const [tiktokWebhookEvents, setTiktokWebhookEvents] = useState<TikTokWebhookEvent[]>([]);

  // AI Training Center prompts — real data from Supabase `ai_agent_prompts` (Giai đoạn 13),
  // admin-only (RLS blocks read/write for every other role, incl. ceo). Only fetched for
  // an admin session so non-admin users never see a 403 flash for a tab they can't reach.
  const [aiAgentPrompts, setAiAgentPrompts] = useState<AiAgentPrompt[]>([]);
  const [aiAgentPromptsLoading, setAiAgentPromptsLoading] = useState(true);
  const [aiAgentPromptsError, setAiAgentPromptsError] = useState<string | null>(null);

  // Workflow Rules / Audit Logs — real data from Supabase (Phase 5), no mock fallback
  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [phase5Error, setPhase5Error] = useState<string | null>(null);

  // System Users — real data from Supabase `profiles` (Phase 4), no mock fallback
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [phase4Error, setPhase4Error] = useState<string | null>(null);

  // Talents / Studios / Equipments — real data from Supabase (Phase 1), no mock fallback
  const [talents, setTalents] = useState<Talent[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [phase1Loading, setPhase1Loading] = useState(true);
  const [phase1Error, setPhase1Error] = useState<string | null>(null);

  // Live Sessions — real data from Supabase (Phase 2), no mock fallback
  const [rawSessions, setSessions] = useState<LiveSession[]>([]);
  // Target GMV từng ca phân bổ TỪ TRÊN XUỐNG theo kế hoạch tháng của brand (user chốt 2026-09-18,
  // xem lib/performance/targetAllocation.ts) — ghi đè `targetGmv` lưu trong DB (vốn là GMV trung
  // bình của host, sai bản chất) ở đúng MỘT chỗ này, mọi màn hình bên dưới nhận `sessions` đã
  // đúng. Tháng/brand chưa có kế hoạch thì giữ số DB.
  const [monthlyReports, setMonthlyReports] = useState<Map<string, BrandMonthlyReportRow>>(new Map());
  // Target/ca từ Kế Hoạch Tháng đã chốt (0090): khoá shift_slot id → nối qua shift_slots.session_id
  // thành khoá session id cho applyAllocatedTargets. Nạp cùng lúc với shift_slots, nạp lại sau mỗi chốt.
  // (khai báo sớm hơn nhóm state Giai đoạn 14 vì useMemo ngay dưới đọc nó)
  const [shiftSlots, setShiftSlots] = useState<ShiftSlot[]>([]);
  const [planTargetsBySlotId, setPlanTargetsBySlotId] = useState<Map<string, number>>(new Map());
  // "brandId|YYYY-MM" → tổng target đã chốt của tháng (Đ5). Nguồn sự thật cho câu hỏi "tháng này
  // cam kết bao nhiêu", KHÔNG cộng ngược từ targetGmv của các ca đang tồn tại — ca kế hoạch chưa
  // chốt người thì chưa có live_session, cộng ngược sẽ ra thiếu.
  const [planMonthTotals, setPlanMonthTotals] = useState<Map<string, number>>(new Map());
  // Tham số engine Kế Hoạch Tháng (0095) — nạp cùng Phase 14; lỗi thì dùng mặc định, không chặn app.
  const [engineParams, setEngineParams] = useState<EngineParams>(DEFAULT_ENGINE_PARAMS);
  const [engineParamsUpdatedAt, setEngineParamsUpdatedAt] = useState<string | null>(null);
  const [engineParamsError, setEngineParamsError] = useState<string | null>(null);
  const [engineParamsLoading, setEngineParamsLoading] = useState(false);
  const planTargetsBySessionId = useMemo(() => {
    const out = new Map<string, number>();
    if (planTargetsBySlotId.size === 0) return out;
    for (const sl of shiftSlots) {
      if (sl.sessionId && planTargetsBySlotId.has(sl.id)) out.set(sl.sessionId, planTargetsBySlotId.get(sl.id)!);
    }
    return out;
  }, [planTargetsBySlotId, shiftSlots]);
  // Trạng thái hiển thị theo giờ thật (0096): tick mỗi phút để "Đang live"/"Đã xong" tự đổi khi mở lâu.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const sessions = useMemo(
    () => applyAllocatedTargets(withEffectiveStatus(rawSessions, nowMs), monthlyReports, planTargetsBySessionId, planMonthTotals),
    [rawSessions, nowMs, monthlyReports, planTargetsBySessionId, planMonthTotals]
  );
  // Kế hoạch tháng được sửa ở Report Tháng (Tab 05) mà App không nhận callback — nạp lại mỗi khi
  // đổi tab là đủ, bảng nhỏ và target chỉ cần đúng khi người dùng nhìn sang màn khác.
  useEffect(() => {
    if (!session) return;
    fetchAllMonthlyReports().then(setMonthlyReports).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Brands — real data from Supabase (Phase 3), no mock fallback
  const [brands, setBrands] = useState<Brand[]>([]);
  const [phase3Error, setPhase3Error] = useState<string | null>(null);

  // Đăng ký & Chốt Lịch Host — real data from Supabase `brand_platform_rates`/`shift_slots`/
  // `session_availability` (Giai đoạn 14a), no mock fallback.
  const [brandPlatformRates, setBrandPlatformRates] = useState<BrandPlatformRate[]>([]);
  // Phòng live mặc định brand × nền tảng (0098) — chốt kế hoạch ghi vào ca, form mở ca chọn sẵn.
  const [brandStudios, setBrandStudios] = useState<BrandStudio[]>([]);
  const [shiftRegistrations, setShiftRegistrations] = useState<ShiftRegistration[]>([]);
  const [recurringShiftTemplates, setRecurringShiftTemplates] = useState<RecurringShiftTemplate[]>([]);
  const [phase14Error, setPhase14Error] = useState<string | null>(null);


  // Rate Card Versioning (Giai đoạn 19) — lịch sử rate theo thời gian, ghi tự động bởi DB
  // trigger (migration 0018). Chỉ đọc, dùng để tra rate đúng tại ngày của session cũ ở
  // FinanceHr.tsx thay vì đọc giá trị hiện tại của talents/brandPlatformRates.
  const [talentRateHistory, setTalentRateHistory] = useState<TalentRateHistoryEntry[]>([]);
  const [brandPlatformRateHistory, setBrandPlatformRateHistory] = useState<BrandPlatformRateHistoryEntry[]>([]);
  const [phase19Error, setPhase19Error] = useState<string | null>(null);

  // Giai đoạn B1 — SKU Showcase & Hero Product Catalog (Brand Workspace, xem
  // WORKSPACE_DESIGN.md#6). Fetch 1 lần ở agency-level, mỗi Brand Workspace
  // tự filter theo brandId.
  const [brandSkus, setBrandSkus] = useState<BrandSku[]>([]);
  const [phaseB1Error, setPhaseB1Error] = useState<string | null>(null);
  // Giai đoạn C3 — Scheme khuyến mãi tích hợp Calendar. Áp dụng theo khoảng ngày, agency-wide.
  const [promoSchemes, setPromoSchemes] = useState<PromoScheme[]>([]);
  const [phaseC3Error, setPhaseC3Error] = useState<string | null>(null);

  // Giai đoạn C4 — Price List Import (SKU pricing theo platform, Brand Workspace).

  // Previously these fetch errors were only stored in state and never rendered anywhere — a
  // failed fetch left a tab silently empty forever with no indication anything went wrong.
  const [dismissedDataErrorSignature, setDismissedDataErrorSignature] = useState<string | null>(null);

  // 2026-09-24 (#5 ESLint): mọi effect nạp dữ liệu dưới đây khoá theo ID người đăng nhập, KHÔNG theo
  // object `session`. Supabase làm mới access token mỗi ~1h và trả về một object session MỚI với cùng
  // user id — dep theo cả object là bật lại đúng vòng refetch toàn bộ ~13 cụm dữ liệu mỗi giờ mà đợt
  // audit Phần 1 vừa dập. Trước đây thân effect guard bằng `if (!session)` nên `exhaustive-deps` đòi
  // thêm `session` vào dep (12 lỗi); guard bằng chính `authUserId` thì rule hết đòi mà hành vi y nguyên
  // — `authUserId` truthy đúng khi và chỉ khi có session kèm user.
  const authUserId = session?.user?.id;

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    setPhase1Loading(true);
    Promise.all([fetchTalents(), fetchStudios(), fetchEquipments()])
      .then(([t, s, e]) => {
        if (cancelled) return;
        setTalents(t);
        setStudios(s);
        setEquipments(e);
        setPhase1Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase1Error(err.message ?? "Không tải được dữ liệu Talent/Studio/Equipment từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase1Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    fetchAllMonthlyReports().then((m) => { if (!cancelled) setMonthlyReports(m); }).catch(() => {});
    // 0096: đóng ca đã qua giờ trước khi nạp — không chặn nếu RPC lỗi.
    completePastSessions()
      .catch(() => 0)
      .then(() => fetchSessions())
      .then((s) => {
        if (cancelled) return;
        setSessions(s);
        setSessionsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setSessionsError(err.message ?? "Không tải được dữ liệu Live Sessions từ Supabase.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    fetchBrands()
      .then((b) => {
        if (cancelled) return;
        setBrands(b);
        setPhase3Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase3Error(err.message ?? "Không tải được dữ liệu Brand từ Supabase.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    // Chỉ 2 màn đọc danh sách này — Phân Quyền & Role và CRM — và cả hai đều gate ở ops.
    if (!isOpsRole) return;
    let cancelled = false;
    fetchUsers()
      .then((u) => {
        if (cancelled) return;
        setUsers(u);
        setPhase4Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase4Error(err.message ?? "Không tải được danh sách tài khoản người dùng từ Supabase.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, isOpsRole]);

  useEffect(() => {
    if (!authUserId) return;
    // Cả 2 bảng đã khoá ở ceo/operations/admin trong migration 0105.
    if (!isOpsRole) return;
    let cancelled = false;
    Promise.all([fetchWorkflowRules(), fetchAuditLogs()])
      .then(([w, a]) => {
        if (cancelled) return;
        setWorkflowRules(w);
        setAuditLogs(a);
        setPhase5Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase5Error(err.message ?? "Không tải được Workflow Rules/Audit Logs từ Supabase.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, isOpsRole]);

  // Ma Trận Phân Quyền là thứ DUY NHẤT quyết định tab nào mở được, nên fetch hỏng ở đây không
  // được để người dùng kẹt: `permissionsNonce` cho nút "Thử lại" chạy lại đúng effect này mà
  // không phải F5 (F5 sẽ kéo lại cả 54 request của lần tải trang).
  const [permissionsNonce, setPermissionsNonce] = useState(0);
  const reloadRolePermissions = React.useCallback(() => setPermissionsNonce((n) => n + 1), []);
  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    setPhase6Loading(true);
    fetchRolePermissions()
      .then((map) => {
        if (cancelled) return;
        setRolePermissions(map);
        setPhase6Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase6Error(errorMessage(err, "Không tải được Ma Trận Phân Quyền Role từ Supabase."));
      })
      .finally(() => {
        if (!cancelled) setPhase6Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, permissionsNonce]);

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    // Tham số engine gợi ý lịch — chỉ màn Kế Hoạch Tháng / Hỗ Trợ Vận Hành dùng (ops). Khoá ở
    // ceo/operations/admin trong 0105, nên role khác gọi cũng chỉ nhận về rỗng.
    if (isOpsRole) {
      setEngineParamsLoading(true);
      fetchEngineParams()
        .then((r) => { if (cancelled) return; setEngineParams(r.params); setEngineParamsUpdatedAt(r.updatedAt); setEngineParamsError(null); })
        .catch((e) => { if (!cancelled) setEngineParamsError(`Không tải được tham số engine (dùng mặc định): ${errorMessage(e)}`); })
        .finally(() => { if (!cancelled) setEngineParamsLoading(false); });
    }
    Promise.all([fetchBrandPlatformRates(), fetchShiftSlots(), fetchShiftRegistrations(), fetchRecurringShiftTemplates(), fetchLockedPlanTargets().catch(() => ({ bySlotId: new Map<string, number>(), monthTotals: new Map<string, number>() })), fetchBrandStudios().catch(() => [] as BrandStudio[])])
      .then(([rates, slots, regs, templates, planTargets, bStudios]) => {
        if (cancelled) return;
        setBrandPlatformRates(rates);
        setBrandStudios(bStudios);
        setShiftSlots(slots);
        setShiftRegistrations(regs);
        setRecurringShiftTemplates(templates);
        setPlanTargetsBySlotId(planTargets.bySlotId);
        setPlanMonthTotals(planTargets.monthTotals);
        setPhase14Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase14Error(err.message ?? "Không tải được dữ liệu Đăng Ký & Chốt Lịch Host từ Supabase.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, isOpsRole]);

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    Promise.all([fetchTalentRateHistory(), fetchBrandPlatformRateHistory()])
      .then(([talentHistory, brandHistory]) => {
        if (cancelled) return;
        setTalentRateHistory(talentHistory);
        setBrandPlatformRateHistory(brandHistory);
        setPhase19Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase19Error(err.message ?? "Không tải được Lịch Sử Rate Card từ Supabase.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    fetchSessionFinances()
      .then((f) => {
        if (cancelled) return;
        setFinanceRecords(f);
        setPhase7Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase7Error(err.message ?? "Không tải được dữ liệu Finance & HR từ Supabase.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    fetchBrandSkus()
      .then((skus) => {
        if (cancelled) return;
        setBrandSkus(skus);
        setPhaseB1Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhaseB1Error(err.message ?? "Không tải được SKU Showcase từ Supabase.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    fetchPromoSchemes()
      .then((schemes) => {
        if (cancelled) return;
        setPromoSchemes(schemes);
        setPhaseC3Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhaseC3Error(err.message ?? "Không tải được Scheme khuyến mãi từ Supabase.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId || currentRole !== "admin") {
      setAiAgentPromptsLoading(false);
      return;
    }
    let cancelled = false;
    setAiAgentPromptsLoading(true);
    fetchAiAgentPrompts()
      .then((p) => {
        if (cancelled) return;
        setAiAgentPrompts(p);
        setAiAgentPromptsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAiAgentPromptsError(err.message ?? "Không tải được AI Training Center từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setAiAgentPromptsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, currentRole]);

  async function handleUpdateAiAgentPrompt(agentKey: string, systemPrompt: string) {
    const updated = await updateAiAgentPrompt(agentKey, systemPrompt);
    setAiAgentPrompts((prev) => prev.map((p) => (p.agentKey === agentKey ? updated : p)));
  }

  const refreshTikTokStatus = () => {
    if (!authUserId) return;
    setTiktokStatusLoading(true);
    Promise.all([fetchTikTokStatus(), fetchTikTokWebhookEvents()])
      .then(([status, events]) => {
        setTiktokStatus(status);
        setTiktokWebhookEvents(events);
        setTiktokStatusError(null);
      })
      .catch((err) => {
        setTiktokStatusError(err.message ?? "Không tải được trạng thái kết nối TikTok.");
      })
      .finally(() => setTiktokStatusLoading(false));
  };

  useEffect(() => {
    if (!authUserId) return;
    refreshTikTokStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  async function handleUpdateSessionFinance(
    sessionId: string,
    patch: Partial<Pick<SessionFinance, "agencyCommissionRate" | "studioCost" | "adsCost" | "notes">>
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
    setActiveTab(getDefaultTabForRole(profile.role));
    setWorkspace({ type: "agency" });
  }, [profile?.id, profile?.role]);

  // Live Sessions are real Supabase data now (Phase 2) — no mock filtering applies
  const rawActiveSessions = sessions;
  // Brands/Talents/Studios/Equipments are real Supabase data now — no mock filtering applies
  const rawActiveBrands = brands;
  const rawActiveTalents = talents;
  const rawActiveStudios = studios;
  const rawActiveEquipments = equipments;
  // Workflow Rules/Audit Logs are real Supabase data now (Phase 5) — no mock filtering applies
  const activeWorkflowRules = workflowRules;
  const activeAuditLogs = auditLogs;
  // Users are real Supabase data now (Phase 4) — no mock filtering applies
  const activeUsers = users;

  // 2. DERIVED DATA: Studio equipment count calculated directly from equipment list assignments
  const activeStudios = useMemo(() => {
    return rawActiveStudios.map((s) => {
      const assignedEquips = rawActiveEquipments.filter(
        (e) => e.assignedStudioId === s.id || e.assignedStudioName?.toLowerCase() === s.name?.toLowerCase()
      );
      return {
        ...s,
        equipmentCount: assignedEquips.length
      };
    });
  }, [rawActiveStudios, rawActiveEquipments]);

  // 3. DERIVED DATA: Talent availability status dynamically updated based on active live sessions
  const activeTalents = useMemo(() => {
    return rawActiveTalents.map((t) => {
      const isLiveNow = rawActiveSessions.some(
        (s) => (s.hostId === t.id || s.hostName?.toLowerCase() === t.name?.toLowerCase()) && s.status === "Live Now"
      );
      const isUpcoming = rawActiveSessions.some(
        (s) => (s.hostId === t.id || s.hostName?.toLowerCase() === t.name?.toLowerCase()) && s.status === "Upcoming"
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
  }, [rawActiveTalents, rawActiveSessions]);

  // Đ10/0114: ca đã "loại khỏi báo cáo" bị chặn ĐÚNG MỘT LẦN ở đây. Mọi màn cộng số (Report Tháng,
  // Hiệu Suất Host, cam kết giờ, P&L, Toàn Cảnh Brand…) nhận `activeSessions`, nên không màn nào
  // phải tự nhớ lọc — đúng loại lỗi sẽ quên ở màn thứ tư. Chỉ Sổ Ca nhận mảng thô (`sessions`) để
  // ops còn tìm lại và bỏ cờ; không có đường đó thì cờ là một chiều.
  const activeSessions = useMemo(() => rawActiveSessions.filter((s) => !s.excludedFromReports), [rawActiveSessions]);
  // Chỉ Sổ Ca nhận danh sách này (prop riêng, không trộn vào `sessions`) — xem SessionLedger.
  const excludedSessions = useMemo(() => rawActiveSessions.filter((s) => s.excludedFromReports), [rawActiveSessions]);
  const activeBrands = rawActiveBrands;
  const activeEquipments = rawActiveEquipments;

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
        lastLogin: profile.last_login ?? "",
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
        lastLogin: ""
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
      if (workspace.type === "brand" && !phase1Loading && !brands.some((b) => b.id === workspace.brandId)) {
        return { type: "agency" };
      }
      return workspace;
    }
    return { type: "agency" };
  }, [currentRole, workspace, activeUser.assignedBrandId, phase1Loading, brands]);
  const currentBrandId = effectiveWorkspace.type === "brand" ? effectiveWorkspace.brandId : undefined;

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

  // Chốt lịch: sinh 1 live_session thật từ slot đã đăng ký, rồi đánh dấu slot "finalized"
  // và lưu lại session_id để tra ngược — cả 2 bước cần thành công thì mới coi là xong.
  //
  // FIX M5 (audit 2026-08-21): 2 bước ghi vào 2 bảng khác nhau (live_sessions rồi shift_slots)
  // không có transaction chung — nếu bước update slot lỗi sau khi session đã tạo xong, session
  // đó mồ côi (không slot nào trỏ tới) và bấm chốt lại sẽ tạo thêm 1 session trùng. Sửa bằng
  // compensating action: nếu update slot lỗi, xoá luôn session vừa tạo trước khi báo lỗi, để
  // trạng thái DB quay lại y như trước khi bấm chốt — bấm lại sau đó không sinh trùng. Không dùng
  // 1 RPC chung như update_session_with_children (0007) vì insert session cần replicate toàn bộ
  // cột + child rows (skus/checklist/metrics) sang SQL, rủi ro lệch cao hơn lợi ích ở đây.
  const handleFinalizeShiftSlot = async (slot: ShiftSlot, hostId: string, coHostId: string | null): Promise<boolean> => {
    const brand = brands.find((b) => b.id === slot.brandId);
    const studio = studios.find((s) => s.id === slot.studioId);
    const host = talents.find((t) => t.id === hostId);
    const coHost = coHostId ? talents.find((t) => t.id === coHostId) : undefined;

    const newSession: LiveSession = {
      id: `session-${Date.now()}`,
      title: `${brand?.name ?? slot.brandName} - ${slot.date} ${slot.startTime}`,
      brandId: slot.brandId ?? "",
      brandName: brand?.name ?? slot.brandName,
      shopTikTokHandle: `@${(brand?.name ?? slot.brandName).toLowerCase().replace(/\s+/g, "") || "shop"}_official`,
      // Ca mới chốt, chỉ ops mới tới được đây — cờ của view 0107 không áp dụng cho đường ghi.
      monthPublished: true,
      studioId: slot.studioId ?? "",
      studioName: studio?.name ?? slot.studioName,
      hostId,
      hostName: host?.name ?? "",
      assistantName: "",
      // Caller diễn đạt "không có trợ live" bằng null, LiveSession.coHostId lại là optional
      // (string | undefined) — quy về undefined để sessionToDb() ghi null đúng một đường.
      coHostId: coHostId ?? undefined,
      coHostName: coHost?.name ?? "",
      platform: slot.platform,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: "Upcoming",
      // rate.ratePerHour ở đây là đơn giá AGENCY THU CỦA BRAND theo giờ (brand_platform_rates,
      // dùng cho billingModel="hourly") — không phải mục tiêu doanh số GMV của phiên live, nên
      // dùng nó làm target sai đơn vị: brand tính %GMV thì ratePerHour = 0 nên target luôn 0,
      // brand tính theo giờ thì hiện ra đúng doanh thu agency chứ không phải GMV. Dùng GMV trung
      // bình/phiên TÍNH THẬT từ live_sessions của host (Bước 1 tái cấu trúc data — không còn dùng
      // talents.avgGmvPerSession, số nhập tay không đáng tin, xem src/lib/metrics/avgGmv.ts).
      // Target không còn gán theo host lúc chốt (user chốt 2026-09-18): ghi 0, App phân bổ từ kế
      // hoạch tháng của brand xuống từng ca lúc đọc (applyAllocatedTargets). Tháng chưa có kế
      // hoạch thì ca đơn giản là chưa có target — không bịa số từ phong độ cũ của host.
      targetGmv: 0,
      actualGmv: 0,
      totalOrders: 0,
      avgWatchTimeSeconds: 0,
      peakViewers: 0,
      totalViews: 0,
      ctrAvg: 0,
      cvrAvg: 0,
      skus: [],
      checklist: [],
      minuteMetrics: []
    };

    let created: LiveSession | undefined;
    try {
      created = await createSession(newSession);
      const updatedSlot = await updateShiftSlot({ ...slot, status: "finalized", sessionId: created.id });
      setSessions((prev) => [created!, ...prev]);
      setShiftSlots((prev) => prev.map((s) => (s.id === updatedSlot.id ? updatedSlot : s)));
      return true;
    } catch (e) {
      if (created) {
        try {
          await deleteSession(created.id);
        } catch {
          // Rollback thất bại — session mồ côi vẫn còn trong DB, nhưng không nuốt lỗi gốc bên dưới.
        }
      }
      showToast(`Không thể chốt lịch: ${errorMessage(e)}`);
      return false;
    }
  };

  // Handlers for Workflow Rules — persisted to Supabase
  const handleAddWorkflowRule = async (newRule: WorkflowRule) => {
    try {
      const created = await createWorkflowRule(newRule);
      setWorkflowRules(prev => [created, ...prev]);
    } catch (e) {
      showToast(`Không thể tạo Workflow Rule: ${errorMessage(e)}`);
    }
  };
  const handleUpdateWorkflowRule = async (updatedRule: WorkflowRule) => {
    try {
      const saved = await updateWorkflowRule(updatedRule);
      setWorkflowRules(prev => prev.map(r => r.id === saved.id ? saved : r));
    } catch (e) {
      showToast(`Không thể cập nhật Workflow Rule: ${errorMessage(e)}`);
    }
  };
  const handleDeleteWorkflowRule = async (id: string) => {
    try {
      await deleteWorkflowRule(id);
      setWorkflowRules(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      showToast(`Không thể xóa Workflow Rule: ${errorMessage(e)}`);
    }
  };

  // Badge trên nav: chỉ còn "DEMO" (đánh dấu module mock, thật sự cần biết trước khi bấm). Các
  // badge LIVE/SMART/NEW/CUSTOM/ADMIN đã bỏ (audit Module 2, 2026-09-18) — "NEW" trên tab đã có
  // nhiều tháng, "SMART"/"LIVE" không mang thông tin; badge nào cũng có thì không badge nào được đọc.
  // Navigation Items mapped to permission keys, grouped theo luồng công việc — đây là
  // nhóm cho Agency Workspace (nhìn xuyên mọi Brand). Xem BRAND_NAV_GROUPS bên dưới cho
  // Brand Workspace (Giai đoạn A, WORKSPACE_DESIGN.md).
  const AGENCY_NAV_GROUPS: NavGroup[] = [
    // Tái cấu trúc 2026-09-21: tách LẬP KẾ HOẠCH (trước tháng) khỏi VẬN HÀNH (hằng ngày).
    // Talent chỉ thấy: Ca Của Tôi (nơi nộp số liệu/report), Đăng Ký ca, Hồ Sơ.
    ...(currentRole === "talent"
      ? [
          {
            label: "Của Tôi",
            items: [
              { id: "my_shifts", label: "Ca Của Tôi", icon: Radio, perm: undefined },
              { id: "shift_scheduling", label: "Đăng Ký Ca", icon: CalendarClock, perm: undefined },
              { id: "my_talent_profile", label: "Hồ Sơ Của Tôi", icon: Users, perm: undefined }
            ]
          }
        ]
      : [
          {
            // Dashboard (Bản Tin CEO, 2026-09-25) đứng riêng trên cùng, không tiêu đề nhóm. Giữ id
            // "agency_overview" cũ để activeTab trong localStorage không gãy.
            label: "",
            items: [{ id: "agency_overview", label: "Dashboard", icon: LayoutDashboard, perm: "manage_sessions" as PermissionKey }]
          },
          {
            label: "Lập Kế Hoạch",
            items: [
              // Kế Hoạch Tháng (0090) — lập lưới ca + target trước khi mở đăng ký; chốt là ca đổ xuống
              // Đăng Ký & Chốt Lịch. Chỉ ops (manage_sessions = ceo/admin/operations).
              { id: "month_plan", label: "Kế Hoạch Tháng", icon: CalendarRange, perm: "manage_sessions" as PermissionKey },
              // Đăng ký & Chốt Lịch Host — không gate theo PermissionKey (talent cũng dùng, ở nhóm trên).
              { id: "shift_scheduling", label: "Nhân sự ca", icon: CalendarClock, perm: undefined }
            ]
          },
          {
            label: "Vận Hành Hằng Ngày",
            items: [
              // "calendar" giữ id cũ (quyền manage_calendar, localStorage) — nội dung là Bảng Vận Hành
              // (hôm nay/tuần, việc còn thiếu) + chế độ xem Lịch & Studio (LiveCalendar cũ).
              { id: "calendar", label: "Bảng Vận Hành", icon: CalendarIcon, perm: "manage_calendar" as PermissionKey },
              { id: "sessions", label: "Sổ Ca", icon: BookOpen, perm: "manage_sessions" as PermissionKey },
              { id: "live_reconciliation", label: "Đối Soát Số Liệu", icon: ClipboardCheck, perm: "manage_sessions" as PermissionKey },
              // Hỗ Trợ Vận Hành (2026-09-21): run-rate vs target đã chốt + benchmark ca sắp live; không đụng target cam kết.
              { id: "ops_support", label: "Hỗ Trợ Vận Hành", icon: Gauge, perm: "manage_sessions" as PermissionKey }
            ]
          },
          {
            label: "Phân Tích",
            items: [
              { id: "host_performance", label: "Hiệu Suất Host", icon: TrendingUp, perm: "manage_sessions" as PermissionKey },
              // Toàn Cảnh Brand (Đợt C/6, 2026-09-23): bảng trạng thái 4 brand cho 1 tháng — kế
              // hoạch/cam kết/report/rate đọc thẳng từ DB, không phải widget KPI dự phóng kiểu
              // Dashboard cũ (đã xoá 2026-09-13).
              { id: "brands_overview", label: "Toàn Cảnh Brand", icon: LayoutGrid, perm: "manage_sessions" as PermissionKey },
              // Điều Phối Phát Hành Report (còn lại của Đợt C, Audit Role × Workspace) — bảng
              // brand × tháng để phát hành/thu hồi Report Tháng thẳng từ đây.
              { id: "report_publish_board", label: "Điều Phối Phát Hành", icon: Send, perm: "manage_sessions" as PermissionKey }
            ]
          }
        ]),
    {
      label: "Tài Nguyên Chung",
      items: [
        { id: "talents", label: "Talent Pool", icon: Users, perm: "manage_talents" as PermissionKey },
        { id: "studios", label: "Studios & Gear", icon: Building2, perm: "manage_studios_gear" as PermissionKey },
      ],
    },
    {
      label: "Kinh Doanh",
      items: [
        { id: "crm", label: "CRM", icon: Briefcase, perm: "manage_crm_projects" as PermissionKey },
        // Cam kết hợp đồng đặt cạnh CRM vì CRM đang giữ Rate Card (ĐƠN GIÁ mỗi giờ) — cam kết là
        // KHỐI LƯỢNG giờ mỗi tháng, hai nửa của cùng một điều khoản thương mại. Dùng lại
        // manage_crm_projects: quyền này mặc định đúng bằng ceo/admin/operations, khớp RLS của
        // brand_contracts/brand_monthly_commitments (migration 0081) nên không cần key mới.
        { id: "brand_commitment", label: "Cam Kết Hợp Đồng", icon: FileSignature, perm: "manage_crm_projects" as PermissionKey },
        { id: "tiktok_api", label: "TikTok API", icon: Link2, perm: "manage_tiktok_api" as PermissionKey },
      ],
    },
    {
      label: "Tài Chính",
      items: [
        // Khoá cứng ceo/admin — không qua Ma Trận Phân Quyền (trước đây gate bằng permission
        // `view_financials` togglable, ceo có thể lỡ bật cho operations qua Ma Trận). Toàn bộ
        // dữ liệu Finance & HR (lương/hoa hồng/chi phí) giờ chỉ ceo/admin biết được.
        ...(currentRole === "ceo" || currentRole === "admin"
          ? [{ id: "finance", label: "Finance & P&L", icon: DollarSign, perm: undefined }]
          : []),
      ],
    },
    {
      label: "Hệ Thống",
      items: [
        // "Hội Đồng AI & Simulator" (AiMultiAgent, mock) ẨN khỏi nav từ 2026-09-18 (user chốt) tới khi
        // có bản thật. Component + nhánh render vẫn còn; isTabAllowed coi tab không có nav item là
        // không được phép nên không mở lại được qua localStorage.
        { id: "user_settings", label: "Phân Quyền & Role", icon: ShieldCheck, perm: "manage_users_permissions" as PermissionKey },
        // Tài khoản cá nhân đã dời vào User Card cuối sidebar (bấm vào card để mở), không
        // còn là 1 mục nav riêng — tránh trùng lặp lối vào.
        // Độc quyền Admin — không dùng PermissionKey/Ma Trận Role để gate (không thể cấp
        // qua Ma Trận cho role khác, kể cả ceo), chỉ hiện khi currentRole === "admin".
        ...(currentRole === "admin"
          ? [{ id: "ai_training", label: "AI Training Center", icon: BrainCircuit, perm: undefined }]
          : []),
      ],
    },
  ];

  // Brand Workspace (Giai đoạn A) — 1 nhóm duy nhất, luôn scope theo đúng 1 brand
  // (currentBrandId). Không tab nào gate theo PermissionKey: role "brand" tự khoá vào
  // workspace của chính họ và có quyền thấy các module này bất kể Ma Trận Phân Quyền
  // (role_permissions của "brand" mặc định false cho manage_calendar/view_financials — dùng
  // lại các key đó ở đây sẽ khoá nhầm chính brand ra khỏi dữ liệu của họ); còn ceo/admin/
  // operations vào xem hộ qua switcher vốn đã có toàn quyền agency-level rồi.
  // Rate Card không còn ở đây — đã chuyển hẳn sang CRM (Agency-side, thực tế gate bằng
  // `manage_crm_projects` của nav item CRM, KHÔNG phải `view_rate_card` như comment cũ ghi nhầm;
  // key đó chưa bao giờ gate gì và đã bị gỡ 2026-09-22) để ceo/admin/operations set giá 1 lần cho
  // mọi brand, không cần vào từng brand workspace.
  // FIX L3 (audit 2026-08-21): "Dữ Liệu Gốc" (RLS ceo/admin/operations trong 0052_brand_dataraw.sql)
  // là công cụ VẬN HÀNH NỘI BỘ — đúng như thiết kế ban đầu ("report tháng brand chỉ xuất ra ngoài
  // app, brand không tự vào xem raw data qua hệ thống", comment trong chính migration 0052). Bỏ
  // tab này khỏi menu khi currentRole === "brand"; ceo/operations/admin xem hộ qua switcher vẫn
  // thấy đủ như cũ.
  // "Report Tuần" không còn là tab riêng (2026-08-23) — đã gộp làm chế độ xem "Tuần" bên trong
  // Report Tháng (BrandMonthlyReport.tsx tự toggle Tháng/Tuần, CAN_VIEW_ROLES trong
  // BrandWeeklyReport.tsx vẫn chặn brand xem như trước).
  const BRAND_NAV_GROUPS: NavGroup[] = [
    {
      label: "Brand Workspace",
      items: [
        { id: "brand_calendar", label: "Lịch Vận Hành", icon: CalendarIcon, perm: undefined },
        { id: "brand_sessions", label: "Sổ Ca", icon: BookOpen, perm: undefined },
        { id: "brand_skus", label: "SKU Showcase", icon: Package, perm: undefined },
        { id: "brand_monthly_report", label: "Report Tháng", icon: FileText, perm: undefined },
        // Cam Kết Hợp Đồng bản CHỈ ĐỌC cho khách (Đợt C/1, migration 0108). Khác hẳn tab cùng tên
        // bên Agency: bên đó ops soạn hợp đồng + nhìn xuyên mọi brand, đây chỉ trả lời "tháng này
        // cam kết bao nhiêu giờ, đã chạy bao nhiêu, còn bao nhiêu". Brand đọc qua view
        // `brand_commitment_progress` (đã bỏ cột note nội bộ); 2 bảng gốc vẫn khoá ở ops như cũ.
        { id: "brand_commitment_view", label: "Cam Kết Hợp Đồng", icon: FileSignature, perm: undefined },
        // Kế hoạch tháng sau, chỉ đọc + nút xác nhận (Đợt C/2, migration 0110). Đường đọc đã mở từ
        // 0105 (brand_month_plans_read_scoped); xác nhận đi qua RPC confirm_month_plan riêng.
        { id: "brand_next_month_plan", label: "Kế Hoạch Tháng Sau", icon: CalendarCheck2, perm: undefined },
        // Rate Card của chính brand — CHỈ ĐỌC (Đợt C/3). RLS đã mở từ 0105
        // (brand_platform_rates_read_scoped/_history), chỉ thiếu UI. Tái dùng nguyên BrandRateCard
        // của CRM bên Agency với readOnly — sửa rate vẫn phải làm ở CRM, không mở đường ghi ở đây.
        { id: "brand_rate_card", label: "Rate Card", icon: Tag, perm: undefined },
        // Trang Affiliate (2026-09-22) — bảng phân tích theo TỪNG PHIÊN của creator affiliate,
        // tách hẳn khỏi form Report Tháng (yêu cầu ops). Brand xem được (migration 0102 nới RLS
        // đọc), chỉ ops mới sửa được — khác "Nhập Ads & Ghi Chú"/"Dữ Liệu Gốc" vốn ẩn với brand.
        { id: "brand_affiliate", label: "Affiliate", icon: Users, perm: undefined },
        // "Nhập Ads & Ghi Chú" (2026-09-21): phần nhập tay tách khỏi Report Tháng, ops-only như Dữ Liệu Gốc.
        ...(currentRole === "brand"
          ? []
          : [
              { id: "brand_ads_report", label: "Nhập Ads & Ghi Chú", icon: Megaphone, perm: undefined },
              { id: "brand_dataraw", label: "Dữ Liệu Gốc", icon: Database, perm: undefined }
            ]),
      ],
    },
  ];

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
    <div className="flex h-screen w-full bg-[var(--surface-base)] text-[var(--text)] overflow-hidden font-sans antialiased selection:bg-[var(--accent)] selection:text-white">
      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[var(--surface)]/90 backdrop-blur-md border-r border-[var(--border)] flex flex-col transition-all duration-300 md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "md:w-16" : "md:w-64"}`}
      >
        <div
          className={`border-b border-[var(--border)] flex items-center justify-between ${
            sidebarCollapsed ? "p-6 md:px-0 md:py-4 md:justify-center" : "p-6"
          }`}
        >
          <div className={sidebarCollapsed ? "md:hidden" : ""}>
            <h1 className="text-xl font-bold tracking-tighter text-[var(--accent-text)]">LIVEOPS AI</h1>
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-faint)] font-semibold">
              Agency Operating System
            </p>
          </div>
          {sidebarCollapsed && (
            <span
              className="hidden md:flex w-9 h-9 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent-text)] items-center justify-center text-sm font-black tracking-tighter"
              title="LIVEOPS AI"
            >
              LO
            </span>
          )}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav
          className={`flex-1 py-3 space-y-4 overflow-y-auto scrollbar-thin ${
            sidebarCollapsed ? "px-3 md:px-2" : "px-3"
          }`}
        >
          {/* Trong lúc Ma Trận Phân Quyền chưa về, checkPermission() nào cũng false nên MỌI nav
              item có `perm` biến mất — sidebar còn trơ 1-2 mục và trông như tài khoản vừa bị thu
              quyền. Hiện skeleton thay vì sự thật sai đó (cùng lý do với nhánh render bên dưới). */}
          {phase6Loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={`nav-skeleton-${i}`}
                  className="mx-1 h-9 rounded-xl bg-[var(--surface-elevated)]/60 animate-pulse"
                />
              ))
            : navGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.perm || checkPermission(item.perm)
            );

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className="space-y-1">
                {group.label && (
                  <p
                    className={`px-3 text-[11px] font-bold uppercase tracking-widest text-[var(--text-faint)] ${
                      sidebarCollapsed ? "md:hidden" : ""
                    }`}
                  >
                    {group.label}
                  </p>
                )}
                {/* Ở chế độ thu gọn, nhóm nav chỉ còn được phân tách bằng 1 gạch mảnh. */}
                {sidebarCollapsed && <div className="hidden md:block mx-2 border-t border-[var(--border)]" />}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      title={item.label}
                      className={`w-full flex items-center justify-between gap-2 py-2.5 rounded-xl transition-colors text-xs font-medium ${
                        sidebarCollapsed ? "px-3 md:px-0 md:justify-center" : "px-3"
                      } ${
                        isActive
                          ? "bg-[var(--accent)]/10 text-[var(--accent-text)] border border-[var(--accent)]/20 font-bold"
                          : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]/80 hover:text-[var(--text)]"
                      }`}
                    >
                      <div className={`flex items-center gap-3 min-w-0 ${sidebarCollapsed ? "md:gap-0" : ""}`}>
                        <div className="relative shrink-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${isActive ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"}`}
                          />
                          {/* Thu gọn: badge NEW co lại thành chấm nhỏ trên icon cho khỏi mất tín hiệu. */}
                          {sidebarCollapsed && item.badge && (
                            <span className="hidden md:block absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
                          )}
                        </div>
                        <span className={`truncate ${sidebarCollapsed ? "md:hidden" : ""}`}>{item.label}</span>
                      </div>

                      <div className={`flex items-center gap-1.5 shrink-0 ${sidebarCollapsed ? "md:hidden" : ""}`}>
                        {item.badge && (
                          <span className="bg-rose-600/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold px-1.5 py-0.5 rounded uppercase">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
              })}
        </nav>

        {/* User Card — bấm để mở Tài Khoản Của Tôi (thay cho mục nav riêng đã bỏ) */}
        <div className={`mt-auto border-t border-[var(--border)] ${sidebarCollapsed ? "p-4 md:p-2" : "p-4"}`}>
          <button
            type="button"
            onClick={() => {
              setActiveTab("account_settings");
              setMobileMenuOpen(false);
            }}
            title={`${activeUser.name} • ${currentRole} — Tài Khoản Của Tôi`}
            className={`w-full flex items-center gap-3 rounded-xl border transition-colors text-left ${
              activeTab === "account_settings"
                ? "bg-[var(--accent)]/10 border-[var(--accent)]/20"
                : "bg-[var(--surface-elevated)]/50 border-[var(--border)]/50 hover:bg-[var(--surface-elevated)] hover:border-[var(--text-faint)]"
            } ${sidebarCollapsed ? "p-3 md:p-2 md:justify-center" : "p-3"}`}
          >
            {activeUser.avatar ? (
              <img
                src={activeUser.avatar}
                alt={activeUser.name}
                className="w-9 h-9 rounded-full object-cover border border-[var(--border)] shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] flex items-center justify-center text-xs font-bold uppercase shrink-0">
                {activeUser.name.charAt(0) || "?"}
              </div>
            )}
            <div className={`text-xs min-w-0 flex-1 ${sidebarCollapsed ? "md:hidden" : ""}`}>
              <p className="font-bold text-[var(--text)] truncate">{activeUser.name}</p>
              {/* Chức danh đã chứa role ("Quản Trị Viên Hệ Thống (Admin)") — in thêm role phía trước là
                  lặp "ADMIN • ... (ADMIN)". Chỉ rơi về tên role khi chưa đặt chức danh. */}
              <p className="text-[var(--accent-text)] text-[11px] uppercase font-extrabold truncate">
                {activeUser.customRoleTitle || currentRole}
              </p>
            </div>
            <UserCog
              className={`w-4 h-4 text-[var(--text-faint)] shrink-0 ${sidebarCollapsed ? "md:hidden" : ""}`}
            />
          </button>
        </div>
      </aside>

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
                ? isCalendarModule
                  ? "Mở rộng menu (Ctrl/Cmd + B) — menu tự thu gọn ở module có lịch"
                  : "Mở rộng menu (Ctrl/Cmd + B)"
                : "Thu gọn menu để rộng chỗ cho lịch (Ctrl/Cmd + B)"
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
            <Header
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
              brands={activeBrands}
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
            {!isTabAllowed && phase6Loading ? (
              /* Ma Trận Phân Quyền CHƯA về — `rolePermissions` còn là {} nên checkPermission()
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
              <Sentry.ErrorBoundary
                key={activeTab}
                fallback={({ resetError }) => (
                  <TabErrorFallback
                    tabLabel={currentTabNavItem?.label ?? activeTab}
                    onRetry={resetError}
                    onGoHome={() => setActiveTab(firstAllowedTab ?? getDefaultTabForRole(currentRole))}
                  />
                )}
              >
              <>
                {activeTab === "sessions" && (
                  <SessionLedger
                    variant="agency"
                    sessions={activeSessions}
                    excludedSessions={excludedSessions}
                    brands={activeBrands}
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
                    {opsView === "board" && (
                      <OpsBoard
                        mode="ops"
                        sessions={activeSessions}
                        shiftSlots={shiftSlots}
                        shiftRegistrations={shiftRegistrations}
                        brands={activeBrands}
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
                    brands={activeBrands}
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
                    brands={activeBrands}
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
                    brands={activeBrands}
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
                    brands={activeBrands}
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
                    onSetBrandStudio={handleSetBrandStudio}
                  />
                )}

                {activeTab === "live_reconciliation" && (
                  <LiveReconciliation
                    onApplied={handleReconciliationApplied}
                    onOpenSession={(id) => { setOpsView("board"); setActiveTab("calendar"); setNotifOpenSessionId(id); }}
                  />
                )}

                {activeTab === "agency_overview" && (
                  <CeoBrief
                    sessions={activeSessions}
                    brands={activeBrands}
                    talents={talents}
                    shiftSlots={shiftSlots}
                    planTargetsBySlotId={planTargetsBySlotId}
                    planMonthTotals={planMonthTotals}
                    monthlyReports={monthlyReports}
                    financeRecords={financeRecords}
                    brandPlatformRates={brandPlatformRates}
                    brandPlatformRateHistory={brandPlatformRateHistory}
                    talentRateHistory={talentRateHistory}
                    currentRole={currentRole}
                    onNavigate={setActiveTab}
                  />
                )}

                {activeTab === "host_performance" && (
                  <HostPerformance sessions={activeSessions} brands={activeBrands} />
                )}

                {activeTab === "brands_overview" && (
                  <BrandsOverview
                    brands={activeBrands}
                    sessions={activeSessions}
                    brandPlatformRates={brandPlatformRates}
                    monthlyReports={monthlyReports}
                  />
                )}

                {activeTab === "report_publish_board" && (
                  <ReportPublishBoard
                    brands={activeBrands}
                    sessions={activeSessions}
                    brandPlatformRates={brandPlatformRates}
                    planMonthTotals={planMonthTotals}
                    monthlyReports={monthlyReports}
                    onReportsChanged={() => {
                      fetchAllMonthlyReports().then(setMonthlyReports).catch(() => {});
                    }}
                  />
                )}

                {activeTab === "ops_support" && (
                  <OpsSupport
                    brands={activeBrands}
                    sessions={activeSessions}
                    shiftSlots={shiftSlots}
                    promoSchemes={promoSchemes}
                    engineParams={engineParams}
                    onOpenMonthPlan={() => setActiveTab("month_plan")}
                    onOpenSession={(id) => { setOpsView("board"); setActiveTab("calendar"); setNotifOpenSessionId(id); }}
                  />
                )}

                {activeTab === "brand_commitment" && (
                  <BrandCommitment sessions={activeSessions} brands={activeBrands} />
                )}

                {/* Brand Workspace (Giai đoạn A) — mọi tab dưới đây chỉ render khi effectiveWorkspace
                    đang scope theo đúng 1 brand; component con nhận thẳng brandId + data đã lọc sẵn
                    (giữ nguyên pattern fetch-1-lần-ở-App/filter-bằng-useMemo hiện có). */}
                {activeTab === "brand_calendar" && effectiveWorkspace.type === "brand" && (
                  <BrandCalendar
                    brandId={currentBrandId!}
                    brandName={activeBrands.find((b) => b.id === currentBrandId)?.name || "Brand"}
                    sessions={activeSessions}
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
                    brands={activeBrands}
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
                    brandName={activeBrands.find((b) => b.id === currentBrandId)?.name || "Brand"}
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
                    brandName={activeBrands.find((b) => b.id === currentBrandId)?.name || "Brand"}
                    sessions={activeSessions}
                    currentRole={currentRole}
                  />
                )}

                {activeTab === "brand_next_month_plan" && effectiveWorkspace.type === "brand" && (
                  <BrandNextMonthPlan
                    brandId={currentBrandId!}
                    brandName={activeBrands.find((b) => b.id === currentBrandId)?.name || "Brand"}
                    currentRole={currentRole}
                  />
                )}

                {activeTab === "brand_rate_card" && effectiveWorkspace.type === "brand" && (
                  <BrandRateCard
                    brandId={currentBrandId!}
                    currentRole={currentRole}
                    brandPlatformRates={brandPlatformRates}
                    brandPlatformRateHistory={brandPlatformRateHistory}
                    sessions={activeSessions}
                    onSaveRate={handleSaveBrandPlatformRate}
                    onSaveReturnRate={handleSaveBrandPlatformReturnRate}
                    onSaveCommissionRate={handleSaveBrandPlatformCommissionRate}
                    readOnly
                  />
                )}

                {activeTab === "brand_affiliate" && effectiveWorkspace.type === "brand" && (
                  <BrandAffiliateTable
                    brandId={currentBrandId!}
                    brandName={activeBrands.find((b) => b.id === currentBrandId)?.name || "Brand"}
                    sessions={activeSessions}
                    currentRole={currentRole}
                    onOpenDataRaw={() => setActiveTab("brand_dataraw")}
                  />
                )}

                {activeTab === "brand_ads_report" && effectiveWorkspace.type === "brand" && currentRole !== "brand" && (
                  <BrandAdsReport
                    brandId={currentBrandId!}
                    brandName={activeBrands.find((b) => b.id === currentBrandId)?.name || "Brand"}
                    sessions={activeSessions}
                    currentRole={currentRole}
                  />
                )}

                {activeTab === "brand_dataraw" && effectiveWorkspace.type === "brand" && (
                  <BrandDataRaw
                    brandId={currentBrandId!}
                    brandName={activeBrands.find((b) => b.id === currentBrandId)?.name || "Brand"}
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
                    brands={activeBrands}
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
                    sessions={activeSessions} /* 0114: KHÔNG phải `sessions`. Hai mảng này trước
                      0114 là cùng một object nên chỗ này viết gì cũng như nhau; từ 0114 thì khác —
                      ca đã loại khỏi báo cáo phải biến mất khỏi cả Thu Nhập Tháng Này, không thì
                      talent đọc một con số mà P&L của ops (đã lọc) ra con số khác. */
                    financeRecords={financeRecords}
                    talentRateHistory={talentRateHistory}
                    onSaveMyProfile={handleSaveMyTalentProfile}
                  />
                )}

                {activeTab === "studios" && (
                  <StudioEquipment
                    studios={activeStudios}
                    equipments={activeEquipments}
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
                    brands={activeBrands}
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
                  />
                )}

                {activeTab === "tiktok_api" && (
                  <TikTokApiAutomation
                    workflowRules={activeWorkflowRules}
                    onAddWorkflowRule={handleAddWorkflowRule}
                    onUpdateWorkflowRule={handleUpdateWorkflowRule}
                    onDeleteWorkflowRule={handleDeleteWorkflowRule}
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
                    sessions={activeSessions}
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

                {activeTab === "ai_agents" && <AiMultiAgent />}

                {activeTab === "ai_training" && currentRole === "admin" && (
                  <div className="space-y-8">
                    <AiTrainingCenter
                      prompts={aiAgentPrompts}
                      loading={aiAgentPromptsLoading}
                      error={aiAgentPromptsError}
                      onUpdate={handleUpdateAiAgentPrompt}
                    />
                    <EngineTrainingPanel
                      brands={activeBrands}
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
                    users={activeUsers}
                    onAddUser={handleAddUser}
                    onUpdateUser={handleUpdateUser}
                    onDeleteUser={handleDeleteUser}
                    auditLogs={activeAuditLogs}
                    permissionDefinitions={ALL_PERMISSION_DEFINITIONS}
                    brands={activeBrands}
                    talents={activeTalents}
                    sessions={activeSessions}
                  />
                )}

                {activeTab === "account_settings" && (
                  <AccountSettings activeUser={activeUser} onUpdateUser={handleUpdateUser} />
                )}
              </>
              </Sentry.ErrorBoundary>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

