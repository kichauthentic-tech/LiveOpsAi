import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Send, UserRound, Users, X } from "lucide-react";
import { buildUpdateMessage, DEFAULT_SECTIONS, type UpdateAccount, type UpdateSections } from "../../lib/performance/runRateUpdate";
import { PlatformChip } from "../common/PlatformChip";
import type { AccountVM } from "./types";

// Ngăn soạn bản cập nhật gửi sếp / brand (chữ thuần để dán Zalo). Người dùng chọn mục muốn nêu — tháng / đợt / tuần / ngày / ca —
// rồi sửa tay trực tiếp trong khung xem trước nếu cần.

const SECTIONS_KEY = "liveops_runrate_sections";
const loadSections = (): UpdateSections => {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    return raw ? { ...DEFAULT_SECTIONS, ...(JSON.parse(raw) as Partial<UpdateSections>) } : DEFAULT_SECTIONS;
  } catch {
    return DEFAULT_SECTIONS;
  }
};

const SECTION_ROWS: { key: keyof UpdateSections; label: string; hint: string }[] = [
  { key: "month", label: "Cả tháng", hint: "Đạt, target, giữ nhịp, cần mỗi ngày" },
  { key: "wave", label: "Đợt campaign", hint: "D-Day / Mid-Month / Pay Day / ngày thường" },
  { key: "week", label: "Từng tuần", hint: "Các tuần đã có số" },
  { key: "day", label: "Một ngày", hint: "Kết quả của ngày chọn" },
  { key: "shift", label: "Từng ca", hint: "Các ca của ngày chọn" }
];

export const toUpdateAccount = (vm: AccountVM): UpdateAccount => ({
  name: vm.name,
  platform: vm.platform,
  report: vm.report,
  missing: vm.report ? undefined : vm.planStatus === "locked" ? "no_data" : "no_plan",
  actualOnly: vm.actualOnly > 0 ? vm.actualOnly : undefined
});

