import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AffiliateActualEntry, LiveSession, UserRole } from "../../types";
import { fetchAffiliateActuals, replaceAffiliateActuals } from "../../lib/db/affiliateActuals";
import { AffiliateLiveSessionRow, fetchAffiliateLiveSessions } from "../../lib/dataraw/affiliateLiveSessionSlice";
import { errorMessage } from "../../lib/errorMessage";
import { Database, Download, Loader2, Plus, Save, Trash2, Users } from "lucide-react";

// Trang Affiliate (2026-09-22) — tách RIÊNG khỏi form Report Tháng theo yêu cầu ops. Bảng dựng
// theo đúng file phân tích ops đang dùng: mỗi PHIÊN LIVE là 1 CỘT, mỗi chỉ số là 1 DÒNG, các cột
// gom theo tháng bằng một dải tiêu đề ở trên.
//
// Dữ liệu vẫn nằm ở brand_affiliate_actuals (migration 0067 + 0102) — cùng bảng Tab 04 Report
// Tháng đọc, nên số ở 2 nơi không bao giờ lệch. Lưu theo từng tháng (replace cả tháng) vì
// replaceAffiliateActuals() khoá theo (brand_id, period_month).

interface BrandAffiliateTableProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  currentRole: UserRole;
  // Nhảy sang tab "Dữ Liệu Gốc" — trước đây openImport() chỉ NHẮC tên tab bằng chữ trong thông
  // báo lỗi khi chưa có batch Live Analysis, ops phải tự tìm trong sidebar. Chỉ được gọi từ
  // đường canManage (nút "Nạp Từ Dữ Liệu Gốc" đã tự gate canManage) nên không cần gate lại ở đây.
  onOpenDataRaw?: () => void;
}

