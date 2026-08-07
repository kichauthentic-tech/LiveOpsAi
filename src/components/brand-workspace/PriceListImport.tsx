import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { SkuPlatformPrice, UserRole } from "../../types";
import { Upload, Trash2, FileSpreadsheet, AlertTriangle } from "lucide-react";

interface PriceListImportProps {
  brandId: string;
  currentRole: UserRole;
  prices: SkuPlatformPrice[];
  onImport: (rows: Array<Pick<SkuPlatformPrice, "skuCode" | "skuName" | "platform" | "rrp" | "markdownPrice" | "isEol">>) => Promise<void>;
  onDeleteRow: (id: string) => Promise<void>;
}

type ParsedRow = Pick<SkuPlatformPrice, "skuCode" | "skuName" | "platform" | "rrp" | "markdownPrice" | "isEol">;

function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES: Record<string, keyof ParsedRow | "skip"> = {
  masku: "skuCode",
  skucode: "skuCode",
  tensku: "skuName",
  skuname: "skuName",
  tensanpham: "skuName",
  nentang: "platform",
  platform: "platform",
  gianiemyet: "rrp",
  rrp: "rrp",
  giasaumarkdown: "markdownPrice",
  giamarkdown: "markdownPrice",
  markdownprice: "markdownPrice",
  eol: "isEol",
  ngungban: "isEol",
  ngungbaneol: "isEol"
};

function parseWorkbook(buffer: ArrayBuffer): { rows: ParsedRow[]; skipped: number } {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const record of raw) {
    const mapped: Partial<Record<keyof ParsedRow, unknown>> = {};
    for (const [key, value] of Object.entries(record)) {
      const target = HEADER_ALIASES[normalizeHeader(key)];
      if (target && target !== "skip") mapped[target] = value;
    }

    const skuName = String(mapped.skuName ?? "").trim();
    const platformRaw = normalizeHeader(mapped.platform);
    const platform: SkuPlatformPrice["platform"] | null =
      platformRaw === "tiktok" ? "TikTok" : platformRaw === "shopee" ? "Shopee" : null;

    if (!skuName || !platform) {
      skipped += 1;
      continue;
    }

    const eolRaw = normalizeHeader(mapped.isEol);
    rows.push({
      skuCode: String(mapped.skuCode ?? "").trim(),
      skuName,
      platform,
      rrp: Number(mapped.rrp) || 0,
      markdownPrice: Number(mapped.markdownPrice) || 0,
      isEol: eolRaw === "1" || eolRaw === "true" || eolRaw === "co" || eolRaw === "yes" || eolRaw === "x"
    });
  }

  return { rows, skipped };
}

export const PriceListImport: React.FC<PriceListImportProps> = ({ brandId, currentRole, prices, onImport, onDeleteRow }) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ rows: ParsedRow[]; skipped: number; fileName: string } | null>(null);

  const currentPrices = useMemo(
    () =>
      prices
        .filter((p) => p.brandId === brandId)
        .slice()
        .sort((a, b) => a.skuName.localeCompare(b.skuName)),
    [prices, brandId]
  );

  const lastImportedAt = currentPrices[0]?.importedAt;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const { rows, skipped } = parseWorkbook(buffer);
      if (rows.length === 0) {
        setError("Không đọc được dòng dữ liệu hợp lệ nào. Kiểm tra tiêu đề cột (Mã SKU/Tên SKU/Nền Tảng/Giá Niêm Yết/Giá Sau Markdown/EOL).");
        setPreview(null);
        return;
      }
      setPreview({ rows, skipped, fileName: file.name });
    } catch {
      setError("Không đọc được file. Kiểm tra định dạng .xlsx/.csv.");
      setPreview(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await onImport(preview.rows);
      setPreview(null);
    } catch (err) {
      setError((err as Error).message ?? "Import thất bại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-blue-400" /> Price List Import
        </h2>
        {lastImportedAt && (
          <span className="text-xs text-slate-500">Lần import gần nhất: {new Date(lastImportedAt).toLocaleString("vi-VN")}</span>
        )}
      </div>

      {canEdit && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <p className="text-xs text-slate-400">
            Upload file Excel giá niêm yết theo platform (cột: Mã SKU, Tên SKU, Nền Tảng [TikTok/Shopee], Giá Niêm Yết, Giá Sau Markdown, EOL).
            Import mới sẽ <span className="text-amber-400 font-bold">thay thế toàn bộ</span> danh sách giá hiện tại của brand này.
          </p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Chọn File Excel
          </button>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}

          {preview && (
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div className="text-xs text-slate-300">
                <span className="font-bold">{preview.fileName}</span> — đọc được{" "}
                <span className="font-bold text-emerald-400">{preview.rows.length}</span> dòng hợp lệ
                {preview.skipped > 0 && <span className="text-amber-400"> ({preview.skipped} dòng bị bỏ qua do thiếu Tên SKU/Nền Tảng)</span>}.
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-950">
                    <tr className="text-left text-slate-500">
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-2">Platform</th>
                      <th className="py-2 px-2 text-right">Giá niêm yết</th>
                      <th className="py-2 px-2 text-right">Giá markdown</th>
                      <th className="py-2 px-2">EOL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-800/60">
                        <td className="py-1.5 px-3">
                          <div className="font-bold text-slate-200">{r.skuName}</div>
                          <div className="text-slate-500 font-mono">{r.skuCode || "—"}</div>
                        </td>
                        <td className="py-1.5 px-2 text-slate-300">{r.platform}</td>
                        <td className="py-1.5 px-2 text-right text-slate-300">{r.rrp.toLocaleString("vi-VN")}đ</td>
                        <td className="py-1.5 px-2 text-right text-emerald-400 font-bold">{r.markdownPrice.toLocaleString("vi-VN")}đ</td>
                        <td className="py-1.5 px-2">{r.isEol ? "Có" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirmImport}
                  disabled={busy}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Xác Nhận Import (ghi đè danh sách hiện tại)
                </button>
                <button
                  onClick={() => setPreview(null)}
                  disabled={busy}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Huỷ
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2.5 px-4">SKU</th>
                <th className="py-2.5 px-2">Platform</th>
                <th className="py-2.5 px-2 text-right">Giá niêm yết</th>
                <th className="py-2.5 px-2 text-right">Giá sau markdown</th>
                <th className="py-2.5 px-2">EOL</th>
                {canEdit && <th className="py-2.5 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {currentPrices.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60 align-middle">
                  <td className="py-2.5 px-4">
                    <div className="font-bold text-slate-200">{p.skuName}</div>
                    <div className="text-slate-500 font-mono">{p.skuCode || "—"}</div>
                  </td>
                  <td className="py-2.5 px-2 text-slate-300">{p.platform}</td>
                  <td className="py-2.5 px-2 text-right text-slate-400">{p.rrp.toLocaleString("vi-VN")}đ</td>
                  <td className="py-2.5 px-2 text-right text-emerald-400 font-bold">{p.markdownPrice.toLocaleString("vi-VN")}đ</td>
                  <td className="py-2.5 px-2">
                    {p.isEol && <span className="text-amber-400 font-bold">Ngừng bán</span>}
                  </td>
                  {canEdit && (
                    <td className="py-2.5 px-4">
                      <button onClick={() => onDeleteRow(p.id)} className="text-red-400 hover:bg-red-950/40 p-1 rounded-lg" title="Xoá dòng">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {currentPrices.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="py-8 text-center text-slate-500 italic">
                    Chưa có giá niêm yết nào được import.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
