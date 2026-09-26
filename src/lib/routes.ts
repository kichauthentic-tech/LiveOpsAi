// Đường link cho từng trang (audit UX 2026-09-26, P1). App không có router — tab và workspace là state
// trong App.tsx, lưu localStorage — nên URL luôn là "/": không gửi được link "Report Tháng CROCS" cho
// ai, nút Back thoát khỏi app, F5 phụ thuộc localStorage của máy. Module này chỉ ánh xạ hai chiều
// (tab + workspace) ↔ pathname; App.tsx đẩy URL theo state và đọc lại khi mở link / bấm Back.
//
// Slug cố định theo id tab (KHÔNG suy từ nhãn menu) để đổi tên menu không làm gãy link đã gửi.
//   Agency:  /so-ca, /ke-hoach-thang, ...        Brand: /brand/crocs/report-thang, ...

export type RouteWorkspace = { type: "agency" } | { type: "brand"; brandId: string };

const AGENCY_TAB_SLUGS: Record<string, string> = {
  agency_overview: "dashboard",
  month_plan: "ke-hoach-thang",
  shift_scheduling: "nhan-su-ca",
  calendar: "bang-van-hanh",
  sessions: "so-ca",
  live_reconciliation: "doi-soat",
  ops_support: "ho-tro-van-hanh",
  host_performance: "hieu-suat-host",
  brands_overview: "toan-canh-brand",
  report_publish_board: "phat-hanh-report",
  talents: "talent-pool",
  studios: "studios",
  crm: "crm",
  brand_commitment: "cam-ket-hop-dong",
  tiktok_api: "tiktok-api",
  finance: "finance",
  user_settings: "phan-quyen",
  ai_training: "ai-training",
  account_settings: "tai-khoan",
  // talent
  my_shifts: "ca-cua-toi",
  my_talent_profile: "ho-so"
};

const BRAND_TAB_SLUGS: Record<string, string> = {
  brand_calendar: "lich",
  brand_sessions: "so-ca",
  brand_skus: "sku",
  brand_monthly_report: "report-thang",
  brand_commitment_view: "cam-ket",
  brand_next_month_plan: "ke-hoach-thang-sau",
  brand_rate_card: "rate-card",
  brand_affiliate: "affiliate",
  brand_ads_report: "nhap-ads",
  brand_dataraw: "du-lieu-goc",
  account_settings: "tai-khoan"
};

const invert = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const AGENCY_SLUG_TO_TAB = invert(AGENCY_TAB_SLUGS);
const BRAND_SLUG_TO_TAB = invert(BRAND_TAB_SLUGS);

/** "Franklin Sports" → "franklin-sports". Bỏ dấu tiếng Việt, đ → d. */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function brandSlug(brand: { id: string; name: string }): string {
  return slugify(brand.name) || brand.id;
}

/** null khi chưa dựng được link (brand chưa nạp xong / tab không có slug) — App giữ nguyên URL. */
export function routeToPath(
  workspace: RouteWorkspace,
  tab: string,
  brands: { id: string; name: string }[]
): string | null {
  if (workspace.type === "agency") {
    const slug = AGENCY_TAB_SLUGS[tab];
    return slug ? `/${slug}` : null;
  }
  const brand = brands.find((b) => b.id === workspace.brandId);
  const slug = BRAND_TAB_SLUGS[tab];
  if (!brand || !slug) return null;
  return `/brand/${brandSlug(brand)}/${slug}`;
}

export type ParsedPath =
  | { type: "agency"; tab: string }
  | { type: "brand"; brandSlug: string; tab: string | null };

/** Đọc pathname. Brand chỉ trả slug — App đối chiếu với danh sách brand khi đã nạp. */
export function parsePath(pathname: string): ParsedPath | null {
  const parts = pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p).toLowerCase());
  if (parts.length === 0) return null;
  if (parts[0] === "brand") {
    if (!parts[1]) return null;
    return { type: "brand", brandSlug: parts[1], tab: parts[2] ? BRAND_SLUG_TO_TAB[parts[2]] ?? null : null };
  }
  const tab = AGENCY_SLUG_TO_TAB[parts[0]];
  return tab ? { type: "agency", tab } : null;
}

export function findBrandBySlug<B extends { id: string; name: string }>(brands: B[], slug: string): B | undefined {
  return brands.find((b) => brandSlug(b) === slug || b.id === slug);
}
