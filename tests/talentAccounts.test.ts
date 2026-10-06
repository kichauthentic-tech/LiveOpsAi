// Cấp tài khoản cho hồ sơ talent có sẵn (Đợt 3 lịch 2 sàn). Ai lên đầu danh sách, ai bị loại.
// Chạy: npx vitest run tests/talentAccounts.test.ts
import { describe, expect, test } from "vitest";
import { credentialMessage, isEmail, talentsWithoutAccount } from "../src/lib/talentAccounts";
import type { LiveSession, Talent } from "../src/types";

const t = (id: string, name: string, over: Partial<Talent> = {}): Talent => ({ id, name, role: "Host", ...over }) as Talent;
const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({ id, date: "2026-10-10", status: "Upcoming", hostId: "", isBackfill: false, ...over }) as LiveSession;

const TODAY = "2026-10-06";

describe("talentsWithoutAccount", () => {
  const talents = [t("an", "An"), t("binh", "Bình", { role: "Assistant" }), t("chi", "Chi"), t("dung", "Dũng", { profileId: "p-dung" }), t("em", "Em")];
  const users = [{ assignedTalentId: "chi" }, { assignedTalentId: undefined }];
  const sessions = [
    ca("1", { hostId: "an", date: "2026-10-12" }),
    ca("2", { hostId: "an", date: "2026-10-08" }),
    ca("3", { hostId: "x", coHostId: "binh" }),
    ca("4", { hostId: "x", staffSegments: [{ talentId: "binh", role: "co_host" }] as LiveSession["staffSegments"] }),
    ca("5", { hostId: "binh", date: "2026-10-01" }), // đã qua
    ca("6", { hostId: "an", status: "Cancelled" }), // huỷ
    ca("7", { hostId: "an", isBackfill: true }), // nạp file
    ca("8", { hostId: "chi" }),
    ca("9", { hostId: "dung" })
  ];
  const rows = talentsWithoutAccount(talents, users, sessions, TODAY);

  test("bỏ hồ sơ đã có tài khoản (profiles.assigned_talent_id hoặc talents.profile_id)", () => {
    expect(rows.map((r) => r.talent.id)).toEqual(["an", "binh", "em"]);
  });
  test("đếm ca từ hôm nay: host, trợ, một đoạn; không đếm ca đã qua/huỷ/nạp file", () => {
    expect(rows.map((r) => r.upcoming)).toEqual([2, 2, 0]);
  });
  test("ca gần nhất", () => {
    expect(rows[0].nextDate).toBe("2026-10-08");
    expect(rows[2].nextDate).toBe("");
  });
  test("cùng số ca thì xếp theo tên", () => {
    expect(rows[0].talent.name).toBe("An");
  });
});

test("isEmail", () => {
  expect(isEmail(" an@gmail.com ")).toBe(true);
  expect(isEmail("an@gmail")).toBe(false);
  expect(isEmail("0901234567")).toBe(false);
});

test("credentialMessage có link, email, mật khẩu, chỗ giao ca", () => {
  const m = credentialMessage("An", "an@gmail.com", "Xy12-ab", "https://live-ops-ai.vercel.app");
  expect(m).toContain("https://live-ops-ai.vercel.app");
  expect(m).toContain("an@gmail.com");
  expect(m).toContain("Xy12-ab");
  expect(m).toContain("Giao ca");
});
