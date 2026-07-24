import React, { useState } from "react";
import {
  Play,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Building2,
  Users,
  Radio,
  Building,
  QrCode,
  FileText,
  Activity,
  DollarSign,
  Send,
  Zap,
  ShieldAlert,
  AlertTriangle,
  Bot,
  ShieldCheck,
  Award,
  BarChart3,
  Check,
  ChevronRight,
  Lock,
  MessageSquare,
  Clock,
  Briefcase
} from "lucide-react";

type ScenarioType = "standard_campaign" | "emergency_recovery" | "multi_role_audit";

interface FlowStep {
  id: number;
  moduleCode: string;
  moduleName: string;
  roleContext: "ceo" | "operations" | "brand" | "talent";
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  badgeColor: string;
  dataPayload: {
    label: string;
    value: string;
    highlight?: boolean;
  }[];
  systemActions: string[];
  aiInsight?: string;
}

const SCENARIO_1_STEPS: FlowStep[] = [
  {
    id: 1,
    moduleCode: "M01",
    moduleName: "CRM & Brand Lead",
    roleContext: "brand",
    title: "1. Tiếp Nhận Project & Ký Hợp Đồng Campaign",
    subtitle: "Brand Cocoon Vietnam yêu cầu Livestream Mega Sale 8.8",
    description: "Khởi tạo deal trên CRM với ngân sách 120M VNĐ, chỉ tiêu GMV tối thiểu 500M VNĐ cho 12 SKUs ngành Mỹ Phẩm.",
    badge: "CRM DEAL CREATED",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    dataPayload: [
      { label: "Khách hàng Brand", value: "Cocoon Vietnam Organic" },
      { label: "Mục tiêu GMV Target", value: "500,000,000 VNĐ", highlight: true },
      { label: "Số lượng SKUs Live", value: "12 Mỹ Phẩm Bán Chạy" },
      { label: "Ngân sách Booking", value: "120,000,000 VNĐ" }
    ],
    systemActions: [
      "Tự động tạo Project Code: PRJ-COCOON-88",
      "Kích hoạt Workflow Module 13: Gửi Yêu Cầu Ghép Host sang Module 03"
    ],
    aiInsight: "AI CRM Agent gợi ý: Brand Cocoon có CVR cao nhất vào khung giờ 19:00 - 22:00 Thứ 6."
  },
  {
    id: 2,
    moduleCode: "M03",
    moduleName: "Talent Management & AI Matcher",
    roleContext: "operations",
    title: "2. AI Matcher Đề Xuất & Chốt Booking Host",
    subtitle: "Thuật toán AI quét 24 KOC trong Database để tìm Host phù hợp nhất",
    description: "AI tính toán điểm số Match Score dựa trên lịch sử CVR Mỹ phẩm (5.2%), năng lượng nói liên tục 3h và phong cách nói về thuần chay.",
    badge: "AI HOST MATCHED",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    dataPayload: [
      { label: "Host Được Chọn", value: "Yến Nhi (Beauty Specialist)", highlight: true },
      { label: "AI Match Score", value: "98.5 / 100 Điểm" },
      { label: "CTR / CVR Lịch Sử", value: "CTR 18.2% | CVR 5.2%" },
      { label: "Thù Lao Commission", value: "5% GMV + Base Salary 3M" }
    ],
    systemActions: [
      "Khóa lịch Host Yến Nhi từ 19:00 - 22:00 ngày 08/08/2026",
      "Đẩy thông báo xác nhận lịch qua Telegram Bot cho Talent"
    ],
    aiInsight: "AI Talent Agent: Yến Nhi từng đạt GMV 620M VNĐ cho dòng sản phẩm Bơ Cung Cấp Ẩm Cocoon."
  },
  {
    id: 3,
    moduleCode: "M04 & M05",
    moduleName: "Studio & Gear Management",
    roleContext: "operations",
    title: "3. Đặt Phòng Studio 01 & Quét QR Kiểm Kê Thiết Bị",
    subtitle: "Gán Studio Beauty Master & xác nhận 4/4 thiết bị sẵn sàng",
    description: "Bộ phận kĩ thuật dùng Camera quét mã QR dán trên từng thiết bị: Máy quay Sony A7SIII, Mic Shure Wireless, Switcher Blackmagic & Đèn Softbox.",
    badge: "EQUIPMENT QR CHECKED",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    dataPayload: [
      { label: "Phòng Studio", value: "Studio 01 (Beauty Specialist Theme)" },
      { label: "Trạng thái QR Code", value: "4/4 Thiết Bị Đã Quét Valid", highlight: true },
      { label: "Nhiệt Độ Màu Đèn", value: "5600K (Tối Ưu Da Mặt)" },
      { label: "Tốc Độ Mạng Live", value: "1,000 Mbps Fiber Dedicated" }
    ],
    systemActions: [
      "Khóa Studio 01 trên Lịch Vận Hành Tránh Trùng Lịch",
      "Ghi nhận Nhật Ký Bảo Trì Mã QR: Thiết Bị Đạt Chuẩn 100%"
    ]
  },
  {
    id: 4,
    moduleCode: "M09",
    moduleName: "AI Script Generator",
    roleContext: "operations",
    title: "4. Sinh Kịch Bản Live Thông Minh Bằng Gemini AI",
    subtitle: "Tạo cấu trúc Hook 5s, Deal Flash Sale & Xử Lý Từ Chối",
    description: "Gemini AI đọc 12 SKUs Cocoon, tạo kịch bản 180 phút chia nhỏ thành từng khung 15 phút với deal shock mua 1 tặng 1.",
    badge: "AI SCRIPT READY",
    badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
    dataPayload: [
      { label: "Cấu trúc Hook 5s", value: "Tẩy xơ dừa chỉ 88K - Duy nhất 100 suất" },
      { label: "Số Lượng Trigger deal", value: "8 Khung Flash Sale Giờ Vàng", highlight: true },
      { label: "Xử lý câu hỏi khó", value: "15 Kịch bản chống kích ứng da" },
      { label: "Đồng bộ Máy Nhắc Chữ", value: "Đẩy sang iPad Studio 01" }
    ],
    systemActions: [
      "Xuất file PDF Script & đẩy trực tiếp vào Teleprompter iPad Studio",
      "Lưu kịch bản vào Content Library (Module 10)"
    ],
    aiInsight: "Gemini Script Agent: Đã bổ sung 3 câu thoại chốt deal tạo cảm giác khan hiếm cực độ."
  },
  {
    id: 5,
    moduleCode: "M06 & M07",
    moduleName: "Livestream Hub & TikTok API",
    roleContext: "operations",
    title: "5. Lên Sóng Live & Đồng Bộ API TikTok Shop Real-time",
    subtitle: "Kết nối OBS Studio, ghi nhận từng giao dịch đơn hàng phát sinh",
    description: "Phiên live bắt đầu lúc 19:00. Webhook TikTok API liên tục đẩy về chỉ số Mắt xem, Tỷ lệ click giỏ hàng (CTR) và GMV theo thời gian thực.",
    badge: "LIVE STREAMING ACTIVE",
    badgeColor: "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse",
    dataPayload: [
      { label: "Trạng thái Luồng OBS", value: "🔴 STREAMING LIVE (1080p 60fps)" },
      { label: "Mắt Xem Đỉnh (Peak)", value: "14,850 Viewers", highlight: true },
      { label: "Tổng Đơn Hàng Chiều", value: "1,842 Đơn Hàng" },
      { label: "Tạm Tính GMV", value: "542,600,000 VNĐ" }
    ],
    systemActions: [
      "Ghi nhận luồng Video Replay 4K tự động",
      "Tự động cảnh báo Moderator khi kho SKU Tẩy Cà Phê còn dưới 10 hũ"
    ]
  },
  {
    id: 6,
    moduleCode: "M08",
    moduleName: "AI Live Analyst & Coach",
    roleContext: "ceo",
    title: "6. AI Phân Tích Hiệu Suất Post-Live & Chấm Điểm Host",
    subtitle: "Chấm điểm Host 94/100 & phân tích biểu đồ Retention từng phút",
    description: "Hệ thống AI tự động đối soát giữ chân người xem và đoạn Host chốt đơn bùng nổ nhất để rút kinh nghiệm cho ca live sau.",
    badge: "AI COACH EVALUATED",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    dataPayload: [
      { label: "Chấm Điểm Host Yến Nhi", value: "94 / 100 Điểm (Xung Lực Cực Tốt)", highlight: true },
      { label: "Tỷ Lệ Giữ Chân (Retention)", value: "4.8 Phút / Người (Cao hơn 35% trung bình)" },
      { label: "Khung Giờ Bùng Nổ", value: "20:15 - 20:45 (Tẩy Cà Phê Đắk Lắk)" },
      { label: "Tỷ lệ CVR Thực Tế", value: "5.45% (Vượt Mục Tiêu 4.5%)" }
    ],
    systemActions: [
      "Tự động cập nhật điểm Uy Tín & CVR vào Hồ Sơ Talent Yến Nhi",
      "Tạo bản tóm tắt Video Highlight gửi cho Brand"
    ],
    aiInsight: "AI Live Coach: Host có năng lượng cao nhất khi kêu gọi tim & đếm ngược deal Flash Sale 10s."
  },
  {
    id: 7,
    moduleCode: "M11 & M12",
    moduleName: "Finance P&L & HR Payroll",
    roleContext: "ceo",
    title: "7. Chốt Sổ P&L Phiên Live & Tự Động Tính Hoa Hồng Host",
    subtitle: "Hệ thống tính toán Lợi Nhuận Ròng & Bảng Lương Commission",
    description: "Tự động khấu trừ Chi phí Studio, Lương Host, Mã giảm giá, Thuế để tính ra Net Profit Margin đạt 18.2%. Tự động ghi nhận Payout cho Host.",
    badge: "P&L FINANCIAL CLOSED",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    dataPayload: [
      { label: "Tổng GMV Thực Thu", value: "542,600,000 VNĐ" },
      { label: "Chi Phí Vận Hành Studio", value: "12,500,000 VNĐ" },
      { label: "Hoa Hồng Commission Host", value: "27,130,000 VNĐ", highlight: true },
      { label: "Lợi Nhuận Ròng (Net Profit)", value: "98,750,000 VNĐ (18.2% Margin)" }
    ],
    systemActions: [
      "Tạo phiếu ghi nhận thù lao tự động vào Module 12 (HR Payroll)",
      "Đẩy dữ liệu P&L vào Báo Cáo Tài Chính Tổng Agency"
    ]
  },
  {
    id: 8,
    moduleCode: "M13 & M14",
    moduleName: "Workflow Auto & Brand Portal",
    roleContext: "brand",
    title: "8. Đẩy Báo Cáo Tự Động Qua Brand Portal & Zalo",
    subtitle: "Hoàn tất chu trình khép kín sau 12 giây khi hết sóng",
    description: "Brand Cocoon nhận được link Báo cáo Dashboard phân tích chuyên sâu ROI 4.5x, danh sách đơn hàng xuất file Excel và clip Replay.",
    badge: "FLOW COMPLETED",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/40 font-bold",
    dataPayload: [
      { label: "Chỉ Số ROI Brand", value: "4.5x Ngân Sách Booking", highlight: true },
      { label: "Thời Gian Đẩy Báo Cáo", value: "12 Giây Post-Live (Auto API)" },
      { label: "Đánh Giá Từ Brand", value: "5/5 Star Satisfaction" },
      { label: "Trạng Thái Hợp Đồng", value: "Nghiệm Thu & Chờ Thanh Toán" }
    ],
    systemActions: [
      "Gửi thông báo Zalo / Email tự động đến Giám Đốc Marketing Cocoon",
      "Lưu trữ toàn bộ Artifacts phiên live vào Cloud Archive"
    ],
    aiInsight: "System Complete: Luồng công việc khép kín từ CRM -> Talent -> Studio -> Live -> API -> P&L -> Brand Portal đã hoàn tất 100%!"
  }
];

