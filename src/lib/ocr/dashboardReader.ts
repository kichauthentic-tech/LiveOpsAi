// Đọc số từ ảnh chụp trang "Tổng quan dữ liệu LIVE" của TikTok Shop (01/11/2026). Hàm thuần: nhận các từ + khung chữ nhật tesseract trả về
// (components/control-room/DashboardShot.tsx chạy OCR NGAY TRONG trình duyệt, ảnh không rời máy) rồi tìm số dưới từng nhãn.
// Đo trên ảnh thật (đảo màu + phóng 2 lần, chế độ chữ rời): GMV, đơn, thời lượng, LIVE CTR đọc đúng; Views/Impressions/Chi phí ads hay mất chữ K
// hoặc sai 1 chữ số (8 → a). Nên mọi số đọc kiểu đoán đều gắn `guessed` để UI tô vàng, và OP luôn sửa được trước khi dùng.

export interface OcrWord { text: string; x0: number; y0: number; x1: number; y1: number }
export interface Reading { value: number; guessed: boolean; raw: string }
export interface DashboardReading {
  /** Sàn đoán được từ chữ trên ảnh; không nhận ra ⇒ vắng (UI xử lý như sàn của nhóm đang chọn). */
  platform?: "TikTok" | "Shopee";
  gmv?: Reading;
  impressions?: Reading;
  views?: Reading;
  ads?: Reading;
  orders?: Reading;
  /** LIVE CTR, % (click sản phẩm / lượt xem). */
  liveCtr?: Reading;
  /** Shopee: CTR (click / views) và Click to Order Rate (đơn / click), % — số Dashboard tự tính, app chưa có lịch sử để so. */
  ctr?: Reading;
  co?: Reading;
  /** Shopee: Avg. Viewing Duration, giây. */
  watchSeconds?: Reading;
  /** Thời lượng live, phút. */
  minutes?: Reading;
}

const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const hasDigit = (s: string) => /\d/.test(s);
const hOf = (w: OcrWord) => Math.max(1, w.y1 - w.y0);

/**
 * Chữ OCR hay nhầm trong một số: o→0, a→8 (chỉ khi token đã có ≥ 2 chữ số, hoặc bắt đầu bằng chữ số và kết thúc bằng K/M như "4sak" = 4.34K),
 * s/l/i→5/1/1. Trả cờ có sửa hay không.
 */
function cleanNumeric(raw: string): { s: string; fixed: boolean } {
  let fixed = false;
  const digits = (raw.match(/\d/g) ?? []).length;
  const unitTail = /^\d[a-z\d.,]*[kmb]$/i.test(raw);
  const s = raw.toLowerCase().replace(/[oOaAlIsS]/g, (c) => {
    if (digits < 2 && !unitTail && !/[oO]/.test(c)) return c;
    fixed = true;
    return { o: "0", a: "8", l: "1", i: "1", s: "5" }[c.toLowerCase() as "o"] ?? c;
  });
  return { s, fixed };
}

const MULT: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, x: 1e3 }; // "x" là chữ K bị đọc lệch

/**
 * Số đếm/tiền kiểu Dashboard: "3,236,853" (dấu phẩy nghìn), "1.69K", "1.09M", "12". `kUnit` = cột thường hiển thị K khi lớn
 * (Views/Impressions/Chi phí ads): số có phần thập phân nhỏ mà không thấy đơn vị ⇒ đoán là K và gắn cờ.
 */
