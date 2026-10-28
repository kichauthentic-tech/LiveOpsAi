// Bộ dựng SVG/bảng của bản demo Report Tháng (scratchpad/build/template.html), chuyển nguyên văn sang hàm thuần trả chuỗi HTML.
// Giữ y hệt demo — không tự chỉnh; muốn đổi giao diện thì đổi ở demo trước.
export const fmtM = (v: number) => { const a = Math.abs(v); const s = v < 0 ? "−" : ""; if (a >= 1e9) return s + (a / 1e9).toFixed(2).replace(".", ",") + "B"; if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace(".", ",").replace(/,0$/, "") + "M"; return s + Math.round(a / 1e3) + "K"; };
export const fmtP = (v: number, d = 0, sign = true) => (v < 0 ? "−" : sign && v > 0 ? "+" : "") + Math.abs(v).toFixed(d).replace(".", ",") + "%";
export const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c as "&" | "<" | ">"]));
export const num = (s: unknown) => parseFloat(String(s).replace("−", "-").replace(/\./g, "").replace(",", ".").replace("%", "").replace("+", ""));

// ---------- bảng ----------
export function tbl(head: string[], rows: any[], wideCols: number[] = []): string {
  const cls = (i: number) => (wideCols.includes(i) ? ' class="w"' : "");
  return `<thead><tr>${head.map((h: string, i: number) => `<th${cls(i)}>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r: any) => r.grp ? `<tr class="grp"><td colspan="${head.length}">${r.grp}</td></tr>` : `<tr${r.hl ? ' class="hl"' : ""}>${(r.c || r).map((c: any, i: number) => typeof c === "object" ? `<td class="${c.c || ""}${wideCols.includes(i) && !/\bw\b/.test(c.c || "") ? " w" : ""}"${c.s ? ` style="${c.s}"` : ""}>${c.t}</td>` : `<td${cls(i)}>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
}
export const ch = (txt: string, thr: number, neutral?: boolean): any => { const v = num(txt); if (isNaN(v)) return txt; const c = neutral || Math.abs(v) <= thr ? "nt" : v > 0 ? "up" : "dn"; return { t: txt, c }; };
export const pill = (t: string, k: string) => `<span class="pill ${k}">${t}</span>`;
export const W = (t: string) => ({ t, c: "w" });

// ---------- biểu đồ SVG ----------
export const TX = (x: number, y: number, t: string, o: any = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a || "middle"}" style="fill:${o.c || "var(--muted)"};font-size:${o.s || 11}px;font-weight:${o.w || 500}">${t}</text>`;
export const svg = (w: number, h: number, inner: string) => `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" style="display:block;height:auto">${inner}</svg>`;

