import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import * as Sentry from "@sentry/node";

dotenv.config();

// Error tracking (Phase 11) — no-op until SENTRY_DSN is set, same gated pattern as
// GEMINI_API_KEY/TIKTOK_APP_KEY: code runs identically either way, just silently
// skips reporting when unconfigured.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}
process.on("unhandledRejection", (reason) => {
  if (process.env.SENTRY_DSN) Sentry.captureException(reason);
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (error) => {
  if (process.env.SENTRY_DSN) Sentry.captureException(error);
  console.error("Uncaught Exception:", error);
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Lazy initialization helper for Gemini
  const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return null;
    }
    return new GoogleGenAI({ apiKey });
  };

  // Admin Supabase client — uses the service role key, which must only ever live
  // server-side (never VITE_-prefixed, never shipped to the browser). Needed for
  // account-level operations (invite/delete auth users) the anon key can't do.
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin =
    supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : null;

  // Verifies the caller's bearer token belongs to a signed-in `ceo` profile.
  // Returns the caller's user id on success, or null if unauthorized/misconfigured.
  const requireCeoCaller = async (req: express.Request): Promise<string | null> => {
    if (!supabaseAdmin) return null;
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return null;
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profileErr || !profile || profile.role !== "ceo") return null;
    return userData.user.id;
  };

  // API Route: Invite a new user account (creates a real Supabase Auth user + triggers
  // the `handle_new_user` trigger to create its `profiles` row).
  app.post("/api/admin/users/invite", async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY." });
    }
    const callerId = await requireCeoCaller(req);
    if (!callerId) {
      return res.status(403).json({ error: "Chỉ tài khoản CEO mới được tạo tài khoản mới." });
    }
    const { name, email, role, customRoleTitle, assignedBrandId, assignedTalentId } = req.body || {};
    if (!name || !email || !role) {
      return res.status(400).json({ error: "Thiếu name/email/role." });
    }
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { name, role, custom_role_title: customRoleTitle || "" }
    });
    if (error) {
      console.error("inviteUserByEmail error:", error);
      return res.status(400).json({ error: error.message });
    }
    if (data.user && (assignedBrandId || assignedTalentId)) {
      await supabaseAdmin
        .from("profiles")
        .update({
          assigned_brand_id: assignedBrandId || null,
          assigned_talent_id: assignedTalentId || null
        })
        .eq("id", data.user.id);
    }
    res.json({ success: true, id: data.user?.id });
  });

  // API Route: Permanently delete a user account (cascades to its `profiles` row).
  app.delete("/api/admin/users/:id", async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY." });
    }
    const callerId = await requireCeoCaller(req);
    if (!callerId) {
      return res.status(403).json({ error: "Chỉ tài khoản CEO mới được xóa tài khoản." });
    }
    const { id } = req.params;
    if (id === callerId) {
      return res.status(400).json({ error: "Không thể tự xóa tài khoản của chính mình." });
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ success: true });
  });

  // ============================================================
  // Giai đoạn 9: TikTok Shop Partner API — OAuth + Webhook thật.
  // Toàn bộ token (access/refresh) sống trong bảng `tiktok_shop_connections`, chỉ
  // đọc/ghi được bằng admin client (service_role) — client không bao giờ query bảng
  // này trực tiếp, luôn đi qua các endpoint dưới đây.
  // ============================================================
  const TIKTOK_APP_KEY = process.env.TIKTOK_APP_KEY || "";
  const TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET || "";
  const TIKTOK_WEBHOOK_SECRET = process.env.TIKTOK_WEBHOOK_SECRET || "";
  // Nơi TikTok redirect lại sau khi seller cấp quyền — phải khớp 100% với URL đã khai báo
  // trong TikTok Shop Partner Center khi tạo app.
  const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || "";
  const tiktokConfigured = () => Boolean(TIKTOK_APP_KEY && TIKTOK_APP_SECRET && TIKTOK_REDIRECT_URI);

  // Verifies the caller's bearer token belongs to any signed-in profile (no role restriction) —
  // used for read-only status/log endpoints that every logged-in user should be able to view.
  const requireAnyCaller = async (req: express.Request): Promise<string | null> => {
    if (!supabaseAdmin) return null;
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  };

  // API Route: returns a one-time-use TikTok authorization URL. The client redirects the
  // browser to it (window.location = url); TikTok then redirects the seller back to
  // TIKTOK_REDIRECT_URI with a `code` + `state` query param.
  app.get("/api/tiktok/oauth/authorize", async (req, res) => {
    if (!tiktokConfigured()) {
      return res.status(503).json({ error: "Server chưa cấu hình TIKTOK_APP_KEY/TIKTOK_APP_SECRET/TIKTOK_REDIRECT_URI." });
    }
    const callerId = await requireCeoCaller(req);
    if (!callerId) {
      return res.status(403).json({ error: "Chỉ tài khoản CEO mới được kết nối TikTok Shop." });
    }
    const state = crypto.randomBytes(16).toString("hex");
    // TikTok Shop Partner Center authorization entry point (Shop API for Partners, v2).
    const url = `https://services.tiktokshop.com/open/authorize?service_id=${encodeURIComponent(TIKTOK_APP_KEY)}&state=${state}`;
    res.json({ url, state });
  });

  // API Route: OAuth callback — TikTok redirects the seller's browser here after approval.
  app.get("/api/tiktok/oauth/callback", async (req, res) => {
    if (!supabaseAdmin || !tiktokConfigured()) {
      return res.status(503).send("TikTok integration chưa được cấu hình đầy đủ trên server.");
    }
    const code = String(req.query.code || "");
    if (!code) {
      return res.status(400).send("Thiếu authorization code từ TikTok.");
    }
    try {
      const tokenResp = await fetch(
        `https://auth.tiktok-shops.com/api/v2/token/get?app_key=${encodeURIComponent(TIKTOK_APP_KEY)}&app_secret=${encodeURIComponent(TIKTOK_APP_SECRET)}&auth_code=${encodeURIComponent(code)}&grant_type=authorized_code`
      );
      const tokenJson: any = await tokenResp.json();
      if (!tokenResp.ok || tokenJson.code) {
        console.error("TikTok token exchange error:", tokenJson);
        return res.status(400).send(`Lỗi trao đổi token với TikTok: ${tokenJson.message || tokenResp.statusText}`);
      }
      const data = tokenJson.data || tokenJson;
      const shopId = String(data.seller_id || data.shop_id || data.open_id || "unknown");
      const now = Date.now();
      const row = {
        shop_id: shopId,
        shop_name: data.seller_name || "",
        access_token: data.access_token,
        access_token_expires_at: new Date(now + (data.access_token_expire_in || 0) * 1000).toISOString(),
        refresh_token: data.refresh_token,
        refresh_token_expires_at: new Date(now + (data.refresh_token_expire_in || 0) * 1000).toISOString(),
        scope: Array.isArray(data.scope) ? data.scope.join(",") : String(data.scope || "")
      };
      const { error } = await supabaseAdmin.from("tiktok_shop_connections").upsert(row, { onConflict: "shop_id" });
      if (error) {
        console.error("Lưu TikTok connection thất bại:", error);
        return res.status(500).send("Lưu kết nối TikTok thất bại.");
      }
      res.redirect("/?tiktok=connected");
    } catch (err: any) {
      console.error("TikTok OAuth callback error:", err);
      res.status(500).send("Lỗi hệ thống khi xử lý callback TikTok.");
    }
  });

  // API Route: connection status — safe subset only (no tokens ever leave the server).
  app.get("/api/tiktok/status", async (req, res) => {
    if (!supabaseAdmin) {
      return res.json({ configured: false, connected: false });
    }
    const callerId = await requireAnyCaller(req);
    if (!callerId) {
      return res.status(403).json({ error: "Cần đăng nhập để xem trạng thái kết nối." });
    }
    const { data, error } = await supabaseAdmin
      .from("tiktok_shop_connections")
      .select("shop_id, shop_name, scope, access_token_expires_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Đọc TikTok connection status thất bại:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json({
      configured: tiktokConfigured(),
      connected: Boolean(data),
      shopId: data?.shop_id || null,
      shopName: data?.shop_name || null,
      scope: data?.scope || null,
      accessTokenExpiresAt: data?.access_token_expires_at || null,
      updatedAt: data?.updated_at || null
    });
  });

  // API Route: disconnect — CEO-only, removes stored tokens.
  app.post("/api/tiktok/disconnect", async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "Server chưa cấu hình Supabase Admin." });
    }
    const callerId = await requireCeoCaller(req);
    if (!callerId) {
      return res.status(403).json({ error: "Chỉ tài khoản CEO mới được ngắt kết nối TikTok Shop." });
    }
    const { error } = await supabaseAdmin.from("tiktok_shop_connections").delete().neq("shop_id", "");
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  });

  // API Route: webhook receiver — TikTok Shop pushes live/order events here. Must respond
  // fast (TikTok retries/kills the subscription on repeated timeouts), so we just verify +
  // persist the raw event; any downstream processing (matching to a live_session, updating
  // GMV) happens as a follow-up read of `tiktok_webhook_events`, not inline here.
  app.post("/api/tiktok/webhook", async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "Server chưa cấu hình Supabase Admin." });
    }
    // Signature verification: TikTok Shop signs webhook bodies with the app secret. Header name
    // varies by webhook version configured in Partner Center — confirm exact header once the
    // real app + webhook subscription exists, this checks the documented default.
    if (TIKTOK_WEBHOOK_SECRET) {
      const signature = String(req.headers["x-tts-signature"] || "");
      const expected = crypto
        .createHmac("sha256", TIKTOK_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body || {}))
        .digest("hex");
      if (!signature || signature !== expected) {
        console.error("TikTok webhook signature mismatch — event rejected.");
        return res.status(401).json({ error: "Invalid signature." });
      }
    }
    const body = req.body || {};
    const { error } = await supabaseAdmin.from("tiktok_webhook_events").insert({
      event_type: String(body.type || body.event_type || "unknown"),
      shop_id: String(body.shop_id || ""),
      payload: body
    });
    if (error) {
      console.error("Lưu TikTok webhook event thất bại:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  });

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
        model: "gemini-flash-latest",
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
        model: "gemini-flash-latest",
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
        model: "gemini-flash-latest",
        contents: prompt,
      });

      return res.json({ success: true, isMock: false, reply: response.text });
    } catch (error: any) {
      console.error("Agent Chat Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route: AI Talent Matching — replaces the old client-side `96 - idx*5` formula.
  app.post("/api/gemini/match-talents", async (req, res) => {
    try {
      const { brand, targetCategory, talents } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        // Fallback: same shape as before Phase 10 (formula-based), used only when no API key is set.
        const results = (talents || []).map((t: any, idx: number) => ({
          talentId: t.id,
          name: t.name,
          matchScore: Math.max(70, 96 - idx * 5),
          predictedGmv: `${((t.avgGmvPerSession || 100000000) / 1000000).toFixed(0)}M - ${(((t.avgGmvPerSession || 100000000) * 1.25) / 1000000).toFixed(0)}M đ`,
          reasoning: `Thế mạnh ngành ${(t.niches || []).join(", ") || "Đa ngành"}, CVR trung bình ${t.cvrAvg}% với ${(t.followersTikTok || 0).toLocaleString()} followers. Rất phù hợp với ${brand?.name || "Brand"}.`
        }));
        return res.json({ success: true, isMock: true, results });
      }

      const prompt = `Bạn là Talent Matcher AI cho Agency Livestream TikTok Shop, chuyên ghép Host/KOC phù hợp nhất cho từng Brand dựa trên dữ liệu thật.

Thương hiệu cần ghép: ${brand?.name || "Brand"} (Ngành: ${brand?.industry || "N/A"})
Danh mục sản phẩm SKU mục tiêu: ${targetCategory}

Danh sách Talent hiện có (dữ liệu thật từ hệ thống):
${JSON.stringify(talents)}

Hãy chấm điểm mức độ phù hợp (matchScore, 0-100) cho MỖI talent trong danh sách trên dựa trên: mức độ khớp ngành hàng (niches) với ngành của Brand/SKU, CVR, số followers, GMV trung bình mỗi phiên. Đưa ra lý do (reasoning) ngắn gọn, cụ thể dựa trên số liệu thật đã cho — không bịa số liệu không có trong dữ liệu.

Định dạng JSON trả về (mảng, giữ nguyên thứ tự talentId đầu vào):
{
  "results": [
    { "talentId": "...", "name": "...", "matchScore": 92, "predictedGmv": "150M - 190M đ", "reasoning": "..." }
  ]
}`;

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const data = JSON.parse(response.text || "{}");
      return res.json({ success: true, isMock: false, results: data.results || [] });
    } catch (error: any) {
      console.error("Gemini Talent Matching Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route: AI Brand Meeting Summarizer & Action Item Generator
  app.post("/api/gemini/summarize-meeting", async (req, res) => {
    try {
      const { meetingNotes } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          success: true,
          isMock: true,
          summary: "📌 AI Tóm Tắt & Hành Động Cần Làm:\n1. Tăng ngân sách Contract thêm +150.000.000đ cho Campaign Mega Live 8/8.\n2. Task KAM Lê Quốc Bảo: Khớp nối thêm 2 Host dự phòng (Ưu tiên Host Bích Ngọc) cho dải sản phẩm Haircare.\n3. Task Moderator Tuấn: Cấu hình bot tự động ghim Voucher 100k đúng khung giờ vàng 20:00 - 21:00."
        });
      }

      const prompt = `Bạn là Trợ Lý AI cho Agency Livestream TikTok Shop, chuyên tóm tắt biên bản họp với Brand và tạo danh sách hành động cụ thể.

Ghi chú cuộc họp thật (do người dùng nhập):
"""
${meetingNotes}
"""

Hãy đọc kỹ ghi chú trên (KHÔNG bịa thêm thông tin không có trong ghi chú) và trả về:
1. Tóm tắt ngắn gọn các quyết định/thỏa thuận chính.
2. Danh sách hành động cụ thể (action items), mỗi mục nêu rõ ai làm gì nếu ghi chú có nhắc tên người, hoặc mô tả việc cần làm nếu không có tên cụ thể.

Trả về dạng text thuần (không JSON), định dạng:
📌 AI Tóm Tắt & Hành Động Cần Làm:
1. ...
2. ...
3. ...`;

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt,
      });

      return res.json({ success: true, isMock: false, summary: response.text || "" });
    } catch (error: any) {
      console.error("Gemini Meeting Summary Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

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
