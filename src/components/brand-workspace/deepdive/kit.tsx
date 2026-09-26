import React from "react";

// Bộ UI dùng chung cho Report Tháng Chuyên Sâu. Khai riêng thay vì import từ MonthlyReportTabs.tsx
// để 2 report không kéo nhau khi sửa — bảng màu cố ý trùng để nhìn liền mạch một hệ thống.
export const PAL = {
  bg: "#0b0b0d",
  panel: "#17171b",
  panel2: "#1d1d22",
  panel3: "#232329",
  line: "#2a2a30",
  gold: "#f2c94c",
  goldDim: "#a9873a",
  cream: "#f4f1e8",
  muted: "#93939c",
  faint: "#6b6b74",
  green: "#6fcf97",
  red: "#eb6b6b",
  blue: "#7fb0e0",
  violet: "#b39ddb",
  teal: "#6fd0c8",
  orange: "#f2a25c"
};

export const CHANNEL_COLORS: Record<string, string> = {
  shopLive: PAL.gold,
  creatorLive: PAL.violet,
  card: PAL.teal,
  video: PAL.blue,
  other: PAL.faint,
  sellerLive: PAL.gold,
  sellerVideo: PAL.blue,
  creatorVideo: PAL.orange
};

export const chartTooltipStyle: React.CSSProperties = {
  background: PAL.panel2,
  border: `1px solid ${PAL.line}`,
  borderRadius: 12,
  fontSize: 11,
  color: PAL.cream
};

/** recharts khai formatter nhận ValueType (string | number | mảng), không phải number. */
export function chartNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? ""));
  return Number.isNaN(n) ? 0 : n;
}

export const fmtInt = (n?: number | null): string => (n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString("vi-VN"));
export const fmtDec = (n?: number | null, d = 1): string => (n == null || Number.isNaN(n) ? "—" : n.toLocaleString("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtPct = (n?: number | null, d = 1): string => (n == null || Number.isNaN(n) ? "—" : `${n.toLocaleString("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: d })}%`);

/** 9.100.358.401 -> "9,10 tỷ" — trục biểu đồ và thẻ KPI không đọc nổi số đầy đủ. */
export function fmtMoneyShort(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (a >= 1e3) return `${(n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}k`;
  return Math.round(n).toLocaleString("vi-VN");
}
export const fmtMoney = (n?: number | null): string => (n == null || Number.isNaN(n) ? "—" : `${Math.round(n).toLocaleString("vi-VN")}đ`);

export const Section: React.FC<{
  id?: string;
  title: string;
  icon: React.ReactNode;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, icon, sub, right, children }) => (
  <section id={id} className="rounded-2xl overflow-hidden scroll-mt-4" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
    <div
      className="px-5 py-3.5 flex items-center gap-2.5"
      style={{ borderBottom: `1px solid ${PAL.line}`, background: `linear-gradient(90deg, ${PAL.gold}22, transparent)` }}
    >
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ background: PAL.gold, color: "#1a1500" }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-black text-sm" style={{ color: PAL.cream }}>{title}</h3>
        {sub && <p className="text-[11px] leading-snug" style={{ color: PAL.muted }}>{sub}</p>}
      </div>
      {right}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

export const Delta: React.FC<{ value?: number | null; higherIsBetter?: boolean; suffix?: string }> = ({ value, higherIsBetter = true, suffix = "" }) => {
  if (value == null || Number.isNaN(value)) return <span style={{ color: PAL.faint }}>—</span>;
  const good = higherIsBetter ? value >= 0 : value <= 0;
  return (
    <span style={{ color: Math.abs(value) < 0.05 ? PAL.muted : good ? PAL.green : PAL.red }}>
      {value > 0 ? "+" : ""}{fmtDec(value, 1)}%{suffix}
    </span>
  );
};

export const StatCard: React.FC<{
  label: string;
  value: string;
  delta?: number | null;
  higherIsBetter?: boolean;
  hint?: string;
  prevLabel?: string;
}> = ({ label, value, delta, higherIsBetter = true, hint, prevLabel }) => (
  <div className="rounded-xl p-3.5" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }} title={hint}>
    <div className="text-[11px] uppercase tracking-wider truncate" style={{ color: PAL.muted }}>{label}</div>
    <div className="font-mono text-lg font-bold mt-1" style={{ color: PAL.cream }}>{value}</div>
    <div className="text-[11px] mt-1 flex items-center gap-1.5">
      <Delta value={delta} higherIsBetter={higherIsBetter} />
      {prevLabel && <span style={{ color: PAL.faint }}>· {prevLabel}</span>}
    </div>
  </div>
);

/** Ô thanh ngang trong bảng — thay cho biểu đồ riêng khi cần so sánh nhanh trong hàng. */
export const BarCell: React.FC<{ value: number; max: number; color?: string; label?: string }> = ({ value, max, color = PAL.gold, label }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 rounded-full flex-1 min-w-[40px]" style={{ background: PAL.panel3 }}>
      <div className="h-1.5 rounded-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
    </div>
    {label && <span className="font-mono text-[11px] shrink-0" style={{ color: PAL.muted }}>{label}</span>}
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs text-center py-8" style={{ color: PAL.muted }}>{children}</p>
);

export const Th: React.FC<{ children?: React.ReactNode; align?: "left" | "right" | "center"; w?: string }> = ({ children, align = "left", w }) => (
  <th className="px-2.5 py-2 font-semibold whitespace-nowrap" style={{ color: PAL.muted, textAlign: align, width: w }}>{children}</th>
);
export const Td: React.FC<{ children?: React.ReactNode; align?: "left" | "right" | "center"; mono?: boolean; color?: string; title?: string }> = ({ children, align = "left", mono, color, title }) => (
  <td className={`px-2.5 py-1.5 ${mono ? "font-mono" : ""}`} style={{ textAlign: align, color: color ?? PAL.cream }} title={title}>{children}</td>
);
