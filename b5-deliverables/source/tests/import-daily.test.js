import {describe,it,expect} from 'vitest';
import {mergeImportedDaily} from '../src/shared/payload-validation.js';
describe('explicit supplement import',()=>{
  it('overrides supplied fields but retains unreported fields and unrelated days',()=>{
    const local={'2026-10-04':{nutrition:{protein_range:[90,135],kcal_range:[2500,3600]},sessions:[{kind:'run',km:9}]},'2026-10-03':{weight:[{kg:60.25}]} };
    const incoming={'2026-10-04':{nutrition:{protein_range:[90,140]},sessions:[{kind:'run',km:10}]} };
    const out=mergeImportedDaily(local,incoming);
    expect(out['2026-10-04'].nutrition).toEqual({protein_range:[90,140],kcal_range:[2500,3600]});
    expect(out['2026-10-04'].sessions.map(({kind,km})=>({kind,km}))).toEqual([{kind:'run',km:10}]);
    expect(out['2026-10-04'].sessions[0].eid).toMatch(/^s_[0-9a-f]{16}$/);
    expect(out['2026-10-03']).toEqual(local['2026-10-03']);
    expect(local['2026-10-04'].nutrition.protein_range).toEqual([90,135]);
  });
  it('can explicitly clear an array without retaining old sessions',()=>{
    expect(mergeImportedDaily({'2026-10-04':{sessions:[{kind:'run'}]}},{'2026-10-04':{sessions:[]}})['2026-10-04'].sessions).toEqual([]);
  });
});
