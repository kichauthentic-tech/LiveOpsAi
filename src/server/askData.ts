import type express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

// "Hỏi số liệu" của Phòng Điều Hành (11/10/2026). User chốt: dùng CẢ Claude và Gemini, người dùng tự chọn bên nào trước, bên đó
// hết lượt / lỗi / chưa cấu hình thì tự chuyển sang bên kia (và nói rõ đã chuyển, vì sao).
//
// Không cho mô hình tự truy vấn DB: client gửi kèm BẢN TÓM TẮT số liệu đang hiện trên màn (cùng hàm tính với màn — một nguồn số),
// server chỉ chuyển tiếp. Không có rate/lương/SĐT trong bản tóm tắt (client không đưa vào).
//
// Giới hạn thời gian: hàm Vercel tối đa 60 giây (vercel.json) ⇒ mỗi nhà cung cấp chỉ được 25 giây để kịp chuyển bên kia.

export type AskProvider = "claude" | "gemini";
export const ASK_CLAUDE_MODEL = "claude-opus-5-5";
export const ASK_GEMINI_MODEL = "gemini-flash-latest";
/** Model người dùng được chọn trong panel (danh sách cho phép — client gửi gì ngoài đây thì dùng mặc định). */
export const ASK_MODELS: Record<AskProvider, readonly string[]> = {
  claude: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  gemini: ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest"]
};
const PROVIDER_TIMEOUT_MS = 25_000;
const MAX_CONTEXT_CHARS = 160_000;
const MAX_QUESTION_CHARS = 2_000;
const MAX_TURN_CHARS = 6_000;
const MAX_TURNS = 8;

const RULES = `Bạn là trợ lý số liệu của một agency livestream bán hàng (TikTok Shop, Shopee) ở Việt Nam. Người hỏi là sếp hoặc vận hành của agency.
Trả lời bằng tiếng Việt dễ hiểu, ngắn gọn (tối đa khoảng 180 chữ, gạch đầu dòng khi liệt kê), luôn dẫn con số cụ thể lấy từ phần DỮ LIỆU bên dưới.
Chỉ dùng số trong DỮ LIỆU; không có thì nói thẳng là chưa có số liệu đó, không đoán.
Luật nghiệp vụ phải giữ:
- Không cộng, trung bình hay xếp hạng gộp chỉ số hiệu suất giữa TikTok và Shopee; mỗi kênh (brand × sàn) đứng riêng.
- "GMV kỳ vọng" của một ca = mức một ca nên đạt theo kênh, khung giờ, loại ngày, vị trí trong đợt Campaign và số giờ. Vượt/hụt kỳ vọng mới là thước khen/chê ca.
- "Xác suất đạt target" = xác suất GMV cuối tháng đạt target (dải 80%).
- Tay nghề host chỉ kết luận hơn/kém khi dòng đó ghi "đủ chắc"; còn lại nói "chưa đủ ca để kết luận". Trợ live không chấm bằng GMV.
- Tiền viết kiểu 1,2B / 350M / 45K, không thêm ký hiệu tiền tệ.
Kết thúc bằng một gợi ý hành động cụ thể nếu hợp lý.`;

export interface AskTurn {
  role: "user" | "assistant";
  text: string;
}

interface Attempt {
  provider: AskProvider;
  reason: string;
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");

/** Lý do đọc được khi một nhà cung cấp không trả lời — để UI nói "đã chuyển sang Gemini vì Claude hết lượt". */
function reasonOf(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  if (e instanceof Anthropic.RateLimitError || status === 429) return "hết lượt hoặc vượt giới hạn gọi";
  if (e instanceof Anthropic.AuthenticationError || status === 401) return "khoá API không hợp lệ";
  if (e instanceof Anthropic.PermissionDeniedError || status === 403) return "khoá API không có quyền";
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "quá lâu không trả lời";
  if (status === 400 && /credit|billing|balance/i.test(String((e as Error)?.message))) return "hết credit";
  if (status === 529 || status === 503 || status === 500 || status === 502) return "đang quá tải";
  return "lỗi tạm thời";
}

async function askClaude(apiKey: string, model: string, context: string, turns: AskTurn[]): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: PROVIDER_TIMEOUT_MS, maxRetries: 0 });
  const res = await client.beta.messages.create({
    model,
    max_tokens: 4000,
    // Hỏi đáp ngắn trên số có sẵn: effort thấp cho nhanh (giới hạn 60 giây của Vercel).
    ...(model.includes("haiku") ? {} : { output_config: { effort: "low" as const } }),
    // Bị bộ lọc an toàn từ chối thì máy chủ tự chạy lại bằng model dự phòng.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [
      { type: "text", text: RULES },
      // Bản tóm tắt số liệu đứng yên trong cả cuộc hỏi ⇒ đặt mốc cache để câu hỏi sau rẻ hơn.
      { type: "text", text: `DỮ LIỆU (số đủ tới ngày ghi trong phần đầu):\n${context}`, cache_control: { type: "ephemeral" } }
    ],
    messages: turns.map((t) => ({ role: t.role, content: t.text }))
  });
  if (res.stop_reason === "refusal") throw Object.assign(new Error("refusal"), { status: 451 });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text) throw new Error("empty");
  return text;
}

