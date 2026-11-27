import { createContext, useContext, useEffect, useId } from "react";

// Sổ các khung Insight sửa tay đang CŨ hơn bản chụp số liệu (audit 27/11). DemoInsight trên màn ops tự ghi tên trang vào
// đây khi đang hiện; BrandMonthlyReport đọc để chặn Phát hành / Tải bản gửi brand. Bản dựng ẩn để xuất file chạy với
// canManage=false nên không ghi vào sổ.
export type StaleInsightRegistry = (id: string, label: string | null) => void;
export const StaleInsightContext = createContext<StaleInsightRegistry | null>(null);

export function useRegisterStaleInsight(stale: boolean, label: string | undefined): void {
  const register = useContext(StaleInsightContext);
  const id = useId();
  useEffect(() => {
    if (!register) return;
    register(id, stale ? label ?? "1 trang" : null);
    return () => register(id, null);
  }, [register, id, stale, label]);
}

/** Câu chặn: liệt kê trang theo thứ tự đã ghi, bỏ trùng. */
export function staleInsightBlocker(labels: string[]): string | null {
  const uniq = [...new Set(labels)];
  if (!uniq.length) return null;
  return (
    `Insight sửa tay ở trang ${uniq.join(", ")} cũ hơn số liệu đang chốt — chữ còn giữ số trước lần "Cập nhật số liệu". ` +
    `Mở từng trang, đọc lại rồi bấm "Đã đọc lại, giữ bản sửa" (sửa số nếu cần) hoặc "Khôi phục bản gốc", sau đó phát hành / tải file.`
  );
}
