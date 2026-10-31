import { BoostSlot, Brand, BrandChannel, BrandMonthPlan, BrandMonthPlanSlot, BrandMonthlyCommitment, BrandMonthlyReport, BrandPlatformRate, LiveSession, ShiftSlot, Talent } from "../types";
import { isUnconfirmedPast } from "./sessionStatus";
import { isCountable } from "./performance/hostPerformance";
import { fmtDateVn, fmtMonth } from "./format";
import { platformOf, brandMonthKey, brandPlatformKey, platformIdSuffix, sessionBrandMonthKey } from "./reportPlatform";
import { profileOf } from "./platforms/profiles";
import { platformsOfBrand } from "./channels";
import { brandPriceSet } from "./brandPricing";
import type { TermsPeriod } from "./commercial/terms";
import { findPersonClashes } from "./scheduling/conflicts";
import { draftKeyOf, draftsFromSaved } from "./scheduling/monthPlanGrid";
import { boostLacksTarget } from "./scheduling/boost";
import { collectRebase } from "./scheduling/rebase";
import { parseDayLabel } from "./affiliate/plan";
import type { ShiftAck } from "./db/shiftAcks";
import { unackedSoon } from "./talent/acks";

// "Việc cần làm" — danh sách TỰ SINH từ dữ liệu cho màn đầu tiên sau khi đăng nhập (audit người mới 2026-10-04,
// Nhóm 4/5). Người cũ biết thứ tự việc (hợp đồng → giá → kế hoạch → chốt người → up số → report); người mới mở app
// chỉ thấy "Không có ca nào hôm nay". Mỗi việc = một câu nói rõ cái gì thiếu + nút tới đúng màn. Chỉ ĐỀ XUẤT, không
// tự sửa gì. Hàm thuần để test được (tests/todoList.test.ts).

export type TodoLevel = "high" | "medium" | "low";

/** Bảng Vận Hành mở sẵn chỗ này khi bấm việc: bộ lọc ca nháp / ca đã qua giờ chưa có số / chưa nhận lịch, hoặc một ngày cụ thể. */
export type BoardView = "drafts" | "backlog" | "unack" | `day:${string}`;

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
  /** Bảng Vận Hành mở sẵn bộ lọc này (24/10: ca nháp, ca chưa có số, chưa nhận lịch, một ngày). */
  view?: BoardView;
  action: string;
}