export function parseDashNumber(rawIn: string, kUnit = false): Reading | null {
  const { s, fixed } = cleanNumeric(rawIn.replace(/\s+/g, ""));
  const m = s.match(/^(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)([kmbx])?/);
  if (!m) return null;
  const num = m[1];
  const unit = m[2];
  const thousands = /^\d{1,3}(?:[.,]\d{3})+$/.test(num) && !unit;
  const value = thousands ? Number(num.replace(/[.,]/g, "")) : Number(num.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  // Dashboard luôn hiện K/M với 2 số thập phân ("4.34K", "2.22M"); OCR hay rơi dấu chấm ("434k", "222M") ⇒ chèn lại trước 2 chữ số cuối, gắn cờ đoán.
  if (unit && kUnit && /^\d{3,}$/.test(num)) return { value: (Number(num) / 100) * MULT[unit], guessed: true, raw: rawIn };
  if (unit) return { value: value * MULT[unit], guessed: fixed || unit === "x", raw: rawIn };
  if (kUnit && !thousands && /[.,]\d{1,2}$/.test(num)) return { value: value * 1e3, guessed: true, raw: rawIn };
  // Còn chữ số/đơn vị sau phần đã đọc ("106z4k"): số đọc được không chắc.
  return { value, guessed: fixed || /[\dkmb]/.test(s.slice(m[0].length)), raw: rawIn };
}

/**
 * "41 93%", "41,93%", "1.76%" → 41,93 / 1,76. Không thấy dấu % thì null. Dashboard hiện % với 2 số thập phân: OCR rơi dấu phẩy ("194%", "046%",
 * "4193%") ⇒ chèn lại trước 2 chữ số cuối và gắn cờ đoán; chữ nhầm trong số ("0,s4%") sửa như số đếm.
 */
export function parseDashPercent(raw: string): Reading | null {
  const { s, fixed } = cleanNumeric(raw.replace(/\s+/g, " "));
  const m = s.match(/(\d+)(?:[\s.,]+(\d{1,2}))?\s*%/);
  if (!m) return null;
  const lost = m[2] == null && (m[1].length >= 3 || (m[1].length >= 2 && m[1][0] === "0"));
  const v = lost ? Number(m[1]) / 100 : Number(`${m[1]}.${m[2] ?? "0"}`);
  return Number.isFinite(v) && v <= 100 ? { value: v, guessed: fixed || lost, raw } : null;
}

/** Vị trí bắt đầu của chuỗi nhãn (đã bỏ dấu) trong dãy từ liền nhau trên cùng một dòng. */
function findLabels(words: OcrWord[], seq: string[]): OcrWord[][] {
  const out: OcrWord[][] = [];
  for (let i = 0; i < words.length; i++) {
    if (norm(words[i].text) !== seq[0]) continue;
    const hit = [words[i]];
    for (let k = 1; k < seq.length; k++) {
      const next = words.find((w) => !hit.includes(w) && norm(w.text) === seq[k] && Math.abs(w.y0 - words[i].y0) < hOf(words[i]) && w.x0 >= hit[hit.length - 1].x1 - 5 && w.x0 - hit[hit.length - 1].x1 < hOf(words[i]) * 3);
      if (!next) break;
      hit.push(next);
    }
    if (hit.length === seq.length) out.push(hit);
  }
  return out;
}

const box = (ws: OcrWord[]) => ({ x0: Math.min(...ws.map((w) => w.x0)), y0: Math.min(...ws.map((w) => w.y0)), x1: Math.max(...ws.map((w) => w.x1)), y1: Math.max(...ws.map((w) => w.y1)) });

/** Các từ có chữ số nằm ngay dưới nhãn (cách tối đa `rows` lần chiều cao nhãn), gộp các từ sát nhau trên cùng dòng đầu tiên. */
function valueBelow(words: OcrWord[], label: { x0: number; y1: number; x1: number }, labelH: number, opts: { rows?: number; leftAligned?: boolean } = {}): string | null {
  const rows = opts.rows ?? 3.5;
  const tol = opts.leftAligned === false ? Infinity : Math.max(80, (label.x1 - label.x0) * 0.8);
  const inBand = words
    .filter((w) => hasDigit(w.text) && w.y0 >= label.y1 - labelH * 0.3 && w.y0 <= label.y1 + labelH * rows)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const cand = inBand.filter((w) => opts.leftAligned === false || Math.abs(w.x0 - label.x0) <= tol);
  if (!cand.length) return null;
  const first = cand[0];
  // Các từ sau (phần thập phân, chữ K/M) có thể lệch ngang quá ngưỡng nhãn nên lấy từ cả dải, bắt đầu tại từ đầu tiên.
  const line = inBand.filter((w) => Math.abs(w.y0 - first.y0) < labelH * 1.3 && w.x0 >= first.x0 - 5).sort((a, b) => a.x0 - b.x0);
  let out = line[0].text;
  for (let i = 1; i < line.length; i++) {
    if (line[i].x0 - line[i - 1].x1 > labelH * 1.5) break;
    // "537" + "51K": dấu chấm thập phân bị rơi giữa hai từ.
    const dotLost = /^\d{1,3}$/.test(line[i - 1].text) && /^\d{2}[a-zA-Z]?$/.test(line[i].text) && !/%/.test(line[i].text);
    out += dotLost ? `.${line[i].text}` : ` ${line[i].text}`;
  }
  return out;
}

/**
 * Ô chữ: các từ liền nhau trên cùng một dòng; khoảng trống ngang > 2,5 lần chiều cao chữ là sang ô khác (cột KPI cách nhau vài trăm px).
 * `key` = chữ đã bỏ dấu, chỉ giữ chữ + số, viết liền ⇒ khớp được cả khi OCR dính chữ ("Lượthiền thi") hay tách số ("4" "34k").
 */
interface Cell { text: string; key: string; x0: number; y0: number; x1: number; y1: number }
function cellsOf(words: OcrWord[]): Cell[] {
  const mid = (w: OcrWord) => (w.y0 + w.y1) / 2;
  const lines: OcrWord[][] = [];
  for (const w of [...words].sort((a, b) => mid(a) - mid(b))) {
    const line = lines.find((l) => Math.abs(mid(l[0]) - mid(w)) < Math.min(hOf(l[0]), hOf(w)) * 0.5);
    if (line) line.push(w); else lines.push([w]);
  }
  const out: Cell[] = [];
  for (const line of lines) {
    const ws = line.sort((a, b) => a.x0 - b.x0);
    let cur: OcrWord[] = [];
    const flush = () => {
      if (!cur.length) return;
      const text = cur.map((w) => w.text).join(" ");
      out.push({ text, key: norm(text).replace(/[^a-z0-9]/g, ""), ...box(cur) });
      cur = [];
    };
    for (const w of ws) {
      const prev = cur[cur.length - 1];
      if (prev && w.x0 - prev.x1 > Math.max(hOf(prev), hOf(w)) * 2.5) flush();
      cur.push(w);
    }
    flush();
  }
  return out;
}

/**
 * Số dưới ô nhãn (lưới KPI TikTok: nhãn chữ nhỏ, số to ngay dưới, căn trái). Nhãn trùng ở chú thích biểu đồ/bảng ⇒ lấy ứng viên có số CAO CHỮ nhất
 * (số KPI to hơn số trong bảng), không dựa vào thứ tự cột (Seller Center: Lượt xem · Lượt hiển thị; LIVE Center: Lượt hiển thị · Lượt xem).
 */
function readCell(cells: Cell[], label: (key: string) => boolean, parse: (text: string) => Reading | null): Reading | undefined {
  let top: { r: Reading; h: number } | null = null;
  for (const l of cells.filter((c) => label(c.key))) {
    const h = l.y1 - l.y0, tol = Math.max(h * 2, (l.x1 - l.x0) * 0.8);
    const v = cells
      .filter((c) => /\d/.test(c.text) && c !== l && c.y0 >= l.y1 - h * 0.3 && c.y0 <= l.y1 + h * 3.5 && Math.abs(c.x0 - l.x0) <= tol)
      .sort((a, b) => a.y0 - b.y0)[0];
    const r = v ? parse(v.text) : null;
    if (v && r && (!top || v.y1 - v.y0 > top.h)) top = { r, h: v.y1 - v.y0 };
  }
  return top?.r;
}

/** Số tiền có dấu phẩy nghìn mà OCR tách làm hai từ ("21,808," + "103") ⇒ ghép lại theo dòng. */
function joinThousands(words: OcrWord[], first: OcrWord): string {
  let joined = first.text, edge = first.x1;
  for (const w of words.filter((x) => x !== first && /^\d{3}(?:[.,]\d{3})*[.,]?$/.test(x.text) && x.x0 >= edge - 5 && x.x0 - edge < hOf(first) * 1.2 && x.y1 > first.y0 && x.y0 < first.y1).sort((a, c) => a.x0 - c.x0)) {
    if (!/[.,]$/.test(joined)) break;
    joined += w.text; edge = w.x1;
  }
  return joined.replace(/[.,]$/, "");
}

/** Số có chữ số nằm ngay dưới nhãn, nhãn và số CĂN GIỮA nhau (Shopee) nên so theo phần giao nhau theo chiều ngang, không theo mép trái. */
function centeredBelow(words: OcrWord[], label: { x0: number; x1: number; y1: number }, h: number, rows = 3.5): OcrWord | null {
  const m = h * 0.5;
  const c = words
    .filter((w) => hasDigit(w.text) && !/[\u0111\u20ab]/i.test(w.text) && w.y0 >= label.y1 - h * 0.3 && w.y0 <= label.y1 + h * rows && w.x1 >= label.x0 - m && w.x0 <= label.x1 + m)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return c[0] ?? null;
}

/** Dashboard "Shopee Live Dashboard" (Real-time Insight): nhãn tiếng Anh trên số. Nhãn trùng ở biểu đồ/menu ⇒ lấy ứng viên có số CAO CHỮ nhất (ô KPI to hơn chú thích). */
function readShopee(text: string, words: OcrWord[]): DashboardReading {
  const out: DashboardReading = { platform: "Shopee" };
  const best = (seq: string[]): Reading | undefined => {
    let top: { r: Reading; h: number } | null = null;
    for (const l of findLabels(words, seq)) {
      const b = box(l), h = hOf(l[0]);
      const v = centeredBelow(words, b, h, 4);
      const r = v ? parseDashNumber(v.text) : null;
      if (v && r && (!top || hOf(v) > top.h)) top = { r, h: hOf(v) };
    }
    return top?.r;
  };
  out.gmv = best(["sales"]);
  out.views = best(["total", "views"]);
  out.orders = best(["orders"]);
  // CTR và Click to Order Rate: Shopee hiện 1 số thập phân, ký hiệu % hay bị đọc thành "4" hoặc "x" nên chỉ lấy "d,d" đầu và gắn cờ đoán.
  const loose = (seq: string[]): Reading | undefined => {
    for (const l of findLabels(words, seq)) {
      const b = box(l), h = hOf(l[0]);
      const v = centeredBelow(words, b, h, 3);
      const m = v?.text.match(/^(\d{1,2})[,.](\d)/);
      if (m) return { value: Number(`${m[1]}.${m[2]}`), guessed: true, raw: v!.text };
    }
    return undefined;
  };
  for (const l of findLabels(words, ["viewing", "duration"])) {
    const v = centeredBelow(words, box(l), hOf(l[0]), 3);
    const m = v?.text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (m) { out.watchSeconds = { value: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]), guessed: false, raw: v!.text }; break; }
  }
  out.ctr = loose(["ctr"]);
  out.co = loose(["click", "to", "order", "rate"]);
  // "Duration: 04:24:44" của ô LIVE Stream; bỏ "Avg. Viewing Duration 00:00:17" (thời lượng xem trung bình, không phải thời lượng live).
  for (const w of words) {
    if (norm(w.text).replace(/[:.]/g, "") !== "duration") continue;
    const prev = words.filter((x) => Math.abs(x.y0 - w.y0) < hOf(w) && x.x1 <= w.x0 + 2).sort((a, b) => b.x1 - a.x1)[0];
    if (prev && norm(prev.text).startsWith("viewing")) continue;
    const t = words.filter((x) => Math.abs(x.y0 - w.y0) < hOf(w) && x.x0 >= w.x1 - 2).sort((a, b) => a.x0 - b.x0).map((x) => x.text).join("");
    const m = t.match(/^(\d{1,3}):(\d{2}):(\d{2})/);
    if (m) { out.minutes = { value: Number(m[1]) * 60 + Number(m[2]) + (Number(m[3]) >= 30 ? 1 : 0), guessed: false, raw: m[0] }; break; }
  }
  return out;
}


