import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateDataset } from "../src/shared/validate-dataset.js";

const DS = JSON.parse(readFileSync(resolve(import.meta.dirname, "../data/训练数据集.json"), "utf8"));

describe("validateDataset", () => {
  it("正式数据集无异常", () => {
    expect(validateDataset(DS)).toEqual([]);
  });

  it("数值关系异常不阻断合法结构的原始观测", () => {
    const bad = structuredClone(DS);
    bad.data = [{ ...bad.data[0], hr: 150, hrmax: 140 }];
    expect(validateDataset(bad)).toEqual([]);
  });
});

describe('runtime malformed input', () => {
  it('reports root and record errors instead of throwing', () => {
    for (const x of [null,[],{data:null},{data:[null]},{data:[42]}]) {
      expect(()=>validateDataset(x)).not.toThrow(); expect(validateDataset(x).length).toBeGreaterThan(0);
    }
  });
  it('detects wrong keys even if the number of keys is unchanged', () => {
    const bad=structuredClone(DS);bad.data=[{...bad.data[0]}];delete bad.data[0].hw;bad.data[0].wrong=90;
    expect(validateDataset(bad).some(x=>x.includes('schema'))).toBe(true);
  });
  it('rejects malformed supplement arrays and ranges', () => {
    const bad=structuredClone(DS);bad._daily={'2026-10-04':{sessions:[null],nutrition:{protein_range:'90-130'}}};
    expect(validateDataset(bad).length).toBeGreaterThan(0);
  });
});

it("rejects malformed baseline exclusions and daily scalar values", () => {
  const copy = structuredClone(DS);
  copy._baseline.excluded = {};
  copy._daily["2026-10-04"].day_totals.run_km = {};
  expect(validateDataset(copy).join(" ")).toMatch(/excluded/);
  expect(validateDataset(copy).join(" ")).toMatch(/run_km/);
});
