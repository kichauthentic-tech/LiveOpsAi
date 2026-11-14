import React from "react";
import { relChange } from "../../../lib/performance/periodCompare";
import { InfoDot } from "../../common/InfoDot";

// Phần trình bày dùng chung của Dashboard so cùng kỳ (22/10/2026). Không có luật số — luật ở lib/performance/periodCompare.ts.

const fmtPct = (x: number) => (Math.abs(x) * 100).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(x) < 0.1 ? 1 : 0 });

/**
 * Mũi tên so kỳ: `weak` = ít ca (dưới 5 ca một bên) hoặc số trung tính (giờ) ⇒ xám, không tô tốt/xấu. `inv` = tăng là xấu.
 * `points` = chênh điểm % của tỷ lệ (0..1) thay vì % đổi.
 */
export const Chg: React.FC<{ cur: number | null | undefined; prev: number | null | undefined; weak?: boolean; inv?: boolean; points?: boolean; digits?: number; none?: string }> = ({
  cur, prev, weak, inv, points, digits = 1, none = "kỳ trước chưa có"
}) => {
  const x = points ? (cur == null || prev == null ? null : cur - prev) : relChange(cur, prev);
  if (x == null) return <span className="text-[var(--text-faint)]">{none}</span>;
  const good = inv ? x < 0 : x > 0;
  const flat = weak || Math.abs(x) < (points ? 0.0005 : 0.005);
  const cls = flat ? "text-[var(--text-faint)]" : good ? "text-emerald-400" : "text-rose-400";
  const txt = points ? `${(Math.abs(x) * 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })} điểm` : `${fmtPct(x)}%`;
  return (
    <span className={`font-bold whitespace-nowrap ${cls}`} title={weak ? "Không tô màu: ít ca (dưới 5 ca một bên) hoặc là số giờ — tăng giảm không phải tốt xấu" : undefined}>
      {x >= 0 ? "▲ +" : "▼ −"}{txt}
    </span>
  );
};

/** Chỉ số 100 = bằng kênh: thanh hai phía quanh mốc 100 + số. */
export const IdxCell: React.FC<{ index: number; weak?: boolean }> = ({ index, weak }) => {
  const w = Math.min(50, (Math.abs(index - 100) / 60) * 50);
  const color = weak ? "var(--text-faint)" : index >= 110 ? "var(--success)" : index <= 90 ? "var(--danger)" : "var(--text-muted)";
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <span className="relative w-16 h-1.5 rounded-full bg-[var(--surface-base)] hidden sm:inline-block" aria-hidden="true">
        <i className="absolute inset-y-0 rounded-full" style={{ left: index >= 100 ? "50%" : `${50 - w}%`, width: `${w}%`, background: color }} />
        <b className="absolute -top-0.5 -bottom-0.5 left-1/2 w-px bg-[var(--text-faint)]" />
      </span>
      <b className="tabular-nums min-w-[28px] text-right" style={{ color }}>{index}</b>
    </span>
  );
};

/** Đổi chỉ số (điểm) so kỳ trước; "mới" khi kỳ trước không có. */
export const IdxDelta: React.FC<{ cur: { index: number; n: number }; prev: { index: number; n: number } | undefined; weakAt?: number }> = ({ cur, prev, weakAt = 5 }) => {
  if (!prev) return <span className="text-[var(--text-faint)]" title="Kỳ trước không có ca">mới</span>;
  const x = cur.index - prev.index, weak = cur.n < weakAt || prev.n < weakAt;
  const cls = weak || Math.abs(x) < 3 ? "text-[var(--text-faint)]" : x > 0 ? "text-emerald-400" : "text-rose-400";
  return (
    <span className="whitespace-nowrap" title={`Kỳ trước: chỉ số ${prev.index}, ${prev.n} ca${weak ? " · dưới 5 ca một bên nên chưa kết luận" : ""}`}>
      <span className={`font-bold ${cls}`}>{x >= 0 ? "▲ +" : "▼ −"}{Math.abs(x)}</span> <span className="text-[var(--text-faint)]">({prev.index})</span>
    </span>
  );
};

