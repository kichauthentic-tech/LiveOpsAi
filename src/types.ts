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
  shopTikTokHandle: string;
  studioId: string;
  studioName: string;
  hostId: string;
  hostName: string;
  assistantId?: string;
  assistantName: string;
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

