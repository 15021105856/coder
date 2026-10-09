/* Word 版用的静态 SVG 图表（浅色印刷配色），由 resvg 栅格化为 PNG 后嵌入 docx。
   交互版的图表在 src/monitor/charts.js，两者读取同一组 derive() 结果。 */
import { Resvg } from "@resvg/resvg-js";

export const PAL = {
  ink: "#1b1f2a", mut: "#5b6170", faint: "#9aa0ae", grid: "#e6e8f0",
  a: "#6d5bf5", b: "#0fa3c9", warm: "#e8833a", mint: "#2fb88f", pink: "#e2589f",
};
const FONT = "Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Source Han Sans SC, WenQuanYi Micro Hei, sans-serif";
import { dayMs } from "../src/shared/time.js";
const DAY = 864e5;
const msToDay = (t) => { const d = new Date(t).toISOString(); return `${d.slice(5, 7)}/${d.slice(8, 10)}`; };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const wrap = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;

export function toPng(svg, scale = 2.5) {
  const w = +svg.match(/width="(\d+(?:\.\d+)?)"/)[1], h = +svg.match(/height="(\d+(?:\.\d+)?)"/)[1];
  const png = new Resvg(svg, { fitTo: { mode: "width", value: Math.round(w * scale) }, font: { loadSystemFonts: true, defaultFontFamily: "WenQuanYi Micro Hei" } }).render().asPng();
  return { png, w, h };
}

/* 时间序列折线 / 散点 */
export function lineChart(o) {
  const W = o.width || 640, H = o.height || 240, L = 44, R = 16, T = 18, B = 30;
  const f = o.logY ? Math.log : (v) => v;
  const all = o.series.flatMap((s) => s.values.map((p) => p.y));
  const [lo, hi] = o.yDomain || [Math.min(...o.yTicks, ...all) * 0.97, Math.max(...o.yTicks, ...all) * 1.02];
  const x = (t) => L + ((t - o.xMin) / (o.xMax - o.xMin)) * (W - L - R);
  const y = (v) => T + (1 - (f(v) - f(lo)) / (f(hi) - f(lo))) * (H - T - B);
  let s = "";
  if (o.refSpan) {
    const x0 = x(dayMs(o.refSpan.t0) - DAY / 2), x1 = x(dayMs(o.refSpan.t1) + DAY / 2);
    s += `<rect x="${x0}" y="${T}" width="${x1 - x0}" height="${H - T - B}" fill="${PAL.b}" fill-opacity=".07"/>`;
    s += `<text x="${x0 + 4}" y="${T + 11}" font-size="10" fill="${PAL.b}">${esc(o.refSpan.label)}</text>`;
  }
  for (const v of o.yTicks) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${PAL.grid}"/>`;
    s += `<text x="${L - 6}" y="${y(v) + 3.5}" font-size="10" text-anchor="end" fill="${PAL.faint}">${o.yFmt ? o.yFmt(v) : v}</text>`;
  }
  for (const b of o.bands || []) s += `<rect x="${L}" y="${y(b.hi)}" width="${W - L - R}" height="${y(b.lo) - y(b.hi)}" fill="${PAL.a}" fill-opacity=".1"/>`;
  for (const h of o.hlines || []) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(h.y)}" y2="${y(h.y)}" stroke="${PAL.warm}" stroke-width="1" stroke-dasharray="4 4"/>`;
    if (h.label) s += `<text x="${W - R - 2}" y="${y(h.y) - 4}" font-size="9.5" text-anchor="end" fill="${PAL.warm}">${esc(h.label)}</text>`;
  }
  const step = (o.xStepDays || 14) * DAY;
  for (let t = o.xTick0 ? dayMs(o.xTick0) : o.xMin + DAY / 2; t <= o.xMax; t += step) {
    s += `<line x1="${x(t)}" x2="${x(t)}" y1="${H - B}" y2="${H - B + 4}" stroke="${PAL.faint}"/>`;
    s += `<text x="${x(t)}" y="${H - B + 16}" font-size="10" text-anchor="middle" fill="${PAL.faint}">${msToDay(t)}</text>`;
  }
  s += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="${PAL.faint}" stroke-opacity=".6"/>`;
  for (const se of o.series) {
    const c = PAL[se.color || "a"], pts = se.values.map((p) => [x(dayMs(p.d)), y(p.y), p]);
    if (se.area && pts.length) s += `<path d="M${pts[0][0]},${H - B} ${pts.map(([a, b]) => `L${a},${b}`).join(" ")} L${pts.at(-1)[0]},${H - B}Z" fill="${c}" fill-opacity=".08"/>`;
    if (se.line && pts.length > 1) s += `<polyline points="${pts.map(([a, b]) => `${a},${b}`).join(" ")}" fill="none" stroke="${c}" stroke-width="${se.lineW || 1.5}" stroke-linejoin="round"/>`;
    if (se.points) for (const [a, b, p] of pts) s += p.flag
      ? `<circle cx="${a}" cy="${b}" r="3.4" fill="#fff" stroke="${c}" stroke-width="1.5"/>`
      : `<circle cx="${a}" cy="${b}" r="2.8" fill="${c}"/>`;
  }
  for (const m of o.marks || []) s += `<circle cx="${x(dayMs(m.d))}" cy="${y(m.y)}" r="4.2" fill="${PAL.warm}" stroke="#fff" stroke-width="1.2"/>`;
  return wrap(W, H, s);
}

/* 每周跑量（上）与力量容量（下） */
export function weeklyChart(weeks) {
  const W = 640, H = 236, P = 8, mid = 118, n = weeks.length, bw = (W - 2 * P) / n;
  const maxKm = Math.max(...weeks.map((w) => w.km)) || 1, maxV = Math.max(...weeks.map((w) => w.vol)) || 1;
  let s = `<line x1="${P}" x2="${W - P}" y1="${mid}" y2="${mid}" stroke="${PAL.faint}" stroke-opacity=".6"/>`;
  weeks.forEach((w, i) => {
    const x = P + i * bw + bw * 0.2, ww = bw * 0.6, hk = (w.km / maxKm) * 82, hv = (w.vol / maxV) * 70;
    if (hk) s += `<rect x="${x}" y="${mid - 3 - hk}" width="${ww}" height="${hk}" rx="4" fill="${PAL.b}"/>`;
    if (w.km) s += `<text x="${x + ww / 2}" y="${mid - 8 - hk}" font-size="9.5" text-anchor="middle" fill="${PAL.mut}">${w.km.toFixed(1)}</text>`;
    if (hv) s += `<rect x="${x}" y="${mid + 3}" width="${ww}" height="${hv}" rx="4" fill="${PAL.a}"/>`;
    if (w.vol) s += `<text x="${x + ww / 2}" y="${mid + 15 + hv}" font-size="9.5" text-anchor="middle" fill="${PAL.mut}">${(w.vol / 1000).toFixed(1)}t</text>`;
    s += `<text x="${x + ww / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="${PAL.faint}">${w.start.slice(5).replace("-", "/")}</text>`;
  });
  s += `<text x="${P}" y="12" font-size="10.5" fill="${PAL.b}">跑量 km</text><text x="${P}" y="${H - 20}" font-size="10.5" fill="${PAL.a}">容量 t</text>`;
  return wrap(W, H, s);
}

