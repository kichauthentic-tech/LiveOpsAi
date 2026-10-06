import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { LiveSession } from "../types";
import { fmtCount, handoverShare, HandoverInput, MINUTE_PRESETS, parseCount, parseDashboardLink, PreviousHandover } from "../lib/handover";
import { fetchPreviousHandover, submitHandover } from "../lib/db/handovers";
import { errorMessage } from "../lib/errorMessage";
import { fmtVndFull } from "../lib/format";
import { PlatformChip } from "./common/PlatformChip";

// Màn GIAO CA (0144, Đợt 2 lịch 2 sàn) — thay dòng Google Sheet trợ live gõ mỗi ca. Thiết kế cho điện thoại, làm trong
// một phút: (1) dán link dashboard, (2) gõ 3 số ĐANG THẤY trên dashboard, (3) chạm chọn sự cố. Không hỏi CTR/CTOR/ERR/
// AVG view: hai sàn đều có trong file đối soát cuối kỳ, gõ tay là nguồn của hàng trăm ô "4.29%", "28s" trong Sheet.
// Ca nối: gõ đúng số TỔNG đang thấy, app tự trừ ca trước cùng phòng (trước đây trợ live tự trừ — và có ca bỏ trống).

interface Props {
  session: LiveSession;
  onSaved: (updated: LiveSession[]) => void;
  onCancel?: () => void;
}

type Incident = "ot" | "early" | "restart" | "late";
const INCIDENT_LABEL: Record<Incident, string> = { ot: "OT", early: "Off sớm", restart: "Restart", late: "Host trễ" };

const inputCls =
  "w-full min-h-11 px-3 py-2.5 border border-[var(--border)] rounded-xl text-base font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]";
const labelCls = "block text-xs font-bold text-[var(--text-muted)] mb-1";

