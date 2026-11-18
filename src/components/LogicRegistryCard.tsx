import React, { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { DEFAULT_ENGINE_PARAMS, ENGINE_GROUP_LABEL, ENGINE_PARAM_META, type EngineParams } from "../lib/scheduling/engineParams";
import { LOGIC_MODULES, RULE_KIND_LABEL, paramLabel, type LogicRule } from "../lib/logicRegistry";
import { DEFAULT_ROSTER_RULES, type RosterRules } from "../lib/roster/rules";
import { fetchRosterRules } from "../lib/db/roster";
import { fmtVndShort } from "../lib/format";
import { InfoDot } from "./common/InfoDot";

// AI Training Center — "Logic đang chạy": một chỗ xem module nào đang áp luật nào, con số hiện tại, sửa ở đâu. Chỉ ĐỌC; sửa tham số ở
// bảng "Tham số" bên dưới (cùng một nguồn `EngineParams`). Danh sách luật ở lib/logicRegistry.ts, có test canh lệch.

const fmtValue = (key: keyof EngineParams, v: number | boolean): string => {
  if (typeof v === "boolean") return v ? "bật" : "tắt";
  if (key === "rosterRegularCastCap" || key === "rosterShopeeCastCap") return v > 0 ? `${fmtVndShort(v)}/giờ` : "tắt";
  return String(v).replace(".", ",");
};
const KIND_TONE: Record<LogicRule["kind"], string> = { hard: "text-rose-300", soft: "text-sky-300", info: "text-[var(--text-faint)]" };

interface Props {
  params: EngineParams;
}

export const LogicRegistryCard: React.FC<Props> = ({ params }) => {
  const [rules, setRules] = useState<RosterRules>(DEFAULT_ROSTER_RULES);
  const [rulesFromDb, setRulesFromDb] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchRosterRules()
      .then((r) => {
        if (!alive) return;
        setRules(r);
        setRulesFromDb(true);
      })
      .catch(() => alive && setRulesFromDb(false));
    return () => {
      alive = false;
    };
  }, []);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const ruleText = (r: LogicRule) => [r.text, r.help, r.where, ...(r.consts ?? []).map((c) => c.label), ...(r.keys ?? []).map(paramLabel)].join(" ").toLowerCase();
  const modules = LOGIC_MODULES.map((m) => {
    if (!needle) return m;
    const head = `${m.title} ${m.usedIn} ${m.summary}`.toLowerCase().includes(needle);
    return head ? m : { ...m, rules: m.rules.filter((r) => ruleText(r).includes(needle)) };
  }).filter((m) => m.rules.length > 0);
  const groupOf = (key: keyof EngineParams) => ENGINE_GROUP_LABEL[ENGINE_PARAM_META.find((m) => m.key === key)!.group];

  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-6" data-testid="logic-registry">
      <div>
        <h2 data-section="Logic đang chạy" className="text-lg font-black text-[var(--text)] flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-[var(--accent-text)]" /> Logic đang chạy
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{LOGIC_MODULES.length} module · luật, con số đang áp, nơi sửa. Chỉ xem.</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm luật, con số, màn hình…"
          className="mt-2 w-full sm:w-80 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-1.5 text-xs text-[var(--text)]"
          data-testid="logic-search"
        />
      </div>
      <div className="space-y-2">
        {modules.map((m, i) => (
          <details key={m.id} open={i === 0 || !!needle} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-4 py-3 group">
            <summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-black text-sm text-[var(--text)]">{m.title}</span>
              <span className="text-2xs text-[var(--text-muted)]">{m.usedIn}</span>
            </summary>
            <p className="text-xs text-[var(--text-muted)] mt-2">{m.summary}</p>
            {m.id === "roster_autofill" && (
              <p className="text-2xs text-[var(--text-muted)] mt-1">
                Luật cứng đang áp: tối đa <b className="text-[var(--text)]">{rules.maxWeekHours}h/tuần</b>, <b className="text-[var(--text)]">{rules.maxDayHours}h/ngày</b>, nghỉ ≥ <b className="text-[var(--text)]">{rules.minRestHours}h</b> sau ca kết thúc từ <b className="text-[var(--text)]">{rules.lateEndTime}</b>
                {rulesFromDb ? "" : " (mặc định — chưa đọc được bảng luật)"}.
              </p>
            )}
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {m.rules.map((r, idx) => (
                <li key={idx} className="py-2 text-xs flex flex-col gap-1">
                  <div className="flex gap-2">
                    <span className={`shrink-0 w-28 text-2xs font-bold ${KIND_TONE[r.kind]}`}>{RULE_KIND_LABEL[r.kind]}</span>
                    <span className="text-[var(--text)]">{r.text}{r.help && <InfoDot label="Chi tiết">{r.help}</InfoDot>}</span>
                  </div>
                  {r.keys && r.keys.length > 0 && (
                    <div className="sm:pl-[7.5rem] flex flex-wrap gap-x-4 gap-y-0.5">
                      {r.keys.map((k) => {
                        const v = params[k];
                        const changed = v !== DEFAULT_ENGINE_PARAMS[k];
                        return (
                          <span key={k} className="text-2xs text-[var(--text-muted)]" title={`Sửa ở bảng Tham số → ${groupOf(k)}`}>
                            {paramLabel(k)}: <b className={changed ? "text-sky-300" : "text-[var(--text)]"}>{fmtValue(k, v)}</b>
                            {changed && <span className="text-[var(--text-faint)]"> (mặc định {fmtValue(k, DEFAULT_ENGINE_PARAMS[k])})</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {r.consts && r.consts.length > 0 && (
                    <div className="sm:pl-[7.5rem] flex flex-wrap gap-x-4 gap-y-0.5">
                      {r.consts.map((c) => (
                        <span key={c.label} className="text-2xs text-[var(--text-muted)]" title="Ngưỡng nằm trong code — sửa phải nhờ lập trình">
                          {c.label}: <b className="text-[var(--text)]">{c.value}</b>
                        </span>
                      ))}
                    </div>
                  )}
                  {r.where && <div className="sm:pl-[7.5rem] text-2xs text-[var(--text-faint)]">Nằm ở: {r.where}</div>}
                </li>
              ))}
            </ul>
          </details>
        ))}
        {modules.length === 0 && <p className="text-xs text-[var(--text-muted)]">Không có luật nào khớp.</p>}
      </div>
    </div>
  );
};
