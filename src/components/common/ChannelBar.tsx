import { profileOf } from "../../lib/platforms/profiles";
import type { ChannelScope, ReportPlatform } from "../../lib/reportPlatform";

// Thanh chọn sàn ở đầu nội dung (Bước 3 lộ trình đa sàn, 07/10). Sàn không còn là workspace: đổi sàn không đổi sidebar.
// Màn "mọi kênh" có thêm "Tất cả" — màn đó hiện khối riêng từng sàn, không bao giờ cộng số hiệu suất hai sàn.
export function ChannelBar({
  platforms,
  value,
  allowAll,
  onChange,
  note
}: {
  platforms: ReportPlatform[];
  value: ChannelScope;
  allowAll: boolean;
  onChange: (v: ChannelScope) => void;
  note?: string;
}) {
  const options: ChannelScope[] = allowAll ? ["all", ...platforms] : platforms;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sàn">
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Sàn</span>
      <div className="inline-flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1">
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              aria-pressed={on}
              className={`min-h-6 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                on ? (o === "all" ? "bg-[var(--accent)] text-white" : `border ${profileOf(o).chipClass}`) : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
              }`}
            >
              {o === "all" ? "Tất cả kênh" : profileOf(o).label}
            </button>
          );
        })}
      </div>
      {note && <span className="text-[11px] text-[var(--text-faint)]">{note}</span>}
    </div>
  );
}
