import {describe,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const failure = vi.hoisted(()=>({destination:null}));
vi.mock('node:fs',async(importOriginal)=>{
  const fs=await importOriginal();
  return {...fs,renameSync:(from,to)=>{
    if(to===failure.destination&&from.includes('.next-')) throw new Error('simulated publication failure');
    return fs.renameSync(from,to);
  }};
});
import {publishFiles} from '../scripts/publish-files.mjs';
describe('publication rollback',()=>{
  it('restores all previous files if publication fails after the first rename',()=>{
    const dir=mkdtempSync(resolve(tmpdir(),'publish-test-'));
    try {
      const a=resolve(dir,'a'),b=resolve(dir,'b'),x=resolve(dir,'x'),y=resolve(dir,'y');
      for(const [p,v] of [[a,'old a'],[b,'old b'],[x,'new a'],[y,'new b']])writeFileSync(p,v);
      failure.destination=b;
      expect(()=>publishFiles([[x,a],[y,b]])).toThrow('simulated');
      expect(readFileSync(a,'utf8')).toBe('old a');expect(readFileSync(b,'utf8')).toBe('old b');
      expect(readdirSync(dir).sort()).toEqual(['a','b','x','y']);
      failure.destination=null;publishFiles([[x,a],[y,b]]);
      expect(readFileSync(a,'utf8')).toBe('new a');expect(readFileSync(b,'utf8')).toBe('new b');
    }finally{failure.destination=null;rmSync(dir,{recursive:true,force:true});}
  });
});
