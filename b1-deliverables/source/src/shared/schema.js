/* 32 字段接口：监测系统、档案派生、自检脚本共用，改 schema 只改这一处。 */
export const FIELDS = [
  "d", "hw", "el", "bed", "dur", "deep", "rem", "cont", "wake", "shr", "type", "shoe", "km", "pace",
  "hr", "hrmax", "pw", "load", "tsec", "rec", "ats", "gct", "cad", "vo", "bal", "vol",
  "hrr0", "hrr1", "pro", "kcal", "feel", "flag",
];

export const NUM_FIELDS = [
  "hw", "el", "dur", "deep", "rem", "cont", "wake", "shr", "km", "hr", "hrmax", "pw", "load", "tsec",
  "rec", "ats", "gct", "cad", "vo", "bal", "vol", "hrr0", "hrr1", "pro", "kcal", "feel",
];

export const TEXT_FIELDS = new Set(["type", "shoe", "flag"]);

/** 严格 YYYY-MM-DD（UTC 日历日，拒绝 2026-02-30 等无效日期） */
export function isDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && Number.isFinite(Date.parse(s + "T00:00:00Z"))
    && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
}

export function assertFields(row) {
  const keys = Object.keys(row);
  if (keys.join() !== FIELDS.join()) throw new Error(`字段名或顺序与 schema 不一致：${keys.join(",")}`);
}
