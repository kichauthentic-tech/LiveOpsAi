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
