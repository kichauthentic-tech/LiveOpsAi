import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  FEE_LABEL,
  SERVICE_LABEL,
  TERMS_TEMPLATES,
  newFee,
  newRateRule,
  type CommercialTerms,
  type FeeComponent,
  type FeeKind,
  type RateRule,
  type ServiceKey
} from "../../lib/commercial/terms";
import { fmtVndFull } from "../../lib/format";
import { useConfirm } from "../../hooks/useConfirm";
import { Field, NumInput, Pill, btnGhostCls, inputCls } from "./fields";

// Trình sửa điều khoản — gọn: (1) chọn việc YFB làm bằng nút bấm, (2) khoản phí, (3) “Nâng cao” gập sẵn cho hệ quả cam kết.
// Chỉ sửa bản nháp trong bộ nhớ (onChange); lưu / áp dụng từ ngày nào do TermsPanel lo.

interface Props {
  terms: CommercialTerms;
  onChange: (t: CommercialTerms) => void;
  canEdit: boolean;
}

const LIVE_MODES: { key: ServiceKey | "none"; label: string }[] = [
  { key: "live", label: "Live trọn ca" },
  { key: "host_supply", label: "Chỉ cấp host" },
  { key: "studio_rental", label: "Thuê phòng" },
  { key: "none", label: "Không có ca live" }
];
const EXTRA: ServiceKey[] = ["ads", "affiliate", "training"];
const EXTRA_LABEL: Record<string, string> = { ads: "Chạy Ads", affiliate: "Book creator", training: "Đào tạo" };
const LIVE_KEYS: ServiceKey[] = ["live", "host_supply", "studio_rental"];

