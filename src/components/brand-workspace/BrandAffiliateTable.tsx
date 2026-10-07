import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AffiliateActualEntry, AffiliatePlanMonth, LiveSession, UserRole } from "../../types";
import { fetchAffiliateActuals, replaceAffiliateActuals } from "../../lib/db/affiliateActuals";
import { fetchAffiliatePlanMonth, upsertAffiliatePlanMonth } from "../../lib/db/affiliatePlanMonths";
import { CampOverrides, effectiveCamp } from "../../lib/campaignDays";
import { fetchMonthPlan } from "../../lib/db/monthPlans";
import { fetchAffiliateLiveSessions } from "../../lib/dataraw/affiliateLiveSessionSlice";
import type { AffiliateLiveSessionRow } from "../../lib/dataraw/affiliateLiveRows";
import {
  AffiliateRow,
  DEFAULT_FX_RATE,
  PastedPlanRow,
  dayLabelOf,
  defaultAffiliatePlanMonth,
  entryStatus,
  parseDayLabel,
  parsePlanPaste,
  planBudget,
  planGmvPerHour,
  planHours,
  planTotals,
  sortPlanRows,
  suggestCampName,
  toUsd
} from "../../lib/affiliate/plan";
import { matchPlanToSessions, sameCreator } from "../../lib/affiliate/planMatch";
import { errorMessage } from "../../lib/errorMessage";
import { downloadRowsAsXlsx } from "../../lib/exportXlsx";
import { useToast } from "../../hooks/useToast";
import { BarChart3, CalendarDays, ClipboardPaste, Database, Download, Link2, Loader2, Lock, Plus, Save, Send, Trash2, Undo2, Users } from "lucide-react";
import { metricHint } from "../../lib/metricGlossary";

import { fmtFixed, fmtMonth, fmtVndFull } from "../../lib/format";
import { MonthPicker } from "../common/MonthPicker";
import { AffiliatePlanTable, CAMPAIGN_STYLE, CAMPAIGN_TYPES } from "./AffiliatePlanTable";
// Trang Affiliate (2026-09-22) — tách RIÊNG khỏi form Report Tháng theo yêu cầu ops. Hai chế độ xem (0155, 2026-10-08):
//   • KẾ HOẠCH — bảng dạng sheet ops vẫn lập hằng tháng (AffiliatePlanTable); dán thẳng từ Google Sheet; "Chốt, gửi brand"
//     thì brand mới thấy (sau chốt vẫn sửa được, brand thấy ngay).
//   • THEO DÕI — bảng phân tích theo đúng file ops: mỗi PHIÊN LIVE là 1 CỘT, mỗi chỉ số là 1 DÒNG, các cột gom theo tháng.
// Số thực tế nạp từ file "Live Analysis" (Dữ Liệu Gốc) rồi KHỚP vào dòng kế hoạch (ngày + creator); phiên không có kế
// hoạch vào bảng như phiên "Ngoài kế hoạch".
//
// Dữ liệu vẫn nằm ở brand_affiliate_actuals (migration 0067 + 0102 + 0155) — một dòng đi từ kế hoạch tới có số, nên
// không có bảng thứ hai để lệch nhau. Lưu theo từng tháng (replace cả tháng) vì replaceAffiliateActuals() khoá theo
// (brand_id, period_month).

