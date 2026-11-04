// Xếp lại giỏ live: gõ số thứ tự mới cho một sản phẩm (vd đang #20 muốn lên #1 ⇒ gõ 1), các sản phẩm còn lại dồn chỗ và cả giỏ
// được đánh số lại 1..n liền mạch. Trả về CHỈ những dòng đổi số để ghi DB.
export interface BasketItem {
  id: string;
  pinOrder: number;
}

export function planReorder(basket: BasketItem[], id: string, target: number): { id: string; pinOrder: number }[] {
  const order = [...basket].sort((a, b) => a.pinOrder - b.pinOrder).map((b) => b.id);
  const from = order.indexOf(id);
  if (from < 0 || !Number.isFinite(target)) return [];
  const to = Math.min(order.length, Math.max(1, Math.round(target))) - 1;
  order.splice(to, 0, order.splice(from, 1)[0]);
  const before = new Map(basket.map((b) => [b.id, b.pinOrder]));
  return order.map((oid, i) => ({ id: oid, pinOrder: i + 1 })).filter((p) => before.get(p.id) !== p.pinOrder);
}
