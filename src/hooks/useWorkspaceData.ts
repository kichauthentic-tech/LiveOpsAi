import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AiAgentPrompt,
  AuditLogEntry,
  Brand,
  BrandMonthlyReport as BrandMonthlyReportRow,
  BrandPlatformRate,
  BrandPlatformRateHistoryEntry,
  BrandSku,
  BrandStudio,
  BrandChannel,
  Equipment,
  LiveSession,
  PromoScheme,
  RecurringShiftTemplate,
  RolePermissionsMap,
  SessionFinance,
  ShiftRegistration,
  ShiftSlot,
  Studio,
  SystemUser,
  Talent,
  TalentRateHistoryEntry,
  TikTokConnectionStatus,
  TikTokWebhookEvent,
  UserRole
} from "../types";
import { fetchTalents } from "../lib/db/talents";
import { fetchStudios } from "../lib/db/studios";
import { fetchEquipments } from "../lib/db/equipments";
import { fetchSessions, completePastSessions } from "../lib/db/sessions";
import { fetchBrands } from "../lib/db/brands";
import { fetchUsers } from "../lib/db/users";
import { fetchAuditLogs } from "../lib/db/auditLogs";
import { fetchRolePermissions } from "../lib/db/rolePermissions";
import { fetchSessionFinances } from "../lib/db/finance";
import { fetchTikTokStatus, fetchTikTokWebhookEvents } from "../lib/db/tiktokIntegration";
import { fetchAiAgentPrompts } from "../lib/db/aiAgentPrompts";
import { fetchBrandPlatformRates } from "../lib/db/brandPlatformRates";
import { fetchBrandStudios } from "../lib/db/brandStudios";
import { fetchBrandChannels } from "../lib/db/brandChannels";
import { fetchShiftSlots } from "../lib/db/shiftSlots";
import { fetchShiftRegistrations } from "../lib/db/shiftRegistrations";
import { fetchRecurringShiftTemplates } from "../lib/db/recurringShiftTemplates";
import { fetchTalentRateHistory } from "../lib/db/talentRateHistory";
import { fetchBrandPlatformRateHistory } from "../lib/db/brandPlatformRateHistory";
import { fetchBrandSkus } from "../lib/db/brandSkus";
import { fetchPromoSchemes } from "../lib/db/promoSchemes";
import { fetchAllMonthlyReports } from "../lib/db/monthlyReports";
import { fetchLockedPlanTargets } from "../lib/db/monthPlans";
import { fetchEngineParams } from "../lib/db/engineParams";
import { DEFAULT_ENGINE_PARAMS, EngineParams } from "../lib/scheduling/engineParams";
import { applyAllocatedTargets } from "../lib/performance/targetAllocation";
import { withEffectiveStatus } from "../lib/sessionStatus";
import { errorMessage } from "../lib/errorMessage";

// Toàn bộ dữ liệu nghiệp vụ của workspace: state, các đợt nạp, và hai giá trị dẫn xuất bám sát chúng
// (`sessions` đã áp trạng thái theo giờ + target, `planTargetsBySessionId`). Tách khỏi App.tsx
// 2026-10-01 — App.tsx khi đó 2.646 dòng và hơn 500 dòng đầu chỉ là khai state + useEffect nạp dữ
// liệu, khiến phần thật sự của màn hình (handler + JSX) bị đẩy xuống quá tầm đọc.
//
// KHÔNG đổi hành vi khi tách: thứ tự khai báo, dep của từng effect, và cờ `*LoadedFor`/`*LoadedRef`
// giữ nguyên từng dòng. Vì sao từng dep lại như vậy thì đọc chú thích ngay tại chỗ — nhất là luật
// "khoá theo `authUserId` chứ không theo object `session`" và nhóm `TABS_NEED_*`.

// Dữ liệu chỉ vài màn đọc tới thì nạp khi MỞ màn đó, không nạp lúc đăng nhập. Đo 2026-10-01 trên bản
// build thật (role admin): đăng nhập bắn 44 request, trong đó 5 request dưới đây phục vụ đúng 3 tab mà
// phần lớn phiên làm việc không mở tới. Nạp MỘT LẦN cho mỗi người dùng — mở lại tab không gọi lại; các
// handler sửa dữ liệu vẫn tự gọi `fetchUsers()` lại như cũ nên danh sách không bị cũ.
const TABS_NEED_USERS = new Set(["user_settings", "crm", "finance"]);
const TABS_NEED_AUDIT_LOGS = new Set(["user_settings"]);
const TABS_NEED_TIKTOK = new Set(["tiktok_api"]);
const TABS_NEED_AI_PROMPTS = new Set(["ai_training"]);

