import { describe, it, expect } from "vitest";
import { mergeDailyValue, mergeDailyStore } from "../src/shared/daily-merge.js";

describe("daily-merge", () => {
  it("本地与 base 相同则采用 seed", () => {
    const seed = { a: 1 };
    const base = { a: 1 };
    const local = { a: 1 };
    expect(mergeDailyValue(seed, local, base)).toEqual({ a: 1 });
  });

  it("本地改动保留", () => {
    const seed = { weight: [{ time: "09:00", kg: 60 }] };
    const local = { weight: [{ time: "09:00", kg: 61 }] };
    expect(mergeDailyValue(seed, local, seed).weight[0].kg).toBe(61);
  });

  it("mergeDailyStore 按日合并", () => {
    const seed = { "2026-10-01": { x: 1 }, "2026-10-02": { y: 2 } };
    const cached = { "2026-10-01": { x: 9 } };
    const out = mergeDailyStore(seed, cached, seed);
    expect(out["2026-10-01"].x).toBe(9);
    expect(out["2026-10-02"].y).toBe(2);
  });
});