const Seg: React.FC<{ value: string; options: { id: string; label: string; icon?: React.ReactNode }[]; onChange: (id: string) => void }> = ({ value, options, onChange }) => (
  <div role="tablist" className="inline-flex p-1 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] w-full">
    {options.map((o) => (
      <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
        className={`flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold px-3 py-2 rounded-lg min-h-[36px] transition-colors ${value === o.id ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
        {o.icon}{o.label}
      </button>
    ))}
  </div>
);

export const UpdateComposer: React.FC<{
  open: boolean;
  onClose: () => void;
  accounts: AccountVM[];
  month: string;
  today: string;
  selectedKey: string | null;
  onExport: () => void;
}> = ({ open, onClose, accounts, month, today, selectedKey, onExport }) => {
  const [audience, setAudience] = useState<"boss" | "brand">("boss");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [sections, setSections] = useState<UpdateSections>(loadSections);
  const [dayFocus, setDayFocus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const brands = useMemo(() => {
    const seen = new Map<string, AccountVM["brand"]>();
    for (const a of accounts) if (!seen.has(a.brand.id)) seen.set(a.brand.id, a.brand);
    return [...seen.values()];
  }, [accounts]);
  const selectedBrand = accounts.find((a) => a.key === selectedKey)?.brand.id ?? brands[0]?.id ?? null;
  const brandPick = brandId && brands.some((b) => b.id === brandId) ? brandId : selectedBrand;

  const chosen = useMemo(
    () => (audience === "brand" ? accounts.filter((a) => a.brand.id === brandPick) : accounts.filter((a) => !off.has(a.key))),
    [audience, accounts, brandPick, off]
  );
  const auto = useMemo(
    () =>
      chosen.length === 0
        ? ""
        : buildUpdateMessage({ audience, month, today, accounts: chosen.map(toUpdateAccount), sections, dayFocus, note, brandName: audience === "brand" ? brands.find((b) => b.id === brandPick)?.name : undefined }),
    [chosen, audience, month, today, sections, dayFocus, note, brands, brandPick]
  );
  const text = edited ?? auto;

  // Mọi lần đổi tuỳ chọn là soạn lại từ đầu — bản sửa tay chỉ sống tới lần đổi tuỳ chọn kế tiếp.
  const reset = () => { setEdited(null); setCopied(null); };
  const toggleSection = (k: keyof UpdateSections) => {
    const next = { ...sections, [k]: !sections[k] };
    setSections(next);
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch { /* không có localStorage thì thôi */ }
    reset();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(ok ? "ok" : "fail");
    }
    window.setTimeout(() => setCopied(null), 2200);
  };

  if (!open) return null;
  const needsDay = sections.day || sections.shift;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Soạn cập nhật run-rate" className="relative w-full sm:w-[520px] h-full bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col outline-none">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h3 className="text-lg font-black text-[var(--text)] flex items-center gap-2"><Send className="w-5 h-5 text-[var(--accent-text)]" />Soạn cập nhật</h3>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">Chữ thuần để dán vào Zalo / email. Sửa tay được trong khung xem trước.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="p-2 -m-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]/50"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section className="space-y-2">
            <h4 className="text-xs font-black text-[var(--text-faint)] uppercase tracking-wide">Gửi cho</h4>
            <Seg value={audience} onChange={(id) => { setAudience(id as "boss" | "brand"); reset(); }} options={[{ id: "boss", label: "Sếp · mọi tài khoản", icon: <Users className="w-4 h-4" /> }, { id: "brand", label: "Một brand", icon: <UserRound className="w-4 h-4" /> }]} />
            {audience === "boss" ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {accounts.map((a) => {
                  const on = !off.has(a.key);
                  return (
                    <button key={a.key} type="button" aria-pressed={on} onClick={() => { setOff((s) => { const n = new Set(s); if (on) n.add(a.key); else n.delete(a.key); return n; }); reset(); }}
                      className={`inline-flex items-center gap-1.5 text-xs font-bold pl-2 pr-2.5 py-1.5 rounded-full border min-h-[32px] transition-colors ${on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]" : "border-[var(--border)] text-[var(--text-faint)] line-through"}`}>
                      {on ? <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" /> : <span className="w-3.5" />}
                      {a.brand.name}<PlatformChip platform={a.platform} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {brands.map((b) => (
                  <button key={b.id} type="button" aria-pressed={b.id === brandPick} onClick={() => { setBrandId(b.id); reset(); }}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border min-h-[32px] ${b.id === brandPick ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>{b.name}</button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-black text-[var(--text-faint)] uppercase tracking-wide">Nêu những mục nào</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SECTION_ROWS.map((s) => (
                <label key={s.key} className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer min-h-[48px] transition-colors ${sections[s.key] ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] hover:border-[var(--text-faint)]"}`}>
                  <input type="checkbox" checked={sections[s.key]} onChange={() => toggleSection(s.key)} className="mt-0.5 accent-[var(--accent)] w-4 h-4" />
                  <span className="min-w-0"><span className="block text-sm font-bold text-[var(--text)]">{s.label}</span><span className="block text-[11px] text-[var(--text-faint)] leading-snug">{s.hint}</span></span>
                </label>
              ))}
            </div>
            {needsDay && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label htmlFor="rr-day-focus" className="text-xs font-bold text-[var(--text-muted)]">Ngày nêu ở mục Ngày / Ca</label>
                <input id="rr-day-focus" type="date" value={dayFocus ?? ""} min={`${month}-01`} max={today} onChange={(e) => { setDayFocus(e.target.value || null); reset(); }}
                  className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] min-h-[32px]" />
                {dayFocus && <button type="button" onClick={() => { setDayFocus(null); reset(); }} className="text-xs font-bold text-[var(--accent-text)] hover:underline">Dùng ngày số tới</button>}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <label htmlFor="rr-note" className="text-xs font-black text-[var(--text-faint)] uppercase tracking-wide">Nhận định / việc tiếp theo (không bắt buộc)</label>
            <textarea id="rr-note" value={note} onChange={(e) => { setNote(e.target.value); reset(); }} rows={3} placeholder="VD: Mai tăng thêm 1 ca 20:00 để bù D-Day; chờ brand duyệt voucher…"
              className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] resize-y" />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-black text-[var(--text-faint)] uppercase tracking-wide">Xem trước</h4>
              {edited != null && <button type="button" onClick={reset} className="text-xs font-bold text-[var(--accent-text)] hover:underline">Soạn lại từ đầu</button>}
            </div>
            {chosen.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] rounded-xl border border-dashed border-[var(--border)] p-4">Chọn ít nhất một tài khoản để soạn bản tin.</p>
            ) : (
              <textarea value={text} onChange={(e) => { setEdited(e.target.value); setCopied(null); }} rows={Math.min(22, Math.max(10, text.split("\n").length + 1))} aria-label="Nội dung cập nhật"
                className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3.5 py-3 text-[13px] leading-relaxed font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] resize-y" spellCheck={false} />
            )}
          </section>
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--border)] flex flex-wrap items-center gap-2 bg-[var(--surface)]">
          <button type="button" onClick={copy} disabled={chosen.length === 0}
            className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:opacity-40 min-h-[44px] transition-colors">
            {copied === "ok" ? <><Check className="w-4 h-4" />Đã sao chép</> : copied === "fail" ? "Không sao chép được — bôi đen rồi Ctrl+C" : <><Copy className="w-4 h-4" />Sao chép bản tin</>}
          </button>
          <button type="button" onClick={onExport} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] min-h-[44px]">
            <Download className="w-4 h-4" />Tải Excel
          </button>
          <span className="sr-only" aria-live="polite">{copied === "ok" ? "Đã sao chép bản tin" : ""}</span>
        </div>
      </div>
    </div>
  );
};
