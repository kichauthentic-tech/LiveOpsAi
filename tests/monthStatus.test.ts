// Điều Phối Lịch Live bản gọn (25/10): trạng thái tháng (Mở ca → Đăng ký → Xếp người → Công bố → Live) + một kết luận giờ mỗi kênh.
import { expect, test } from "vitest";
import { channelVerdict, monthStatus, type MonthStatusInput } from "../src/lib/roster/monthStatus";
import type { NowHours } from "../src/lib/roster/monthDesk";
import type { LiveSession, ShiftRegistration, ShiftSlot } from "../src/types";

const slot = (id: string, date: string, extra: Partial<ShiftSlot> = {}): ShiftSlot =>
  ({ id, date, startTime: "19:00", endTime: "22:00", brandId: "b1", brandName: "VERA", platform: "TikTok", studioName: "", notes: "", status: "open", ...extra }) as ShiftSlot;
const ses = (id: string, date: string, status: LiveSession["status"] = "Upcoming"): LiveSession =>
  ({ id, title: id, brandId: "b1", brandName: "VERA", platform: "TikTok", date, startTime: "19:00", endTime: "22:00", status, targetGmv: 0, actualGmv: 0 }) as LiveSession;
const reg = (slotId: string, talentId: string): ShiftRegistration => ({ id: `${slotId}-${talentId}`, slotId, talentId, registeredAt: "2026-10-26T00:00:00Z" });

const base = (x: Partial<MonthStatusInput>): MonthStatusInput => ({
  month: "2026-11",
  today: "2026-10-25",
  now: "2026-10-25T10:00:00.000Z",
  sessions: [],
  slots: [],
  registrations: [],
  drafts: [],
  weeks: [],
  ...x
});

test("tháng chưa có ca nào = Chưa mở ca; tháng chứa hôm nay = Live; tháng trước = Đã qua", () => {
  expect(monthStatus(base({})).phase).toBe("none");
  expect(monthStatus(base({})).steps).toEqual(["cur", "todo", "todo", "todo", "todo"]);
  const live = monthStatus(base({ month: "2026-10" }));
  expect(live.phase).toBe("live");
  expect(live.steps).toEqual(["done", "done", "done", "done", "cur"]);
  expect(monthStatus(base({ month: "2026-09" })).phase).toBe("past");
});

test("có ca mở mà chưa đặt hạn → no_deadline; hạn còn ở tương lai → đang nhận đăng ký, đếm ca có người + số người", () => {
  const slots = [slot("a", "2026-11-02"), slot("b", "2026-11-03"), slot("c", "2026-11-04"), slot("x", "2026-12-01")];
  expect(monthStatus(base({ slots })).phase).toBe("no_deadline");
  const st = monthStatus(base({ slots, deadline: "2026-10-30T10:00:00.000Z", registrations: [reg("a", "t1"), reg("a", "t2"), reg("b", "t1"), reg("x", "t9")] }));
  expect(st.phase).toBe("signup");
  expect(st.openSlots).toBe(3);
  expect(st.slotsWithSignup).toBe(2);
  expect(st.signedPeople).toBe(2); // t9 báo rảnh ca tháng 12, không tính
  expect(st.steps).toEqual(["done", "cur", "todo", "todo", "todo"]);
});

test("qua hạn còn ca chưa host → đang xếp người; đủ host nháp → chờ công bố theo tuần; công bố hết → xong", () => {
  const slots = [slot("a", "2026-11-02"), slot("b", "2026-11-10")];
  const deadline = "2026-10-24T10:00:00.000Z";
  const staff = monthStatus(base({ slots, deadline, registrations: [reg("b", "t1")], drafts: [{ slotId: "a", hostId: "t3" }] }));
  expect(staff.phase).toBe("staff");
  expect(staff.noHost).toBe(1);
  expect(staff.noHostWithSignup).toBe(1);
  const drafts = [
    { slotId: "a", hostId: "t3" },
    { slotId: "b", hostId: "t1" }
  ];
  const pub = monthStatus(base({ slots, deadline, drafts, weeks: [{ weekStart: "2026-11-02", publishedAt: "2026-10-25T00:00:00Z" }] as never }));
  expect(pub.phase).toBe("publish");
  expect(pub.weeksToPublish).toEqual(["2026-11-09"]);
  // Ca nhập sẵn (không ca mở) cũng là "xong"; ca huỷ không đếm.
  const done = monthStatus(base({ sessions: [ses("s1", "2026-11-02"), ses("s2", "2026-11-03", "Cancelled")] }));
  expect(done.phase).toBe("done");
  expect(done.sessions).toBe(1);
});

test("hạn đã đặt nhưng chưa có ca mở nào chưa người → không kẹt ở đăng ký", () => {
  const st = monthStatus(base({ slots: [slot("a", "2026-11-02")], drafts: [{ slotId: "a", hostId: "t1" }], deadline: "2026-10-30T10:00:00.000Z" }));
  expect(st.phase).toBe("publish");
});

const h = (x: Partial<NowHours>): NowHours => ({ committed: 250, delivered: 147, deliveredPlanned: 150, estimated: 0, scheduled: 50, open: 0, remaining: 103, needScheduled: 112, extra: 62, buffer: 9, shortByReason: {}, ...x });

test("một kết luận giờ mỗi kênh: thiếu / thêm là kịp target / dư / đủ / không nói gì", () => {
  expect(channelVerdict(h({}), null)).toEqual({ tone: "bad", text: "thiếu ~62 giờ", add: 62 });
  expect(channelVerdict(null, 6)).toEqual({ tone: "bad", text: "thêm ~6 giờ là kịp target", add: 6 });
  expect(channelVerdict(h({ extra: -9 }), null)).toEqual({ tone: "muted", text: "dư ~9 giờ", add: 0 });
  expect(channelVerdict(h({ extra: 0.2 }), null)?.text).toBe("đủ giờ");
  expect(channelVerdict(null, null)).toBeNull();
});
