import { useState, FormEvent } from "react";
import { LiveSession } from "../types";
import { SessionReportInput } from "../lib/db/sessionReports";

interface SessionReportFormProps {
  session: LiveSession;
  onSubmit: (input: SessionReportInput) => Promise<boolean>;
  onCancel: () => void;
}

const inputClass =
  "w-full p-2.5 border border-slate-700 rounded-xl font-semibold text-slate-100 bg-slate-950 placeholder:text-slate-500";
const labelClass = "font-bold text-slate-300 block mb-1 text-xs";

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
        <label className="flex items-center gap-2 text-sm text-slate-300 font-semibold pb-2.5">
          <input type="checkbox" checked={hostLate} onChange={(e) => setHostLate(e.target.checked)} className="w-4 h-4" />
          Host đến trễ
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300 font-semibold pb-2.5">
          <input type="checkbox" checked={crossLive} onChange={(e) => setCrossLive(e.target.checked)} className="w-4 h-4" />
          Cross Live
        </label>
        <div>
          <label className={labelClass}>Status Live</label>
          <input type="text" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} className={inputClass} placeholder="Ghi chú tình trạng ca" />
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
        <p className="text-xs text-slate-500">
          Lần nhập gần nhất: {new Date(r.submittedAt).toLocaleString("vi-VN")}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-slate-400 font-bold hover:bg-slate-800 rounded-xl transition-all">
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
