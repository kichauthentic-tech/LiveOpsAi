import type { LiveSession } from "../../types";
import { profileOf } from "../../lib/platforms/profiles";

// Nhãn sàn của MỘT ca (06/10, đợt 1 lịch 2 sàn). Trước đây chỉ màn "Phòng theo giờ" ghi sàn; Bảng hôm nay, Ca Của Tôi,
// Cửa sổ Ca, Sổ Ca ghi "VERA 10:00–13:00" cho cả ca TikTok lẫn ca Shopee chạy song song — người trực phải đoán qua tên
// phòng (VERA TTS / VERA SPE), còn ca Franklin Shopee không có phòng thì không đoán được. Màu cố định theo sàn (hồ sơ sàn)
// để nhận ra không cần đọc chữ.
export function PlatformChip({ platform, className = "" }: { platform: LiveSession["platform"] | undefined; className?: string }) {
  const p = profileOf({ platform });
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${p.chipClass} ${className}`} title={`Sàn: ${p.label}`}>
      {p.label}
    </span>
  );
}
