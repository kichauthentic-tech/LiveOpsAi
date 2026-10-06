import type { ParsedDataRawImport } from "./parseDataRawExcel";
import { shopeeNum } from "./shopeeFiles";

// File Ads Shopee (user chốt 06/10: chi phí Shopee có file riêng) — "Shopee-Live-Ads-Overall-Data-dd_mm_yyyy-dd_mm_yyyy.csv"
// tải ở Shopee Seller Centre → Quảng cáo Shopee → Quảng cáo Livestream. Khác file TikTok Ads (theo NGÀY): file này là MỘT
// DÒNG / CHIẾN DỊCH cho CẢ KỲ — nên Report Shopee có chi phí, ROAS, chi phí/đơn của tháng, KHÔNG tách được theo ngày/camp.
//
//   Shopee Live Ads Report - Shopee Vietnam
//   Shop Name,VERA Official Store
//   Shop ID,13346195
//   Report Creation Time,06/10/2026 01:40
//   Date Period,01/09/2026 - 30/09/2026
//   (dòng trống)
//   Sequence,Campaign Name,Campaign ID,Status,Objective,Start Date,End Date,Daily Start Time,Daily End Time,Budget,Views,
//     Orders,Conversion Rate,GMV,Expense,ROAS
//   1,LIVESTREAM ADS,167782702,Ongoing,GMV Max Live Auto Bidding,28/07/2025,Unlimited,All Day,All Day,100000,81460,204,0.25%,
//     70273048,2300302,30.55
//
// Chặn: kỳ không trọn trong MỘT tháng (Report theo tháng), thiếu cột, ROAS lệch GMV ÷ chi phí quá 2% (đọc nhầm dấu
// chấm/phẩy nghìn — số tiền sai 1.000 lần mà vẫn "trông hợp lý"). Mã shop của file KHÔNG chặn: mẫu VERA T9 ghi 13346195
// còn file Live List ghi User Id 13347498 — chưa rõ là cùng shop hay không, nên chỉ hiện để ops tự đối chiếu.

export interface ShopeeAdsCampaign {
  name: string;
  id: string;
  status: string;
  objective: string;
  budget: number;
  views: number;
  orders: number;
  conversionPct: number;
  gmv: number;
  expense: number;
  roas: number | null;
}

export interface ShopeeAdsStats {
  shopName: string | null;
  shopId: string | null;
  campaigns: ShopeeAdsCampaign[];
  expense: number;
  gmv: number;
  orders: number;
  views: number;
  /** GMV từ Ads ÷ chi phí — cùng cách Shopee tính ROAS. */
  roas: number | null;
  costPerOrder: number | null;
}

const COLS = ["Campaign Name", "Campaign ID", "Status", "Objective", "Budget", "Views", "Orders", "Conversion Rate", "GMV", "Expense", "ROAS"] as const;
const META_KEYS: Record<string, string> = { "Shop Name": "shopName", "Shop ID": "shopId", "Report Creation Time": "createdAt", "Date Period": "period" };

const cell = (v: unknown) => String(v ?? "").trim();

