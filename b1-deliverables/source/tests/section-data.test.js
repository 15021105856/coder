import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { derive } from "../src/archive/derive.js";
import { WORKOUT, PHASES } from "../src/archive/content.js";
import { workoutStats, phaseBar, chartExtents, elPos, latestTrainingSummary, nutritionSummary } from "../src/archive/section-data.js";

const DS = JSON.parse(readFileSync(resolve(import.meta.dirname, "../data/训练数据集.json"), "utf8"));
const X = derive(DS);

describe("section-data", () => {
  it("只有营养范围时摘要显示范围，不补单点值", () => {
    const record = { kcal: null, pro: null, daily: { nutrition: { kcal_range: [1800, 2700], protein_range: [70, 105] } } };
    expect(nutritionSummary(record)).toBe("1800–2700 kcal · 蛋白 70–105 g（估算）");
    expect(record.kcal).toBeNull();
    expect(record.pro).toBeNull();
  });

  it("营养未估算时摘要不显示null或零值", () => {
    expect(nutritionSummary({ kcal: null, pro: null })).toBe("未估算 · 蛋白 未估算（估算）");
  });

  it("已有营养单点值仍保留原口径", () => {
    expect(nutritionSummary({ kcal: 3050, pro: 110 })).toBe("3050 kcal · 蛋白 110 g（估算）");
  });
  it("workoutStats 返回正式组标签", () => {
    const { formalLabel, maxKg } = workoutStats(X.daily, WORKOUT);
    expect(formalLabel).toMatch(/热身$/);
    expect(maxKg).toBeGreaterThan(0);
  });

  it("phaseBar 段数与 PHASES 一致", () => {
    const phases = phaseBar(PHASES);
    expect(phases).toHaveLength(PHASES.spans.length);
    expect(phases.at(-1).isLast).toBe(true);
  });

  it("chartExtents 含首尾 padding", () => {
    const { t0, t1 } = chartExtents(X.recs);
    expect(t1).toBeGreaterThan(t0);
  });

  it("elPos 与基线离群线一致", () => {
    expect(elPos(50, X.baseline)).toBe("out");
    expect(elPos(X.baseline.band[0] + 1, X.baseline)).toBe("in");
  });
});

describe('shared latest training summary', () => {
  it('uses the full-day total instead of the main-run duration', () => {
    expect(latestTrainingSummary({...X.recs.find(r => r.d === '2026-10-04'),daily:X.daily['2026-10-04']})).toEqual({title:'2 段跑步',runKm:9.92,tsec:3341});
  });
  it('sums complete sessions and leaves incomplete totals missing', () => {
    expect(latestTrainingSummary({daily:{sessions:[{kind:'run',km:2,tsec:800},{kind:'run',km:7,tsec:2500}]}})).toEqual({title:'2 段跑步',runKm:9,tsec:3300});
    expect(latestTrainingSummary({daily:{sessions:[{kind:'run',km:2},{kind:'run'}]}})).toEqual({title:'2 段跑步',runKm:null,tsec:null});
  });
  it('does not label mixed sessions as running', () => {
    expect(latestTrainingSummary({daily:{sessions:[{kind:'strength',tsec:3000},{kind:'run',tsec:2500}]}})).toEqual({title:'多课训练',runKm:null,tsec:5500});
  });
});
