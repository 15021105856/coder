/**
 * 应用存储契约（B1-R1）：单键版本化逻辑快照 + 旧 v1 只读迁移。
 */
import LEGACY_DAILY_SEED from "../../data/legacy-daily-seed.json";
import { mergeRecordLists, byDate } from "./records-io.js";
import { mergeDailyStore } from "./daily-merge.js";
import { parseRecordsRaw, parseRecordsArray } from "./record-parse.js";
import { STORAGE_KEYS } from "./release.js";
import { safeGetItem } from "./local-storage-adapter.js";

export const APP_STATE_KEY = STORAGE_KEYS.appState;
export const SNAPSHOT_FORMAT = 2;

const LEGACY = {
  records: STORAGE_KEYS.records,
  dataVersion: STORAGE_KEYS.dataVersion,
  daily: STORAGE_KEYS.daily,
  baseline: STORAGE_KEYS.baseline,
};

const plainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isUnreadable = (v) => v && typeof v === "object" && v.__unreadable;

function readVerMeta(ls, readErrors) {
  let vStamp = null;
  let vDate = null;
  const rawVer = safeGetItem(ls, LEGACY.dataVersion, readErrors);
  if (isUnreadable(rawVer)) return { vStamp, vDate };
  if (!rawVer) return { vStamp, vDate };
  try {
    if (rawVer[0] === "{") {
      const o = JSON.parse(rawVer);
      vStamp = o.s || null;
      vDate = o.d || null;
    } else vDate = rawVer;
  } catch (e) {
    readErrors.push({ key: LEGACY.dataVersion, message: e?.message || "parse-failed" });
  }
  return { vStamp, vDate };
}

function readLegacyRecords(ls, readErrors) {
  const raw = safeGetItem(ls, LEGACY.records, readErrors);
  if (isUnreadable(raw)) {
    return { records: [], quarantine: { recordErrors: [{ reason: "key-unreadable" }] } };
  }
  if (!raw) return { records: [], quarantine: null };
  const parsed = parseRecordsRaw(raw);
  const quarantine =
    parsed.errors.length || parsed.parseError
      ? {
          legacyRecordsRaw: raw,
          recordErrors: parsed.errors,
          badRows: parsed.badRows,
          parseError: parsed.parseError || undefined,
        }
      : null;
  return { records: parsed.records, quarantine };
}

function readLegacyDaily(ls, readErrors, ctx) {
  const raw = safeGetItem(ls, LEGACY.daily, readErrors);
  if (isUnreadable(raw)) return { dailyMeta: null, raw: null, unreadable: true };
  if (!raw) return { dailyMeta: null, raw: null };
  try {
    const c = JSON.parse(raw);
    if (c && plainObject(c.data)) {
      const base = plainObject(c.seed) ? c.seed : (c.stamp === ctx.DATA_STAMP ? ctx.DAILY_SEED : LEGACY_DAILY_SEED);
      return { dailyMeta: mergeDailyStore(ctx.DAILY_SEED, c.data, base), raw };
    }
    return { dailyMeta: null, raw };
  } catch (e) {
    readErrors.push({ key: LEGACY.daily, message: e?.message || "parse-failed" });
    return { dailyMeta: null, raw: null, unreadable: true };
  }
}

function readLegacyBaseline(ls, readErrors) {
  const raw = safeGetItem(ls, LEGACY.baseline, readErrors);
  if (isUnreadable(raw)) return { baseline: null, raw: null, unreadable: true };
  if (!raw) return { baseline: null, raw: null };
  try {
    return { baseline: JSON.parse(raw), raw };
  } catch (e) {
    readErrors.push({ key: LEGACY.baseline, message: e?.message || "parse-failed" });
    return { baseline: null, raw: null, unreadable: true };
  }
}

