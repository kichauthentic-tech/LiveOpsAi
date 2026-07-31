import React, { useMemo, useState } from "react";
import {
  Brand,
  BrandPlatformRate,
  LiveSession,
  RecurringShiftTemplate,
  ShiftRegistration,
  ShiftSlot,
  Studio,
  SystemUser,
  Talent,
  UserRole
} from "../types";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  UserCheck,
  UserX,
  AlertTriangle,
  Users,
  Radio,
  DollarSign,
  Check,
  Repeat,
  Sparkles,
  Zap,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface ShiftSchedulingProps {
  currentRole: UserRole;
  activeUser: SystemUser;
  sessions: LiveSession[];
  talents: Talent[];
  brands: Brand[];
  studios: Studio[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  brandPlatformRates: BrandPlatformRate[];
  recurringShiftTemplates: RecurringShiftTemplate[];
  onCreateSlot: (slot: ShiftSlot) => Promise<boolean>;
  onDeleteSlot: (id: string) => Promise<void>;
  onRegister: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregister: (slotId: string, talentId: string) => Promise<boolean>;
  onFinalizeSlot: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  onSaveRate: (brandId: string, platform: "TikTok" | "Shopee", ratePerHour: number) => Promise<boolean>;
  onCreateTemplate: (template: RecurringShiftTemplate) => Promise<boolean>;
  onToggleTemplate: (template: RecurringShiftTemplate) => Promise<boolean>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onGenerateMonthSlots: (month: string) => Promise<number>;
}

const WEEKDAY_LABELS = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

const dayLabel = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  const names = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  return names[d.getDay()];
};

const durationHours = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number);
  let [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // ca qua đêm, vd 22:00 -> 00:30
  return mins / 60;
}

const isAdminRole = (role: UserRole) => role === "ceo" || role === "operations" || role === "admin";

