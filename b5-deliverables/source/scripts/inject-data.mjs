/* 数据更新：先验证源，暂存两份 HTML 与 Word，验证一致性后替换并打包。 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { RELEASE } from '../src/shared/release.js';
import { buildMeta, patchHtmlMeta } from './build-meta.mjs';
import { publishFiles } from './publish-files.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, process.argv[2] || 'data/训练数据集.json');
execFileSync(process.execPath, [resolve(ROOT,'scripts/check.mjs'),DATA], { stdio:'inherit' });
const meta=buildMeta(DATA), raw=readFileSync(DATA,'utf8').trim();
const escape=s=>s.replace(/<\//g,'<\\/');
const blocks=[
  {tag:/(<script type="application\/json" id="dataset">)[\s\S]*?(<\/script>)/,body:escape(raw),name:'数据'},
  {tag:/(<script type="text\/markdown" id="history">)[\s\S]*?(<\/script>)/,body:escape(readFileSync(resolve(ROOT,'data/训练历史存档.md'),'utf8').trim()),name:'历史存档',only:RELEASE.archive},
];
const staging=mkdtempSync(resolve(ROOT,'.inject-'));
try {
  for(const f of [RELEASE.monitor,RELEASE.archive]) {
    const p=resolve(ROOT,'release',f);
    if(!existsSync(p)) throw new Error(`缺少 ${f}，请先 npm run build`);
    let html=readFileSync(p,'utf8');
    for(const b of blocks) {
      if(b.only&&b.only!==f)continue;
      if(!b.tag.test(html))throw new Error(`${f} 中找不到内嵌${b.name}块，请 npm run build`);
      html=html.replace(b.tag,(_,a,z)=>`${a}\n${b.body}\n${z}`);
    }
    writeFileSync(resolve(staging,f),patchHtmlMeta(html,meta));
  }
  execFileSync(process.execPath,[resolve(ROOT,'scripts/gen-docx.mjs'),DATA,resolve(staging,RELEASE.docx)],{stdio:'inherit'});
  execFileSync(process.execPath,[resolve(ROOT,'scripts/check.mjs'),DATA,'--release'],{stdio:'inherit',env:{...process.env,PHYSIO_RELEASE_DIR:staging}});
  publishFiles([RELEASE.monitor,RELEASE.archive,RELEASE.docx].map(n=>[resolve(staging,n),resolve(ROOT,'release',n)]));
  console.log(`✓ 数据注入完成，指纹 ${meta.stamp}`);
} finally { rmSync(staging,{recursive:true,force:true}); }
execFileSync(process.execPath,[resolve(ROOT,'scripts/pack.mjs'),DATA],{stdio:'inherit'});
