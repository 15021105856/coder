import { isDate } from "./schema.js";
import { adoptImportedEntities } from "./entity-id.js";

export const plainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const pair = (x) => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite) && x[0] <= x[1];

/** 补充层的结构校验；未知扩展字段保留，但不允许破坏现有渲染字段。 */
export function validateDailyPayload(daily) {
  const issues = [];
  if (!plainObject(daily)) return ["_daily 必须是对象"];
  for (const [d, value] of Object.entries(daily)) {
    if (!isDate(d)) { issues.push(`_daily 日期无效：${d}`); continue; }
    if (!plainObject(value)) { issues.push(`_daily[${d}] 必须是对象`); continue; }
    for (const key of ["sessions", "weight"]) {
      if (value[key] === undefined) continue;
      if (!Array.isArray(value[key]) || value[key].some((x) => !plainObject(x))) {
        issues.push(`${d}.${key} 必须是对象数组`); continue;
      }
      value[key].forEach((x, i) => {
        const numbers = key === "weight" ? ["kg", "body_fat_pct"]
          : ["km", "tsec", "vol", "hr", "hrmax", "load", "active_kcal", "total_kcal", "cad", "gct", "vo", "bal", "pw", "ats", "rec"];
        for (const k of numbers) if (x[k] != null && !Number.isFinite(x[k])) issues.push(`${d}.${key}[${i}].${k} 应为有限数字`);
        for (const k of key === "weight" ? ["time", "period", "source"] : ["kind", "name", "start", "pace"]) {
          if (x[k] != null && typeof x[k] !== "string") issues.push(`${d}.${key}[${i}].${k} 应为文本`);
        }
        if (key === "weight" && !(Number.isFinite(x.kg) && x.kg > 0)) issues.push(`${d}.weight[${i}].kg 必须为正数`);
      });
    }
    for (const key of ["nutrition", "sleep", "day_totals", "hrr"]) {
      if (value[key] != null && !plainObject(value[key])) issues.push(`${d}.${key} 必须是对象`);
    }
    const scalarFields = {
      sleep: ["score", "deep_min", "light_min", "rem_min", "spo2_pct", "respiratory_rate", "breathing_score"],
      day_totals: ["run_km", "training_tsec", "active_kcal", "total_kcal"],
      hrr: ["seconds", "start", "end", "drop"],
      nutrition: ["kcal_estimate", "protein_estimate"],
    };
    for (const [key, fields] of Object.entries(scalarFields)) {
      if (!plainObject(value[key])) continue;
      for (const k of fields) if (value[key][k] != null && !Number.isFinite(value[key][k])) issues.push(`${d}.${key}.${k} 应为有限数字`);
    }
    for (const [key, fields] of Object.entries({sleep:["wake_time"],day_totals:["scope"],hrr:["timing_protocol"],nutrition:["note","main_uncertainty"]})) {
      if (!plainObject(value[key])) continue;
      for (const k of fields) if (value[key][k] != null && typeof value[key][k] !== "string") issues.push(`${d}.${key}.${k} 应为文本`);
    }
    if (plainObject(value.nutrition)) {
      for (const k of ["kcal_range", "protein_range"]) if (value.nutrition[k] != null && !pair(value.nutrition[k])) issues.push(`${d}.nutrition.${k} 应为递增的两个数字`);
    }
    if (plainObject(value.sleep)) {
      for (const k of ["hw_range", "hr_range", "shr_range"]) if (value.sleep[k] != null && !pair(value.sleep[k])) issues.push(`${d}.sleep.${k} 应为递增的两个数字`);
    }
  }
  return issues;
}

export function validImportedBaseline(b) {
  return plainObject(b) && Number.isFinite(b.mean) && Number.isFinite(b.sd) && b.sd >= 0
    && isDate(b.start) && isDate(b.end) && b.start <= b.end
    && (b.n == null || (Number.isInteger(b.n) && b.n >= 0))
    && (b.exclude == null || (Array.isArray(b.exclude) && b.exclude.every(isDate)));
}

/** 主动导入：未提供的对象字段保留。sessions/weight 按调用方给出的完整列表替换，但无 eid 时只在内容指纹完全一致时复用身份。 */
export function mergeImportedDaily(local, incoming) {
  const merge = (a, b, key = "", date = "") => {
    if ((key === "sessions" || key === "weight") && Array.isArray(b)) {
      return adoptImportedEntities(Array.isArray(a) ? a : [], b, key, date);
    }
    if (!plainObject(b)) return structuredClone(b);
    const out = plainObject(a) ? structuredClone(a) : {};
    const day = key && /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : date;
    for (const [k, v] of Object.entries(b)) {
      if (["__proto__", "prototype", "constructor"].includes(k)) continue;
      out[k] = merge(out[k], v, k, day);
    }
    return out;
  };
  return merge(local, incoming);
}
