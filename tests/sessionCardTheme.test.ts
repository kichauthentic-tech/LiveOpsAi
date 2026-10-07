import { describe, expect, it } from "vitest";
import { TARGET_PILL_FG, contrastRatio, getBrandTheme } from "../src/lib/brandTheme";
import { buildSessionMeta, buildSlotMeta } from "../src/components/ui/SessionEventCard";
import type { LiveSession, ShiftSlot } from "../src/types";

// Thẻ ca (07/10): viên thuốc Target GMV phải đọc được trên MỌI brand ở cả giao diện sáng lẫn tối — lỗi cũ là chữ
// xanh ngọc trên nền xanh Crocs gần như tàng hình. Brand chưa khai báo màu (hash FALLBACK) cũng phải qua.
const BRANDS = ["Crocs", "Vera Fashion", "Jockey", "Franklin Baseball", "Brand Lạ Hoắc", "Another One", "Zeta"];

describe("màu thẻ ca", () => {
  it.each(BRANDS)("%s: viên thuốc Target đủ tương phản ≥ 7:1 (sáng) và ≥ 7:1 (tối)", (name) => {
    const t = getBrandTheme(name);
    expect(contrastRatio(t.ink, TARGET_PILL_FG)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(t.inkDark, t.inkDarkOn)).toBeGreaterThanOrEqual(7);
  });

  it("brand đen (Jockey/Franklin) giữ cá tính riêng, không suy ra cùng một màu", () => {
    expect(getBrandTheme("Jockey").accent).not.toBe(getBrandTheme("Franklin").accent);
  });
});

describe("chip trên thẻ", () => {
  const session = { platform: "TikTok", hostId: "h", hostName: "Nguyễn Thị Mai Anh", coHostId: "c", coHostName: "Trần Thu Hà" } as LiveSession;
  it("không còn chip nền tảng (thẻ vẽ logo sàn), Host và Trợ live luôn đủ", () => {
    const meta = buildSessionMeta(session);
    expect(meta.map((m) => m.title)).toEqual(["Host: Nguyễn Thị Mai Anh", "Trợ live: Trần Thu Hà"]);
  });
  it("role brand không thấy Trợ live", () => {
    expect(buildSessionMeta(session, undefined, "brand")).toHaveLength(1);
  });
  it("ca sắp diễn ra chưa có host → chip cảnh báo đỏ; brand không thấy, ca đã xong/huỷ không báo", () => {
    const noHost = { ...session, hostId: "", hostName: "", coHostId: undefined, coHostName: "", status: "Upcoming" } as LiveSession;
    expect(buildSessionMeta(noHost)).toEqual([expect.objectContaining({ label: "Chưa có host", warn: true })]);
    expect(buildSessionMeta(noHost, undefined, "brand")).toHaveLength(0);
    expect(buildSessionMeta({ ...noHost, status: "Completed" } as LiveSession)).toHaveLength(0);
    expect(buildSessionMeta({ ...noHost, status: "Cancelled" } as LiveSession)).toHaveLength(0);
  });
  it("đổi host giữa ca → một chip 'A → B', tooltip ghi giờ đổi", () => {
    const swapped = {
      ...session,
      startTime: "11:00",
      endTime: "14:00",
      staffSegments: [
        { talentId: "h", talentName: "Nguyễn Thị Mai Anh", role: "host", fromMin: 0, toMin: 90 },
        { talentId: "h2", talentName: "Lê Văn Thịnh", role: "host", fromMin: 90, toMin: 180 }
      ]
    } as LiveSession;
    const host = buildSessionMeta(swapped)[0];
    expect(host.label).toBe("Mai Anh → Văn Thịnh");
    expect(host.title).toBe("Host: Nguyễn Thị Mai Anh 11:00–12:30 → Lê Văn Thịnh 12:30–14:00");
    expect(host.warn).toBeUndefined();
  });
  it("ca chờ đăng ký: chỉ phòng + ghi chú, không có chip nền tảng", () => {
    const slot = { platform: "Shopee", studioName: "P2 - Tầng 3", notes: "gấp" } as ShiftSlot;
    expect(buildSlotMeta(slot).map((m) => m.label)).toEqual(["P2", "gấp"]);
    expect(buildSlotMeta(slot, "brand")).toHaveLength(0);
  });
});