/** 既定 seed / stale 规则（legacy 与 v2 共用） */
export function resolveRecordsForSeedMerge({
  rescued, vStamp, vDate, DATA_STAMP, DATA_DATE, SEED, wholeJsonFailed,
}) {
  const working = () => {
    if (!rescued.length) return mergeRecordLists(SEED, null);
    if (vStamp === DATA_STAMP || (!vStamp && vDate === DATA_DATE)) return rescued;
    if (vDate && DATA_DATE && vDate > DATA_DATE) return rescued;
    return mergeRecordLists(SEED, rescued);
  };
  if (wholeJsonFailed && !rescued.length) {
    const w = working();
    return {
      records: w,
      persistRecords: w,
      staleVer: null,
      shouldPersistMerge: false,
      seedMergeApplied: false,
    };
  }
  if (!rescued.length) {
    const w = working();
    return {
      records: w,
      persistRecords: w,
      staleVer: null,
      shouldPersistMerge: true,
      seedMergeApplied: true,
    };
  }
  if (vStamp === DATA_STAMP || (!vStamp && vDate === DATA_DATE)) {
    return { records: rescued, persistRecords: rescued, staleVer: null, shouldPersistMerge: false, seedMergeApplied: false };
  }
  if (vDate && DATA_DATE && vDate > DATA_DATE) {
    return { records: rescued, persistRecords: rescued, staleVer: vDate, shouldPersistMerge: false, seedMergeApplied: false };
  }
  const merged = mergeRecordLists(SEED, rescued);
  return { records: merged, persistRecords: merged, staleVer: null, shouldPersistMerge: true, seedMergeApplied: true };
}

function buildDailyEnvelope(dailyMeta, ctx) {
  const dates = Object.keys(dailyMeta || {});
  const last = dates.length ? [...dates, ctx.DATA_DATE].sort().at(-1) : ctx.DATA_DATE;
  return {
    stamp: ctx.DATA_STAMP,
    date: last,
    seed: ctx.DAILY_SEED,
    data: dailyMeta || {},
  };
}

export function buildLogicalSnapshot({ records, dailyMeta, baseline, quarantine, ...ctx }) {
  return {
    format: SNAPSHOT_FORMAT,
    dataStamp: ctx.DATA_STAMP,
    dataDate: ctx.DATA_DATE,
    records: records || [],
    daily: buildDailyEnvelope(dailyMeta, ctx),
    baseline: baseline ?? null,
    quarantine: quarantine || undefined,
    savedAt: new Date().toISOString(),
  };
}

export function parseSnapshot(jsonText) {
  if (!jsonText) return { ok: false, reason: "empty" };
  try {
    const o = JSON.parse(jsonText);
    if (!o || o.format !== SNAPSHOT_FORMAT) return { ok: false, reason: "format", raw: jsonText };
    return { ok: true, snapshot: o, raw: jsonText };
  } catch (e) {
    return { ok: false, reason: "json", message: e?.message, raw: jsonText };
  }
}

function hydrateSnapshotRecords(snapshot, ctx) {
  const arr = Array.isArray(snapshot.records) ? snapshot.records : [];
  const { records, errors, badRows } = parseRecordsArray(arr);
  const quarantine = errors.length
    ? {
        ...(snapshot.quarantine || {}),
        recordErrors: [...(snapshot.quarantine?.recordErrors || []), ...errors],
        badRows: [...(snapshot.quarantine?.badRows || []), ...badRows],
      }
    : snapshot.quarantine || null;
  return { records, quarantine };
}

function mergeAuthorityRecords(memory, stored) {
  const map = new Map();
  for (const r of stored || []) if (r?.d) map.set(r.d, r);
  for (const r of memory || []) if (r?.d) map.set(r.d, r);
  return [...map.values()].sort(byDate);
}

function readLegacyKeysOnly(ls, readErrors) {
  const snap = {};
  for (const k of Object.values(LEGACY)) {
    const v = safeGetItem(ls, k, readErrors);
    if (!isUnreadable(v) && v != null) snap[k] = v;
  }
  return snap;
}

