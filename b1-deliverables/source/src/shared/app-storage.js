/**
 * 应用存储契约（B1）：单键版本化逻辑快照 + 旧 v1 只读迁移。
 * 权威读源：physio-log.app-state.v2（存在且 JSON 可解析时）；否则从 v1 键组装并尝试写入 v2。
 */
import LEGACY_DAILY_SEED from "../../data/legacy-daily-seed.json";
import { mergeRecordLists } from "./records-io.js";
import { mergeDailyStore } from "./daily-merge.js";
import { parseRecordsRaw } from "./record-parse.js";
import { STORAGE_KEYS } from "./release.js";

export const APP_STATE_KEY = STORAGE_KEYS.appState;
export const SNAPSHOT_FORMAT = 2;

const LEGACY = {
  records: STORAGE_KEYS.records,
  dataVersion: STORAGE_KEYS.dataVersion,
  daily: STORAGE_KEYS.daily,
  baseline: STORAGE_KEYS.baseline,
};

const plainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

function readVerMeta(ls, readErrors) {
  let vStamp = null;
  let vDate = null;
  try {
    const rawVer = ls.getItem(LEGACY.dataVersion);
    if (!rawVer) return { vStamp, vDate };
    if (rawVer[0] === "{") {
      const o = JSON.parse(rawVer);
      vStamp = o.s || null;
      vDate = o.d || null;
    } else vDate = rawVer;
  } catch (e) {
    readErrors.push({ key: LEGACY.dataVersion, message: e?.message || "read-failed" });
  }
  return { vStamp, vDate };
}

