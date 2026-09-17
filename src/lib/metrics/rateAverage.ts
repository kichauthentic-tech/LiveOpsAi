import { LiveSession } from "../../types";

// Trung bình CTR/CVR qua NHIỀU session phải weighted theo lưu lượng, không phải trung bình cộng
// đơn giản (sai toán học trừ khi mọi phiên cùng views — gần như không bao giờ đúng thực tế).
// Dùng total_views làm trọng số proxy (chưa có click/impression ở mức session, xem
// definitions.ts). Session có totalViews=0/undefined tự động đóng góp 0 vào cả tử lẫn mẫu — không
// cần lọc tay như code cũ từng làm (lọc ctrAvg>0 gây lệch số theo hướng khác).
export function weightedAvgRate(
  sessions: Pick<LiveSession, "totalViews">[],
  rateOf: (s: Pick<LiveSession, "totalViews">) => number | undefined
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of sessions) {
    const weight = s.totalViews || 0;
    const rate = rateOf(s);
    if (weight <= 0 || rate === undefined) continue;
    weightedSum += rate * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
