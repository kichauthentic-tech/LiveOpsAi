import React from "react";
import { BookOpen, BrainCircuit, Briefcase, Building2, CalendarCheck2, CalendarClock, Calendar as CalendarIcon, CalendarRange, Activity, Database, DollarSign, FileSignature, FileText, LayoutDashboard, LayoutGrid, Link2, Megaphone, Package, Radio, Send, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { PermissionKey, UserRole } from "../types";

// Cấu hình sidebar + vài hằng số điều hướng, tách khỏi App.tsx 2026-10-01 (App.tsx 2.867 dòng).
// Đây là DỮ LIỆU thuần, chỉ phụ thuộc `currentRole` — không đọc state, không gọi mạng. Để trong
// App.tsx thì mỗi lần sửa một nhãn menu lại phải cuộn qua 1.700 dòng state/effect/handler.

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm: PermissionKey | undefined;
  badge?: string;
}

/**
 * Phạm vi kênh của từng màn (Bước 3 lộ trình đa sàn, 07/10). Sàn KHÔNG còn là workspace: một workspace Agency + một workspace mỗi
 * brand, sidebar không đổi khi đổi sàn; màn có số theo sàn hiện thanh chọn sàn ở đầu nội dung.
 *   "all" = màn mọi kênh: thêm lựa chọn "Tất cả" — hiện khối RIÊNG từng sàn, không có số hiệu suất gộp hai sàn.
 *   "one" = việc trên dữ liệu của đúng một gian hàng (kế hoạch, đối soát, report, Ads, Dữ Liệu Gốc…): chọn một sàn.
 * Màn không có ở đây (lịch toàn agency, nhân sự ca, talent, studio, CRM, finance, hệ thống) đã nhìn mọi kênh sẵn.
 */
export const TAB_CHANNEL_SCOPE: Record<string, "all" | "one"> = {
  agency_overview: "all",
  sessions: "all",
  host_performance: "all",
  brands_overview: "all",
  report_publish_board: "all",
  month_plan: "one",
  ops_support: "one",
  brand_dashboard: "one",
  brand_calendar: "all",
  brand_sessions: "all",
  brand_skus: "one",
  brand_monthly_report: "one",
  brand_commitment_view: "one",
  brand_next_month_plan: "one",
  brand_affiliate: "one",
  brand_ads_report: "one",
  brand_dataraw: "one"
};

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Các tab mà nội dung chính là lưới lịch — bỏ giới hạn max-w-7xl để lấy hết chiều ngang
// (lưới 7 cột / ma trận 5 khung giờ cần ~150px mỗi ô). Không còn tự thu
// gọn sidebar theo tab — xem `autoCollapse`.
export const CALENDAR_TABS = new Set(["calendar", "brand_calendar", "shift_scheduling"]);

// Tab không đọc ca / talent / report tháng — không phải chờ đợt nạp đầu (coreDataReady). Mọi tab khác
// hiện khung chờ tới khi nạp xong, thay vì vẽ "0 ca" / "Chưa có…" giả (audit UX 2026-09-29).
// (Gần như tab nào cũng nhận `sessions` — kể cả CRM/Studios/Rate Card — nên danh sách này cố ý ngắn.)
export const TABS_WITHOUT_CORE_DATA = new Set(["account_settings", "tiktok_api"]);

// Màn nhập số liệu: phần chính (chọn file, lịch sử import) không đọc ca/talent/report — chỉ cần biết brand và kênh để chọn sàn.
// Chờ `shellDataReady` (brand + kênh) thay vì `coreDataReady` (cả ca/talent/report): danh sách ca là thứ nặng nhất lúc mở app
// (1.500 ca, tăng ~400 ca/tháng) nên không để nó giữ màn nhập số liệu. Phần cần ca TRONG các màn này (Nạp bù, Đối soát, tháng
// mặc định của Nhập Ads) tự chờ `coreReady`/sessions — KHÔNG vẽ "0 ca" giả. Thêm tab vào đây chỉ khi đã kiểm nó không đọc
// `sessions`/`talents`/`monthlyReports` ngoài các khối tự chờ (test `tests/shellOnlyTabs.test.ts` canh hai tab hiện có).
export const TABS_NEEDING_SHELL_ONLY = new Set(["brand_dataraw", "brand_ads_report"]);

// Tab render được nhưng cố ý KHÔNG nằm trong sidebar (vào từ menu user ở Header). Phải khai
// báo ở đây vì isTabAllowed coi "không có nav item" là không được phép.
export const TABS_WITHOUT_NAV_ITEM = new Set(["account_settings"]);

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
export function getDefaultTabForRole(role: UserRole): string {
  if (role === "brand") return "brand_calendar";
  if (role === "talent") return "my_shifts";
  return "calendar";
}

