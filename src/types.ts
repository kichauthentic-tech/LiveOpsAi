export type UserRole = "ceo" | "operations" | "brand" | "talent" | "moderator" | "admin";

export type PermissionKey =
  | "view_financials"
  | "view_executive_brief"
  | "manage_sessions"
  | "manage_calendar"
  | "generate_scripts"
  | "manage_talents"
  | "manage_studios_gear"
  | "manage_crm_projects"
  | "manage_tiktok_api"
  | "manage_finance_hr"
  | "manage_ai_agents"
  | "manage_users_permissions"
  | "export_reports";

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  category: "Tổng Quan & Báo Cáo" | "Vận Hành & Studio" | "Nội Dung & AI" | "Quản Trị System & Tài Chính";
  description: string;
}

export type RolePermissionsMap = Record<UserRole, Record<PermissionKey, boolean>>;

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  customRoleTitle: string;
  avatar: string;
  status: "Active" | "Inactive";
  assignedBrandId?: string;
  assignedTalentId?: string;
  lastLogin: string;
  customPermissionOverrides?: Partial<Record<PermissionKey, boolean>>;
  isCustom?: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  performedBy: string;
  action: string;
  details: string;
  category: "Permission Change" | "Role Update" | "User Status" | "Security Alert";
  isCustom?: boolean;
}

export interface Brand {
  id: string;
  name: string;
  logo: string;
  industry: string;
  contactName: string;
  phone: string;
  email: string;
  activeCampaigns: number;
  totalGmv: number;
  contractStatus: "Active" | "Pending" | "Completed";
  owner: string;
  ownerUserId?: string;
  // "gmv_commission" = doanh thu agency tính theo %GMV (session_finance.agencyCommissionRate,
  // mặc định trước Giai đoạn 15). "hourly" = tính theo giờ live thật × BrandPlatformRate.ratePerHour.
  billingModel: "gmv_commission" | "hourly";
  isCustom?: boolean;
}

export interface Talent {
  id: string;
  name: string;
  avatar: string;
  role: "Host" | "KOC" | "KOL" | "MC";
  gender: string;
  niches: string[];
  followersTikTok: number;
  avgGmvPerSession: number;
  ctrAvg: number; // e.g. 8.5%
  cvrAvg: number; // e.g. 4.2%
  ratePerSession: number;
  commissionRate: number; // e.g. 3%
  overallScore: number; // 0-100
  availabilityStatus: "Available" | "Busy" | "On Live";
  brandsWorkedWith: string[];
  phone: string;
  isCustom?: boolean;
}

export interface Studio {
  id: string;
  name: string;
  roomNumber: string;
  capacity: number;
  theme: string;
  status: "Live Now" | "Booked" | "Available" | "Maintenance";
  currentSessionId?: string;
  equipmentCount: number;
  isCustom?: boolean;
  dailyAvailableHours: number;
}

export interface Equipment {
  id: string;
  qrCode: string;
  name: string;
  category: "Camera" | "Lighting" | "Audio" | "PC/Switcher" | "Teleprompter";
  model: string;
  assignedStudioId?: string;
  assignedStudioName?: string;
  status: "In Use" | "In Stock" | "Maintenance" | "Damaged";
  lastCheckDate: string;
  isCustom?: boolean;
}

export interface ProductSKU {
  id: string;
  code: string;
  name: string;
  category: string;
  originalPrice: number;
  livePrice: number;
  commission: number;
  stock: number;
  soldInSession: number;
  clickCount: number;
  ctr: number;
  cvr: number;
}

export interface MinuteMetric {
  minute: number; // 0 to 60 or 120
  timeString: string; // e.g. "08:15"
  viewers: number;
  peakViewers: number;
  gmvCumulative: number;
  gmvPerMinute: number;
  ctr: number;
  cvr: number;
  productClicks: number;
  comments: number;
  eventTrigger?: string; // e.g. "Ghim Voucher 50k", "Host thử test son", "Flash Sale Combo"
}

