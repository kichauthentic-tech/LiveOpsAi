import React, { useMemo, useState } from "react";
import { BrandPlatformRate, BrandPlatformRateHistoryEntry, UserRole } from "../../types";
import { Tag, History } from "lucide-react";

interface BrandRateCardProps {
  brandId: string;
  currentRole: UserRole;
  brandPlatformRates: BrandPlatformRate[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  onSaveRate: (brandId: string, platform: "TikTok" | "Shopee", ratePerHour: number) => Promise<boolean>;
}

const PLATFORMS: ("TikTok" | "Shopee")[] = ["TikTok", "Shopee"];

export const BrandRateCard: React.FC<BrandRateCardProps> = ({
  brandId,
  currentRole,
  brandPlatformRates,
  brandPlatformRateHistory,
  onSaveRate
}) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [drafts, setDrafts] = useState<Partial<Record<"TikTok" | "Shopee", string>>>({});
  const [busy, setBusy] = useState<"TikTok" | "Shopee" | null>(null);

  const rateByPlatform = useMemo(() => {
    const map: Partial<Record<"TikTok" | "Shopee", BrandPlatformRate>> = {};
    for (const r of brandPlatformRates) {
      if (r.brandId === brandId) map[r.platform] = r;
    }
    return map;
  }, [brandPlatformRates, brandId]);

  const historyByPlatform = useMemo(() => {
    const map: Record<"TikTok" | "Shopee", BrandPlatformRateHistoryEntry[]> = { TikTok: [], Shopee: [] };
    brandPlatformRateHistory
      .filter((h) => h.brandId === brandId)
      .forEach((h) => map[h.platform].push(h));
    Object.values(map).forEach((list) => list.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)));
    return map;
  }, [brandPlatformRateHistory, brandId]);

  const handleSave = async (platform: "TikTok" | "Shopee") => {
    const raw = drafts[platform];
    if (raw === undefined) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    setBusy(platform);
    const ok = await onSaveRate(brandId, platform, value);
    setBusy(null);
    if (ok) setDrafts((d) => ({ ...d, [platform]: undefined }));
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <Tag className="w-5 h-5 text-blue-400" /> Rate Card
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLATFORMS.map((platform) => {
          const current = rateByPlatform[platform];
          const draft = drafts[platform];
          return (
            <div key={platform} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">{platform}</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold">đ / giờ live</span>
              </div>
              <p className="text-2xl font-black text-emerald-400">
                {current ? current.ratePerHour.toLocaleString("vi-VN") : "—"}đ
              </p>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Rate mới"
                    value={draft ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [platform]: e.target.value }))}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => handleSave(platform)}
                    disabled={busy !== null || draft === undefined || draft === ""}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    {busy === platform ? "..." : "Lưu"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <h3 className="font-bold text-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" /> Lịch Sử Rate
        </h3>
        {PLATFORMS.map((platform) => (
          <div key={platform} className="space-y-1.5">
            <p className="text-xs font-bold text-slate-400">{platform}</p>
            {historyByPlatform[platform].length === 0 ? (
              <p className="text-[11px] text-slate-600 pl-2">Chưa có lịch sử.</p>
            ) : (
              <div className="space-y-1">
                {historyByPlatform[platform].map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-[11px] bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1.5">
                    <span className="text-slate-400 font-mono">
                      {h.effectiveFrom} → {h.effectiveTo ?? "hiện tại"}
                    </span>
                    <span className="text-slate-200 font-bold">{h.ratePerHour.toLocaleString("vi-VN")}đ</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
