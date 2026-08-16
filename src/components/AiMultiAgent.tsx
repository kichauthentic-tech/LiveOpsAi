import React, { useState } from "react";
import { Sparkles, Send, Bot, User, RefreshCw, Cpu, Award, Zap, Briefcase, LineChart } from "lucide-react";
import { authedFetch } from "../lib/authedFetch";

type AgentRole = "ceo" | "data_analyst";

interface Message {
  sender: "user" | "agent";
  text: string;
  time: string;
}

export const AiMultiAgent: React.FC = () => {
  const [selectedAgent, setSelectedAgent] = useState<AgentRole>("ceo");
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<Record<AgentRole, Message[]>>({
    ceo: [
      {
        sender: "agent",
        text: "Xin chào! Tôi là CEO AI Advisor. Tôi có thể hỗ trợ bạn phân tích P&L, tối ưu dòng tiền, công suất Studio & chiến lược tăng trưởng Agency. Bạn cần tôi trợ giúp gì?",
        time: "08:30"
      }
    ],
    data_analyst: [
      {
        sender: "agent",
        text: "Tôi là Data Analyst AI. Tôi chuyên phân tích thuật toán luồng TikTok Live, retention curve và nguyên nhân drop view từng phút.",
        time: "08:30"
      }
    ]
  });

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMsg: Message = {
      sender: "user",
      text: inputMessage,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setChatHistory((prev) => ({
      ...prev,
      [selectedAgent]: [...prev[selectedAgent], userMsg]
    }));

    const currentText = inputMessage;
    setInputMessage("");
    setLoading(true);

    try {
      const res = await authedFetch("/api/gemini/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentRole: selectedAgent,
          userMessage: currentText
        })
      });
      const data = await res.json();
      if (data.success) {
        const agentMsg: Message = {
          sender: "agent",
          text: data.reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setChatHistory((prev) => ({
          ...prev,
          [selectedAgent]: [...prev[selectedAgent], agentMsg]
        }));
        setLoading(false);
        return;
      }
    } catch (e) {
      console.log("Using client AI Agent fallback...");
    }

    // Role-based domain AI responses
    let reply = "";
    if (selectedAgent === "ceo") {
      reply = `[CEO Advisor Response]: Dựa trên dữ liệu tài chính & công suất Agency:\n- Về vấn đề "${currentText}": Tôi khuyến nghị ưu tiên tối ưu tỷ lệ Net Margin từng phiên live (giữ mức 18-25%).\n- Với các Brand lớn như Cocoon hay Coolmate, hãy gộp kịch bản Flash Sale khung giờ vàng để nâng GMV trung bình trên mỗi phiên.`;
    } else {
      reply = `[TikTok Data Analyst Response]: Giải mã dữ liệu luồng live đối với "${currentText}":\n- Tỷ lệ đứt nhịp (Drop View) thường xảy ra ở phút thứ 12-15 nếu không đổi sản phẩm.\n- Khuyến nghị: Cứ mỗi 10 phút, kích hoạt 1 đợt đẩy Voucher TikTok Shop 30k để đẩy lượt comment & kéo retention curve vọt lên lại.`;
    }

    setTimeout(() => {
      const agentMsg: Message = {
        sender: "agent",
        text: reply,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      setChatHistory((prev) => ({
        ...prev,
        [selectedAgent]: [...prev[selectedAgent], agentMsg]
      }));
      setLoading(false);
    }, 700);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-[var(--surface)] via-[var(--accent)]/15 to-[var(--surface)] text-[var(--text)] p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[var(--accent-text)] font-bold text-xs uppercase tracking-wider block flex items-center gap-1.5 bg-[var(--accent)]/15 px-3 py-1 rounded-full border border-[var(--accent)]/40">
            <Bot className="w-4 h-4 text-[var(--accent-text)]" /> Module 16: Multi-Agent AI Council
          </span>
        </div>

        <div>
          <h2 className="text-2xl md:text-3xl font-black text-[var(--text)]">Hội Đồng Trợ Lý AI Chuyên Biệt Vận Hành</h2>
          <p className="text-[var(--text-muted)] text-xs md:text-sm mt-1">
            Tương tác trực tiếp với các Agent AI chuyên gia: CEO Advisor & Data Analyst
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Agent Selector Sidebar */}
        <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-2 text-xs">
          <h3 className="font-bold text-[var(--text)] mb-2">Chọn Trợ Lý AI:</h3>

          <button
            onClick={() => setSelectedAgent("ceo")}
            className={`w-full p-3 rounded-xl text-left border transition-all space-y-1 ${
              selectedAgent === "ceo"
                ? "bg-[var(--accent)]/40 border-[var(--accent)]/60 text-[var(--accent-text)] font-bold"
                : "bg-[var(--surface-elevated)]/40 border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
            }`}
          >
            <span className="font-bold flex items-center gap-1.5 text-sm">
              <Briefcase className="w-4 h-4" /> CEO Strategic Advisor
            </span>
            <p className="text-[10px] text-[var(--text-muted)]">Tư vấn P&L, dòng tiền, tối ưu công suất Studio</p>
          </button>

          <button
            onClick={() => setSelectedAgent("data_analyst")}
            className={`w-full p-3 rounded-xl text-left border transition-all space-y-1 ${
              selectedAgent === "data_analyst"
                ? "bg-[var(--accent)]/40 border-[var(--accent)]/60 text-[var(--accent-text)] font-bold"
                : "bg-[var(--surface-elevated)]/40 border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
            }`}
          >
            <span className="font-bold flex items-center gap-1.5 text-sm">
              <LineChart className="w-4 h-4" /> TikTok Data Analyst AI
            </span>
            <p className="text-[10px] text-[var(--text-muted)]">Giải mã retention curve & thuật toán TikTok Live</p>
          </button>
        </div>

        {/* Active Chat Window */}
        <div className="lg:col-span-3 bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 flex flex-col justify-between min-h-[480px]">
          {/* Chat Messages Log */}
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {chatHistory[selectedAgent].map((msg, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                  msg.sender === "user" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--accent-text)]"
                }`}>
                  {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-xl p-3.5 rounded-2xl text-xs space-y-1 leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-[var(--accent)] text-white rounded-tr-none"
                    : "bg-[var(--surface-elevated)] text-[var(--text)] rounded-tl-none border border-[var(--border)]"
                }`}>
                  <p className="whitespace-pre-line">{msg.text}</p>
                  <span className={`text-[9px] block text-right font-mono ${
                    msg.sender === "user" ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"
                  }`}>
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-[var(--accent-text)] font-bold animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin" /> Agent AI đang phân tích dữ liệu câu trả lời...
              </div>
            )}
          </div>

          {/* Input Box */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Nhập câu hỏi hoặc câu lệnh cho Agent AI..."
              className="grow bg-[var(--surface-base)] text-[var(--text)] placeholder:text-[var(--text-faint)] p-3 rounded-xl border border-[var(--border)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-medium"
            />
            <button
              onClick={handleSendMessage}
              disabled={loading}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold p-3 rounded-xl text-xs flex items-center justify-center transition-all shadow"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
