/** 区分种子占位与用户真实待保存意图（B1-R3 overlay / 提交合并） */
import { mergeDailyStore } from "./daily-merge.js";

export function seedRecordByDate(SEED, normalizeRec) {
  const m = new Map();
  for (const r of SEED || []) {
    if (r?.d) m.set(r.d, normalizeRec(r));
  }
  return m;
}

export function recordMatchesSeed(r, seedByD, normalizeRec) {
  if (!r?.d) return false;
  const s = seedByD.get(r.d);
  if (!s) return false;
  try {
    return JSON.stringify(normalizeRec(r)) === JSON.stringify(s);
  } catch {
    return false;
  }
}

export function dailyDayMatchesSeed(d, day, DAILY_SEED) {
  try {
    const seedDay = DAILY_SEED?.[d];
    if (seedDay === undefined) return Object.keys(day || {}).length === 0;
    return JSON.stringify(day) === JSON.stringify(seedDay);
  } catch {
    return false;
  }
}

/**
 * 磁盘为基底，仅应用非种子占位的 memory 变更与显式删除。
 */
export function mergeRecordsWithIntent({
  diskRecords,
  memoryRecords,
  SEED,
  normalizeRec,
  deletedDates = [],
  userRecordDates = null,
}) {
  const seedByD = seedRecordByDate(SEED, normalizeRec);
  const out = new Map((diskRecords || []).filter((r) => r?.d).map((r) => [r.d, r]));
  for (const d of deletedDates || []) out.delete(d);
  const userSet = userRecordDates ? new Set(userRecordDates) : null;
  for (const r of memoryRecords || []) {
    if (!r?.d) continue;
    if (userSet) {
      if (userSet.has(r.d)) out.set(r.d, r);
      continue;
    }
    if (!recordMatchesSeed(r, seedByD, normalizeRec)) out.set(r.d, r);
  }
  return [...out.values()].sort((a, b) => a.d.localeCompare(b.d));
}

export function mergeDailyWithIntent({
  diskDaily,
  memoryDaily,
  DAILY_SEED,
  diskSeed,
  userDailyDates = null,
}) {
  const userSet = userDailyDates ? new Set(userDailyDates) : null;
  if (userSet && diskDaily) {
    const base = structuredClone(diskDaily);
    for (const d of userSet) {
      if (memoryDaily?.[d]) base[d] = structuredClone(memoryDaily[d]);
    }
    return base;
  }
  const base = diskDaily ? structuredClone(diskDaily) : {};
  for (const [d, day] of Object.entries(memoryDaily || {})) {
    if (!dailyDayMatchesSeed(d, day, DAILY_SEED)) base[d] = structuredClone(day);
  }
  return mergeDailyStore(DAILY_SEED, base, diskSeed || DAILY_SEED);
}

export function mergeQuarantine(diskQ, memQ) {
  if (!diskQ && !memQ) return null;
  const out = { ...(diskQ || {}), ...(memQ || {}) };
  for (const key of ["recordErrors", "badRows", "readErrors"]) {
    const a = diskQ?.[key];
    const b = memQ?.[key];
    if (Array.isArray(a) || Array.isArray(b)) {
      out[key] = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
    }
  }
  if (diskQ?.corruptAppStateRaw) out.corruptAppStateRaw = diskQ.corruptAppStateRaw;
  if (diskQ?.legacyRecordsRaw && !out.legacyRecordsRaw) out.legacyRecordsRaw = diskQ.legacyRecordsRaw;
  if (diskQ?.legacyDailyRaw && !out.legacyDailyRaw) out.legacyDailyRaw = diskQ.legacyDailyRaw;
  if (diskQ?.legacyBaselineRaw && !out.legacyBaselineRaw) out.legacyBaselineRaw = diskQ.legacyBaselineRaw;
  return out;
}
