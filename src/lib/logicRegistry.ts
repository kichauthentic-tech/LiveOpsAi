import { ENGINE_PARAM_META, type EngineParams } from "./scheduling/engineParams";
import { COMPLETE_DAY_SHARE, TARGET_HIGH_RATIO, TARGET_EASY_RATIO, PRODUCTIVITY_SHIFT, THIN_WAVE_RATIO, MATERIAL_PENDING_SHARE, MIN_COMPARE_SESSIONS } from "./performance/channelHealth";
import { CONE_COEF } from "./performance/forecastCone";
import { FATIGUE_WEEK_HOURS, MIN_SESSIONS_FOR_CONFIDENCE } from "./performance/hostSuggestion";
import { MIN_SESSIONS_TO_COMPARE, DAY_TYPE_DIFF_THRESHOLD } from "./performance/hostPerformance";
import { MIN_BENCH_N, WEAK_N, HALF_LIFE_DAYS } from "./performance/shiftBenchmark";
import { ELASTICITY_LOOKBACK_DAYS } from "./performance/handlingPlan";
import { SWITCH_MIN_GAIN, SWITCH_MONTHS } from "./performance/modelScoreboard";
import { TARGET_TIER_MIN, MIN_AWARD_SHIFTS, AWARD_SHRINK_K } from "./leaderboard/awards";
import { BLIP_MINUTES, MAX_GAP_MINUTES, CUT_GAP_MINUTES } from "./reconciliation/mergeRestarts";
import { OUTSIDE_TOLERANCE_MIN } from "./reconciliation/groupCheck";
import { NEAR_SHIFT_MIN } from "./reconciliation/outsideRows";
import { DURATION_DEVIATION_MIN, OT_MAX_MIN, PCT_TARGET_HIT, PCT_TARGET_LOW } from "./sessionStatus";
import { SWAP_MAX_SEGMENTS_PER_ROLE } from "./shiftSwap/swap";
import { INTAKE_ALLOCATE_MAX, INTAKE_ADD_MAX } from "./scheduling/targetIntake";
import { RELIABLE_BLOCK_MIN_CA, BLOCK_HOURS } from "./scheduling/suggestEngine";
import { CHANNEL_GMV_MIN_N } from "./roster/candidates";
import { ROOM_EDGE_TOLERANCE_MIN } from "./liveSnapshot/roomCases";
import { CROSS_TOL_MS, MAX_FLEX_MS } from "./liveSnapshot/timeline";
import { fmtVndShort } from "./format";
import { CONTROL_GAP, GIFT_MAX_PRICE } from "./report/deepAnalysis";

// Danh bạ LOGIC của các module/engine, để AI Training Center cho người quản trị (chị Trainer, admin) thấy một chỗ: module đang chạy luật
// nào, con số nào đang áp, sửa ở đâu. Luật và con số có tham số ⇒ đọc thẳng từ `EngineParams` (không chép số vào chữ để khỏi lệch);
// luật không có tham số (nằm trong code hoặc trong bảng khác) ghi rõ "nằm ở đâu".
//
// Thêm luật mới vào một module = thêm một dòng ở đây; test `tests/logicRegistry.test.ts` canh: mọi khoá tham chiếu phải có thật, và mọi tham
// số của nhóm "roster" phải được nhắc tới (không để một nút vặn nằm ngoài danh bạ).

export type RuleKind = "hard" | "soft" | "info";
export interface LogicRule {
  kind: RuleKind;
  text: string;
  /** Tham số của luật (đọc giá trị hiện tại từ EngineParams). */
  keys?: (keyof EngineParams)[];
  /** Luật không có tham số ở bảng dưới: nó nằm ở đâu / sửa ở đâu. */
  where?: string;
  /** Ngưỡng nằm trong code (import thẳng hằng số ⇒ không lệch): nhãn + giá trị. Sửa phải sửa code, không vặn ở bảng Tham số. */
  consts?: { label: string; value: string }[];
  /** Giải thích đầy đủ — hiện sau ⓘ (chữ hiện thẳng trên màn bị canh trần, xem tests/uiTextBudget.test.ts). */
  help?: string;
}
export interface LogicModule {
  id: string;
  title: string;
  /** Màn hình dùng module này. */
  usedIn: string;
  summary: string;
  rules: LogicRule[];
}

