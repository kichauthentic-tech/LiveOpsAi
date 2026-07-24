import { Brand, Talent, Studio, Equipment, LiveSession, AgencyProject, WorkflowRule, PermissionDefinition, RolePermissionsMap, SystemUser, AuditLogEntry, StrategicDirective } from "../types";

export const MOCK_BRANDS: Brand[] = [
  {
    id: "brand-1",
    name: "Cocoon Vietnam",
    logo: "🌿",
    industry: "Mỹ phẩm thuần chay",
    contactName: "Trần Nguyễn Minh Anh",
    phone: "0908 123 456",
    email: "brand@cocoonvietnam.com",
    activeCampaigns: 2,
    totalGmv: 1250000000,
    contractStatus: "Active",
    owner: "Lê Quốc Bảo (Key Account Manager)"
  },
  {
    id: "brand-2",
    name: "Coolmate Active",
    logo: "👕",
    industry: "Thời trang Nam & Sportswear",
    contactName: "Phạm Hải Đăng",
    phone: "0912 987 654",
    email: "partner@coolmate.me",
    activeCampaigns: 3,
    totalGmv: 2180000000,
    contractStatus: "Active",
    owner: "Nguyễn Thu Thủy (Account Lead)"
  },
  {
    id: "brand-3",
    name: "Sunhouse Official",
    logo: "🍳",
    industry: "Gia dụng & Đồ dùng Bếp",
    contactName: "Đỗ Khánh Vân",
    phone: "0934 555 777",
    email: "ecommerce@sunhouse.com.vn",
    activeCampaigns: 1,
    totalGmv: 890000000,
    contractStatus: "Active",
    owner: "Trần Hoàng Vũ"
  },
  {
    id: "brand-4",
    name: "Maybelline New York",
    logo: "💄",
    industry: "Trang điểm & Skincare",
    contactName: "Jessica Tan",
    phone: "0988 333 222",
    email: "jessica.tan@loreal.com",
    activeCampaigns: 1,
    totalGmv: 3400000000,
    contractStatus: "Active",
    owner: "Lê Quốc Bảo"
  }
];

export const MOCK_TALENTS: Talent[] = [
  {
    id: "host-1",
    name: "Yến Nhi (Nhi Nham Nho)",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250",
    role: "Host",
    gender: "Nữ",
    niches: ["Mỹ phẩm", "Skincare", "Thời trang nữ"],
    followersTikTok: 850000,
    avgGmvPerSession: 185000000,
    ctrAvg: 8.8,
    cvrAvg: 5.4,
    ratePerSession: 4500000,
    commissionRate: 3.5,
    overallScore: 94,
    availabilityStatus: "On Live",
    brandsWorkedWith: ["Cocoon Vietnam", "Maybelline", "Senka"],
    phone: "0977 111 222"
  },
  {
    id: "host-2",
    name: "Hoàng Nam (Nam Style)",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250",
    role: "Host",
    gender: "Nam",
    niches: ["Thời trang Nam", "Tech Gadgets", "Thể thao"],
    followersTikTok: 620000,
    avgGmvPerSession: 210000000,
    ctrAvg: 9.2,
    cvrAvg: 6.1,
    ratePerSession: 5000000,
    commissionRate: 4.0,
    overallScore: 96,
    availabilityStatus: "Available",
    brandsWorkedWith: ["Coolmate", "Anker", "Baseus"],
    phone: "0918 333 444"
  },
  {
    id: "host-3",
    name: "Bích Ngọc (Ngọc Skincare)",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=250",
    role: "KOC",
    gender: "Nữ",
    niches: ["Gia dụng", "Mỹ phẩm", "Thực phẩm sức khỏe"],
    followersTikTok: 410000,
    avgGmvPerSession: 120000000,
    ctrAvg: 7.5,
    cvrAvg: 4.1,
    ratePerSession: 3000000,
    commissionRate: 3.0,
    overallScore: 88,
    availabilityStatus: "Available",
    brandsWorkedWith: ["Sunhouse", "Lock&Lock", "Cocoon"],
    phone: "0903 555 666"
  },
  {
    id: "host-4",
    name: "Minh Trí (Trí Tech Live)",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=250",
    role: "Host",
    gender: "Nam",
    niches: ["Gia dụng thông minh", "Điện tử", "Đồ chơi công nghệ"],
    followersTikTok: 530000,
    avgGmvPerSession: 165000000,
    ctrAvg: 8.1,
    cvrAvg: 4.9,
    ratePerSession: 4000000,
    commissionRate: 3.5,
    overallScore: 91,
    availabilityStatus: "Busy",
    brandsWorkedWith: ["Sunhouse", "Xiaomi", "Philips"],
    phone: "0938 777 888"
  }
];

