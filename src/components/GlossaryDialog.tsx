import React, { useState } from "react";
import { BookOpen, X } from "lucide-react";
import { UserRole } from "../types";
import { METRIC_HINT } from "../lib/metricGlossary";

// "Từ điển & cách dùng" — mở từ nút ? trên thanh đầu trang (audit người mới 2026-10-04, Nhóm 5). Trước đây app không
// có chỗ nào giải thích "snapshot", "đối soát", "nạp bù", "run-rate"… hay thứ tự việc trong tháng; người mới phải
// hỏi người cũ. Chỉ số lấy thẳng từ lib/metricGlossary.ts (một nguồn tên + công thức cho cả app).

interface Props {
  currentRole: UserRole;
  onClose: () => void;
}

const OPS_STEPS: { step: string; where: string; why: string }[] = [
  { step: "Nhập hợp đồng và giờ cam kết mỗi tháng", where: "Cam Kết Hợp Đồng", why: "Kế Hoạch Tháng lấy số giờ cần xếp từ đây." },
  { step: "Nhập giá: cách thu phí, đơn giá/giờ hoặc % hoa hồng, tỷ lệ hoàn huỷ", where: "CRM → nút Rate Card trên thẻ brand", why: "Thiếu giá thì Finance và Dashboard không tính được doanh thu, lãi." },
  { step: "Lập Kế Hoạch Tháng: lưới ca, target từng ca, khung ngày camp, phòng live — rồi bấm Chốt", where: "Kế Hoạch Tháng", why: "Chốt xong mới có ca để talent đăng ký; target tháng = tổng target các ca." },
  { step: "Talent đăng ký rảnh, ops chốt Host + Trợ live cho từng ca", where: "Nhân sự ca (talent thấy là Đăng Ký Ca)", why: "Ca có người mới hiện ở Bảng Vận Hành, Lịch." },
  { step: "Trong ca: trợ live up file lúc giao ca (snapshot), host nộp report ca", where: "Bảng Vận Hành → bấm vào ca (Cửa sổ Ca Live)", why: "Giữ ranh giới số giữa 2 ca chung một phòng live." },
  { step: "Hằng tuần/cuối tháng: tải file từ TikTok Shop, up ở Dữ Liệu Gốc và Đối Soát Số Liệu", where: "Dữ Liệu Gốc (trong từng brand) · Đối Soát Số Liệu", why: "TikTok còn cập nhật GMV nhiều giờ sau khi tắt live; số đối soát là số cuối." },
  { step: "Hết tháng (brand có chạy Ads): tải file \"Campaign overview data\" theo ngày từ TikTok Ads", where: "Nhập Ads (trong từng brand)", why: "Report Tháng phần 6 lấy chi phí Ads, ROI, ROI theo loại ngày từ file này." },
  { step: "Hết tháng: tạo Report Tháng, kiểm số, rồi Phát hành cho brand", where: "Report Tháng (trong từng brand) · Điều Phối Phát Hành", why: "Phát hành = đóng sổ tháng: số của tháng không đổi nữa." },
  { step: "Theo dõi: tiến độ tháng, host nào bán tốt, lãi lỗ", where: "Dashboard · Hiệu Suất Host · Finance & P&L", why: "" }
];

const TALENT_STEPS: { step: string; where: string; why: string }[] = [
  { step: "Đăng ký những ca bạn rảnh", where: "Đăng Ký Ca", why: "Ops chốt người từ danh sách đăng ký." },
  { step: "Xem ca đã được chốt cho bạn", where: "Ca Của Tôi", why: "" },
  { step: "Sau ca: nộp report ca (số liệu, ghi chú)", where: "Ca Của Tôi → bấm vào ca", why: "Số bạn nộp là số tạm; số đối soát từ TikTok sẽ thay sau." }
];

