import React, { useMemo, useState } from "react";
import { CoFundedVoucher, LiveSession, UserRole } from "../../types";
import { Ticket, Plus, Trash2, Send, CheckCircle2 } from "lucide-react";

interface BrandVoucherRequestsProps {
  brandId: string;
  currentRole: UserRole;
  vouchers: CoFundedVoucher[];
  sessions: LiveSession[];
  onAddVoucher: (v: {
    sessionId: string;
    voucherCode: string;
    description: string;
    totalValue: number;
    brandContributionPct: number;
    agencyContributionPct: number;
    platformContributionPct: number;
  }) => Promise<void>;
  onDeleteVoucher: (id: string) => Promise<void>;
  onSendVoucherForApproval: (voucher: CoFundedVoucher) => Promise<boolean>;
  onRespondToVoucherApproval: (voucher: CoFundedVoucher, decision: "approved" | "revision_requested", note?: string) => Promise<boolean>;
}

const APPROVAL_STATUS_LABELS: Record<CoFundedVoucher["approvalStatus"], string> = {
  draft: "Chưa gửi duyệt",
  sent_for_approval: "Đang chờ Brand duyệt",
  revision_requested: "Brand yêu cầu sửa",
  approved: "Đã duyệt — được áp trực tiếp"
};

const APPROVAL_STATUS_STYLES: Record<CoFundedVoucher["approvalStatus"], string> = {
  draft: "bg-slate-800 text-slate-400",
  sent_for_approval: "bg-blue-950 text-blue-300",
  revision_requested: "bg-rose-950 text-rose-300",
  approved: "bg-emerald-950 text-emerald-300"
};

