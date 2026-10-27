import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardPaste, Loader2, Trash2 } from "lucide-react";
import { ADS_PARTS, ADS_PART_LABEL, adsTrackingMonth, defaultPasteYear, parseAdsTrackingPaste, pasteMonths, sideTotal, type AdsDayRow, type AdsPasteResult } from "../../lib/ads/adsTracking";
import { deleteAdsDailyMonth, saveAdsDaily, fetchAdsDaily } from "../../lib/db/adsDaily";
import { fetchMonthPlan } from "../../lib/db/monthPlans";
import { CAMP_DAY_BUCKET_ORDER, effectiveCamp, resolveCampBucketType, type CampOverrides } from "../../lib/campaignDays";
import { todayVn } from "../../lib/performance/brandCommitment";
import { fmtDateVn, fmtFixed, fmtMonth, fmtVndFull, fmtVndShort } from "../../lib/format";
import { errorMessage } from "../../lib/errorMessage";
import { useConfirm } from "../../hooks/useConfirm";
import type { ReportPlatform } from "../../lib/reportPlatform";

// Target + thực tế Ads theo ngày dán từ file tracking của brand (CROCS "Performance Tracking", sheet "Daily Ads Report";
// migration 0184). Khác file TikTok Ads phía trên: file đó là chi phí cả cửa hàng do TikTok xuất, không có target và không tách
// Creator; khối này là kế hoạch Ads brand giao + số đã chi theo Live / Product / Creator. Report Tháng trang Quảng cáo đọc cả hai.