export default function ShiftScheduling({
  currentRole,
  activeUser,
  sessions,
  talents,
  brands,
  studios,
  shiftSlots,
  shiftRegistrations,
  brandPlatformRates,
  recurringShiftTemplates,
  onCreateSlot,
  onDeleteSlot,
  onRegister,
  onUnregister,
  onFinalizeSlot,
  onSaveRate,
  onCreateTemplate,
  onToggleTemplate,
  onDeleteTemplate,
  onGenerateMonthSlots
}: ShiftSchedulingProps) {
  const admin = isAdminRole(currentRole);
  const myTalentId = activeUser.assignedTalentId;
  const today = getTodayDateString();
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [newDate, setNewDate] = useState(today);
  const [newStart, setNewStart] = useState("20:00");
  const [newEnd, setNewEnd] = useState("23:00");
  const [newBrandId, setNewBrandId] = useState(brands[0]?.id ?? "");
  const [newPlatform, setNewPlatform] = useState<"TikTok" | "Shopee">("TikTok");
  const [newStudioId, setNewStudioId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const [pickByLot, setPickByLot] = useState<Record<string, { hostId: string; coHostId: string }>>({});
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});

  const [tplWeekday, setTplWeekday] = useState(1);
  const [tplStart, setTplStart] = useState("20:00");
  const [tplEnd, setTplEnd] = useState("23:00");
  const [tplBrandId, setTplBrandId] = useState(brands[0]?.id ?? "");
  const [tplPlatform, setTplPlatform] = useState<"TikTok" | "Shopee">("TikTok");
  const [tplStudioId, setTplStudioId] = useState("");
  const [creatingTpl, setCreatingTpl] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const talentsById = useMemo(() => new Map(talents.map((t) => [t.id, t])), [talents]);
  const registrationsBySlot = useMemo(() => {
    const map = new Map<string, ShiftRegistration[]>();
    shiftRegistrations.forEach((r) => {
      const list = map.get(r.slotId) ?? [];
      list.push(r);
      map.set(r.slotId, list);
    });
    return map;
  }, [shiftRegistrations]);

  const monthSlots = useMemo(
    () => shiftSlots.filter((s) => s.date.startsWith(selectedMonth)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [shiftSlots, selectedMonth]
  );

  const slotsByDate = useMemo(() => {
    const map = new Map<string, ShiftSlot[]>();
    shiftSlots.forEach((s) => {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    });
    map.forEach((list) => list.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [shiftSlots]);

  // Lưới ngày đủ tuần (kể cả ngày lấp đầu/cuối từ tháng liền kề) để vẽ lịch ma trận.
  const monthGrid = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    const startWeekday = new Date(year, monthIdx, 1).getDay(); // 0 = CN
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    const cells: { date: string; inMonth: boolean }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(year, monthIdx, i - startWeekday + 1);
      const dateStr = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
      cells.push({ date: dateStr, inMonth: d.getMonth() === monthIdx });
    }
    return cells;
  }, [selectedMonth]);

  const visibleSlots = selectedDate ? slotsByDate.get(selectedDate) ?? [] : monthSlots;

  const shiftMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`);
    setSelectedDate(null);
  };

  const rateFor = (brandId: string, platform: "TikTok" | "Shopee") =>
    brandPlatformRates.find((r) => r.brandId === brandId && r.platform === platform);

  const checkConflicts = (date: string, start: string, end: string, studioId: string, talentId: string) => {
    return sessions.some(
      (s) =>
        s.date === date &&
        s.status !== "Cancelled" &&
        s.startTime < end &&
        s.endTime > start &&
        ((studioId && s.studioId === studioId) || s.hostId === talentId || s.coHostId === talentId)
    );
  };

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const brand = brands.find((b) => b.id === newBrandId);
    const studio = studios.find((s) => s.id === newStudioId);
    setCreating(true);
    const ok = await onCreateSlot({
      id: `slot-${Date.now()}`,
      date: newDate,
      startTime: newStart,
      endTime: newEnd,
      brandId: newBrandId || undefined,
      brandName: brand?.name ?? "",
      platform: newPlatform,
      studioId: newStudioId || undefined,
      studioName: studio?.name ?? "",
      notes: newNotes,
      status: "open"
    });
    setCreating(false);
    if (ok) setNewNotes("");
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const brand = brands.find((b) => b.id === tplBrandId);
    const studio = studios.find((s) => s.id === tplStudioId);
    setCreatingTpl(true);
    await onCreateTemplate({
      id: `tpl-${Date.now()}`,
      weekday: tplWeekday,
      brandId: tplBrandId || undefined,
      brandName: brand?.name ?? "",
      platform: tplPlatform,
      startTime: tplStart,
      endTime: tplEnd,
      studioId: tplStudioId || undefined,
      studioName: studio?.name ?? "",
      notes: "",
      active: true
    });
    setCreatingTpl(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateMsg(null);
    const count = await onGenerateMonthSlots(selectedMonth);
    setGenerating(false);
    setGenerateMsg(count > 0 ? `Đã sinh ${count} ca mới cho tháng ${selectedMonth}.` : "Không có ca mới nào để sinh (đã sinh đủ hoặc chưa có quy tắc lặp nào).");
  };

  const handleToggleRegister = async (slot: ShiftSlot) => {
    if (!myTalentId) return;
    setBusySlotId(slot.id);
    const already = (registrationsBySlot.get(slot.id) ?? []).some((r) => r.talentId === myTalentId);
    if (already) await onUnregister(slot.id, myTalentId);
    else await onRegister(slot.id, myTalentId);
    setBusySlotId(null);
  };

  const handleFinalize = async (slot: ShiftSlot) => {
    const pick = pickByLot[slot.id];
    if (!pick?.hostId) {
      window.alert("Chọn Host trước khi chốt lịch.");
      return;
    }
    setBusySlotId(slot.id);
    const ok = await onFinalizeSlot(slot, pick.hostId, pick.coHostId || null);
    setBusySlotId(null);
    if (ok) setPickByLot((prev) => ({ ...prev, [slot.id]: { hostId: "", coHostId: "" } }));
  };

  const handleSaveRate = async (brandId: string) => {
    const key = `${brandId}:${newPlatform}`;
    const raw = rateDraft[key];
    if (raw === undefined) return;
    await onSaveRate(brandId, newPlatform, Number(raw) || 0);
  };

  // Tải theo host trong tháng đang xem — gộp cả vai trò Host lẫn Co-host.
  const loadByTalent = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; shifts: number }>();
    sessions
      .filter((s) => s.date.startsWith(selectedMonth) && s.status !== "Cancelled")
      .forEach((s) => {
        const hrs = durationHours(s.startTime, s.endTime);
        [
          { id: s.hostId, name: s.hostName },
          { id: s.coHostId, name: s.coHostName }
        ].forEach(({ id, name }) => {
          if (!id) return;
          const cur = map.get(id) ?? { name, hours: 0, shifts: 0 };
          cur.hours += hrs;
          cur.shifts += 1;
          map.set(id, cur);
        });
      });
    return Array.from(map.entries())
      .map(([talentId, v]) => ({ talentId, ...v }))
      .sort((a, b) => b.hours - a.hours);
  }, [sessions, selectedMonth]);

  const understaffedSlots = useMemo(
    () =>
      monthSlots.filter(
        (s) => s.status === "open" && s.date >= today && (registrationsBySlot.get(s.id) ?? []).length === 0
      ),
    [monthSlots, registrationsBySlot, today]
  );

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" />
            Đăng Ký &amp; Chốt Lịch Host
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {admin
              ? "Mở ca, xem ai đã đăng ký, chốt Host + Co-host cho từng ca."
              : "Đăng ký các ca bạn rảnh — Operations sẽ chốt lịch từ danh sách đã đăng ký."}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            title="Tháng trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setSelectedDate(null);
            }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            title="Tháng sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!admin && !myTalentId && (
        <div className="bg-amber-950/60 border border-amber-800 rounded-xl p-4 text-sm text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Tài khoản của bạn chưa được gán hồ sơ Talent (assigned_talent_id) — liên hệ CEO/Operations để gán trước khi tự đăng ký ca được.
        </div>
      )}

      {admin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Repeat className="w-4 h-4 text-purple-400" /> Quy Tắc Lặp (Ca Cố Định Theo Tuần)
          </h3>
          <p className="text-xs text-slate-500 -mt-2">
            Khai báo 1 lần, hệ thống tự sinh ca cho cả tháng — thay vì mở tay từng ca lặp lại mỗi tuần.
          </p>

          {recurringShiftTemplates.length > 0 && (
            <div className="space-y-1.5">
              {recurringShiftTemplates.map((t) => (
                <div
                  key={t.id}
                  className={`flex flex-wrap items-center gap-2 text-xs bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 ${
                    !t.active ? "opacity-50" : ""
                  }`}
                >
                  <span className="font-mono font-bold text-white w-14">{WEEKDAY_LABELS[t.weekday]}</span>
                  <span className="font-mono text-slate-300">{t.startTime}-{t.endTime}</span>
                  <span className="text-slate-400">{t.brandName || "—"}</span>
                  <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-bold">{t.platform}</span>
                  {t.studioName && <span className="text-slate-500">{t.studioName}</span>}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => onToggleTemplate(t)}
                      className={`px-2 py-1 rounded-lg font-bold ${
                        t.active
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {t.active ? "Đang bật" : "Đã tắt"}
                    </button>
                    <button onClick={() => onDeleteTemplate(t.id)} className="text-slate-500 hover:text-rose-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCreateTemplate} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-slate-800 pt-3">
            <select
              value={tplWeekday}
              onChange={(e) => setTplWeekday(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {WEEKDAY_LABELS.map((label, idx) => (
                <option key={idx} value={idx}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="time"
              required
              value={tplStart}
              onChange={(e) => setTplStart(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="time"
              required
              value={tplEnd}
              onChange={(e) => setTplEnd(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <select
              value={tplBrandId}
              onChange={(e) => setTplBrandId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Brand —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              value={tplPlatform}
              onChange={(e) => setTplPlatform(e.target.value as "TikTok" | "Shopee")}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="TikTok">TikTok</option>
              <option value="Shopee">Shopee</option>
            </select>
            <select
              value={tplStudioId}
              onChange={(e) => setTplStudioId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Studio (tuỳ chọn) —</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creatingTpl || !tplBrandId}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2 text-sm transition-colors sm:col-span-3 lg:col-span-6"
            >
              {creatingTpl ? "Đang thêm..." : "+ Thêm Quy Tắc Lặp"}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
            <button
              onClick={handleGenerate}
              disabled={generating || recurringShiftTemplates.every((t) => !t.active)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-xl px-4 py-2 text-sm transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? "Đang sinh ca..." : `Sinh Ca Cho Tháng ${selectedMonth}`}
            </button>
            {generateMsg && <span className="text-xs text-slate-400">{generateMsg}</span>}
          </div>
        </div>
      )}

      {admin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" /> Mở Ca Mới (Phát Sinh)
          </h3>
          <form onSubmit={handleCreateSlot} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <input
              type="date"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="time"
              required
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="time"
              required
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <select
              value={newBrandId}
              onChange={(e) => setNewBrandId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Brand —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value as "TikTok" | "Shopee")}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="TikTok">TikTok</option>
              <option value="Shopee">Shopee</option>
            </select>
            <select
              value={newStudioId}
              onChange={(e) => setNewStudioId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Studio (tuỳ chọn) —</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Ghi chú (tuỳ chọn)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500 sm:col-span-2 lg:col-span-3"
            />
            <button
              type="submit"
              disabled={creating || !newBrandId}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2 text-sm transition-colors sm:col-span-1 lg:col-span-3"
            >
              {creating ? "Đang mở..." : "Mở Ca Đăng Ký"}
            </button>
          </form>

          {newBrandId && (
            <div className="flex items-center gap-3 text-xs text-slate-400 border-t border-slate-800 pt-3">
              <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Rate/giờ ({newPlatform}, {brands.find((b) => b.id === newBrandId)?.name}):</span>
              <input
                type="number"
                min={0}
                placeholder={String(rateFor(newBrandId, newPlatform)?.ratePerHour ?? 0)}
                value={rateDraft[`${newBrandId}:${newPlatform}`] ?? ""}
                onChange={(e) => setRateDraft((prev) => ({ ...prev, [`${newBrandId}:${newPlatform}`]: e.target.value }))}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white w-32 font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => handleSaveRate(newBrandId)}
                className="text-blue-400 hover:text-blue-300 font-bold"
              >
                Lưu Rate
              </button>
              <span className="text-slate-500">
                → Target GMV/ca ({durationHours(newStart, newEnd).toFixed(1)}h) ={" "}
                {((rateFor(newBrandId, newPlatform)?.ratePerHour ?? 0) * durationHours(newStart, newEnd)).toLocaleString("vi-VN")}đ
              </span>
            </div>
          )}
        </div>
      )}

      {admin && understaffedSlots.length > 0 && (
        <div className="bg-rose-950/50 border border-rose-800 rounded-xl p-4 text-sm text-rose-200">
          <div className="font-bold flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" /> {understaffedSlots.length} ca chưa có ai đăng ký
          </div>
          <div className="flex flex-wrap gap-2">
            {understaffedSlots.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedDate(s.date)}
                className="bg-rose-900/60 border border-rose-800 rounded-lg px-2 py-1 font-mono text-xs hover:bg-rose-900 transition-colors"
              >
                {s.date} {s.startTime}-{s.endTime} · {s.brandName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
          <CalendarIcon className="w-4 h-4 text-blue-400" /> Lịch Ma Trận Tháng {selectedMonth}
        </h3>
        <div className="overflow-x-auto -mx-2">
          <div className="min-w-[760px] px-2">
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_LABELS.map((label, idx) => (
                <div
                  key={label}
                  className={`text-center text-[11px] font-bold uppercase tracking-wide py-1 ${
                    idx === 0 || idx === 6 ? "text-amber-400" : "text-slate-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthGrid.map((cell) => {
                const daySlots = slotsByDate.get(cell.date) ?? [];
                const dayNum = Number(cell.date.slice(8, 10));
                const isToday = cell.date === today;
                const isSelected = cell.date === selectedDate;
                const hasUnderstaffed = daySlots.some(
                  (s) => s.status === "open" && cell.date >= today && (registrationsBySlot.get(s.id) ?? []).length === 0
                );
                const visibleChips = daySlots.slice(0, 3);
                const extra = daySlots.length - visibleChips.length;
                return (
                  <button
                    key={cell.date}
                    onClick={() => setSelectedDate(cell.date === selectedDate ? null : cell.date)}
                    className={`text-left min-h-[92px] sm:min-h-[108px] rounded-lg p-1.5 flex flex-col gap-1 border transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-950/30"
                        : isToday
                        ? "border-purple-600 bg-slate-950/80"
                        : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                    } ${!cell.inMonth ? "opacity-35" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-mono font-bold ${isToday ? "text-purple-300" : "text-slate-300"}`}>{dayNum}</span>
                      {hasUnderstaffed && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title="Có ca thiếu người" />}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {visibleChips.map((s) => {
                        const regsCount = (registrationsBySlot.get(s.id) ?? []).length;
                        const dotColor =
                          s.status === "finalized"
                            ? "bg-emerald-400"
                            : s.status === "cancelled"
                            ? "bg-slate-600"
                            : regsCount === 0
                            ? "bg-rose-400"
                            : "bg-blue-400";
                        const shortBrand = s.brandName ? (s.brandName.length > 9 ? `${s.brandName.slice(0, 8)}…` : s.brandName) : "—";
                        return (
                          <span
                            key={s.id}
                            className={`flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded bg-slate-900/80 ${
                              s.status === "cancelled" ? "text-slate-600 line-through" : "text-slate-300"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                            <span className="font-mono shrink-0">{s.startTime}</span>
                            <span className="truncate">{shortBrand}</span>
                          </span>
                        );
                      })}
                      {extra > 0 && <span className="text-[10px] text-slate-500 px-1">+{extra} khác</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Mở, chưa ai đăng ký
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Mở, đã có người đăng ký
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Đã chốt
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" /> Đã huỷ
          </span>
          {selectedDate && (
            <button onClick={() => setSelectedDate(null)} className="ml-auto text-blue-400 hover:text-blue-300 font-bold">
              × Bỏ lọc ngày {selectedDate}
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            {selectedDate ? `Ca Ngày ${dayLabel(selectedDate)} ${selectedDate}` : `Danh Sách Ca Tháng ${selectedMonth}`}
          </h3>
          {selectedDate && (
            <button onClick={() => setSelectedDate(null)} className="text-xs text-blue-400 hover:text-blue-300 font-bold">
              Xem cả tháng
            </button>
          )}
        </div>
        <div className="overflow-x-auto -mx-2">
          <div className="min-w-[720px] px-2 space-y-2">
            {visibleSlots.length === 0 && (
              <p className="text-sm text-slate-500 py-6 text-center">
                {selectedDate ? "Chưa có ca nào trong ngày này." : "Chưa có ca nào mở trong tháng này."}
              </p>
            )}
            {visibleSlots.map((slot) => {
              const regs = registrationsBySlot.get(slot.id) ?? [];
              const iAmRegistered = myTalentId ? regs.some((r) => r.talentId === myTalentId) : false;
              const pick = pickByLot[slot.id] ?? { hostId: "", coHostId: "" };
              const conflict =
                pick.hostId && checkConflicts(slot.date, slot.startTime, slot.endTime, slot.studioId ?? "", pick.hostId);
              return (
                <div key={slot.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-mono font-bold text-white">
                        {dayLabel(slot.date)} {slot.date} · {slot.startTime}-{slot.endTime}
                      </span>
                      <span className="text-slate-400">{slot.brandName}</span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-bold">{slot.platform}</span>
                      {slot.studioName && <span className="text-slate-500 text-xs">{slot.studioName}</span>}
                      {slot.templateId ? (
                        <span className="flex items-center gap-1 text-[10px] text-purple-300" title="Tự động sinh từ quy tắc lặp">
                          <Zap className="w-3 h-3" /> Tự động
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600">Phát sinh</span>
                      )}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          slot.status === "finalized"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : slot.status === "cancelled"
                            ? "bg-slate-800 text-slate-500 border border-slate-700"
                            : "bg-blue-950 text-blue-300 border border-blue-800"
                        }`}
                      >
                        {slot.status === "finalized" ? "ĐÃ CHỐT" : slot.status === "cancelled" ? "ĐÃ HUỶ" : `MỞ (${regs.length} đăng ký)`}
                      </span>
                    </div>

                    {admin && slot.status === "open" && (
                      <button
                        onClick={() => onDeleteSlot(slot.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors"
                        title="Xoá ca"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {!admin && slot.status === "open" && myTalentId && (
                    <button
                      onClick={() => handleToggleRegister(slot)}
                      disabled={busySlotId === slot.id}
                      className={`self-start flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        iAmRegistered
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-800"
                          : "bg-blue-950 text-blue-300 border border-blue-800 hover:bg-blue-900"
                      }`}
                    >
                      {iAmRegistered ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {iAmRegistered ? "Đã đăng ký · Hủy" : "Tôi rảnh ca này"}
                    </button>
                  )}

                  {admin && slot.status === "open" && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      {regs.length === 0 && <span className="text-xs text-slate-600">Chưa ai đăng ký</span>}
                      {regs.map((r) => (
                        <span key={r.id} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                          {talentsById.get(r.talentId)?.name ?? r.talentId}
                        </span>
                      ))}
                      {regs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                          <select
                            value={pick.hostId}
                            onChange={(e) => setPickByLot((prev) => ({ ...prev, [slot.id]: { ...pick, hostId: e.target.value } }))}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Host…</option>
                            {regs.map((r) => (
                              <option key={r.talentId} value={r.talentId}>
                                {talentsById.get(r.talentId)?.name ?? r.talentId}
                              </option>
                            ))}
                          </select>
                          <select
                            value={pick.coHostId}
                            onChange={(e) => setPickByLot((prev) => ({ ...prev, [slot.id]: { ...pick, coHostId: e.target.value } }))}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Trợ live (tuỳ chọn)…</option>
                            {regs.filter((r) => r.talentId !== pick.hostId).map((r) => (
                              <option key={r.talentId} value={r.talentId}>
                                {talentsById.get(r.talentId)?.name ?? r.talentId}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleFinalize(slot)}
                            disabled={!pick.hostId || busySlotId === slot.id}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" /> Chốt Lịch
                          </button>
                        </div>
                      )}
                      {conflict && (
                        <span className="w-full text-[11px] text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Host đã chọn trùng lịch với 1 ca khác cùng ngày.
                        </span>
                      )}
                    </div>
                  )}

                  {slot.status === "finalized" && (
                    <div className="text-xs text-emerald-300 flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
                      <Check className="w-3.5 h-3.5" /> Đã chốt — xem chi tiết ở tab Live Sessions / Lịch Vận Hành.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-purple-400" /> Tải Theo Host — Tháng {selectedMonth}
        </h3>
        {loadByTalent.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có ca nào đã chốt trong tháng này.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase border-b border-slate-800">
                  <th className="pb-2">Host</th>
                  <th className="pb-2 text-right">Số Ca</th>
                  <th className="pb-2 text-right">Tổng Giờ</th>
                </tr>
              </thead>
              <tbody>
                {loadByTalent.map((row) => (
                  <tr key={row.talentId} className="border-b border-slate-800/60 last:border-0">
                    <td className="py-2 text-white font-medium">{row.name || talentsById.get(row.talentId)?.name}</td>
                    <td className="py-2 text-right font-mono text-slate-300">{row.shifts}</td>
                    <td className="py-2 text-right font-mono text-slate-300">{row.hours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
