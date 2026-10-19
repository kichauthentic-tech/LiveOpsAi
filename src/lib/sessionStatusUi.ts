import { LiveSession } from "../types";

// U4 (audit 2026-09-21): một bảng nhãn/màu trạng thái ca dùng chung Sổ Ca, Bảng Vận Hành, Cửa sổ
// Ca Live (trước lặp ở 3 file). Thẻ lịch (SessionEventCard) dùng tone riêng theo màu brand.
export const SESSION_STATUS_LABEL_VI: Record<LiveSession["status"], string> = {
  "Live Now": "Đang live",
  Upcoming: "Sắp tới",
  Completed: "Đã xong",
  Cancelled: "Đã huỷ"
};

export const SESSION_STATUS_CLS: Record<LiveSession["status"], string> = {
  "Live Now": "bg-red-950 text-red-300 border-red-800",
  // Bố cục 18/10: "Sắp tới" không phải cảnh báo — trước tô cùng màu vàng với "chưa up file / chưa giao ca", cả cột trạng thái
  // của Sổ Ca thành một dải vàng và cảnh báo thật chìm mất.
  Upcoming: "bg-sky-950/60 text-sky-300 border-sky-800/70",
  Completed: "bg-emerald-950 text-emerald-300 border-emerald-800",
  Cancelled: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
};