const DAY_TYPE_LABEL = { daily: "Daily", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" } as const;
const pctTxt = (v: number | null, d = 1) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${fmtFixed(Math.abs(v), d)}%`);
const ratio = (a: number, t: number) => (t > 0 ? (a / t) * 100 : null);

interface Props {
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  month: string;
  canManage: boolean;
  onMonthChange: (m: string) => void;
}

export const AdsTrackingPanel: React.FC<Props> = ({ brandId, brandName, platform, month, canManage, onMonthChange }) => {
  const confirm = useConfirm();
  const [version, setVersion] = useState(0);
  const loadKey = `${brandId}|${platform}|${month}|${version}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: AdsDayRow[]; camp: CampOverrides; error: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchAdsDaily(brandId, month, platform), fetchMonthPlan(brandId, month, platform).catch(() => null)])
      .then(([rows, plan]) => alive && setLoaded({ key: loadKey, rows, camp: effectiveCamp(plan?.plan.campRanges), error: null }))
      .catch((e) =>
        alive &&
        setLoaded({
          key: loadKey,
          rows: [],
          camp: {},
          error: /brand_ads_daily/.test(errorMessage(e)) ? "Chưa có bảng Ads theo ngày — cần chạy migration 0184 trong SQL Editor." : errorMessage(e, "Không đọc được Ads theo ngày")
        })
      );
    return () => {
      alive = false;
    };
  }, [brandId, platform, month, loadKey]);
  const ready = loaded?.key === loadKey;

  const [text, setText] = useState("");
  const [preview, setPreview] = useState<(AdsPasteResult & { year: number }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const read = (raw: string) => {
    setMsg(null);
    const year = defaultPasteYear(raw, todayVn());
    const r = parseAdsTrackingPaste(raw, year);
    if (r.rows.length === 0) {
      setPreview(null);
      setMsg({ tone: "err", text: "Không thấy dòng ngày nào. Copy từ sheet \"Daily Ads Report\" cả cột Month + Date (ví dụ \"10 ⇥ 01/10 ⇥ …\")." });
      return;
    }
    setPreview({ ...r, year });
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    setMsg(null);
    try {
      const n = await saveAdsDaily(brandId, platform, preview.rows);
      const months = pasteMonths(preview.rows).map((m) => fmtMonth(m.month));
      setMsg({ tone: "ok", text: `Đã lưu ${n} ngày (${months.join(", ")}) cho ${brandName}. Report Tháng đọc số mới ngay, không cần Cập nhật số liệu.` });
      const last = preview.rows[preview.rows.length - 1].date.slice(0, 7);
      if (!preview.rows.some((r) => r.date.startsWith(month))) onMonthChange(last);
      setPreview(null);
      setText("");
      setVersion((v) => v + 1);
    } catch (e) {
      const t = errorMessage(e, "Không lưu được");
      setMsg({ tone: "err", text: /brand_ads_daily/.test(t) ? "Chưa có bảng Ads theo ngày — cần chạy migration 0184 trong SQL Editor." : t });
    } finally {
      setSaving(false);
    }
  };

  const removeMonth = async () => {
    if (!(await confirm(`Xoá Ads theo ngày tháng ${fmtMonth(month)} của ${brandName}? Dán lại khối sheet để có lại số.`, { danger: true }))) return;
    try {
      await deleteAdsDailyMonth(brandId, platform, month);
      setVersion((v) => v + 1);
    } catch (e) {
      setMsg({ tone: "err", text: errorMessage(e, "Không xoá được") });
    }
  };

  const rows = useMemo(() => (ready ? loaded!.rows : []), [ready, loaded]);
  const s = useMemo(() => {
    if (!ready || !loaded || loaded.rows.length === 0) return null;
    const camp = loaded.camp;
    return adsTrackingMonth(loaded.rows, month, (d) => resolveCampBucketType(d, camp));
  }, [ready, loaded, month]);
  const previewMonths = useMemo(() => (preview ? pasteMonths(preview.rows) : []), [preview]);
  const through = s?.lastActual ? fmtDateVn(s.lastActual, false) : null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
            <ClipboardPaste className="w-4 h-4 text-[var(--accent-text)]" /> Target & thực tế Ads theo ngày · tháng {fmtMonth(month)}
          </h3>
          <p className="text-[11px] text-[var(--text-faint)] mt-1">
            Dán từ file tracking của brand (sheet &quot;Daily Ads Report&quot;: Month · Date · Target by TTS · target Total/Live/Product/Creator · actual Total/Live/Product/Creator …).
            Dán được nhiều tháng một lần; ngày đã có thì ghi đè. Cột MTD và runrate của sheet không lấy — app tự tính, cắt ở ngày cuối có số thực.
          </p>
        </div>
        {canManage && s && (
          <button onClick={removeMonth} className="text-[11px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded-lg">
            <Trash2 className="w-3.5 h-3.5" /> Xoá tháng này
          </button>
        )}
      </div>

      {canManage && !preview && (
        <div className="space-y-2">
          <textarea
            id="ads-tracking-paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const raw = e.clipboardData.getData("text");
              if (raw.includes("\t")) {
                e.preventDefault();
                setText(raw);
                read(raw);
              }
            }}
            rows={3}
            placeholder="Bấm vào đây rồi Ctrl/Cmd + V khối đã copy từ Google Sheet / Excel"
            className="w-full rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)]/40 p-3 text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]"
          />
          {text.trim() && (
            <button onClick={() => read(text)} className="bg-[var(--surface-hover)] text-[var(--text)] font-bold px-3 py-1.5 rounded-xl text-xs">
              Đọc khối đã dán
            </button>
          )}
        </div>
      )}

      {msg && (
        <div className={`p-3 rounded-xl text-xs font-semibold border ${msg.tone === "ok" ? "bg-emerald-950/70 border-emerald-800/60 text-emerald-300" : "bg-red-950/80 border-red-800/50 text-red-300"}`}>{msg.text}</div>
      )}

      {preview && (
        <div className="space-y-3 border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-elevated)]/40">
          <p className="text-xs text-[var(--text-muted)]">
            Đọc được <b className="text-[var(--text)]">{preview.rows.length} ngày</b> (năm {preview.year}) · bỏ qua {preview.skipped} dòng tiêu đề / dòng tổng.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="py-1.5 px-2">Tháng</th>
                  <th className="py-1.5 px-2 text-right">Số ngày</th>
                  <th className="py-1.5 px-2 text-right">Target cả tháng</th>
                  <th className="py-1.5 px-2 text-right">Thực tế</th>
                  <th className="py-1.5 px-2">Có số thực tới</th>
                </tr>
              </thead>
              <tbody>
                {previewMonths.map((m) => (
                  <tr key={m.month} className="border-b border-[var(--border-muted)]">
                    <td className="py-1.5 px-2 font-semibold text-[var(--text)]">{fmtMonth(m.month)}</td>
                    <td className="py-1.5 px-2 text-right">{m.days}</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(m.target)}</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(m.actual)}</td>
                    <td className="py-1.5 px-2 text-[var(--text-muted)]">{m.lastActual ? fmtDateVn(m.lastActual, false) : "chưa có"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.warnings.length > 0 && (
            <ul className="text-[11px] text-amber-300 list-disc pl-4 space-y-0.5">
              {preview.warnings.slice(0, 6).map((w) => (
                <li key={w}>{w}</li>
              ))}
              {preview.warnings.length > 6 && <li>… và {preview.warnings.length - 6} dòng khác</li>}
            </ul>
          )}
          <p className="text-[11px] text-amber-300">Khối dán không ghi tên brand — kiểm lại đây đúng là Ads của <b>{brandName}</b> trước khi lưu.</p>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="bg-[var(--accent)] text-white font-bold px-4 py-2 rounded-xl text-xs disabled:opacity-50">
              {saving ? "Đang lưu..." : `Lưu ${preview.rows.length} ngày`}
            </button>
            <button onClick={() => setPreview(null)} className="bg-[var(--surface-hover)] text-[var(--text-muted)] font-bold px-4 py-2 rounded-xl text-xs">
              Huỷ
            </button>
          </div>
        </div>
      )}

      {!ready ? (
        <div className="flex items-center gap-2 text-[var(--text-faint)] text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đọc Ads theo ngày...
        </div>
      ) : loaded!.error ? (
        <p className="text-xs text-amber-300">{loaded!.error}</p>
      ) : !s ? (
        <p className="text-xs text-[var(--text-faint)]">Tháng {fmtMonth(month)} chưa dán Ads theo ngày.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Target cả tháng" value={fmtVndShort(s.monthTarget)} note={`${s.days} ngày có target`} />
            <Tile label={through ? `Thực tế tới ${through}` : "Thực tế"} value={fmtVndShort(s.mtdActual)} note={s.spentOfMonth != null ? `${fmtFixed(s.spentOfMonth, 1)}% target cả tháng` : "chưa có ngày nào có số"} />
            <Tile
              label="So target luỹ kế"
              value={pctTxt(s.runrate)}
              note={through ? `thực tế ÷ target 1–${through}` : undefined}
              tone={s.runrate == null ? undefined : Math.abs(s.runrate) <= 5 ? "ok" : "warn"}
            />
            <Tile label="Target by TTS / ngày" value={s.ttsTargetDaily != null ? fmtVndShort(s.ttsTargetDaily) : "—"} note="cột Target by TTS của sheet" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="py-2 px-2">{through ? `Luỹ kế 1–${through}` : "Luỹ kế"}</th>
                  <th className="py-2 px-2 text-right">Target</th>
                  <th className="py-2 px-2 text-right">Thực tế</th>
                  <th className="py-2 px-2 text-right">% target</th>
                </tr>
              </thead>
              <tbody>
                {ADS_PARTS.filter((p) => s.parts[p].target > 0 || s.parts[p].actual > 0).map((p) => (
                  <tr key={p} className="border-b border-[var(--border-muted)]">
                    <td className="py-1.5 px-2 font-semibold text-[var(--text)]">{ADS_PART_LABEL[p]}</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(s.parts[p].target)}</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(s.parts[p].actual)}</td>
                    <td className="py-1.5 px-2 text-right">{ratio(s.parts[p].actual, s.parts[p].target) != null ? `${fmtFixed(ratio(s.parts[p].actual, s.parts[p].target)!, 1)}%` : "—"}</td>
                  </tr>
                ))}
                {CAMP_DAY_BUCKET_ORDER.filter((b) => s.buckets[b]).map((b, i) => (
                  <tr key={b} className={`border-b border-[var(--border-muted)] ${i === 0 ? "border-t-2 border-t-[var(--border)]" : ""}`}>
                    <td className="py-1.5 px-2 text-[var(--text-muted)]">
                      {DAY_TYPE_LABEL[b]} · {s.buckets[b]!.days} ngày
                    </td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(s.buckets[b]!.target)}</td>
                    <td className="py-1.5 px-2 text-right">{fmtVndFull(s.buckets[b]!.actual)}</td>
                    <td className="py-1.5 px-2 text-right">{ratio(s.buckets[b]!.actual, s.buckets[b]!.target) != null ? `${fmtFixed(ratio(s.buckets[b]!.actual, s.buckets[b]!.target)!, 1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {s.offDays.length > 0 && (
            <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/50 rounded-xl p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {s.offDays.length} ngày chi lệch target từ 30%:{" "}
                {s.offDays.map((d) => `${fmtDateVn(d.date, false)} ${pctTxt(d.pct, 0)}${d.note ? ` (${d.note})` : ""}`).join("; ")}.
              </span>
            </div>
          )}

          <details className="rounded-xl border border-[var(--border)]">
            <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-[var(--text-muted)]">Số từng ngày ({rows.length} ngày)</summary>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--surface)]">
                  <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">Ngày</th>
                    <th className="py-2 px-2 text-right">Target</th>
                    <th className="py-2 px-2 text-right">Thực tế</th>
                    <th className="py-2 px-2 text-right">±</th>
                    {ADS_PARTS.map((p) => (
                      <th key={p} className="py-2 px-2 text-right">{ADS_PART_LABEL[p].split(" ")[0]} thực tế</th>
                    ))}
                    <th className="py-2 px-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const t = sideTotal(r.target);
                    const a = r.actual ? sideTotal(r.actual) : null;
                    return (
                      <tr key={r.date} className={`border-b border-[var(--border-muted)] ${a == null ? "text-[var(--text-faint)]" : ""}`}>
                        <td className="py-1.5 px-2 font-semibold whitespace-nowrap">{fmtDateVn(r.date, false)}</td>
                        <td className="py-1.5 px-2 text-right">{fmtVndFull(t)}</td>
                        <td className="py-1.5 px-2 text-right">{a == null ? "chưa có" : fmtVndFull(a)}</td>
                        <td className="py-1.5 px-2 text-right">{a == null || t === 0 ? "—" : pctTxt((a / t - 1) * 100, 0)}</td>
                        {ADS_PARTS.map((p) => (
                          <td key={p} className="py-1.5 px-2 text-right">{r.actual?.[p] != null ? fmtVndFull(r.actual[p]!) : "—"}</td>
                        ))}
                        <td className="py-1.5 px-2 text-[var(--text-muted)]">{r.note ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
};

const Tile: React.FC<{ label: string; value: string; note?: string; tone?: "ok" | "warn" }> = ({ label, value, note, tone }) => (
  <div className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl p-3 min-w-0">
    <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
    <div className={`text-base font-black ${tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-400" : "text-[var(--text)]"}`}>{value}</div>
    {note && <div className="text-[11px] text-[var(--text-faint)] mt-0.5">{note}</div>}
  </div>
);
