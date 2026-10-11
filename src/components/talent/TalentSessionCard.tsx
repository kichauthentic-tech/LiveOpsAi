import React from "react";
import type { Brand, LiveSession, Talent } from "../../types";
import { getBrandTheme } from "../../lib/brandTheme";
import { SESSION_TONE, SessionEventCard, buildDurationBadge, buildPctBadge, buildSessionMeta } from "../ui/SessionEventCard";

// Thẻ ca của app talent = ĐÚNG thẻ ca của lịch agency (SessionEventCard + buildSessionMeta), chỉ thêm chip "Bạn". Talent thấy
// số như ops (user chốt 11/10, phương án A) nên giữ cả viên Target + % Target + huy hiệu OT/Off.
export const TalentSessionCard: React.FC<{
  session: LiveSession;
  brand?: Brand;
  talents: Talent[];
  meId?: string;
  /** Viền đỏ: người xem bị xếp hai ca chồng giờ. */
  clash?: boolean;
  onOpen: (id: string) => void;
}> = ({ session: s, brand, talents, meId, clash, onOpen }) => (
  <SessionEventCard
    theme={getBrandTheme(s.brandName)}
    brand={brand}
    brandName={s.brandName}
    platform={s.platform}
    startTime={s.startTime}
    endTime={s.endTime}
    title={s.studioName || undefined}
    meta={buildSessionMeta(s, (id) => (id ? talents.find((t) => t.id === id) : undefined), undefined, meId)}
    durationBadge={buildDurationBadge(s, "agency")}
    pctBadge={buildPctBadge(s, "agency")}
    targetGmv={s.targetGmv}
    tone={SESSION_TONE[s.status]}
    className={clash ? "ring-2 ring-rose-500" : undefined}
    tooltip={`${s.brandName} · ${s.platform} · ${s.studioName || "chưa có phòng"}`}
    onClick={() => onOpen(s.id)}
  />
);
