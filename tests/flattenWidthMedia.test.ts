import { describe, expect, it } from "vitest";
import { flattenWidthMedia } from "../src/lib/report/exportStandaloneHtml";

describe("flattenWidthMedia (PDF in theo chiều rộng thật, không theo khổ giấy mặc định)", () => {
  it("min-width đúng thì mở khối ra, sai thì bỏ", () => {
    const css = ".a{x:1}@media (min-width: 1150px) {.k{c:4}} @media (min-width: 1500px) {.k{c:9}}.b{y:2}";
    const out = flattenWidthMedia(css, 1280);
    expect(out).toContain(".k{c:4}");
    expect(out).not.toContain("c:9");
    expect(out).toContain(".a{x:1}");
    expect(out).toContain(".b{y:2}");
    expect(out).not.toContain("@media");
  });

  it("max-width: giữ khi rộng ≤ ngưỡng, bỏ khi rộng hơn", () => {
    const css = "@media (max-width: 1100px) {.g{d:1}}@media (max-width: 1300px) {.h{d:2}}";
    const out = flattenWidthMedia(css, 1280);
    expect(out).not.toContain(".g{");
    expect(out).toContain(".h{d:2}");
  });

  it("cú pháp Tailwind (width >= Nrem) và khối lồng nhau", () => {
    const css = "@media (width >= 80rem) {.x{a:1}@supports (a:b) {.y{b:2}}}@media (width >= 96rem) {.z{c:3}}";
    const out = flattenWidthMedia(css, 1280);
    expect(out).toContain(".x{a:1}@supports (a:b) {.y{b:2}}");
    expect(out).not.toContain(".z{");
  });

  it("để nguyên @media không chỉ có điều kiện chiều rộng (hover, print, reduced-motion)", () => {
    const css = "@media (hover: hover) {.h:hover{a:1}}@media print{.p{b:2}}";
    expect(flattenWidthMedia(css, 1280)).toBe(css);
  });
});
