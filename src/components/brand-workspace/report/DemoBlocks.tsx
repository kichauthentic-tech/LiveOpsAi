import React from "react";

// Khối dựng trang theo markup của bản demo Report Tháng (scratchpad/build/template.html, class trong demo.css, gốc .rt).
// Insight cuối trang dùng DemoInsight của DemoShopWhy.tsx.

export const DemoPage: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="pg on">{children}</div>;

export const DemoHead: React.FC<{ no: string; title: string; headline: string }> = ({ no, title, headline }) => (
  <div className="ph">
    <div className="pt">{no} · {title}</div>
    <h2>{headline}</h2>
  </div>
);

export interface DemoKpi {
  lab: React.ReactNode;
  val: React.ReactNode;
  /** màu số lớn: "red" | "gold" | "green" | "muted" */
  tone?: "red" | "gold" | "green" | "muted";
  note?: React.ReactNode;
}
export const DemoKpis: React.FC<{ items: DemoKpi[] }> = ({ items }) => (
  <div className="kpis">
    {items.slice(0, 4).map((k, i) => (
      <div key={i} className="kpi">
        <div className="lab">{k.lab}</div>
        <div className="val" style={k.tone ? { color: `var(--${k.tone})` } : undefined}>{k.val}</div>
        {k.note != null && <div className="note">{k.note}</div>}
      </div>
    ))}
  </div>
);

/** Huy hiệu % của ô KPI: đỏ < 90, vàng < 100, xanh từ 100. */
export const pcTone = (p: number) => (p >= 100 ? "up" : p >= 90 ? "am" : "dn");

export const DemoPanel: React.FC<{ title: string; sub?: React.ReactNode; children: React.ReactNode }> = ({ title, sub, children }) => (
  <div className="pn">
    <div className="pnh">{title}</div>
    {sub != null && <div className="pns">{sub}</div>}
    {children}
  </div>
);

/** Hàng các panel xếp dọc (class .stk của demo). */
export const DemoStack: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="stk">{children}</div>;

/** Chuỗi HTML do demoCharts.ts dựng (SVG / hbars) — chỉ nhận chuỗi tự dựng từ số, không nhận chữ người dùng nhập. */
export const Html: React.FC<{ html: string; className?: string; style?: React.CSSProperties }> = ({ html, className, style }) => (
  <div className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />
);

export const DemoTable: React.FC<{ html: string; id?: string }> = ({ html, id }) => (
  <div className="tw">
    <table id={id} dangerouslySetInnerHTML={{ __html: html }} />
  </div>
);

export const DemoLegend: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="legend">{children}</div>;