export interface ChecklistItem {
  id: string;
  task: string;
  category: "Tech" | "Studio" | "Product" | "Host & Script" | "TikTok App";
  completed: boolean;
  assignedTo: string;
}

export interface LiveSession {
  id: string;
  title: string;
  brandId: string;
  brandName: string;
  projectId?: string;
  campaignId?: string;
  shopTikTokHandle: string;
  studioId: string;
  studioName: string;
  hostId: string;
  hostName: string;
  assistantId?: string;
  assistantName: string;
  coHostId?: string;
  coHostName: string;
  platform: "TikTok" | "Shopee";
  date: string;
  startTime: string;
  endTime: string;
  status: "Live Now" | "Upcoming" | "Completed" | "Cancelled";
  targetGmv: number;
  actualGmv: number;
  totalOrders: number;
  avgWatchTimeSeconds: number;
  peakViewers: number;
  totalViews: number;
  ctrAvg: number;
  cvrAvg: number;
  skus: ProductSKU[];
  checklist: ChecklistItem[];
  minuteMetrics: MinuteMetric[];
  aiAnalysis?: {
    overallRating: string;
    gmvSummary: string;
    keyHighlights: string[];
    topMistakes: string[];
    hostCoaching: {
      closingSkillScore: number;
      energyScore: number;
      productKnowledgeScore: number;
      speechRateScore: number;
      feedback: string;
    };
    actionableRecommendations: string[];
  };
  isCustom?: boolean;
}

export interface AgencyProject {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  budget: number;
  kpiGmv: number;
  actualGmv: number;
  startDate: string;
  endDate: string;
  status: "In Progress" | "Planning" | "Completed" | "Paused";
  totalSessionsPlanned: number;
  sessionsCompleted: number;
  teamLead: string;
  teamLeadUserId?: string;
  isCustom?: boolean;
}

export interface SessionFinance {
  sessionId: string;
  agencyCommissionRate: number; // % GMV
  studioCost: number;
  adsCost: number;
  hostFixRateOverride?: number;
  hostCommissionRateOverride?: number; // % GMV
  approvalStatus: "pending" | "approved" | "rejected";
  approvedByUserId?: string;
  approvedAt?: string;
  notes: string;
}

export interface BrandPlatformRate {
  id: string;
  brandId: string;
  platform: "TikTok" | "Shopee";
  ratePerHour: number;
}

// Giai đoạn 19 — lịch sử rate theo thời gian, tự động ghi bởi DB trigger mỗi khi
// talents.rate_per_session/commission_rate đổi. Dùng để tra đúng rate tại ngày của 1 session
// cũ thay vì đọc giá trị hiện tại của Talent (xem finance.ts findTalentRateAsOf).
export interface TalentRateHistoryEntry {
  id: string;
  talentId: string;
  ratePerSession: number;
  commissionRate: number;
  effectiveFrom: string; // "YYYY-MM-DD"
  effectiveTo?: string; // "YYYY-MM-DD", undefined = đang áp dụng
}

