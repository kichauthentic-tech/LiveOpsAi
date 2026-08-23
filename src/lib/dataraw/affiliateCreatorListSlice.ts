import { DataRawColumn } from "../../types";
import { fetchOverlappingBatchRows, num } from "./monthlyProductSlice";

// Report Tháng Tab 04 Affiliate — nút "Nhập Từ Dữ Liệu Gốc" (migration 0074). File "Transaction
// Analysis - Creator List" (TikTok Shop Partner Center) cho GMV theo TỪNG CREATOR affiliate, tách
// riêng LIVE-attributed / video-attributed / product-card-attributed — cùng dạng "tổng cả kỳ,
// không có chiều ngày theo dòng" như product_list/shop_promotion nên dùng lại
// fetchOverlappingBatchRows (chọn 1 batch overlap nhiều nhất với tháng, không cộng dồn nhiều batch).
//
// directGmv CHỈ lấy video + product-card GMV, KHÔNG cộng "Creator LIVE-attributed GMV" — vì GMV
// LIVE của creator (kể cả khi họ live dưới hình thức affiliate) đã được tính trong Report Tháng
// Tab 02 Livestream qua creator_live_performance (Room ID không phân biệt được phiên affiliate hay
// phiên host thường — xem comment cảnh báo trong MonthlyReportTabs.tsx tab "affiliate"). Cộng thêm
// LIVE-attributed GMV vào đây sẽ đếm trùng GMV đã có ở Tab 02.

// "0.99%" -> 0.99 (khác num() trong monthlyProductSlice.ts vốn coi "." là phân cách nghìn cho GMV
// nguyên — với field %, dấu "." LÀ phần thập phân thật, không được strip).
function pct(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[%\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function findCol(columns: DataRawColumn[], pattern: RegExp): string | undefined {
  return columns.find((c) => pattern.test(c.label.trim()))?.key;
}

export interface AffiliateCreatorListRow {
  creatorName: string;
  directGmv: number; // Affiliate video + product-card GMV (KHÔNG gồm LIVE — xem comment trên)
  liveGmv: number; // để tham khảo/hiện chú thích, KHÔNG dùng để điền directGmv
  itemsSold: number; // "Products sold" — số sản phẩm khác nhau đã bán, không phải số lượng item
  avgPrice: number; // "AOV" — giá trị đơn hàng trung bình
  ctr: number;
  ctor: number;
  estCommission: number;
}

export interface AffiliateCreatorListMonthSlice {
  items: AffiliateCreatorListRow[];
  hasAnyBatch: boolean;
}

export async function fetchAffiliateCreatorListMonthSlice(
  brandId: string,
  monthStart: string,
  monthEnd: string
): Promise<AffiliateCreatorListMonthSlice> {
  const { rows, columns, hasAnyBatch } = await fetchOverlappingBatchRows(brandId, "transaction_analysis_creator_list", monthStart, monthEnd);
  if (!hasAnyBatch) return { items: [], hasAnyBatch: false };

  const c = {
    name: findCol(columns, /^Creator name$/i),
    videoGmv: findCol(columns, /^Affiliate video-attributed GMV$/i),
    cardGmv: findCol(columns, /^Affiliate product card-attributed GMV$/i),
    liveGmv: findCol(columns, /^Creator LIVE-attributed GMV$/i),
    productsSold: findCol(columns, /^Products sold$/i),
    aov: findCol(columns, /^AOV$/i),
    ctr: findCol(columns, /^CTR$/i),
    ctor: findCol(columns, /^CTOR$/i),
    estCommission: findCol(columns, /^Est\. commission$/i)
  };
  if (!c.name) return { items: [], hasAnyBatch: true };

  const items = rows
    .map((raw) => ({
      creatorName: String(raw[c.name!] ?? "").trim(),
      directGmv: num(c.videoGmv && raw[c.videoGmv]) + num(c.cardGmv && raw[c.cardGmv]),
      liveGmv: num(c.liveGmv && raw[c.liveGmv]),
      itemsSold: num(c.productsSold && raw[c.productsSold]),
      avgPrice: num(c.aov && raw[c.aov]),
      ctr: pct(c.ctr && raw[c.ctr]),
      ctor: pct(c.ctor && raw[c.ctor]),
      estCommission: num(c.estCommission && raw[c.estCommission])
    }))
    .filter((r) => r.creatorName);

  return { items, hasAnyBatch: true };
}
