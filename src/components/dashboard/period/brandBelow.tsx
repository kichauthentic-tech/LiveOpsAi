import React from "react";
import type { Brand } from "../../../types";
import { CoTable, HostTable, SlotTable, type Scope } from "./opsBlocks";
import { Sect } from "./ui";

// Phần dưới của tab Brand: chỉ còn Nhân sự live (host, trợ live, khung giờ) — tính từ ca. Khối Shop / SKU / Quảng cáo theo tháng đã bỏ
// (30/10/2026, user chốt): tab Brand chỉ là overview tháng đang chạy; ở nút Đợt campaign chỉ lấy các ca của đợt.

export const TeamSection: React.FC<{ s: Scope; brands: Brand[]; wave?: string }> = ({ s, brands, wave }) => (
  <>
    <Sect title="Nhân sự live" sub={wave ? `chỉ các ca ${wave} · host tính GMV, trợ live tính giờ · so với ${wave} tháng trước` : "host tính GMV, trợ live tính giờ · theo kỳ đang chọn"} />
    <div className="grid gap-4 xl:grid-cols-2 items-start [&>*]:min-w-0">
      <HostTable s={s} brands={brands} showBrand={false} minSessions={wave ? 1 : 3} title="Host phụ trách kênh này" />
      <CoTable s={s} brands={brands} showBrand={false} />
    </div>
    <SlotTable s={s} within={wave ? "đợt" : "kỳ"} />
  </>
);
