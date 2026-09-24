// Đ12 (2026-09-24) — "mượn HÌNH DẠNG toàn agency, MỨC do ops nhập".
// Chạy: npm test    (chỉ file này: npx vitest run tests/suggestEngineBorrowed.test.ts)
//
// Điều PHẢI đúng: tỷ lệ giữa các ô (= hình dạng) giữ y nguyên của agency, còn mức tuyệt đối
// bằng đúng con số ops nhập. Sai một trong hai là hỏng cả ý nghĩa của phương án B.
import { expect, test } from "vitest";
import { LiveSession } from "../src/types";
import { SuggestConstraints, buildHistory, buildBorrowedHistory, suggestMonthPlan, ALL_BRANDS } from "../src/lib/scheduling/suggestEngine";

const mk = (id: string, brandId: string, date: string, start: string, end: string, gmv: number): LiveSession =>
  ({
    id, title: "", brandId, brandName: brandId, hostId: "h", hostName: "H", platform: "TikTok",
    date, startTime: start, endTime: end, status: "Completed", monthPublished: true,
    dataSource: "tiktok_reconciled", actualGmv: gmv, totalOrders: 10, avgWatchTimeSeconds: 0,
    peakViewers: 0, totalViews: 1000, ctrAvg: 0, cvrAvg: 0
  }) as LiveSession;

// "CROCS" có lịch sử; "VERA" không có ca nào. Ca sáng yếu, ca tối mạnh gấp 3 — đó là HÌNH DẠNG.
const sessions: LiveSession[] = [];
for (let d = 1; d <= 24; d++) {
  const day = `2026-08-${`${d}`.padStart(2, "0")}`;
  sessions.push(mk(`m${d}`, "crocs", day, "09:00", "12:00", 30_000_000));  // 10tr/giờ
  sessions.push(mk(`e${d}`, "crocs", day, "19:00", "22:00", 90_000_000));  // 30tr/giờ
}

const ok = (name: string, cond: boolean, extra = "") =>
  test(name, () => { expect(cond, extra).toBe(true); });
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const ASOF = "2026-09-24";
const CTX = {};

// Ràng buộc có KIỂU thật. Bản đầu tôi viết `{targetHours, slotHours} as never` — hai tên đó không
// tồn tại (`committedHours`/`defaultSlotHours` mới đúng) và `as never` nuốt luôn lỗi, làm engine
// xếp 0 ca vì thiếu ràng buộc chứ không phải vì lịch sử. Test "lịch sử rỗng → 0 ca" khi đó PASS
// vì lý do sai hoàn toàn. Bỏ mọi ép kiểu ở đây là cách duy nhất để tsc còn canh hộ.
const C: SuggestConstraints = {
  month: "2026-10",
  today: ASOF,
  committedHours: 60,
  targetGmv: 0,
  mode: "hours",
  liveWindowStart: "08:00",
  liveWindowEnd: "23:00",
  defaultSlotHours: 3,
  maxSlotsPerDay: 2,
  blackoutDates: [],
  strategy: "balanced"
};

// 1) Tình trạng trước khi sửa: VERA tay trắng, engine trả rỗng.
const veraHist = buildHistory(sessions, "vera", ASOF, CTX);
ok("VERA thật sự không có lịch sử", veraHist.sessions === 0 && veraHist.brandGmvPerHour === 0);
const veraSuggest = suggestMonthPlan(veraHist, C);
ok("engine với lịch sử rỗng → 0 ca (đúng hiện trạng Đ12)", veraSuggest.slots.length === 0);

// 2) Mượn: mức phải ĐÚNG BẰNG con số nhập.
const LEVEL = 5_000_000; // ops nhập 5tr/giờ — thấp hơn hẳn agency
const agency = buildHistory(sessions, ALL_BRANDS, ASOF, CTX);
const borrowed = buildBorrowedHistory(sessions, ASOF, CTX, LEVEL, "(test)")!;
ok("có dựng được lịch sử mượn", !!borrowed);
ok("mức = đúng con số ops nhập", near(borrowed.brandGmvPerHour, LEVEL), `got ${borrowed.brandGmvPerHour}`);
ok("mức agency KHÁC mức nhập (nếu bằng nhau thì test vô nghĩa)", !near(agency.brandGmvPerHour, LEVEL));

