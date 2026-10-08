import { pad2 } from "./time.js";

export { pad2 };

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtTsec(s) {
  return s == null ? "—" : `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

export function fmtDur(m) {
  if (m == null) return "—";
  const t = Math.round(m);
  return `${Math.floor(t / 60)}h${pad2(t % 60)}m`;
}

export function fmtDurEn(m) {
  return m == null ? "—" : `${Math.floor(m / 60)} h ${pad2(Math.round(m % 60))} min`;
}

export function fmtDurZh(m) {
  return m == null ? "—" : `${Math.floor(m / 60)} 小时 ${pad2(Math.round(m % 60))} 分`;
}

export function fmtMinZh(m) {
  return m == null ? "—" : m >= 60 ? `${Math.floor(m / 60)} 小时 ${pad2(m % 60)} 分` : `${m} 分钟`;
}

/** pace 数据层统一 m:ss；输入接受 6:32 / 6'32" / 6'32 */
export function normPace(s) {
  if (s == null) return null;
  if (typeof s !== "string") return s;
  const m = /^\s*(\d+)\s*[:'′]\s*(\d{1,2})\s*["″]?\s*$/.exec(s);
  return m ? `${m[1]}:${m[2].padStart(2, "0")}` : s.trim();
}

export function fmtPace(p) {
  if (p == null) return "—";
  const m = /^(\d+):(\d{1,2})$/.exec(p);
  return m ? `${m[1]}'${m[2].padStart(2, "0")}"` : p;
}

export const md = (d) => d.slice(5).replace("-", "/");
export const mdZh = (d) => `${+d.slice(5, 7)} 月 ${+d.slice(8, 10)} 日`;
export const dotD = (d) => d.slice(5).replace("-", ".");

const WK = ["日", "一", "二", "三", "四", "五", "六"];
export const weekday = (d) => "星期" + WK[new Date(d + "T00:00:00Z").getUTCDay()];