export const MOCK_STUDIOS: Studio[] = [
  {
    id: "std-a",
    name: "Studio A - Beauty & Skincare Master",
    roomNumber: "P.301 - Tầng 3",
    capacity: 6,
    theme: "Tone Trắng Kem Luxury + Bàn Trang Điểm Đèn LED RGB Ring",
    status: "Live Now",
    currentSessionId: "session-live-01",
    equipmentCount: 12
  },
  {
    id: "std-b",
    name: "Studio B - Fashion & Lifestyle Studio",
    roomNumber: "P.302 - Tầng 3",
    capacity: 8,
    theme: "Chân tường Gạch Loft Studio + Giá Treo Đồ & Máy Chiếu Seamless",
    status: "Available",
    equipmentCount: 14
  },
  {
    id: "std-c",
    name: "Studio C - Home Appliance & Tech",
    roomNumber: "P.401 - Tầng 4",
    capacity: 10,
    theme: "Bếp Mẫu Đảo Bếp Đá Hoa Cương + Đèn Studio Công Suất Cao 1000W",
    status: "Booked",
    equipmentCount: 16
  }
];

export const MOCK_EQUIPMENTS: Equipment[] = [
  {
    id: "eq-1",
    qrCode: "EQUIP-CAM-001",
    name: "Sony FX3 Full-Frame Cinema Camera",
    category: "Camera",
    model: "Sony FX3 + Lens 24-70mm f/2.8 GM II",
    assignedStudioId: "std-a",
    status: "In Use",
    lastCheckDate: "2026-07-22"
  },
  {
    id: "eq-2",
    qrCode: "EQUIP-MIC-004",
    name: "Wireless Mic DJI Mic 2 Dual Transmitter",
    category: "Audio",
    model: "DJI Mic 2 Wireless Noise Cancelling",
    assignedStudioId: "std-a",
    status: "In Use",
    lastCheckDate: "2026-07-23"
  },
  {
    id: "eq-3",
    qrCode: "EQUIP-LGT-008",
    name: "Đèn Aputure 600d Pro Daylight LED",
    category: "Lighting",
    model: "Aputure Storm 600d + Softbox Dome III",
    assignedStudioId: "std-b",
    status: "In Stock",
    lastCheckDate: "2026-07-20"
  },
  {
    id: "eq-4",
    qrCode: "EQUIP-PROMPT-002",
    name: "Máy Bắn Chữ Teleprompter FeelWorld 12-inch",
    category: "Teleprompter",
    model: "FeelWorld TP12 Portable",
    assignedStudioId: "std-a",
    status: "In Use",
    lastCheckDate: "2026-07-23"
  }
];

