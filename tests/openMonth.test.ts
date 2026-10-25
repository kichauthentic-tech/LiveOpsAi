// Điều Phối Lịch Live bản gọn — đợt 2 (25/10): khung giờ tuần mẫu → cả tháng, khớp giờ cần mở, dán từ Sheet, chép tuần trước.
import { expect, test } from "vitest";
import { copyPrevWeekFrames, expandPattern, fitToHours, parsePastedSchedule, totalHours, weekPattern } from "../src/lib/roster/openMonth";
import type { LiveSession, ShiftSlot } from "../src/types";

const ses = (id: string, date: string, start: string, end: string, extra: Partial<LiveSession> = {}): LiveSession =>
  ({ id, title: id, brandId: "b1", brandName: "VERA", platform: "TikTok", date, startTime: start, endTime: end, status: "Completed", targetGmv: 0, actualGmv: 0, ...extra }) as LiveSession;
const slot = (id: string, date: string, start: string, end: string, extra: Partial<ShiftSlot> = {}): ShiftSlot =>
  ({ id, date, startTime: start, endTime: end, brandId: "b1", brandName: "VERA", platform: "TikTok", studioName: "", notes: "", status: "open", ...extra }) as ShiftSlot;

// Hôm nay CN 25/10/2026 ⇒ tuần đủ gần nhất = 19/10–25/10? Không: tuần chứa hôm nay chưa xong ⇒ mẫu lấy từ 12/10 trở về.
const TODAY = "2026-10-25";

test("tuần mẫu = tuần đủ gần nhất đạt ≥ 80% tuần đông nhất; bỏ ca huỷ, ca loại khỏi báo cáo, kênh/sàn khác, bỏ trùng hệt", () => {
  const sessions = [
    ses("a", "2026-10-12", "19:00", "22:00"), // T2
    ses("b", "2026-10-14", "10:00", "13:00"), // T4
    ses("c", "2026-10-14", "10:00", "13:00"), // trùng hệt
    ses("x", "2026-10-15", "19:00", "22:00", { status: "Cancelled" }),
    ses("y", "2026-10-16", "19:00", "22:00", { excludedFromReports: true }),
    ses("z", "2026-10-13", "19:00", "22:00", { platform: "Shopee" }),
    ses("w", "2026-10-05", "19:00", "22:00") // tuần 05/10 chỉ 1 ca
  ];
  const p = weekPattern(sessions, [slot("o", "2026-10-18", "21:00", "00:00")], "b1", "TikTok", TODAY);
  expect(p.weekStart).toBe("2026-10-12");
  expect(p.frames).toEqual([
    { weekday: 0, startTime: "19:00", endTime: "22:00" },
    { weekday: 2, startTime: "10:00", endTime: "13:00" },
    { weekday: 6, startTime: "21:00", endTime: "00:00" }
  ]);
  expect(weekPattern([], [], "b1", "TikTok", TODAY).frames).toEqual([]);
  // Tuần cũ đông hơn hẳn (5 ca) thắng tuần gần (2 ca < 80%); tuần gần đủ 80% thì tuần gần thắng.
  const old = Array.from({ length: 5 }, (_, i) => ses(`o${i}`, "2026-09-21", `${10 + i * 2}:00`, `${11 + i * 2}:00`));
  const near = [ses("n1", "2026-10-12", "19:00", "22:00"), ses("n2", "2026-10-13", "19:00", "22:00")];
  expect(weekPattern([...old, ...near], [], "b1", "TikTok", TODAY).weekStart).toBe("2026-09-21");
  const near4 = [...near, ses("n3", "2026-10-14", "19:00", "22:00"), ses("n4", "2026-10-15", "19:00", "22:00")];
  expect(weekPattern([...old, ...near4], [], "b1", "TikTok", TODAY).weekStart).toBe("2026-10-12");
});

