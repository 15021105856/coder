import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FIELDS } from '../src/shared/schema.js';
import { dataStamp } from '../src/shared/stamp.js';
import { VERSION, RELEASE } from '../src/shared/release.js';
import { buildDownloadMeta, renderDownloadHtml, defaultZipSize } from '../scripts/gen-download.mjs';

const packSrc = readFileSync(join(import.meta.dirname, '../scripts/pack.mjs'), 'utf8');
const templatePath = join(import.meta.dirname, '../download.template.html');

function fixtureRow(d, patch = {}) {
  const row = Object.fromEntries(FIELDS.map((k) => [k, null]));
  row.d = d;
  return { ...row, ...patch };
}

const FIXTURE = {
  data: [fixtureRow('2026-01-01'), fixtureRow('2026-01-02', { pro: 120 })],
  _daily: { '2026-01-02': { nutrition: { kcal_range: [2000, 2200], protein_range: [100, 110] } } },
};

describe('gen-download 与 pack 集成', () => {
  it('defaultZipSize 依次查找根目录与 download/ 下的 zip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'physio-zip-'));
    try {
      writeFileSync(resolve(dir, RELEASE.zipBundle), 'abc');
      expect(defaultZipSize(RELEASE.zipBundle, dir)).toMatch(RELEASE.zipBundle);
      rmSync(resolve(dir, RELEASE.zipBundle));
      mkdirSync(resolve(dir, 'download'));
      writeFileSync(resolve(dir, 'download', RELEASE.zipBundle), 'abcd');
      expect(defaultZipSize(RELEASE.zipBundle, dir)).toMatch(RELEASE.zipBundle);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pack 在 zip 生成后再次 gen-download 并同步 download/', () => {
    expect(packSrc).toMatch(/gen-download\.mjs/);
    expect(packSrc).toMatch(/resolve\(ROOT, "download\.html"\), resolve\(DOWNLOAD_DIR, "download\.html"\)/);
  });

  it('renderDownloadHtml 从输入数据集推导元数据并替换全部占位符', () => {
    const html = renderDownloadHtml(FIXTURE, {
      templatePath,
      version: VERSION,
      zipSize: (name) => `mock-size（${name}）`,
    });
    const { days, through, stamp, metaLine } = buildDownloadMeta(FIXTURE);

    expect(days).toBe(2);
    expect(through).toBe('2026-01-02');
    expect(stamp).toBe(dataStamp(FIXTURE));
    expect(html).toContain(metaLine);
    expect(html).not.toMatch(/\{\{/);
    expect(html).toContain('mock-size（个人训练系统_v7.zip）');
    expect(html).toContain('v7.0');
  });
});
