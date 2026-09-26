import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, FileSignature, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Brand, BrandContract, BrandMonthlyCommitment, LiveSession } from "../types";
import {
  createBrandContract,
  deleteBrandContract,
  deleteMonthlyCommitment,
  fetchBrandContracts,
  fetchBrandMonthlyCommitments,
  generateContractCommitments,
  updateBrandContract,
  upsertMonthlyCommitment
} from "../lib/db/brandContracts";
import { errorMessage } from "../lib/errorMessage";
import {
  CommitmentProgress,
  CommitmentStatus,
  brandsMissingCommitment,
  computeAllProgress,
  monthKeyOf,
  todayVn
} from "../lib/performance/brandCommitment";
import { useConfirm } from "../hooks/useConfirm";

interface BrandCommitmentProps {
  sessions: LiveSession[];
  brands: Brand[];
}

const STATUS_LABEL: Record<CommitmentStatus, string> = {
  no_commitment: "Chưa đặt cam kết",
  met: "Đã đủ cam kết",
  on_track: "Đã xếp đủ ca",
  at_risk: "Sát mức, dễ hụt",
  behind: "Thiếu giờ"
};

const STATUS_TONE: Record<CommitmentStatus, string> = {
  no_commitment: "bg-[var(--surface-base)] text-[var(--text-faint)]",
  met: "bg-emerald-950/50 text-emerald-400",
  on_track: "bg-sky-950/50 text-sky-400",
  at_risk: "bg-amber-950/50 text-amber-400",
  behind: "bg-rose-950/50 text-rose-400"
};

function fmtHours(n: number): string {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "h";
}

function fmtVnd(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tỷ";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "tr";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
}

function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

// Danh sách tháng để chọn: 12 tháng trước → 6 tháng sau tháng hiện tại. Cam kết hay được nhập
// trước vài tháng nên phải cho chọn tháng tương lai, không chỉ quá khứ.
function monthOptions(today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let offset = -12; offset <= 6; offset++) {
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
  }
  return out.reverse();
}

const inputCls =
  "bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

interface ContractDraft {
  id?: string;
  brandId: string;
  contractCode: string;
  startMonth: string;
  endMonth: string;
  monthlyHours: string;
  monthlyGmv: string;
  status: BrandContract["status"];
  note: string;
}

function emptyDraft(brandId: string, today: string): ContractDraft {
  return {
    brandId,
    contractCode: "",
    startMonth: monthKeyOf(today),
    endMonth: "",
    monthlyHours: "",
    monthlyGmv: "",
    status: "active",
    note: ""
  };
}

