/** 按 eid 的三方合并。顺序是独立状态：只在共同实体的相对顺序冲突时失败。 */
import { stabilizeArray } from "./entity-id.js";

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

function prepared(items, kind, date) {
  const stabilized = stabilizeArray(items || [], kind, date);
  return stabilized.blocked ? { ok: false, items: items || [], issues: stabilized.issues } : { ok: true, items: stabilized.items, issues: [] };
}

function indexByEid(items) {
  return new Map((items || []).filter((item) => item?.eid).map((item) => [item.eid, item]));
}

function mergeFields(base, local, remote, path, conflicts, localWins) {
  const out = { eid: local?.eid || remote?.eid || base?.eid };
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(local || {}),
    ...Object.keys(remote || {}),
  ]);
  for (const key of keys) {
    if (key === "eid") continue;
    const b = base?.[key];
    const l = local?.[key];
    const r = remote?.[key];
    if (equal(l, b)) out[key] = clone(r);
    else if (equal(r, b) || equal(l, r)) out[key] = clone(l);
    else if (localWins) out[key] = clone(l);
    else conflicts.push(`${path}.${key}`);
  }
  return out;
}

function relative(order, ids) {
  return order.filter((id) => ids.has(id));
}

/**
 * @param {"conflict"|"local-wins"} mode
 * remote 在并发里是另一页；在种子合并里是新种子。
 */
export function mergeEntityArrays({ base, local, remote, kind, date, mode = "conflict", path = kind }) {
  const conflicts = [];
  const b = prepared(base, kind, date);
  const l = prepared(local, kind, date);
  const r = prepared(remote, kind, date);
  if (!b.ok || !l.ok || !r.ok) {
    conflicts.push(path);
    return { ok: false, conflicts, items: l.items };
  }
  const bm = indexByEid(b.items);
  const lm = indexByEid(l.items);
  const rm = indexByEid(r.items);
  const ids = new Set([...bm.keys(), ...lm.keys(), ...rm.keys()]);
  const merged = new Map();
  for (const id of ids) {
    const bv = bm.get(id);
    const lv = lm.get(id);
    const rv = rm.get(id);
    const localDeleted = Boolean(bv) && !lv;
    const remoteDeleted = Boolean(bv) && !rv;
    if (localDeleted && remoteDeleted) continue;
    if (localDeleted && rv && !equal(rv, bv)) {
      if (mode === "local-wins") continue;
      conflicts.push(`${path}.${id}`);
      continue;
    }
    if (remoteDeleted && lv && !equal(lv, bv)) {
      if (mode === "local-wins") merged.set(id, clone(lv));
      else conflicts.push(`${path}.${id}`);
      continue;
    }
    if (localDeleted || remoteDeleted) continue;
    if (!bv && lv && !rv) {
      merged.set(id, clone(lv));
      continue;
    }
    if (!bv && rv && !lv) {
      merged.set(id, clone(rv));
      continue;
    }
    if (!bv && lv && rv) {
      if (!equal(lv, rv) && mode !== "local-wins") conflicts.push(`${path}.${id}`);
      merged.set(id, mode === "local-wins" || equal(lv, rv) ? clone(lv) : clone(lv));
      continue;
    }
    merged.set(id, mergeFields(bv, lv, rv, `${path}.${id}`, conflicts, mode === "local-wins"));
  }
  const surviving = new Set([...bm.keys()].filter((id) => merged.has(id)));
  const localOrder = l.items.map((item) => item.eid);
  const remoteOrder = r.items.map((item) => item.eid);
  const baseOrder = b.items.map((item) => item.eid);
  const lrel = relative(localOrder, surviving);
  const rrel = relative(remoteOrder, surviving);
  const brel = relative(baseOrder, surviving);
  let chosen;
  if (JSON.stringify(lrel) === JSON.stringify(brel)) chosen = remoteOrder;
  else if (JSON.stringify(rrel) === JSON.stringify(brel) || JSON.stringify(lrel) === JSON.stringify(rrel)) chosen = localOrder;
  else if (mode === "local-wins") chosen = localOrder;
  else {
    conflicts.push(`${path}.order`);
    chosen = localOrder;
  }
  const items = [];
  const seen = new Set();
  for (const id of chosen) {
    if (merged.has(id) && !seen.has(id)) {
      items.push(merged.get(id));
      seen.add(id);
    }
  }
  for (const id of [...localOrder, ...remoteOrder]) {
    if (merged.has(id) && !seen.has(id)) {
      items.push(merged.get(id));
      seen.add(id);
    }
  }
  return { ok: conflicts.length === 0, conflicts, items };
}