export const MOCK_SESSIONS: LiveSession[] = [
  {
    id: "session-live-01",
    title: "Mega Live Sale Mỹ Phẩm Thuần Chay Cocoon - Săn Deal Độc Quyền 0Đ",
    brandId: "brand-1",
    brandName: "Cocoon Vietnam",
    shopTikTokHandle: "@cocoonvietnam_official",
    studioId: "std-a",
    studioName: "Studio A - Beauty & Skincare Master",
    hostId: "host-1",
    hostName: "Yến Nhi (Nhi Nham Nho)",
    assistantName: "Lê Minh Tuấn (Moderator)",
    date: "2026-07-23",
    startTime: "08:00",
    endTime: "10:00",
    status: "Live Now",
    targetGmv: 150000000,
    actualGmv: 185400000,
    totalOrders: 642,
    avgWatchTimeSeconds: 184,
    peakViewers: 3420,
    totalViews: 48200,
    ctrAvg: 8.9,
    cvrAvg: 5.2,
    skus: [
      {
        id: "sku-1",
        code: "COC-BHA-01",
        name: "Tẩy Tế Bào Chết Cà Phê Đắk Lắk Cocoon 200ml",
        category: "Skincare",
        originalPrice: 165000,
        livePrice: 119000,
        commission: 15,
        stock: 500,
        soldInSession: 320,
        clickCount: 2450,
        ctr: 11.2,
        cvr: 13.0
      },
      {
        id: "sku-2",
        code: "COC-SER-02",
        name: "Serum Bưởi Trị Tóc Gãy Rụng Cocoon 140ml",
        category: "Haircare",
        originalPrice: 245000,
        livePrice: 175000,
        commission: 18,
        stock: 400,
        soldInSession: 210,
        clickCount: 1820,
        ctr: 9.1,
        cvr: 11.5
      }
    ],
    checklist: [
      { id: "ck-1", task: "Kiểm tra đường truyền Internet cáp quang 1Gbps riêng cho Studio A", category: "Tech", completed: true, assignedTo: "Tuấn Tech" },
      { id: "ck-2", task: "Setup hệ thống ánh sáng Aputure 600d + Keylight Ring LED", category: "Studio", completed: true, assignedTo: "Tuấn Tech" },
      { id: "ck-3", task: "Kiểm tra danh sách 12 SKUs đã ghim đủ Voucher TikTok Shop 50k & 100k", category: "TikTok App", completed: true, assignedTo: "Tuấn Moderator" },
      { id: "ck-4", task: "Host khớp lại Kịch bản Flash Sale phút 15 & Minute-30 Giveaway 0Đ", category: "Host & Script", completed: true, assignedTo: "Host Yến Nhi" },
      { id: "ck-5", task: "Bật phần mềm OBS Stream Key và kết nối TikTok Live Studio", category: "Tech", completed: true, assignedTo: "Tuấn Tech" }
    ],
    minuteMetrics: [
      { minute: 5, timeString: "08:05", viewers: 1200, peakViewers: 1200, gmvCumulative: 12500000, gmvPerMinute: 2500000, ctr: 5.2, cvr: 3.1, productClicks: 210, comments: 340, eventTrigger: "Khai mạc Live & Mở Giveaway 0Đ" },
      { minute: 15, timeString: "08:15", viewers: 2800, peakViewers: 2800, gmvCumulative: 58000000, gmvPerMinute: 8500000, ctr: 9.8, cvr: 6.2, productClicks: 620, comments: 890, eventTrigger: "Tung Flash Sale Tẩy Cà Phê 119K" },
      { minute: 25, timeString: "08:25", viewers: 1950, peakViewers: 2800, gmvCumulative: 82000000, gmvPerMinute: 3100000, ctr: 6.5, cvr: 4.0, productClicks: 310, comments: 410, eventTrigger: "Host giới thiệu thành phần (Mắt xem rớt)" },
      { minute: 35, timeString: "08:35", viewers: 3420, peakViewers: 3420, gmvCumulative: 142000000, gmvPerMinute: 11200000, ctr: 12.4, cvr: 8.1, productClicks: 950, comments: 1420, eventTrigger: "Host Test Nền Tẩy Da Chết Trực Tiếp (PEAK VIEW)" },
      { minute: 45, timeString: "08:45", viewers: 2900, peakViewers: 3420, gmvCumulative: 168000000, gmvPerMinute: 5200000, ctr: 8.2, cvr: 5.1, productClicks: 480, comments: 760, eventTrigger: "Combo Mua 1 Tặng 1 Serum Bưởi" },
      { minute: 55, timeString: "08:55", viewers: 2200, peakViewers: 3420, gmvCumulative: 185400000, gmvPerMinute: 3400000, ctr: 7.1, cvr: 4.5, productClicks: 320, comments: 510, eventTrigger: "Chốt Đơn Đếm Ngược 10s Cuối" }
    ],
    aiAnalysis: {
      overallRating: "A+ (Xuất sắc)",
      gmvSummary: "Doanh thu đạt 185,400,000 VNĐ, vượt 123% chỉ tiêu KPI cam kết với Cocoon Vietnam.",
      keyHighlights: [
        "Phút 35:00 - Host Yến Nhi thực hiện test trực tiếp sản phẩm tẩy da chết lên tay trước camera cận cảnh (Close-up) giúp mắt xem tăng vọt lên 3,420 (Peak Viewer) và CVR chạm mốc 8.1%.",
        "Tung Voucher 50k đúng nhịp rơi lượt xem ở phút 15 đã cứu vãn luồng phân phối TikTok Live Algorithm."
      ],
      topMistakes: [
        "Phút 20 - 25: Host giải thích sâu chuyên ngành hóa học mất 5 phút làm nhịp Live bị chùng, người xem giảm 30%.",
        "Trợ lý ghim nhầm SKU Serum ở phút 12 (trễ 2 phút so với lời nói của Host)."
      ],
      hostCoaching: {
        closingSkillScore: 92,
        energyScore: 96,
        productKnowledgeScore: 90,
        speechRateScore: 82,
        feedback: "Yến Nhi biểu cảm xuất sắc, giữ năng lượng rất cuốn. Cần tinh chỉnh giảm thời lượng giải thích lý thuyết thuần túy xuống dưới 90 giây và tăng thời lượng thị phạm trực tiếp!"
      },
      actionableRecommendations: [
        "Đưa màn test trực tiếp lên làm Hook đầu tiên ở phút 08 trong phiên live kế tiếp.",
        "Cấu hình tự động hóa bot ghim sản phẩm theo Keyword từ kịch bản để tránh lỗi con người."
      ]
    }
  },
  {
    id: "session-live-02",
    title: "Siêu Hoi Bếp Gia Dụng Sunhouse - Chảo Chống Dính & Nồi Chiên Không Dầu",
    brandId: "brand-3",
    brandName: "Sunhouse Official",
    shopTikTokHandle: "@sunhouse_vietnam",
    studioId: "std-c",
    studioName: "Studio C - Home Appliance & Tech",
    hostId: "host-3",
    hostName: "Linh Barbie (Linh Bếp Xinh)",
    assistantName: "Đỗ Khánh Vân (Key Account)",
    date: "2026-07-23",
    startTime: "08:30",
    endTime: "11:30",
    status: "Live Now",
    targetGmv: 100000000,
    actualGmv: 112500000,
    totalOrders: 380,
    avgWatchTimeSeconds: 195,
    peakViewers: 1850,
    totalViews: 24100,
    ctrAvg: 7.8,
    cvrAvg: 4.8,
    skus: [
      {
        id: "sku-sun-1",
        code: "SUN-AF-01",
        name: "Nồi Chiên Không Dầu Sunhouse 6L Điện Tử Mama",
        category: "Gia dụng",
        originalPrice: 1890000,
        livePrice: 1290000,
        commission: 12,
        stock: 200,
        soldInSession: 65,
        clickCount: 890,
        ctr: 8.5,
        cvr: 7.3
      },
      {
        id: "sku-sun-2",
        code: "SUN-PAN-02",
        name: "Chảo Chống Dính Vân Đá Sunhouse UltraProtect 28cm",
        category: "Gia dụng",
        originalPrice: 350000,
        livePrice: 219000,
        commission: 15,
        stock: 500,
        soldInSession: 195,
        clickCount: 1420,
        ctr: 9.2,
        cvr: 13.7
      }
    ],
    checklist: [
      { id: "ck-20", task: "Kiểm tra hệ thống điện studio 1000W và quạt tản nhiệt bếp", category: "Studio", completed: true, assignedTo: "Khánh Tech" },
      { id: "ck-21", task: "Cắm thử 2 nồi chiên không dầu để Host demo chiên khoai tây live", category: "Tech", completed: true, assignedTo: "Khánh Tech" }
    ],
    minuteMetrics: [
      { minute: 5, timeString: "08:35", viewers: 650, peakViewers: 650, gmvCumulative: 8500000, gmvPerMinute: 1700000, ctr: 4.8, cvr: 2.9, productClicks: 90, comments: 180, eventTrigger: "Khai mạc Live & Tặng Chảo 0Đ" },
      { minute: 15, timeString: "08:45", viewers: 1420, peakViewers: 1420, gmvCumulative: 42000000, gmvPerMinute: 6200000, ctr: 8.1, cvr: 5.4, productClicks: 340, comments: 520, eventTrigger: "Tung Deal Nồi Chiên 1290K" },
      { minute: 25, timeString: "08:55", viewers: 1850, peakViewers: 1850, gmvCumulative: 89000000, gmvPerMinute: 8100000, ctr: 10.2, cvr: 6.8, productClicks: 580, comments: 890, eventTrigger: "Demo Chiên Gà Trực Tiếp Bằng Nồi Chiên" },
      { minute: 35, timeString: "09:05", viewers: 1610, peakViewers: 1850, gmvCumulative: 112500000, gmvPerMinute: 4100000, ctr: 7.9, cvr: 4.6, productClicks: 310, comments: 460, eventTrigger: "Xả Kho 100 Chảo Vân Đá 219K" }
    ],
    aiAnalysis: {
      overallRating: "A (Tốt)",
      gmvSummary: "Doanh thu 112.5 Triệu VNĐ, đạt 112.5% KPI target ban đầu.",
      keyHighlights: [
        "Demo chiên gà thực tế thu hút 1,850 Peak CCU và đẩy lượng chốt nồi chiên lên vọt."
      ],
      topMistakes: [
        "Nhiệt độ nồi chiên bốc khói nhẹ làm ống kính camera bị mờ trong 30 giây ở phút 28."
      ],
      hostCoaching: {
        closingSkillScore: 88,
        energyScore: 90,
        productKnowledgeScore: 94,
        speechRateScore: 85,
        feedback: "Linh Bếp Xinh giới thiệu tính năng sản phẩm vô cùng thuyết phục!"
      },
      actionableRecommendations: [
        "Chuẩn bị quạt hút mùi/khói tại Studio C khi demo sản phẩm chiên nướng."
      ]
    }
  },
  {
    id: "session-live-03",
    title: "Đêm Nhạc & Beauty Glam Maybelline - Son Mịn Lì SuperStay 16H",
    brandId: "brand-4",
    brandName: "Maybelline New York",
    shopTikTokHandle: "@maybelline_vn",
    studioId: "std-a",
    studioName: "Studio A - Beauty & Skincare Master",
    hostId: "host-1",
    hostName: "Yến Nhi (Nhi Nham Nho)",
    assistantName: "Jessica Tan (Account Lead)",
    date: "2026-07-22",
    startTime: "19:00",
    endTime: "22:00",
    status: "Completed",
    targetGmv: 200000000,
    actualGmv: 298000000,
    totalOrders: 1120,
    avgWatchTimeSeconds: 210,
    peakViewers: 5200,
    totalViews: 89000,
    ctrAvg: 11.4,
    cvrAvg: 6.8,
    skus: [],
    checklist: [],
    minuteMetrics: []
  },
  {
    id: "session-live-04",
    title: "Chương Trình Khai Trương BST Đồ Tập Nam Coolmate Activewear",
    brandId: "brand-2",
    brandName: "Coolmate Active",
    shopTikTokHandle: "@coolmate.me",
    studioId: "std-b",
    studioName: "Studio B - Fashion & Lifestyle Studio",
    hostId: "host-2",
    hostName: "Hoàng Nam (Nam Style)",
    assistantName: "Phạm Hải Đăng",
    date: "2026-07-21",
    startTime: "18:00",
    endTime: "21:00",
    status: "Completed",
    targetGmv: 180000000,
    actualGmv: 115000000,
    totalOrders: 410,
    avgWatchTimeSeconds: 110,
    peakViewers: 1200,
    totalViews: 22000,
    ctrAvg: 5.8,
    cvrAvg: 3.2,
    skus: [],
    checklist: [],
    minuteMetrics: []
  },
  {
    id: "session-upcoming-02",
    title: "Chương Trình Flash Sale Coolmate Sportswear - Outfit Tập Luyện Đẳng Cấp",
    brandId: "brand-2",
    brandName: "Coolmate Active",
    shopTikTokHandle: "@coolmate.me",
    studioId: "std-b",
    studioName: "Studio B - Fashion & Lifestyle Studio",
    hostId: "host-2",
    hostName: "Hoàng Nam (Nam Style)",
    assistantName: "Trần Anh Quân (Moderator)",
    date: "2026-07-23",
    startTime: "14:00",
    endTime: "17:00",
    status: "Upcoming",
    targetGmv: 250000000,
    actualGmv: 0,
    totalOrders: 0,
    avgWatchTimeSeconds: 0,
    peakViewers: 0,
    totalViews: 0,
    ctrAvg: 0,
    cvrAvg: 0,
    skus: [
      {
        id: "sku-3",
        code: "COOL-TSHIRT-01",
        name: "Áo Thể Thao Nam Promax Baseline Coolmate",
        category: "Sportswear",
        originalPrice: 199000,
        livePrice: 129000,
        commission: 20,
        stock: 1000,
        soldInSession: 0,
        clickCount: 0,
        ctr: 0,
        cvr: 0
      }
    ],
    checklist: [
      { id: "ck-10", task: "Ủi phẳng toàn bộ 25 mẫu áo quần theo kích thước S, M, L, XL", category: "Studio", completed: true, assignedTo: "Quân Stylist" },
      { id: "ck-11", task: "Cài đặt phần mềm đổi góc quay Cam 1 (Cận vải) và Cam 2 (Toàn thân)", category: "Tech", completed: false, assignedTo: "Nam Tech" }
    ],
    minuteMetrics: []
  }
];

