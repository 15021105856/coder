import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const chartsSrc = readFileSync(join(import.meta.dirname, '../src/monitor/charts.js'), 'utf8');
const todaySrc = readFileSync(join(import.meta.dirname, '../src/monitor/views/today.js'), 'utf8');

describe('charts.js SVG id 命名空间', () => {
  it('按容器 WeakMap 命名空间 + beginChartDraw 避免 id 冲突', () => {
    expect(chartsSrc).toMatch(/const chartNs = new WeakMap\(\)/);
    expect(chartsSrc).toMatch(/function uidFor\(container\)/);
    expect(chartsSrc).toMatch(/function beginChartDraw\(container\)/);
    expect(chartsSrc).toMatch(/export function resetSparklineIds/);
  });

  it('today.js 在渲染前重置 sparkline id', () => {
    expect(todaySrc).toMatch(/resetSparklineIds\(\)/);
  });
});
