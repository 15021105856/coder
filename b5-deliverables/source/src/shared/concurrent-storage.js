// All cooperating pages use this origin-scoped Web Lock, including startup migration.
export const STORAGE_LOCK = "physio-log.authority-write";
export async function withStorageLock(action, locks) {
  try {
    locks ??= globalThis.navigator?.locks;
    if (!locks?.request) return { ok: false, status: "failed", reason: "locks-unavailable" };
    return await locks.request(STORAGE_LOCK, { mode: "exclusive", signal: AbortSignal.timeout(5000) }, action);
  } catch (error) {
    return { ok: false, status: "failed", reason: "lock-failed", detail: error?.message };
  }
}
import { mergeEntityArrays } from "./entity-merge.js";

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Records and arrays are indivisible. Independent dates / daily object fields may merge.
// Deletion vs modification is a conflict, never an automatic resurrection.
export function reconcileConcurrentState(base, local, remote) {
  const conflicts = [];
  function value(b, l, r, path, recursive = false) {
    if (equal(l, b)) return structuredClone(r);
    if (equal(r, b) || equal(l, r)) return structuredClone(l);
    if (recursive && object(b) && object(l) && object(r)) {
      const out = {};
      for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
        if (["__proto__", "constructor", "prototype"].includes(key)) continue;
        if ((key === "sessions" || key === "weight") && [b[key], l[key], r[key]].some(Array.isArray)) {
          const date = path.split(".").at(-1) || "";
          const merged = mergeEntityArrays({
            base: b[key], local: l[key], remote: r[key], kind: key, date, mode: "conflict", path: `${path}.${key}`,
          });
          conflicts.push(...merged.conflicts);
          out[key] = merged.items;
          continue;
        }
        const v = value(b[key], l[key], r[key], `${path}.${key}`, true);
        if (v !== undefined) out[key] = v;
      }
      return out;
    }
    conflicts.push(path);
    return structuredClone(l);
  }
  const byDate = (rows) => Object.fromEntries(rows.map((r) => [r.d, r]));
  const b = byDate(base.records), l = byDate(local.records), r = byDate(remote.records), records = [];
  for (const d of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
    const row = value(b[d], l[d], r[d], `records.${d}`);
    if (row !== undefined) records.push(row);
  }
  records.sort((a, z) => a.d.localeCompare(z.d));
  const dailyMeta = value(base.dailyMeta, local.dailyMeta, remote.dailyMeta, "daily", true);
  const baseline = value(base.baseline, local.baseline, remote.baseline, "baseline");
  return { ok: conflicts.length === 0, conflicts, records, dailyMeta, baseline };
}