const SCENARIO_2_STEPS: FlowStep[] = [
  {
    id: 1,
    moduleCode: "M07",
    moduleName: "TikTok Live Analytics",
    roleContext: "operations",
    title: "1. Phát Hiện Bất Thường: Mắt Xem Tụt Giảm Ở Phút 42",
    subtitle: "Phiên Live Coolmate Fashion gặp sự cố hẫng nhịp",
    description: "Webhook TikTok API liên tục cảnh báo lượt xem tụt từ 5,200 người xuống 1,100 người do Host chính gặp vấn đề khan tiếng.",
    badge: "ALERT DETECTED",
    badgeColor: "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse",
    dataPayload: [
      { label: "Tăng Trưởng Viewers", value: "-78% trong 5 phút", highlight: true },
      { label: "Chỉ Số Tụt Hẫng", value: "Retention Rate < 1.2 Phút" },
      { label: "Cảnh Báo Từ TikTok API", value: "Lượt tương tác bình luận chạm đáy" }
    ],
    systemActions: [
      "Phát âm thanh cảnh báo trên Dashboard Trưởng Ca Operations",
      "Kích hoạt AI Agent chẩn đoán nguyên nhân khẩn cấp"
    ]
  },
  {
    id: 2,
    moduleCode: "M16",
    moduleName: "AI Multi-Agent Center",
    roleContext: "ceo",
    title: "2. Hội Đồng AI Chẩn Đoán & Kích Hoạt Kịch Bản Giải Cứu",
    subtitle: "AI Live Coach đề xuất Đổi Host Dự Phòng & Tung Voucher 50%",
    description: "Trong vòng 15 giây, AI phân tích dữ liệu đề xuất điều Host dự phòng Nam Style ở Studio 02 sang tiếp quản luồng live.",
    badge: "AI AUTO-DIAGNOSED",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    dataPayload: [
      { label: "Chẩn Đoán AI", value: "Host kiệt sức & thiếu nhịp đếm deal" },
      { label: "Giải Pháp Đề Xuất", value: "Đổi Host Nam Style + Tung Flash Deal Áo Áo Polo 99K", highlight: true },
      { label: "Thời Gian Xử Lý AI", value: "0.8 Giây" }
    ],
    systemActions: [
      "Tự động thông báo sang iPad Studio 02 cho Host Nam Style",
      "Đẩy kịch bản cấp cứu lên Máy Nhắc Chữ Studio 01"
    ]
  },
  {
    id: 3,
    moduleCode: "M06 & M13",
    moduleName: "Workflow Emergency Action",
    roleContext: "operations",
    title: "3. Đổi Host Bán Hàng Real-Time & Phôi Phục Mắt Xem",
    subtitle: "Host Nam Style tiếp quản mic, tung Voucher độc quyền",
    description: "Host Nam Style vào vị trí với năng lượng bùng nổ, ghim ghim deal Áo Polo 99K. Lượt xem nhanh chóng tăng vọt trở lại 6,500 mắt xem.",
    badge: "METRICS RECOVERED",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    dataPayload: [
      { label: "Mắt Xem Phục Hồi", value: "6,520 Viewers (Tăng +490%)", highlight: true },
      { label: "Tốc Độ Đặt Hàng", value: "48 Đơn Hàng / Phút" },
      { label: "GMV Giải Cứu Thành Công", value: "215,000,000 VNĐ" }
    ],
    systemActions: [
      "Cập nhật nhật ký sự cố vào Hệ Thống Quản Lý Rủi Ro (Module 13)",
      "Ghi nhận điểm hỗ trợ cấp cứu cho Host Nam Style"
    ]
  }
];

