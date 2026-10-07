// Nạp bù ca từ file Creator-Live-Performance (src/lib/backfill/roomsToSessions.ts) — 219 dòng thuần,
// chưa test nào chạm tới (đo 2026-10-01). Đây là đường đưa ca đã live THẬT vào app (229/229 ca CROCS
// hiện có đều vào bằng đường này) và là lưới ops gán Host/Trợ live hàng loạt cho chúng.
//
// Chỗ dễ sai nhất và là lỗi tìm được đợt này: `buildHostGrid` xếp thứ tự ca trong ngày bằng
// `(actualStartAt ?? startTime)` — trộn ISO timestamp với chuỗi "HH:MM" trong cùng một phép so sánh.
import { expect, test } from "vitest";
import {
  LONG_ROOM_MINUTES,
  buildHostGrid,
  copyFromPreviousMonth,
  currentAssignment,
  diffAssignments,
  fillByWeekday,
  planBackfill,
  prevMonthOf,
  roomIdsLinkedToSessions,
  roomToPayload,
  sessionWindows,
  hasOverlappingSession,
  type DraftAssignments
} from "../src/lib/backfill/roomsToSessions";
import { CreatorLivePerfRow } from "../src/lib/dataraw/creatorLivePerfSlice";
import { LiveSession } from "../src/types";

const B = "brand-crocs";

function row(roomId: string | undefined, startTime: string, endTime: string | undefined, extra: Partial<CreatorLivePerfRow> = {}): CreatorLivePerfRow {
  return {
    roomId,
    roomTitle: "Live",
    startTime,
    endTime,
    hours: 2,
    gmv: 1000,
    itemsSold: 1,
    orders: 1,
    skuOrders: 1,
    customers: 1,
    aov: 1000,
    views: 100,
    impressions: 100,
    gmvPerHour: 500,
    avgViewDurationSec: 60,
    liveCtr: 0.1,
    productImpressions: 10,
    productClicks: 1,
    ctr: 0.1,
    ctor: 0.1,
    newFollowers: 1,
    comments: 1,
    shares: 1,
    likes: 1,
    ...extra
  } as CreatorLivePerfRow;
}

function ses(id: string, date: string, startTime: string, extra: Partial<LiveSession> = {}): LiveSession {
  return {
    id,
    title: id,
    brandId: B,
    brandName: "CROCS",
    shopTikTokHandle: "",
    monthPublished: true,
    studioId: "",
    studioName: "",
    hostId: "",
    hostName: "",
    assistantName: "",
    coHostName: "",
    platform: "TikTok",
    date,
    startTime,
    endTime: "23:00",
    status: "Completed",
    targetGmv: 0,
    actualGmv: 0,
    totalOrders: 0,
    avgWatchTimeSeconds: 0,
    peakViewers: 0,
    totalViews: 0,
    ctrAvg: 0,
    cvrAvg: 0,
    ...extra
  } as LiveSession;
}

// ── roomToPayload / planBackfill ──────────────────────────────────────────────────────────────────

test("room thiếu roomId/startTime/endTime là không hợp lệ", () => {
  expect(roomToPayload(row(undefined, "2026-09-10T01:00:00Z", "2026-09-10T03:00:00Z"))).toBeNull();
  expect(roomToPayload(row("r1", "2026-09-10T01:00:00Z", undefined))).toBeNull();
});

test("duration lấy hiệu End−Start chứ không lấy cột Duration (file làm tròn xuống phút)", () => {
  const p = roomToPayload(row("r1", "2026-09-10T01:00:00Z", "2026-09-10T03:30:30Z", { hours: 2 }))!;
  expect(p.duration_minutes).toBe(150.5);
});

test("End ≤ Start (dữ liệu hỏng) thì rơi về cột hours", () => {
  const p = roomToPayload(row("r1", "2026-09-10T03:00:00Z", "2026-09-10T01:00:00Z", { hours: 1.5 }))!;
  expect(p.duration_minutes).toBe(90);
});

test("planBackfill: bỏ room đã gắn ca, bỏ room trùng trong file, đếm room hỏng", () => {
  const rows = [
    row("r1", "2026-09-10T01:00:00Z", "2026-09-10T03:00:00Z"),
    row("r1", "2026-09-10T01:00:00Z", "2026-09-10T03:00:00Z"), // lặp: ops up 2 batch chồng ngày
    row("r2", "2026-09-11T01:00:00Z", "2026-09-11T03:00:00Z"),
    row(undefined, "2026-09-12T01:00:00Z", "2026-09-12T03:00:00Z")
  ];
  const plan = planBackfill(rows, new Set(["r2"]));
  expect(plan.toCreate.map((p) => p.room_id)).toEqual(["r1"]);
  expect(plan.existing).toBe(1);
  expect(plan.invalid).toBe(1);
});

