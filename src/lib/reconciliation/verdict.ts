// Kết luận của một lô đối soát + danh sách VIỆC CẦN QUYẾT. Hàm thuần, chỉ đọc — không gọi DB, không đổi số.
//
// Vì sao có: màn đối soát cũ bày thẳng cuốn sổ (70–541 dòng phiên) rồi để người tự tìm chỗ sai. Đo 15/11 trên lô
// CROCS tháng 10: 70 dòng + 4 khối phải mở, nhưng chỉ có 2 việc thật sự phải quyết. Chỗ này tính ra đúng 2 việc đó.

import type { ReconCheck, CheckKind } from "./groupCheck";
import type { MergeGroup } from "./mergeRestarts";
import type { OutsideGroup } from "./outsideRows";
import { OUTSIDE_BULK_OK, OUTSIDE_HINT, OUTSIDE_TITLE } from "./outsideRows";

export type Tone = "ok" | "warn" | "bad";

/** Lỗi CHẶN ghi vào ca: tổng các ca khác tổng file ⇒ ghi là ghi sai tiền. */
export const BLOCKING: CheckKind[] = ["sum_mismatch"];

export type TaskKind = "dead" | "block" | "merge" | "outside" | "warn" | "stale" | "handover";

export interface ReconTask {
  id: string;
  kind: TaskKind;
  tone: Tone;
  title: string;
  detail?: string;
  /** Nhóm rổ ngoài lịch của việc này (kind "outside") — UI dùng để gán cả nhóm. */
  group?: OutsideGroup;
  /** Số ca / số dòng liên quan, để UI đặt tên nút. */
  count?: number;
}

export interface VerdictInput {
  /** Lô không khớp ca nào (đã có chẩn đoán vì sao) ⇒ mọi thứ khác không còn nghĩa. */
  deadReason?: string;
  rowCount: number;
  sessionCount: number;
  check: ReconCheck;
  mergeGroups: MergeGroup[];
  outsideGroups: OutsideGroup[];
  /** Ca trong kỳ của lô chưa có file giao ca ⇒ phần của ca đó phải chia ước tính. */
  missingHandover: number;
  /** Lô đang xem cũ hơn lô đã áp dụng gần nhất. */
  isOldBatch: boolean;
  applied: boolean;
}

export interface Verdict {
  tone: Tone;
  line: string;
  tasks: ReconTask[];
}

export function buildVerdict(input: VerdictInput): Verdict {
  const { check } = input;
  const tasks: ReconTask[] = [];

  if (input.deadReason) {
    return {
      tone: "bad",
      line: `File không khớp ca nào — ghi vào cũng không đổi số ca nào.`,
      tasks: [{ id: "dead", kind: "dead", tone: "bad", title: "Tải file đúng kỳ, hoặc xoá lô này", detail: input.deadReason }]
    };
  }

  const blocking = check.issues.filter((i) => BLOCKING.includes(i.kind));
  const stale = check.issues.filter((i) => i.kind === "chip_stale");
  const warns = check.issues.filter((i) => !BLOCKING.includes(i.kind) && i.kind !== "chip_stale");

  if (blocking.length > 0) {
    tasks.push({
      id: "block",
      kind: "block",
      tone: "bad",
      title: `${blocking.length} nhóm có tổng các ca khác tổng file`,
      detail: "Sửa xong mới ghi được vào ca.",
      count: blocking.length
    });
  }
  if (input.mergeGroups.length > 0) {
    const rows = input.mergeGroups.reduce((s, g) => s + g.ids.length, 0);
    tasks.push({
      id: "merge",
      kind: "merge",
      tone: "warn",
      title: `${input.mergeGroups.length} nhóm mảnh restart nên gộp lại`,
      detail: `${rows} dòng file → ${input.mergeGroups.length} phiên · tổng không đổi · không hoàn tác được`,
      count: input.mergeGroups.length
    });
  }
  for (const g of input.outsideGroups) {
    tasks.push({
      id: `outside-${g.kind}`,
      kind: "outside",
      tone: OUTSIDE_BULK_OK[g.kind] ? "ok" : "warn",
      title: `${g.rows.length} phiên — ${OUTSIDE_TITLE[g.kind].toLowerCase()}`,
      detail: OUTSIDE_HINT[g.kind],
      group: g,
      count: g.rows.length
    });
  }
  if (stale.length > 0) {
    tasks.push({
      id: "stale",
      kind: "stale",
      tone: "warn",
      title: `${stale.length} ca đang khác bản chia mới`,
      detail: "Bấm Áp Dụng Lại để cập nhật.",
      count: stale.length
    });
  }
  if (warns.length > 0) {
    tasks.push({
      id: "warn",
      kind: "warn",
      tone: "warn",
      title: `${warns.length} chỗ lệch giờ cần nhìn qua`,
      detail: "Lệch khung ca, ca nối hở, ca thiếu phiên.",
      count: warns.length
    });
  }
  if (input.missingHandover > 0) {
    tasks.push({
      id: "handover",
      kind: "handover",
      tone: "warn",
      title: `${input.missingHandover} ca trong kỳ chưa có file giao ca`,
      detail: "Phần của các ca này phải chia ước tính theo giờ.",
      count: input.missingHandover
    });
  }

  // Đếm trong câu kết luận = đúng số thẻ ở khối "Việc cần quyết" (15/11: câu nói 4 mà khối hiện 6 vì bỏ qua
  // các nhóm gán-một-nút). Màu thì vẫn theo việc thật sự cần nhìn.
  const must = tasks.length;
  const needEye = tasks.filter((t) => t.tone !== "ok").length;
  const tone: Tone = blocking.length > 0 ? "bad" : needEye > 0 ? "warn" : must > 0 ? "warn" : "ok";
  const line = blocking.length > 0
    ? "Tổng các ca chưa khớp file — sửa xong mới ghi vào ca được."
    : must > 0
      ? `Số khớp file. Còn ${must} việc cần bạn quyết trước khi ghi vào ca.`
      : input.applied
        ? "Số khớp file, không còn việc nào. Lô này đã ghi vào ca."
        : "Số khớp file, không còn việc nào. Ghi vào ca được.";

  return { tone, line, tasks };
}