const VoucherCard: React.FC<{
  voucher: CoFundedVoucher;
  session?: LiveSession;
  currentRole: UserRole;
  canManage: boolean;
  onDeleteVoucher: (id: string) => Promise<void>;
  onSendVoucherForApproval: (voucher: CoFundedVoucher) => Promise<boolean>;
  onRespondToVoucherApproval: (voucher: CoFundedVoucher, decision: "approved" | "revision_requested", note?: string) => Promise<boolean>;
}> = ({ voucher: v, session, currentRole, canManage, onDeleteVoucher, onRespondToVoucherApproval, onSendVoucherForApproval }) => {
  const [revisionNote, setRevisionNote] = useState("");
  const [respondBusy, setRespondBusy] = useState<"approved" | "revision_requested" | null>(null);
  const canApprove = currentRole === "brand" && v.approvalStatus === "sent_for_approval";
  const pctSum = v.brandContributionPct + v.agencyContributionPct + v.platformContributionPct;

  const handleApprove = async () => {
    setRespondBusy("approved");
    await onRespondToVoucherApproval(v, "approved");
    setRespondBusy(null);
  };

  const handleRequestRevision = async () => {
    if (!revisionNote.trim()) return;
    setRespondBusy("revision_requested");
    const ok = await onRespondToVoucherApproval(v, "revision_requested", revisionNote);
    setRespondBusy(null);
    if (ok) setRevisionNote("");
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <strong className="text-base text-white font-mono">{v.voucherCode || "(chưa đặt mã)"}</strong>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {session ? `${session.date} • ${session.startTime}-${session.endTime} • ${session.title}` : "Phiên live không xác định"}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${APPROVAL_STATUS_STYLES[v.approvalStatus]}`}>
          {APPROVAL_STATUS_LABELS[v.approvalStatus]}
        </span>
      </div>

      {v.description && <p className="text-xs text-slate-400">{v.description}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2">
          <div className="text-slate-500">Tổng giá trị</div>
          <div className="text-emerald-400 font-bold">{v.totalValue.toLocaleString("vi-VN")}đ</div>
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2">
          <div className="text-slate-500">Brand</div>
          <div className="text-white font-bold">{v.brandContributionPct}%</div>
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2">
          <div className="text-slate-500">Agency</div>
          <div className="text-white font-bold">{v.agencyContributionPct}%</div>
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2">
          <div className="text-slate-500">Sàn</div>
          <div className="text-white font-bold">{v.platformContributionPct}%</div>
        </div>
      </div>
      {pctSum !== 100 && <p className="text-[11px] text-amber-400">Tổng tỷ lệ đồng tài trợ hiện là {pctSum}% (khác 100%).</p>}

      {v.approvalStatus === "revision_requested" && v.revisionNote && (
        <p className="text-[11px] text-rose-300 bg-rose-950/20 border border-rose-900/40 rounded-lg p-2">Ghi chú yêu cầu sửa: {v.revisionNote}</p>
      )}

      {canManage && (
        <div className="flex gap-2">
          {(v.approvalStatus === "draft" || v.approvalStatus === "revision_requested") && (
            <button
              onClick={() => onSendVoucherForApproval(v)}
              className="flex items-center gap-1 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors"
            >
              <Send className="w-3 h-3" /> Gửi Brand Duyệt
            </button>
          )}
          <button
            onClick={() => onDeleteVoucher(v.id)}
            className="flex items-center gap-1 text-red-400 hover:bg-red-950/40 px-2.5 py-1 rounded-lg text-[11px]"
          >
            <Trash2 className="w-3 h-3" /> Xoá
          </button>
        </div>
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
              <CheckCircle2 className="w-3.5 h-3.5" /> {respondBusy === "approved" ? "Đang duyệt..." : "Duyệt & Cấp Quyền Áp"}
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
    </div>
  );
};

export const BrandVoucherRequests: React.FC<BrandVoucherRequestsProps> = ({
  brandId,
  currentRole,
  vouchers,
  sessions,
  onAddVoucher,
  onDeleteVoucher,
  onSendVoucherForApproval,
  onRespondToVoucherApproval
}) => {
  const canManage = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [description, setDescription] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [brandPct, setBrandPct] = useState("");
  const [agencyPct, setAgencyPct] = useState("");
  const [platformPct, setPlatformPct] = useState("");

  const brandSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.brandId === brandId)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, brandId]
  );
  const brandVouchers = useMemo(
    () => vouchers.filter((v) => v.brandId === brandId).slice().sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? "") * -1),
    [vouchers, brandId]
  );
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const handleCreate = async () => {
    const total = Number(totalValue);
    const bPct = Number(brandPct) || 0;
    const aPct = Number(agencyPct) || 0;
    const pPct = Number(platformPct) || 0;
    if (!sessionId || !Number.isFinite(total) || total <= 0) return;
    setBusy(true);
    try {
      await onAddVoucher({
        sessionId,
        voucherCode: voucherCode.trim(),
        description: description.trim(),
        totalValue: total,
        brandContributionPct: bPct,
        agencyContributionPct: aPct,
        platformContributionPct: pPct
      });
      setSessionId("");
      setVoucherCode("");
      setDescription("");
      setTotalValue("");
      setBrandPct("");
      setAgencyPct("");
      setPlatformPct("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Ticket className="w-4 h-4 text-purple-400" /> Co-Funded Voucher Request Center
        </span>
        <h2 className="text-2xl font-black">Voucher Đồng Tài Trợ</h2>
        <p className="text-slate-400 text-xs">
          Voucher riêng cho từng phiên live, đồng tài trợ giữa Brand/Agency/Sàn theo tỷ lệ %. Brand duyệt request tương đương cấp quyền áp trực
          tiếp voucher khi live.
        </p>
      </div>

      {canManage && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="flex-1 min-w-[180px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="">Chọn phiên live...</option>
              {brandSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date} • {s.startTime}-{s.endTime} • {s.title}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Mã voucher"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              className="w-36 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <input
              type="number"
              placeholder="Tổng giá trị"
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value)}
              className="w-32 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Mô tả (điều kiện áp dụng...)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 min-w-[180px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <input
              type="number"
              placeholder="% Brand"
              value={brandPct}
              onChange={(e) => setBrandPct(e.target.value)}
              className="w-24 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <input
              type="number"
              placeholder="% Agency"
              value={agencyPct}
              onChange={(e) => setAgencyPct(e.target.value)}
              className="w-24 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <input
              type="number"
              placeholder="% Sàn"
              value={platformPct}
              onChange={(e) => setPlatformPct(e.target.value)}
              className="w-24 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleCreate}
              disabled={busy || !sessionId || !totalValue}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Tạo Request
            </button>
          </div>
        </div>
      )}

      {brandVouchers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">Chưa có voucher nào.</div>
      ) : (
        <div className="space-y-4">
          {brandVouchers.map((v) => (
            <VoucherCard
              key={v.id}
              voucher={v}
              session={sessionById.get(v.sessionId)}
              currentRole={currentRole}
              canManage={canManage}
              onDeleteVoucher={onDeleteVoucher}
              onSendVoucherForApproval={onSendVoucherForApproval}
              onRespondToVoucherApproval={onRespondToVoucherApproval}
            />
          ))}
        </div>
      )}
    </div>
  );
};
