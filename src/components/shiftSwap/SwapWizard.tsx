import React, { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { LiveSession, Talent } from "../../types";
import { SessionActionsContext } from "../../lib/sessionActionsContext";
import { clockAtOffset, effectiveSegments, sessionMinutes } from "../../lib/staffSegments";
import { partLabel, passReceivers, swapPeople, swapWith, talentNameOf, type SwapCandidate, type SwapPart } from "../../lib/shiftSwap/swap";
import { SwapSendBox } from "./SwapSummary";
import { SwapMonthStrip } from "./SwapMonthStrip";

// Trình hướng dẫn nhường / đổi ca — MỘT quyết định mỗi bước, hệ thống lọc trước nên bước nào cũng ngắn (đo tháng 11: sau khi chọn người,
// trung vị 6 ca đổi được). Bước: 1 loại + đoạn giờ → 2 với ai → 3 (chỉ khi đổi) ngày/ca → 4 thẻ Trước → Sau + Gửi.
// Không có danh sách phẳng "mọi người × mọi ca" — đó là thứ làm màn cũ thành "một rừng ca".

const pillOn = "min-h-8 px-3 rounded-full border text-xs seg-on";
const pillOff = "min-h-8 px-3 rounded-full border text-xs border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]";
const STEP = 30;
const SUGGEST = 4;

type Mode = "pass" | "swap";
type Step = 1 | 2 | 3 | 4;

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dayLabel = (date: string) => `${WD[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${date.slice(8, 10)}/${date.slice(5, 7)}`;

interface PersonRow {
  talentId: string;
  /** Có thể chọn ngay (nhận cả đoạn / có ca đổi). */
  ok: boolean;
  note: string;
  hint?: { fromMin: number; toMin: number };
}

export const SwapWizard: React.FC<{ session: LiveSession; allSessions: LiveSession[]; myTalentId: string; talents: readonly Talent[]; onClose: () => void }> = ({ session: s, allSessions, myTalentId, talents, onClose }) => {
  const swap = React.useContext(SessionActionsContext).swap;
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>("pass");
  const [segIdx, setSegIdx] = useState(0);
  const [whole, setWhole] = useState(true);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [person, setPerson] = useState<string | null>(null);
  const [partOverride, setPartOverride] = useState<SwapPart | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [take, setTake] = useState<SwapPart | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const nameOf = useMemo(() => talentNameOf(talents), [talents]);
  const opts = useMemo(() => ({ nowMs, nameOf }), [nowMs, nameOf]);

  const mine = useMemo(() => {
    const segs = effectiveSegments(s).filter((g) => g.talentId === myTalentId).sort((a, b) => a.fromMin - b.fromMin);
    const merged: { fromMin: number; toMin: number }[] = [];
    for (const g of segs) {
      const last = merged[merged.length - 1];
      if (last && last.toMin === g.fromMin) last.toMin = g.toMin;
      else merged.push({ fromMin: g.fromMin, toMin: g.toMin });
    }
    return merged;
  }, [s, myTalentId]);
  const seg = mine[Math.min(segIdx, mine.length - 1)];
  const clock = (m: number) => clockAtOffset(s, m);
  const byId = useMemo(() => new Map(allSessions.map((x) => [x.id, x])), [allSessions]);

  const basePart: SwapPart | null = seg ? (whole ? { sessionId: s.id, fromMin: seg.fromMin, toMin: seg.toMin } : { sessionId: s.id, fromMin: from, toMin: to }) : null;
  const partValid = !!seg && !!basePart && basePart.toMin > basePart.fromMin && basePart.fromMin >= seg.fromMin && basePart.toMin <= seg.toMin;
  const give: SwapPart | null = partOverride ?? (partValid ? basePart : null);

  // ── Bước 2: danh sách người — chỉ tính khi tới bước này (đổi: ~35 ms/người tháng 11 sau tối ưu; xem đo trong WORKSPACE_DESIGN).
  const people = useMemo<PersonRow[]>(() => {
    if (step < 2 || !give || !partValid) return [];
    if (mode === "pass") {
      return passReceivers(allSessions, myTalentId, give, talents, opts).map((r) => ({
        talentId: r.talentId,
        ok: r.ok,
        note: r.ok ? "rảnh khung này" : r.hint ? `chỉ nhận được ${clock(r.hint.fromMin)}–${clock(r.hint.toMin)}` : (r.why ?? "không nhận được").replace(/^.*? trùng/, "trùng").replace(/\.$/, ""),
        hint: r.hint
      }));
    }
    const counts = new Map(swapPeople(allSessions, myTalentId, give, talents, opts).map((p) => [p.talentId, p.count]));
    return talents
      .filter((t) => t.id !== myTalentId)
      .map((t) => ({ talentId: t.id, ok: (counts.get(t.id) ?? 0) > 0, note: counts.get(t.id) ? `${counts.get(t.id)} ca đổi được` : "không có ca nào đổi được" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode, give?.sessionId, give?.fromMin, give?.toMin, allSessions, myTalentId, talents, opts, partValid]);

  const sortedOk = useMemo(() => {
    const ok = people.filter((p) => p.ok);
    if (mode === "swap") return ok.sort((a, b) => parseInt(b.note) - parseInt(a.note));
    return ok.sort((a, b) => nameOf(a.talentId).localeCompare(nameOf(b.talentId), "vi"));
  }, [people, mode, nameOf]);
  const hinted = people.filter((p) => !p.ok && p.hint);

  // ── Bước 3: ca đổi được với người đã chọn.
  const candidates = useMemo<SwapCandidate[]>(() => (step >= 3 && mode === "swap" && person && give ? swapWith(allSessions, myTalentId, give, person, opts) : []), [step, mode, person, give, allSessions, myTalentId, opts]);
  const stripDays = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) {
      const d = byId.get(c.take.sessionId)?.date;
      if (d) m.set(d, (m.get(d) ?? 0) + 1);
    }
    return [...m.entries()].map(([date, count]) => ({ date, count }));
  }, [candidates, byId]);
  const busyDates = useMemo(() => new Set(allSessions.filter((x) => x.status !== "Cancelled" && effectiveSegments(x).some((g) => g.talentId === myTalentId)).map((x) => x.date)), [allSessions, myTalentId]);
  const dayCands = day ? candidates.filter((c) => byId.get(c.take.sessionId)?.date === day) : [];

  if (!swap || !seg) return null;

  const reset = (to: Step) => {
    if (to <= 2) {
      setDay(null);
      setTake(null);
    }
    if (to <= 1) {
      setPerson(null);
      setPartOverride(null);
    }
    setStep(to);
  };
  const pickRange = () => {
    if (!partValid) return;
    setPerson(null);
    setPartOverride(null);
    setDay(null);
    setTake(null);
    setStep(2);
  };
  const choosePerson = (p: PersonRow, useHint?: boolean) => {
    setPerson(p.talentId);
    if (useHint && p.hint) setPartOverride({ sessionId: s.id, fromMin: p.hint.fromMin, toMin: p.hint.toMin });
    setStep(mode === "swap" ? 3 : 4);
  };

  const req = person && give ? ({ kind: mode, fromTalent: myTalentId, toTalent: person, give, take: mode === "swap" ? (take ?? undefined) : undefined } as const) : null;
  const ready = !!req && (mode === "pass" || !!take);
  const send = async () => {
    if (!req || !ready) return;
    setSending(true);
    const ok = await swap.create({ kind: req.kind, give: req.give, toTalent: req.toTalent, take: req.take, reason: reason.trim() });
    setSending(false);
    if (ok) onClose();
  };

  // Tóm tắt các bước đã qua — bấm để quay lại đúng bước đó.
  const crumbs: { at: Step; text: string }[] = [];
  if (step > 1 && give) crumbs.push({ at: 1, text: `${mode === "pass" ? "Nhường" : "Đổi"} ${clock(give.fromMin)}–${clock(give.toMin)}` });
  if (step > 2 && person) crumbs.push({ at: 2, text: nameOf(person) });
  if (step > 3 && take) {
    const y = byId.get(take.sessionId);
    crumbs.push({ at: 3, text: y ? `${dayLabel(y.date)} ${clockAtOffset(y, take.fromMin)}` : "ca khác" });
  }

  const q = query.trim().toLowerCase();
  const matches = q ? people.filter((p) => nameOf(p.talentId).toLowerCase().includes(q) || (talents.find((t) => t.id === p.talentId)?.name ?? "").toLowerCase().includes(q)) : [];
  const shown = q ? matches : showAll ? [...sortedOk, ...hinted] : sortedOk.slice(0, SUGGEST);
  const hiddenCount = sortedOk.length + hinted.length - (q || showAll ? 0 : Math.min(SUGGEST, sortedOk.length));

  const durOptions: number[] = [];
  for (let m = seg.fromMin; m <= seg.toMin; m += STEP) durOptions.push(m);
  if (durOptions[durOptions.length - 1] !== seg.toMin) durOptions.push(seg.toMin);

  return (
    <div className="pt-3 border-t border-[var(--border)]">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 space-y-3">
        {crumbs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-2xs">
            {crumbs.map((c, i) => (
              <React.Fragment key={c.at}>
                {i > 0 && <ChevronRight className="w-3 h-3 text-[var(--text-faint)]" />}
                <button type="button" onClick={() => reset(c.at)} className="px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)]">{c.text}</button>
              </React.Fragment>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode("pass")} className={mode === "pass" ? pillOn : pillOff}>Nhường ca</button>
              <button type="button" onClick={() => setMode("swap")} className={mode === "swap" ? pillOn : pillOff}>Đổi lấy ca khác</button>
            </div>
            <p className="text-2xs text-[var(--text-muted)]">{mode === "pass" ? "Nhường một chiều — bạn bỏ ca/đoạn này, người kia nhận." : "Đổi hai chiều — bạn đưa ca/đoạn này, nhận lại ca/đoạn của người kia (có thể ở ngày khác)."}</p>
            {mine.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {mine.map((g, i) => (
                  <button key={i} type="button" onClick={() => { setSegIdx(i); setWhole(true); setFrom(g.fromMin); setTo(g.toMin); }} className={i === segIdx ? pillOn : pillOff}>
                    Phần {clock(g.fromMin)}–{clock(g.toMin)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setWhole(true)} className={whole ? pillOn : pillOff}>{mine.length > 1 || seg.toMin - seg.fromMin < sessionMinutes(s) ? "Cả phần này" : "Cả ca"} · {clock(seg.fromMin)}–{clock(seg.toMin)}</button>
              <button type="button" onClick={() => { setWhole(false); setFrom(seg.fromMin); setTo(seg.toMin); }} className={!whole ? pillOn : pillOff}>Một đoạn</button>
              {!whole && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  từ
                  <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1.5 text-[var(--text)] text-xs min-h-8">
                    {durOptions.filter((m) => m < seg.toMin).map((m) => <option key={m} value={m}>{clock(m)}</option>)}
                  </select>
                  đến
                  <select value={to} onChange={(e) => setTo(Number(e.target.value))} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1.5 text-[var(--text)] text-xs min-h-8">
                    {durOptions.filter((m) => m > from).map((m) => <option key={m} value={m}>{clock(m)}</option>)}
                  </select>
                </span>
              )}
            </div>
            {!partValid && <p className="text-xs text-red-300">Giờ đến phải sau giờ từ.</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-[var(--surface)] text-[var(--text-muted)] font-bold text-2xs">Thôi</button>
              <button type="button" onClick={pickRange} disabled={!partValid} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-2xs">Tiếp: chọn người</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-[var(--text)]">{mode === "pass" ? "Nhường cho ai?" : "Đổi với ai?"}</p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Gõ tên để tìm" className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-2 pl-8 pr-2 text-[var(--text)] text-xs" />
            </div>
            {shown.length === 0 ? (
              <p className="text-xs text-amber-300">{q ? "Không thấy ai tên như vậy." : mode === "pass" ? "Chưa ai nhận được trọn đoạn này mà không bị chồng giờ. Thử nhường ngắn hơn hoặc chọn đổi ca." : "Chưa ai có ca đổi được mà không chồng giờ. Thử nhường một đoạn thay vì đổi."}</p>
            ) : (
              <div className="space-y-1">
                {shown.map((p) => (
                  <button key={p.talentId} type="button" disabled={!p.ok && !(p.hint && mode === "pass")} onClick={() => choosePerson(p, !p.ok)} className="w-full flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left hover:bg-[var(--surface-hover)] disabled:opacity-50 disabled:hover:bg-[var(--surface)]">
                    <span className="text-xs font-bold text-[var(--text)]">{nameOf(p.talentId)}</span>
                    <span className={`text-2xs ${p.ok ? "text-emerald-300" : p.hint ? "text-amber-300" : "text-[var(--text-faint)]"}`}>{p.note}{p.hint && mode === "pass" ? " →" : ""}</span>
                  </button>
                ))}
              </div>
            )}
            {!q && !showAll && hiddenCount > 0 && (
              <button type="button" onClick={() => setShowAll(true)} className="text-2xs font-bold text-sky-300 hover:text-sky-200 underline">Xem hết {sortedOk.length + hinted.length} người</button>
            )}
            <div className="flex justify-start">
              <button type="button" onClick={() => reset(1)} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline">‹ Quay lại</button>
            </div>
          </div>
        )}

        {step === 3 && person && (
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-[var(--text)]">Lấy ca nào của {nameOf(person)}?</p>
            {candidates.length === 0 ? (
              <p className="text-xs text-amber-300">Không còn ca nào của {nameOf(person)} đổi được.</p>
            ) : (
              <>
                <SwapMonthStrip days={stripDays} anchorDate={s.date} busyDates={busyDates} selected={day} onSelect={(d) => { setDay(d); setTake(null); }} />
                {day && (
                  <div className="space-y-1">
                    <p className="text-2xs text-[var(--text-muted)]">{dayLabel(day)} — {dayCands.length} ca đổi được</p>
                    {dayCands.map((c) => {
                      const y = byId.get(c.take.sessionId)!;
                      return (
                        <button key={`${c.take.sessionId}:${c.take.fromMin}`} type="button" onClick={() => { setTake(c.take); setStep(4); }} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]">
                          {partLabel(y, c.take).replace(/ \d\d\/\d\d /, " ")}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            <button type="button" onClick={() => reset(2)} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline">‹ Chọn người khác</button>
          </div>
        )}

        {step === 4 && req && ready && (
          <div className="space-y-2.5">
            <SwapSendBox req={req} sessions={allSessions} nameOf={nameOf} sending={sending} reason={reason} onReason={setReason} onSend={() => void send()} />
            <button type="button" onClick={() => reset(mode === "swap" ? 3 : 2)} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline">‹ Sửa lựa chọn</button>
          </div>
        )}
      </div>
    </div>
  );
};
