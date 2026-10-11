import React, { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { fetchBrandLandingSeries } from "../../lib/db/forecastSnapshots";
import type { ChannelRoom } from "../../lib/performance/controlRoom";
import type { ReportPlatform } from "../../lib/reportPlatform";
import { fmtVndShort } from "../../lib/format";
import { pct } from "../dashboard/shared";
import { LandingCurve, type CurvePoint } from "./LandingCurve";
import { STATE_OF } from "./types";

// Khả năng về đích ở Dashboard brand (Phòng Điều Hành, user chốt 11/10: brand thấy khả năng về đích, KHÔNG thấy bộ thương lượng target).
//   • ops: tính ngay từ ca (`room`, cùng engine với Phòng Điều Hành).
//   • role brand: tháng chưa phát hành thì không được thấy GMV (live_sessions_secure) ⇒ đọc RPC brand_landing_series (0170) — chỉ
//     ngày + xác suất + target, tính từ sổ dự báo; có điểm cho những ngày agency đã mở Dashboard / Phòng Điều Hành.

export const BrandLanding: React.FC<{ brandId: string; month: string; platform: ReportPlatform; room?: ChannelRoom | null }> = ({ brandId, month, platform, room }) => {
  const [server, setServer] = useState<{ key: string; points: CurvePoint[]; target: number | null; missing: boolean } | null>(null);
  const key = `${brandId}|${month}|${platform}`;
  useEffect(() => {
    if (room !== undefined) return;
    let alive = true;
    fetchBrandLandingSeries(brandId, month)
      .then((r) => {
        if (!alive) return;
        const mine = r.points.filter((p) => p.platform === platform);
        setServer({ key, points: mine.map((p) => ({ asOf: p.asOf, pHit: p.pHit })), target: mine.length ? mine[mine.length - 1].target : null, missing: r.missing });
      })
      .catch(() => alive && setServer({ key, points: [], target: null, missing: false }));
    return () => { alive = false; };
  }, [brandId, month, platform, room, key]);

  const points: CurvePoint[] = room ? room.curve.map((p) => ({ asOf: p.asOf, pHit: p.pHit })) : server?.key === key ? server.points : [];
  const target = room ? room.target : server?.key === key ? server.target : null;
  const last = [...points].reverse().find((p) => p.pHit != null)?.pHit ?? null;
  const st = STATE_OF(last);
  if (room === null) return null;
  if (room === undefined && (server?.key !== key || server.missing || points.length === 0)) return null;
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-[var(--text)] flex items-center gap-2"><Target className="w-4 h-4 text-[var(--accent-text)]" />Khả năng về đích tháng {Number(month.slice(5))}</h3>
        <span className="inline-flex items-center gap-2">
          <b className="text-lg tabular-nums text-[var(--text)]">{pct(last)}</b>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        </span>
      </div>
      <LandingCurve month={month} points={points} width={640} height={130} label="Khả năng về đích" />
      <p className="text-xs text-[var(--text-faint)]">
        Xác suất đạt target {target ? fmtVndShort(target) : ""} của Kế Hoạch Tháng, cập nhật theo kết quả từng ngày và lịch live còn lại. Đường dải 80% đã kiểm trên 3 tháng trước: chứa kết quả thật khoảng 8/10 lần.
        {room === undefined && " Số GMV chi tiết hiện khi Report Tháng được phát hành."}
      </p>
    </div>
  );
};
