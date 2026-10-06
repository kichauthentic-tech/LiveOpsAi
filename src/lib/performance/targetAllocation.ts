import { LiveSession } from "../../types";
import { sessionBrandMonthKey } from "../reportPlatform";

// Target GMV của TỪNG CA — phân bổ TỪ TRÊN XUỐNG theo kế hoạch tháng của brand (user chốt 2026-09-18).
//
// Trước đây `targetGmv` của ca được gán lúc chốt lịch = GMV trung bình quá khứ của chính host đó
// (computeRealAvgGmvPerSession). Sai bản chất: target là thứ brand giao cho tháng, không phải
// phong độ cũ của một người.
//
// Nguồn DUY NHẤT là Kế Hoạch Tháng đã chốt (target từng ca kế hoạch). Gộp cấu hình 06/10: bỏ nhánh "target từng khung
// camp nhập ở Nhập Ads cho tháng không có kế hoạch" (`buildMonthTargetPlan`) — đó là chỗ nhập thứ hai cho target và
// khung camp của một tháng (đo 06/10: 0 dòng report có số ở các ô đó). Tháng không có kế hoạch ⇒ giữ target đang có
// trong DB của ca.

// Ghi target kế hoạch đè lên `targetGmv` của từng ca. Tháng/brand không có kế hoạch chốt thì giữ nguyên số đang có
// trong DB — không xoá thứ chưa thay được.
//
// `planTargetBySessionId` = target/ca ops đã chốt cho ca thật sinh từ kế hoạch (0090). Brand-tháng-sàn có kế hoạch chốt
// (có ca gắn target, hoặc `planMonthTotals` > 0) thì: ca của kế hoạch dùng đúng số đó; ca ngoài kế hoạch (mở lẻ, thêm
// sau) target 0 — tổng tháng là cam kết với brand, không chia lại (luật run-rate §5.6).
export function applyAllocatedTargets(
  sessions: LiveSession[],
  planTargetBySessionId?: Map<string, number>,
  // brandMonthKey (brand × tháng × sàn) → tổng target của Kế Hoạch Tháng ĐÃ CHỐT. Tháng đã chốt mà chưa ca nào của
  // kế hoạch có người (đang chờ đăng ký) vẫn là tháng có kế hoạch: ca mở lẻ target 0 (audit workflow 2026-10-04 #7).
  planMonthTotals?: Map<string, number>
): LiveSession[] {
  const alloc = new Map<string, number>();
  // Khoá brand × tháng × SÀN (0140): VERA có kế hoạch TikTok thì ca Shopee cùng tháng không thuộc kế hoạch đó.
  const planned = new Set<string>();
  for (const s of sessions) {
    const key = sessionBrandMonthKey(s);
    const t = planTargetBySessionId?.get(s.id);
    if (t !== undefined) {
      planned.add(key);
      if (s.status !== "Cancelled") alloc.set(s.id, t);
    } else if ((planMonthTotals?.get(key) ?? 0) > 0) planned.add(key);
  }
  if (planned.size === 0) return sessions;
  // Giữ identity của mảng VÀ của từng ca khi target không đổi — hàm này nằm ngay sau
  // withEffectiveStatus trong useMemo `sessions` của App.tsx, vốn chạy lại mỗi 60 giây theo
  // nhịp tick `nowMs`. Luôn trả mảng mới thì công giữ identity ở withEffectiveStatus thành vô
  // nghĩa: ~33 useMemo phía dưới vẫn invalidate mỗi phút.
  let changed = false;
  const next = sessions.map((s) => {
    const key = sessionBrandMonthKey(s);
    if (!planned.has(key)) return s;
    const target = Math.round(alloc.get(s.id) ?? 0);
    if (target === s.targetGmv) return s;
    changed = true;
    return { ...s, targetGmv: target };
  });
  return changed ? next : sessions;
}
