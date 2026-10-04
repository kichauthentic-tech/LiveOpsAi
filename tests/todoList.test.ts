import { describe, expect, test } from "vitest";
import { buildTodos, TodoInput } from "../src/lib/todoList";
import { Brand, BrandMonthPlan, BrandMonthlyReport, LiveSession, ShiftSlot } from "../src/types";

// Danh sách "Việc cần làm" (audit người mới 2026-10-04). Tình huống dựng theo production 04/10: CROCS có số tới
// 22/09, kế hoạch T10 còn nháp, chưa hợp đồng, chưa giá, report T9 chưa phát hành; 3 brand còn lại chưa có ca.
const brand = (id: string, name: string) => ({ id, name }) as Brand;
const ca = (id: string, date: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({ id, brandId: "crocs", date, startTime: "19:00", endTime: "22:00", status: "Completed", hostId: "h1", actualGmv: 10, dataSource: "tiktok_reconciled", isBackfill: true, ...over }) as LiveSession;

const base = (over: Partial<TodoInput> = {}): TodoInput => ({
  today: "2026-10-04",
  brands: [brand("crocs", "CROCS"), brand("franklin", "Franklin")],
  sessions: [ca("a", "2026-09-22"), ca("b", "2026-09-21", { hostId: "" })],
  shiftSlots: [],
  plansThisMonth: new Map([["crocs", { status: "draft" } as BrandMonthPlan]]),
  plansNextMonth: new Map(),
  commitments: [],
  rates: [],
  monthlyReports: new Map(),
  talents: [],
  canSeeMoney: false,
  ...over
});
const ids = (input: TodoInput) => buildTodos(input).map((t) => t.id);

describe("buildTodos", () => {
  test("tình huống 04/10: đủ các việc của CROCS, Franklin gộp một dòng", () => {
    expect(ids(base()).sort()).toEqual(["commit-crocs", "idle", "no-host", "plan-draft-crocs", "rate-crocs", "report-crocs", "stale-crocs"].sort());
  });
  test("việc đỏ đứng trước", () => {
    const t = buildTodos(base());
    expect(t[0].level).toBe("high");
    expect(t.at(-1)?.level).toBe("low");
  });
  test("số liệu tới hôm qua thì không nhắc; report đã phát hành thì không nhắc", () => {
    const got = ids(base({
      sessions: [ca("a", "2026-10-03"), ca("p", "2026-09-10")],
      monthlyReports: new Map([["crocs|2026-09", { status: "published" } as BrandMonthlyReport]])
    }));
    expect(got).not.toContain("stale-crocs");
    expect(got).not.toContain("report-crocs");
  });
  test("ca nạp bù chưa gán host của một brand ⇒ mở lưới nạp bù của brand đó", () => {
    const t = buildTodos(base()).find((x) => x.id === "no-host")!;
    expect(t.tab).toBe("brand_dataraw");
    expect(t.brandId).toBe("crocs");
  });
  test("kế hoạch tháng sau chỉ nhắc từ ngày 15", () => {
    expect(ids(base())).not.toContain("plan-next-crocs");
    expect(ids(base({ today: "2026-10-15" }))).toContain("plan-next-crocs");
  });
  test("ca chờ đăng ký 7 ngày tới chưa có người", () => {
    const slot = { id: "s", date: "2026-10-06", status: "open" } as ShiftSlot;
    expect(ids(base({ shiftSlots: [slot] }))).toContain("open-slots");
    expect(ids(base({ shiftSlots: [{ ...slot, date: "2026-10-20" }] }))).not.toContain("open-slots");
  });
  test("có giá (đơn giá/giờ hoặc % hoa hồng) thì không nhắc", () => {
    expect(ids(base({ rates: [{ brandId: "crocs", platform: "TikTok", ratePerHour: 0, returnRate: 0, commissionRate: 3 } as never] }))).not.toContain("rate-crocs");
  });
});