function readLegacyRecords(ls, readErrors) {
  let raw = null;
  try {
    raw = ls.getItem(LEGACY.records);
  } catch (e) {
    readErrors.push({ key: LEGACY.records, message: e?.message || "read-failed" });
    return { records: [], quarantine: { legacyRecordsRaw: null, recordErrors: [{ reason: "key-unreadable" }] } };
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

function readLegacyDaily(ls, readErrors, { DAILY_SEED, DATA_STAMP }) {
  try {
    const raw = ls.getItem(LEGACY.daily);
    if (!raw) return { dailyMeta: null, raw: null };
    const c = JSON.parse(raw);
    if (c && plainObject(c.data)) {
      const base = plainObject(c.seed) ? c.seed : (c.stamp === DATA_STAMP ? DAILY_SEED : LEGACY_DAILY_SEED);
      return { dailyMeta: mergeDailyStore(DAILY_SEED, c.data, base), raw };
    }
    return { dailyMeta: null, raw };
  } catch (e) {
    readErrors.push({ key: LEGACY.daily, message: e?.message || "read-failed" });
    return { dailyMeta: null, raw: null, unreadable: true };
  }
}

function readLegacyBaseline(ls, readErrors) {
  try {
    const raw = ls.getItem(LEGACY.baseline);
    if (!raw) return { baseline: null, raw: null };
    return { baseline: JSON.parse(raw), raw };
  } catch (e) {
    readErrors.push({ key: LEGACY.baseline, message: e?.message || "read-failed" });
    return { baseline: null, raw: null, unreadable: true };
  }
}

function resolveRecordsForSeedMerge({
  rescued, vStamp, vDate, DATA_STAMP, DATA_DATE, SEED, wholeJsonFailed,
}) {
  const working = () => {
    if (!rescued.length) return mergeRecordLists(SEED, null);
    if (vStamp === DATA_STAMP || (!vStamp && vDate === DATA_DATE)) return rescued;
    if (vDate && DATA_DATE && vDate > DATA_DATE) return rescued;
    return mergeRecordLists(SEED, rescued);
  };
  if (wholeJsonFailed && !rescued.length) {
    return {
      records: working(),
      persistRecords: [],
      staleVer: null,
      shouldPersistMerge: false,
    };
  }
  if (!rescued.length) {
    return {
      records: working(),
      persistRecords: mergeRecordLists(SEED, null),
      staleVer: null,
      shouldPersistMerge: true,
    };
  }
  if (vStamp === DATA_STAMP || (!vStamp && vDate === DATA_DATE)) {
    return { records: rescued, persistRecords: rescued, staleVer: null, shouldPersistMerge: false };
  }
  if (vDate && DATA_DATE && vDate > DATA_DATE) {
    return { records: rescued, persistRecords: rescued, staleVer: vDate, shouldPersistMerge: false };
  }
  const merged = mergeRecordLists(SEED, rescued);
  return { records: merged, persistRecords: merged, staleVer: null, shouldPersistMerge: true };
}

function buildDailyEnvelope(dailyMeta, { DAILY_SEED, DATA_STAMP, DATA_DATE }) {
  const dates = Object.keys(dailyMeta || {});
  const last = dates.length ? [...dates, DATA_DATE].sort().at(-1) : DATA_DATE;
  return {
    stamp: DATA_STAMP,
    date: last,
    seed: DAILY_SEED,
    data: dailyMeta || {},
  };
}

export function buildLogicalSnapshot({ records, dailyMeta, baseline, quarantine, DATA_STAMP, DATA_DATE, DAILY_SEED }) {
  return {
    format: SNAPSHOT_FORMAT,
    dataStamp: DATA_STAMP,
    dataDate: DATA_DATE,
    records: records || [],
    daily: buildDailyEnvelope(dailyMeta, { DAILY_SEED, DATA_STAMP, DATA_DATE }),
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

/**
 * @returns {{
 *   records, dailyMeta, baselineStored, staleVer, memMode,
 *   readErrors, quarantine, storageBanner, migrationPending,
 *   legacyKeysUntouched: boolean
 * }}
 */
export function loadAppState(ls, ctx) {
  const readErrors = [];
  const probeOk = ls.probe?.() ?? true;
  if (!probeOk) {
    return {
      records: ctx.SEED.map((r) => ctx.normalizeRec(r)),
      dailyMeta: structuredClone(ctx.DAILY_SEED),
      baselineStored: null,
      staleVer: null,
      memMode: true,
      readErrors: [{ key: "*", message: "storage-probe-failed" }],
      quarantine: null,
      storageBanner: "storage-probe-failed",
      migrationPending: false,
      legacyKeysUntouched: true,
    };
  }

  let v2Raw = null;
  try {
    v2Raw = ls.getItem(APP_STATE_KEY);
  } catch (e) {
    readErrors.push({ key: APP_STATE_KEY, message: e?.message || "read-failed" });
  }

  if (v2Raw) {
    const parsed = parseSnapshot(v2Raw);
    if (parsed.ok) {
      const s = parsed.snapshot;
      return {
        records: Array.isArray(s.records) ? s.records : [],
        dailyMeta: s.daily?.data ? structuredClone(s.daily.data) : structuredClone(ctx.DAILY_SEED),
        baselineStored: s.baseline ?? null,
        staleVer: null,
        memMode: false,
        readErrors,
        quarantine: s.quarantine || null,
        storageBanner: readErrors.length ? "partial-read" : null,
        migrationPending: false,
        legacyKeysUntouched: true,
      };
    }
    readErrors.push({ key: APP_STATE_KEY, message: parsed.reason || "corrupt-snapshot" });
  }

  const { vStamp, vDate } = readVerMeta(ls, readErrors);
  const { records: rescued, quarantine: recQuarantine } = readLegacyRecords(ls, readErrors);
  const wholeJsonFailed = Boolean(recQuarantine?.parseError && !rescued.length);
  const { records, persistRecords, staleVer, shouldPersistMerge } = resolveRecordsForSeedMerge({
    rescued,
    vStamp,
    vDate,
    DATA_STAMP: ctx.DATA_STAMP,
    DATA_DATE: ctx.DATA_DATE,
    SEED: ctx.SEED,
    wholeJsonFailed,
  });

  const dailyRead = readLegacyDaily(ls, readErrors, ctx);
  const dailyMeta = dailyRead.dailyMeta != null ? dailyRead.dailyMeta : structuredClone(ctx.DAILY_SEED);
  const baselineRead = readLegacyBaseline(ls, readErrors);
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

  const recordsToPersist = persistRecords ?? records;
  const snapshot = buildLogicalSnapshot({
    records: recordsToPersist,
    dailyMeta,
    baseline: baselineStored,
    quarantine: hasQuarantine ? quarantine : null,
    ...ctx,
  });

  let migrationPending = false;
  let memMode = false;
  const legacyBefore = ls.snapshot?.() || {};

  if (shouldPersistMerge || !v2Raw) {
    const commit = commitAppState(ls, ctx, {
      records: recordsToPersist,
      dailyMeta,
      baseline: baselineStored,
      quarantine: snapshot.quarantine,
    });
    if (commit.status === "ok") {
      /* v2 成为权威；不删除 v1 键（旧 HTML / B3 边界） */
    } else {
      migrationPending = true;
      if (commit.status === "failed") memMode = true;
    }
  }

  const legacyAfter = ls.snapshot?.() || {};
  const legacyKeysUntouched = JSON.stringify(pickLegacy(legacyBefore)) === JSON.stringify(pickLegacy(legacyAfter));

  return {
    records,
    dailyMeta,
    baselineStored,
    staleVer,
    memMode,
    readErrors,
    quarantine: hasQuarantine ? quarantine : null,
    storageBanner: buildLoadBanner({ readErrors, migrationPending, commitFailed: memMode, hasQuarantine }),
    migrationPending,
    legacyKeysUntouched,
  };
}

function pickLegacy(snap) {
  const o = {};
  for (const k of Object.values(LEGACY)) if (snap[k] != null) o[k] = snap[k];
  return o;
}

function buildLoadBanner({ readErrors, migrationPending, commitFailed, hasQuarantine }) {
  if (commitFailed) return "migration-commit-failed";
  if (migrationPending) return "migration-pending";
  if (readErrors.length) return "read-errors";
  if (hasQuarantine) return "quarantine";
  return null;
}

/**
 * 保存结果：ok = 完整快照已写入且可读回一致；failed = 确认未写入；unknown = 无法确认（如写入后读失败）
 */
export function commitAppState(ls, ctx, { records, dailyMeta, baseline, quarantine }) {
  if (!ls.probe?.()) {
    return { status: "failed", reason: "storage-probe-failed" };
  }
  const snapshot = buildLogicalSnapshot({ records, dailyMeta, baseline, quarantine, ...ctx });
  const payload = JSON.stringify(snapshot);
  const before = ls.getItem(APP_STATE_KEY);
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
          /* leave unknown */
        }
      }
      return { status: "unknown", reason: "readback-mismatch", snapshot };
    }
    return { status: "ok", snapshot };
  } catch (e) {
    return { status: "unknown", reason: e?.message || "getItem-after-set-failed", snapshot };
  }
}

/** 逻辑快照与 v2 键 raw 是否一致（用于单测） */
export function logicalSnapshotFromStorage(ls, _ctx) {
  const raw = ls.getItem(APP_STATE_KEY);
  const parsed = parseSnapshot(raw);
  if (!parsed.ok) return { ok: false, raw, logical: null };
  const s = parsed.snapshot;
  return {
    ok: true,
    raw,
    logical: {
      records: s.records,
      daily: s.daily,
      baseline: s.baseline,
      quarantine: s.quarantine,
    },
  };
}

export function exportRescueBundle(ctx, { records, dailyMeta, baseline, quarantine, readErrors }) {
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
  };
}

export { LEGACY as LEGACY_STORAGE_KEYS };
