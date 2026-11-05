import React, { useEffect, useMemo, useState } from "react";
import { Gauge, ImageUp } from "lucide-react";
import type { Brand, LiveSession } from "../../types";
import { SessionEventCard, SESSION_TONE } from "../ui/SessionEventCard";
import { getBrandTheme } from "../../lib/brandTheme";
import { fmtVndShort } from "../../lib/format";
import { adsHistoryOf, benchAt, buildShiftBenchmark, checkShift, findHandoverSource, funnelChain, OPTIONAL_STEPS, subtractHandover, type BenchItem, type BenchZone, type CheckRow, type ShiftBenchmark, type ShiftCheck } from "../../lib/performance/shiftBenchmark";
import { fetchAdsDaily } from "../../lib/db/adsDaily";
import { readDashboard, type DashboardReading, type OcrWord } from "../../lib/ocr/dashboardReader";

// Bảng benchmark theo ca (01/11/2026) — đầu Bảng Vận Hành. Chỉ còn MỘT thứ để nhìn: phễu LIVE cùng bậc như Dashboard (TikTok: LIVE impressions → Views
// → Product clicks → Orders; Shopee: Views → ATC → Orders), mỗi bậc và mỗi tỷ lệ có thang 4 vùng lấy từ lịch sử ca cùng brand × sàn × khung giờ.
// OP dán ảnh Dashboard (đọc ngay trên máy, xem `readShot`) hoặc gõ số tích luỹ ⇒ ghim số thật lên đúng thang + khung "Việc cần làm" (`checkShift`).
// App không nhận số real-time và không ghi gì vào ca / DB. (User chốt 01/11: bỏ các ô GMV/GPM/AOV và bảng ROAS riêng — việc ads nằm trong "Việc cần làm".)

