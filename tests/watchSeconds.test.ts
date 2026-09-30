import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { watchSecondsOf } from "../src/lib/liveSnapshot/extractRooms";
import { addKeyInput, emptyKeyCounts, keyMetrics, type KeyInput } from "../src/lib/report/keyMetrics";

// Avg. view ("Avg. viewing duration" trong file Creator-Live-Performance) là TỶ LỆ giây/lượt xem,
// không phải số đếm. Migration 0124 lưu `watch_seconds = avg × views` để trừ/cộng được giữa các
// lần up; ở đây canh phần TS của cùng quy tắc đó. Phần SQL có bộ kiểm riêng chạy trên Postgres
// thật — xem supabase/tests/README.md.

describe("watchSecondsOf", () => {
  test("nhân ngược trung bình thành đại lượng cộng được", () => {
    expect(watchSecondsOf(26.74, 12485)).toBe(333849); // dòng thật trong file đối soát CROCS
    expect(watchSecondsOf(30, 1000)).toBe(30000);
  });

  test("thiếu số thì trả 0 chứ không trả NaN — 0 là tín hiệu 'không biết' mà 0124 dựa vào để KHÔNG ghi đè", () => {
    expect(watchSecondsOf(0, 1000)).toBe(0);
    expect(watchSecondsOf(30, 0)).toBe(0);
    expect(watchSecondsOf(NaN, 1000)).toBe(0);
    expect(watchSecondsOf(30, Number.POSITIVE_INFINITY)).toBe(0);
    expect(watchSecondsOf(-5, 1000)).toBe(0);
  });
});

describe("gộp Avg. view của nhiều ca", () => {
  const input = (avgViewSec: number, views: number): KeyInput => ({
    gmv: 0, itemsSold: 0, orders: 0, views, hours: 1, impressions: 0, productImpressions: 0, productClicks: 0, avgViewSec
  });

  test("keyMetrics gộp bằng trung bình CÓ TRỌNG SỐ theo views, đúng luật mà 0124 cài trong SQL", () => {
    const c = emptyKeyCounts();
    addKeyInput(c, input(30, 1000));
    addKeyInput(c, input(50, 3000));
    // Trung bình cộng thường ra 40; đúng phải là (30×1000 + 50×3000) / 4000 = 45.
    expect(keyMetrics(c).avgViewSec).toBe(45);
    expect(keyMetrics(c).avgViewSec).toBe(
      (watchSecondsOf(30, 1000) + watchSecondsOf(50, 3000)) / (1000 + 3000)
    );
  });

  test("ca chưa có Avg. view bị BỎ QUA, không bị tính là 0 giây", () => {
    const c = emptyKeyCounts();
    addKeyInput(c, input(30, 1000));
    addKeyInput(c, input(0, 9000)); // ca chạy trong app trước 0124
    expect(keyMetrics(c).avgViewSec).toBe(30);

    // Mọi ca đều thiếu ⇒ null ("—"), không phải 0. Đây là lý do lỗi này không làm SAI số trên
    // report, chỉ làm MẤT chỉ số: cả tháng toàn ca chạy trong app là Avg. view biến thành "—".
    const empty = emptyKeyCounts();
    addKeyInput(empty, input(0, 9000));
    expect(keyMetrics(empty).avgViewSec).toBeNull();
  });
});

test("đường đọc file phải đẩy watchSeconds xuống RPC, nếu không cột vẫn kẹt ở 0", () => {
  const src = readFileSync(join(__dirname, "../src/lib/liveSnapshot/extractRooms.ts"), "utf8");
  expect(src).toMatch(/watchSeconds: watchSecondsOf\(r\.avgViewDurationSec, r\.views\)/);
  // Cả 2 đường nạp file (snapshot lúc giao ca + đối soát cuối kỳ) dùng chung parseSnapshotFile,
  // nên chỉ cần 1 chỗ — nhưng phải chắc là đối soát vẫn đi qua đó.
  const recon = readFileSync(join(__dirname, "../src/lib/db/liveReconciliation.ts"), "utf8");
  expect(recon).toMatch(/parseSnapshotFile/);

  for (const f of ["0124_avg_view_duration_from_file.sql"]) {
    const sql = readFileSync(join(__dirname, "../supabase/migrations", f), "utf8");
    // Không được chia trực tiếp số trung bình của file; phải chia lại từ giây xem đã cộng/trừ.
    expect(sql).toMatch(/avg_watch_time_seconds = case\s*\n?\s*when [ad]\.watch_seconds > 0/);
  }
});
