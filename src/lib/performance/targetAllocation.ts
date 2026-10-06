import { BrandMonthlyReport, LiveSession } from "../../types";
import { sessionDurationHours } from "../pnl";
import { CampDayBucket, CampOverrides, CAMP_DAY_BUCKET_ORDER, resolveCampBucketType } from "../campaignDays";
import { brandMonthKey, sessionBrandMonthKey, type ReportPlatform } from "../reportPlatform";

// Target GMV của TỪNG CA — phân bổ TỪ TRÊN XUỐNG theo kế hoạch tháng của brand (user chốt 2026-09-18).
//
// Trước đây `targetGmv` của ca được gán lúc chốt lịch = GMV trung bình quá khứ của chính host đó
// (computeRealAvgGmvPerSession). Sai bản chất: target là thứ brand giao cho tháng, không phải
// phong độ cũ của một người. Biểu đồ "Target vs Thực đạt" trong Report Tháng vì thế so brand với
// quá khứ của host.
//
// Mô hình đúng (đã có sẵn ở Tab 05 "Kế Hoạch Tháng Sau", chỉ chưa nối xuống từng ca):
//   1. Tháng có 1 tổng target GMV.
//   2. Tổng chia cho 4 khung: Daily / D-Day / Mid-Month / Pay Day theo % — % gợi ý từ lịch sử
//      ("ngày 13-15 các tháng trước thường kiếm bao nhiêu % tháng đó"), ops sửa được rồi lưu.
//   3. Target của mỗi khung chia cho các ca CHƯA HUỶ trong khung, theo giờ ca kế hoạch.
//
// Ca huỷ KHÔNG mang target (user chốt): target của khung tự dồn sang các ca còn lại trong khung —
// tức ca bù mà agency xếp thêm sẽ tự gánh phần đó. Khung không còn ca nào thì target khung đó dồn
// sang mọi ca còn lại của tháng, không được biến mất — tổng target tháng là cam kết với brand.

export interface MonthTargetPlan {
  brandId: string;
  month: string; // "YYYY-MM"
  /** Target riêng từng sàn (user chốt 06/10): kế hoạch TikTok chỉ chia cho ca TikTok. Thiếu = TikTok. */
  platform?: ReportPlatform;
  // Target từng khung, đã quy ra tiền.
  byBucket: Record<CampDayBucket, number>;
  camp: CampOverrides;
}

export function monthTotalTarget(plan: MonthTargetPlan): number {
  return CAMP_DAY_BUCKET_ORDER.reduce((s, b) => s + plan.byBucket[b], 0);
}


// Target tháng X cho tháng KHÔNG có Kế Hoạch Tháng: target riêng từng khung camp ops nhập ở Nhập Ads
// (camp*TargetGmv của dòng tháng X) + khung camp của dòng đó. Không có gì ⇒ null, ca không có target (không bịa).
//
// Bỏ nhánh "Kế hoạch tháng sau" (plan_target_gmv + plan_pct_* của dòng tháng X−1) ngày 2026-10-04 (audit người mới,
// Nhóm 1): ô nhập đó trùng Kế Hoạch Tháng — Report Tháng phần 7 và Dashboard brand đã đọc Kế Hoạch Tháng, chỉ còn
// Dashboard agency và target/ca của tháng không có kế hoạch rơi về ô này. Target tháng nhập ở MỘT chỗ: Kế Hoạch Tháng.
export function buildMonthTargetPlan(
  brandId: string,
  month: string,
  reportsByBrandMonth: Map<string, BrandMonthlyReport>,
  platform: ReportPlatform = "TikTok"
): MonthTargetPlan | null {
  const cur = reportsByBrandMonth.get(brandMonthKey(brandId, month, platform));

  const camp: CampOverrides = {};
  if (cur?.campDdayStart && cur?.campDdayEnd) camp.dday = { start: cur.campDdayStart, end: cur.campDdayEnd };
  if (cur?.campMidmonthStart && cur?.campMidmonthEnd) camp.midmonth = { start: cur.campMidmonthStart, end: cur.campMidmonthEnd };
  if (cur?.campPaydayStart && cur?.campPaydayEnd) camp.payday = { start: cur.campPaydayStart, end: cur.campPaydayEnd };

  const byBucket: Record<CampDayBucket, number> = {
    daily: 0,
    dday: cur?.campDdayTargetGmv ?? 0,
    midmonth: cur?.campMidmonthTargetGmv ?? 0,
    payday: cur?.campPaydayTargetGmv ?? 0
  };
  if (CAMP_DAY_BUCKET_ORDER.every((b) => byBucket[b] <= 0)) return null;
  return { brandId, month, platform, byBucket, camp };
}