export const MOCK_PROJECTS: AgencyProject[] = [
  {
    id: "proj-1",
    name: "Chiến Dịch Mega Live Mùa Hè Cocoon 2026",
    brandId: "brand-1",
    brandName: "Cocoon Vietnam",
    budget: 450000000,
    kpiGmv: 2000000000,
    actualGmv: 1680000000,
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    status: "In Progress",
    totalSessionsPlanned: 12,
    sessionsCompleted: 8,
    teamLead: "Lê Quốc Bảo"
  },
  {
    id: "proj-2",
    name: "Coolmate Active Sportswear TikTok Takeover",
    brandId: "brand-2",
    brandName: "Coolmate Active",
    budget: 600000000,
    kpiGmv: 3500000000,
    actualGmv: 2900000000,
    startDate: "2026-06-15",
    endDate: "2026-08-15",
    status: "In Progress",
    totalSessionsPlanned: 20,
    sessionsCompleted: 14,
    teamLead: "Nguyễn Thu Thủy"
  }
];

export const MOCK_WORKFLOW_RULES: WorkflowRule[] = [
  {
    id: "wf-1",
    name: "Tự động tạo Project & Checklist khi Hợp đồng Brand được duyệt",
    trigger: "CRM Contract Status = Active",
    action: "Tạo Project Folder, Book Studio mặc định, Gửi thông báo Slack cho KAM",
    enabled: true,
    lastRun: "2026-07-22 14:30",
    executionsCount: 24
  },
  {
    id: "wf-2",
    name: "Tự động Đồng bộ TikTok API & Sinh Báo Cáo AI khi Live kết thúc",
    trigger: "Livestream Status = Completed",
    action: "Gọi API TikTok Partner Sync -> Chạy Gemini Session Analyst -> Gửi Email Brand & Update KPI Host",
    enabled: true,
    lastRun: "2026-07-23 10:05",
    executionsCount: 158
  },
  {
    id: "wf-3",
    name: "Cảnh báo Lịch Trống Studio khi dưới 60% Capacity",
    trigger: "Studio Weekly Occupancy < 60%",
    action: "Tạo Task cho Booking Lead chào thêm các deal Flash Live ngắn cho Brand phụ",
    enabled: true,
    lastRun: "2026-07-21 09:00",
    executionsCount: 12
  }
];

