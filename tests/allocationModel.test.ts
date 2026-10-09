// Engine chia target ca v2 — lib/performance/allocationModel.ts (2026-10-09).
// Chạy: npx vitest run tests/allocationModel.test.ts
import { describe, expect, test } from "vitest";
import {
  ALLOC_METHODS,
  allocBand,
  allocatorWeights,
  buildAllocator,
  fitAllocationModel,
  glmWeights,
  prepareBacktest,
  scoreBacktest
} from "../src/lib/performance/allocationModel";
import { DEFAULT_ENGINE_PARAMS, diffFromDefaults, mergeEngineParams } from "../src/lib/scheduling/engineParams";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import { eachDay } from "../src/lib/dateUtils";
import { LiveSession } from "../src/types";

const P = DEFAULT_ENGINE_PARAMS;
const bucketOf = (d: string) => resolveCampBucketType(d);
let seq = 0;
function ca(date: string, startTime: string, hours: number, gmvPerHour: number, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  const h = Number(startTime.slice(0, 2)) + hours;
  return {
    id: `s${seq}`, title: "", brandId: "b", brandName: "B", shopTikTokHandle: "", monthPublished: true, studioId: "", studioName: "",
    hostId: "", hostName: "", assistantName: "", coHostName: "", platform: "TikTok", date, startTime,
    endTime: `${String(Math.floor(h) % 24).padStart(2, "0")}:00`, status: "Completed", targetGmv: 0, actualGmv: gmvPerHour * hours,
    totalOrders: 10, avgWatchTimeSeconds: 0, peakViewers: 0, totalViews: 1000, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: hours * 60, ...extra
  } as LiveSession;
}

// Nhiễu xác định (không dùng random) để test lặp lại.
const wob = (i: number) => 1 + (((i * 7919) % 11) - 5) * 0.015;

// Thế giới giả có sẵn đáp án: D-Day ×1.3, ngày thường ca 11h ×0.8 / ca 20h ×1.1; ngày 1/2/3 của Mid-Month/Pay Day = 1.35/0.95/0.7.
function world(months: string[], platform: "TikTok" | "Shopee" = "TikTok"): LiveSession[] {
  const out: LiveSession[] = [];
  let i = 0;
  for (const m of months) {
    for (const d of eachDay(`${m}-01`, `${m}-28`)) {
      const b = bucketOf(d);
      const posMult = b === "midmonth" || b === "payday" ? [1.35, 0.95, 0.7][Number(d.slice(8)) - (b === "midmonth" ? 13 : 23)] : 1;
      const bucketMult = b === "dday" ? 1.3 : 1;
      for (const [start, bandMult] of [["11:00", 0.8], ["20:00", 1.1]] as const) {
        i++;
        out.push(ca(d, start, 3, 20e6 * bucketMult * posMult * bandMult * wob(i), { platform }));
      }
    }
  }
  return out;
}

describe("khung giờ", () => {
  test("theo giờ bắt đầu, 18h là Tối vàng, 21h trở đi và 0–6h là Đêm", () => {
    expect([ "08:30", "10:59", "11:00", "13:59", "14:00", "17:59", "18:00", "20:59", "21:00", "23:30", "00:30", "05:59"].map(allocBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4]);
  });
});

