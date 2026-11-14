import React, { useMemo, useState } from "react";
import { Brand, BrandChannel, BrandStudio, LiveSession, ShiftSlot, Studio } from "../../types";
import { platformsOfBrand } from "../../lib/channels";
import { platformOf, type ReportPlatform } from "../../lib/reportPlatform";
import { AlertTriangle, CalendarClock, X } from "lucide-react";
import { dateTimeRangesOverlap, getTodayDate } from "../../lib/dateUtils";
import { fmtDateVn } from "../../lib/format";
import { findBrandStudioId } from "../../lib/db/brandStudios";
import { loadRememberedBrandId, pickDefaultBrandId, rememberBrandId } from "../../lib/defaultBrand";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { BrandLogo } from "../ui/BrandLogo";

// Q2 (audit 2026-09-21): con đường DUY NHẤT tạo ca ngoài Kế Hoạch Tháng là "mở ca chờ đăng ký" —
// ca đi vào Đăng Ký & Chốt Lịch như mọi ca khác (talent đăng ký, ops chốt host, target từ kế hoạch
// nếu có). Thay cho "Tạo Session Trực Tiếp" cũ (host/target/checklist/handle bịa + Gemini mock).
// Dùng chung cho Lịch & Studio (chọn brand) và Lịch Vận Hành của brand (brand cố định).
interface OpenSlotModalProps {
  brands?: Brand[];
  fixedBrand?: { id: string; name: string }; // brand workspace: không cho đổi brand
  /** Kênh brand × sàn (0149): ca mở thuộc một kênh đang chạy — trước 07/10 form ghi cứng TikTok. */
  channels: BrandChannel[];
  /** Brand workspace: sàn của workspace, chọn sẵn. */
  initialPlatform?: ReportPlatform;
  studios: Studio[];
  brandStudios: BrandStudio[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  initialDate: string;
  initialStudioId?: string;
  initialStart?: string;
  initialEnd?: string;
  currentUserId?: string;
  onClose: () => void;
  onCreateSlot: (slot: ShiftSlot) => Promise<boolean>;
}

const addHours = (hhmm: string, h: number) => {
  const [hh, mm] = hhmm.split(":").map(Number);
  const total = (hh * 60 + mm + h * 60) % (24 * 60);
  return `${`${Math.floor(total / 60)}`.padStart(2, "0")}:${`${total % 60}`.padStart(2, "0")}`;
};

export const OpenSlotModal: React.FC<OpenSlotModalProps> = ({
  brands = [],
  fixedBrand,
  channels,
  initialPlatform,
  studios,
  brandStudios,
  sessions,
  shiftSlots,
  initialDate,
  initialStudioId,
  initialStart,
  initialEnd,
  currentUserId,
  onClose,
  onCreateSlot
}) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  // Modal mở khi sessions đã nạp xong nên tính 1 lần lúc mount là đủ (không cần useDefaultBrand).
  const [brandId, setBrandId] = useState(
    () => fixedBrand?.id ?? pickDefaultBrandId(brands, sessions, loadRememberedBrandId(), getTodayDate())
  );
  const platformsFor = (id: string) => platformsOfBrand(channels, id, false);
  const pickPlatform = (id: string, want?: ReportPlatform): ReportPlatform | null => {
    const ps = platformsFor(id);
    return want && ps.includes(want) ? want : ps[0] ?? null;
  };
  const [platform, setPlatform] = useState<ReportPlatform | null>(() => pickPlatform(brandId, initialPlatform));
  const [studioId, setStudioId] = useState(initialStudioId || (platform ? findBrandStudioId(brandStudios, brandId, platform) : "") || "");
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(initialStart ?? "19:00");
  const [end, setEnd] = useState(initialEnd ?? (initialStart ? addHours(initialStart, 3) : "22:00"));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const brandName = fixedBrand?.name ?? brands.find((b) => b.id === brandId)?.name ?? "";
  const studio = studios.find((s) => s.id === studioId);
  const [pickStudio, setPickStudio] = useState(false);
  const pickBrand = (id: string) => {
    setBrandId(id);
    rememberBrandId(id);
    const p = pickPlatform(id, platform ?? undefined);
    setPlatform(p);
    const def = p ? findBrandStudioId(brandStudios, id, p) : "";
    if (def) setStudioId(def);
  };
  const pickPlatform2 = (p: ReportPlatform) => {
    setPlatform(p);
    const def = findBrandStudioId(brandStudios, brandId, p);
    if (def) setStudioId(def);
  };
  // Hôm nay / Mai / Ngày mở form (nếu khác) — ngày khác mới mở ô lịch.
  const quickDays = useMemo(() => {
    const today = getTodayDate();
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const out = [{ date: today, label: "Hôm nay" }, { date: tomorrow, label: `Mai · ${fmtDateVn(tomorrow, false)}` }];
    if (initialDate && initialDate !== today && initialDate !== tomorrow) out.push({ date: initialDate, label: fmtDateVn(initialDate, false) });
    return out;
  }, [initialDate]);
  const [otherDay, setOtherDay] = useState(false);