export const ALL_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: "view_financials",
    label: "Xem Báo Cáo Tài Chính & P&L",
    category: "Tổng Quan & Báo Cáo",
    description: "Cho phép truy cập số liệu doanh thu agency, lợi nhuận ròng, commission và dòng tiền P&L."
  },
  {
    key: "view_executive_brief",
    label: "Xem Command Brief & Chỉ Đạo Ban Giám Đốc",
    category: "Tổng Quan & Báo Cáo",
    description: "Quyền xem Dashboard định hướng chiến lược và thông điệp điều hành từ CEO."
  },
  {
    key: "manage_sessions",
    label: "Quản Lý Phiên Livestream",
    category: "Vận Hành & Studio",
    description: "Tạo mới, chỉnh sửa, ghim SKU, chạy kịch bản live và cập nhật kết quả GMV."
  },
  {
    key: "manage_calendar",
    label: "Điều Phối Lịch Vận Hành Studio",
    category: "Vận Hành & Studio",
    description: "Xếp lịch sử dụng Studio, gán Host & Assistant, duyệt khung giờ trùng."
  },
  {
    key: "generate_scripts",
    label: "Sử Dụng AI Script Generator",
    category: "Nội Dung & AI",
    description: "Truy cập công cụ sinh kịch bản livestream tự động bằng Gemini AI cho các ngành hàng."
  },
  {
    key: "manage_talents",
    label: "Quản Lý Talent Pool & Matcher",
    category: "Nội Dung & AI",
    description: "Thêm, cập nhật profile Host/KOC/KOL, chấm điểm skill và duyệt mức thù lao/commission."
  },
  {
    key: "manage_studios_gear",
    label: "Quản Lý Studio & Thiết Bị QR",
    category: "Vận Hành & Studio",
    description: "Quản lý phòng studio, kiểm kê thiết bị bằng mã QR, cập nhật bảo trì gear."
  },
  {
    key: "manage_crm_projects",
    label: "Quản Lý CRM & Dự Án Brand",
    category: "Tổng Quan & Báo Cáo",
    description: "Quản lý danh sách Brand khách hàng, hợp đồng cam kết KPI GMV và ngân sách campaign."
  },
  {
    key: "manage_tiktok_api",
    label: "Cấu Hình TikTok API & Automation",
    category: "Quản Trị System & Tài Chính",
    description: "Quản lý OAuth token, Webhook đồng bộ đơn hàng real-time và thiết lập workflow quy trình."
  },
  {
    key: "manage_finance_hr",
    label: "Quản Lý Lương, Phụ Cấp & Commission",
    category: "Quản Trị System & Tài Chính",
    description: "Duyệt bảng lương Host/KOC, tính hoa hồng theo ca live và chi phí vận hành studio."
  },
  {
    key: "manage_ai_agents",
    label: "Điều Hành Hội Đồng AI Agents",
    category: "Nội Dung & AI",
    description: "Truy cập các AI Agent tư vấn chiến lược (Traffic, Conversion, Pricing, Host Performance)."
  },
  {
    key: "manage_users_permissions",
    label: "Quản Lý Phân Quyền & Người Dùng",
    category: "Quản Trị System & Tài Chính",
    description: "Quyền tối cao Admin: Tạo tài khoản, custom phân quyền theo role và xem Audit Log."
  },
  {
    key: "export_reports",
    label: "Xuất Báo Cáo Chi Tiết (Export)",
    category: "Tổng Quan & Báo Cáo",
    description: "Tải file dữ liệu Excel, PDF báo cáo hiệu suất chiến dịch cho Brand & Ban giám đốc."
  }
];

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionsMap = {
  ceo: {
    view_financials: true,
    view_executive_brief: true,
    manage_sessions: true,
    manage_calendar: true,
    generate_scripts: true,
    manage_talents: true,
    manage_studios_gear: true,
    manage_crm_projects: true,
    manage_tiktok_api: true,
    manage_finance_hr: true,
    manage_ai_agents: true,
    manage_users_permissions: true,
    export_reports: true
  },
  operations: {
    view_financials: false,
    view_executive_brief: true,
    manage_sessions: true,
    manage_calendar: true,
    generate_scripts: true,
    manage_talents: true,
    manage_studios_gear: true,
    manage_crm_projects: true,
    manage_tiktok_api: true,
    manage_finance_hr: false,
    manage_ai_agents: true,
    manage_users_permissions: false,
    export_reports: true
  },
  brand: {
    view_financials: false,
    view_executive_brief: false,
    manage_sessions: false,
    manage_calendar: false,
    generate_scripts: true,
    manage_talents: false,
    manage_studios_gear: false,
    manage_crm_projects: false,
    manage_tiktok_api: false,
    manage_finance_hr: false,
    manage_ai_agents: false,
    manage_users_permissions: false,
    export_reports: true
  },
  talent: {
    view_financials: false,
    view_executive_brief: false,
    manage_sessions: false,
    manage_calendar: false,
    generate_scripts: true,
    manage_talents: false,
    manage_studios_gear: false,
    manage_crm_projects: false,
    manage_tiktok_api: false,
    manage_finance_hr: false,
    manage_ai_agents: false,
    manage_users_permissions: false,
    export_reports: false
  }
};

