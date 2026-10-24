import { useCallback, useEffect, useState } from "react";
import { acceptSessionDraft, dismissSessionDrafts, fetchSessionDrafts, type SessionDraft } from "../lib/db/sessionDrafts";
import { todayVn } from "../lib/performance/brandCommitment";
import { errorMessage } from "../lib/errorMessage";
import { useToast } from "./useToast";

// Ca nháp (0170) của Bảng Vận Hành — App giữ MỘT bản cho cả ba chỗ đọc (24/10, gộp Phòng Điều Hành): việc cần làm ("N ca nháp chờ
// xác nhận"), dòng ca nháp trong danh sách ca, và chế độ "Cả tháng" (sa bàn tạo nháp xong nạp lại ở đây).
// `missing` = DB chưa chạy 0170 ⇒ không có việc, không có dòng nháp; sa bàn báo lỗi khi bấm tạo.

export interface DraftEdit {
  date: string;
  startTime: string;
  endTime: string;
  hostId: string;
  coHostId: string;
  studioId: string;
}

export function useSessionDrafts(enabled: boolean, onSessionsChanged: () => Promise<void>) {
  const { showToast } = useToast();
  const [state, setState] = useState<{ drafts: SessionDraft[]; missing: boolean }>({ drafts: [], missing: false });
  const [nonce, setNonce] = useState(0);
  const today = todayVn();

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchSessionDrafts(today)
      .then((r) => alive && setState(r))
      .catch((e) => alive && showToast(`Không đọc được ca nháp: ${errorMessage(e)}`));
    return () => {
      alive = false;
    };
  }, [enabled, today, nonce, showToast]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  /** Xác nhận = tạo ca thật + chốt người (RPC chặn trùng người/phòng như ca thường). Lỗi ném ra để dòng nháp hiện tại chỗ. */
  const accept = useCallback(
    async (d: SessionDraft, e: DraftEdit) => {
      await acceptSessionDraft({ id: d.id, date: e.date, startTime: e.startTime, endTime: e.endTime, hostId: e.hostId || null, coHostId: e.coHostId || null, studioId: e.studioId || null });
      showToast("Đã tạo ca. Kênh đã chốt Kế Hoạch Tháng thì ca vào mục ca tăng cường.");
      reload();
      await onSessionsChanged();
    },
    [showToast, reload, onSessionsChanged]
  );

  const dismiss = useCallback(
    async (ids: string[]) => {
      await dismissSessionDrafts(ids);
      reload();
    },
    [reload]
  );

  return { drafts: state.drafts, missing: state.missing, reload, accept, dismiss };
}
