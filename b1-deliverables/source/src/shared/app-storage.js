/**
 * 应用存储契约（B1-R3）：单键逻辑快照 + 占位/意图区分 + 共用提交门禁。
 */
import LEGACY_DAILY_SEED from "../../data/legacy-daily-seed.json";
import { mergeRecordLists } from "./records-io.js";
import { mergeDailyStore } from "./daily-merge.js";
import { parseRecordsRaw, parseRecordsArray } from "./record-parse.js";
import { STORAGE_KEYS } from "./release.js";
import { safeGetItem, safeListKeys } from "./local-storage-adapter.js";
import {
  mergeRecordsWithIntent,
  mergeDailyWithIntent,
  mergeQuarantine,
} from "./storage-intent.js";
import {
  sanitizeDailyMeta,
  normalizeQuarantine,
  validateSnapshotForCommit,
  validateBaselineValue,
} from "./storage-sanitize.js";

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

function validateSnapshotStructure(o) {
  if (!Array.isArray(o.records)) return { ok: false, reason: "records-not-array" };
  if (o.daily != null && (!plainObject(o.daily) || !plainObject(o.daily.data))) {
    return { ok: false, reason: "daily-invalid" };
  }
  if (o.baseline != null && !plainObject(o.baseline)) return { ok: false, reason: "baseline-invalid" };
  return { ok: true };
}

function readVerMeta(ls, readErrors) {
  let vStamp = null;
  let vDate = null;
  const rawVer = safeGetItem(ls, LEGACY.dataVersion, readErrors);
  if (isUnreadable(rawVer)) return { vStamp, vDate, unreadable: true, raw: null };
  if (!rawVer) return { vStamp, vDate, unreadable: false, raw: null };
  try {
    if (rawVer[0] === "{") {
      const o = JSON.parse(rawVer);
      vStamp = o.s || null;
      vDate = o.d || null;
    } else vDate = rawVer;
  } catch (e) {
    readErrors.push({ key: LEGACY.dataVersion, message: e?.message || "parse-failed" });
    return { vStamp, vDate, unreadable: false, raw: rawVer, parseFailed: true };
  }
  return { vStamp, vDate, unreadable: false, raw: rawVer };
}

function readLegacyRecords(ls, readErrors) {
  const raw = safeGetItem(ls, LEGACY.records, readErrors);
  if (isUnreadable(raw)) {
    return { records: [], quarantine: { recordErrors: [{ reason: "key-unreadable" }] }, unreadable: true };
  }
  if (!raw) return { records: [], quarantine: null, unreadable: false };
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
  return { records: parsed.records, quarantine, unreadable: false };
}

function readLegacyDaily(ls, readErrors, ctx) {
  const raw = safeGetItem(ls, LEGACY.daily, readErrors);
  if (isUnreadable(raw)) return { dailyMeta: null, raw: null, unreadable: true };
  if (!raw) return { dailyMeta: null, raw: null, unreadable: false };
  try {
    const c = JSON.parse(raw);
    if (c && plainObject(c.data)) {
      const base = plainObject(c.seed) ? c.seed : (c.stamp === ctx.DATA_STAMP ? ctx.DAILY_SEED : LEGACY_DAILY_SEED);
      return { dailyMeta: mergeDailyStore(ctx.DAILY_SEED, c.data, base), raw, unreadable: false };
    }
    return { dailyMeta: null, raw, unreadable: false };
  } catch (e) {
    readErrors.push({ key: LEGACY.daily, message: e?.message || "parse-failed" });
    return { dailyMeta: null, raw, unreadable: false, parseFailed: true };
  }
}

function readLegacyBaseline(ls, readErrors) {
  const raw = safeGetItem(ls, LEGACY.baseline, readErrors);
  if (isUnreadable(raw)) return { baseline: null, raw: null, unreadable: true };
  if (!raw) return { baseline: null, raw: null, unreadable: false };
  try {
    return { baseline: JSON.parse(raw), raw, unreadable: false };
  } catch (e) {
    readErrors.push({ key: LEGACY.baseline, message: e?.message || "parse-failed" });
    return { baseline: null, raw, unreadable: false, parseFailed: true };
  }
}

/**
 * @param {"v2"|"legacy"} origin
 */
