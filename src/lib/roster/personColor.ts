import type { Talent } from "../../types";

// Màu cố định cho từng người trên lịch Điều Phối (theo cách trainer tô ô tên trên Google Sheet): thấy màu là nhận ra người,
// cùng một người cùng màu ở cả cột host lẫn trợ, ở mọi tuần. Cặp nền/chữ chọn sẵn để đủ tương phản; không phụ thuộc theme.

export interface PersonColor {
  bg: string;
  fg: string;
}

const PALETTE: PersonColor[] = [
  { bg: "#fde5a0", fg: "#7a5f1e" },
  { bg: "#36714f", fg: "#d9f2c4" },
  { bg: "#e0d3f2", fg: "#5b3a8f" },
  { bg: "#9b86cf", fg: "#1b1b1b" },
  { bg: "#335c6e", fg: "#c7dbe5" },
  { bg: "#e0e04c", fg: "#111111" },
  { bg: "#d8aedb", fg: "#111111" },
  { bg: "#c6e0f5", fg: "#2457a6" },
  { bg: "#7f98f5", fg: "#111111" },
  { bg: "#4a3a26", fg: "#f6e3a1" },
  { bg: "#f8d9ae", fg: "#111111" },
  { bg: "#86e38a", fg: "#111111" },
  { bg: "#2454a6", fg: "#d6e4ff" },
  { bg: "#b92f8e", fg: "#ffffff" },
  { bg: "#d9ebc0", fg: "#3a8a50" },
  { bg: "#62c1d6", fg: "#111111" },
  { bg: "#4a9a8a", fg: "#111111" },
  { bg: "#6fc9b0", fg: "#2f6b57" },
  { bg: "#cfd9df", fg: "#335c6e" },
  { bg: "#5a3a85", fg: "#f3e6ff" },
  { bg: "#e8a09a", fg: "#5a1d18" },
  { bg: "#ffd966", fg: "#5a4300" },
  { bg: "#a8d8ea", fg: "#1d4a63" },
  { bg: "#c9a46b", fg: "#2b1d08" }
];

/** Ô "No Asst" (ca chủ ý không trợ) — xám đậm như trên sheet. */
export const NO_ASSISTANT_COLOR: PersonColor = { bg: "#3d3d3d", fg: "#ffffff" };

/** Gán màu theo thứ tự id đã sắp (ổn định khi đổi tên/thêm bớt hiển thị): 24 người đầu mỗi người một màu, sau đó mới lặp lại. */
export function buildPersonColors(talents: readonly Pick<Talent, "id">[]): ReadonlyMap<string, PersonColor> {
  const out = new Map<string, PersonColor>();
  [...talents].sort((a, b) => a.id.localeCompare(b.id)).forEach((t, i) => out.set(t.id, PALETTE[i % PALETTE.length]));
  return out;
}
