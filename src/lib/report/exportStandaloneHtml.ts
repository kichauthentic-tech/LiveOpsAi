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

export interface ChartTip {
  /** Hướng quét: tooltip đổi theo vị trí ngang (cột/đường theo ngày) hay dọc (thanh ngang theo nhóm). */
  axis: "x" | "y";
  /** [phần-trăm vị trí bắt đầu đoạn (0–1), HTML hộp tooltip ("" = không hiện)]. */
  seg: [number, string][];
}

/**
 * Tooltip biểu đồ do recharts vẽ bằng JS lúc rê chuột nên DOM tĩnh không có. Ở đây rê chuột giả qua từng biểu đồ trong khung ẩn,
 * ghi lại hộp tooltip theo vị trí, file xuất ra có script hiện lại đúng hộp đó khi rê chuột (mất đường/ô sáng nền của con trỏ).
 */
export async function captureChartTooltips(host: HTMLElement, stepPx = 10): Promise<Map<string, ChartTip>> {
  const out = new Map<string, ChartTip>();
  const wrappers = Array.from(host.querySelectorAll<HTMLElement>(".recharts-wrapper"));
  // React gộp các mousemove liên tiếp, chỉ vẽ trạng thái mới nhất mỗi khung hình ⇒ phải chờ 1 khung hình sau mỗi bước, không thì bỏ sót nhóm.
  // Tab đang ẩn thì rAF không chạy — dự phòng bằng setTimeout để không treo.
  const tick = () =>
    new Promise<void>((r) => {
      const t = setTimeout(r, 60);
      requestAnimationFrame(() => setTimeout(() => (clearTimeout(t), r()), 0));
    });
  const readTip = (w: HTMLElement): string => {
    const tw = w.querySelector<HTMLElement>(".recharts-tooltip-wrapper");
    if (!tw || tw.style.visibility === "hidden") return "";
    return tw.firstElementChild?.outerHTML ?? "";
  };
  for (const [i, w] of wrappers.entries()) {
    const svg = w.querySelector<SVGSVGElement>("svg.recharts-surface");
    if (!svg) continue;
    const rect = svg.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) continue;
    const sweep = async (axis: "x" | "y"): Promise<[number, string][]> => {
      const len = axis === "x" ? rect.width : rect.height;
      const seg: [number, string][] = [];
      for (let p = 0; p <= len; p += stepPx) {
        const cx = rect.left + (axis === "x" ? p : rect.width / 2);
        const cy = rect.top + (axis === "x" ? rect.height / 2 : p);
        w.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: cx, clientY: cy }));
        await tick();
        const html = readTip(w);
        if (!seg.length || seg[seg.length - 1][1] !== html) seg.push([p / len, html]);
      }
      return seg;
    };
    let axis: "x" | "y" = "x";
    let seg = await sweep("x");
    if (seg.filter(([, h]) => h).length <= 1) {
      const segY = await sweep("y");
      if (segY.filter(([, h]) => h).length > 1) {
        axis = "y";
        seg = segY;
      }
    }
    w.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    if (seg.some(([, h]) => h)) {
      const id = `t${i}`;
      w.setAttribute("data-tipid", id);
      out.set(id, { axis, seg });
    }
  }
  return out;
}

/**
 * Các bảng có tab (Host PFM, Key Metrics…) giữ tab đang chọn trong state React nên DOM tĩnh chỉ còn đúng 1 tab. Ở đây bấm lần lượt
 * từng tab thật trong khung ẩn, chụp HTML thân panel sau mỗi lần, để file xuất ra đổi tab được (script chuyển bản chụp).
 * Hàng tab = `.tabs` (demo.css) hoặc `role=tablist`; panel = khối `.pn` gần nhất bọc nó. Không bắt component khai báo gì thêm.
 */