export const MOCK_SYSTEM_USERS: SystemUser[] = [
  {
    id: "usr-1",
    name: "Jun Dang (Giám Đốc)",
    email: "ceo@liveops.ai",
    role: "ceo",
    customRoleTitle: "Chief Executive Officer & Founder",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    status: "Active",
    lastLogin: "2026-07-23 18:12"
  },
  {
    id: "usr-2",
    name: "Lê Quốc Bảo",
    email: "bao.le@liveops.ai",
    role: "operations",
    customRoleTitle: "Head of Operations & Studio Management",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    status: "Active",
    lastLogin: "2026-07-23 17:45"
  },
  {
    id: "usr-3",
    name: "Trần Nguyễn Minh Anh",
    email: "brand@cocoonvietnam.com",
    role: "brand",
    customRoleTitle: "Brand Manager - Cocoon Vietnam",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80",
    status: "Active",
    assignedBrandId: "brand-1",
    lastLogin: "2026-07-22 14:20"
  },
  {
    id: "usr-4",
    name: "Phạm Hải Đăng",
    email: "partner@coolmate.me",
    role: "brand",
    customRoleTitle: "E-Commerce Director - Coolmate Active",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
    status: "Active",
    assignedBrandId: "brand-2",
    lastLogin: "2026-07-21 09:10"
  },
  {
    id: "usr-5",
    name: "Yến Nhi (Nhi Nham Nho)",
    email: "yen.nhi@talenthost.vn",
    role: "talent",
    customRoleTitle: "Senior Livestream Host (Beauty & Skincare)",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
    status: "Active",
    assignedTalentId: "host-1",
    lastLogin: "2026-07-23 16:00"
  },
  {
    id: "usr-6",
    name: "Hoàng Nam (Nam Style)",
    email: "hoang.nam@talenthost.vn",
    role: "talent",
    customRoleTitle: "Key Livestream Host (Fashion & Sportswear)",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80",
    status: "Active",
    assignedTalentId: "host-2",
    lastLogin: "2026-07-20 11:30"
  }
];

