// Trang Affiliate (0102) — phần thuần: từ batch Dataraw "Live Analysis" ra danh sách phiên.
// Dựng 2026-10-01 cùng lúc với 2 bản vá ở đường đọc DB (xem affiliateLiveSessionSlice.ts):
//   • batch nào thắng khi 2 batch chứa chung một phiên — trước đây phụ thuộc thứ tự PostgREST trả về;
//   • dòng đọc phải cuộn trang (kiểm ở tests/pagedQueries.test.ts, không kiểm được từ đây).
import { describe, expect, test } from "vitest";
import { AffiliateBatch, buildAffiliateRows } from "../src/lib/dataraw/affiliateLiveRows";

const COLS = [
  { key: "c0", label: "Nhà sáng tạo" },
  { key: "c1", label: "Biệt danh" },
  { key: "c2", label: "Thời gian bắt đầu" },
  { key: "c3", label: "Thời lượng" },
  { key: "c4", label: "GMV đến từ buổi LIVE" },
  { key: "c5", label: "Đơn hàng đã thanh toán" },
  { key: "c6", label: "Lượt xem" },
  { key: "c7", label: "Lượt nhấp Sản phẩm" },
  { key: "c8", label: "Lượt hiển thị sản phẩm" },
  { key: "c9", label: "Người xem" },
  { key: "c10", label: "Giá trung bình" },
  { key: "c11", label: "CTOR" },
  { key: "c12", label: "Số món bán ra ghi nhận vào buổi LIVE" }
];

function row(o: Partial<Record<string, unknown>> & { start: string }) {
  return {
    c0: o.creator ?? "Nguyễn A",
    c1: o.nickname ?? "nguyena",
    c2: o.start,
    c3: o.duration ?? "2h 57min",
    c4: o.gmv ?? 0,
    c5: o.orders ?? 0,
    c6: o.views ?? 0,
    c7: o.clicks ?? 0,
    c8: o.impressions ?? 0,
    c9: o.viewers ?? 0,
    c10: o.avgPrice ?? 0,
    c11: o.ctor ?? 0,
    c12: o.itemsSold ?? 0
  };
}
const batch = (rows: Record<string, unknown>[], columns = COLS): AffiliateBatch => ({ columns, rows });
const ALL = ["2026-09-01", "2026-09-30"] as const;

describe("gộp phiên trùng giữa 2 batch", () => {
  // Hai batch chồng kỳ chỉ xảy ra khi một batch vắt qua 2 tháng (unique index 0077 chặn 2 batch
  // cùng tháng): vd bản 25/8–5/9 và bản cả tháng 9 đều chứa phiên ngày 3/9.
  const older = batch([row({ start: "2026/09/03/ 19:06", gmv: 10_000_000, orders: 10 })]);
  const newer = batch([row({ start: "2026/09/03/ 19:06", gmv: 7_000_000, orders: 6 })]);

  test("batch nạp SAU thắng — đó là bản đã trừ hoàn/huỷ", () => {
    const rows = buildAffiliateRows([older, newer], ...ALL);
    expect(rows).toHaveLength(1);
    expect(rows[0].directGmv).toBe(7_000_000);
    expect(rows[0].orders).toBe(6);
  });

  test("đảo thứ tự là đảo kết quả — nên thứ tự truyền vào là HỢP ĐỒNG, không phải tuỳ ý", () => {
    // Chính vì hàm này nhạy với thứ tự mà bản cũ sai: truy vấn batch không có .order(...) nào,
    // PostgREST trả theo thứ tự tuỳ Postgres ⇒ bản cũ ghi đè bản mới, và kết quả đổi giữa 2 lần mở.
    expect(buildAffiliateRows([newer, older], ...ALL)[0].directGmv).toBe(10_000_000);
  });

  test("hai creator khác nhau cùng giờ không bị gộp", () => {
    const rows = buildAffiliateRows(
      [batch([row({ start: "2026/09/03/ 19:06", nickname: "a" }), row({ start: "2026/09/03/ 19:06", nickname: "b" })])],
      ...ALL
    );
    expect(rows).toHaveLength(2);
  });

  test("cùng creator, hai phiên khác giờ trong ngày là hai dòng", () => {
    const rows = buildAffiliateRows(
      [batch([row({ start: "2026/09/03/ 09:00" }), row({ start: "2026/09/03/ 19:06" })])],
      ...ALL
    );
    expect(rows.map((r) => r.timelineLabel)).toEqual(["09:00 - 11:57", "19:06 - 22:03"]);
  });
});

describe("lọc theo dải ngày VN", () => {
  test("hai đầu dải đều được tính (inclusive)", () => {
    const rows = buildAffiliateRows(
      [batch([row({ start: "2026/09/01/ 00:00" }), row({ start: "2026/09/30/ 23:30" })])],
      ...ALL
    );
    expect(rows).toHaveLength(2);
  });

  test("ngoài dải thì bỏ, dù batch có phủ", () => {
    const rows = buildAffiliateRows([batch([row({ start: "2026/08/31/ 23:00" }), row({ start: "2026/10/01/ 00:30" })])], ...ALL);
    expect(rows).toEqual([]);
  });

  test("giờ bắt đầu đọc theo GIỜ VN, không phải UTC", () => {
    // 2026/09/03 00:30 giờ VN = 2026-09-02T17:30Z. Hiểu sai múi giờ là phiên rơi sang ngày 2/9.
    expect(buildAffiliateRows([batch([row({ start: "2026/09/03/ 00:30" })])], ...ALL)[0].date).toBe("2026-09-03");
  });
});