test("room dài bất thường được gắn cờ để ops tách sau khi sinh", () => {
  const long = row("r-long", "2026-09-10T00:00:00Z", "2026-09-10T06:00:00Z"); // 6h
  const ok = row("r-ok", "2026-09-11T00:00:00Z", "2026-09-11T02:00:00Z");
  const plan = planBackfill([long, ok], new Set());
  expect(plan.longRooms.map((p) => p.room_id)).toEqual(["r-long"]);
  expect(LONG_ROOM_MINUTES).toBe(300);
});

test("roomIdsLinkedToSessions gom cả tiktokRoomId lẫn liveRoomIds, chỉ của đúng brand", () => {
  const sessions = [
    ses("a", "2026-09-10", "09:00", { tiktokRoomId: "r1", liveRoomIds: ["r2", "r3"] }),
    ses("b", "2026-09-11", "09:00", { tiktokRoomId: "r9", brandId: "brand-vera" })
  ];
  expect([...roomIdsLinkedToSessions(sessions, B)].sort()).toEqual(["r1", "r2", "r3"]);
});

// ── buildHostGrid ─────────────────────────────────────────────────────────────────────────────────

const colIds = (sessions: LiveSession[], month = "2026-09") =>
  buildHostGrid(sessions, B, month).rows.map((r) => r.cells.map((c) => c?.session.id ?? null));

test("buildHostGrid gom theo ngày, bỏ ca huỷ và ca brand/tháng khác, chèn ô trống cho đủ cột", () => {
  const sessions = [
    ses("d10-a", "2026-09-10", "09:00"),
    ses("d10-b", "2026-09-10", "14:00"),
    ses("d11-a", "2026-09-11", "09:00"),
    ses("huy", "2026-09-11", "20:00", { status: "Cancelled" }),
    ses("brand-khac", "2026-09-11", "20:00", { brandId: "brand-vera" }),
    ses("thang-khac", "2026-08-11", "20:00")
  ];
  const g = buildHostGrid(sessions, B, "2026-09");
  expect(g.columns).toBe(2);
  expect(g.rows.map((r) => r.date)).toEqual(["2026-09-10", "2026-09-11"]);
  expect(g.rows[1].cells).toEqual([expect.objectContaining({ col: 0 }), null]);
  expect(g.rows[0].weekday).toBe(4); // 10/09/2026 là thứ Năm
});

test("thứ tự ca khi CẢ NGÀY đều chưa đối soát (chỉ có giờ kế hoạch)", () => {
  expect(colIds([ses("muon", "2026-09-10", "14:00"), ses("som", "2026-09-10", "06:00")])).toEqual([["som", "muon"]]);
});

test("thứ tự ca khi CẢ NGÀY đều đã đối soát (có giờ live thật)", () => {
  const sessions = [
    ses("muon", "2026-09-10", "14:00", { actualStartAt: "2026-09-10T07:05:00+00:00" }), // 14:05 VN
    ses("som", "2026-09-10", "06:00", { actualStartAt: "2026-09-10T00:10:00+00:00" }) // 07:10 VN
  ];
  expect(colIds(sessions)).toEqual([["som", "muon"]]);
});

test("giờ live THẬT thắng giờ kế hoạch khi ca chạy lệch lịch", () => {
  // Cả hai đều đã đối soát: ca lịch 09:00 thật ra lên sóng 15:00, ca lịch 14:00 lên sóng 08:00.
  const sessions = [
    ses("lich-09-that-15", "2026-09-10", "09:00", { actualStartAt: "2026-09-10T08:00:00+00:00" }),
    ses("lich-14-that-08", "2026-09-10", "14:00", { actualStartAt: "2026-09-10T01:00:00+00:00" })
  ];
  expect(colIds(sessions)).toEqual([["lich-14-that-08", "lich-09-that-15"]]);
});

