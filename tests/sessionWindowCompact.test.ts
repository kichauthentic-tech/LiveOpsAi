// Cửa sổ ca gọn (08/11, user duyệt demo): dải trạng thái thay viên + khung "Còn thiếu để chốt", kết quả là một số to, phễu thay 27 ô số,
// room ID / lịch sử / nguồn số gập vào "Chi tiết". Vẽ SSR với số thật ca FUJIWA TikTok 08/11 10:00–13:00 (2 room, đã giao, chưa đối soát).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { SessionWindow } = await import("../src/components/SessionWindow");
const { ToastProvider } = await import("../src/hooks/useToast");
const { ConfirmProvider } = await import("../src/hooks/useConfirm");
import type { LiveSession } from "../src/types";

const fujiwa = {
  id: "a9a98c9a", title: "FUJIWA", brandId: "b", brandName: "FUJIWA", platform: "TikTok", date: "2026-11-08", startTime: "10:00", endTime: "13:00",
  status: "Completed", hostId: "h", hostName: "Huỳnh Tấn Khanh", coHostId: "c", coHostName: "Phạm Thị Phương Loan", studioId: "st", studioName: "FUJIWA",
  targetGmv: 5_300_000, actualGmv: 513_764, totalOrders: 2, totalViews: 738, impressions: 31_484, productImpressions: 2_107, productClicks: 117,
  attributedItemsSold: 3, attributedSkuOrders: 2, avgWatchTimeSeconds: 34, newFollowers: 3, commentsCount: 33, sharesCount: 7, likesCount: 6_781, peakViewers: 0,
  dataSource: "live_snapshot", actualStartAt: "2026-11-08T03:02:36Z", actualEndAt: "2026-11-08T06:00:00Z", liveDurationMinutes: 166.33,
  liveRoomIds: ["7705630574144899848", "7705655773732735752"],
  report: { restartCount: 1, crossLive: false, hostLate: false, otMinutes: 0, earlyLeaveMinutes: 0, statusNote: "", handoverAt: "2026-11-08T14:20:44Z", submittedAt: "2026-11-08T14:20:44Z", submittedByRole: "admin" }
} as unknown as LiveSession;

const render = (s: LiveSession, role: "admin" | "brand" = "admin") =>
  renderToStaticMarkup(
    React.createElement(ToastProvider, null,
      React.createElement(ConfirmProvider, null,
        React.createElement(SessionWindow, { session: s, viewer: { role }, today: "2026-11-08", allSessions: [s], onClose: () => {}, onSessionsUpdated: () => {} })))
  );

test("ca đã giao: dải trạng thái, số to, phễu; không còn khung chữ cũ", () => {
  const html = render(fujiwa);
  expect(html).toContain('aria-label="Trạng thái ca"');
  expect(html).toContain("Đối soát");
  expect(html).not.toContain("Còn thiếu để chốt");
  expect(html).not.toContain("Kế hoạch vs thực tế");
  expect(html).not.toContain("Lượt live &amp; ca nối");
  expect(html).not.toContain("Chuỗi ca liền kề");
  expect(html).toContain("514K");
  expect(html).toContain("9,7%");
  // Phễu: LIVE impressions → Views (ERR) → Product clicks (LIVE CTR) → Orders (CTOR)
  expect(html).toContain("31.484");
  expect(html).toMatch(/ERR <b[^>]*>2,34%/);
  expect(html).toMatch(/LIVE CTR <b[^>]*>15,85%/);
  expect(html).toMatch(/CTOR <b[^>]*>1,71%/);
  expect(html).toContain("Xem đủ 19 chỉ số");
  // Restart đã thấy trên dòng thời gian (2 room) ⇒ không lặp viên "Restart ×1".
  expect(html).not.toContain("Restart ×1");
  // Room ID + lịch sử nằm trong Chi tiết; nút chính là Sửa giao ca.
  expect(html).toMatch(/<details[^>]*><summary[^>]*>Chi tiết<\/summary>[\s\S]*7705630574144899848/);
  expect(html).toContain("Sửa giao ca");
  expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
});

test("brand: không có dải trạng thái, không target, không Chi tiết", () => {
  const html = render(fujiwa, "brand");
  expect(html).not.toContain('aria-label="Trạng thái ca"');
  expect(html).not.toContain("target");
  expect(html).not.toContain("Chi tiết");
  expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
});
