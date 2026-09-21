// Tham số của engine Kế Hoạch Tháng (gợi ý lịch + hiệu chỉnh + lớp host). Engine không phải LLM —
// không có prompt để sửa; "huấn luyện" nghĩa là vặn các hằng số này và xem engine học được gì.
// Mọi hằng số ở đây có mặc định trong code; DB (`engine_params`, 0095) chỉ giữ phần admin đã đổi,
// thiếu khoá nào dùng mặc định — không bao giờ vỡ vì thiếu dữ liệu.
//
// KHÔNG đưa BLOCK_HOURS (khối 2h) vào đây: khoá ô "thứ|khối" đã nằm trong hệ số hiệu chỉnh lưu cùng
// kế hoạch; đổi khối là số cũ vô nghĩa.

export interface EngineParams {
  // --- Học lịch sử ---
  recencyLambda: number; // trọng số ca cũ = e^(−λ·tháng)
  winsorizePct: number; // chặn GMV/giờ ở phân vị này (0.95 = p95)
  shrinkK: number; // số quan sát "ảo" kéo ô về TB brand
  minHistorySessions: number; // dưới mức này → "lịch sử mỏng"
  minHistoryMonths: number;
  minCampSessions: number; // ca tối thiểu để học hệ số camp
  campMultMin: number;
  campMultMax: number;
  campDefaultDday: number; // hệ số camp khi chưa học được
  campDefaultMidmonth: number;
  campDefaultPayday: number;
  minEventSessions: number; // ca tối thiểu để học hệ số lễ/sự kiện & scheme
  eventMultMin: number;
  eventMultMax: number;
  schemeMultMin: number;
  schemeMultMax: number;
  diminishingMinHours: number; // giờ quan sát tối thiểu để học lợi suất giảm dần ca thứ k
  diminishingMin: number;
  // --- Khuôn ngày camp ---
  campPatternEnabled: boolean; // lấp ngày camp đủ giờ/ngày lịch sử trước, bằng khối liên tục
  minCampDays: number; // số ngày camp tối thiểu để học giờ/ngày
  // --- Xếp lịch ---
  weekEvenCap: number; // tuần vượt X× TB thì phạt
  weekEvenPenalty: number;
  balancedWeekCap: number;
  balancedWeekPenalty: number;
  anchorMinDays: number; // cùng giờ bắt đầu đã có ≥ N ngày → thưởng đều đặn
  anchorBonus: number;
  balancedAnchorBonus: number;
  balancedMaxPerDay: number; // phương án cân bằng: tối đa ca/ngày thường
  balancedSecondSlotPenalty: number;
  leanExtraHours: number; // phương án tiết kiệm: ca dài hơn mặc định bao nhiêu giờ
  leanNewDayPenalty: number;
  // --- Target ---
  highExpectationRatio: number; // target/ca > dự báo × X → cờ đỏ "kỳ vọng quá sức"
  hoursToHitMultiplier: number; // tìm giờ cần cho target tới X× cam kết
  // --- Hiệu chỉnh kế hoạch vs thực tế ---
  calibrationK: number;
  calibrationMin: number;
  calibrationMax: number;
  // --- Host ---
  fatigueWeekHours: number; // > X giờ/tuần → cảnh mệt, đẩy xuống cuối hàng khi chốt hàng loạt
}

