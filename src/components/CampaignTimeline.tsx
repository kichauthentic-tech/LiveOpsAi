import React, { useMemo, useState } from "react";
import { Brand, Campaign, LiveSession, ShiftSlot } from "../types";
import { ChevronLeft, ChevronRight, Target, CalendarRange, ArrowRight } from "lucide-react";
import { computeCampaignActualGmv } from "../lib/campaignMetrics";

interface CampaignTimelineProps {
  campaigns: Campaign[];
  brands: Brand[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  onJumpToSchedule: (campaignId: string, month: string) => void;
}

const CAMPAIGN_TYPE_LABELS: Record<Campaign["type"], string> = {
  daily: "Daily",
  mega: "Mega D-Day",
  mid_month: "Mid-month",
  payday: "Payday",
  other: "Khác"
};

const STATUS_LABELS: Record<Campaign["status"], string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled"
};

const STATUS_BAR_COLOR: Record<Campaign["status"], string> = {
  draft: "bg-amber-600",
  active: "bg-emerald-600",
  completed: "bg-blue-600",
  cancelled: "bg-slate-700"
};

const STATUS_BADGE_STYLE: Record<Campaign["status"], string> = {
  draft: "bg-amber-950 text-amber-300 border-amber-800",
  active: "bg-emerald-950 text-emerald-300 border-emerald-800",
  completed: "bg-blue-950 text-blue-300 border-blue-800",
  cancelled: "bg-slate-800 text-slate-500 border-slate-700"
};

const OUTCOME_LABELS: Record<NonNullable<Campaign["outcome"]>, string> = {
  kpi_met: "Đạt KPI",
  kpi_missed: "Không đạt KPI",
  partial: "Đạt một phần"
};

const OUTCOME_STYLES: Record<NonNullable<Campaign["outcome"]>, string> = {
  kpi_met: "bg-emerald-950 text-emerald-300",
  kpi_missed: "bg-rose-950 text-rose-300",
  partial: "bg-amber-950 text-amber-300"
};

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

const toDayIndex = (dateStr: string) => Math.floor(new Date(`${dateStr}T00:00:00`).getTime() / 86400000);

