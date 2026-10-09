import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dataStamp } from "../src/shared/stamp.js";
import { lastDataDate } from "../src/shared/time.js";
import { normalizeRec } from "../src/shared/records-io.js";
import { createMemoryStorageAdapter } from "../src/shared/local-storage-adapter.js";
import { mergeImportedDaily } from "../src/shared/payload-validation.js";
import { stabilizeDailyMeta } from "../src/shared/entity-id.js";
import {
  loadAppState, commitAppState, buildLogicalSnapshot, overlayAuthorityOnCommit,
  APP_STATE_KEY, LEGACY_STORAGE_KEYS as K, evaluateCommitGate,
} from "../src/shared/app-storage.js";

const ds = JSON.parse(readFileSync(resolve(import.meta.dirname, "../data/训练数据集.json"), "utf8"));
const ctx = { SEED: ds.data, DAILY_SEED: ds._daily, DATA_STAMP: dataStamp(ds), DATA_DATE: lastDataDate(ds.data), normalizeRec };
const d = Object.keys(ds._daily)[0], pending = { d: "2099-06-02", el: 78 };
const baseline = { start: "2026-08-08", end: "2026-08-23", n: 14, mean: 4.55, sd: 0.1 };
function snapshot() {
  return buildLogicalSnapshot({ ...ctx, records: structuredClone(ds.data), dailyMeta: structuredClone(ds._daily), baseline, quarantine: null });
}
function intent(dailyPatch = {}) {
  return { records: [...ds.data, pending], dailyMeta: mergeImportedDaily(ds._daily, dailyPatch),
    baseline: null, quarantine: null, seedPlaceholder: true, authorityOverlayOnCommit: true,
    userRecordDates: [pending.d], userDailyDates: Object.keys(dailyPatch), dailyPatch,
    deletedRecordDates: [], baselineIntent: "inherit" };
}

describe("B1-R4 recovery intent and seed migration", () => {
  it("partial daily imports preserve unread local fields even across accumulated failed attempts", () => {
    const s = snapshot();s.daily.data[d] = { sessions: [{ kind: "run", km: 7.77 }], note: "LOCAL" };
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(s) });
    const patch = mergeImportedDaily({ [d]: { nutrition: { note: "FIRST" } } }, { [d]: { sleep: { score: 88 } } });
    const out = overlayAuthorityOnCommit(ls, ctx, intent(patch));
    expect(out.dailyMeta[d].note).toBe("LOCAL");
    expect(out.dailyMeta[d].nutrition).toEqual({ note: "FIRST" });
    expect(out.dailyMeta[d].sleep).toEqual({ score: 88 });
    expect(out.dailyMeta[d].sessions.map(({ kind, km }) => ({ kind, km }))).toEqual([{ kind: "run", km: 7.77 }]);
    expect(out.dailyMeta[d].sessions[0].eid).toMatch(/^s_[0-9a-f]{16}$/);
  });
  it("new seed is applied before explicit changes and is not skipped by a recovered read", () => {
    const s = snapshot();
    const identified = stabilizeDailyMeta(s.daily.data).dailyMeta;
    s.daily.data = structuredClone(identified);
    s.daily.seed = structuredClone(identified);
    s.daily.data[d].sessions[0].vol = 777;
    const newer = { ...ctx, SEED: [...ds.data, { d: "2026-10-07", el: 91 }], DAILY_SEED: structuredClone(identified), DATA_STAMP: "NEW", DATA_DATE: "2026-10-07" };
    newer.DAILY_SEED[d].sessions[1].vol = 6000;
    newer.DAILY_SEED[d].nutrition.protein_range = [121, 176];
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(s) });
    const m = intent();m.deletedRecordDates = [ds.data[0].d];
    const out = overlayAuthorityOnCommit(ls, newer, m);
    expect(out.records.some((r) => r.d === "2026-10-07")).toBe(true);
    expect(out.records.some((r) => r.d === ds.data[0].d)).toBe(false);
    expect(out.dailyMeta[d].sessions.map((r) => r.vol)).toEqual([777, 6000]);
    expect(out.dailyMeta[d].nutrition.protein_range).toEqual([121, 176]);
  });
});

