import React, { useEffect, useMemo, useState } from "react";
import { BrandDataRawImport, BrandDataRawRow, DataRawReportType, UserRole, LiveSession, Talent } from "../../types";
import { parseDataRawExcel, ParsedDataRawImport } from "../../lib/dataraw/parseDataRawExcel";
import { fetchDataRawImports, fetchDataRawRows, createOrReplaceDataRawImport, findExistingImportForMonth, deleteDataRawImport } from "../../lib/db/brandDataRaw";
import { Database, Upload, FileSpreadsheet, AlertTriangle, Trash2, Search, ChevronDown, ChevronRight } from "lucide-react";
import { BackfillFromRooms } from "./BackfillFromRooms";
import { errorMessage } from "../../lib/errorMessage";
import { useConfirm } from "../../hooks/useConfirm";

interface BrandDataRawProps {
  brandId: string;
  brandName: string;
  currentRole: UserRole;
  // Nạp bù ca từ file Creator-Live-Performance (0086) — cần danh sách ca + talent để biết room nào
  // đã có ca và để gán host; onSessionsChanged nạp lại ca sau khi sinh/gán.
  sessions: LiveSession[];
  talents: Talent[];
  onSessionsChanged: () => Promise<void>;
}

const REPORT_TABS: { id: DataRawReportType; label: string; hint: string }[] = [
  { id: "shop_promotion", label: "Khuyến Mãi", hint: 'Export "Shop Promotion List" từ TikTok Shop Seller Center.' },
  { id: "product_list", label: "Sản Phẩm", hint: 'Export "Product List" từ TikTok Shop Seller Center.' },
  {
    id: "creator_live_performance",
    label: "Creator Live Performance",
    hint: 'Export "Creator-Live-Performance" từ TikTok Creator Center — nguồn chính cho GMV/CTR/CTOR Livestream trong Report Tháng (thay thế Live Analysis).'
  },
  { id: "live_analysis", label: "Live Analysis", hint: 'Export "Live Analysis" từ TikTok Shop Seller Center ở chế độ xem "linked accounts" (chế độ mặc định chỉ có tài khoản shop, không có creator affiliate nào) — nguồn cho trang Affiliate và cột đối chiếu của Report Tuần.' },
  { id: "shop_analytics", label: "Shop Analytics", hint: 'Export "Shop Analytics — Key metrics" từ TikTok Shop Seller Center.' },
  { id: "live_performance_core_stats", label: "Live Performance", hint: 'Export "Live Performance Core Stats" từ TikTok Shop Seller Center — GMV LIVE theo ngày, dùng cho biểu đồ xu hướng ngày trong Report Tháng.' }
];

function fmtCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

// Shape sinh ra bởi parseDataRawExcel (lib/dataraw/parseDataRawExcel.ts:160-161), lưu nguyên vào
// cột `summary` (Record<string, unknown> — kiểu rộng ở tầng DB vì summary khác nhau theo report type).
interface DataRawImportSummary {
  totals?: Record<string, unknown>;
  changePct?: Record<string, unknown>;
}

// "YYYY-MM-DD" -> "YYYY-MM", dùng periodStart nếu có (đúng tháng report thật), fallback importedAt
// khi file không đọc được kỳ — vẫn gộp được theo tháng upload thay vì rơi hết vào 1 nhóm "không rõ".
function groupMonthKey(imp: BrandDataRawImport): string {
  return (imp.periodStart || imp.importedAt).slice(0, 7);
}

// Mọi tháng mà batch PHỦ, không chỉ tháng của periodStart. Cần cho panel "Nạp bù ca từ file":
// từ 2026-09-22 ops upload Creator-Live-Performance bằng 1 file trải nhiều tháng (bản export theo
// từng tháng hay rụng phiên ngày đầu tháng — xem WORKSPACE_DESIGN.md), nên gom theo periodStart sẽ
// chỉ cho chọn đúng tháng 6 và không nạp bù được ca của 7/8/9.
function monthsCoveredBy(imports: BrandDataRawImport[]): string[] {
  const out = new Set<string>();
  for (const imp of imports) {
    const from = (imp.periodStart || imp.importedAt).slice(0, 7);
    const to = (imp.periodEnd || imp.periodStart || imp.importedAt).slice(0, 7);
    let [y, m] = from.split("-").map(Number);
    for (let guard = 0; guard < 120; guard++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      out.add(key);
      if (key >= to) break;
      if (++m > 12) { m = 1; y++; }
    }
  }
  return Array.from(out).sort((a, b) => (a < b ? 1 : -1));
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `Tháng ${parseInt(m, 10)}/${y}`;
}