async function askGemini(apiKey: string, model: string, context: string, turns: AskTurn[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const call = ai.models.generateContent({
    model,
    contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
    config: { systemInstruction: `${RULES}\n\nDỮ LIỆU (số đủ tới ngày ghi trong phần đầu):\n${context}` }
  });
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { status: 504 })), PROVIDER_TIMEOUT_MS));
  const res = await Promise.race([call, timeout]);
  const text = (res.text ?? "").trim();
  if (!text) throw new Error("empty");
  return text;
}

/** Quá tải tạm thời (Gemini 503 "high demand", Claude 529): thử lại MỘT lần sau 1,5 giây nếu lần đầu hỏng nhanh — còn đủ thời gian trong 60 giây của Vercel. */
async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } catch (e) {
    const status = (e as { status?: number } | null)?.status;
    if ((status === 503 || status === 529) && Date.now() - t0 < 8_000) {
      await new Promise((r) => setTimeout(r, 1_500));
      return fn();
    }
    throw e;
  }
}

type Caller = (req: express.Request, roles: readonly string[]) => Promise<{ userId?: string; reason?: string }>;

export function registerAskRoute(app: express.Express, requireRoleCaller: Caller) {
  app.post("/api/ai/ask", async (req, res) => {
    const caller = await requireRoleCaller(req, ["ceo", "admin", "operations"]);
    if (!caller.userId) return res.status(403).json({ success: false, error: "Chỉ sếp / vận hành dùng được Hỏi số liệu.", reason: caller.reason });
    const body = req.body ?? {};
    const question = clip(body.question, MAX_QUESTION_CHARS).trim();
    const context = clip(body.context, MAX_CONTEXT_CHARS);
    if (!question || !context) return res.status(400).json({ success: false, error: "Thiếu câu hỏi hoặc dữ liệu." });
    const history: AskTurn[] = (Array.isArray(body.history) ? body.history : [])
      .filter((t: AskTurn) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string" && t.text.trim())
      .slice(-MAX_TURNS)
      .map((t: AskTurn) => ({ role: t.role, text: clip(t.text, MAX_TURN_CHARS) }));
    // Lượt đầu phải là user (Claude); bỏ lượt assistant mồ côi ở đầu.
    while (history.length && history[0].role !== "user") history.shift();
    const turns: AskTurn[] = [...history, { role: "user", text: question }];

    const prefer: AskProvider = body.prefer === "gemini" ? "gemini" : "claude";
    const order: AskProvider[] = body.fallback === false ? [prefer] : [prefer, prefer === "claude" ? "gemini" : "claude"];
    // Model chỉ áp cho bên được chọn trước; bên dự phòng luôn dùng model mặc định của nó.
    const chosen = typeof body.model === "string" && ASK_MODELS[prefer].includes(body.model) ? body.model : undefined;
    const modelOf = (p: AskProvider) => (p === prefer && chosen ? chosen : p === "claude" ? ASK_CLAUDE_MODEL : ASK_GEMINI_MODEL);
    const keys: Record<AskProvider, string | undefined> = { claude: process.env.ANTHROPIC_API_KEY, gemini: process.env.GEMINI_API_KEY };
    const tried: Attempt[] = [];
    for (const p of order) {
      const key = keys[p];
      if (!key) {
        tried.push({ provider: p, reason: "chưa cấu hình khoá API trên server" });
        continue;
      }
      try {
        const model = modelOf(p);
        const text = await withOneRetry(() => (p === "claude" ? askClaude(key, model, context, turns) : askGemini(key, model, context, turns)));
        return res.json({ success: true, text, provider: p, model, switched: tried });
      } catch (e) {
        console.error(`Hỏi số liệu — ${p} lỗi:`, e);
        tried.push({ provider: p, reason: reasonOf(e) });
      }
    }
    const none = tried.every((t) => t.reason.startsWith("chưa cấu hình"));
    return res.status(none ? 503 : 502).json({ success: false, code: none ? "ai_not_configured" : "ai_all_failed", error: "Chưa hỏi được.", switched: tried });
  });
}
