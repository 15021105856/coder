/** 运行时数据集校验；先检查结构，任何非法数据都不进入派生或渲染。 */
import { FIELDS, NUM_FIELDS, TEXT_FIELDS, isDate } from './schema.js';
import { plainObject, validateDailyPayload } from './payload-validation.js';

export function validateDataset(ds) {
  if (!plainObject(ds)) return ['数据集根节点必须是对象'];
  const issues = [];
  if (!Array.isArray(ds.data)) return ['data 必须是数组'];
  if (!ds.data.length) issues.push('data 数组为空');
  if (JSON.stringify(ds._fields || FIELDS) !== JSON.stringify(FIELDS)) issues.push('_fields 与内置 schema 不一致');
  const dates = new Set();
  ds.data.forEach((r, i) => {
    if (!plainObject(r)) { issues.push(`第 ${i + 1} 行必须是对象`); return; }
    const at = r.d || `第 ${i + 1} 行`;
    if (Object.keys(r).length !== FIELDS.length || FIELDS.some(k => !Object.hasOwn(r, k))) issues.push(`${at}：字段与 schema 不一致`);
    if (!isDate(r.d)) issues.push(`${at}：日期格式异常`);
    if (dates.has(r.d)) issues.push(`${at}：日期重复`);
    dates.add(r.d);
    for (const k of NUM_FIELDS) {
      if (r[k] == null || (k === 'feel' && typeof r[k] === 'string')) continue;
      if (!Number.isFinite(r[k])) issues.push(`${at}.${k} 应为有限数字`);
    }
    for (const k of [...TEXT_FIELDS,'bed','pace']) if (r[k] != null && typeof r[k] !== 'string') issues.push(`${at}.${k} 应为文本`);
    // 数值关系和生理范围由 check / 视图提醒；不把设备异常读数当结构错误删除或拒载。
    if (r.pace != null && typeof r.pace === 'string' && !/^\d{1,2}:[0-5]\d$/.test(r.pace)) issues.push(`${at}：pace 格式异常`);
  });
  if (Object.hasOwn(ds,'_daily')) issues.push(...validateDailyPayload(ds._daily));
  if (ds._baseline != null && !plainObject(ds._baseline)) issues.push('_baseline 必须是对象');
  else if (ds._baseline) {
    const b = ds._baseline;
    for (const k of ['n','lnRMSSD_mean','lnRMSSD_sd']) if (b[k] != null && !Number.isFinite(b[k])) issues.push(`_baseline.${k} 应为有限数字`);
    for (const k of ['window_start','window_end']) if (b[k] != null && !isDate(b[k])) issues.push(`_baseline.${k} 日期无效`);
    if (b.excluded != null && (!Array.isArray(b.excluded) || !b.excluded.every(isDate))) issues.push('_baseline.excluded 必须是有效日期数组');
  }
  return issues;
}