// Tương tự TalentRateHistoryEntry nhưng cho brand_platform_rates (khoá theo brand+platform).
export interface BrandPlatformRateHistoryEntry {
  id: string;
  brandId: string;
  platform: "TikTok" | "Shopee";
  ratePerHour: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

// Giai đoạn 20 — theo dõi công nợ Brand: tính xong doanh thu không có nghĩa đã thu được tiền.
export interface BrandInvoice {
  id: string;
  brandId: string;
  month: string; // "YYYY-MM"
  amount: number;
  status: "unpaid" | "partial" | "paid";
  dueDate?: string;
  paidAmount: number;
  paidAt?: string;
  notes: string;
  createdBy?: string;
}

// Giai đoạn B1 — SKU Showcase & Hero Product Catalog (Brand Workspace, xem
// WORKSPACE_DESIGN.md#6). Danh sách SKU lên sóng của 1 brand, không dùng chung với module nào
// khác.
export interface BrandSku {
  id: string;
  brandId: string;
  name: string;
  skuCode: string;
  flashPrice: number;
  originalPrice: number;
  isHero: boolean;
  pinOrder: number;
  clearanceRate: number; // % xả kho, 0-100
  status: "active" | "inactive";
  notes: string;
  createdBy?: string;
}

// Giai đoạn B2 — Product Sample Inventory (Agency Workspace, nhóm "Content & Quality", xem
// WORKSPACE_DESIGN.md#6). Tracking hàng mẫu vật lý brand gửi tới Studio, agency-wide (không thuộc
// Brand Workspace) — studioId có thể rỗng khi hàng mẫu đang "in_transit", chưa gán tới Studio nào.
export interface ProductSample {
  id: string;
  brandId: string;
  studioId?: string;
  productName: string;
  sampleCode: string;
  quantity: number;
  status: "in_transit" | "at_studio" | "returned" | "damaged" | "lost";
  locationNote: string;
  notes: string;
  createdBy?: string;
}

// Giai đoạn B3 — Live Stream Incident Log (Agency Workspace, nhóm "Content & Quality", xem
// WORKSPACE_DESIGN.md#6). Nhật ký sự cố khi live, liên kết session_id.
export interface LiveStreamIncident {
  id: string;
  sessionId: string;
  category: "network_drop" | "cart_locked" | "host_late" | "voucher_exhausted" | "other";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  resolution: string;
  status: "open" | "resolved";
  reportedBy?: string;
}

export interface ShiftSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  brandId?: string;
  brandName: string;
  platform: "TikTok" | "Shopee";
  studioId?: string;
  studioName: string;
  notes: string;
  status: "open" | "finalized" | "cancelled";
  sessionId?: string;
  createdBy?: string;
  templateId?: string;
  campaignId?: string;
}

// Quy tắc lặp theo thứ trong tuần — sinh hàng loạt ShiftSlot cho 1 tháng
// thay vì ops tạo tay từng ca (xem migration 0015).
export interface RecurringShiftTemplate {
  id: string;
  weekday: number; // 0=CN...6=Thứ 7, khớp Date.getDay()
  brandId?: string;
  brandName: string;
  platform: "TikTok" | "Shopee";
  startTime: string;
  endTime: string;
  studioId?: string;
  studioName: string;
  notes: string;
  active: boolean;
  createdBy?: string;
  campaignId?: string;
}

// Chu kỳ vận hành theo tháng của 1 brand (Daily/Mega D-Day/Mid-month/Payday...)
// với KPI GMV đã chốt trước — dùng làm căn cứ phân bổ giờ live (Giai đoạn 15).
// Khác với AgencyProject (dự án hợp tác dài hạn, quản lý ở CrmProjects.tsx):
// Campaign là chu kỳ ngắn hơn, gắn trực tiếp vào ShiftSlot/RecurringShiftTemplate
// qua campaignId để lên lịch live.
export interface Campaign {
  id: string;
  brandId: string;
  brandName: string;
  name: string;
  type: "daily" | "mega" | "mid_month" | "payday" | "other";
  targetGmv: number;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "completed" | "cancelled";
  // Đào tạo/brief Host theo campaign (mục #6 CEO đã duyệt) — hiển thị cho
  // Host/Trợ live khi xem ca thuộc campaign này.
  hostBriefing: string;
  createdBy?: string;
  // Luồng duyệt với Brand (Giai đoạn 16).
  approvalStatus: "draft" | "sent_for_approval" | "revision_requested" | "approved";
  sentAt?: string;
  approvedAt?: string;
  // Đánh giá cuối Campaign & quyết định gia hạn Brand (Giai đoạn 25, Bước 11
  // workflow) — điền sau khi campaign đã "completed", so KPI mục tiêu
  // (targetGmv) với GMV thật đạt được.
  outcome?: "kpi_met" | "kpi_missed" | "partial";
  renewalDecision?: "renew" | "at_risk" | "churned";
  reviewNotes: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface CampaignRevisionNote {
  id: string;
  campaignId: string;
  note: string;
  requestedBy?: string;
  requestedByName: string;
  createdAt: string;
}

export interface ShiftRegistration {
  id: string;
  slotId: string;
  talentId: string;
  registeredAt: string;
}

export interface TikTokConnectionStatus {
  configured: boolean;
  connected: boolean;
  shopId?: string | null;
  shopName?: string | null;
  scope?: string | null;
  accessTokenExpiresAt?: string | null;
  updatedAt?: string | null;
}

export interface TikTokWebhookEvent {
  id: string;
  eventType: string;
  shopId: string;
  payload: Record<string, unknown>;
  sessionId?: string | null;
  receivedAt: string;
}

export interface WorkflowRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  lastRun?: string;
  executionsCount: number;
  isCustom?: boolean;
}

