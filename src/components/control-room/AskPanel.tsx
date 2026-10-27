import React, { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareText, Send, X } from "lucide-react";
import { authedFetch } from "../../lib/authedFetch";

// Hỏi số liệu bằng lời (Phòng Điều Hành, 11/10/2026). User chốt: có cả Claude và Gemini, tự chọn bên nào trước; bên đó hết lượt /
// lỗi / chưa cấu hình thì server tự chuyển sang bên kia và trang nói rõ đã chuyển vì sao. Câu trả lời chỉ dựa trên bản tóm tắt số
// liệu đang hiện trên màn (lib/performance/askContext.ts) — không truy vấn thêm, không có rate/lương.

type Prefer = "claude" | "gemini";
interface Msg {
  role: "user" | "assistant";
  text: string;
  meta?: string;
  error?: boolean;
}
const MODELS: Record<Prefer, { id: string; label: string }[]> = {
  claude: [
    { id: "claude-opus-5-5", label: "Opus 5.5 (mạnh nhất)" },
    { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (cân bằng)" },
    { id: "claude-haiku-5-5", label: "Haiku 5.5 (nhanh)" }
  ],
  gemini: [
    { id: "gemini-flash-latest", label: "Flash" },
    { id: "gemini-flash-lite-latest", label: "Flash-Lite (nhẹ, ít quá tải)" },
    { id: "gemini-pro-latest", label: "Pro (mạnh nhất)" }
  ]
};
const PREF_KEY = "control-room-ask-provider";
const NAME: Record<Prefer, string> = { claude: "Claude", gemini: "Gemini" };
const SUGGEST = [
  "Kênh nào còn khả năng đạt target tháng này, kênh nào không, vì sao?",
  "Tuần này ca nào làm giảm xác suất đạt nhiều nhất?",
  "Host nào có hiệu suất cao hơn trung bình nhóm, độ tin cậy bao nhiêu?",
  "Tháng trước giảm vì giờ, vì cơ cấu ca hay vì năng suất?",
  "Ai đang quá tải?"
];

function readPref(): { prefer: Prefer; fallback: boolean; models: Partial<Record<Prefer, string>> } {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? "null");
    if (v && (v.prefer === "claude" || v.prefer === "gemini")) return { prefer: v.prefer, fallback: v.fallback !== false, models: v.models && typeof v.models === "object" ? v.models : {} };
  } catch {
    /* trình duyệt chặn bộ nhớ — dùng mặc định */
  }
  return { prefer: "claude", fallback: true, models: {} };
}

/** Lời giải thích đọc được từ một lần trả lời / lỗi của server (`switched` = các bên đã thử mà không trả lời được). */
function metaOf(provider: Prefer | undefined, model: string | undefined, switched: { provider: Prefer; reason: string }[] | undefined): string {
  const tried = (switched ?? []).map((s) => `${NAME[s.provider]} ${s.reason}`).join("; ");
  if (!provider) return tried;
  return `Trả lời bởi ${NAME[provider]}${model ? ` · ${model}` : ""}${tried ? ` (đã chuyển vì ${tried})` : ""}`;
}

/** Hiện câu trả lời: **đậm** và dòng gạch đầu dòng ("* ", "- "). Dựng thành phần React (không chèn HTML) nên an toàn. */
function Answer({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*[*-]\s+/.test(line);
        const body = line.replace(/^\s*[*-]\s+/, "");
        const parts = body.split(/\*\*(.+?)\*\*/g);
        return (
          <div key={i} className={bullet ? "pl-4 -indent-3" : undefined}>
            {bullet && "• "}
            {parts.map((p, j) => (j % 2 ? <b key={j}>{p}</b> : <React.Fragment key={j}>{p}</React.Fragment>))}
            {line.trim() === "" && "\u00a0"}
          </div>
        );
      })}
    </>
  );
}