/**
 * Chú giải "chỉ số 100" — audit chữ 13/11: câu này lặp ở 6 khối (host, cặp, khung giờ, độ dài ca, toàn sàn). Nói MỘT
 * lần ở đây, các khối gắn vào `info` của tiêu đề thay vì viết lại dưới mỗi khối.
 */
export const IDX_NOTE = "Chỉ số 100 = GMV/giờ trung bình của chính kênh đó, nên quy mô brand không làm lệch so sánh.";

export const TH = "px-3 py-2 text-2xs font-semibold text-[var(--text-faint)] whitespace-nowrap text-right first:text-left";
export const TD = "px-3 py-2 text-right tabular-nums whitespace-nowrap first:text-left";

/** Bảng gọn trong khung (cuộn ngang trong khung khi chật, không đẩy trang tràn). */
export const Table: React.FC<{ head: React.ReactNode[]; children: React.ReactNode; empty?: string }> = ({ head, children, empty }) => (
  <div className="overflow-x-auto -mx-4 sm:-mx-5">
    <table className="w-full text-sm">
      <thead><tr className="border-b border-[var(--border-muted)]">{head.map((h, i) => <th key={i} className={TH}>{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-[var(--border-muted)]">{children}</tbody>
    </table>
    {empty && <p className="px-4 sm:px-5 py-3 text-sm text-[var(--text-faint)]">{empty}</p>}
  </div>
);

/**
 * Tiêu đề khối trong thẻ: tên + dòng phụ (kỳ, cách đếm) + ⓘ.
 *
 * `sub` là MỘT dòng ngắn hiện thẳng — kỳ và cách đếm của số bên dưới (§5.2 luật người mới số 4). Phần nói phương pháp,
 * cách đọc, vì sao đi vào `info` (ⓘ) — audit chữ 13/11, xem `common/InfoDot.tsx`.
 */
// `nav`: tên ngắn của phần trên mục lục dính (SectionNav) — chỉ khối cấp trang mới đặt.
/**
 * Nhãn của nút ⓘ trên tiêu đề khối — lấy đúng tên khối để trình đọc màn hình không đọc 7 nút giống hệt nhau
 * ("Khối này là gì" ×7 ở Hiệu Suất Host, phát hiện khi rà 14/11). Tiêu đề không phải chuỗi thì giữ nhãn mặc định.
 */
const infoLabel = (title: React.ReactNode) => (typeof title === "string" ? `${title} — khối này là gì` : undefined);

export const BlockHead: React.FC<{ title: React.ReactNode; sub?: React.ReactNode; info?: React.ReactNode; right?: React.ReactNode; nav?: string }> = ({ title, sub, info, right, nav }) => (
  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mb-3" data-section={nav}>
    <div className="min-w-0">
      <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5">
        {title}
        {info && <InfoDot label={infoLabel(title)}>{info}</InfoDot>}
      </h3>
      {sub && <p className="text-xs text-[var(--text-faint)] mt-0.5 leading-snug">{sub}</p>}
    </div>
    {right}
  </div>
);

/** Tiêu đề một mục lớn của trang (Shop, Đội live…). */
export const Sect: React.FC<{ title: string; sub?: React.ReactNode; info?: React.ReactNode; nav?: string }> = ({ title, sub, info, nav }) => (
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 pt-2" data-section={nav}>
    <h3 className="text-sm font-black text-[var(--text)] flex items-center gap-1.5">
      {title}
      {info && <InfoDot label={infoLabel(title)}>{info}</InfoDot>}
    </h3>
    {sub && <span className="text-xs text-[var(--text-faint)]">{sub}</span>}
  </div>
);

export const rangeLabel = (a: string, b: string) => {
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return a === b ? dm(a) : a.slice(0, 7) === b.slice(0, 7) ? `${a.slice(8, 10)}–${dm(b)}` : `${dm(a)}–${dm(b)}`;
};
