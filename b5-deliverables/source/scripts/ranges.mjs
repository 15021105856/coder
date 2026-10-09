/** check.mjs 范围提醒表；单独导出供单测与 check 共用 */
export const RANGE = {
  bal: [45, 55],
  gct: [180, 300],
  cad: [140, 220],
  vo: [5, 15],
  tsec: [600, 9000],
  vol: [500, 6000],
  rec: [1, 48],
  ats: [0.5, 6],
};

export function inRange(field, value) {
  const band = RANGE[field];
  if (!band || typeof value !== "number") return true;
  return value >= band[0] && value <= band[1];
}