export const AskPanel: React.FC<{ open: boolean; onClose: () => void; buildContext: () => string }> = ({ open, onClose, buildContext }) => {
  const [pref, setPref] = useState(readPref);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(pref));
    } catch {
      /* bỏ qua */
    }
  }, [pref]);
  useEffect(() => {
    if (open) boxRef.current?.focus();
  }, [open]);
  // Ngoặc nhọn bắt buộc: Chrome mới cho scrollIntoView trả về Promise — trả nó ra khỏi effect thì React coi là hàm dọn dẹp và vỡ màn.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy]);

  const curModel = MODELS[pref.prefer].some((m) => m.id === pref.models[pref.prefer]) ? pref.models[pref.prefer]! : MODELS[pref.prefer][0].id;
  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const history = msgs.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text }]);
    setQ("");
    setBusy(true);
    try {
      const res = await authedFetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history, context: buildContext(), prefer: pref.prefer, fallback: pref.fallback, model: curModel })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) setMsgs((m) => [...m, { role: "assistant", text: String(body.text), meta: metaOf(body.provider, body.model, body.switched) }]);
      else {
        const why = body.code === "ai_not_configured" ? "Server chưa có khoá API của Claude lẫn Gemini." : body.switched ? `Chưa hỏi được: ${metaOf(undefined, undefined, body.switched)}.` : body.error || "Chưa hỏi được, thử lại sau ít phút.";
        setMsgs((m) => [...m, { role: "assistant", text: why, error: true }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Không gọi được server của app (server đang tắt hoặc mất mạng) — tải lại trang rồi hỏi lại.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Hỏi số liệu">
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-[var(--surface)] border-l border-[var(--border)] flex flex-col">
        <div className="flex items-start justify-between gap-2 p-4 border-b border-[var(--border)]">
          <div>
            <h3 className="font-black text-[var(--text)] flex items-center gap-2"><MessageSquareText className="w-4 h-4 text-[var(--accent-text)]" />Hỏi số liệu</h3>
            <p className="text-xs text-[var(--text-faint)]">Trả lời bằng chính số trên màn này. Không có lương, rate.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] min-h-[32px]" aria-label="Đóng"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-4 py-2 border-b border-[var(--border)] flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--text-faint)]">Hỏi</span>
          {(["claude", "gemini"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={pref.prefer === p} onClick={() => setPref((x) => ({ ...x, prefer: p }))} className={`px-2.5 py-1 rounded-full font-bold border min-h-[28px] ${pref.prefer === p ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent)]/15" : "border-[var(--border)] text-[var(--text-muted)]"}`}>{NAME[p]} trước</button>
          ))}
          <select aria-label="Model" value={curModel} onChange={(e) => setPref((x) => ({ ...x, models: { ...x.models, [x.prefer]: e.target.value } }))} className="bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-2 py-1 text-[var(--text)] min-h-[28px]">
            {MODELS[pref.prefer].map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[var(--text-muted)] ml-auto">
            <input type="checkbox" checked={pref.fallback} onChange={(e) => setPref((x) => ({ ...x, fallback: e.target.checked }))} className="accent-[var(--accent)]" />
            Hết lượt thì tự chuyển {NAME[pref.prefer === "claude" ? "gemini" : "claude"]}
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {msgs.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGEST.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="text-left px-2.5 py-1.5 rounded-xl text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] min-h-[28px]">{s}</button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-8 rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text)] whitespace-pre-wrap" : "text-sm leading-relaxed"}>
              <div className={m.error ? "text-rose-400" : "text-[var(--text)]"}>{m.role === "assistant" && !m.error ? <Answer text={m.text} /> : m.text}</div>
              {m.meta && <div className="mt-1 text-[11px] text-[var(--text-faint)]">{m.meta}</div>}
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-xs text-[var(--text-faint)]"><Loader2 className="w-3.5 h-3.5 animate-spin" />Đang đọc số…</div>}
          <div ref={endRef} />
        </div>
        <form className="p-3 border-t border-[var(--border)] flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <textarea
            ref={boxRef}
            aria-label="Câu hỏi"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }}
            rows={2}
            placeholder="Ví dụ: vì sao xác suất đạt của Franklin TikTok giảm hôm 10/10?"
            className="flex-1 resize-none bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)]"
          />
          <button type="submit" disabled={busy || !q.trim()} className="self-end inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-40" aria-label="Gửi câu hỏi"><Send className="w-4 h-4" /></button>
        </form>
      </div>
    </div>
  );
};
