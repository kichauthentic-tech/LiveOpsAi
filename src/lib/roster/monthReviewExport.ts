import { castPctOf, type MonthReview, type ReviewRole } from "./monthReview";

// Xuất bảng Tổng kết tháng ra Excel theo bố cục sheet nghiệm thu của trainer (STT, Host, Mức cast, Tổng số giờ Plan/Nghiệm thu, Mức cast
// Plan/Nghiệm thu, Lý do) + thêm GMV và cast % tách theo sàn (vai host). ExcelJS tải động như xuất lịch gửi brand. Số để dạng số
// (numFmt) cho trainer tự cộng/lọc tiếp, không phải chữ "12,3M".

const GOLD = "FFB8860B";
const money = '#,##0';

export async function exportMonthReview(review: MonthReview, month: string, role: ReviewRole, nameOf: (id: string) => string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const tag = `T${Number(month.slice(5))}/${month.slice(0, 4)}`;
  const ws = wb.addWorksheet(`${role === "host" ? "Host" : "Trợ live"} ${tag}`.replace("/", "-"));
  const isHost = role === "host";
  const cols: { header: string; width: number }[] = [
    { header: "STT", width: 5 },
    { header: isHost ? "HOST" : "TRỢ LIVE", width: 24 },
    { header: "MỨC CAST (đ/giờ)", width: 16 },
    { header: "GIỜ PLAN", width: 11 },
    { header: "GIỜ NGHIỆM THU", width: 15 },
    { header: "CAST PLAN (đ)", width: 16 },
    { header: "CAST NGHIỆM THU (đ)", width: 20 },
    ...(isHost
      ? [
          { header: "GMV TikTok (đ)", width: 17 },
          { header: "CAST % TikTok", width: 14 },
          { header: "GMV Shopee (đ)", width: 17 },
          { header: "CAST % Shopee", width: 14 }
        ]
      : []),
    { header: "LÝ DO (so tháng trước)", width: 60 }
  ];
  ws.columns = cols.map((c) => ({ width: c.width }));
  const head = ws.addRow(cols.map((c) => c.header));
  head.height = 32;
  head.eachCell((c) => {
    c.font = { bold: true, name: "Arial", size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });

  const t = review.totals;
  const rateText = (r: { rateMin: number; rateMax: number; perSession: boolean }) => (r.rateMax <= 0 ? (r.perSession ? "theo phiên" : "chưa có rate") : r.rateMin === r.rateMax ? Math.round(r.rateMax) : `${Math.round(r.rateMin)} – ${Math.round(r.rateMax)}`);
  const pctCell = (p: { gmv: number; cast: number; hours: number }) => {
    const v = castPctOf(p);
    return v === null ? "" : v;
  };
  const gmvCell = (g: number) => (g > 0 ? g : "");

  const tot = ws.addRow([
    "",
    "TỔNG",
    "",
    Math.round(t.planHours * 100) / 100,
    Math.round(t.actualHours * 100) / 100,
    Math.round(t.planCost),
    Math.round(t.actualCost),
    ...(isHost ? [gmvCell(t.byPlatform.TikTok.gmv), pctCell(t.byPlatform.TikTok), gmvCell(t.byPlatform.Shopee.gmv), pctCell(t.byPlatform.Shopee)] : []),
    "GMV hai sàn không cộng gộp"
  ]);
  tot.eachCell((c) => {
    c.font = { bold: true, name: "Arial", size: 11, color: { argb: "FFFF0000" } };
  });

  review.rows.forEach((r, i) => {
    ws.addRow([
      i + 1,
      nameOf(r.talentId) || r.talentId,
      rateText(r),
      Math.round(r.planHours * 100) / 100,
      Math.round(r.actualHours * 100) / 100,
      Math.round(r.planCost),
      Math.round(r.actualCost),
      ...(isHost ? [gmvCell(r.byPlatform.TikTok.gmv), pctCell(r.byPlatform.TikTok), gmvCell(r.byPlatform.Shopee.gmv), pctCell(r.byPlatform.Shopee)] : []),
      [...r.reasons, ...(r.costMissing ? ["Có ca chưa có rate — tiền thấp hơn thật"] : [])].join("; ")
    ]);
  });

  const firstCol = 4;
  ws.eachRow((row, n) => {
    if (n === 1) return;
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { ...(c.font ?? {}), name: "Arial", size: 11 };
      c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      if (col === 4 || col === 5) c.numFmt = "0.0";
      else if (col === 6 || col === 7) c.numFmt = money;
      else if (isHost && (col === 8 || col === 10)) c.numFmt = money;
      else if (isHost && (col === 9 || col === 11)) c.numFmt = "0.0%";
      if (col >= firstCol && col !== cols.length) c.alignment = { horizontal: "right", vertical: "middle" };
      if (col === cols.length) c.alignment = { wrapText: true, vertical: "middle" };
    });
  });
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Tong_ket_${isHost ? "host" : "tro"}_${tag.replace("/", "-")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