function loadFromValidV2(v2Raw, parsed, ctx, readErrors, writeOk) {
  const s = parsed.snapshot;
  const { records: rescued, quarantine: rowQuarantine } = hydrateSnapshotRecords(s, ctx);
  const merged = resolveRecordsForSeedMerge({
    rescued,
    vStamp: s.dataStamp,
    vDate: s.dataDate,
    DATA_STAMP: ctx.DATA_STAMP,
    DATA_DATE: ctx.DATA_DATE,
    SEED: ctx.SEED,
    wholeJsonFailed: false,
  });
  let dailyMeta = s.daily?.data ? structuredClone(s.daily.data) : structuredClone(ctx.DAILY_SEED);
  if (merged.seedMergeApplied && merged.shouldPersistMerge) {
    dailyMeta = structuredClone(ctx.DAILY_SEED);
  }
  const quarantine = rowQuarantine || s.quarantine || null;
  let migrationPending = false;
  let memMode = !writeOk;

  if (merged.shouldPersistMerge && writeOk) {
    const commit = commitAppStateInternal(ctx.ls, ctx, {
      records: merged.persistRecords,
      dailyMeta,
      baseline: s.baseline ?? null,
      quarantine,
    });
    if (commit.status !== "ok") {
      migrationPending = true;
      if (commit.status === "failed") memMode = true;
    }
  } else if (merged.shouldPersistMerge && !writeOk) {
    migrationPending = true;
    memMode = true;
  }

  return {
    records: merged.records,
    dailyMeta,
    baselineStored: s.baseline ?? null,
    staleVer: merged.staleVer,
    memMode,
    readErrors,
    quarantine,
    storageBanner: buildLoadBanner({ readErrors, migrationPending, commitFailed: memMode, hasQuarantine: !!quarantine }),
    migrationPending,
    writeOk,
    legacyKeysUntouched: true,
    corruptAuthority: false,
  };
}

function loadFromCorruptV2(v2Raw, parsed, ctx, readErrors, writeOk) {
  const quarantine = {
    corruptAppStateRaw: v2Raw,
    parseReason: parsed.reason,
    readErrors: readErrors.length ? readErrors.slice() : undefined,
  };
  const legacyRec = readLegacyRecords(ctx.ls, readErrors);
  const { vStamp, vDate } = readVerMeta(ctx.ls, readErrors);
  const rescued = legacyRec.records.length ? legacyRec.records : [];
  const wholeJsonFailed = !rescued.length;
  const merged = resolveRecordsForSeedMerge({
    rescued,
    vStamp,
    vDate,
    DATA_STAMP: ctx.DATA_STAMP,
    DATA_DATE: ctx.DATA_DATE,
    SEED: ctx.SEED,
    wholeJsonFailed,
  });
  const dailyRead = readLegacyDaily(ctx.ls, readErrors, ctx);
  const dailyMeta = dailyRead.dailyMeta != null ? dailyRead.dailyMeta : structuredClone(ctx.DAILY_SEED);
  const baselineRead = readLegacyBaseline(ctx.ls, readErrors);
  Object.assign(quarantine, legacyRec.quarantine || {});

  return {
    records: merged.records,
    dailyMeta,
    baselineStored: baselineRead.baseline,
    staleVer: merged.staleVer,
    memMode: !writeOk,
    readErrors,
    quarantine,
    storageBanner: "corrupt-authority",
    migrationPending: true,
    writeOk,
    legacyKeysUntouched: true,
    corruptAuthority: true,
  };
}

