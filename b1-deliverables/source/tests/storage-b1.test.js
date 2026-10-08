import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dataStamp } from "../src/shared/stamp.js";
import { lastDataDate } from "../src/shared/time.js";
import { normalizeRec } from "../src/shared/records-io.js";
import { createMemoryStorageAdapter } from "../src/shared/local-storage-adapter.js";
import {
  loadAppState,
  commitAppState,
  logicalSnapshotFromStorage,
  APP_STATE_KEY,
  LEGACY_STORAGE_KEYS,
  buildLogicalSnapshot,
} from "../src/shared/app-storage.js";
import {
  legacyLoadRecords,
  legacySaveAll,
  LS_KEY,
  LS_VER,
  LS_DAILY,
} from "./helpers/b0r1-legacy-storage.js";

const DATASET = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../data/训练数据集.json"), "utf8"),
);
const SEED = DATASET.data || [];
const DAILY_SEED = DATASET._daily || {};
const DATA_STAMP = dataStamp(DATASET);
const DATA_DATE = lastDataDate(SEED) || "—";

function ctx() {
  return { SEED, DAILY_SEED, DATA_STAMP, DATA_DATE, normalizeRec };
}

const UNIQUE = { d: "2099-01-01", el: 88, type: "测试" };

describe("B0-R1 baseline failures (R01/R04/R17)", () => {
  it("R01: legacy drops rescued unique row when cache contains null", () => {
    const ls = createMemoryStorageAdapter({
      [LS_KEY]: JSON.stringify([UNIQUE, null]),
      [LS_VER]: JSON.stringify({ s: DATA_STAMP, d: DATA_DATE }),
    });
    const beforeRaw = ls.getItem(LS_KEY);
    const { recs, wrote } = legacyLoadRecords(ls, { SEED, DATA_STAMP, DATA_DATE });
    const afterRaw = ls.getItem(LS_KEY);
    expect(recs.some((r) => r.d === UNIQUE.d)).toBe(false);
    expect(wrote).toBe(true);
    expect(JSON.parse(afterRaw).some((r) => r?.d === UNIQUE.d)).toBe(false);
    expect(beforeRaw).not.toBe(afterRaw);
  });

  it("R04: legacy multi-key save leaves half snapshot when daily write fails", () => {
    const ls = createMemoryStorageAdapter({}, {
      setItem: { [LS_DAILY]: new Error("quota") },
    });
    const recs = SEED.slice(0, 3).map(normalizeRec);
    expect(() => legacySaveAll(ls, {
      recs,
      dailyPayload: { stamp: DATA_STAMP, data: {} },
      baseline: { start: "2026-01-01", end: "2026-01-02", mean: 1, sd: 0.1, n: 2 },
      DATA_STAMP,
      DATA_DATE,
    })).toThrow();
    expect(ls.getItem(LS_KEY)).toBeTruthy();
    expect(ls.getItem(LS_VER)).toBeTruthy();
    expect(ls.getItem(LS_DAILY)).toBeNull();
  });

  it("R17: legacy load throws when version getItem fails", () => {
    const ls = createMemoryStorageAdapter({
      [LS_KEY]: JSON.stringify([UNIQUE]),
    }, {
      getItem: { [LS_VER]: new Error("SecurityError") },
    });
    expect(() => legacyLoadRecords(ls, { SEED, DATA_STAMP, DATA_DATE })).toThrow();
  });
});

