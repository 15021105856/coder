/** 单条 data 行归一化：与监测系统 core 共用，便于单测 */
import { FIELDS, NUM_FIELDS } from "./schema.js";
import { normPace } from "./format.js";

export function normalizeRec(o) {
  const r = {};
  for (const f of FIELDS) r[f] = o[f] === undefined || o[f] === "" ? null : o[f];
  // 数据扩展不在表单中展示，仍须经加载、编辑、保存完整保留。
  for (const [k, v] of Object.entries(o)) {
    if (FIELDS.includes(k) || ["__proto__", "constructor", "prototype"].includes(k)) continue;
    r[k] = structuredClone(v);
  }
  for (const f of NUM_FIELDS) {
    if (f === "feel" && typeof r[f] === "string" && !/^\d+(\.\d+)?$/.test(r[f])) continue;
    if (r[f] == null) continue;
    const v = Number(r[f]);
    r[f] = Number.isFinite(v) ? v : null;
  }
  if (o.note != null && o.note !== "") r.note = o.note;
  r.pace = normPace(r.pace);
  return r;
}
