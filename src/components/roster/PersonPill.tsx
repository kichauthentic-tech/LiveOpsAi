import React from "react";
import type { PersonColor } from "../../lib/roster/personColor";

/** Viên thuốc tên người tô màu như ô tên trên Google Sheet của trainer. */
export const PersonPill: React.FC<{ name: string; color?: PersonColor; className?: string; title?: string }> = ({ name, color, className = "", title }) => (
  <span
    title={title ?? name}
    className={`block w-full truncate rounded-full px-1.5 py-0.5 text-center text-2xs font-bold leading-snug tracking-tight ${color ? "" : "bg-[var(--surface-elevated)] text-[var(--text)]"} ${className}`}
    style={color ? { backgroundColor: color.bg, color: color.fg } : undefined}
  >
    {name.toLocaleUpperCase("vi")}
  </span>
);
