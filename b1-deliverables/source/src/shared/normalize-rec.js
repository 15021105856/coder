/** 单条 data 行归一化：与监测系统 core 共用，便于单测 */
import { FIELDS, NUM_FIELDS } from "./schema.js";
import { normPace } from "./format.js";

export function normalizeRec(o) {
  const r = {};
  for (const f of FIELDS) r[f] = o[f] === undefined || o[f] === "" ? null : o[f];
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
