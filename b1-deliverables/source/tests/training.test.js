import { describe, it, expect } from "vitest";
import { typeCat } from "../src/shared/training.js";
import { runTotalKg, strengthTotalKg } from "../src/shared/daily.js";

describe("training taxonomy", () => {
  it("typeCat 分类", () => {
    expect(typeCat("有氧 9 km")).toBe("run");
    expect(typeCat("手臂＋深蹲")).toBe("str");
    expect(typeCat("休息")).toBe("rest");
    expect(typeCat(null)).toBe("none");
  });

  it("runTotal 优先 day_totals", () => {
    expect(runTotalKg({ km: 5 }, { day_totals: { run_km: 9.83 } })).toBe(9.83);
    expect(runTotalKg({ km: 5 }, {})).toBe(5);
  });

  it("strengthTotal 合计 sessions", () => {
    expect(strengthTotalKg({ vol: 100 }, { sessions: [{ kind: "strength", vol: 2000 }, { kind: "strength", vol: 1500 }] })).toBe(3500);
  });
});
