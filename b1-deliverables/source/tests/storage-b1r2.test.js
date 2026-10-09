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
  buildLogicalSnapshot,
  parseSnapshot,
  APP_STATE_KEY,
  LEGACY_STORAGE_KEYS,
  overlayAuthorityOnCommit,
} from "../src/shared/app-storage.js";

const DATASET = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../data/训练数据集.json"), "utf8"),
);
const SEED = DATASET.data || [];
const DAILY_SEED = DATASET._daily || {};
const DATA_STAMP = dataStamp(DATASET);
const DATA_DATE = lastDataDate(SEED) || "—";
const UNIQUE = { d: "2099-06-01", el: 88, type: "测试" };

function ctx() {
  return { SEED, DAILY_SEED, DATA_STAMP, DATA_DATE, normalizeRec };
}

describe("B1-R2 regression", () => {
  it("A01: empty valid v2 stays empty on load", () => {
    const snap = buildLogicalSnapshot({
      records: [],
      dailyMeta: {},
      baseline: null,
      quarantine: null,
      ...ctx(),
    });
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(snap) });
    const loaded = loadAppState(ls, ctx());
    expect(loaded.records.length).toBe(0);
    expect(loaded.validEmpty).toBe(true);
  });

  it("A01: commit uses memory records without re-adding deleted dates", () => {
    const snap = buildLogicalSnapshot({
      records: [...SEED.slice(0, 2).map(normalizeRec), normalizeRec(UNIQUE)],
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
      ...ctx(),
    });
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(snap) });
    const afterDelete = SEED.slice(0, 2).map(normalizeRec);
    const r = commitAppState(ls, ctx(), {
      records: afterDelete,
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
    });
    expect(r.status).toBe("ok");
    const parsed = JSON.parse(ls.getItem(APP_STATE_KEY));
    expect(parsed.records.some((x) => x.d === UNIQUE.d)).toBe(false);
  });

  it("A02: seed merge keeps local daily sessions", () => {
    const localDaily = {
      "2099-06-01": { sessions: [{ kind: "run", km: 7.77, note: "LOCAL-DAILY-ONLY" }] },
    };
    const snap = buildLogicalSnapshot({
      records: [...SEED.map(normalizeRec), normalizeRec(UNIQUE)],
      dailyMeta: localDaily,
      baseline: null,
      quarantine: null,
      dataStamp: "02808fbb",
      dataDate: "2026-10-06",
      DAILY_SEED,
      SEED,
      normalizeRec,
    });
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(snap) });
    const newerCtx = {
      ...ctx(),
      SEED: [...SEED, normalizeRec({ d: "2026-10-07", el: 91 })],
      DATA_DATE: "2026-10-07",
    };
    const loaded = loadAppState(ls, newerCtx);
    expect(loaded.dailyMeta["2099-06-01"]?.sessions?.[0]?.km).toBe(7.77);
    expect(loaded.records.some((r) => r.d === "2026-10-07")).toBe(true);
  });

  it("A03: legacy daily unreadable blocks v2 migration write", () => {
    const ls = createMemoryStorageAdapter({
      [LEGACY_STORAGE_KEYS.records]: JSON.stringify([UNIQUE]),
      [LEGACY_STORAGE_KEYS.daily]: JSON.stringify({ data: { "2099-06-01": { sessions: [{ kind: "run", km: 1 }] } } }),
    }, {
      getItem: { [LEGACY_STORAGE_KEYS.daily]: new Error("denied") },
    });
    loadAppState(ls, ctx());
    expect(ls.getItem(APP_STATE_KEY)).toBeNull();
  });

  it("A03: legacy daily readable after block retains local-only day in dailyMeta", () => {
    const dailyRaw = JSON.stringify({
      stamp: DATA_STAMP,
      date: UNIQUE.d,
      seed: DAILY_SEED,
      data: {
        ...DAILY_SEED,
        [UNIQUE.d]: { sessions: [{ kind: "run", km: 7.77 }] },
      },
    });
    const ls = createMemoryStorageAdapter({
      [LEGACY_STORAGE_KEYS.records]: JSON.stringify([...SEED.map(normalizeRec), normalizeRec(UNIQUE)]),
      [LEGACY_STORAGE_KEYS.dataVersion]: JSON.stringify({ s: DATA_STAMP, d: DATA_DATE }),
      [LEGACY_STORAGE_KEYS.daily]: dailyRaw,
    });
    const loaded = loadAppState(ls, ctx());
    expect(loaded.dailyMeta[UNIQUE.d]?.sessions?.[0]?.km).toBe(7.77);
    const v2 = JSON.parse(ls.getItem(APP_STATE_KEY));
    expect(v2.daily.data[UNIQUE.d]?.sessions?.[0]?.km).toBe(7.77);
  });

  it("A03: overlay restores disk daily on commit after authority unreadable", () => {
    const diskDaily = { "2099-06-01": { sessions: [{ kind: "run", km: 9 }] } };
    const snap = buildLogicalSnapshot({
      records: [normalizeRec(UNIQUE)],
      dailyMeta: diskDaily,
      baseline: { start: "2026-01-01", end: "2026-01-02", mean: 1, sd: 0.1, n: 2 },
      quarantine: null,
      ...ctx(),
    });
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(snap) });
    const bundle = overlayAuthorityOnCommit(ls, ctx(), {
      records: [normalizeRec(UNIQUE), normalizeRec({ d: "2099-06-02", el: 80 })],
      dailyMeta: structuredClone(DAILY_SEED),
      baseline: null,
      quarantine: null,
      authorityOverlayOnCommit: true,
      seedPlaceholder: true,
      deletedRecordDates: [],
      userRecordDates: ["2099-06-02"],
      userDailyDates: [],
      baselineIntent: "inherit",
    });
    expect(bundle.dailyMeta["2099-06-01"]?.sessions?.[0]?.km).toBe(9);
    expect(bundle.baseline?.n).toBe(2);
    expect(bundle.records.some((r) => r.d === UNIQUE.d)).toBe(true);
    expect(bundle.records.some((r) => r.d === "2099-06-02")).toBe(true);
  });

  it("A04: invalid records shape treated as corrupt (raw preserved)", () => {
    const raw = JSON.stringify({
      format: 2,
      dataStamp: DATA_STAMP,
      dataDate: DATA_DATE,
      records: { "2099-06-01": UNIQUE },
      daily: { data: {}, seed: DAILY_SEED, stamp: DATA_STAMP, date: DATA_DATE },
      baseline: null,
    });
    expect(parseSnapshot(raw).ok).toBe(false);
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: raw });
    loadAppState(ls, ctx());
    expect(ls.getItem(APP_STATE_KEY)).toBe(raw);
  });
});
