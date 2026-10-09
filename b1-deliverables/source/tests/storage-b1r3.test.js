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
  APP_STATE_KEY,
  LEGACY_STORAGE_KEYS,
  overlayAuthorityOnCommit,
  evaluateCommitGate,
} from "../src/shared/app-storage.js";
import { mergeRecordsWithIntent } from "../src/shared/storage-intent.js";

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

describe("B1-R3 regression", () => {
  it("A01: overlay keeps disk same-date edits when memory is seed placeholder", () => {
    const d = SEED[0].d;
    const dd = Object.keys(DAILY_SEED)[0];
    const diskRec = normalizeRec({ ...SEED[0], el: 99, note: "DISK" });
    const diskDaily = {
      ...structuredClone(DAILY_SEED),
      [dd]: { sessions: [{ kind: "run", km: 7.77 }] },
    };
    const snap = buildLogicalSnapshot({
      records: SEED.slice(0, 5).map(normalizeRec).concat([diskRec]),
      dailyMeta: diskDaily,
      baseline: null,
      quarantine: null,
      ...ctx(),
    });
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(snap) });
    const memoryRecs = SEED.map(normalizeRec);
    const bundle = overlayAuthorityOnCommit(ls, ctx(), {
      records: memoryRecs,
      dailyMeta: structuredClone(DAILY_SEED),
      baseline: null,
      quarantine: null,
      seedPlaceholder: true,
      deletedRecordDates: [],
      userRecordDates: ["2099-06-02"],
      userDailyDates: [],
      baselineIntent: "inherit",
      authorityOverlayOnCommit: true,
    });
    expect(bundle.records.find((r) => r.d === d)?.el).toBe(99);
    expect(bundle.dailyMeta[dd]?.sessions?.[0]?.km).toBe(7.77);
  });

  it("A02: legacy daily blocked then commit gate rejects before v2 exists", () => {
    const ls = createMemoryStorageAdapter({
      [LEGACY_STORAGE_KEYS.records]: JSON.stringify([{ d: "2099-06-01", el: 1 }]),
      [LEGACY_STORAGE_KEYS.daily]: "{}",
    }, { getItem: { [LEGACY_STORAGE_KEYS.daily]: new Error("denied") } });
    loadAppState(ls, ctx());
    expect(ls.getItem(APP_STATE_KEY)).toBeNull();
    const gate = evaluateCommitGate(ls, ctx(), { corruptAuthority: false });
    expect(gate.ok).toBe(false);
  });

  it("A03: late corrupt on overlay sets corruptAuthority", () => {
    const raw = JSON.stringify({ format: 2, dataStamp: DATA_STAMP, dataDate: DATA_DATE, records: { bad: true } });
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: raw });
    const bundle = overlayAuthorityOnCommit(ls, ctx(), {
      records: SEED.map(normalizeRec),
      dailyMeta: DAILY_SEED,
      baseline: null,
      quarantine: null,
      seedPlaceholder: true,
      authorityOverlayOnCommit: true,
      deletedRecordDates: [],
      userRecordDates: ["2099-01-01"],
      userDailyDates: [],
      baselineIntent: "inherit",
    });
    expect(bundle.corruptAuthority).toBe(true);
    expect(ls.getItem(APP_STATE_KEY)).toBe(raw);
  });

  it("A05: legacy daily parse failure keeps raw for export quarantine path", () => {
    const bad = "{truncated";
    const ls = createMemoryStorageAdapter({
      [LEGACY_STORAGE_KEYS.records]: JSON.stringify([]),
      [LEGACY_STORAGE_KEYS.daily]: bad,
    });
    const loaded = loadAppState(ls, ctx());
    expect(loaded.quarantine?.legacyDailyRaw).toBe(bad);
    expect(ls.getItem(APP_STATE_KEY)).toBeNull();
  });

  it("intent merge respects explicit delete", () => {
    const d = "2099-06-01";
    const merged = mergeRecordsWithIntent({
      diskRecords: [normalizeRec({ d, el: 50 })],
      memoryRecords: [],
      SEED,
      normalizeRec,
      deletedDates: [d],
      userRecordDates: [d],
    });
    expect(merged.some((r) => r.d === d)).toBe(false);
  });

  it("A04: invalid baseline rejected on commit", () => {
    const ls = createMemoryStorageAdapter();
    const r = commitAppState(ls, ctx(), {
      records: [],
      dailyMeta: {},
      baseline: [1, 2, 3],
      quarantine: null,
    });
    expect(r.status).toBe("failed");
  });
});
