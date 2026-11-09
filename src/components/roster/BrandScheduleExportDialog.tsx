import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { LiveSession, ShiftSlot } from "../../types";
import { PlatformChip } from "../common/PlatformChip";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../lib/errorMessage";
import { collectScheduleChannels, exportBrandSchedules, type ExportMode } from "../../lib/roster/brandScheduleExport";

// Xuất lịch gửi brand xác nhận (09/11): sau khi chốt lịch + mở ca đăng ký, một nút tải mọi lịch của tháng ra file Excel dạng
// lịch tháng. Mặc định mỗi brand một file (nén .zip) để gửi thẳng — file brand này không chứa lịch brand khác. Lịch lấy
// đúng ca đã lên lịch + ca mở của tháng (đã trừ ca huỷ); không có tên host, tiền hay target.

const shiftMonth = (month: string, delta: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};
const hoursText = (h: number) => (Math.round(h * 10) / 10).toLocaleString("vi-VN");

export const BrandScheduleExportDialog: React.FC<{
  month: string;
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  onClose: () => void;
}> = ({ month: initialMonth, sessions, shiftSlots, onClose }) => {
  const { showToast } = useToast();
  const [month, setMonth] = useState(initialMonth);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ExportMode>("per-brand");
  const [busy, setBusy] = useState(false);

  const channels = useMemo(() => collectScheduleChannels(sessions, shiftSlots, month), [sessions, shiftSlots, month]);
  const keyOf = (c: { brandId: string; platform: string }) => `${c.brandId}|${c.platform}`;
  const picked = channels.filter((c) => !off.has(keyOf(c)));
  const brandCount = new Set(picked.map((c) => c.brandId)).size;
  const openCount = picked.reduce((n, c) => n + c.shifts.filter((s) => s.kind === "open").length, 0);

  const toggle = (k: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const run = async () => {
    setBusy(true);
    try {
      const r = await exportBrandSchedules(picked, month, mode);
      showToast(mode === "per-brand" ? `Đã tải file nén có ${r.files} file brand.` : "Đã tải file lịch gộp.", "success");
    } catch (e) {
      showToast(`Không tạo được file lịch: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Xuất lịch gửi brand">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-black text-[var(--text)]">Xuất lịch gửi brand xác nhận</h2>
            <p className="text-xs text-[var(--text-muted)]">Lịch tháng dạng T2–CN, chỉ ngày + khung giờ (không tên host, không tiền).</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-1 w-fit rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Tháng trước">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-bold text-[var(--text)] whitespace-nowrap">
              Tháng {Number(month.slice(5))}/{month.slice(0, 4)}
            </span>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Tháng sau">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {channels.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Tháng này chưa có ca nào (chưa chốt lịch / chưa mở ca).</p>
          ) : (
            <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
              {channels.map((c) => {
                const k = keyOf(c);
                const open = c.shifts.filter((s) => s.kind === "open").length;
                return (
                  <label key={k} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-hover)]">
                    <input type="checkbox" checked={!off.has(k)} onChange={() => toggle(k)} />
                    <span className="font-bold text-[var(--text)]">{c.brandName}</span>
                    <PlatformChip platform={c.platform} />
                    <span className="ml-auto text-xs tabular-nums text-[var(--text-muted)]">
                      {c.shiftCount} ca · {hoursText(c.hours)} giờ{open > 0 ? ` · ${open} ca còn mở` : ""}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <fieldset className="space-y-1.5 text-sm" disabled={busy}>
            <legend className="text-xs font-black text-[var(--text)] mb-1">Kiểu file</legend>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="brand-export-mode" className="mt-1" checked={mode === "per-brand"} onChange={() => setMode("per-brand")} />
              <span>
                <span className="font-bold text-[var(--text)]">Mỗi brand một file (nén .zip)</span>
                <span className="block text-xs text-[var(--text-muted)]">Giải nén rồi gửi từng file cho đúng brand. Brand có cả TikTok và Shopee thì hai sheet trong cùng file.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="brand-export-mode" className="mt-1" checked={mode === "single"} onChange={() => setMode("single")} />
              <span>
                <span className="font-bold text-[var(--text)]">Một file gộp mọi brand (xem nội bộ)</span>
                <span className="block text-xs text-[var(--text-muted)]">Mỗi kênh một sheet. Đừng gửi file này cho brand — có lịch của brand khác.</span>
              </span>
            </label>
          </fieldset>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--text-muted)]">
            {picked.length} kênh · {brandCount} brand
            {openCount > 0 ? ` · ${openCount} ca còn mở vẫn có trong lịch` : ""}
          </span>
          <button type="button" disabled={busy || picked.length === 0} onClick={() => void run()} className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-40">
            <Download className="w-4 h-4" /> {busy ? "Đang tạo…" : "Tải file lịch"}
          </button>
        </div>
      </div>
    </div>
  );
};
