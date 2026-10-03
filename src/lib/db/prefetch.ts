// Nạp trước dữ liệu riêng của một màn, rồi GIAO ĐÚNG MỘT LẦN cho lần mount đầu của màn đó.
//
// VẤN ĐỀ ĐO ĐƯỢC (2026-10-03, bản build production, Dashboard CROCS): màn chỉ mount sau cổng
// `coreDataReady` (đợt nạp chung ~24 request), rồi mới bắn lượt đọc riêng của nó — plan tháng, Dữ Liệu
// Gốc… Tức là một vòng mạng nối tiếp SAU đợt chung, dù tham số (brand, tháng hiện tại) đã biết ngay
// khi có `profile`. App gọi `prefetch` lúc biết tab; màn gọi `take` trong effect mount.
//
// VÌ SAO KHÔNG PHẢI CACHE (cùng lý do dedupeInFlight.ts không cache): đường GHI như Kế Hoạch Tháng lưu
// xong thì đọc lại để lấy bản mới — một cache có hạn dùng sẽ trả bản CŨ. Ở đây:
//   - kết quả bị XOÁ ngay khi được lấy — lần đọc thứ hai (đổi tháng rồi quay lại, lưu xong nạp lại) luôn
//     đi mạng thật;
//   - chỉ effect MOUNT của đúng màn được nạp trước mới gọi `take`; các đường đọc-sau-khi-ghi gọi thẳng
//     hàm db như cũ, không đi qua đây;
//   - App xoá sạch kho mỗi lần đổi tab (`dropPrefetched`), và kết quả quá MAX_AGE_MS thì bỏ — nên một
//     lượt nạp trước không bao giờ sống qua lúc người dùng có thể đã sửa gì ở màn khác.
// Hai lời gọi `take` cùng key thì chỉ cái đầu nhận bản nạp trước; cái sau đi mạng — đừng để hai
// component cùng `take` một key, hãy truyền dữ liệu xuống (như BrandDashboard → OpsSupport).

import type { UserRole } from "../../types";

/** App truyền vào hàm `prefetch…` của từng màn: brand đang xem (nếu là tab brand) và role — `undefined` khi
 *  `profile` chưa về; màn tự quyết nạp gì khi chưa biết role (thường: coi như ops, sai thì chỉ phí request). */
export interface TabPrefetchCtx {
  brandId?: string;
  role?: UserRole;
}

const MAX_AGE_MS = 30_000;
const parked = new Map<string, { p: Promise<unknown>; at: number }>();

export function prefetch(key: string, run: () => Promise<unknown>): void {
  if (parked.has(key)) return;
  const p = run();
  p.catch(() => {}); // lỗi để `take` trả lại cho màn tự xử lý; ở đây chỉ chặn unhandled rejection
  parked.set(key, { p, at: Date.now() });
}

export function takePrefetched<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = parked.get(key);
  parked.delete(key);
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.p as Promise<T>;
  return run();
}

export function dropPrefetched(): void {
  parked.clear();
}

/** Một lượt đọc nạp-trước được: `key` dựng từ tên + tham số ở ĐÚNG MỘT chỗ để bên nạp và bên lấy không lệch. */
export function prefetchable<A extends unknown[], T>(name: string, run: (...args: A) => Promise<T>) {
  const key = (args: A) => `${name}|${args.join("|")}`;
  return {
    prefetch: (...args: A) => prefetch(key(args), () => run(...args)),
    take: (...args: A) => takePrefetched(key(args), () => run(...args))
  };
}
