import React, { useState } from "react";
import { Sparkles, Send, Bot, User, RefreshCw, Cpu, Award, Zap, Play, MessageSquare } from "lucide-react";
import { EndToEndFlowSimulator } from "./EndToEndFlowSimulator";
import { authedFetch } from "../lib/authedFetch";

type AgentRole = "ceo" | "host_coach" | "talent_matcher" | "data_analyst";

interface Message {
  sender: "user" | "agent";
  text: string;
  time: string;
}

interface AiMultiAgentProps {
  onNavigateTab?: (tabId: string) => void;
}

export const AiMultiAgent: React.FC<AiMultiAgentProps> = ({ onNavigateTab }) => {
  const [activeSubView, setActiveSubView] = useState<"chat" | "simulator">("chat");
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
    host_coach: [
      {
        sender: "agent",
        text: "Chào bạn! Tôi là Host Coach AI. Hãy gửi kịch bản hoặc hỏi về kỹ thuật giữ mắt xem, tung deal Flash Sale và xử lý khi Host đứt nhịp trên sóng live!",
        time: "08:30"
      }
    ],
    talent_matcher: [
      {
        sender: "agent",
        text: "Tôi là Talent Matcher AI. Bạn đang muốn tìm Host cho Brand nào? Tôi sẽ xem chỉ số CVR, CTR & lịch làm việc để đề xuất ngay!",
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
    } else if (selectedAgent === "host_coach") {
      reply = `[Host Coach Response]: Dành cho vấn đề "${currentText}":\n1. Kỹ thuật Giữ Mắt Xem: Sau 3 phút tung deal, Host phải lập tức thực hiện Demo sản phẩm dạng Close-up.\n2. Lối xưng hô: Dùng ngôn ngữ sôi động, gọi tên người xem để tạo cảm giác cá nhân hóa.\n3. Xử lý nghi ngờ: Show tem vỡ/mã QR chống giả để kích thích nút 'Mua Ngay'.`;
    } else if (selectedAgent === "talent_matcher") {
      reply = `[Talent Matcher Response]: Phân tích nhu cầu "${currentText}":\n- Top 1 Host đề xuất: Yến Nhi (CVR 5.4%, thế mạnh Mỹ phẩm & Skincare).\n- Top 2 Host đề xuất: Hoàng Nam (CVR 6.1%, thế mạnh Thời trang & Tech).\nCả 2 Host đều đạt tỉ lệ khớp nối trên 90% cho chiến dịch sắp tới.`;
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
      <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-purple-400 font-bold text-xs uppercase tracking-wider block flex items-center gap-1.5 bg-purple-950/80 px-3 py-1 rounded-full border border-purple-800">
            <Bot className="w-4 h-4 text-purple-400" /> Module 16: Multi-Agent AI Council & Business Simulator
          </span>

          {/* Subview Toggle Buttons */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-purple-500/30 gap-1">
            <button
              onClick={() => setActiveSubView("chat")}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                activeSubView === "chat"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Hội Đồng Trợ Lý AI</span>
            </button>

            <button
              onClick={() => setActiveSubView("simulator")}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                activeSubView === "simulator"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Play className="w-4 h-4 text-emerald-400" />
              <span>End-To-End Simulator</span>
              <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded text-[9px] font-black border border-emerald-500/30">HOT</span>
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-2xl md:text-3xl font-black">
            {activeSubView === "chat" ? "Hội Đồng Trợ Lý AI Chuyên Biệt Vận Hành" : "Khung Mô Phỏng Dòng Chảy Business End-To-End"}
          </h2>
          <p className="text-slate-300 text-xs md:text-sm mt-1">
            {activeSubView === "chat"
              ? "Tương tác trực tiếp với các Agent AI chuyên gia: CEO Advisor, Host Coach, Talent Matcher & Data Analyst"
              : "Theo dõi dòng chảy dữ liệu liên module real-time từ Ký HĐ Brand → Booking Host → Setup Studio QR → TikTok API → P&L Tài Chính"}
          </p>
        </div>
      </div>

      {activeSubView === "simulator" ? (
        <EndToEndFlowSimulator onNavigateTab={onNavigateTab} />
      ) : (
        <div className="grid lg:grid-cols-4 gap-6">
        {/* Agent Selector Sidebar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2 text-xs">
          <h3 className="font-bold text-slate-900 mb-2">Chọn Trợ Lý AI:</h3>

          <button
            onClick={() => setSelectedAgent("ceo")}
            className={`w-full p-3 rounded-xl text-left border transition-all space-y-1 ${
              selectedAgent === "ceo"
                ? "bg-purple-50 border-purple-300 text-purple-950 font-bold"
                : "bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="font-bold block text-sm">👔 CEO Strategic Advisor</span>
            <p className="text-[10px] text-slate-500">Tư vấn P&L, dòng tiền, tối ưu công suất Studio</p>
          </button>

          <button
            onClick={() => setSelectedAgent("host_coach")}
            className={`w-full p-3 rounded-xl text-left border transition-all space-y-1 ${
              selectedAgent === "host_coach"
                ? "bg-purple-50 border-purple-300 text-purple-950 font-bold"
                : "bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="font-bold block text-sm">🎙️ Host Coach AI</span>
            <p className="text-[10px] text-slate-500">Tư vấn kỹ năng chốt đơn, giữ năng lượng & kịch bản</p>
          </button>

          <button
            onClick={() => setSelectedAgent("talent_matcher")}
            className={`w-full p-3 rounded-xl text-left border transition-all space-y-1 ${
              selectedAgent === "talent_matcher"
                ? "bg-purple-50 border-purple-300 text-purple-950 font-bold"
                : "bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="font-bold block text-sm">👯 Talent Matcher AI</span>
            <p className="text-[10px] text-slate-500">Khớp nối Host phù hợp với từng Brand & SKU</p>
          </button>

          <button
            onClick={() => setSelectedAgent("data_analyst")}
            className={`w-full p-3 rounded-xl text-left border transition-all space-y-1 ${
              selectedAgent === "data_analyst"
                ? "bg-purple-50 border-purple-300 text-purple-950 font-bold"
                : "bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="font-bold block text-sm">📈 TikTok Data Analyst AI</span>
            <p className="text-[10px] text-slate-500">Giải mã retention curve & thuật toán TikTok Live</p>
          </button>
        </div>

        {/* Active Chat Window */}
        <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between min-h-[480px]">
          {/* Chat Messages Log */}
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {chatHistory[selectedAgent].map((msg, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                  msg.sender === "user" ? "bg-purple-600 text-white" : "bg-slate-900 text-purple-400"
                }`}>
                  {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-xl p-3.5 rounded-2xl text-xs space-y-1 leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-purple-600 text-white rounded-tr-none"
                    : "bg-slate-100 text-slate-900 rounded-tl-none border border-slate-200"
                }`}>
                  <p className="whitespace-pre-line">{msg.text}</p>
                  <span className={`text-[9px] block text-right font-mono ${
                    msg.sender === "user" ? "text-purple-200" : "text-slate-400"
                  }`}>
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-purple-600 font-bold animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin" /> Agent AI đang phân tích dữ liệu câu trả lời...
              </div>
            )}
          </div>

          {/* Input Box */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Nhập câu hỏi hoặc câu lệnh cho Agent AI..."
              className="grow bg-slate-50 text-slate-900 p-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
            />
            <button
              onClick={handleSendMessage}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold p-3 rounded-xl text-xs flex items-center justify-center transition-all shadow"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
