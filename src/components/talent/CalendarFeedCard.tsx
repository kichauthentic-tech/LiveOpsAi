import React, { useEffect, useState } from "react";
import { CalendarPlus, Copy, RefreshCw } from "lucide-react";
import { CalendarFeedNotReady, calendarLinks, fetchMyCalendarToken, rotateMyCalendarToken, type CalendarLinks } from "../../lib/db/calendarFeed";
import { errorMessage } from "../../lib/errorMessage";

// "Thêm lịch ca vào điện thoại" (app talent bản 2, 0177). Thêm MỘT lần: ca tự hiện trong Google Calendar / Lịch iPhone, tự nhắc
// trước giờ live 1 tiếng, OP đổi giờ thì lịch tự đổi (ứng dụng lịch tải lại mỗi ~1 giờ; Google có thể chậm vài giờ). Không phải mở
// app để biết lịch — đo 16/10 chỉ 1/39 host/trợ từng mở app.

type State = { kind: "loading" } | { kind: "ready"; links: CalendarLinks } | { kind: "off" } | { kind: "error"; message: string };

const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

export const CalendarFeedCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [copied, setCopied] = useState(false);
  // Trình duyệt chặn chép (một số webview trong Zalo) ⇒ hiện link để người dùng tự chọn và chép.
  const [showLink, setShowLink] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMyCalendarToken()
      .then((t) => alive && setState({ kind: "ready", links: calendarLinks(window.location.origin, t) }))
      .catch((e) => alive && setState(e instanceof CalendarFeedNotReady ? { kind: "off" } : { kind: "error", message: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, []);

  // Thẻ gợi ý ở "Ca của tôi" chỉ hiện khi đã có link; chưa chạy 0177 / lỗi thì tab Tôi nói rõ.
  if (compact && state.kind !== "ready") return null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setShowLink(true);
    }
  };
  const rotate = async () => {
    setBusy(true);
    try {
      setState({ kind: "ready", links: calendarLinks(window.location.origin, await rotateMyCalendarToken()) });
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-9 rounded-lg text-xs font-bold border";

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 space-y-2.5" aria-label="Thêm lịch vào điện thoại">
      <div className="flex items-start gap-2 pr-8">
        <CalendarPlus className="w-4 h-4 text-[var(--accent-text)] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-sm font-black text-[var(--text)]">Thêm lịch ca vào điện thoại</h3>
          <p className="text-xs text-[var(--text-muted)]">Thêm một lần: ca tự hiện trong lịch điện thoại, tự nhắc trước giờ live 1 tiếng, OP đổi giờ thì lịch tự đổi.</p>
        </div>
      </div>
      {state.kind === "off" && <p className="text-xs text-[var(--text-faint)]">Chưa bật — nhờ admin chạy cập nhật 0177.</p>}
      {state.kind === "error" && <p className="text-xs text-rose-300">Không lấy được link lịch: {state.message}</p>}
      {state.kind === "loading" && <p className="text-xs text-[var(--text-faint)]">Đang lấy link…</p>}
      {state.kind === "ready" && (
        <>
          <div className="flex flex-wrap gap-2">
            <a href={isIos() ? state.links.webcal : state.links.google} target={isIos() ? undefined : "_blank"} rel="noopener noreferrer" className={`${btn} bg-[var(--accent)] border-[var(--accent)] text-white`}>
              <CalendarPlus className="w-4 h-4" /> {isIos() ? "Thêm vào Lịch iPhone" : "Thêm vào Google Calendar"}
            </a>
            <button type="button" onClick={() => copy(state.links.https)} className={`${btn} border-[var(--border)] text-[var(--text)]`}>
              <Copy className="w-4 h-4" /> {copied ? "Đã chép" : "Chép link"}
            </button>
          </div>
          {showLink && <p className="text-[11px] font-mono break-all select-all rounded-lg bg-[var(--surface-base)] border border-[var(--border)] p-2 text-[var(--text-muted)]">{state.links.https}</p>}
          {!compact && (
            <details className="text-xs text-[var(--text-muted)]">
              <summary className="cursor-pointer font-bold min-h-6 flex items-center">Cách thêm thủ công / đổi link</summary>
              <ul className="mt-1.5 space-y-1 list-disc pl-4">
                <li>iPhone: Cài đặt → Lịch → Tài khoản → Thêm tài khoản → Khác → Thêm lịch đã đăng ký → dán link.</li>
                <li>Google Calendar trên máy tính: Lịch khác → + → Từ URL → dán link.</li>
                <li>Link này là riêng của bạn — ai có link sẽ thấy lịch ca của bạn. Lỡ gửi nhầm thì bấm đổi link, link cũ hết dùng được.</li>
              </ul>
              <button type="button" onClick={rotate} disabled={busy} className={`${btn} mt-2 border-[var(--border)] text-[var(--text)] disabled:opacity-50`}>
                <RefreshCw className="w-3.5 h-3.5" /> Đổi link
              </button>
            </details>
          )}
        </>
      )}
    </section>
  );
};
