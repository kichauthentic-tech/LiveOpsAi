import type { LiveSession } from "../../types";

// Nhãn sàn của MỘT ca (06/10, đợt 1 lịch 2 sàn). Trước đây chỉ màn "Phòng theo giờ" ghi sàn; Bảng hôm nay, Ca Của Tôi,
// Cửa sổ Ca, Sổ Ca ghi "VERA 10:00–13:00" cho cả ca TikTok lẫn ca Shopee chạy song song — người trực phải đoán qua tên
// phòng (VERA TTS / VERA SPE), còn ca Franklin Shopee không có phòng thì không đoán được. Màu cố định theo sàn để nhận ra
// không cần đọc chữ.
const CLS: Record<LiveSession["platform"], string> = {
  TikTok: "bg-cyan-950 text-cyan-300 border-cyan-800",
  Shopee: "bg-orange-950 text-orange-300 border-orange-800"
};

export function PlatformChip({ platform, className = "" }: { platform: LiveSession["platform"] | undefined; className?: string }) {
  const p = platform ?? "TikTok";
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${CLS[p]} ${className}`} title={`Sàn: ${p}`}>
      {p}
    </span>
  );
}