/** "01/09/2026" → "2026-09-01". */
function dmy(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${iso.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

export function parseShopeeAdsRows(rows: unknown[][]): ParsedDataRawImport {
  const meta: Record<string, string> = {};
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const first = cell(rows[i]?.[0]);
    if (first === "Sequence" && rows[i].some((c) => cell(c) === "Expense")) {
      headerIdx = i;
      break;
    }
    if (META_KEYS[first]) meta[META_KEYS[first]] = cell(rows[i][1]);
  }
  if (!/Shopee/i.test(cell(rows[0]?.[0])) || headerIdx < 0) {
    throw new Error('Không phải file "Shopee Live Ads Report" — tải ở Quảng cáo Shopee → Quảng cáo Livestream → Xuất dữ liệu (file Shopee-Live-Ads-Overall-Data-….csv).');
  }
  const header = rows[headerIdx].map(cell);
  const missing = COLS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`File Ads Shopee thiếu cột: ${missing.join(", ")}.`);

  const [a, b] = (meta.period ?? "").split(/\s+-\s+/);
  const periodStart = a ? dmy(a) : null;
  const periodEnd = b ? dmy(b) : null;
  if (!periodStart || !periodEnd) throw new Error('Không đọc được dòng "Date Period" của file Ads Shopee.');
  if (periodStart.slice(0, 7) !== periodEnd.slice(0, 7) || !periodStart.endsWith("-01")) {
    throw new Error(`File Ads Shopee phải là MỘT tháng, từ ngày 1 (file đang là ${a} – ${b}). Chọn lại kỳ khi xuất file.`);
  }
  if (periodEnd > monthEnd(periodStart)) throw new Error("Kỳ của file Ads Shopee vượt quá cuối tháng.");

  const out: Record<string, unknown>[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    if (!r || r.every((c) => cell(c) === "")) continue;
    const rec: Record<string, unknown> = {};
    header.forEach((h, i) => {
      if (h) rec[h] = r[i] ?? "";
    });
    const gmv = shopeeNum(rec.GMV);
    const expense = shopeeNum(rec.Expense);
    const roas = shopeeNum(rec.ROAS);
    if (expense > 0 && roas > 0 && Math.abs(gmv / expense - roas) / roas > 0.02) {
      throw new Error(
        `Chiến dịch "${cell(rec["Campaign Name"])}": ROAS ghi ${roas} nhưng GMV ÷ chi phí = ${(gmv / expense).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} — file có thể đã bị đổi định dạng số (dấu chấm/phẩy). Tải lại file gốc từ Shopee, đừng mở-lưu bằng Excel.`
      );
    }
    out.push(rec);
  }
  if (out.length === 0) throw new Error("File Ads Shopee không có chiến dịch nào.");

  return {
    periodLabel: [meta.shopName, meta.shopId ? `Shop ID ${meta.shopId}` : ""].filter(Boolean).join(" · ") || undefined,
    periodStart,
    periodEnd,
    summary: { shopName: meta.shopName ?? null, shopId: meta.shopId ?? null, createdAt: meta.createdAt ?? null },
    columns: header.filter(Boolean).map((h) => ({ key: h, label: h })),
    rows: out
  };
}

export function readShopeeAdsCampaigns(rows: Record<string, unknown>[]): ShopeeAdsCampaign[] {
  return rows.map((r) => {
    const expense = shopeeNum(r.Expense);
    const gmv = shopeeNum(r.GMV);
    return {
      name: cell(r["Campaign Name"]),
      id: cell(r["Campaign ID"]),
      status: cell(r.Status),
      objective: cell(r.Objective),
      budget: shopeeNum(r.Budget),
      views: shopeeNum(r.Views),
      orders: shopeeNum(r.Orders),
      conversionPct: shopeeNum(r["Conversion Rate"]),
      gmv,
      expense,
      roas: expense > 0 ? gmv / expense : null
    };
  });
}

export function shopeeAdsStats(rows: Record<string, unknown>[], summary?: Record<string, unknown> | null): ShopeeAdsStats {
  const campaigns = readShopeeAdsCampaigns(rows);
  const expense = campaigns.reduce((s, c) => s + c.expense, 0);
  const gmv = campaigns.reduce((s, c) => s + c.gmv, 0);
  const orders = campaigns.reduce((s, c) => s + c.orders, 0);
  return {
    shopName: (summary?.shopName as string | null | undefined) ?? null,
    shopId: (summary?.shopId as string | null | undefined) ?? null,
    campaigns,
    expense,
    gmv,
    orders,
    views: campaigns.reduce((s, c) => s + c.views, 0),
    roas: expense > 0 ? gmv / expense : null,
    costPerOrder: orders > 0 ? expense / orders : null
  };
}
