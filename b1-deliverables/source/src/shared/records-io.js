/** 记录列表合并与导入校验（纯函数，供 core / io / 单测共用） */
import { isDate, NUM_FIELDS, TEXT_FIELDS } from "./schema.js";
import { normalizeRec } from "./normalize-rec.js";
import { plainObject, validateDailyPayload, validImportedBaseline } from "./payload-validation.js";

export { normalizeRec };

export function byDate(a, b) {
  return a.d < b.d ? -1 : a.d > b.d ? 1 : 0;
}

/** 内嵌 seed 与本机缓存按日期合并，seed 覆盖同键 */
export function mergeRecordLists(seed, cached) {
  const map = new Map();
  if (cached) for (const r of cached) if (r?.d) map.set(r.d, r);
  for (const r of seed) map.set(r.d, normalizeRec(r));
  return [...map.values()].sort(byDate);
}

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export function validateImportPayload(obj, { byteLength } = {}) {
  const issues = [];
  if (byteLength != null && byteLength > MAX_IMPORT_BYTES) {
    return { list: null, issues: [`文件超过 ${MAX_IMPORT_BYTES / (1024 * 1024)} MB 上限`], skip: 0 };
  }
  if (!obj || typeof obj !== "object") {
    issues.push("根对象无效");
    return { list: null, issues, skip: 0 };
  }
  const list = Array.isArray(obj) ? obj : Array.isArray(obj.data) ? obj.data : Array.isArray(obj.records) ? obj.records : null;
  if (!list) {
    issues.push("无法识别的文件结构（需要 data 或 records 数组）");
    return { list: null, issues, skip: 0 };
  }
  if (Object.hasOwn(obj, "_daily")) issues.push(...validateDailyPayload(obj._daily));
  if (obj.baseline != null && !validImportedBaseline(obj.baseline)) issues.push("baseline 基线结构或数值无效");
  let skip = 0;
  for (const row of list) {
    if (!plainObject(row) || !isDate(row.d)) { skip++; continue; }
    for (const k of NUM_FIELDS) {
      const value = row[k];
      if (value == null || value === "") continue;
      if (k === "feel" && typeof value === "string") continue;
      if (!["number", "string"].includes(typeof value) || !Number.isFinite(Number(value))) issues.push(`${row.d}.${k} 应为有限数字`);
    }
    for (const k of [...TEXT_FIELDS, "bed", "pace", "note"]) if (row[k] != null && typeof row[k] !== "string") issues.push(`${row.d}.${k} 应为文本`);
  }
  if (issues.length) return { list: null, issues, skip };
  if (skip) issues.push(`${skip} 行日期无效，导入时将跳过`);
  return { list, issues, skip, daily: obj._daily, baseline: obj.baseline };
}

export function upsertIntoList(existing, incoming) {
  const map = new Map(existing.map((r) => [r.d, r]));
  let add = 0, upd = 0, skip = 0;
  for (const o of incoming) {
    if (!o || !isDate(o.d)) { skip++; continue; }
    const r = normalizeRec(o);
    if (map.has(r.d)) upd++; else add++;
    map.set(r.d, r);
  }
  return { recs: [...map.values()].sort(byDate), add, upd, skip };
}

export const IMPORT_MAX_BYTES = MAX_IMPORT_BYTES;