export interface AiAgentPrompt {
  agentKey: string;
  name: string;
  description: string;
  category: string;
  systemPrompt: string;
  defaultPrompt: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface ScriptDialogueLine {
  speaker: string; // vd "Host A", "Host B", hoặc tên MC cụ thể
  line: string; // thoại đầy đủ, đọc gần như nguyên văn
}

export interface ScriptGiftTier {
  tier: string; // vd "Tầng 1 - Quà tại chỗ"
  condition: string; // điều kiện nhận (mua bao nhiêu / hóa đơn từ bao nhiêu)
  gifts: string; // liệt kê quà tặng cụ thể
}

export interface ScriptMinigame {
  name: string;
  howToPlay: string; // các bước tham gia
  hashtagSyntax: string; // cú pháp comment/hashtag cụ thể để hợp lệ
  winCondition: string; // điều kiện thắng
  prizeCount: string; // số lượng giải
  prize: string; // phần thưởng
}

export interface ScriptFaqItem {
  question: string; // câu hỏi/thắc mắc khán giả có thể đặt ra
  answer: string; // câu trả lời mẫu Host có thể đọc gần như nguyên văn
}

export interface ScriptPart {
  partName: string; // vd "Phần 1 - Giới thiệu CTKM"
  timeCode: string; // vd "19:00 - 19:30"
  durationMinutes: number;
  keyActivities: string[]; // các hoạt động chính, đánh số theo trình tự
  focusProduct: string;
  usp: string; // USP/RTB (Reason To Believe) được nhấn mạnh trong phần này
  giftTiers: ScriptGiftTier[]; // cấu trúc quà tặng theo tầng (nếu có push sale trong phần này)
  dialogue: ScriptDialogueLine[]; // kịch bản thoại ĐẦY ĐỦ, dài, tự nhiên, luân phiên giữa các Host
  minigame?: ScriptMinigame;
  faqBank: ScriptFaqItem[]; // ngân hàng câu hỏi thường gặp + câu trả lời mẫu cho riêng phần này
  urgencyPush: string; // câu tạo khan hiếm/countdown để chốt đơn
  complianceNotes: string[]; // lưu ý Do & Don't cần tuân thủ khi đọc phần này
}

export interface GeneratedScript {
  title: string;
  campaignHeader: { channel: string; hostSetup: string; totalDuration: string };
  opening: { time: string; hook: string; action: string; dialogue: ScriptDialogueLine[] };
  parts: ScriptPart[];
  closing: { time: string; strategy: string; callToAction: string; dialogue: ScriptDialogueLine[] };
}

export interface StrategicDirective {
  id: string;
  code: string;
  title: string;
  description: string;
  department: "Operations" | "Content & AI" | "Talent Management" | "Brand Client" | "Finance & Admin";
  assignedRole: UserRole | "all";
  assigneeName: string;
  priority: "Urgent" | "High" | "Medium";
  targetKpi: string;
  deadline: string;
  status: "Pending" | "In Progress" | "Needs BOD Support" | "Completed";
  progressPercent: number;
  notesFromLead?: string;
  createdAt: string;
  isCustom?: boolean;
}