// 3) HÌNH DẠNG giữ nguyên: tỷ lệ giữa mọi cặp ô phải y hệt agency.
const k = LEVEL / agency.brandGmvPerHour;
const byKey = new Map(agency.cells.map((c) => [`${c.weekday}|${c.block}`, c]));
let shapeOk = true, worst = "";
for (const c of borrowed.cells) {
  const a = byKey.get(`${c.weekday}|${c.block}`)!;
  if (!near(c.gmvPerHour, a.gmvPerHour * k, 1e-9)) { shapeOk = false; worst = `${c.weekday}|${c.block}: ${c.gmvPerHour} vs ${a.gmvPerHour * k}`; }
}
ok("mọi ô scale cùng một hệ số → tỷ lệ giữa các ô không đổi", shapeOk, worst);
// Tỷ lệ ô mạnh/ô yếu phải BẰNG của agency. Cố ý không so với con số 3 tuyệt đối như bản đầu:
// engine có shrinkage (kéo ô ít quan sát về TB brand) nên 3 lần ở dữ liệu thô ra ~1,8 sau khi học —
// đó là hành vi đúng của engine, không liên quan gì tới việc mượn. So với agency mới đúng câu hỏi.
const ratioOf = (cells: typeof borrowed.cells) => {
  const t = [...cells].filter((c) => c.n >= 2).sort((a, b) => b.gmvPerHour - a.gmvPerHour);
  return t.length >= 2 ? t[0].gmvPerHour / t[t.length - 1].gmvPerHour : 0;
};
const rB = ratioOf(borrowed.cells), rA = ratioOf(agency.cells);
ok("tỷ lệ ô mạnh/ô yếu y hệt agency (hình dạng sống sót)", rA > 1 && near(rB, rA, 1e-9), `mượn ${rB.toFixed(3)} vs agency ${rA.toFixed(3)}`);

// 4) Cột KHÔNG phải tiền thì không được đụng.
const viewsSame = borrowed.cells.every((c) => near(c.viewsPerHour, byKey.get(`${c.weekday}|${c.block}`)!.viewsPerHour, 1e-9));
ok("viewsPerHour giữ nguyên (không suy ra được từ mức tiền)", viewsSame);

// 5) Nhãn trung thực + độ tin cậy bị kẹp.
ok("có cờ borrowedFrom", !!borrowed.borrowedFrom && borrowed.borrowedFrom.brands === 1);
ok("enough = false dù agency 48 ca", borrowed.enough === false);
const bs = suggestMonthPlan(borrowed, C);
ok("giờ xếp được ca (đường cụt của Đ12 đã mở)", bs.slots.length > 0, `slots=${bs.slots.length}`);
ok("độ tin cậy kẹp ở 'low'", bs.confidence === "low", bs.confidence);
ok("note nói rõ đang MƯỢN", bs.notes.some((n) => /mượn HÌNH DẠNG/i.test(n)), JSON.stringify(bs.notes));
ok("note nói rõ MỨC là giả định của người", bs.notes.some((n) => /GIẢ ĐỊNH của bạn/i.test(n)));

// 6) Dự báo tỷ lệ thuận với mức nhập — gấp đôi mức thì gấp đôi tiền, không đổi số ca.
const borrowed2 = buildBorrowedHistory(sessions, ASOF, CTX, LEVEL * 2, "(test)")!;
const bs2 = suggestMonthPlan(borrowed2, C);
ok("gấp đôi mức → dự báo gấp đôi", near(bs2.forecastGmv, bs.forecastGmv * 2, 1e-6), `${bs2.forecastGmv} vs ${bs.forecastGmv * 2}`);
ok("gấp đôi mức → SỐ CA không đổi (mức không được đổi hình dạng)", bs2.slots.length === bs.slots.length);

// 7) Brand CÓ lịch sử thì không bao giờ bị mượn đè — MonthPlan chỉ mượn khi coldStart.
const crocsHist = buildHistory(sessions, "crocs", ASOF, CTX);
ok("brand có lịch sử vẫn dùng lịch sử thật", crocsHist.brandGmvPerHour > 0 && !crocsHist.borrowedFrom);

// 8) Cả agency cũng trắng → không mượn được của ai, phải trả null chứ không bịa.
ok("agency trắng → trả null", buildBorrowedHistory([], ASOF, CTX, LEVEL, "(test)") === null);
ok("mức <= 0 → trả null", buildBorrowedHistory(sessions, ASOF, CTX, 0, "(test)") === null);

