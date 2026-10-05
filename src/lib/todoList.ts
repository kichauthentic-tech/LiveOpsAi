import { Brand, BrandMonthPlan, BrandMonthlyCommitment, BrandMonthlyReport, BrandPlatformRate, LiveSession, ShiftSlot, Talent } from "../types";
import { isUnconfirmedPast } from "./sessionStatus";
import { isCountable } from "./performance/hostPerformance";
import { fmtDateVn, fmtMonth } from "./format";

// "Việc cần làm" — danh sách TỰ SINH từ dữ liệu cho màn đầu tiên sau khi đăng nhập (audit người mới 2026-10-04,
// Nhóm 4/5). Người cũ biết thứ tự việc (hợp đồng → giá → kế hoạch → chốt người → up số → report); người mới mở app
// chỉ thấy "Không có ca nào hôm nay". Mỗi việc = một câu nói rõ cái gì thiếu + nút tới đúng màn. Chỉ ĐỀ XUẤT, không
// tự sửa gì. Hàm thuần để test được (tests/todoList.test.ts).

export type TodoLevel = "high" | "medium" | "low";

export interface Todo {
  id: string;
  level: TodoLevel;
  title: string;
  detail?: string;
  /** Màn mở khi bấm; `brandId` có ⇒ mở trong Brand Workspace của brand đó. */
  tab: string;
  brandId?: string;
  /** Nhớ brand này trước khi mở màn agency theo brand (Kế Hoạch Tháng). */
  rememberBrandId?: string;
  action: string;
}

