import { describe, it, expect } from "vitest";
import { RANGE, inRange } from "../scripts/ranges.mjs";

describe("check ranges", () => {
  it("RANGE 表与 check.mjs 共用", () => {
    expect(RANGE.bal).toEqual([45, 55]);
    expect(RANGE.vol).toEqual([500, 6000]);
  });

  it("边界值 inclusive", () => {
    expect(inRange("bal", 45)).toBe(true);
    expect(inRange("bal", 55)).toBe(true);
    expect(inRange("bal", 44.9)).toBe(false);
    expect(inRange("bal", 55.1)).toBe(false);
  });

  it("非数值字段跳过", () => {
    expect(inRange("bal", null)).toBe(true);
    expect(inRange("unknown", 999)).toBe(true);
  });
});
