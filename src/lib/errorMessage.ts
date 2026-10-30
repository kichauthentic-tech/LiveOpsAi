// Lỗi ném ra từ supabase-js KHÔNG phải instance của Error — PostgrestError là object thường
// { message, details, hint, code }. Vì vậy `e instanceof Error ? e.message : String(e)` rơi vào
// nhánh String() và hiện đúng chữ "[object Object]" trên màn hình, nuốt mất thông tin duy nhất
// giúp chẩn đoán. Mọi chỗ bắt lỗi của tầng dữ liệu phải đi qua hàm này.
export function errorMessage(e: unknown, fallback = "Đã có lỗi xảy ra."): string {
  return withCurrentScreenNames(rawErrorMessage(e, fallback));
}

// Trigger DB (0133/0138/0139) còn nhắc màn "Điều Phối Phát Hành" — màn này đã gộp vào Toàn Cảnh Brand (23/10).
// Sửa chữ ở đây thay vì viết lại thân hàm SQL dài; mọi lỗi từ tầng dữ liệu đều đi qua errorMessage.
function withCurrentScreenNames(text: string): string {
  return text.replace(/Điều Phối Phát Hành/g, "Toàn Cảnh Brand (cột Report Tháng)");
}

function rawErrorMessage(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === "string" && o.message) parts.push(o.message);
    // details/hint của Postgres thường là thứ nói ra nguyên nhân thật (vi phạm ràng buộc nào,
    // thiếu quyền ở đâu), message gốc chỉ nói chung chung.
    if (typeof o.details === "string" && o.details && o.details !== o.message) parts.push(o.details);
    if (typeof o.hint === "string" && o.hint) parts.push(o.hint);
    if (parts.length > 0) {
      const code = typeof o.code === "string" && o.code ? ` (${o.code})` : "";
      return parts.join(" — ") + code;
    }
  }
  return fallback;
}
