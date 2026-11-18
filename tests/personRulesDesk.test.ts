// Màn "Luật đặt giờ từng người": dựng thử với dữ liệu giả (không cần DB) để chắc nó hiện đủ dòng, luật đọc được, chế độ chỉ xem.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
const { PersonRulesDesk } = await import("../src/components/roster/PersonRulesDesk");
import type { Talent } from "../src/types";

const talents = [
  { id: "t1", name: "Trần Ngọc Bảo Thy", nickname: "B.Thy", role: "Host" },
  { id: "t2", name: "Lê Quang An", nickname: "Q.An", role: "Host" },
  { id: "t3", name: "Yến Nhi", nickname: "Nhi", role: "Host" }
] as Talent[];
const brands = [
  { id: "j", name: "JOCKEY" },
  { id: "c", name: "CROCS" }
];
const noop = async () => {};
const base = {
  month: "2026-11",
  talents,
  brands,
  nameOf: (id: string) => talents.find((t) => t.id === id)?.nickname ?? id,
  autoCaps: {}
};
const commit = (rows: { talentId: string; maxHours: number }[]) => ({ month: "2026-11", rows, caps: {}, backend: "db" as const, error: null, save: noop, remove: noop });
const rules = (r: import("../src/lib/roster/placementRules").PersonRule[]) => ({ rules: r, byTalent: Object.fromEntries(r.map((x) => [x.talentId, x])), backend: "db" as const, error: null, save: noop, remove: noop });

describe("PersonRulesDesk", () => {
  it("hiện người có luật + giờ cam kết, chip loại ngày, ô ca đêm", () => {
    const html = renderToStaticMarkup(
      createElement(PersonRulesDesk, {
        ...base,
        commitments: commit([{ talentId: "t1", maxHours: 60 }]),
        scheduleRules: rules([
          { talentId: "t1", clauses: [{ days: ["weekend", "camp"] }], night: false },
          { talentId: "t2", clauses: [{ brandId: "j", days: ["camp"] }, { brandId: "c", days: ["regular"] }], night: false },
          { talentId: "t3", clauses: [], night: true }
        ])
      })
    );
    for (const w of ["B.Thy", "Q.An", "Nhi", "Thứ 6-7-CN", "Campaign", "Ngày thường", "chỉ ca đêm", "JOCKEY", "CROCS", "Dán từ sheet"]) expect(html).toContain(w);
    expect(html).toContain('value="60"');
  });

  it("chỉ xem: không có nút Dán / Thêm", () => {
    const html = renderToStaticMarkup(createElement(PersonRulesDesk, { ...base, commitments: commit([]), scheduleRules: rules([]), readOnly: true }));
    expect(html).not.toContain("Dán từ sheet");
    expect(html).toContain("Chưa có luật riêng");
  });
});