export const DEFAULT_ENGINE_PARAMS: EngineParams = {
  recencyLambda: 0.35,
  winsorizePct: 0.95,
  shrinkK: 3,
  minHistorySessions: 20,
  minHistoryMonths: 2,
  minCampSessions: 3,
  campMultMin: 0.8,
  campMultMax: 3,
  campDefaultDday: 1.3,
  campDefaultMidmonth: 1.15,
  campDefaultPayday: 1.15,
  minEventSessions: 5,
  eventMultMin: 0.6,
  eventMultMax: 2.5,
  schemeMultMin: 0.8,
  schemeMultMax: 2,
  diminishingMinHours: 6,
  diminishingMin: 0.4,
  campPatternEnabled: true,
  minCampDays: 3,
  weekEvenCap: 1.3,
  weekEvenPenalty: 0.9,
  balancedWeekCap: 1.15,
  balancedWeekPenalty: 0.75,
  anchorMinDays: 3,
  anchorBonus: 1.05,
  balancedAnchorBonus: 1.1,
  balancedMaxPerDay: 2,
  balancedSecondSlotPenalty: 0.9,
  leanExtraHours: 1,
  leanNewDayPenalty: 0.92,
  highExpectationRatio: 1.3,
  hoursToHitMultiplier: 2,
  calibrationK: 3,
  calibrationMin: 0.5,
  calibrationMax: 1.6,
  fatigueWeekHours: 24
};

export type EngineParamGroup = "history" | "camp" | "schedule" | "target" | "calibration" | "host";
export const ENGINE_GROUP_LABEL: Record<EngineParamGroup, string> = {
  history: "Học từ lịch sử",
  camp: "Khuôn ngày camp",
  schedule: "Xếp lịch",
  target: "Target",
  calibration: "Hiệu chỉnh kế hoạch vs thực tế",
  host: "Host"
};

export interface EngineParamMeta {
  key: keyof EngineParams;
  group: EngineParamGroup;
  label: string; // ý nghĩa vận hành, không phải tên biến
  help: string;
  kind: "number" | "boolean";
  min?: number;
  max?: number;
  step?: number;
}

