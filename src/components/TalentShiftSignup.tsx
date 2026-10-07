import { useMemo, useState } from "react";
import { CalendarClock, Radio, UserCheck, UserX } from "lucide-react";
import type { Brand, ShiftRegistration, ShiftSlot } from "../types";
import { getTodayDate } from "../lib/dateUtils";
import { fmtDateVn } from "../lib/format";
import { BrandLogo } from "./ui/BrandLogo";
import { PlatformChip } from "./common/PlatformChip";
import { PageIntro } from "./common/PageIntro";

// Đăng Ký Ca của talent — màn riêng, tách khỏi Agency từ 08/10 (trước đó dùng chung component "Nhân sự ca" với ops, phần ops
// bị rào `admin &&`). Chỉ làm một việc: liệt kê ca ĐANG MỞ từ hôm nay, bấm "Tôi rảnh ca này" / huỷ. Ops chốt Host + Trợ live ở
// Bảng Vận Hành. Ca mình đã được chốt xem ở "Ca Của Tôi".

interface Props {
  brands: Brand[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  myTalentId?: string;
  onRegister: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregister: (slotId: string, talentId: string) => Promise<boolean>;
}

const WEEKDAY = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const dayLabel = (date: string) => WEEKDAY[new Date(`${date}T00:00:00`).getDay()];

export default function TalentShiftSignup({ brands, shiftSlots, shiftRegistrations, myTalentId, onRegister, onUnregister }: Props) {
  const today = getTodayDate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

  const mineBySlot = useMemo(
    () => new Set(shiftRegistrations.filter((r) => !!myTalentId && r.talentId === myTalentId).map((r) => r.slotId)),
    [shiftRegistrations, myTalentId]
  );

  // Ca còn mở từ hôm nay, theo ngày rồi giờ — ca đã chốt/huỷ/đã qua talent không đăng ký được nữa.
  const openSlots = useMemo(
    () =>
      shiftSlots
        .filter((s) => s.status === "open" && s.date >= today)
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [shiftSlots, today]
  );
  const byDay = useMemo(() => {
    const m = new Map<string, ShiftSlot[]>();
    for (const s of openSlots) { const l = m.get(s.date) ?? []; l.push(s); m.set(s.date, l); }
    return [...m.entries()];
  }, [openSlots]);
  const registeredCount = openSlots.filter((s) => mineBySlot.has(s.id)).length;

  const toggle = async (slot: ShiftSlot) => {
    if (!myTalentId) return;
    setBusyId(slot.id);
    if (mineBySlot.has(slot.id)) await onUnregister(slot.id, myTalentId);
    else await onRegister(slot.id, myTalentId);
    setBusyId(null);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 rounded-2xl shadow-xl">
        <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-blue-400" /> Đăng Ký Ca
        </h2>
        <PageIntro>Bấm "Tôi rảnh ca này" cho các ca bạn có thể làm — Operations sẽ chốt lịch từ danh sách đã đăng ký. Ca được chốt cho bạn hiện ở Ca Của Tôi.</PageIntro>
        {myTalentId && openSlots.length > 0 && (
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {openSlots.length} ca đang mở · bạn đã đăng ký <b className="text-[var(--text)]">{registeredCount}</b>
          </p>
        )}
      </div>

      {!myTalentId && (
        <div className="bg-amber-950/85 border border-amber-800 rounded-xl p-4 text-sm text-amber-200 flex items-center gap-2">
          Tài khoản của bạn chưa được gán hồ sơ Talent — liên hệ CEO/Operations để gán trước khi tự đăng ký ca được.
        </div>
      )}

      <div className="space-y-4">
        {byDay.length === 0 && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center text-sm text-[var(--text-faint)]">
            Hiện chưa có ca nào đang mở để đăng ký. Khi Operations mở ca mới, bạn sẽ nhận thông báo.
          </div>
        )}
        {byDay.map(([date, slots]) => (
          <section key={date} className="space-y-2">
            <p className={`text-[11px] font-black uppercase tracking-wide ${date === today ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"}`}>
              {dayLabel(date)} {fmtDateVn(date)}{date === today ? " · hôm nay" : ""}
            </p>
            {slots.map((slot) => {
              const mine = mineBySlot.has(slot.id);
              return (
                <div key={slot.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-mono text-sm font-black text-[var(--text)] w-[104px] shrink-0">{slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)}</span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <BrandLogo brand={slot.brandId ? brandById.get(slot.brandId) : undefined} size="xs" />
                    <span className="text-sm font-bold text-[var(--text)] truncate">{slot.brandName}</span>
                    <PlatformChip platform={slot.platform} />
                  </span>
                  {slot.studioName && <span className="text-xs text-[var(--text-faint)] flex items-center gap-1"><Radio className="w-3 h-3" /> {slot.studioName}</span>}
                  {myTalentId && (
                    <button
                      onClick={() => toggle(slot)}
                      disabled={busyId === slot.id}
                      className={`ml-auto flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 min-h-8 rounded-lg transition-colors disabled:opacity-50 ${
                        mine
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-800"
                          : "bg-blue-950 text-blue-300 border border-blue-800 hover:bg-blue-900"
                      }`}
                    >
                      {mine ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {mine ? "Đã đăng ký · Huỷ" : "Tôi rảnh ca này"}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