export const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: "log-1",
    timestamp: "2026-07-23 17:30:12",
    performedBy: "Jun Dang (CEO)",
    action: "Cập nhật Phân Quyền Role Operations",
    details: "Cấp thêm quyền truy cập 'AI Script Generator' cho nhóm Operations",
    category: "Permission Change"
  },
  {
    id: "log-2",
    timestamp: "2026-07-22 15:10:44",
    performedBy: "Jun Dang (CEO)",
    action: "Thêm tài khoản người dùng mới",
    details: "Tạo tài khoản 'Phạm Hải Đăng' vai trò Brand Client Portal (Coolmate Active)",
    category: "User Status"
  },
  {
    id: "log-3",
    timestamp: "2026-07-21 08:45:00",
    performedBy: "System Security Bot",
    action: "Cảnh Báo Chuyển Role",
    details: "Người dùng Trần Nguyễn Minh Anh đăng nhập từ IP mới và đổi chế độ xem Brand Portal",
    category: "Security Alert"
  }
];

export const MOCK_STRATEGIC_DIRECTIVES: StrategicDirective[] = [
  {
    id: "dir-1",
    code: "DIR-2026-01",
    title: "Tối Ưu 100% Kịch Bản Live Bằng Gemini AI & Tăng CVR Giờ Vàng",
    description: "Yêu cầu đội ngũ Content & Operations đưa 100% phiên livestream hàng tuần chạy qua AI Script Generator. Đảm bảo cấu trúc Hook 5s, Deal Trigger sinh động để tăng CVR tối thiểu đạt 4.5%.",
    department: "Content & AI",
    assignedRole: "operations",
    assigneeName: "Lê Quốc Bảo (Head of Ops) & Content Team",
    priority: "Urgent",
    targetKpi: "CVR trung bình các phiên live đạt ≥ 4.5% & 100% phiên có Script AI",
    deadline: "2026-08-05",
    status: "In Progress",
    progressPercent: 75,
    notesFromLead: "Đã áp dụng thử nghiệm trên 12 phiên live Cocoon & Coolmate. CVR tăng từ 3.2% lên 4.6% đúng mục tiêu.",
    createdAt: "2026-07-15"
  },
  {
    id: "dir-2",
    code: "DIR-2026-02",
    title: "Mở Rộng Mạng Lưới Talent Pool & Đào Tạo Host Dự Phòng Cho Mega Sale 8.8",
    description: "Ban Giám Đốc yêu cầu Quản Lý Talent ký mới ít nhất 5 Host/KOC chất lượng cao ngành Beauty & Fashion, sẵn sàng cho lịch Mega Sale 8.8 với định mức GMV 300M+/ca.",
    department: "Talent Management",
    assignedRole: "talent",
    assigneeName: "Yến Nhi & Talent Coordinator",
    priority: "High",
    targetKpi: "Recruit 5 Host mới, Scorecard > 85/100, Sẵn sàng 3 ca Live/ngày",
    deadline: "2026-08-02",
    status: "In Progress",
    progressPercent: 60,
    notesFromLead: "Đã ký HĐ với 3 Host mới (Nhi Nham Nho, Nam Style, Lan Anh), đang tập huấn kịch bản AI.",
    createdAt: "2026-07-18"
  },
  {
    id: "dir-3",
    code: "DIR-2026-03",
    title: "Kiểm Kê 100% Thiết Bị Studio Bằng Mã QR & Nâng Cấp Hệ Thống Âm Thanh",
    description: "Đội Vận Hành kĩ thuật rà soát toàn bộ Mic không dây, Switcher Blackmagic & Đèn Softbox trong 6 phòng Studio. Dán mã QR và cập nhật nhật ký bảo trì vào hệ thống.",
    department: "Operations",
    assignedRole: "operations",
    assigneeName: "Lê Quốc Bảo (Tech & Studio Lead)",
    priority: "Medium",
    targetKpi: "100% gear có mã QR, Không để xảy ra sự cố sập âm thanh/hình ảnh khi live",
    deadline: "2026-07-30",
    status: "Completed",
    progressPercent: 100,
    notesFromLead: "Đã hoàn tất dán mã QR 100% thiết bị tại Studio 01 - Studio 06. Đang chạy mượt mà.",
    createdAt: "2026-07-10"
  },
  {
    id: "dir-4",
    code: "DIR-2026-04",
    title: "Chuẩn Hóa Báo Cáo P&L Real-time Cho Brand Client Portal",
    description: "Giao bộ phận Brand Client Lead & Finance tự động hóa kết xuất báo cáo ROI, Net Profit & GMV sau live cho các Brand đối tác chiến lược (Cocoon, Coolmate, Maybelline) trong vòng 30 phút sau khi hết sóng.",
    department: "Brand Client",
    assignedRole: "brand",
    assigneeName: "Trần Nguyễn Minh Anh (Brand Manager Lead)",
    priority: "High",
    targetKpi: "Brand Client nhận báo cáo trong 30 phút post-live, Brand Satisfaction > 95%",
    deadline: "2026-08-10",
    status: "In Progress",
    progressPercent: 80,
    notesFromLead: "Đã tích hợp Webhook API đồng bộ đơn hàng real-time, báo cáo tự động đẩy ra Portal sau 15 phút.",
    createdAt: "2026-07-20"
  },
  {
    id: "dir-5",
    code: "DIR-2026-05",
    title: "Thanh Toán Sòng Phẳng Payout Commission Tự Động Hàng Tuần Cho Host/KOC",
    description: "Chỉ đạo bộ phận Finance & HR: Căn cứ vào bảng tính thù lao tự động của Module 12, thực hiện thanh toán hoa hồng commission cho Host trong vòng 3 ngày làm việc sau mỗi đợt chốt sổ tuần.",
    department: "Finance & Admin",
    assignedRole: "ceo",
    assigneeName: "Phòng Tài Chính & Kế Toán Agency",
    priority: "Urgent",
    targetKpi: "Payout chính xác 100%, Đúng hạn trước thứ 5 hàng tuần, 0 khiếu nại về lương",
    deadline: "2026-08-01",
    status: "Needs BOD Support",
    progressPercent: 40,
    notesFromLead: "Cần Ban Giám Đốc phê duyệt hạn mức hạn vay tài trợ vốn ngân hàng cho đợt Mega Sale 8.8 tới.",
    createdAt: "2026-07-22"
  }
];


