import { describe, it, expect } from "vitest";
import {
  normalizeRec, mergeRecordLists, upsertIntoList, validateImportPayload,
} from "../src/shared/records-io.js";

describe("records-io", () => {
  it("normalizeRec 空值转 null", () => {
    const r = normalizeRec({ d: "2026-10-04", hw: 95, el: "", km: 7.5 });
    expect(r.el).toBeNull();
    expect(r.km).toBe(7.5);
  });

  it("mergeRecordLists 内嵌 seed 覆盖同日期缓存", () => {
    const seed = [{ d: "2026-10-03", hw: 90 }, { d: "2026-10-04", hw: 95 }];
    const cached = [{ d: "2026-10-03", hw: 88, el: 80 }];
    const out = mergeRecordLists(seed, cached);
    expect(out.find((r) => r.d === "2026-10-03").hw).toBe(90);
    expect(out.find((r) => r.d === "2026-10-04").hw).toBe(95);
  });

  it("upsertIntoList 统计 add/upd/skip", () => {
    const base = [{ d: "2026-10-03", hw: 90, el: null, bed: null, dur: null, deep: null, rem: null, cont: null, wake: null, shr: null, type: null, shoe: null, km: null, pace: null, hr: null, hrmax: null, pw: null, load: null, tsec: null, rec: null, ats: null, gct: null, cad: null, vo: null, bal: null, vol: null, hrr0: null, hrr1: null, pro: null, kcal: null, feel: null, flag: null }];
    const { add, upd, skip, recs } = upsertIntoList(base, [
      { d: "2026-10-03", hw: 91 },
      { d: "2026-10-04", hw: 95 },
      { d: "bad-date", hw: 1 },
    ]);
    expect(add).toBe(1);
    expect(upd).toBe(1);
    expect(skip).toBe(1);
    expect(recs).toHaveLength(2);
  });

  it("validateImportPayload 拒绝超大与坏结构", () => {
    expect(validateImportPayload(null).list).toBeNull();
    expect(validateImportPayload({ data: [] }).list).toEqual([]);
    const big = validateImportPayload({ data: [] }, { byteLength: 9 * 1024 * 1024 });
    expect(big.list).toBeNull();
    expect(big.issues.some((i) => i.includes("MB"))).toBe(true);
  });
});

describe('invalid imports do not produce a commit payload', () => {
  it('rejects invalid supplemental structure and baseline before importing valid rows', () => {
    for (const extra of [{_daily:[]},{_daily:{'2026-10-04':{weight:[null]}}},{baseline:{start:'bad',end:'2026-10-04',mean:4,sd:.1}}]) {
      expect(validateImportPayload({data:[{d:'2026-10-04',hw:95}],...extra}).list).toBeNull();
    }
  });
  it('rejects objects in numeric/text fields, without silently turning them into null', () => {
    for (const fields of [{hw:{}},{flag:{}},{km:'not a number'}]) expect(validateImportPayload({data:[{d:'2026-10-04',...fields}]}).list).toBeNull();
  });
  it('counts impossible dates without throwing', () => {
    const v=validateImportPayload({data:[{d:'9999-99-99'},{d:'2026-02-30'},{d:'2026-10-04'}]});
    expect(v.skip).toBe(2); expect(v.list).not.toBeNull();
  });
});
