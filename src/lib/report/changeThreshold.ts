// Quy tắc đọc thay đổi của Report Tháng (user chốt 27/11/2026): chỉ số đổi từ 10% trở lên so với tháng trước thì được tô và
// nêu trong câu kết luận — áp cho mọi bảng, kể cả bảng ít phiên. Thay ngưỡng dao động theo CV phiên trước đó.
// Phễu LIVE ở Dashboard có luật riêng (channelHealth.noiseBand).

export const CHANGE_THRESHOLD_PCT = 10;

/** So trên số làm tròn tới 1% — ô hiện "10%" luôn là ô được tô. */
export const isBigChange = (change: number | null | undefined): boolean => change != null && Math.round(Math.abs(change)) >= CHANGE_THRESHOLD_PCT;
