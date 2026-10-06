import React, { useMemo, useState } from "react";
import { CalendarRange, FileSignature, History, MapPin, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Brand, BrandContract, BrandMonthlyCommitment, BrandPlatformRate, BrandPlatformRateHistoryEntry, BrandStudio, Studio } from "../types";
import { createBrandContract, deleteBrandContract, generateContractCommitments, updateBrandContract } from "../lib/db/brandContracts";
import { findBrandStudioId } from "../lib/db/brandStudios";
import { generateThroughMonth, monthKeyOf, todayVn } from "../lib/performance/brandCommitment";
import { rateOf } from "../lib/brandPricing";
import { errorMessage } from "../lib/errorMessage";
import { fmtDateVn, fmtMonth, fmtVndFull, fmtVndShort } from "../lib/format";
import { REPORT_PLATFORMS, type ReportPlatform } from "../lib/reportPlatform";
import { useConfirm } from "../hooks/useConfirm";
import { MonthPicker } from "./common/MonthPicker";

// "Hợp đồng & giá" của MỘT brand — chỗ nhập DUY NHẤT cho mọi điều khoản thương mại (gộp cấu hình 06/10, user: "đưa
// vào cấu hình đúng 1 chỗ ở CRM"). Trước đó: đơn giá/hoa hồng/hoàn huỷ ở nút Rate Card trong CRM, hợp đồng + giờ cam
// kết ở module "Cam Kết Hợp Đồng" riêng (phải bấm "Sinh cam kết theo tháng" bằng tay), phòng live mặc định ở Kế
// Hoạch Tháng, % hoa hồng còn sửa được từng ca ở Finance.
//
// Theo từng sàn (hợp đồng/giá riêng TikTok và Shopee — user chốt 06/10); cách thu phí theo brand. Lưu hợp đồng đang
// hiệu lực là app tự đổ giờ cam kết ra từng tháng; số riêng của một tháng sửa ở Kế Hoạch Tháng khi lập lịch tháng đó.

interface Props {
  brand: Brand;
  platform: ReportPlatform;
  onPlatformChange: (p: ReportPlatform) => void;
  canEdit: boolean;
  rates: BrandPlatformRate[];
  rateHistory: BrandPlatformRateHistoryEntry[];
  contracts: BrandContract[];
  commitments: BrandMonthlyCommitment[];
  studios: Studio[];
  brandStudios: BrandStudio[];
  onUpdateBrand: (brand: Brand) => void;
  onSaveRate: (brandId: string, platform: ReportPlatform, ratePerHour: number) => Promise<boolean>;
  onSaveReturnRate: (brandId: string, platform: ReportPlatform, returnRate: number) => Promise<boolean>;
  onSaveCommissionRate: (brandId: string, platform: ReportPlatform, commissionRate: number) => Promise<boolean>;
  onSetBrandStudio: (brandId: string, platform: ReportPlatform, studioId: string) => Promise<boolean>;
  /** Đọc lại hợp đồng + cam kết sau khi ghi. */
  onContractsChanged: () => Promise<void>;
  /** Sang Kế Hoạch Tháng của đúng brand × sàn (sửa cam kết một tháng). */
  onOpenMonthPlan?: (platform: ReportPlatform) => void;
}

interface ContractDraft {
  id?: string;
  contractCode: string;
  startMonth: string;
  endMonth: string;
  monthlyHours: string;
  monthlyGmv: string;
  status: BrandContract["status"];
  note: string;
}

const inputCls =
  "w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-60";
const btnCls = "px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-bold";
const fmtHours = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
const STATUS_LABEL: Record<BrandContract["status"], string> = { draft: "nháp", active: "đang hiệu lực", ended: "đã kết thúc" };

