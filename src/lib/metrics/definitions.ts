// Bước 1/5 tái cấu trúc data (xem WORKSPACE_DESIGN.md §ĐỀ XUẤT treo) — bản nháp
// `metric_definitions` tương lai, thuần code, không có bảng DB nào đứng sau file này. Chỉ liệt kê
// các metric đang bị sửa trong đợt này (ads_cost, avg_gmv_per_session, ctr, cvr) — KHÔNG cố
// enumerate toàn bộ metric của app, việc đó thuộc bước 3.
export type MetricAggregation = "sum" | "avg" | "last" | "ratio" | "weighted_ratio";

export interface MetricDefinition {
  key: string;
  labelVi: string;
  unit: "vnd" | "percent" | "count" | "hour";
  aggregation: MetricAggregation;
  numeratorKey?: string;
  denominatorKey?: string;
  note: string;
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  ads_cost: {
    key: "ads_cost",
    labelVi: "Chi phí Ads",
    unit: "vnd",
    aggregation: "last",
    note: "Nguồn chuẩn: live_session_reports.ads_cost (trợ live nhập). session_finance.ads_cost là điều chỉnh nội bộ agency, thắng khi ops đã nhập khác 0 — xem adsCost.ts."
  },
  avg_gmv_per_session: {
    key: "avg_gmv_per_session",
    labelVi: "GMV trung bình/phiên",
    unit: "vnd",
    aggregation: "avg",
    note: "Tính thật từ mean(live_sessions.actual_gmv) của các phiên Completed theo host_id — KHÔNG dùng talents.avg_gmv_per_session (số nhập tay, chỉ còn mang tính tham khảo/lịch sử)."
  },
  ctr: {
    key: "ctr",
    labelVi: "CTR",
    unit: "percent",
    aggregation: "weighted_ratio",
    denominatorKey: "total_views",
    note: "Chưa có cột click/impression ở mức session (chỉ có ở tiktok_live_import_rows cho phiên đã đối soát TikTok) nên chưa tính được tỷ lệ thật sum(click)/sum(impression). Dùng weighted average theo total_views làm proxy — đúng hơn trung bình cộng đơn giản, nhưng vẫn là xấp xỉ. Tính đúng cần bước 3 (metric_facts lưu tử+mẫu)."
  },
  cvr: {
    key: "cvr",
    labelVi: "CVR",
    unit: "percent",
    aggregation: "weighted_ratio",
    denominatorKey: "total_views",
    note: "Cùng giới hạn với ctr ở trên."
  }
};