export function agencyNavGroups(currentRole: UserRole): NavGroup[] {
  // Badge trên nav: chỉ dùng khi người dùng thật sự cần biết trước khi bấm (hiện: "Chưa dùng" ở TikTok API). Các
  // badge LIVE/SMART/NEW/CUSTOM/ADMIN đã bỏ (audit Module 2, 2026-09-18) — "NEW" trên tab đã có
  // nhiều tháng, "SMART"/"LIVE" không mang thông tin; badge nào cũng có thì không badge nào được đọc.
  // Navigation Items mapped to permission keys, grouped theo luồng công việc — đây là
  // nhóm cho Agency Workspace (nhìn xuyên mọi Brand). Xem BRAND_NAV_GROUPS bên dưới cho
  // Brand Workspace (Giai đoạn A, docs/WORKSPACE_HISTORY.md).
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
              // Hỗ Trợ Vận Hành: 28/09 gộp vào Dashboard brand; 07/10 user chốt tách lại — benchmark ca sắp live chỉ ở đây, không ở Dashboard brand.
              { id: "ops_support", label: "Hỗ Trợ Vận Hành", icon: Activity, perm: "manage_calendar" as PermissionKey }
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
        // "Cam Kết Hợp Đồng" riêng đã gộp (06/10, user: nhập một chỗ): điều khoản hợp đồng + giá + phòng live ở CRM →
        // "Hợp đồng & giá"; giờ cam kết của một tháng ở Kế Hoạch Tháng; tiến độ giao giờ ở Toàn Cảnh Brand / Nhân sự ca.
        // Badge "Chưa dùng": chờ TikTok cấp quyền (WORKSPACE_DESIGN §2) — người mới cần biết trước khi bấm.
        { id: "tiktok_api", label: "TikTok API", icon: Link2, perm: "manage_tiktok_api" as PermissionKey, badge: "Chưa dùng" },
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
  return AGENCY_NAV_GROUPS;
}

export function brandNavGroups(currentRole: UserRole): NavGroup[] {

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
        // Dashboard brand (2026-09-28): trong tháng — run-rate theo plan, vì sao, đề xuất, soát kế hoạch, phương
        // án bù + benchmark (gộp Hỗ Trợ Vận Hành). Role brand thấy bản rút gọn (component tự ẩn phần ops).
        { id: "brand_dashboard", label: "Dashboard", icon: LayoutDashboard, perm: undefined },
        { id: "brand_calendar", label: "Lịch Vận Hành", icon: CalendarIcon, perm: undefined },
        { id: "brand_sessions", label: "Sổ Ca", icon: BookOpen, perm: undefined },
        { id: "brand_skus", label: "Sản phẩm lên live", icon: Package, perm: undefined },
        { id: "brand_monthly_report", label: "Report Tháng", icon: FileText, perm: undefined },
        // Hợp Đồng bản CHỈ ĐỌC cho khách (Đợt C/1, migration 0108): giờ cam kết + tiến độ + giá theo sàn. Gộp 06/10 hai tab
        // "Cam Kết Hợp Đồng" + "Rate Card" (hai nửa của một hợp đồng). Brand đọc cam kết qua view `brand_commitment_progress`
        // (đã bỏ cột note nội bộ), giá qua RLS 0105; chỗ sửa là CRM bên Agency.
        { id: "brand_commitment_view", label: "Hợp Đồng", icon: FileSignature, perm: undefined },
        // Kế hoạch tháng sau, chỉ đọc + nút xác nhận (Đợt C/2, migration 0110). Đường đọc đã mở từ
        // 0105 (brand_month_plans_read_scoped); xác nhận đi qua RPC confirm_month_plan riêng.
        { id: "brand_next_month_plan", label: "Kế Hoạch Tháng Sau", icon: CalendarCheck2, perm: undefined },
        // Trang Affiliate (2026-09-22) — bảng phân tích theo TỪNG PHIÊN của creator affiliate,
        // tách hẳn khỏi form Report Tháng (yêu cầu ops). Brand xem được (migration 0102 nới RLS
        // đọc), chỉ ops mới sửa được — khác "Nhập Ads"/"Dữ Liệu Gốc" vốn ẩn với brand.
        { id: "brand_affiliate", label: "Affiliate", icon: Users, perm: undefined },
        // "Nhập Ads" (2026-09-21): phần nhập tay tách khỏi Report Tháng, ops-only như Dữ Liệu Gốc.
        ...(currentRole === "brand"
          ? []
          : [
              { id: "brand_ads_report", label: "Nhập Ads", icon: Megaphone, perm: undefined },
              { id: "brand_dataraw", label: "Dữ Liệu Gốc", icon: Database, perm: undefined }
            ]),
      ],
    },
  ];
  return BRAND_NAV_GROUPS;
}