function loadFromLegacy(ctx, readErrors, writeOk, v2Raw) {
  const legacyBefore = readLegacyKeysOnly(ctx.ls, readErrors);
  const { vStamp, vDate } = readVerMeta(ctx.ls, readErrors);
  const { records: rescued, quarantine: recQuarantine } = readLegacyRecords(ctx.ls, readErrors);
  const wholeJsonFailed = Boolean(recQuarantine?.parseError && !rescued.length);
  const merged = resolveRecordsForSeedMerge({
    rescued,
    vStamp,
    vDate,
    DATA_STAMP: ctx.DATA_STAMP,
    DATA_DATE: ctx.DATA_DATE,
    SEED: ctx.SEED,
    wholeJsonFailed,
  });

  const dailyRead = readLegacyDaily(ctx.ls, readErrors, ctx);
  const dailyMeta = dailyRead.dailyMeta != null ? dailyRead.dailyMeta : structuredClone(ctx.DAILY_SEED);
  const baselineRead = readLegacyBaseline(ctx.ls, readErrors);
  const baselineStored = baselineRead.baseline;

  const quarantine = {
    ...(recQuarantine || {}),
    legacyDailyRaw: dailyRead.unreadable ? undefined : dailyRead.raw || undefined,
    legacyBaselineRaw: baselineRead.unreadable ? undefined : baselineRead.raw || undefined,
    readErrors: readErrors.length ? readErrors.slice() : undefined,
  };
  const hasQuarantine =
    recQuarantine ||
    readErrors.length ||
    quarantine.legacyDailyRaw ||
    quarantine.legacyBaselineRaw;

  const recordsToPersist = merged.persistRecords ?? merged.records;
  let migrationPending = false;
  let memMode = false;

  const needsFirstV2FromLegacy = !v2Raw && rescued.length > 0 && !wholeJsonFailed;
  if (writeOk && (merged.shouldPersistMerge || needsFirstV2FromLegacy)) {
    const commit = commitAppStateInternal(ctx.ls, ctx, {
      records: recordsToPersist,
      dailyMeta,
      baseline: baselineStored,
      quarantine: hasQuarantine ? quarantine : null,
    });
    if (commit.status !== "ok") {
      migrationPending = true;
      if (commit.status === "failed") memMode = true;
    }
  } else if (merged.shouldPersistMerge || needsFirstV2FromLegacy) {
    migrationPending = true;
    memMode = true;
  }

  const legacyAfter = readLegacyKeysOnly(ctx.ls, readErrors);
  const legacyKeysUntouched = JSON.stringify(legacyBefore) === JSON.stringify(legacyAfter);

  return {
    records: merged.records,
    dailyMeta,
    baselineStored,
    staleVer: merged.staleVer,
    memMode,
    readErrors,
    quarantine: hasQuarantine ? quarantine : null,
    storageBanner: buildLoadBanner({ readErrors, migrationPending, commitFailed: memMode, hasQuarantine }),
    migrationPending,
    writeOk,
    legacyKeysUntouched,
    corruptAuthority: false,
  };
}

export function loadAppState(ls, ctx) {
  const readErrors = [];
  const writeOk = ls.probeWrite?.() ?? ls.probe?.() ?? true;
  const fullCtx = { ...ctx, ls };

  const v2RawVal = safeGetItem(ls, APP_STATE_KEY, readErrors);
  const v2Raw = isUnreadable(v2RawVal) ? null : v2RawVal;

  if (v2Raw) {
    const parsed = parseSnapshot(v2Raw);
    if (parsed.ok) return loadFromValidV2(v2Raw, parsed, fullCtx, readErrors, writeOk);
    readErrors.push({ key: APP_STATE_KEY, message: parsed.reason || "corrupt-snapshot" });
    return loadFromCorruptV2(v2Raw, parsed, fullCtx, readErrors, writeOk);
  }

  if (isUnreadable(v2RawVal)) {
    readErrors.push({ key: APP_STATE_KEY, message: "read-failed" });
  }

  return loadFromLegacy(fullCtx, readErrors, writeOk, v2Raw);
}