describe("fitAllocationModel", () => {
  const hist = world(["2026-06", "2026-07", "2026-08"]);
  test("học lại đúng chiều của các hệ số trong thế giới giả", () => {
    const m = fitAllocationModel(hist, "2026-09", { ...P, allocRidge: 0.5 })!;
    expect(m).not.toBeNull();
    expect(m.bucket.dday).toBeGreaterThan(1.15);
    expect(m.bucket.dday).toBeLessThan(1.45);
    expect(m.band[1]).toBeLessThan(m.band[3]); // trưa yếu hơn tối vàng
    expect(m.band[1]).toBeLessThan(0.95);
    expect(m.band[3]).toBeGreaterThan(1.02);
    expect(m.pos[0]).toBeGreaterThan(m.pos[1]);
    expect(m.pos[1]).toBeGreaterThan(m.pos[2]);
    expect(m.months).toEqual(["2026-06", "2026-07", "2026-08"]);
  });
  test("hệ số khung và vị trí chuẩn hoá về trung bình theo giờ = 1 (ra gần 1 khi tắt)", () => {
    const off = fitAllocationModel(hist, "2026-09", { ...P, allocUseBand: false, allocUseCampPos: false })!;
    expect(off.band.every((v) => v === 1)).toBe(true);
    expect(off.pos.every((v) => v === 1)).toBe(true);
  });
  test("chưa đủ tháng ⇒ null; nới allocMinMonths thì có", () => {
    const one = world(["2026-08"]);
    expect(fitAllocationModel(one, "2026-09", P)).toBeNull();
    expect(fitAllocationModel(one, "2026-09", { ...P, allocMinMonths: 1 })).not.toBeNull();
  });
  test("không dùng ca từ chính tháng đang lập hay sau đó (không rò rỉ tương lai)", () => {
    const a = fitAllocationModel(hist, "2026-08", P)!;
    expect(a.months).toEqual(["2026-06", "2026-07"]);
  });
  test("bỏ ca bị loại khỏi báo cáo, ca chưa xong, ca GMV 0", () => {
    const dirty = [
      ...hist,
      ca("2026-08-05", "20:00", 3, 999e6, { excludedFromReports: true }),
      ca("2026-08-06", "20:00", 3, 999e6, { status: "Upcoming" }),
      ca("2026-08-07", "20:00", 3, 0)
    ];
    const clean = fitAllocationModel(hist, "2026-09", P)!;
    const m = fitAllocationModel(dirty, "2026-09", P)!;
    expect(m.sessions).toBe(clean.sessions);
    expect(m.bucket.dday).toBeCloseTo(clean.bucket.dday, 6);
  });
  test("ridge lớn kéo hệ số về 1", () => {
    const loose = fitAllocationModel(hist, "2026-09", { ...P, allocRidge: 0.1 })!;
    const tight = fitAllocationModel(hist, "2026-09", { ...P, allocRidge: 200 })!;
    expect(Math.abs(tight.bucket.dday - 1)).toBeLessThan(Math.abs(loose.bucket.dday - 1));
  });
});

