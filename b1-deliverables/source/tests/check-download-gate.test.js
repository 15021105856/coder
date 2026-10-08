import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkDownloadHtmlAt } from '../scripts/check-download.mjs';
import { buildDownloadMeta, renderDownloadHtml } from '../scripts/gen-download.mjs';

const root = join(import.meta.dirname, '..');
const ds = JSON.parse(readFileSync(resolve(root, 'data/训练数据集.json'), 'utf8'));
const { metaLine } = buildDownloadMeta(ds);
const templatePath = resolve(root, 'download.template.html');

function runCheck(...args) {
  return spawnSync(process.execPath, [resolve(root, 'scripts/check.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function collect(path, label, required, content = metaLine) {
  const errors = [];
  const logs = [];
  writeFileSync(path, `<p>${content}</p>`);
  checkDownloadHtmlAt(path, label, metaLine, {
    required,
    err: (_layer, msg) => errors.push(msg),
    ok: (msg) => logs.push(msg),
  });
  return { errors, logs };
}

describe('checkDownloadHtmlAt 行为', () => {
  it('存在且正确', () => {
    const dir = mkdtempSync(join(tmpdir(), 'physio-dl-'));
    const p = join(dir, 'download.html');
    const { errors, logs } = collect(p, 'download.html', true);
    expect(errors).toEqual([]);
    expect(logs.length).toBe(1);
  });

  it('存在但错误', () => {
    const dir = mkdtempSync(join(tmpdir(), 'physio-dl-'));
    const p = join(dir, 'download.html');
    const { errors } = collect(p, 'download.html', true, '指纹 deadbeef');
    expect(errors.some((e) => e.includes('不一致'))).toBe(true);
  });

  it('缺失且 required', () => {
    const dir = mkdtempSync(join(tmpdir(), 'physio-dl-'));
    const p = join(dir, 'missing.html');
    const errors = [];
    checkDownloadHtmlAt(p, 'download.html', metaLine, {
      required: true,
      err: (_layer, msg) => errors.push(msg),
    });
    expect(errors.some((e) => e.includes('缺少必需文件'))).toBe(true);
  });

  it('缺失且非 required 不报错', () => {
    const errors = [];
    checkDownloadHtmlAt(join(tmpdir(), 'nope.html'), 'download.html', metaLine, {
      required: false,
      err: (_layer, msg) => errors.push(msg),
    });
    expect(errors).toEqual([]);
  });
});

describe('check.mjs 产物门禁（集成）', () => {
  const rootDl = resolve(root, 'download.html');
  const pubDir = resolve(root, 'download');
  const pubDl = resolve(pubDir, 'download.html');
  let hadRoot = false;
  let hadPub = false;
  let rootBackup = '';
  let pubBackup = '';

  beforeEach(() => {
    hadRoot = existsSync(rootDl);
    hadPub = existsSync(pubDl);
    if (hadRoot) rootBackup = readFileSync(rootDl, 'utf8');
    if (hadPub) pubBackup = readFileSync(pubDl, 'utf8');
    const html = renderDownloadHtml(ds, { templatePath });
    writeFileSync(rootDl, html);
    mkdirSync(pubDir, { recursive: true });
    writeFileSync(pubDl, html);
  });

  afterEach(() => {
    if (hadRoot) writeFileSync(rootDl, rootBackup);
    else if (existsSync(rootDl)) unlinkSync(rootDl);
    if (hadPub) writeFileSync(pubDl, pubBackup);
    else if (existsSync(pubDl)) unlinkSync(pubDl);
  });

  it('删除根 download.html 时 --release 失败', () => {
    unlinkSync(rootDl);
    const r = runCheck('--release');
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/缺少必需文件.*download\.html/);
  });

  it('删除 download/download.html 时 --release --published 失败', () => {
    unlinkSync(pubDl);
    const r = runCheck('--release', '--published');
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/缺少必需文件.*download\/download\.html/);
  });

  it('源检查不因下载页损坏而失败', () => {
    writeFileSync(rootDl, '指纹 deadbeef');
    const r = runCheck();
    expect(r.status).toBe(0);
  });
});
