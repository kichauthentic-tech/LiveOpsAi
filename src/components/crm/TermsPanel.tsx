import React, { useMemo, useState } from "react";
import { FileText, Pencil, Trash2 } from "lucide-react";
import type { Brand, BrandPlatformRate } from "../../types";
import {
  PERIOD_LABEL,
  SERVICE_LABEL,
  TERMS_TEMPLATES,
  currentStandard,
  describeTerms,
  termsFromLegacy,
  termsLabel,
  validateTerms,
  type CommercialTerms,
  type PeriodKind,
  type Platform,
  type TermsPeriod
} from "../../lib/commercial/terms";
import { createTermsPeriod, deleteTermsPeriod, fetchTermsPeriods, updateTermsPeriod } from "../../lib/db/brandTerms";
import { errorMessage } from "../../lib/errorMessage";
import { fmtDateVn } from "../../lib/format";
import { useConfirm } from "../../hooks/useConfirm";
import { Field, NumberField, btnCls, btnGhostCls, cardCls, inputCls } from "./fields";
import { TermsEditor } from "./TermsEditor";

// Khối “Điều khoản hợp tác” của một brand × sàn: điều khoản chính đang chạy, các giai đoạn đặc biệt (chiến dịch / gói thử)
// và trình sửa. Một lần lưu = một giai đoạn có NGÀY BẮT ĐẦU: ca trước ngày đó giữ điều khoản cũ, lịch sử không bị viết lại.

interface Props {
  brand: Brand;
  platform: Platform;
  canEdit: boolean;
  today: string;
  /** false = DB chưa chạy 0191 — nói rõ, không cho sửa. */
  available: boolean;
  periods: TermsPeriod[];
  rate?: BrandPlatformRate;
  onPeriodsChanged: (next: TermsPeriod[]) => void;
  /** Điều khoản chính đang chạy vừa đổi ⇒ chép đơn giá / % / phạm vi sang chỗ các màn cũ còn đọc (một người ghi duy nhất). */
  onMirrorLegacy: (terms: CommercialTerms) => Promise<void>;
  onSaveReturnRate: (v: number) => Promise<boolean>;
}

interface Draft {
  /** Có id = đang sửa giai đoạn này. */
  id?: string;
  kind: PeriodKind;
  label: string;
  startDate: string;
  endDate: string;
  note: string;
  terms: CommercialTerms;
}

const dayBefore = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

