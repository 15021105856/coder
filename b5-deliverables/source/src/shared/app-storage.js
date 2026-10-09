/**
 * 应用存储契约（B1-R3）：单键逻辑快照 + 占位/意图区分 + 共用提交门禁。
 */
import LEGACY_DAILY_SEED from "../../data/legacy-daily-seed.json";
import { mergeRecordLists } from "./records-io.js";
import { mergeDailyStore } from "./daily-merge.js";
import { parseRecordsRaw, parseRecordsArray } from "./record-parse.js";
import { STORAGE_KEYS } from "./release.js";
import { safeGetItem, safeListKeys } from "./local-storage-adapter.js";
import { isDate } from "./schema.js";
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
import { stabilizeDailyMeta } from "./entity-id.js";

export const APP_STATE_KEY = STORAGE_KEYS.appState;
// The prior key is an import source only. Older HTML cannot address the new authority.
export function readAuthority(ls) {
  const current = ls.getItem(APP_STATE_KEY);
  return current !== null ? current : ls.getItem(STORAGE_KEYS.previousAppState);
}
function safeReadAuthority(ls, errors) {
  const current = safeGetItem(ls, APP_STATE_KEY, errors);
  return current !== null ? current : safeGetItem(ls, STORAGE_KEYS.previousAppState, errors);
}
export const SNAPSHOT_FORMAT = 3;

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
    if (rawVer.trim()[0] === "{") {
      const o = JSON.parse(rawVer);
      if (!plainObject(o) || (o.s != null && typeof o.s !== "string") || (o.d != null && !isDate(o.d))
        || (!o.s && !o.d)) throw new Error("invalid-version-metadata");
      vStamp = o.s || null;
      vDate = o.d || null;
    } else {
      if (!isDate(rawVer.trim())) throw new Error("invalid-version-date");
      vDate = rawVer.trim();
    }
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
      const issues = [];
      const data = sanitizeDailyMeta(c.data, issues, LEGACY.daily + ".data");
      const base = sanitizeDailyMeta(plainObject(c.seed) ? c.seed
        : (c.stamp === ctx.DATA_STAMP ? ctx.DAILY_SEED : LEGACY_DAILY_SEED), issues, LEGACY.daily + ".seed");
      return { dailyMeta: mergeDailyStore(ctx.DAILY_SEED, data, base), raw, issues, unreadable: false };
    }
    return { dailyMeta: {}, raw, issues: [{ source: LEGACY.daily, path: "daily", kind: "daily-envelope", raw: c }], unreadable: false };
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

export function isOlderSeed(snapshot, ctx) {
  return snapshot.dataDate > ctx.DATA_DATE ||
    (snapshot.dataStamp !== ctx.DATA_STAMP && Array.isArray(snapshot.seedHistory) && snapshot.seedHistory.includes(ctx.DATA_STAMP));
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
    if (!o || ![2, SNAPSHOT_FORMAT].includes(o.format)) return { ok: false, reason: "format", raw: jsonText };
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
  const normalizedQ = normalizeQuarantine(snapshot.quarantine);
  const quarantine = errors.length
    ? {
        ...(normalizedQ || {}),
        recordErrors: [...(normalizedQ?.recordErrors || []), ...errors],
        badRows: [...(normalizedQ?.badRows || []), ...badRows],
      }
    : normalizedQ;
  return { records, quarantine, errors };
}

