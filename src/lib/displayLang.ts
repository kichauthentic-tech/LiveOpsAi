// Ngôn ngữ hiển thị — tiếng Việt cho cả app; tiếng Anh CHỈ khi Report Tháng bật nút EN (05/11: brand cần report tiếng Anh).
// Một biến của module thay vì truyền `lang` qua ~200 hàm dựng câu ở lib/report: chỉ BrandMonthlyReport được đổi biến này,
// đổi xong thì dựng lại cả cây report (key theo ngôn ngữ, nên mọi useMemo tính lại) và trả về "vi" khi rời màn report.
// Ngoài màn đó biến luôn là "vi" ⇒ phần còn lại của app và mọi test chạy y như trước.

export type DisplayLang = "vi" | "en";

let current: DisplayLang = "vi";

export const displayLang = (): DisplayLang => current;
export const isEn = (): boolean => current === "en";

export function setDisplayLang(lang: DisplayLang): void {
  current = lang;
}

/** Chữ theo ngôn ngữ đang hiện: `t("Tổng quan", "Overview")`. Viết cặp ngay tại chỗ dùng để sửa câu Việt là thấy câu Anh. */
export const t = (vi: string, en: string): string => (current === "en" ? en : vi);

/** Locale định dạng số: vi-VN "1,2B · 4,5%" / en-US "1.2B · 4.5%". */
export const numLocale = (): string => (current === "en" ? "en-US" : "vi-VN");

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Tháng ngắn: "T10" / "Oct". Nhận "YYYY-MM" hoặc số tháng 1–12. */
export function monthShort(month: string | number): string {
  const m = typeof month === "number" ? month : Number(month.slice(5, 7));
  return current === "en" ? EN_MONTHS[m - 1] ?? String(m) : `T${m}`;
}

/** Tên tháng dài: "Tháng 10" / "October". */
export function monthLong(month: string | number): string {
  const m = typeof month === "number" ? month : Number(month.slice(5, 7));
  return current === "en" ? new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" }) : `Tháng ${m}`;
}

/**
 * Bảng hằng (nhãn, tên chỉ số…) dựng theo ngôn ngữ: `byLang(() => ({ daily: t("Ngày thường", "Regular days") }))`.
 * Trả về một Proxy đọc bản của ngôn ngữ đang hiện (mỗi ngôn ngữ dựng một lần), nên chỗ dùng vẫn viết `X.daily`, `X.map(...)`,
 * `{ ...X }` như hằng thường. `shape` = `[]` cho bảng dạng mảng (để Array.isArray và .map đúng).
 */
export function byLang<T extends object>(build: () => T, shape: object = {}): T {
  const cache: Partial<Record<DisplayLang, T>> = {};
  const cur = (): T => (cache[current] ??= build());
  return new Proxy(shape, {
    get: (_o, k) => Reflect.get(cur(), k),
    has: (_o, k) => Reflect.has(cur(), k),
    ownKeys: () => Reflect.ownKeys(cur()),
    getOwnPropertyDescriptor: (_o, k) => {
      const d = Reflect.getOwnPropertyDescriptor(cur(), k);
      // `length` của mảng là thuộc tính không-configurable của chính `shape` — phải báo đúng như vậy (luật bất biến của Proxy).
      return d && k === "length" && Array.isArray(shape) ? { ...d, configurable: false } : d && { ...d, configurable: true };
    }
  }) as T;
}
