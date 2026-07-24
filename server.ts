import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Lazy initialization helper for Gemini
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return null;
    }
    return new GoogleGenAI({ apiKey });
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API Route: AI Script Generator
  app.post("/api/gemini/generate-script", async (req, res) => {
    try {
      const { brandName, productCategory, skus, targetAudience, tone, durationMinutes } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        // Fallback intelligent response if API key is not yet set
        return res.json({
          success: true,
          isMock: true,
          script: {
            title: `Kịch Bản Livestream TikTok - ${brandName || "Brand"} (${durationMinutes || 60} Phút)`,
            opening: {
              time: "00:00 - 05:00",
              hook: `🔥 BÙM NỔ LỚN! Chào mừng 500 anh em đang có mặt trong phiên LIVE đặc quyền của ${brandName || "Thương hiệu"}. Hôm nay ad mang tới deal độc quyền GIẢM 50% + VOUCHER SÀN 100K!`,
              action: "Bật nhạc sôi động, ghim sản phẩm Hero SKU #1, yêu cầu tim & share live đạt 5,000 tim để mở quà 0 đồng.",
            },
            timelineSegments: [
              {
                timeWindow: "05:00 - 15:00",
                focusProduct: skus?.[0] || "Sản phẩm Hero 1 (Mỹ phẩm/Thời trang)",
                storytelling: "Mô tả vấn đề thực tế của khách hàng (da khô, mụn / tróc nền / hết hàng hot). Cho host test trực tiếp trước ống kính góc gần (Close-up shot).",
                voucherTiming: "Tung Voucher TikTok Shop 30k cho đơn từ 199k (Giới hạn 50 lượt).",
                objectionHandling: "Khách hỏi: 'Hàng chính hãng không?' -> Host show tem vỡ, giấy chứng nhận đại lý, cam kết đền x10 nếu fake.",
                cta: "Ghim giỏ hàng #1 -> Đếm ngược 10 - 9 - 8... bấm MUA NGAY kẻo hết suất quà!"
              },
              {
                timeWindow: "15:00 - 30:00",
                focusProduct: skus?.[1] || "Combo Siêu Tiết Kiệm SKU #2",
                storytelling: "So sánh giá mua lẻ vs mua Combo. Mua 1 tặng 2 quà tặng trị giá 150k.",
                voucherTiming: "Flash Sale giảm thêm 15% duy nhất trong 5 phút.",
                objectionHandling: "Khách hỏi: 'Bao lâu giao hàng?' -> Hàng sẵn kho HCM/HN, đi đơn trong ngày, nhận sau 1-2 ngày.",
                cta: "Chỉ còn 12 suất combo cuối cùng trong giỏ hàng #2!"
              }
            ],
            closing: {
              time: `${(durationMinutes || 60) - 10} - ${durationMinutes || 60}:00`,
              strategy: "Nhắc lại Top 3 sản phẩm hot nhất phiên live, hối thúc chốt đơn chưa thanh toán trong giỏ hàng.",
              callToAction: "Cảm ơn cả nhà, ấn Nút Theo Dõi kênh để nhận thông báo phiên LIVE mai nhận quà tiếp theo!"
            }
          }
        });
      }

      const prompt = `Bạn là Chuyên gia Đào tạo Host & Biên kịch Livestream TikTok Shop hàng đầu với 20 năm kinh nghiệm.
Hãy tạo 1 Kịch Bản Livestream TikTok chi tiết, cuốn hút, tối ưu CVR cho:
- Thương hiệu: ${brandName}
- Ngành hàng: ${productCategory}
- Danh sách SKUs chính: ${Array.isArray(skus) ? skus.join(", ") : skus}
- Khách hàng mục tiêu: ${targetAudience}
- Tone giọng & Phong cách: ${tone}
- Thời lượng phiên live: ${durationMinutes} phút

Định dạng trả về dưới dạng JSON với cấu trúc:
{
  "title": "Tên kịch bản",
  "opening": { "time": "00:00 - 05:00", "hook": "...", "action": "..." },
  "timelineSegments": [
    {
      "timeWindow": "...",
      "focusProduct": "...",
      "storytelling": "...",
      "voucherTiming": "...",
      "objectionHandling": "...",
      "cta": "..."
    }
  ],
  "closing": { "time": "...", "strategy": "...", "callToAction": "..." }
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const scriptData = JSON.parse(response.text || "{}");
      return res.json({ success: true, isMock: false, script: scriptData });
    } catch (error: any) {
      console.error("Gemini Script Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route: AI Live Session Analysis
  app.post("/api/gemini/analyze-session", async (req, res) => {
    try {
      const { sessionData } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          success: true,
          isMock: true,
          insights: {
            overallRating: "A- (Tốt)",
            gmvSummary: "Phiên live đạt 185,400,000 VNĐ (Vượt 115% KPI ban đầu).",
            keyHighlights: [
              "Phút thứ 18:00 - Mở Flash Sale Combo Serum giúp GMV tăng đột biến +32,000,000đ trong 5 phút.",
              "Phút thứ 32:00 - Lượt người xem đạt Peak (3,420 Viewers) khi Host thực hiện thử thách test son trực tiếp.",
              "Tỷ lệ CVR trung bình toàn phiên đạt 4.8% (Mức cao trong ngành Mỹ phẩm)."
            ],
            topMistakes: [
              "Phút 22:00 - 27:00: Mắt xem sụt giảm 35% do Host nói lan man về công dụng kỹ thuật quá 5 phút mà không đổi góc quay hay tạo mini-game.",
              "Thiếu nhắc ghim voucher TikTok Shop trong khoảng nghỉ phút 40."
            ],
            hostCoaching: {
              closingSkillScore: 88,
              energyScore: 92,
              productKnowledgeScore: 85,
              speechRateScore: 78,
              feedback: "Host duy trì năng lượng rất tốt. Cần tiết chế tốc độ nói khi giải thích thành phần để người xem không bị ngợp, đồng thời chủ động nhắc Trợ lý ghim deal nhanh hơn."
            },
            actionableRecommendations: [
              "Chuyển SKU Combo Nước Hoa lên phút thứ 15 thay vì phút thứ 45 ở phiên live tới.",
              "Tăng tần suất gọi tên người mua hàng trong comment để kích hoạt thuật toán đẩy luồng TikTok Live."
            ]
          }
        });
      }

      const prompt = `Bạn là Giám đốc Vận hành TikTok Agency cấp cao.
Hãy phân tích dữ liệu phiên livestream TikTok Shop sau đây và đưa ra đánh giá chuyên sâu, chỉ ra sai lầm, thời điểm đột biến và bài học cải thiện cho Host:
${JSON.stringify(sessionData)}

Định dạng JSON trả về:
{
  "overallRating": "Hạng A/B/C",
  "gmvSummary": "Tổng quan GMV",
  "keyHighlights": ["điểm sáng 1", "điểm sáng 2"],
  "topMistakes": ["lỗi 1", "lỗi 2"],
  "hostCoaching": {
    "closingSkillScore": 85,
    "energyScore": 90,
    "productKnowledgeScore": 88,
    "speechRateScore": 80,
    "feedback": "..."
  },
  "actionableRecommendations": ["khuyến nghị 1", "khuyến nghị 2"]
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const insightsData = JSON.parse(response.text || "{}");
      return res.json({ success: true, isMock: false, insights: insightsData });
    } catch (error: any) {
      console.error("Gemini Session Analysis Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route: Multi-Agent AI Assistant
  app.post("/api/gemini/agent-chat", async (req, res) => {
    try {
      const { agentRole, userMessage } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        let reply = "";
        if (agentRole === "ceo") {
          reply = `[CEO Advisor AI]: Với vai trò CEO, tôi khuyên bạn nên tập trung tối ưu Margin trên từng phiên Live thay vì chạy theo GMV ròng. Tuần này Studio B đang trống 25% công suất, hãy đẩy nhanh việc khớp Host Yến Nhi với Brand La Roche-Posay để tối ưu dòng tiền.`;
        } else if (agentRole === "host_coach") {
          reply = `[Host Coach AI]: Chào bạn! Khi Host của bạn bị đứt nhịp ở phút 25, hãy cho Trợ lý góc máy chiếu bảng Flash Sale hoặc đọc comment khẩn cấp để Host có 15 giây lấy lại hơi và nước uống!`;
        } else if (agentRole === "talent_matcher") {
          reply = `[Talent Matcher AI]: Dựa trên dữ liệu 120 phiên live gần nhất, Host Minh Trí có CVR 6.2% trong ngành Thời Trang Nam, còn Host Bảo Ngọc giữ chân view đỉnh nhất ở mảng Beauty (3m12s trung bình).`;
        } else {
          reply = `[LiveOps Assistant AI]: Tôi đã nhận được yêu cầu: "${userMessage}". Dữ liệu agency hiện tại ổn định với 3/3 Studio đang vận hành đúng tiến độ.`;
        }
        return res.json({ success: true, isMock: true, reply });
      }

      const systemPrompts: Record<string, string> = {
        ceo: "Bạn là CEO AI Advisor cho TikTok Livestream Agency. Hãy trả lời ngắn gọn, tập trung vào P&L, tối ưu chi phí, dòng tiền, nhân sự và chiến lược tăng trưởng.",
        host_coach: "Bạn là Host Coach AI. Hãy tư vấn kỹ năng livestream, cách giữ năng lượng, kỹ thuật chốt đơn, tương tác mắt xem và xử lý tình huống phát sinh.",
        talent_matcher: "Bạn là Talent Matcher AI. Hãy giúp phân tích chỉ số Host/KOC (CTR, CVR, GMV, Tone, Tiềm năng) để chọn đúng người cho từng Brand.",
        data_analyst: "Bạn là Data Analyst AI chuyên sâu về TikTok Shop Live Dashboard, thuật toán phân phối luồng, retention rate và GMV/min.",
      };

      const prompt = `${systemPrompts[agentRole] || systemPrompts.ceo}\n\nNgười dùng hỏi: ${userMessage}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      return res.json({ success: true, isMock: false, reply: response.text });
    } catch (error: any) {
      console.error("Agent Chat Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for dev or static serving for prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LiveOps AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
