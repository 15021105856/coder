import { describe, it, expect } from "vitest";
import { mergeDailyValue } from "../src/shared/daily-merge.js";

describe("daily-merge sessions 同 start", () => {
  it("相同 kind|start 的两课保留为两条", () => {
    const seed = {
      sessions: [
        { kind: "run", start: "下午", km: 5 },
        { kind: "run", start: "下午", km: 7 },
      ],
    };
    const out = mergeDailyValue(seed, seed, undefined);
    expect(out.sessions).toHaveLength(2);
    expect(out.sessions.map((s) => s.km).sort()).toEqual([5, 7]);
  });
});
