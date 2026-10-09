/** 课次 / 体重的稳定身份（B5）。身份不是开始时刻、测量时间、名称、数值或数组下标。 */

const PREFIX = { sessions: "s_", weight: "w_" };

export function entityFingerprint(item) {
  const src = item && typeof item === "object" ? item : {};
  const body = {};
  for (const key of Object.keys(src).sort()) {
    if (key === "eid") continue;
    body[key] = src[key];
  }
  return JSON.stringify(body);
}

export function hash16(text) {
  let a = 0x811c9dc5;
  let b = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ (c + i), 0x01000193);
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(a) + hex(b);
}

export function deterministicEid(kind, date, item, ordinal = 0) {
  const prefix = PREFIX[kind] || "s_";
  return prefix + hash16([kind, date || "", String(ordinal), entityFingerprint(item)].join("\0"));
}

export function isValidEid(eid, kind) {
  const prefix = PREFIX[kind];
  return typeof eid === "string" && new RegExp(`^${prefix}[0-9a-f]{16}$`).test(eid);
}

/**
 * 为尚无身份的历史项分配确定性 eid。已有合法且本数组内唯一的 eid 保持不变。
 * 重复或非法 eid 不改写调用方原对象；返回 blocked，调用方不得据此覆盖权威。
 */
export function stabilizeArray(items, kind, date) {
  if (!Array.isArray(items)) return { items: [], added: false, issues: [], blocked: false };
  const issues = [];
  const seen = new Set();
  const fpCount = new Map();
  let added = false;
  const next = [];
  items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ date, kind, index, reason: "not-object" });
      return;
    }
    const copy = { ...item };
    if (copy.eid != null && copy.eid !== "") {
      if (!isValidEid(copy.eid, kind)) {
        issues.push({ date, kind, index, reason: "illegal-eid", eid: copy.eid });
        return;
      }
      if (seen.has(copy.eid)) {
        issues.push({ date, kind, index, reason: "duplicate-eid", eid: copy.eid });
        return;
      }
      seen.add(copy.eid);
      next.push(copy);
      return;
    }
    const fp = entityFingerprint(copy);
    const ordinal = fpCount.get(fp) || 0;
    fpCount.set(fp, ordinal + 1);
    copy.eid = deterministicEid(kind, date, copy, ordinal);
    if (seen.has(copy.eid)) {
      issues.push({ date, kind, index, reason: "eid-collision", eid: copy.eid });
      return;
    }
    seen.add(copy.eid);
    added = true;
    next.push(copy);
  });
  if (issues.length) return { items, added: false, issues, blocked: true };
  return { items: next, added, issues, blocked: false };
}

export function stabilizeDailyMeta(dailyMeta) {
  const source = dailyMeta && typeof dailyMeta === "object" ? dailyMeta : {};
  const out = structuredClone(source);
  const issues = [];
  let added = false;
  for (const [date, day] of Object.entries(out)) {
    if (!day || typeof day !== "object" || Array.isArray(day)) continue;
    for (const kind of ["sessions", "weight"]) {
      if (!Array.isArray(day[kind])) continue;
      const stabilized = stabilizeArray(day[kind], kind, date);
      if (stabilized.blocked) issues.push(...stabilized.issues);
      else {
        day[kind] = stabilized.items;
        added = added || stabilized.added;
      }
    }
  }
  if (issues.length) return { dailyMeta: source, added: false, issues, blocked: true };
  return { dailyMeta: out, added, issues, blocked: false };
}

/** 导入的无身份项：仅在完整内容指纹一致时复用本地身份，否则新分配。不按相似字段猜测。 */
export function adoptImportedEntities(localItems, incomingItems, kind, date) {
  if (!Array.isArray(incomingItems)) return incomingItems;
  if (incomingItems.length === 0) return [];
  const local = stabilizeArray(localItems || [], kind, date);
  const pool = local.blocked ? [] : local.items.map((item) => ({ item, used: false }));
  const usedEids = new Set(pool.map((slot) => slot.item.eid));
  const fpCount = new Map();
  return incomingItems.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const copy = { ...item };
    if (isValidEid(copy.eid, kind) && !usedEids.has(copy.eid)) {
      usedEids.add(copy.eid);
      return copy;
    }
    if (isValidEid(copy.eid, kind) && usedEids.has(copy.eid)) return copy;
    const fp = entityFingerprint(copy);
    const slot = pool.find((candidate) => !candidate.used && entityFingerprint(candidate.item) === fp);
    if (slot) {
      slot.used = true;
      copy.eid = slot.item.eid;
      usedEids.add(copy.eid);
      return copy;
    }
    delete copy.eid;
    let ordinal = fpCount.get(fp) || 0;
    let eid = deterministicEid(kind, date, copy, ordinal);
    while (usedEids.has(eid)) eid = deterministicEid(kind, date, copy, ++ordinal);
    fpCount.set(fp, ordinal + 1);
    copy.eid = eid;
    usedEids.add(eid);
    return copy;
  });
}
