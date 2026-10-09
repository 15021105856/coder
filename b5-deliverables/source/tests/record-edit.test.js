import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { editRecord } from '../src/shared/record-edit.js';
import { normalizeRec } from '../src/shared/normalize-rec.js';
const dataset=JSON.parse(readFileSync(new URL('../data/训练数据集.json',import.meta.url),'utf8'));
const kinds={note:'textarea',feel:'selfeel',type:'seltype',shoe:'selshoe',el:'num',flag:'text'};
const display=r=>Object.fromEntries(Object.keys(kinds).map(k=>[k,r?.[k]==null?'':String(r[k])]));
describe('B2 无损编辑',()=>{
 for(const row of dataset.data)it(`${row.d} 仅改备注保留其余全部字段`,()=>{const base=normalizeRec(row),before=structuredClone(base),shown=display(base);const result=editRecord({date:base.d,base,current:base,shown,values:{...shown,note:'新备注'},kinds});expect(result.ok).toBe(true);expect(result.record).toEqual({...base,note:'新备注'});expect(base).toEqual(before)});
 it('保留自定义选项、文字感受、空白文本、扩展字段',()=>{const base=normalizeRec({d:'2026-10-06',feel:' 左腿有酸感 ',type:'越野',shoe:'新鞋',flag:'  原文  ',extra:{list:[1,null,'未知字段']}});expect(base.extra).toEqual({list:[1,null,'未知字段']});const shown=display(base);expect(editRecord({date:base.d,base,current:base,shown,values:{...shown,note:'编辑'},kinds}).record).toEqual({...base,note:'编辑'})});
 it('主动修改和清空字段生效，扩展字段不丢',()=>{const base=normalizeRec({d:'2026-10-06',feel:'文本感受',el:88,note:'原备注',extra:7}),shown=display(base);const result=editRecord({date:base.d,base,current:base,shown,values:{...shown,feel:'3',el:'',note:''},kinds});expect(result.ok).toBe(true);expect(result.record).toEqual({...base,feel:3,el:null,note:null})});
 for(const current of [{d:'2026-10-06',el:99},null])it(`陈旧表单 ${current?'修改':'删除'} 不产生记录`,()=>{const base=normalizeRec({d:'2026-10-06',el:88}),shown=display(base);const result=editRecord({date:base.d,base,current,shown,values:{...shown,note:'旧表单'},kinds});expect(result).toMatchObject({ok:false,reason:'stale'});expect(result.record).toBeUndefined()});
 it('新日期被导入后旧空表单不覆盖',()=>{expect(editRecord({date:'2026-10-06',base:null,current:normalizeRec({d:'2026-10-06',el:99}),shown:display(null),values:display(null),kinds})).toMatchObject({ok:false,reason:'stale'})});
 for(const el of ['abc','Infinity','1e309'])it(`非法数字 ${el} 拒绝且保留草稿`,()=>{const base=normalizeRec({d:'2026-10-06',el:88}),shown=display(base),values={...shown,el};expect(editRecord({date:base.d,base,current:base,shown,values,kinds})).toMatchObject({ok:false,reason:'invalid'});expect(values.el).toBe(el)});
 it('非法日期拒绝',()=>{expect(editRecord({date:'2026-02-30',base:null,current:null,shown:display(null),values:display(null),kinds})).toMatchObject({ok:false,reason:'invalid'})});
 it('未改变表单不需要重复提交',()=>{const base=normalizeRec({d:'2026-10-06',el:88}),shown=display(base);expect(editRecord({date:base.d,base,current:base,shown,values:shown,kinds})).toMatchObject({ok:true,changed:false})});
 it('禁止原型污染字段且保留普通 JSON 扩展',()=>{const row=JSON.parse('{"d":"2026-10-06","__proto__":{"polluted":true},"constructor":{},"prototype":{},"extra":{"x":1}}');const result=normalizeRec(row);expect(Object.getPrototypeOf(result)).toBe(Object.prototype);expect(result).not.toHaveProperty('prototype');expect(Object.hasOwn(result,'constructor')).toBe(false);expect(result.extra).toEqual({x:1})});
});