export interface TodoInput {
  today: string; // YYYY-MM-DD
  /** Số ca nháp sa bàn đang chờ xác nhận (0170). Vắng / 0 ⇒ không nhắc. */
  draftCount?: number;
  /** Dòng "Đã nhận lịch" (0169) — vắng = DB chưa chạy 0169 / đọc lỗi ⇒ bỏ qua việc "chưa nhận lịch". */
  acks?: ShiftAck[];
  /** Giờ hiện tại (ms) cho việc tính theo giờ — vắng thì Date.now(). */
  nowMs?: number;
  brands: Brand[];
  /** Kênh brand × sàn (0149) — việc theo sàn chỉ nhắc kênh ĐANG CHẠY. */
  channels: BrandChannel[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  /** brandPlatformKey (brand × sàn) → kế hoạch tháng này / tháng sau (thiếu khoá = chưa lập). */
  plansThisMonth: Map<string, BrandMonthPlan>;
  plansNextMonth: Map<string, BrandMonthPlan>;
  /**
   * Ca kế hoạch của các plan ĐÃ CHỐT tháng này + dòng ca tăng cường (0165), gom theo plan id. Thiếu (chưa nạp được) ⇒ bỏ qua việc
   * "ca ngoài kế hoạch" chứ không nhắc nhầm.
   */
  coverage?: { slotsByPlan: Map<string, BrandMonthPlanSlot[]>; boostByPlan: Map<string, BoostSlot[]> };
  commitments: BrandMonthlyCommitment[];
  rates: BrandPlatformRate[];
  /** Điều khoản hợp tác (0191): có điều khoản đang chạy thì “đã có giá” xét theo đó. */
  termPeriods?: TermsPeriod[];
  /** brandMonthKey (brand × tháng × sàn) → dòng report. */
  monthlyReports: Map<string, BrandMonthlyReport>;
  talents: Talent[];
  /** CEO/admin: thấy việc về tiền (rate talent). */
  canSeeMoney: boolean;
  /**
   * Kế hoạch Affiliate các tháng trước/này/sau (0155) — tối giản. Thiếu (chưa nạp được / DB chưa chạy 0155) ⇒ bỏ qua mọi việc
   * Affiliate chứ không nhắc nhầm.
   */
  affiliate?: {
    rows: { brandId: string; periodMonth: string; status: "planned" | "done" | "cancelled"; liveDateLabel?: string }[];
    /** `${brandId}|YYYY-MM` của tháng đã Chốt gửi brand. */
    published: Set<string>;
  };
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

  // Ca nháp của sa bàn (0170) — 24/10 gộp Phòng Điều Hành vào Bảng Vận Hành: nháp là MỘT việc ở đây, không còn khối riêng.
  if (input.draftCount) {
    out.push({
      id: "session-drafts",
      level: "high",
      title: `${input.draftCount} ca nháp chờ xác nhận`,
      detail: "Tạo từ sa bàn (Bảng Vận Hành · Cả tháng). Xác nhận = tạo ca thật và chốt người; trùng người/phòng bị chặn như ca thường.",
      tab: "calendar",
      view: "drafts",
      action: "Xem ca nháp"
    });
  }

  for (const b of activeBrands) {
    const own = sessions.filter((s) => s.brandId === b.id);

    // 2–4 và 8 theo TỪNG SÀN của brand (0139/0140: kế hoạch, target, report riêng từng sàn).
    // Kênh đang chạy của brand (0149) — kênh tạm dừng không bị nhắc kế hoạch/cam kết/giá.
    const platforms = platformsOfBrand(input.channels, b.id, false);
    if (platforms.length === 0) {
      out.push({ id: `channel-${b.id}`, level: "high", title: `${b.name} chưa có kênh nào đang chạy`, detail: "Thêm kênh TikTok / Shopee của brand ở CRM thì mới lập kế hoạch, mở ca, nhập giá được.", tab: "crm", rememberBrandId: b.id, action: "Thêm kênh ở CRM" });
    }
    for (const p of platforms) {
      const name = platforms.length > 1 ? `${b.name} ${p}` : b.name;
      const sfx = platformIdSuffix(p);
      const ownP = own.filter((s) => platformOf(s) === p);

      // 1. Số liệu cũ, theo TỪNG SÀN: ngày gần nhất có ca có số trước hôm qua. Gộp cả brand thì sàn mới nhất che sàn cũ
      // (17/10: "Số liệu Franklin mới tới 15/10" nhờ Shopee, trong khi TikTok chỉ đủ tới 12/10).
      let last: string | null = null;
      for (const s of ownP) if (isCountable(s) && s.date <= today && (!last || s.date > last)) last = s.date;
      // Chỉ nhắc khi SAU ngày có số cuối còn ca đã chạy mà chưa có số — kênh tạm nghỉ (JOCKEY Shopee T10: không ca nào) thì số "cũ" là đúng.
      const ranSince = last != null && ownP.some((s) => s.date > last! && s.date < today && s.status !== "Cancelled" && !s.isBackfill && !isCountable(s));
      if (last && last < addDays(today, -1) && ranSince) {
        const gap = daysBetween(last, today);
        out.push({
          id: `stale-${b.id}${sfx}`,
          level: gap > 3 ? "high" : "medium",
          title: `Số liệu ${name} mới tới ${fmtDateVn(last, false)} (${gap} ngày trước)`,
          detail: profileOf(p).staleDataHint,
          tab: "brand_dataraw",
          brandId: b.id,
          action: "Tải lên file"
        });
      }
      // 2–3. Kế hoạch tháng này.
      const cur = input.plansThisMonth.get(brandPlatformKey(b.id, p));
      if (cur?.status === "draft") {
        out.push({ id: `plan-draft-${b.id}${sfx}`, level: "high", title: `Kế hoạch tháng ${fmtMonth(month)} của ${name} còn nháp`, detail: "Chưa chốt thì chưa có ca để talent đăng ký và Dashboard chưa có target.", tab: "month_plan", rememberBrandId: b.id, rememberPlatform: p, action: "Chốt kế hoạch" });
      } else if (!cur && !ownP.some((s) => s.date.startsWith(month) && s.status !== "Cancelled")) {
        out.push({ id: `plan-none-${b.id}${sfx}`, level: "medium", title: `${name} chưa có kế hoạch và chưa có ca nào tháng ${fmtMonth(month)}`, tab: "month_plan", rememberBrandId: b.id, rememberPlatform: p, action: "Lập kế hoạch" });
      }

      // 3b. Ca trên lịch chưa nằm trong kế hoạch ĐÃ CHỐT (ca nạp bù, ca OP mở ngoài kế hoạch) ⇒ chưa có target, chưa vào tổng. Ca tăng cường
      // (0165) cố ý nằm ngoài kế hoạch gốc nên không đếm ở đây; chỉ nhắc khi ca tăng cường còn thiếu target đề xuất.
      if (cur?.status === "locked" && input.coverage) {
        const boost = input.coverage.boostByPlan.get(cur.id) ?? [];
        const boostKeys = new Set(boost.map(draftKeyOf));
        const set = collectRebase({ planDrafts: draftsFromSaved(input.coverage.slotsByPlan.get(cur.id) ?? []), sessions, shiftSlots: input.shiftSlots, brandId: b.id, platform: p, month, today });
        const outside = set.rows.filter((r) => r.source === "added" && !boostKeys.has(draftKeyOf(r.draft))).length;
        if (outside > 0) {
          out.push({ id: `plan-outside-${b.id}${sfx}`, level: "medium", title: `${name}: ${outside} ca trên lịch chưa có trong kế hoạch tháng ${fmtMonth(month)}`, detail: "Ca nạp bù hoặc ca OP mở ngoài kế hoạch nên chưa có target. Ở Kế Hoạch Tháng bấm \"Chia lại theo lịch hiện có…\" để đưa vào và chia target.", tab: "month_plan", rememberBrandId: b.id, rememberPlatform: p, action: "Mở Kế Hoạch Tháng" });
        }
        // 0186: DB tự điền target tạm lúc tạo ca ⇒ chỉ nhắc ca chưa có số nào (kế hoạch chưa đặt target).
        const pendingBoost = boost.filter(boostLacksTarget).length;
        if (pendingBoost > 0) {
          out.push({ id: `plan-boost-${b.id}${sfx}`, level: "low", title: `${name}: ${pendingBoost} ca tăng cường chưa có target đề xuất`, detail: "Kế hoạch tháng chưa có target nên DB chưa tính được target tạm. Mở Kế Hoạch Tháng của kênh này: engine điền target đề xuất (không cộng vào target tháng).", tab: "month_plan", rememberBrandId: b.id, rememberPlatform: p, action: "Mở Kế Hoạch Tháng" });
        }
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
      if (!input.commitments.some((c) => c.brandId === b.id && platformOf(c) === p && c.periodMonth.startsWith(month))) {
        const name = platforms.length > 1 ? `${b.name} ${p}` : b.name;
        out.push({ id: `commit-${b.id}${platformIdSuffix(p)}`, level: "low", title: `${name} chưa có cam kết giờ tháng ${fmtMonth(month)}`, detail: "Đặt giờ cam kết của tháng ở Kế Hoạch Tháng (hoặc nhập hợp đồng ở CRM — app tự đổ ra từng tháng). Thiếu số này thì không so được giờ đã giao.", tab: "month_plan", rememberBrandId: b.id, rememberPlatform: p, action: "Mở Kế Hoạch Tháng" });
      }
    }

    // 6. Giá theo sàn: luật chung `brandPriceSet` (thu theo giờ ⇒ đơn giá/giờ; theo % ⇒ % hoa hồng đã đặt).
    for (const p of platforms) {
      if (!brandPriceSet(b, input.rates, p, input.termPeriods ?? [], input.today)) {
        const name = platforms.length > 1 ? `${b.name} ${p}` : b.name;
        out.push({ id: `rate-${b.id}${platformIdSuffix(p)}`, level: "low", title: `${name} chưa có giá`, detail: "Chưa có giá thì Finance & P&L và Dashboard không tính được doanh thu, lợi nhuận.", tab: "crm", rememberBrandId: b.id, rememberPlatform: p, action: "Nhập ở CRM" });
      }
    }


    // 6b. Affiliate (chỉ sàn có tab này — hồ sơ Shopee ẩn `brand_affiliate`). Ba việc, đều dẫn tới tab Affiliate của brand.
    if (input.affiliate && platforms.some((p) => !profileOf(p).hiddenBrandTabs.includes("brand_affiliate"))) {
      const rows = input.affiliate.rows.filter((r) => r.brandId === b.id);
      const monthOf = (r: { periodMonth: string }) => r.periodMonth.slice(0, 7);

      // Phiên kế hoạch đã qua ngày (≥ 2 ngày — file Live Analysis về trễ nên sáng hôm sau chưa nhắc) mà chưa có số.
      const grace = addDays(today, -1);
      const late = rows
        .filter((r) => r.status === "planned" && (monthOf(r) === month || monthOf(r) === prevMonth))
        .map((r) => parseDayLabel(r.liveDateLabel))
        .filter((d): d is string => !!d && d < grace);
      if (late.length > 0) {
        const oldest = late.reduce((a, d) => (d < a ? d : a));
        out.push({
          id: `aff-late-${b.id}`,
          level: daysBetween(oldest, today) > 3 ? "high" : "medium",
          title: `${late.length} phiên Affiliate của ${b.name} đã qua ngày chưa có số liệu`,
          detail: "Tải lên file Live Analysis (xem \"linked accounts\") ở Dữ Liệu Gốc, rồi Nạp Từ Dữ Liệu Gốc ở tab Affiliate. Phiên không diễn ra thì đánh dấu Huỷ / dời.",
          tab: "brand_affiliate",
          brandId: b.id,
          action: "Nạp số Affiliate"
        });
      }

      // Kế hoạch tháng sau: từ ngày 15, chỉ nhắc brand ĐÃ dùng Affiliate (có dòng ở tháng trước/này/sau) — brand không chạy
      // affiliate thì không bị nhắc.
      const usesAffiliate = rows.some((r) => [prevMonth, month, nextMonth].includes(monthOf(r)));
      const nextHas = rows.some((r) => monthOf(r) === nextMonth && r.status !== "cancelled");
      if (Number(today.slice(8, 10)) >= 15 && usesAffiliate && !nextHas) {
        out.push({ id: `aff-plan-next-${b.id}`, level: "medium", title: `${b.name} chưa lập kế hoạch Affiliate tháng ${fmtMonth(nextMonth)}`, detail: "Dán kế hoạch từ Google Sheet ở tab Affiliate → Kế hoạch.", tab: "brand_affiliate", brandId: b.id, action: "Lập kế hoạch Affiliate" });
      }

      // Có kế hoạch nhưng chưa Chốt: brand chỉ thấy tháng đã chốt.
      for (const m of [month, nextMonth]) {
        if (rows.some((r) => monthOf(r) === m && r.status === "planned") && !input.affiliate.published.has(`${b.id}|${m}`)) {
          out.push({ id: `aff-unpublished-${b.id}-${m}`, level: "low", title: `Kế hoạch Affiliate tháng ${fmtMonth(m)} của ${b.name} chưa chốt gửi brand`, detail: "Brand chỉ thấy kế hoạch Affiliate sau khi bạn bấm Chốt, gửi brand ở tab Affiliate.", tab: "brand_affiliate", brandId: b.id, action: "Mở tab Affiliate" });
        }
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
      title: `${noHost.length} ca đã live chưa gán host`,
      detail: allBackfill ? "Ca nhập từ file — vào Dữ Liệu Gốc, chọn loại Creator Live Performance, gán host ở lưới nạp bù." : "Mở Sổ Ca, bấm vào ca để gán host.",
      tab: allBackfill && oneBrand ? "brand_dataraw" : "sessions",
      brandId: allBackfill && oneBrand ? brandOf : undefined,
      action: "Gán host"
    });
  }

  // 9. Ca đã qua giờ mà chưa có bằng chứng diễn ra.
  const unconfirmed = sessions.filter(isUnconfirmedPast);
  if (unconfirmed.length > 0) {
    // 25/10 (audit Bảng Vận Hành): "chưa có số" — cùng định nghĩa với khối Cần xử lý và nhãn đỏ trên dòng ca; mở thẳng danh sách đó.
    out.push({ id: "unconfirmed", level: "high", title: `${unconfirmed.length} ca đã qua giờ chưa có số liệu`, detail: "Ca có diễn ra: mở ca → Giao ca (tải lên file số liệu của sàn: TikTok Creator-Live-Performance, Shopee Live List; trợ live giao, ca không trợ thì OPS). Không diễn ra: huỷ ca.", tab: "calendar", view: "backlog", action: "Xem & giao ca" });
  }

  // 9b. Trùng người từ hôm nay (user chốt 06/10: một người chỉ đứng MỘT ca tại một thời điểm). Lịch nạp hàng loạt
  // T10 có 24 cặp trùng + 3 ca vừa host vừa trợ mà không màn nào báo.
  const clashes = findPersonClashes(sessions, { from: today });
  if (clashes.length > 0) {
    const people = [...new Set(clashes.map((c) => c.talentName).filter(Boolean))];
    // Mức theo HẠN (audit 24/10, chuẩn cảnh báo vận hành): chỗ trùng trong 48 giờ tới mới đỏ; mở thẳng ngày trùng sớm nhất.
    const first = clashes.reduce((a, c) => (c.session.date < a ? c.session.date : a), clashes[0].session.date);
    out.push({
      id: "person-clash",
      level: first <= addDays(today, 1) ? "high" : "medium",
      title: `${clashes.length} chỗ trùng người, sớm nhất ${fmtDateVn(first, false)}`,
      detail: `${people.slice(0, 4).join(", ")}${people.length > 4 ? ` và ${people.length - 4} người khác` : ""} đang được xếp hai ca cùng giờ (hoặc vừa host vừa trợ một ca).`,
      tab: "calendar",
      view: `day:${first}`,
      action: "Xem và đổi người"
    });
  }

  // 9a. Ca 48 giờ tới chưa gán host (ca đã tạo, không phải ca chờ đăng ký) — trước 25/10 không việc nào nhắc, chỉ thấy dòng đỏ nếu đúng ngày đang xem.
  const soonNoHost = sessions.filter((s) => s.status !== "Cancelled" && !s.isBackfill && s.date >= today && s.date <= addDays(today, 1) && !s.hostId);
  if (soonNoHost.length > 0) {
    const first = soonNoHost.reduce((a, s) => (s.date < a ? s.date : a), soonNoHost[0].date);
    out.push({
      id: "no-host-soon",
      level: "high",
      title: `${soonNoHost.length} ca 48 giờ tới chưa có host`,
      detail: soonNoHost.slice(0, 3).map((s) => `${s.brandName} ${platformOf(s)} ${fmtDateVn(s.date, false)} ${s.startTime}`).join(" · "),
      tab: "calendar",
      view: `day:${first}`,
      action: "Gán host"
    });
  }

  // 9c. Ca sắp tới chưa có phòng — không kiểm được trùng phòng (32 ca Franklin Shopee T10, 06/10).
  // 25/10: tách 48 giờ tới (việc ngày, mở đúng ngày) khỏi phần sau (việc tháng: sửa phòng mặc định ở CRM).
  const noRoom = sessions.filter((s) => s.status !== "Cancelled" && !s.isBackfill && s.date >= today && !s.studioId);
  const noRoomSoon = noRoom.filter((s) => s.date <= addDays(today, 1));
  const roomHint = "Đặt phòng mặc định cho brand × sàn ở CRM → Hợp đồng & giá (ca mới tự nhận), ca đã tạo thì mở ca → Sửa ca để chọn phòng.";
  if (noRoomSoon.length > 0) {
    const first = noRoomSoon.reduce((a, s) => (s.date < a ? s.date : a), noRoomSoon[0].date);
    out.push({ id: "no-room", level: "medium", title: `${noRoomSoon.length} ca 48 giờ tới chưa có phòng live`, detail: roomHint, tab: "calendar", view: `day:${first}`, action: "Xem ca" });
  }
  if (noRoom.length > noRoomSoon.length) {
    out.push({ id: "no-room-later", level: "low", title: `${noRoom.length - noRoomSoon.length} ca sau 48 giờ chưa có phòng live`, detail: roomHint, tab: "crm", action: "Phòng mặc định ở CRM" });
  }

  // 9b. Người đứng ca trong 48 giờ tới chưa bấm "Đã nhận" lịch (app talent T2, 0169). Ca sát giờ (≤ 12 giờ) ⇒ đỏ: gọi nhắc
  // trước khi người đó không tới. Gồm cả người chỉ đứng một đoạn khi đổi người giữa ca.
  if (input.acks) {
    const now = input.nowMs ?? Date.now();
    const people = unackedSoon(sessions, input.acks, now, 48);
    if (people.length > 0) {
      const shifts = new Set(people.flatMap((p) => p.sessions.map((s) => s.id))).size;
      const first = (p: (typeof people)[number]) => `${fmtDateVn(p.sessions[0].date, false)} ${p.sessions[0].startTime}`;
      // 25/10: mức thấp — chưa ai dùng app talent nên số này gần như bằng tổng số người đứng ca (audit 24/10: 27/27); bấm mở bộ lọc
      // "chưa nhận lịch" trên Bảng Vận Hành (ca trong 12 giờ tới). Khi talent dùng app thật thì xem lại mức.
      out.push({
        id: "unacked-shifts",
        level: "low",
        title: `${people.length} người chưa nhận lịch ${shifts} ca trong 48 giờ tới`,
        detail: `${people.slice(0, 4).map((p) => `${p.name} (${p.sessions.length} ca, sớm nhất ${first(p)})`).join(", ")}${people.length > 4 ? ` và ${people.length - 4} người khác` : ""}. Talent bấm "Đã xem" ở tab Ca của tôi của app; chưa xem thì nhắn/gọi nhắc.`,
        tab: "calendar",
        view: "unack",
        action: "Lọc ca"
      });
    }
  }

  // 10. Ca chờ đăng ký trong 7 ngày tới chưa có người.
  const week = addDays(today, 7);
  const open = input.shiftSlots.filter((sl) => sl.status === "open" && !sl.sessionId && sl.date >= today && sl.date <= week);
  if (open.length > 0) {
    const first = open.reduce((a, sl) => (sl.date < a ? sl.date : a), open[0].date);
    out.push({ id: "open-slots", level: first <= addDays(today, 1) ? "high" : "medium", title: `${open.length} ca trong 7 ngày tới chưa có người`, tab: "calendar", view: `day:${first}`, action: "Chốt người" });
  }

  // Rate talent (chỉ CEO/admin thấy rate): host/trợ đã chạy ca mà chưa có rate nào.
  if (input.canSeeMoney) {
    const worked = new Set<string>();
    for (const s of sessions) if (s.status !== "Cancelled" && s.date <= today) { if (s.hostId) worked.add(s.hostId); if (s.coHostId) worked.add(s.coHostId); for (const g of s.staffSegments ?? []) worked.add(g.talentId); }
    const missing = input.talents.filter((t) => worked.has(t.id) && !t.rateHidden && !(t.ratePerHour > 0) && !(t.ratePerSession > 0) && !(t.assistantRatePerHour && t.assistantRatePerHour > 0));
    if (missing.length > 0) {
      out.push({ id: "talent-rate", level: "low", title: `${missing.length} talent đã live nhưng chưa có rate`, detail: "Chưa có rate thì lương và P&L từng ca chưa tính được.", tab: "talents", action: "Mở Talent Pool" });
    }
  }

  if (idle.length > 0) {
    out.push({ id: "idle", level: "low", title: `${names(idle)}: chưa có ca nào gần đây`, detail: "Nếu brand đang hợp tác, bắt đầu từ CRM (hợp đồng & giá) rồi Kế Hoạch Tháng.", tab: "month_plan", rememberBrandId: idle[0].id, action: "Lập kế hoạch" });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

// ---------------------------------------------------------------------------
// Hai phần của "Việc cần làm" (audit Bảng Vận Hành 24/10, user chốt 25/10): HÔM NAY PHẢI XONG (hạn ≤ 48 giờ, mức theo hạn) và
// VIỆC THÁNG gom theo loại, thu gọn (31 việc rời ⇒ ~11 dòng). Số liệu cũ từng kênh là con của "ca đã qua giờ chưa có số"
// (cùng một việc: up file / Giao ca). Việc tháng tối đa mức vàng — không việc tháng nào đỏ cạnh việc phải xong hôm nay.
// ---------------------------------------------------------------------------

export interface TodoRow extends Todo {
  /** Việc con hiện khi mở dòng (vd số liệu cũ từng kênh dưới "ca chưa có số"). */
  children?: Todo[];
}
export interface TodoGroup {
  key: string;
  label: string;
  level: TodoLevel;
  items: Todo[];
}

const DAY_IDS = new Set(["session-drafts", "unconfirmed", "person-clash", "no-host-soon", "no-room", "unacked-shifts", "open-slots"]);
const MONTH_GROUPS: { key: string; label: string; match: (id: string) => boolean }[] = [
  { key: "plan-next", label: "Kế hoạch tháng sau chưa chốt", match: (id) => id.startsWith("plan-next-") },
  { key: "plan-now", label: "Kế hoạch tháng này còn nháp / chưa có", match: (id) => id.startsWith("plan-draft-") || id.startsWith("plan-none-") },
  { key: "plan-fix", label: "Ca chưa có target (ngoài kế hoạch / tăng cường)", match: (id) => id.startsWith("plan-outside-") || id.startsWith("plan-boost-") },
  { key: "report", label: "Report tháng trước chưa phát hành", match: (id) => id.startsWith("report-") },
  { key: "price", label: "Chưa có giá ở CRM", match: (id) => id.startsWith("rate-") },
  { key: "commit", label: "Chưa có cam kết giờ", match: (id) => id.startsWith("commit-") },
  { key: "affiliate", label: "Affiliate", match: (id) => id.startsWith("aff-") },
  { key: "channel", label: "Brand chưa có kênh", match: (id) => id.startsWith("channel-") }
];
const CAP: Record<TodoLevel, TodoLevel> = { high: "medium", medium: "medium", low: "low" };

export function groupTodos(todos: Todo[]): { today: TodoRow[]; month: TodoGroup[] } {
  const stale = todos.filter((t) => t.id.startsWith("stale-"));
  const today: TodoRow[] = [];
  const month: TodoGroup[] = [];
  for (const t of todos) {
    if (t.id.startsWith("stale-")) continue;
    if (DAY_IDS.has(t.id)) {
      today.push(t.id === "unconfirmed" && stale.length ? { ...t, children: stale, detail: `Số liệu cũ ở ${stale.length} kênh — mở dòng để tải lên file từng kênh. ${t.detail ?? ""}`.trim() } : t);
      continue;
    }
    const g = MONTH_GROUPS.find((x) => x.match(t.id));
    const key = g?.key ?? t.id;
    const cur = month.find((m) => m.key === key);
    if (cur) cur.items.push(t);
    else month.push({ key, label: g?.label ?? t.title, level: CAP[t.level], items: [t] });
  }
  // Không có ca nào thiếu số mà vẫn có kênh số cũ (kênh chỉ nạp file tổng) ⇒ số cũ đứng riêng ở phần hôm nay.
  if (stale.length && !todos.some((t) => t.id === "unconfirmed")) today.push(...stale);
  for (const m of month) for (const t of m.items) if (LEVEL_ORDER[CAP[t.level]] < LEVEL_ORDER[m.level]) m.level = CAP[t.level];
  today.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  month.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return { today, month };
}