// Phân bổ target của một tháng xuống từng ca. Chỉ nhận ca của đúng brand + tháng; ca Cancelled
// không có mặt trong kết quả (không mang target).
export function allocateSessionTargets(sessions: LiveSession[], plan: MonthTargetPlan): Map<string, number> {
  const out = new Map<string, number>();
  const live = sessions.filter(
    (s) => s.brandId === plan.brandId && (s.platform ?? "TikTok") === (plan.platform ?? "TikTok") && s.date.startsWith(plan.month) && s.status !== "Cancelled"
  );
  if (live.length === 0) return out;

  const hoursOf = (s: LiveSession) => Math.max(sessionDurationHours(s.startTime, s.endTime), 0);
  const byBucket: Record<CampDayBucket, LiveSession[]> = { dday: [], midmonth: [], payday: [], daily: [] };
  for (const s of live) byBucket[resolveCampBucketType(s.date, plan.camp)].push(s);

  const add = (s: LiveSession, v: number) => out.set(s.id, (out.get(s.id) ?? 0) + v);
  const spread = (list: LiveSession[], amount: number) => {
    const totalH = list.reduce((a, s) => a + hoursOf(s), 0);
    if (totalH > 0) for (const s of list) add(s, (amount * hoursOf(s)) / totalH);
    else for (const s of list) add(s, amount / list.length); // ca 0 giờ (gõ nhầm) — chia đều, không bỏ
  };

  let orphan = 0;
  for (const b of CAMP_DAY_BUCKET_ORDER) {
    const amount = plan.byBucket[b];
    if (amount <= 0) continue;
    if (byBucket[b].length > 0) spread(byBucket[b], amount);
    else orphan += amount; // khung không có ca nào — không được để target bốc hơi
  }
  if (orphan > 0) spread(live, orphan);

  return out;
}

