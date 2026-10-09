import { runTotalKg, strengthTotalKg } from "./daily.js";

/** 训练类型 → 日历配色类别（只用于 UI，不改写原 type 字段） */
export function typeCat(t) {
  if (!t || t === "未记录") return "none";
  if (t.includes("休息")) return "rest";
  if (t.includes("双练") || (/有氧|跑/.test(t) && /背|腿|胸|肩|力量|核心/.test(t))) return "mix";
  if (/有氧|跑|阈值|间歇/.test(t)) return "run";
  if (t.includes("球")) return "ball";
  return "str";
}

export const CAT_LABEL = {
  run: "跑步", str: "力量", mix: "同日多课", rest: "休息", ball: "球类", none: "未报告",
};

/** 档案 derive 用：全天跑量优先 _daily.day_totals */
export function runTotal(r, daily) {
  return runTotalKg(r, daily?.[r.d]);
}

/** 档案 derive 用：力量容量优先 _daily.sessions 合计 */
export function strengthTotal(r, daily) {
  return strengthTotalKg(r, daily?.[r.d]);
}
