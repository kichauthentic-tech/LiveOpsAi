// Khoá tab Tôi của app talent (09/11): mở khoá hết hạn sau khi không thao tác; sai mật khẩu quá số lần thì phải chờ.
// Chạy: npx vitest run tests/talentRateLock.test.ts
import { describe, expect, test } from "vitest";
import { RATE_LOCK_COOLDOWN_MS, RATE_LOCK_IDLE_MS, RATE_LOCK_MAX_TRIES, cooldownLeftSec, isRateUnlocked } from "../src/lib/talent/rateLock";

describe("isRateUnlocked", () => {
  test("chưa mở khoá (null) ⇒ khoá", () => expect(isRateUnlocked(null, 1_000_000)).toBe(false));
  test("vừa thao tác ⇒ mở", () => expect(isRateUnlocked(1_000_000, 1_000_000 + 1000)).toBe(true));
  test("đúng mốc không thao tác ⇒ khoá lại", () => expect(isRateUnlocked(1_000_000, 1_000_000 + RATE_LOCK_IDLE_MS)).toBe(false));
  test("tab ẩn lâu rồi hiện lại (một giờ sau) ⇒ khoá", () => expect(isRateUnlocked(1_000_000, 1_000_000 + 3_600_000)).toBe(false));
});

describe("cooldownLeftSec", () => {
  const t0 = 5_000_000;
  test("chưa sai đủ lần ⇒ không chờ", () => expect(cooldownLeftSec(RATE_LOCK_MAX_TRIES - 1, t0, t0)).toBe(0));
  test("sai đủ lần ⇒ chờ cả thời gian", () => expect(cooldownLeftSec(RATE_LOCK_MAX_TRIES, t0, t0)).toBe(RATE_LOCK_COOLDOWN_MS / 1000));
  test("đếm ngược theo giây, làm tròn lên", () => expect(cooldownLeftSec(RATE_LOCK_MAX_TRIES, t0, t0 + 10_500)).toBe(20));
  test("hết thời gian chờ ⇒ 0", () => expect(cooldownLeftSec(RATE_LOCK_MAX_TRIES, t0, t0 + RATE_LOCK_COOLDOWN_MS)).toBe(0));
});

// Lần vẽ đầu của tab Tôi PHẢI là màn mật khẩu — không được lọt rate/thu nhập ra trước khi nhập.
import { vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("../src/hooks/useAuth", () => ({ useAuth: () => ({ reauthenticate: async () => ({ error: null }), signOut: async () => {} }) }));

describe("MyTalentProfile — cổng mật khẩu", () => {
  test("vẽ lần đầu: chỉ có ô mật khẩu, không có rate / thu nhập", async () => {
    const { MyTalentProfile } = await import("../src/components/MyTalentProfile");
    const html = renderToString(
      React.createElement(MyTalentProfile, {
        activeUser: { id: "u1", name: "Trợ Test", email: "t@x.vn", assignedTalentId: "t1" } as never,
        talents: [{ id: "t1", name: "Trợ Test", ratePerHour: 85000, assistantRatePerHour: 85000, ratePerSession: 0, role: "assistant" }] as never,
        sessions: [],
        payrollSessions: [],
        financeRecords: [],
        talentRateHistory: [],
        onOpenAccount: () => {}
      })
    );
    expect(html).toContain("Nhập mật khẩu để xem");
    expect(html).toContain('type="password"');
    expect(html).not.toMatch(/85[.,]?000/);
    expect(html).not.toContain("Thu nhập tạm tính");
  });
});