const TERMS: { term: string; meaning: string }[] = [
  { term: "Ca / phiên live", meaning: "Ca là một khung giờ có host trực trong app. Phiên là một lần bật live trên TikTok. Một phiên dài có thể chia cho nhiều ca." },
  { term: "Kế hoạch nháp / đã chốt", meaning: "Nháp: đang soạn, chưa sinh ca. Chốt: ca đổ xuống Nhân sự ca để talent đăng ký. Vẫn sửa được target ca và khung camp sau khi chốt." },
  { term: "Ca chờ đăng ký", meaning: "Ca đã mở nhưng chưa chốt người." },
  { term: "Report TikTok / Report Shopee", meaning: "Mỗi brand mỗi tháng có thể có hai report độc lập, một cho từng sàn. Phát hành, thu hồi và đóng sổ riêng từng sàn; brand chỉ thấy số của sàn đã phát hành. Report Shopee lấy số từ 4 file Shopee Live (Live List, theo ngày, tổng quan tháng, sản phẩm) — GMV Shopee là doanh số đặt, \"thực nhận\" là doanh số đã xác nhận (sau đơn huỷ)." },
  { term: "Đổi người giữa ca", meaning: "Host hoặc trợ live vào thay / ra sớm giữa chừng. Ghi ở Sửa ca → \"Đổi người giữa ca\": ai làm từ giờ nào đến giờ nào. Ca vẫn là một ca (một GMV); lương, giờ làm, trùng lịch và hiệu suất tính theo giờ từng người." },
  { term: "Target GMV tháng · KPI GMV · Tổng target", meaning: "Target GMV tháng: số ops đặt để chia xuống ca. KPI GMV: số brand giao cho cả shop, chỉ để Report so. Tổng target: cộng target từng ca — Dashboard dùng số này." },
  { term: "Ngày camp (D-Day, Mid-Month, Pay Day)", meaning: "Các đợt sale trong tháng. Mặc định D-Day = ngày trùng tháng (10/10), Mid-Month 13–15, Pay Day 23–25; đổi ở Kế Hoạch Tháng." },
  { term: "Cam kết giờ", meaning: "Số giờ live brand mua mỗi tháng theo hợp đồng; tính theo giờ ca trong lịch." },
  { term: "Số tự khai", meaning: "Số host/trợ live tự nhập trong report ca. Tin cậy thấp nhất." },
  { term: "Snapshot (số lúc giao ca)", meaning: "File TikTok trợ live up ngay lúc hết ca. Dùng để tách số của 2 ca liền nhau cùng một phòng." },
  { term: "Đối soát", meaning: "Up file TikTok cuối kỳ để thay mọi số tạm bằng số cuối cùng. Số đã đối soát là số tin được nhất." },
  { term: "Nạp bù", meaning: "Ca tạo lại từ file TikTok cho những tháng chưa dùng app (T6–T9/2026). Không cần snapshot/report; không tính vào Finance." },
  { term: "Run-rate", meaning: "Thực đạt ÷ target của các ca kế hoạch tính tới ngày cuối có số. Dưới 100% là đang chậm so với kế hoạch." },
  { term: "Dự phóng cuối tháng", meaning: "Số đã có + giờ các ca còn trong lịch × GMV/giờ gần đây. Thử lại trên T7–T8: lệch khoảng ±8%." },
  { term: "File Ads (Campaign overview)", meaning: "File TikTok Ads (GMV Max) theo ngày của cả cửa hàng: chi phí, đơn SKU, doanh thu gộp. Tải ở Nhập Ads, mỗi tháng một file. ROI = doanh thu gộp ÷ chi phí. Doanh thu gộp tính trước huỷ/hoàn nên có thể lớn hơn GMV của shop — không lấy làm % GMV." },
  { term: "Phát hành report", meaning: "Gửi Report Tháng cho brand xem. Từ lúc đó số và lịch của tháng bị khoá tới khi thu hồi." },
  { term: "Agency / Brand Workspace", meaning: "Agency: nhìn mọi brand (chọn ở góc trên bên trái). Brand: mọi màn của riêng một brand — Dashboard, Lịch, Report, Dữ Liệu Gốc…" }
];

export const GlossaryDialog: React.FC<Props> = ({ currentRole, onClose }) => {
  const [tab, setTab] = useState<"steps" | "terms" | "metrics">("steps");
  const steps = currentRole === "talent" ? TALENT_STEPS : OPS_STEPS;
  const tabCls = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs font-bold ${on ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Từ điển và cách dùng"
        className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-[var(--text)] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--accent-text)]" /> Từ điển và cách dùng
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-1 p-2 border-b border-[var(--border)]">
          <button className={tabCls(tab === "steps")} onClick={() => setTab("steps")}>Việc trong tháng</button>
          <button className={tabCls(tab === "terms")} onClick={() => setTab("terms")}>Từ ngữ</button>
          <button className={tabCls(tab === "metrics")} onClick={() => setTab("metrics")}>Chỉ số</button>
        </div>
        <div className="overflow-y-auto p-4 text-xs text-[var(--text)]">
          {tab === "steps" && (
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={s.step} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--accent)]/20 text-[var(--accent-text)] font-bold flex items-center justify-center">{i + 1}</span>
                  <div>
                    <p className="font-bold">{s.step}</p>
                    <p className="text-[var(--text-muted)]">Ở màn: {s.where}</p>
                    {s.why && <p className="text-[var(--text-faint)]">{s.why}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {tab === "terms" && (
            <dl className="space-y-3">
              {TERMS.map((t) => (
                <div key={t.term}>
                  <dt className="font-bold">{t.term}</dt>
                  <dd className="text-[var(--text-muted)]">{t.meaning}</dd>
                </div>
              ))}
            </dl>
          )}
          {tab === "metrics" && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {Object.entries(METRIC_HINT).map(([name, hint]) => (
                <div key={name}>
                  <dt className="font-bold">{name}</dt>
                  <dd className="text-[var(--text-muted)]">{hint}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
};
