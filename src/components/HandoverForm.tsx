import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { LiveSession } from "../types";
import { fmtCount, handoverShare, HandoverInput, parseCount, parseDashboardLink, PreviousHandover } from "../lib/handover";
import { HandoverIncidents, incidentsFromReport, incidentValues } from "./HandoverIncidents";
import { fetchPreviousHandover, submitHandover } from "../lib/db/handovers";
import { errorMessage } from "../lib/errorMessage";
import { fmtVndFull } from "../lib/format";
import { PlatformChip } from "./common/PlatformChip";
import { profileOf } from "../lib/platforms/profiles";
import { METRIC } from "../lib/metricGlossary";

// Màn GIAO CA của ca SHOPEE (0144; ca TikTok giao bằng file — TikTokHandover, user chốt 06/10 tối). Thiết kế cho điện thoại, làm trong
// một phút: (1) dán link dashboard, (2) gõ 3 số ĐANG THẤY trên dashboard, (3) chạm chọn sự cố. Không hỏi CTR/CTOR/ERR/
// AVG view: hai sàn đều có trong file đối soát cuối kỳ, gõ tay là nguồn của hàng trăm ô "4.29%", "28s" trong Sheet.
// Ca nối: gõ đúng số TỔNG đang thấy, app tự trừ ca trước cùng phòng (trước đây trợ live tự trừ — và có ca bỏ trống).

interface Props {
  session: LiveSession;
  onSaved: (updated: LiveSession[]) => void;
  onCancel?: () => void;
}

const inputCls =
  "w-full min-h-11 px-3 py-2.5 border border-[var(--border)] rounded-xl text-base font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]";
const labelCls = "block text-xs font-bold text-[var(--text-muted)] mb-1";

export function HandoverForm({ session: s, onSaved, onCancel }: Props) {
  const r = s.report;
  const prof = profileOf(s);
  const third3 = prof.handoverThird;
  const [link, setLink] = useState(r?.dashboardLink1 ?? "");
  const [gmv, setGmv] = useState(fmtCount(r?.cumGmv));
  const [views, setViews] = useState(fmtCount(r?.cumViews));
  const [third, setThird] = useState(fmtCount(third3?.key === "atc" ? r?.cumAtc : r?.cumOrders));
  const [incidents, setIncidents] = useState(() => incidentsFromReport(r));
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
  const share = cumGmv != null ? handoverShare({ cumGmv, cumViews: cumViews ?? 0, cumOrders: third3?.key === "orders" ? cumThird : null, cumAtc: third3?.key === "atc" ? cumThird : null }, prev) : null;

  const missing: string[] = [];
  if (!parsed) missing.push("link dashboard");
  if (cumGmv == null) missing.push("GMV");
  if (cumViews == null) missing.push(prof.viewsLabel);
  if (third3?.required && cumThird == null) missing.push(`số ${third3.label.toLowerCase()}`);
  const canSubmit = missing.length === 0 && !wrongPlatform && !share?.belowPrevious && !saving;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || cumGmv == null || cumViews == null) return;
    setSaving(true);
    setError(null);
    const input: HandoverInput = {
      link,
      cumGmv,
      cumViews,
      cumOrders: third3?.key === "orders" ? cumThird : null,
      cumAtc: third3?.key === "atc" ? cumThird : null,
      coinSpent: null,
      ...incidentValues(incidents)
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
          placeholder={prof.dashboardLinkExample}
          className={`${inputCls} text-sm font-mono`}
        />
        {link.trim() !== "" && !parsed && (
          <p className="text-[11px] text-amber-300">
            Chưa đọc được link. {prof.dashboardLinkHint}
          </p>
        )}
        {parsed && (
          <p className={`text-[11px] flex flex-wrap items-center gap-1.5 ${wrongPlatform ? "text-rose-300" : "text-emerald-300"}`}>
            <Link2 className="w-3.5 h-3.5" />
            <PlatformChip platform={parsed.platform} />
            {profileOf(parsed.platform).liveRefNoun} <span className="font-mono">{parsed.liveRef}</span>
            {wrongPlatform && <b>— ca này là ca {s.platform}, kiểm lại link.</b>}
            {!wrongPlatform && (prev ? <span>· ca nối với ca {prev.startTime}–{prev.endTime}</span> : <span>· phòng mới (ca đầu)</span>)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className={labelCls}>2 · Số đang thấy trên dashboard{prev ? " (số TỔNG từ lúc bật phòng)" : ""}</p>
        {numField("handover-gmv", "GMV", gmv, setGmv, "vd 11.513.359")}
        <div className="grid grid-cols-2 gap-2">
          {third3 && numField("handover-third", third3.label, third, setThird, third3.required ? undefined : "không bắt buộc")}
          {numField("handover-views", prof.viewsLabel, views, setViews)}
        </div>
        {prev && share && (
          <div className={`rounded-xl px-3 py-2 text-xs ${share.belowPrevious ? "bg-rose-950/60 text-rose-200 border border-rose-800" : "bg-emerald-950/50 text-emerald-200 border border-emerald-800"}`}>
            {share.belowPrevious ? (
              <>GMV nhỏ hơn số ca {prev.startTime}–{prev.endTime} đã giao ({fmtVndFull(prev.cumGmv)}). Ca nối thì nhập số TỔNG đang thấy, app tự trừ.</>
            ) : (
              <>
                Ca này = số đang thấy − ca {prev.startTime}–{prev.endTime}:{" "}
                <b className="font-mono">GMV {fmtVndFull(share.gmv)} · {fmtCount(share.views)} {prof.viewsLabel}{third3?.key === "atc" ? (share.atc != null ? ` · ${fmtCount(share.atc)} ${METRIC.atc}` : "") : third3 ? ` · ${fmtCount(share.orders)} ${METRIC.orders}` : ""}</b>
              </>
            )}
          </div>
        )}
      </div>

      <HandoverIncidents label="3 · Ca này có gì?" value={incidents} onChange={setIncidents} />

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
