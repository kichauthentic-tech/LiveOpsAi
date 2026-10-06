// Chọn phòng của ca khi up file Creator-Live-Performance (file cả ngày nhiều phòng). Dữ liệu = cấu trúc file VERA 06/10 thật:
// hai phòng liền nhau 10:10–11:45 / 11:45–13:00 (một ca tắt/bật lại stream) và một phòng tối 19:03–22:05.
// Chạy: npx vitest run tests/roomSelection.test.ts
import { describe, expect, test } from "vitest";
import { classifyRooms, sessionWindow, sumRooms } from "../src/lib/liveSnapshot/roomSelection";
import type { SnapshotRoomRow } from "../src/lib/liveSnapshot/extractRooms";

const room = (roomId: string, s: string, e: string | undefined, gmv: number, orders: number, views: number): SnapshotRoomRow =>
  ({ roomId, startedAt: `2026-10-06T${s}+07:00`, endedAt: e ? `2026-10-06T${e}+07:00` : undefined, durationMinutes: 0, gmv, orders, views, raw: {} }) as SnapshotRoomRow;

const rows = [
  room("A", "10:10:43", "11:45:02", 1_347_078, 4, 503),
  room("B", "11:45:31", "13:00:59", 1_770_848, 6, 584),
  room("C", "19:03:12", "22:05:01", 5_204_704, 16, 1279)
];
const ca = (startTime: string, endTime: string) => ({ date: "2026-10-06", startTime, endTime });
const ids = (cs: ReturnType<typeof classifyRooms>, f: (c: (typeof cs)[number]) => boolean) => cs.filter(f).map((c) => c.row.roomId);

describe("gợi ý phòng theo giờ ca", () => {
  test("ca tối chỉ gợi ý phòng tối; hai phòng sáng nằm ngoài ca", () => {
    const cs = classifyRooms(rows, sessionWindow(ca("19:00", "22:00")));
    expect(ids(cs, (c) => c.suggested)).toEqual(["C"]);
    expect(ids(cs, (c) => !c.inWindow)).toEqual(["A", "B"]);
  });
  test("ca bị tắt/bật lại stream: cả hai phòng liền nhau đều được gợi ý", () => {
    const cs = classifyRooms(rows, sessionWindow(ca("10:00", "13:00")));
    expect(ids(cs, (c) => c.suggested)).toEqual(["A", "B"]);
  });
  test("phòng chỉ chạm rìa ca (<50%) nằm trong ca nhưng KHÔNG tick sẵn", () => {
    const cs = classifyRooms(rows, sessionWindow(ca("12:30", "15:00")));
    const b = cs.find((c) => c.row.roomId === "B")!;
    expect(b.inWindow).toBe(true);
    expect(b.suggested).toBe(false);
    expect(b.overlapShare).toBeLessThan(0.5);
  });
  test("số lúc đổi host: cửa sổ cắt ở phút đổi, phòng bắt đầu sau đó bị loại", () => {
    // ca 10:00–13:00, host đổi lúc 11:45 (phút 105): phòng B bắt đầu 11:45:31 > 11:45 ⇒ ngoài cửa sổ.
    const cs = classifyRooms(rows, sessionWindow(ca("10:00", "13:00"), 105));
    expect(ids(cs, (c) => c.suggested)).toEqual(["A"]);
    expect(cs.find((c) => c.row.roomId === "B")!.inWindow).toBe(false);
  });
  test("ca qua đêm: cửa sổ kéo sang ngày hôm sau", () => {
    const w = sessionWindow(ca("22:00", "00:30"));
    expect(w.endMs - w.startMs).toBe(150 * 60000);
  });
  test("phòng chưa kết thúc (đang live) được tính là còn chạy", () => {
    const live = room("D", "21:00:00", undefined, 1, 1, 1);
    const cs = classifyRooms([live], sessionWindow(ca("20:30", "23:00")), Date.parse("2026-10-06T21:30:00+07:00"));
    expect(cs[0].suggested).toBe(true);
  });
});

describe("tổng các phòng đã chọn", () => {
  test("cộng GMV / đơn / view", () => {
    expect(sumRooms(rows.slice(0, 2))).toEqual({ rooms: 2, gmv: 3_117_926, orders: 10, views: 1087 });
  });
});