/** Một ô số + nút Lưu (giá trị đang lưu hiện bên cạnh). */
function NumberField({
  label,
  hint,
  current,
  placeholder,
  max,
  step,
  canEdit,
  onSave
}: {
  label: string;
  hint?: string;
  current: string;
  placeholder: string;
  max?: number;
  step?: number;
  canEdit: boolean;
  onSave: (v: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(v) || v < 0 || (max !== undefined && v > max)) return;
    setBusy(true);
    const ok = await onSave(v);
    setBusy(false);
    if (ok) setDraft("");
  };
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold text-[var(--text-muted)]">{label}</span>
        <span className="text-xs font-black text-[var(--text)]">{current}</span>
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={max} step={step} value={draft} placeholder={placeholder} aria-label={label} onChange={(e) => setDraft(e.target.value)} className={inputCls} />
          <button onClick={save} disabled={busy || draft.trim() === ""} className={btnCls}>{busy ? "…" : "Lưu"}</button>
        </div>
      )}
      {hint && <p className="text-[11px] text-[var(--text-faint)] leading-snug">{hint}</p>}
    </div>
  );
}

export const BrandConfigPanel: React.FC<Props> = ({
  brand,
  platform,
  onPlatformChange,
  canEdit,
  rates,
  rateHistory,
  contracts,
  commitments,
  studios,
  brandStudios,
  onUpdateBrand,
  onSaveRate,
  onSaveReturnRate,
  onSaveCommissionRate,
  onSetBrandStudio,
  onContractsChanged,
  onOpenMonthPlan
}) => {
  const confirm = useConfirm();
  const today = todayVn();
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const hourly = brand.billingModel === "hourly";
  const rate = rateOf(rates, brand.id, platform);
  const history = useMemo(
    () => rateHistory.filter((h) => h.brandId === brand.id && h.platform === platform).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [rateHistory, brand.id, platform]
  );
  const myContracts = useMemo(
    () => contracts.filter((c) => c.brandId === brand.id && (c.platform ?? "TikTok") === platform).sort((a, b) => b.startMonth.localeCompare(a.startMonth)),
    [contracts, brand.id, platform]
  );
  // Cam kết từng tháng: từ 3 tháng trước tới mọi tháng đã sinh phía sau (lịch sử xa hơn không cần để nhập hợp đồng).
  const fromMonth = (() => {
    const [y, m] = today.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 4, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  })();
  const monthRows = useMemo(
    () =>
      commitments
        .filter((c) => c.brandId === brand.id && (c.platform ?? "TikTok") === platform && c.periodMonth >= fromMonth)
        .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth)),
    [commitments, brand.id, platform, fromMonth]
  );
  const studioId = findBrandStudioId(brandStudios, brand.id, platform);

  const startNew = () =>
    setDraft({ contractCode: "", startMonth: monthKeyOf(today), endMonth: "", monthlyHours: "", monthlyGmv: "", status: "active", note: "" });
  const startEdit = (c: BrandContract) =>
    setDraft({
      id: c.id,
      contractCode: c.contractCode ?? "",
      startMonth: c.startMonth,
      endMonth: c.endMonth ?? "",
      monthlyHours: String(c.monthlyHours),
      monthlyGmv: c.monthlyGmv === undefined ? "" : String(c.monthlyGmv),
      status: c.status,
      note: c.note ?? ""
    });

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function saveContract() {
    if (!draft) return;
    const hours = Number(draft.monthlyHours);
    if (draft.monthlyHours.trim() === "" || !Number.isFinite(hours) || hours < 0) return setError("Giờ cam kết/tháng phải là số không âm.");
    const gmvRaw = draft.monthlyGmv.trim();
    const gmv = gmvRaw === "" ? undefined : Number(gmvRaw);
    if (gmv !== undefined && (!Number.isFinite(gmv) || gmv < 0)) return setError("GMV cam kết/tháng phải là số không âm, hoặc để trống.");
    if (draft.endMonth && draft.endMonth < draft.startMonth) return setError("Tháng kết thúc không được trước tháng bắt đầu.");
    const payload = {
      contractCode: draft.contractCode.trim(),
      startMonth: draft.startMonth,
      endMonth: draft.endMonth || undefined,
      monthlyHours: hours,
      monthlyGmv: gmv,
      platform,
      status: draft.status,
      note: draft.note.trim()
    };
    run(async () => {
      const saved = draft.id ? await updateBrandContract(draft.id, payload) : await createBrandContract({ brandId: brand.id, ...payload });
      setDraft(null);
      // Hợp đồng đang hiệu lực ⇒ đổ giờ ra từng tháng NGAY (trước 06/10 là nút "Sinh cam kết theo tháng" riêng — quên
      // bấm thì run-rate không có mẫu số). Tháng đã sửa riêng ở Kế Hoạch Tháng giữ nguyên.
      if (saved.status === "active") {
        const r = await generateContractCommitments(saved.id, generateThroughMonth(saved, today));
        await onContractsChanged();
        const parts = [`${r.inserted + r.updated} tháng theo hợp đồng`];
        if (r.skippedOverride > 0) parts.push(`giữ ${r.skippedOverride} tháng đã sửa riêng ở Kế Hoạch Tháng`);
        if (r.skippedOtherContract > 0) parts.push(`bỏ qua ${r.skippedOtherContract} tháng thuộc hợp đồng khác`);
        if (r.removed > 0) parts.push(`bỏ ${r.removed} tháng nằm ngoài khung mới`);
        setNote(`Đã lưu hợp đồng — ${parts.join(", ")}.${saved.endMonth ? "" : " Hợp đồng chưa có tháng kết thúc: tháng xa hơn lấy số này khi lập Kế Hoạch Tháng."}`);
        return;
      }
      await onContractsChanged();
      setNote(saved.status === "draft" ? "Đã lưu hợp đồng nháp — chưa tính cam kết. Chuyển sang “Đang hiệu lực” khi ký." : "Đã lưu hợp đồng. Cam kết các tháng đã có giữ nguyên.");
    });
  }

  async function removeContract(c: BrandContract) {
    if (!(await confirm(`Xoá hợp đồng ${c.contractCode || ""} của ${brand.name} ${platform}?\n\nCam kết các tháng đã có GIỮ LẠI (lịch sử không bị viết lại), chỉ mất liên kết tới hợp đồng.`, { danger: true }))) return;
    run(async () => {
      await deleteBrandContract(c.id);
      await onContractsChanged();
      setNote("Đã xoá hợp đồng. Cam kết các tháng vẫn còn nguyên.");
    });
  }

  return (
    <div className="space-y-4">
      {/* Cách thu phí — theo brand, quyết định ô giá nào có nghĩa. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-[var(--text-muted)]">Cách thu phí:</span>
        {(["gmv_commission", "hourly"] as const).map((m) => (
          <button
            key={m}
            disabled={!canEdit}
            aria-pressed={brand.billingModel === m}
            onClick={() => brand.billingModel !== m && onUpdateBrand({ ...brand, billingModel: m })}
            className={`min-h-6 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${brand.billingModel === m ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
          >
            {m === "hourly" ? "Theo giờ live" : "Theo % doanh số"}
          </button>
        ))}
        <span className="flex-1" />
        <div className="inline-flex items-center gap-1 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-1" role="group" aria-label="Sàn">
          {REPORT_PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => onPlatformChange(p)}
              aria-pressed={platform === p}
              className={`min-h-6 px-3 py-1.5 rounded-lg text-xs font-bold ${platform === p ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-900 rounded-lg px-3 py-2">{error}</p>}
      {note && <p className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900 rounded-lg px-3 py-2">{note}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Giá */}
        <div className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-black text-[var(--text)] flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-blue-400" /> Giá {platform}</h4>
          {hourly ? (
            <NumberField
              key={`rate-${platform}`}
              label="Đơn giá / giờ live"
              current={rate && rate.ratePerHour > 0 ? fmtVndFull(rate.ratePerHour) : "chưa nhập"}
              placeholder="Đơn giá mới"
              canEdit={canEdit}
              hint="Doanh thu agency = giờ ca theo lịch × đơn giá (Finance & P&L)."
              onSave={(v) => onSaveRate(brand.id, platform, v)}
            />
          ) : (
            <NumberField
              key={`comm-${platform}`}
              label="% hoa hồng agency (trên NMV)"
              current={rate?.commissionRate != null ? `${rate.commissionRate}%` : "chưa đặt"}
              placeholder="% mới"
              max={100}
              step={0.1}
              canEdit={canEdit}
              hint="Doanh thu agency = NMV × %. Áp cho mọi ca của sàn này (không sửa từng ca)."
              onSave={(v) => onSaveCommissionRate(brand.id, platform, v)}
            />
          )}
          <NumberField
            key={`ret-${platform}`}
            label="Tỷ lệ hoàn huỷ"
            current={rate && rate.returnRate > 0 ? `${rate.returnRate}%` : "chưa nhập"}
            placeholder="% mới"
            max={100}
            step={0.1}
            canEdit={canEdit}
            hint="NMV ước tính = GMV × (1 − tỷ lệ). Chưa nhập thì NMV bằng GMV."
            onSave={(v) => onSaveReturnRate(brand.id, platform, v)}
          />
          {history.length > 0 && (
            <details className="text-[11px]">
              <summary className="cursor-pointer font-bold text-[var(--text-muted)] flex items-center gap-1"><History className="w-3 h-3" /> Lịch sử giá ({history.length})</summary>
              <div className="mt-1.5 space-y-1">
                {history.map((h) => (
                  <div key={h.id} className="flex flex-wrap justify-between gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1">
                    <span className="text-[var(--text-muted)]">{fmtDateVn(h.effectiveFrom)} → {h.effectiveTo ? fmtDateVn(h.effectiveTo) : "nay"}</span>
                    <span className="text-[var(--text)]">
                      {fmtVndFull(h.ratePerHour)}/giờ · hoàn {h.returnRate}%{h.commissionRate != null ? ` · ${h.commissionRate}%` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* 2. Hợp đồng + cam kết */}
        <div className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-4 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-black text-[var(--text)] flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5 text-blue-400" /> Hợp đồng {platform}</h4>
            {canEdit && !draft && (
              <button onClick={startNew} className="px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/60 text-[11px] font-bold text-[var(--accent-text)] flex items-center gap-1"><Plus className="w-3 h-3" /> Thêm hợp đồng</button>
            )}
          </div>

          {draft && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--text-faint)]">Mã hợp đồng</span>
                  <input value={draft.contractCode} onChange={(e) => setDraft({ ...draft, contractCode: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--text-faint)]">Từ tháng</span>
                  <MonthPicker value={draft.startMonth.slice(0, 7)} onChange={(m) => setDraft({ ...draft, startMonth: `${m}-01` })} arrows={false} align="left" ariaLabel="Từ tháng" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--text-faint)]">Đến tháng</span>
                  <MonthPicker
                    value={draft.endMonth ? draft.endMonth.slice(0, 7) : ""}
                    onChange={(m) => setDraft({ ...draft, endMonth: m ? `${m}-01` : "" })}
                    min={draft.startMonth.slice(0, 7) || undefined}
                    arrows={false}
                    allowEmpty
                    emptyLabel="Chưa chốt"
                    align="left"
                    ariaLabel="Đến tháng"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--text-faint)]">Trạng thái</span>
                  <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as BrandContract["status"] })} className={inputCls}>
                    <option value="draft">Nháp</option>
                    <option value="active">Đang hiệu lực</option>
                    <option value="ended">Đã kết thúc</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--text-faint)]">Giờ cam kết / tháng</span>
                  <input type="number" min={0} value={draft.monthlyHours} onChange={(e) => setDraft({ ...draft, monthlyHours: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--text-faint)]">GMV cam kết / tháng (tuỳ chọn)</span>
                  <input type="number" min={0} value={draft.monthlyGmv} onChange={(e) => setDraft({ ...draft, monthlyGmv: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1 col-span-2">
                  <span className="text-[11px] text-[var(--text-faint)]">Ghi chú</span>
                  <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={inputCls} />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={saveContract} disabled={busy} className={btnCls}>{draft.id ? "Lưu hợp đồng" : "Tạo hợp đồng"}</button>
                <button onClick={() => setDraft(null)} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] text-xs font-bold">Huỷ</button>
                <span className="text-[11px] text-[var(--text-faint)]">Đang hiệu lực ⇒ giờ cam kết tự đổ ra từng tháng.</span>
              </div>
            </div>
          )}

          {myContracts.length === 0 && !draft ? (
            <p className="text-[11px] text-[var(--text-faint)]">Chưa có hợp đồng {platform}. Chưa có hợp đồng thì Kế Hoạch Tháng không có giờ cam kết mặc định và Toàn Cảnh Brand không so được giờ đã giao.</p>
          ) : (
            <div className="space-y-1.5">
              {myContracts.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2">
                  <div className="min-w-0 text-xs">
                    <p className="font-bold text-[var(--text)]">
                      {c.contractCode || "Hợp đồng"} · {fmtHours(c.monthlyHours)}/tháng
                      {c.monthlyGmv !== undefined && ` · ${fmtVndShort(c.monthlyGmv)} GMV/tháng`}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {fmtMonth(c.startMonth.slice(0, 7))} → {c.endMonth ? fmtMonth(c.endMonth.slice(0, 7)) : "chưa chốt"} · {STATUS_LABEL[c.status]}
                      {c.note ? ` · ${c.note}` : ""}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(c)} disabled={busy} className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)]" title="Sửa hợp đồng"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => removeContract(c)} disabled={busy} className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-rose-400" title="Xoá hợp đồng"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-[var(--border)]/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[var(--text-muted)] flex items-center gap-1"><CalendarRange className="w-3 h-3" /> Cam kết từng tháng</span>
              {onOpenMonthPlan && (
                <button onClick={() => onOpenMonthPlan(platform)} className="text-[11px] font-bold text-[var(--accent-text)] hover:underline">Sửa riêng một tháng ở Kế Hoạch Tháng →</button>
              )}
            </div>
            {monthRows.length === 0 ? (
              <p className="text-[11px] text-[var(--text-faint)] mt-1">Chưa có tháng nào.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {monthRows.map((m) => (
                  <span
                    key={m.id}
                    title={m.isOverride ? "Sửa riêng tháng này ở Kế Hoạch Tháng — sửa hợp đồng không ghi đè" : m.contractId ? "Theo hợp đồng" : "Hợp đồng gốc đã xoá"}
                    className={`text-[11px] px-2 py-1 rounded-lg border ${m.isOverride ? "border-amber-700 text-amber-200" : "border-[var(--border)] text-[var(--text-muted)]"}`}
                  >
                    {fmtMonth(m.periodMonth.slice(0, 7))}: <b className="text-[var(--text)]">{fmtHours(m.committedHours)}</b>
                    {m.committedGmv !== undefined && ` · ${fmtVndShort(m.committedGmv)}`}
                    {m.isOverride && " · sửa riêng"}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. Phòng live mặc định */}
        <div className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-4 space-y-2 lg:col-span-3">
          <h4 className="text-xs font-black text-[var(--text)] flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-blue-400" /> Phòng live mặc định ({platform})</h4>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={studioId}
              disabled={!canEdit}
              aria-label={`Phòng live mặc định ${platform}`}
              onChange={(e) => void onSetBrandStudio(brand.id, platform, e.target.value)}
              className={`${inputCls} sm:max-w-xs ${studioId ? "" : "border-amber-700"}`}
            >
              <option value="">— Chưa chọn phòng —</option>
              {studios.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.roomNumber})</option>)}
            </select>
            <span className="text-[11px] text-[var(--text-faint)]">Chốt Kế Hoạch Tháng gắn phòng này vào ca sinh ra; form mở ca chọn sẵn phòng này.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