// biểu đồ cầu: steps = [{l, v, t: "total"|"delta", txt}]
export function waterfall(steps: any[], o: any): string {
  const Wd = 640, H = o.h || 270, m = { l: 8, r: 8, t: 28, b: 46 };
  const pw = Wd - m.l - m.r, ph = H - m.t - m.b, n = steps.length, bw = (pw / n) * 0.6;
  const Y = (v: number) => m.t + ((o.max - v) / (o.max - o.min)) * ph;
  let cur = 0, out = `<line x1="${m.l}" x2="${Wd - m.r}" y1="${H - m.b}" y2="${H - m.b}" style="stroke:var(--line)"/>`;
  steps.forEach((s: any, i: number) => {
    const cx = m.l + (pw / n) * (i + 0.5);
    let a, b;
    if (s.t === "total") { a = o.min; b = s.v; cur = s.v; } else { a = cur; b = cur + s.v; cur = b; }
    const top = Y(Math.max(a, b)), bot = Y(Math.min(a, b));
    const col = s.t === "total" ? "var(--gold)" : s.v >= 0 ? "var(--green)" : "var(--red)";
    out += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(bot - top, 1.5)}" rx="3" style="fill:${col}"/>`;
    if (i < n - 1) { const yy = Y(cur); out += `<line x1="${cx + bw / 2}" x2="${cx + pw / n - bw / 2}" y1="${yy}" y2="${yy}" style="stroke:var(--muted);stroke-dasharray:3 3;opacity:.6"/>`; }
    const neg = s.t !== "total" && s.v < 0;
    out += TX(cx, neg ? bot + 15 : top - 7, s.txt, { c: "var(--cream)", w: 700, s: 12 });
    s.l.split("\n").forEach((ln: string, k: number) => { out += TX(cx, H - m.b + 17 + k * 13, ln); });
  });
  return svg(Wd, H, out);
}
// cột nhóm có trục 0: groups = [{l, v: [..]}], series = [{color}]
export function columns(groups: any[], series: any[], o: any): string {
  const Wd = 640, H = o.h || 250, m = { l: 8, r: 8, t: 22, b: 30 };
  const pw = Wd - m.l - m.r, ph = H - m.t - m.b, gw = pw / groups.length;
  const Y = (v: number) => m.t + ((o.max - v) / (o.max - o.min)) * ph;
  const bw = Math.min(46, (gw * 0.78) / series.length);
  let out = "";
  if (o.ref != null) out += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${Y(o.ref)}" y2="${Y(o.ref)}" style="stroke:var(--cream);stroke-dasharray:4 4;opacity:.7"/>` + TX(Wd - m.r, Y(o.ref) - 5, o.refLabel || "", { a: "end", s: 11, c: "var(--cream)" });
  out += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${Y(o.base || 0)}" y2="${Y(o.base || 0)}" style="stroke:var(--muted)"/>`;
  groups.forEach((g: any, i: number) => {
    const gx = m.l + gw * i + gw / 2 - (bw * series.length) / 2;
    g.v.forEach((v: number | null, j: number) => {
      if (v == null) return;
      const x = gx + j * bw, y0 = Y(o.base || 0), y1 = Y(v);
      const top = Math.min(y0, y1), h = Math.max(Math.abs(y1 - y0), 1.5);
      const col = (g.colors && g.colors[j]) || series[j].color;
      out += `<rect x="${x + 2}" y="${top}" width="${bw - 4}" height="${h}" rx="3" style="fill:${col}"/>`;
      out += TX(x + bw / 2, v >= (o.base || 0) ? top - 6 : top + h + 14, o.fmt(v), { c: "var(--cream)", w: 700, s: 11 });
    });
    g.l.split("\n").forEach((ln: string, k: number) => { out += TX(m.l + gw * i + gw / 2, H - 12 + k * 12 - (g.l.includes("\n") ? 6 : 0), ln, { s: 11 }); });
  });
  return svg(Wd, H, out);
}
// cột chồng 100%: cols = [{l, v: [..]}], segs = [{name, color}]
export function stack100(cols: any[], segs: any[], o: any): string {
  const Wd = 640, H = o.h || 260, m = { l: 8, r: 8, t: 10, b: 28 };
  const pw = Wd - m.l - m.r, ph = H - m.t - m.b, gw = pw / cols.length, bw = Math.min(90, gw * 0.62);
  let out = "";
  cols.forEach((c: any, i: number) => {
    const tot = c.v.reduce((a: number, b: number) => a + b, 0); let y = H - m.b; const x = m.l + gw * i + (gw - bw) / 2;
    c.v.forEach((v: number, j: number) => {
      const hh = (v / tot) * ph; y -= hh;
      out += `<rect x="${x}" y="${y}" width="${bw}" height="${hh}" style="fill:${segs[j].color};stroke:var(--panel);stroke-width:1.5"/>`;
      if (hh > 17) out += TX(x + bw / 2, y + hh / 2 + 4, ((v / tot) * 100).toFixed(1).replace(".", ",") + "%", { c: "#0b0b0d", w: 700, s: 11 });
    });
    out += TX(x + bw / 2, H - 9, c.l, { s: 11 });
  });
  return svg(Wd, H, out);
}
// phân tán: pts = [{x, y, r, l, color, dx, dy, a}]
export function scatter(pts: any[], o: any): string {
  const Wd = 640, H = o.h || 320, m = { l: 48, r: 14, t: 14, b: 42 };
  const pw = Wd - m.l - m.r, ph = H - m.t - m.b;
  const X = (v: number) => m.l + ((v - o.x0) / (o.x1 - o.x0)) * pw, Y = (v: number) => m.t + ((o.y1 - v) / (o.y1 - o.y0)) * ph;
  let out = "";
  const ticks = (a: number, b: number, k: number) => Array.from({ length: k + 1 }, (_, i) => a + ((b - a) * i) / k);
  ticks(o.y0, o.y1, o.ky || 4).forEach((v: number) => { out += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line)"/>` + TX(m.l - 6, Y(v) + 4, o.yf(v), { a: "end", s: 10 }); });
  ticks(o.x0, o.x1, o.kx || 4).forEach((v: number) => { out += `<line y1="${m.t}" y2="${H - m.b}" x1="${X(v)}" x2="${X(v)}" style="stroke:var(--line)"/>` + TX(X(v), H - m.b + 15, o.xf(v), { s: 10 }); });
  out += TX(m.l + pw / 2, H - 4, o.xl, { s: 11 }) + `<text transform="translate(11 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" style="fill:var(--muted);font-size:11px">${o.yl}</text>`;
  if (o.vx != null) out += `<line x1="${X(o.vx)}" x2="${X(o.vx)}" y1="${m.t}" y2="${H - m.b}" style="stroke:var(--cream);stroke-dasharray:4 4;opacity:.6"/>`;
  if (o.vy != null) out += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${Y(o.vy)}" y2="${Y(o.vy)}" style="stroke:var(--cream);stroke-dasharray:4 4;opacity:.6"/>`;
  (o.quad || []).forEach((q: any) => { out += TX(q.x, q.y, q.t, { a: q.a || "start", s: 11, c: "var(--gold-dim)", w: 600 }); });
  pts.forEach((p: any) => {
    out += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.r}" style="fill:${p.color};fill-opacity:.75;stroke:${p.color}"/>`;
    out += TX(X(p.x) + (p.dx || 0), Y(p.y) + (p.dy != null ? p.dy : -p.r - 5), p.l, { a: p.a || "middle", s: 11, c: "var(--cream)", w: 600 });
  });
  return svg(Wd, H, out);
}
// thanh ngang / bullet: rows = [{name, sub, value, text, dim, mark, cls}]
export function hbars(rows: any[], max?: number): string {
  const m = max || Math.max(...rows.map((r: any) => Math.max(r.value, r.mark || 0)));
  return rows.map((r: any) => `<div class="nm">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</div>
      <div class="trk"><div class="fill ${r.dim ? "dim" : ""} ${r.cls || ""}" style="width:${Math.min(100, (r.value / m) * 100)}%"></div>${r.mark != null ? `<div class="mk" style="left:${(r.mark / m) * 100}%"></div>` : ""}</div>
      <div class="v">${r.text}</div>`).join("");
}
// màu ô nhiệt
export const heat = (v: number, scale: number, base = "var(--green)", neg = "var(--red)") => `background:color-mix(in srgb, ${v >= 0 ? base : neg} ${Math.round(Math.min(Math.abs(v) / scale, 1) * 55)}%, transparent)`;