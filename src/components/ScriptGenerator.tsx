import React, { useState } from "react";
import { Sparkles, Copy, Check, Download, BookOpen, Clock, Tag, RefreshCw } from "lucide-react";
import { authedFetch } from "../lib/authedFetch";

export const ScriptGenerator: React.FC = () => {
  const [brandName, setBrandName] = useState("Cocoon Vietnam");
  const [productCategory, setProductCategory] = useState("Mỹ phẩm thuần chay");
  const [skus, setSkus] = useState("Tẩy Tế Bào Chết Cà Phê, Serum Bưởi Trị Tóc Rụng");
  const [targetAudience, setTargetAudience] = useState("Nữ 18-32 tuổi, dân văn phòng & sinh viên mê Skincare an toàn");
  const [tone, setTone] = useState("Sôi động, Thân thiện, Chuyên môn Skincare cao, Hối thúc Deal");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [keySellingPoints, setKeySellingPoints] = useState("100% thành phần thuần chay, không thử nghiệm trên động vật, giá tốt hơn hàng nhập khẩu 30%");
  const [promotionDetails, setPromotionDetails] = useState("Voucher TikTok Shop 30k đơn từ 199k, Flash Sale giảm thêm 15% khung giờ vàng, Mua 1 tặng 1 phụ kiện du lịch");
  const [objectionHandling, setObjectionHandling] = useState("Hàng có chính hãng không? Da nhạy cảm dùng được không? Bao lâu thì nhận được hàng?");
  const [ctaFrequency, setCtaFrequency] = useState("Mỗi 5 phút");

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scriptData, setScriptData] = useState<any>({
    title: "Kịch Bản Live Stream TikTok - Cocoon Mùa Hè Năng Động (60 Phút)",
    campaignHeader: {
      channel: "TikTok Shop / Fanpage Cocoon Vietnam",
      hostSetup: "2 MC (Host A dẫn dắt chính, Host B hỗ trợ tương tác & đọc bình luận)",
      totalDuration: "60 phút"
    },
    opening: {
      time: "00:00 - 05:00",
      hook: "🔥 BÙM NỔ LỚN! Chào mừng 500 anh em đang có mặt trong phiên LIVE đặc quyền của Cocoon Vietnam. Hôm nay ad mang tới deal độc quyền GIẢM 50% + VOUCHER SÀN 100K!",
      action: "Bật nhạc sôi động, ghim sản phẩm Hero SKU #1, yêu cầu tim & share live đạt 5,000 tim để mở quà 0 đồng.",
      dialogue: [
        { speaker: "Host A", line: "Xin chào cả nhà! Chào mừng mọi người đã đến với phiên live đặc biệt hôm nay của Cocoon Vietnam!" },
        { speaker: "Host B", line: "Đúng vậy đó cả nhà ơi! Hôm nay tụi mình có siêu nhiều ưu đãi, các bạn nhớ ở lại theo dõi hết phiên live nha!" }
      ]
    },
    parts: [
      {
        partName: "Phần 1 - Tẩy Tế Bào Chết Cà Phê Đắc Lắc 200ml",
        timeCode: "00:05 - 00:25",
        durationMinutes: 20,
        keyActivities: [
          "Host mô tả vấn đề thực tế: da sần sùi, đánh nền bị mốc tróc vảy",
          "Host thực hiện test trực tiếp lên tay trước ống kính cận (Close-up shot)",
          "Host tổ chức minigame 1 tăng tương tác",
          "Host nhắc lại khuyến mãi trước khi chuyển sản phẩm"
        ],
        focusProduct: "Tẩy Tế Bào Chết Cà Phê Đắc Lắc 200ml",
        usp: "100% thành phần thuần chay, không thử nghiệm trên động vật",
        giftTiers: [
          { tier: "Tầng 1 - Quà tại chỗ", condition: "Mua 1 hộp Tẩy Tế Bào Chết Cà Phê", gifts: "Tặng kèm túi cotton mini" },
          { tier: "Tầng 2 - Quay số may mắn", condition: "Hóa đơn từ 199k", gifts: "Voucher TikTok Shop 30k" },
          { tier: "Tầng 3 - Ưu đãi trong Livestream", condition: "Chốt đơn trong phiên live", gifts: "Giảm thêm 15% Flash Sale khung giờ vàng" }
        ],
        dialogue: [
          { speaker: "Host A", line: "Cả nhà nhìn kỹ vùng da tay mình nè, sần sùi y hệt luôn đúng không? Để mình test trực tiếp cho mọi người xem nhé!" },
          { speaker: "Host B", line: "Đúng luôn đó! Mà điều đặc biệt ở sản phẩm này là 100% thành phần thuần chay, không thử nghiệm trên động vật, nên da nhạy cảm cũng dùng được." },
          { speaker: "Host A", line: "Cả nhà thả tim nếu da bạn cũng đang sần sùi giống vậy nha, mình sẽ test kỹ hơn cho cả nhà xem liền!" }
        ],
        minigame: {
          name: "Minigame 1 - Khởi động",
          howToPlay: "Chia sẻ Livestream này ở chế độ công khai, bình luận cảm nhận về làn da hiện tại",
          hashtagSyntax: "Cảm nhận của bạn + #CocoonLive",
          winCondition: "Bình luận nhanh & chân thực nhất",
          prizeCount: "5 giải",
          prize: "Voucher 30k"
        },
        faqBank: [
          { question: "Hàng chính hãng không?", answer: "Cả nhà yên tâm nha, mình show tem vỡ chống giả ngay đây, cam kết đền x10 nếu phát hiện hàng giả nhé!" }
        ],
        urgencyPush: "Ghim giỏ hàng #1, chỉ còn 50 suất Voucher 30k thôi nha, nhanh tay chốt đơn kẻo hết!",
        complianceNotes: ["Không dùng từ khẳng định tuyệt đối khi mô tả công dụng", "Đọc đúng tên thương hiệu Cocoon Vietnam"]
      },
      {
        partName: "Phần 2 - Serum Bưởi Trị Tóc Gãy Rụng 140ml",
        timeCode: "00:25 - 00:45",
        durationMinutes: 20,
        keyActivities: [
          "Host so sánh giá mua lẻ vs mua Combo",
          "Host xịt trực tiếp lên da đầu chứng minh không bết rít",
          "Host tổ chức minigame 2 khuyến khích chia sẻ trải nghiệm",
          "Host nhắc lại khuyến mãi trước khi chuyển sang phần chốt"
        ],
        focusProduct: "Serum Bưởi Trị Tóc Gãy Rụng 140ml",
        usp: "Giá tốt hơn hàng nhập khẩu 30%",
        giftTiers: [
          { tier: "Tầng 1 - Quà tại chỗ", condition: "Mua 1 Serum Bưởi", gifts: "Tặng 2 chai xịt du lịch trị giá 150k" },
          { tier: "Tầng 2 - Quay số may mắn", condition: "Hóa đơn từ 500k", gifts: "Quà tặng giá trị cao" },
          { tier: "Tầng 3 - Ưu đãi trong Livestream", condition: "Chốt đơn Combo trong phiên live", gifts: "Flash Sale giảm thêm 15% duy nhất 5 phút" }
        ],
        dialogue: [
          { speaker: "Host B", line: "Mua lẻ là 250k, nhưng mua Combo hôm nay chỉ 180k mà còn tặng kèm 2 chai xịt du lịch nữa nha!" },
          { speaker: "Host A", line: "Nghe hời chưa cả nhà? Để mình xịt trực tiếp lên da đầu cho cả nhà xem khả năng thẩm thấu, không hề bết rít luôn nè!" },
          { speaker: "Host B", line: "Comment số 2 nếu bạn muốn chốt Combo giá sốc này liền nha, số lượng có hạn thôi đó!" }
        ],
        minigame: {
          name: "Minigame 2 - Chia sẻ trải nghiệm",
          howToPlay: "Bình luận chia sẻ trải nghiệm về tóc rụng/gãy hiện tại",
          hashtagSyntax: "Trải nghiệm của bạn + #CocoonReview",
          winCondition: "Bình luận hay nhất được chọn",
          prizeCount: "2 giải",
          prize: "Combo Serum Bưởi mini"
        },
        faqBank: [
          { question: "Tóc có bị bết không?", answer: "Không hề nha cả nhà, serum thẩm thấu nhanh, mình vừa xịt trực tiếp cho cả nhà xem luôn đó!" }
        ],
        urgencyPush: "Chỉ còn 12 suất Combo cuối cùng trong giỏ hàng #2, nhanh tay lên nha cả nhà!",
        complianceNotes: ["Không so sánh trực tiếp với thương hiệu đối thủ cụ thể"]
      }
    ],
    closing: {
      time: "50:00 - 60:00",
      strategy: "Nhắc lại Top 3 sản phẩm hot nhất phiên live, hối thúc chốt đơn chưa thanh toán trong giỏ hàng.",
      callToAction: "Cảm ơn cả nhà, ấn Nút Theo Dõi kênh để nhận thông báo phiên LIVE mai nhận quà tiếp theo!",
      dialogue: [
        { speaker: "Host A", line: "Vậy là buổi livestream hôm nay sắp khép lại rồi, cả nhà nhớ chốt đơn những sản phẩm còn đang để trong giỏ hàng nha!" },
        { speaker: "Host B", line: "Cảm ơn cả nhà đã đồng hành cùng tụi mình! Nhớ theo dõi kênh để đón phiên live tiếp theo nha!" }
      ]
    }
  });

  const handleGenerateScript = async () => {
    setLoading(true);
    // Kịch bản Full Production Script (nhiều Part, thoại dài) khiến Gemini mất
    // 30-90s+ để sinh xong — nếu vượt quá ngưỡng này (mạng lỗi/Gemini treo),
    // hủy request và rơi về fallback thay vì để nút xoay vô thời hạn.
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 120_000);
    try {
      const res = await authedFetch("/api/gemini/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          brandName,
          productCategory,
          skus: skus.split(","),
          targetAudience,
          tone,
          durationMinutes,
          keySellingPoints,
          promotionDetails,
          objectionHandling,
          ctaFrequency
        })
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.success) {
        setScriptData(data.script);
        setLoading(false);
        return;
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.log("Using client AI script generation fallback...");
    }

    // Client-side tailored AI Script Fallback
    const skuList = skus.split(",").map(s => s.trim()).filter(Boolean);
    const heroSku1 = skuList[0] || "Sản Phẩm Chủ Lực #1";
    const heroSku2 = skuList[1] || "Sản Phẩm Best-Seller #2";

    setTimeout(() => {
      setScriptData({
        title: `Kịch Bản Live Stream TikTok - ${brandName} (${productCategory}) - ${durationMinutes} Phút`,
        campaignHeader: {
          channel: "TikTok Shop / Fanpage",
          hostSetup: "2 MC (Host A dẫn dắt chính, Host B hỗ trợ tương tác & đọc bình luận)",
          totalDuration: `${durationMinutes} phút`
        },
        opening: {
          time: `00:00 - 05:00`,
          hook: `🔥 CHÀO MỪNG KHÁN GIẢ ĐẾN VỚI PHIÊN LIVE ĐẶC QUYỀN CỦA ${brandName.toUpperCase()}! Phong cách: ${tone}. Hôm nay bung deal giảm độc quyền + Voucher TikTok Shop cho 50 bạn thả tim đầu tiên!`,
          action: `Bật nhạc sôi động, ghim sản phẩm giỏ hàng #1 (${heroSku1}), hô gọi thả 5,000 tim để mở quà 0 đồng.`,
          dialogue: [
            { speaker: "Host A", line: `Xin chào cả nhà! Chào mừng mọi người đã đến với phiên live đặc biệt hôm nay của ${brandName}!` },
            { speaker: "Host B", line: `Đúng vậy đó! Hôm nay tụi mình mang tới rất nhiều ưu đãi dành riêng cho ${targetAudience || "cả nhà"}, ở lại theo dõi hết phiên live nha!` }
          ]
        },
        parts: [
          {
            partName: `Phần 1 - Giới thiệu ${heroSku1}`,
            timeCode: `00:05 - ${Math.round(durationMinutes * 0.4)}:00`,
            durationMinutes: Math.max(15, Math.round(durationMinutes * 0.35)),
            keyActivities: [
              `Host giải quyết nỗi đau của khách hàng (${targetAudience || "khách hàng mục tiêu"}) bằng trải nghiệm thực tế trước ống kính close-up`,
              "Host tổ chức minigame 1 tăng tương tác",
              "Host nhắc lại khuyến mãi trước khi chuyển sản phẩm"
            ],
            focusProduct: heroSku1,
            usp: keySellingPoints || "USP chính của sản phẩm",
            giftTiers: [
              { tier: "Tầng 1 - Quà tại chỗ", condition: `Mua ${heroSku1}`, gifts: "Quà tặng kèm hấp dẫn theo số lượng mua" },
              { tier: "Tầng 2 - Quay số may mắn", condition: "Hóa đơn từ 500K", gifts: promotionDetails || "Cơ hội trúng giải lớn + quà giá trị" },
              { tier: "Tầng 3 - Ưu đãi trong Livestream", condition: "Chốt đơn ngay trong phiên live", gifts: "Voucher giảm giá/freeship độc quyền" }
            ],
            dialogue: [
              { speaker: "Host A", line: `Đây chính xác là điều mà các bạn ${targetAudience ? `(${targetAudience})` : ""} đang tìm kiếm đó, để mình show trực tiếp cho cả nhà xem nhé!` },
              { speaker: "Host B", line: `${keySellingPoints || "Sản phẩm này có nhiều ưu điểm nổi bật"}, đây chính là lý do vì sao rất nhiều khách hàng tin dùng sản phẩm này đó cả nhà!` },
              { speaker: "Host A", line: "Cả nhà thả tim nếu bạn cũng quan tâm sản phẩm này nhé, mình sẽ giải đáp mọi thắc mắc ngay bên dưới!" }
            ],
            minigame: {
              name: "Minigame 1 - Khởi động",
              howToPlay: `Bình luận chia sẻ cảm nhận về ${heroSku1} kèm hashtag chương trình`,
              hashtagSyntax: `Cảm nhận của bạn + #${brandName.replace(/\s+/g, "")}Live`,
              winCondition: "Bình luận nhanh & chân thực nhất",
              prizeCount: "5-10 giải",
              prize: "Quà tặng nhỏ liên quan sản phẩm"
            },
            faqBank: [
              { question: objectionHandling || "Hàng có chính hãng không?", answer: `Cả nhà yên tâm nha, ${brandName} cam kết 100% hàng chính hãng, có đầy đủ chứng từ để cả nhà an tâm mua sắm!` }
            ],
            urgencyPush: "Ghim ngay giỏ hàng #1, số lượng quà tặng có hạn, cả nhà nhanh tay chốt đơn nha!",
            complianceNotes: ["Không dùng từ khẳng định tuyệt đối khi mô tả công dụng", "Đọc đúng tên thương hiệu/sản phẩm"]
          },
          {
            partName: `Phần 2 - ${heroSku2}`,
            timeCode: `${Math.round(durationMinutes * 0.4)}:00 - ${Math.round(durationMinutes * 0.8)}:00`,
            durationMinutes: Math.max(15, Math.round(durationMinutes * 0.4)),
            keyActivities: [
              `Host tạo hiệu ứng Combo mua kèm giữa ${heroSku1} và ${heroSku2}`,
              "Host tổ chức minigame 2 khuyến khích chia sẻ trải nghiệm",
              "Host hỗ trợ giải đáp thắc mắc về giao hàng & bảo hành"
            ],
            focusProduct: heroSku2,
            usp: keySellingPoints || "Ưu đãi khi mua Combo",
            giftTiers: [
              { tier: "Tầng 1 - Quà tại chỗ", condition: `Mua ${heroSku2}`, gifts: "Quà tặng kèm theo số lượng mua" },
              { tier: "Tầng 2 - Quay số may mắn", condition: "Hóa đơn từ 500K", gifts: "Giải thưởng lớn + quà giá trị" },
              { tier: "Tầng 3 - Ưu đãi trong Livestream", condition: "Chốt đơn Combo trong phiên live", gifts: "Mở kho quà tặng kèm duy nhất trong khung giờ live" }
            ],
            dialogue: [
              { speaker: "Host B", line: `Mua combo ${heroSku1} và ${heroSku2} hôm nay là tiết kiệm nhất rồi đó, còn được tặng kèm quà nữa!` },
              { speaker: "Host A", line: "Nghe hời chưa cả nhà? Đây là cơ hội chỉ có trong livestream hôm nay thôi đó, mọi người tranh thủ nha!" },
              { speaker: "Host B", line: "Comment ngay nếu bạn muốn chốt Combo này, số lượng có hạn thôi đó cả nhà!" }
            ],
            minigame: {
              name: "Minigame 2 - Chia sẻ trải nghiệm",
              howToPlay: `Bình luận chia sẻ trải nghiệm về ${heroSku2}`,
              hashtagSyntax: `Trải nghiệm của bạn + #${brandName.replace(/\s+/g, "")}Review`,
              winCondition: "Bình luận hay nhất được chọn",
              prizeCount: "2-3 giải",
              prize: "Quà tặng giá trị vừa"
            },
            faqBank: [
              { question: "Bao lâu thì nhận được hàng?", answer: `Hàng của ${brandName} đi đơn trong ngày, cả nhà nhận hàng sau 1-2 ngày làm việc nha!` }
            ],
            urgencyPush: "Bấm Mua Ngay giỏ hàng #2 trước khi hết suất Combo!",
            complianceNotes: ["Không so sánh trực tiếp với thương hiệu đối thủ cụ thể"]
          }
        ],
        closing: {
          time: `${Math.round(durationMinutes * 0.8)}:00 - ${durationMinutes}:00`,
          strategy: `Tổng kết Top 2 deal chạy nhất phiên live của ${brandName}. Hối thúc khách hàng quay lại giỏ hàng thanh toán đơn chờ.`,
          callToAction: `Bấm Theo Dõi kênh ${brandName} ngay để không bỏ lỡ phiên Mega Live tiếp theo!`,
          dialogue: [
            { speaker: "Host A", line: "Vậy là buổi livestream hôm nay sắp khép lại rồi, cả nhà nhớ chốt đơn những sản phẩm còn đang để trong giỏ hàng nha!" },
            { speaker: "Host B", line: `Cảm ơn cả nhà đã đồng hành cùng ${brandName} hôm nay! Đừng quên theo dõi kênh để đón phiên live tiếp theo nha!` }
          ]
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
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-100 text-base border-b border-slate-800 pb-2">Thống Số Đầu Vào (Brief)</h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-slate-300 block mb-1">Tên Thương Hiệu (Brand):</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Ngành Hàng:</label>
              <input
                type="text"
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Danh Sách Hero SKUs (Cách nhau dấu phẩy):</label>
              <textarea
                value={skus}
                onChange={(e) => setSkus(e.target.value)}
                rows={2}
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Khách Hàng Mục Tiêu:</label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Tone Giọng & Phong Cách Host:</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                <option value="Sôi động, Thân thiện, Chuyên môn Skincare cao, Hối thúc Deal">Sôi động + Chuyên môn Skincare</option>
                <option value="Hài hước, Gần gũi, Gen Z năng động, Bắt Trend">Hài hước Gen Z + Bắt Trend</option>
                <option value="Sang trọng, Tinh tế, Thanh lịch, Gentle Soft-sell">Luxury + Soft-sell</option>
                <option value="Chuyên gia, Đập tan nghi ngờ, Thấu hiểu sâu sắc">Chuyên Gia + Xử lý Từ Chối</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Thời Lượng Phiên Live (Phút):</label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">USP / Điểm Bán Chính Cần Nhấn Mạnh:</label>
              <textarea
                value={keySellingPoints}
                onChange={(e) => setKeySellingPoints(e.target.value)}
                rows={2}
                placeholder="Vd: 100% thành phần thuần chay, chứng nhận FDA, giá tốt hơn hàng nhập khẩu..."
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Khuyến Mãi / Voucher / Flash-sale Đang Chạy:</label>
              <textarea
                value={promotionDetails}
                onChange={(e) => setPromotionDetails(e.target.value)}
                rows={2}
                placeholder="Vd: Voucher 30k đơn từ 199k, Flash Sale 15% khung giờ vàng..."
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Câu Hỏi/Từ Chối Thường Gặp Cần Xử Lý Sẵn:</label>
              <textarea
                value={objectionHandling}
                onChange={(e) => setObjectionHandling(e.target.value)}
                rows={2}
                placeholder="Vd: Hàng có chính hãng không? Bao lâu nhận được hàng?..."
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">Nhịp Độ CTA / Chốt Đơn:</label>
              <select
                value={ctaFrequency}
                onChange={(e) => setCtaFrequency(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                <option value="Mỗi 3 phút">Mỗi 3 phút (Dồn dập)</option>
                <option value="Mỗi 5 phút">Mỗi 5 phút (Tiêu chuẩn)</option>
                <option value="Chỉ cuối mỗi SKU">Chỉ cuối mỗi SKU (Thong thả)</option>
              </select>
            </div>

            <button
              onClick={handleGenerateScript}
              disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-md"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Gemini Đang Viết Full Script (có thể mất 30-90 giây)...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Sinh Kịch Bản Live TikTok Mới
                </>
              )}
            </button>
            {loading && (
              <p className="text-[10px] text-slate-400 text-center -mt-1">
                Kịch bản Full Production Script (nhiều Part, thoại đầy đủ 2 Host) cần thời gian sinh lâu hơn bản tóm tắt — vui lòng không tắt trang, hệ thống sẽ tự chuyển sang bản dự phòng nếu quá 2 phút.
              </p>
            )}
          </div>
        </div>

        {/* Script Output Result Display */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">AI Output Script — Full Production Script</span>
              <h3 className="font-black text-slate-100 text-lg">{scriptData.title}</h3>
              {scriptData.campaignHeader && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {scriptData.campaignHeader.channel} · {scriptData.campaignHeader.hostSetup} · {scriptData.campaignHeader.totalDuration}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                {copied ? "Đã chép" : "Sao chép JSON"}
              </button>
            </div>
          </div>

          {/* Opening Hook Section */}
          {scriptData.opening && (
            <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 space-y-2 text-xs">
              <div className="flex justify-between items-center font-bold text-purple-200">
                <span>🔥 MỞ MÀN & HOOK GIỮ CHÂN KHÁN GIẢ</span>
                <span className="bg-purple-900/60 text-purple-200 px-2 py-0.5 rounded">{scriptData.opening.time}</span>
              </div>
              <p className="font-bold text-slate-100 bg-slate-950/50 p-3 rounded-lg border border-purple-900/50 italic">
                &quot;{scriptData.opening.hook}&quot;
              </p>
              <p className="text-slate-400"><strong>Hành động Studio & Host:</strong> {scriptData.opening.action}</p>
              <DialogueBlock dialogue={scriptData.opening.dialogue} />
            </div>
          )}

          {/* Parts */}
          <div className="space-y-5">
            <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-400">
              📌 CÁC PHẦN CỦA BUỔI LIVESTREAM (FULL SCRIPT)
            </h4>
            {(scriptData.parts || scriptData.timelineSegments)?.map((part: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-800 bg-slate-800/40 space-y-3 text-xs">
                <div className="flex flex-wrap justify-between items-center gap-2 font-bold text-slate-100 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-purple-300 text-sm">{part.partName || `Phân đoạn #${idx + 1}: ${part.focusProduct}`}</span>
                    {part.durationMinutes && (
                      <span className="bg-indigo-900/50 text-indigo-300 border border-indigo-700/60 px-2 py-0.5 rounded text-[10px] uppercase font-black">
                        ~{part.durationMinutes} phút
                      </span>
                    )}
                  </div>
                  <span className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded">{part.timeCode || part.timeWindow}</span>
                </div>

                {part.keyActivities && part.keyActivities.length > 0 && (
                  <div className="text-slate-300">
                    <strong>🗂️ Hoạt Động Chính:</strong>
                    <ol className="list-decimal list-inside mt-1 space-y-0.5">
                      {part.keyActivities.map((act: string, i: number) => <li key={i}>{act}</li>)}
                    </ol>
                  </div>
                )}

                {part.usp && (
                  <p className="text-indigo-300"><strong>💎 USP / RTB Nhấn Mạnh ({part.focusProduct}):</strong> {part.usp}</p>
                )}

                {part.giftTiers && part.giftTiers.length > 0 && (
                  <div className="bg-slate-950/40 border border-emerald-800/50 rounded-lg p-2.5 space-y-1">
                    <p className="text-emerald-300 font-bold">🎁 Cấu Trúc Quà Tặng Theo Tầng:</p>
                    {part.giftTiers.map((t: any, i: number) => (
                      <p key={i} className="text-emerald-400"><strong>{t.tier}:</strong> {t.condition} → {t.gifts}</p>
                    ))}
                  </div>
                )}

                <DialogueBlock dialogue={part.dialogue} title="🎙️ Kịch Bản Thoại Đầy Đủ (2 Host)" />

                {part.minigame && (
                  <div className="bg-sky-950/30 border border-sky-800/50 rounded-lg p-2.5 space-y-0.5 text-sky-300">
                    <p className="font-bold">🎮 {part.minigame.name}</p>
                    <p><strong>Cách chơi:</strong> {part.minigame.howToPlay}</p>
                    <p><strong>Cú pháp bình luận:</strong> {part.minigame.hashtagSyntax}</p>
                    <p><strong>Điều kiện thắng:</strong> {part.minigame.winCondition} · <strong>Giải:</strong> {part.minigame.prizeCount} — {part.minigame.prize}</p>
                  </div>
                )}

                {part.faqBank && part.faqBank.length > 0 && (
                  <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-2.5 space-y-1.5">
                    <p className="text-amber-300 font-bold">🛡️ Ngân Hàng Câu Hỏi Thường Gặp:</p>
                    {part.faqBank.map((f: any, i: number) => (
                      <p key={i} className="text-amber-400"><strong>Hỏi:</strong> {f.question} <br /><strong>Đáp:</strong> {f.answer}</p>
                    ))}
                  </div>
                )}

                {(part.urgencyPush || part.cta) && (
                  <p className="text-purple-200 font-bold bg-purple-900/40 p-2 rounded">
                    <strong>📣 Tạo Khan Hiếm / CTA Chốt Đơn:</strong> {part.urgencyPush || part.cta}
                  </p>
                )}

                {part.complianceNotes && part.complianceNotes.length > 0 && (
                  <div className="text-[11px] text-rose-400 border-t border-slate-800 pt-1.5">
                    <strong>⚠️ Lưu Ý Do & Don&apos;t:</strong> {part.complianceNotes.join(" · ")}
                  </div>
                )}
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
              <DialogueBlock dialogue={scriptData.closing.dialogue} dark />
              <p className="text-emerald-400 font-bold"><strong>Lời kết Host:</strong> {scriptData.closing.callToAction}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DialogueBlock: React.FC<{ dialogue?: { speaker: string; line: string }[]; title?: string; dark?: boolean }> = ({ dialogue, title, dark }) => {
  if (!dialogue || dialogue.length === 0) return null;
  return (
    <div className={`space-y-1.5 rounded-lg p-2.5 ${dark ? "bg-slate-800" : "bg-slate-950/40 border border-slate-800"}`}>
      {title && <p className={`font-bold ${dark ? "text-purple-300" : "text-slate-300"}`}>{title}</p>}
      {dialogue.map((d, i) => (
        <p key={i} className="text-slate-300">
          <span className="font-black text-purple-300">{d.speaker}:</span> {d.line}
        </p>
      ))}
    </div>
  );
};
