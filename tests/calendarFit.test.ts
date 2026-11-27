import { expect, test } from "vitest";
import { addDays, mondayOf, shortTime, visibleDayCount, windowDays } from "../src/lib/calendarFit";

test("Lịch Tuần: số ngày hiện theo bề rộng lưới, PC giữ 7 như cũ", () => {
  expect(visibleDayCount(0)).toBe(7); // chưa đo ⇒ như cũ
  expect(visibleDayCount(296)).toBe(2); // điện thoại 360px
  expect(visibleDayCount(620)).toBe(4); // tablet 768px
  expect(visibleDayCount(880)).toBe(6); // laptop 1024px
  expect(visibleDayCount(912)).toBe(7); // 1280px (xl) — production đang chạy 7 cột ~126px
  expect(visibleDayCount(5000)).toBe(7);
  expect(visibleDayCount(50)).toBe(1);
});

test("khung ngày: đủ 7 ⇒ T2–CN của tuần; ít hơn ⇒ ngày liền nhau từ ngày đầu, qua tháng/năm đúng", () => {
  expect(windowDays("2026-11-26", 7)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
  expect(windowDays("2026-11-29", 3)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(mondayOf("2026-11-29")).toBe("2026-11-23"); // CN thuộc tuần bắt đầu T2 trước đó
});

test("giờ gọn trên ô Lịch Tháng hẹp", () => {
  expect(shortTime("18:00")).toBe("18h");
  expect(shortTime("21:30")).toBe("21h30");
  expect(shortTime("09:00")).toBe("9h");
});