export const LOGIC_MODULES: LogicModule[] = [
  {
    id: "roster_autofill",
    title: "Tự fill lịch live",
    usedIn: "Điều Phối Lịch Live → 3 nút Tối ưu Performance / Cân bằng / Tối ưu chi phí",
    summary: "Chỉ xếp người đã đăng ký đúng ca mở; chấm điểm từng người rồi chọn người cao nhất. Luật cứng loại người ra, luật mềm cộng/trừ điểm.",
    rules: [
      { kind: "hard", text: "Chỉ chọn người đã đăng ký đúng ca mở", help: "Ca không ai đăng ký để trống và báo lý do; không bốc người ngoài danh sách đăng ký.", where: "Trong code" },
      { kind: "hard", text: "Không trùng ca; giờ/tuần, giờ/ngày, nghỉ sau ca khuya", where: "Điều Phối → Luật" },
      { kind: "hard", text: "Vai được xếp theo brand × sàn (host / trợ / cả hai)", where: "Talent Pool → hồ sơ talent" },
      { kind: "hard", text: "Giờ tối đa cả tháng, kể cả trần giờ riêng từng người", help: "Xếp ngày 1–15 thì người có trần riêng chỉ nhận tới trần × tỷ lệ giờ của nửa đầu + dung sai; phần còn lại chừa cho nửa sau.", keys: ["rosterRangeTolerance"], where: "Điều Phối → So sánh mục tiêu (lưu theo trình duyệt)" },
      { kind: "hard", text: "Mọi người có trần giờ tự suy để chia đợt", help: "Trung bình giờ 3 tháng đã qua × (1 + dư), cần ≥ 2 tháng có làm. Xếp nửa tháng thì không ai nhận quá phần của nửa đó. Cam kết nhập tay ghi đè.", keys: ["rosterAutoCapSlack"] },
      { kind: "soft", text: "Ca Campaign hoặc cao điểm: ưu tiên host có PFM tháng trước cao", help: "Campaign = D-Day / Mid-Month / Pay Day. Cao điểm = khung giờ có GMV/giờ cao hơn trung vị kênh.", keys: ["rosterPeakPerfAdd", "rosterPeakBandRatio"] },
      { kind: "soft", text: "Ca Daily / thấp điểm: ưu tiên người cast thấp", help: "Host vượt trần cast bị trừ điểm (luật mềm, không chặn).", keys: ["rosterRegularCostAdd", "rosterRegularCastCap", "rosterCastOverPenalty"] },
      { kind: "soft", text: "Mọi ca Shopee: host vượt trần cast bị trừ điểm", help: "Trần Shopee thay trần Daily vì host Shopee phần lớn 170–200K.", keys: ["rosterShopeeCastCap"] },
      { kind: "soft", text: "Người đăng ký ít ca được ưu tiên lấp ca trước", keys: ["rosterScarcityWeight"] },
      { kind: "soft", text: "Làn host: cao điểm / ca thường / cân bằng (mặc định tắt)", help: "Làn gợi ý từ rate và PFM ở thẻ Cơ cấu giờ & làn host. Chỉ chạy khi điểm thưởng làn > 0.", keys: ["rosterLaneWeight"] },
      { kind: "soft", text: "Giờ rải đều cả tháng: người vượt tiến độ bị trừ điểm", keys: ["rosterPaceWeight"] },
      { kind: "soft", text: "Trợ nam ưu tiên nhẹ ở Franklin, CROCS và ca đêm", help: "Brand thể thao nhận biết theo tên chứa Franklin hoặc CROCS. Ca đêm vì an toàn cho bạn nữ. Dùng giới tính ở hồ sơ talent.", keys: ["rosterMaleAsstSport", "rosterMaleAsstNight"] },
      { kind: "info", text: "PFM tính trên tháng trước, co về 1,00 khi ít ca", help: "PFM = GMV/giờ của host ÷ trung vị cùng kênh × khung giờ.", where: "Trong code" }
    ]
  },
  {
    id: "month_schedule",
    title: "Kế Hoạch Tháng — xếp lịch gợi ý",
    usedIn: "Kế Hoạch Tháng → gợi ý lưới ca (Tối đa / Cân bằng / Tiết kiệm)",
    summary: "Học GMV/giờ theo thứ × khung giờ từ lịch sử một kênh rồi xếp lưới ca cho tháng.",
    rules: [
      { kind: "soft", text: "Rải đều giữa các tuần; phạt tuần quá tải.", keys: ["weekEvenCap", "weekEvenPenalty", "balancedWeekCap", "balancedWeekPenalty"] },
      { kind: "soft", text: "Giờ neo: lặp cùng giờ mở live nhiều ngày.", keys: ["anchorMinDays", "anchorBonus", "balancedAnchorBonus"] },
      { kind: "soft", text: "Cân bằng giới hạn ca/ngày; Tiết kiệm kéo dài ca", keys: ["balancedMaxPerDay", "balancedSecondSlotPenalty", "leanExtraHours", "leanNewDayPenalty"] },
      { kind: "soft", text: "Ngày Campaign xếp thành khối ca liên tục đủ giờ", keys: ["campPatternEnabled", "minCampDays"] }
    ]
  },
  {
    id: "target_allocation",
    title: "Chia target ca",
    usedIn: "Kế Hoạch Tháng → target từng ca",
    summary: "Target ca = mô hình v2 (loại ngày × khung giờ × vị trí ngày) trộn với cách cũ; ngày Campaign có sàn target.",
    rules: [
      { kind: "soft", text: "Tỷ trọng mô hình v2 và độ co về 1 khi ít dữ liệu.", keys: ["allocEnsembleShare", "allocRidge", "allocMinMonths"] },
      { kind: "soft", text: "Hệ số khung giờ / vị trí ngày trong đợt / T7–CN.", keys: ["allocUseBand", "allocUseCampPos", "allocUseWeekend", "allocWeekendRidge"] },
      { kind: "hard", text: "Sàn target ngày Campaign (lần ngày thường).", keys: ["allocFloorDday", "allocFloorMidmonth", "allocFloorPayday"] },
      { kind: "info", text: "Cờ đỏ khi target/ca vượt dự báo quá ngưỡng.", keys: ["highExpectationRatio", "highExpectationRatioCamp"] }
    ]
  },
  {
    id: "forecast",
    title: "Dự báo GMV tháng",
    usedIn: "Kế Hoạch Tháng, Dashboard, run-rate",
    summary: "Mức gần đây × hình dạng tháng; trong tháng kéo về số đã có; dải 80% theo lịch sử kênh.",
    rules: [
      { kind: "soft", text: "Mức gần đây và độ tin số đã có trong tháng.", keys: ["fcRecentDays", "fcCredibility"] },
      { kind: "soft", text: "Dải 80% lúc lập (kênh đủ / ít lịch sử).", keys: ["fcBandBig", "fcBandSmall"] },
      { kind: "soft", text: "Giờ vượt vùng lịch sử, tự hiệu chỉnh lệch, bù giờ", keys: ["fcOutOfRangeFactor", "fcBiasCorrect", "fcCheckpointCap"] }
    ]
  }
];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const x1 = (x: number) => `${String(x).replace(".", ",")}×`;