const SCENARIO_3_STEPS: FlowStep[] = [
  {
    id: 1,
    moduleCode: "M14",
    moduleName: "Brand Client Portal",
    roleContext: "brand",
    title: "1. Brand Đăng Nhập Kiểm Tra Chi Tiết Doanh Thu SKU",
    subtitle: "Đối soát minh bạch số liệu bán hàng theo từng phút",
    description: "Giám Đốc Brand đăng nhập vào Portal riêng, xem chi tiết 12 SKUs đã bán, tỷ lệ đổi trả và chi phí Voucher tài trợ.",
    badge: "BRAND AUDITING",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    dataPayload: [
      { label: "Quyền Truy Cập Role", value: "Brand Client Manager Portal" },
      { label: "Dữ Liệu Hiển Thị", value: "GMV, SKU Units, Conversion, ROI" },
      { label: "Bảo Mật Dữ Liệu", value: "Chỉ xem dữ liệu của Brand Cocoon", highlight: true }
    ],
    systemActions: [
      "Áp dụng Bộ Lọc Phân Quyền Custom (Role-Based Access Control)",
      "Ẩn toàn bộ thông tin Lương Cơ Bản & Commission nội bộ Agency"
    ]
  },
  {
    id: 2,
    moduleCode: "M12",
    moduleName: "HR & Custom Permission Engine",
    roleContext: "operations",
    title: "2. Thử Nghiệm Quyền Hạn Hạn Chế & Cảnh Báo An Ninh",
    subtitle: "Chặn truy cập trái phép vào số liệu tài chính nhạy cảm",
    description: "Nếu tài khoản Brand cố tình truy cập vào Module Lương Host hoặc Chi Phí Vốn, Hệ Thống Custom Permission ngay lập tức chặn lại và hiển thị Access Restricted Guard.",
    badge: "ACCESS RESTRICTED GUARD",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    dataPayload: [
      { label: "Hành Vi Phát Hiện", value: "Cố truy cập Module 12 (HR Payroll)" },
      { label: "Xử Lý Hệ Thống", value: "DENIED - Yêu cầu Permission: manage_financials" },
      { label: "Nhật Ký Audit Log", value: "Đã ghi nhận sự kiện vào Audit Log", highlight: true }
    ],
    systemActions: [
      "Ghi log bảo mật vào Module Phân Quyền & Role (User Role Settings)",
      "Hiển thị giao diện Access Restricted thân thiện đúng chuẩn Enterprise"
    ]
  }
];

