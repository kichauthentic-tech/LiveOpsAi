// Thẻ "Chia target ca — engine v2" ở AI Training Center vẽ ra HTML (SSR): có hệ số đã học, bảng backtest, không NaN/undefined.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AllocationTrainingCard } from "../src/components/AllocationTrainingCard";
import { DEFAULT_ENGINE_PARAMS } from "../src/lib/scheduling/engineParams";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import { eachDay } from "../src/lib/dateUtils";
import { LiveSession } from "../src/types";

let seq = 0;
const ca = (date: string, start: string, gmv: number, platform: "TikTok" | "Shopee", brandId = "crocs"): LiveSession =>
  ({
    id: `r${++seq}`, title: "", brandId, brandName: brandId, shopTikTokHandle: "", monthPublished: true, studioId: "", studioName: "",
    hostId: "", hostName: "", assistantName: "", coHostName: "", platform, date, startTime: start, endTime: `${String(Number(start.slice(0, 2)) + 3).padStart(2, "0")}:00`,
    status: "Completed", targetGmv: 0, actualGmv: gmv, totalOrders: 5, avgWatchTimeSeconds: 0, peakViewers: 0, totalViews: 100, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: 180
  }) as LiveSession;

const world = (platform: "TikTok" | "Shopee"): LiveSession[] =>
  ["2026-06", "2026-07", "2026-08", "2026-09"].flatMap((m, mi) =>
    eachDay(`${m}-01`, `${m}-28`).flatMap((d, di) =>
      (["11:00", "20:00"] as const).map((s, si) => ca(d, s, (s === "11:00" ? 40e6 : 70e6) * (resolveCampBucketType(d) === "dday" ? 1.3 : 1) * (1 + (((di + si + mi) * 7) % 9 - 4) * 0.02), platform))
    )
  );

const render = (sessions: LiveSession[], brandId = "crocs") =>
  renderToStaticMarkup(React.createElement(AllocationTrainingCard, { brandId, sessions, params: DEFAULT_ENGINE_PARAMS, today: "2026-10-09" }));

describe("AllocationTrainingCard", () => {
  test("có hệ số đã học + bảng backtest, không NaN / undefined", () => {
    const html = render(world("TikTok"));
    expect(html).toContain("Chia target ca");
    expect(html).toContain("Đã học gì");
    expect(html).toContain("Trưa 11–14h");
    expect(html).toContain("Backtest");
    expect(html).toContain("v2 trộn với cách cũ");
    expect(html).toMatch(/\d+,\d%/);
    expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
  });
  test("brand có hai sàn: hiện nút chọn sàn, không trộn số hai sàn", () => {
    const html = render([...world("TikTok"), ...world("Shopee")]);
    expect(html).toContain(">TikTok<");
    expect(html).toContain(">Shopee<");
  });
  test("brand chưa có ca nào / chưa đủ lịch sử: nói thẳng, không vỡ", () => {
    expect(render([], "x")).toContain("chưa có gì để học");
    const thin = render(world("TikTok").filter((s) => s.date.startsWith("2026-09")));
    expect(thin).toContain("Chưa đủ lịch sử");
    expect(thin).not.toMatch(/NaN|undefined|Infinity/);
  });
});
