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

/** Chữ OCR hay nhầm trong một số: o→0, a→8 (chỉ khi token đã có ≥ 2 chữ số), s/l/i→5/1/1. Trả cờ có sửa hay không. */
function cleanNumeric(raw: string): { s: string; fixed: boolean } {
  let fixed = false;
  const digits = (raw.match(/\d/g) ?? []).length;
  const s = raw.toLowerCase().replace(/[oOaAlIsS]/g, (c) => {
    if (digits < 2 && !/[oO]/.test(c)) return c;
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
  if (unit) return { value: value * MULT[unit], guessed: fixed || unit === "x", raw: rawIn };
  if (kUnit && !thousands && /[.,]\d{1,2}$/.test(num)) return { value: value * 1e3, guessed: true, raw: rawIn };
  return { value, guessed: fixed, raw: rawIn };
}

/** "41 93%", "41,93%", "1.76%" → 41,93 / 1,76. Không thấy dấu % thì null. */
export function parseDashPercent(raw: string): Reading | null {
  const m = raw.replace(/\s+/g, " ").match(/(\d{1,3})(?:[\s.,]+(\d{1,2}))?\s*%/);
  if (!m) return null;
  const v = Number(`${m[1]}.${m[2] ?? "0"}`);
  return Number.isFinite(v) && v <= 100 ? { value: v, guessed: false, raw } : null;
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
    let joined = first.text, edge = first.x1;
    for (const w of words.filter((x) => x !== first && /^\d{1,3}$/.test(x.text) && x.x0 >= edge - 5 && x.x0 - edge < hOf(first) * 1.2 && x.y1 > first.y0 && x.y0 < first.y1).sort((a, c) => a.x0 - c.x0)) {
      if (!/[.,]$/.test(joined)) break;
      joined += w.text; edge = w.x1;
    }
    const r = parseDashNumber(joined);
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
  const dur = text.match(/(\d+)\s*gi[oờ]\S*[\s,]+(\d+)\s*ph[uú]t/i) ?? text.match(/(\d+)\s*(?:hours?|hrs?|h)\b[\s,]*(\d+)\s*(?:minutes?|mins?|m)\b/i)
    ?? text.match(/(\d+)\s*ph[uú]t/i) ?? text.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  if (dur) out.minutes = { value: dur.length > 2 ? Number(dur[1]) * 60 + Number(dur[2]) : Number(dur[1]), guessed: false, raw: dur[0] };

  // GMV: số lớn nhất (nhiều chữ số, có dấu phẩy nghìn) nằm dưới nhãn "GMV đã ghi nhận" — chữ giữa, nên không ràng vị trí ngang.
  const gmvLabels = [...findLabels(words, ["gmv", "da", "ghi", "nhan"]), ...findLabels(words, ["gmv"]).filter((l) => !findLabels(words, ["gmv", "da"]).some((v) => v[0] === l[0]))];
  let gmvBest: Reading | null = null;
  for (const l of gmvLabels) {
    const b = box(l);
    const h = hOf(l[0]);
    for (const w of words.filter((x) => /^\d{1,3}(?:[.,]\d{3})+$/.test(x.text) && x.y0 >= b.y1 - h * 0.3 && x.y0 <= b.y1 + h * 9)) {
      const r = parseDashNumber(w.text);
      if (r && (!gmvBest || r.value > gmvBest.value)) gmvBest = r;
    }
  }
  if (gmvBest) out.gmv = gmvBest;

  // Hàng KPI 1: Lượt xem · Lượt hiển thị · Chi phí quảng cáo (cột theo thứ tự trái → phải; "hiển thị" hay bị đọc hỏng nên không dựa vào nó).
  const ads = findLabels(words, ["chi", "phi"])[0] ?? findLabels(words, ["ad", "spend"])[0] ?? findLabels(words, ["ads", "spend"])[0] ?? findLabels(words, ["ad", "cost"])[0] ?? findLabels(words, ["ads", "cost"])[0];
  if (ads) {
    const a = box(ads), h = hOf(ads[0]);
    const row = words.filter((w) => Math.abs(w.y0 - a.y0) < h * 0.8 && w.x0 < a.x0 - 5 && ["luot", "xem", "hien", "thi", "views", "live", "impressions"].includes(norm(w.text)));
    // Việt: mỗi cột bắt đầu bằng "Lượt"; Anh: cột 1 = "Views", cột 2 = "Impressions" (đứng sau chữ "LIVE" nếu có).
    const en = row.filter((w) => ["views", "impressions"].includes(norm(w.text)));
    const cols = (row.some((w) => norm(w.text) === "luot") ? row.filter((w) => norm(w.text) === "luot") : en).sort((x, y) => x.x0 - y.x0);
    if (cols[0]) {
      const v = valueBelow(words, { x0: cols[0].x0, y1: cols[0].y1, x1: cols[0].x1 + h * 3 }, h);
      out.views = (v && parseDashNumber(v, true)) || undefined;
    }
    if (cols[1]) {
      const v = valueBelow(words, { x0: cols[1].x0, y1: cols[1].y1, x1: cols[1].x1 + h * 3 }, h);
      out.impressions = (v && parseDashNumber(v, true)) || undefined;
    }
    const v = valueBelow(words, { x0: a.x0, y1: a.y1, x1: a.x1 }, h);
    out.ads = (v && parseDashNumber(v, true)) || undefined;
  }

  // LIVE CTR dưới nhãn "CTR của LIVE" (hàng KPI 2, cột đầu).
  const ctr = findLabels(words, ["ctr", "cua", "live"])[0] ?? findLabels(words, ["live", "ctr"])[0] ?? findLabels(words, ["ctr", "of", "live"])[0];
  if (ctr) {
    const b = box(ctr), h = hOf(ctr[0]);
    const v = valueBelow(words, { x0: b.x0, y1: b.y1, x1: b.x1 }, h);
    out.liveCtr = (v && parseDashPercent(v)) || undefined;
  }

  // Đơn hàng đã ghi nhận.
  const ord = findLabels(words, ["don", "hang", "da", "ghi"])[0] ?? findLabels(words, ["don", "hang"]).find((l) => l[0].y0 > 1000) ?? findLabels(words, ["don", "hang"])[0]
    ?? findLabels(words, ["orders"]).find((l) => l[0].y0 > 1000) ?? findLabels(words, ["orders"])[0];
  if (ord) {
    const b = box(ord), h = hOf(ord[0]);
    const v = valueBelow(words, { x0: b.x0, y1: b.y1, x1: b.x1 }, h);
    out.orders = (v && parseDashNumber(v)) || undefined;
  }
  return out;
}