/**
 * Dashboard TikTok đặt tiếng Anh ("LIVE Dashboard", Seller Center desktop — đo trên ảnh thật 01/11): ô GMV to ở giữa ("Attributed GMV" + số có dấu phẩy,
 * OCR hay tách "85,569," và "686"), lưới KPI 4 cột nhãn trên số: Impressions · Views · Ads Cost · GMV per hour / … / Tap-through rate · LIVE CTR · … /
 * AOV · Product Impressions · Attributed orders. "Attributed items sold" là số SẢN PHẨM, không phải đơn ⇒ đơn lấy ở "Attributed orders".
 * Nhãn trùng ở biểu đồ/bảng (Views, Impressions, Attributed GMV) ⇒ neo vào hàng "Ads Cost" (nhãn duy nhất) để chọn đúng cột.
 */
function readTikTokEnglish(text: string, words: OcrWord[]): DashboardReading {
  const out: DashboardReading = {};
  const dur = text.match(/(\d+)\s*(?:hours?|hrs?)\W*(\d+)\s*(?:minutes?|mins?)\W*(\d+)?/i);
  if (dur) out.minutes = { value: Number(dur[1]) * 60 + Number(dur[2]) + (Number(dur[3] ?? 0) >= 30 ? 1 : 0), guessed: false, raw: dur[0] };

  // GMV: số lớn nhất dưới nhãn "GMV" (ô to ở giữa); ghép các mảnh số cùng dòng ("85,569," + "686").
  let gmvBest: Reading | null = null;
  for (const l of findLabels(words, ["gmv"])) {
    const b = box(l), h = hOf(l[0]);
    const below = words.filter((w) => hasDigit(w.text) && w.y0 >= b.y1 - h * 0.3 && w.y0 <= b.y1 + h * 9 && w.x1 >= b.x0 - h * 6 && w.x0 <= b.x1 + h * 6).sort((a, c) => a.y0 - c.y0 || a.x0 - c.x0);
    const first = below.find((w) => /^\d{1,3}(?:[.,]\d{3})*[.,]?$/.test(w.text) && /[.,]/.test(w.text));
    if (!first) continue;
    const r = parseDashNumber(joinThousands(words, first));
    if (r && (!gmvBest || r.value > gmvBest.value)) gmvBest = r;
  }
  if (gmvBest) out.gmv = gmvBest;

  const ads = findLabels(words, ["ads", "cost"])[0] ?? findLabels(words, ["ad", "cost"])[0] ?? findLabels(words, ["ad", "spend"])[0];
  if (ads) {
    const a = box(ads), h = hOf(ads[0]);
    // Dashboard hiện K/M với 2 số thập phân; OCR rơi mất chữ số cuối ("3.41M" → "3.4m") nên 1 số thập phân + K/M ⇒ số đoán (tô vàng).
    const read = (l: { x0: number; y1: number; x1: number }) => {
      const v = valueBelow(words, l, h), r = v ? parseDashNumber(v, true) : null;
      return r ? { ...r, guessed: r.guessed || /^\d+[.,]\d[kmb]$/i.test(v!.replace(/\s+/g, "")) } : undefined;
    };
    out.ads = read(a);
    const row = words.filter((w) => Math.abs(w.y0 - a.y0) < h * 0.8 && w.x0 < a.x0 - 5 && ["views", "impressions"].includes(norm(w.text)));
    const imp = row.find((w) => norm(w.text) === "impressions"), views = row.find((w) => norm(w.text) === "views");
    if (imp) out.impressions = read({ x0: imp.x0, y1: imp.y1, x1: imp.x1 });
    if (views) out.views = read({ x0: views.x0, y1: views.y1, x1: views.x1 });
  }

  const ctr = findLabels(words, ["live", "ctr"])[0] ?? findLabels(words, ["livectr"])[0];
  if (ctr) {
    const b = box(ctr), v = valueBelow(words, b, hOf(ctr[0]));
    out.liveCtr = (v && parseDashPercent(v)) || undefined;
  }

  const ord = findLabels(words, ["attributed", "orders"])[0];
  if (ord) {
    const b = box(ord), v = valueBelow(words, b, hOf(ord[0]));
    out.orders = (v && parseDashNumber(v)) || undefined;
  }
  return out;
}

