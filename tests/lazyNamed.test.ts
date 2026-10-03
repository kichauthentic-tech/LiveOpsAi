// lazyNamed: chunk đã tải xong thì render thẳng, không treo qua Suspense (2026-10-04).
// Chạy: npx vitest run tests/lazyNamed.test.ts
//
// Vì sao canh: React 19 giữ fallback của Suspense tối thiểu ~300 ms. React.lazy chưa từng render luôn treo
// một nhịp kể cả khi module đã có sẵn ⇒ mỗi lần mở app / đổi tab chậm thêm tới 300 ms (đo: màn bắt đầu đọc
// dữ liệu 308–330 ms sau khi bấm, không request, không long task). Sau bản vá: 8 ms.
import { createElement, Suspense } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { lazyNamed } from "../src/lib/lazyNamed";

const Hello = ({ who }: { who: string }) => createElement("b", null, `xin chào ${who}`);
const tick = () => new Promise((r) => setTimeout(r, 0));
const render = (C: ReturnType<typeof makeLazy>) =>
  renderToString(createElement(Suspense, { fallback: createElement("i", null, "đang tải") }, createElement(C, { who: "ops" })));
const makeLazy = () => lazyNamed(async () => ({ Hello }), "Hello");

test("chưa tải: đi qua lazy ⇒ hiện fallback", () => {
  expect(render(makeLazy())).toContain("đang tải");
});

test("đã preload xong: render thẳng nội dung, không fallback", async () => {
  const C = makeLazy();
  C.preload();
  await tick();
  const html = render(C);
  expect(html).toContain("xin chào ops");
  expect(html).not.toContain("đang tải");
});

test("module lỗi thì lần preload sau thử tải lại (không giữ promise hỏng)", async () => {
  let calls = 0;
  const C = lazyNamed(async () => {
    calls++;
    if (calls === 1) throw new Error("mạng rớt");
    return { Hello };
  }, "Hello");
  C.preload();
  await tick();
  C.preload();
  await tick();
  expect(calls).toBe(2);
  expect(render(C)).toContain("xin chào ops");
});
