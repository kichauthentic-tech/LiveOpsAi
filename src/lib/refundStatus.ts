// Trạng thái hoàn/huỷ của MỘT tháng — một hàm thuần cho Report Tháng và Kế Toán (28/10).
//
// Vì sao có file này: Report tính Refund rate = Σ "Hoàn tiền" ÷ Σ GMV theo ngày, không hỏi tháng đã chốt chưa; Kế Toán chỉ
// coi là chốt khi qua cuối tháng + 15 ngày. Hai nơi hai luật. Thêm nữa, số thật CROCS nhảy 14,7/15,7/16,5% (T6–T8, mẫu
// file cũ 28 cột) → 37,3/37,7% (T9–T10, mẫu mới 29 cột có "Tổng doanh thu") đúng lúc đổi mẫu, nên nghi cột "Hoàn tiền"
// của mẫu mới định nghĩa khác (user CHƯA xác nhận) ⇒ không so sánh Refund rate giữa hai mẫu.
//
// Mẫu số tỷ lệ hoàn = GMV (user chốt). Tỷ lệ HUỶ là số riêng, lấy từ file Order — không suy từ "Hoàn tiền".

/** Số ngày sau ngày cuối tháng mà sàn mới chốt hoàn/huỷ (user: ~15 ngày). */
export const NMV_SETTLE_DAYS = 15;

/** Cột "Hoàn tiền" của mẫu mới đã được user xác nhận cùng định nghĩa với mẫu cũ chưa. Đổi thành true khi user xác nhận. */
export const NEW_TEMPLATE_REFUND_VERIFIED = false;

/** % hoàn dự kiến mặc định để ước tính NMV khi CRM chưa nhập và chưa có tháng nào chốt đáng tin (user chốt 28/10: 40%). */
export const DEFAULT_RETURN_RATE_ESTIMATE = 40;

export type ShopFileTemplate = "old" | "new" | "unknown";