export function BrandCommitment({ sessions, brands }: BrandCommitmentProps) {
  const confirm = useConfirm();
  const today = todayVn();
  const [view, setView] = useState<"runrate" | "contracts">("runrate");
  const [periodMonth, setPeriodMonth] = useState(() => monthKeyOf(today));
  const [contracts, setContracts] = useState<BrandContract[]>([]);
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [editingMonth, setEditingMonth] = useState<string | null>(null); // brandId đang sửa cam kết
  const [monthHours, setMonthHours] = useState("");
  const [monthGmv, setMonthGmv] = useState("");

  const brandNameById = useMemo(
    () => Object.fromEntries(brands.map((b) => [b.id, b.name])) as Record<string, string>,
    [brands]
  );

  async function reload() {
    const [c, m] = await Promise.all([fetchBrandContracts(), fetchBrandMonthlyCommitments()]);
    setContracts(c);
    setCommitments(m);
  }

  useEffect(() => {
    reload().catch((e) => setError(errorMessage(e)));
  }, []);

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

  const rows = useMemo(
    () => computeAllProgress(commitments, brandNameById, sessions, periodMonth, today),
    [commitments, brandNameById, sessions, periodMonth, today]
  );

  const missing = useMemo(
    () => brandsMissingCommitment(commitments, sessions, periodMonth),
    [commitments, sessions, periodMonth]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          committed: a.committed + r.committedHours,
          delivered: a.delivered + r.deliveredHours,
          scheduled: a.scheduled + r.scheduledHours,
          gap: a.gap + Math.max(0, r.gapHours)
        }),
        { committed: 0, delivered: 0, scheduled: 0, gap: 0 }
      ),
    [rows]
  );

  function startEditMonth(r: CommitmentProgress) {
    setEditingMonth(r.brandId);
    setMonthHours(String(r.committedHours));
    setMonthGmv(r.committedGmv === undefined ? "" : String(r.committedGmv));
  }

  function saveMonth(brandId: string) {
    const hours = Number(monthHours);
    if (!Number.isFinite(hours) || hours < 0) {
      setError("Giờ cam kết phải là số không âm.");
      return;
    }
    const gmvRaw = monthGmv.trim();
    const gmv = gmvRaw === "" ? undefined : Number(gmvRaw);
    if (gmv !== undefined && (!Number.isFinite(gmv) || gmv < 0)) {
      setError("GMV cam kết phải là số không âm, hoặc để trống.");
      return;
    }
    run(async () => {
      await upsertMonthlyCommitment({ brandId, periodMonth, committedHours: hours, committedGmv: gmv });
      setEditingMonth(null);
      await reload();
      setNote("Đã lưu cam kết tháng — dòng này được đánh dấu sửa tay, sinh lại từ hợp đồng sẽ không ghi đè.");
    });
  }

  function saveContract() {
    if (!draft) return;
    const hours = Number(draft.monthlyHours);
    if (!draft.brandId) {
      setError("Chọn brand cho hợp đồng.");
      return;
    }
    if (!Number.isFinite(hours) || hours < 0) {
      setError("Giờ cam kết/tháng phải là số không âm.");
      return;
    }
    const gmvRaw = draft.monthlyGmv.trim();
    const gmv = gmvRaw === "" ? undefined : Number(gmvRaw);
    if (gmv !== undefined && (!Number.isFinite(gmv) || gmv < 0)) {
      setError("GMV cam kết/tháng phải là số không âm, hoặc để trống.");
      return;
    }
    if (draft.endMonth && draft.endMonth < draft.startMonth) {
      setError("Tháng kết thúc không được trước tháng bắt đầu.");
      return;
    }
    const payload = {
      contractCode: draft.contractCode,
      startMonth: draft.startMonth,
      endMonth: draft.endMonth || undefined,
      monthlyHours: hours,
      monthlyGmv: gmv,
      status: draft.status,
      note: draft.note
    };
    run(async () => {
      if (draft.id) await updateBrandContract(draft.id, payload);
      else await createBrandContract({ brandId: draft.brandId, ...payload });
      setDraft(null);
      await reload();
      setNote("Đã lưu hợp đồng. Bấm “Sinh cam kết theo tháng” để đổ số ra từng tháng.");
    });
  }

  function generate(c: BrandContract) {
    // Hợp đồng chưa có tháng kết thúc thì phải có mốc dừng, nếu không DB không biết sinh tới đâu.
    let through: string | undefined;
    if (!c.endMonth) {
      const answer = window.prompt(
        "Hợp đồng này chưa có tháng kết thúc. Sinh cam kết tới tháng nào? (định dạng YYYY-MM)",
        periodMonth.slice(0, 7)
      );
      if (!answer) return;
      if (!/^\d{4}-\d{2}$/.test(answer.trim())) {
        setError("Tháng phải theo định dạng YYYY-MM, ví dụ 2026-12.");
        return;
      }
      through = `${answer.trim()}-01`;
    }
    run(async () => {
      const r = await generateContractCommitments(c.id, through);
      await reload();
      const parts = [`thêm mới ${r.inserted}`, `cập nhật ${r.updated}`];
      if (r.skippedOverride > 0) parts.push(`bỏ qua ${r.skippedOverride} tháng đã sửa tay`);
      if (r.skippedOtherContract > 0) parts.push(`bỏ qua ${r.skippedOtherContract} tháng thuộc hợp đồng khác`);
      setNote(`Sinh cam kết xong: ${parts.join(", ")}.`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-[var(--text)]">Cam Kết Hợp Đồng</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1 max-w-3xl">
              Brand cam kết bao nhiêu giờ live mỗi tháng, và tới giờ đã giao được bao nhiêu. Đây là câu trả lời cho việc sắp lịch:
              còn thiếu bao nhiêu giờ phải xếp thêm, cho brand nào, trước khi hết tháng.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(["runrate", "contracts"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  view === v
                    ? "bg-[var(--accent)] text-[var(--accent-contrast,#04111f)]"
                    : "bg-[var(--surface-base)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {v === "runrate" ? "Run-rate theo tháng" : "Hợp đồng"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-rose-400 bg-rose-950/30 border border-rose-900 rounded-lg px-3 py-2">{error}</p>
        )}
        {note && (
          <p className="mt-3 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900 rounded-lg px-3 py-2">{note}</p>
        )}
      </div>

      {view === "runrate" ? (
        <>
          <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-black text-[var(--text)] flex items-center gap-1.5">
                <CalendarRange className="w-3.5 h-3.5" /> {monthLabel(periodMonth)}
              </h3>
              <select value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className={inputCls}>
                {monthOptions(today).map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { label: "Tổng cam kết", value: fmtHours(totals.committed), tone: "text-[var(--text)]" },
                { label: "Đã live", value: fmtHours(totals.delivered), tone: "text-emerald-400" },
                { label: "Đang xếp (chưa diễn ra)", value: fmtHours(totals.scheduled), tone: "text-sky-400" },
                { label: "Còn phải xếp thêm", value: fmtHours(totals.gap), tone: totals.gap > 0 ? "text-rose-400" : "text-emerald-400" }
              ].map((c) => (
                <div key={c.label} className="bg-[var(--surface-base)] rounded-xl p-3">
                  <p className="text-[10px] text-[var(--text-faint)]">{c.label}</p>
                  <p className={`text-base font-black mt-0.5 ${c.tone}`}>{c.value}</p>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-[var(--text-faint)] mt-3">
              Giờ ở đây là <strong className="text-[var(--text-muted)]">giờ ca theo lịch</strong> — cùng loại giờ mà P&amp;L dùng để tính
              tiền cho brand tính theo giờ. Giờ live thật (đọc từ file trợ live up) hiện ở cột riêng để đối chiếu, không trừ vào cam kết.
            </p>

            {missing.length > 0 && (
              <p className="text-[11px] text-amber-400 mt-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  {missing.length} brand có ca trong tháng này nhưng chưa đặt cam kết:{" "}
                  <strong>{missing.map((id) => brandNameById[id] ?? id).join(", ")}</strong>. Số của các brand đó không có mẫu số nào để so.
                </span>
              </p>
            )}
          </div>

          <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
            {rows.length === 0 ? (
              <p className="text-xs text-[var(--text-faint)]">
                Chưa có cam kết nào cho {monthLabel(periodMonth).toLowerCase()}. Tạo hợp đồng ở tab “Hợp đồng” rồi bấm “Sinh cam kết theo
                tháng”, hoặc nhập thẳng từng tháng sau khi đã có ít nhất một dòng.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[860px]">
                  <thead>
                    <tr className="text-[var(--text-faint)] text-left text-[11px]">
                      <th className="font-bold pb-2 pr-3">Brand</th>
                      <th className="font-bold pb-2 pr-3 text-right">Cam kết</th>
                      <th className="font-bold pb-2 pr-3 text-right">Đã live</th>
                      <th className="font-bold pb-2 pr-3 text-right">Đang xếp</th>
                      <th className="font-bold pb-2 pr-3 text-right">Tổng có</th>
                      <th className="font-bold pb-2 pr-3 text-right">Thiếu</th>
                      <th className="font-bold pb-2 pr-3 text-right">Giờ live</th>
                      <th className="font-bold pb-2 pr-3">Trạng thái</th>
                      <th className="font-bold pb-2 text-right">Sửa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const editing = editingMonth === r.brandId;
                      return (
                        <tr key={r.brandId} className="border-t border-[var(--border)]/60 align-middle">
                          <td className="py-2 pr-3 font-bold text-[var(--text)]">
                            {r.brandName}
                            {r.isOverride && (
                              <span className="ml-1.5 text-[9px] font-bold text-amber-400" title="Ops đã sửa tay tháng này — sinh lại từ hợp đồng sẽ không ghi đè">
                                SỬA TAY
                              </span>
                            )}
                          </td>
                          {editing ? (
                            <td className="py-2 pr-3" colSpan={6}>
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="text-[10px] text-[var(--text-faint)]">Giờ</label>
                                <input value={monthHours} onChange={(e) => setMonthHours(e.target.value)} className={`${inputCls} w-24`} />
                                <label className="text-[10px] text-[var(--text-faint)]">GMV (để trống nếu không cam kết)</label>
                                <input value={monthGmv} onChange={(e) => setMonthGmv(e.target.value)} className={`${inputCls} w-40`} />
                                <button
                                  onClick={() => saveMonth(r.brandId)}
                                  disabled={busy}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50"
                                >
                                  Lưu
                                </button>
                                <button
                                  onClick={() => setEditingMonth(null)}
                                  className="px-2.5 py-1.5 rounded-lg bg-[var(--surface-base)] text-[var(--text-muted)] text-[11px] font-bold"
                                >
                                  Huỷ
                                </button>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="py-2 pr-3 text-right font-bold text-[var(--text)]">{fmtHours(r.committedHours)}</td>
                              <td className="py-2 pr-3 text-right text-emerald-400">
                                {fmtHours(r.deliveredHours)}
                                <span className="text-[var(--text-faint)] text-[10px]"> · {r.deliveredSessions} ca</span>
                              </td>
                              <td className="py-2 pr-3 text-right text-sky-400">
                                {fmtHours(r.scheduledHours)}
                                <span className="text-[var(--text-faint)] text-[10px]"> · {r.scheduledSessions} ca</span>
                              </td>
                              <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{fmtHours(r.plannedTotalHours)}</td>
                              <td className={`py-2 pr-3 text-right font-bold ${r.gapHours > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                {r.gapHours > 0 ? fmtHours(r.gapHours) : "—"}
                              </td>
                              <td className="py-2 pr-3 text-right text-[var(--text-muted)]">
                                {r.sessionsWithRealHours > 0 ? (
                                  <span title={`${r.sessionsWithRealHours}/${r.deliveredSessions} ca đã có file snapshot`}>
                                    {fmtHours(r.actualLiveHours)}
                                    <span className="text-[var(--text-faint)] text-[10px]">
                                      {" "}· {r.sessionsWithRealHours}/{r.deliveredSessions}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-faint)]" title="Chưa ca nào của brand này có file snapshot trong tháng">
                                    chưa có
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                          <td className="py-2 pr-3">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${STATUS_TONE[r.status]}`}>
                              {STATUS_LABEL[r.status]}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {!editing && (
                              <button
                                onClick={() => startEditMonth(r)}
                                className="p-1.5 rounded-lg hover:bg-[var(--surface-base)] text-[var(--text-faint)] hover:text-[var(--text)]"
                                title="Sửa cam kết tháng này"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {rows.some((r) => r.committedGmv !== undefined) && (
              <div className="mt-4 pt-3 border-t border-[var(--border)]/60">
                <h4 className="text-[11px] font-black text-[var(--text)]">Cam kết GMV</h4>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {rows
                    .filter((r) => r.committedGmv !== undefined)
                    .map((r) => (
                      <div key={r.brandId} className="bg-[var(--surface-base)] rounded-xl p-2.5">
                        <p className="text-[10px] text-[var(--text-faint)]">{r.brandName}</p>
                        <p className="text-xs font-bold text-[var(--text)] mt-0.5">
                          {fmtVnd(r.deliveredGmv)} / {fmtVnd(r.committedGmv ?? 0)}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${(r.gmvGap ?? 0) > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                          {(r.gmvGap ?? 0) > 0 ? `còn thiếu ${fmtVnd(r.gmvGap ?? 0)}` : "đã đạt"}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-black text-[var(--text)] flex items-center gap-1.5">
              <FileSignature className="w-3.5 h-3.5" /> Hợp đồng đã ký ({contracts.length})
            </h3>
            <button
              onClick={() => setDraft(emptyDraft(brands[0]?.id ?? "", today))}
              disabled={brands.length === 0}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast,#04111f)] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm hợp đồng
            </button>
          </div>

          {draft && (
            <div className="mt-3 bg-[var(--surface-base)] rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--text-faint)]">Brand</span>
                  <select
                    value={draft.brandId}
                    disabled={!!draft.id}
                    onChange={(e) => setDraft({ ...draft, brandId: e.target.value })}
                    className={`${inputCls} disabled:opacity-60`}
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--text-faint)]">Mã hợp đồng</span>
                  <input value={draft.contractCode} onChange={(e) => setDraft({ ...draft, contractCode: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--text-faint)]">Từ tháng</span>
                  <input
                    type="month"
                    value={draft.startMonth.slice(0, 7)}
                    onChange={(e) => setDraft({ ...draft, startMonth: `${e.target.value}-01` })}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--text-faint)]">Đến tháng (trống = chưa chốt)</span>
                  <input
                    type="month"
                    value={draft.endMonth ? draft.endMonth.slice(0, 7) : ""}
                    onChange={(e) => setDraft({ ...draft, endMonth: e.target.value ? `${e.target.value}-01` : "" })}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--text-faint)]">Giờ cam kết / tháng</span>
                  <input value={draft.monthlyHours} onChange={(e) => setDraft({ ...draft, monthlyHours: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--text-faint)]">GMV cam kết / tháng (tuỳ chọn)</span>
                  <input value={draft.monthlyGmv} onChange={(e) => setDraft({ ...draft, monthlyGmv: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--text-faint)]">Trạng thái</span>
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value as BrandContract["status"] })}
                    className={inputCls}
                  >
                    <option value="draft">Nháp</option>
                    <option value="active">Đang hiệu lực</option>
                    <option value="ended">Đã kết thúc</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--text-faint)]">Ghi chú</span>
                  <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={inputCls} />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveContract}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  {draft.id ? "Lưu thay đổi" : "Tạo hợp đồng"}
                </button>
                <button
                  onClick={() => setDraft(null)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--surface-card)] text-[var(--text-muted)] text-xs font-bold"
                >
                  Huỷ
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {contracts.length === 0 && !draft && (
              <p className="text-xs text-[var(--text-faint)]">
                Chưa có hợp đồng nào. Nhập sớm chừng nào tốt chừng đó — dữ liệu hiệu suất thì đã có sẵn lịch sử, còn cam kết hợp đồng mà
                tới lúc cần mới bắt đầu nhập thì phải chờ thêm vài tháng mới đủ để so run-rate.
              </p>
            )}
            {contracts.map((c) => (
              <div key={c.id} className="bg-[var(--surface-base)] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text)]">
                    {brandNameById[c.brandId] ?? "Brand đã xoá"}
                    {c.contractCode && <span className="text-[var(--text-faint)] font-normal"> · {c.contractCode}</span>}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {monthLabel(c.startMonth)} → {c.endMonth ? monthLabel(c.endMonth) : "chưa chốt"} · {fmtHours(c.monthlyHours)}/tháng
                    {c.monthlyGmv !== undefined && ` · ${fmtVnd(c.monthlyGmv)} GMV/tháng`}
                    {" · "}
                    {c.status === "active" ? "đang hiệu lực" : c.status === "draft" ? "nháp" : "đã kết thúc"}
                  </p>
                  {c.note && <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{c.note}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => generate(c)}
                    disabled={busy}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--surface-card)] border border-[var(--border)] text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1.5 disabled:opacity-50"
                    title="Đổ giờ cam kết của hợp đồng ra từng tháng. Tháng nào ops đã sửa tay sẽ được giữ nguyên."
                  >
                    <RefreshCw className="w-3 h-3" /> Sinh cam kết theo tháng
                  </button>
                  <button
                    onClick={() =>
                      setDraft({
                        id: c.id,
                        brandId: c.brandId,
                        contractCode: c.contractCode ?? "",
                        startMonth: c.startMonth,
                        endMonth: c.endMonth ?? "",
                        monthlyHours: String(c.monthlyHours),
                        monthlyGmv: c.monthlyGmv === undefined ? "" : String(c.monthlyGmv),
                        status: c.status,
                        note: c.note ?? ""
                      })
                    }
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-card)] text-[var(--text-faint)] hover:text-[var(--text)]"
                    title="Sửa hợp đồng"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !(await confirm(
                          `Xoá hợp đồng của ${brandNameById[c.brandId] ?? "brand này"}?\n\nCác dòng cam kết theo tháng đã sinh ra sẽ ĐƯỢC GIỮ LẠI (lịch sử cam kết không bị viết lại), chỉ mất liên kết tới hợp đồng.`,
                          { danger: true }
                        ))
                      )
                        return;
                      run(async () => {
                        await deleteBrandContract(c.id);
                        await reload();
                        setNote("Đã xoá hợp đồng. Cam kết các tháng vẫn còn nguyên.");
                      });
                    }}
                    className="p-1.5 rounded-lg hover:bg-rose-950/40 text-[var(--text-faint)] hover:text-rose-400"
                    title="Xoá hợp đồng"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {commitments.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--border)]/60">
              <h4 className="text-[11px] font-black text-[var(--text)]">
                Cam kết đã sinh ({commitments.length} dòng tháng)
              </h4>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs min-w-[520px]">
                  <thead>
                    <tr className="text-[var(--text-faint)] text-left text-[11px]">
                      <th className="font-bold pb-2 pr-3">Brand</th>
                      <th className="font-bold pb-2 pr-3">Tháng</th>
                      <th className="font-bold pb-2 pr-3 text-right">Giờ</th>
                      <th className="font-bold pb-2 pr-3 text-right">GMV</th>
                      <th className="font-bold pb-2 pr-3">Nguồn</th>
                      <th className="font-bold pb-2 text-right">Xoá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commitments.map((m) => (
                      <tr key={m.id} className="border-t border-[var(--border)]/60">
                        <td className="py-1.5 pr-3 text-[var(--text)]">{brandNameById[m.brandId] ?? "Brand đã xoá"}</td>
                        <td className="py-1.5 pr-3 text-[var(--text-muted)]">{monthLabel(m.periodMonth)}</td>
                        <td className="py-1.5 pr-3 text-right text-[var(--text)]">{fmtHours(m.committedHours)}</td>
                        <td className="py-1.5 pr-3 text-right text-[var(--text-muted)]">
                          {m.committedGmv === undefined ? "—" : fmtVnd(m.committedGmv)}
                        </td>
                        <td className="py-1.5 pr-3 text-[10px]">
                          {m.isOverride ? (
                            <span className="text-amber-400 font-bold">sửa tay</span>
                          ) : m.contractId ? (
                            <span className="text-[var(--text-faint)]">từ hợp đồng</span>
                          ) : (
                            <span className="text-[var(--text-faint)]">hợp đồng đã xoá</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right">
                          <button
                            onClick={async () => {
                              if (!(await confirm(`Xoá cam kết ${monthLabel(m.periodMonth).toLowerCase()} của brand này?`, { danger: true }))) return;
                              run(async () => {
                                await deleteMonthlyCommitment(m.id);
                                await reload();
                                setNote("Đã xoá cam kết tháng.");
                              });
                            }}
                            className="p-1 rounded hover:bg-rose-950/40 text-[var(--text-faint)] hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