describe("đọc số từ file", () => {
  test("số kiểu VN có dấu chấm nghìn", () => {
    expect(buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", gmv: "45.610.277" })])], ...ALL)[0].directGmv).toBe(45_610_277);
  });

  test("có ₫ và dấu phẩy nghìn", () => {
    expect(buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", gmv: "143,887,012 ₫" })])], ...ALL)[0].directGmv).toBe(143_887_012);
  });

  test("ô rỗng/không đọc được ra 0, không ra NaN", () => {
    const r = buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", gmv: "", orders: "—" })])], ...ALL)[0];
    expect(r.directGmv).toBe(0);
    expect(r.orders).toBe(0);
  });

  test('thời lượng "2h 57min" ra 2,95 giờ và giờ kết thúc cộng đúng', () => {
    const r = buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", duration: "2h 57min" })])], ...ALL)[0];
    expect(r.durationHours).toBeCloseTo(2.95, 6);
    expect(r.timelineLabel).toBe("19:06 - 22:03");
  });

  test("phiên TikTok gộp nhiều ngày (74h 48min) vẫn ra số giờ thật, giờ kết thúc vắt sang ngày khác", () => {
    // TikTok gộp phiên nhiều ngày thành một dòng — đây chỉ là GỢI Ý, ops nhập tay đè lên.
    const r = buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", duration: "74h 48min" })])], ...ALL)[0];
    expect(r.durationHours).toBeCloseTo(74.8, 6);
    expect(r.timelineLabel).toBe("19:06 - 21:54");
  });

  test("thiếu hẳn cột thời lượng thì ra 0 giờ, không nổ", () => {
    const noDur = COLS.filter((c) => c.label !== "Thời lượng");
    const r = buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06" })], noDur)], ...ALL)[0];
    expect(r.durationHours).toBe(0);
    expect(r.timelineLabel).toBe("19:06 - 19:06");
  });
});

describe("CTR live tự tính, không lấy cột CTR của file", () => {
  test("clicks ÷ views × 100 — dải 45-70% như bảng ops, không phải CTR sản phẩm 3-5%", () => {
    const r = buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", views: 1000, clicks: 520, impressions: 12_000 })])], ...ALL)[0];
    expect(r.ctrLive).toBeCloseTo(52, 6);
  });

  test("views = 0 ra null, KHÔNG ra 0 — không có mẫu số khác hẳn tỉ lệ bằng 0", () => {
    expect(buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", views: 0, clicks: 0 })])], ...ALL)[0].ctrLive).toBeNull();
  });
});

describe("hai cờ bỏ tick sẵn trên UI", () => {
  test("nickname khớp handle shop ⇒ isShopAccount, so không phân biệt hoa thường và bỏ @", () => {
    const r = buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", nickname: "Crocs.OfficialStore" })])], ...ALL, "@crocs.officialstore")[0];
    expect(r.isShopAccount).toBe(true);
  });

  test("không truyền handle thì không dòng nào bị coi là shop", () => {
    expect(buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", nickname: "" })])], ...ALL)[0].isShopAccount).toBe(false);
  });

  test("0đ và 0 click ⇒ noBrandActivity (live riêng của creator lọt vào báo cáo)", () => {
    expect(buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", gmv: 0, clicks: 0, impressions: 89 })])], ...ALL)[0].noBrandActivity).toBe(true);
  });

  test("bán 0đ NHƯNG có click vẫn là phiên chạy thật ⇒ không gắn cờ", () => {
    expect(buildAffiliateRows([batch([row({ start: "2026/09/03/ 19:06", gmv: 0, clicks: 240 })])], ...ALL)[0].noBrandActivity).toBe(false);
  });
});

describe("batch hỏng không làm chết cả trang", () => {
  test("batch thiếu cột mốc (import nhầm report type) bị bỏ qua, batch còn lại vẫn ra", () => {
    const wrongType = batch([{ x: 1 }], [{ key: "x", label: "Tên sản phẩm" }]);
    const good = batch([row({ start: "2026/09/03/ 19:06" })]);
    expect(buildAffiliateRows([wrongType, good], ...ALL)).toHaveLength(1);
  });

  test("dòng không parse được giờ bắt đầu thì bỏ dòng đó, không bỏ cả batch", () => {
    const rows = buildAffiliateRows([batch([row({ start: "n/a" }), row({ start: "2026/09/03/ 19:06" })])], ...ALL);
    expect(rows).toHaveLength(1);
  });

  test("không có batch nào thì ra mảng rỗng", () => {
    expect(buildAffiliateRows([], ...ALL)).toEqual([]);
  });
});

test("xếp theo ngày rồi theo giờ bắt đầu", () => {
  const rows = buildAffiliateRows(
    [
      batch([
        row({ start: "2026/09/05/ 09:00", nickname: "a" }),
        row({ start: "2026/09/03/ 21:00", nickname: "b" }),
        row({ start: "2026/09/03/ 08:00", nickname: "c" })
      ])
    ],
    ...ALL
  );
  expect(rows.map((r) => `${r.date} ${r.timelineLabel.slice(0, 5)}`)).toEqual([
    "2026-09-03 08:00",
    "2026-09-03 21:00",
    "2026-09-05 09:00"
  ]);
});
