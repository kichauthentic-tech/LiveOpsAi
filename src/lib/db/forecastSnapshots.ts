import { supabase } from "../supabaseClient";
import type { ReportPlatform } from "../reportPlatform";

// Sổ độ chính xác dự báo GMV tháng (migration 0163, engine target v3 phần P7). Ghi qua RPC record_forecast_snapshots
// (ceo/operations/admin), đọc thẳng bảng (RLS cùng nhóm role). Chưa chạy 0163 ⇒ ghi bị bỏ qua lặng lẽ, đọc trả `missing`.

export type ForecastSnapshotKind = "plan" | "daily";

export interface ForecastSnapshotInput {
  brandId: string;
  platform: ReportPlatform;
  /** "YYYY-MM". */
  month: string;
  /** "YYYY-MM-DD" (giờ VN). */
  asOf: string;
  kind: ForecastSnapshotKind;
  p50: number;
  lo?: number | null;
  hi?: number | null;
  actual?: number | null;
  target?: number | null;
  seenShare?: number | null;
  ratio?: number | null;
}

export interface ForecastSnapshot extends ForecastSnapshotInput {
  recordedAt: string;
}

const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);
const finite = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);

let missing = false;

/** Ghi (upsert theo kênh × tháng × ngày × loại). Trả số dòng đã ghi; 0 khi DB chưa có 0163. Lỗi khác ném ra. */
export async function recordForecastSnapshots(rows: ForecastSnapshotInput[]): Promise<number> {
  if (missing || rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    brand_id: r.brandId,
    platform: r.platform,
    month: `${r.month}-01`,
    as_of: r.asOf,
    kind: r.kind,
    p50: Math.max(0, Math.round(r.p50)),
    lo: finite(r.lo) === null ? null : Math.max(0, Math.round(r.lo!)),
    hi: finite(r.hi) === null ? null : Math.max(0, Math.round(r.hi!)),
    actual: finite(r.actual) === null ? null : Math.max(0, Math.round(r.actual!)),
    target: finite(r.target) === null ? null : Math.max(0, Math.round(r.target!)),
    seen_share: finite(r.seenShare) === null ? null : Math.min(1, Math.max(0, r.seenShare!)),
    ratio: finite(r.ratio)
  }));
  const { data, error } = await supabase.rpc("record_forecast_snapshots", { p_rows: payload });
  if (error) {
    if (MISSING.has(error.code ?? "")) {
      missing = true;
      return 0;
    }
    throw error;
  }
  return Number(data) || 0;
}

/** Mọi dòng của một kênh (cũ → mới). `missing` = DB chưa chạy 0163. */
export async function fetchForecastSnapshots(brandId: string, platform: ReportPlatform): Promise<{ rows: ForecastSnapshot[]; missing: boolean }> {
  const { data, error } = await supabase
    .from("forecast_snapshots")
    .select("brand_id,platform,month,as_of,kind,p50,lo,hi,actual,target,seen_share,ratio,recorded_at")
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .order("as_of", { ascending: true })
    .limit(2000);
  if (error) {
    if (MISSING.has(error.code ?? "")) return { rows: [], missing: true };
    throw error;
  }
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    missing: false,
    rows: ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      brandId: String(r.brand_id),
      platform: r.platform as ReportPlatform,
      month: String(r.month).slice(0, 7),
      asOf: String(r.as_of),
      kind: r.kind as ForecastSnapshotKind,
      p50: Number(r.p50),
      lo: num(r.lo),
      hi: num(r.hi),
      actual: num(r.actual),
      target: num(r.target),
      seenShare: num(r.seen_share),
      ratio: num(r.ratio),
      recordedAt: String(r.recorded_at)
    }))
  };
}