export function addDaysIso(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

export function monthEndIso(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Ngày đầu tiên được coi là đã chốt hoàn/huỷ của tháng (ngày cuối tháng + 15). */
export function settleFromIso(month: string): string {
  return addDaysIso(monthEndIso(month), NMV_SETTLE_DAYS);
}

/** Nhận diện mẫu file Shop Analytics: mẫu mới có cột "Tổng doanh thu" / "Gross revenue"; không có cột nào ⇒ "unknown". */
export function detectShopFileTemplate(columnLabels: string[] | undefined | null): ShopFileTemplate {
  if (!columnLabels || columnLabels.length === 0) return "unknown";
  return columnLabels.some((l) => /^(?:Tổng doanh thu|Gross revenue)$/i.test(l.trim())) ? "new" : "old";
}

/** Giờ nạp (ISO timestamp, UTC) → ngày VN "YYYY-MM-DD". Dùng làm ngày xuất file (file thường nạp ngay sau khi xuất). */
export function vnDateOfTimestamp(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return null;
  return new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
}

export interface RefundMonthInput {
  /** "YYYY-MM" */
  month: string;
  /** "YYYY-MM-DD" hôm nay (giờ VN). */
  today: string;
  /** Σ GMV, Σ Hoàn tiền của cả shop trong tháng (file Shop Analytics). */
  gmv: number;
  refunds: number;
  /** Ngày cuối có dòng trong file. */
  lastDate: string;
  template: ShopFileTemplate;
  /** Ngày xuất/nạp file "YYYY-MM-DD", nếu biết. */
  exportedAt?: string | null;
  /** Mặc định NEW_TEMPLATE_REFUND_VERIFIED; chỉ truyền để test / khi user đã xác nhận theo từng brand. */
  definitionVerified?: boolean;
}

export type RefundReason = "not_settled_yet" | "file_not_covering_month" | "old_template" | "unknown_template" | "no_gmv" | "definition_unverified";

export interface RefundMonthStatus {
  month: string;
  /** Refunds ÷ GMV (0–100); null khi GMV = 0. Có cả khi tạm tính — chỉ là CHƯA CHỐT. */
  rate: number | null;
  template: ShopFileTemplate;
  exportedAt: string | null;
  lastDate: string;
  settleFrom: string;
  coversMonth: boolean;
  status: "final" | "provisional";
  /** Mọi điều kiện chốt chưa thoả (rỗng khi chốt). */
  reasons: RefundReason[];
  /** Chốt trên mẫu mới mà user chưa xác nhận cột "Hoàn tiền" cùng định nghĩa với mẫu cũ. */
  definitionUnverified: boolean;
}

/** Chốt khi: đã qua cuối tháng + 15 ngày, file phủ hết tháng và file thuộc mẫu mới. */
export function refundMonthStatus(input: RefundMonthInput): RefundMonthStatus {
  const settleFrom = settleFromIso(input.month);
  const coversMonth = input.lastDate >= monthEndIso(input.month);
  const reasons: RefundReason[] = [];
  if (input.gmv <= 0) reasons.push("no_gmv");
  if (input.today < settleFrom) reasons.push("not_settled_yet");
  if (!coversMonth) reasons.push("file_not_covering_month");
  if (input.template === "old") reasons.push("old_template");
  if (input.template === "unknown") reasons.push("unknown_template");
  // Tới khi user xác nhận cột Hoàn tiền mẫu mới cùng định nghĩa mẫu cũ, mẫu mới cũng chỉ là tạm tính.
  const verified = input.definitionVerified ?? NEW_TEMPLATE_REFUND_VERIFIED;
  if (input.template === "new" && !verified) reasons.push("definition_unverified");
  const status = reasons.length === 0 ? "final" : "provisional";
  return {
    month: input.month,
    rate: input.gmv > 0 ? (input.refunds / input.gmv) * 100 : null,
    template: input.template,
    exportedAt: input.exportedAt ?? null,
    lastDate: input.lastDate,
    settleFrom,
    coversMonth,
    status,
    reasons,
    definitionUnverified: input.template === "new" && !verified
  };
}

/** Hai tháng chỉ so Refund rate được khi cùng mẫu file và mẫu đã biết. */
export function compareRefundRates(
  cur: Pick<RefundMonthStatus, "rate" | "template">,
  prev: Pick<RefundMonthStatus, "rate" | "template">
): { comparable: boolean; delta: number | null; note: string | null } {
  if (cur.rate == null || prev.rate == null) return { comparable: false, delta: null, note: null };
  if (cur.template === "unknown" || prev.template === "unknown" || cur.template !== prev.template) {
    return { comparable: false, delta: null, note: "chưa so sánh được — hai tháng xuất bằng mẫu file Shop Analytics khác nhau" };
  }
  return { comparable: true, delta: cur.rate - prev.rate, note: null };
}

export const REFUND_REASON_LABEL: Record<RefundReason, string> = {
  no_gmv: "file chưa có GMV",
  not_settled_yet: "sàn chưa chốt hoàn/huỷ (cuối tháng + 15 ngày)",
  file_not_covering_month: "file chưa phủ hết tháng",
  old_template: "file xuất bằng mẫu cũ (thiếu cột Tổng doanh thu)",
  unknown_template: "không nhận diện được mẫu file",
  definition_unverified: "chưa xác nhận cột Hoàn tiền của mẫu mới cùng định nghĩa mẫu cũ"
};

export const DEFINITION_WARNING =
  "Cột Hoàn tiền của mẫu file mới có thể được tính khác mẫu cũ (tỷ lệ nhảy từ ~15% lên ~37% đúng lúc đổi mẫu) — chưa được xác nhận.";

export interface NmvRateChoice {
  /** % hoàn dùng để trừ NMV (0–100); null khi không có nguồn nào. */
  rate: number | null;
  /** NMV chỉ là số thật khi tháng đã chốt; còn lại luôn là ước tính. */
  isEstimate: boolean;
  source: "settled_month" | "latest_settled_month" | "contract_expected" | "default_estimate";
  /** Tháng cho tỷ lệ (nếu lấy từ file). */
  sourceMonth: string | null;
  /** Câu nêu nguồn để hiện cạnh số. */
  label: string;
}

/**
 * Chọn % hoàn để tính NMV của `status.month`:
 *  - tháng đã chốt → tỷ lệ của chính nó (số thật);
 *  - chưa chốt → ước tính, ưu tiên tỷ lệ tháng đã chốt GẦN NHẤT (`settledHistory`), không có thì % hoàn dự kiến trong hợp đồng.
 */
export function chooseNmvRate(
  status: RefundMonthStatus | null,
  settledHistory: RefundMonthStatus[],
  contractExpected: number | null
): NmvRateChoice {
  if (status && status.status === "final" && status.rate != null) {
    return { rate: status.rate, isEstimate: false, source: "settled_month", sourceMonth: status.month, label: `Refund rate đã chốt của tháng ${status.month}` };
  }
  const latest = settledHistory
    .filter((s) => s.status === "final" && s.rate != null && (!status || s.month < status.month))
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  if (latest) {
    return { rate: latest.rate, isEstimate: true, source: "latest_settled_month", sourceMonth: latest.month, label: `ước tính — theo Refund rate đã chốt gần nhất (tháng ${latest.month})` };
  }
  if (contractExpected != null && contractExpected > 0) {
    return { rate: contractExpected, isEstimate: true, source: "contract_expected", sourceMonth: null, label: "ước tính — theo % hoàn dự kiến trong hợp đồng (CRM)" };
  }
  return { rate: DEFAULT_RETURN_RATE_ESTIMATE, isEstimate: true, source: "default_estimate", sourceMonth: null, label: `ước tính — % hoàn mặc định ${DEFAULT_RETURN_RATE_ESTIMATE}% (CRM chưa nhập % hoàn dự kiến)` };
}