export const LOGIC_MODULES_MORE: LogicModule[] = [
  {
    id: "performance_def",
    title: "Hiệu suất: ca đáng đếm, PFM, GMV/giờ",
    usedIn: "Hiệu Suất Host, Báo Cáo, Dashboard, Bản Tin, Leader Board",
    summary: "Một định nghĩa ca có số và một bộ đếm chung cho mọi màn; không màn nào tự cộng riêng.",
    rules: [
      { kind: "hard", text: "Chỉ ca ĐÃ XONG và CÓ SỐ mới vào thống kê hiệu suất", help: "Có số = đã đối soát, hoặc đã tải file lúc giao ca, hoặc có GMV/view. Ca đã tải file mà bán 0 là kết quả thật. Ca đang live bị loại vì số dở dang.", where: "performance/hostPerformance.ts (isCountable)" },
      { kind: "hard", text: "Không cộng hiệu suất hai tài khoản TikTok và Shopee với nhau", help: "Mỗi kênh = brand × sàn, đo riêng; không có hàm nào gộp hai sàn.", where: "Trong code (luật đa sàn 07/10)" },
      { kind: "soft", text: "GMV/giờ dùng giờ live THẬT, chưa có thì giờ kế hoạch", where: "performance/hostPerformance.ts" },
      { kind: "info", text: "So host theo cùng loại ngày: chênh nhỏ hơn ngưỡng là nhiễu", consts: [{ label: "Ca tối thiểu để so", value: String(MIN_SESSIONS_TO_COMPARE) }, { label: "Chênh loại ngày", value: `${DAY_TYPE_DIFF_THRESHOLD}%` }] },
      { kind: "info", text: "Hạng host theo tháng không lặp lại ⇒ không kết luận 'host A hiệu suất cao hơn B' từ một tháng", where: "Đo backtest 13/10, 29/09 (slotInsights, candidates)" }
    ]
  },
  {
    id: "host_suggest",
    title: "Gợi ý host / ai hợp cho một ca",
    usedIn: "Đăng Ký & Chốt Lịch, Điều Phối Lịch Live → danh sách ứng viên",
    summary: "Thứ tự gợi ý dựa vào thứ người điều phối kiểm soát được; chỉ số Performance chỉ là chế độ chủ động chọn.",
    rules: [
      { kind: "soft", text: "Mặc định 'Cân bằng': đã báo rảnh, quen kênh, giờ tuần thấp, không phạm luật nghỉ", help: "KHÔNG xếp theo GMV/giờ host: đo 13/10 trên 1.197 ca, host chỉ chênh ~±5% sau khi trừ kênh/khung giờ/camp; thành tích không lặp lại tháng sau.", where: "roster/candidates.ts" },
      { kind: "soft", text: "Chế độ 'Performance': host có chỉ số cao trước; 'Chi phí thấp': rate thấp trước", consts: [{ label: "Số ca tối thiểu để tin chỉ số kênh", value: String(CHANNEL_GMV_MIN_N) }] },
      { kind: "soft", text: "Cảnh báo quá tải khi giờ đã xếp trong tuần cao; vẫn chọn được", consts: [{ label: "Ngưỡng quá tải", value: `${FATIGUE_WEEK_HOURS}h/tuần` }, { label: "Ca tối thiểu để tin số", value: String(MIN_SESSIONS_FOR_CONFIDENCE) }] },
      { kind: "info", text: "Số host hiện kèm căn cứ: theo brand, theo thứ, theo khung giờ chồng", where: "performance/hostSuggestion.ts" }
    ]
  },
  {
    id: "roster_rules",
    title: "Luật lịch tuần & kiểm trùng",
    usedIn: "Điều Phối Lịch Live → Luật, mọi cửa xếp/sửa ca, Nhường/đổi ca",
    summary: "Một bộ luật cho mọi cửa xếp ca. DB chỉ chặn trùng người; còn lại là cảnh báo để người điều phối tự quyết.",
    rules: [
      { kind: "hard", text: "Một người không thể là host hoặc trợ của hai ca chồng giờ; một phòng không chứa hai ca chồng giờ", help: "Tính cả ca qua đêm hôm trước và ca chờ đăng ký còn mở đang giữ phòng.", where: "scheduling/conflicts.ts + DB 0143" },
      { kind: "soft", text: "Giờ/tuần, giờ/ngày, nghỉ sau ca khuya, chuỗi ngày làm liền: chỉ CẢNH BÁO", help: "Từ 09/11 quá giờ tuần cũng chỉ cảnh báo (lịch sheet đã có người vượt 48h).", where: "Điều Phối → Luật (bảng roster_rules)" },
      { kind: "hard", text: "Đổi/nhường ca: lịch mỗi người không phát sinh chồng giờ MỚI", consts: [{ label: "Số đoạn tối đa mỗi vai", value: String(SWAP_MAX_SEGMENTS_PER_ROLE) }], where: "shiftSwap/swap.ts (DB kiểm lại)" },
      { kind: "soft", text: "Ca có host mà chưa trợ / chưa đánh 'No Asst' thì không công bố", where: "roster/rules.ts (0207)" }
    ]
  },
  {
    id: "run_rate",
    title: "Run-rate (tiến độ tháng)",
    usedIn: "Dashboard 'Tháng này', Báo Cáo, Lịch Vận Hành brand",
    summary: "Thực đạt ÷ target tới nay, theo kế hoạch ban đầu. MỘT hàm cho mọi màn.",
    rules: [
      { kind: "hard", text: "Target = Σ target ca của Kế Hoạch Tháng đã chốt; không chia lại khi lịch đổi", where: "performance/planRunRate.ts" },
      { kind: "hard", text: "Ca kế hoạch bị huỷ hoặc mất liên kết VẪN giữ target trong mẫu số", help: "Bỏ đi thì huỷ ca lại làm run-rate đẹp lên." },
      { kind: "hard", text: "Ca mở thêm ngoài kế hoạch: cộng vào thực đạt, target = 0", help: "Cho nó target mới thì thêm ca bù lại làm run-rate xấu đi." },
      { kind: "soft", text: "Chỉ tính tới NGÀY ĐỦ SỐ: ngày có ≥ 90% giờ ca đã chạy có số", consts: [{ label: "Độ phủ số liệu", value: pct(COMPLETE_DAY_SHARE) }], help: "Số đối soát về trễ (trung vị 3 ngày); cắt theo ngày cuối có số bất kỳ làm run-rate tụt giả." },
      { kind: "soft", text: "Sau ngày đủ số: đếm từng ca có số, không chờ hết ngày", where: "runRateUpdate.ts" }
    ]
  },
  {
    id: "channel_health",
    title: "Kết luận kênh & dự báo cuối tháng",
    usedIn: "Dashboard, Bản Tin CEO, Kế Hoạch Tháng",
    summary: "Mỗi kênh MỘT nhãn: Đạt target / Sát target / Rủi ro / Hụt target, theo khả năng đạt của dự báo. Run-rate chỉ là số phụ.",
    rules: [
      { kind: "soft", text: "Dự báo = đã có + giờ ca còn lại × GMV/giờ 28 ngày; dải tin cậy theo phần tháng còn lại", consts: [{ label: "Hệ số dải", value: pct(CONE_COEF) }], help: "Backtest 13 kênh-tháng: bao ~80% ở các mốc ngày 8/15/22. Đổi hệ số = chạy lại backtest." },
      { kind: "soft", text: "So kỳ trước CÙNG LOẠI NGÀY (thường↔thường, camp↔cùng đợt, cùng vị trí)", consts: [{ label: "Ca tối thiểu để so", value: String(MIN_COMPARE_SESSIONS) }] },
      { kind: "info", text: "Nguyên nhân gốc theo thứ tự: số chưa về → target cao lúc chốt → năng suất giảm → lịch đợt tới mỏng", consts: [{ label: "Số chưa về đáng kể", value: `≥ ${pct(MATERIAL_PENDING_SHARE)} dự báo` }, { label: "Target cao", value: `> ${x1(TARGET_HIGH_RATIO)}` }, { label: "Target dễ", value: `< ${x1(TARGET_EASY_RATIO)}` }, { label: "Năng suất giảm", value: `> ${pct(PRODUCTIVITY_SHIFT)}` }, { label: "Lịch đợt mỏng", value: `< ${pct(THIN_WAVE_RATIO)} mức thông thường` }] },
      { kind: "info", text: "Bảng chấm mô hình dự báo: v3 vs bộ xếp ca. App KHÔNG tự đổi mô hình", consts: [{ label: "Điều kiện báo đổi", value: `hơn ≥ ${pct(SWITCH_MIN_GAIN)} ở ${SWITCH_MONTHS} tháng sổ gần nhất` }], where: "performance/modelScoreboard.ts" }
    ]
  },
  {
    id: "handling_plan",
    title: "Cần xử lý: bù giờ, ca tăng cường, chia lại target",
    usedIn: "Kế Hoạch Tháng → mốc kiểm, Bảng Vận Hành",
    summary: "Mọi đòn bẩy ra SỐ từ dữ liệu kênh. Ca gợi ý không tự vào target tháng.",
    rules: [
      { kind: "soft", text: "Thứ tự xử lý: số chưa về → ca mở chưa có người → ngày Campaign mỏng → khung giờ nên dồn → giờ cần thêm", where: "performance/handlingPlan.ts" },
      { kind: "soft", text: "Giờ thêm trả ít hơn giờ trung bình: dùng hệ số co giãn, kẹp trần", consts: [{ label: "Cửa sổ đo co giãn", value: `${ELASTICITY_LOOKBACK_DAYS} ngày` }], help: "đổi_giờ = ((R̂ + thiếu) ÷ R̂)^(1 ÷ co_giãn) − 1." },
      { kind: "hard", text: "Ca tăng cường: target đề xuất chỉ để chấm ca, KHÔNG cộng vào target tháng / run-rate", where: "scheduling/boost.ts" },
      { kind: "hard", text: "Chia lại theo lịch hiện có: ca đã qua có chia lại, ca huỷ về 0, ca OP thêm tính ngay", where: "scheduling/rebase.ts (user chốt 10/10)" },
      { kind: "info", text: "Chi phí giờ thêm = giờ × (rate host + rate trợ TB theo giờ của kênh); không gồm phòng, Ads, hoa hồng", where: "scheduling/extraHoursCost.ts" },
      { kind: "info", text: "Nhận target brand: ≤ 10% chia lại, ≤ 30% thêm ca, trên đó phải xem kỹ", consts: [{ label: "Chia lại tối đa", value: pct(INTAKE_ALLOCATE_MAX) }, { label: "Thêm ca tối đa", value: pct(INTAKE_ADD_MAX) }], where: "scheduling/targetIntake.ts" }
    ]
  },
  {
    id: "plan_calibration",
    title: "Kế hoạch vs thực tế & tự hiệu chỉnh",
    usedIn: "Kế Hoạch Tháng → đánh giá, AI Training",
    summary: "Sai số dự báo lúc chốt gom theo ô thứ × khối giờ thành hệ số cho tháng sau.",
    rules: [
      { kind: "soft", text: "factor = (Σ thực tế + k·Σ dự báo) ÷ ((1 + k)·Σ dự báo): kéo về 1 khi ít quan sát", where: "scheduling/planEvaluation.ts" },
      { kind: "hard", text: "Ca OP đặt tay (không có dự báo) không tham gia hiệu chỉnh", where: "scheduling/planEvaluation.ts" },
      { kind: "info", text: "Khung giờ chia khối; ô đủ mẫu mới được tin", consts: [{ label: "Khối giờ", value: `${BLOCK_HOURS}h` }, { label: "Ca tối thiểu/ô", value: String(RELIABLE_BLOCK_MIN_CA) }] }
    ]
  },
  {
    id: "shift_benchmark",
    title: "Benchmark theo ca",
    usedIn: "Bảng Vận Hành → phễu benchmark",
    summary: "Chia 4 vùng theo phân vị có trọng số của nhóm brand × sàn: kết thúc sớm / cần action / đúng target / có thể xin OT.",
    rules: [
      { kind: "soft", text: "Ca càng gần càng nặng: trọng số giảm một nửa sau mỗi chu kỳ", consts: [{ label: "Bán rã", value: `${HALF_LIFE_DAYS} ngày` }, { label: "Ca tối thiểu", value: String(MIN_BENCH_N) }, { label: "Cảnh báo mẫu mỏng", value: `< ${WEAK_N}` }], where: "performance/shiftBenchmark.ts (backtest 472 ca)" },
      { kind: "info", text: "Vùng: < P15 kết thúc sớm · P15–P40 cần action · P40–P75 đúng target · ≥ P75 có thể xin OT", where: "performance/shiftBenchmark.ts" },
      { kind: "hard", text: "App KHÔNG nhận số real-time từ sàn (không nối API)", where: "Quyết định sản phẩm 01/11", help: "User chốt 01/11: rủi ro lộ dữ liệu. OP tự đọc dashboard sàn rồi đối chiếu thang." }
    ]
  },
  {
    id: "commitment",
    title: "Cam kết giờ brand",
    usedIn: "Kế Hoạch Tháng, Lịch Vận Hành brand, Báo Cáo",
    summary: "Đối chiếu giờ brand ký với giờ thực giao + giờ đang xếp.",
    rules: [
      { kind: "hard", text: "Giờ giao = GIỜ LIVE THẬT; ca chưa có giờ thật tạm theo lịch và đếm riêng", where: "performance/brandCommitment.ts (user chốt 24/10)" },
      { kind: "soft", text: "OT (vào trễ, cuối ca tự bù) được tính trừ khi lệch quá ngưỡng", consts: [{ label: "OT tối đa", value: `${OT_MAX_MIN} phút` }] },
      { kind: "info", text: "Doanh thu brand theo giờ (Kế Toán) vẫn tính theo giờ lịch — đổi là quyết định riêng", where: "pnl.ts (computeSessionPnl)" }
    ]
  },
  {
    id: "session_status",
    title: "Trạng thái ca & % Target",
    usedIn: "Bảng Vận Hành, Sổ Ca, Ca Của Tôi",
    summary: "Trạng thái hiển thị suy theo giờ thật; ca qua đêm kết thúc ngày hôm sau.",
    rules: [
      { kind: "soft", text: "Ca live ngắn hơn kế hoạch thì coi là kết thúc sớm", consts: [{ label: "Lệch thời lượng", value: `≥ ${DURATION_DEVIATION_MIN} phút` }] },
      { kind: "soft", text: "Màu % Target: đạt / thấp", consts: [{ label: "Đạt", value: `≥ ${PCT_TARGET_HIT}%` }, { label: "Thấp", value: `< ${PCT_TARGET_LOW}%` }], where: "sessionStatus.ts" },
      { kind: "hard", text: "Ca 'Cancelled' không bao giờ đổi trạng thái", where: "sessionStatus.ts" }
    ]
  },
  {
    id: "handover_snapshot",
    title: "Giao ca & chọn phòng từ file",
    usedIn: "Giao ca (TikTok + Shopee), Cửa sổ ca",
    summary: "Giao ca bằng FILE số liệu; mốc giao ca = hết ca kế hoạch + trễ + phút nghỉ; phòng gợi ý theo cửa sổ ca.",
    rules: [
      { kind: "hard", text: "Giờ room bật + đủ giờ lịch, ca sau nối tiếp", where: "handover.ts, liveSnapshot/timeline.ts (0203/0209/0210/0213)" },
      { kind: "soft", text: "Dung sai ghép phòng–ca, giãn tối đa, độ dài nghỉ giữa chừng", consts: [{ label: "Dung sai biên phòng", value: `${ROOM_EDGE_TOLERANCE_MIN} phút` }, { label: "Dung sai giao ca", value: `${CROSS_TOL_MS / 60000} phút` }, { label: "Giãn tối đa", value: `${MAX_FLEX_MS / 60000} phút` }] },
      { kind: "info", text: "Phòng chỉ GỢI Ý: người giao ca vẫn tick được phòng ngoài cửa sổ", where: "liveSnapshot/roomSelection.ts" }
    ]
  },
  {
    id: "reconciliation",
    title: "Đối soát lô file",
    usedIn: "Đối Soát",
    summary: "Kiểm theo NHÓM LIÊN THÔNG ca ↔ phiên: tổng ca = tổng phiên trong file. Chỉ đọc, không tự đổi số.",
    rules: [
      { kind: "hard", text: "Chỉ lệch tổng (sum_mismatch) mới CHẶN lô; còn lại là việc cần quyết", where: "reconciliation/verdict.ts, groupCheck.ts" },
      { kind: "soft", text: "Gợi ý gộp restart: mảnh ngắn dính dòng liền kề; hai room dài bị ngắt gộp nếu khớp một ca", consts: [{ label: "Mảnh ngắn", value: `≤ ${BLIP_MINUTES} phút` }, { label: "Khoảng nghỉ tối đa", value: `${MAX_GAP_MINUTES} phút` }, { label: "Ngắt giữa chừng", value: `≤ ${CUT_GAP_MINUTES} phút` }], help: "Ops xem nhóm rồi mới bấm gộp." },
      { kind: "info", text: "Phòng ngoài ca: dung sai và ngưỡng 'gần ca'", consts: [{ label: "Dung sai", value: `${OUTSIDE_TOLERANCE_MIN} phút` }, { label: "Gần ca", value: `${NEAR_SHIFT_MIN} phút` }] },
      { kind: "hard", text: "Snapshot không đè ca đã đối soát", where: "DB 0171–0173" }
    ]
  },
  {
    id: "talent_pay",
    title: "Lương talent & P&L ca",
    usedIn: "Finance, Kế Toán, Talent Pool, tab Tôi",
    summary: "Công = rate/giờ × giờ (hoặc rate/phiên). Không hoa hồng GMV.",
    rules: [
      { kind: "hard", text: "Rate theo giờ > 0 thắng rate theo phiên; rate lấy tại NGÀY ca diễn ra", where: "pnl.ts, talentRate.ts" },
      { kind: "hard", text: "Không có hoa hồng theo GMV cho talent (user chốt 06/10)", where: "pnl.ts, talentRate.ts" },
      { kind: "hard", text: "Trợ live được trả công riêng; ưu tiên rate trợ", where: "pnl.ts (audit 18/09)" },
      { kind: "hard", text: "Ca qua đêm cộng 24h; start = end ra 0 giờ", where: "pnl.ts" },
      { kind: "info", text: "P&L tháng chỉ TRÌNH BÀY lại MonthClose; kèm độ phủ ca tính được", where: "accounting/pnlStatement.ts" }
    ]
  },
  {
    id: "leaderboard",
    title: "Leader Board / giải thưởng",
    usedIn: "Leader Board",
    summary: "Ba giải, mỗi giải xét riêng từng account; thưởng cố định theo suất, chia theo phút có mặt.",
    rules: [
      { kind: "hard", text: "Ca Campaign đạt target: Mức 1 và Mức 2", consts: [{ label: "Mức 1", value: `≥ ${pct(TARGET_TIER_MIN[1])}` }, { label: "Mức 2", value: `≥ ${pct(TARGET_TIER_MIN[2])}` }], where: "leaderboard/awards.ts" },
      { kind: "soft", text: "Host hiệu suất: GMV/giờ ÷ trung vị account × tháng × khung giờ, co về 1,00", consts: [{ label: "Ca tối thiểu", value: String(MIN_AWARD_SHIFTS) }, { label: "Độ co K", value: String(AWARD_SHRINK_K) }] },
      { kind: "soft", text: "Trợ live: tỷ lệ ca đạt target theo phút, không xếp theo GMV", help: "Đo 06/11: GMV thô trùng người nhiều giờ nhất ở 18/23 account-tháng." }
    ]
  },
  {
    id: "report_month",
    title: "Báo Cáo Tháng / Tuần",
    usedIn: "Báo Cáo Tháng, Báo Cáo Tuần, xuất HTML/Excel",
    summary: "Cùng bộ đếm Key Metrics với Dashboard; trang theo phạm vi brand × sàn; nhận định sinh từ hàm thuần, không phải AI.",
    rules: [
      { kind: "hard", text: "Trang report chọn theo phạm vi dịch vụ ở CRM 'Hợp đồng & giá'", where: "report/reportScope.ts" },
      { kind: "soft", text: "Nhóm đối chứng cho 'quà tặng' và ca tự live", consts: [{ label: "Giá quà tối đa", value: `${fmtVndShort(GIFT_MAX_PRICE)}` }, { label: "Chênh đối chứng", value: String(CONTROL_GAP) }], where: "report/deepAnalysis.ts" },
      { kind: "info", text: "Insight từng trang (quan sát / nguyên nhân / tác động / khuyến nghị) sinh từ số, không gọi AI", where: "report/pageInsights.ts, sectionInsights.ts" },
      { kind: "info", text: "Tên chỉ số chuẩn hoá một nơi", where: "lib/metricGlossary.ts" }
    ]
  }
];

LOGIC_MODULES.push(...LOGIC_MODULES_MORE);

export const RULE_KIND_LABEL: Record<RuleKind, string> = { hard: "Luật cứng", soft: "Luật mềm (cộng/trừ điểm)", info: "Ghi chú" };

/** Khoá tham số được danh bạ nhắc tới. */
export function referencedKeys(): Set<keyof EngineParams> {
  const out = new Set<keyof EngineParams>();
  for (const m of LOGIC_MODULES) for (const r of m.rules) for (const k of r.keys ?? []) out.add(k);
  return out;
}

export const paramLabel = (key: keyof EngineParams) => ENGINE_PARAM_META.find((m) => m.key === key)?.label ?? String(key);
