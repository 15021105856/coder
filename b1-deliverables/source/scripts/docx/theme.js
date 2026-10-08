/** Word 版版式常量：颜色、字体、页面尺寸 */

export const FONT = { ascii: "Segoe UI", hAnsi: "Segoe UI", cs: "Segoe UI", eastAsia: "Microsoft YaHei" };

export const C = {
  ink: "1B1F2A", mut: "5B6170", faint: "9AA0AE", line: "DCDFE8",
  violet: "6D5BF5", cyan: "0FA3C9", warm: "E8833A", mint: "2FB88F", pink: "E2589F",
  soft: "F5F4FF", soft2: "EFF8FB", warmSoft: "FFF4EA", gray: "F5F6F8", head: "EEF0FF",
};

export const CAT = { run: "22B8D6", str: "7C6CF2", mix: "5B8CFF", rest: "34C79A", ball: "F06AB8", none: "FFFFFF" };
export const TAG_C = { 跑步: C.cyan, 力量: C.violet, 睡眠: "5B8CFF", 饮食: C.warm, 测量: C.mint, 生活: C.pink, 备考: "8A6D3B" };

export const PAGE_W = 11906;
export const MARGIN = 1134;
export const CW = PAGE_W - MARGIN * 2;
export const SZ = { body: 21, small: 17, tiny: 15 };

export function tint(hex, a) {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return c.map((v) => Math.round(v * a + 255 * (1 - a)).toString(16).padStart(2, "0")).join("").toUpperCase();
}
