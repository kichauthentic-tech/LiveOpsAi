// Mọi tỷ lệ của một ca đều tính LẠI từ các cột đếm được (đã trừ theo snapshot), không bao giờ
// lấy cột tỷ lệ có sẵn trong file: file ghi tỷ lệ cộng dồn từ lúc mở room, nên với ca nối dùng
// chung room thì tỷ lệ trong file là của cả room chứ không phải của riêng ca này.

export interface SnapshotCounters {
  gmv: number;
  itemsSold: number;
  orders: number;
  skuOrders: number;
  views: number;
  impressions: number;
  productImpressions: number;
  productClicks: number;
  newFollowers: number;
  comments: number;
  shares: number;
  likes: number;
  durationMinutes: number;
}

// Công thức dưới đây được suy ngược rồi ĐỐI CHIẾU KHỚP TUYỆT ĐỐI với chính các cột tỷ lệ TikTok
// ghi sẵn trong file mẫu (xem ghi chú từng dòng) — đó cũng là lý do snapshot lưu nguyên cả 35
// cột: còn cột gốc thì còn kiểm chứng lại được mỗi khi nghi công thức sai.
export interface SnapshotRatios {
  aov: number; // GMV / đơn — khớp cột "AOV"
  gmvPerHour: number; // khớp cột "GMV per hour" (cần duration theo giây, xem extractRooms.ts)
  showGpm: number; // GMV / 1000 lượt hiển thị — khớp cột "Show GPM"
  watchGpm: number; // GMV / 1000 lượt xem
  tapThroughRate: number; // % lượt xem / hiển thị — khớp cột "Tap through rate"
  liveCtr: number; // % click sản phẩm / lượt xem — khớp cột "LIVE CTR"
  ctr: number; // % click sản phẩm / hiển thị sản phẩm — khớp cột "CTR"
  ctor: number; // % đơn / click sản phẩm — khớp cột "CTOR"
  ctorSkuOrders: number; // % đơn SKU / click sản phẩm — khớp cột "CTOR (SKU orders)"
  skuOrderRate: number; // % đơn SKU / lượt xem — khớp cột "SKU order rate"
  followRate: number;
  commentRate: number; // khớp cột "Comment rate"
  shareRate: number;
  likeRate: number;
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function per(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function computeSnapshotRatios(c: SnapshotCounters): SnapshotRatios {
  const hours = c.durationMinutes / 60;
  return {
    aov: per(c.gmv, c.orders),
    gmvPerHour: per(c.gmv, hours),
    showGpm: per(c.gmv, c.impressions / 1000),
    // Bản export mẫu ghi "Watch GPM" trùng y hệt "Show GPM" (cùng lỗi lặp với cặp "Avg. viewing
    // duration"), nên không đối chiếu xác minh được — dùng định nghĩa chuẩn GMV/1000 lượt xem.
    watchGpm: per(c.gmv, c.views / 1000),
    tapThroughRate: pct(c.views, c.impressions),
    liveCtr: pct(c.productClicks, c.views),
    ctr: pct(c.productClicks, c.productImpressions),
    ctor: pct(c.orders, c.productClicks),
    ctorSkuOrders: pct(c.skuOrders, c.productClicks),
    skuOrderRate: pct(c.skuOrders, c.views),
    // "Follow rate"/"Like rate" của TikTok chia cho một mẫu số KHÔNG có trong file (phiên mẫu:
    // 489 trong khi Views = 456), nên 2 tỷ lệ này cố tình tính trên lượt xem cho nhất quán với
    // phần còn lại và sẽ lệch nhẹ so với cột gốc — đừng "sửa" cho khớp, số gốc không tái tạo được.
    followRate: pct(c.newFollowers, c.views),
    commentRate: pct(c.comments, c.views),
    shareRate: pct(c.shares, c.views),
    likeRate: pct(c.likes, c.views)
  };
}

export function sumCounters(rows: SnapshotCounters[]): SnapshotCounters {
  return rows.reduce<SnapshotCounters>(
    (acc, r) => ({
      gmv: acc.gmv + r.gmv,
      itemsSold: acc.itemsSold + r.itemsSold,
      orders: acc.orders + r.orders,
      skuOrders: acc.skuOrders + r.skuOrders,
      views: acc.views + r.views,
      impressions: acc.impressions + r.impressions,
      productImpressions: acc.productImpressions + r.productImpressions,
      productClicks: acc.productClicks + r.productClicks,
      newFollowers: acc.newFollowers + r.newFollowers,
      comments: acc.comments + r.comments,
      shares: acc.shares + r.shares,
      likes: acc.likes + r.likes,
      durationMinutes: acc.durationMinutes + r.durationMinutes
    }),
    { gmv: 0, itemsSold: 0, orders: 0, skuOrders: 0, views: 0, impressions: 0, productImpressions: 0, productClicks: 0, newFollowers: 0, comments: 0, shares: 0, likes: 0, durationMinutes: 0 }
  );
}
