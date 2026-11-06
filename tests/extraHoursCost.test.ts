import { expect, test, vi } from "vitest";
vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
import { channelHourCost } from "../src/lib/scheduling/extraHoursCost";
import type { LiveSession, Talent } from "../src/types";

const t = (id: string, ratePerHour: number, assistantRatePerHour = 0, rateHidden = false) => ({ id, name: id, role: "Host", ratePerHour, assistantRatePerHour, ratePerSession: 0, rateHidden }) as unknown as Talent;
const s = (date: string, hostId: string, coHostId?: string): LiveSession => ({ id: date + hostId, brandId: "b", platform: "TikTok", date, startTime: "19:00", endTime: "22:00", status: "Completed", hostId, coHostId }) as unknown as LiveSession;

test("chi phí 1 giờ thêm = rate host TB theo giờ + rate trợ TB × tỷ lệ ca có trợ", () => {
  const talents = [t("h1", 200_000), t("h2", 300_000), t("a1", 0, 80_000)];
  const ses = [s("2026-11-01", "h1", "a1"), s("2026-11-02", "h2"), s("2026-11-03", "h1", "a1"), s("2026-11-04", "h2")];
  const c = channelHourCost(ses, talents, "b", "TikTok", "2026-11-06");
  expect(c.hostPerHour).toBe(250_000);
  expect(c.assistantPerHour).toBe(40_000); // 80K × 2/4 ca có trợ
  expect(c.perHour).toBe(290_000);
});

test("không đọc được rate (role không xem lương) ⇒ không ước chi phí", () => {
  const c = channelHourCost([s("2026-11-01", "h1")], [t("h1", 0, 0, true)], "b", "TikTok", "2026-11-06");
  expect(c.perHour).toBeNull();
});