export interface TodoInput {
  today: string; // YYYY-MM-DD
  brands: Brand[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  /** brandId → kế hoạch tháng này / tháng sau (thiếu khoá = chưa lập). */
  plansThisMonth: Map<string, BrandMonthPlan>;
  plansNextMonth: Map<string, BrandMonthPlan>;
  commitments: BrandMonthlyCommitment[];
  rates: BrandPlatformRate[];
  /** "brandId|YYYY-MM" → dòng report. */
  monthlyReports: Map<string, BrandMonthlyReport>;
  talents: Talent[];
  /** CEO/admin: thấy việc về tiền (rate talent). */
  canSeeMoney: boolean;
}

const LEVEL_ORDER: Record<TodoLevel, number> = { high: 0, medium: 1, low: 2 };

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const names = (bs: Brand[]) => bs.map((b) => b.name).join(", ");

/**
 * Brand "đang chạy": có ca không huỷ trong 60 ngày qua hoặc ở tương lai, hoặc đã có kế hoạch tháng này/tháng sau.
 * Brand khác (mới tạo, đã dừng) không sinh việc riêng — gộp một dòng nhắc, tránh 4 brand × 6 việc ngập màn.
 */
export function activeBrandIds(input: Pick<TodoInput, "today" | "sessions" | "plansThisMonth" | "plansNextMonth">): Set<string> {
  const from = addDays(input.today, -60);
  const out = new Set<string>();
  for (const s of input.sessions) if (s.status !== "Cancelled" && s.date >= from) out.add(s.brandId);
  for (const id of input.plansThisMonth.keys()) out.add(id);
  for (const id of input.plansNextMonth.keys()) out.add(id);
  return out;
}

export function buildTodos(input: TodoInput): Todo[] {
  const { today, brands, sessions } = input;
  const month = today.slice(0, 7);
  const nextMonth = shiftMonth(month, 1);
  const prevMonth = shiftMonth(month, -1);
  const active = activeBrandIds(input);
  const activeBrands = brands.filter((b) => active.has(b.id));
  const idle = brands.filter((b) => !active.has(b.id));
  const out: Todo[] = [];

  for (const b of activeBrands) {
    const own = sessions.filter((s) => s.brandId === b.id);

    // 1. Số liệu cũ: ngày gần nhất có ca có số trước hôm qua.
    let last: string | null = null;
    for (const s of own) if (isCountable(s) && s.date <= today && (!last || s.date > last)) last = s.date;
    if (last && last < addDays(today, -1)) {
      const gap = daysBetween(last, today);
      out.push({
        id: `stale-${b.id}`,
        level: gap > 3 ? "high" : "medium",
        title: `Số liệu ${b.name} mới tới ${fmtDateVn(last, false)} (${gap} ngày trước)`,
        detail: "Tải file Creator Live Performance từ TikTok rồi up ở Dữ Liệu Gốc; cuối kỳ up thêm ở Đối Soát Số Liệu.",
        tab: "brand_dataraw",
        brandId: b.id,
        action: "Up file"
      });
    }

    // 2–3. Kế hoạch tháng này.
    const cur = input.plansThisMonth.get(b.id);
    if (cur?.status === "draft") {
      out.push({ id: `plan-draft-${b.id}`, level: "high", title: `Kế hoạch tháng ${fmtMonth(month)} của ${b.name} còn nháp`, detail: "Chưa chốt thì chưa có ca để talent đăng ký và Dashboard chưa có target.", tab: "month_plan", rememberBrandId: b.id, action: "Chốt kế hoạch" });
    } else if (!cur && !own.some((s) => s.date.startsWith(month) && s.status !== "Cancelled")) {
      out.push({ id: `plan-none-${b.id}`, level: "medium", title: `${b.name} chưa có kế hoạch và chưa có ca nào tháng ${fmtMonth(month)}`, tab: "month_plan", rememberBrandId: b.id, action: "Lập kế hoạch" });
    }

    // 4. Kế hoạch tháng sau — từ ngày 15, để talent còn thời gian đăng ký.
    if (Number(today.slice(8, 10)) >= 15 && input.plansNextMonth.get(b.id)?.status !== "locked") {
      out.push({ id: `plan-next-${b.id}`, level: "medium", title: `Kế hoạch tháng ${fmtMonth(nextMonth)} của ${b.name} chưa chốt`, tab: "month_plan", rememberBrandId: b.id, action: "Mở Kế Hoạch Tháng" });
    }

    // 5. Hợp đồng / cam kết giờ tháng này.
    if (!input.commitments.some((c) => c.brandId === b.id && c.periodMonth.startsWith(month))) {
      out.push({ id: `commit-${b.id}`, level: "low", title: `${b.name} chưa có cam kết giờ tháng ${fmtMonth(month)}`, detail: "Nhập hợp đồng rồi bấm \"Sinh cam kết theo tháng\" — Kế Hoạch Tháng lấy số giờ cần xếp từ đây.", tab: "brand_commitment", action: "Nhập hợp đồng" });
    }

    // 6. Giá: chưa có đơn giá/giờ lẫn % hoa hồng thì Finance và Dashboard không tính được doanh thu.
    const rated = input.rates.some((r) => r.brandId === b.id && (r.ratePerHour > 0 || (r.commissionRate ?? 0) > 0));
    if (!rated) {
      out.push({ id: `rate-${b.id}`, level: "low", title: `${b.name} chưa có giá (Rate Card)`, detail: "Chưa có giá thì Finance & P&L và Dashboard không tính được doanh thu, lãi.", tab: "crm", action: "Nhập ở CRM" });
    }

    // 8. Report tháng trước chưa phát hành.
    if (own.some((s) => s.date.startsWith(prevMonth) && s.status !== "Cancelled") && input.monthlyReports.get(`${b.id}|${prevMonth}`)?.status !== "published") {
      out.push({ id: `report-${b.id}`, level: "medium", title: `Report tháng ${fmtMonth(prevMonth)} của ${b.name} chưa phát hành`, tab: "brand_monthly_report", brandId: b.id, action: "Mở report" });
    }
  }

  // 7. Ca đã chạy chưa gán host, ở tháng CHƯA phát hành report — không vào xếp hạng host, và phát hành report thiếu
  // host là gửi brand bảng Host thiếu người. Trước 05/10 lọc 90 ngày ⇒ 2 ca T6 của CROCS (report chưa phát hành,
  // user đang gán host để phát hành T6–T9) không bao giờ hiện ở đây. Tháng đã phát hành = đã đóng sổ, không nhắc.
  const noHost = sessions.filter(
    (s) =>
      s.status !== "Cancelled" &&
      s.date <= today &&
      !s.hostId &&
      input.monthlyReports.get(`${s.brandId}|${s.date.slice(0, 7)}`)?.status !== "published"
  );
  if (noHost.length > 0) {
    const allBackfill = noHost.every((s) => s.isBackfill);
    const brandOf = noHost[0].brandId;
    const oneBrand = noHost.every((s) => s.brandId === brandOf);
    out.push({
      id: "no-host",
      level: "medium",
      title: `${noHost.length} ca đã chạy chưa gán host`,
      detail: allBackfill ? "Ca nhập từ file — vào Dữ Liệu Gốc, chọn loại Creator Live Performance, gán host ở lưới nạp bù." : "Mở Sổ Ca, bấm vào ca để gán host.",
      tab: allBackfill && oneBrand ? "brand_dataraw" : "sessions",
      brandId: allBackfill && oneBrand ? brandOf : undefined,
      action: "Gán host"
    });
  }

  // 9. Ca đã qua giờ mà chưa có bằng chứng diễn ra.
  const unconfirmed = sessions.filter(isUnconfirmedPast);
  if (unconfirmed.length > 0) {
    out.push({ id: "unconfirmed", level: "high", title: `${unconfirmed.length} ca đã qua giờ chưa có số, chưa có report`, detail: "Up số/nhập report nếu ca có diễn ra, huỷ ca nếu không.", tab: "sessions", action: "Mở Sổ Ca" });
  }

  // 10. Ca chờ đăng ký trong 7 ngày tới chưa có người.
  const week = addDays(today, 7);
  const open = input.shiftSlots.filter((sl) => sl.status === "open" && !sl.sessionId && sl.date >= today && sl.date <= week);
  if (open.length > 0) {
    out.push({ id: "open-slots", level: "high", title: `${open.length} ca trong 7 ngày tới chưa có người`, tab: "shift_scheduling", action: "Chốt người" });
  }

  // Rate talent (chỉ CEO/admin thấy rate): host/trợ đã chạy ca mà chưa có rate nào.
  if (input.canSeeMoney) {
    const worked = new Set<string>();
    for (const s of sessions) if (s.status !== "Cancelled" && s.date <= today) { if (s.hostId) worked.add(s.hostId); if (s.coHostId) worked.add(s.coHostId); for (const g of s.staffSegments ?? []) worked.add(g.talentId); }
    const missing = input.talents.filter((t) => worked.has(t.id) && !t.rateHidden && !(t.ratePerHour > 0) && !(t.ratePerSession > 0) && !(t.assistantRatePerHour && t.assistantRatePerHour > 0));
    if (missing.length > 0) {
      out.push({ id: "talent-rate", level: "low", title: `${missing.length} talent đã chạy ca nhưng chưa có rate`, detail: "Chưa có rate thì lương và lãi/lỗ từng ca chưa tính được.", tab: "talents", action: "Mở Talent Pool" });
    }
  }

  if (idle.length > 0) {
    out.push({ id: "idle", level: "low", title: `${names(idle)}: chưa có ca nào gần đây`, detail: "Nếu brand đang hợp tác, bắt đầu từ Cam Kết Hợp Đồng rồi Kế Hoạch Tháng.", tab: "month_plan", rememberBrandId: idle[0].id, action: "Lập kế hoạch" });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