export function HandoverForm({ session: s, onSaved, onCancel }: Props) {
  const r = s.report;
  const isShopee = s.platform === "Shopee";
  const [link, setLink] = useState(r?.dashboardLink1 ?? "");
  const [gmv, setGmv] = useState(fmtCount(r?.cumGmv));
  const [views, setViews] = useState(fmtCount(r?.cumViews));
  const [third, setThird] = useState(fmtCount(isShopee ? r?.cumAtc : r?.cumOrders));
  const [coins, setCoins] = useState(fmtCount(r?.coinSpent));
  const [incidents, setIncidents] = useState<Set<Incident>>(() => {
    const out = new Set<Incident>();
    if (r?.otMinutes) out.add("ot");
    if (r?.earlyLeaveMinutes) out.add("early");
    if (r?.restartCount) out.add("restart");
    if (r?.hostLate) out.add("late");
    return out;
  });
  const [otMinutes, setOtMinutes] = useState(r?.otMinutes || 30);
  const [earlyMinutes, setEarlyMinutes] = useState(r?.earlyLeaveMinutes || 30);
  const [restarts, setRestarts] = useState(r?.restartCount || 1);
  const [note, setNote] = useState(r?.statusNote ?? "");
  const [prevState, setPrevState] = useState<{ ref: string; prev: PreviousHandover | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseDashboardLink(link), [link]);
  const wrongPlatform = !!parsed && parsed.platform !== s.platform;

  // Ca trước cùng phòng — đọc lại mỗi khi mã phòng đổi (dán link khác).
  const liveRef = parsed && !wrongPlatform ? parsed.liveRef : null;
  useEffect(() => {
    let alive = true;
    if (!liveRef) return;
    fetchPreviousHandover(s.id, link)
      .then((p) => { if (alive) setPrevState({ ref: liveRef, prev: p }); })
      .catch(() => { if (alive) setPrevState({ ref: liveRef, prev: null }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- đọc lại theo mã phòng, không theo từng ký tự của link
  }, [s.id, liveRef]);

  const prev = liveRef && prevState?.ref === liveRef ? prevState.prev : null;

  const cumGmv = parseCount(gmv);
  const cumViews = parseCount(views);
  const cumThird = parseCount(third);
  const share = cumGmv != null ? handoverShare({ cumGmv, cumViews: cumViews ?? 0, cumOrders: isShopee ? null : cumThird, cumAtc: isShopee ? cumThird : null }, prev) : null;

  const missing: string[] = [];
  if (!parsed) missing.push("link dashboard");
  if (cumGmv == null) missing.push("GMV");
  if (cumViews == null) missing.push("lượt xem");
  if (!isShopee && cumThird == null) missing.push("số đơn");
  const canSubmit = missing.length === 0 && !wrongPlatform && !share?.belowPrevious && !saving;

  const toggle = (k: Incident) =>
    setIncidents((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || cumGmv == null || cumViews == null) return;
    setSaving(true);
    setError(null);
    const input: HandoverInput = {
      link,
      cumGmv,
      cumViews,
      cumOrders: isShopee ? null : cumThird,
      cumAtc: isShopee ? cumThird : null,
      coinSpent: isShopee ? parseCount(coins) : null,
      otMinutes: incidents.has("ot") ? otMinutes : 0,
      earlyLeaveMinutes: incidents.has("early") ? earlyMinutes : 0,
      restartCount: incidents.has("restart") ? restarts : 0,
      hostLate: incidents.has("late"),
      statusNote: note.trim()
    };
    try {
      onSaved(await submitHandover(s.id, input));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const numField = (id: string, label: string, value: string, set: (v: string) => void, hint?: string) => (
    <label className="block" htmlFor={id}>
      <span className={labelCls}>{label}</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => set(e.target.value)}
        onBlur={() => set(fmtCount(parseCount(value)))}
        placeholder={hint}
        className={`${inputCls} font-mono tabular-nums`}
      />
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls} htmlFor="handover-link">1 · Link dashboard của phòng live</label>
        <input
          id="handover-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={isShopee ? "https://banhang.shopee.vn/creator-center/dashboard/live/…" : "https://shop.tiktok.com/workbench/live/overview?room_id=…"}
          className={`${inputCls} text-sm font-mono`}
        />
        {link.trim() !== "" && !parsed && (
          <p className="text-[11px] text-amber-300">
            Chưa đọc được link. {isShopee ? "Ca Shopee: dán link Creator Center có \"/dashboard/live/<số>\"." : "Ca TikTok: dán link TikTok Shop có \"room_id=…\"."}
          </p>
        )}
        {parsed && (
          <p className={`text-[11px] flex flex-wrap items-center gap-1.5 ${wrongPlatform ? "text-rose-300" : "text-emerald-300"}`}>
            <Link2 className="w-3.5 h-3.5" />
            <PlatformChip platform={parsed.platform} />
            {parsed.platform === "Shopee" ? "phiên" : "phòng"} <span className="font-mono">{parsed.liveRef}</span>
            {wrongPlatform && <b>— ca này là ca {s.platform}, kiểm lại link.</b>}
            {!wrongPlatform && (prev ? <span>· ca nối với ca {prev.startTime}–{prev.endTime}</span> : <span>· phòng mới (ca đầu)</span>)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className={labelCls}>2 · Số đang thấy trên dashboard{prev ? " (số TỔNG từ lúc bật phòng)" : ""}</p>
        {numField("handover-gmv", "GMV", gmv, setGmv, "vd 11.513.359")}
        <div className="grid grid-cols-2 gap-2">
          {numField("handover-third", isShopee ? "ATC" : "Đơn", third, setThird, isShopee ? "không bắt buộc" : undefined)}
          {numField("handover-views", "Lượt xem", views, setViews)}
        </div>
        {isShopee && numField("handover-coins", "Xu đã tung (nếu có)", coins, setCoins, "không bắt buộc")}
        {prev && share && (
          <div className={`rounded-xl px-3 py-2 text-xs ${share.belowPrevious ? "bg-rose-950/60 text-rose-200 border border-rose-800" : "bg-emerald-950/50 text-emerald-200 border border-emerald-800"}`}>
            {share.belowPrevious ? (
              <>GMV nhỏ hơn số ca {prev.startTime}–{prev.endTime} đã giao ({fmtVndFull(prev.cumGmv)}). Ca nối thì nhập số TỔNG đang thấy, app tự trừ.</>
            ) : (
              <>
                Ca này = số đang thấy − ca {prev.startTime}–{prev.endTime}:{" "}
                <b className="font-mono">GMV {fmtVndFull(share.gmv)} · {fmtCount(share.views)} lượt xem{isShopee ? (share.atc != null ? ` · ${fmtCount(share.atc)} ATC` : "") : ` · ${fmtCount(share.orders)} đơn`}</b>
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className={labelCls}>3 · Ca này có gì?</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={incidents.size === 0}
            onClick={() => setIncidents(new Set())}
            className={`min-h-9 px-3 rounded-full text-xs font-bold border ${incidents.size === 0 ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}
          >
            Đúng giờ, không sự cố
          </button>
          {(Object.keys(INCIDENT_LABEL) as Incident[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={incidents.has(k)}
              onClick={() => toggle(k)}
              className={`min-h-9 px-3 rounded-full text-xs font-bold border ${incidents.has(k) ? "bg-amber-600 text-white border-amber-600" : "border-[var(--border)] text-[var(--text-muted)]"}`}
            >
              {INCIDENT_LABEL[k]}
            </button>
          ))}
        </div>
        {(["ot", "early"] as const).filter((k) => incidents.has(k)).map((k) => {
          const val = k === "ot" ? otMinutes : earlyMinutes;
          const set = k === "ot" ? setOtMinutes : setEarlyMinutes;
          return (
            <div key={k} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-[var(--text-muted)] w-14">{INCIDENT_LABEL[k]}</span>
              {MINUTE_PRESETS.map((m) => (
                <button key={m} type="button" onClick={() => set(m)} className={`min-h-8 px-2.5 rounded-lg border font-bold ${val === m ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
                  {m}p
                </button>
              ))}
              <input
                aria-label={`${INCIDENT_LABEL[k]} (phút)`}
                inputMode="numeric"
                value={String(val)}
                onChange={(e) => set(parseCount(e.target.value) ?? 0)}
                className="w-16 min-h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-mono"
              />
              <span className="text-[var(--text-faint)]">phút</span>
            </div>
          );
        })}
        {incidents.has("restart") && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-[var(--text-muted)] w-14">Restart</span>
            <input aria-label="Số lần restart" inputMode="numeric" value={String(restarts)} onChange={(e) => setRestarts(parseCount(e.target.value) ?? 0)} className="w-16 min-h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-mono" />
            <span className="text-[var(--text-faint)]">lần</span>
          </div>
        )}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" className={`${inputCls} text-sm`} />
      </div>

      <p className="text-[11px] text-[var(--text-faint)]">
        Số lúc giao ca thường thấp hơn số chốt (đo T8–T9: 16–23%) vì đơn còn về sau khi tắt live. Số chốt lấy từ file đối soát cuối kỳ — các chỉ số
        khác (CTR, CTOR, xem trung bình…) cũng lấy từ file đó, không cần gõ.
      </p>
      {error && <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded-xl px-3 py-2">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-12 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-sm">
            Thôi
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm"
          title={missing.length ? `Còn thiếu: ${missing.join(", ")}` : undefined}
        >
          {saving ? "Đang giao ca..." : r?.handoverAt ? "Cập nhật giao ca" : "Giao ca"}
        </button>
      </div>
      {missing.length > 0 && <p className="text-[11px] text-[var(--text-faint)]">Còn thiếu: {missing.join(", ")}.</p>}
    </form>
  );
}