describe("B1-R4 consume and preserve malformed storage", () => {
  const corruptions = {
    "day-null": (s) => { s.daily.data[d] = null; },
    "sessions-object": (s) => { s.daily.data[d] = { sessions: { note: "RESCUE" } }; },
    "sessions-row": (s) => { s.daily.data[d] = { sessions: ["RESCUE", { kind: "run", km: 7.77 }] }; },
    "weight-row": (s) => { s.daily.data[d] = { weight: [null, { kg: 63, period: "morning" }] }; },
    "nutrition-range": (s) => { s.daily.data[d] = { nutrition: { protein_range: "RESCUE" } }; },
  };
  for (const origin of ["v2", "legacy", "corrupt-fallback", "overlay"]) {
    it.each(Object.entries(corruptions))(`${origin}: isolates %s, retains original and survives save/reload`, (_name, change) => {
      const s = snapshot();change(s);const raw = JSON.stringify(s), legacyDaily = JSON.stringify(s.daily);
      const legacy = { [K.records]: JSON.stringify(s.records), [K.dataVersion]: JSON.stringify({ s: ctx.DATA_STAMP, d: ctx.DATA_DATE }), [K.daily]: legacyDaily, [K.baseline]: JSON.stringify(s.baseline) };
      const initial = origin === "legacy" ? legacy : origin === "corrupt-fallback" ? { ...legacy, [APP_STATE_KEY]: "{bad" } : { [APP_STATE_KEY]: raw };
      const ls = createMemoryStorageAdapter(initial);
      const loaded = origin === "overlay" ? overlayAuthorityOnCommit(ls, ctx, intent()) : loadAppState(ls, ctx);
      expect(loaded.dailyMeta[d] == null || typeof loaded.dailyMeta[d] === "object").toBe(true);
      const q = JSON.stringify(loaded.quarantine);
      expect(q).toContain(origin === "legacy" || origin === "corrupt-fallback" ? JSON.stringify(legacyDaily).slice(1, -1) : JSON.stringify(raw).slice(1, -1));
      expect(loaded.quarantine.dailyStructureIssues.length).toBeGreaterThan(0);
      if (origin !== "corrupt-fallback") {
        const r = commitAppState(ls, ctx, { records: loaded.records, dailyMeta: loaded.dailyMeta, baseline: loaded.baselineStored ?? loaded.baseline, quarantine: loaded.quarantine });
        expect(r.status).toBe("ok");
        expect(JSON.stringify(loadAppState(ls, ctx).quarantine)).toContain("dailyStructureIssues");
        expect(JSON.stringify(loadAppState(ls, ctx).quarantine)).toContain(origin === "legacy" ? "legacyDailyRaw" : "originalSnapshots");
      } else expect(ls.getItem(APP_STATE_KEY)).toBe("{bad");
    });
  }
  it("invalid dates and bad quarantine cannot crash hydration or discard good records", () => {
    const s = snapshot();s.records = [{ el: 1 }, { d: 123, el: 2 }, null, pending];s.quarantine = { recordErrors: 123, badRows: "RESCUE" };
    const raw = JSON.stringify(s), ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: raw });
    const loaded = loadAppState(ls, ctx);
    expect(loaded.records.map((r) => r.d)).toEqual([pending.d]);
    expect(loaded.quarantine.badRows.some((r) => r.raw === "RESCUE")).toBe(true);
    expect(loaded.quarantine.originalSnapshots[0].raw).toBe(raw);
  });
  it("invalid baseline remains in rescue material after an unrelated successful commit", () => {
    const s = snapshot();s.baseline.sd = "RESCUE";
    const ls = createMemoryStorageAdapter({ [APP_STATE_KEY]: JSON.stringify(s) }), loaded = loadAppState(ls, ctx);
    expect(loaded.baselineStored).toBeNull();
    expect(commitAppState(ls, ctx, { records: loaded.records, dailyMeta: loaded.dailyMeta, baseline: null, quarantine: loaded.quarantine }).status).toBe("ok");
    expect(loadAppState(ls, ctx).quarantine.baselineInvalid.sd).toBe("RESCUE");
  });
});

describe("B1-R4 durable status and version readiness", () => {
  it("nonpersistent fallback reports unavailable and never claims durable writes", () => {
    const ls = createMemoryStorageAdapter({}, {}, { persistent: false, accessError: "SecurityError" });
    const loaded = loadAppState(ls, ctx);
    expect(loaded.writeOk).toBe(false);
    expect(loaded.seedPlaceholder).toBe(true);
    expect(loaded.readErrors[0].key).toBe("localStorage");
    expect(evaluateCommitGate(ls, ctx, { corruptAuthority: false }).ok).toBe(false);
    expect(commitAppState(ls, ctx, { records: [pending], dailyMeta: {}, baseline: null }).status).toBe("failed");
    expect(ls.getItem(APP_STATE_KEY)).toBeNull();
  });
  it.each(["{truncated", "[]", '{"s":123,"d":"2026-10-06"}', '{"d":"2026-02-30"}'])("blocks present malformed metadata %s before seed overwrite", (version) => {
    const rec = { ...ds.data[0], el: 99 };
    const ls = createMemoryStorageAdapter({ [K.records]: JSON.stringify([rec]), [K.dataVersion]: version });
    const loaded = loadAppState(ls, ctx);
    expect(loaded.records[0].el).toBe(99);
    expect(loaded.quarantine.legacyVersionRaw).toBe(version);
    expect(ls.getItem(APP_STATE_KEY)).toBeNull();
    expect(evaluateCommitGate(ls, ctx, { corruptAuthority: false }).ok).toBe(false);
  });
  it("read failure preserves rescued records and recovered metadata allows migration", () => {
    const faults = { getItem: { [K.dataVersion]: new Error("denied") } };
    const ls = createMemoryStorageAdapter({ [K.records]: JSON.stringify([{ ...ds.data[0], el: 99 }]), [K.dataVersion]: JSON.stringify({ s: ctx.DATA_STAMP, d: ctx.DATA_DATE }) }, faults);
    expect(loadAppState(ls, ctx).records[0].el).toBe(99);
    expect(ls.getItem(APP_STATE_KEY)).toBeNull();
    delete faults.getItem[K.dataVersion];
    expect(loadAppState(ls, ctx).records[0].el).toBe(99);
    expect(JSON.parse(ls.getItem(APP_STATE_KEY)).records[0].el).toBe(99);
  });
});
