import { platformText } from "../lib/metricGlossary";
import React, { useMemo, useState } from "react";
import { SystemUser, Talent, LiveSession, SessionFinance, TalentRateHistoryEntry } from "../types";
import { ShieldAlert, ChevronRight, Clock, Wallet, Clapperboard, Store } from "lucide-react";
import { computeTalentMonthlyIncome } from "../lib/pnl";
import { todayVn } from "../lib/performance/brandCommitment";

import { fmtDateVn, fmtFixed, fmtVndShort, fmtVndFull } from "../lib/format";
import { MonthPicker } from "./common/MonthPicker";
import { talentRoleLabel } from "../lib/talentName";
import { addDays } from "../lib/dateUtils";
import { monthSummary, myRole } from "../lib/talent/myShifts";
import { channelReach, myChannelRoleSummary } from "../lib/talent/channelSummary";
import { sessionMinutes } from "../lib/staffSegments";
import { PlatformChip } from "./common/PlatformChip";

// Tab "Tôi" của app talent (bản 3, 09/11). Người làm live vào đây để hỏi "tháng này tôi làm bao nhiêu giờ, được bao nhiêu" ⇒ giờ
// + thu nhập đứng đầu, rồi MỘT hàng hai bảng: "Hiệu suất theo brand × sàn × vai" (trái) và "Bảng công" từng ca (phải).
// Hai bảng dùng CÙNG độ cao hàng (tiêu đề, hàng lọc, hàng tiêu đề cột, mỗi dòng 40px) nên dòng thứ N của hai bên nằm ngang nhau.
// Hiệu suất chỉ có số của chính mình, KHÔNG so với nhóm (user bỏ 09/11); vai trợ chỉ ca + giờ vì GMV của ca tính cho host.
// Mọi chỉnh sửa tài khoản (tên, số điện thoại, ảnh, lịch điện thoại, email, mật khẩu) nằm ở trang Tài khoản, vào từ thẻ tên ở
// góc trái dưới thanh bên (điện thoại: bấm tên/ảnh ở đầu trang này) — không còn nút Cài đặt.
// Thu nhập = rate × giờ (không có hoa hồng theo GMV — user chốt 06/10), cùng công thức Finance & P&L.

interface MyTalentProfileProps {
  activeUser: SystemUser;
  talents: Talent[];
  sessions: LiveSession[];
  /** Mảng cho Thu Nhập Tháng — cùng mảng Finance & P&L đọc (gồm ca đã loại khỏi báo cáo, vẫn tính công). */
  payrollSessions: LiveSession[];
  financeRecords: SessionFinance[];
  talentRateHistory: TalentRateHistoryEntry[];
  /** Mở trang Tài khoản — chỉ dùng trên điện thoại (không có thanh bên), nơi bấm tên/ảnh ở đầu trang là cửa vào. */
  onOpenAccount: () => void;
}

const money = (n: number) => Math.round(n).toLocaleString("vi-VN");
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dayLabel = (d: string) => `${WEEKDAY[new Date(`${d}T00:00:00`).getDay()]} ${fmtDateVn(d, false)}`;
const h1 = (h: number) => `${fmtFixed(h, h % 1 ? 1 : 0)}h`;
const hFixed = (h: number) => `${fmtFixed(h, 1)}h`;

const CARD = "bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3 min-w-0";
const SECTION_TITLE = "text-sm font-black text-[var(--text)]";
// Độ cao cố định để hai bảng đứng cạnh nhau thẳng hàng: dòng tiêu đề + hàng lọc 34px, hàng tiêu đề cột 28px, dòng dữ liệu 40px.
const TOP_ROW = "min-h-[34px] flex flex-wrap items-center justify-between gap-2";
const TH_ROW = "h-7 items-center whitespace-nowrap gap-x-1.5 px-0.5 text-2xs font-bold text-[var(--text-faint)] border-b border-[var(--border)]";
const TD_ROW = "h-10 items-center gap-x-1.5 px-0.5 text-xs border-t border-[var(--border-muted)] whitespace-nowrap";
const PERF_COLS = "grid grid-cols-[minmax(0,1fr)_5.2rem_2.4rem_3.4rem_5.4rem_4.2rem]";
const LOG_COLS = "grid grid-cols-[4.8rem_minmax(0,1fr)_5.6rem_2.6rem_5rem]";
// Điện thoại: bảng cuộn ngang trong khung, cột Brand · sàn vẫn đủ chỗ cho chip sàn.
const PERF_MIN = "min-w-[34rem]";
const LOG_MIN = "min-w-[32rem]";