// Ưu tiên hiển thị periodStart/periodEnd đã parse (gọn, đúng định dạng vi-VN) — chỉ fallback về
// chuỗi periodLabel thô (nguyên văn dòng meta trong file) khi không parse được ngày.
function formatPeriodShort(imp: BrandDataRawImport): string {
  if (imp.periodStart && imp.periodEnd) {
    const short = (d: string) => { const [, m, day] = d.split("-"); return `${day}/${m}`; };
    return `${short(imp.periodStart)} – ${short(imp.periodEnd)}/${imp.periodEnd.slice(0, 4)}`;
  }
  return imp.periodLabel || "(không rõ kỳ)";
}

// Ops/CEO/Admin dùng để dựng report tháng + đối soát — brand không có role đăng nhập vào phần
// này (theo quyết định thiết kế: report tháng chỉ export ra ngoài, không có brand-facing access).
const CAN_MANAGE: UserRole[] = ["ceo", "admin", "operations"];

export const BrandDataRaw: React.FC<BrandDataRawProps> = ({ brandId, brandName, currentRole, sessions, talents, onSessionsChanged }) => {
  const confirm = useConfirm();
  const canManage = CAN_MANAGE.includes(currentRole);
  const [activeType, setActiveType] = useState<DataRawReportType>("shop_promotion");
  const [imports, setImports] = useState<BrandDataRawImport[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rows, setRows] = useState<BrandDataRawRow[]>([]);
  const [parsedPreview, setParsedPreview] = useState<ParsedDataRawImport | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<BrandDataRawImport | undefined>(undefined);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const activeTab = REPORT_TABS.find((t) => t.id === activeType)!;

  useEffect(() => {
    setExpandedId(null);
    setRows([]);
    setParsedPreview(null);
    setReplaceTarget(undefined);
    setFileName("");
    setError(null);
    fetchDataRawImports(brandId, activeType)
      .then((list) => {
        setImports(list);
        // Mặc định chỉ mở nhóm tháng gần nhất — nhiều tháng/năm dữ liệu sẽ không bị tràn màn hình.
        setExpandedGroups(list.length > 0 ? new Set([groupMonthKey(list[0])]) : new Set());
      })
      .catch((e) => setError(errorMessage(e)));
  }, [brandId, activeType]);

  useEffect(() => {
    if (!expandedId) { setRows([]); return; }
    setLoading(true);
    fetchDataRawRows(expandedId).then(setRows).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
  }, [expandedId]);

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const parsed = await parseDataRawExcel(file, activeType);
      if (parsed.rows.length === 0) throw new Error("Không đọc được dòng dữ liệu nào từ file.");
      setParsedPreview(parsed);
      setReplaceTarget(findExistingImportForMonth(imports, parsed.periodStart));
    } catch (e) {
      setError(errorMessage(e, "Không đọc được file."));
      setParsedPreview(null);
      setReplaceTarget(undefined);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedPreview) return;
    setLoading(true);
    setError(null);
    try {
      const batch = await createOrReplaceDataRawImport(brandId, activeType, fileName, parsedPreview, replaceTarget?.id);
      setImports((prev) => (replaceTarget ? prev.map((i) => (i.id === batch.id ? batch : i)) : [batch, ...prev]));
      setExpandedGroups((prev) => new Set(prev).add(groupMonthKey(batch)));
      setParsedPreview(null);
      setReplaceTarget(undefined);
      setFileName("");
      setExpandedId(batch.id);
    } catch (e) {
      setError(errorMessage(e, "Không tạo được import."));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (importId: string) => {
    if (!(await confirm("Xoá import này? Toàn bộ dòng dữ liệu đi kèm sẽ mất, không khôi phục được.", { danger: true }))) return;
    try {
      await deleteDataRawImport(importId);
      setImports((prev) => prev.filter((i) => i.id !== importId));
      if (expandedId === importId) setExpandedId(null);
    } catch (e) {
      setError(errorMessage(e, "Không xoá được import."));
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => Object.values(r.raw).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(needle)));
  }, [rows, search]);

  // Nhóm theo tháng, giữ thứ tự tháng mới nhất trước (imports đã fetch order by imported_at desc,
  // nhưng nhóm theo periodStart nên sort lại nhóm theo key để đúng dù thứ tự trong nhóm là gì).
  const groups = useMemo(() => {
    const map = new Map<string, BrandDataRawImport[]>();
    imports.forEach((imp) => {
      const key = groupMonthKey(imp);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(imp);
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [imports]);

  if (!canManage) {
    return (
      <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] text-sm text-[var(--text-muted)]">
        Bạn không có quyền xem/nhập dữ liệu gốc cho brand này.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-[var(--text)] text-lg flex items-center gap-2">
          <Database className="w-5 h-5 text-[var(--accent)]" /> Dữ Liệu Gốc (Dataraw) — {brandName}
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Nơi lưu nguyên trạng report Excel tải tay từ TikTok Shop mỗi tuần/tháng. Đây là cơ sở để dựng report + đối soát cuối tháng, sau này cần tra chỉ số nào chỉ cần mở lại import đúng kỳ. Upload trong cùng 1 tháng sẽ tự gộp/ghi đè vào đúng batch của tháng đó (TikTok export luôn cộng dồn từ đầu tháng).
        </p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/50 text-red-400 text-xs font-semibold p-3 rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {REPORT_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveType(t.id)}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${
              activeType === t.id ? "bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]" : "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Nạp bù ca từ room — chỉ có ý nghĩa với file Creator-Live-Performance */}
      {activeType === "creator_live_performance" && (
        <BackfillFromRooms
          brandId={brandId}
          brandName={brandName}
          months={monthsCoveredBy(imports)}
          sessions={sessions}
          talents={talents}
          onSessionsChanged={onSessionsChanged}
        />
      )}

      {/* Upload */}
      <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
        <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Import File — {activeTab.label}
        </h3>
        <p className="text-xs text-[var(--text-muted)]">{activeTab.hint}</p>

        {!parsedPreview ? (
          <label className="border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)]/40 p-4 rounded-xl text-center flex items-center justify-center gap-2 cursor-pointer hover:bg-[var(--surface-hover)] block">
            <Upload className="w-4 h-4 text-[var(--text-muted)]" />
            <p className="font-bold text-[var(--text)] text-xs">Kéo & Thả hoặc Chọn File Excel</p>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[var(--text)]">
              Đã đọc <span className="text-emerald-500">{parsedPreview.rows.length}</span> dòng, <span className="text-emerald-500">{parsedPreview.columns.length}</span> cột từ <span className="italic">{fileName}</span>
              {parsedPreview.periodLabel && <> — kỳ: <span className="text-[var(--text)]">{parsedPreview.periodLabel}</span></>}
            </p>

            {replaceTarget && (
              <div className="bg-amber-950/40 border border-amber-800/50 text-amber-400 text-xs font-semibold p-3 rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Đã có import tháng này ({replaceTarget.rowCount} dòng, tải lúc {new Date(replaceTarget.importedAt).toLocaleString("vi-VN")}) — xác nhận sẽ <span className="underline">THAY THẾ</span> toàn bộ bằng {parsedPreview.rows.length} dòng mới, không cộng dồn.
              </div>
            )}

            <div className="max-h-52 overflow-auto border border-[var(--border)] rounded-xl">
              <table className="text-[11px] whitespace-nowrap">
                <thead className="bg-[var(--surface-elevated)] sticky top-0">
                  <tr className="text-left text-[var(--text-muted)]">
                    {parsedPreview.columns.map((c) => <th key={c.key} className="p-2">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {parsedPreview.rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-[var(--border-muted)]">
                      {parsedPreview.columns.map((c) => <td key={c.key} className="p-2">{fmtCell(r[c.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedPreview.rows.length > 20 && <p className="text-[10px] text-[var(--text-faint)] p-2">...và {parsedPreview.rows.length - 20} dòng khác</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={handleConfirmImport} disabled={loading} className="bg-[var(--accent)] text-[var(--accent-text)] font-bold px-4 py-2 rounded-xl text-xs disabled:opacity-50">
                {loading ? "Đang lưu..." : replaceTarget ? "Xác Nhận Ghi Đè Tháng Này" : "Xác Nhận Import"}
              </button>
              <button onClick={() => { setParsedPreview(null); setReplaceTarget(undefined); setFileName(""); }} className="bg-[var(--surface-hover)] text-[var(--text-muted)] font-bold px-4 py-2 rounded-xl text-xs">
                Huỷ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Import history — nhóm theo tháng, chỉ nhóm gần nhất mở sẵn */}
      <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-2">
        <h4 className="font-bold text-[var(--text)] text-xs">Lịch Sử Import ({imports.length})</h4>
        {groups.length === 0 ? (
          <p className="text-xs text-[var(--text-faint)]">Chưa có import nào cho loại report này.</p>
        ) : (
          <div className="space-y-1">
            {groups.map(([monthKey, groupImports]) => (
              <div key={monthKey} className="border border-[var(--border-muted)] rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleGroup(monthKey)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--surface-elevated)]/60 hover:bg-[var(--surface-hover)] text-left"
                >
                  {expandedGroups.has(monthKey) ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                  <span className="text-xs font-bold text-[var(--text)]">{formatMonthLabel(monthKey)}</span>
                  <span className="text-[10px] text-[var(--text-faint)]">· {groupImports.length} batch</span>
                </button>

                {expandedGroups.has(monthKey) && (
                  <div className="divide-y divide-[var(--border-muted)] px-3">
                    {groupImports.map((imp) => (
                      <div key={imp.id}>
                        <div className="flex items-center justify-between py-2 gap-2">
                          <button
                            onClick={() => setExpandedId(expandedId === imp.id ? null : imp.id)}
                            className="flex items-center gap-2 text-xs font-semibold text-[var(--text)] hover:text-[var(--accent)] flex-1 text-left min-w-0"
                          >
                            {expandedId === imp.id ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                            <span className="truncate">{formatPeriodShort(imp)}</span>
                            <span className="text-[var(--text-faint)] font-normal shrink-0">· {imp.rowCount} dòng · cập nhật {new Date(imp.importedAt).toLocaleDateString("vi-VN")}</span>
                          </button>
                          <button onClick={() => handleDelete(imp.id)} className="text-red-500/70 hover:text-red-500 shrink-0 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {expandedId === imp.id && (
                          <div className="pb-4 space-y-2">
                            {/* Chỉ Shop Analytics có khối tổng quan (totals/changePct). summary của
                                product_list là bản tổng hợp SKU cho Report Tháng — không hiện ở đây. */}
                            {imp.summary?.totals != null && (() => {
                              const summary = imp.summary as DataRawImportSummary;
                              const totals = summary.totals || {};
                              const changePct = summary.changePct || {};
                              return (
                              <div className="bg-[var(--surface-elevated)]/60 rounded-xl p-3 text-[11px] overflow-x-auto">
                                <p className="font-bold text-[var(--text)] mb-1">Tổng Quan Dữ Liệu</p>
                                <table className="text-[11px] whitespace-nowrap">
                                  <tbody>
                                    {Object.keys(totals).map((k) => (
                                      <tr key={k} className="border-t border-[var(--border-muted)]">
                                        <td className="p-1.5 text-[var(--text-muted)]">{k}</td>
                                        <td className="p-1.5 font-semibold text-[var(--text)]">{fmtCell(totals[k])}</td>
                                        <td className="p-1.5 text-[var(--text-faint)]">{fmtCell(changePct[k])}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              );
                            })()}

                            <div className="relative">
                              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[var(--text-faint)]" />
                              <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Tìm trong dữ liệu (tên sản phẩm, host...)..."
                                className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-[var(--text)]"
                              />
                            </div>

                            <div className="max-h-96 overflow-auto border border-[var(--border)] rounded-xl">
                              {loading ? (
                                <p className="text-xs text-[var(--text-faint)] p-3">Đang tải...</p>
                              ) : (
                                <table className="text-[11px] whitespace-nowrap">
                                  <thead className="bg-[var(--surface-elevated)] sticky top-0">
                                    <tr className="text-left text-[var(--text-muted)]">
                                      {imp.columns.map((c) => <th key={c.key} className="p-2">{c.label}</th>)}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredRows.map((r) => (
                                      <tr key={r.id} className="border-t border-[var(--border-muted)]">
                                        {imp.columns.map((c) => <td key={c.key} className="p-2">{fmtCell(r.raw[c.key])}</td>)}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {!loading && filteredRows.length === 0 && <p className="text-xs text-[var(--text-faint)] p-3">Không có dòng nào khớp.</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
