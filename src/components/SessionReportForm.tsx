import { useState, FormEvent } from "react";
import { LiveSession } from "../types";
import { SessionReportInput } from "../lib/db/sessionReports";
import { sessionDurationHours } from "../lib/pnl";

interface SessionReportFormProps {
  session: LiveSession;
  onSubmit: (input: SessionReportInput) => Promise<boolean>;
  onCancel: () => void;
}

const inputClass =
  "w-full p-2.5 border border-[var(--border)] rounded-xl font-semibold text-[var(--text)] bg-[var(--surface-base)] placeholder:text-[var(--text-faint)]";
const labelClass = "font-bold text-[var(--text-muted)] block mb-1 text-xs";

// Mốc OT/off sớm hay gặp nhất theo mô tả vận hành của user — vẫn cho gõ tay số bất kỳ cho các
// trường hợp lệch mốc.
const MINUTE_PRESETS = [15, 30, 45, 60];

// Field theo đúng cấu trúc file Excel thật (YFB Working File 2026) — common mọi platform +
// nhóm riêng TikTok/Shopee. actualGmv/totalViews/ctrAvg/avgWatchTimeSeconds ghi thẳng vào
// live_sessions (đã có sẵn từ Giai đoạn B6), phần còn lại vào sidecar live_session_reports
// (migration 0046). peakViewers/cvrAvg (B6) không thuộc form này — Excel không có 2 chỉ số đó.
export function SessionReportForm({ session, onSubmit, onCancel }: SessionReportFormProps) {
  const r = session.report;
  const [actualGmv, setActualGmv] = useState(session.actualGmv || 0);
  const [totalViews, setTotalViews] = useState(session.totalViews || 0);
  const [ctrAvg, setCtrAvg] = useState(session.ctrAvg || 0);
  const [avgWatchTimeSeconds, setAvgWatchTimeSeconds] = useState(session.avgWatchTimeSeconds || 0);

  const [restartCount, setRestartCount] = useState(r?.restartCount || 0);
  const [crossLive, setCrossLive] = useState(r?.crossLive || false);
  const [hostLate, setHostLate] = useState(r?.hostLate || false);
  const [otMinutes, setOtMinutes] = useState(r?.otMinutes ?? 0);
  const [earlyLeaveMinutes, setEarlyLeaveMinutes] = useState(r?.earlyLeaveMinutes ?? 0);
  const [statusNote, setStatusNote] = useState(r?.statusNote || "");
  const [gmvTotal, setGmvTotal] = useState(r?.gmvTotal ?? 0);
  const [dashboardLink1, setDashboardLink1] = useState(r?.dashboardLink1 || "");
  const [dashboardLink2, setDashboardLink2] = useState(r?.dashboardLink2 || "");

  const [impressionCount, setImpressionCount] = useState(r?.impressionCount ?? 0);
  const [adsCost, setAdsCost] = useState(r?.adsCost ?? 0);
  const [enterRoomRate, setEnterRoomRate] = useState(r?.enterRoomRate ?? 0);
  const [ctor, setCtor] = useState(r?.ctor ?? 0);
  const [avgOrderValue, setAvgOrderValue] = useState(r?.avgOrderValue ?? 0);

  const [atcCount, setAtcCount] = useState(r?.atcCount ?? 0);
  const [gpm, setGpm] = useState(r?.gpm ?? 0);
  const [checkoutCount, setCheckoutCount] = useState(r?.checkoutCount ?? 0);
  const [coinSpent, setCoinSpent] = useState(r?.coinSpent ?? 0);

  const [saving, setSaving] = useState(false);

  const isTikTok = session.platform === "TikTok";

  // Giờ tính lương hiện ngay tại form để host/ops thấy hệ quả của con số vừa khai (cùng công
  // thức billableSessionHours ở pnl.ts, nhưng tính từ state đang gõ chứ không từ report đã lưu).
  const scheduledHours = sessionDurationHours(session.startTime, session.endTime);
  const billableHours = Math.max(0, scheduledHours + (otMinutes - earlyLeaveMinutes) / 60);
  const fmtHours = (h: number) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onSubmit({
      actualGmv,
      totalViews,
      ctrAvg,
      avgWatchTimeSeconds,
      restartCount,
      crossLive,
      hostLate,
      otMinutes,
      earlyLeaveMinutes,
      statusNote,
      gmvTotal,
      dashboardLink1: dashboardLink1 || undefined,
      dashboardLink2: dashboardLink2 || undefined,
      ...(isTikTok
        ? { impressionCount, adsCost, enterRoomRate, ctor, avgOrderValue }
        : { atcCount, gpm, checkoutCount, coinSpent })
    });
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelClass}>GMV Live (VNĐ)</label>
          <input type="number" value={actualGmv} onChange={(e) => setActualGmv(Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>GMV Tổng (VNĐ)</label>
          <input type="number" value={gmvTotal} onChange={(e) => setGmvTotal(Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>View</label>
          <input type="number" value={totalViews} onChange={(e) => setTotalViews(Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>AVG.view (giây)</label>
          <input
            type="number"
            value={avgWatchTimeSeconds}
            onChange={(e) => setAvgWatchTimeSeconds(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      {isTikTok ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className={labelClass}>Impression</label>
            <input type="number" value={impressionCount} onChange={(e) => setImpressionCount(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>ADS Cost</label>
            <input type="number" value={adsCost} onChange={(e) => setAdsCost(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>ERR (%)</label>
            <input type="number" step="0.01" value={enterRoomRate} onChange={(e) => setEnterRoomRate(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>CTR LIVE (%)</label>
            <input type="number" step="0.01" value={ctrAvg} onChange={(e) => setCtrAvg(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>CTOR (%)</label>
            <input type="number" step="0.01" value={ctor} onChange={(e) => setCtor(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>AVG.price (VNĐ)</label>
            <input type="number" value={avgOrderValue} onChange={(e) => setAvgOrderValue(Number(e.target.value))} className={inputClass} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className={labelClass}>ATC</label>
            <input type="number" value={atcCount} onChange={(e) => setAtcCount(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>CTR (%)</label>
            <input type="number" step="0.01" value={ctrAvg} onChange={(e) => setCtrAvg(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>GPM</label>
            <input type="number" value={gpm} onChange={(e) => setGpm(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>CO (Checkout)</label>
            <input type="number" value={checkoutCount} onChange={(e) => setCheckoutCount(Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Xu Đã Tung</label>
            <input type="number" value={coinSpent} onChange={(e) => setCoinSpent(Number(e.target.value))} className={inputClass} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className={labelClass}>RESTART (số lần)</label>
          <input type="number" value={restartCount} onChange={(e) => setRestartCount(Number(e.target.value))} className={inputClass} />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)] font-semibold pb-2.5">
          <input type="checkbox" checked={hostLate} onChange={(e) => setHostLate(e.target.checked)} className="w-4 h-4" />
          Host đến trễ
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)] font-semibold pb-2.5">
          <input type="checkbox" checked={crossLive} onChange={(e) => setCrossLive(e.target.checked)} className="w-4 h-4" />
          Cross Live
        </label>
        <div>
          <label className={labelClass}>Status Live</label>
          <input type="text" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} className={inputClass} placeholder="Ghi chú tình trạng ca" />
        </div>
      </div>


      {/* OT / Off sớm — cơ sở tính giờ công cho talent ăn lương theo giờ (Giai đoạn 3). Số liệu
          đối soát TikTok KHÔNG tự điền vào đây: đối soát chỉ cảnh báo lệch, giờ công vẫn theo
          khai báo + ops duyệt. */}
      <div className="border border-[var(--border)] rounded-xl p-3 space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="font-bold text-[var(--text)] text-xs">Giờ Công Thực Tế</p>
          <p className="text-[11px] text-[var(--text-muted)]">
            Ca theo lịch <b>{fmtHours(scheduledHours)}</b> ({session.startTime}–{session.endTime})
            {" → "}tính lương <b className={billableHours !== scheduledHours ? "text-amber-500" : "text-[var(--text)]"}>{fmtHours(billableHours)}</b>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>OT — live thêm (phút)</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {MINUTE_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setOtMinutes(otMinutes === m ? 0 : m)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                    otMinutes === m
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  +{m}p
                </button>
              ))}
              <input
                type="number"
                min={0}
                value={otMinutes}
                onChange={(e) => setOtMinutes(Math.max(0, Number(e.target.value)))}
                className="w-20 p-1.5 border border-[var(--border)] rounded-lg font-semibold text-[var(--text)] bg-[var(--surface-base)] text-[11px]"
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Off sớm — nghỉ trước giờ (phút)</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {MINUTE_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEarlyLeaveMinutes(earlyLeaveMinutes === m ? 0 : m)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                    earlyLeaveMinutes === m
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  −{m}p
                </button>
              ))}
              <input
                type="number"
                min={0}
                value={earlyLeaveMinutes}
                onChange={(e) => setEarlyLeaveMinutes(Math.max(0, Number(e.target.value)))}
                className="w-20 p-1.5 border border-[var(--border)] rounded-lg font-semibold text-[var(--text)] bg-[var(--surface-base)] text-[11px]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Link Dashboard 1</label>
          <input type="text" value={dashboardLink1} onChange={(e) => setDashboardLink1(e.target.value)} className={inputClass} placeholder="https://..." />
        </div>
        <div>
          <label className={labelClass}>Link Dashboard 2</label>
          <input type="text" value={dashboardLink2} onChange={(e) => setDashboardLink2(e.target.value)} className={inputClass} placeholder="https://..." />
        </div>
      </div>

      {r?.submittedAt && (
        <p className="text-xs text-[var(--text-faint)]">
          Lần nhập gần nhất: {new Date(r.submittedAt).toLocaleString("vi-VN")}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-[var(--text-muted)] font-bold hover:bg-[var(--surface-elevated)] rounded-xl transition-all">
          Hủy Bỏ
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow transition-all"
        >
          {saving ? "Đang Lưu..." : "Chốt Report Ca Này"}
        </button>
      </div>
    </form>
  );
}