  // Khung giờ brand này hay live (theo ca đã có + ca đang mở) — bấm 1 phát thay vì gõ giờ. Ca nạp bù
  // mang giờ thật của room (10:58, 23:01…) nên làm tròn 30' trước khi gom.
  const presets = useMemo(() => {
    const round30 = (t: string) => { const [h, m] = t.split(":").map(Number); const r = (Math.round((h * 60 + m) / 30) * 30) % (24 * 60); return `${`${Math.floor(r / 60)}`.padStart(2, "0")}:${`${r % 60}`.padStart(2, "0")}`; };
    const count = new Map<string, number>();
    const add = (st: string, en: string) => { const k = `${round30(st)}|${round30(en)}`; count.set(k, (count.get(k) ?? 0) + 1); };
    for (const s of sessions) if (s.brandId === brandId && platformOf(s) === platform && s.status !== "Cancelled") add(s.startTime, s.endTime);
    for (const sl of shiftSlots) if (sl.brandId === brandId && platformOf(sl) === platform && sl.status !== "cancelled") add(sl.startTime, sl.endTime);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([k]) => ({ start: k.slice(0, 5), end: k.slice(6, 11) }));
  }, [sessions, shiftSlots, brandId, platform]);

  // Trùng phòng với ca đã chốt hoặc ca đang mở cùng ngày (ca đang mở cũng giữ phòng).
  const studioClash = useMemo(() => {
    if (!studioId) return null;
    const want = { date, startTime: start, endTime: end };
    const s = sessions.find((x) => x.status !== "Cancelled" && x.studioId === studioId && dateTimeRangesOverlap(x, want));
    if (s) return `${s.brandName} ${s.startTime}–${s.endTime} (đã chốt)`;
    const sl = shiftSlots.find((x) => x.status === "open" && x.studioId === studioId && dateTimeRangesOverlap(x, want));
    return sl ? `${sl.brandName} ${sl.startTime}–${sl.endTime} (chờ đăng ký)` : null;
  }, [sessions, shiftSlots, date, start, end, studioId]);

  // Đ6 (2026-09-24): `lock_month_plan` (0099) BỎ QUA ca kế hoạch ở ngày đã qua, nhưng cửa này thì
  // cho mở thoải mái và im lặng — hai cửa hai luật. Không chặn cứng vì nạp bù ca đã live là nhu cầu
  // thật (CROCS T6–T9 vào app bằng đường này), chỉ nói rõ hệ quả: slot quá khứ không ai đăng ký nữa.
  const pastDays = useMemo(() => {
    const today = getTodayDate();
    if (!date || date >= today) return 0;
    return Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${date}T00:00:00`)) / 86400000);
  }, [date]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (start === end) {
      showToast("Giờ bắt đầu và giờ kết thúc không được trùng nhau.");
      return;
    }
    if (!brandId) {
      showToast("Chọn brand cho ca.");
      return;
    }
    if (!platform) {
      showToast("Brand chưa có kênh nào đang chạy — thêm kênh ở CRM trước.");
      return;
    }
    if (studioClash && !(await confirm(`Phòng ${studio?.name ?? ""} đang trùng với ${studioClash}. Vẫn mở ca?`))) return;
    if (pastDays > 0 && !(await confirm(`Ngày ${fmtDateVn(date)} đã qua ${pastDays} ngày — ca mở ở quá khứ không ai đăng ký được. Vẫn mở ca?`))) return;
    setSaving(true);
    const ok = await onCreateSlot({
      id: `slot-${Date.now()}`,
      date,
      startTime: start,
      endTime: end,
      brandId,
      brandName: brandName,
      platform,
      studioId: studioId || undefined,
      studioName: studio?.name ?? "",
      notes,
      status: "open",
      createdBy: currentUserId
    });
    setSaving(false);
    if (ok) onClose();
  };

  const input = "w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-2.5 text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface-base)]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[var(--accent-text)]" />
            <h3 className="font-bold text-[var(--text)] text-base">Mở ca chờ đăng ký</h3>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        {/* Cửa sổ gọn 09/11 (demo user duyệt): đoạn mở đầu 57 chữ → một dòng; brand / kênh / ngày chọn bằng ô chạm, phòng tự điền theo
            kênh (bấm "Đổi" mới hiện danh sách phòng). */}
        <p className="text-2xs text-[var(--text-faint)]">Ca ngoài kế hoạch, không có target.</p>

        <form onSubmit={submit} className="space-y-3 text-xs">
          {fixedBrand ? (
            <p className="font-bold text-[var(--text)] text-sm">{brandName || "—"}</p>
          ) : (
            <div role="group" aria-label="Brand" className="flex flex-wrap gap-1.5">
              {brands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={b.id === brandId}
                  onClick={() => pickBrand(b.id)}
                  className={`min-h-9 px-3 rounded-xl border font-bold flex items-center gap-1.5 ${b.id === brandId ? "seg-on" : "border-[var(--border)] text-[var(--text)]"}`}
                >
                  <BrandLogo brand={b} size="xs" />
                  {b.name}
                </button>
              ))}
            </div>
          )}
          {platformsFor(brandId).length === 0 ? (
            <p className="text-amber-300">{brandName || "Brand"} chưa có kênh — thêm ở CRM.</p>
          ) : (
            <div role="group" aria-label="Kênh (sàn)" className="flex flex-wrap gap-1.5">
              {platformsFor(brandId).map((p) => (
                <button
                  key={p}
                  id={p === platform ? "open-slot-platform" : undefined}
                  type="button"
                  aria-pressed={p === platform}
                  onClick={() => pickPlatform2(p)}
                  className={`min-h-9 px-3 rounded-xl border font-bold ${p === platform ? "seg-on" : "border-[var(--border)] text-[var(--text)]"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[var(--text-muted)]">
            <span>
              Phòng: <b className="text-[var(--text)]">{studio ? `${studio.name} (${studio.roomNumber})` : "chưa gán"}</b>
            </span>
            {!pickStudio && (
              <button type="button" onClick={() => setPickStudio(true)} className="px-2 py-1 rounded-lg border border-[var(--border)] text-2xs font-bold text-[var(--text)]">
                Đổi
              </button>
            )}
          </div>
          {pickStudio && (
            <select aria-label="Phòng" value={studioId} onChange={(e) => setStudioId(e.target.value)} className={input}>
              <option value="">— Chưa gán phòng —</option>
              {studios.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.roomNumber})</option>)}
            </select>
          )}

          {presets.length > 0 && (
            <div role="group" aria-label={`Khung giờ ${brandName || "brand"} hay live`} className="flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const on = p.start === start && p.end === end;
                return (
                  <button key={`${p.start}${p.end}`} type="button" aria-pressed={on} onClick={() => { setStart(p.start); setEnd(p.end); }}
                    className={`min-h-9 px-3 rounded-xl border font-mono font-bold ${on ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/60"}`}>
                    {p.start}–{p.end}
                  </button>
                );
              })}
            </div>
          )}

          <div role="group" aria-label="Ngày" className="flex flex-wrap gap-1.5">
            {quickDays.map((d) => (
              <button key={d.date} type="button" aria-pressed={!otherDay && date === d.date} onClick={() => { setDate(d.date); setOtherDay(false); }}
                className={`min-h-9 px-3 rounded-xl border font-bold ${!otherDay && date === d.date ? "seg-on" : "border-[var(--border)] text-[var(--text)]"}`}>
                {d.label}
              </button>
            ))}
            <button type="button" aria-pressed={otherDay} onClick={() => setOtherDay(true)}
              className={`min-h-9 px-3 rounded-xl border font-bold ${otherDay ? "seg-on" : "border-[var(--border)] text-[var(--text)]"}`}>
              Ngày khác…
            </button>
          </div>

          <div className={`grid gap-3 ${otherDay ? "grid-cols-3" : "grid-cols-2"}`}>
            {otherDay && (
              <label className="block">
                <span className="font-bold text-[var(--text-muted)] block mb-1">Ngày</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} font-mono`} required />
              </label>
            )}
            <label className="block">
              <span className="font-bold text-[var(--text-muted)] block mb-1">Bắt đầu</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${input} font-mono`} required />
            </label>
            <label className="block">
              <span className="font-bold text-[var(--text-muted)] block mb-1">Kết thúc</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`${input} font-mono`} required />
            </label>
          </div>

          <label className="block">
            <span className="font-bold text-[var(--text-muted)] block mb-1">Ghi chú <span className="font-normal text-[var(--text-faint)]">(tuỳ chọn — talent thấy khi đăng ký)</span></span>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Vd: ca tăng cường D-Day, cần host quen SKU giày" className={input} />
          </label>

          {pastDays > 0 && (
            <p className="text-2xs text-amber-300 flex items-start gap-1.5 bg-amber-950/40 border border-amber-900 rounded-xl p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                <b>Ngày đã qua {pastDays} ngày.</b> Talent không đăng ký được ca ở quá khứ — chỉ mở nếu bạn đang <b>nạp bù ca đã live</b>, rồi tự chốt Host ở Bảng Vận Hành.
              </span>
            </p>
          )}

          {studioClash && (
            <p className="text-2xs text-rose-300 flex items-center gap-1.5 bg-rose-950/50 border border-rose-900 rounded-xl p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Phòng trùng với {studioClash}.
            </p>
          )}

          <div className="pt-3 border-t border-[var(--border)] flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] font-bold">Đóng</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-bold">
              {saving ? "Đang mở…" : "Mở ca"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