export const TermsPanel: React.FC<Props> = ({ brand, platform, canEdit, today, available, periods, rate, onPeriodsChanged, onMirrorLegacy, onSaveReturnRate }) => {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const mine = useMemo(() => periods.filter((p) => p.brandId === brand.id && p.platform === platform), [periods, brand.id, platform]);
  const cur = currentStandard(periods, brand.id, platform, today);
  const standards = mine.filter((p) => p.kind === "standard").sort((a, b) => b.startDate.localeCompare(a.startDate));
  const others = mine.filter((p) => p.kind !== "standard").sort((a, b) => b.startDate.localeCompare(a.startDate));
  const upcomingOrPast = standards.filter((p) => p.id !== cur?.id);
  const legacyTerms = useMemo(() => termsFromLegacy(brand.billingModel, rate), [brand.billingModel, rate]);

  const issues = draft ? validateTerms(draft.terms) : [];
  const dateProblem =
    !draft ? null
    : !draft.startDate ? "Chọn ngày bắt đầu hiệu lực."
    : draft.endDate && draft.endDate < draft.startDate ? "Ngày kết thúc không được trước ngày bắt đầu."
    : draft.kind !== "standard" && !draft.endDate ? "Chiến dịch / gói thử cần ngày kết thúc."
    : draft.kind !== "standard" && !draft.label.trim() ? "Đặt tên cho giai đoạn (vd 11.11, Gói thử 1 tháng)."
    : null;
  const blocking = issues.some((i) => i.level === "error") || !!dateProblem;
  const needsReturn = !!draft && (draft.terms.fees.some((f) => f.kind === "pct_nmv" && f.basis === "nmv") || draft.terms.gmvBonus?.basis === "nmv");

  const startNew = (kind: PeriodKind, terms: CommercialTerms, label = "") =>
    setDraft({ kind, label, startDate: kind === "standard" ? monthStart(today) : today, endDate: "", note: "", terms });
  const startEdit = (p: TermsPeriod) => {
    // Sửa điều khoản chính đang chạy: mặc định áp dụng từ hôm nay (giữ lịch sử); chọn lại đúng ngày bắt đầu cũ = sửa tại chỗ.
    const startDate = p.kind === "standard" && p.startDate < today ? today : p.startDate;
    setDraft({ id: p.id, kind: p.kind, label: p.label, startDate, endDate: p.endDate ?? "", note: p.note ?? "", terms: JSON.parse(JSON.stringify(p.terms)) as CommercialTerms });
    setError(null);
    setNote(null);
  };

  async function save() {
    if (!draft || blocking) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const input = { brandId: brand.id, platform, kind: draft.kind, label: draft.label, startDate: draft.startDate, endDate: draft.endDate || undefined, terms: draft.terms, note: draft.note };
      const existing = draft.id ? mine.find((p) => p.id === draft.id) : undefined;
      let message: string;
      if (existing && (existing.kind !== "standard" || existing.startDate === draft.startDate || draft.startDate < existing.startDate)) {
        await updateTermsPeriod(existing.id, input);
        message = "Đã lưu điều khoản.";
      } else if (existing) {
        // Điều khoản chính bản mới từ ngày sau ngày bắt đầu cũ: tạo bản mới, khép bản cũ lại ngày hôm trước.
        await createTermsPeriod(input);
        await updateTermsPeriod(existing.id, { ...existing, endDate: dayBefore(draft.startDate) });
        message = `Đã lưu điều khoản mới, có hiệu lực từ ${fmtDateVn(draft.startDate)}. Ca trước ngày đó vẫn tính theo điều khoản cũ.`;
      } else {
        await createTermsPeriod(input);
        message = draft.kind === "standard" ? `Đã lưu điều khoản, có hiệu lực từ ${fmtDateVn(draft.startDate)}. Ca trước ngày đó vẫn tính theo cấu hình cũ.` : `Đã lưu ${PERIOD_LABEL[draft.kind].toLowerCase()} ${draft.label}.`;
      }
      const next = await fetchTermsPeriods();
      onPeriodsChanged(next ?? []);
      const active = draft.kind === "standard" && draft.startDate <= today && (!draft.endDate || draft.endDate >= today);
      if (active) await onMirrorLegacy(draft.terms);
      setDraft(null);
      setNote(message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: TermsPeriod) {
    if (!(await confirm(`Xoá ${PERIOD_LABEL[p.kind].toLowerCase()} ${p.label || fmtDateVn(p.startDate)}?\n\nCa trong khoảng ngày này sẽ tính theo điều khoản đang phủ ngày đó (hoặc cấu hình cũ nếu không còn).`, { danger: true }))) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTermsPeriod(p.id);
      const next = await fetchTermsPeriods();
      onPeriodsChanged(next ?? []);
      setNote("Đã xoá.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const warnings = (t: CommercialTerms) => validateTerms(t).filter((i) => i.level === "warn");
  const errorsOf = (t: CommercialTerms) => validateTerms(t).filter((i) => i.level === "error");

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-black text-[var(--text)] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-blue-400" /> Điều khoản hợp tác</h4>
        {canEdit && available && !draft && cur && <button type="button" onClick={() => startEdit(cur)} className={`${btnGhostCls} flex items-center gap-1`}><Pencil className="w-3 h-3" /> Sửa</button>}
      </div>

      {!available && <p className="text-[11px] text-amber-300">Chưa lưu được điều khoản: database chưa chạy migration 0191. Tiền đang tính theo cách cũ ({brand.billingModel === "hourly" ? "theo giờ" : "theo %"}).</p>}
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {note && <p className="text-xs text-emerald-300">{note}</p>}

      {!draft && available && (
        <>
          {cur ? (
            <div className="space-y-1">
              <p className="text-sm font-black text-[var(--text)]">{termsLabel(cur.terms)}</p>
              <p className="text-[11px] text-[var(--text-muted)]">
                {cur.terms.services.map((s) => SERVICE_LABEL[s]).join(" · ")} · từ {fmtDateVn(cur.startDate)}
              </p>
              {errorsOf(cur.terms).map((i, k) => <p key={k} className="text-[11px] text-rose-300">{i.text}</p>)}
              <details className="text-[11px]">
                <summary className="cursor-pointer text-[var(--text-faint)]">Xem đầy đủ{warnings(cur.terms).length > 0 ? ` · ${warnings(cur.terms).length} lưu ý` : ""}</summary>
                <ul className="mt-1 space-y-0.5 text-[var(--text-muted)] list-disc pl-4">{describeTerms(cur.terms).map((l, i) => <li key={i}>{l}</li>)}</ul>
                {warnings(cur.terms).map((i, k) => <p key={k} className="mt-1 text-amber-300">{i.text}</p>)}
              </details>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-muted)]">Chưa khai — đang tính theo cách cũ: {termsLabel(legacyTerms)}.</p>
              {canEdit && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => startNew("standard", legacyTerms)} className={btnCls}>Khai điều khoản</button>
                  <select value="" onChange={(e) => { const t = TERMS_TEMPLATES.find((x) => x.key === e.target.value); if (t) startNew("standard", t.build()); }} className={`${inputCls} w-auto`} aria-label="Bắt đầu từ gói mẫu">
                    <option value="">hoặc chọn gói mẫu…</option>
                    {TERMS_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {(upcomingOrPast.length > 0 || others.length > 0) && (
            <details className="text-xs">
              <summary className="cursor-pointer text-[11px] font-bold text-[var(--text-muted)]">Chiến dịch, gói thử, bản cũ ({upcomingOrPast.length + others.length})</summary>
              <div className="mt-2 space-y-1.5">
                {[...others, ...upcomingOrPast].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5">
                    <p className="text-xs text-[var(--text)] min-w-0">
                      <b>{p.kind === "standard" ? "Bản cũ" : PERIOD_LABEL[p.kind]}{p.label ? ` · ${p.label}` : ""}</b>
                      <span className="text-[var(--text-muted)]"> · {fmtDateVn(p.startDate)} → {p.endDate ? fmtDateVn(p.endDate) : "nay"} · {termsLabel(p.terms)}</span>
                    </p>
                    {canEdit && (
                      <div className="flex items-center shrink-0">
                        <button type="button" onClick={() => startEdit(p)} disabled={busy} className="p-1.5 text-[var(--text-faint)] hover:text-[var(--text)]" aria-label="Sửa giai đoạn"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => remove(p)} disabled={busy} className="p-1.5 text-[var(--text-faint)] hover:text-rose-400" aria-label="Xoá giai đoạn"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
          {canEdit && cur && (
            <div className="flex flex-wrap gap-3 text-[11px]">
              <button type="button" onClick={() => startNew("campaign", JSON.parse(JSON.stringify(cur.terms)) as CommercialTerms)} className="font-bold text-[var(--accent-text)] hover:underline">+ Chiến dịch (11.11…)</button>
              <button type="button" onClick={() => startNew("trial", JSON.parse(JSON.stringify(cur.terms)) as CommercialTerms, "Gói thử")} className="font-bold text-[var(--accent-text)] hover:underline">+ Gói thử</button>
            </div>
          )}
        </>
      )}

      {draft && (
        <div className="space-y-4">
          <div className={`grid gap-3 ${draft.kind === "standard" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
            {draft.kind !== "standard" && (
              <Field label={PERIOD_LABEL[draft.kind]}>
                <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={draft.kind === "campaign" ? "vd 11.11" : "vd Gói thử 1 tháng"} className={inputCls} />
              </Field>
            )}
            <Field label="Áp dụng từ ngày">
              <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className={inputCls} />
            </Field>
            {draft.kind !== "standard" && (
              <Field label="Đến ngày">
                <input type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} className={inputCls} />
              </Field>
            )}
          </div>
          {draft.kind === "standard" && draft.id && mine.find((p) => p.id === draft.id)?.startDate !== draft.startDate && (
            <p className="text-[11px] text-[var(--text-faint)]">Tạo điều khoản mới từ ngày này; bản hiện tại khép lại hôm trước, ca cũ giữ nguyên.</p>
          )}

          <TermsEditor terms={draft.terms} onChange={(terms) => setDraft({ ...draft, terms })} canEdit={canEdit} />

          {needsReturn && (
            <NumberField
              key={`ret-${platform}`}
              label="Tỷ lệ hoàn huỷ dự kiến (để ra NMV)"
              current={rate && rate.returnRate > 0 ? `${rate.returnRate}%` : "chưa nhập"}
              placeholder="% mới"
              max={100}
              step={0.1}
              canEdit={canEdit}
              onSave={onSaveReturnRate}
            />
          )}

          {(issues.some((i) => i.level === "error") || dateProblem) && (
            <div className="space-y-0.5">
              {issues.filter((i) => i.level === "error").map((i, k) => <p key={k} className="text-[11px] text-rose-300">{i.text}</p>)}
              {dateProblem && <p className="text-[11px] text-rose-300">{dateProblem}</p>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={busy || blocking} className={btnCls}>{busy ? "Đang lưu…" : "Lưu"}</button>
            <button type="button" onClick={() => setDraft(null)} disabled={busy} className={btnGhostCls}>Huỷ</button>
            {!blocking && issues.length > 0 && <span className="text-[11px] text-amber-300">{issues.length} lưu ý — xem ở bản đã lưu</span>}
          </div>
        </div>
      )}
    </div>
  );
};