const firstOfMonth = (month: string) => `${month}-01`;
const lastOfMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${`${lastDay}`.padStart(2, "0")}`;
};

const shiftMonthStr = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `Th${m}/${y}`;
};

export default function CampaignTimeline({ campaigns, brands, sessions, shiftSlots, onJumpToSchedule }: CampaignTimelineProps) {
  const today = getTodayDateString();
  const [centerMonth, setCenterMonth] = useState(today.slice(0, 7));
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const windowMonths = useMemo(() => [shiftMonthStr(centerMonth, -1), centerMonth, shiftMonthStr(centerMonth, 1)], [centerMonth]);
  const windowStart = firstOfMonth(windowMonths[0]);
  const windowEnd = lastOfMonth(windowMonths[2]);
  const windowStartIdx = toDayIndex(windowStart);
  const windowEndIdx = toDayIndex(windowEnd);
  const totalDays = windowEndIdx - windowStartIdx + 1;

  const campaignActualGmv = useMemo(() => computeCampaignActualGmv(campaigns, sessions), [campaigns, sessions]);

  const visibleCampaigns = useMemo(
    () =>
      campaigns
        .filter((c) => (brandFilter === "ALL" ? true : c.brandId === brandFilter))
        .filter((c) => (statusFilter === "ALL" ? true : c.status === statusFilter))
        .filter((c) => c.startDate <= windowEnd && c.endDate >= windowStart)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [campaigns, brandFilter, statusFilter, windowStart, windowEnd]
  );

  const lanes = useMemo(() => {
    const map = new Map<string, { brandId: string; brandName: string; campaigns: Campaign[] }>();
    visibleCampaigns.forEach((c) => {
      const lane = map.get(c.brandId) ?? { brandId: c.brandId, brandName: c.brandName, campaigns: [] };
      lane.campaigns.push(c);
      map.set(c.brandId, lane);
    });
    return Array.from(map.values()).sort((a, b) => a.brandName.localeCompare(b.brandName));
  }, [visibleCampaigns]);

  const totals = useMemo(() => {
    const targetGmv = visibleCampaigns.reduce((acc, c) => acc + c.targetGmv, 0);
    const actualGmv = visibleCampaigns.reduce((acc, c) => acc + (campaignActualGmv.get(c.id) ?? 0), 0);
    return { targetGmv, actualGmv, count: visibleCampaigns.length };
  }, [visibleCampaigns, campaignActualGmv]);

  const barStyle = (c: Campaign) => {
    const startIdx = Math.max(toDayIndex(c.startDate), windowStartIdx);
    const endIdx = Math.min(toDayIndex(c.endDate), windowEndIdx);
    const leftPct = ((startIdx - windowStartIdx) / totalDays) * 100;
    const widthPct = Math.max(((endIdx - startIdx + 1) / totalDays) * 100, 100 / totalDays);
    return { left: `${leftPct}%`, width: `${widthPct}%` };
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-purple-400" /> Campaign Timeline
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Toàn cảnh Campaign mọi Brand trên 1 trục thời gian — không cần lật từng tháng/brand riêng ở Đăng Ký & Chốt Lịch. Dữ liệu đọc trực tiếp từ campaigns/live_sessions/shift_slots đã có, không phải bảng mới.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCenterMonth((m) => shiftMonthStr(m, -1))}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            title="Lùi 1 tháng"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="month"
            value={centerMonth}
            onChange={(e) => setCenterMonth(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setCenterMonth((m) => shiftMonthStr(m, 1))}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            title="Tiến 1 tháng"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Tất cả Brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Mọi trạng thái</option>
            {(Object.keys(STATUS_LABELS) as Campaign["status"][]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500">Campaign trong khung 3 tháng này</p>
          <p className="text-2xl font-bold text-white mt-1">{totals.count}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500">Tổng KPI GMV</p>
          <p className="text-2xl font-bold text-white mt-1">{totals.targetGmv.toLocaleString("vi-VN")}đ</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500">Tổng GMV thật (session Completed)</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{totals.actualGmv.toLocaleString("vi-VN")}đ</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        {lanes.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">Không có Campaign nào khớp bộ lọc trong khung 3 tháng {monthLabel(windowMonths[0])} → {monthLabel(windowMonths[2])}.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex text-[11px] text-slate-500 font-mono border-b border-slate-800 pb-1.5">
              {windowMonths.map((m) => (
                <div key={m} className="flex-1 text-center">
                  {monthLabel(m)}
                  {m === centerMonth && <span className="text-purple-400"> (đang xem)</span>}
                </div>
              ))}
            </div>
            {lanes.map((lane) => (
              <div key={lane.brandId} className="space-y-1.5">
                <p className="text-xs font-bold text-slate-300">{lane.brandName}</p>
                <div className="relative bg-slate-950/80 border border-slate-800 rounded-lg h-9">
                  {/* Vạch chia ranh giới tháng giữa (đang xem) để định vị trực quan */}
                  <div className="absolute top-0 bottom-0 border-l border-slate-800" style={{ left: `${(1 / 3) * 100}%` }} />
                  <div className="absolute top-0 bottom-0 border-l border-slate-800" style={{ left: `${(2 / 3) * 100}%` }} />
                  {lane.campaigns.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onJumpToSchedule(c.id, c.startDate.slice(0, 7))}
                      title={`${c.name} · ${c.startDate} → ${c.endDate} · KPI ${c.targetGmv.toLocaleString("vi-VN")}đ`}
                      className={`absolute top-1 bottom-1 rounded-md ${STATUS_BAR_COLOR[c.status]} hover:brightness-110 transition-all text-left px-2 flex items-center overflow-hidden text-[10px] font-bold text-white/90 shadow`}
                      style={barStyle(c)}
                    >
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {visibleCampaigns.map((c) => {
          const actualGmv = campaignActualGmv.get(c.id) ?? 0;
          const pct = c.targetGmv > 0 ? Math.round((actualGmv / c.targetGmv) * 100) : 0;
          const slotCount = shiftSlots.filter((s) => s.campaignId === c.id).length;
          return (
            <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="font-bold text-white">{c.brandName}</span>
              <span className="text-slate-300">{c.name}</span>
              <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-bold">{CAMPAIGN_TYPE_LABELS[c.type]}</span>
              <span className={`px-2 py-0.5 rounded-full font-bold border ${STATUS_BADGE_STYLE[c.status]}`}>{STATUS_LABELS[c.status]}</span>
              <span className="text-slate-500 font-mono">{c.startDate} → {c.endDate}</span>
              <span className="text-slate-500">{slotCount} ca đã gán</span>
              <span className="flex items-center gap-1 text-slate-300">
                <Target className="w-3 h-3 text-emerald-400" />
                {actualGmv.toLocaleString("vi-VN")}đ / {c.targetGmv.toLocaleString("vi-VN")}đ ({pct}%)
              </span>
              {c.outcome && <span className={`px-2 py-0.5 rounded-full font-bold ${OUTCOME_STYLES[c.outcome]}`}>{OUTCOME_LABELS[c.outcome]}</span>}
              <button
                onClick={() => onJumpToSchedule(c.id, c.startDate.slice(0, 7))}
                className="ml-auto flex items-center gap-1 bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 px-2.5 py-1 rounded-lg font-bold transition-colors"
              >
                Xem trong Lịch <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