test("NGÀY TRỘN: ca đã đối soát và ca chưa phải xếp theo GIỜ, không theo việc có số liệu hay chưa", () => {
  // `actual_start_at` là timestamptz (ISO đầy đủ) còn `startTime` là "HH:MM" — so hai định dạng này
  // với nhau là so định dạng chứ không so thời gian: MỌI "HH:MM" đứng trước MỌI chuỗi ISO. Mà cột đó
  // được ghi cho mọi ca đã nạp snapshot/đối soát (0078/0080), không riêng ca nạp bù, nên ngày trộn là
  // trạng thái bình thường giữa tháng. Sai thứ tự ⇒ cột "Ca 1/Ca 2" lệch ⇒ "Điền theo thứ" và "Sao
  // chép tháng trước" gán người vào nhầm ca.
  const sessions = [
    ses("chua-doi-soat-09h", "2026-09-10", "09:00"),
    ses("da-doi-soat-06h", "2026-09-10", "06:00", { actualStartAt: "2026-09-09T23:00:00+00:00" }) // 06:00 VN
  ];
  expect(colIds(sessions)).toEqual([["da-doi-soat-06h", "chua-doi-soat-09h"]]);
});

test("NGÀY TRỘN, chiều ngược lại: ca chưa đối soát đi SAU nếu nó muộn hơn", () => {
  const sessions = [
    ses("da-doi-soat-22h", "2026-09-10", "22:00", { actualStartAt: "2026-09-10T15:00:00+00:00" }), // 22:00 VN
    ses("chua-doi-soat-21h", "2026-09-10", "21:00")
  ];
  expect(colIds(sessions)).toEqual([["chua-doi-soat-21h", "da-doi-soat-22h"]]);
});

// ── gán host ──────────────────────────────────────────────────────────────────────────────────────

test("fillByWeekday chỉ đụng đúng cột và đúng các thứ đã chọn", () => {
  const sessions = [
    ses("t5-ca1", "2026-09-10", "09:00"), // thứ Năm
    ses("t5-ca2", "2026-09-10", "14:00"),
    ses("t6-ca1", "2026-09-11", "09:00") // thứ Sáu
  ];
  const grid = buildHostGrid(sessions, B, "2026-09");
  const next = fillByWeekday(grid, {}, { weekdays: new Set([4]), col: 0, hostId: "t-an", onlyEmpty: false });
  expect(next["t5-ca1"]).toEqual({ hostId: "t-an", coHostId: "" });
  expect(next["t5-ca2"]).toBeUndefined();
  expect(next["t6-ca1"]).toBeUndefined();
});

test("onlyEmpty không đè ca ops đã gán tay", () => {
  const sessions = [ses("a", "2026-09-10", "09:00", { hostId: "t-cu" }), ses("b", "2026-09-17", "09:00")];
  const grid = buildHostGrid(sessions, B, "2026-09");
  const next = fillByWeekday(grid, {}, { weekdays: new Set([4]), col: 0, hostId: "t-moi", onlyEmpty: true });
  expect(next["a"].hostId).toBe("t-cu");
  expect(next["b"].hostId).toBe("t-moi");
});

test("copyFromPreviousMonth khớp theo (thứ, cột) và lấy cặp xuất hiện nhiều nhất", () => {
  const prev = buildHostGrid(
    [
      ses("p1", "2026-08-06", "09:00", { hostId: "t-an", coHostId: "t-binh" }), // thứ Năm
      ses("p2", "2026-08-13", "09:00", { hostId: "t-an", coHostId: "t-binh" }),
      ses("p3", "2026-08-20", "09:00", { hostId: "t-cuong", coHostId: "" })
    ],
    B,
    "2026-08"
  );
  const grid = buildHostGrid([ses("n1", "2026-09-10", "09:00")], B, "2026-09");
  const next = copyFromPreviousMonth(grid, prev, {}, false);
  expect(next["n1"]).toEqual({ hostId: "t-an", coHostId: "t-binh" });
});

test("copyFromPreviousMonth bỏ qua ô tháng trước chưa gán ai", () => {
  const prev = buildHostGrid([ses("p1", "2026-08-06", "09:00")], B, "2026-08");
  const grid = buildHostGrid([ses("n1", "2026-09-10", "09:00", { hostId: "t-giu" })], B, "2026-09");
  expect(copyFromPreviousMonth(grid, prev, {}, false)["n1"]).toBeUndefined();
});

