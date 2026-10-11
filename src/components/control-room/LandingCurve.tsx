import React from "react";
import { eachDay } from "../../lib/dateUtils";
import { pct } from "../dashboard/shared";

// Đường khả năng về đích theo ngày (0–100%). Dùng chung: Phòng Điều Hành (tính ở client từ ca) và Dashboard brand (role brand đọc
// chuỗi xác suất từ RPC brand_landing_series — không có GMV). Điểm `whatIf` = khả năng nếu áp dụng sa bàn (vẽ nét đứt hổ phách).

export interface CurvePoint {
  /** "YYYY-MM-DD" — ngày số tới; ngày trước ngày 1 của tháng = điểm đầu tháng. */
  asOf: string;
  pHit: number | null;
}

export const LandingCurve: React.FC<{ month: string; points: CurvePoint[]; whatIf?: number | null; height?: number; width?: number; label: string }> = ({ month, points, whatIf, height = 96, width = 300, label }) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const days = eachDay(`${month}-01`, last);
  const n = days.length;
  const W = width, H = height, L = 30, R = 8, T = 8, B = 18;
  const xOf = (asOf: string) => (asOf < `${month}-01` ? 0 : days.indexOf(asOf) + 1);
  const x = (i: number) => L + (i / n) * (W - L - R);
  const yv = (p: number) => T + (1 - p) * (H - T - B);
  const pts = points.filter((p): p is { asOf: string; pHit: number } => p.pHit != null && (p.asOf < `${month}-01` || days.includes(p.asOf)));
  const camp = (from: number, to: number) => <rect x={x(from - 1)} y={T} width={x(to) - x(from - 1)} height={H - T - B} style={{ fill: "var(--surface-muted)" }} />;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${r1(x(xOf(p.asOf)))},${r1(yv(p.pHit))}`).join("");
  const lp = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img" aria-label={`${label}: khả năng về đích ${lp ? pct(lp.pHit) : "chưa có"}`}>
      {camp(m - 2, m)}
      {camp(13, 15)}
      {camp(23, 25)}
      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line x1={L} x2={W - R} y1={yv(p)} y2={yv(p)} style={{ stroke: "var(--border)", strokeDasharray: p === 0.5 ? "3 3" : undefined }} />
          <text x={L - 4} y={yv(p) + 3} fontSize={11} textAnchor="end" style={{ fill: "var(--text-faint)" }}>{p * 100}</text>
        </g>
      ))}
      {[1, 10, 20, n].map((dd) => (
        <text key={dd} x={x(dd)} y={H - 3} fontSize={11} textAnchor="middle" style={{ fill: "var(--text-faint)" }}>{dd}</text>
      ))}
      {pts.length > 1 && <path d={`${d}L${x(xOf(lp.asOf))},${yv(0)}L${x(xOf(pts[0].asOf))},${yv(0)}Z`} style={{ fill: "var(--accent)", opacity: 0.12 }} />}
      {pts.length > 0 && <path d={d} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2 }} strokeLinejoin="round" />}
      {pts.map((p) => (
        <circle key={p.asOf} data-tip={`${p.asOf < `${month}-01` ? "Đầu tháng" : `Sau ngày ${p.asOf.slice(8)}/${p.asOf.slice(5, 7)}`}: ${pct(p.pHit)}`} cx={x(xOf(p.asOf))} cy={yv(p.pHit)} r={6} style={{ fill: "transparent" }} />
      ))}
      {lp && whatIf != null && Math.abs(whatIf - lp.pHit) > 0.002 && (
        <g>
          <line x1={x(xOf(lp.asOf))} y1={yv(lp.pHit)} x2={x(n)} y2={yv(whatIf)} style={{ stroke: "var(--warning)", strokeDasharray: "3 3" }} />
          <circle cx={x(n)} cy={yv(whatIf)} r={4} style={{ fill: "var(--warning)" }} data-tip={`Nếu áp dụng sa bàn: ${pct(whatIf)}`} />
        </g>
      )}
      {lp && <circle cx={x(xOf(lp.asOf))} cy={yv(lp.pHit)} r={3.5} style={{ fill: "var(--accent)" }} />}
    </svg>
  );
};
