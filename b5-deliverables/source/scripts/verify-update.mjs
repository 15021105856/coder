/** 独立集成测试：在临时副本中修改数据，验证 build / inject；不会写正式数据。 */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, basename } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { readDatasetFromHtml } from './dataset-from-html.mjs';
import { verifyFullDelivery } from './delivery-verify.mjs';
import { dataStamp } from '../src/shared/stamp.js';
import { RELEASE } from '../src/shared/release.js';

const root = resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cwd, ...args) {
  const result = spawnSync(npm, args, { cwd, encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}

function runNode(cwd, script, ...scriptArgs) {
  execFileSync(process.execPath, [script, ...scriptArgs], { cwd, stdio: 'inherit', env: process.env });
}

function readSourceDataset(temp) {
  return JSON.parse(readFileSync(resolve(temp, 'data/训练数据集.json'), 'utf8'));
}

const temp = mkdtempSync(resolve(tmpdir(), 'physio-update-'));
try {
  cpSync(root, temp, {
    recursive: true,
    filter: (p) => {
      const base = basename(p);
      return !['node_modules', 'download', 'release', 'download.html'].includes(base)
        && !base.endsWith('.zip')
        && !/^\.(pack|inject)-/.test(base);
    },
  });
  symlinkSync(resolve(root, 'node_modules'), resolve(temp, 'node_modules'), 'junction');

  run(temp, 'run', 'build');
  assert(existsSync(resolve(temp, 'release', RELEASE.monitor)), 'bootstrap build 应生成 release HTML');
  verifyFullDelivery(temp, readSourceDataset(temp), 'bootstrap');

  const path = resolve(temp, 'data/训练数据集.json');
  let ds = readSourceDataset(temp);
  const originalBaseline = structuredClone(ds._baseline);
  const n = ds.data.length;
  const beforeStamp = dataStamp(ds);

  ds.data.at(-1).pro = (ds.data.at(-1).pro ?? 0) + 1;
  writeFileSync(path, JSON.stringify(ds, null, 2));
  ds = readSourceDataset(temp);
  const afterStamp = dataStamp(ds);
  assert.notEqual(afterStamp, beforeStamp, '测试数据修改应改变指纹');

  runNode(temp, resolve(temp, 'scripts/check.mjs'), path);
  assert.notEqual(
    spawnSync(npm, ['run', 'check:release'], { cwd: temp, encoding: 'utf8' }).status,
    0,
    '旧产物应被交付校验识别',
  );

  run(temp, 'run', 'build');
  ds = readSourceDataset(temp);
  verifyFullDelivery(temp, ds, 'after-build');

  const mp = resolve(temp, 'release', RELEASE.monitor);
  const ap = resolve(temp, 'release', RELEASE.archive);
  const dp = resolve(temp, 'release', RELEASE.docx);
  const oldMonitor = readFileSync(mp);
  const oldWord = readFileSync(dp);

  ds.data.at(-1).pro = (ds.data.at(-1).pro ?? 0) + 1;
  writeFileSync(path, JSON.stringify(ds, null, 2));
  ds = readSourceDataset(temp);
  const injectStamp = dataStamp(ds);
  renameSync(ap, `${ap}.saved`);
  assert.notEqual(spawnSync(npm, ['run', 'inject'], { cwd: temp, encoding: 'utf8' }).status, 0);
  assert.deepEqual(readFileSync(mp), oldMonitor);
  assert.deepEqual(readFileSync(dp), oldWord);
  renameSync(`${ap}.saved`, ap);

  writeFileSync(resolve(temp, 'stale.txt'), 'stale');
  execFileSync('zip', ['-q', resolve(temp, RELEASE.zipBundle), 'stale.txt'], { cwd: temp });
  run(temp, 'run', 'inject');
  run(temp, 'run', 'check:release');

  ds = readSourceDataset(temp);
  verifyFullDelivery(temp, ds, 'after-inject');

  assert.deepEqual(readSourceDataset(temp)._baseline, originalBaseline);
  assert.equal(readSourceDataset(temp).data.length, n);
  assert.equal(dataStamp(readSourceDataset(temp)), injectStamp);

  console.log('✓ 更新集成测试：冷启动 build；源/产物检查分离；build/inject 全量交付校验（含 ZIP 解包与 Word 指纹）；注入失败无部分写入；ZIP 无陈旧成员；记录数与固定基线不变');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
