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

const UNIQUE = {
  d: "2099-01-01",
  el: 88,
  type: "测试",
};

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

describe("B1 fixed storage (R01/R04/R17)", () => {
  it("R01: rescues unique row, preserves legacy raw, writes v2 without seed-only overwrite", () => {
    const legacyRaw = JSON.stringify([UNIQUE, null]);
    const ls = createMemoryStorageAdapter({
      [LS_KEY]: legacyRaw,
      [LS_VER]: JSON.stringify({ s: DATA_STAMP, d: DATA_DATE }),
    });
    const loaded = loadAppState(ls, ctx());
    expect(loaded.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    expect(ls.getItem(LS_KEY)).toBe(legacyRaw);
    const snap = logicalSnapshotFromStorage(ls, ctx());
    expect(snap.ok).toBe(true);
    expect(snap.logical.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    expect(snap.logical.quarantine?.legacyRecordsRaw).toBe(legacyRaw);
  });

  it("R04: single-key commit — setItem failure leaves no v2 snapshot", () => {
    const ls = createMemoryStorageAdapter({}, {
      setItem: { [APP_STATE_KEY]: new Error("quota") },
    });
    const r = commitAppState(ls, ctx(), {
      records: [normalizeRec(UNIQUE)],
      dailyMeta: { "2099-01-01": { note: "x" } },
      baseline: null,
      quarantine: null,
    });
    expect(r.status).toBe("failed");
    expect(ls.getItem(APP_STATE_KEY)).toBeNull();
  });

  it("R17: version key getItem throws but init completes with readable records", () => {
    const ls = createMemoryStorageAdapter({
      [LS_KEY]: JSON.stringify([UNIQUE]),
    }, {
      getItem: { [LS_VER]: new Error("SecurityError") },
    });
    const loaded = loadAppState(ls, ctx());
    expect(loaded.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    expect(loaded.readErrors.some((e) => e.key === LEGACY_STORAGE_KEYS.dataVersion)).toBe(true);
  });

  it("refresh simulation: v2 round-trip matches logical snapshot after save", () => {
    const ls = createMemoryStorageAdapter();
    const commit = commitAppState(ls, ctx(), {
      records: [...SEED.slice(0, 2).map(normalizeRec), normalizeRec(UNIQUE)],
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
    });
    expect(commit.status).toBe("ok");
    const reloaded = loadAppState(ls, ctx());
    expect(reloaded.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    const snap = logicalSnapshotFromStorage(ls, ctx());
    expect(snap.logical.records.some((r) => r.d === UNIQUE.d)).toBe(true);
  });
});
