import { Brand, BrandChannel, BrandMonthPlan, BrandMonthlyCommitment, BrandMonthlyReport, BrandPlatformRate, LiveSession, ShiftSlot, Talent } from "../types";
import { isUnconfirmedPast } from "./sessionStatus";
import { isCountable } from "./performance/hostPerformance";
import { fmtDateVn, fmtMonth } from "./format";
import { brandMonthKey, brandPlatformKey, sessionBrandMonthKey } from "./reportPlatform";
import { platformsOfBrand } from "./channels";
import { brandPriceSet } from "./brandPricing";
import { findPersonClashes } from "./scheduling/conflicts";

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
  /** Nhớ brand này trước khi mở màn agency theo brand (Kế Hoạch Tháng; CRM thì bung sẵn "Hợp đồng & giá" của nó). */
  rememberBrandId?: string;
  /** Sàn đi kèm brand đã nhớ (kế hoạch theo sàn, 0140). */
  rememberPlatform?: "TikTok" | "Shopee";
  action: string;
}

export interface TodoInput {
  today: string; // YYYY-MM-DD
  brands: Brand[];
  /** Kênh brand × sàn (0149) — việc theo sàn chỉ nhắc kênh ĐANG CHẠY. */
  channels: BrandChannel[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  /** brandPlatformKey (brand × sàn) → kế hoạch tháng này / tháng sau (thiếu khoá = chưa lập). */
  plansThisMonth: Map<string, BrandMonthPlan>;
  plansNextMonth: Map<string, BrandMonthPlan>;
  commitments: BrandMonthlyCommitment[];
  rates: BrandPlatformRate[];
  /** brandMonthKey (brand × tháng × sàn) → dòng report. */
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
  for (const id of input.plansThisMonth.keys()) out.add(id.split("|")[0]);
  for (const id of input.plansNextMonth.keys()) out.add(id.split("|")[0]);
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

    // 2–4 và 8 theo TỪNG SÀN của brand (0139/0140: kế hoạch, target, report riêng từng sàn).
    // Kênh đang chạy của brand (0149) — kênh tạm dừng không bị nhắc kế hoạch/cam kết/giá.
    const platforms = platformsOfBrand(input.channels, b.id, false);
    if (platforms.length === 0) {
      out.push({ id: `channel-${b.id}`, level: "high", title: `${b.name} chưa có kênh nào đang chạy`, detail: "Thêm kênh TikTok / Shopee của brand ở CRM thì mới lập kế hoạch, mở ca, nhập giá được.", tab: "crm", rememberBrandId: b.id, action: "Thêm kênh ở CRM" });
    }
    for (const p of platforms) {
      const name = platforms.length > 1 ? `${b.name} ${p}` : b.name;
      const sfx = p === "Shopee" ? "-shopee" : "";
      const ownP = own.filter((s) => (s.platform ?? "TikTok") === p);
      // 2–3. Kế hoạch tháng này.
      const cur = input.plansThisMonth.get(brandPlatformKey(b.id, p));
      if (cur?.status === "draft") {
        out.push({ id: `plan-draft-${b.id}${sfx}`, level: "high", title: `Kế hoạch tháng ${fmtMonth(month)} của ${name} còn nháp`, detail: "Chưa chốt thì chưa có ca để talent đăng ký và Dashboard chưa có target.", tab: "month_plan", rememberBrandId: b.id, rememberPlatform: p, action: "Chốt kế hoạch" });
      } else if (!cur && !ownP.some((s) => s.date.startsWith(month) && s.status !== "Cancelled")) {
        out.push({ id: `plan-none-${b.id}${sfx}`, level: "medium", title: `${name} chưa có kế hoạch và chưa có ca nào tháng ${fmtMonth(month)}`, tab: "month_plan", rememberBrandId: b.id, rememberPlatform: p, action: "Lập kế hoạch" });
      }

      // 4. Kế hoạch tháng sau — từ ngày 15, để talent còn thời gian đăng ký.
      if (Number(today.slice(8, 10)) >= 15 && input.plansNextMonth.get(brandPlatformKey(b.id, p))?.status !== "locked") {
        out.push({ id: `plan-next-${b.id}${sfx}`, level: "medium", title: `Kế hoạch tháng ${fmtMonth(nextMonth)} của ${name} chưa chốt`, tab: "month_plan", rememberBrandId: b.id, rememberPlatform: p, action: "Mở Kế Hoạch Tháng" });
      }

      // 8. Report tháng trước chưa phát hành.
      if (ownP.some((s) => s.date.startsWith(prevMonth) && s.status !== "Cancelled") && input.monthlyReports.get(brandMonthKey(b.id, prevMonth, p))?.status !== "published") {
        out.push({ id: `report-${b.id}${sfx}`, level: "medium", title: `Report ${p} tháng ${fmtMonth(prevMonth)} của ${b.name} chưa phát hành`, tab: "brand_monthly_report", brandId: b.id, action: "Mở report" });
      }
    }

    // 5. Cam kết giờ tháng này — riêng từng sàn (0141). Điều khoản nhập ở CRM (lưu hợp đồng là tự sinh từng tháng); số
    // của một tháng đặt ở Kế Hoạch Tháng (gộp cấu hình 06/10) ⇒ nút mở Kế Hoạch Tháng đúng brand × sàn.
    for (const p of platforms) {
      if (!input.commitments.some((c) => c.brandId === b.id && (c.platform ?? "TikTok") === p && c.periodMonth.startsWith(month))) {
        const name = platforms.length > 1 ? `${b.name} ${p}` : b.name;
        out.push({ id: `commit-${b.id}${p === "Shopee" ? "-shopee" : ""}`, level: "low", title: `${name} chưa có cam kết giờ tháng ${fmtMonth(month)}`, detail: "Đặt giờ cam kết của tháng ở Kế Hoạch Tháng (hoặc nhập hợp đồng ở CRM — app tự đổ ra từng tháng). Thiếu số này thì không so được giờ đã giao.", tab: "month_plan", rememberBrandId: b.id, rememberPlatform: p, action: "Mở Kế Hoạch Tháng" });
      }
    }

    // 6. Giá theo sàn: luật chung `brandPriceSet` (thu theo giờ ⇒ đơn giá/giờ; theo % ⇒ % hoa hồng đã đặt).
    for (const p of platforms) {
      if (!brandPriceSet(b, input.rates, p)) {
        const name = platforms.length > 1 ? `${b.name} ${p}` : b.name;
        out.push({ id: `rate-${b.id}${p === "Shopee" ? "-shopee" : ""}`, level: "low", title: `${name} chưa có giá`, detail: "Chưa có giá thì Finance & P&L và Dashboard không tính được doanh thu, lãi.", tab: "crm", rememberBrandId: b.id, rememberPlatform: p, action: "Nhập ở CRM" });
      }
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
      input.monthlyReports.get(sessionBrandMonthKey(s))?.status !== "published"
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
    out.push({ id: "unconfirmed", level: "high", title: `${unconfirmed.length} ca đã qua giờ chưa giao ca`, detail: "Ca có diễn ra: mở ca → Giao ca (TikTok up file, Shopee dán link + số; trợ live giao, ca không trợ thì OPS). Không diễn ra: huỷ ca.", tab: "sessions", action: "Mở Sổ Ca" });
  }

  // 9b. Trùng người từ hôm nay (user chốt 06/10: một người chỉ đứng MỘT ca tại một thời điểm). Lịch nạp hàng loạt
  // T10 có 24 cặp trùng + 3 ca vừa host vừa trợ mà không màn nào báo.
  const clashes = findPersonClashes(sessions, { from: today });
  if (clashes.length > 0) {
    const people = [...new Set(clashes.map((c) => c.talentName).filter(Boolean))];
    out.push({
      id: "person-clash",
      level: "high",
      title: `${clashes.length} chỗ trùng người trên lịch từ hôm nay`,
      detail: `${people.slice(0, 4).join(", ")}${people.length > 4 ? ` và ${people.length - 4} người khác` : ""} đang được xếp hai ca cùng giờ (hoặc vừa host vừa trợ một ca).`,
      tab: "calendar",
      action: "Xem và đổi người"
    });
  }

  // 9c. Ca sắp tới chưa có phòng — không kiểm được trùng phòng (32 ca Franklin Shopee T10, 06/10).
  const noRoom = sessions.filter((s) => s.status !== "Cancelled" && !s.isBackfill && s.date >= today && !s.studioId);
  if (noRoom.length > 0) {
    out.push({
      id: "no-room",
      level: "medium",
      title: `${noRoom.length} ca sắp tới chưa có phòng live`,
      detail: "Đặt phòng mặc định cho brand × sàn ở CRM → Hợp đồng & giá (ca mới tự nhận), ca đã tạo thì mở ca → Sửa ca để chọn phòng.",
      tab: "calendar",
      action: "Mở Bảng Vận Hành"
    });
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
    out.push({ id: "idle", level: "low", title: `${names(idle)}: chưa có ca nào gần đây`, detail: "Nếu brand đang hợp tác, bắt đầu từ CRM (hợp đồng & giá) rồi Kế Hoạch Tháng.", tab: "month_plan", rememberBrandId: idle[0].id, action: "Lập kế hoạch" });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
