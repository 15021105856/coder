import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { derive } from "../src/archive/derive.js";
import { dataStamp } from "../src/shared/stamp.js";

const DS = JSON.parse(readFileSync(resolve(import.meta.dirname, "../data/训练数据集.json"), "utf8"));

describe("derive", () => {
  const X = derive(DS);

  it("基线复算与锁定值一致", () => {
    expect(X.baseline.check.n).toBe(14);
    expect(X.baseline.check.mean.toFixed(4)).toBe("4.4417");
    expect(X.baseline.check.sd.toFixed(4)).toBe("0.0935");
  });

  it("引文校验", () => {
    expect(X.voices.length).toBe(18);
    expect(X.voiceMissing).toHaveLength(0);
  });

  it("chain 为最近 14 天", () => {
    expect(X.chain).toHaveLength(14);
    expect(X.chain.at(-1).d).toBe(DS._meta.data_through);
  });

  it("补充层变更会改变数据指纹", () => {
    const next = structuredClone(DS);
    next._daily[DS._meta.data_through].nutrition.kcal_range[0] += 1;
    expect(dataStamp(next)).not.toBe(dataStamp(DS));
  });
});