/** Nhận ra sàn theo chữ đặc trưng rồi đọc theo nhãn của sàn đó; bố cục (vị trí các ô) không được dùng, chỉ dùng quan hệ nhãn → số ngay dưới. */
export function readDashboard(text: string, words: OcrWord[]): DashboardReading {
  // Chữ "Total views"/"Viewing duration" cũng xuất hiện ở bảng sản phẩm/chú thích của Dashboard TikTok (01/11: ảnh TikTok bị báo là Shopee) ⇒ có chỉ số
  // đặc trưng TikTok (GMV, LIVE CTR, CTOR; Dashboard Shopee không có) thì KHÔNG phải Shopee.
  const tiktokSignature = /\bctor\b|live\s*ctr|\bgmv\b/i.test(text);
  if (!tiktokSignature && /real-?time\s+insight|total\s+views|viewing\s+duration/i.test(text)) return readShopee(text, words);
  // TikTok tiếng Anh ("LIVE Dashboard" + "Attributed GMV"/"Ads Cost"): bộ đọc riêng, nhãn khác hẳn bản tiếng Việt.
  if (/attributed\s+gmv|ads\s+cost|attributed\s+orders/i.test(text)) return readTikTokEnglish(text, words);
  const out: DashboardReading = {};

  // Tiếng Việt "2 giờ 58 phút" · tiếng Anh "2 hours 58 minutes" / "2h 58m" / "58 min" (Seller Center đặt tiếng Anh, 01/11).
  // Bỏ chú thích biểu đồ "khoảng thời gian 5 phút" (06/11: màn LIVE Center không hiện thời lượng, app lấy nhầm số 5 này làm phút đã live).
  const t = text.replace(/kho[aả]ng\s+th[oờ]i\s+gian\s+\d+\s*ph[uú]t/gi, "");
  const dur = t.match(/(\d+)\s*gi[oờ]\S*[\s,]+(\d+)\s*ph[uú]t/i) ?? t.match(/(\d+)\s*(?:hours?|hrs?|h)\b[\s,]*(\d+)\s*(?:minutes?|mins?|m)\b/i)
    ?? t.match(/(\d+)\s*ph[uú]t/i) ?? t.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  if (dur) out.minutes = { value: dur.length > 2 ? Number(dur[1]) * 60 + Number(dur[2]) : Number(dur[1]), guessed: false, raw: dur[0] };

  // GMV: số lớn nhất (nhiều chữ số, có dấu phẩy nghìn) nằm dưới nhãn "GMV đã ghi nhận" — chữ giữa, nên không ràng vị trí ngang.
  const gmvLabels = [...findLabels(words, ["gmv", "da", "ghi", "nhan"]), ...findLabels(words, ["gmv"]).filter((l) => !findLabels(words, ["gmv", "da"]).some((v) => v[0] === l[0]))];
  let gmvBest: Reading | null = null;
  for (const l of gmvLabels) {
    const b = box(l);
    const h = hOf(l[0]);
    for (const w of words.filter((x) => /^\d{1,3}(?:[.,]\d{3})*[.,]?$/.test(x.text) && /[.,]/.test(x.text) && x.y0 >= b.y1 - h * 0.3 && x.y0 <= b.y1 + h * 9)) {
      const joined = joinThousands(words, w);
      const r = /^\d{1,3}(?:[.,]\d{3})+$/.test(joined) ? parseDashNumber(joined) : null;
      if (r && (!gmvBest || r.value > gmvBest.value)) gmvBest = r;
    }
  }
  if (gmvBest) out.gmv = gmvBest;

  // Lưới KPI: tìm theo chữ của ô nhãn (khớp lỏng, OCR hay dính/rơi chữ: "Lượthiền thi", "Ch phí quảng cáo", "CTR của UVE").
  const cells = cellsOf(words);
  const count = (x: string) => (/%/.test(x) ? null : parseDashNumber(x, true));
  const plain = (x: string) => (/%/.test(x) ? null : parseDashNumber(x));
  out.impressions = readCell(cells, (k) => /^(?!gpm)[a-z]{0,6}hienthi$|^(live)?impressions$/.test(k), count);
  out.views = readCell(cells, (k) => /^[a-z]{0,5}xem$|^(live)?views$/.test(k), count);
  out.ads = readCell(cells, (k) => /quangcao|^chiphi|^ads?(spend|cost)$/.test(k), count);
  out.liveCtr = readCell(cells, (k) => /^ctrcua|^ctroflive|^livectr$/.test(k), parseDashPercent);
  out.orders = readCell(cells, (k) => /^donhang(?!.*sku)|^(attributed)?orders$/.test(k), plain);
  // Màn LIVE Center không hiện thời lượng nhưng có ô "GMV/giờ" ⇒ phút đã live ≈ GMV ÷ GMV/giờ (số ước tính, tô vàng). OCR đọc "GMV/giờ" thành "@MYVv/giờ", "GMvgiờ"…
  if (!out.minutes && out.gmv) {
    const gph = readCell(cells, (k) => /^[a-z]{0,4}vgio{0,2}$|^gmvperhour$/.test(k), count);
    const m = gph && gph.value > 0 ? Math.round((out.gmv.value / gph.value) * 60) : 0;
    if (m >= 1 && m <= 24 * 60) out.minutes = { value: m, guessed: true, raw: `GMV ${out.gmv.raw} ÷ GMV/giờ ${gph!.raw}` };
  }
  // Lượt xem luôn ít hơn lượt hiển thị; ngược lại là đọc sai một trong hai ⇒ tô vàng cả hai.
  if (out.views && out.impressions && out.views.value > out.impressions.value) {
    out.views = { ...out.views, guessed: true };
    out.impressions = { ...out.impressions, guessed: true };
  }
  for (const k of Object.keys(out) as (keyof DashboardReading)[]) if (out[k] === undefined) delete out[k];
  return out;
}