export async function captureTabVariants(host: HTMLElement): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const lists = Array.from(host.querySelectorAll<HTMLElement>('.tabs, [role="tablist"]'));
  for (const [gi, list] of lists.entries()) {
    const panel = list.closest<HTMLElement>(".pn");
    if (!panel || panel.hasAttribute("data-tabgroup")) continue;
    const tabsOf = () => Array.from(panel.querySelectorAll<HTMLButtonElement>(".tabs button, [role='tablist'] button"));
    const id = `g${gi}`;
    panel.setAttribute("data-tabgroup", id);
    const tabCount = tabsOf().length;
    const variants: string[] = [];
    for (let i = 0; i < tabCount; i++) {
      const tab = tabsOf()[i];
      if (!tab || tab.disabled) {
        variants.push("");
        continue;
      }
      tab.click();
      await new Promise((r) => setTimeout(r, 700));
      variants.push(panel.innerHTML);
    }
    // Về tab đầu như lúc mở.
    tabsOf()[0]?.click();
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

/** Chiều rộng trang PDF — bằng khung đọc của report trên màn hình rộng. */
export const PDF_PAGE_WIDTH = 1280;

/**
 * In ra PDF, Chrome tính @media theo khổ giấy mặc định (~816px) nên report tự co về bố cục điện thoại (KPI 2 cột, bảng cuộn ngang bị cắt).
 * Ở đây tính sẵn các @media theo chiều rộng thật: khối đúng điều kiện thì mở ra áp thẳng, khối sai thì bỏ. Chỉ đụng các @media chỉ có điều kiện chiều rộng.
 */
export function flattenWidthMedia(css: string, width: number): string {
  const re = /@media ([^{]*)\{/g;
  let out = "";
  let last = 0;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const cond = /^\s*(?:\(min-width: (\d+)px\)|\(max-width: (\d+)px\)|\(width >= ([\d.]+)rem\))\s*$/.exec(m[1]);
    if (!cond) continue;
    let depth = 1;
    let j = re.lastIndex;
    for (; depth && j < css.length; j++) depth += (css[j] === "{" ? 1 : 0) - (css[j] === "}" ? 1 : 0);
    const ok = cond[1] ? width >= Number(cond[1]) : cond[2] ? width <= Number(cond[2]) : width >= Number(cond[3]) * 16;
    out += css.slice(last, m.index) + (ok ? css.slice(re.lastIndex, j - 1) : "");
    last = j;
    re.lastIndex = j;
  }
  return out + css.slice(last);
}

// Bản in: mỗi trang report = đúng 1 trang PDF cao vừa nội dung (khổ giấy riêng theo trang, đặt ở __preparePdf) nên không có chỗ ngắt
// cắt ngang biểu đồ/bảng/khung Insight. Mọi tab của bảng có tab in nối tiếp (mỗi bản tự có hàng tab đang sáng làm nhãn).
const PDF_RULES = `html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0}
nav[aria-label="Các trang của report"],[data-pager]{display:none!important}
#report-root,.pdf-sections{padding:0!important;gap:0!important;max-width:none!important}
section[id^=mr-]{display:block!important;margin:0 16px!important;padding-top:16px}
[data-variant][hidden]{display:block!important}
[data-variant]+[data-variant]{margin-top:12px}
.rt .tw,.rt [style*="overflow"]{overflow:visible!important}`;
const PDF_PAGE_SLACK = 48;

/** In file xuất ra PDF qua hộp thoại in của trình duyệt (iframe ẩn). Tên file gợi ý trong hộp thoại lấy từ title của trang đang mở nên đổi tạm title. */
export async function printStandaloneHtml(html: string, fileBase: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${PDF_PAGE_WIDTH}px;height:900px;border:0;pointer-events:none`;
  frame.srcdoc = html;
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
  });
  await new Promise((r) => setTimeout(r, 600));
  const win = frame.contentWindow as (Window & { __preparePdf?: () => void }) | null;
  if (!win?.__preparePdf) {
    frame.remove();
    throw new Error("Không dựng được bản in PDF");
  }
  win.__preparePdf();
  const prevTitle = document.title;
  document.title = fileBase;
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    document.title = prevTitle;
    frame.remove();
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  win.focus();
  win.print();
  setTimeout(cleanup, 60_000);
}

export function buildStandaloneHtml(root: HTMLElement, title: string, tabVariants: Map<string, string[]> = new Map(), chartTips: Map<string, ChartTip> = new Map(), pdf = false, heading = ""): string {
  const clone = root.cloneNode(true) as HTMLElement;
  // Khung ẩn ngoài màn hình (fixed, left −10000px) không được theo vào file.
  clone.removeAttribute("style");
  clone.removeAttribute("aria-hidden");
  // Mỗi tab một bản chụp (data-variant = số thứ tự tab); script bật bản được chọn. Tab không bấm được (chưa có phiên) bỏ qua.
  // PDF: không gắn `hidden` — preflight Tailwind v4 có `[hidden]{display:none!important}` trong @layer base, mà !important trong layer
  // thắng !important ngoài layer, nên luật "in mọi tab" của PDF_RULES không mở lại được (30/10: PDF chỉ ra tab đầu của Key Metrics/Host PFM).
  tabVariants.forEach((variants, id) => {
    const panel = clone.querySelector<HTMLElement>(`[data-tabgroup="${id}"]`);
    if (!panel) return;
    panel.innerHTML = variants.map((html, i) => (html ? `<div data-variant="${i}"${i === 0 || pdf ? "" : " hidden"}>${html}</div>` : "")).join("");
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
  clone.querySelector("section[id^=mr-]")?.parentElement?.classList.add("pdf-sections");
  // PDF: dòng mở đầu ở đầu trang 1 (nằm trong section nên được tính vào chiều cao trang khi đo @page).
  if (pdf && heading) {
    const first = clone.querySelector<HTMLElement>("section[id^=mr-]");
    if (first) {
      const h = document.createElement("div");
      h.style.cssText = `padding:20px 20px 12px;margin-bottom:8px;border-bottom:2px solid ${PAL.gold};font-size:22px;font-weight:800;letter-spacing:.2px;color:${PAL.cream}`;
      h.textContent = heading;
      first.insertBefore(h, first.firstChild);
    }
  }

  const tipData = JSON.stringify(Object.fromEntries(chartTips)).replace(/</g, "\\u003c");
  const script = `
(function(){var T=JSON.parse(document.getElementById('tipdata').textContent);
var tip=document.createElement('div');tip.style.cssText='position:fixed;z-index:99999;pointer-events:none;display:none';document.body.appendChild(tip);
document.querySelectorAll('[data-tipid]').forEach(function(w){var d=T[w.getAttribute('data-tipid')];var svg=w.querySelector('svg');if(!d||!svg)return;
w.addEventListener('mousemove',function(e){var r=svg.getBoundingClientRect();var f=d.axis==='x'?(e.clientX-r.left)/r.width:(e.clientY-r.top)/r.height;var h='';
for(var i=0;i<d.seg.length;i++){if(d.seg[i][0]<=f)h=d.seg[i][1];else break;}
if(!h){tip.style.display='none';return;}
tip.innerHTML=h;tip.style.display='block';var x=e.clientX+14,y=e.clientY+14;var tw=tip.offsetWidth,th=tip.offsetHeight;
if(x+tw>window.innerWidth-8)x=e.clientX-tw-14;if(y+th>window.innerHeight-8)y=e.clientY-th-14;tip.style.left=Math.max(4,x)+'px';tip.style.top=Math.max(4,y)+'px';});
w.addEventListener('mouseleave',function(){tip.style.display='none';});});})();
document.querySelectorAll('[data-tabgroup]').forEach(function(g){g.addEventListener('click',function(e){
  var t=e.target.closest('.tabs button,[role=tab]');if(!t||t.disabled)return;
  var tabs=[].slice.call(t.parentElement.querySelectorAll('button'));var idx=tabs.indexOf(t);
  var v=g.querySelector('[data-variant="'+idx+'"]');if(!v)return;
  g.querySelectorAll('[data-variant]').forEach(function(x){x.hidden=x!==v;});
});});
(function(){var secs=[].slice.call(document.querySelectorAll('section[id^=mr-]'));var rail=[].slice.call(document.querySelectorAll('[data-rail]'));
if(!secs.length||!rail.length)return;
var ids=rail.map(function(b){return b.getAttribute('data-rail');});
var pager=document.createElement('div');pager.style.cssText='display:flex;justify-content:space-between;gap:12px;padding:16px 20px 20px;margin-top:8px;border-top:1px solid ${PAL.line}';
var host=secs[0].parentElement;host.appendChild(pager);pager.style.order=99;pager.setAttribute('data-pager','');
var btn=function(label,id){var b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='background:none;border:0;cursor:pointer;font:inherit;font-size:12px;font-weight:700;color:${PAL.gold};padding:0';b.onclick=function(){show(id,true);};return b;};
function show(id,scroll){var i=ids.indexOf(id);if(i<0){id=ids[0];i=0;}
  secs.forEach(function(s){s.style.display=s.id==='mr-'+id?'':'none';});
  rail.forEach(function(b){var on=b.getAttribute('data-rail')===id;if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');b.style.color=on?'${PAL.gold}':'${PAL.muted}';b.style.background=on?'${PAL.panel2}':'transparent';});
  pager.innerHTML='';var lab=function(j){return rail[j].textContent.replace(/^\\d+/,'').trim();};
  if(i>0)pager.appendChild(btn('‹ Trang trước · '+lab(i-1),ids[i-1]));else pager.appendChild(document.createElement('span'));
  if(i<ids.length-1)pager.appendChild(btn('Trang sau · '+lab(i+1)+' ›',ids[i+1]));
  try{history.replaceState(null,'','#mr-'+id);}catch(e){}
  if(scroll)window.scrollTo(0,0);
  var cur=rail[i];if(cur&&cur.parentElement.scrollWidth>cur.parentElement.clientWidth)cur.parentElement.scrollTo({left:Math.max(0,cur.offsetLeft-12)});}
rail.forEach(function(b){b.addEventListener('click',function(){show(b.getAttribute('data-rail'),true);});});
var m=/^#mr-(\\w+)/.exec(location.hash);show(m?m[1]:ids[0],false);
})();`;

  // Đo chiều cao từng trang bằng chính luật in (áp tạm không bọc @media print) rồi ghi @page riêng cho từng trang.
  const pdfScript = `window.__preparePdf=function(){var st=document.createElement('style');st.textContent=${JSON.stringify(PDF_RULES).replace(/</g, "\\u003c")};document.head.appendChild(st);
var css='@page{size:${PDF_PAGE_WIDTH}px 800px;margin:0}';
document.querySelectorAll('section[id^=mr-]').forEach(function(s){var n=s.id.slice(3);var h=Math.ceil(s.getBoundingClientRect().height)+${PDF_PAGE_SLACK};css+='@page p_'+n+'{size:${PDF_PAGE_WIDTH}px '+h+'px;margin:0}#'+s.id+'{page:p_'+n+'}';});
st.remove();var p=document.createElement('style');p.textContent=css;document.head.appendChild(p);};`;

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
${pdf ? flattenWidthMedia(collectCss(), PDF_PAGE_WIDTH) : collectCss()}
html,body{margin:0;background:${PAL.bg};color:${PAL.cream};font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
#report-root{max-width:1180px;margin:0 auto;padding:12px}
nav[aria-label="Các trang của report"]{top:0!important}
svg.recharts-surface{width:100%;height:auto;max-width:100%}
@media print{nav[aria-label="Các trang của report"]{position:static!important}section[id^=mr-]{display:block!important}}
@media print{${PDF_RULES}}
</style>
</head>
<body>
<div id="report-root">${clone.outerHTML}</div>
<script type="application/json" id="tipdata">${tipData}</script>
<script>${script}</script>
${pdf ? `<script>${pdfScript}</script>` : ""}
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
