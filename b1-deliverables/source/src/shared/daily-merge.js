/* _daily 三方合并（文件种子 / 本机缓存 / 旧种子快照），供 core 与单元测试共用。 */
const plainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const cloneDaily = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export function mergeDailyValue(seed, local, base, key = "") {
  if (seed === undefined) return cloneDaily(local);
  if (local === undefined) return base === undefined ? cloneDaily(seed) : undefined;
  if (base !== undefined && JSON.stringify(local) === JSON.stringify(base)) return cloneDaily(seed);
  if (plainObject(seed) && plainObject(local)) {
    const out = {};
    for (const k of new Set([...Object.keys(seed), ...Object.keys(local)])) {
      if (["__proto__", "constructor", "prototype"].includes(k)) continue;
      const v = mergeDailyValue(seed[k], local[k], plainObject(base) ? base[k] : undefined, k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(seed) && Array.isArray(local) && ["sessions", "weight"].includes(key)) {
    const indexed = (arr) => {
      const n = new Map();
      return (arr || []).map((x) => {
        const k = key === "weight" ? String(x.time || "") : [x.kind || "", x.start || ""].join("|");
        const i = n.get(k) || 0; n.set(k, i + 1);
        return [k + "|" + i, x];
      });
    };
    const sm = new Map(indexed(seed)), lm = new Map(indexed(local)), bm = new Map(indexed(Array.isArray(base) ? base : []));
    const out = [];
    for (const k of new Set([...sm.keys(), ...lm.keys()])) {
      const v = mergeDailyValue(sm.get(k), lm.get(k), bm.get(k));
      if (v !== undefined) out.push(v);
    }
    return out;
  }
  return cloneDaily(local);
}

export function mergeDailyStore(seed, cached, base) {
  const out = { ...cloneDaily(cached) };
  for (const [d, s] of Object.entries(seed)) {
    out[d] = Object.hasOwn(cached, d) ? mergeDailyValue(s, cached[d], base?.[d]) : cloneDaily(s);
  }
  return out;
}