test("trải ra tháng 11/2026 theo thứ: 5 Thứ 2, 4 Thứ 4, 5 Chủ nhật", () => {
  const p = { weekStart: "2026-10-12", frames: [{ weekday: 0, startTime: "19:00", endTime: "22:00" }, { weekday: 2, startTime: "10:00", endTime: "13:00" }, { weekday: 6, startTime: "21:00", endTime: "00:00" }] };
  const all = expandPattern(p, "2026-11");
  expect(all.filter((f) => f.startTime === "19:00").map((f) => f.date)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  expect(all.length).toBe(5 + 4 + 5);
  expect(totalHours(all)).toBe(14 * 3); // ca 21:00–00:00 tính 3 giờ
});

test("khớp giờ: dư thì bỏ ở ngày đông ca, thiếu thì thêm khung hay dùng vào ngày ít ca, không đè ca khác", () => {
  const p = { weekStart: "2026-10-12", frames: [{ weekday: 0, startTime: "19:00", endTime: "22:00" }, { weekday: 0, startTime: "10:00", endTime: "13:00" }] };
  const base = expandPattern(p, "2026-11"); // 10 ca × 3 giờ = 30 giờ
  const less = fitToHours(base, 20, p, "2026-11");
  expect(totalHours(less)).toBeGreaterThanOrEqual(20);
  expect(totalHours(less)).toBeLessThan(23);
  const more = fitToHours(base, 60, p, "2026-11");
  expect(totalHours(more)).toBeGreaterThanOrEqual(60);
  expect(totalHours(more)).toBeLessThan(63);
  for (const a of more) for (const b of more) if (a !== b) expect(a.date === b.date && a.startTime === b.startTime).toBe(false);
  // Kênh mới (không mẫu) vẫn có khung mặc định.
  const fresh = fitToHours([], 30, { frames: [] }, "2026-11");
  expect(totalHours(fresh)).toBe(30);
});

test("dán từ Sheet: nhiều kiểu viết, chỉ nhận tháng đang mở, bỏ trùng, đếm dòng bỏ qua", () => {
  const text = ["02/11 19:00-22:00", "3/11/2026\t10h00\t13h00", "04/11 20:00 – 23:00", "05/12 19:00-22:00", "ghi chú", "02/11 19:00-22:00", "06/11 21:00-24:00"].join("\n");
  const r = parsePastedSchedule(text, "2026-11");
  expect(r.frames).toEqual([
    { date: "2026-11-02", startTime: "19:00", endTime: "22:00" },
    { date: "2026-11-03", startTime: "10:00", endTime: "13:00" },
    { date: "2026-11-04", startTime: "20:00", endTime: "23:00" },
    { date: "2026-11-06", startTime: "21:00", endTime: "00:00" }
  ]);
  expect(r.skipped).toBe(2);
});

test("chép khung giờ tuần trước: cùng thứ, từ hôm nay, bỏ khung đè ca đã có cùng kênh, không chép người", () => {
  const sessions = [
    ses("p1", "2026-10-19", "19:00", "22:00", { hostId: "h1" }), // T2 ⇒ 26/10
    ses("p2", "2026-10-20", "10:00", "13:00"), // T3 ⇒ 27/10 nhưng đã có ca 11–14 cùng kênh
    ses("p3", "2026-10-21", "10:00", "13:00", { brandId: "b2", brandName: "CROCS" }), // T4 ⇒ 28/10 kênh khác
    ses("now", "2026-10-27", "11:00", "14:00", { status: "Upcoming" })
  ];
  const out = copyPrevWeekFrames(sessions, [], "2026-10-26", "2026-10-26");
  expect(out.map((o) => `${o.brandName} ${o.date} ${o.startTime}`)).toEqual(["VERA 2026-10-26 19:00", "CROCS 2026-10-28 10:00"]);
  expect(copyPrevWeekFrames(sessions, [], "2026-10-26", "2026-10-27").length).toBe(1); // 26/10 đã qua
});