/** 正常读取与故障恢复共用同一条消费/种子迁移路径；本函数不写存储。 */
export function prepareV2State(raw, snapshot, ctx) {
  const { records: rescued, quarantine: rowQ, errors } = hydrateSnapshotRecords(snapshot);
  const merged = isOlderSeed(snapshot, ctx)
    ? { records: rescued, persistRecords: rescued, staleVer: snapshot.dataDate, shouldPersistMerge: false, seedMergeApplied: false }
    : resolveRecordsForSeedMerge({
    rescued, vStamp: snapshot.dataStamp, vDate: snapshot.dataDate,
    ...ctx, wholeJsonFailed: false, origin: "v2",
  });
  const issues = [];
  let dailyMeta = sanitizeDailyMeta(snapshot.daily?.data ?? ctx.DAILY_SEED, issues, APP_STATE_KEY + ".daily.data");
  const oldSeed = sanitizeDailyMeta(snapshot.daily?.seed ?? LEGACY_DAILY_SEED, issues, APP_STATE_KEY + ".daily.seed");
  if (merged.seedMergeApplied) dailyMeta = mergeDailyStore(ctx.DAILY_SEED, dailyMeta, oldSeed);
  const identity = stabilizeDailyMeta(dailyMeta);
  const b = validateBaselineValue(snapshot.baseline ?? null);
  let quarantine = rowQ;
  if (issues.length) quarantine = mergeQuarantine(quarantine, { dailyStructureIssues: issues });
  if (!b.ok) quarantine = mergeQuarantine(quarantine, { baselineInvalid: snapshot.baseline });
  if (identity.blocked) {
    quarantine = mergeQuarantine(quarantine, { identityIssues: identity.issues, originalSnapshots: [{ source: APP_STATE_KEY, raw }] });
  } else if (identity.added) {
    dailyMeta = identity.dailyMeta;
    merged.shouldPersistMerge = true;
  } else {
    dailyMeta = identity.dailyMeta;
  }
  if (errors.length || issues.length || !b.ok || identity.blocked || JSON.stringify(snapshot.quarantine ?? null) !== JSON.stringify(normalizeQuarantine(snapshot.quarantine))) {
    quarantine = mergeQuarantine(quarantine, { originalSnapshots: [{ source: APP_STATE_KEY, raw }] });
  }
  return {
    records: merged.records,
    dailyMeta,
    baseline: b.ok ? b.value : null,
    quarantine,
    merged,
    identityBlocked: identity.blocked,
  };
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
  if (verRead.parseFailed) return { blocked: true, reason: "version-parse-failed" };
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
  const rawV2 = safeReadAuthority(ls, readErrors);
  if (isUnreadable(rawV2)) return { ...memory, commitReadFailed: true };
  if (rawV2) return memory;
  const legacyRec = readLegacyRecords(ls, readErrors);
  const dailyRead = readLegacyDaily(ls, readErrors, ctx);
  const baselineRead = readLegacyBaseline(ls, readErrors);
  const verRead = readVerMeta(ls, readErrors);
  if (legacyRec.unreadable || dailyRead.unreadable || dailyRead.parseFailed || baselineRead.unreadable
    || baselineRead.parseFailed || verRead.unreadable || verRead.parseFailed) {
    return { ...memory, commitReadFailed: true, readErrors };
  }
  const resolved = resolveRecordsForSeedMerge({ rescued: legacyRec.records, vStamp: verRead.vStamp,
    vDate: verRead.vDate, ...ctx, wholeJsonFailed: !!legacyRec.quarantine?.parseError, origin: "legacy" });
  let records = memory.records;
  if (!legacyRec.unreadable && legacyRec.records.length) {
    records = mergeRecordsWithIntent({
      diskRecords: resolved.records,
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
      dailyPatch: memory.dailyPatch,
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
      dailyStructureIssues: dailyRead.issues,
    },
    memory.quarantine,
  );
  return { ...memory, records, dailyMeta, baseline, quarantine };
}

export function evaluateCommitGate(ls, ctx, { corruptAuthority }) {
  if (ls.persistent === false) return { ok: false, reason: "storage-unavailable" };
  if (corruptAuthority) return { ok: false, reason: "corrupt-authority" };
  const readErrors = [];
  const rawV2 = safeReadAuthority(ls, readErrors);
  if (isUnreadable(rawV2)) return { ok: false, reason: "authority-unreadable" };
  if (rawV2) {
    const parsed = parseSnapshot(rawV2);
    if (!parsed.ok) return { ok: false, reason: "corrupt-authority" };
    return { ok: true };
  }
  return assessLegacyCommitReadiness(ls, ctx);
}

function loadFromValidV2(v2Raw, parsed, ctx, readErrors, writeOk) {
  const prepared = prepareV2State(v2Raw, parsed.snapshot, ctx);
  const { merged, dailyMeta, baseline: baselineStored, quarantine } = prepared;
  let migrationPending = false;
  let memMode = !writeOk;

  if ((merged.shouldPersistMerge || parsed.snapshot.format === 2) && writeOk && !prepared.identityBlocked && !isOlderSeed(parsed.snapshot, ctx)) {
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
    identityBlocked: !!prepared.identityBlocked,
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
  const verRead = readVerMeta(ctx.ls, readErrors);
  const { vStamp, vDate } = verRead;
  const rescued = legacyRec.records.length ? legacyRec.records : [];
  const wholeJsonFailed = !rescued.length;
  const merged = verRead.unreadable || verRead.parseFailed
    ? { records: rescued.length ? rescued : mergeRecordLists(ctx.SEED, null), staleVer: null }
    : resolveRecordsForSeedMerge({
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
  quarantine.legacyDailyRaw = dailyRead.raw || undefined;
  quarantine.legacyBaselineRaw = baselineRead.raw || undefined;
  quarantine.legacyVersionRaw = verRead.parseFailed ? verRead.raw : undefined;
  if (dailyRead.issues?.length) quarantine.dailyStructureIssues = dailyRead.issues;
  const baselineCheck = validateBaselineValue(baselineRead.baseline);
  if (!baselineCheck.ok) quarantine.baselineInvalid = baselineRead.baseline;

  return {
    records: merged.records,
    dailyMeta,
    baselineStored: baselineCheck.ok ? baselineCheck.value : null,
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
  const verRead = readVerMeta(ctx.ls, readErrors);
  const { vStamp, vDate } = verRead;
  const legacyRec = readLegacyRecords(ctx.ls, readErrors);
  const rescued = legacyRec.records;
  const wholeJsonFailed = Boolean(legacyRec.quarantine?.parseError && !rescued.length);
  const merged = verRead.unreadable || verRead.parseFailed
    ? { records: rescued.length ? rescued : mergeRecordLists(ctx.SEED, null), shouldPersistMerge: false, staleVer: null }
    : resolveRecordsForSeedMerge({
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
    legacyVersionRaw: verRead.parseFailed ? verRead.raw : undefined,
    dailyStructureIssues: dailyRead.issues?.length ? dailyRead.issues : undefined,
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
  if (ls.persistent === false) readErrors.push({ key: "localStorage", message: ls.accessError || "persistent-storage-unavailable" });
  const writeOk = ls.persistent !== false && (ls.probeWrite?.() ?? ls.probe?.() ?? true);
  const fullCtx = { ...ctx, ls };
  if (ls.persistent === false) return loadAuthorityUnreadable(fullCtx, readErrors, false);

  const v2RawVal = safeReadAuthority(ls, readErrors);
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
  if (ctx.readOnly) return { status: "failed", reason: "locks-unavailable" };
  if (ls.persistent === false) return { status: "failed", reason: "storage-unavailable" };
  if (!(ls.probeWrite?.() ?? ls.probe?.() ?? true)) {
    return { status: "failed", reason: "storage-probe-failed" };
  }
  const dailyIssues = [];
  const safeDaily = sanitizeDailyMeta(dailyMeta, dailyIssues);
  let q = normalizeQuarantine(quarantine);
  if (dailyIssues.length) q = mergeQuarantine(q, { dailyStructureIssues: dailyIssues });
  const parsedRecords = hydrateSnapshotRecords({ records, quarantine: q });
  q = parsedRecords.quarantine;
  const bCheck = validateBaselineValue(baseline ?? null);
  if (!bCheck.ok && baseline != null) {
    return { status: "failed", reason: bCheck.reason || "baseline-invalid" };
  }
  let snapshot = buildLogicalSnapshot({
    records: parsedRecords.records,
    dailyMeta: safeDaily,
    baseline: bCheck.value,
    quarantine: q,
    ...ctx,
  });
  const commitCheck = validateSnapshotForCommit(snapshot);
  if (!commitCheck.ok) return { status: "failed", reason: commitCheck.reason || "snapshot-invalid" };
  let payload;
  let before = null;
  try {
    before = readAuthority(ls);
    if (before && !parseSnapshot(before).ok) return { status: "failed", reason: "corrupt-authority-no-overwrite" };
    const previous = before ? parseSnapshot(before).snapshot : null;
    if (previous && isOlderSeed(previous, ctx)) return { status: "failed", reason: "older-seed" };
    const seedHistory = [...new Set([...(Array.isArray(previous?.seedHistory) ? previous.seedHistory : []),
      ...(previous?.dataStamp && previous.dataStamp !== ctx.DATA_STAMP ? [previous.dataStamp] : [])])];
    snapshot = { ...previous, ...snapshot, seedHistory,
      revision: (Number.isSafeInteger(previous?.revision) ? previous.revision : 0) + 1,
      daily: { ...previous?.daily, ...snapshot.daily } };
    payload = JSON.stringify(snapshot);
  } catch (e) {
    return { status: "failed", reason: e?.message || "pre-read-failed", snapshot };
  }
  try {
    ls.setItem(APP_STATE_KEY, payload);
  } catch (e) {
    return { status: "failed", reason: e?.message || "setItem-failed", snapshot };
  }
  try {
    const back = readAuthority(ls);
    if (back !== payload) {
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
  const rawVal = safeReadAuthority(ls, readErrors);
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
  const prepared = prepareV2State(rawVal, parsed.snapshot, ctx);
  const diskRecords = prepared.records, diskDaily = prepared.dailyMeta;
  const diskBaseline = prepared.baseline, diskQuarantine = prepared.quarantine;

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
      diskSeed: ctx.DAILY_SEED,
      userDailyDates: memory.userDailyDates,
      dailyPatch: memory.dailyPatch,
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
  const rawVal = safeReadAuthority(ls, readErrors);
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