// Ghi target đã phân bổ đè lên `targetGmv` của từng ca. Tháng/brand không có kế hoạch thì giữ
// nguyên số đang có trong DB (số cũ gán theo host, hoặc ops gõ tay) — không xoá thứ chưa thay được.
//
// Kế Hoạch Tháng đã chốt (0090, giai đoạn B): `planTargetBySessionId` = target/ca ops đã chốt cho ca
// thật sinh từ kế hoạch. Brand-tháng nào có ít nhất 1 ca như vậy thì: ca có target kế hoạch dùng
// đúng số đó; ca còn lại (mở lẻ, thêm sau) chia phần target tổng CÒN LẠI (tổng tab 05 − Σ target kế
// hoạch) theo giờ, không còn thì 0 — tổng tháng vẫn là con số cam kết với brand.
export function applyAllocatedTargets(
  sessions: LiveSession[],
  reportsByBrandMonth: Map<string, BrandMonthlyReport>,
  planTargetBySessionId?: Map<string, number>,
  // Đ5 (2026-09-24): brandMonthKey (brand × tháng × sàn) → tổng target của Kế Hoạch Tháng ĐÃ CHỐT. Trước đây phần
  // target còn dư (chia cho ca mở lẻ/thêm sau) lấy từ `buildMonthTargetPlan`, tức từ dòng
  // brand_monthly_reports của tháng TRƯỚC (tab "Kế Hoạch Tháng Sau") — một ô nhập KHÁC với ô
  // "Target GMV tháng" mà ops vừa gõ ở Kế Hoạch Tháng. Hai nguồn lệch nhau thì phần dư tính bằng
  // tổng của nguồn này trừ đi target/ca của nguồn kia, ra một con số không của ai cả.
  // Có kế hoạch tháng đã chốt thì NÓ là cam kết của tháng đó, thắng.
  planMonthTotals?: Map<string, number>
): LiveSession[] {
  const plans = new Map<string, MonthTargetPlan | null>();
  const alloc = new Map<string, number>();
  const planned = new Set<string>(); // "brand|month" có kế hoạch
  const monthsWithPlanTargets = new Set<string>();
  if (planTargetBySessionId && planTargetBySessionId.size > 0) {
    for (const s of sessions) if (planTargetBySessionId.has(s.id)) monthsWithPlanTargets.add(sessionBrandMonthKey(s));
  }
  // Khoá brand × tháng × SÀN (0140): VERA có kế hoạch TikTok thì ca Shopee cùng tháng không phải "ca ngoài kế hoạch,
  // target 0" — chúng thuộc kế hoạch Shopee (hoặc không có kế hoạch nào).
  for (const s of sessions) {
    const key = sessionBrandMonthKey(s);
    if (plans.has(key)) continue;
    const p = buildMonthTargetPlan(s.brandId, s.date.slice(0, 7), reportsByBrandMonth, s.platform === "Shopee" ? "Shopee" : "TikTok");
    plans.set(key, p);
    if (monthsWithPlanTargets.has(key)) {
      planned.add(key);
      const inMonth = sessions.filter((x) => sessionBrandMonthKey(x) === key && x.status !== "Cancelled");
      let linkedSum = 0;
      const rest: LiveSession[] = [];
      for (const x of inMonth) {
        const t = planTargetBySessionId!.get(x.id);
        if (t !== undefined) {
          alloc.set(x.id, t);
          linkedSum += t;
        } else rest.push(x);
      }
      // Có Kế Hoạch Tháng đã chốt ⇒ cam kết của tháng đã chia hết cho các ca CỦA KẾ HOẠCH, kể cả
      // ca chưa chốt người. Ca mở lẻ nằm NGOÀI cam kết đó ⇒ target 0.
      //
      // Hai cái bẫy ở đây, đều đã thử và đều sai, đừng đi lại:
      //  (a) `monthTotalTarget(p) − linkedSum` (bản trước Đ5): `p` dựng từ dòng brand_monthly_reports
      //      THÁNG TRƯỚC — một ô nhập khác hẳn ô "Target GMV tháng" của Kế Hoạch Tháng. Lấy tổng của
      //      nguồn này trừ target/ca của nguồn kia ra con số không thuộc về ai.
      //  (b) `Σ target mọi ca kế hoạch − linkedSum`: `linkedSum` chỉ cộng ca ĐÃ chốt người, nên phần
      //      dư chính là target của ca kế hoạch CHƯA xếp — đem chia cho ca mở lẻ là cướp target của
      //      ca chưa xếp và thổi phồng tổng tháng. Đã dựng test bắt đúng ca này (xem
      //      scratchpad/targetAllocationTest.ts, ca "off-plan không ăn phần của ca chưa xếp").
      const hasLockedPlan = (planMonthTotals?.get(key) ?? 0) > 0;
      const remaining = hasLockedPlan ? 0 : p ? Math.max(0, monthTotalTarget(p) - linkedSum) : 0;
      const restHours = rest.reduce((a, x) => a + Math.max(sessionDurationHours(x.startTime, x.endTime), 0), 0);
      for (const x of rest) alloc.set(x.id, restHours > 0 ? (remaining * Math.max(sessionDurationHours(x.startTime, x.endTime), 0)) / restHours : 0);
    } else if ((planMonthTotals?.get(key) ?? 0) > 0) {
      // Audit workflow 2026-10-04 #7: tháng ĐÃ có Kế Hoạch Tháng chốt nhưng chưa ca nào của kế hoạch có người
      // (chốt kế hoạch xong, đang chờ đăng ký) — trước đây rơi xuống nhánh dưới và ca mở lẻ trong tháng nhận
      // target chia từ ô "Kế hoạch tháng sau" của Report (nguồn KHÁC). Có kế hoạch chốt thì nó là cam kết của
      // tháng: ca ngoài kế hoạch target 0, giống nhánh trên.
      planned.add(key);
    } else if (p) {
      planned.add(key);
      for (const [id, v] of allocateSessionTargets(sessions, p)) alloc.set(id, v);
    }
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