describe("B1-R1 fixed storage", () => {
  it("R01: rescues unique row, preserves legacy raw, writes v2", () => {
    const legacyRaw = JSON.stringify([UNIQUE, null]);
    const ls = createMemoryStorageAdapter({
      [LS_KEY]: legacyRaw,
      [LS_VER]: JSON.stringify({ s: DATA_STAMP, d: DATA_DATE }),
    });
    const loaded = loadAppState(ls, ctx());
    expect(loaded.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    expect(ls.getItem(LS_KEY)).toBe(legacyRaw);
    const snap = logicalSnapshotFromStorage(ls, ctx());
    expect(snap.logical.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    expect(snap.logical.quarantine?.legacyRecordsRaw).toBe(legacyRaw);
  });

  it("B1-A01: getItem fault on version key does not throw; snapshot matches browser semantics", () => {
    const ls = createMemoryStorageAdapter({
      [LS_KEY]: JSON.stringify([UNIQUE]),
      [LS_VER]: "x",
    }, {
      getItem: { [LS_VER]: new Error("SecurityError") },
    });
    expect(() => ls.snapshot()).not.toThrow();
    const loaded = loadAppState(ls, ctx());
    expect(loaded.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    expect(loaded.readErrors.some((e) => e.key === LEGACY_STORAGE_KEYS.dataVersion)).toBe(true);
  });

  it("B1-A02: corrupt v2 raw is not overwritten by seed migration", () => {
    const good = buildLogicalSnapshot({
      records: [...SEED.slice(0, 2).map(normalizeRec), normalizeRec(UNIQUE)],
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
      ...ctx(),
    });
    const corrupt = JSON.stringify(good).slice(0, -1);
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: corrupt });
    loadAppState(ls, ctx());
    expect(ls.getItem(APP_STATE_KEY)).toBe(corrupt);
    const loaded = loadAppState(ls, ctx());
    expect(loaded.corruptAuthority).toBe(true);
    expect(loaded.quarantine?.corruptAppStateRaw).toBe(corrupt);
  });

  it("B1-A02: v2 records with null row do not crash load", () => {
    const snap = buildLogicalSnapshot({
      records: [normalizeRec(UNIQUE), null],
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
      ...ctx(),
    });
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(snap) });
    expect(() => loadAppState(ls, ctx())).not.toThrow();
    const loaded = loadAppState(ls, ctx());
    expect(loaded.records.some((r) => r.d === UNIQUE.d)).toBe(true);
  });

  it("B1-A02: malformed legacy JSON keeps consistent row count after reload", () => {
    const ls = createMemoryStorageAdapter({ [LS_KEY]: "{bad legacy raw" });
    const first = loadAppState(ls, ctx());
    expect(first.records.length).toBe(SEED.length);
    const second = loadAppState(ls, ctx());
    expect(second.records.length).toBe(first.records.length);
    expect(ls.getItem(APP_STATE_KEY)).toBeNull();
  });

  it("B1-A03: probe write failure still reads existing v2", () => {
    const snap = buildLogicalSnapshot({
      records: [...SEED.map(normalizeRec), normalizeRec(UNIQUE)],
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
      ...ctx(),
    });
    const raw = JSON.stringify(snap);
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: raw });
    ls.probeWrite = () => false;
    ls.probe = () => false;
    const loaded = loadAppState(ls, ctx());
    expect(loaded.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    expect(loaded.writeOk).toBe(false);
  });

  it("B1-A04: newer embedded seed merges into existing v2 on load", () => {
    const oldDate = DATA_DATE;
    const snap = buildLogicalSnapshot({
      records: [...SEED.map(normalizeRec), normalizeRec(UNIQUE)],
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
      dataStamp: DATA_STAMP,
      dataDate: oldDate,
      DAILY_SEED,
      SEED,
      normalizeRec,
    });
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(snap) });
    const newerCtx = {
      ...ctx(),
      SEED: [...SEED, normalizeRec({ d: "2099-12-31", el: 99 })],
      DATA_DATE: "2099-12-31",
    };
    const loaded = loadAppState(ls, newerCtx);
    expect(loaded.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    expect(loaded.records.some((r) => r.d === "2099-12-31")).toBe(true);
  });

  it("R04: single-key commit failure leaves prior v2", () => {
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(buildLogicalSnapshot({
      records: SEED.slice(0, 1).map(normalizeRec),
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
      ...ctx(),
    })) }, {
      setItem: { [APP_STATE_KEY]: new Error("quota") },
    });
    const before = ls.getItem(APP_STATE_KEY);
    const r = commitAppState(ls, ctx(), {
      records: [normalizeRec(UNIQUE)],
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
    });
    expect(r.status).toBe("failed");
    expect(ls.getItem(APP_STATE_KEY)).toBe(before);
  });
});
