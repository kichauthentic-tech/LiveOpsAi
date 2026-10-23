import React, { useMemo } from "react";
import type { Brand, LiveSession } from "../../../types";
import { addDays } from "../../../lib/dateUtils";
import { dataCoverage } from "../../../lib/performance/channelHealth";
import { ranIn } from "../../../lib/performance/periodCompare";
import { platformOf, type ReportPlatform } from "../../../lib/reportPlatform";
import { HeatCard, HostTable, PairTable, ShiftLenCard, type Scope } from "./opsBlocks";
import { rangeLabel, Sect } from "./ui";

// Host, Cặp host + trợ live, Khung giờ, Độ dài ca của CẢ SÀN (mọi brand) — chuyển từ tab Toàn sàn của Dashboard sang màn Hiệu Suất
// Host (24/10/2026, demo Tổng quan account): việc của trainer/ops khi xếp người, không phải con số cấp quản lý cần mỗi ngày.
// Kỳ = kỳ đang chọn ở Hiệu Suất Host, cắt ở ngày dữ liệu đầy đủ; so với cùng ngày tháng trước (kỳ tháng) hoặc kỳ ngay trước cùng độ dài.

/** Lùi một tháng, giữ ngày (kẹp về cuối tháng nếu tháng trước ngắn hơn). */
function prevMonthDay(d: string): string {
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return `${py}-${String(pm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
const spanOf = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

export const TeamBlocks: React.FC<{ platform: ReportPlatform; sessions: LiveSession[]; brands: Brand[]; from: string; to: string; byMonth: boolean; today: string }> = ({ platform, sessions, brands, from, to, byMonth, today }) => {
  const plat = useMemo(() => sessions.filter((s) => platformOf(s) === platform && brands.some((b) => b.id === s.brandId)), [sessions, platform, brands]);
  const complete = useMemo(() => dataCoverage(plat, today).completeThrough, [plat, today]);
  const end = complete && complete < to ? complete : to;
  const s: Scope | null = useMemo(() => {
    if (end < from) return null;
    const [ps, pe] = byMonth ? [prevMonthDay(from), prevMonthDay(end)] : [addDays(from, -spanOf(from, end)), addDays(from, -1)];
    return { cur: ranIn(plat, from, end), prev: ranIn(plat, ps, pe), label: rangeLabel(from, end), prevLabel: rangeLabel(ps, pe) };
  }, [plat, from, end, byMonth]);
  return (
    <section className="space-y-4" aria-label={`Toàn sàn ${platform}`}>
      <Sect title={`Toàn sàn ${platform} · mọi brand`} sub="Host, cặp host + trợ live, khung giờ, độ dài ca — chỉ số 100 = GMV/giờ trung bình của chính kênh đó, nên quy mô brand không làm lệch so sánh" />
      {!s ? <p className="text-sm text-[var(--text-faint)]">Kỳ này chưa có ngày nào đủ số liệu.</p> : (
        <>
          <HostTable s={s} brands={brands} showBrand title="Host" weakBelow={8} />
          <PairTable s={s} brands={brands} weakBelow={4} />
          <div className="grid gap-4 xl:grid-cols-2 items-start [&>*]:min-w-0">
            <HeatCard s={s} />
            <ShiftLenCard s={s} />
          </div>
        </>
      )}
    </section>
  );
};