/* 逐组重量：每个动作一行，柱高为重量 */
export function setsChart(sets, maxKg = 60) {
  const W = 640, rowH = 92, nameW = 130, H = sets.length * rowH + 6, bw = 34, gap = 9, bh = 52;
  let s = "";
  sets.forEach((ex, r) => {
    const y0 = r * rowH + 8, base = y0 + 14 + bh;
    s += `<text x="0" y="${base - bh / 2 + 4}" font-size="12" font-weight="bold" fill="${PAL.ink}">${esc(ex.name)}</text>`;
    const reps = (i) => (Array.isArray(ex.reps) ? ex.reps[i] : ex.reps);
    const bars = [...ex.warm.map((kg) => ({ kg, reps: 8, warm: true })), ...ex.work.map((kg, i) => ({ kg, reps: reps(i), top: ex.top && i === ex.work.length - 1 }))];
    bars.forEach((b, i) => {
      const x = nameW + i * (bw + gap), h = Math.max(4, (b.kg / maxKg) * bh);
      const c = b.top ? PAL.warm : PAL.a;
      s += `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="4" fill="${c}" fill-opacity="${b.warm ? 0.28 : 0.9}"/>`;
      s += `<text x="${x + bw / 2}" y="${base - h - 4}" font-size="10" text-anchor="middle" fill="${b.top ? PAL.warm : PAL.ink}" font-weight="${b.top ? "bold" : "normal"}">${b.kg}</text>`;
      s += `<text x="${x + bw / 2}" y="${base + 13}" font-size="9" text-anchor="middle" fill="${PAL.faint}">×${b.reps}</text>`;
    });
    if (r < sets.length - 1) s += `<line x1="0" x2="${W}" y1="${y0 + rowH - 4}" y2="${y0 + rowH - 4}" stroke="${PAL.grid}"/>`;
  });
  return wrap(W, H, s);
}

/* 三夜睡眠结构：深睡 / REM / 浅睡 横向堆叠 */
export function sleepChart(nights, label) {
  const W = 640, rowH = 34, L = 150, R = 8, H = nights.length * rowH + 22, maxDur = Math.max(...nights.map((n) => n.dur));
  const parts = [["deep", PAL.a, "深睡"], ["rem", PAL.b, "REM"], ["light", "#c9cdf7", "浅睡"]];
  let s = "";
  nights.forEach((n, r) => {
    const y0 = r * rowH + 4, full = (W - L - R) * (n.dur / maxDur);
    s += `<text x="0" y="${y0 + 17}" font-size="11.5" fill="${PAL.ink}">${esc(label(n))}</text>`;
    let x = L;
    for (const [k, c] of parts) {
      const v = k === "light" ? n.light ?? n.dur - n.deep - n.rem : n[k], w = full * (v / n.dur);
      s += `<rect x="${x}" y="${y0 + 3}" width="${Math.max(w - 1.5, 0)}" height="20" rx="4" fill="${c}"/>`;
      if (w > 46) s += `<text x="${x + 7}" y="${y0 + 17}" font-size="10" fill="${k === "light" ? PAL.ink : "#fff"}">${v} 分</text>`;
      x += w;
    }
  });
  const ly = H - 6;
  parts.forEach(([, c, t], i) => { s += `<rect x="${L + i * 70}" y="${ly - 9}" width="10" height="10" rx="2" fill="${c}"/><text x="${L + i * 70 + 15}" y="${ly}" font-size="10" fill="${PAL.mut}">${t}</text>`; });
  return wrap(W, H, s);
}
