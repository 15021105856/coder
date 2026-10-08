/* 日期与时间：全项目统一 UTC 午夜，避免监测/档案/Word 图表跨时区错位一日。 */
export const DAY_MS = 86400000;

export const pad2 = (n) => String(n).padStart(2, "0");

/** 日期字符串 → UTC 午夜毫秒时间戳 */
export function dayMs(d) {
  return new Date(d + "T00:00:00Z").getTime();
}

export function utcParts(d) {
  const t = new Date(dayMs(d));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), day: t.getUTCDate(), dow: t.getUTCDay() };
}

export function isoFromMs(t) {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(d, n) {
  return isoFromMs(dayMs(d) + n * DAY_MS);
}

/** data 数组中最后一天的日期（按字符串排序，不依赖数组顺序） */
export function lastDataDate(rows) {
  if (!rows?.length) return null;
  return rows.map((r) => r.d).filter(Boolean).sort().at(-1) ?? null;
}
