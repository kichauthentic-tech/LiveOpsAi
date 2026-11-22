// Nạp lại bảng "đọc trọn" theo phần đã đổi (egress 22/11) — dùng cho shift_slots và session_availability, hai bảng App giữ
// trọn trong state và trước đây tải lại TRỌN (~1,4 MB) sau mỗi lần công bố / mở đăng ký / chốt kế hoạch ở Điều Phối.
//
// Cách làm (cùng ý với danh sách ca, sessions.ts): giữ kho thô theo id + mốc dấu thời gian lớn nhất đã thấy. Lượt làm mới
// chỉ hỏi dòng có dấu > mốc − 2 phút, gộp vào kho, rồi so SỐ DÒNG với server (HEAD count=exact, không có thân):
// - dòng bị xoá ⇒ kho còn dòng đó ⇒ lệch ⇒ trả null, nơi gọi tải trọn;
// - dòng thêm/sửa mà lượt hỏi phần đổi không thấy (giao dịch mở > 2 phút) ⇒ cũng lệch khi có xoá đi kèm; chỉ sửa thuần
//   thì không bắt được — biên 2 phút là đủ cho RPC của app (đều xong trong vài giây).
// Hàm thuần, không đụng supabaseClient — test ở tests/deltaTable.test.ts.

export interface DeltaStore<R> {
  byId: Map<string, R>;
  /** Dấu thời gian lớn nhất đã thấy (ISO từ Postgres) — null khi bảng rỗng lúc nạp trọn. */
  mark: string | null;
}

export const DELTA_MARGIN_MS = 2 * 60_000;

/** Mốc hỏi phần đổi: mốc − 2 phút (now() của Postgres là giờ BẮT ĐẦU giao dịch, ghi xong có thể muộn hơn). */
export function deltaSince(mark: string | null): string {
  if (!mark) return "1970-01-01T00:00:00Z";
  const t = Date.parse(mark);
  return Number.isFinite(t) ? new Date(t - DELTA_MARGIN_MS).toISOString() : "1970-01-01T00:00:00Z";
}

const later = (a: string | null, b: string | null | undefined): string | null => {
  if (!b) return a;
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
};

/**
 * Gộp các dòng đổi vào kho. `stampOf` đọc dấu thời gian của dòng, `strip` bỏ cột dấu nếu kho không giữ nó.
 * Trả null khi số dòng sau gộp ≠ số dòng server ⇒ nơi gọi tải trọn.
 */
export function mergeDelta<R extends { id: string }, C extends R>(
  store: DeltaStore<R>,
  changed: C[],
  serverCount: number | null,
  stampOf: (row: C) => string | null | undefined,
  strip: (row: C) => R
): DeltaStore<R> | null {
  const byId = new Map(store.byId);
  let mark = store.mark;
  for (const row of changed) {
    byId.set(row.id, strip(row));
    mark = later(mark, stampOf(row));
  }
  if (serverCount === null || serverCount !== byId.size) return null;
  return { byId, mark };
}

/** Mốc lớn nhất trong một lô dòng (dùng sau khi nạp trọn nếu lô có cột dấu). */
export function maxStamp<C>(rows: C[], stampOf: (row: C) => string | null | undefined): string | null {
  let mark: string | null = null;
  for (const r of rows) mark = later(mark, stampOf(r));
  return mark;
}