export const TermsEditor: React.FC<Props> = ({ terms, onChange, canEdit }) => {
  const confirm = useConfirm();
  const set = (patch: Partial<CommercialTerms>) => onChange({ ...terms, ...patch });
  const liveMode: ServiceKey | "none" = LIVE_KEYS.find((k) => terms.services.includes(k)) ?? "none";

  const setLiveMode = (m: ServiceKey | "none") => {
    const rest = terms.services.filter((s) => !LIVE_KEYS.includes(s));
    set({ services: m === "none" ? rest : [m, ...rest], inhouseLive: m === "none" ? false : terms.inhouseLive || m === "host_supply" });
  };
  const toggleExtra = (k: ServiceKey) => {
    const on = !terms.services.includes(k);
    const services = on ? [...terms.services, k] : terms.services.filter((s) => s !== k);
    // Bỏ dịch vụ thì bỏ luôn khoản phí đi kèm, tránh phí “mồ côi”.
    const drop: FeeKind | null = !on && k === "ads" ? "ads_mgmt" : !on && k === "affiliate" ? "affiliate_booking" : null;
    set({ services, fees: drop ? terms.fees.filter((f) => f.kind !== drop) : terms.fees });
  };

  const patchFee = (id: string, patch: Partial<FeeComponent>) => set({ fees: terms.fees.map((f) => (f.id === id ? ({ ...f, ...patch } as FeeComponent) : f)) });
  const addFee = (kind: FeeKind) => {
    const services = new Set(terms.services);
    if (kind === "ads_mgmt") services.add("ads");
    if (kind === "affiliate_booking") services.add("affiliate");
    set({ fees: [...terms.fees, newFee(kind)], services: [...services] });
  };

  async function applyTemplate(key: string) {
    const tpl = TERMS_TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    const hasWork = terms.fees.some((f) => (f.kind === "per_hour" ? f.rate > 0 : f.kind === "pct_nmv" ? f.pct > 0 : f.kind === "fixed_monthly" ? f.amount > 0 : true));
    if (hasWork && !(await confirm(`Điền sẵn theo gói “${tpl.label}”? Các khoản phí đang nhập sẽ bị thay.`))) return;
    onChange(tpl.build());
  }

  const kindsAvailable = (Object.keys(FEE_LABEL) as FeeKind[]).filter((k) => k === "fixed_monthly" || !terms.fees.some((f) => f.kind === k));

  return (
    <div className="space-y-4">
      {canEdit && (
        <Field label="Điền sẵn theo gói mẫu">
          <select value="" onChange={(e) => e.target.value && applyTemplate(e.target.value)} className={inputCls} aria-label="Gói mẫu">
            <option value="">— chọn một gói —</option>
            {TERMS_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Field>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-bold text-[var(--text-muted)]">YFB làm</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Hình thức livestream">
          {LIVE_MODES.map((m) => <Pill key={m.key} on={liveMode === m.key} disabled={!canEdit} onClick={() => setLiveMode(m.key)} title={m.key === "live" ? SERVICE_LABEL.live : undefined}>{m.label}</Pill>)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EXTRA.map((k) => <Pill key={k} on={terms.services.includes(k)} disabled={!canEdit} onClick={() => toggleExtra(k)}>{EXTRA_LABEL[k]}</Pill>)}
          {liveMode !== "none" && <Pill on={terms.inhouseLive} disabled={!canEdit} onClick={() => set({ inhouseLive: !terms.inhouseLive })} title="Brand cũng tự live trên cùng tài khoản shop">Brand tự live</Pill>}
        </div>
        {terms.services.includes("ads") && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--text-muted)]">Ngân sách Ads:</span>
            <Pill on={terms.adsBudgetBy === "brand"} disabled={!canEdit} onClick={() => set({ adsBudgetBy: "brand" })}>Brand trả</Pill>
            <Pill on={terms.adsBudgetBy === "yfb"} disabled={!canEdit} onClick={() => set({ adsBudgetBy: "yfb" })}>YFB ứng</Pill>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-bold text-[var(--text-muted)]">Tính phí</p>
        {terms.fees.length === 0 && <p className="text-[11px] text-[var(--text-faint)]">Chưa có khoản phí. Chọn gói mẫu ở trên hoặc thêm bên dưới.</p>}
        {terms.fees.map((f) => <FeeRow key={f.id} fee={f} canEdit={canEdit} onPatch={(p) => patchFee(f.id, p)} onRemove={() => set({ fees: terms.fees.filter((x) => x.id !== f.id) })} />)}
        {canEdit && kindsAvailable.length > 0 && (
          <select value="" onChange={(e) => e.target.value && addFee(e.target.value as FeeKind)} className={`${inputCls} sm:max-w-xs`} aria-label="Thêm khoản phí">
            <option value="">+ Thêm khoản phí…</option>
            {kindsAvailable.map((k) => <option key={k} value={k}>{FEE_LABEL[k]}</option>)}
          </select>
        )}
      </div>

      <details className="text-xs" open={terms.shortfall.mode !== "none" || !!terms.gmvBonus || !!terms.gmvPenalty}>
        <summary className="cursor-pointer font-bold text-[var(--text-muted)]">Nâng cao: cam kết hụt hoặc vượt thì sao</summary>
        <div className="mt-3 space-y-3">
          <Field label="Thiếu giờ cam kết">
            <select
              value={terms.shortfall.mode}
              disabled={!canEdit}
              onChange={(e) => {
                const m = e.target.value;
                set({ shortfall: m === "makeup" ? { mode: "makeup", months: 1 } : m === "credit" ? { mode: "credit", perHour: 0 } : m === "prorate" ? { mode: "prorate" } : { mode: "none" } });
              }}
              className={inputCls}
            >
              <option value="none">Chỉ báo thiếu</option>
              <option value="makeup">Bù giờ tháng sau</option>
              <option value="prorate">Giảm phí cố định theo giờ thiếu</option>
              <option value="credit">Trừ tiền mỗi giờ thiếu</option>
            </select>
          </Field>
          {terms.shortfall.mode === "makeup" && (
            <Field label="Bù trong (tháng)"><NumInput label="Số tháng được bù" value={terms.shortfall.months} min={1} max={12} disabled={!canEdit} onChange={(v) => set({ shortfall: { mode: "makeup", months: Math.max(1, Math.round(v)) } })} /></Field>
          )}
          {terms.shortfall.mode === "credit" && (
            <Field label="Trừ mỗi giờ thiếu"><NumInput label="Số tiền trừ mỗi giờ thiếu" value={terms.shortfall.perHour} step={10000} disabled={!canEdit} onChange={(v) => set({ shortfall: { mode: "credit", perHour: v } })} /></Field>
          )}
          {terms.shortfall.mode === "prorate" && !terms.fees.some((f) => f.kind === "fixed_monthly") && <p className="text-[11px] text-amber-300">Cần có “Phí cố định hằng tháng” ở trên.</p>}

          <div className="flex flex-wrap gap-1.5">
            <Pill on={!!terms.gmvBonus} disabled={!canEdit} onClick={() => set({ gmvBonus: terms.gmvBonus ? null : { basis: "gmv", cap: 0, tiers: [{ fromPctOfCommit: 100, fromAmount: 0, pct: 3 }] } })}>Thưởng khi vượt GMV</Pill>
            <Pill on={!!terms.gmvPenalty} disabled={!canEdit} onClick={() => set({ gmvPenalty: terms.gmvPenalty ? null : { belowPctOfCommit: 80, discountPct: 10 } })}>Giảm phí khi hụt GMV</Pill>
          </div>

          {terms.gmvBonus && <BonusEditor bonus={terms.gmvBonus} canEdit={canEdit} onChange={(b) => set({ gmvBonus: b })} />}
          {terms.gmvPenalty && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="GMV dưới (% cam kết)"><NumInput label="Ngưỡng % GMV cam kết" value={terms.gmvPenalty.belowPctOfCommit} max={100} disabled={!canEdit} suffix="%" onChange={(v) => set({ gmvPenalty: { ...terms.gmvPenalty!, belowPctOfCommit: v } })} /></Field>
              <Field label="Giảm phí"><NumInput label="Phần trăm giảm phí" value={terms.gmvPenalty.discountPct} max={100} step={0.5} disabled={!canEdit} suffix="%" onChange={(v) => set({ gmvPenalty: { ...terms.gmvPenalty!, discountPct: v } })} /></Field>
            </div>
          )}
          {(terms.gmvBonus || terms.gmvPenalty || terms.shortfall.mode !== "none") && <p className="text-[11px] text-[var(--text-faint)]">Giờ và GMV cam kết từng tháng lấy từ khối Hợp đồng.</p>}
        </div>
      </details>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------------
function FeeRow({ fee, canEdit, onPatch, onRemove }: { fee: FeeComponent; canEdit: boolean; onPatch: (p: Partial<FeeComponent>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h6 className="text-xs font-black text-[var(--text)]">{fee.kind === "fixed_monthly" && fee.label ? fee.label : FEE_LABEL[fee.kind]}</h6>
        {canEdit && (
          <button type="button" onClick={onRemove} className="p-1 rounded-lg text-[var(--text-faint)] hover:text-rose-400" title="Bỏ khoản này" aria-label={`Bỏ ${FEE_LABEL[fee.kind]}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {fee.kind === "per_hour" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Đơn giá / giờ"><NumInput label="Đơn giá mỗi giờ live" value={fee.rate} step={10000} disabled={!canEdit} onChange={(v) => onPatch({ rate: v })} /></Field>
            <Field label="Phụ thu trợ live / giờ"><NumInput label="Phụ thu mỗi giờ khi có trợ live" value={fee.coHostExtra} step={10000} disabled={!canEdit} onChange={(v) => onPatch({ coHostExtra: v })} /></Field>
          </div>
          <RateRules rules={fee.rules} base={fee.rate} canEdit={canEdit} onChange={(rules) => onPatch({ rules })} />
        </>
      )}

      {fee.kind === "pct_nmv" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tỷ lệ"><NumInput label="Tỷ lệ thu" value={fee.pct} max={100} step={0.1} disabled={!canEdit} suffix="%" onChange={(v) => onPatch({ pct: v })} /></Field>
          <Field label="Tính trên">
            <select value={fee.basis} disabled={!canEdit} onChange={(e) => onPatch({ basis: e.target.value as "nmv" | "gmv" })} className={inputCls}>
              <option value="nmv">NMV (sau hoàn huỷ)</option>
              <option value="gmv">GMV</option>
            </select>
          </Field>
        </div>
      )}

      {fee.kind === "fixed_monthly" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Tên (tuỳ chọn)" className="col-span-2 sm:col-span-1"><input value={fee.label ?? ""} disabled={!canEdit} onChange={(e) => onPatch({ label: e.target.value || undefined })} placeholder="Retainer" className={inputCls} /></Field>
          <Field label="Số tiền / tháng"><NumInput label="Phí cố định mỗi tháng" value={fee.amount} step={100000} disabled={!canEdit} onChange={(v) => onPatch({ amount: v })} /></Field>
          <Field label="Giờ đã gồm"><NumInput label="Số giờ live đã gồm" value={fee.includedHours} disabled={!canEdit} onChange={(v) => onPatch({ includedHours: v })} /></Field>
          <Field label="Giá giờ vượt"><NumInput label="Giá mỗi giờ vượt gói" value={fee.overageRate} step={10000} disabled={!canEdit || fee.includedHours <= 0} onChange={(v) => onPatch({ overageRate: v })} /></Field>
        </div>
      )}

      {fee.kind === "ads_mgmt" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="% chi tiêu Ads"><NumInput label="Phần trăm chi tiêu Ads" value={fee.pct} max={100} step={0.5} disabled={!canEdit} suffix="%" onChange={(v) => onPatch({ pct: v })} /></Field>
          <Field label="Tối thiểu / tháng"><NumInput label="Phí quản lý Ads tối thiểu" value={fee.minFee} step={100000} disabled={!canEdit} onChange={(v) => onPatch({ minFee: v })} /></Field>
        </div>
      )}

      {fee.kind === "affiliate_booking" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phí / creator"><NumInput label="Phí mỗi creator đã book" value={fee.perCreator} step={50000} disabled={!canEdit} onChange={(v) => onPatch({ perCreator: v })} /></Field>
          <Field label="% GMV affiliate"><NumInput label="Phần trăm GMV affiliate" value={fee.pctOfAffiliateGmv} max={100} step={0.5} disabled={!canEdit} suffix="%" onChange={(v) => onPatch({ pctOfAffiliateGmv: v })} /></Field>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
type DayMode = "all" | "weekday" | "weekend" | "dates";
const DAY_LABEL: Record<DayMode, string> = { all: "Mọi ngày", weekday: "T2–T6", weekend: "T7, CN", dates: "Ngày cụ thể" };

/** Giá khác theo khung giờ / ngày — gập sẵn, mỗi luật một hàng. Luật khớp đầu tiên (từ trên xuống) thắng. */
function RateRules({ rules, base, canEdit, onChange }: { rules: RateRule[]; base: number; canEdit: boolean; onChange: (r: RateRule[]) => void }) {
  const patch = (id: string, p: Partial<RateRule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <details className="text-xs" open={rules.length > 0}>
      <summary className="cursor-pointer text-[11px] font-bold text-[var(--text-muted)]">Giá khác theo giờ vàng / cuối tuần / ngày sale ({rules.length})</summary>
      <div className="mt-2 space-y-2">
        {rules.map((r) => <RuleRow key={r.id} rule={r} base={base} canEdit={canEdit} onPatch={(p) => patch(r.id, p)} onRemove={() => onChange(rules.filter((x) => x.id !== r.id))} />)}
        {canEdit && (
          <button type="button" onClick={() => onChange([...rules, newRateRule()])} className={`${btnGhostCls} flex items-center gap-1`}>
            <Plus className="w-3 h-3" /> Thêm luật giá
          </button>
        )}
        {rules.length > 1 && <p className="text-[11px] text-[var(--text-faint)]">Luật ở trên được xét trước.</p>}
      </div>
    </details>
  );
}

function RuleRow({ rule: r, base, canEdit, onPatch, onRemove }: { rule: RateRule; base: number; canEdit: boolean; onPatch: (p: Partial<RateRule>) => void; onRemove: () => void }) {
  const [dayMode, setDayMode] = useState<DayMode>(r.dates.length > 0 ? "dates" : r.weekdays);
  const [datesText, setDatesText] = useState(r.dates.join(", "));
  const price = r.mode === "rate" ? r.value : r.mode === "multiplier" ? base * r.value : base + r.value;
  return (
    <div className="rounded-lg border border-[var(--border)] p-2.5 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-[1.2fr_1fr_0.8fr_0.8fr] gap-2">
        <Field label="Tên luật" className="col-span-2 sm:col-span-1"><input value={r.label} disabled={!canEdit} placeholder="Giờ vàng" aria-label="Tên luật giá" onChange={(e) => onPatch({ label: e.target.value })} className={inputCls} /></Field>
        <Field label="Ngày">
          <select
            value={dayMode}
            disabled={!canEdit}
            onChange={(e) => {
              const m = e.target.value as DayMode;
              setDayMode(m);
              if (m === "dates") onPatch({ weekdays: "all" });
              else onPatch({ weekdays: m, dates: [] });
            }}
            className={inputCls}
          >
            {(Object.keys(DAY_LABEL) as DayMode[]).map((k) => <option key={k} value={k}>{DAY_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Từ giờ"><input type="time" value={r.from} disabled={!canEdit} onChange={(e) => onPatch({ from: e.target.value })} className={inputCls} /></Field>
        <Field label="Đến giờ"><input type="time" value={r.to} disabled={!canEdit} onChange={(e) => onPatch({ to: e.target.value })} className={inputCls} /></Field>
      </div>
      {dayMode === "dates" && (
        <Field label="Các ngày (năm-tháng-ngày, cách nhau dấu phẩy)">
          <input
            value={datesText}
            disabled={!canEdit}
            placeholder="2026-11-11, 2026-12-12"
            onChange={(e) => {
              setDatesText(e.target.value);
              onPatch({ dates: e.target.value.split(/[,\s]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) });
            }}
            className={inputCls}
          />
        </Field>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Cách tính" className="w-44">
          <select value={r.mode} disabled={!canEdit} onChange={(e) => onPatch({ mode: e.target.value as RateRule["mode"], value: e.target.value === "multiplier" ? 1.2 : 0 })} className={inputCls}>
            <option value="multiplier">Nhân đơn giá</option>
            <option value="add">Cộng thêm</option>
            <option value="rate">Đơn giá riêng</option>
          </select>
        </Field>
        <Field label={r.mode === "multiplier" ? "Hệ số" : "Số tiền / giờ"} className="w-36">
          <NumInput label={r.mode === "multiplier" ? "Hệ số nhân" : "Số tiền mỗi giờ"} value={r.value} step={r.mode === "multiplier" ? 0.05 : 10000} disabled={!canEdit} onChange={(v) => onPatch({ value: v })} />
        </Field>
        {base > 0 && <span className="pb-2 text-[11px] text-[var(--text-muted)]">= {fmtVndFull(price)}/giờ</span>}
        {canEdit && (
          <button type="button" onClick={onRemove} className="ml-auto mb-1 p-1 text-[var(--text-faint)] hover:text-rose-400" aria-label="Xoá luật giá"><Trash2 className="w-3.5 h-3.5" /></button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
function BonusEditor({ bonus, canEdit, onChange }: { bonus: NonNullable<CommercialTerms["gmvBonus"]>; canEdit: boolean; onChange: (b: NonNullable<CommercialTerms["gmvBonus"]>) => void }) {
  const setTier = (i: number, p: Partial<(typeof bonus.tiers)[number]>) => onChange({ ...bonus, tiers: bonus.tiers.map((t, k) => (k === i ? { ...t, ...p } : t)) });
  return (
    <div className="rounded-lg border border-[var(--border)] p-3 space-y-2.5">
      <p className="text-[11px] font-bold text-[var(--text-muted)]">Thưởng vượt GMV — luỹ tiến theo bậc</p>
      {bonus.tiers.map((t, i) => {
        const byAmount = t.fromAmount > 0;
        return (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
            <Field label="Ngưỡng theo">
              <select value={byAmount ? "amount" : "pct"} disabled={!canEdit} onChange={(e) => setTier(i, e.target.value === "amount" ? { fromAmount: 1, fromPctOfCommit: 0 } : { fromAmount: 0, fromPctOfCommit: 100 })} className={inputCls}>
                <option value="pct">% GMV cam kết</option>
                <option value="amount">Số tiền</option>
              </select>
            </Field>
            <Field label={byAmount ? "Từ GMV" : "Từ (% cam kết)"}>
              {byAmount ? (
                <NumInput label="Ngưỡng GMV" value={t.fromAmount} step={1000000} disabled={!canEdit} onChange={(v) => setTier(i, { fromAmount: v })} />
              ) : (
                <NumInput label="Ngưỡng % cam kết" value={t.fromPctOfCommit} step={5} disabled={!canEdit} suffix="%" onChange={(v) => setTier(i, { fromPctOfCommit: v })} />
              )}
            </Field>
            <Field label="Thưởng"><NumInput label="Phần trăm thưởng" value={t.pct} max={100} step={0.5} disabled={!canEdit} suffix="%" onChange={(v) => setTier(i, { pct: v })} /></Field>
            {canEdit && bonus.tiers.length > 1 && (
              <button type="button" onClick={() => onChange({ ...bonus, tiers: bonus.tiers.filter((_, k) => k !== i) })} className="p-1.5 mb-1 text-[var(--text-faint)] hover:text-rose-400" aria-label={`Bỏ bậc ${i + 1}`}><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-end gap-3">
        {canEdit && (
          <button type="button" onClick={() => onChange({ ...bonus, tiers: [...bonus.tiers, { fromPctOfCommit: Math.max(...bonus.tiers.map((t) => t.fromPctOfCommit), 100) + 20, fromAmount: 0, pct: 5 }] })} className={`${btnGhostCls} flex items-center gap-1`}>
            <Plus className="w-3 h-3" /> Thêm bậc
          </button>
        )}
        <Field label="Trần / tháng (0 = không giới hạn)" className="w-48"><NumInput label="Trần thưởng mỗi tháng" value={bonus.cap} step={100000} disabled={!canEdit} onChange={(v) => onChange({ ...bonus, cap: v })} /></Field>
      </div>
    </div>
  );
}