interface BrandAffiliateTableProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  currentRole: UserRole;
  // Nhảy sang tab "Dữ Liệu Gốc" — trước đây openImport() chỉ NHẮC tên tab bằng chữ trong thông
  // báo lỗi khi chưa có batch Live Analysis, ops phải tự tìm trong sidebar. Chỉ được gọi từ
  // đường canManage (nút "Nạp Từ Dữ Liệu Gốc" đã tự gate canManage) nên không cần gate lại ở đây.
  onOpenDataRaw?: () => void;
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  // Chặn 36 vòng: from > to (ops kéo ngược) thì trả mảng rỗng thay vì lặp vô hạn.
  for (let guard = 0; guard < 36 && (y < ty || (y === ty && m <= tm)); guard++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fmtInt = (n?: number | null) => (n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString("vi-VN"));
const fmtPct = (n?: number | null, d = 2) => (n == null || Number.isNaN(n) ? "—" : `${fmtFixed(n, d)}%`);
const fmtNum = (n?: number | null, d = 1) => (n == null || Number.isNaN(n) ? "—" : fmtFixed(n, d));

// "2026-09-03" -> "3/9/2026" (đúng dạng dòng "Day" trong file ops).
const dayLabel = dayLabelOf;

// Entry trong state mang thêm _key cục bộ: update()/removeEntry() phải khớp theo khoá ỔN ĐỊNH,
// không khớp theo tham chiếu object — sửa 2 ô của cùng 1 cột trong cùng một nhịp (hoặc thao tác
// tự động) sẽ tạo object mới ở lần đầu, làm lần sau không tìm thấy dòng và mất thay đổi.
// _key không bao giờ xuống DB: replaceAffiliateActuals() chỉ map các cột có tên rõ ràng.
type Row = AffiliateRow;

let keySeq = 0;
const nextKey = () => `r${++keySeq}`;

const todayVn = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

// Phần THỰC TẾ của một phiên trong file Live Analysis — ghi vào dòng kế hoạch đã khớp, hoặc dòng mới nếu phiên không có
// kế hoạch. Các trường ops phải tự nhập (targetGmv / adsCost / campaignType) cố ý KHÔNG đụng tới, không đoán.
function sessionActuals(r: AffiliateLiveSessionRow): Partial<AffiliateActualEntry> {
  return {
    timelineLabel: r.timelineLabel,
    // Làm tròn 1 chữ số như file ops; phiên TikTok gộp nhiều ngày (vd "74h 48min") vẫn giữ nguyên
    // số thật ở đây để ops thấy mà sửa, không tự bịa lại.
    durationHours: Math.round(r.durationHours * 10) / 10,
    directGmv: r.directGmv,
    orders: r.orders,
    itemsSold: r.itemsSold,
    avgPrice: r.avgPrice,
    viewer: r.viewer,
    liveImpressions: r.liveImpressions,
    ctr: r.ctrLive == null ? undefined : Math.round(r.ctrLive * 100) / 100,
    ctor: r.ctor
  };
}

// Phiên trong file KHÔNG có dòng kế hoạch -> dòng mới của tháng tương ứng, đã live ("ngoài kế hoạch").
function rowToEntry(brandId: string, r: AffiliateLiveSessionRow): Row {
  return {
    _key: nextKey(),
    brandId,
    periodMonth: `${r.date.slice(0, 7)}-01`,
    creatorName: r.creatorName || r.nickname,
    liveDateLabel: dayLabel(r.date),
    status: "done",
    ...sessionActuals(r)
  };
}

// Cột theo dõi sắp theo ngày live (rồi giờ bắt đầu thực): phiên khớp vào dòng kế hoạch giữ thứ tự cũ của dòng kế hoạch nên không
// thể dựa vào sortOrder. Cột chưa có ngày hợp lệ xuống cuối theo thứ tự thêm.
function byLiveDate(a: Row, b: Row): number {
  const da = parseDayLabel(a.liveDateLabel) ?? "9999";
  const db = parseDayLabel(b.liveDateLabel) ?? "9999";
  if (da !== db) return da.localeCompare(db);
  const ta = a.timelineLabel ?? "";
  const tb = b.timelineLabel ?? "";
  return ta !== tb ? ta.localeCompare(tb) : (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

// Dòng đã có kế hoạch = có khung giờ/target/ngân sách kế hoạch (dòng cũ trước 0155 chỉ có target gõ tay cũng tính).
const hasPlan = (e: AffiliateActualEntry) => !!(e.planTimelineLabel || e.targetGmv != null || e.planBudgetAds != null);

export function BrandAffiliateTable({ brandId, brandName, sessions, currentRole, onOpenDataRaw }: BrandAffiliateTableProps) {
  const canManage = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";

  const [mode, setMode] = useState<"plan" | "track">("plan");
  const [fromMonth, setFromMonth] = useState(() => addMonths(thisMonth(), -3));
  const [toMonth, setToMonth] = useState(thisMonth);
  // Tháng đang LẬP kế hoạch: từ ngày 20 mở sẵn tháng sau (ops lập kế hoạch cuối tháng).
  const [planMonth, setPlanMonth] = useState(() => defaultAffiliatePlanMonth(todayVn()));
  const [entries, setEntries] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // true khi openImport() không tìm thấy batch Live Analysis nào — errorMsg là string thô nên
  // không nhúng được nút bấm; cờ riêng để render nút "Mở Dữ Liệu Gốc" cạnh thông báo lỗi đó.
  const [missingDataraw, setMissingDataraw] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Trạng thái tháng đang lập (0155): tỷ giá + đã chốt chưa. metaMissing = DB chưa chạy migration 0155.
  const [monthMeta, setMonthMeta] = useState<AffiliatePlanMonth | null>(null);
  const [metaMissing, setMetaMissing] = useState(false);
  const [fx, setFx] = useState(DEFAULT_FX_RATE);
  const [fxDirty, setFxDirty] = useState(false);
  const [campCtx, setCampCtx] = useState<{ overrides?: CampOverrides; shopTarget?: number }>({});
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<AffiliateLiveSessionRow[] | null>(null);
  const [importPicked, setImportPicked] = useState<Set<string>>(new Set());
  // Dòng kế hoạch đã qua ngày mà file không có phiên — ops tick để đánh dấu "Huỷ / dời".
  const [cancelPicked, setCancelPicked] = useState<Set<string>>(new Set());
  // Ô đang được gõ — xem numInput() bên dưới.
  const [focusedCell, setFocusedCell] = useState<string | null>(null);

  const rangeMonths = useMemo(() => monthsBetween(fromMonth, toMonth), [fromMonth, toMonth]);
  // Nạp/lưu gộp cả dải theo dõi lẫn tháng đang lập: đổi chế độ xem không làm mất thay đổi chưa lưu.
  const months = useMemo(() => [...new Set([...rangeMonths, planMonth])].sort(), [rangeMonths, planMonth]);

  // Nickname tài khoản shop lấy từ chính ca của brand — dùng để đánh dấu dòng KHÔNG phải affiliate
  // khi nạp (batch Live Analysis xuất ở view mặc định chỉ toàn dòng của shop).
  const shopHandle = useMemo(
    () => sessions.find((s) => s.brandId === brandId && s.shopTikTokHandle)?.shopTikTokHandle,
    [sessions, brandId]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const all = await Promise.all(months.map((m) => fetchAffiliateActuals(brandId, `${m}-01`)));
      setEntries(all.flat().map((e) => ({ ...e, _key: nextKey() })));
      setDirty(false);
      setSavedAt(null);
    } catch (e) {
      setErrorMsg(errorMessage(e, "Không tải được dữ liệu Affiliate"));
    } finally {
      setLoading(false);
    }
  }, [brandId, months]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Tỷ giá + trạng thái chốt của tháng đang lập, và khung camp / KPI cả shop từ Kế Hoạch Tháng (camp gợi ý theo ngày dùng
  // đúng khoảng ngày camp ops đã đặt ở đó — một chỗ nhập).
  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        const m = await fetchAffiliatePlanMonth(brandId, `${planMonth}-01`);
        if (stale) return;
        setMonthMeta(m);
        setFx(m?.fxRate ?? DEFAULT_FX_RATE);
        setMetaMissing(false);
      } catch (e) {
        if (stale) return;
        setMonthMeta(null);
        setFx(DEFAULT_FX_RATE);
        // Chưa chạy 0155 → bảng chưa có; lỗi khác (mạng…) cũng không chặn bảng, chỉ báo.
        if (/brand_affiliate_plan_months|schema cache|does not exist/i.test(errorMessage(e, ""))) setMetaMissing(true);
        else setErrorMsg(errorMessage(e, "Không tải được trạng thái kế hoạch Affiliate"));
      }
      try {
        const mp = await fetchMonthPlan(brandId, planMonth);
        if (!stale) setCampCtx({ overrides: effectiveCamp(mp?.plan.campRanges), shopTarget: mp?.plan.shopTargetGmv });
      } catch {
        if (!stale) setCampCtx({});
      }
    })();
    return () => {
      stale = true;
    };
  }, [brandId, planMonth]);

  // Đổi tháng khi còn thay đổi chưa lưu sẽ nạp lại và mất sạch — chặn, bắt lưu trước.
  const guardDirty = (apply: () => void) => {
    if (dirty || fxDirty) {
      setErrorMsg("Còn thay đổi chưa lưu — bấm Lưu trước khi đổi tháng.");
      return;
    }
    apply();
  };

  // Cột hiển thị ở chế độ THEO DÕI: chỉ phiên đã live, gom theo tháng (chỉ tháng nằm trong dải đang xem), trong tháng sắp theo ngày live.
  const columns = useMemo(() => {
    const byMonth = new Map<string, Row[]>();
    for (const e of entries) {
      if (entryStatus(e) !== "done") continue;
      const m = e.periodMonth.slice(0, 7);
      if (!rangeMonths.includes(m)) continue;
      const list = byMonth.get(m) ?? [];
      list.push(e);
      byMonth.set(m, list);
    }
    return rangeMonths
      .filter((m) => byMonth.has(m))
      .map((m) => ({ month: m, items: (byMonth.get(m) ?? []).slice().sort(byLiveDate) }));
  }, [entries, rangeMonths]);

  const flatColumns = useMemo(() => columns.flatMap((g) => g.items), [columns]);

  // Dòng của tháng đang lập. Brand không thấy phiên đã huỷ/dời.
  const planRows = useMemo(
    () => entries.filter((e) => e.periodMonth.slice(0, 7) === planMonth && (canManage || entryStatus(e) !== "cancelled")),
    [entries, planMonth, canManage]
  );

  // Xuất Excel (chế độ THEO DÕI) — mỗi cột (1 phiên/creator) đang hiện trên bảng thành 1 dòng, đúng dải tháng đang
  // lọc. Bảng UI xoay ngang (chỉ số theo dòng, phiên theo cột) chỉ để đọc trên màn; ra Excel thì
  // trả về chiều thường (mỗi dòng 1 phiên) cho dễ lọc/pivot tiếp.
  const { showToast } = useToast();
  const handleExport = () => {
    downloadRowsAsXlsx(
      "Affiliate",
      flatColumns.map((e) => ({
        "Tháng": e.periodMonth.slice(0, 7),
        "Creator": e.creatorName,
        "Camp": e.campName ?? "",
        "Campaign Type": e.campaignType ?? "",
        "Ngày Live": e.liveDateLabel ?? "",
        "Timeline": e.timelineLabel ?? "",
        "Target GMV": e.targetGmv ?? "",
        "Direct GMV": e.directGmv ?? "",
        "Giờ live": e.durationHours ?? "",
        "GMV/giờ": e.directGmv && e.durationHours ? Math.round(e.directGmv / e.durationHours) : "",
        "% Target": e.directGmv && e.targetGmv ? Math.round((e.directGmv / e.targetGmv) * 10000) / 100 : "",
        "LIVE impressions": e.liveImpressions ?? "",
        "LIVE CTR": e.ctr ?? "",
        "CTOR": e.ctor ?? "",
        "Ads cost": e.adsCost ?? "",
        "Budget Ads": planBudget(e) ?? "",
        "Ads / Budget %": e.adsCost != null && planBudget(e) ? Math.round((e.adsCost / planBudget(e)!) * 100) : "",
        "ROAS": e.directGmv && e.adsCost ? Math.round((e.directGmv / e.adsCost) * 10) / 10 : "",
        "Orders": e.orders ?? "",
        "Items sold": e.itemsSold ?? "",
        "Avg. price": e.avgPrice ?? "",
        "Viewers": e.viewer ?? ""
      })),
      `Affiliate_${brandName}_${fromMonth}_${toMonth}.xlsx`.replace(/\s+/g, "_")
    ).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  // Xuất Excel (chế độ KẾ HOẠCH) — đúng cột sheet kế hoạch ops vẫn dùng, kèm dòng Total.
  const handleExportPlan = () => {
    const rows = sortPlanRows(planRows.filter((e) => entryStatus(e) !== "cancelled"));
    const totals = planTotals(rows);
    const dd = (label?: string) => {
      const iso = parseDayLabel(label);
      return iso ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : label ?? "";
    };
    downloadRowsAsXlsx(
      "Kế hoạch Affiliate",
      [
        ...rows.map((e) => ({
          "Lịch live": dd(e.liveDateLabel),
          "Creator": e.creatorName,
          "Camp Name": e.campName ?? "",
          "Quy mô": e.campaignType ?? "",
          "Timeline": e.planTimelineLabel ?? "",
          "Duration": planHours(e) ?? "",
          "Target GMV": e.targetGmv ?? "",
          "GMV/hour": Math.round(planGmvPerHour(e) ?? 0) || "",
          "Đơn vị $": Math.round(toUsd(e.targetGmv, fx) ?? 0) || "",
          "Budget Ads": planBudget(e) ?? "",
          "Note": e.note ?? ""
        })),
        {
          "Lịch live": "Total",
          "Creator": "",
          "Camp Name": "",
          "Quy mô": "",
          "Timeline": "",
          "Duration": totals.hours || "",
          "Target GMV": totals.target,
          "GMV/hour": totals.hours ? Math.round(totals.target / totals.hours) : "",
          "Đơn vị $": Math.round(totals.target / fx) || "",
          "Budget Ads": totals.budgetAds,
          "Note": ""
        }
      ],
      `KeHoach_Affiliate_${brandName}_${planMonth}.xlsx`.replace(/\s+/g, "_")
    ).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  const update = (entry: Row, patch: Partial<AffiliateActualEntry>) => {
    setEntries((prev) => prev.map((e) => (e._key === entry._key ? { ...e, ...patch } : e)));
    setDirty(true);
  };

  const removeEntry = (entry: Row) => {
    setEntries((prev) => prev.filter((e) => e._key !== entry._key));
    setDirty(true);
  };

  // Cột trống ở chế độ THEO DÕI: phiên đã live nhập tay hoàn toàn.
  const addBlank = (month: string) => {
    setEntries((prev) => [
      ...prev,
      { _key: nextKey(), brandId, periodMonth: `${month}-01`, creatorName: "", status: "done", sortOrder: prev.filter((e) => e.periodMonth.startsWith(month)).length }
    ]);
    setDirty(true);
  };

  // Dòng kế hoạch mới: ngày mặc định là ngày cuối cùng đang có trong tháng (hoặc mùng 1).
  const addPlanRow = () => {
    const last = sortPlanRows(planRows).map((r) => parseDayLabel(r.liveDateLabel)).filter((d): d is string => !!d).pop();
    const iso = last ?? `${planMonth}-01`;
    setEntries((prev) => [
      ...prev,
      {
        _key: nextKey(),
        brandId,
        periodMonth: `${planMonth}-01`,
        creatorName: "",
        liveDateLabel: dayLabelOf(iso),
        campName: suggestCampName(iso, campCtx.overrides),
        status: "planned",
        sortOrder: prev.length
      }
    ]);
    setDirty(true);
  };

  // Ô dán từ Google Sheet: chỉ nhận dòng đúng tháng đang lập; dòng đã có (cùng ngày + creator + timeline) bỏ qua để dán lại không nhân đôi.
  const pasted = useMemo(() => parsePlanPaste(pasteText), [pasteText]);
  const isDuplicatePaste = useCallback(
    (r: PastedPlanRow) =>
      planRows.some(
        (e) =>
          parseDayLabel(e.liveDateLabel) === r.date &&
          sameCreator(e.creatorName, r.creatorName) &&
          (e.planTimelineLabel ?? "").trim() === (r.planTimelineLabel ?? "").trim()
      ),
    [planRows]
  );
  const pasteFresh = pasted.filter((r) => r.date.startsWith(planMonth) && !isDuplicatePaste(r));
  const pasteOtherMonth = pasted.filter((r) => !r.date.startsWith(planMonth)).length;
  const pasteDuplicate = pasted.filter((r) => r.date.startsWith(planMonth) && isDuplicatePaste(r)).length;

  const applyPaste = () => {
    if (pasteFresh.length === 0) return;
    setEntries((prev) => [
      ...prev,
      ...pasteFresh.map((r, i): Row => ({
        _key: nextKey(),
        brandId,
        periodMonth: `${planMonth}-01`,
        creatorName: r.creatorName,
        liveDateLabel: dayLabelOf(r.date),
        campName: r.campName ?? suggestCampName(r.date, campCtx.overrides),
        planTimelineLabel: r.planTimelineLabel,
        planDurationHours: r.planDurationHours,
        targetGmv: r.targetGmv,
        planBudgetAds: r.planBudgetAds,
        note: r.note,
        status: "planned",
        sortOrder: prev.length + i
      }))
    ]);
    setDirty(true);
    setPasteOpen(false);
    setPasteText("");
  };

  // Trả về true khi lưu xong hết (để "Chốt" chờ được kết quả lưu trước khi chốt).
  const handleSave = async (): Promise<boolean> => {
    if (metaMissing) {
      setErrorMsg("Database chưa chạy migration 0155 nên chưa lưu được — chạy file supabase/migrations/0155_affiliate_plan_first.sql trên Supabase rồi lưu lại.");
      return false;
    }
    setSaving(true);
    setErrorMsg(null);
    setMissingDataraw(false);
    try {
      // Lưu TỪNG tháng trong dải đang xem, kể cả tháng giờ rỗng — replaceAffiliateActuals() xoá
      // sạch tháng đó trước khi insert, nên tháng bị ops xoá hết cột cũ cũng được dọn đúng.
      for (const m of months) {
        const items = entries
          .filter((e) => e.periodMonth.slice(0, 7) === m)
          .map((e, idx) => ({ ...e, sortOrder: idx }));
        await replaceAffiliateActuals(brandId, `${m}-01`, items);
      }
      if (fxDirty && !metaMissing) {
        setMonthMeta(await upsertAffiliatePlanMonth(brandId, `${planMonth}-01`, { fxRate: fx }));
        setFxDirty(false);
      }
      await reload();
      setSavedAt(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
      return true;
    } catch (e) {
      setErrorMsg(errorMessage(e, "Lưu thất bại"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // "Chốt, gửi brand" / "Thu hồi". Chốt xong ops vẫn sửa được; brand thấy ngay số mới (không có bước chốt lại).
  const handlePublish = async (publish: boolean) => {
    setErrorMsg(null);
    setPublishing(true);
    try {
      if (publish && (dirty || fxDirty) && !(await handleSave())) return;
      setMonthMeta(await upsertAffiliatePlanMonth(brandId, `${planMonth}-01`, { published: publish, fxRate: fx }));
      setFxDirty(false);
      setConfirmPublish(false);
      showToast(publish ? `Đã chốt kế hoạch ${fmtMonth(planMonth)} — brand đã xem được` : "Đã thu hồi — brand không còn thấy kế hoạch tháng này");
    } catch (e) {
      setErrorMsg(errorMessage(e, publish ? "Chốt thất bại" : "Thu hồi thất bại"));
    } finally {
      setPublishing(false);
    }
  };

  const importMonths = mode === "plan" ? [planMonth] : rangeMonths;

  const openImport = async () => {
    setImporting(true);
    setErrorMsg(null);
    setMissingDataraw(false);
    try {
      const { start } = monthRange(importMonths[0]);
      const { end } = monthRange(importMonths[importMonths.length - 1]);
      const slice = await fetchAffiliateLiveSessions(brandId, start, end, shopHandle);
      if (!slice.hasAnyBatch) {
        setErrorMsg('Chưa có batch "Live Analysis" nào phủ dải tháng này trong Dữ Liệu Gốc. Export ở Seller Center với chế độ xem "linked accounts" rồi import vào tab Live Analysis.');
        setMissingDataraw(true);
        return;
      }
      setImportRows(slice.rows);
      // Bỏ tick sẵn: phiên của chính tài khoản shop, phiên đã có cột, và phiên không phát sinh
      // click lẫn đơn cho brand (buổi live riêng của creator lọt vào báo cáo vì còn sót sản phẩm
      // trong giỏ). Vẫn LIỆT KÊ cả 3 loại để ops tự tick lại nếu muốn. Phiên KHỚP một dòng kế hoạch thì tick sẵn
      // (trừ khi nó là tài khoản shop).
      setImportPicked(
        new Set(slice.rows.filter((r) => !r.isShopAccount && !r.noBrandActivity && !hasColumnFor(r)).map((r) => r.key))
      );
      setCancelPicked(new Set());
    } catch (e) {
      setErrorMsg(errorMessage(e, "Không đọc được Dữ Liệu Gốc"));
    } finally {
      setImporting(false);
    }
  };

  // Đã có cột cho phiên này chưa — khớp theo ngày + tên creator (khớp mờ: "Khói" ≈ "Kiot Khói"), vì entry đã lưu
  // không giữ Room ID. Chỉ tính dòng ĐÃ LIVE: dòng kế hoạch chưa có số thì chính là chỗ phiên này sẽ khớp vào.
  function hasColumnFor(r: AffiliateLiveSessionRow): boolean {
    const label = dayLabel(r.date);
    return entries.some(
      (e) => entryStatus(e) === "done" && e.liveDateLabel === label && (sameCreator(e.creatorName, r.creatorName) || sameCreator(e.creatorName, r.nickname))
    );
  }

  // Ghép phiên trong file với dòng kế hoạch chưa có số (cùng ngày, cùng creator, giờ bắt đầu gần nhất).
  const importMatch = useMemo(() => {
    if (!importRows) return null;
    const planned = entries
      .filter((e) => entryStatus(e) === "planned")
      .map((e) => ({ key: e._key, date: parseDayLabel(e.liveDateLabel) ?? "", creatorName: e.creatorName, planTimelineLabel: e.planTimelineLabel }))
      .filter((p) => p.date);
    const sess = importRows.map((r) => ({ key: r.key, date: r.date, creatorName: r.creatorName, nickname: r.nickname, timelineLabel: r.timelineLabel }));
    return matchPlanToSessions(planned, sess);
  }, [importRows, entries]);

  const confirmImport = () => {
    if (!importRows || !importMatch) return;
    const picked = importRows.filter((r) => importPicked.has(r.key));
    const planBySession = new Map(importMatch.pairs.map((p) => [p.sessionKey, p.planKey]));
    setEntries((prev) => {
      let next = prev.map((e) => (cancelPicked.has(e._key) ? { ...e, status: "cancelled" as const } : e));
      const added: Row[] = [];
      for (const r of picked) {
        const planKey = planBySession.get(r.key);
        if (planKey) {
          // Khớp kế hoạch: giữ tên/camp/target/giờ kế hoạch của ops, chỉ điền số thực tế và chuyển sang "Đã live".
          next = next.map((e) => (e._key === planKey ? { ...e, ...sessionActuals(r), status: "done" as const } : e));
        } else {
          added.push({ ...rowToEntry(brandId, r), campName: suggestCampName(r.date, r.date.startsWith(planMonth) ? campCtx.overrides : undefined) });
        }
      }
      return [...next, ...added];
    });
    setImportRows(null);
    setImportPicked(new Set());
    setCancelPicked(new Set());
    setDirty(true);
  };

  const readOnly = !canManage;
  const cellCls = "px-2 py-1.5 border-r border-[var(--border)] text-center whitespace-nowrap";
  const labelCls = "px-3 py-1.5 border-r border-[var(--border)] text-left font-semibold text-[var(--text-faint)] sticky left-0 bg-[var(--surface-base)] z-10 whitespace-nowrap";
  // `min-h-6` = 24px, sàn vùng bấm WCAG 2.5.8: 56 ô nhập của bảng này trước đây cao 20px
  // (audit UX lần 2 — M7). Ô nằm trong `td` có `py-1.5` nên dòng chỉ cao thêm 4px.
  const inputCls = "w-full min-h-6 bg-transparent text-center outline-none focus:bg-[var(--surface-hover)] rounded px-1";

  // Ô số: khi KHÔNG focus thì hiện bản đã format ("225.248.394", "52,76%") cho dễ đọc; lúc focus
  // đổi về số thô để ops gõ/sửa không phải né dấu phân cách. Không format-while-typing vì con trỏ
  // sẽ nhảy về cuối sau mỗi ký tự.
  const cellLabel = (e: Row, label: string) => `${label} — ${e.creatorName || "cột mới"} ${e.liveDateLabel ?? ""}`.trim();

  const numInput = (e: Row, label: string, key: keyof AffiliateActualEntry, fmt: (n?: number | null) => string) => {
    const cellId = `${e._key}:${String(key)}`;
    const value = e[key] as number | undefined;
    if (readOnly) return <span>{fmt(value)}</span>;
    return (
      <input
        className={inputCls}
        aria-label={cellLabel(e, label)}
        value={focusedCell === cellId ? value ?? "" : value == null ? "" : fmt(value)}
        inputMode="decimal"
        onFocus={() => setFocusedCell(cellId)}
        onBlur={() => setFocusedCell(null)}
        onChange={(ev) => {
          // Chấp nhận cả "1.234.567" (dán từ Excel) lẫn "1234,5": bỏ dấu chấm/khoảng trắng/% rồi
          // coi dấu phẩy là thập phân.
          const v = ev.target.value.replace(/[.\s%]/g, "").replace(",", ".");
          update(e, { [key]: v === "" ? undefined : Number(v) } as Partial<AffiliateActualEntry>);
        }}
      />
    );
  };

  const textInput = (e: Row, label: string, key: "creatorName" | "liveDateLabel" | "timelineLabel") =>
    readOnly ? (
      <span>{e[key] || "—"}</span>
    ) : (
      <input className={inputCls} aria-label={cellLabel(e, label)} value={e[key] ?? ""} onChange={(ev) => update(e, { [key]: ev.target.value })} />
    );

  // Dòng chỉ số: label + 1 ô cho mỗi cột phiên.
  //
  // Đây là HÀM THƯỜNG trả JSX, cố ý KHÔNG khai báo thành component (<MetricRow/>): component định
  // nghĩa trong thân BrandAffiliateTable có identity mới sau mỗi lần render, React coi là kiểu
  // khác nên remount cả cây con — ô input đang gõ bị huỷ DOM ngay ký tự đầu, mất focus và mất
  // luôn ký tự sau. Gọi như hàm thì JSX nội tuyến vào cây cha, DOM giữ nguyên qua các lần render.
  const metricRow = (label: string, render: (e: Row, label: string) => React.ReactNode, className?: string) => (
    <tr key={label} className={`border-t border-[var(--border)] ${className ?? ""}`}>
      <td className={labelCls} title={metricHint(label)}>
        {label}
      </td>
      {flatColumns.map((e) => (
        <td key={e._key} className={cellCls}>
          {render(e, label)}
        </td>
      ))}
    </tr>
  );

  const published = !!monthMeta?.publishedAt;
  const btn = "px-3 py-2 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50";
  const nPlanned = planRows.filter((e) => entryStatus(e) === "planned").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" /> Affiliate — {brandName}
          </h2>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">
            {mode === "plan"
              ? "Lập kế hoạch từng phiên creator affiliate trước (dán từ Google Sheet được). Sau khi live, nạp file Live Analysis từ Dữ Liệu Gốc — số thực tế tự khớp vào đúng dòng kế hoạch."
              : 'Mỗi phiên live đã diễn ra là 1 cột. Số tự động đọc từ file "Live Analysis" (Dữ Liệu Gốc); Target / Ads cost / Quy mô nhập tay hoặc lấy từ kế hoạch.'}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Chế độ xem" className="flex rounded-lg bg-[var(--surface-elevated)] p-0.5 border border-[var(--border)]">
            {(
              [
                ["plan", "Kế hoạch", CalendarDays],
                ["track", "Theo dõi", BarChart3]
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 ${mode === id ? "bg-[var(--surface-base)] text-[var(--text)] shadow-sm" : "text-[var(--text-faint)]"}`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          {mode === "plan" ? (
            <MonthPicker value={planMonth} onChange={(m) => guardDirty(() => { setPlanMonth(m); setConfirmPublish(false); })} ariaLabel="Tháng kế hoạch" />
          ) : (
            <>
              <MonthPicker value={fromMonth} max={toMonth} onChange={(m) => guardDirty(() => setFromMonth(m))} arrows={false} ariaLabel="Từ tháng" />
              <span className="text-[var(--text-faint)]">→</span>
              <MonthPicker value={toMonth} min={fromMonth} onChange={(m) => guardDirty(() => setToMonth(m))} arrows={false} ariaLabel="Đến tháng" />
            </>
          )}
          <button
            onClick={mode === "plan" ? handleExportPlan : handleExport}
            disabled={mode === "plan" ? planRows.length === 0 : flatColumns.length === 0}
            title={mode === "plan" ? "Xuất kế hoạch tháng đang lập ra Excel đúng cột sheet kế hoạch" : "Xuất đúng dải tháng đang xem ra Excel"}
            className={btn}
          >
            <Download className="w-4 h-4" /> Xuất Excel
          </button>
          {canManage && (
            <>
              {mode === "plan" && (
                <button onClick={() => setPasteOpen((v) => !v)} className={btn} aria-expanded={pasteOpen}>
                  <ClipboardPaste className="w-4 h-4" /> Dán từ Google Sheet
                </button>
              )}
              <button onClick={openImport} disabled={importing || loading} className={`${btn} disabled:opacity-60`} title="Đọc file Live Analysis trong Dữ Liệu Gốc và khớp vào kế hoạch">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Nạp Từ Dữ Liệu Gốc
              </button>
              <button onClick={() => void handleSave()} disabled={saving || (!dirty && !fxDirty)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
              </button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex flex-wrap items-center gap-2">
          <span>{errorMsg}</span>
          {missingDataraw && onOpenDataRaw && (
            <button onClick={onOpenDataRaw} className="px-2.5 py-1 rounded-lg bg-red-700 text-white text-xs font-semibold whitespace-nowrap">
              Mở Dữ Liệu Gốc →
            </button>
          )}
        </div>
      )}
      {metaMissing && canManage && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Database chưa có bảng trạng thái kế hoạch Affiliate (migration 0155). Chạy file <code>supabase/migrations/0155_affiliate_plan_first.sql</code> trên Supabase trước khi lưu kế hoạch — lưu bây giờ sẽ báo lỗi.
        </div>
      )}
      {savedAt && !dirty && <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">Đã lưu lúc {savedAt}.</div>}

      {mode === "plan" && canManage && !metaMissing && (
        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/50 flex flex-wrap items-center gap-3 text-sm">
          <span className={`px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1 ${published ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {published ? <Lock className="w-3 h-3" /> : null} {published ? "Đã chốt" : "Nháp"}
          </span>
          <span className="text-[var(--text-faint)]">
            {published
              ? "Brand đang thấy kế hoạch tháng này. Bạn vẫn sửa được — brand thấy ngay số mới, không cần chốt lại."
              : "Brand chưa thấy kế hoạch tháng này. Chốt khi kế hoạch đã sẵn sàng gửi brand."}
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
            Tỷ giá $
            <input
              className="w-20 min-h-7 rounded border border-[var(--border)] bg-transparent px-1.5 text-right text-sm text-[var(--text)]"
              aria-label="Tỷ giá đổi sang đô la"
              inputMode="numeric"
              value={fmtVndFull(fx)}
              onChange={(ev) => {
                const n = Number(ev.target.value.replace(/[.\s]/g, "").replace(",", "."));
                if (n > 0) {
                  setFx(n);
                  setFxDirty(true);
                }
              }}
            />
          </label>
          {!published ? (
            confirmPublish ? (
              <span className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-faint)]">Gửi {nPlanned > 0 ? `${planRows.length} phiên` : "kế hoạch"} cho brand?</span>
                <button onClick={() => void handlePublish(true)} disabled={publishing || planRows.length === 0} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Xác nhận chốt
                </button>
                <button onClick={() => setConfirmPublish(false)} className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-sm">Huỷ</button>
              </span>
            ) : (
              <button onClick={() => setConfirmPublish(true)} disabled={planRows.length === 0} className={btn} title={planRows.length === 0 ? "Chưa có phiên nào để chốt" : undefined}>
                <Send className="w-4 h-4" /> Chốt, gửi brand
              </button>
            )
          ) : (
            <button onClick={() => void handlePublish(false)} disabled={publishing} className={btn}>
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Thu hồi
            </button>
          )}
        </div>
      )}

      {pasteOpen && mode === "plan" && canManage && (
        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/50 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <ClipboardPaste className="w-4 h-4" /> Dán các dòng kế hoạch từ Google Sheet
          </div>
          <textarea
            value={pasteText}
            onChange={(ev) => setPasteText(ev.target.value)}
            rows={5}
            aria-label="Dán kế hoạch từ Google Sheet"
            placeholder={"09/10/2026\tKhói\tD-Day\t10h - 18h\t8\t700.000.000\t…\t…\t24.500.000"}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-base)] p-2 text-xs font-mono"
          />
          <div className="text-xs text-[var(--text-faint)]">
            Bôi đen vùng ô từ cột <b>Lịch live</b> tới <b>Note</b> trong sheet rồi dán vào đây (dòng tiêu đề và dòng Total tự bỏ qua).
            {pasted.length > 0 && (
              <span className="ml-1 text-[var(--text)]">
                Đọc được {pasted.length} dòng: thêm {pasteFresh.length}
                {pasteDuplicate > 0 ? `, ${pasteDuplicate} dòng đã có` : ""}
                {pasteOtherMonth > 0 ? `, ${pasteOtherMonth} dòng khác tháng ${fmtMonth(planMonth)} (bỏ qua)` : ""}.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={applyPaste} disabled={pasteFresh.length === 0} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
              Thêm {pasteFresh.length} phiên
            </button>
            <button onClick={() => { setPasteOpen(false); setPasteText(""); }} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm">Đóng</button>
          </div>
        </div>
      )}

      {importRows && importMatch && (
        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/50 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Link2 className="w-4 h-4" /> {importRows.length} phiên đọc được từ Live Analysis — khớp với kế hoạch
          </div>
          <div className="max-h-80 overflow-auto text-xs">
            {(() => {
              const rowOf = new Map(importRows.map((r) => [r.key, r]));
              const planOf = new Map(entries.map((e) => [e._key, e]));
              const check = (r: AffiliateLiveSessionRow) => (
                <input
                  type="checkbox"
                  aria-label={`Chọn phiên ${dayLabel(r.date)} ${r.creatorName || r.nickname}`}
                  checked={importPicked.has(r.key)}
                  onChange={(ev) =>
                    setImportPicked((prev) => {
                      const next = new Set(prev);
                      if (ev.target.checked) next.add(r.key);
                      else next.delete(r.key);
                      return next;
                    })
                  }
                />
              );
              const sessionInfo = (r: AffiliateLiveSessionRow) => (
                <span className="text-[var(--text-faint)]">
                  {r.timelineLabel} · {fmtVndFull(r.directGmv)} · {fmtVndFull(r.viewer)} viewer · {fmtVndFull(r.liveImpressions)} hiển thị
                </span>
              );
              const unplannedRow = (r: AffiliateLiveSessionRow, exists: boolean) => (
                <label key={r.key} className="flex flex-wrap items-center gap-2 py-1 border-b border-[var(--border)]/50 cursor-pointer">
                  {check(r)}
                  <span className="font-mono">{dayLabel(r.date)}</span>
                  <span className="font-semibold">{r.creatorName}</span>
                  {sessionInfo(r)}
                  {r.isShopAccount && <span className="px-1.5 rounded bg-slate-200 text-slate-700">tài khoản shop</span>}
                  {r.noBrandActivity && (
                    <span className="px-1.5 rounded bg-slate-200 text-slate-700" title="Không có click lẫn đơn cho brand — thường là buổi live riêng của creator, chỉ lọt vào báo cáo vì còn sót sản phẩm trong giỏ. Tick lại nếu bạn vẫn muốn đưa vào bảng.">
                      0 click / 0 đơn
                    </span>
                  )}
                  {exists ? <span className="px-1.5 rounded bg-slate-200 text-slate-700">đã có cột</span> : <span className="px-1.5 rounded bg-amber-100 text-amber-800">ngoài kế hoạch</span>}
                </label>
              );
              const unplanned = importMatch.unplannedSessions.map((k) => rowOf.get(k)).filter((r): r is AffiliateLiveSessionRow => !!r);
              const alreadyIn = unplanned.filter((r) => hasColumnFor(r));
              const outsidePlan = unplanned.filter((r) => !hasColumnFor(r));
              const today = todayVn();
              const lateUnmatched = importMatch.unmatchedPlans.map((k) => planOf.get(k)).filter((e): e is Row => !!e && (parseDayLabel(e.liveDateLabel) ?? "9999") < today);
              const title = "font-semibold text-[var(--text-faint)] mt-2 mb-1";
              return (
                <>
                  <div className={title}>Khớp kế hoạch ({importMatch.pairs.length})</div>
                  {importMatch.pairs.length === 0 && <div className="py-1 text-[var(--text-faint)]">Không có phiên nào khớp dòng kế hoạch (cùng ngày và cùng creator).</div>}
                  {importMatch.pairs.map((p) => {
                    const r = rowOf.get(p.sessionKey);
                    const e = planOf.get(p.planKey);
                    if (!r || !e) return null;
                    return (
                      <label key={p.sessionKey} className="flex flex-wrap items-center gap-2 py-1 border-b border-[var(--border)]/50 cursor-pointer">
                        {check(r)}
                        <span className="font-mono">{dayLabel(r.date)}</span>
                        <span className="font-semibold">{e.creatorName}</span>
                        <span className="text-[var(--text-faint)]">kế hoạch {e.planTimelineLabel || "—"} · target {e.targetGmv != null ? fmtVndFull(e.targetGmv) : "—"} →</span>
                        {sessionInfo(r)}
                        <span className="px-1.5 rounded bg-emerald-100 text-emerald-800">
                          khớp{p.startDiffMin != null ? `, lệch ${p.startDiffMin > 0 ? "+" : ""}${p.startDiffMin} phút` : ""}
                        </span>
                      </label>
                    );
                  })}
                  <div className={title}>Có trong file nhưng không có kế hoạch ({outsidePlan.length})</div>
                  {outsidePlan.length === 0 && <div className="py-1 text-[var(--text-faint)]">Không có.</div>}
                  {outsidePlan.map((r) => unplannedRow(r, false))}
                  {alreadyIn.length > 0 && (
                    <>
                      <div className={title}>Đã có số trong bảng ({alreadyIn.length}) — bỏ qua, tick nếu muốn thêm lần nữa</div>
                      {alreadyIn.map((r) => unplannedRow(r, true))}
                    </>
                  )}
                  {lateUnmatched.length > 0 && (
                    <>
                      <div className={title}>Kế hoạch đã qua ngày nhưng file không có phiên ({lateUnmatched.length}) — tick để đánh dấu Huỷ / dời</div>
                      {lateUnmatched.map((e) => (
                        <label key={e._key} className="flex flex-wrap items-center gap-2 py-1 border-b border-[var(--border)]/50 cursor-pointer">
                          <input
                            type="checkbox"
                            aria-label={`Huỷ phiên ${e.liveDateLabel} ${e.creatorName}`}
                            checked={cancelPicked.has(e._key)}
                            onChange={(ev) =>
                              setCancelPicked((prev) => {
                                const next = new Set(prev);
                                if (ev.target.checked) next.add(e._key);
                                else next.delete(e._key);
                                return next;
                              })
                            }
                          />
                          <span className="font-mono">{e.liveDateLabel}</span>
                          <span className="font-semibold">{e.creatorName}</span>
                          <span className="text-[var(--text-faint)]">kế hoạch {e.planTimelineLabel || "—"} · target {e.targetGmv != null ? fmtVndFull(e.targetGmv) : "—"}</span>
                          <span className="px-1.5 rounded bg-red-100 text-red-800">chưa có số</span>
                        </label>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </div>
          <div className="flex gap-2">
            <button onClick={confirmImport} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
              Áp dụng {importPicked.size} phiên{cancelPicked.size > 0 ? ` + huỷ ${cancelPicked.size}` : ""}
            </button>
            <button onClick={() => setImportRows(null)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm">Huỷ</button>
          </div>
        </div>
      )}

      {mode === "plan" ? (
        loading ? (
          <div className="p-8 text-center text-[var(--text-faint)] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải…</div>
        ) : planRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-faint)] border border-dashed border-[var(--border)] rounded-xl">
            {canManage ? (
              <>
                Chưa có kế hoạch Affiliate cho {fmtMonth(planMonth)}. Bấm <b>Dán từ Google Sheet</b> để đưa bản kế hoạch ops đang lập vào, hoặc <b>Thêm phiên</b> để nhập từng dòng.
              </>
            ) : (
              <>
                Kế hoạch Affiliate {fmtMonth(planMonth)} chưa được chốt.
                <span className="block mt-1 text-[11px]">Kế hoạch từng tháng hiện ở đây sau khi agency chốt và gửi cho brand.</span>
              </>
            )}
          </div>
        ) : (
          <AffiliatePlanTable
            rows={planRows}
            month={planMonth}
            fxRate={fx}
            readOnly={!canManage}
            campOverrides={campCtx.overrides}
            shopTarget={canManage ? campCtx.shopTarget : undefined}
            onChange={update}
            onRemove={removeEntry}
          />
        )
      ) : null}
      {mode === "plan" && canManage && (
        <div className="flex flex-wrap gap-2">
          <button onClick={addPlanRow} className="px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--text-faint)] flex items-center gap-1 hover:bg-[var(--surface-hover)]">
            <Plus className="w-3 h-3" /> Thêm phiên
          </button>
        </div>
      )}

      {mode !== "track" ? null : loading ? (
        <div className="p-8 text-center text-[var(--text-faint)] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải…</div>
      ) : flatColumns.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--text-faint)] border border-dashed border-[var(--border)] rounded-xl">
          {/* Với role brand, "rỗng" có 2 nguyên nhân rất khác nhau và bảng thì trông giống hệt:
              chưa có phiên nào, hoặc có nhưng tháng chưa phát hành (policy 0107 lọc mất). Nói
              nguyên nhân thứ hai ra, đừng để khách đoán là agency không làm gì. */}
          {currentRole === "brand" ? (
            <>
              Chưa có dữ liệu affiliate nào được chốt cho dải tháng này.
              <span className="block mt-1 text-[11px]">
                Số liệu từng tháng hiện ở đây sau khi agency chốt và gửi cho brand.
              </span>
            </>
          ) : (
            <>
              Chưa có phiên affiliate nào đã live trong dải tháng này.
              {canManage && <> Bấm <b>Nạp Từ Dữ Liệu Gốc</b> để đọc từ file Live Analysis (khớp vào kế hoạch), hoặc thêm cột thủ công bên dưới.</>}
            </>
          )}
        </div>
      ) : (
        <div className="overflow-auto border border-[var(--border)] rounded-xl bg-[var(--surface-base)]">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--surface-elevated)]">
                <th className={labelCls}>Tháng</th>
                {columns.map((g) => (
                  <th key={g.month} colSpan={g.items.length} className="px-2 py-1.5 border-r border-[var(--border)] text-center font-bold tracking-wide">
                    {fmtMonth(g.month.slice(0, 7))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricRow("Campaign Type", (e, label) =>
                readOnly ? (
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CAMPAIGN_STYLE[e.campaignType ?? ""] ?? ""}`}>{e.campaignType || "—"}</span>
                ) : (
                  <select
                    aria-label={cellLabel(e, label)}
                    value={e.campaignType ?? ""}
                    onChange={(ev) => update(e, { campaignType: ev.target.value || undefined })}
                    className={`min-h-6 rounded px-1.5 py-0.5 text-xs font-semibold outline-none ${CAMPAIGN_STYLE[e.campaignType ?? ""] ?? "bg-[var(--surface-elevated)]"}`}
                  >
                    <option value="">—</option>
                    {CAMPAIGN_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )
              )}
              {metricRow("Camp", (e) => <span className="text-xs font-semibold">{e.campName || "—"}</span>)}
              {metricRow("Kế hoạch", (e) => (
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${hasPlan(e) ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {hasPlan(e) ? "Có kế hoạch" : "Ngoài kế hoạch"}
                </span>
              ))}
              {metricRow("Creator", (e, label) => textInput(e, label, "creatorName"), "font-bold")}
              {metricRow("Day", (e, label) => textInput(e, label, "liveDateLabel"), "bg-emerald-50/60 font-semibold")}
              {metricRow("Timeline", (e, label) => textInput(e, label, "timelineLabel"))}
              {metricRow("Target GMV", (e, label) => numInput(e, label, "targetGmv", fmtInt), "bg-[var(--surface-elevated)] font-bold")}
              {metricRow("Giờ kế hoạch", (e) => <span>{fmtNum(planHours(e), 1)}</span>)}
              {metricRow("Direct GMV", (e, label) => numInput(e, label, "directGmv", fmtInt), "text-red-600 font-bold")}
              {metricRow("Giờ live", (e, label) => numInput(e, label, "durationHours", (n) => fmtNum(n, 1)))}
              {metricRow("GMV/giờ", (e) => <span>{e.directGmv && e.durationHours ? fmtInt(e.directGmv / e.durationHours) : "—"}</span>)}
              {metricRow(
                "% Target",
                (e) => <span>{e.directGmv && e.targetGmv ? fmtPct((e.directGmv / e.targetGmv) * 100) : "—"}</span>,
                "bg-emerald-600/90 text-white font-bold"
              )}
              {metricRow("LIVE impressions", (e, label) => numInput(e, label, "liveImpressions", fmtInt))}
              {metricRow("LIVE CTR", (e, label) => numInput(e, label, "ctr", (n) => fmtPct(n)))}
              {metricRow("CTOR", (e, label) => numInput(e, label, "ctor", (n) => fmtPct(n)))}
              {metricRow("Ads cost", (e, label) => numInput(e, label, "adsCost", fmtInt))}
              {metricRow("Budget Ads", (e) => <span>{planBudget(e) != null ? fmtInt(planBudget(e)) : "—"}</span>)}
              {metricRow("Ads / Budget", (e) => {
                const budget = planBudget(e);
                if (e.adsCost == null || !budget) return <span>—</span>;
                const pct = (e.adsCost / budget) * 100;
                // Chi vượt ngân sách kế hoạch thì đỏ.
                return <span className={pct > 100 ? "text-red-600 font-semibold" : ""}>{fmtPct(pct, 0)}</span>;
              })}
              {metricRow("ROAS", (e) => <span>{e.directGmv && e.adsCost ? fmtNum(e.directGmv / e.adsCost, 1) : "—"}</span>)}
              {metricRow("Orders", (e, label) => numInput(e, label, "orders", fmtInt))}
              {metricRow("Items sold", (e, label) => numInput(e, label, "itemsSold", fmtInt))}
              {metricRow("Avg. price", (e, label) => numInput(e, label, "avgPrice", fmtInt))}
              {metricRow("Viewers", (e, label) => numInput(e, label, "viewer", fmtInt))}
              {canManage && (
                <tr className="border-t border-[var(--border)]">
                  <td className={labelCls} />
                  {flatColumns.map((e) => (
                    <td key={e._key} className={cellCls}>
                      <button
                        onClick={() => removeEntry(e)}
                        title="Xoá cột"
                        className="inline-flex items-center justify-center p-1.5 rounded text-red-500 hover:text-red-700 hover:bg-red-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {mode === "track" && canManage && (
        <div className="flex flex-wrap gap-2">
          {rangeMonths.map((m) => (
            <button key={m} onClick={() => addBlank(m)} className="px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--text-faint)] flex items-center gap-1 hover:bg-[var(--surface-hover)]">
              <Plus className="w-3 h-3" /> Thêm cột tháng {fmtMonth(m.slice(0, 7))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
