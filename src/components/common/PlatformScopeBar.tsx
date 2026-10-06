import { PLATFORM_SCOPE_LABEL, type PlatformScope, type ReportPlatform } from "../../lib/reportPlatform";

// Bộ chuyển sàn của Brand workspace (06/10) — MỘT chỗ chọn sàn cho mọi tab brand có số theo sàn (Dashboard, Lịch, Sổ Ca,
// Report Tháng, Nhập Ads, Cam Kết). App giữ lựa chọn theo brand + đưa lên URL (?san=), tab nào chỉ có từng sàn (Report)
// thì không có nút Tổng. Brand chỉ chạy một sàn thì App không dựng thanh này.

interface Props {
  platforms: ReportPlatform[];
  value: PlatformScope;
  allowAll: boolean;
  onChange: (v: PlatformScope) => void;
}

export function PlatformScopeBar({ platforms, value, allowAll, onChange }: Props) {
  const options: PlatformScope[] = [...(allowAll ? (["all"] as PlatformScope[]) : []), ...platforms];
  const current: PlatformScope = !allowAll && value === "all" ? platforms[0] : value;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">Sàn</span>
      <div className="inline-flex items-center gap-1 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-1" role="group" aria-label="Sàn">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            aria-pressed={current === o}
            className={`min-h-6 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              current === o ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
            }`}
          >
            {PLATFORM_SCOPE_LABEL[o]}
          </button>
        ))}
      </div>
    </div>
  );
}
