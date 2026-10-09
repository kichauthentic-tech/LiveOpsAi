import React, { useMemo, useState } from "react";
import { LiveSession } from "../types";
import { Target } from "lucide-react";
import { ALLOC_BAND_LABEL, ALLOC_METHODS, ALLOC_METHOD_LABEL, AllocMethod, AllocParams, fitAllocationModel, prepareBacktest, scoreBacktest } from "../lib/performance/allocationModel";
import { nextMonthOf } from "../lib/performance/ceoBrief";
import { REPORT_PLATFORMS, platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { fmtFixed } from "../lib/format";

// AI Training Center — thẻ "Chia target ca (engine v2)". Cùng tinh thần với EngineTrainingPanel: engine là thuật toán thuần, "huấn
// luyện" = xem nó học được gì từ ca đã đối soát + vặn tham số + nhìn sai số backtest đổi ngay (chưa cần lưu). Phần tính nằm ở
// lib/performance/allocationModel.ts; thẻ này chỉ hiển thị.

interface Props {
  brandId: string;
  /** Ca đã lọc cờ loại khỏi báo cáo. Thẻ tự lọc theo brand + sàn. */
  sessions: LiveSession[];
  /** Tham số ĐANG SỬA (chưa lưu). */
  params: AllocParams;
  today: string;
}

const pct = (v: number | null | undefined) => (v == null ? "—" : `${fmtFixed(v * 100, 1)}%`);
const mult = (v: number) => `×${fmtFixed(v, 2)}`;

export const AllocationTrainingCard: React.FC<Props> = ({ brandId, sessions, params, today }) => {
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);
  const platforms = useMemo(() => REPORT_PLATFORMS.filter((p) => brandSessions.some((s) => platformOf(s) === p)), [brandSessions]);
  // Lựa chọn sàn gắn với brand đã chọn nó — đổi brand thì tự về sàn đầu, không cần effect.
  const [picked, setPicked] = useState<{ brandId: string; platform: ReportPlatform } | null>(null);
  const platform: ReportPlatform | null = picked && picked.brandId === brandId && platforms.includes(picked.platform) ? picked.platform : platforms[0] ?? null;
  const channel = useMemo(() => (platform ? brandSessions.filter((s) => platformOf(s) === platform) : []), [brandSessions, platform]);

  // Bước nặng (mô hình cũ có bootstrap) chỉ phụ thuộc kênh; vặn tham số chỉ chạy lại bước nhẹ.
  const prepared = useMemo(() => prepareBacktest(channel, params.allocMinMonths), [channel, params.allocMinMonths]);
  const result = useMemo(() => scoreBacktest(prepared, params, today), [prepared, params, today]);
  const model = useMemo(() => fitAllocationModel(channel, nextMonthOf(today.slice(0, 7)), params), [channel, params, today]);

  const best = ALLOC_METHODS.filter((k) => result.pooled[k]).sort((a, b) => result.pooled[a]!.slot - result.pooled[b]!.slot)[0];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5"><Target className="w-4 h-4 text-[var(--accent-text)]" /> Chia target ca — engine v2</h3>
        {platforms.length > 1 && (
          <div className="flex gap-1">
            {platforms.map((p) => (
              <button key={p} onClick={() => setPicked({ brandId, platform: p })} className={`px-2.5 min-h-6 rounded-lg text-xs font-bold border ${p === platform ? "bg-[var(--accent)] text-white border-transparent" : "border-[var(--border)] text-[var(--text)]"}`}>{p}</button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
        Target ca = Target tháng × (giờ ca × hệ số loại ngày × hệ số khung giờ bắt đầu × hệ số vị trí ngày trong đợt) ÷ tổng. Ba nhóm hệ số học đồng thời từ ca đã đối soát của riêng kênh này, rồi trộn với cách cũ. Mỗi nút ở cột Tham số (nhóm Target) vặn ngay ở đây.
      </p>

      {!platform || channel.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Brand chưa có ca đối soát nào — chưa có gì để học.</p>
      ) : (
        <>
          <div className="text-xs space-y-2">
            <p className="font-bold text-[var(--text-muted)]">Đã học gì {model ? <span className="font-normal text-[var(--text-faint)]">· {model.sessions} ca · {model.months.length} tháng ({platform})</span> : null}</p>
            {!model ? (
              <p className="text-[var(--text-muted)]">Chưa đủ lịch sử cho mô hình v2 (cần ≥ {params.allocMinMonths} tháng, ≥ 15 ca có số) — Kế Hoạch Tháng đang dùng cách cũ hoặc dự báo engine.</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
                  {(["dday", "midmonth", "payday", "daily"] as const).map((b) => (
                    <React.Fragment key={b}>
                      <span className="text-[var(--text-muted)]">{{ dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day", daily: "Ngày thường" }[b]}</span>
                      <b className="text-[var(--text)] text-right">{mult(model.bucket[b])}</b>
                    </React.Fragment>
                  ))}
                </div>
                {model.useBand && (
                  <div>
                    <p className="text-[var(--text-muted)] mb-0.5">Khung giờ bắt đầu (trung bình = ×1,00)</p>
                    {ALLOC_BAND_LABEL.map((label, k) => (
                      <div key={label} className="flex justify-between gap-2">
                        <span className="text-[var(--text)]">{label} <span className="text-[11px] text-[var(--text-faint)]">({model.bandSessions[k]} ca)</span></span>
                        <b className={model.band[k] >= 1.03 ? "text-emerald-400" : model.band[k] <= 0.9 ? "text-amber-400" : "text-[var(--text)]"}>{mult(model.band[k])}</b>
                      </div>
                    ))}
                  </div>
                )}
                {model.useCampPos && (
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Ngày 1 / 2 / 3 của Mid-Month, Pay Day</span>
                    <b className="text-[var(--text)]">{model.pos.map(mult).join(" / ")}</b>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="text-xs">
            <p className="font-bold text-[var(--text-muted)] mb-1">Backtest: dùng tháng trước đoán tháng sau</p>
            {result.folds.length === 0 ? (
              <p className="text-[var(--text-muted)]">Chưa đủ dữ liệu để backtest (cần một tháng có ≥ 15 ca và ≥ {params.allocMinMonths} tháng lịch sử trước nó).</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[var(--text-faint)] text-right">
                        <th className="text-left font-normal py-1">Sai số theo ca</th>
                        {result.folds.map((f) => <th key={f.month} className="font-normal px-1.5" title={`${f.sessions} ca, ${f.historyMonths} tháng lịch sử${f.partial ? " — tháng chưa trọn" : ""}`}>{f.month.slice(5)}/{f.month.slice(2, 4)}{f.partial ? "*" : ""}</th>)}
                        <th className="font-bold px-1.5 text-[var(--text-muted)]">Gộp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALLOC_METHODS.map((k: AllocMethod) => (
                        <tr key={k} className={`border-t border-[var(--border)] text-right ${k === "v2" ? "font-bold" : ""}`}>
                          <td className="text-left py-1 text-[var(--text)]">{ALLOC_METHOD_LABEL[k]}</td>
                          {result.folds.map((f) => <td key={f.month} className="px-1.5 text-[var(--text)]">{pct(f.slot[k])}</td>)}
                          <td className={`px-1.5 ${k === best ? "text-emerald-400" : "text-[var(--text)]"}`}>{pct(result.pooled[k]?.slot)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[11px] text-[var(--text-faint)] leading-snug">
                  Mỗi tháng engine chỉ được xem các tháng TRƯỚC nó, rồi chia đúng tổng GMV đã đối soát của tháng đó xuống ca; sai số = Σ|target ca − GMV ca đã đối soát| ÷ Σ GMV đã đối soát (thấp hơn là tốt). Bảng chỉ đo việc CHIA, không đo việc đặt tổng target. Gộp theo ngày: {ALLOC_METHODS.filter((k) => result.pooled[k]).map((k) => `${{ hours: "theo giờ", old: "cũ", glm: "v2 riêng", v2: "v2 trộn" }[k]} ${pct(result.pooled[k]!.day)}`).join(" · ")}. {result.folds.some((f) => f.partial) ? "* = tháng chưa trọn, chỉ để tham khảo. " : ""}Sai số quanh 22% là mức nhiễu từng ca — hệ số đúng mấy cũng không xuống dưới ~18%; chênh dưới ~1 điểm % giữa hai cách chưa đủ để kết luận.
                </p>
              </>
            )}
          </div>

          <details className="text-[11px] text-[var(--text-muted)]">
            <summary className="cursor-pointer font-bold text-[var(--text)] min-h-6">Muốn nâng cấp logic chia target thì làm gì</summary>
            <ol className="list-decimal pl-4 mt-1 space-y-0.5 leading-snug">
              <li>Sửa <code>src/lib/performance/allocationModel.ts</code> (mô hình + trộn + backtest cùng một file; thêm hệ số mới = thêm cột trong <code>fitAllocationModel</code> và một dòng trong <code>glmWeights</code>).</li>
              <li>Thêm tham số tương ứng vào <code>EngineParams</code> (<code>engineParams.ts</code>, nhóm Target) — nó tự hiện ở cột Tham số.</li>
              <li>Mở lại bảng này cho CẢ HAI sàn và các brand: chỉ nâng khi sai số gộp thấp hơn ở ≥ 2 tháng và không tệ đi ở brand khác.</li>
              <li>Chạy <code>npx vitest run tests/allocationModel.test.ts</code>, rồi ghi số đo vào <code>docs/WORKSPACE_HISTORY.md</code>.</li>
              <li>Đã thử và KHÔNG giúp (khỏi thử lại): thứ trong tuần, tuần trong tháng, tương tác loại ngày × khung, ô trực tiếp n ≥ 5, vị trí ngày trong D-Day, trọng số tháng gần, cắt ngoại lệ, học chung nhiều brand. Còn thiếu dữ liệu để thử: Ads theo ca, nội dung/gift của ca.</li>
            </ol>
          </details>
        </>
      )}
    </div>
  );
};