function buildLoadBanner({ readErrors, migrationPending, commitFailed, hasQuarantine }) {
  if (commitFailed) return "migration-commit-failed";
  if (migrationPending) return "migration-pending";
  if (readErrors.length) return "read-errors";
  if (hasQuarantine) return "quarantine";
  return null;
}

function commitAppStateInternal(ls, ctx, { records, dailyMeta, baseline, quarantine }) {
  if (!(ls.probeWrite?.() ?? ls.probe?.() ?? true)) {
    return { status: "failed", reason: "storage-probe-failed" };
  }
  const snapshot = buildLogicalSnapshot({ records, dailyMeta, baseline, quarantine, ...ctx });
  const payload = JSON.stringify(snapshot);
  let before = null;
  try {
    before = ls.getItem(APP_STATE_KEY);
  } catch (e) {
    return { status: "failed", reason: e?.message || "pre-read-failed", snapshot };
  }
  try {
    ls.setItem(APP_STATE_KEY, payload);
  } catch (e) {
    return { status: "failed", reason: e?.message || "setItem-failed", snapshot };
  }
  try {
    const back = ls.getItem(APP_STATE_KEY);
    if (back !== payload) {
      if (before != null) {
        try {
          ls.setItem(APP_STATE_KEY, before);
        } catch {
          /* unknown */
        }
      }
      return { status: "unknown", reason: "readback-mismatch", snapshot };
    }
    return { status: "ok", snapshot };
  } catch (e) {
    return { status: "unknown", reason: e?.message || "getItem-after-set-failed", snapshot };
  }
}

export function commitAppState(ls, ctx, state) {
  return commitAppStateInternal(ls, ctx, state);
}

/** 写入前与磁盘权威快照对齐，避免 probe 降级后 seed-only 内存覆盖独有记录 */
export function reconcileMemoryWithAuthority(ls, ctx, memory) {
  const readErrors = [];
  const rawVal = safeGetItem(ls, APP_STATE_KEY, readErrors);
  if (isUnreadable(rawVal) || !rawVal) return memory;
  const parsed = parseSnapshot(rawVal);
  if (!parsed.ok) return memory;
  const { records: stored } = hydrateSnapshotRecords(parsed.snapshot, ctx);
  return {
    records: mergeAuthorityRecords(memory.records, stored),
    dailyMeta: memory.dailyMeta,
    baseline: memory.baseline,
    quarantine: memory.quarantine ?? parsed.snapshot.quarantine ?? null,
  };
}

export function logicalSnapshotFromStorage(ls, ctx) {
  const readErrors = [];
  const rawVal = safeGetItem(ls, APP_STATE_KEY, readErrors);
  if (isUnreadable(rawVal)) return { ok: false, raw: null, logical: null, readErrors };
  const parsed = parseSnapshot(rawVal);
  if (!parsed.ok) return { ok: false, raw: rawVal, logical: null };
  const s = parsed.snapshot;
  const { records } = hydrateSnapshotRecords(s, ctx);
  return {
    ok: true,
    raw: rawVal,
    logical: {
      records,
      daily: s.daily,
      baseline: s.baseline,
      quarantine: s.quarantine,
    },
  };
}

export function exportRescueBundle(ctx, { records, dailyMeta, baseline, quarantine, readErrors, writeOk, corruptAuthority }) {
  return {
    app: "physio-log",
    kind: "storage-rescue",
    version: 1,
    exported: new Date().toISOString(),
    dataStamp: ctx.DATA_STAMP,
    dataDate: ctx.DATA_DATE,
    records,
    _daily: dailyMeta,
    baseline,
    quarantine,
    readErrors,
    storage: {
      writeOk: writeOk !== false,
      corruptAuthority: !!corruptAuthority,
      unreadableKeys: (readErrors || []).filter((e) => e.message?.includes("read-failed") || e.key),
    },
  };
}

export { LEGACY as LEGACY_STORAGE_KEYS };
