import React, { useMemo, useState } from "react";
import type { Talent } from "../../types";
import { InfoDot } from "../common/InfoDot";
import type { MonthCommitments } from "../../hooks/useMonthCommitments";
import { parseCommitmentSheet, type ParsedCommitment } from "../../lib/roster/commitmentSheet";
import type { AutoCap } from "../../lib/roster/autoCaps";

// Giờ cam kết theo tháng = TRẦN giờ của người (Điều Phối → So sánh 3 mục tiêu). Chỉ nhập cho người rate cao / chiến lược của Trainer;
// không có dòng = giới hạn mặc định theo vai. Xếp ngày 1–15 thì người có trần chỉ nhận tới trần × tỷ lệ giờ nửa đầu (+ dung sai ở AI Training).

const numInput = "rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 tabular-nums";

const CapRow: React.FC<{ name: string; maxHours: number; firstHalfMax?: number; note?: string; onCommit: (maxHours: number, firstHalfMax: number | undefined) => void; onRemove: () => void }> = ({ name, maxHours, firstHalfMax, note, onCommit, onRemove }) => {
  const [max, setMax] = useState(String(maxHours));
  const [half, setHalf] = useState(firstHalfMax === undefined ? "" : String(firstHalfMax));
  const commit = () => {
    const m = Number(max);
    const h = half.trim() === "" ? undefined : Number(half);
    if (!(m > 0) || (h !== undefined && !(h >= 0))) return;
    if (m !== maxHours || h !== firstHalfMax) onCommit(m, h);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-36 truncate font-bold text-[var(--text)]" title={note || undefined}>
        {name}
      </span>
      <span className="text-[var(--text-muted)]">tối đa/tháng</span>
      <input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} className={`w-14 ${numInput}`} aria-label={`${name} trần giờ tháng`} />
      <span className="text-[var(--text-muted)]">nửa đầu</span>
      <input type="number" min={0} placeholder="tự tính" value={half} onChange={(e) => setHalf(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} className={`w-16 ${numInput}`} aria-label={`${name} trần giờ nửa đầu`} />
      {note && <span className="text-2xs text-[var(--text-faint)]">{note}</span>}
      <button type="button" onClick={onRemove} className="min-h-6 rounded px-1.5 text-[var(--text-faint)] hover:text-[var(--text)]">
        Bỏ
      </button>
    </div>
  );
};

interface PasteRow extends ParsedCommitment {
  pick: string | null;
  on: boolean;
}

