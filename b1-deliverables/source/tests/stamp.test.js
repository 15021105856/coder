import { describe, it, expect } from "vitest";
import { fnv1a, dataStamp } from "../src/shared/stamp.js";

describe("stamp", () => {
  it("fnv1a 确定性", () => {
    expect(fnv1a("test")).toBe(fnv1a("test"));
    expect(fnv1a("test")).not.toBe(fnv1a("test2"));
  });

  it("dataStamp 随 data 变化", () => {
    const ds = { data: [{ d: "2026-01-01" }], _daily: {} };
    const s1 = dataStamp(ds);
    ds.data.push({ d: "2026-01-02" });
    expect(dataStamp(ds)).not.toBe(s1);
  });
});
