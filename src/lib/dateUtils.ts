// Ngày/tháng "hôm nay" theo giờ LOCAL của máy người dùng (VN = UTC+7).
//
// Không dùng `new Date().toISOString().slice(0, 10)`: `toISOString()` trả giờ UTC, nên từ 00:00
// đến 07:00 giờ VN nó trả về NGÀY HÔM TRƯỚC — lịch sẽ highlight nhầm ô "Hôm nay" và mọi so sánh
// `dateStr <= todayDate` (đã live / chưa live) lệch một ngày. Mọi cột ngày trong DB
// (`live_sessions.date`, `shift_slots.date`...) đều là ngày local dạng "YYYY-MM-DD".
export const getTodayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

export const getTodayMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

// So 2 khoảng "HH:MM"–"HH:MM" có chồng nhau không. Coi khoảng kết thúc <= bắt đầu là ca qua
// nửa đêm (end sang ngày hôm sau, +1440 phút) — khớp với sessionDurationHours ở lib/pnl.ts.
// So sánh chuỗi thô kiểu `aStart < bEnd && bStart < aEnd` sai với ca qua đêm vì "02:00" luôn
// nhỏ hơn mọi giờ khác trong ngày, nên ca 22:00–02:00 không bao giờ bị coi là trùng lịch.
export const timeRangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean => {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const aStartM = toMinutes(aStart);
  let aEndM = toMinutes(aEnd);
  if (aEndM <= aStartM) aEndM += 24 * 60;
  const bStartM = toMinutes(bStart);
  let bEndM = toMinutes(bEnd);
  if (bEndM <= bStartM) bEndM += 24 * 60;
  return aStartM < bEndM && bStartM < aEndM;
};
