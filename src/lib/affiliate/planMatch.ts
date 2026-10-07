import { parsePlanTimeline } from "./plan";

// Khớp phiên trong file Live Analysis với dòng KẾ HOẠCH (migration 0155). Thuần, có unit test
// (tests/affiliatePlan.test.ts) — UI ở BrandAffiliateTable chỉ lo hiển thị và áp dụng.
//
// Vì sao khớp theo tên mờ: tên trong sheet kế hoạch là tên ops gọi ("Khói", "Mạnh Ka"), tên trong file là tên creator trên
// TikTok ("Kiot Khói", "Mạnh Ka - Giày Thể Thao Crocs …"). Hai tên khớp khi mọi từ của tên ngắn hơn nằm trong tên dài hơn
// (bỏ dấu, bỏ hoa thường). Cùng ngày có 2 creator trùng từ ("Linh Ân" ↔ "Linh Chi") thì giờ bắt đầu gần nhất thắng.

/** "Kiot Khói" → "kiot khoi": bỏ dấu, chữ thường, ký tự lạ thành khoảng trắng. */
export function normalizeName(s?: string | null): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Hai tên có phải cùng một creator: mọi từ của tên ngắn hơn đều nằm trong tên dài hơn. Tên rỗng không khớp gì. */
export function sameCreator(a?: string | null, b?: string | null): boolean {
  const ta = normalizeName(a).split(" ").filter(Boolean);
  const tb = normalizeName(b).split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const set = new Set(long);
  return short.every((t) => set.has(t));
}

export interface PlannedRef {
  key: string;
  /** "YYYY-MM-DD" */
  date: string;
  creatorName: string;
  /** Timeline kế hoạch ("10h - 18h"); trống thì khớp theo ngày + creator, không so giờ. */
  planTimelineLabel?: string;
}

export interface SessionRef {
  key: string;
  date: string;
  creatorName: string;
  nickname?: string;
  /** Timeline thực từ file ("10:15 - 18:00"). */
  timelineLabel?: string;
}

export interface MatchPair {
  planKey: string;
  sessionKey: string;
  /** Giờ bắt đầu thực − kế hoạch, phút (dương = vào trễ); null khi thiếu một trong hai. */
  startDiffMin: number | null;
}

export interface PlanMatchResult {
  pairs: MatchPair[];
  /** Phiên có trong file nhưng không có dòng kế hoạch nào — "ngoài kế hoạch". */
  unplannedSessions: string[];
  /** Dòng kế hoạch không có phiên nào trong file. */
  unmatchedPlans: string[];
}

const startOf = (label?: string) => parsePlanTimeline(label)?.startMin ?? null;

/**
 * Ghép tham lam từng cặp có CÙNG NGÀY và cùng creator, ưu tiên cặp lệch giờ bắt đầu ít nhất; mỗi dòng kế hoạch và mỗi
 * phiên chỉ vào một cặp. Cặp thiếu giờ ở một bên xếp sau mọi cặp có giờ.
 */
export function matchPlanToSessions(planned: PlannedRef[], sessions: SessionRef[]): PlanMatchResult {
  interface Cand { p: PlannedRef; s: SessionRef; diff: number | null }
  const cands: Cand[] = [];
  for (const p of planned) {
    const ps = startOf(p.planTimelineLabel);
    for (const s of sessions) {
      if (s.date !== p.date) continue;
      if (!sameCreator(p.creatorName, s.creatorName) && !sameCreator(p.creatorName, s.nickname)) continue;
      const ss = startOf(s.timelineLabel);
      cands.push({ p, s, diff: ps == null || ss == null ? null : ss - ps });
    }
  }
  cands.sort((a, b) => (a.diff == null ? 1e9 : Math.abs(a.diff)) - (b.diff == null ? 1e9 : Math.abs(b.diff)));

  const usedPlan = new Set<string>();
  const usedSession = new Set<string>();
  const pairs: MatchPair[] = [];
  for (const c of cands) {
    if (usedPlan.has(c.p.key) || usedSession.has(c.s.key)) continue;
    usedPlan.add(c.p.key);
    usedSession.add(c.s.key);
    pairs.push({ planKey: c.p.key, sessionKey: c.s.key, startDiffMin: c.diff });
  }
  return {
    pairs,
    unplannedSessions: sessions.filter((s) => !usedSession.has(s.key)).map((s) => s.key),
    unmatchedPlans: planned.filter((p) => !usedPlan.has(p.key)).map((p) => p.key)
  };
}
