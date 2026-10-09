import { describe, it, expect } from "vitest";
import { FIELDS, isDate } from "../src/shared/schema.js";

describe("schema", () => {
  it("FIELDS 为 32 列", () => {
    expect(FIELDS).toHaveLength(32);
    expect(FIELDS[0]).toBe("d");
  });

  it("isDate 拒绝无效日历日", () => {
    expect(isDate("2026-10-03")).toBe(true);
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("bad")).toBe(false);
  });
});
