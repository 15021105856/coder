const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(require('path').resolve(__dirname,'../source/node_modules/playwright'));
const root=__dirname, ds=JSON.parse(fs.readFileSync(root+'/source/data/训练数据集.json'));
const K={r:'physio-log.records.v1',v:'physio-log.data-version',d:'physio-log.daily',b:'physio-log.baseline.v1',app:'physio-log.app-state.v2'};
const row=(d,extra={})=>Object.fromEntries(ds._fields.map(k=>[k,k==='d'?d:extra[k]??null]));
const unique=row('2099-06-01',{el:77,note:'ONLY-LOCAL'}),newrow=row('2099-06-02',{el:78,note:'PENDING'});
const version=JSON.stringify({s:'02808fbb',d:'2026-10-06'});
const goodSnap={format:2,dataStamp:'02808fbb',dataDate:'2026-10-06',records:[...ds.data,unique],daily:{stamp:'02808fbb',date:'2026-10-06',seed:ds._daily,data:ds._daily},baseline:null};
let browser;const selected=process.env.QA_CASES?.split(",");const results=[];
async function fresh(init={},fault={},file='product/训练监测系统_v7.html'){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});const p=await ctx.newPage();p.setDefaultTimeout(4000);p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',d=>d.accept());
 const cdp=await ctx.newCDPSession(p);await cdp.send('Page.enable');const seedScript=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear();for(const [k,v] of Object.entries('+JSON.stringify(init)+'))localStorage.setItem(k,v);'});
 await p.addInitScript(({init,fault})=>{
  const read=Storage.prototype.getItem,write=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  window.qaRaw=k=>read.call(localStorage,k);window.qaFault=read.call(sessionStorage,'qa-disable-fault')?{}:fault;

  window.qaWrote=false;
  Storage.prototype.getItem=function(k){if(this===localStorage&&(window.qaFault.get===k||(window.qaFault.readback===k&&window.qaWrote)))throw new DOMException('QA read denied '+k,'SecurityError');return read.call(this,k)};
  Storage.prototype.setItem=function(k,v){if(this===localStorage&&(window.qaFault.set===k||(window.qaFault.probe&&k.startsWith('__physio_probe_'))))throw new DOMException('QA quota '+k,'QuotaExceededError');const r=write.call(this,k,v);if(k==='physio-log.app-state.v2')window.qaWrote=true;return r};
  Storage.prototype.removeItem=function(k){if(this===localStorage&&window.qaFault.removeProbe&&k.startsWith('__physio_probe_'))throw new DOMException('QA remove denied','SecurityError');return remove.call(this,k)};
 },{init,fault});await p.goto('file://'+root+'/'+file);await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:seedScript.identifier});await p.waitForTimeout(120);return {p,ctx};
}
async function state(p){return p.evaluate(K=>({errors:[],viewChars:document.querySelector('#view-today').textContent.length,mem:document.querySelector('#memBanner').className,recovery:document.querySelector('#storRecoverBanner').textContent,badge:document.querySelector('#storBadge').textContent,toast:document.querySelector('#toast').textContent,raw:qaRaw(K.app),legacy:qaRaw(K.r)}),K)}
async function exp(p,id){const wait=p.waitForEvent('download');await p.locator('#menuBtn').click();await p.locator('[data-act="export"]').click();const d=await wait;const raw=fs.readFileSync(await d.path(),'utf8');fs.writeFileSync(root+'/evidence/'+id+'-export.json',raw);return JSON.parse(raw)}
async function imp(p){await p.locator('#fileInput').setInputFiles({name:'qa.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({data:[newrow],_daily:{[newrow.d]:{sessions:[{kind:'run',km:5}]}}}))});await p.waitForTimeout(150);}
async function run(id,fn){if(selected&&!selected.includes(id))return;const old=results.findIndex(x=>x.id===id);if(old>=0)results.splice(old,1);try{results.push({id,status:'completed',result:await fn()})}catch(e){results.push({id,status:'HARNESS_ERROR',error:e.stack})}fs.writeFileSync(root+'/evidence/recovery-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)).slice(0,1500));}
(async()=>{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']});
 for(const variant of ['readable','unreadable'])await run('authority-recovery-same-date-local-edits-'+variant,async()=>{
  const current=structuredClone(goodSnap),d=ds.data[0].d,dd=Object.keys(ds._daily)[0];
  current.records.find(r=>r.d===d).el=99;current.records.find(r=>r.d===d).note='DISK-LOCAL-EDIT';
  current.daily.data[dd]={...current.daily.data[dd],sessions:[{kind:'run',start:'20:00',km:7.77,note:'DISK-SAME-DATE'}],note:'DISK-SAME-DATE'};
  const raw=JSON.stringify(current);const {p,ctx}=await fresh({[K.app]:raw},variant==='unreadable'?{get:K.app}:{});
  await p.evaluate(()=>window.qaFault={});await imp(p);const importToast=(await state(p)).toast;const e=await exp(p,'same-date-recovery-'+variant);const a=JSON.parse((await state(p)).raw);
  const got=a.records.find(r=>r.d===d),daily=a.daily.data[dd];
  const o={recordDate:d,dailyDate:dd,expectedEl:99,actualEl:got?.el,recordNote:got?.note??null,expectedDaily:current.daily.data[dd],actualDaily:daily,exportPreservesRecord:e.data.find(r=>r.d===d)?.el===99,exportPreservesDaily:JSON.stringify(e._daily[dd])===JSON.stringify(current.daily.data[dd]),pendingRecordSaved:a.records.some(r=>r.d===newrow.d),toast:importToast,errors:p.errs};
  await p.reload();o.afterReloadEl=JSON.parse((await state(p)).raw).records.find(r=>r.d===d)?.el;await ctx.close();return o;
 });
 for(const part of ['daily','baseline'])await run('legacy-blocked-'+part+'-then-user-save',async()=>{
  const baseline={start:'2026-08-08',end:'2026-08-23',n:14,mean:4.55,sd:0.1,locked:true};
  const daily={stamp:'02808fbb',date:unique.d,seed:ds._daily,data:{...ds._daily,[unique.d]:{sessions:[{kind:'run',start:'18:00',km:7.77}]}}};
  const initial={[K.r]:JSON.stringify(goodSnap.records),[K.v]:version,[K.d]:JSON.stringify(daily),[K.b]:JSON.stringify(baseline)};
  const {p,ctx}=await fresh(initial,{get:part==='daily'?K.d:K.b});const before=await state(p);await imp(p);const after=await state(p);const stored=after.raw?JSON.parse(after.raw):null;const e=await exp(p,'legacy-blocked-'+part);
  const o={initialV2Absent:before.raw===null,v2CreatedAfterSave:!!stored,localDaily:stored?.daily?.data?.[unique.d]??null,baseline:stored?.baseline??null,oldRawPreserved:await p.evaluate(k=>qaRaw(k),part==='daily'?K.d:K.b)===initial[part==='daily'?K.d:K.b],toast:after.toast,pendingInExport:e.data.some(r=>r.d===newrow.d),errors:p.errs,importBlocked:!stored};
  await p.evaluate(()=>window.qaFault={});await p.reload();const afterRaw=(await state(p)).raw;const a=afterRaw?JSON.parse(afterRaw):null;o.dailyAfterReload=a?.daily?.data?.[unique.d]??null;o.baselineAfterReload=a?.baseline??null;await ctx.close();return o;
 });
 await run('legacy-records-unreadable',async()=>{
  const raw=JSON.stringify(goodSnap.records);const {p,ctx}=await fresh({[K.r]:raw,[K.v]:version},{get:K.r});const first=await state(p);await p.evaluate(()=>window.qaFault={});await imp(p);await p.reload();const e=await exp(p,'legacy-records-unreadable');
  const o={v2CreatedAtLoad:!!first.raw,uniqueAfterReload:e.data.some(r=>r.d===unique.d),legacyRawPreserved:await p.evaluate(k=>qaRaw(k),K.r)===raw,toast:first.toast,errors:p.errs};await ctx.close();return o;
 });
 await run('unreadable-then-structurally-corrupt-authority',async()=>{
  const raw=JSON.stringify({...goodSnap,records:{recoverable:unique}});const {p,ctx}=await fresh({[K.app]:raw},{get:K.app});const first=await state(p);await p.evaluate(()=>window.qaFault={});await imp(p);const after=await state(p);const e=await exp(p,'late-corrupt');
  const o={initialRawPreserved:first.raw===raw,rawPreservedAfterRetry:after.raw===raw,originalInExport:e.quarantine?.corruptAppStateRaw===raw,toast:after.toast,errors:p.errs};await ctx.close();return o;
 });
 await browser.close();assert(results.every(x=>x.status==='completed'));
})().catch(e=>{console.error(e);process.exitCode=1});