export function resolveRecordsForSeedMerge({
  rescued, vStamp, vDate, DATA_STAMP, DATA_DATE, SEED, wholeJsonFailed, origin = "legacy",
}) {
  if (origin === "v2" && !wholeJsonFailed && rescued.length === 0) {
    return {
      records: [],
      persistRecords: [],
      staleVer: null,
      shouldPersistMerge: false,
      seedMergeApplied: false,
      validEmpty: true,
    };
  }
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

function mergeDailyForSeedUpdate(ctx, snapshotDaily, localDailyMeta) {
  const snapData = snapshotDaily?.data ? structuredClone(snapshotDaily.data) : structuredClone(localDailyMeta || {});
  const snapSeed = snapshotDaily?.seed ? snapshotDaily.seed : LEGACY_DAILY_SEED;
  return mergeDailyStore(ctx.DAILY_SEED, snapData, snapSeed);
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
    const struct = validateSnapshotStructure(o);
    if (!struct.ok) return { ok: false, reason: struct.reason, raw: jsonText, snapshot: o };
    return { ok: true, snapshot: o, raw: jsonText };
  } catch (e) {
    return { ok: false, reason: "json", message: e?.message, raw: jsonText };
  }
}

function hydrateSnapshotRecords(snapshot) {
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

function readLegacyKeysOnly(ls, readErrors) {
  const snap = {};
  for (const k of Object.values(LEGACY)) {
    const v = safeGetItem(ls, k, readErrors);
    if (!isUnreadable(v) && v != null) snap[k] = v;
  }
  return snap;
}

function legacyKeyState(ls, key, readErrors) {
  const v = safeGetItem(ls, key, readErrors);
  if (isUnreadable(v)) return "unreadable";
  if (v != null && v !== "") return "present";
  const keys = safeListKeys(ls);
  if (keys && keys.includes(key)) return "unreadable";
  return "absent";
}

function legacyMigrationBlocked(states, dailyRead, baselineRead, recordsRead, verRead) {
  if (states.records === "unreadable" || recordsRead.unreadable) {
    return { blocked: true, reason: "records-unreadable" };
  }
  if (states.version === "unreadable" || verRead.unreadable) {
    return { blocked: true, reason: "version-unreadable" };
  }
  if (states.daily === "present" && (dailyRead.unreadable || dailyRead.parseFailed)) {
    return { blocked: true, reason: dailyRead.unreadable ? "daily-unreadable" : "daily-parse-failed" };
  }
  if (states.baseline === "present" && (baselineRead.unreadable || baselineRead.parseFailed)) {
    return { blocked: true, reason: baselineRead.unreadable ? "baseline-unreadable" : "baseline-parse-failed" };
  }
  if (states.daily === "unreadable") return { blocked: true, reason: "daily-unreadable" };
  if (states.baseline === "unreadable") return { blocked: true, reason: "baseline-unreadable" };
  return { blocked: false };
}

export function assessLegacyCommitReadiness(ls, ctx) {
  const readErrors = [];
  const states = {
    records: legacyKeyState(ls, LEGACY.records, readErrors),
    version: legacyKeyState(ls, LEGACY.dataVersion, readErrors),
    daily: legacyKeyState(ls, LEGACY.daily, readErrors),
    baseline: legacyKeyState(ls, LEGACY.baseline, readErrors),
  };
  const dailyRead = readLegacyDaily(ls, readErrors, ctx);
  const baselineRead = readLegacyBaseline(ls, readErrors);
  const recordsRead = readLegacyRecords(ls, readErrors);
  const verRead = readVerMeta(ls, readErrors);
  const mig = legacyMigrationBlocked(states, dailyRead, baselineRead, recordsRead, verRead);
  if (mig.blocked) return { ok: false, reason: mig.reason, readErrors };
  if (verRead.parseFailed && states.version === "present") {
    return { ok: false, reason: "version-parse-failed", readErrors };
  }
  if (states.records === "present" && recordsRead.unreadable) {
    return { ok: false, reason: "records-unreadable", readErrors };
  }
  return { ok: true, readErrors };
}

/** 尚无 v2 时，把可读 legacy 组件并入待提交状态（保留内存中的用户意图） */
export function mergeLegacySourcesForCommit(ls, ctx, memory) {
  const readErrors = [];
  const rawV2 = safeGetItem(ls, APP_STATE_KEY, readErrors);
  if (!isUnreadable(rawV2) && rawV2) return memory;
  const legacyRec = readLegacyRecords(ls, readErrors);
  const dailyRead = readLegacyDaily(ls, readErrors, ctx);
  const baselineRead = readLegacyBaseline(ls, readErrors);
  let records = memory.records;
  if (!legacyRec.unreadable && legacyRec.records.length) {
    records = mergeRecordsWithIntent({
      diskRecords: legacyRec.records,
      memoryRecords: memory.records,
      SEED: ctx.SEED,
      normalizeRec: ctx.normalizeRec,
      deletedDates: memory.deletedRecordDates,
      userRecordDates: memory.userRecordDates,
    });
  }
  let dailyMeta = memory.dailyMeta;
  if (dailyRead.dailyMeta != null) {
    dailyMeta = mergeDailyWithIntent({
      diskDaily: dailyRead.dailyMeta,
      memoryDaily: memory.dailyMeta,
      DAILY_SEED: ctx.DAILY_SEED,
      diskSeed: ctx.DAILY_SEED,
      userDailyDates: memory.userDailyDates,
    });
  }
  let baseline = memory.baseline;
  if (memory.baselineIntent === "inherit" && baselineRead.baseline != null) {
    const bCheck = validateBaselineValue(baselineRead.baseline);
    if (bCheck.ok) baseline = bCheck.value;
  }
  const quarantine = mergeQuarantine(
    {
      ...(legacyRec.quarantine || {}),
      legacyDailyRaw: dailyRead.raw || undefined,
      legacyBaselineRaw: baselineRead.raw || undefined,
    },
    memory.quarantine,
  );
  return { ...memory, records, dailyMeta, baseline, quarantine };
}

export function evaluateCommitGate(ls, ctx, { corruptAuthority }) {
  if (corruptAuthority) return { ok: false, reason: "corrupt-authority" };
  const readErrors = [];
  const rawV2 = safeGetItem(ls, APP_STATE_KEY, readErrors);
  if (isUnreadable(rawV2)) return { ok: false, reason: "authority-unreadable" };
  if (rawV2) {
    const parsed = parseSnapshot(rawV2);
    if (!parsed.ok) return { ok: false, reason: "corrupt-authority" };
    return { ok: true };
  }
  return assessLegacyCommitReadiness(ls, ctx);
}

function loadFromValidV2(v2Raw, parsed, ctx, readErrors, writeOk) {
  const s = parsed.snapshot;
  const { records: rescued, quarantine: rowQuarantine } = hydrateSnapshotRecords(s);
  const merged = resolveRecordsForSeedMerge({
    rescued,
    vStamp: s.dataStamp,
    vDate: s.dataDate,
    DATA_STAMP: ctx.DATA_STAMP,
    DATA_DATE: ctx.DATA_DATE,
    SEED: ctx.SEED,
    wholeJsonFailed: false,
    origin: "v2",
  });
  const dailyIssues = [];
  let dailyMeta = sanitizeDailyMeta(
    s.daily?.data ? structuredClone(s.daily.data) : structuredClone(ctx.DAILY_SEED),
    dailyIssues,
  );
  if (merged.seedMergeApplied && merged.shouldPersistMerge) {
    dailyMeta = mergeDailyForSeedUpdate(ctx, s.daily, dailyMeta);
  }
  let quarantine = normalizeQuarantine(rowQuarantine || s.quarantine || null);
  if (dailyIssues.length) {
    quarantine = { ...(quarantine || {}), dailyStructureIssues: dailyIssues };
  }
  const baselineCheck = validateBaselineValue(s.baseline ?? null);
  const baselineStored = baselineCheck.ok ? baselineCheck.value : null;
  if (!baselineCheck.ok && s.baseline != null) {
    quarantine = { ...(quarantine || {}), baselineInvalid: s.baseline };
  }
  let migrationPending = false;
  let memMode = !writeOk;

  if (merged.shouldPersistMerge && writeOk) {
    const commit = commitAppStateInternal(ctx.ls, ctx, {
      records: merged.persistRecords,
      dailyMeta,
      baseline: baselineStored,
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
    baselineStored,
    staleVer: merged.staleVer,
    memMode,
    readErrors,
    quarantine,
    storageBanner: buildLoadBanner({ readErrors, migrationPending, commitFailed: memMode, hasQuarantine: !!quarantine }),
    migrationPending,
    writeOk,
    legacyKeysUntouched: true,
    corruptAuthority: false,
    authorityOverlayOnCommit: false,
    seedPlaceholder: false,
    migrationBlocked: false,
    validEmpty: !!merged.validEmpty,
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
    origin: "legacy",
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
    authorityOverlayOnCommit: false,
    seedPlaceholder: false,
    migrationBlocked: false,
    validEmpty: false,
  };
}

function loadAuthorityUnreadable(ctx, readErrors, writeOk) {
  return {
    records: mergeRecordLists(ctx.SEED, null),
    dailyMeta: structuredClone(ctx.DAILY_SEED),
    baselineStored: null,
    staleVer: null,
    memMode: !writeOk,
    readErrors,
    quarantine: null,
    storageBanner: "read-errors",
    migrationPending: true,
    writeOk,
    legacyKeysUntouched: true,
    corruptAuthority: false,
    authorityOverlayOnCommit: true,
    seedPlaceholder: true,
    migrationBlocked: false,
    validEmpty: false,
  };
}

function loadFromLegacy(ctx, readErrors, writeOk, v2Raw) {
  const legacyBefore = readLegacyKeysOnly(ctx.ls, readErrors);
  const { vStamp, vDate } = readVerMeta(ctx.ls, readErrors);
  const legacyRec = readLegacyRecords(ctx.ls, readErrors);
  const rescued = legacyRec.records;
  const wholeJsonFailed = Boolean(legacyRec.quarantine?.parseError && !rescued.length);
  const merged = resolveRecordsForSeedMerge({
    rescued,
    vStamp,
    vDate,
    DATA_STAMP: ctx.DATA_STAMP,
    DATA_DATE: ctx.DATA_DATE,
    SEED: ctx.SEED,
    wholeJsonFailed,
    origin: "legacy",
  });

  const dailyRead = readLegacyDaily(ctx.ls, readErrors, ctx);
  const baselineRead = readLegacyBaseline(ctx.ls, readErrors);
  const verRead = readVerMeta(ctx.ls, readErrors);
  const legacyStates = {
    records: legacyKeyState(ctx.ls, LEGACY.records, readErrors),
    version: legacyKeyState(ctx.ls, LEGACY.dataVersion, readErrors),
    daily: legacyKeyState(ctx.ls, LEGACY.daily, readErrors),
    baseline: legacyKeyState(ctx.ls, LEGACY.baseline, readErrors),
  };
  const migBlock = legacyMigrationBlocked(legacyStates, dailyRead, baselineRead, legacyRec, verRead);

  const dailyMeta = dailyRead.dailyMeta != null ? dailyRead.dailyMeta : structuredClone(ctx.DAILY_SEED);
  const baselineCheck = validateBaselineValue(baselineRead.baseline);
  const baselineStored = baselineCheck.ok ? baselineCheck.value : null;

  const quarantine = {
    ...(legacyRec.quarantine || {}),
    legacyDailyRaw: dailyRead.raw || undefined,
    legacyBaselineRaw: baselineRead.raw || undefined,
    readErrors: readErrors.length ? readErrors.slice() : undefined,
  };
  if (!baselineCheck.ok && baselineRead.baseline != null) {
    quarantine.baselineInvalid = baselineRead.baseline;
  }
  const hasQuarantine =
    legacyRec.quarantine ||
    readErrors.length ||
    quarantine.legacyDailyRaw ||
    quarantine.legacyBaselineRaw;

  const recordsToPersist = merged.persistRecords ?? merged.records;
  let migrationPending = migBlock.blocked;
  let memMode = false;

  const needsFirstV2FromLegacy = !v2Raw && rescued.length > 0 && !wholeJsonFailed;
  const allowCommit = !migBlock.blocked && writeOk && (merged.shouldPersistMerge || needsFirstV2FromLegacy);

  if (allowCommit) {
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
  } else if ((merged.shouldPersistMerge || needsFirstV2FromLegacy) && !migBlock.blocked) {
    migrationPending = true;
    memMode = true;
  } else if (migBlock.blocked) {
    memMode = !writeOk;
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
    storageBanner: migBlock.blocked ? "migration-blocked" : buildLoadBanner({ readErrors, migrationPending, commitFailed: memMode, hasQuarantine }),
    migrationPending,
    writeOk,
    legacyKeysUntouched,
    corruptAuthority: false,
    authorityOverlayOnCommit: migBlock.blocked,
    seedPlaceholder: false,
    migrationBlocked: migBlock.blocked,
    validEmpty: false,
  };
}

export function loadAppState(ls, ctx) {
  const readErrors = [];
  const writeOk = ls.probeWrite?.() ?? ls.probe?.() ?? true;
  const fullCtx = { ...ctx, ls };

  const v2RawVal = safeGetItem(ls, APP_STATE_KEY, readErrors);
  const v2Unreadable = isUnreadable(v2RawVal);
  const v2Raw = v2Unreadable ? null : v2RawVal;

  if (v2Raw) {
    const parsed = parseSnapshot(v2Raw);
    if (parsed.ok) return loadFromValidV2(v2Raw, parsed, fullCtx, readErrors, writeOk);
    readErrors.push({ key: APP_STATE_KEY, message: parsed.reason || "corrupt-snapshot" });
    return loadFromCorruptV2(v2Raw, parsed, fullCtx, readErrors, writeOk);
  }

  if (v2Unreadable) {
    readErrors.push({ key: APP_STATE_KEY, message: "read-failed" });
    return loadAuthorityUnreadable(fullCtx, readErrors, writeOk);
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
  const dailyIssues = [];
  const safeDaily = sanitizeDailyMeta(dailyMeta, dailyIssues);
  let q = normalizeQuarantine(quarantine);
  if (dailyIssues.length) q = { ...(q || {}), dailyStructureIssues: dailyIssues };
  const bCheck = validateBaselineValue(baseline ?? null);
  if (!bCheck.ok && baseline != null) {
    return { status: "failed", reason: bCheck.reason || "baseline-invalid" };
  }
  const snapshot = buildLogicalSnapshot({
    records,
    dailyMeta: safeDaily,
    baseline: bCheck.value,
    quarantine: q,
    ...ctx,
  });
  const commitCheck = validateSnapshotForCommit(snapshot);
  if (!commitCheck.ok) return { status: "failed", reason: commitCheck.reason || "snapshot-invalid" };
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

/** 恢复性读取后合并：占位不覆盖磁盘同日期数据，仅应用真实用户意图 */
export function overlayAuthorityOnCommit(ls, ctx, memory) {
  if (!memory.authorityOverlayOnCommit && !memory.seedPlaceholder) return memory;
  const readErrors = [];
  const rawVal = safeGetItem(ls, APP_STATE_KEY, readErrors);
  if (isUnreadable(rawVal)) {
    return { ...memory, overlayReadFailed: true };
  }
  if (!rawVal) return memory;
  const parsed = parseSnapshot(rawVal);
  if (!parsed.ok) {
    return {
      ...memory,
      corruptAuthority: true,
      authorityOverlayOnCommit: false,
      seedPlaceholder: false,
      quarantine: mergeQuarantine(
        { corruptAppStateRaw: rawVal, parseReason: parsed.reason },
        memory.quarantine,
      ),
    };
  }
  const s = parsed.snapshot;
  const { records: diskRecords, quarantine: diskRowQ } = hydrateSnapshotRecords(s);
  const diskDaily = s.daily?.data ? structuredClone(s.daily.data) : null;
  const diskBaseline = s.baseline ?? null;
  const diskQuarantine = mergeQuarantine(s.quarantine || null, diskRowQ);

  const useIntent = memory.seedPlaceholder || memory.authorityOverlayOnCommit;
  const records = useIntent
    ? mergeRecordsWithIntent({
      diskRecords,
      memoryRecords: memory.records,
      SEED: ctx.SEED,
      normalizeRec: ctx.normalizeRec,
      deletedDates: memory.deletedRecordDates,
      userRecordDates: memory.userRecordDates,
    })
    : memory.records;

  const dailyMeta = diskDaily
    ? mergeDailyWithIntent({
      diskDaily,
      memoryDaily: memory.dailyMeta,
      DAILY_SEED: ctx.DAILY_SEED,
      diskSeed: s.daily?.seed || LEGACY_DAILY_SEED,
      userDailyDates: memory.userDailyDates,
    })
    : memory.dailyMeta;

  let baseline = memory.baseline;
  if (memory.baselineIntent === "cleared") baseline = null;
  else if (memory.baselineIntent === "inherit" && useIntent) baseline = diskBaseline;
  else if (memory.baseline == null && useIntent) baseline = diskBaseline;

  const quarantine = mergeQuarantine(diskQuarantine, memory.quarantine);

  return {
    ...memory,
    records,
    dailyMeta,
    baseline,
    quarantine,
    authorityOverlayOnCommit: false,
    seedPlaceholder: false,
    overlayReadFailed: false,
  };
}

export function logicalSnapshotFromStorage(ls, ctx) {
  const readErrors = [];
  const rawVal = safeGetItem(ls, APP_STATE_KEY, readErrors);
  if (isUnreadable(rawVal)) return { ok: false, raw: null, logical: null, readErrors };
  const parsed = parseSnapshot(rawVal);
  if (!parsed.ok) return { ok: false, raw: rawVal, logical: null };
  const s = parsed.snapshot;
  const { records } = hydrateSnapshotRecords(s);
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
      unreadableKeys: (readErrors || []).map((e) => e.key).filter(Boolean),
    },
  };
}

export { LEGACY as LEGACY_STORAGE_KEYS };
