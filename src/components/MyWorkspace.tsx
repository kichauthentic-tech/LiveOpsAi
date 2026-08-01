import React, { useState } from "react";
import { UserRole, SystemUser, Brand, AgencyProject, LiveSession, Talent, Campaign, CampaignRevisionNote, ShiftSlot } from "../types";
import { UserCheck, Building2, Layers, Radio, Calendar, DollarSign, Sparkles, Target, Send, MessageSquare, CheckCircle2 } from "lucide-react";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";

interface MyWorkspaceProps {
  currentRole: UserRole;
  activeUser: SystemUser;
  brands: Brand[];
  projects: AgencyProject[];
  sessions: LiveSession[];
  talents: Talent[];
  campaigns: Campaign[];
  campaignRevisionNotes: CampaignRevisionNote[];
  shiftSlots: ShiftSlot[];
  onRespondToCampaignApproval: (campaign: Campaign, decision: "approved" | "revision_requested", note?: string) => Promise<boolean>;
  onNavigateTab?: (tabId: string) => void;
  onSelectSession?: (session: LiveSession) => void;
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
  sent_for_approval: "Đang chờ bạn duyệt",
  revision_requested: "Bạn đã yêu cầu sửa",
  approved: "Đã duyệt"
};

const APPROVAL_STATUS_STYLES: Record<Campaign["approvalStatus"], string> = {
  draft: "bg-slate-800 text-slate-400",
  sent_for_approval: "bg-blue-950 text-blue-300",
  revision_requested: "bg-rose-950 text-rose-300",
  approved: "bg-emerald-950 text-emerald-300"
};

