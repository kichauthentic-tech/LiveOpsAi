// Việc cần làm — phần Affiliate (P3 của 0155). Tình huống dựng theo production 08/10: CROCS có 4 phiên T9 đã live, T10 chưa lập.
import { describe, expect, test } from "vitest";
import { buildTodos, TodoInput } from "../src/lib/todoList";
import { Brand, BrandChannel, BrandMonthPlan, LiveSession } from "../src/types";

type AffRow = NonNullable<TodoInput["affiliate"]>["rows"][number];
const brand = (id: string, name: string) => ({ id, name }) as Brand;
const chan = (brandId: string, platform: "TikTok" | "Shopee") => ({ id: `${brandId}-${platform}`, brandId, platform, shopName: "", shopRef: "", status: "active", note: "" }) as BrandChannel;
const ca = (id: string, date: string): LiveSession =>
  ({ id, brandId: "crocs", date, startTime: "19:00", endTime: "22:00", status: "Completed", hostId: "h1", actualGmv: 10, dataSource: "tiktok_reconciled", isBackfill: true }) as LiveSession;
const aff = (periodMonth: string, status: AffRow["status"], liveDateLabel?: string, brandId = "crocs"): AffRow => ({ brandId, periodMonth, status, liveDateLabel });

const base = (over: Partial<TodoInput> = {}): TodoInput => ({
  today: "2026-10-08",
  brands: [brand("crocs", "CROCS")],
  channels: [chan("crocs", "TikTok")],
  sessions: [ca("a", "2026-10-07")],
  shiftSlots: [],
  plansThisMonth: new Map([["crocs", { status: "locked" } as BrandMonthPlan]]),
  plansNextMonth: new Map([["crocs", { status: "locked" } as BrandMonthPlan]]),
  commitments: [],
  rates: [],
  monthlyReports: new Map(),
  talents: [],
  canSeeMoney: false,
  ...over
});
const affIds = (input: TodoInput) => buildTodos(input).map((t) => t.id).filter((id) => id.startsWith("aff-"));
const withAff = (rows: AffRow[], published: string[] = [], over: Partial<TodoInput> = {}) => base({ affiliate: { rows, published: new Set(published) }, ...over });

describe("việc Affiliate", () => {
  test("chưa nạp được dữ liệu Affiliate (DB chưa chạy 0155) ⇒ không sinh việc nào", () => {
    expect(affIds(base())).toEqual([]);
  });
  test("tình huống 08/10: T9 toàn phiên đã live, T10 chưa lập ⇒ chưa nhắc (mới ngày 8)", () => {
    const rows = [aff("2026-09-01", "done", "3/9/2026"), aff("2026-09-01", "done", "9/9/2026")];
    expect(affIds(withAff(rows))).toEqual([]);
  });
  test("từ ngày 15, brand đã dùng Affiliate mà tháng sau chưa có dòng ⇒ nhắc lập kế hoạch", () => {
    const rows = [aff("2026-09-01", "done", "3/9/2026")];
    expect(affIds(withAff(rows, [], { today: "2026-10-15" }))).toEqual(["aff-plan-next-crocs"]);
  });
  test("brand chưa từng dùng Affiliate thì không bị nhắc lập kế hoạch", () => {
    expect(affIds(withAff([], [], { today: "2026-10-20" }))).toEqual([]);
  });
  test("tháng sau chỉ còn phiên đã huỷ vẫn coi là chưa lập", () => {
    const rows = [aff("2026-09-01", "done", "3/9/2026"), aff("2026-11-01", "cancelled", "5/11/2026")];
    expect(affIds(withAff(rows, [], { today: "2026-10-15" }))).toContain("aff-plan-next-crocs");
  });
  test("phiên kế hoạch đã qua ngày ≥ 2 ngày chưa có số ⇒ nhắc, đỏ khi trễ quá 3 ngày", () => {
    const rows = [aff("2026-10-01", "planned", "5/10/2026"), aff("2026-10-01", "planned", "7/10/2026"), aff("2026-10-01", "planned", "20/10/2026")];
    const t = buildTodos(withAff(rows, ["crocs|2026-10"])).find((x) => x.id === "aff-late-crocs")!;
    expect(t.title).toBe("1 phiên Affiliate của CROCS đã qua ngày chưa có số");
    expect(t.level).toBe("medium");
    expect(t.tab).toBe("brand_affiliate");
    expect(t.brandId).toBe("crocs");
    const old = buildTodos(withAff([aff("2026-10-01", "planned", "2/10/2026")], ["crocs|2026-10"])).find((x) => x.id === "aff-late-crocs")!;
    expect(old.level).toBe("high");
  });
  test("phiên hôm qua / hôm nay chưa có số thì chưa nhắc (file về trễ)", () => {
    const rows = [aff("2026-10-01", "planned", "7/10/2026"), aff("2026-10-01", "planned", "8/10/2026")];
    expect(affIds(withAff(rows, ["crocs|2026-10"]))).toEqual([]);
  });
  test("phiên đã live hoặc đã huỷ thì không tính là chưa có số", () => {
    const rows = [aff("2026-10-01", "done", "3/10/2026"), aff("2026-10-01", "cancelled", "4/10/2026")];
    expect(affIds(withAff(rows, ["crocs|2026-10"]))).toEqual([]);
  });
  test("phiên chưa có số của tháng trước vẫn nhắc (chưa nạp file cuối tháng)", () => {
    expect(affIds(withAff([aff("2026-09-01", "planned", "28/9/2026")], ["crocs|2026-09"]))).toEqual(["aff-late-crocs"]);
  });
  test("có kế hoạch mà chưa Chốt ⇒ nhắc nhẹ; đã chốt thì thôi", () => {
    const rows = [aff("2026-11-01", "planned", "9/11/2026")];
    expect(affIds(withAff(rows))).toEqual(["aff-unpublished-crocs-2026-11"]);
    expect(affIds(withAff(rows, ["crocs|2026-11"]))).toEqual([]);
    expect(buildTodos(withAff(rows)).find((x) => x.id.startsWith("aff-unpublished"))!.level).toBe("low");
  });
  test("brand chỉ chạy Shopee không bị nhắc Affiliate", () => {
    const input = withAff([aff("2026-10-01", "planned", "1/10/2026", "vera")], [], {
      brands: [brand("vera", "VERA")],
      channels: [chan("vera", "Shopee")],
      sessions: [{ ...ca("v", "2026-10-07"), brandId: "vera", platform: "Shopee" } as LiveSession],
      plansThisMonth: new Map(),
      plansNextMonth: new Map()
    });
    expect(affIds(input)).toEqual([]);
  });
  test("dòng của brand khác không lẫn sang", () => {
    expect(affIds(withAff([aff("2026-10-01", "planned", "1/10/2026", "franklin")], ["franklin|2026-10"]))).toEqual([]);
  });
});
