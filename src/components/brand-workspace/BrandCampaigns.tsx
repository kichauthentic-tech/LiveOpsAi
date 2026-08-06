import React, { useMemo, useState } from "react";
import { Campaign, CampaignRevisionNote, LiveSession, ShiftSlot, UserRole } from "../../types";
import { Target, Send, MessageSquare, CheckCircle2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { computeCampaignActualGmv } from "../../lib/campaignMetrics";

interface BrandCampaignsProps {
  brandId: string;
  currentRole: UserRole;
  campaigns: Campaign[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  campaignRevisionNotes: CampaignRevisionNote[];
  onSendCampaignForApproval: (campaign: Campaign) => Promise<boolean>;
  onRespondToCampaignApproval: (campaign: Campaign, decision: "approved" | "revision_requested", note?: string) => Promise<boolean>;
  onSubmitCampaignReview: (
    campaign: Campaign,
    review: { outcome: NonNullable<Campaign["outcome"]>; renewalDecision: NonNullable<Campaign["renewalDecision"]>; reviewNotes: string }
  ) => Promise<boolean>;
}

const CAMPAIGN_TYPE_LABELS: Record<Campaign["type"], string> = {
  daily: "Daily",
  mega: "Mega D-Day",
  mid_month: "Mid-month",
  payday: "Payday",
  other: "Khác"
};

const APPROVAL_STATUS_LABELS: Record<Campaign["approvalStatus"], string> = {
  draft: "Chưa gửi duyệt",
  sent_for_approval: "Đang chờ Brand duyệt",
  revision_requested: "Brand yêu cầu sửa",
  approved: "Đã duyệt"
};

const APPROVAL_STATUS_STYLES: Record<Campaign["approvalStatus"], string> = {
  draft: "bg-slate-800 text-slate-400",
  sent_for_approval: "bg-blue-950 text-blue-300",
  revision_requested: "bg-rose-950 text-rose-300",
  approved: "bg-emerald-950 text-emerald-300"
};

const OUTCOME_LABELS: Record<NonNullable<Campaign["outcome"]>, string> = {
  kpi_met: "Đạt KPI",
  kpi_missed: "Không đạt KPI",
  partial: "Đạt một phần"
};

const OUTCOME_STYLES: Record<NonNullable<Campaign["outcome"]>, string> = {
  kpi_met: "bg-emerald-950 text-emerald-300",
  kpi_missed: "bg-rose-950 text-rose-300",
  partial: "bg-amber-950 text-amber-300"
};

const RENEWAL_LABELS: Record<NonNullable<Campaign["renewalDecision"]>, string> = {
  renew: "Gia hạn",
  at_risk: "Có nguy cơ rời",
  churned: "Đã rời (churned)"
};

const RENEWAL_STYLES: Record<NonNullable<Campaign["renewalDecision"]>, string> = {
  renew: "bg-emerald-950 text-emerald-300",
  at_risk: "bg-amber-950 text-amber-300",
  churned: "bg-rose-950 text-rose-300"
};

const CampaignCard: React.FC<{
  campaign: Campaign;
  actualGmv: number;
  slots: ShiftSlot[];
  sessions: LiveSession[];
  notes: CampaignRevisionNote[];
  currentRole: UserRole;
  onSendCampaignForApproval: (campaign: Campaign) => Promise<boolean>;
  onRespondToCampaignApproval: (campaign: Campaign, decision: "approved" | "revision_requested", note?: string) => Promise<boolean>;
  onSubmitCampaignReview: (
    campaign: Campaign,
    review: { outcome: NonNullable<Campaign["outcome"]>; renewalDecision: NonNullable<Campaign["renewalDecision"]>; reviewNotes: string }
  ) => Promise<boolean>;
}> = ({ campaign: c, actualGmv, slots, sessions, notes, currentRole, onSendCampaignForApproval, onRespondToCampaignApproval, onSubmitCampaignReview }) => {
  const [expanded, setExpanded] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [respondBusy, setRespondBusy] = useState<"approved" | "revision_requested" | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewOutcome, setReviewOutcome] = useState<NonNullable<Campaign["outcome"]>>(c.outcome ?? "kpi_met");
  const [reviewRenewal, setReviewRenewal] = useState<NonNullable<Campaign["renewalDecision"]>>(c.renewalDecision ?? "renew");
  const [reviewNotesDraft, setReviewNotesDraft] = useState(c.reviewNotes ?? "");
  const [reviewBusy, setReviewBusy] = useState(false);

  const pct = c.targetGmv > 0 ? Math.round((actualGmv / c.targetGmv) * 100) : 0;
  const canManage = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const canApprove = currentRole === "brand" && c.approvalStatus === "sent_for_approval";
  const sessionsInCampaign = sessions.filter((s) => s.campaignId === c.id);

  const handleApprove = async () => {
    setRespondBusy("approved");
    await onRespondToCampaignApproval(c, "approved");
    setRespondBusy(null);
  };

  const handleRequestRevision = async () => {
    if (!revisionNote.trim()) return;
    setRespondBusy("revision_requested");
    const ok = await onRespondToCampaignApproval(c, "revision_requested", revisionNote);
    setRespondBusy(null);
    if (ok) setRevisionNote("");
  };

  const handleSubmitReview = async () => {
    setReviewBusy(true);
    const ok = await onSubmitCampaignReview(c, { outcome: reviewOutcome, renewalDecision: reviewRenewal, reviewNotes: reviewNotesDraft.trim() });
    setReviewBusy(false);
    if (ok) setReviewing(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <strong className="text-base text-white">{c.name}</strong>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{CAMPAIGN_TYPE_LABELS[c.type]}</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                c.status === "active"
                  ? "bg-emerald-950 text-emerald-300"
                  : c.status === "completed"
                  ? "bg-blue-950 text-blue-300"
                  : c.status === "cancelled"
                  ? "bg-slate-800 text-slate-500"
                  : "bg-amber-950 text-amber-300"
              }`}
            >
              {c.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{c.startDate} → {c.endDate}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${APPROVAL_STATUS_STYLES[c.approvalStatus]}`}>
          {APPROVAL_STATUS_LABELS[c.approvalStatus]}
        </span>
      </div>

      <div>
        <div className="flex justify-between text-[11px] font-bold mb-1">
          <span className="text-slate-400">
            {formatCurrencyAdaptive(actualGmv)} / KPI {formatCurrencyAdaptive(c.targetGmv)}
          </span>
          <span className="text-emerald-400">{pct}%</span>
        </div>
        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      {c.hostBriefing && <p className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-lg p-2">{c.hostBriefing}</p>}

      {notes.length > 0 && (
        <div className="space-y-1 border-t border-slate-800 pt-2">
          <span className="text-[11px] text-amber-400 font-bold flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Yêu cầu sửa
          </span>
          {notes.slice(0, 3).map((n) => (
            <p key={n.id} className="text-[11px] text-slate-400 pl-4">
              <span className="text-slate-300 font-bold">{n.requestedByName}</span> ({new Date(n.createdAt).toLocaleString("vi-VN")}): {n.note}
            </p>
          ))}
        </div>
      )}

      {canManage && (c.approvalStatus === "draft" || c.approvalStatus === "revision_requested") && (
        <button
          onClick={() => onSendCampaignForApproval(c)}
          className="flex items-center gap-1 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors"
        >
          <Send className="w-3 h-3" /> Gửi Brand Duyệt
        </button>
      )}

      {canApprove && (
        <div className="border-t border-slate-800 pt-3 space-y-2">
          <textarea
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            placeholder="Ghi chú yêu cầu sửa (bắt buộc nếu chọn Yêu Cầu Sửa)..."
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={respondBusy !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {respondBusy === "approved" ? "Đang duyệt..." : "Duyệt Lịch"}
            </button>
            <button
              onClick={handleRequestRevision}
              disabled={respondBusy !== null || !revisionNote.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950 hover:bg-rose-900 disabled:opacity-50 text-rose-300 border border-rose-800 rounded-lg text-xs font-bold transition-colors"
            >
              <Send className="w-3.5 h-3.5" /> {respondBusy === "revision_requested" ? "Đang gửi..." : "Yêu Cầu Sửa"}
            </button>
          </div>
        </div>
      )}

      {c.status === "completed" && (
        <div className="space-y-2 border-t border-slate-800 pt-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-500">Đánh giá cuối kỳ:</span>
            {c.outcome && <span className={`px-2 py-0.5 rounded-full font-bold ${OUTCOME_STYLES[c.outcome]}`}>{OUTCOME_LABELS[c.outcome]}</span>}
            {c.renewalDecision && (
              <span className={`px-2 py-0.5 rounded-full font-bold ${RENEWAL_STYLES[c.renewalDecision]}`}>{RENEWAL_LABELS[c.renewalDecision]}</span>
            )}
            {!c.outcome && !canManage && <span className="text-slate-500">Chưa có đánh giá.</span>}
            {canManage && !reviewing && (
              <button
                onClick={() => setReviewing(true)}
                className="ml-auto flex items-center gap-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded-lg font-bold transition-colors"
              >
                <Check className="w-3 h-3" /> {c.outcome ? "Sửa Đánh Giá" : "Đánh Giá"}
              </button>
            )}
          </div>
          {c.reviewNotes && !reviewing && <p className="text-[11px] text-slate-400">{c.reviewNotes}</p>}

          {reviewing && (
            <div className="bg-slate-950/80 border border-emerald-800/60 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={reviewOutcome}
                  onChange={(e) => setReviewOutcome(e.target.value as NonNullable<Campaign["outcome"]>)}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={reviewRenewal}
                  onChange={(e) => setReviewRenewal(e.target.value as NonNullable<Campaign["renewalDecision"]>)}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  {Object.entries(RENEWAL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={reviewNotesDraft}
                onChange={(e) => setReviewNotesDraft(e.target.value)}
                placeholder="Ghi chú đánh giá (lý do đạt/không đạt KPI, dấu hiệu rủi ro rời Brand...)"
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSubmitReview}
                  disabled={reviewBusy}
                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors"
                >
                  {reviewBusy ? "Đang lưu..." : "Lưu Đánh Giá"}
                </button>
                <button onClick={() => setReviewing(false)} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
                  Huỷ
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {sessionsInCampaign.length} phiên live thuộc campaign này
      </button>
      {expanded && (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {sessionsInCampaign.length === 0 && <p className="text-[11px] text-slate-500">Chưa có phiên live nào.</p>}
          {sessionsInCampaign
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((s) => (
              <div key={s.id} className="flex items-center justify-between text-[11px] bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5">
                <span className="text-slate-300 font-mono">
                  {s.date} • {s.startTime}-{s.endTime} • {s.status}
                </span>
                <span className="text-emerald-400 font-bold">{formatCurrencyAdaptive(s.actualGmv || 0)}</span>
              </div>
            ))}
          {slots.length > 0 && (
            <p className="text-[10px] text-slate-600 pt-1">{slots.length} ca đã phân bổ (kể cả ca chưa chốt thành session).</p>
          )}
        </div>
      )}
    </div>
  );
};

export const BrandCampaigns: React.FC<BrandCampaignsProps> = ({
  brandId,
  currentRole,
  campaigns,
  sessions,
  shiftSlots,
  campaignRevisionNotes,
  onSendCampaignForApproval,
  onRespondToCampaignApproval,
  onSubmitCampaignReview
}) => {
  const brandCampaigns = useMemo(
    () =>
      campaigns
        .filter((c) => c.brandId === brandId)
        .slice()
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [campaigns, brandId]
  );
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);
  const campaignActualGmv = useMemo(() => computeCampaignActualGmv(brandCampaigns, brandSessions), [brandCampaigns, brandSessions]);

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Target className="w-4 h-4 text-purple-400" /> Màn hình trung tâm
        </span>
        <h2 className="text-2xl font-black">Campaign</h2>
        <p className="text-slate-400 text-xs">Timeline dọc theo tháng — duyệt lịch, xem tiến độ KPI, và đánh giá cuối kỳ khi campaign hoàn thành.</p>
      </div>

      {brandCampaigns.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
          Chưa có campaign nào cho brand này.
        </div>
      ) : (
        <div className="space-y-4">
          {brandCampaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              actualGmv={campaignActualGmv.get(c.id) ?? 0}
              slots={shiftSlots.filter((s) => s.campaignId === c.id)}
              sessions={brandSessions}
              notes={campaignRevisionNotes.filter((n) => n.campaignId === c.id)}
              currentRole={currentRole}
              onSendCampaignForApproval={onSendCampaignForApproval}
              onRespondToCampaignApproval={onRespondToCampaignApproval}
              onSubmitCampaignReview={onSubmitCampaignReview}
            />
          ))}
        </div>
      )}
    </div>
  );
};