const CampaignApprovalCard: React.FC<{
  campaign: Campaign;
  slots: ShiftSlot[];
  notes: CampaignRevisionNote[];
  onRespond: (campaign: Campaign, decision: "approved" | "revision_requested", note?: string) => Promise<boolean>;
}> = ({ campaign, slots, notes, onRespond }) => {
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState<"approved" | "revision_requested" | null>(null);
  const canRespond = campaign.approvalStatus === "sent_for_approval";

  const handleApprove = async () => {
    setSubmitting("approved");
    await onRespond(campaign, "approved");
    setSubmitting(null);
  };

  const handleRequestRevision = async () => {
    if (!noteText.trim()) return;
    setSubmitting("revision_requested");
    const ok = await onRespond(campaign, "revision_requested", noteText);
    setSubmitting(null);
    if (ok) setNoteText("");
  };

  return (
    <div className="p-4 rounded-xl border border-slate-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-sm text-slate-100">{campaign.name}</strong>
          <span className="text-[10px] font-bold ml-2 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{CAMPAIGN_TYPE_LABELS[campaign.type]}</span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${APPROVAL_STATUS_STYLES[campaign.approvalStatus]}`}>
          {APPROVAL_STATUS_LABELS[campaign.approvalStatus]}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span>{campaign.startDate} → {campaign.endDate}</span>
        <span className="font-bold text-emerald-400">KPI GMV: {formatVnd(campaign.targetGmv)}</span>
        <span>{slots.length} ca đã phân bổ</span>
      </div>

      {campaign.hostBriefing && (
        <p className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-lg p-2">{campaign.hostBriefing}</p>
      )}

      {slots.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
          {slots
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((s) => (
              <div key={s.id} className="flex items-center justify-between text-[11px] bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5">
                <span className="text-slate-300 font-mono">{s.date} • {s.startTime}-{s.endTime}</span>
                <span className="text-slate-500">{s.platform}{s.studioName ? ` • ${s.studioName}` : ""}</span>
              </div>
            ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="space-y-1 border-t border-slate-800 pt-2">
          <span className="text-[11px] text-amber-400 font-bold flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Yêu cầu sửa đã gửi
          </span>
          {notes.slice(0, 3).map((n) => (
            <p key={n.id} className="text-[11px] text-slate-400 pl-4">
              {new Date(n.createdAt).toLocaleString("vi-VN")}: {n.note}
            </p>
          ))}
        </div>
      )}

      {canRespond && (
        <div className="border-t border-slate-800 pt-3 space-y-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Ghi chú yêu cầu sửa (bắt buộc nếu chọn Yêu Cầu Sửa)..."
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={submitting !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {submitting === "approved" ? "Đang duyệt..." : "Duyệt Lịch"}
            </button>
            <button
              onClick={handleRequestRevision}
              disabled={submitting !== null || !noteText.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950 hover:bg-rose-900 disabled:opacity-50 text-rose-300 border border-rose-800 rounded-lg text-xs font-bold transition-colors"
            >
              <Send className="w-3.5 h-3.5" /> {submitting === "revision_requested" ? "Đang gửi..." : "Yêu Cầu Sửa"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const formatVnd = (n: number) => formatCurrencyAdaptive(n);

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    "Live Now": "bg-red-100 text-red-700",
    Upcoming: "bg-amber-100 text-amber-700",
    Completed: "bg-emerald-100 text-emerald-700",
    Cancelled: "bg-slate-700 text-slate-400"
  };
  return map[status] || "bg-slate-700 text-slate-400";
};

const EmptyState: React.FC<{ title: string; desc: string }> = ({ title, desc }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
    <div className="w-14 h-14 bg-purple-950/30 text-purple-400 rounded-full flex items-center justify-center mx-auto">
      <UserCheck className="w-6 h-6" />
    </div>
    <h3 className="font-bold text-slate-100">{title}</h3>
    <p className="text-sm text-slate-400 max-w-md mx-auto">{desc}</p>
  </div>
);

const SessionRow: React.FC<{ s: LiveSession; onClick?: () => void }> = ({ s, onClick }) => (
  <div
    onClick={onClick}
    className={`p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 ${onClick ? "cursor-pointer hover:border-purple-700 hover:bg-purple-950/20" : ""} transition-all`}
  >
    <div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusBadge(s.status)}`}>{s.status}</span>
        <strong className="text-sm text-slate-100">{s.title || s.brandName}</strong>
      </div>
      <p className="text-xs text-slate-400 mt-0.5">
        {s.brandName} • {s.date} ({s.startTime}-{s.endTime}) • Studio: {s.studioName}
      </p>
    </div>
    <div className="text-right text-xs">
      <div className="font-bold text-emerald-400">{formatVnd(s.actualGmv || 0)}</div>
      <div className="text-slate-400">GMV thực tế</div>
    </div>
  </div>
);

export const MyWorkspace: React.FC<MyWorkspaceProps> = ({
  currentRole,
  activeUser,
  brands,
  projects,
  sessions,
  talents,
  campaigns,
  campaignRevisionNotes,
  shiftSlots,
  onRespondToCampaignApproval,
  onNavigateTab,
  onSelectSession
}) => {
  // Only roles with real access to the Live Sessions module can click through to it;
  // Brand/Talent see the same info inline instead of hitting the Access Restricted guard.
  const canOpenSessions = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";

  const header = (
    <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
      <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
        <UserCheck className="w-4 h-4 text-purple-400" /> Không gian làm việc cá nhân
      </span>
      <h2 className="text-2xl font-black">Việc Của Tôi</h2>
      <p className="text-slate-400 text-xs">
        Xin chào <strong className="text-white">{activeUser.name}</strong> — đây là các Brand, Dự Án & Phiên Live gắn với vai trò của bạn.
      </p>
    </div>
  );

  if (currentRole === "ceo" || currentRole === "admin") {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title={`Bạn đang xem với vai trò ${currentRole === "admin" ? "Admin" : "CEO"}`}
          desc="CEO/Admin có toàn quyền theo dõi mọi Brand, Project và phiên live tại Command Brief & Dashboard. Trang này dành riêng cho từng cá nhân (Ops / Brand / Talent) xem đúng phần việc được giao."
        />
        <div className="flex justify-center gap-3">
          <button
            onClick={() => onNavigateTab && onNavigateTab("brief")}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all"
          >
            Mở Command Brief
          </button>
          <button
            onClick={() => onNavigateTab && onNavigateTab("crm")}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
          >
            Mở CRM & Projects
          </button>
        </div>
      </div>
    );
  }

  if (currentRole === "operations") {
    const myBrands = brands.filter((b) => b.ownerUserId === activeUser.id);
    const myProjects = projects.filter((p) => p.teamLeadUserId === activeUser.id);
    const myBrandIds = new Set([...myBrands.map((b) => b.id), ...myProjects.map((p) => p.brandId)]);
    const mySessions = sessions.filter((s) => myBrandIds.has(s.brandId));

    if (myBrands.length === 0 && myProjects.length === 0) {
      return (
        <div className="space-y-6">
          {header}
          <EmptyState
            title="Chưa có Brand hoặc Project nào được giao cho bạn"
            desc="Khi CEO tạo Brand mới hoặc Project và chọn bạn làm KAM Lead / Team Lead tại CRM & Projects, chúng sẽ tự động xuất hiện ở đây."
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {header}

        {myProjects.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-500" /> Dự Án Tôi Làm Team Lead ({myProjects.length})
            </h3>
            {myProjects.map((p) => {
              const pct = p.kpiGmv > 0 ? Math.min(100, Math.round((p.actualGmv / p.kpiGmv) * 100)) : 0;
              return (
                <div key={p.id} className="p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <strong className="text-sm text-slate-100">{p.name}</strong>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-950/40 text-blue-300">{p.status}</span>
                  </div>
                  <p className="text-xs text-slate-400">Brand: {p.brandName} • {p.sessionsCompleted}/{p.totalSessionsPlanned} phiên live</p>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-slate-400">{formatVnd(p.actualGmv)} / {formatVnd(p.kpiGmv)}</span>
                    <span className="text-purple-400">{pct}% KPI</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {myBrands.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-500" /> Brand Tôi Phụ Trách KAM ({myBrands.length})
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {myBrands.map((b) => (
                <div key={b.id} className="p-3.5 rounded-xl border border-slate-800 flex items-center gap-3">
                  <span className="text-2xl">{b.logo}</span>
                  <div>
                    <strong className="text-sm text-slate-100 block">{b.name}</strong>
                    <span className="text-xs text-slate-400">{b.industry}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-500" /> Phiên Live Liên Quan ({mySessions.length})
          </h3>
          {mySessions.length === 0 ? (
            <p className="text-xs text-slate-400">Chưa có phiên live nào được tạo cho Brand/Project của bạn.</p>
          ) : (
            <div className="space-y-2">
              {mySessions.map((s) => (
                <SessionRow
                  key={s.id}
                  s={s}
                  onClick={() => {
                    onSelectSession && onSelectSession(s);
                    onNavigateTab && onNavigateTab("sessions");
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (currentRole === "brand") {
    const myBrand = brands.find((b) => b.id === activeUser.assignedBrandId);
    const myProjects = projects.filter((p) => p.brandId === activeUser.assignedBrandId);
    const mySessions = sessions.filter((s) => s.brandId === activeUser.assignedBrandId);
    const myCampaigns = campaigns
      .filter((c) => c.brandId === activeUser.assignedBrandId)
      .slice()
      .sort((a, b) => b.startDate.localeCompare(a.startDate));

    if (!myBrand) {
      return (
        <div className="space-y-6">
          {header}
          <EmptyState
            title="Tài khoản chưa được gán vào Brand nào"
            desc="Liên hệ CEO/Ops để gán tài khoản của bạn vào đúng Brand tại mục Phân Quyền & Role."
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {header}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center gap-4">
          <span className="text-3xl">{myBrand.logo}</span>
          <div>
            <strong className="text-lg text-slate-100 block">{myBrand.name}</strong>
            <span className="text-xs text-slate-400">{myBrand.industry} • Tổng GMV tích lũy: {formatVnd(myBrand.totalGmv)}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-500" /> Campaign & Duyệt Lịch ({myCampaigns.length})
          </h3>
          {myCampaigns.length === 0 ? (
            <p className="text-xs text-slate-400">Chưa có campaign nào được lên kế hoạch cho brand của bạn.</p>
          ) : (
            <div className="space-y-3">
              {myCampaigns.map((c) => (
                <CampaignApprovalCard
                  key={c.id}
                  campaign={c}
                  slots={shiftSlots.filter((s) => s.campaignId === c.id)}
                  notes={campaignRevisionNotes.filter((n) => n.campaignId === c.id)}
                  onRespond={onRespondToCampaignApproval}
                />
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-500" /> Tiến Độ Chiến Dịch ({myProjects.length})
          </h3>
          {myProjects.length === 0 ? (
            <p className="text-xs text-slate-400">Chưa có chiến dịch/dự án nào được khởi tạo cho brand của bạn.</p>
          ) : (
            myProjects.map((p) => {
              const pct = p.kpiGmv > 0 ? Math.min(100, Math.round((p.actualGmv / p.kpiGmv) * 100)) : 0;
              return (
                <div key={p.id} className="p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <strong className="text-sm text-slate-100">{p.name}</strong>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-950/40 text-blue-300">{p.status}</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-slate-400">{formatVnd(p.actualGmv)} / {formatVnd(p.kpiGmv)}</span>
                    <span className="text-emerald-400">{pct}% KPI đạt được</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-500" /> Lịch Sử Phiên Live ({mySessions.length})
          </h3>
          {mySessions.length === 0 ? (
            <p className="text-xs text-slate-400">Chưa có phiên live nào.</p>
          ) : (
            <div className="space-y-2">
              {mySessions.map((s) => (
                <SessionRow key={s.id} s={s} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // currentRole === "talent"
  const myTalent = talents.find((t) => t.id === activeUser.assignedTalentId);
  const mySessions = sessions.filter((s) => s.hostId === activeUser.assignedTalentId);
  const upcoming = mySessions.filter((s) => s.status === "Upcoming" || s.status === "Live Now");
  const completed = mySessions.filter((s) => s.status === "Completed");

  if (!myTalent) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="Tài khoản chưa được gán vào hồ sơ Talent nào"
          desc="Liên hệ CEO/Ops để gán tài khoản của bạn vào đúng hồ sơ Talent tại mục Phân Quyền & Role."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={myTalent.avatar} alt={myTalent.name} className="w-12 h-12 rounded-full object-cover" />
          <div>
            <strong className="text-slate-100 block">{myTalent.name}</strong>
            <span className="text-xs text-slate-400">{myTalent.role} • CVR TB {myTalent.cvrAvg}% • Điểm tổng {myTalent.overallScore}/100</span>
          </div>
        </div>
        <button
          onClick={() => onNavigateTab && onNavigateTab("scripts")}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" /> Tạo Kịch Bản AI Cho Phiên Tới
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
        <h3 className="font-bold text-slate-100 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-purple-500" /> Lịch Live Sắp Tới Của Tôi ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-xs text-slate-400">Bạn chưa được gán phiên live sắp tới nào.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((s) => (
              <SessionRow
                key={s.id}
                s={s}
                onClick={
                  canOpenSessions
                    ? () => {
                        onSelectSession && onSelectSession(s);
                        onNavigateTab && onNavigateTab("sessions");
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
        <h3 className="font-bold text-slate-100 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-purple-500" /> Phiên Đã Hoàn Thành ({completed.length})
        </h3>
        {completed.length === 0 ? (
          <p className="text-xs text-slate-400">Chưa có phiên live nào hoàn thành.</p>
        ) : (
          <div className="space-y-2">
            {completed.map((s) => (
              <SessionRow
                key={s.id}
                s={s}
                onClick={
                  canOpenSessions
                    ? () => {
                        onSelectSession && onSelectSession(s);
                        onNavigateTab && onNavigateTab("sessions");
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
