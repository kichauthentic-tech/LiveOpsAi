import React, { useEffect, useRef, useState } from "react";

/**
 * Mục lục dính cho trang dài (05/11, user chốt sau đề xuất bố cục). Đo 1440×900: Dashboard brand 6,2 màn, AI Training 3,7
 * màn — muốn xem "Nhân sự live" phải cuộn qua mọi khối phía trên. Đặt <SectionNav /> ngay dưới PageHeader: thanh tự tìm
 * các khối có `data-section="Tên ngắn"` trong cùng trang (BlockHead/Sect có prop `nav`), dính mép trên khi cuộn, tô phần
 * đang xem, bấm thì nhảy tới. Chỉ hiện khi trang dài hơn 3 màn và có từ 2 phần — trang ngắn không thêm một hàng thừa.
 * Report Tháng có thanh riêng (PageRail, mỗi trang một màn) nên không dùng thanh này.
 */
type Item = { label: string; el: HTMLElement };

const MIN_SCREENS = 3;

export const SectionNav: React.FC = () => {
  const ref = useRef<HTMLElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [long, setLong] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const clicked = useRef<string | null>(null);

  // Dữ liệu nạp sau và tab đổi khối ⇒ quét lại khi cây con của trang đổi (gom 250ms), chỉ setState khi danh sách khác.
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const scroller = host.closest("main");
    let timer = 0;
    const scan = () => {
      const els = [...host.querySelectorAll<HTMLElement>("[data-section]")].filter((el) => el.offsetParent !== null);
      setItems((prev) =>
        prev.length === els.length && prev.every((p, i) => p.el === els[i] && p.label === els[i].dataset.section)
          ? prev
          : els.map((el) => ({ label: el.dataset.section ?? "", el }))
      );
      if (scroller) setLong(scroller.scrollHeight > scroller.clientHeight * MIN_SCREENS);
    };
    scan();
    const mo = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 250);
    });
    mo.observe(host, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  // Phần đang xem = phần cuối cùng có mép trên đã lên tới đáy thanh. Ở đáy trang các phần cuối không cuộn lên tới thanh được
  // nữa ⇒ lấy phần đầu tiên còn nằm trọn dưới thanh (bấm "Nhân sự" ở cuối trang thì sáng đúng "Nhân sự", không kẹt ở phần trước).
  useEffect(() => {
    const scroller = ref.current?.closest("main");
    if (!scroller || items.length === 0) return;
    const onScroll = () => {
      const bottom = ref.current?.getBoundingClientRect().bottom ?? 0;
      let cur = items[0].label;
      for (const it of items) if (it.el.getBoundingClientRect().top <= bottom + 12) cur = it.label;
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
        const below = items.filter((it) => it.el.getBoundingClientRect().top > bottom + 12);
        const pick = below.find((it) => it.label === clicked.current) ?? below[0];
        if (pick) cur = pick.label;
      }
      setCurrent(cur);
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [items]);

  const show = long && items.length >= 2;
  return (
    <nav
      ref={ref}
      hidden={!show}
      aria-label="Các phần của trang"
      // -top/-mx bù đúng padding của <main> (p-3 / sm:p-6) để thanh dính sát mép và phủ hết bề ngang.
      className="sticky -top-3 sm:-top-6 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 flex items-center gap-1 overflow-x-auto bg-[var(--surface-base)]/95 backdrop-blur border-b border-[var(--border)]"
    >
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          onClick={() => {
            clicked.current = it.label;
            setCurrent(it.label);
            it.el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          aria-current={current === it.label ? "location" : undefined}
          className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-1 text-xs ${
            current === it.label ? "seg-on" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
};
