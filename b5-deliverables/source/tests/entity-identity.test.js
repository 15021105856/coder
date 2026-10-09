import { describe, it, expect } from "vitest";
import { reconcileConcurrentState } from "../src/shared/concurrent-storage.js";
import {
  stabilizeDailyMeta, deterministicEid, isValidEid, adoptImportedEntities, entityFingerprint,
} from "../src/shared/entity-id.js";
import { mergeImportedDaily } from "../src/shared/payload-validation.js";
import { mergeDailyStore } from "../src/shared/daily-merge.js";

const day = "2099-01-01";
function sessions(rows) {
  return { [day]: { sessions: rows, note: "keep-me", extra: { untouched: true } } };
}
function stamp(meta) {
  return stabilizeDailyMeta(meta).dailyMeta;
}

describe("B5 entity identity and merge", () => {
  it("same start sessions stay distinct and only the edited one changes", () => {
    const base = stamp(sessions([
      { kind: "run", start: "18:00", km: 1, name: "A" },
      { kind: "run", start: "18:00", km: 2, name: "B" },
      { kind: "run", start: "18:00", km: 3, name: "C" },
    ]));
    const local = structuredClone(base);
    local[day].sessions[1].km = 9;
    const remote = structuredClone(base);
    const merged = reconcileConcurrentState(
      { records: [], dailyMeta: base, baseline: null },
      { records: [], dailyMeta: local, baseline: null },
      { records: [], dailyMeta: remote, baseline: null },
    );
    expect(merged.ok).toBe(true);
    expect(merged.dailyMeta[day].sessions.map((s) => s.km)).toEqual([1, 9, 3]);
    expect(new Set(merged.dailyMeta[day].sessions.map((s) => s.eid)).size).toBe(3);
    expect(merged.dailyMeta[day].extra).toEqual({ untouched: true });
  });

  it("same-time weights edit one row only", () => {
    const base = stamp({ [day]: { weight: [
      { time: "09:00", kg: 60, period: "morning" },
      { time: "09:00", kg: 60.2, period: "evening" },
    ] } });
    const local = structuredClone(base);
    local[day].weight[1].kg = 70;
    const merged = reconcileConcurrentState(
      { records: [], dailyMeta: base, baseline: null },
      { records: [], dailyMeta: local, baseline: null },
      { records: [], dailyMeta: structuredClone(base), baseline: null },
    );
    expect(merged.ok).toBe(true);
    expect(merged.dailyMeta[day].weight.map((w) => w.kg)).toEqual([60, 70]);
  });

  it("reorder then edit keeps identity and order", () => {
    const base = stamp(sessions([
      { kind: "run", start: "18:00", km: 1 },
      { kind: "run", start: "18:00", km: 2 },
    ]));
    const [a, b] = base[day].sessions;
    const local = structuredClone(base);
    local[day].sessions = [structuredClone(b), { ...a, km: 8 }];
    const merged = reconcileConcurrentState(
      { records: [], dailyMeta: base, baseline: null },
      { records: [], dailyMeta: local, baseline: null },
      { records: [], dailyMeta: structuredClone(base), baseline: null },
    );
    expect(merged.ok).toBe(true);
    expect(merged.dailyMeta[day].sessions.map((s) => s.eid)).toEqual([b.eid, a.eid]);
    expect(merged.dailyMeta[day].sessions.map((s) => s.km)).toEqual([2, 8]);
  });

  it("two sides edit different entities", () => {
    const base = stamp(sessions([{ kind: "run", start: "18:00", km: 1 }, { kind: "run", start: "18:00", km: 2 }]));
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local[day].sessions[0].km = 11;
    remote[day].sessions[1].name = "remote";
    const merged = reconcileConcurrentState(
      { records: [], dailyMeta: base, baseline: null },
      { records: [], dailyMeta: local, baseline: null },
      { records: [], dailyMeta: remote, baseline: null },
    );
    expect(merged.ok).toBe(true);
    expect(merged.dailyMeta[day].sessions[0].km).toBe(11);
    expect(merged.dailyMeta[day].sessions[1].name).toBe("remote");
  });

  it("delete versus edit conflicts and does not resurrect", () => {
    const base = stamp(sessions([{ kind: "run", start: "18:00", km: 1, name: "A" }]));
    const local = structuredClone(base);
    local[day].sessions = [];
    const remote = structuredClone(base);
    remote[day].sessions[0].km = 4;
    const merged = reconcileConcurrentState(
      { records: [], dailyMeta: base, baseline: null },
      { records: [], dailyMeta: local, baseline: null },
      { records: [], dailyMeta: remote, baseline: null },
    );
    expect(merged.ok).toBe(false);
    expect(merged.conflicts.some((c) => c.includes(base[day].sessions[0].eid))).toBe(true);
  });

  it("same field conflict versus identical edit", () => {
    const base = stamp(sessions([{ kind: "run", start: "18:00", km: 1 }]));
    const left = structuredClone(base);
    const right = structuredClone(base);
    left[day].sessions[0].km = 5;
    right[day].sessions[0].km = 6;
    expect(reconcileConcurrentState(
      { records: [], dailyMeta: base, baseline: null },
      { records: [], dailyMeta: left, baseline: null },
      { records: [], dailyMeta: right, baseline: null },
    ).ok).toBe(false);
    right[day].sessions[0].km = 5;
    const same = reconcileConcurrentState(
      { records: [], dailyMeta: base, baseline: null },
      { records: [], dailyMeta: left, baseline: null },
      { records: [], dailyMeta: right, baseline: null },
    );
    expect(same.ok).toBe(true);
    expect(same.dailyMeta[day].sessions[0].km).toBe(5);
  });

  it("changing start merges with an edit to another entity", () => {
    const base = stamp(sessions([
      { kind: "run", start: "18:00", km: 1 },
      { kind: "run", start: "19:00", km: 2 },
    ]));
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local[day].sessions[0].start = "18:30";
    remote[day].sessions[1].km = 9;
    const merged = reconcileConcurrentState(
      { records: [], dailyMeta: base, baseline: null },
      { records: [], dailyMeta: local, baseline: null },
      { records: [], dailyMeta: remote, baseline: null },
    );
    expect(merged.ok).toBe(true);
    expect(merged.dailyMeta[day].sessions[0]).toMatchObject({ eid: base[day].sessions[0].eid, start: "18:30", km: 1 });
    expect(merged.dailyMeta[day].sessions[1].km).toBe(9);
  });

  it("repeat import of the same historical content reuses eid", () => {
    const local = stamp(sessions([{ kind: "run", start: "18:00", km: 1, custom: "keep" }]));
    const eid = local[day].sessions[0].eid;
    const once = mergeImportedDaily(local, { [day]: { sessions: [{ kind: "run", start: "18:00", km: 1, custom: "keep" }] } });
    const twice = mergeImportedDaily(once, { [day]: { sessions: [{ kind: "run", start: "18:00", km: 1, custom: "keep" }] } });
    expect(once[day].sessions).toHaveLength(1);
    expect(twice[day].sessions[0].eid).toBe(eid);
    expect(twice[day].sessions[0].custom).toBe("keep");
  });

  it("duplicate and illegal ids block stabilization without rewriting the source", () => {
    const dup = { [day]: { sessions: [{ eid: "s_0123456789abcdef", km: 1 }, { eid: "s_0123456789abcdef", km: 2 }] } };
    const blocked = stabilizeDailyMeta(dup);
    expect(blocked.blocked).toBe(true);
    expect(dup[day].sessions).toHaveLength(2);
    expect(isValidEid("w_0123456789abcdef", "sessions")).toBe(false);
    expect(deterministicEid("sessions", day, { km: 1 }, 0)).toMatch(/^s_[0-9a-f]{16}$/);
  });

  it("unknown extension fields survive seed merge", () => {
    const item = { kind: "run", start: "18:00", km: 1, vendor: { raw: "x" } };
    const seeded = stamp(sessions([item]));
    const out = mergeDailyStore(seeded, structuredClone(seeded), seeded);
    expect(out[day].sessions[0].vendor).toEqual({ raw: "x" });
    expect(entityFingerprint(out[day].sessions[0])).toContain("vendor");
  });

  it("different order edits conflict", () => {
    const base = stamp(sessions([{ kind: "run", km: 1 }, { kind: "run", km: 2 }, { kind: "run", km: 3 }]));
    const local = structuredClone(base);
    const remote = structuredClone(base);
    const [a, b, c] = base[day].sessions;
    local[day].sessions = [c, a, b].map((s) => structuredClone(s));
    remote[day].sessions = [b, c, a].map((s) => structuredClone(s));
    const merged = reconcileConcurrentState(
      { records: [], dailyMeta: base, baseline: null },
      { records: [], dailyMeta: local, baseline: null },
      { records: [], dailyMeta: remote, baseline: null },
    );
    expect(merged.ok).toBe(false);
    expect(merged.conflicts.some((item) => item.endsWith(".order"))).toBe(true);
  });

  it("historical ids are stable across repeated loads", () => {
    const raw = sessions([{ kind: "run", start: "18:00", km: 1 }, { kind: "run", start: "18:00", km: 1 }]);
    const a = stamp(raw)[day].sessions.map((s) => s.eid);
    const b = stamp(raw)[day].sessions.map((s) => s.eid);
    expect(a).toEqual(b);
    expect(a[0]).not.toBe(a[1]);
    const imported = adoptImportedEntities([], raw[day].sessions, "sessions", day);
    expect(imported.map((s) => s.eid)).toEqual(a);
  });
});
