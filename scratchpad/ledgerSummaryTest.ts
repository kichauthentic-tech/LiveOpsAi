// Đ11 (2026-09-24) — "số ca đã xảy ra" của Toàn Cảnh Brand.
// Chạy: npx tsx scratchpad/ledgerSummaryTest.ts
//
// Không verify được trên production: cả 229 ca thật đều là ca nạp bù ở quá khứ, nên
// upcoming = 0 ở mọi dòng và bản sửa vô hình. Test này dựng đúng tình huống đã bắt được lỗi
// (VERA: 1 ca đã chạy + 1 ca 25/09 chưa tới → bảng hiện "2 ca").
import { LiveSession } from "../src/types";
import { summarize, hasHappened } from "../src/lib/sessionLedger";

const TODAY = "2026-09-24";

const mk = (over: Partial<LiveSession>): LiveSession =>
  ({
    id: over.id ?? "x",
    title: "",
    brandId: "b1",
    brandName: "VERA",
    hostId: "h1",
    hostName: "Host",
    platform: "TikTok",
    date: "2026-09-20",
    startTime: "09:00",
    endTime: "12:00",
    status: "Completed",
    monthPublished: true,
    actualGmv: 0,
    totalOrders: 0,
    avgWatchTimeSeconds: 0,
    peakViewers: 0,
    totalViews: 0,
    ctrAvg: 0,
    cvrAvg: 0,
    ...over
  }) as LiveSession;

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};

// --- hasHappened từng trường hợp ---
eq("ca quá khứ Completed = đã xảy ra", hasHappened(mk({ date: "2026-09-20" }), TODAY), true);
eq("ca tương lai Upcoming = chưa", hasHappened(mk({ date: "2026-09-25", status: "Upcoming" }), TODAY), false);
eq("ca huỷ (quá khứ) = không tính", hasHappened(mk({ date: "2026-09-20", status: "Cancelled" }), TODAY), false);
eq("ca huỷ (tương lai) = không tính", hasHappened(mk({ date: "2026-09-25", status: "Cancelled" }), TODAY), false);
eq("ca HÔM NAY đang live = đã xảy ra", hasHappened(mk({ date: TODAY, status: "Live Now" }), TODAY), true);
eq("ca HÔM NAY chưa tới giờ = chưa", hasHappened(mk({ date: TODAY, status: "Upcoming" }), TODAY), false);
// Ca ĐÃ CHẠY mà chưa nạp số: `countable` bỏ nó, `happened` thì không — đây là chỗ hai con số
// buộc phải khác nhau, và cũng là lý do không dùng lại isCountable cho cột số ca.
eq("ca đã chạy chưa nạp số vẫn = đã xảy ra", hasHappened(mk({ date: "2026-09-20", actualGmv: 0, totalViews: 0 }), TODAY), true);

// --- Đúng tình huống VERA đã bắt lỗi ---
const vera = [
  mk({ id: "a", date: "2026-09-23", status: "Completed", actualGmv: 72_500_000, totalViews: 1000 }),
  mk({ id: "b", date: "2026-09-25", status: "Upcoming" })
];
const s = summarize(vera, TODAY);
eq("VERA: happened = 1 (KHÔNG phải 2)", s.happened, 1);
eq("VERA: upcoming = 1", s.upcoming, 1);
eq("VERA: total vẫn = 2 (Sổ Ca dùng con số này)", s.total, 2);
eq("VERA: countable = 1", s.countable, 1);
eq("VERA: gmv không đổi", s.gmv, 72_500_000);

// --- Ca huỷ không được rơi vào upcoming ---
const withCancel = summarize(
  [
    mk({ id: "a", date: "2026-09-20", actualGmv: 1, totalViews: 1 }),
    mk({ id: "b", date: "2026-09-25", status: "Upcoming" }),
    mk({ id: "c", date: "2026-09-26", status: "Cancelled" })
  ],
  TODAY
);
eq("ca huỷ không tính vào upcoming", [withCancel.happened, withCancel.upcoming, withCancel.total], [1, 1, 3]);

// --- Toàn bộ quá khứ (đúng data CROCS thật): happened phải bằng total ---
const crocs = summarize(
  Array.from({ length: 47 }, (_, i) => mk({ id: `c${i}`, date: "2026-09-10", actualGmv: 1, totalViews: 1 })),
  TODAY
);
eq("CROCS toàn ca nạp bù: happened == total, upcoming 0", [crocs.happened, crocs.total, crocs.upcoming], [47, 47, 0]);

console.log(fail === 0 ? "\nTất cả PASS" : `\n${fail} test FAIL`);
process.exit(fail === 0 ? 0 : 1);
