import { describe, it, expect } from "vitest";
import { dayMs, lastDataDate, utcParts } from "../src/shared/time.js";

describe("time", () => {
  it("dayMs 使用 UTC 午夜", () => {
    expect(dayMs("2026-07-26")).toBe(Date.parse("2026-07-26T00:00:00Z"));
  });

  it("utcParts 与 dayMs 一致", () => {
    expect(utcParts("2026-10-03").dow).toBe(6);
  });

  it("lastDataDate 取排序末行", () => {
    expect(lastDataDate([{ d: "2026-01-01" }, { d: "2026-12-31" }, { d: "2026-06-01" }])).toBe("2026-12-31");
  });
});