test("diffAssignments chỉ gửi ca THỰC SỰ đổi, và đổi về rỗng thì gửi null", () => {
  const sessions = [
    ses("khong-doi", "2026-09-10", "09:00", { hostId: "t-an", coHostId: "t-binh" }),
    ses("doi", "2026-09-11", "09:00", { hostId: "t-an" }),
    ses("xoa", "2026-09-12", "09:00", { hostId: "t-an", coHostId: "t-binh" })
  ];
  const draft: DraftAssignments = {
    "khong-doi": { hostId: "t-an", coHostId: "t-binh" },
    doi: { hostId: "t-cuong", coHostId: "" },
    xoa: { hostId: "", coHostId: "" },
    "khong-ton-tai": { hostId: "t-x", coHostId: "" }
  };
  expect(diffAssignments(sessions, draft)).toEqual([
    { session_id: "doi", host_id: "t-cuong", co_host_id: null },
    { session_id: "xoa", host_id: null, co_host_id: null }
  ]);
});

test("currentAssignment quy undefined về chuỗi rỗng", () => {
  expect(currentAssignment(ses("a", "2026-09-10", "09:00"))).toEqual({ hostId: "", coHostId: "" });
});

test("prevMonthOf lùi đúng, kể cả qua năm", () => {
  expect(prevMonthOf("2026-09")).toBe("2026-08");
  expect(prevMonthOf("2026-01")).toBe("2025-12");
});

// ── Không sinh/tách ca chồng lên ca có sẵn (07/10) ────────────────────────────────────────────────
// Ca T10 đã nạp bằng file lịch (chưa có Room ID, chưa có snapshot giữa ca). Room 20:00–02:00 chạy xuyên 2 ca có sẵn:
// sinh ca hay tách ca đều tạo ca THỪA chồng lên ca kế hoạch — phải để Đối soát chia số vào 2 ca đó.
test("planBackfill: room chồng giờ ca có sẵn thì KHÔNG sinh ca, chỉ đếm 'overlapping'", () => {
  // 13/10 20:00 → 14/10 02:00 (giờ VN) = 13:00Z → 19:00Z
  const room = row("r-xuyen", "2026-10-13T13:00:00Z", "2026-10-13T19:00:00Z");
  const free = row("r-trong", "2026-10-15T13:00:00Z", "2026-10-15T15:00:00Z");
  const caA = ses("A", "2026-10-13", "20:00", { endTime: "23:00" });
  const caB = ses("B", "2026-10-13", "23:00", { endTime: "02:00" }); // qua nửa đêm
  const plan = planBackfill([room, free], new Set(), sessionWindows([caA, caB], B));
  expect(plan.toCreate.map((p) => p.room_id)).toEqual(["r-trong"]);
  expect(plan.overlapping).toBe(1);
});

test("sessionWindows: bỏ ca huỷ và ca brand khác; ca qua nửa đêm kết thúc sang ngày sau", () => {
  const w = sessionWindows(
    [ses("ok", "2026-10-13", "23:00", { endTime: "02:00" }), ses("huy", "2026-10-13", "10:00", { status: "Cancelled" }), ses("khac", "2026-10-13", "10:00", { brandId: "brand-khac" })],
    B
  );
  expect(w.map((x) => x.id)).toEqual(["ok"]);
  expect(w[0].endMs - w[0].startMs).toBe(3 * 3600 * 1000);
});

test("chạm mép không tính chồng giờ (room kết thúc đúng lúc ca sau bắt đầu)", () => {
  // room 18:00–20:00 VN, ca có sẵn bắt đầu 20:00
  const room = row("r-mep", "2026-10-13T11:00:00Z", "2026-10-13T13:00:00Z");
  const plan = planBackfill([room], new Set(), sessionWindows([ses("A", "2026-10-13", "20:00")], B));
  expect(plan.toCreate).toHaveLength(1);
  expect(plan.overlapping).toBe(0);
});

test("hasOverlappingSession: ca nạp bù dài có ca khác chồng giờ thì không được tách", () => {
  const long = ses("long", "2026-10-13", "20:00", { endTime: "02:00", isBackfill: true, actualStartAt: "2026-10-13T13:00:00Z", actualEndAt: "2026-10-13T19:00:00Z" });
  const next = ses("next", "2026-10-13", "23:00", { endTime: "02:00" });
  expect(hasOverlappingSession(long, sessionWindows([long, next], B))).toBe(true);
  expect(hasOverlappingSession(long, sessionWindows([long], B))).toBe(false);
});
