import { describe, it, expect } from "vitest";
import { validateImportPayload, parseImportText, IMPORT_MAX_BYTES } from "../src/shared/records-io.js";
import { validateDailyPayload } from "../src/shared/payload-validation.js";
import { editRecord } from "../src/shared/record-edit.js";
import { esc } from "../src/shared/format.js";
const row={d:"2026-10-06",el:80,extra:{keep:[1,"文字",null]}};
describe("B4 common input and schema",()=>{
 for(const obj of [row,[row],{data:[row]},{records:[row]},{version:1,records:[row]},{version:2,schemaVersion:2,appVersion:"v7.0",data:[row]},{data:[row],_meta:{schema_version:"32字段 (2026-08-15)"}}])it(`accepts ${JSON.stringify(obj).slice(0,50)}`,()=>{const v=validateImportPayload(obj);expect(v.list).toEqual([row]);expect(parseImportText(JSON.stringify(obj)).list).toEqual([row])});
 for(const meta of [{version:3},{version:99},{version:"v7"},{version:0},{version:1.5},{schemaVersion:99},{schemaVersion:"2"},{version:1,schemaVersion:2},{format:3},{format:999}])it(`rejects incompatible ${JSON.stringify(meta)}`,()=>{const v=parseImportText(JSON.stringify({...meta,data:[row]}));expect(v.list).toBeNull();expect(v.issues.length).toBeGreaterThan(0)});
 for(const extra of [{el:[]},{el:{}},{el:"abc"},{el:"1e309"},{type:{}},{shoe:1},{flag:[]},{bed:{}},{pace:{}},{note:42}])it(`rejects malformed ${JSON.stringify(extra)}`,()=>{expect(parseImportText(JSON.stringify({data:[row,{...row,...extra}]})).list).toBeNull()});
 it("rejects divergent duplicate lists",()=>expect(validateImportPayload({data:[row],records:[{...row,el:1}]}).list).toBeNull());
 it("accepts identical duplicate lists from own export",()=>expect(validateImportPayload({data:[row],records:[row]}).list).toEqual([row]));
 it("accepts fenced JSON without altering strings",()=>{const v=parseImportText('```json\n'+JSON.stringify({...row,note:'``` 原文'})+'\n```');expect(v.list[0].note).toBe('``` 原文')});
 it("UTF-8 limit applies to multibyte input",()=>expect(parseImportText('中'.repeat(Math.floor(IMPORT_MAX_BYTES/3)+1)).list).toBeNull());
 it("exact byte boundary remains accepted",()=>{const prefix='{"data":[{"d":"2026-10-06","note":"',suffix='"}]}',text=prefix+'a'.repeat(IMPORT_MAX_BYTES-prefix.length-suffix.length)+suffix;expect(parseImportText(text).list).not.toBeNull();expect(parseImportText(text+' ').list).toBeNull()});
 it("rejects non-finite JSON extension numbers",()=>expect(parseImportText('{"data":[{"d":"2026-10-06","extra":1e999}]}').list).toBeNull());
 it("rejects excessive extension nesting",()=>{let extra={};for(let i=0;i<70;i++)extra={a:extra};expect(validateImportPayload({data:[{...row,extra}]}).list).toBeNull()});
 it("preserves invalid-date skip compatibility",()=>{const v=validateImportPayload({data:[row,{d:'2026-02-30'}]});expect(v.list).not.toBeNull();expect(v.skip).toBe(1)});
});
describe("B4 optional daily and text",()=>{
 for(const nutrition of [{},{estimated:false},{kcal_range:[2000,3000]},{protein_range:[80,120]},{kcal_range:null,protein_range:null},{kcal_range:[2000,3000],protein_range:null},{kcal_estimate:2300,protein_estimate:null}])it(`optional nutrition ${JSON.stringify(nutrition)}`,()=>expect(validateDailyPayload({'2026-10-06':{nutrition}})).toEqual([]));
 for(const nutrition of [{protein_range:"x"},{kcal_range:[3,2]},{protein_range:[1]},{kcal_estimate:"x"}])it(`bad nutrition ${JSON.stringify(nutrition)}`,()=>expect(validateDailyPayload({'2026-10-06':{nutrition}}).length).toBeGreaterThan(0));
 for(const daily of [{sleep:{wake_time:[]}},{day_totals:{scope:{}}},{hrr:{timing_protocol:1}}])it(`bad rendered text ${JSON.stringify(daily)}`,()=>expect(validateDailyPayload({'2026-10-06':daily}).length).toBeGreaterThan(0));
 it("hostile-looking text is data",()=>{const text='<img src=x onerror="bad()">';expect(validateDailyPayload({'2026-10-06':{sleep:{wake_time:text},weight:[{kg:60,time:text}],sessions:[{kind:text,name:text,start:text,pace:text}],day_totals:{scope:text}}})).toEqual([]);expect(esc(text)).toBe('&lt;img src=x onerror=&quot;bad()&quot;&gt;');expect(esc("'&<>")).toBe('&#39;&amp;&lt;&gt;')});
});

it("form uses the same byte limit before producing a record",()=>{const result=editRecord({date:row.d,base:null,current:null,shown:{note:""},values:{note:"中".repeat(3_000_000)},kinds:{note:"textarea"}});expect(result.ok).toBe(false);expect(result.issues[0]).toContain("MB")});