const nf = (v: number) => Math.round(v).toLocaleString("vi-VN");
const pct = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 2, minimumFractionDigits: v < 10 ? 2 : 1 })}%`;
const show = (item: BenchItem, v: number) => (item.kind === "rate" ? pct(v) : item.kind === "money" ? fmtVndShort(v) : nf(v));

const ZONE: Record<BenchZone, { label: string; text: string; chip: string }> = {
  off: { label: "Kết thúc sớm", text: "text-rose-400", chip: "bg-rose-500/15 text-rose-300" },
  act: { label: "Cần action", text: "text-amber-300", chip: "bg-amber-500/15 text-amber-300" },
  ok: { label: "Đúng target", text: "text-sky-300", chip: "bg-sky-500/15 text-sky-300" },
  ot: { label: "Có thể xin OT", text: "text-emerald-400", chip: "bg-emerald-500/15 text-emerald-300" }
};
/** Số tích luỹ điền vào ô theo khoá bậc phễu của từng sàn (Shopee: ATC để trống vì Dashboard không có). */
const SHOT_COUNTS: Record<LiveSession["platform"], (r: DashboardReading, clicks: number | null) => Record<string, string>> = {
  TikTok: (r, clicks) => ({ imp: fromReading(r.impressions), views: fromReading(r.views), clicks: clicks != null ? String(clicks) : "", orders: fromReading(r.orders) }),
  Shopee: (r) => ({ views: fromReading(r.views), orders: fromReading(r.orders) })
};
const SHOT_NOTE: Record<LiveSession["platform"], string> = { TikTok: "", Shopee: "" };
/** Bậc chỉ có số thật, chưa có lịch sử để so (Shopee: Clicks suy từ CTR; CTR và Click to Order do Dashboard Shopee tự tính). Chèn sau bậc `after`. */
const PLAIN_FUNNEL: Record<LiveSession["platform"], { after: string; step: string; left: string; right: string } | null> = {
  TikTok: null,
  Shopee: { after: "views", step: "Clicks", left: "CTR", right: "Click to Order" }
};
/** Số mục đọc được của từng sàn (TikTok: 7; Shopee: 7 — Sales, Views, Orders, thời lượng live, CTR, Click to Order, Xem TB). */
const SHOT_FIELDS: Record<LiveSession["platform"], number> = { TikTok: 7, Shopee: 7 };

const HOURS = [1, 2, 3] as const;
const pill = (on: boolean) => `px-3 py-1.5 rounded-lg border text-xs font-bold min-h-[32px] ${on ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`;

/** Tô màu theo vùng: gãy (kết thúc sớm đỏ, cần action vàng) · tốt (đúng target / xin OT xanh). Chỗ gãy và chữ việc cần làm nằm ở khung phân tích. */
const TONE: Record<BenchZone, { box: string; text: string }> = {
  off: { box: "border-rose-400/80 bg-rose-500/10", text: "text-rose-400" },
  act: { box: "border-amber-400/80 bg-amber-500/10", text: "text-amber-300" },
  ok: { box: "border-emerald-500/50 bg-emerald-500/5", text: "text-emerald-300" },
  ot: { box: "border-emerald-400 bg-emerald-500/15", text: "text-emerald-300" }
};
const ZONE_WORD: Record<BenchZone, string> = { off: "gãy nặng", act: "gãy", ok: "ổn", ot: "tốt" };

interface LiveCell { value: string; onChange: (v: string) => void; guessed: boolean; row?: CheckRow; /** Ca nối: số của riêng ca này (đã trừ lúc giao ca); null = chưa trừ được vì thiếu số lúc giao ca. */ adj?: number | null }

/**
 * Một bậc của phễu. Chưa có số ca: số TRUNG BÌNH ưu tiên ca gần đây sau `hours` giờ live. Có số ca (dán ảnh / gõ tay): số của phiên (sửa được tại ô),
 * tô màu theo vùng, kèm số trung bình nhỏ bên dưới.
 */
const Step: React.FC<{ item: BenchItem; hours: number; live?: LiveCell }> = ({ item, hours, live }) => {
  const avg = show(item, benchAt(item, hours).p50);
  const tone = live?.row ? TONE[live.row.zone] : null;
  const name = item.label.replace("/giờ", "");
  return (
    <div className={`rounded-xl border px-3 py-3 min-w-0 text-center ${tone ? tone.box : "border-[var(--border)] bg-[var(--surface-base)]"} ${live?.guessed ? "ring-1 ring-dashed ring-amber-400" : ""}`} title={live?.guessed ? "Số đoán từ ảnh, đối chiếu lại với màn hình" : undefined}>
      <p className="text-xs font-semibold text-[var(--text-muted)] leading-snug">{name}{live?.row ? <span className={`ml-1.5 font-bold ${tone!.text}`}>{ZONE_WORD[live.row.zone]}</span> : null}</p>
      {live ? (
        <input className={`w-full bg-transparent text-center text-xl font-black tabular-nums my-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded ${tone ? tone.text : "text-[var(--text)]"}`} inputMode="numeric" aria-label={`${name} tích luỹ`}
          value={live.value === "" ? "" : nf(Number(live.value.replace(/\D/g, "")) || 0)} placeholder="—" onChange={(e) => live.onChange(e.target.value)} />
      ) : (
        <p className="text-xl font-black tabular-nums text-[var(--text)] my-0.5">{avg}</p>
      )}
      {live && live.adj !== undefined && <p className="text-2xs text-[var(--text)] tabular-nums">{live.adj == null ? "ca này: chưa trừ được" : `ca này ${nf(live.adj)}`}</p>}
      {live && <p className="text-2xs text-[var(--text-muted)] tabular-nums">trung bình {avg}</p>}
    </div>
  );
};

/** Tỷ lệ giữa hai bậc: trung bình, hoặc (có số ca) tỷ lệ thật của phiên tô màu theo vùng kèm trung bình. */
const Arrow: React.FC<{ item: BenchItem; row?: CheckRow; live: boolean }> = ({ item, row, live }) => {
  const tone = row ? TONE[row.zone] : null;
  return (
    <div className="md:flex-[0_0_118px] flex md:flex-col items-center justify-center text-center gap-x-2 gap-y-0.5 py-1 md:py-0 px-1 text-2xs text-[var(--text-muted)]">
      <b className="text-[var(--text)]">{item.label}</b>
      <span className={`text-sm font-black tabular-nums ${tone ? tone.text : "text-[var(--text)]"}`}>{live ? (row ? pct(row.value) : "—") : pct(item.p50)}</span>
      <span className={`text-lg leading-none rotate-90 md:rotate-0 ${tone ? tone.text : "text-[var(--accent-text)]"}`}>→</span>
      {live && <span className="tabular-nums">trung bình {pct(item.p50)}</span>}
    </div>
  );
};

const PlainStep: React.FC<{ label: string; value: number | null; hint: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-3 min-w-0 text-center">
    <p className="text-xs font-semibold text-[var(--text-muted)] leading-snug">{label}</p>
    <p className="text-xl font-black tabular-nums text-[var(--text)] my-0.5">{value == null ? "—" : nf(value)}</p>
    <p className="text-2xs text-[var(--text-muted)]">{hint}</p>
  </div>
);
const PlainArrow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="md:flex-[0_0_118px] flex md:flex-col items-center justify-center text-center gap-x-2 gap-y-0.5 py-1 md:py-0 px-1 text-2xs text-[var(--text-muted)]">
    <b className="text-[var(--text)]">{label}</b>
    <span className="text-sm font-black tabular-nums text-[var(--text)]">{value === "" ? "—" : `${value}%`}</span>
    <span className="text-lg leading-none rotate-90 md:rotate-0 text-[var(--accent-text)]">→</span>
    <span>chưa có mốc</span>
  </div>
);

/** Một dòng riêng cho số ngoài phễu: thời gian đã live, GMV (kèm GMV/giờ tô màu), Ads (kèm ROAS), bậc tuỳ chọn (ATC Shopee) và số Dashboard tự tính chưa có benchmark. */
const ExtraLine: React.FC<{
  minutes: string; gmv: string; ads: string; guessed: Set<string>; res: ShiftCheck | null; joint: boolean;
  optional: { key: string; label: string; value: string; decimal?: boolean }[]; info: string; chips: { label: string; text: string; zone: BenchZone; avg: string }[];
  onMinutes: (v: string) => void; onGmv: (v: string) => void; onAds: (v: string) => void; onOptional: (key: string, v: string) => void;
}> = ({ minutes, gmv, ads, guessed, res, joint, optional, info, chips, onMinutes, onGmv, onAds, onOptional }) => {
  const gph = res?.outcomes.find((o) => o.key === "gmvPerHour");
  const gmvN = digits(gmv), adsN = digits(ads);
  const field = (k: string, label: string, value: string, set: (v: string) => void, fmt?: string) => (
    <label key={k} className="inline-flex items-center gap-1.5 text-2xs text-[var(--text-muted)]">{label}
      <input className={`w-28 min-w-0 bg-[var(--surface-base)] border rounded-lg px-2 py-1 text-sm tabular-nums text-[var(--text)] ${guessed.has(k) ? "border-amber-400 bg-amber-500/10" : "border-[var(--border)]"}`} inputMode="numeric"
        value={value === "" ? "" : nf(Number(value.replace(/\D/g, "")) || 0)} placeholder="—" onChange={(e) => set(e.target.value)} aria-label={label} />
      {fmt && <b className="text-[var(--text)] tabular-nums">{fmt}</b>}
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2">
      {field("minutes", "Đã live (phút)", minutes, onMinutes)}
      {field("gmv", "GMV", gmv, onGmv, gmvN != null ? fmtVndShort(gmvN) : undefined)}
      {gph && <span className="text-2xs text-[var(--text-muted)]">GMV/giờ{joint ? " ca này" : ""} <b className={`tabular-nums ${TONE[gph.zone].text}`}>{fmtVndShort(gph.value)}</b> <span className={`font-bold ${TONE[gph.zone].text}`}>{ZONE_WORD[gph.zone]}</span> <span className="tabular-nums">(trung bình {fmtVndShort(gph.item.p50)})</span></span>}
      {field("ads", "Ads đã chi", ads, onAds, adsN != null ? fmtVndShort(adsN) : undefined)}
      {gmvN != null && adsN != null && adsN > 0 && <span className="text-2xs text-[var(--text-muted)]">ROAS <b className="text-[var(--text)] tabular-nums">{(gmvN / adsN).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}x</b></span>}
      {chips.map((c) => <span key={c.label} className="text-2xs text-[var(--text-muted)]">{c.label} <b className={`tabular-nums ${TONE[c.zone].text}`}>{c.text}</b> <span className={`font-bold ${TONE[c.zone].text}`}>{ZONE_WORD[c.zone]}</span> <span className="tabular-nums">(trung bình {c.avg})</span></span>)}
      {optional.map((o) => o.decimal ? (
        <label key={o.key} className="inline-flex items-center gap-1.5 text-2xs text-[var(--text-muted)]">{o.label}
          <input className={`w-20 min-w-0 bg-[var(--surface-base)] border rounded-lg px-2 py-1 text-sm tabular-nums text-[var(--text)] ${guessed.has(o.key) ? "border-amber-400 bg-amber-500/10" : "border-[var(--border)]"}`} inputMode="decimal" value={o.value} placeholder="—" onChange={(e) => onOptional(o.key, e.target.value)} aria-label={o.label} />
        </label>
      ) : field(o.key, o.label, o.value, (v) => onOptional(o.key, v)))}
      {info && <span className="text-2xs text-[var(--text-muted)]">{info}</span>}
    </div>
  );
};

/** Ca nối: số Dashboard gồm cả phần của host ca trước. Nhập (hoặc lấy từ báo cáo giao ca) số đã thấy lúc giao ca để trừ ra. Mục để trống thì không được chấm. */
const HandoverPanel: React.FC<{
  on: boolean; onToggle: (v: boolean) => void; note: string;
  minutes: string; gmv: string; ads: string; counts: Record<string, string>; keys: { key: string; label: string }[];
  onMinutes: (v: string) => void; onGmv: (v: string) => void; onAds: (v: string) => void; onCount: (k: string, v: string) => void;
}> = ({ on, onToggle, note, minutes, gmv, ads, counts, keys, onMinutes, onGmv, onAds, onCount }) => {
  const f = (label: string, value: string, set: (v: string) => void) => (
    <label key={label} className="space-y-1 min-w-0"><span className="text-2xs text-[var(--text-muted)]">{label}</span>
      <input className="w-full min-w-0 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm tabular-nums text-[var(--text)]" inputMode="numeric" placeholder="—"
        value={value === "" ? "" : nf(Number(value.replace(/\D/g, "")) || 0)} onChange={(e) => set(e.target.value)} aria-label={`Lúc giao ca: ${label}`} /></label>
  );
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2 space-y-2">
      <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--text)] cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="accent-[var(--accent)]" />Ca nối: trừ số lúc giao ca
        <span className="font-normal text-2xs text-[var(--text-muted)]">Dashboard cộng dồn từ lúc mở phòng, bật mục này để chấm riêng ca hiện tại.</span>
      </label>
      {on && (
        <>
          <p className="text-2xs text-[var(--text-muted)] leading-snug">{note}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {f("Đã live lúc giao (phút)", minutes, onMinutes)}
            {f("GMV", gmv, onGmv)}
            {f("Ads", ads, onAds)}
            {keys.map((k) => f(k.label, counts[k.key] ?? "", (v) => onCount(k.key, v)))}
          </div>
        </>
      )}
    </div>
  );
};

/** Mỗi ca hôm nay là một nhóm (chip như trên lịch): mốc benchmark theo brand × sàn, còn số OP nhập/dán là của riêng từng ca. */
export interface Group { key: string; brandId: string; brandName: string; platform: LiveSession["platform"]; live: boolean; start: string; session: LiveSession }

/** Các ca của một ngày (mặc định: hôm nay, hoặc ngày gần nhất còn ca). Bản tin target truyền `date` để bấm chip ca ngày mai / ngày chọn cũng ra phễu. */
export function todayGroups(sessions: LiveSession[], today: string, date?: string): Group[] {
  const live = sessions.filter((s) => s.status !== "Cancelled" && !s.excludedFromReports);
  const days = live.filter((s) => s.date >= today).map((s) => s.date).sort();
  const day = date ?? (days.includes(today) ? today : days[0]);
  if (!day) return [];
  return live.filter((x) => x.date === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((s) => ({ key: s.id, brandId: s.brandId, brandName: s.brandName, platform: s.platform, live: s.status === "Live Now", start: s.startTime, session: s }));
}

/** Ca mặc định của phễu: ca đang live, không thì ca sớm nhất của ngày. */
export const defaultBenchPick = (groups: Group[]): Group | undefined => groups.find((x) => x.live) ?? groups[0];

export const ShiftBenchmarkBoard: React.FC<{
  sessions: LiveSession[]; today: string; brands: Brand[];
  /** Ngày cần xem (vắng = hôm nay). */
  date?: string;
  /** Ca đang chọn + bộ đổi — App/OpsBoard giữ để chip của Bản tin target điều khiển phễu. Vắng = tự giữ. */
  pick?: string | null; onPick?: (id: string) => void;
  /** Ẩn dải chip riêng (khi chip nằm ở Bản tin target). */
  hideChips?: boolean;
}> = ({ sessions, today, brands, date, pick: pickProp, onPick, hideChips }) => {
  const groups = useMemo(() => todayGroups(sessions, today, date), [sessions, today, date]);
  const [inner, setInner] = useState<string | null>(null);
  const pick = pickProp !== undefined ? pickProp : inner;
  if (!groups.length) return null;
  const g = groups.find((x) => x.key === pick) ?? defaultBenchPick(groups)!;
  return <Body groups={groups} g={g} sessions={sessions} today={today} brands={brands} onPick={onPick ?? setInner} hideChips={hideChips} />;
};

const monthsBack = (today: string, n: number) => {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(y, m - 1 - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
};
const digits = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\D/g, "")));
const fromReading = (r?: { value: number }) => (r ? String(Math.round(r.value)) : "");

/**
 * Đọc ảnh NGAY TRONG trình duyệt (tesseract.js nạp khi cần): đảo màu nền tối + phóng to rồi nhận dạng chữ rời. Ảnh chỉ nằm trong bộ nhớ
 * (canvas + blob URL), không gửi đi đâu, không ghi DB; tải mô hình chữ về từ CDN là tải xuống, không phải tải ảnh lên.
 */
async function readShot(file: Blob, onProgress: (p: number) => void): Promise<DashboardReading> {
  const bmp = await createImageBitmap(file);
  const scale = Math.max(2, Math.ceil(3000 / bmp.width));
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width * scale; canvas.height = bmp.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không cho xử lý ảnh.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height), px = img.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) { const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = g; sum += g; }
  const invert = sum / (px.length / 4) < 128;
  if (invert) for (let i = 0; i < px.length; i += 4) { px[i] = px[i + 1] = px[i + 2] = 255 - px[i]; }
  ctx.putImageData(img, 0, 0);
  const T = await import("tesseract.js");
  const worker = await T.createWorker(["vie", "eng"], 1, { logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") onProgress(m.progress); } });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: T.PSM.SPARSE_TEXT });
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const words: OcrWord[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))).map((w) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
    return readDashboard(data.text ?? "", words);
  } finally {
    await worker.terminate();
  }
}

interface Shot { url: string; busy: boolean; progress: number; error: string | null; read: number }

const Body: React.FC<{ groups: Group[]; g: Group; sessions: LiveSession[]; today: string; brands: Brand[]; onPick: (k: string) => void; hideChips?: boolean }> = ({ groups, g, sessions, today, brands, onPick, hideChips }) => {
  const bench: ShiftBenchmark | null = useMemo(() => buildShiftBenchmark(sessions, g.brandId, g.platform, today), [sessions, g.brandId, g.platform, today]);
  const [hoursPick, setHoursPick] = useState<number>(1);
  const [minutes, setMinutes] = useState("");
  const [gmv, setGmv] = useState("");
  const [ads, setAds] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [shot, setShot] = useState<Shot | null>(null);
  const [manual, setManual] = useState(false); // true = màn đang ở chế độ số của phiên (đã dán ảnh hoặc bấm Gõ số tay)
  const [rows, setRows] = useState<{ date: string; live: number | null }[]>([]);
  const hist = useMemo(() => adsHistoryOf(sessions, rows, g.brandId, g.platform), [sessions, rows, g.brandId, g.platform]);
  const [ctr, setCtr] = useState(""); // Shopee: CTR và Click to Order do Dashboard tự tính, chưa có lịch sử để so (gõ dạng 8.2)
  const [co, setCo] = useState("");
  const [watch, setWatch] = useState(""); // Shopee: Avg. Viewing Duration, giây
  const [joint, setJoint] = useState(false); // ca nối
  const [hMinutes, setHMinutes] = useState("");
  const [hGmv, setHGmv] = useState("");
  const [hAds, setHAds] = useState("");
  const [hCounts, setHCounts] = useState<Record<string, string>>({});
  const [hNote, setHNote] = useState("");

  const clearShot = () => setShot((s) => { if (s) URL.revokeObjectURL(s.url); return null; });
  const clearAll = () => { setMinutes(""); setGmv(""); setAds(""); setCounts({}); setGuessed(new Set()); setManual(false); setCtr(""); setCo(""); setWatch(""); setJoint(false); setHMinutes(""); setHGmv(""); setHAds(""); setHCounts({}); setHNote(""); clearShot(); };
  useEffect(() => {
    let off = false;
    clearAll();
    Promise.all(monthsBack(today, 4).map((m) => fetchAdsDaily(g.brandId, m, g.platform).catch(() => [])))
      .then((all) => { if (!off) setRows(all.flat().map((r) => ({ date: r.date, live: r.actual?.live ?? null }))); });
    return () => { off = true; };
  }, [g.brandId, g.platform, today, g.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { setShot((s) => { if (s) URL.revokeObjectURL(s.url); return null; }); }, []);

  const load = async (file: Blob) => {
    const url = URL.createObjectURL(file);
    setManual(true);
    setShot((s) => { if (s) URL.revokeObjectURL(s.url); return { url, busy: true, progress: 0, error: null, read: 0 }; });
    try {
      const r = await readShot(file, (p) => setShot((s) => (s ? { ...s, progress: p } : s)));
      const shotPlatform = r.platform ?? g.platform;
      if (shotPlatform !== g.platform) {
        setShot((s) => (s ? { ...s, busy: false, progress: 1, read: 0, error: `Ảnh này là Dashboard ${shotPlatform} nhưng nhóm đang chọn là ${g.platform}. Chọn đúng nhóm rồi dán lại.` } : s));
        return;
      }
      const gs = new Set<string>();
      const mark = (k: string, x?: { guessed: boolean }) => { if (x?.guessed) gs.add(k); };
      mark("views", r.views); mark("imp", r.impressions); mark("ads", r.ads); mark("minutes", r.minutes);
      const clicks = r.views && r.liveCtr ? Math.round((r.views.value * r.liveCtr.value) / 100) : null;
      if (clicks != null) gs.add("clicks"); // suy từ LIVE CTR × Views nên luôn là số ước tính
      setMinutes(fromReading(r.minutes)); setGmv(fromReading(r.gmv)); setAds(fromReading(r.ads));
      setCounts(SHOT_COUNTS[g.platform](r, clicks));
      setGuessed(gs);
      setCtr(r.ctr ? String(r.ctr.value) : ""); setCo(r.co ? String(r.co.value) : ""); setWatch(r.watchSeconds ? String(Math.round(r.watchSeconds.value)) : "");
      if (r.ctr) gs.add("ctr"); if (r.co) gs.add("co");
      setShot((s) => (s ? { ...s, busy: false, progress: 1, read: [r.gmv, r.views, r.impressions, r.ads, r.orders, r.liveCtr, r.minutes, r.ctr, r.co, r.watchSeconds].filter(Boolean).length } : s));
    } catch (e) {
      setShot((s) => (s ? { ...s, busy: false, error: e instanceof Error ? e.message : "Không đọc được ảnh." } : s));
    }
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); void load(f); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const raw = useMemo(() => ({
    minutes: Number(minutes.replace(/\D/g, "")) || 0, gmv: digits(gmv), ads: digits(ads), watchSeconds: digits(watch),
    counts: Object.fromEntries((bench?.funnel ?? []).map((f) => [f.key, digits(counts[f.key] ?? "")]))
  }), [minutes, gmv, ads, counts, watch, bench]);
  const base = useMemo(() => ({
    minutes: digits(hMinutes), gmv: digits(hGmv), ads: digits(hAds),
    counts: Object.fromEntries((bench?.funnel ?? []).map((f) => [f.key, digits(hCounts[f.key] ?? "")]))
  }), [hMinutes, hGmv, hAds, hCounts, bench]);
  // Ca nối: chấm trên số của RIÊNG ca này; không trừ được (thiếu số phút lúc giao ca) thì chưa chấm.
  const input = useMemo(() => (joint ? subtractHandover(raw, base) : raw), [joint, raw, base]);
  const res = useMemo(() => (bench && input ? checkShift(bench, input, hist) : null), [bench, input, hist]);
  const hours = res ? res.hours : hoursPick;
  const source = useMemo(() => (bench ? findHandoverSource(sessions, g.brandId, g.platform, today, bench.funnel.map((f) => f.key)) : null), [bench, sessions, g.brandId, g.platform, today]);
  const toggleJoint = (on: boolean) => {
    setJoint(on);
    if (!on || hMinutes || hGmv || Object.values(hCounts).some(Boolean)) return;
    if (!source) { setHNote("Chưa có báo cáo giao ca nào của brand này hôm nay: gõ số đã thấy trên Dashboard lúc giao ca. Mục để trống thì không được chấm."); return; }
    const sv = (v: number | null) => (v == null ? "" : String(Math.round(v)));
    setHMinutes(sv(source.base.minutes)); setHGmv(sv(source.base.gmv));
    setHCounts(Object.fromEntries(Object.entries(source.base.counts).map(([k, v]) => [k, sv(v)])));
    setHNote(`Lấy từ báo cáo giao ca của ca ${source.session.startTime}–${source.session.endTime} (${source.session.hostName || "host"}). Số phút ước tính từ lúc mở phòng, sửa lại nếu lệch. Mục để trống thì không được chấm (Impressions, Product clicks, Ads chưa có sẵn trong báo cáo).`);
  };
  const unguess = (k: string) => setGuessed((x) => { const n = new Set(x); n.delete(k); return n; });
  const liveCell = (key: string): LiveCell | undefined => showFields ? { value: counts[key] ?? "", onChange: (v) => { setCounts((c) => ({ ...c, [key]: v })); unguess(key); }, guessed: guessed.has(key), row: res?.steps.find((x) => x.key === key), adj: joint ? (input?.counts[key] ?? null) : undefined } : undefined;
  const liveChain = bench ? funnelChain(bench, (k) => digits(counts[k] ?? "") != null) : null;
  const plain = PLAIN_FUNNEL[g.platform];
  const num = (v: string) => { const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const viewsN = digits(counts.views ?? ""), ctrN = num(ctr);
  const clicksDerived = viewsN != null && ctrN != null ? Math.round((viewsN * ctrN) / 100) : null;
  const chips = res ? [
    ...res.outcomes.filter((o) => o.key !== "gmvPerHour").map((o) => ({ label: o.label, text: show(o.item, o.value), zone: o.zone, avg: show(o.item, o.item.p50) })),
    ...(plain ? res.rates.map((r) => ({ label: r.label, text: pct(r.value), zone: r.zone, avg: pct(r.item.p50) })) : [])
  ] : [];
  const avgChain = bench ? funnelChain(bench, () => true) : null;
  const showFields = manual;
  return (
    <section id="shift-benchmark" className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 space-y-3 scroll-mt-4" aria-label="Benchmark theo ca">
      <h2 className="text-sm font-black text-[var(--text)] flex items-center gap-2"><Gauge className="w-4 h-4 text-[var(--accent-text)]" aria-hidden />Phễu benchmark ca{hideChips && <span className="font-bold text-[var(--text-muted)]"> · {g.brandName} {g.platform} {g.session.startTime}–{g.session.endTime}</span>}</h2>
      {!hideChips && <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]" role="group" aria-label="Ca hôm nay">
        {groups.map((x) => {
          const on = x.key === g.key, ss = x.session;
          return (
            <div key={x.key} className={on ? "" : "opacity-60 hover:opacity-100 transition-opacity"} aria-pressed={on}>
              <SessionEventCard
                theme={getBrandTheme(ss.brandName)}
                brand={brands.find((b) => b.id === ss.brandId)}
                brandName={ss.brandName} platform={ss.platform}
                startTime={ss.startTime} endTime={ss.endTime}
                tone={SESSION_TONE[ss.status]}
                className={on ? "ring-2 ring-[var(--accent)]" : ""}
                tooltip={`${ss.brandName} · ${ss.platform} · ${ss.startTime}-${ss.endTime}`}
                onClick={() => onPick(x.key)}
              />
            </div>
          );
        })}
      </div>}

      {!bench ? (
        <p className="text-xs text-[var(--text-muted)]">Chưa đủ lịch sử để lập benchmark cho {g.brandName} · {g.platform} (cần ít nhất 20 ca đã xong có số).</p>
      ) : (
        <>
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-base)] px-3 py-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <ImageUp className="w-5 h-5 text-[var(--accent-text)] shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--text)]">Dán ảnh Dashboard {g.platform} vào đây (Cmd+V hoặc Ctrl+V)</p>
                <p className="text-2xs text-[var(--text-muted)]">Ảnh được đọc ngay trên máy này, không gửi đi, không lưu. Tắt trang hoặc bấm Xoá ảnh là mất.{SHOT_NOTE[g.platform]}</p>
              </div>
              <label className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-hover)] cursor-pointer min-h-[32px] inline-flex items-center">
                Chọn ảnh<input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} /></label>
              {!showFields && <button type="button" className={pill(false)} onClick={() => setManual(true)}>Gõ số tay</button>}
              {(shot || manual || res) && <button type="button" className="text-2xs underline text-[var(--text-muted)] hover:text-[var(--text)]" onClick={clearAll}>Xoá hết</button>}
            </div>
            {shot && (
              <div className="flex gap-3 items-start">
                <img src={shot.url} alt="Ảnh Dashboard vừa dán" className="w-40 max-h-28 object-cover object-top rounded-lg border border-[var(--border)]" />
                <div className="text-2xs text-[var(--text-muted)] space-y-1 min-w-0">
                  {shot.busy ? <p>Đang đọc ảnh… {Math.round(shot.progress * 100)}%</p> : shot.error ? <p className="text-rose-300">{shot.error}</p> : <p>Đọc được {shot.read}/{SHOT_FIELDS[g.platform]} số. Số có viền vàng là số đoán, đối chiếu lại với màn hình rồi sửa ngay trên phễu.</p>}
                  <button type="button" className="underline hover:text-[var(--text)]" onClick={clearShot}>Xoá ảnh</button>
                </div>
              </div>
            )}
          </div>

          {showFields && (
            <div className="space-y-3">
              <p className="text-xs font-black text-[var(--text)]">Phễu của phiên đang chạy</p>
              <div className="flex flex-col md:flex-row items-stretch">
                {liveChain!.steps.map((st, i) => {
                  const inserted = plain != null && liveChain!.steps[i - 1]?.key === plain.after;
                  return (
                    <React.Fragment key={st.key}>
                      {inserted ? (
                        <>
                          <PlainArrow label={plain!.left} value={ctr} />
                          <div className="flex-1 min-w-0 py-1 md:py-0"><PlainStep label={plain!.step} value={clicksDerived} hint="ước tính từ Views × CTR" /></div>
                          <PlainArrow label={plain!.right} value={co} />
                        </>
                      ) : i > 0 && liveChain!.arrows[i - 1] && <Arrow item={liveChain!.arrows[i - 1]!} row={res?.rates.find((x) => x.key === liveChain!.arrows[i - 1]!.key)} live />}
                      <div className="flex-1 min-w-0 py-1 md:py-0"><Step item={st} hours={hours} live={liveCell(st.key)} /></div>
                    </React.Fragment>
                  );
                })}
              </div>
              <ExtraLine minutes={minutes} gmv={gmv} ads={ads} guessed={guessed} res={res} joint={joint} info=""
                chips={chips}
                optional={[...bench.funnel.filter((f) => OPTIONAL_STEPS.has(f.key)).map((f) => ({ key: f.key, label: `${f.label.replace("/giờ", "")} (không bắt buộc)`, value: counts[f.key] ?? "" })),
                  ...(plain ? [{ key: "ctr", label: "CTR %", value: ctr, decimal: true }, { key: "co", label: "Click to Order %", value: co, decimal: true }, { key: "watch", label: "Xem TB (giây)", value: watch }] : [])]}
                onMinutes={(v) => { setMinutes(v); unguess("minutes"); }} onGmv={setGmv} onAds={(v) => { setAds(v); unguess("ads"); }} onOptional={(k, v) => { unguess(k); if (k === "ctr") setCtr(v); else if (k === "co") setCo(v); else if (k === "watch") setWatch(v); else setCounts((c) => ({ ...c, [k]: v })); }} />
              <HandoverPanel on={joint} onToggle={toggleJoint} note={hNote} minutes={hMinutes} gmv={hGmv} ads={hAds} counts={hCounts} keys={bench.funnel.map((f) => ({ key: f.key, label: f.label.replace("/giờ", "") }))}
                onMinutes={setHMinutes} onGmv={setHGmv} onAds={setHAds} onCount={(k, v) => setHCounts((c) => ({ ...c, [k]: v }))} />
              {joint && !input && <p className="text-2xs text-amber-300">Chưa trừ được: nhập số phút đã live lúc giao ca (nhỏ hơn số phút hiện tại).</p>}
          {res && res.verdict && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-3 space-y-2.5">
              <p className="flex items-center gap-2 flex-wrap"><span className={`px-2.5 py-1 rounded-full text-xs font-black ${ZONE[res.verdict].chip}`}>{ZONE[res.verdict].label}</span><span className="text-xs text-[var(--text)]">{res.headline}</span></p>
              {res.breaks.length > 0 && (
                <ul className="space-y-2">
                  {res.breaks.map((b, i) => (
                    <li key={b.key} className="text-xs space-y-0.5">
                      <p className="font-bold text-[var(--text)]">
                        {i === 0 ? "Gãy đầu tiên: " : "Gãy tiếp: "}{b.label}{" "}
                        <span className={`tabular-nums ${ZONE[b.zone].text}`}>{show(b.item, b.kind === "volume" ? b.actual * res.hours : b.actual)}</span>
                        <span className="font-normal text-[var(--text-muted)] tabular-nums"> so với trung bình {show(b.item, b.kind === "volume" ? b.avg * res.hours : b.avg)} ({b.vsAvg < 0 ? "thấp hơn" : "cao hơn"} {Math.abs(Math.round(b.vsAvg * 100))}%)</span>
                      </p>
                      <p className="text-[var(--text-muted)] leading-snug">Làm: {b.action}</p>
                    </li>
                  ))}
                </ul>
              )}
              {res.adsLine && <p className="text-xs text-[var(--text-muted)] leading-snug"><b className="text-[var(--text)]">Ads: </b>{res.adsLine}</p>}
            </div>
          )}
          {res && !res.verdict && <p className="text-2xs text-[var(--text-muted)]">Nhập thêm số (ít nhất GMV hoặc Orders) để có kết luận.</p>}
            </div>
          )}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-xs font-black text-[var(--text)]">Phễu trung bình, ưu tiên ca gần đây</p>
              <span className="text-2xs text-[var(--text-muted)]">
                {bench.n} ca · ca gần nhất {bench.latest.slice(8)}/{bench.latest.slice(5, 7)}
                {bench.weak && <b className="text-amber-300"> · ít ca, mốc chưa vững</b>}
              </span>
              <span className="md:ml-auto inline-flex items-center gap-1.5 text-2xs text-[var(--text-muted)]">
                {res ? <>Sau {Math.floor(res.hours)} giờ {Math.round((res.hours % 1) * 60)} phút live</> : (
                  <>Sau {HOURS.map((h) => <button key={h} type="button" aria-pressed={h === hoursPick} className={pill(h === hoursPick)} onClick={() => setHoursPick(h)}>{h} giờ live</button>)}</>
                )}
              </span>
            </div>
            <div className="flex flex-col md:flex-row items-stretch">
              {avgChain!.steps.map((st, i) => (
                <React.Fragment key={st.key}>
                  {i > 0 && avgChain!.arrows[i - 1] && <Arrow item={avgChain!.arrows[i - 1]!} live={false} />}
                  <div className="flex-1 min-w-0 py-1 md:py-0"><Step item={st} hours={hours} /></div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
