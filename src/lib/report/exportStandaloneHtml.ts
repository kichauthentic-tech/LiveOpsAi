import { PAL } from "../../components/brand-workspace/report/theme";

// Xuất Report Tháng ra MỘT file .html độc lập để gửi brand: giữ nguyên bố cục/biểu đồ của màn report, không còn tham chiếu
// tới app (không URL, không script của app, không title/favicon của app). Nguồn là DOM đã vẽ của bản "forBrand" (xem
// BrandMonthlyReport.tsx) nên nội dung = đúng cái brand thấy khi đăng nhập. Biểu đồ recharts là SVG ⇒ nhúng nguyên; chỉ mất
// tooltip khi rê chuột. <details> giữ nguyên cơ chế mở/gập của trình duyệt.

/** Chờ tới khi vùng vẽ ngừng đổi (các fetch nhỏ trong report xong) và không còn vòng quay tải. */
export async function waitForRender(root: HTMLElement, quietMs = 900, maxMs = 20000): Promise<void> {
  const start = Date.now();
  let last = Date.now();
  const obs = new MutationObserver(() => (last = Date.now()));
  obs.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  try {
    for (;;) {
      await new Promise((r) => setTimeout(r, 150));
      const busy = root.querySelector(".animate-spin") != null;
      const hasContent = (root.textContent?.length ?? 0) > 500;
      if (!busy && hasContent && Date.now() - last >= quietMs) return;
      if (Date.now() - start > maxMs) throw new Error("Report chưa vẽ xong sau 20 giây — thử lại.");
    }
  } finally {
    obs.disconnect();
  }
}

/**
 * Các bảng có tab (Host PFM, Key Metrics…) giữ tab đang chọn trong state React nên DOM tĩnh chỉ còn đúng 1 tab. Ở đây bấm lần lượt
 * từng tab thật trong khung ẩn, chụp HTML thân panel sau mỗi lần, để file xuất ra đổi tab được (script chuyển bản chụp).
 * Panel = khối bo tròn gần nhất bọc `role=tablist` (report/ui.tsx Panel). Không bắt component khai báo gì thêm.
 */
export async function captureTabVariants(host: HTMLElement): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const lists = Array.from(host.querySelectorAll<HTMLElement>('[role="tablist"]'));
  for (const [gi, list] of lists.entries()) {
    const panel = list.closest<HTMLElement>("div.overflow-hidden.rounded-2xl");
    if (!panel) continue;
    const id = `g${gi}`;
    panel.setAttribute("data-tabgroup", id);
    const tabCount = panel.querySelectorAll('[role="tab"]').length;
    const variants: string[] = [];
    for (let i = 0; i < tabCount; i++) {
      const tab = panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i];
      if (!tab || tab.disabled) {
        variants.push("");
        continue;
      }
      tab.click();
      await new Promise((r) => setTimeout(r, 700));
      variants.push(panel.innerHTML);
    }
    // Về tab đầu như lúc mở.
    panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0]?.click();
    await new Promise((r) => setTimeout(r, 300));
    out.set(id, variants);
  }
  return out;
}

const collectCss = (): string => {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
    } catch {
      // Stylesheet khác nguồn không đọc được — app chỉ dùng CSS cùng nguồn.
    }
  }
  return out.join("\n");
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export function buildStandaloneHtml(root: HTMLElement, title: string, tabVariants: Map<string, string[]> = new Map()): string {
  const clone = root.cloneNode(true) as HTMLElement;
  // Khung ẩn ngoài màn hình (fixed, left −10000px) không được theo vào file.
  clone.removeAttribute("style");
  clone.removeAttribute("aria-hidden");
  // Mỗi tab một bản chụp (data-variant = số thứ tự tab); script bật bản được chọn. Tab không bấm được (chưa có phiên) bỏ qua.
  tabVariants.forEach((variants, id) => {
    const panel = clone.querySelector<HTMLElement>(`[data-tabgroup="${id}"]`);
    if (!panel) return;
    panel.innerHTML = variants.map((html, i) => (html ? `<div data-variant="${i}"${i === 0 ? "" : " hidden"}>${html}</div>` : "")).join("");
  });

  clone.querySelectorAll("[data-export-hide], script, input, textarea").forEach((el) => el.remove());
  // Biểu đồ co theo chiều rộng khung đọc: recharts ghi cứng px ở SVG + hai lớp bọc. Có viewBox thì SVG tự giữ tỉ lệ khi co —
  // cho cả chuỗi bọc rộng 100%, cao theo SVG.
  clone.querySelectorAll<SVGSVGElement>("svg.recharts-surface").forEach((svg) => {
    const w = svg.getAttribute("width");
    const h = svg.getAttribute("height");
    if (w && h && !svg.getAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
    svg.removeAttribute("height");
    svg.setAttribute("width", "100%");
    svg.style.height = "auto";
    for (let el = svg.parentElement; el && !el.classList.contains("recharts-responsive-container"); el = el.parentElement) {
      el.style.width = "100%";
      el.style.height = "auto";
    }
    const box = svg.closest<HTMLElement>(".recharts-responsive-container");
    if (box) box.style.height = "auto";
  });
  clone.querySelectorAll(".recharts-tooltip-wrapper").forEach((el) => el.remove());

  const script = `
document.querySelectorAll('[data-tabgroup]').forEach(function(g){g.addEventListener('click',function(e){
  var t=e.target.closest('[role=tab]');if(!t||t.disabled)return;
  var tabs=[].slice.call(t.parentElement.querySelectorAll('[role=tab]'));var idx=tabs.indexOf(t);
  var v=g.querySelector('[data-variant="'+idx+'"]');if(!v)return;
  g.querySelectorAll('[data-variant]').forEach(function(x){x.hidden=x!==v;});
});});
document.querySelectorAll('[data-sec]').forEach(function(b){b.addEventListener('click',function(){
  var t=document.getElementById('mr-'+b.getAttribute('data-sec'));
  if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
  document.querySelectorAll('[data-sec]').forEach(function(x){x.removeAttribute('aria-current');x.style.color='${PAL.muted}';x.style.background='transparent';});
  b.setAttribute('aria-current','true');b.style.color='${PAL.gold}';b.style.background='${PAL.panel2}';
});});`;

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
${collectCss()}
html,body{margin:0;background:${PAL.bg};color:${PAL.cream};font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
#report-root{max-width:1180px;margin:0 auto;padding:12px}
#mr-toc{top:0!important}
svg.recharts-surface{width:100%;height:auto;max-width:100%}
@media print{#mr-toc{position:static!important}}
</style>
</head>
<body>
<div id="report-root">${clone.outerHTML}</div>
<script>${script}</script>
</body>
</html>`;
}

export function downloadHtml(filename: string, html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