export const CommitmentsEditor: React.FC<{ month: string; talents: readonly Talent[]; nameOf: (id: string) => string; commitments: MonthCommitments; autoCaps: Readonly<Record<string, AutoCap>> }> = ({ month, talents, nameOf, commitments, autoCaps }) => {
  const { rows, backend, error, save, remove } = commitments;
  const [pick, setPick] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PasteRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const have = useMemo(() => new Set(rows.map((r) => r.talentId)), [rows]);
  const people = useMemo(() => talents.filter((t) => (t.role === "Host" || t.role === "Assistant") && !have.has(t.id)).sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id), "vi")), [talents, have, nameOf]);
  const sorted = useMemo(() => [...rows].sort((a, b) => nameOf(a.talentId).localeCompare(nameOf(b.talentId), "vi")), [rows, nameOf]);

  const read = () => {
    const r = parseCommitmentSheet(text, talents);
    setPreview(r.rows.map((x) => ({ ...x, pick: x.talentId ?? null, on: x.status === "matched" && !x.duplicate })));
  };
  const importable = (preview ?? []).filter((r) => r.on && r.pick);
  const doImport = async () => {
    setBusy(true);
    const byId = new Map<string, PasteRow>();
    for (const r of importable) if (!byId.has(r.pick!)) byId.set(r.pick!, r);
    await save([...byId.values()].map((r) => ({ talentId: r.pick!, maxHours: r.hours, note: r.note, firstHalfMax: rows.find((x) => x.talentId === r.pick)?.firstHalfMax })));
    setBusy(false);
    setPreview(null);
    setText("");
    setPasteOpen(false);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2 text-xs space-y-1.5" data-testid="commitments">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-[var(--text)]">Ngoại lệ giờ cam kết {month.slice(5)}/{month.slice(0, 4)}</span>
        <InfoDot label="Ngoại lệ giờ cam kết">Không cần nhập cho từng người: ai cũng có trần tự suy từ giờ trung bình 3 tháng đã qua (tỷ lệ dư chỉnh ở AI Training). Chỉ nhập ở đây cho người rate cao hoặc theo chiến lược riêng. Xếp ngày 1–15 thì mỗi người chỉ nhận tới trần × tỷ lệ giờ của nửa đầu; ô “nửa đầu” ghi đè nếu muốn chốt số.</InfoDot>
        <span className="text-2xs text-[var(--text-muted)]">{Object.keys(autoCaps).length} người đã có trần tự suy</span>
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Chọn người đặt trần" className={numInput}>
          <option value="">Thêm người…</option>
          {people.map((t) => (
            <option key={t.id} value={t.id}>
              {nameOf(t.id)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pick}
          onClick={() => {
            void save([{ talentId: pick, maxHours: 40 }]);
            setPick("");
          }}
          className="min-h-6 rounded-md border border-[var(--border)] px-2 font-bold text-[var(--text)] disabled:opacity-40"
        >
          Thêm
        </button>
        <button type="button" onClick={() => setPasteOpen((v) => !v)} aria-pressed={pasteOpen} className={`min-h-6 rounded-md border px-2 font-bold ${pasteOpen ? "seg-on" : "border-[var(--border)] text-[var(--text)]"}`}>
          Dán từ sheet
        </button>
        {backend === "local" && <span className="text-2xs text-amber-300">Chưa lưu chung (cần chạy 0223)</span>}
        {rows.length === 0 && backend !== "loading" && <span className="text-[var(--text-faint)]">Chưa có ngoại lệ.</span>}
      </div>
      {error && <p className="text-2xs text-rose-300">{error}</p>}

      {pasteOpen && (
        <div className="space-y-1.5 rounded-lg border border-[var(--border)] p-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Dán dòng tên host + giờ cam kết từ sheet" aria-label="Dán giờ cam kết từ sheet" className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1" />
          <div className="flex items-center gap-2">
            <button type="button" disabled={!text.trim()} onClick={read} className="min-h-6 rounded-md border border-[var(--border)] px-2 font-bold text-[var(--text)] disabled:opacity-40">
              Đọc
            </button>
            {preview && (
              <span className="text-2xs text-[var(--text-muted)]">
                {preview.length} dòng · {importable.length} sẽ nhập · {preview.filter((r) => r.status === "unmatched").length} không khớp tên
              </span>
            )}
          </div>
          {preview && preview.length > 0 && (
            <>
              <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border)]">
                {preview.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 py-1">
                    <input type="checkbox" checked={r.on} disabled={!r.pick} onChange={(e) => setPreview((p) => p!.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label={`Nhập ${r.nameRaw}`} className="w-5 h-5 accent-[var(--accent)]" />
                    <span className="w-40 truncate text-[var(--text)]" title={r.nameRaw}>
                      {r.nameRaw}
                    </span>
                    <b className="tabular-nums text-[var(--text)]">{r.hours}h</b>
                    {r.note && <span className="text-2xs text-[var(--text-faint)]">{r.note}</span>}
                    {r.status === "matched" && <span className="text-2xs text-emerald-400">→ {nameOf(r.pick!)}{r.duplicate ? " · trùng dòng trước" : ""}</span>}
                    {r.status === "ambiguous" && (
                      <select value={r.pick ?? ""} onChange={(e) => setPreview((p) => p!.map((x, j) => (j === i ? { ...x, pick: e.target.value || null, on: !!e.target.value } : x)))} aria-label={`Chọn người cho ${r.nameRaw}`} className={numInput}>
                        <option value="">Trùng tên — chọn người…</option>
                        {r.candidates.map((id) => (
                          <option key={id} value={id}>
                            {nameOf(id)}
                          </option>
                        ))}
                      </select>
                    )}
                    {r.status === "unmatched" && <span className="text-2xs text-amber-300">không khớp ai</span>}
                  </div>
                ))}
              </div>
              <button type="button" disabled={busy || importable.length === 0} onClick={() => void doImport()} className="min-h-6 rounded-md bg-[var(--accent)] px-3 font-bold text-white disabled:opacity-40">
                {busy ? "Đang nhập…" : `Nhập ${importable.length} người`}
              </button>
            </>
          )}
        </div>
      )}

      {sorted.map((r) => (
        <CapRow
          key={`${month}|${r.talentId}|${r.maxHours}|${r.firstHalfMax ?? ""}`}
          name={nameOf(r.talentId)}
          maxHours={r.maxHours}
          firstHalfMax={r.firstHalfMax}
          note={r.note}
          onCommit={(maxHours, firstHalfMax) => void save([{ talentId: r.talentId, maxHours, firstHalfMax, note: r.note }])}
          onRemove={() => void remove(r.talentId)}
        />
      ))}
      {Object.keys(autoCaps).length > 0 && (
        <details className="pt-1">
          <summary className="cursor-pointer text-2xs text-[var(--text-muted)]">Xem trần tự suy của từng người</summary>
          <div className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2 text-2xs text-[var(--text-muted)]">
            {Object.entries(autoCaps)
              .sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0]), "vi"))
              .map(([id, c]) => (
                <span key={id} className={id in Object.fromEntries(rows.map((r) => [r.talentId, 1])) ? "text-[var(--text-faint)] line-through" : ""}>
                  <b className="text-[var(--text)]">{nameOf(id)}</b>: TB {Math.round(c.avg)}h ({c.months} tháng) → trần {c.monthMax}h
                </span>
              ))}
          </div>
        </details>
      )}
    </div>
  );
};
