import { useEffect, useState } from "react";
import { LiveSession } from "../types";
import { submitTikTokHandover } from "../lib/db/handovers";
import { errorMessage } from "../lib/errorMessage";
import { hasSnapshot } from "../lib/sessionLedger";
import { SessionLiveSnapshotUpload } from "./SessionLiveSnapshotUpload";
import { HandoverIncidents, incidentsFromReport, incidentValues } from "./HandoverIncidents";
import { fetchSnapshotParts } from "../lib/db/sessionRoomLinks";
import { suggestedRestartCount } from "../lib/liveSnapshot/roomCases";

// Giao ca của ca TIKTOK (user chốt 06/10 tối — giữ cách build ban đầu): (1) up file Creator-Live-Performance tải từ
// TikTok ngay khi hết ca — file giữ đúng ranh giới ca nối (số cộng dồn của phòng, app trừ lần up trước, 0078);
// (2) chạm chọn sự cố/OT rồi bấm Giao ca (0145 — DB từ chối khi chưa có file). Ca Shopee: HandoverForm.

interface Props {
  session: LiveSession;
  onSaved: (updated: LiveSession[]) => void;
  onCancel?: () => void;
}

export function TikTokHandover({ session: s, onSaved, onCancel }: Props) {
  const [incidents, setIncidents] = useState(() => incidentsFromReport(s.report));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileDone = hasSnapshot(s);

  // Ca bị ngắt room (0153): điền sẵn "Restart ×N" theo số lần ngắt đã ghi / số room − 1 — chỉ gợi ý, trợ vẫn sửa được. Không đụng
  // vào report đã có số restart hoặc khi trợ đã tự bật/tắt.
  const roomCount = s.liveRoomIds?.length ?? 0;
  useEffect(() => {
    if ((s.report?.restartCount ?? 0) > 0) return;
    let alive = true;
    fetchSnapshotParts(s.id)
      .then((parts) => {
        const n = suggestedRestartCount(parts.length, roomCount);
        if (!alive || n <= 0) return;
        setIncidents((cur) => (cur.on.includes("restart") ? cur : { ...cur, on: [...cur.on, "restart"], restarts: n }));
      })
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy theo ca + số room, không theo state sự cố đang gõ
  }, [s.id, roomCount]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved([await submitTikTokHandover(s.id, incidentValues(incidents))]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="block text-xs font-bold text-[var(--text-muted)]">
          1 · Up file Creator-Live-Performance {fileDone && <span className="text-emerald-400 font-normal">— đã có</span>}
        </p>
        <SessionLiveSnapshotUpload session={s} onApplied={(u) => onSaved([u])} />
      </div>
      <HandoverIncidents label="2 · Ca này có gì?" value={incidents} onChange={setIncidents} />
      {error && <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded-xl px-3 py-2">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-12 px-4 rounded-xl bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-sm">
            Thôi
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!fileDone || saving}
          title={fileDone ? undefined : "Up file ở bước 1 trước"}
          className="flex-1 min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm"
        >
          {saving ? "Đang giao ca..." : s.report?.handoverAt ? "Cập nhật giao ca" : "Giao ca"}
        </button>
      </div>
      {!fileDone && <p className="text-[11px] text-[var(--text-faint)]">Up file ở bước 1 trước, rồi mới giao ca được.</p>}
    </div>
  );
}
