/* _daily 三方合并（文件种子 / 本机缓存 / 旧种子快照）。sessions/weight 按 eid，种子冲突时保留本地。 */
import { mergeEntityArrays } from "./entity-merge.js";

const plainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const cloneDaily = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export function mergeDailyValue(seed, local, base, key = "", date = "") {
  if (seed === undefined) return cloneDaily(local);
  if (local === undefined) return base === undefined ? cloneDaily(seed) : undefined;
  if (base !== undefined && JSON.stringify(local) === JSON.stringify(base)) return cloneDaily(seed);
  if (plainObject(seed) && plainObject(local)) {
    const out = {};
    for (const k of new Set([...Object.keys(seed), ...Object.keys(local)])) {
      if (["__proto__", "constructor", "prototype"].includes(k)) continue;
      const v = mergeDailyValue(seed[k], local[k], plainObject(base) ? base[k] : undefined, k, date);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(seed) && Array.isArray(local) && ["sessions", "weight"].includes(key)) {
    return mergeEntityArrays({
      base: Array.isArray(base) ? base : [],
      local,
      remote: seed,
      kind: key,
      date,
      mode: "local-wins",
      path: key,
    }).items;
  }
  return cloneDaily(local);
}

export function mergeDailyStore(seed, cached, base) {
  const out = { ...cloneDaily(cached) };
  for (const [d, s] of Object.entries(seed)) {
    out[d] = Object.hasOwn(cached, d) ? mergeDailyValue(s, cached[d], base?.[d], "", d) : cloneDaily(s);
  }
  return out;
}