describe("trọng số chia target", () => {
  const hist = world(["2026-06", "2026-07", "2026-08"]);
  // Tháng 10: D-Day 8–10, Mid-Month 13–15, Pay Day 23–25.
  const slots = [
    { date: "2026-10-10", startTime: "11:00", endTime: "14:00" },
    { date: "2026-10-10", startTime: "18:00", endTime: "21:00" },
    { date: "2026-10-13", startTime: "20:00", endTime: "23:00" },
    { date: "2026-10-15", startTime: "20:00", endTime: "23:00" },
    { date: "2026-10-20", startTime: "20:00", endTime: "23:00" },
    { date: "2026-10-20", startTime: "21:00", endTime: "00:30" }
  ];
  const m = fitAllocationModel(hist, "2026-10", { ...P, allocRidge: 0.5 })!;
  const w = glmWeights(slots, m, bucketOf);

  test("ca trưa D-Day thấp hơn ca tối D-Day (cách cũ cho hai ca này bằng nhau)", () => {
    expect(w[0]).toBeLessThan(w[1] * 0.9);
  });
  test("ngày 1 của Mid-Month cao hơn ngày 3 cùng khung", () => {
    expect(w[2]).toBeGreaterThan(w[3] * 1.3);
  });
  test("ca qua nửa đêm tính đủ giờ (3,5h chứ không âm)", () => {
    expect(w[5]).toBeGreaterThan(0);
  });
  test("ngày camp nhập tay ngoài lịch cố định: vị trí xếp theo thứ tự ngày trong lưới", () => {
    const manual = [
      { date: "2026-10-18", startTime: "20:00", endTime: "23:00" },
      { date: "2026-10-19", startTime: "20:00", endTime: "23:00" },
      { date: "2026-10-20", startTime: "20:00", endTime: "23:00" }
    ];
    const ww = glmWeights(manual, m, (d) => (d >= "2026-10-18" && d <= "2026-10-20" ? "midmonth" : "daily"));
    expect(ww[0]).toBeGreaterThan(ww[1]);
    expect(ww[1]).toBeGreaterThan(ww[2]);
  });

  test("allocator trộn: share=1 ra đúng v2, share=0 ra đúng cách cũ, tổng luôn 1", () => {
    const a1 = buildAllocator(hist, "2026-10", { ...P, allocEnsembleShare: 1 })!;
    const a0 = buildAllocator(hist, "2026-10", { ...P, allocEnsembleShare: 0 })!;
    const w1 = allocatorWeights(a1, slots, bucketOf);
    const w0 = allocatorWeights(a0, slots, bucketOf);
    expect(w1.blended).toEqual(w1.glm);
    expect(w0.blended).toEqual(w0.old);
    for (const x of [w1.blended, w0.blended, allocatorWeights(buildAllocator(hist, "2026-10", P)!, slots, bucketOf).blended]) {
      expect(x.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
    }
  });
  test("thiếu một nguồn thì dùng nguồn còn lại; thiếu cả hai ⇒ null", () => {
    const thin = world(["2026-08"]);
    expect(buildAllocator(thin, "2026-09", P)).toBeNull();
    const a = buildAllocator(thin, "2026-09", { ...P, allocMinMonths: 1 })!;
    expect(a.glm).not.toBeNull();
    expect(a.old).toBeNull();
    expect(allocatorWeights(a, slots, bucketOf).blended).toEqual(allocatorWeights(a, slots, bucketOf).glm);
  });
  test("mảng ca lẫn hai sàn bị chặn (luật không cộng số hiệu suất giữa TikTok và Shopee)", () => {
    const mixed = [...hist.slice(0, 3), ca("2026-08-02", "20:00", 3, 1e6, { platform: "Shopee" })];
    expect(() => buildAllocator(mixed, "2026-09", P)).toThrow(/lẫn TikTok và Shopee/);
  });
});

describe("backtest", () => {
  const all = world(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  test("fold chỉ dùng tháng trước, mô hình v2 thắng chia theo giờ trong thế giới có cấu trúc", () => {
    const prep = prepareBacktest(all, 2);
    expect(prep.map((f) => f.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    for (const f of prep) expect(f.hist.every((s) => s.date < `${f.month}-01`)).toBe(true);
    const r = scoreBacktest(prep, P, "2026-12-31");
    expect(r.folds).toHaveLength(3);
    for (const k of ALLOC_METHODS) expect(r.pooled[k]).not.toBeNull();
    expect(r.pooled.glm!.slot).toBeLessThan(r.pooled.hours!.slot * 0.6);
    expect(r.pooled.v2!.slot).toBeLessThan(r.pooled.hours!.slot);
    expect(r.pooled.v2!.day).toBeLessThanOrEqual(r.pooled.v2!.slot + 1e-9); // gộp theo ngày không thể tệ hơn theo ca
  });
  test("thiếu lịch sử thì không có fold; tháng còn dở được đánh dấu", () => {
    expect(prepareBacktest(world(["2026-08", "2026-09"]), 2)).toEqual([]);
    const r = scoreBacktest(prepareBacktest(all, 2), P, "2026-09-10");
    expect(r.folds.map((f) => f.partial)).toEqual([false, false, true]);
  });
  test("vặn tham số đổi kết quả: tắt khung + tắt vị trí làm v2 riêng tệ đi", () => {
    const prep = prepareBacktest(all, 2);
    const on = scoreBacktest(prep, { ...P, allocEnsembleShare: 1 }, "2026-12-31").pooled.v2!.slot;
    const off = scoreBacktest(prep, { ...P, allocEnsembleShare: 1, allocUseBand: false, allocUseCampPos: false }, "2026-12-31").pooled.v2!.slot;
    expect(off).toBeGreaterThan(on);
  });
});

describe("tham số engine lưu ở DB", () => {
  test("khoá alloc* có mặc định, đi qua diff/merge, bỏ giá trị sai kiểu", () => {
    const changed = { ...P, allocEnsembleShare: 0.8, allocUseBand: false };
    expect(diffFromDefaults(changed)).toEqual({ allocEnsembleShare: 0.8, allocUseBand: false });
    const back = mergeEngineParams({ allocEnsembleShare: 0.8, allocUseBand: false, allocRidge: "x", allocMinMonths: null });
    expect(back.allocEnsembleShare).toBe(0.8);
    expect(back.allocUseBand).toBe(false);
    expect(back.allocRidge).toBe(P.allocRidge);
    expect(back.allocMinMonths).toBe(P.allocMinMonths);
  });
});
