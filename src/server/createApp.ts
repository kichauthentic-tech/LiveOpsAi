import express from "express";
import crypto from "crypto";
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

// Builds the Express app with every API route registered, but no listen()/static
// serving/Vite middleware — those differ between local dev (server.ts) and Vercel
// serverless (api/index.ts), so callers attach what they need after createApp().
export function createApp() {
  const app = express();

  // Capture the raw request body bytes alongside the parsed JSON. Needed for
  // HMAC webhook signature verification (TikTok signs the raw bytes it sent,
  // not a client-side re-serialization of the parsed object — key order/
  // whitespace differences would otherwise make a genuine signature fail,
  // or worse, make a forged one that happens to re-stringify identically
  // pass).
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      }
    })
  );

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

  type CallerResult = { userId: string; reason?: undefined } | { userId?: undefined; reason: string };

  // Verifies the caller's bearer token belongs to a signed-in `ceo` (or `admin` — Admin is
  // a superset of CEO, see Giai đoạn 13/PROJECT_STATUS.md) profile. Returns the caller's
  // user id on success, or a `reason` string on failure — the reason is surfaced in the
  // 403 response so misconfigurations (wrong Supabase project, expired session, role not
  // actually set) are diagnosable from the client without server log access.
  const requireCeoCaller = async (req: express.Request): Promise<CallerResult> => {
    if (!supabaseAdmin) return { reason: "server_not_configured" };
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return { reason: "no_token" };
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return { reason: `invalid_token: ${userErr?.message || "unknown"}` };
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profileErr) return { reason: `profile_lookup_failed: ${profileErr.message}` };
    if (!profile) return { reason: "profile_not_found" };
    if (profile.role !== "ceo" && profile.role !== "admin") return { reason: `role_is_${profile.role}` };
    return { userId: userData.user.id };
  };

  // Verifies the caller's bearer token belongs to a signed-in `admin` profile — used
  // exclusively for the AI Training Center (system prompt config), which is deliberately
  // NOT accessible to `ceo` (see ai_agent_prompts RLS in 0012_admin_ai_training_setup.sql).
  const requireAdminCaller = async (req: express.Request): Promise<CallerResult> => {
    if (!supabaseAdmin) return { reason: "server_not_configured" };
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return { reason: "no_token" };
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) return { reason: `invalid_token: ${userErr?.message || "unknown"}` };
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profileErr) return { reason: `profile_lookup_failed: ${profileErr.message}` };
    if (!profile) return { reason: "profile_not_found" };
    if (profile.role !== "admin") return { reason: `role_is_${profile.role}` };
    return { userId: userData.user.id };
  };

  // Returns the admin-configured system prompt for an AI agent (`ai_agent_prompts.system_prompt`),
  // falling back to `hardcodedDefault` when the table is missing, unseeded, or the row's prompt
  // is empty — keeps every /api/gemini/* route working identically before migration 0012 is
  // applied and before any admin has customized a given agent.
  const getAgentPrompt = async (agentKey: string, hardcodedDefault: string): Promise<string> => {
    if (!supabaseAdmin) return hardcodedDefault;
    try {
      const { data, error } = await supabaseAdmin
        .from("ai_agent_prompts")
        .select("system_prompt")
        .eq("agent_key", agentKey)
        .maybeSingle();
      if (error || !data?.system_prompt?.trim()) return hardcodedDefault;
      return data.system_prompt;
    } catch {
      return hardcodedDefault;
    }
  };

  // API Route: Invite a new user account (creates a real Supabase Auth user + triggers
  // the `handle_new_user` trigger to create its `profiles` row).
  app.post("/api/admin/users/invite", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY." });
      }
      const caller = await requireCeoCaller(req);
      if (!caller.userId) {
        return res.status(403).json({ error: `Chỉ tài khoản CEO/Admin mới được tạo tài khoản mới. (${caller.reason})` });
      }
      const callerId = caller.userId;
      const { name, email, role, customRoleTitle, assignedBrandId, assignedTalentId } = req.body || {};
      if (!name || !email || !role) {
        return res.status(400).json({ error: "Thiếu name/email/role." });
      }
      // Supabase's invite email otherwise falls back to the dashboard's Site URL
      // (commonly left at the localhost default), sending invitees to a dead link —
      // derive the real origin from the request instead.
      const requestOrigin = (req.headers.origin as string) || `${req.protocol}://${req.get("host")}`;
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { name, role, custom_role_title: customRoleTitle || "" },
        redirectTo: requestOrigin
      });
      if (error) {
        console.error("inviteUserByEmail error:", error);
        return res.status(400).json({ error: error.message });
      }
      let assignmentWarning: string | null = null;
      if (data.user && (assignedBrandId || assignedTalentId)) {
        const { error: assignError } = await supabaseAdmin
          .from("profiles")
          .update({
            assigned_brand_id: assignedBrandId || null,
            assigned_talent_id: assignedTalentId || null
          })
          .eq("id", data.user.id);
        if (assignError) {
          console.error("Gán assigned_brand_id/assigned_talent_id thất bại sau khi invite:", assignError);
          assignmentWarning = "Tài khoản đã được tạo nhưng gán Brand/Talent thất bại — vui lòng sửa lại thủ công.";
        }
      }
      res.json({ success: true, id: data.user?.id, warning: assignmentWarning });
    } catch (err: any) {
      console.error("Invite user error:", err);
      res.status(500).json({ error: "Lỗi hệ thống khi tạo tài khoản mới." });
    }
  });

  // API Route: Permanently delete a user account (cascades to its `profiles` row).
  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Server chưa cấu hình SUPABASE_SERVICE_ROLE_KEY." });
      }
      const caller = await requireCeoCaller(req);
      if (!caller.userId) {
        return res.status(403).json({ error: `Chỉ tài khoản CEO/Admin mới được xóa tài khoản. (${caller.reason})` });
      }
      const callerId = caller.userId;
      const { id } = req.params;
      if (id === callerId) {
        return res.status(400).json({ error: "Không thể tự xóa tài khoản của chính mình." });
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete user error:", err);
      res.status(500).json({ error: "Lỗi hệ thống khi xóa tài khoản." });
    }
  });

  // ============================================================
  // Giai đoạn 13: AI Training Center — chỉ 'admin' đọc/ghi được (kể cả 'ceo' cũng
  // không có quyền, xem RLS trong 0012_admin_ai_training_setup.sql). Client không bao
  // giờ query bảng `ai_agent_prompts` trực tiếp, luôn đi qua 2 route dưới đây.
  // ============================================================
  app.get("/api/admin/ai-agent-prompts", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Server chưa cấu hình Supabase Admin." });
      }
      const caller = await requireAdminCaller(req);
      if (!caller.userId) {
        return res.status(403).json({ error: `Chỉ tài khoản Admin mới được xem AI Training Center. (${caller.reason})` });
      }
      const { data, error } = await supabaseAdmin.from("ai_agent_prompts").select("*").order("category").order("agent_key");
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ prompts: data || [] });
    } catch (err: any) {
      console.error("Fetch AI agent prompts error:", err);
      res.status(500).json({ error: "Lỗi hệ thống khi tải AI Training Center." });
    }
  });

  app.patch("/api/admin/ai-agent-prompts/:agentKey", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Server chưa cấu hình Supabase Admin." });
      }
      const caller = await requireAdminCaller(req);
      if (!caller.userId) {
        return res.status(403).json({ error: `Chỉ tài khoản Admin mới được sửa AI Training Center. (${caller.reason})` });
      }
      const callerId = caller.userId;
      const { agentKey } = req.params;
      const { systemPrompt } = req.body || {};
      if (typeof systemPrompt !== "string" || !systemPrompt.trim()) {
        return res.status(400).json({ error: "System prompt không được để trống." });
      }
      const { data, error } = await supabaseAdmin
        .from("ai_agent_prompts")
        .update({ system_prompt: systemPrompt, updated_by: callerId, updated_at: new Date().toISOString() })
        .eq("agent_key", agentKey)
        .select("*")
        .single();
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ prompt: data });
    } catch (err: any) {
      console.error("Update AI agent prompt error:", err);
      res.status(500).json({ error: "Lỗi hệ thống khi lưu system prompt." });
    }
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

  // CSRF protection for the OAuth flow: `state` must be a value this server actually issued
  // via /oauth/authorize, single-use, and short-lived — otherwise the callback would accept
  // any `code` regardless of `state`, which defeats the point of having one.
  //
  // NOTE (Vercel serverless): this Map is per-instance/per-process memory, unlike the local
  // dev server which is a single long-lived process. On Vercel, /oauth/authorize and
  // /oauth/callback can land on different function instances, so a state issued by one
  // instance may not be visible to another — an OAuth connect attempt could occasionally fail
  // with "phiên xác thực không hợp lệ" and need a retry. Acceptable for a low-volume,
  // CEO-only, one-time connect flow; if this becomes a real problem, move state to a Supabase
  // table with a short TTL instead of in-memory.
  const pendingOAuthStates = new Map<string, number>();
  const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
  const pruneExpiredOAuthStates = () => {
    const now = Date.now();
    for (const [state, expiresAt] of pendingOAuthStates) {
      if (expiresAt < now) pendingOAuthStates.delete(state);
    }
  };

  // Minimal in-memory fixed-window rate limiter (no new dependency) for the two public,
  // unauthenticated-by-nature endpoints (webhook receiver, OAuth callback) that a bot could
  // otherwise hammer.
  //
  // NOTE (Vercel serverless): same caveat as pendingOAuthStates above — each function instance
  // has its own bucket map, so this limits per-instance, not globally. Still meaningfully
  // reduces abuse (a hammering bot mostly hits warm instances), just not a hard global cap.
  // Fine for now; revisit with a real rate limiter (e.g. Upstash Redis) if abuse is observed.
  const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
  const rateLimit = (windowMs: number, max: number) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= max) {
      return res.status(429).json({ error: "Quá nhiều request, thử lại sau." });
    }
    bucket.count += 1;
    next();
  };

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
    try {
      if (!tiktokConfigured()) {
        return res.status(503).json({ error: "Server chưa cấu hình TIKTOK_APP_KEY/TIKTOK_APP_SECRET/TIKTOK_REDIRECT_URI." });
      }
      const caller = await requireCeoCaller(req);
      if (!caller.userId) {
        return res.status(403).json({ error: `Chỉ tài khoản CEO/Admin mới được kết nối TikTok Shop. (${caller.reason})` });
      }
      pruneExpiredOAuthStates();
      const state = crypto.randomBytes(16).toString("hex");
      pendingOAuthStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);
      // TikTok Shop Partner Center authorization entry point (Shop API for Partners, v2).
      const url = `https://services.tiktokshop.com/open/authorize?service_id=${encodeURIComponent(TIKTOK_APP_KEY)}&state=${state}`;
      res.json({ url, state });
    } catch (err: any) {
      console.error("TikTok oauth/authorize error:", err);
      res.status(500).json({ error: "Lỗi hệ thống khi tạo authorization URL." });
    }
  });

  // API Route: OAuth callback — TikTok redirects the seller's browser here after approval.
  app.get("/api/tiktok/oauth/callback", rateLimit(60_000, 30), async (req, res) => {
    if (!supabaseAdmin || !tiktokConfigured()) {
      return res.status(503).send("TikTok integration chưa được cấu hình đầy đủ trên server.");
    }
    const code = String(req.query.code || "");
    if (!code) {
      return res.status(400).send("Thiếu authorization code từ TikTok.");
    }
    const state = String(req.query.state || "");
    pruneExpiredOAuthStates();
    if (!state || !pendingOAuthStates.has(state)) {
      console.error("TikTok OAuth callback rejected: missing/unknown/expired state.");
      return res.status(400).send("Phiên xác thực TikTok không hợp lệ hoặc đã hết hạn, vui lòng kết nối lại.");
    }
    pendingOAuthStates.delete(state); // single-use
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
    try {
      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Server chưa cấu hình Supabase Admin." });
      }
      const caller = await requireCeoCaller(req);
      if (!caller.userId) {
        return res.status(403).json({ error: `Chỉ tài khoản CEO/Admin mới được ngắt kết nối TikTok Shop. (${caller.reason})` });
      }
      const { error } = await supabaseAdmin.from("tiktok_shop_connections").delete().neq("shop_id", "");
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("TikTok disconnect error:", err);
      res.status(500).json({ error: "Lỗi hệ thống khi ngắt kết nối TikTok." });
    }
  });

  // API Route: webhook receiver — TikTok Shop pushes live/order events here. Must respond
  // fast (TikTok retries/kills the subscription on repeated timeouts), so we just verify +
  // persist the raw event; any downstream processing (matching to a live_session, updating
  // GMV) happens as a follow-up read of `tiktok_webhook_events`, not inline here.
  app.post("/api/tiktok/webhook", rateLimit(60_000, 120), async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "Server chưa cấu hình Supabase Admin." });
    }
    // Fail closed: without a configured secret there is no way to verify the
    // caller is really TikTok, so refuse the event instead of accepting an
    // unauthenticated POST from anyone who finds this URL. (Previously this
    // skipped verification entirely and accepted the event when the secret
    // was unset — a silent fail-open.)
    if (!TIKTOK_WEBHOOK_SECRET) {
      console.error("TIKTOK_WEBHOOK_SECRET chưa cấu hình — từ chối webhook event.");
      return res.status(503).json({ error: "Server chưa cấu hình TIKTOK_WEBHOOK_SECRET." });
    }
    // Signature verification: TikTok Shop signs the raw webhook body bytes with the app
    // secret. Header name varies by webhook version configured in Partner Center — confirm
    // exact header once the real app + webhook subscription exists, this checks the
    // documented default. Signs `rawBody` (captured in the express.json() verify hook above),
    // not a re-stringified req.body, since re-serialization can differ from what TikTok signed.
    const signature = String(req.headers["x-tts-signature"] || "");
    const rawBody: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const expected = crypto.createHmac("sha256", TIKTOK_WEBHOOK_SECRET).update(rawBody).digest("hex");
    const signatureBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    // timingSafeEqual throws on mismatched lengths, so check that first — an invalid/absent
    // signature just fails the check below rather than crashing the request.
    const signatureValid =
      signature.length > 0 &&
      signatureBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(signatureBuf, expectedBuf);
    if (!signatureValid) {
      console.error("TikTok webhook signature mismatch — event rejected.");
      return res.status(401).json({ error: "Invalid signature." });
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
  // Monitoring (Phase 11) — actually checks DB reachability, not just "process is alive",
  // so an uptime monitor gets a real 503 when Supabase is unreachable, not a false "ok".
  app.get("/api/health", async (req, res) => {
    let databaseOk = false;
    // Public/unauthenticated endpoint — never echo raw Supabase error text (could leak
    // internal table/column names to anyone probing this URL). Log the detail server-side,
    // return only a generic reason in the response body.
    let databaseError: string | null = null;
    if (supabaseAdmin) {
      try {
        const { error } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).limit(1);
        if (error) throw error;
        databaseOk = true;
      } catch (err: any) {
        console.error("Health check DB query failed:", err);
        databaseError = "Không kết nối được tới Supabase.";
      }
    } else {
      databaseError = "SUPABASE_SERVICE_ROLE_KEY chưa cấu hình — không kiểm tra được kết nối DB";
    }

    res.status(databaseOk ? 200 : 503).json({
      status: databaseOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseOk,
        databaseError,
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        tiktokConfigured: Boolean(process.env.TIKTOK_APP_KEY && process.env.TIKTOK_APP_SECRET),
        sentryConfigured: Boolean(process.env.SENTRY_DSN),
      },
    });
  });

  // Gemini routes previously had no auth check at all — any unauthenticated caller could
  // invoke them and drive up Gemini API usage/cost. Every /api/gemini/* route now requires
  // a signed-in caller (any role — these AI features aren't role-restricted in the app),
  // and rejects oversized payloads to bound per-request token cost.
  const requireAuthedCallerOrReject = async (req: express.Request, res: express.Response): Promise<string | null> => {
    if (!supabaseAdmin) {
      res.status(503).json({ error: "Server chưa cấu hình Supabase Admin." });
      return null;
    }
    const callerId = await requireAnyCaller(req);
    if (!callerId) {
      res.status(401).json({ error: "Cần đăng nhập để dùng tính năng AI." });
      return null;
    }
    return callerId;
  };
  const MAX_AI_PAYLOAD_CHARS = 50_000;
  const rejectIfPayloadTooLarge = (req: express.Request, res: express.Response): boolean => {
    if (JSON.stringify(req.body || {}).length > MAX_AI_PAYLOAD_CHARS) {
      res.status(413).json({ error: `Payload quá lớn cho AI request (giới hạn ${MAX_AI_PAYLOAD_CHARS.toLocaleString()} ký tự).` });
      return true;
    }
    return false;
  };

  // API Route: AI Script Generator
  const SCRIPT_GENERATOR_DEFAULT_PROMPT =
    "Bạn là Giám Đốc Sản Xuất Nội Dung Livestream cấp Agency, đã trực tiếp biên kịch hàng trăm phiên Mega Live cho các nhãn hàng FMCG/Mẹ & Bé/Mỹ phẩm lớn (kiểu Nestlé, Unilever) phối hợp với KOL. Nhiệm vụ của bạn là viết ra một FULL PRODUCTION SCRIPT — tài liệu vận hành thật mà 2 Host có thể cầm lên đọc gần như nguyên văn trong nhiều giờ live, không phải một dàn ý tóm tắt. Kịch bản phải DÀI, CHI TIẾT, có thoại đầy đủ luân phiên giữa 2 Host (tung hứng tự nhiên, không phải 1 người độc thoại), có cấu trúc quà tặng theo tầng, có minigame với cú pháp tham gia rõ ràng, có sẵn ngân hàng câu hỏi thường gặp kèm câu trả lời mẫu, và liên tục nhắc lại khuyến mãi bằng kỹ thuật tạo khan hiếm (đếm ngược số lượng quà/voucher còn lại) trước khi chuyển sản phẩm. Luôn tối ưu cho tỷ lệ chuyển đổi (CVR) và giữ chân người xem (retention), đồng thời tuân thủ nghiêm ngặt các quy tắc Do & Don't về ngôn từ quảng cáo (không dùng từ khẳng định tuyệt đối như 'tốt nhất', 'số một', 'trăm phần trăm khỏi hẳn'; không nhắc tên nền tảng thứ ba ngoài Facebook; không dùng từ ngữ nhạy cảm về vóc dáng/cân nặng).";

  app.post("/api/gemini/generate-script", async (req, res) => {
    try {
      if (!(await requireAuthedCallerOrReject(req, res))) return;
      if (rejectIfPayloadTooLarge(req, res)) return;
      const {
        brandName,
        productCategory,
        skus,
        targetAudience,
        tone,
        durationMinutes,
        keySellingPoints,
        promotionDetails,
        objectionHandling,
        ctaFrequency
      } = req.body;
      const ai = getGeminiClient();
      const skuList: string[] = Array.isArray(skus) ? skus.filter(Boolean) : (skus ? [skus] : []);
      const heroSku1 = skuList[0] || "Sản phẩm Hero #1";
      const heroSku2 = skuList[1] || heroSku1;

      if (!ai) {
        // Fallback intelligent response if API key is not yet set
        return res.json({
          success: true,
          isMock: true,
          script: {
            title: `Kịch Bản Livestream TikTok - ${brandName || "Brand"} (${durationMinutes || 60} Phút)`,
            campaignHeader: {
              channel: "TikTok Shop / Fanpage",
              hostSetup: "2 MC (Host A dẫn dắt chính, Host B hỗ trợ tương tác & đọc bình luận)",
              totalDuration: `${durationMinutes || 60} phút`
            },
            opening: {
              time: "00:00 - 05:00",
              hook: `🔥 BÙM NỔ LỚN! Chào mừng cả nhà đến với phiên LIVE đặc quyền của ${brandName || "Thương hiệu"}. Hôm nay có deal độc quyền GIẢM SÂU + VOUCHER SÀN, mua càng nhiều quà càng to!`,
              action: "Bật nhạc sôi động, ghim sản phẩm Hero SKU #1, yêu cầu thả tim & share live đạt mốc để mở quà 0 đồng.",
              dialogue: [
                { speaker: "Host A", line: `Xin chào cả nhà! Chào mừng mọi người đã đến với phiên live đặc biệt hôm nay của ${brandName || "chúng mình"}!` },
                { speaker: "Host B", line: "Đúng vậy đó cả nhà ơi! Hôm nay tụi mình có siêu nhiều ưu đãi, mua càng nhiều quà càng to, các bạn nhớ ở lại theo dõi hết phiên live nha!" },
                { speaker: "Host A", line: `Trước tiên, để mở khóa quà 0 đồng, cả nhà thả tim thật nhiều và share live giúp tụi mình nhé! Mục tiêu hôm nay là 5,000 tim!` }
              ]
            },
            parts: [
              {
                partName: "Phần 1 - Giới thiệu chương trình khuyến mãi",
                timeCode: "00:05 - 00:20",
                durationMinutes: Math.max(15, Math.round((durationMinutes || 60) * 0.25)),
                keyActivities: [
                  "Host giới thiệu tổng quan chương trình khuyến mãi đang chạy, nhấn mạnh cơ chế 'mua càng nhiều, quà càng to'",
                  "Host giới thiệu các phần chính sẽ diễn ra trong buổi live",
                  "Host tổ chức minigame 1 để tăng tương tác ngay từ đầu",
                  "Host nhắc lại khuyến mãi trước khi chuyển sang giới thiệu sản phẩm"
                ],
                focusProduct: heroSku1,
                usp: keySellingPoints || "USP chính của sản phẩm",
                giftTiers: [
                  { tier: "Tầng 1 - Quà tại chỗ", condition: `Mua ${heroSku1}`, gifts: "Quà tặng kèm hấp dẫn (balo, dụng cụ học tập...)" },
                  { tier: "Tầng 2 - Quay số may mắn", condition: "Hóa đơn từ 500K", gifts: promotionDetails || "Cơ hội trúng giải lớn + hàng loạt quà giá trị" },
                  { tier: "Tầng 3 - Ưu đãi trong Livestream", condition: "Chốt đơn ngay trong phiên live", gifts: "Voucher giảm giá/freeship độc quyền chỉ trong khung giờ live" }
                ],
                dialogue: [
                  { speaker: "Host A", line: `Cả nhà ơi, hôm nay là ngày đặc biệt của ${brandName || "chúng mình"} đó nha! Chỉ cần mua hàng là cả nhà đã có cơ hội nhận đến 3 tầng quà tặng luôn!` },
                  { speaker: "Host B", line: `Đúng rồi đó! Để mình giải thích rõ hơn cho cả nhà dễ hiểu nha: Tầng 1 là quà tặng ngay khi mua ${heroSku1}, Tầng 2 là cơ hội quay số trúng giải lớn với hóa đơn từ 500K, và Tầng 3 là ưu đãi độc quyền chỉ có trong livestream hôm nay thôi đó!` },
                  { speaker: "Host A", line: "Nghe hấp dẫn chưa nào? Cả nhà nhớ theo dõi hết phiên live để không bỏ lỡ deal nào nhé!" }
                ],
                minigame: {
                  name: "Minigame 1 - Khởi động",
                  howToPlay: `Bước 1: Chia sẻ Livestream này ở chế độ công khai. Bước 2: Bình luận trả lời câu hỏi liên quan tới ${heroSku1} kèm hashtag chương trình.`,
                  hashtagSyntax: `Câu trả lời + #${(brandName || "Brand").replace(/\s+/g, "")}Live`,
                  winCondition: "Bình luận đúng & nhanh nhất, được chọn ngẫu nhiên trong số hợp lệ",
                  prizeCount: "5-10 giải",
                  prize: "Quà tặng nhỏ liên quan sản phẩm"
                },
                faqBank: [
                  { question: `${objectionHandling || "Hàng có chính hãng không?"}`, answer: `Cả nhà yên tâm nha, ${brandName || "sản phẩm"} là hàng chính hãng 100%, có đầy đủ tem nhãn/chứng từ, cả nhà cứ an tâm mua sắm nhé!` }
                ],
                urgencyPush: "Số lượng quà tặng Tầng 1 có hạn, cả nhà nhanh tay chốt đơn trước khi hết suất nha!",
                complianceNotes: ["Không dùng từ khẳng định tuyệt đối (tốt nhất/số một/100%)", "Chỉ nhắc Facebook nếu cần dẫn dắt nền tảng khác, không nhắc thẳng tên sàn/app đối thủ"]
              },
              {
                partName: `Phần 2 - Giải mã ${heroSku2}`,
                timeCode: "00:20 - 00:40",
                durationMinutes: Math.max(15, Math.round((durationMinutes || 60) * 0.35)),
                keyActivities: [
                  `2 Host chia sẻ chất lượng, USP và RTB của ${heroSku2}`,
                  "2 Host tương tác qua lại, đọc và giải đáp câu hỏi khán giả",
                  "2 Host tổ chức minigame 2 khuyến khích chia sẻ trải nghiệm",
                  "2 Host nhắc lại khuyến mãi trước khi chuyển sản phẩm tiếp theo"
                ],
                focusProduct: heroSku2,
                usp: keySellingPoints || "Điểm bán chính nổi bật của sản phẩm",
                giftTiers: [
                  { tier: "Tầng 1 - Quà tại chỗ", condition: `Mua ${heroSku2}`, gifts: "Quà tặng kèm theo số lượng mua" },
                  { tier: "Tầng 2 - Quay số may mắn", condition: "Hóa đơn từ 500K", gifts: "Giải thưởng lớn + quà giá trị" },
                  { tier: "Tầng 3 - Ưu đãi trong Livestream", condition: "Chốt đơn nhanh nhất", gifts: "Quà đặc biệt cho khách chốt đơn giá trị cao" }
                ],
                dialogue: [
                  { speaker: "Host B", line: `Tiếp theo, chúng ta sẽ cùng khám phá ${heroSku2} — sản phẩm đang được rất nhiều khách hàng tin dùng đó cả nhà!` },
                  { speaker: "Host A", line: `Đúng vậy đó! ${keySellingPoints || "Sản phẩm này có nhiều ưu điểm nổi bật"}, chắc chắn sẽ phù hợp với nhu cầu của rất nhiều bạn xem live hôm nay.` },
                  { speaker: "Host B", line: "Cả nhà có câu hỏi gì về sản phẩm này thì cứ bình luận ngay bên dưới, tụi mình sẽ giải đáp liền nha!" },
                  { speaker: "Host A", line: `Và đừng quên, mua ${heroSku2} ngay hôm nay là có cơ hội nhận đến 3 tầng quà tặng luôn đó, nhanh tay chốt đơn nha cả nhà!` }
                ],
                minigame: {
                  name: "Minigame 2 - Chia sẻ trải nghiệm",
                  howToPlay: `Bình luận chia sẻ trải nghiệm hoặc cảm nhận về ${heroSku2} kèm hashtag chương trình`,
                  hashtagSyntax: `Trải nghiệm của bạn + #${(brandName || "Brand").replace(/\s+/g, "")}Review`,
                  winCondition: "Bình luận hay/chân thực nhất được chọn",
                  prizeCount: "2-3 giải",
                  prize: "Quà tặng giá trị vừa"
                },
                faqBank: [
                  { question: "Sản phẩm này dùng có phù hợp không?", answer: `Cả nhà cứ yên tâm nha, ${heroSku2} phù hợp với ${targetAudience || "đa số khách hàng mục tiêu"}, có thể dùng thử để cảm nhận trực tiếp!` }
                ],
                urgencyPush: "Chỉ còn số lượng ít quà Tầng 1, cả nhà tranh thủ chốt đơn ngay kẻo hết nha!",
                complianceNotes: ["Đọc đúng tên thương hiệu/sản phẩm", "Không dùng từ ngữ tuyệt đối khi mô tả công dụng"]
              }
            ],
            closing: {
              time: `${(durationMinutes || 60) - 10} - ${durationMinutes || 60}:00`,
              strategy: "Nhắc lại toàn bộ sản phẩm hot nhất phiên live, hối thúc chốt đơn chưa thanh toán trong giỏ hàng.",
              callToAction: "Cảm ơn cả nhà, ấn Nút Theo Dõi kênh để nhận thông báo phiên LIVE tiếp theo!",
              dialogue: [
                { speaker: "Host A", line: "Vậy là buổi livestream hôm nay sắp khép lại rồi, cả nhà nhớ chốt đơn những sản phẩm còn đang để trong giỏ hàng nha!" },
                { speaker: "Host B", line: "Cảm ơn cả nhà đã đồng hành cùng tụi mình suốt phiên live hôm nay! Đừng quên theo dõi kênh để không bỏ lỡ phiên live tiếp theo nha!" }
              ]
            }
          }
        });
      }

      const systemPrompt = await getAgentPrompt("script_generator", SCRIPT_GENERATOR_DEFAULT_PROMPT);
      const cadence = ctaFrequency || "Mỗi 5 phút";
      const estimatedPartCount = Math.max(2, Math.min(6, Math.round((durationMinutes || 60) / 25)));

      const prompt = `${systemPrompt}

Thông tin Brief:
- Thương hiệu: ${brandName}
- Ngành hàng: ${productCategory}
- Danh sách SKUs chính: ${skuList.join(", ") || "Không có ghi chú riêng — tự đề xuất SKU hợp lý theo ngành hàng"}
- Khách hàng mục tiêu: ${targetAudience}
- Tone giọng & Phong cách: ${tone}
- Thời lượng phiên live: ${durationMinutes} phút
- USP / Điểm bán chính cần nhấn mạnh: ${keySellingPoints || "Không có ghi chú riêng — tự chọn USP hợp lý theo ngành hàng"}
- Chương trình khuyến mãi/voucher/flash-sale đang chạy: ${promotionDetails || "Không có ghi chú riêng — tự đề xuất khuyến mãi hợp lý, có cấu trúc theo tầng (tại chỗ / quay số hóa đơn lớn / ưu đãi riêng trong livestream)"}
- Câu hỏi/từ chối thường gặp cần xử lý sẵn: ${objectionHandling || "Không có ghi chú riêng — tự dự đoán từ chối phổ biến của ngành hàng"}
- Nhịp độ CTA/chốt đơn: ${cadence}

Đây là yêu cầu viết một FULL PRODUCTION SCRIPT dài và chi tiết, theo đúng chuẩn tài liệu vận hành thật của agency chuyên nghiệp — KHÔNG PHẢI một dàn ý tóm tắt. Yêu cầu bắt buộc:

1. Chia phiên live thành khoảng ${estimatedPartCount} "parts" (phần lớn, mỗi phần ~20-40 phút, mỗi phần thường xoay quanh 1 SKU hoặc 1 chủ đề/USP cụ thể) — không chia vụn thành hàng chục đoạn 5 phút.
2. Mỗi "part.dialogue" PHẢI là một đoạn thoại ĐẦY ĐỦ, DÀI (tối thiểu 8-14 lượt thoại luân phiên giữa "Host A" và "Host B"), tự nhiên như 2 người dẫn thật đang tung hứng với nhau — không phải tóm tắt 1 câu. Thoại phải: (a) giới thiệu USP/RTB cụ thể của focusProduct kèm số liệu/chứng nhận nếu Brief có cung cấp, (b) có ít nhất 1 đoạn 2 Host cùng nhắc lại chi tiết các giftTiers bằng lời thoại tự nhiên (không chỉ liệt kê khô khan), (c) có ít nhất 1 câu tạo khan hiếm/countdown trước khi kết thúc part.
3. "giftTiers" luôn có đúng cấu trúc 3 tầng: Tầng 1 (quà tại chỗ theo số lượng mua), Tầng 2 (quay số/hóa đơn lớn), Tầng 3 (ưu đãi độc quyền chỉ trong khung giờ livestream) — điều chỉnh nội dung theo Brief, giữ nguyên tinh thần "mua càng nhiều, quà càng to".
4. "minigame" của mỗi part phải có "hashtagSyntax" là cú pháp bình luận CỤ THỂ (vd: "Câu trả lời + hashtag + tag 2 bạn"), không viết chung chung "tham gia minigame".
5. "faqBank" của mỗi part: 2-4 câu hỏi khán giả thật có thể đặt ra (ưu tiên khai thác đúng ghi chú "Câu hỏi/từ chối thường gặp" nếu có) kèm câu trả lời mẫu Host đọc được ngay, giọng văn gần gũi.
6. "complianceNotes" của mỗi part: liệt kê 1-3 lưu ý Do & Don't áp dụng cho nội dung phần đó, ví dụ: không dùng từ khẳng định tuyệt đối ("tốt nhất", "số một", "100% khỏi hẳn" — thay bằng "hỗ trợ", "cải thiện"), không nhắc trực tiếp tên nền tảng thứ ba ngoài Facebook, không dùng từ ngữ nhạy cảm về vóc dáng/cân nặng, đọc đúng tên thương hiệu/sản phẩm.
7. "opening.dialogue" và "closing.dialogue" cũng phải là hội thoại luân phiên 2 Host, không phải 1 câu đơn.
8. Toàn bộ thoại phải khớp đúng Tone Giọng & Phong Cách đã cho, và nếu có "Câu hỏi/từ chối thường gặp" thì phải có ít nhất 1 part xử lý đúng nội dung đó trong faqBank hoặc dialogue, không bịa từ chối không liên quan.

Định dạng trả về dưới dạng JSON đúng cấu trúc:
{
  "title": "Tên kịch bản",
  "campaignHeader": { "channel": "...", "hostSetup": "...", "totalDuration": "..." },
  "opening": { "time": "...", "hook": "...", "action": "...", "dialogue": [{ "speaker": "Host A", "line": "..." }] },
  "parts": [
    {
      "partName": "...",
      "timeCode": "...",
      "durationMinutes": 20,
      "keyActivities": ["...", "..."],
      "focusProduct": "...",
      "usp": "...",
      "giftTiers": [{ "tier": "...", "condition": "...", "gifts": "..." }],
      "dialogue": [{ "speaker": "Host A", "line": "..." }, { "speaker": "Host B", "line": "..." }],
      "minigame": { "name": "...", "howToPlay": "...", "hashtagSyntax": "...", "winCondition": "...", "prizeCount": "...", "prize": "..." },
      "faqBank": [{ "question": "...", "answer": "..." }],
      "urgencyPush": "...",
      "complianceNotes": ["..."]
    }
  ],
  "closing": { "time": "...", "strategy": "...", "callToAction": "...", "dialogue": [{ "speaker": "Host A", "line": "..." }] }
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
      if (!(await requireAuthedCallerOrReject(req, res))) return;
      if (rejectIfPayloadTooLarge(req, res)) return;
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

      const systemPrompt = await getAgentPrompt(
        "session_analyst",
        "Bạn là Giám đốc Vận hành TikTok Agency cấp cao. Hãy phân tích dữ liệu phiên livestream TikTok Shop sau đây và đưa ra đánh giá chuyên sâu, chỉ ra sai lầm, thời điểm đột biến và bài học cải thiện cho Host."
      );
      const prompt = `${systemPrompt}
Dữ liệu phiên livestream TikTok Shop thật:
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
      if (!(await requireAuthedCallerOrReject(req, res))) return;
      if (rejectIfPayloadTooLarge(req, res)) return;
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

      const agentChatDefaults: Record<string, string> = {
        ceo: "Bạn là CEO AI Advisor cho TikTok Livestream Agency. Hãy trả lời ngắn gọn, tập trung vào P&L, tối ưu chi phí, dòng tiền, nhân sự và chiến lược tăng trưởng.",
        host_coach: "Bạn là Host Coach AI. Hãy tư vấn kỹ năng livestream, cách giữ năng lượng, kỹ thuật chốt đơn, tương tác mắt xem và xử lý tình huống phát sinh.",
        talent_matcher: "Bạn là Talent Matcher AI. Hãy giúp phân tích chỉ số Host/KOC (CTR, CVR, GMV, Tone, Tiềm năng) để chọn đúng người cho từng Brand.",
        data_analyst: "Bạn là Data Analyst AI chuyên sâu về TikTok Shop Live Dashboard, thuật toán phân phối luồng, retention rate và GMV/min.",
      };
      const role = agentChatDefaults[agentRole] ? agentRole : "ceo";
      const systemPrompt = await getAgentPrompt(`agent_chat_${role}`, agentChatDefaults[role]);

      const prompt = `${systemPrompt}\n\nNgười dùng hỏi: ${userMessage}`;

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
      if (!(await requireAuthedCallerOrReject(req, res))) return;
      if (rejectIfPayloadTooLarge(req, res)) return;
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

      const systemPrompt = await getAgentPrompt(
        "talent_matcher",
        "Bạn là Talent Matcher AI cho Agency Livestream TikTok Shop, chuyên ghép Host/KOC phù hợp nhất cho từng Brand dựa trên dữ liệu thật."
      );
      const prompt = `${systemPrompt}

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
      if (!(await requireAuthedCallerOrReject(req, res))) return;
      if (rejectIfPayloadTooLarge(req, res)) return;
      const { meetingNotes } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          success: true,
          isMock: true,
          summary: "📌 AI Tóm Tắt & Hành Động Cần Làm:\n1. Tăng ngân sách Contract thêm +150.000.000đ cho Campaign Mega Live 8/8.\n2. Task KAM Lê Quốc Bảo: Khớp nối thêm 2 Host dự phòng (Ưu tiên Host Bích Ngọc) cho dải sản phẩm Haircare.\n3. Task Moderator Tuấn: Cấu hình bot tự động ghim Voucher 100k đúng khung giờ vàng 20:00 - 21:00."
        });
      }

      const systemPrompt = await getAgentPrompt(
        "meeting_summarizer",
        "Bạn là Trợ Lý AI cho Agency Livestream TikTok Shop, chuyên tóm tắt biên bản họp với Brand và tạo danh sách hành động cụ thể."
      );
      const prompt = `${systemPrompt}

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

  // API Route: AI Schedule Optimizer — recommends best time slot & host for a brand
  app.post("/api/gemini/optimize-schedule", async (req, res) => {
    try {
      if (!(await requireAuthedCallerOrReject(req, res))) return;
      if (rejectIfPayloadTooLarge(req, res)) return;
      const { brand, timeSlots, talents } = req.body;
      const ai = getGeminiClient();

      const fallback = () => {
        const industry = brand?.industry || "Thương mại điện tử";
        let suggestedSlot = "20:00 - 23:00";
        let suggestedHostName = "Yến Nhi";
        let reason = "Ngành Beauty/Mỹ phẩm có CVR cao nhất vào khung giờ Tối Đêm Vàng.";
        if (industry.includes("Thời trang") || industry.includes("Nam")) {
          suggestedSlot = "14:00 - 17:00";
          suggestedHostName = "Hoàng Nam";
          reason = "Ngành Thời trang Nam đạt đòn bẩy đơn cao vào chiều trước giờ tan tầm.";
        } else if (industry.includes("Gia dụng")) {
          suggestedSlot = "11:00 - 14:00";
          suggestedHostName = "Bích Ngọc";
          reason = "Gia dụng bếp phù hợp nghỉ trưa dân văn phòng.";
        }
        const matchedHost = (talents || []).find((t: any) => t.name?.includes(suggestedHostName));
        return {
          suggestedSlot,
          suggestedHostId: matchedHost?.id || null,
          suggestedHostName: matchedHost?.name || suggestedHostName,
          reason,
          predictedGmvLift: "+25%"
        };
      };

      if (!ai) {
        return res.json({ success: true, isMock: true, ...fallback() });
      }

      const systemPrompt = await getAgentPrompt(
        "schedule_optimizer",
        "Bạn là AI Schedule Matching cho Agency Livestream TikTok Shop, chuyên đề xuất khung giờ live và Host phù hợp nhất cho một Brand dựa trên dữ liệu thật."
      );
      const prompt = `${systemPrompt}

Thương hiệu cần lên lịch: ${brand?.name || "Brand"} (Ngành: ${brand?.industry || "N/A"})

Các khung giờ live cố định có thể chọn:
${JSON.stringify(timeSlots)}

Danh sách Talent hiện có (dữ liệu thật từ hệ thống):
${JSON.stringify(talents)}

Hãy chọn MỘT khung giờ phù hợp nhất trong danh sách trên và MỘT Host phù hợp nhất trong danh sách Talent, dựa trên ngành hàng của Brand, CVR, GMV trung bình mỗi phiên của Talent, và đặc điểm khung giờ. Đưa ra lý do (reason) ngắn gọn dựa trên số liệu thật đã cho — không bịa số liệu không có trong dữ liệu. Ước tính mức tăng GMV tiềm năng (predictedGmvLift) dạng phần trăm.

Định dạng JSON trả về:
{
  "suggestedSlot": "20:00 - 23:00",
  "suggestedHostId": "talent-id-tương-ứng",
  "suggestedHostName": "Tên Host",
  "reason": "...",
  "predictedGmvLift": "+25%"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const data = JSON.parse(response.text || "{}");
      if (!data.suggestedSlot) {
        return res.json({ success: true, isMock: true, ...fallback() });
      }
      return res.json({ success: true, isMock: false, ...data });
    } catch (error: any) {
      console.error("Gemini Schedule Optimizer Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  return app;
}