// Màn có thể sửa report tháng / kế hoạch tháng. Rời một trong các màn này mới cần nạp lại
// `brand_monthly_reports`; trước đây nạp lại ở MỌI lần đổi tab (18 tab agency + 10 tab brand).
const TABS_MAY_CHANGE_REPORTS = new Set([
  "brand_monthly_report",
  "brand_next_month_plan",
  "month_plan",
  "report_publish_board",
  "live_reconciliation"
]);

export interface WorkspaceDataInput {
  session: Session | null;
  currentRole: UserRole;
  isOpsRole: boolean;
  activeTab: string;
}

export function useWorkspaceData({ session, currentRole, isOpsRole, activeTab }: WorkspaceDataInput) {
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

  // Audit Logs — real data from Supabase (Phase 5), no mock fallback
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [phase5Error, setPhase5Error] = useState<string | null>(null);

  // System Users — real data from Supabase `profiles` (Phase 4), no mock fallback
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [phase4Error, setPhase4Error] = useState<string | null>(null);

  // Talents / Studios / Equipments — real data from Supabase (Phase 1), no mock fallback
  const [talents, setTalents] = useState<Talent[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
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
  const [planSlotTargets, setPlanSlotTargets] = useState<Map<string, { date: string; target: number }[]>>(new Map());
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
    () => applyAllocatedTargets(withEffectiveStatus(rawSessions, nowMs), planTargetsBySessionId, planMonthTotals),
    [rawSessions, nowMs, planTargetsBySessionId, planMonthTotals]
  );
  // Kế hoạch tháng được sửa ở Report Tháng (Tab 05) mà App không nhận callback — nạp lại mỗi khi
  // đổi tab là đủ, bảng nhỏ và target chỉ cần đúng khi người dùng nhìn sang màn khác.
  const prevTabRef = useRef<string | null>(null);
  useEffect(() => {
    const leaving = prevTabRef.current;
    prevTabRef.current = activeTab;
    if (!session) return;
    // Chỉ nạp lại khi vừa RỜI một màn có thể đã sửa report/kế hoạch. Trước đây mọi lần đổi tab đều
    // gọi lại `brand_monthly_reports` — 28 tab, phần lớn không đụng gì tới report.
    if (leaving === null || !TABS_MAY_CHANGE_REPORTS.has(leaving)) return;
    fetchAllMonthlyReports().then(setMonthlyReports).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Brands — real data from Supabase (Phase 3), no mock fallback
  const [brands, setBrands] = useState<Brand[]>([]);
  // Brand nạp ở effect riêng, không cùng đợt talent/studio/thiết bị — hai đợt về lệch nhau, đừng lấy đợt kia làm cờ.
  const [brandsLoaded, setBrandsLoaded] = useState(false);
  const [phase3Error, setPhase3Error] = useState<string | null>(null);

  // Đăng ký & Chốt Lịch Host — real data from Supabase `brand_platform_rates`/`shift_slots`/
  // `session_availability` (Giai đoạn 14a), no mock fallback.
  const [brandPlatformRates, setBrandPlatformRates] = useState<BrandPlatformRate[]>([]);
  // Phòng live mặc định brand × nền tảng (0098) — chốt kế hoạch ghi vào ca, form mở ca chọn sẵn.
  const [brandStudios, setBrandStudios] = useState<BrandStudio[]>([]);
  // Kênh brand × sàn (0149). null = DB chưa có bảng (0149 chưa chạy) ⇒ App tự suy kênh như cũ.
  const [brandChannels, setBrandChannels] = useState<BrandChannel[] | null>(null);
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
  // docs/WORKSPACE_HISTORY.md). Fetch 1 lần ở agency-level, mỗi Brand Workspace
  // tự filter theo brandId.
  const [brandSkus, setBrandSkus] = useState<BrandSku[]>([]);
  const [phaseB1Error, setPhaseB1Error] = useState<string | null>(null);
  // Giai đoạn C3 — Scheme khuyến mãi tích hợp Calendar. Áp dụng theo khoảng ngày, agency-wide.
  const [promoSchemes, setPromoSchemes] = useState<PromoScheme[]>([]);
  const [phaseC3Error, setPhaseC3Error] = useState<string | null>(null);

  // Giai đoạn C4 — Price List Import (SKU pricing theo platform, Brand Workspace).


  // 2026-09-24 (#5 ESLint): mọi effect nạp dữ liệu dưới đây khoá theo ID người đăng nhập, KHÔNG theo
  // object `session`. Supabase làm mới access token mỗi ~1h và trả về một object session MỚI với cùng
  // user id — dep theo cả object là bật lại đúng vòng refetch toàn bộ ~13 cụm dữ liệu mỗi giờ mà đợt
  // audit Phần 1 vừa dập. Trước đây thân effect guard bằng `if (!session)` nên `exhaustive-deps` đòi
  // thêm `session` vào dep (12 lỗi); guard bằng chính `authUserId` thì rule hết đòi mà hành vi y nguyên
  // — `authUserId` truthy đúng khi và chỉ khi có session kèm user.
  const authUserId = session?.user?.id;

  // Đã nạp xong lần đầu cho user nào (audit UX 2026-09-29, Đợt 0 #1). Trước đây state bắt đầu bằng
  // [] / Map rỗng mà không có cờ ⇒ 1–3 s đầu mọi màn hiện "0 ca", "Chưa có ca nào có số" (Talent Pool
  // 2,9 s), "Chưa có dòng" (Điều Phối Phát Hành 1,8 s) như thể mất dữ liệu. Lưu theo user id thay vì
  // boolean để đăng nhập tài khoản khác tự về "chưa nạp" mà không cần setState trong effect.
  const [talentsLoadedFor, setTalentsLoadedFor] = useState<string | null>(null);
  const [sessionsLoadedFor, setSessionsLoadedFor] = useState<string | null>(null);
  const [reportsLoadedFor, setReportsLoadedFor] = useState<string | null>(null);
  const coreDataReady =
    !!authUserId &&
    talentsLoadedFor === authUserId &&
    sessionsLoadedFor === authUserId &&
    reportsLoadedFor === authUserId;

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
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
        setPhase1Error(err.message ?? "Không tải được dữ liệu talent/phòng live/thiết bị — thử tải lại trang.");
      })
      .finally(() => {
        if (!cancelled) setTalentsLoadedFor(authUserId);
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    fetchAllMonthlyReports()
      .then((m) => { if (!cancelled) setMonthlyReports(m); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReportsLoadedFor(authUserId); });
    // Nạp ca NGAY, song song với RPC đóng ca đã qua giờ (0096) — trước đây chờ RPC xong mới nạp, cộng
    // dồn hai lượt mạng vào thời gian màn trống. Hiển thị không phụ thuộc RPC: withEffectiveStatus đã
    // suy "Đã xong" theo giờ. RPC có đóng ca nào (n > 0) thì nạp lại để khớp DB. `seq` chặn lượt nạp
    // cũ về sau ghi đè lượt mới.
    let latestApplied = 0;
    const load = (seq: number) =>
      fetchSessions().then((s) => {
        if (cancelled || seq < latestApplied) return;
        latestApplied = seq;
        setSessions(s);
        setSessionsError(null);
      });
    load(1)
      .catch((err) => {
        if (cancelled) return;
        setSessionsError(err.message ?? "Không tải được dữ liệu ca live — thử tải lại trang.");
      })
      .finally(() => { if (!cancelled) setSessionsLoadedFor(authUserId); });
    completePastSessions()
      .then((n) => (n > 0 && !cancelled ? load(2) : undefined))
      .catch(() => {});
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
        setPhase3Error(err.message ?? "Không tải được dữ liệu Brand — thử tải lại trang.");
      })
      .finally(() => {
        if (!cancelled) setBrandsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  // Chỉ 3 màn đọc danh sách này — Phân Quyền & Role, CRM, Tài Chính — cả ba đều gate ở ops.
  const usersLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authUserId || !isOpsRole) return;
    if (!TABS_NEED_USERS.has(activeTab)) return;
    if (usersLoadedRef.current === authUserId) return;
    usersLoadedRef.current = authUserId;
    let cancelled = false;
    fetchUsers()
      .then((u) => {
        if (cancelled) return;
        setUsers(u);
        setPhase4Error(null);
      })
      .catch((err) => {
        usersLoadedRef.current = null; // hỏng thì mở khoá để lần mở tab sau thử lại
        if (cancelled) return;
        setPhase4Error(err.message ?? "Không tải được danh sách tài khoản người dùng — thử tải lại trang.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, isOpsRole, activeTab]);

  // `audit_logs` khoá ở ceo/operations/admin (0105) — chỉ nạp khi mở Phân Quyền & Role.
  const auditLogsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authUserId || !isOpsRole) return;
    if (!TABS_NEED_AUDIT_LOGS.has(activeTab)) return;
    if (auditLogsLoadedRef.current === authUserId) return;
    auditLogsLoadedRef.current = authUserId;
    let cancelled = false;
    fetchAuditLogs()
      .then((a) => {
        if (cancelled) return;
        setAuditLogs(a);
        setPhase5Error(null);
      })
      .catch((err) => {
        auditLogsLoadedRef.current = null;
        if (cancelled) return;
        setPhase5Error(err.message ?? "Không tải được nhật ký — thử tải lại trang.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, isOpsRole, activeTab]);

  // Ma Trận Phân Quyền là thứ DUY NHẤT quyết định tab nào mở được, nên fetch hỏng ở đây không
  // được để người dùng kẹt: `permissionsNonce` cho nút "Thử lại" chạy lại đúng effect này mà
  // không phải F5 (F5 sẽ kéo lại cả đợt nạp của lần tải trang — đo 2026-10-02 trên bản build:
  // 24–32 request tuỳ màn; con số "54" ghi ở đây trước kia đã cũ).
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
        setPhase6Error(errorMessage(err, "Không tải được quyền theo vai trò — thử tải lại trang."));
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
    Promise.all([fetchBrandPlatformRates(), fetchShiftSlots(), fetchShiftRegistrations(), fetchRecurringShiftTemplates(), fetchLockedPlanTargets().catch(() => ({ bySlotId: new Map<string, number>(), monthTotals: new Map<string, number>(), slotTargets: new Map<string, { date: string; target: number }[]>() })), fetchBrandStudios().catch(() => [] as BrandStudio[]), fetchBrandChannels()])
      .then(([rates, slots, regs, templates, planTargets, bStudios, channels]) => {
        if (cancelled) return;
        setBrandPlatformRates(rates);
        setBrandStudios(bStudios);
        setBrandChannels(channels);
        setShiftSlots(slots);
        setShiftRegistrations(regs);
        setRecurringShiftTemplates(templates);
        setPlanTargetsBySlotId(planTargets.bySlotId);
        setPlanMonthTotals(planTargets.monthTotals);
        setPlanSlotTargets(planTargets.slotTargets);
        setPhase14Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase14Error(err.message ?? "Không tải được dữ liệu đăng ký ca — thử tải lại trang.");
      });
    return () => {
      cancelled = true;
    };
    // KHÔNG thêm `isOpsRole` vào dep: 6 fetch trên không phụ thuộc role, mà `isOpsRole` lật false→true
    // khi hồ sơ về (`currentRole` mặc định "talent" trước đó) ⇒ cả cụm chạy LẠI lần hai. Đo 2026-10-01:
    // brand_platform_rates/shift_slots/session_availability/recurring_shift_templates/
    // brand_month_plan_slots/brand_studios đều được gọi 2 lần, cách nhau ~156 ms. Tham số engine (chỉ
    // ops dùng) đã tách xuống effect riêng bên dưới đúng vì lý do đó.
  }, [authUserId]);

  // Tham số engine gợi ý lịch — chỉ màn Kế Hoạch Tháng / Hỗ Trợ Vận Hành dùng (ops). Khoá ở
  // ceo/operations/admin trong 0105, nên role khác gọi cũng chỉ nhận về rỗng.
  useEffect(() => {
    if (!authUserId || !isOpsRole) return;
    let cancelled = false;
    setEngineParamsLoading(true);
    fetchEngineParams()
      .then((r) => { if (cancelled) return; setEngineParams(r.params); setEngineParamsUpdatedAt(r.updatedAt); setEngineParamsError(null); })
      .catch((e) => { if (!cancelled) setEngineParamsError(`Không tải được tham số engine (dùng mặc định): ${errorMessage(e)}`); })
      .finally(() => { if (!cancelled) setEngineParamsLoading(false); });
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
        setPhase19Error(err.message ?? "Không tải được Lịch Sử Rate Card — thử tải lại trang.");
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
        setPhase7Error(err.message ?? "Không tải được dữ liệu Finance — thử tải lại trang.");
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
        setPhaseB1Error(err.message ?? "Không tải được danh sách sản phẩm lên live.");
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
        setPhaseC3Error(err.message ?? "Không tải được Scheme khuyến mãi — thử tải lại trang.");
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  // Đi qua `/api/admin/ai-agent-prompts` của server.ts — request CHẬM NHẤT cả đợt đăng nhập
  // (đo 2026-10-01: 1.345 ms, trong khi 3 cụm dữ liệu lõi xong ở 346 ms) mà chỉ màn AI Training đọc.
  const aiPromptsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authUserId || currentRole !== "admin" || !TABS_NEED_AI_PROMPTS.has(activeTab)) {
      setAiAgentPromptsLoading(false);
      return;
    }
    if (aiPromptsLoadedRef.current === authUserId) return;
    aiPromptsLoadedRef.current = authUserId;
    let cancelled = false;
    setAiAgentPromptsLoading(true);
    fetchAiAgentPrompts()
      .then((p) => {
        if (cancelled) return;
        setAiAgentPrompts(p);
        setAiAgentPromptsError(null);
      })
      .catch((err) => {
        aiPromptsLoadedRef.current = null;
        if (cancelled) return;
        setAiAgentPromptsError(err.message ?? "Không tải được AI Training Center — thử tải lại trang.");
      })
      .finally(() => {
        if (!cancelled) setAiAgentPromptsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId, currentRole, activeTab]);

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

  // `fetchTikTokStatus` đi qua `/api/tiktok/status` của server.ts và server GỌI TIẾP sang TikTok — nạp
  // lúc đăng nhập là bắt mọi role trả một lượt gọi API bên thứ ba cho màn mà chỉ ops mở tới.
  const tiktokLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authUserId) return;
    if (!TABS_NEED_TIKTOK.has(activeTab)) return;
    if (tiktokLoadedRef.current === authUserId) return;
    tiktokLoadedRef.current = authUserId;
    refreshTikTokStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, activeTab]);

  return {
    rolePermissions,
    setRolePermissions,
    phase6Loading,
    setPhase6Loading,
    phase6Error,
    setPhase6Error,
    financeRecords,
    setFinanceRecords,
    phase7Error,
    setPhase7Error,
    tiktokStatus,
    setTiktokStatus,
    tiktokStatusLoading,
    setTiktokStatusLoading,
    tiktokStatusError,
    setTiktokStatusError,
    tiktokWebhookEvents,
    setTiktokWebhookEvents,
    aiAgentPrompts,
    setAiAgentPrompts,
    aiAgentPromptsLoading,
    setAiAgentPromptsLoading,
    aiAgentPromptsError,
    setAiAgentPromptsError,
    auditLogs,
    setAuditLogs,
    phase5Error,
    setPhase5Error,
    users,
    setUsers,
    phase4Error,
    setPhase4Error,
    talents,
    setTalents,
    studios,
    setStudios,
    equipments,
    setEquipments,
    phase1Error,
    setPhase1Error,
    rawSessions,
    setSessions,
    monthlyReports,
    setMonthlyReports,
    shiftSlots,
    setShiftSlots,
    planTargetsBySlotId,
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
    setEngineParamsError,
    engineParamsLoading,
    setEngineParamsLoading,
    nowMs,
    setNowMs,
    sessionsError,
    setSessionsError,
    brands,
    setBrands,
    brandsLoaded,
    setBrandsLoaded,
    phase3Error,
    setPhase3Error,
    brandPlatformRates,
    setBrandPlatformRates,
    brandStudios,
    setBrandStudios,
    brandChannels,
    setBrandChannels,
    shiftRegistrations,
    setShiftRegistrations,
    recurringShiftTemplates,
    setRecurringShiftTemplates,
    phase14Error,
    setPhase14Error,
    talentRateHistory,
    setTalentRateHistory,
    brandPlatformRateHistory,
    setBrandPlatformRateHistory,
    phase19Error,
    setPhase19Error,
    brandSkus,
    setBrandSkus,
    phaseB1Error,
    setPhaseB1Error,
    promoSchemes,
    setPromoSchemes,
    phaseC3Error,
    setPhaseC3Error,
    talentsLoadedFor,
    setTalentsLoadedFor,
    sessionsLoadedFor,
    setSessionsLoadedFor,
    reportsLoadedFor,
    setReportsLoadedFor,
    permissionsNonce,
    setPermissionsNonce,
    authUserId,
    sessions,
    planTargetsBySessionId,
    coreDataReady,
    reloadRolePermissions,
    refreshTikTokStatus
  };
}
