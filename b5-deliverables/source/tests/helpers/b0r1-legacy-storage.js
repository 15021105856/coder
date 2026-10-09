/**
 * B0-R1 监测系统 localStorage 读写逻辑副本（仅用于 B1 回归：证明原版 R01/R04/R17 失败形态）。
 * 勿在生产代码中引用。
 */
import { mergeRecordLists, normalizeRec } from "../../src/shared/records-io.js";
import { STORAGE_KEYS } from "../../src/shared/release.js";

const LS_KEY = STORAGE_KEYS.records;
const LS_VER = STORAGE_KEYS.dataVersion;
const LS_DAILY = STORAGE_KEYS.daily;
const LS_BASE = STORAGE_KEYS.baseline;

export function legacyLoadRecords(storage, { SEED, DATA_STAMP, DATA_DATE }) {
  const ls = storage;
  const rawVer = ls.getItem(LS_VER);
  let vStamp = null;
  let vDate = null;
  if (rawVer) {
    if (rawVer[0] === "{") {
      try {
        const o = JSON.parse(rawVer);
        vStamp = o.s || null;
        vDate = o.d || null;
      } catch {
        /* ignore */
      }
    } else vDate = rawVer;
  }
  let cached = null;
  try {
    const raw = ls.getItem(LS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) cached = arr.map(normalizeRec);
    }
  } catch {
    cached = null;
  }
  if (cached && (vStamp === DATA_STAMP || (!vStamp && vDate === DATA_DATE))) return { recs: cached, wrote: false };
  if (cached && vDate && vDate > DATA_DATE) return { recs: cached, staleVer: vDate, wrote: false };
  const merged = mergeRecordLists(SEED, cached);
  ls.setItem(LS_KEY, JSON.stringify(merged));
  ls.setItem(LS_VER, JSON.stringify({ s: DATA_STAMP, d: DATA_DATE }));
  return { recs: merged, wrote: true };
}

/** 模拟 B0-R1 分键写入（无原子性） */
export function legacySaveAll(storage, { recs, dailyPayload, baseline, DATA_STAMP, DATA_DATE }) {
  const ls = storage;
  ls.setItem(LS_KEY, JSON.stringify(recs));
  ls.setItem(LS_VER, JSON.stringify({ s: DATA_STAMP, d: DATA_DATE }));
  if (dailyPayload != null) ls.setItem(LS_DAILY, JSON.stringify(dailyPayload));
  if (baseline !== undefined) {
    if (baseline) ls.setItem(LS_BASE, JSON.stringify(baseline));
    else ls.removeItem(LS_BASE);
  }
}

export { LS_KEY, LS_VER, LS_DAILY, LS_BASE };
