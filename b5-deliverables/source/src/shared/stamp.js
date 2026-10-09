/* 数据指纹：监测系统缓存校验、网页档案与 Word 档案的尾页共用。公式与 v5 相同，改动会让旧缓存失效。 */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
export const dataStamp = (ds) => fnv1a(JSON.stringify([ds.data || [], ds._daily || {}, "refactor-2026-10-03"]));