// Phân loại camp do ops đặt, không file TikTok nào có. Màu bám theo file Excel gốc của ops
// (Big = đỏ đậm, Medium = xanh nhạt) để nhìn quen mắt.
const CAMPAIGN_TYPES = ["Big", "Medium", "Brand Day", "Clearance"] as const;
const CAMPAIGN_STYLE: Record<string, string> = {
  Big: "bg-red-700 text-white",
  Medium: "bg-sky-100 text-sky-800",
  "Brand Day": "bg-amber-500 text-white",
  Clearance: "bg-slate-500 text-white"
};

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  // Chặn 36 vòng: from > to (ops kéo ngược) thì trả mảng rỗng thay vì lặp vô hạn.
  for (let guard = 0; guard < 36 && (y < ty || (y === ty && m <= tm)); guard++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fmtInt = (n?: number | null) => (n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString("vi-VN"));
const fmtPct = (n?: number | null, d = 2) => (n == null || Number.isNaN(n) ? "—" : `${n.toFixed(d)}%`);
const fmtNum = (n?: number | null, d = 1) => (n == null || Number.isNaN(n) ? "—" : n.toFixed(d));

// "2026-09-03" -> "3/9/2026" (đúng dạng dòng "Day" trong file ops).
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

// Dòng nạp từ Dữ Liệu Gốc -> entry của tháng tương ứng. Các trường ops phải tự nhập
// (campaignType / targetGmv / adsCost) cố ý để trống, KHÔNG đoán.
// Entry trong state mang thêm _key cục bộ: update()/removeEntry() phải khớp theo khoá ỔN ĐỊNH,
// không khớp theo tham chiếu object — sửa 2 ô của cùng 1 cột trong cùng một nhịp (hoặc thao tác
// tự động) sẽ tạo object mới ở lần đầu, làm lần sau không tìm thấy dòng và mất thay đổi.
// _key không bao giờ xuống DB: replaceAffiliateActuals() chỉ map các cột có tên rõ ràng.
type Row = AffiliateActualEntry & { _key: string };

let keySeq = 0;
const nextKey = () => `r${++keySeq}`;

function rowToEntry(brandId: string, r: AffiliateLiveSessionRow): Row {
  return {
    _key: nextKey(),
    brandId,
    periodMonth: `${r.date.slice(0, 7)}-01`,
    creatorName: r.creatorName || r.nickname,
    liveDateLabel: dayLabel(r.date),
    timelineLabel: r.timelineLabel,
    // Làm tròn 1 chữ số như file ops; phiên TikTok gộp nhiều ngày (vd "74h 48min") vẫn giữ nguyên
    // số thật ở đây để ops thấy mà sửa, không tự bịa lại.
    durationHours: Math.round(r.durationHours * 10) / 10,
    directGmv: r.directGmv,
    orders: r.orders,
    itemsSold: r.itemsSold,
    avgPrice: r.avgPrice,
    viewer: r.viewer,
    liveImpressions: r.liveImpressions,
    ctr: r.ctrLive == null ? undefined : Math.round(r.ctrLive * 100) / 100,
    ctor: r.ctor
  };
}

export function BrandAffiliateTable({ brandId, brandName, sessions, currentRole, onOpenDataRaw }: BrandAffiliateTableProps) {
  const canManage = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";

  const [fromMonth, setFromMonth] = useState(() => addMonths(thisMonth(), -3));
  const [toMonth, setToMonth] = useState(thisMonth);
  const [entries, setEntries] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // true khi openImport() không tìm thấy batch Live Analysis nào — errorMsg là string thô nên
  // không nhúng được nút bấm; cờ riêng để render nút "Mở Dữ Liệu Gốc" cạnh thông báo lỗi đó.
  const [missingDataraw, setMissingDataraw] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<AffiliateLiveSessionRow[] | null>(null);
  const [importPicked, setImportPicked] = useState<Set<string>>(new Set());
  // Ô đang được gõ — xem numInput() bên dưới.
  const [focusedCell, setFocusedCell] = useState<string | null>(null);

  const months = useMemo(() => monthsBetween(fromMonth, toMonth), [fromMonth, toMonth]);

  // Nickname tài khoản shop lấy từ chính ca của brand — dùng để đánh dấu dòng KHÔNG phải affiliate
  // khi nạp (batch Live Analysis xuất ở view mặc định chỉ toàn dòng của shop).
  const shopHandle = useMemo(
    () => sessions.find((s) => s.brandId === brandId && s.shopTikTokHandle)?.shopTikTokHandle,
    [sessions, brandId]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const all = await Promise.all(months.map((m) => fetchAffiliateActuals(brandId, `${m}-01`)));
      setEntries(all.flat().map((e) => ({ ...e, _key: nextKey() })));
      setDirty(false);
      setSavedAt(null);
    } catch (e) {
      setErrorMsg(errorMessage(e, "Không tải được dữ liệu Affiliate"));
    } finally {
      setLoading(false);
    }
  }, [brandId, months]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Cột hiển thị: gom theo tháng (chỉ tháng nằm trong dải đang xem), trong tháng sắp theo ngày live.
  const columns = useMemo(() => {
    const byMonth = new Map<string, Row[]>();
    for (const e of entries) {
      const m = e.periodMonth.slice(0, 7);
      if (!months.includes(m)) continue;
      const list = byMonth.get(m) ?? [];
      list.push(e);
      byMonth.set(m, list);
    }
    return months
      .filter((m) => byMonth.has(m))
      .map((m) => ({ month: m, items: (byMonth.get(m) ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) }));
  }, [entries, months]);

  const flatColumns = useMemo(() => columns.flatMap((g) => g.items), [columns]);

  const update = (entry: Row, patch: Partial<AffiliateActualEntry>) => {
    setEntries((prev) => prev.map((e) => (e._key === entry._key ? { ...e, ...patch } : e)));
    setDirty(true);
  };

  const removeEntry = (entry: Row) => {
    setEntries((prev) => prev.filter((e) => e._key !== entry._key));
    setDirty(true);
  };

  const addBlank = (month: string) => {
    setEntries((prev) => [
      ...prev,
      { _key: nextKey(), brandId, periodMonth: `${month}-01`, creatorName: "", sortOrder: prev.filter((e) => e.periodMonth.startsWith(month)).length }
    ]);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setMissingDataraw(false);
    try {
      // Lưu TỪNG tháng trong dải đang xem, kể cả tháng giờ rỗng — replaceAffiliateActuals() xoá
      // sạch tháng đó trước khi insert, nên tháng bị ops xoá hết cột cũng được dọn đúng.
      for (const m of months) {
        const items = entries
          .filter((e) => e.periodMonth.slice(0, 7) === m)
          .map((e, idx) => ({ ...e, sortOrder: idx }));
        await replaceAffiliateActuals(brandId, `${m}-01`, items);
      }
      await reload();
      setSavedAt(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setErrorMsg(errorMessage(e, "Lưu thất bại"));
    } finally {
      setSaving(false);
    }
  };

  const openImport = async () => {
    setImporting(true);
    setErrorMsg(null);
    setMissingDataraw(false);
    try {
      const { start } = monthRange(months[0]);
      const { end } = monthRange(months[months.length - 1]);
      const slice = await fetchAffiliateLiveSessions(brandId, start, end, shopHandle);
      if (!slice.hasAnyBatch) {
        setErrorMsg('Chưa có batch "Live Analysis" nào phủ dải tháng này trong Dữ Liệu Gốc. Export ở Seller Center với chế độ xem "linked accounts" rồi import vào tab Live Analysis.');
        setMissingDataraw(true);
        return;
      }
      setImportRows(slice.rows);
      // Bỏ tick sẵn: phiên của chính tài khoản shop, phiên đã có cột, và phiên không phát sinh
      // click lẫn đơn cho brand (buổi live riêng của creator lọt vào báo cáo vì còn sót sản phẩm
      // trong giỏ). Vẫn LIỆT KÊ cả 3 loại để ops tự tick lại nếu muốn.
      setImportPicked(
        new Set(slice.rows.filter((r) => !r.isShopAccount && !r.noBrandActivity && !hasColumnFor(r)).map((r) => r.key))
      );
    } catch (e) {
      setErrorMsg(errorMessage(e, "Không đọc được Dữ Liệu Gốc"));
    } finally {
      setImporting(false);
    }
  };

  // Đã có cột cho phiên này chưa — khớp theo ngày + tên creator, vì entry đã lưu không giữ Room ID.
  function hasColumnFor(r: AffiliateLiveSessionRow): boolean {
    const label = dayLabel(r.date);
    const name = (r.creatorName || r.nickname).trim().toLowerCase();
    return entries.some((e) => e.liveDateLabel === label && e.creatorName.trim().toLowerCase() === name);
  }

  const confirmImport = () => {
    if (!importRows) return;
    const picked = importRows.filter((r) => importPicked.has(r.key));
    setEntries((prev) => [...prev, ...picked.map((r) => rowToEntry(brandId, r))]);
    setImportRows(null);
    setImportPicked(new Set());
    setDirty(true);
  };

  const readOnly = !canManage;
  const cellCls = "px-2 py-1.5 border-r border-[var(--border)] text-center whitespace-nowrap";
  const labelCls = "px-3 py-1.5 border-r border-[var(--border)] text-left font-semibold text-[var(--text-faint)] sticky left-0 bg-[var(--surface-base)] z-10 whitespace-nowrap";
  const inputCls = "w-full bg-transparent text-center outline-none focus:bg-[var(--surface-hover)] rounded px-1";

  // Ô số: khi KHÔNG focus thì hiện bản đã format ("225.248.394", "52,76%") cho dễ đọc; lúc focus
  // đổi về số thô để ops gõ/sửa không phải né dấu phân cách. Không format-while-typing vì con trỏ
  // sẽ nhảy về cuối sau mỗi ký tự.
  const cellLabel = (e: Row, label: string) => `${label} — ${e.creatorName || "cột mới"} ${e.liveDateLabel ?? ""}`.trim();

  const numInput = (e: Row, label: string, key: keyof AffiliateActualEntry, fmt: (n?: number | null) => string) => {
    const cellId = `${e._key}:${String(key)}`;
    const value = e[key] as number | undefined;
    if (readOnly) return <span>{fmt(value)}</span>;
    return (
      <input
        className={inputCls}
        aria-label={cellLabel(e, label)}
        value={focusedCell === cellId ? value ?? "" : value == null ? "" : fmt(value)}
        inputMode="decimal"
        onFocus={() => setFocusedCell(cellId)}
        onBlur={() => setFocusedCell(null)}
        onChange={(ev) => {
          // Chấp nhận cả "1.234.567" (dán từ Excel) lẫn "1234,5": bỏ dấu chấm/khoảng trắng/% rồi
          // coi dấu phẩy là thập phân.
          const v = ev.target.value.replace(/[.\s%]/g, "").replace(",", ".");
          update(e, { [key]: v === "" ? undefined : Number(v) } as Partial<AffiliateActualEntry>);
        }}
      />
    );
  };

  const textInput = (e: Row, label: string, key: "creatorName" | "liveDateLabel" | "timelineLabel") =>
    readOnly ? (
      <span>{e[key] || "—"}</span>
    ) : (
      <input className={inputCls} aria-label={cellLabel(e, label)} value={e[key] ?? ""} onChange={(ev) => update(e, { [key]: ev.target.value })} />
    );

  // Dòng chỉ số: label + 1 ô cho mỗi cột phiên.
  //
  // Đây là HÀM THƯỜNG trả JSX, cố ý KHÔNG khai báo thành component (<MetricRow/>): component định
  // nghĩa trong thân BrandAffiliateTable có identity mới sau mỗi lần render, React coi là kiểu
  // khác nên remount cả cây con — ô input đang gõ bị huỷ DOM ngay ký tự đầu, mất focus và mất
  // luôn ký tự sau. Gọi như hàm thì JSX nội tuyến vào cây cha, DOM giữ nguyên qua các lần render.
  const metricRow = (label: string, render: (e: Row, label: string) => React.ReactNode, className?: string) => (
    <tr key={label} className={`border-t border-[var(--border)] ${className ?? ""}`}>
      <td className={labelCls}>{label}</td>
      {flatColumns.map((e) => (
        <td key={e._key} className={cellCls}>
          {render(e, label)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" /> Affiliate — {brandName}
          </h2>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">
            Mỗi phiên live của creator affiliate là 1 cột. Số tự động đọc từ file "Live Analysis" (Dữ Liệu Gốc);
            Campaign Type / Target / Ads cost nhập tay.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input type="month" value={fromMonth} max={toMonth} onChange={(e) => setFromMonth(e.target.value)} className="p-2 border border-[var(--border)] rounded-lg bg-[var(--surface-base)] text-sm" />
          <span className="text-[var(--text-faint)]">→</span>
          <input type="month" value={toMonth} min={fromMonth} onChange={(e) => setToMonth(e.target.value)} className="p-2 border border-[var(--border)] rounded-lg bg-[var(--surface-base)] text-sm" />
          {canManage && (
            <>
              <button onClick={openImport} disabled={importing || loading} className="px-3 py-2 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Nạp Từ Dữ Liệu Gốc
              </button>
              <button onClick={handleSave} disabled={saving || !dirty} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
              </button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex flex-wrap items-center gap-2">
          <span>{errorMsg}</span>
          {missingDataraw && onOpenDataRaw && (
            <button onClick={onOpenDataRaw} className="px-2.5 py-1 rounded-lg bg-red-700 text-white text-xs font-semibold whitespace-nowrap">
              Mở Dữ Liệu Gốc →
            </button>
          )}
        </div>
      )}
      {savedAt && !dirty && <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">Đã lưu lúc {savedAt}.</div>}

      {importRows && (
        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/50 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Download className="w-4 h-4" /> {importRows.length} phiên đọc được từ Live Analysis — chọn phiên muốn thêm
          </div>
          <div className="max-h-64 overflow-auto text-xs">
            {importRows.map((r) => {
              const exists = hasColumnFor(r);
              return (
                <label key={r.key} className="flex items-center gap-2 py-1 border-b border-[var(--border)]/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importPicked.has(r.key)}
                    onChange={(ev) =>
                      setImportPicked((prev) => {
                        const next = new Set(prev);
                        if (ev.target.checked) next.add(r.key);
                        else next.delete(r.key);
                        return next;
                      })
                    }
                  />
                  <span className="font-mono">{dayLabel(r.date)}</span>
                  <span className="font-semibold">{r.creatorName}</span>
                  <span className="text-[var(--text-faint)]">
                    {r.timelineLabel} · {fmtInt(r.directGmv)}đ · {fmtInt(r.viewer)} viewer · {fmtInt(r.liveImpressions)} hiển thị
                  </span>
                  {r.isShopAccount && <span className="px-1.5 rounded bg-slate-200 text-slate-700">tài khoản shop</span>}
                  {r.noBrandActivity && (
                    <span className="px-1.5 rounded bg-slate-200 text-slate-700" title="Không có click lẫn đơn cho brand — thường là buổi live riêng của creator, chỉ lọt vào báo cáo vì còn sót sản phẩm trong giỏ. Tick lại nếu bạn vẫn muốn đưa vào bảng.">
                      0 click / 0 đơn
                    </span>
                  )}
                  {exists && <span className="px-1.5 rounded bg-amber-100 text-amber-800">đã có cột</span>}
                </label>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={confirmImport} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold">Thêm {importPicked.size} cột</button>
            <button onClick={() => setImportRows(null)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm">Huỷ</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-[var(--text-faint)] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải…</div>
      ) : flatColumns.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--text-faint)] border border-dashed border-[var(--border)] rounded-xl">
          {/* Với role brand, "rỗng" có 2 nguyên nhân rất khác nhau và bảng thì trông giống hệt:
              chưa có phiên nào, hoặc có nhưng tháng chưa phát hành (policy 0107 lọc mất). Nói
              nguyên nhân thứ hai ra, đừng để khách đoán là agency không làm gì. */}
          {currentRole === "brand" ? (
            <>
              Chưa có dữ liệu affiliate nào được phát hành cho dải tháng này.
              <span className="block mt-1 text-[11px]">
                Số liệu từng tháng hiện ở đây sau khi Report Tháng của tháng đó được phát hành.
              </span>
            </>
          ) : (
            <>
              Chưa có phiên affiliate nào trong dải tháng này.
              {canManage && <> Bấm <b>Nạp Từ Dữ Liệu Gốc</b> để đọc từ file Live Analysis, hoặc thêm cột thủ công bên dưới.</>}
            </>
          )}
        </div>
      ) : (
        <div className="overflow-auto border border-[var(--border)] rounded-xl bg-[var(--surface-base)]">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--surface-elevated)]">
                <th className={labelCls}>MONTH</th>
                {columns.map((g) => (
                  <th key={g.month} colSpan={g.items.length} className="px-2 py-1.5 border-r border-[var(--border)] text-center font-bold tracking-wide">
                    {MONTH_ABBR[Number(g.month.slice(5, 7)) - 1]} {g.month.slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricRow("Campaign Type", (e, label) =>
                readOnly ? (
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CAMPAIGN_STYLE[e.campaignType ?? ""] ?? ""}`}>{e.campaignType || "—"}</span>
                ) : (
                  <select
                    aria-label={cellLabel(e, label)}
                    value={e.campaignType ?? ""}
                    onChange={(ev) => update(e, { campaignType: ev.target.value || undefined })}
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold outline-none ${CAMPAIGN_STYLE[e.campaignType ?? ""] ?? "bg-[var(--surface-elevated)]"}`}
                  >
                    <option value="">—</option>
                    {CAMPAIGN_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )
              )}
              {metricRow("Creator", (e, label) => textInput(e, label, "creatorName"), "font-bold")}
              {metricRow("Day", (e, label) => textInput(e, label, "liveDateLabel"), "bg-emerald-50/60 font-semibold")}
              {metricRow("Timeline", (e, label) => textInput(e, label, "timelineLabel"))}
              {metricRow("Target", (e, label) => numInput(e, label, "targetGmv", fmtInt), "bg-[var(--surface-elevated)] font-bold")}
              {metricRow("Direct GMV", (e, label) => numInput(e, label, "directGmv", fmtInt), "text-red-600 font-bold")}
              {metricRow("Duration", (e, label) => numInput(e, label, "durationHours", (n) => fmtNum(n, 1)))}
              {metricRow("GMV per hour", (e) => <span>{e.directGmv && e.durationHours ? fmtInt(e.directGmv / e.durationHours) : "—"}</span>)}
              {metricRow(
                "Target Completion %",
                (e) => <span>{e.directGmv && e.targetGmv ? fmtPct((e.directGmv / e.targetGmv) * 100) : "—"}</span>,
                "bg-emerald-600/90 text-white font-bold"
              )}
              {metricRow("Live impressions", (e, label) => numInput(e, label, "liveImpressions", fmtInt))}
              {metricRow("CTR", (e, label) => numInput(e, label, "ctr", (n) => fmtPct(n)))}
              {metricRow("CTOR", (e, label) => numInput(e, label, "ctor", (n) => fmtPct(n)))}
              {metricRow("Ads cost", (e, label) => numInput(e, label, "adsCost", fmtInt))}
              {metricRow("ROAS", (e) => <span>{e.directGmv && e.adsCost ? fmtNum(e.directGmv / e.adsCost, 1) : "—"}</span>)}
              {metricRow("Order", (e, label) => numInput(e, label, "orders", fmtInt))}
              {metricRow("Item sold", (e, label) => numInput(e, label, "itemsSold", fmtInt))}
              {metricRow("AVG.price", (e, label) => numInput(e, label, "avgPrice", fmtInt))}
              {metricRow("Viewer", (e, label) => numInput(e, label, "viewer", fmtInt))}
              {canManage && (
                <tr className="border-t border-[var(--border)]">
                  <td className={labelCls} />
                  {flatColumns.map((e) => (
                    <td key={e._key} className={cellCls}>
                      <button onClick={() => removeEntry(e)} title="Xoá cột" className="text-red-500 hover:text-red-700">
                        <Trash2 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {months.map((m) => (
            <button key={m} onClick={() => addBlank(m)} className="px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--text-faint)] flex items-center gap-1 hover:bg-[var(--surface-hover)]">
              <Plus className="w-3 h-3" /> Thêm cột {MONTH_ABBR[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