export const ENGINE_PARAM_META: EngineParamMeta[] = [
  { key: "recencyLambda", group: "history", label: "Quên dần ca cũ", help: "Ca cách đây N tháng nặng e^(−λ·N). 0.35 ≈ tháng trước còn 70%, 2 tháng còn 50%. Tăng để chạy theo xu hướng mới, giảm nếu dữ liệu ít.", kind: "number", min: 0, max: 2, step: 0.05 },
  { key: "winsorizePct", group: "history", label: "Chặn ca viral", help: "GMV/giờ vượt phân vị này bị cắt xuống — 1 ca bùng nổ không kéo cả ô. 0.95 = p95.", kind: "number", min: 0.5, max: 1, step: 0.01 },
  { key: "shrinkK", group: "history", label: "Kéo ô ít dữ liệu về TB brand", help: "Ô thứ×giờ có n ca được trộn với k ca 'ảo' ở mức TB brand. k lớn = thận trọng hơn với ô ít ca.", kind: "number", min: 0, max: 20, step: 1 },
  { key: "minHistorySessions", group: "history", label: "Ca tối thiểu để tin gợi ý", help: "Dưới mức này panel ghi 'lịch sử mỏng' và độ tin cậy thấp.", kind: "number", min: 0, max: 200, step: 1 },
  { key: "minHistoryMonths", group: "history", label: "Tháng tối thiểu để tin gợi ý", help: "", kind: "number", min: 0, max: 12, step: 1 },
  { key: "minCampSessions", group: "history", label: "Ca tối thiểu để học hệ số camp", help: "Không đủ thì dùng hệ số mặc định bên dưới.", kind: "number", min: 1, max: 50, step: 1 },
  { key: "campDefaultDday", group: "history", label: "Hệ số D-Day mặc định", help: "Dùng khi brand chưa đủ ca D-Day để học.", kind: "number", min: 0.5, max: 3, step: 0.05 },
  { key: "campDefaultMidmonth", group: "history", label: "Hệ số Mid-Month mặc định", help: "", kind: "number", min: 0.5, max: 3, step: 0.05 },
  { key: "campDefaultPayday", group: "history", label: "Hệ số Pay-Day mặc định", help: "", kind: "number", min: 0.5, max: 3, step: 0.05 },
  { key: "campMultMin", group: "history", label: "Hệ số camp học được — sàn", help: "Kẹp hệ số học từ lịch sử trong [sàn, trần].", kind: "number", min: 0.1, max: 2, step: 0.05 },
  { key: "campMultMax", group: "history", label: "Hệ số camp học được — trần", help: "", kind: "number", min: 1, max: 10, step: 0.1 },
  { key: "minEventSessions", group: "history", label: "Ca tối thiểu để học lễ/sự kiện & scheme", help: "Không đủ → ×1.0 và chỉ ghi nhãn trên lưới.", kind: "number", min: 1, max: 50, step: 1 },
  { key: "eventMultMin", group: "history", label: "Hệ số lễ/sự kiện — sàn", help: "", kind: "number", min: 0.1, max: 2, step: 0.05 },
  { key: "eventMultMax", group: "history", label: "Hệ số lễ/sự kiện — trần", help: "", kind: "number", min: 1, max: 10, step: 0.1 },
  { key: "schemeMultMin", group: "history", label: "Hệ số ngày trùng KM — sàn", help: "", kind: "number", min: 0.1, max: 2, step: 0.05 },
  { key: "schemeMultMax", group: "history", label: "Hệ số ngày trùng KM — trần", help: "", kind: "number", min: 1, max: 10, step: 0.1 },
  { key: "diminishingMinHours", group: "history", label: "Giờ tối thiểu để học lợi suất giảm dần", help: "Ca thứ 2/3/4 trong ngày bán kém hơn ca đầu bao nhiêu — cần đủ giờ quan sát ở vị trí đó.", kind: "number", min: 1, max: 100, step: 1 },
  { key: "diminishingMin", group: "history", label: "Lợi suất giảm dần — sàn", help: "Ca thứ k không bao giờ bị coi bán dưới X× ca đầu.", kind: "number", min: 0.1, max: 1, step: 0.05 },
  { key: "campPatternEnabled", group: "camp", label: "Lấp ngày camp đủ giờ lịch sử trước", help: "Học giờ live/ngày theo loại ngày camp, xếp ngày camp thành khối ca liên tục đủ giờ đó trước khi chia cho ngày thường; nới trần ca/ngày của ngày camp theo. Tắt → ngày camp xếp như ngày thường (chỉ khác hệ số GMV/giờ).", kind: "boolean" },
  { key: "minCampDays", group: "camp", label: "Ngày camp tối thiểu để học giờ/ngày", help: "", kind: "number", min: 1, max: 30, step: 1 },
  { key: "weekEvenCap", group: "schedule", label: "Tuần vượt X× trung bình thì phạt", help: "Rải đều giữa các tuần trong tháng (phương án Tối đa/Tiết kiệm).", kind: "number", min: 1, max: 3, step: 0.05 },
  { key: "weekEvenPenalty", group: "schedule", label: "Mức phạt tuần lệch", help: "Điểm ca nhân với hệ số này khi tuần đã quá tải.", kind: "number", min: 0.1, max: 1, step: 0.05 },
  { key: "balancedWeekCap", group: "schedule", label: "Cân bằng: tuần vượt X× thì phạt", help: "", kind: "number", min: 1, max: 3, step: 0.05 },
  { key: "balancedWeekPenalty", group: "schedule", label: "Cân bằng: mức phạt tuần lệch", help: "", kind: "number", min: 0.1, max: 1, step: 0.05 },
  { key: "anchorMinDays", group: "schedule", label: "Giờ neo: cùng giờ bắt đầu ≥ N ngày", help: "Ưu tiên lặp cùng giờ mở live nhiều ngày — khán giả nhớ giờ, host dễ xếp.", kind: "number", min: 1, max: 15, step: 1 },
  { key: "anchorBonus", group: "schedule", label: "Thưởng giờ neo", help: "", kind: "number", min: 1, max: 2, step: 0.01 },
  { key: "balancedAnchorBonus", group: "schedule", label: "Cân bằng: thưởng giờ neo", help: "", kind: "number", min: 1, max: 2, step: 0.01 },
  { key: "balancedMaxPerDay", group: "schedule", label: "Cân bằng: tối đa ca/ngày thường", help: "Ngày camp vẫn theo khuôn camp.", kind: "number", min: 1, max: 8, step: 1 },
  { key: "balancedSecondSlotPenalty", group: "schedule", label: "Cân bằng: phạt ca thứ 2 trong ngày", help: "", kind: "number", min: 0.1, max: 1, step: 0.05 },
  { key: "leanExtraHours", group: "schedule", label: "Tiết kiệm: ca dài thêm (giờ)", help: "Ca = mặc định + X giờ, ít ca hơn, ít ngày hơn.", kind: "number", min: 0, max: 6, step: 0.5 },
  { key: "leanNewDayPenalty", group: "schedule", label: "Tiết kiệm: phạt mở ngày mới", help: "", kind: "number", min: 0.1, max: 1, step: 0.01 },
  { key: "highExpectationRatio", group: "target", label: "Cờ đỏ khi target/ca > dự báo × X", help: "Ca bị kỳ vọng quá sức so với lịch sử — ops nên xem lại target hoặc thêm giờ.", kind: "number", min: 1, max: 3, step: 0.05 },
  { key: "hoursToHitMultiplier", group: "target", label: "Tìm giờ cần cho target tới X× cam kết", help: "Khi dự báo thiếu target, engine chạy tiếp tới X× giờ cam kết để tìm mốc đủ.", kind: "number", min: 1, max: 5, step: 0.5 },
  { key: "calibrationK", group: "calibration", label: "Kéo hệ số hiệu chỉnh về 1", help: "Ô có ít ca kế hoạch đã có thực tế bị kéo về 1 (không hiệu chỉnh). k lớn = thận trọng hơn.", kind: "number", min: 0, max: 20, step: 1 },
  { key: "calibrationMin", group: "calibration", label: "Hệ số hiệu chỉnh — sàn", help: "", kind: "number", min: 0.1, max: 1, step: 0.05 },
  { key: "calibrationMax", group: "calibration", label: "Hệ số hiệu chỉnh — trần", help: "", kind: "number", min: 1, max: 5, step: 0.1 },
  { key: "fatigueWeekHours", group: "host", label: "Ngưỡng mệt (giờ/tuần)", help: "Host/trợ đã xếp quá X giờ trong tuần (T2–CN, tính cả ca sắp tới và ca vừa gán trong lô) bị cảnh báo và đẩy xuống cuối hàng khi chốt hàng loạt.", kind: "number", min: 1, max: 80, step: 1 }
];

// Trộn phần admin đã đổi với mặc định; bỏ khoá lạ, bỏ giá trị không hợp kiểu.
export function mergeEngineParams(saved: Partial<Record<string, unknown>> | null | undefined): EngineParams {
  const out: EngineParams = { ...DEFAULT_ENGINE_PARAMS };
  if (!saved) return out;
  for (const m of ENGINE_PARAM_META) {
    const v = saved[m.key];
    if (v === undefined || v === null) continue;
    if (m.kind === "boolean") {
      if (typeof v === "boolean") (out as unknown as Record<string, unknown>)[m.key] = v;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      (out as unknown as Record<string, unknown>)[m.key] = v;
    }
  }
  return out;
}

// Chỉ những khoá khác mặc định — để DB không phình và reset mặc định = xoá khoá.
export function diffFromDefaults(p: EngineParams): Partial<EngineParams> {
  const out: Partial<Record<string, unknown>> = {};
  for (const m of ENGINE_PARAM_META) {
    if (p[m.key] !== DEFAULT_ENGINE_PARAMS[m.key]) out[m.key] = p[m.key];
  }
  return out as Partial<EngineParams>;
}