const Tile: React.FC<{ icon: React.ReactNode; label: string; tone?: "accent" | "default"; children: React.ReactNode; sub?: React.ReactNode }> = ({ icon, label, tone = "default", children, sub }) => (
  <div className={`rounded-2xl border p-3.5 min-w-0 ${tone === "accent" ? "border-amber-500/30 bg-amber-950/30" : "border-[var(--border)] bg-[var(--surface)]"}`}>
    <div className="flex items-center gap-1.5 text-2xs font-bold text-[var(--text-muted)]">{icon}{label}</div>
    <div className="mt-1.5 text-xl font-black text-[var(--text)] tabular-nums leading-tight">{children}</div>
    {sub && <div className="mt-1 text-2xs text-[var(--text-faint)] leading-snug">{sub}</div>}
  </div>
);

// Nút chọn kiểu seg-on của app (accent 18%, viền 45%).
const Seg: React.FC<{ label: string; value: string; options: { v: string; text: string }[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
  <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1">
    {options.map((o) => (
      <button
        key={o.v}
        type="button"
        onClick={() => onChange(o.v)}
        aria-pressed={value === o.v}
        className={`min-h-8 px-2.5 rounded-lg border text-xs ${value === o.v ? "seg-on" : "border-[var(--border-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
      >
        {o.text}
      </button>
    ))}
  </div>
);

const RoleTag: React.FC<{ role: "host" | "assistant" }> = ({ role }) => (
  <span className={`inline-flex items-center h-5 px-2 rounded-full border text-2xs font-bold ${role === "host" ? "seg-on" : "border-[var(--border-muted)] text-[var(--text-muted)]"}`}>
    {role === "host" ? "Host" : "Trợ live"}
  </span>
);

// Ô trống phải nói VÌ SAO trống, không in số 0. Số 0 ở màn hồ sơ của chính mình đọc như "lương của bạn bằng 0" — ops CHƯA NHẬP
// rate ở 33/33 talent (30/09).
const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="font-normal text-[var(--text-faint)]">{children}</span>;

export const MyTalentProfile: React.FC<MyTalentProfileProps> = ({
  activeUser,
  talents,
  sessions,
  payrollSessions,
  financeRecords,
  talentRateHistory,
  onOpenAccount
}) => {
  const myTalent = talents.find((t) => t.id === activeUser.assignedTalentId);

  const [incomeMonth, setIncomeMonth] = useState(() => todayVn().slice(0, 7));
  const [perfPeriod, setPerfPeriod] = useState<"month" | "90d">("90d");
  const [perfRole, setPerfRole] = useState<"all" | "host" | "assistant">("all");
  const [perfPlatform, setPerfPlatform] = useState<"all" | "TikTok" | "Shopee">("all");
  const [logBrand, setLogBrand] = useState("all");

  const financeBySessionId = useMemo(() => {
    const map: Record<string, SessionFinance> = {};
    for (const f of financeRecords) map[f.sessionId] = f;
    return map;
  }, [financeRecords]);

  const talentById = useMemo(() => {
    const map: Record<string, Talent> = {};
    for (const t of talents) map[t.id] = t;
    return map;
  }, [talents]);

  // rateHidden = rate của mình bị mask — tính thu nhập lúc này sẽ ra số SAI (rate đã bị zero-hoá), nên bỏ tính hẳn.
  const income = useMemo(() => {
    if (!myTalent || myTalent.rateHidden) return { rows: [], total: 0, missingRate: false };
    return computeTalentMonthlyIncome(payrollSessions, myTalent.id, incomeMonth, financeBySessionId, talentById, talentRateHistory);
  }, [payrollSessions, myTalent, incomeMonth, financeBySessionId, talentById, talentRateHistory]);
  const incomeBySession = useMemo(() => {
    const m = new Map<string, { hours: number; payout: number }>();
    for (const r of income.rows) {
      const cur = m.get(r.session.id) ?? { hours: 0, payout: 0 };
      m.set(r.session.id, { hours: cur.hours + r.billableHours, payout: cur.payout + r.payout });
    }
    return m;
  }, [income]);

  // Ca đã chạy đọc `payrollSessions` (gồm ca loại khỏi báo cáo — vẫn là giờ đã làm); hiệu suất đọc `sessions` (activeSessions).
  const month = useMemo(() => (myTalent ? monthSummary(payrollSessions, myTalent.id, incomeMonth) : null), [payrollSessions, myTalent, incomeMonth]);
  const monthDone = useMemo(
    () =>
      myTalent
        ? payrollSessions
            .filter((s) => s.date.startsWith(incomeMonth) && s.status === "Completed" && myRole(s, myTalent.id))
            .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
        : [],
    [payrollSessions, myTalent, incomeMonth]
  );

  // Hiệu suất theo brand × sàn × vai: kỳ "Tháng" theo tháng đang chọn, kỳ "90 ngày" tính tới hôm nay.
  const today = todayVn();
  const perfRows90 = useMemo(() => myChannelRoleSummary(sessions, myTalent?.id, addDays(today, -90), today), [sessions, myTalent, today]);
  const perfRowsMonth = useMemo(() => myChannelRoleSummary(sessions, myTalent?.id, `${incomeMonth}-01`, `${incomeMonth}-31`), [sessions, myTalent, incomeMonth]);
  const perfRows = (perfPeriod === "month" ? perfRowsMonth : perfRows90).filter(
    (r) => (perfRole === "all" || r.role === perfRole) && (perfPlatform === "all" || r.platform === perfPlatform)
  );
  const reach = channelReach(perfRows90);
  const monthLabel = `Tháng ${Number(incomeMonth.slice(5))}`;

  if (!activeUser.assignedTalentId || !myTalent) {
    return (
      <div className="max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-[var(--text-muted)]">
          Tài khoản của bạn chưa được gán hồ sơ Talent (assigned_talent_id) — liên hệ CEO/Admin để gán trước khi dùng trang này.
        </div>
      </div>
    );
  }

  const doneHours = month ? month.done.hostHours + month.done.coHours : 0;
  const leftHours = month?.upcoming.hours ?? 0;
  const noRate = (myTalent.ratePerHour || 0) === 0 && (myTalent.ratePerSession || 0) === 0;
  const rateText = myTalent.rateHidden ? (
    <Empty>chưa xem được</Empty>
  ) : (myTalent.ratePerHour || 0) > 0 ? (
    `${fmtVndFull(myTalent.ratePerHour || 0)}/giờ`
  ) : (myTalent.ratePerSession || 0) > 0 ? (
    `${fmtVndFull(myTalent.ratePerSession || 0)}/live`
  ) : (
    <Empty>ops chưa nhập</Empty>
  );

  const initials = myTalent.name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const progress = doneHours + leftHours > 0 ? (doneHours / (doneHours + leftHours)) * 100 : 0;
  const tableHours = monthDone.reduce((a, s) => a + (incomeBySession.get(s.id)?.hours ?? sessionMinutes(s) / 60), 0);
  const logBrands = [...new Set(monthDone.map((s) => s.brandName))];
  const logRows = monthDone.filter((s) => logBrand === "all" || s.brandName === logBrand);
  const incomeValue = myTalent.rateHidden ? (
    <span className="text-sm text-[var(--text-muted)]">chưa xem được</span>
  ) : income.rows.length === 0 ? (
    <span className="text-sm"><Empty>chưa có ca tính lương</Empty></span>
  ) : income.missingRate && income.total === 0 ? (
    <span className="text-sm"><Empty>ops chưa nhập rate</Empty></span>
  ) : (
    money(income.total)
  );
  const note = myTalent.rateHidden
    ? "Tài khoản của bạn chưa được liên kết đúng hồ sơ Talent nên chưa xem được Rate Card — báo Admin gán lại giúp."
    : noRate
      ? "Rate của bạn ops chưa nhập nên chưa tính được lương — nhờ ops nhập ở Talent Pool."
      : income.missingRate
        ? "Có ca trong tháng chưa được đặt rate, nên số thu nhập đang thiếu phần của những ca đó."
        : income.rows.length === 0 && monthDone.length > 0
          ? "Ca nạp bù từ file của tháng cũ không vào bảng lương ở đây — lương những tháng đó đã chốt ngoài app."
          : null;

  return (
    <div className="space-y-4 max-w-2xl lg:max-w-7xl">
      {/* 1. Danh tính + chọn tháng */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
        {/* Điện thoại không có thanh bên ⇒ tên/ảnh là cửa vào trang Tài khoản; từ md trở lên cửa vào là thẻ tên ở góc trái dưới. */}
        <button type="button" onClick={onOpenAccount} aria-label="Mở tài khoản của tôi" className="flex items-center gap-3 min-w-0 text-left md:pointer-events-none md:cursor-default">
          {myTalent.avatar ? (
            <img src={myTalent.avatar} alt="" className="w-11 h-11 rounded-full object-cover border border-[var(--border)]" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[var(--accent)]/15 text-[var(--accent-text)] font-black flex items-center justify-center text-sm">{initials}</div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[var(--text)] leading-tight truncate">{myTalent.name}</h2>
            <p className="text-xs text-[var(--text-muted)]">{talentRoleLabel(myTalent.role)} · rate {rateText}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--text-faint)] shrink-0 md:hidden" />
        </button>
        <MonthPicker value={incomeMonth} onChange={setIncomeMonth} size="sm" />
      </header>

      {/* Tháng này: 4 con số trả lời "tháng này tôi thế nào" trong một hàng */}
      {month && (
        <section aria-label="Tổng quan tháng" className="space-y-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Tile tone="accent" icon={<Wallet className="w-3.5 h-3.5" />} label="Thu nhập tạm tính">{incomeValue}</Tile>
            <Tile icon={<Clock className="w-3.5 h-3.5" />} label="Giờ đã làm" sub={month.upcoming.count > 0 ? `còn ${h1(leftHours)} · ${month.upcoming.count} ca đã chốt` : "không còn ca đã chốt"}>
              {h1(doneHours)}
            </Tile>
            <Tile icon={<Clapperboard className="w-3.5 h-3.5" />} label="Ca đã live" sub={month.done.count > 0 ? `${h1(month.done.hostHours)} host · ${h1(month.done.coHours)} trợ` : undefined}>
              {month.done.count > 0 ? `${month.done.count} ca` : <span className="text-sm"><Empty>chưa có</Empty></span>}
            </Tile>
            <Tile icon={<Store className="w-3.5 h-3.5" />} label="Đang làm cho" sub={reach.brands.length > 0 ? `${reach.brands.join(" · ")} · ${reach.platforms.length} sàn` : "90 ngày gần nhất"}>
              {reach.brands.length > 0 ? `${reach.brands.length} brand` : <span className="text-sm"><Empty>chưa có</Empty></span>}
            </Tile>
          </div>
          {doneHours + leftHours > 0 && (
            <div className="px-1">
              <div className="h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden" aria-hidden>
                <span className="block h-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-2xs text-[var(--text-faint)]">Tiến độ giờ công tháng: {h1(doneHours)} / {h1(doneHours + leftHours)} đã chốt</p>
            </div>
          )}
          {note && <p className="text-2xs text-[var(--text-faint)] px-1">{note}</p>}
        </section>
      )}

      {/* Hai bảng cùng một hàng: Hiệu suất (trái) + Bảng công (phải), dòng thứ N ngang nhau */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
        {/* Hiệu suất: chỉ số của chính mình theo brand × sàn × vai */}
        <section className={CARD} aria-label="Hiệu suất theo brand và vai">
          <div className={TOP_ROW}>
            <h3 className={SECTION_TITLE}>Hiệu suất của bạn theo brand và vai</h3>
            <Seg
              label="Kỳ"
              value={perfPeriod}
              onChange={(v) => setPerfPeriod(v as "month" | "90d")}
              options={[{ v: "month", text: monthLabel }, { v: "90d", text: "90 ngày" }]}
            />
          </div>
          <div className="min-h-[34px] flex flex-wrap items-center gap-x-4 gap-y-1">
            <Seg label="Vai" value={perfRole} onChange={(v) => setPerfRole(v as typeof perfRole)} options={[{ v: "all", text: "Tất cả vai" }, { v: "host", text: "Host" }, { v: "assistant", text: "Trợ live" }]} />
            <Seg label="Sàn" value={perfPlatform} onChange={(v) => setPerfPlatform(v as typeof perfPlatform)} options={[{ v: "all", text: "Cả hai sàn" }, { v: "TikTok", text: "TikTok" }, { v: "Shopee", text: "Shopee" }]} />
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <div className={PERF_MIN}>
              <div className={`${PERF_COLS} ${TH_ROW}`}>
                <span>Brand · sàn</span><span>Vai</span><span className="text-right">Ca</span><span className="text-right">Giờ</span><span className="text-right">{platformText("GMV", "all")}</span><span className="text-right">GMV/giờ</span>
              </div>
              {perfRows.length === 0 ? (
                <p className="text-xs text-[var(--text-faint)] py-6 text-center border-t border-[var(--border-muted)]">Chưa có ca nào khớp bộ lọc trong kỳ này.</p>
              ) : (
                perfRows.map((r) => (
                  <div key={`${r.brandId}|${r.platform}|${r.role}`} className={`${PERF_COLS} ${TD_ROW}`}>
                    <span className="font-black text-[var(--text)] flex items-center gap-1.5 min-w-0 overflow-hidden">{r.brandName} <PlatformChip platform={r.platform} /></span>
                    <span><RoleTag role={r.role} /></span>
                    <span className="text-right font-black tabular-nums text-[var(--text)]">{r.sessions}</span>
                    <span className="text-right font-black tabular-nums text-[var(--text)]">{hFixed(r.hours)}</span>
                    {/* Vai trợ: ô GMV để trống — GMV của ca tính cho host, cộng sang trợ là đếm đôi. */}
                    <span className="text-right tabular-nums text-[var(--text-muted)]">{r.role === "host" ? fmtVndShort(r.gmv) : ""}</span>
                    <span className="text-right tabular-nums text-[var(--text-muted)]">{r.role === "host" ? fmtVndShort(r.gmvPerHour) : ""}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <p className="text-2xs text-[var(--text-faint)]">Vai trợ live chỉ tính số ca và giờ. Vai host có thêm {platformText("GMV", "all")} của các ca bạn host. TikTok và Shopee luôn tách riêng.</p>
        </section>

        {/* Bảng công */}
        <section className={CARD} aria-label="Bảng công tháng">
          <div className={TOP_ROW}>
            <h3 className={SECTION_TITLE}>Bảng công{monthDone.length > 0 ? ` · ${monthDone.length} ca` : ""}</h3>
            <span className="text-2xs text-[var(--text-faint)]">thấy sai giờ thì báo OP</span>
          </div>
          <div className="min-h-[34px] flex items-center">
            {logBrands.length > 1 && (
              <Seg label="Lọc bảng công" value={logBrand} onChange={setLogBrand} options={[{ v: "all", text: "Tất cả" }, ...logBrands.map((b) => ({ v: b, text: b }))]} />
            )}
          </div>
          {monthDone.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] py-6 text-center">Tháng này chưa có ca nào đã live.</p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-1 px-1">
                <div className={LOG_MIN}>
                  <div className={`${LOG_COLS} ${TH_ROW}`}>
                    <span>Ngày</span><span>Brand · sàn</span><span>Vai</span><span className="text-right">Giờ</span><span className="text-right">Thành tiền</span>
                  </div>
                  <div className="max-h-[28rem] lg:max-h-[60vh] overflow-y-auto">
                    {logRows.map((s) => {
                      const pay = incomeBySession.get(s.id);
                      const asHost = myRole(s, myTalent.id) === "host";
                      return (
                        <div key={s.id} className={`${LOG_COLS} ${TD_ROW}`}>
                          <span className="text-[var(--text-muted)] tabular-nums">{dayLabel(s.date)}</span>
                          <span className="font-black text-[var(--text)] flex items-center gap-1.5 min-w-0 overflow-hidden">
                            {s.brandName} <PlatformChip platform={s.platform} />
                            <span className="text-2xs font-normal text-[var(--text-faint)]">{s.startTime}–{s.endTime}</span>
                          </span>
                          {/* GMV chỉ ở ca mình làm HOST — GMV của ca tính cho host (cùng luật assistSessionCount ở Talent Pool). */}
                          <span className="text-[var(--text-muted)]">
                            {asHost ? "Host" : "Trợ live"}
                            {asHost && s.actualGmv > 0 ? <span className="text-[var(--text-faint)]"> · {fmtVndShort(s.actualGmv)}</span> : null}
                          </span>
                          <span className="font-mono font-bold text-[var(--text)] text-right">{h1(pay?.hours ?? sessionMinutes(s) / 60)}</span>
                          <span className="font-mono text-right text-[var(--text-muted)]">{pay && pay.payout > 0 ? money(pay.payout) : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 px-1 text-xs font-black text-[var(--text)]">
                <span>Tổng tháng</span>
                <span className="font-mono">{h1(tableHours)}{!myTalent.rateHidden && income.total > 0 ? ` · ${money(income.total)}` : ""}</span>
              </div>
            </>
          )}
          <p className="text-2xs text-[var(--text-faint)]">Số tạm tính theo rate hiện tại — có thể đổi khi ca chưa đối soát xong hoặc rate vừa được cập nhật.</p>
        </section>
      </div>
    </div>
  );
};
