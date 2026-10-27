import React, { useEffect, useState } from "react";
import { Send } from "lucide-react";
import type { ChannelCard } from "../../lib/performance/channelCard";
import { bulletinFromCard, bulletinText, type Bulletin } from "../../lib/brand/bulletin";
import { fetchBrandBulletins, publishBrandBulletin } from "../../lib/db/brandBulletins";
import { brandSlug, withPlatformParam } from "../../lib/routes";
import { errorMessage } from "../../lib/errorMessage";
import { useToast } from "../../hooks/useToast";

// Gửi bản tin cho brand (21/10/2026, 0179) — ở Chi tiết kênh, ngay dưới thẻ kênh: chụp thẻ lúc bấm (tới nay, nhịp, dự kiến cuối
// tháng, giờ so cam kết) + lời nhắn của ops. Brand đọc ở cổng brand; "Chép tin Zalo" ra đúng các số đó kèm link cổng.

const dmhm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const BulletinComposer: React.FC<{ card: ChannelCard }> = ({ card }) => {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [last, setLast] = useState<{ key: string; row: Bulletin | null; missing: boolean } | null>(null);
  const key = `${card.brandId}|${card.platform}|${card.month}`;
  useEffect(() => {
    let alive = true;
    fetchBrandBulletins(card.brandId, card.platform)
      .then((r) => alive && setLast({ key, row: r.rows.find((b) => b.month === card.month) ?? null, missing: r.missing }))
      .catch(() => alive && setLast({ key, row: null, missing: false }));
    return () => { alive = false; };
  }, [card.brandId, card.platform, card.month, key]);
  const sent = last?.key === key ? last : null;
  const payload = bulletinFromCard(card);
  const link = `${window.location.origin}/brand/${brandSlug({ id: card.brandId, name: card.brandName })}/dashboard${withPlatformParam("", card.platform)}`;
  const text = bulletinText(payload, note, link);

  const send = async () => {
    setSending(true);
    try {
      await publishBrandBulletin({ brandId: card.brandId, platform: card.platform, month: card.month, asOf: payload.asOf, payload, note });
      const r = await fetchBrandBulletins(card.brandId, card.platform);
      setLast({ key, row: r.rows.find((b) => b.month === card.month) ?? null, missing: r.missing });
      showToast("Đã gửi bản tin — brand thấy ở trang Tổng quan của họ.");
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setSending(false);
    }
  };
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      showToast("Đã chép tin — dán vào nhóm Zalo của brand.");
    } catch {
      showToast("Trình duyệt không cho chép — bôi đen đoạn tin rồi chép tay.");
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          {sent?.missing ? "Chưa chạy migration 0179 — chưa gửi được bản tin cho brand." : sent?.row ? <>Bản tin tháng này gửi lần cuối <b className="text-[var(--text)]">{dmhm(sent.row.publishedAt)}</b>{sent.row.asOf ? ` (số tới ${sent.row.asOf.slice(8, 10)}/${sent.row.asOf.slice(5, 7)})` : ""}.</> : "Brand chưa nhận bản tin nào tháng này."}
        </p>
        <button type="button" onClick={() => setOpen((x) => !x)} disabled={sent?.missing} className="inline-flex items-center gap-1.5 min-h-[30px] px-3 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40">
          <Send className="w-3.5 h-3.5" />{open ? "Đóng" : "Gửi bản tin cho brand"}
        </button>
      </div>
      {open && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1.5 min-w-0">
            <label htmlFor="bulletin-note" className="text-xs font-bold text-[var(--text)]">Lời nhắn cho brand (YFB đang làm gì, cần brand hỗ trợ gì)</label>
            <textarea id="bulletin-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={4}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={send} disabled={sending} className="min-h-[32px] px-3.5 rounded-lg bg-[var(--accent)] text-sm font-bold text-white disabled:opacity-50">{sending ? "Đang gửi…" : "Gửi"}</button>
              <button type="button" onClick={() => copy(text)} className="min-h-[32px] px-3.5 rounded-lg border border-[var(--border)] text-sm font-bold text-[var(--text)] hover:border-[var(--accent)]">Chép tin Zalo</button>
            </div>
            <p className="text-[11px] text-[var(--text-faint)] leading-snug">Brand thấy đúng các số bên cạnh — không có nhãn "Rủi ro/Hụt target" hay xác suất. Số trong tháng chỉ tới brand qua bản tin; tháng phát hành Report thì brand xem đủ ở Report Tháng.</p>
          </div>
          <pre className="min-w-0 whitespace-pre-wrap rounded-lg bg-[var(--surface-base)] border border-[var(--border)] p-3 text-xs leading-relaxed text-[var(--text)] font-sans">{text}</pre>
        </div>
      )}
    </div>
  );
};
