// Lý do đổi lịch chọn nhanh (21/11, user: "làm nhanh đi"): đổi người / dời giờ ca chưa diễn ra vẫn ghi lý do vào
// nhật ký roster_changes, nhưng KHÔNG bắt gõ — có sẵn lựa chọn mặc định, bấm một nút là xong; muốn ghi riêng thì gõ đè.
// (feedback: không thêm ô nhập bắt buộc cho nhân viên.) Lựa chọn đầu tiên là mặc định.

export const DEFAULT_CHANGE_REASON = "Xếp lại lịch";

const PEOPLE = [DEFAULT_CHANGE_REASON, "Talent báo bận", "Talent ốm", "Talent đổi ca cho nhau", "Brand yêu cầu"];
const TIME = [DEFAULT_CHANGE_REASON, "Brand đổi khung live", "Trùng phòng", "Talent báo bận"];

/** Lựa chọn theo loại thay đổi; đổi cả người lẫn giờ thì gộp, không lặp. */
export function changeReasonChoices(peopleChanged: boolean, timeChanged: boolean): string[] {
  const list = [...(peopleChanged || !timeChanged ? PEOPLE : []), ...(timeChanged ? TIME : [])];
  return [...new Set(list)];
}

/** Lý do sẽ ghi: chữ người dùng gõ/chọn, trống thì lấy mặc định. */
export const effectiveChangeReason = (typed: string): string => typed.trim() || DEFAULT_CHANGE_REASON;
