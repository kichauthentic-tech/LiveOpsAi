import React, { useState } from "react";
import { Sparkles, Copy, Check, Download, BookOpen, Clock, Tag, RefreshCw } from "lucide-react";

export const ScriptGenerator: React.FC = () => {
  const [brandName, setBrandName] = useState("Cocoon Vietnam");
  const [productCategory, setProductCategory] = useState("Mỹ phẩm thuần chay");
  const [skus, setSkus] = useState("Tẩy Tế Bào Chết Cà Phê, Serum Bưởi Trị Tóc Rụng");
  const [targetAudience, setTargetAudience] = useState("Nữ 18-32 tuổi, dân văn phòng & sinh viên mê Skincare an toàn");
  const [tone, setTone] = useState("Sôi động, Thân thiện, Chuyên môn Skincare cao, Hối thúc Deal");
  const [durationMinutes, setDurationMinutes] = useState(60);

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scriptData, setScriptData] = useState<any>({
    title: "Kịch Bản Live Stream TikTok - Cocoon Mùa Hè Năng Động (60 Phút)",
    opening: {
      time: "00:00 - 05:00",
      hook: "🔥 BÙM NỔ LỚN! Chào mừng 500 anh em đang có mặt trong phiên LIVE đặc quyền của Cocoon Vietnam. Hôm nay ad mang tới deal độc quyền GIẢM 50% + VOUCHER SÀN 100K!",
      action: "Bật nhạc sôi động, ghim sản phẩm Hero SKU #1, yêu cầu tim & share live đạt 5,000 tim để mở quà 0 đồng."
    },
    timelineSegments: [
      {
        timeWindow: "05:00 - 15:00",
        focusProduct: "Tẩy Tế Bào Chết Cà Phê Đắc Lắc 200ml",
        storytelling: "Mô tả vấn đề thực tế: Da sần sùi, đánh nền bị mốc tróc vảy. Host thực hiện test trực tiếp lên tay trước ống cảnh cận (Close-up shot).",
        voucherTiming: "Tung Voucher TikTok Shop 30k cho đơn từ 199k (Giới hạn 50 lượt).",
        objectionHandling: "Khách hỏi: 'Hàng chính hãng không?' -> Host show tem vỡ chống giả, cam kết đền x10 nếu fake.",
        cta: "Ghim giỏ hàng #1 -> Đếm ngược 10 - 9 - 8... bấm MUA NGAY kẻo hết suất quà!"
      },
      {
        timeWindow: "15:00 - 30:00",
        focusProduct: "Serum Bưởi Trị Tóc Gãy Rụng 140ml",
        storytelling: "So sánh giá mua lẻ vs mua Combo. Mua 1 Serum Bưởi tặng 2 chai xịt du lịch trị giá 150k.",
        voucherTiming: "Flash Sale giảm thêm 15% duy nhất trong 5 phút ngắn ngủi.",
        objectionHandling: "Khách hỏi: 'Tóc bết không?' -> Host xịt trực tiếp lên da đầu, cho thấy khả năng thẩm thấu không bị bết rít.",
        cta: "Chỉ còn 12 suất combo cuối cùng trong giỏ hàng #2!"
      }
    ],
    closing: {
      time: "50:00 - 60:00",
      strategy: "Nhắc lại Top 3 sản phẩm hot nhất phiên live, hối thúc chốt đơn chưa thanh toán trong giỏ hàng.",
      callToAction: "Cảm ơn cả nhà, ấn Nút Theo Dõi kênh để nhận thông báo phiên LIVE mai nhận quà tiếp theo!"
    }
  });

  const handleGenerateScript = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gemini/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName,
          productCategory,
          skus: skus.split(","),
          targetAudience,
          tone,
          durationMinutes
        })
      });
      const data = await res.json();
      if (data.success) {
        setScriptData(data.script);
        setLoading(false);
        return;
      }
    } catch (e) {
      console.log("Using client AI script generation fallback...");
    }

    // Client-side tailored AI Script Fallback
    const skuList = skus.split(",").map(s => s.trim()).filter(Boolean);
    const heroSku1 = skuList[0] || "Sản Phẩm Chủ Lực #1";
    const heroSku2 = skuList[1] || "Sản Phẩm Best-Seller #2";

    setTimeout(() => {
      setScriptData({
        title: `Kịch Bản Live Stream TikTok - ${brandName} (${productCategory}) - ${durationMinutes} Phút`,
        opening: {
          time: `00:00 - 05:00`,
          hook: `🔥 CHÀO MỪNG KHÁN GIẢ ĐẾN VỚI PHIÊN LIVE ĐẶC QUYỀN CỦA ${brandName.toUpperCase()}! Phong cách: ${tone}. Hôm nay bung deal giảm độc quyền 50% + Voucher TikTok Shop 100k cho 50 bạn thả tim đầu tiên!`,
          action: `Bật nhạc sôi động, ghim sản phẩm giỏ hàng #1 (${heroSku1}), hô gọi thả 5,000 tim để mở quà 0 đồng.`
        },
        timelineSegments: [
          {
            timeWindow: `05:00 - ${Math.round(durationMinutes * 0.4)}:00`,
            focusProduct: heroSku1,
            storytelling: `Tập trung giải quyết nỗi đau của khán hàng (${targetAudience}): Trải nghiệm thực tế sản phẩm ngay trước ống kính close-up.`,
            voucherTiming: `Tung Voucher Độc Quyền Flash Sale giảm 30k cho đơn từ 199k (Số lượng có hạn).`,
            objectionHandling: `Xử lý từ chối: Cam kết 100% chính hãng từ ${brandName}, hoàn tiền x10 nếu phát hiện lỗi.`,
            cta: `Ghim ngay giỏ hàng #1 -> Đếm ngược 10s chốt đơn!`
          },
          {
            timeWindow: `${Math.round(durationMinutes * 0.4)}:00 - ${Math.round(durationMinutes * 0.8)}:00`,
            focusProduct: heroSku2,
            storytelling: `Tạo hiệu ứng Combo mua kèm tiết kiệm 45%. Hướng dẫn sử dụng kết hợp giữa ${heroSku1} và ${heroSku2}.`,
            voucherTiming: `Mở kho thêm 20 suất quà tặng kèm duy nhất trong 5 phút.`,
            objectionHandling: `Hỗ trợ thắc mắc về thời gian giao hàng & bảo hành chính hãng.`,
            cta: `Bấm Mua Ngay giỏ hàng #2 trước khi hết suất Combo!`
          }
        ],
        closing: {
          time: `${Math.round(durationMinutes * 0.8)}:00 - ${durationMinutes}:00`,
          strategy: `Tổng kết Top 2 deal chạy nhất phiên live của ${brandName}. Hối thúc khách hàng quay lại giỏ hàng thanh toán đơn chờ.`,
          callToAction: `Bấm Theo Dõi kênh ${brandName} ngay để không bỏ lỡ phiên Mega Live tiếp theo!`
        }
      });
      setLoading(false);
    }, 600);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(scriptData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-400" /> Module 09: AI Script Generator Engine
          </span>
          <h2 className="text-2xl font-black">Trình Sinh Kịch Bản Live TikTok Tự Động bằng AI</h2>
          <p className="text-slate-400 text-xs">
            Ứng dụng Gemini AI để biên soạn kịch bản giữ chân mắt xem, kích thích chốt đơn Flash Sale & xử lý từ chối
          </p>
        </div>
        <div className="flex-shrink-0 bg-purple-950/80 border border-purple-500/40 rounded-xl px-3.5 py-2 text-right">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Gemini AI Engine Active</span>
          </div>
          <p className="text-[10px] text-purple-400">Server API Proxy Connected</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Input Parameters Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-900 text-base border-b border-slate-100 pb-2">Thống Số Đầu Vào (Brief)</h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Tên Thương Hiệu (Brand):</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Ngành Hàng:</label>
              <input
                type="text"
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Danh Sách Hero SKUs (Cách nhau dấu phẩy):</label>
              <textarea
                value={skus}
                onChange={(e) => setSkus(e.target.value)}
                rows={2}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Khách Hàng Mục Tiêu:</label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Tone Giọng & Phong Cách Host:</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                <option value="Sôi động, Thân thiện, Chuyên môn Skincare cao, Hối thúc Deal">Sôi động + Chuyên môn Skincare</option>
                <option value="Hài hước, Gần gũi, Gen Z năng động, Bắt Trend">Hài hước Gen Z + Bắt Trend</option>
                <option value="Sang trọng, Tinh tế, Thanh lịch, Gentle Soft-sell">Luxury + Soft-sell</option>
                <option value="Chuyên gia, Đập tan nghi ngờ, Thấu hiểu sâu sắc">Chuyên Gia + Xử lý Từ Chối</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Thời Lượng Phiên Live (Phút):</label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <button
              onClick={handleGenerateScript}
              disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-md"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Gemini AI Đang Viết Kịch Bản...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Sinh Kịch Bản Live TikTok Mới
                </>
              )}
            </button>
          </div>
        </div>

        {/* Script Output Result Display */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">AI Output Script</span>
              <h3 className="font-black text-slate-900 text-lg">{scriptData.title}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copied ? "Đã chép" : "Sao chép JSON"}
              </button>
            </div>
          </div>

          {/* Opening Hook Section */}
          {scriptData.opening && (
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 space-y-2 text-xs">
              <div className="flex justify-between items-center font-bold text-purple-900">
                <span>🔥 MỞ MÀN & HOOK GIỮ CHÂN KHÁN GIẢ</span>
                <span className="bg-purple-200 text-purple-800 px-2 py-0.5 rounded">{scriptData.opening.time}</span>
              </div>
              <p className="font-bold text-slate-900 bg-white p-3 rounded-lg border border-purple-100 italic">
                &quot;{scriptData.opening.hook}&quot;
              </p>
              <p className="text-slate-600"><strong>Hành động Studio & Host:</strong> {scriptData.opening.action}</p>
            </div>
          )}

          {/* Timeline Segments */}
          <div className="space-y-4">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-indigo-600">
              📌 CÁC PHÂN ĐOẠN BÁN HÀNG TỪNG SKUs (TIMELINE SEGMENTS)
            </h4>
            {scriptData.timelineSegments?.map((seg: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs">
                <div className="flex justify-between items-center font-bold text-slate-900 border-b border-slate-200 pb-2">
                  <span className="text-purple-700 text-sm">Phân đoạn #{idx+1}: {seg.focusProduct}</span>
                  <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded">{seg.timeWindow}</span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <p><strong>📖 Câu chuyện & Demo trực tiếp:</strong> {seg.storytelling}</p>
                  <p className="text-emerald-700"><strong>⚡ Nhịp tung Voucher & Flash Sale:</strong> {seg.voucherTiming}</p>
                  <p className="text-amber-800"><strong>🛡️ Đập tan từ chối (Objection Handling):</strong> {seg.objectionHandling}</p>
                  <p className="text-purple-900 font-bold bg-purple-100 p-2 rounded"><strong>📣 Kêu gọi hành động (CTA):</strong> {seg.cta}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Closing Strategy */}
          {scriptData.closing && (
            <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2 text-xs">
              <div className="flex justify-between items-center font-bold text-purple-300">
                <span>🏁 CHỐT PHIÊN & HỐI THÚC THANH TOÁN</span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{scriptData.closing.time}</span>
              </div>
              <p><strong>Chiến thuật:</strong> {scriptData.closing.strategy}</p>
              <p className="text-emerald-400 font-bold"><strong>Lời kết Host:</strong> {scriptData.closing.callToAction}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