export const EndToEndFlowSimulator: React.FC = () => {
  const [activeScenario, setActiveScenario] = useState<ScenarioType>("standard_campaign");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlayingAuto, setIsPlayingAuto] = useState(false);

  const steps =
    activeScenario === "standard_campaign"
      ? SCENARIO_1_STEPS
      : activeScenario === "emergency_recovery"
      ? SCENARIO_2_STEPS
      : SCENARIO_3_STEPS;

  const currentStep = steps[currentStepIndex] || steps[0];

  // Auto playback simulation
  React.useEffect(() => {
    let timer: any;
    if (isPlayingAuto) {
      timer = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev < steps.length - 1) {
            return prev + 1;
          } else {
            setIsPlayingAuto(false);
            return prev;
          }
        });
      }, 4000);
    }
    return () => clearInterval(timer);
  }, [isPlayingAuto, steps.length]);

  const handleSelectScenario = (sc: ScenarioType) => {
    setActiveScenario(sc);
    setCurrentStepIndex(0);
    setIsPlayingAuto(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-8 text-white shadow-2xl relative overflow-hidden">
      {/* Top Header & Scenario Selector */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="bg-purple-500/20 text-purple-300 border border-purple-400/30 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-purple-400" /> Interactive Business Flow Simulator
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-bold">
              Full Multi-Module End-to-End
            </span>
          </div>

          {/* Auto Play Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlayingAuto(!isPlayingAuto)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                isPlayingAuto
                  ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30"
                  : "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30"
              }`}
            >
              {isPlayingAuto ? (
                <>
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  <span>Tạm Dừng Mô Phỏng</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Tự Động Trình Chạy Demo</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setCurrentStepIndex(0);
                setIsPlayingAuto(false);
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
              title="Reset về bước 1"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-xl md:text-3xl font-black tracking-tight text-white">
            Demo Luồng Vận Hành Khép Kín Đa Module (End-to-End Business Flow)
          </h2>
          <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-4xl">
            Trải nghiệm thực tế cách 16 Module trong LiveOps AI OS phối hợp nhịp nhàng từ lúc tiếp nhận Hợp đồng Brand đến AI Booking Host, Setup Studio QR, Sinh Kịch bản, Livestream TikTok API, Phân tích AI Coach, Chốt Sổ Tài Chính & Payout Commission.
          </p>
        </div>

        {/* 3 Scenario Switcher Cards */}
        <div className="grid sm:grid-cols-3 gap-3 pt-2">
          <button
            onClick={() => handleSelectScenario("standard_campaign")}
            className={`p-4 rounded-2xl border text-left transition-all space-y-1.5 relative overflow-hidden ${
              activeScenario === "standard_campaign"
                ? "bg-purple-950/60 border-purple-500 shadow-xl ring-2 ring-purple-500/30"
                : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between text-xs font-black text-purple-300">
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" /> Kịch Bản 1 (Chính)
              </span>
              <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded text-[10px]">8 Bước</span>
            </div>
            <h4 className="font-bold text-white text-sm">Campaign Livestream Mega Sale</h4>
            <p className="text-[11px] text-slate-400 leading-snug">
              Luồng hoàn chỉnh từ ký HĐ Cocoon 120M -> AI Match Host -> QR Studio -> Script -> TikTok API -> P&L -> Brand Portal.
            </p>
          </button>

          <button
            onClick={() => handleSelectScenario("emergency_recovery")}
            className={`p-4 rounded-2xl border text-left transition-all space-y-1.5 relative overflow-hidden ${
              activeScenario === "emergency_recovery"
                ? "bg-purple-950/60 border-purple-500 shadow-xl ring-2 ring-purple-500/30"
                : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between text-xs font-black text-amber-300">
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Kịch Bản 2 (Xử Lý Sự Cố)
              </span>
              <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-[10px]">3 Bước</span>
            </div>
            <h4 className="font-bold text-white text-sm">Cấp Cứu Mắt Xem Tụt & Đổi Host</h4>
            <p className="text-[11px] text-slate-400 leading-snug">
              TikTok API phát hiện view tụt 78% -> AI Agent chẩn đoán -> Tự động kích hoạt Host Nam Style giải cứu GMV.
            </p>
          </button>

          <button
            onClick={() => handleSelectScenario("multi_role_audit")}
            className={`p-4 rounded-2xl border text-left transition-all space-y-1.5 relative overflow-hidden ${
              activeScenario === "multi_role_audit"
                ? "bg-purple-950/60 border-purple-500 shadow-xl ring-2 ring-purple-500/30"
                : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between text-xs font-black text-blue-300">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Kịch Bản 3 (An Ninh & Role)
              </span>
              <span className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded text-[10px]">2 Bước</span>
            </div>
            <h4 className="font-bold text-white text-sm">Brand Portal Audit & Phân Quyền</h4>
            <p className="text-[11px] text-slate-400 leading-snug">
              Brand xem báo cáo ROI minh bạch, hệ thống Custom Permission bảo vệ số liệu thù lao nhạy cảm.
            </p>
          </button>
        </div>
      </div>

      {/* Process Stepper Timeline Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
          <span>TIẾN TRÌNH LUỒNG CÔNG VIỆC: BƯỚC {currentStepIndex + 1} / {steps.length}</span>
          <span className="text-purple-400">{Math.round(((currentStepIndex + 1) / steps.length) * 100)}% Complete</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {steps.map((step, idx) => {
            const isCurrent = idx === currentStepIndex;
            const isPassed = idx < currentStepIndex;

            return (
              <button
                key={step.id}
                onClick={() => {
                  setCurrentStepIndex(idx);
                  setIsPlayingAuto(false);
                }}
                className={`flex-1 min-w-[120px] p-2.5 rounded-xl border text-left transition-all ${
                  isCurrent
                    ? "bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30 font-bold scale-[1.02]"
                    : isPassed
                    ? "bg-slate-950/80 text-emerald-400 border-emerald-500/40 font-semibold"
                    : "bg-slate-950/40 text-slate-500 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] uppercase font-mono">
                  <span>{step.moduleCode}</span>
                  {isPassed ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <span>Step {idx + 1}</span>}
                </div>
                <div className="text-xs font-bold truncate mt-0.5">{step.moduleName}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Step Execution Visualizer Box */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 space-y-6 relative">
        {/* Step Badge & Context Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-black px-3 py-1 rounded-full border uppercase tracking-wider ${currentStep.badgeColor}`}>
                {currentStep.badge}
              </span>
              <span className="bg-slate-900 text-indigo-300 border border-indigo-800/60 text-xs font-mono px-2.5 py-0.5 rounded-lg">
                MODULE {currentStep.moduleCode}: {currentStep.moduleName}
              </span>
            </div>
            <h3 className="text-lg md:text-2xl font-black text-white">{currentStep.title}</h3>
            <p className="text-xs md:text-sm text-purple-300 font-medium">{currentStep.subtitle}</p>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Role Đang Thao Tác:</span>
            <span className="bg-purple-950 text-purple-300 border border-purple-700 text-xs font-bold px-2 py-0.5 rounded uppercase">
              {currentStep.roleContext}
            </span>
          </div>
        </div>

        {/* Step Description */}
        <p className="text-xs md:text-sm text-slate-300 leading-relaxed bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
          {currentStep.description}
        </p>

        {/* Data Payload Grid */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-purple-400" /> Dữ Liệu Trao Đổi Real-time (Data Payload):
          </h4>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            {currentStep.dataPayload.map((dp, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  dp.highlight
                    ? "bg-purple-950/50 border-purple-500/60 text-white"
                    : "bg-slate-900 border-slate-800 text-slate-300"
                }`}
              >
                <span className="text-[10px] text-slate-400 block font-medium">{dp.label}:</span>
                <strong className={`font-black block text-sm ${dp.highlight ? "text-amber-300" : "text-slate-100"}`}>
                  {dp.value}
                </strong>
              </div>
            ))}
          </div>
        </div>

        {/* System Actions & AI Insights */}
        <div className="grid md:grid-cols-2 gap-4 pt-2">
          {/* Automated System Actions */}
          <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
            <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Tự Động Hóa Hệ Thống (System Triggers):
            </h5>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {currentStep.systemActions.map((act, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* AI Intelligence Insight */}
          {currentStep.aiInsight && (
            <div className="p-4 bg-indigo-950/40 rounded-xl border border-indigo-800/60 space-y-2">
              <h5 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-indigo-400" /> Trí Tuệ Nhân Tạo AI Agent Assist:
              </h5>
              <p className="text-xs text-slate-200 italic leading-relaxed">{currentStep.aiInsight}</p>
            </div>
          )}
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            onClick={() => {
              setCurrentStepIndex((prev) => Math.max(0, prev - 1));
              setIsPlayingAuto(false);
            }}
            disabled={currentStepIndex === 0}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              currentStepIndex === 0
                ? "bg-slate-900 text-slate-600 cursor-not-allowed"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
            }`}
          >
            ← Bước Trước
          </button>

          <span className="text-xs font-mono text-slate-400 hidden sm:inline">
            Step {currentStepIndex + 1} of {steps.length}
          </span>

          <button
            onClick={() => {
              if (currentStepIndex < steps.length - 1) {
                setCurrentStepIndex((prev) => prev + 1);
              } else {
                // Loop or finish
                setCurrentStepIndex(0);
              }
              setIsPlayingAuto(false);
            }}
            className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2"
          >
            <span>{currentStepIndex === steps.length - 1 ? "Hoàn Tất - Xem Lại Bước 1" : "Tiếp Theo (Next Step)"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
